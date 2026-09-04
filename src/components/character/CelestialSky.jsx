import React, { useEffect, useRef } from 'react';
import useFrameLoop from '../../hooks/useFrameLoop';
import logger from '../../utils/logger';
import { weatherOutputs } from './weatherCycle';
import {
    SUN_R_GPX, MOON_R_GPX, HALF_FOV_AZ_DEG,
    localSiderealDeg, altAz, projectToScreen, degPerPx,
    sunPosition, moonPosition, brightLimbUnitVector,
    starOpacity, starSizeGpx, starColor,
} from './celestialModel';
import { BRIGHT_STARS } from './data/brightStars';
import { CONSTELLATIONS } from './data/constellationLines';

// §374 "De sterrenhemel" (#1191, Han 2026-09-04) — the world's real sky, drawn on ONE canvas between
// the rendered sky gradient (§372) and the parallax scenery.
//
// Han: "kun je op een of andere manier 's nachts de sterren tonen, en subtiel zichtbaar in dusk/dawn?
// ... ik wil graag ook de zon en de maan zien ... dat die in de day/night cycle écht draaien ...
// 28 cycles = een maancyclus. Simuleer ook volle halfvolle nieuwe maan, volgens de regels van fysica."
//
// ALL the astronomy lives in the pure `celestialModel.js`; this file is pure RASTERISATION. It owns
// no orbital constant of its own — if you find yourself typing a latitude or an hour angle here,
// it belongs in the model instead.
//
// Three structural rules this component exists inside of:
//   • NATIVE-RESOLUTION CANVAS. Sized to viewport/zoom GAME pixels and CSS-scaled back up with
//     `imageRendering: 'pixelated'` — the same convention LdtkScenery's parallax CanvasLayers use, so
//     one game pixel here is exactly one game pixel everywhere else. Everything is drawn with
//     integer-coordinate `fillRect`; `ctx.arc()` is never used (it antialiases, which is the one
//     thing a pixel-art sky must not do).
//   • NO rAF LOOP OF ITS OWN. It subscribes to the shared `useFrameLoop` ticker as a THROTTLED
//     subscriber (#1162 Fase 8). The sky sweeps ~0.75°/s, i.e. about one game pixel every 0.4 s, so
//     10 fps is generous.
//   • ZERO RE-RENDERS. The clock is read out of `weatherRef` inside the draw callback, never out of
//     React state — putting `cycleT` into state would re-render the whole RpgLevelPanel 12×/s and
//     undo #1162 Fase 8's "a steady phase costs 0 re-renders".
//
// CLAUDE.md §3a (debug hit boxes) is N/A here: this layer has `pointerEvents: 'none'` and no
// handlers at all, so there is no hit region to visualise.

// Serif pixel font for the debug-only constellation labels (Han: "de namen in serif pixel font").
// Registered as an @font-face in App.css; see the `document.fonts.load` note below for why that
// registration alone is not enough for canvas text.
const CONSTELLATION_LABEL_PX = 6;
const CONSTELLATION_LABEL_FONT = `${CONSTELLATION_LABEL_PX}px PixelNewspaperIII`;

// Every visual constant lives here so a UAT round is a one-line retune.
const SUN_CORE = '#fff6d8';
const SUN_GLOW = '255, 233, 160';
// Two QUANTISED alpha rings rather than a smooth radial gradient — same pixel-art spirit as the
// foliage shader's waveSteps/dither. A real gradient reads as a blurry blob at this scale.
const SUN_GLOW_RINGS = [{ pad: 6, alpha: 0.10 }, { pad: 3, alpha: 0.22 }];
const MOON_LIT = '#e6e9f0';
const MOON_EARTHSHINE = '#3a4152';
// The unlit part of the disc stays FAINTLY visible ("a grey moon disc shows a crescent"). One of the
// two genuine visual judgement calls in §374 — expect Han to retune this at UAT.
const MOON_EARTHSHINE_ALPHA = 0.18;
const CONSTELLATION_LINE_COLOR = '#9fd8ff';
const CONSTELLATION_LINE_ALPHA = 0.45;
const CONSTELLATION_NAME_COLOR = '#cfe4ff';
const CONSTELLATION_NAME_ALPHA = 0.70;
const DOT_PERIOD = 3;              // one 1-gpx dot every N Bresenham steps
const DEBUG_SUN_PATH = '#ffcc66';  // warm
const DEBUG_MOON_PATH = '#88bbff'; // cool
const DEBUG_PATH_SAMPLES = 120;

// Below this the star pass is skipped entirely (full daylight) — ac2 for free, and no wasted work in
// the commonest case.
const STAR_ALPHA_FLOOR = 0.01;
// The SAME illumination epsilon the weather loop already uses for its own change detection.
const ILLUM_EPSILON = 0.004;

/**
 * A filled pixel-art disc: one integer `fillRect` span per row. Never `ctx.arc()` — that antialiases
 * its edge, which is exactly the blur a pixel-perfect sky must not have (cr6).
 */
function fillDisc(ctx, cx, cy, r, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let dy = -r; dy <= r; dy++) {
        const w = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
        ctx.fillRect(cx - w, cy + dy, 2 * w + 1, 1);
    }
}

/**
 * The moon, rasterised through a per-pixel TERMINATOR test. This is the two-circle crescent
 * construction done directly in pixels: exact at any limb angle (the two-circle version degenerates
 * near the quarters) and pixel-perfect by construction.
 *
 * For a pixel at offset (dx,dy) from the centre, with (sx,sy) the unit vector toward the sun:
 *   u = dx·sx + dy·sy   — position ALONG the sun direction
 *   v = −dx·sy + dy·sx  — position ACROSS it
 *   w = √(R² − v²)      — the disc's half-width on this terminator row
 *   lit ⇔ u ≥ w·(1 − 2k)
 * k = 0 ⇒ threshold +w ⇒ nothing lit (new); k = 1 ⇒ −w ⇒ all lit (full); k = 0.5 ⇒ 0 ⇒ a straight
 * terminator through the centre (quarter). 169 tests per redraw at R = 6 — negligible.
 */
function drawMoonDisc(ctx, cx, cy, r, k, sx, sy) {
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const u = dx * sx + dy * sy;
            const v = -dx * sy + dy * sx;
            const w = Math.sqrt(Math.max(0, r * r - v * v));
            const lit = u >= w * (1 - 2 * k);
            ctx.globalAlpha = lit ? 1 : MOON_EARTHSHINE_ALPHA;
            ctx.fillStyle = lit ? MOON_LIT : MOON_EARTHSHINE;
            ctx.fillRect(cx + dx, cy + dy, 1, 1);
        }
    }
}

/** Dotted straight line, integer Bresenham, one 1-gpx dot every DOT_PERIOD steps. */
function drawDottedLine(ctx, x0, y0, x1, y1) {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const stepX = x0 < x1 ? 1 : -1;
    const stepY = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let step = 0;
    // Guard against a pathological endpoint pair producing an unbounded walk (the projection can put
    // a culled star thousands of pixels away); the caller culls, this is belt-and-braces.
    const maxSteps = dx - dy + 2;
    while (step <= maxSteps) {
        if (step % DOT_PERIOD === 0) ctx.fillRect(x, y, 1, 1);
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x += stepX; }
        if (e2 <= dx) { err += dx; y += stepY; }
        step += 1;
    }
}

export default function CelestialSky({
    weatherRef,
    globalIllumination = 1,
    sizePx,
    zoom,
    horizonGamePx,
    debugMode = false,
    showConstellationLines = false,
    showConstellationNames = false,
}) {
    const canvasRef = useRef(null);
    // The illumination arrives as a normal prop (it is literally the same `foliageParams`
    // globalIllumination every other consumer reads — cr3), but the draw callback must not depend on
    // a render to see it, so it is mirrored into a ref every render.
    const illumRef = useRef(globalIllumination);
    illumRef.current = globalIllumination;

    // Last-drawn clock/illumination, for the "nothing moved a whole pixel" early-out. `null` forces
    // the next tick to redraw (used on mount and whenever a layout/toggle prop changes).
    const lastCycleTRef = useRef(null);
    const lastIllumRef = useRef(null);
    const fontReadyRef = useRef(false);

    const Wpx = sizePx.w > 0 && zoom > 0 ? Math.round(sizePx.w / zoom) : 0;
    const Hpx = sizePx.h > 0 && zoom > 0 ? Math.round(sizePx.h / zoom) : 0;
    // Altitude 0 lands `horizonGamePx` above the canvas bottom — the §141 background-alignment
    // constant passed in by RpgLevelPanel, never re-derived or re-measured here.
    const horizonY = Hpx - horizonGamePx;

    // GOTCHA (no prior art in this repo — there is not a single other ctx.font call site): an
    // @font-face that no DOM node uses is NEVER fetched, and setting `ctx.font` on a canvas does not
    // trigger a load either — the labels would silently render in the browser's default serif. So
    // ask for it explicitly, and skip the names pass until it has actually arrived.
    useEffect(() => {
        document.fonts.load(CONSTELLATION_LABEL_FONT)
            .then(() => { fontReadyRef.current = true; lastCycleTRef.current = null; })
            .catch((err) => logger.error('CelestialSky', 'E038-CELESTIAL-FONT-LOAD', err));
    }, []);

    // Any change to geometry or to what is drawn invalidates the early-out.
    useEffect(() => {
        lastCycleTRef.current = null;
    }, [Wpx, Hpx, horizonY, debugMode, showConstellationLines, showConstellationNames]);

    useFrameLoop(() => {
        const canvas = canvasRef.current;
        if (!canvas || Wpx <= 0 || Hpx <= 0) return;
        try {
            const { cycleT, lunationPhase } = weatherOutputs(weatherRef.current);
            const illum = illumRef.current;
            const dpp = degPerPx(Wpx);

            // Early-out: redraw only when something moved at least a whole game pixel (the sky
            // rotates a full 360° per cycle) or the illumination crossfade stepped.
            if (lastCycleTRef.current != null) {
                const dCycle = Math.abs(cycleT - lastCycleTRef.current);
                const movedPx = Math.min(dCycle, 1 - dCycle) * 360 / dpp;
                if (movedPx < 1 && Math.abs(illum - lastIllumRef.current) < ILLUM_EPSILON) return;
            }
            lastCycleTRef.current = cycleT;
            lastIllumRef.current = illum;

            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, Wpx, Hpx);
            ctx.globalAlpha = 1;

            const geom = { Wpx, horizonY };
            const lst = localSiderealDeg(cycleT, lunationPhase);
            const alpha = starOpacity(illum);
            const onCanvas = (x, y) => x >= 0 && y >= 0 && x < Wpx && y < Hpx;

            // ---- stars -------------------------------------------------------------------------
            // Screen positions are cached per HR because the constellation pass needs them again.
            const starXY = new Map();
            if (alpha >= STAR_ALPHA_FLOOR) {
                ctx.globalAlpha = alpha;
                for (const s of BRIGHT_STARS) {
                    const { altDeg, azSouthDeg } = altAz(s.ra, s.dec, lst);
                    const p = projectToScreen(altDeg, azSouthDeg, geom);
                    if (!p.visible) continue;
                    const x = Math.round(p.x);
                    const y = Math.round(p.y);
                    if (!onCanvas(x, y)) continue;
                    starXY.set(s.hr, [x, y]);
                    ctx.fillStyle = starColor(s.bv);
                    const size = starSizeGpx(s.mag);
                    if (size === 3) {
                        // A 3×3 block MINUS its corners — the canonical pixel-art "circle of 3".
                        // A solid 3×3 square reads as a blob at this scale.
                        ctx.fillRect(x - 1, y, 3, 1);
                        ctx.fillRect(x, y - 1, 1, 3);
                    } else if (size === 2) {
                        ctx.fillRect(x, y, 2, 2);
                    } else {
                        ctx.fillRect(x, y, 1, 1);
                    }
                }

                // ---- constellation stick figures (debug-only toggles) ---------------------------
                if (showConstellationLines) {
                    ctx.globalAlpha = alpha * CONSTELLATION_LINE_ALPHA;
                    ctx.fillStyle = CONSTELLATION_LINE_COLOR;
                    for (const c of CONSTELLATIONS) {
                        for (const [a, b] of c.segments) {
                            const pa = starXY.get(a);
                            const pb = starXY.get(b);
                            if (!pa || !pb) continue;   // a culled endpoint = no line, never a stray
                            drawDottedLine(ctx, pa[0], pa[1], pb[0], pb[1]);
                        }
                    }
                }
                if (showConstellationNames && fontReadyRef.current) {
                    ctx.globalAlpha = alpha * CONSTELLATION_NAME_ALPHA;
                    ctx.fillStyle = CONSTELLATION_NAME_COLOR;
                    // Explicit font — never inherited, never Maestro (CLAUDE.md §1a / cr5). Canvas
                    // text antialiasing cannot be turned off; a pixel font at its exact native px
                    // size on integer coordinates is the standard mitigation.
                    ctx.font = CONSTELLATION_LABEL_FONT;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    for (const c of CONSTELLATIONS) {
                        const pts = [...new Set(c.segments.flat())].map((hr) => starXY.get(hr)).filter(Boolean);
                        if (pts.length === 0) continue;
                        const cx = Math.round(pts.reduce((a, p) => a + p[0], 0) / pts.length);
                        const cy = Math.round(pts.reduce((a, p) => a + p[1], 0) / pts.length);
                        ctx.fillText(c.name, cx, cy);
                    }
                }
            }

            // ---- sun / moon geometry -----------------------------------------------------------
            const sun = sunPosition(cycleT, lunationPhase);
            const moon = moonPosition(cycleT, lunationPhase);
            const sunP = projectToScreen(sun.altDeg, sun.azSouthDeg, geom);
            const moonP = projectToScreen(moon.altDeg, moon.azSouthDeg, geom);
            const sunXY = { x: Math.round(sunP.x), y: Math.round(sunP.y) };
            const moonXY = { x: Math.round(moonP.x), y: Math.round(moonP.y) };

            // ---- debug orbit paths (drawn UNDER the discs so the markers stay readable) ---------
            if (debugMode) {
                ctx.globalAlpha = 0.5;
                for (let i = 0; i <= DEBUG_PATH_SAMPLES; i++) {
                    const t = i / DEBUG_PATH_SAMPLES;
                    // The moon's path is sampled with the CURRENT lunation phase held fixed: this is
                    // "where the moon travels tonight", not its slow drift across the month.
                    for (const [pos, color] of [
                        [sunPosition(t, lunationPhase), DEBUG_SUN_PATH],
                        [moonPosition(t, lunationPhase), DEBUG_MOON_PATH],
                    ]) {
                        if (pos.altDeg < 0) continue;
                        const p = projectToScreen(pos.altDeg, pos.azSouthDeg, geom);
                        if (!p.visible) continue;
                        const x = Math.round(p.x);
                        const y = Math.round(p.y);
                        if (!onCanvas(x, y)) continue;
                        ctx.fillStyle = color;
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
            }

            // ---- moon --------------------------------------------------------------------------
            // Near new moon the moon is with the sun by day and simply absent at night (ac6).
            // The sun's SCREEN position is used even while the sun itself is below the horizon —
            // that is what keeps the crescent pointing the right way after dark.
            const inAzWindow = (pos) => Math.abs(pos.azSouthDeg) <= HALF_FOV_AZ_DEG + 10;
            if (!moon.belowHorizon && inAzWindow(moon)) {
                const { sx, sy } = brightLimbUnitVector(moonXY, sunXY);
                drawMoonDisc(ctx, moonXY.x, moonXY.y, MOON_R_GPX, moon.illumFraction, sx, sy);
            }

            // ---- sun ---------------------------------------------------------------------------
            // Drawn while its TOP edge is still above the horizon line (altitude ≥ −R·deg-per-px), so
            // it SINKS behind the parallax scenery — which is mounted in FRONT of this layer — rather
            // than popping out of existence. No clipping code needed; the scenery occludes it.
            if (inAzWindow(sun) && sun.altDeg >= -(SUN_R_GPX * dpp)) {
                for (const ring of SUN_GLOW_RINGS) {
                    fillDisc(ctx, sunXY.x, sunXY.y, SUN_R_GPX + ring.pad, `rgba(${SUN_GLOW}, 1)`, ring.alpha);
                }
                fillDisc(ctx, sunXY.x, sunXY.y, SUN_R_GPX, SUN_CORE, 1);
            }

            // ---- debug live position markers ---------------------------------------------------
            if (debugMode) {
                ctx.globalAlpha = 1;
                for (const [xy, color, up] of [
                    [sunXY, DEBUG_SUN_PATH, sun.altDeg >= 0],
                    [moonXY, DEBUG_MOON_PATH, !moon.belowHorizon],
                ]) {
                    if (!up) continue;
                    ctx.fillStyle = color;
                    ctx.fillRect(xy.x - 2, xy.y, 5, 1);
                    ctx.fillRect(xy.x, xy.y - 2, 1, 5);
                }
            }

            ctx.globalAlpha = 1;
        } catch (err) {
            // `useFrameLoop` already guarantees the shared ticker keeps rescheduling (E034); this
            // adds WHICH layer failed, the same per-layer attribution E023/E028/E031 give.
            logger.error('CelestialSky', 'E037-CELESTIAL-SKY-DRAW-FRAME', err);
        }
    }, [Wpx, Hpx, horizonY, debugMode, showConstellationLines, showConstellationNames], { priority: 'throttled', throttleMs: 100 });

    if (Wpx <= 0 || Hpx <= 0) return null;   // pre-ResizeObserver measurement

    return (
        <canvas
            ref={canvasRef}
            aria-hidden
            width={Wpx}
            height={Hpx}
            style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                imageRendering: 'pixelated', pointerEvents: 'none',
            }}
        />
    );
}
