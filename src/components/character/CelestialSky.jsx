import React, { useEffect, useRef } from 'react';
import useFrameLoop from '../../hooks/useFrameLoop';
import logger from '../../utils/logger';
import { weatherOutputs, cloudCollapseT, cloudDarkT, easeInOut } from './weatherCycle';
import {
    SUN_R_GPX, MOON_R_GPX, HALF_FOV_AZ_DEG, SUN_GLOW_RGB, SUN_GLOW_RADIUS_GPX,
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
//     subscriber (#1162 Fase 8) — "throttled" only in the priority sense (it runs AFTER the
//     clock-critical camera/scroll pass so it can never delay them), NOT rate-limited: `throttleMs`
//     is 0, so it draws every frame. UAT (Han 2026-09-04): at the original 10 fps the sky moved in
//     visible lurches — a star near the horizon (azimuth is compressed there, so it travels fastest)
//     would accumulate 2–3 game pixels between redraws and jump all at once. Per-frame redraw + no
//     whole-pixel early-out (below) means every star steps exactly one game pixel at a time, spread
//     smoothly across 60 fps. The per-frame cost is ~200 visible `fillRect`s plus the moon's 169-px
//     terminator loop — sub-millisecond, safe in the throttled pass.
//   • ZERO RE-RENDERS. The clock is read out of `weatherRef` inside the draw callback, never out of
//     React state — putting `cycleT` into state would re-render the whole RpgLevelPanel every frame
//     and undo #1162 Fase 8's "a steady phase costs 0 re-renders".
//
// CLAUDE.md §3a (debug hit boxes) is N/A here: this layer has `pointerEvents: 'none'` and no
// handlers at all, so there is no hit region to visualise.

// Serif pixel font for the debug-only constellation labels (Han: "de namen in serif pixel font").
// §374 UAT r2 (Han 2026-09-04, "er is een serif pixel font ... ik wil dat je de derde gebruikt"):
// the app already has the curated `'BestiaryPixel'` family (App.css / §334 / §351) — one @font-face
// split by style: normal = CelticTime, ITALIC = SandyForest, bold = Bitfantasy. Han's "third
// (italic)" is SandyForest, reached via `font-style: italic`. Both faces are unitsPerEm 1024 with
// 64 units per design-pixel, so their native size is 16 px (1 design-pixel = 1 screen-pixel there).
// §374 UAT r4: the labels render at `16 · zoom` px on a FULL-RESOLUTION overlay canvas (see
// `labelCanvasRef`) — 16·zoom is an exact multiple of the 16 px native size, so still pixel-perfect,
// and it is never CSS-upscaled afterwards. `CONSTELLATION_LABEL_FONT` (16 px) is used only for the
// one-time `document.fonts.load()` — the loaded face covers every size.
const CONSTELLATION_LABEL_PX = 16;
const CONSTELLATION_LABEL_FONT = `italic ${CONSTELLATION_LABEL_PX}px BestiaryPixel, monospace`;

// Every visual constant lives here so a UAT round is a one-line retune.
const SUN_CORE = '#fff6d8';
// §377 (#1193): `SUN_GLOW_RGB` (the warm yellow of the crisp/dry sun's glow) used to be declared HERE.
// It moved to `celestialModel.js` — imported above — because the sun EDGE-GLOW on the world's sprites
// must be tinted with the exact same yellow as the disc the player sees, and two copies of one colour
// guarantee drift (CLAUDE.md §6d). Same literal, zero behaviour change for this file.
// §375 UAT r1 (Han: "Waterige zon: wit, niet geel"): the watery sun's glow/body lerps from the warm
// yellow above toward pure white as `wet` rises, so a fully overcast sun is white.
const SUN_WET_GLOW_RGB = [255, 255, 255];
// Two QUANTISED alpha rings rather than a smooth radial gradient — same pixel-art spirit as the
// foliage shader's waveSteps/dither. A real gradient reads as a blurry blob at this scale.
const SUN_GLOW_RINGS = [{ pad: 6, alpha: 0.10 }, { pad: 3, alpha: 0.22 }];
// §375 (#1192) — the "waterige" (diffuse) sun under BEWOLKT. Built from the SAME quantised-ring
// mechanism above, never a blur or a shadow (cr5): the disc grows, the existing rings widen and dim,
// two EXTRA soft outer rings of the identical {pad, alpha} shape appear, a low-alpha diffuse body is
// added, and the hard SUN_CORE is faded out entirely. Every term is multiplied by `wet`, so at
// CLEAR/LIGHT (wet = 0) the sun renders bit-identically to pre-§375.
const SUN_WATERY_R_GAIN = 0.6;          // r 7 (dry) → 11 (fully wet)
const SUN_WET_RING_ALPHA_SCALE = 0.6;   // the two existing rings dim to 60 % when fully wet
const SUN_WET_BODY_ALPHA = 0.5;         // the soft diffuse body that replaces the core
const SUN_WET_EXTRA_RINGS = [{ pad: 9, alpha: 0.05 }, { pad: 5, alpha: 0.08 }];
const lerpNum = (a, b, t) => a + (b - a) * t;
// §374 UAT r6 (Han, screenshot 2026-09-05: "de 'lichte kant' dicht bij de zon donkerder dan de donkere
// kant. Design even hoe de maan moet eruit zien from scratch"). Root cause, chased across THREE prior
// rounds: whenever "how lit" was expressed as ALPHA (r3, r5), the unlit side became partially
// TRANSPARENT — so its apparent brightness depends on whatever sky is behind it. Against a bright day
// sky a barely-visible (low-alpha) dark fill reads as almost sky-bright, while the fully-opaque lit
// fill shows its own (merely light-grey) colour — which can be DARKER than a very bright/saturated sky.
// Result: the "lit" side reads darker than the "unlit" side. This can never be tuned away with
// different alpha numbers — it is inherent to blending a variable-brightness disc over a
// variable-brightness sky. FIX, confirmed with Han: the disc is now ALWAYS FULLY OPAQUE
// (`MOON_DISC_ALPHA = 1`) and "how lit" is expressed ONLY through fill colour, never alpha again — a
// self-contained object whose own brightness relationships (lit > terminator > unlit) can never invert
// against whatever is behind it. Han explicitly declined a legibility outline (still visible enough
// against every sky without one) and kept the earthshine tone dark-blue-grey, not near-black.
//
// §374 UAT r7 — the ONE sanctioned exception (Han: "de maan is nog steeds donker overdag — overdag
// moet het onbelichte stuk vd maan haast onzichtbaar zijn"). By day the real moon shows only its lit
// crescent; the unlit half is invisible against the bright sky. So `drawMoonDisc` fades ONLY the unlit
// shades (0/1 — the geometric dark half of the terminator) toward transparent as `dayness` → 1. The
// r6 inversion cannot happen here: by day the opaque near-white lit fill always reads brighter than a
// near-transparent unlit fill over any sky. `dayness` is 0 at night AND at dusk/dawn — full earthshine,
// r6 unchanged — and ramps up only in real daylight, so the crescent/terminator (shades 2/3) stay
// fully opaque at all times and "how lit" is still colour, never alpha, for everything that shows.
const MOON_LIT_RGB = [230, 233, 240];        // #e6e9f0 — the fully-lit fill
const MOON_EARTHSHINE_RGB = [58, 65, 82];    // #3a4152 — the fixed, always-opaque unlit fill
const MOON_DISC_ALPHA = 1;
// A 4-LEVEL terminator (earthshine · 30 % · 70 % · full) instead of a hard binary edge, so the
// crescent edge softens by one game pixel each side — colour-only quantised pixel-art dither, not
// sub-pixel AA (cr6). `alphaMul` (drawMoonDisc's own parameter) is a SEPARATE, later multiply for the
// §375 cloud-cover fade — it is not "how lit", so it must never vary per shade here.
const rgbStr = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;
const mixRgbInt = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const MOON_SHADE = [0, 0.3, 0.7, 1].map((t) => rgbStr(mixRgbInt(MOON_EARTHSHINE_RGB, MOON_LIT_RGB, t)));

// §374 UAT r4 (Han: "de zon en maancirkels ... uiteinden boven, onder, links, rechts één game-pixel
// ... Maak die randen ten minste 3 gpx breed"). A raw `floor(√(r²−dy²))` disc tapers to a single
// pixel at all four poles, which read as spikes on a disc this small. This profile: `round` (not
// `floor`) so the small circle is rounder, and a min half-width of 1 (⇒ 3 px) so the top and bottom
// rows are never a 1-px nub. `round` already holds full width for dy ∈ {−2..2} at r = 6/7, so the
// left/right extremes are ≥ 5 rows tall too. Returns −1 for rows outside the disc.
function discHalfWidth(r, dy) {
    if (Math.abs(dy) > r) return -1;
    return Math.max(1, Math.round(Math.sqrt(Math.max(0, r * r - dy * dy))));
}
const CONSTELLATION_LINE_COLOR = '#9fd8ff';
const CONSTELLATION_LINE_ALPHA = 0.45;
const CONSTELLATION_NAME_COLOR = '#cfe4ff';
const CONSTELLATION_NAME_ALPHA = 0.70;
const DOT_PERIOD = 3;              // one 1-gpx dot every N Bresenham steps
const DEBUG_SUN_PATH = '#ffcc66';  // warm
const DEBUG_MOON_PATH = '#88bbff'; // cool
const DEBUG_PATH_SAMPLES = 120;

// The shared "too faint to bother drawing" floor. Below this the star pass is skipped entirely (full
// daylight) — and, since §375, so is the moon disc once cloud cover has faded it out.
const STAR_ALPHA_FLOOR = 0.01;
// The SAME illumination epsilon the weather loop already uses for its own change detection.
const ILLUM_EPSILON = 0.004;
// §375: the equivalent epsilon for the cloud-cover scalar. Belt-and-braces only — `cycleT` moves every
// frame anyway — but it keeps the "skip only a byte-for-byte identical frame" contract honest.
const CLOUD_EPSILON = 0.002;

/**
 * A filled pixel-art disc: one integer `fillRect` span per row. Never `ctx.arc()` — that antialiases
 * its edge, which is exactly the blur a pixel-perfect sky must not have (cr6).
 */
function fillDisc(ctx, cx, cy, r, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let dy = -r; dy <= r; dy++) {
        const w = discHalfWidth(r, dy);   // ≥3 px at every pole (UAT r4), never a 1-px spike
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
 * Signed distance from the terminator along the sun axis: su = u − w·(1 − 2k). su ≥ 0 ⇒ lit side.
 * k = 0 ⇒ threshold +w ⇒ nothing lit (new); k = 1 ⇒ −w ⇒ all lit (full); k = 0.5 ⇒ 0 ⇒ a straight
 * terminator through the centre (quarter).
 *
 * §374 UAT r3: instead of a hard `su ≥ 0` binary, bucket `su` into 4 shades — earthshine below −1,
 * 30 % in [−1,0), 70 % in [0,1), full at/above +1 — so the crescent edge softens by one game pixel
 * each side. The disc outline comes from `discHalfWidth` (≥3 px poles), not a `dx²+dy² ≤ r²` circle
 * test. 169 tests per redraw at R = 6 — negligible.
 *
 * §374 UAT r6: the disc is ALWAYS FULLY OPAQUE (`MOON_DISC_ALPHA = 1`) — `MOON_SHADE[i]` is a fill
 * colour only, never an alpha. `alphaMul` is the SEPARATE cloud-cover fade (§375) applied on top of
 * that fixed opacity, not "how lit" — see the `MOON_DISC_ALPHA` comment above for why the two must
 * never be conflated again.
 *
 * §374 UAT r7: `dayness` (0 at night/dusk/dawn, → 1 in real daylight) fades ONLY the unlit shades
 * (0/1) toward transparent, so by day the moon reads as just its lit crescent. The lit crescent and
 * both terminator-lit shades (2/3) stay at the full opaque × cloud-fade alpha at all times.
 */
function drawMoonDisc(ctx, cx, cy, r, k, sx, sy, alphaMul, dayness) {
    // UAT r6: base alpha = opaque × the §375 cloud fade — "how lit" lives in `MOON_SHADE`'s fill colour.
    // UAT r7: the unlit half (shades 0/1) additionally fades to ~8 % of that by full day; everything
    // that stays visible is still fully opaque, so r6's no-inversion guarantee holds.
    const baseA = MOON_DISC_ALPHA * alphaMul;
    const unlitA = baseA * (1 - 0.92 * dayness);
    for (let dy = -r; dy <= r; dy++) {
        const halfW = discHalfWidth(r, dy);
        if (halfW < 0) continue;
        for (let dx = -halfW; dx <= halfW; dx++) {
            const u = dx * sx + dy * sy;
            const v = -dx * sy + dy * sx;
            const wt = Math.sqrt(Math.max(0, r * r - v * v));   // terminator half-width on this row
            const su = u - wt * (1 - 2 * k);
            const shade = su >= 1 ? 3 : su >= 0 ? 2 : su >= -1 ? 1 : 0;
            ctx.globalAlpha = shade <= 1 ? unlitA : baseA;
            ctx.fillStyle = MOON_SHADE[shade];
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

/**
 * §377 (#1193): the sky canvas's own geometry, in GAME px — the native-resolution canvas size derived
 * from the CSS viewport size and `zoom`, plus the canvas row where altitude 0 (the horizon) lands.
 *
 * EXTRACTED (CLAUDE.md §6d "extract it, and have BOTH sites consume the extraction") rather than
 * copied: `RpgLevelPanel` needs the IDENTICAL frame to project the sun's screen position for the sun
 * edge-glow (§377), and a second, independently-written copy of these three lines is exactly how the
 * glow and the drawn disc would silently drift apart. This component below consumes it too, so there
 * is structurally ONE sun projection in the app.
 *
 * Returns `{Wpx: 0, Hpx: 0, horizonY: <horizonGamePx-relative>}` before the ResizeObserver has
 * measured (size 0 / zoom 0) — every caller already guards on `Wpx <= 0`.
 */
export function skyGeom(sizePx, zoom, horizonGamePx) {
    const Wpx = sizePx.w > 0 && zoom > 0 ? Math.round(sizePx.w / zoom) : 0;
    const Hpx = sizePx.h > 0 && zoom > 0 ? Math.round(sizePx.h / zoom) : 0;
    return { Wpx, Hpx, horizonY: Hpx - horizonGamePx };
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
    // §374 UAT r4 (Han: the constellation names "zien er blurry uit ... een of ander schalingseffect?").
    // Yes — they were drawn at 16 px on the native-game-pixel main canvas, which is then CSS-upscaled by
    // `zoom` with `image-rendering: pixelated`. Magnifying already-rasterised (and canvas-antialiased)
    // text ×zoom turns its soft edge pixels into chunky grey halos. Fix: the names get their OWN canvas
    // at full CSS resolution (no upscale), drawn at `16 · zoom` px. `zoom` is an integer in world mode
    // (`worldScale`, §334), so 16·zoom is an exact multiple of the font's 16 px native size ⇒ still
    // pixel-perfect, and any residual canvas AA is now at true screen-pixel granularity (invisible).
    const labelCanvasRef = useRef(null);
    // The illumination arrives as a normal prop (it is literally the same `foliageParams`
    // globalIllumination every other consumer reads — cr3), but the draw callback must not depend on
    // a render to see it, so it is mirrored into a ref every render.
    const illumRef = useRef(globalIllumination);
    illumRef.current = globalIllumination;

    // Last-drawn clock/illumination, for a cheap "the frame is byte-for-byte identical" skip (a truly
    // frozen cycle — not normally reachable in the world, where `cycleT` advances every frame, but
    // insurance). It is NOT a whole-pixel motion gate any more: that batched sub-pixel motion into
    // ≥1px lumps and, at the old 10 fps, into the multi-pixel jumps Han flagged at UAT. `null` forces
    // the next tick to redraw (used on mount and whenever a layout/toggle prop changes).
    const lastCycleTRef = useRef(null);
    const lastIllumRef = useRef(null);
    const lastCloudCoverRef = useRef(null);
    // Perf (#1192-jank, Han 2026-09-04): reused across frames (`.clear()`'d, never reallocated) — this
    // draw callback now runs every rAF frame (see the RpgLevelPanel weather-tick fix, §376), so a `new
    // Map()` here would otherwise allocate 60x/sec purely to hand star screen coords to the
    // constellation-line pass a few lines down.
    const starXYRef = useRef(new Map());
    const fontReadyRef = useRef(false);

    // Altitude 0 lands `horizonGamePx` above the canvas bottom — the §141 background-alignment
    // constant passed in by RpgLevelPanel, never re-derived or re-measured here.
    // §377: computed by the shared `skyGeom` above, which RpgLevelPanel also calls so the sun
    // edge-glow's centre and the sun disc drawn here can never disagree.
    const { Wpx, Hpx, horizonY } = skyGeom(sizePx, zoom, horizonGamePx);

    // GOTCHA: `'BestiaryPixel'` IS used elsewhere in the DOM (ScalesPanel, WorldPiano), so its normal
    // face is usually already loaded — but the ITALIC face (SandyForest) may not be, and setting
    // `ctx.font` on a canvas never triggers a font load. Without this the labels would silently fall
    // back to the browser's default italic. So ask for this exact face explicitly and skip the names
    // pass until it has actually arrived.
    useEffect(() => {
        document.fonts.load(CONSTELLATION_LABEL_FONT)
            .then(() => { fontReadyRef.current = true; lastCycleTRef.current = null; })
            .catch((err) => logger.error('CelestialSky', 'E038-CELESTIAL-FONT-LOAD', err));
    }, []);

    // Any change to geometry or to what is drawn invalidates the early-out.
    useEffect(() => {
        lastCycleTRef.current = null;
    }, [Wpx, Hpx, horizonY, zoom, debugMode, showConstellationLines, showConstellationNames]);

    // Wipe the label overlay the moment names are toggled off (or the canvas resizes) — otherwise the
    // last frame's names would hang there until the next redraw that happens to run the names pass.
    useEffect(() => {
        const lc = labelCanvasRef.current;
        if (lc && !showConstellationNames) lc.getContext('2d').clearRect(0, 0, lc.width, lc.height);
    }, [showConstellationNames, sizePx.w, sizePx.h]);

    useFrameLoop(() => {
        const canvas = canvasRef.current;
        if (!canvas || Wpx <= 0 || Hpx <= 0) return;
        try {
            // §375 (#1192): `cloudCoverT` is read HERE, off `weatherRef`, inside the draw callback —
            // exactly like `cycleT`. It is a continuous per-frame value, so it must never reach React
            // state, a prop, or RpgLevelPanel's weather change-detection lists. This is the ONLY place
            // in the whole app that touches the raw (unquantised) scalar.
            const { cycleT, lunationPhase, cloudCoverT } = weatherOutputs(weatherRef.current);
            const illum = illumRef.current;
            const dpp = degPerPx(Wpx);
            // Four pass-groups, each gated by ONE continuous multiply — no `if (cloudType === ...)`
            // anywhere. The four weather types are just four positions on this one axis.
            const bodyAlphaMul = 1 - cloudCollapseT(cloudCoverT);   // stars, constellations, moon
            const sunAlphaMul = 1 - cloudDarkT(cloudCoverT);        // sun
            const wet = cloudCollapseT(cloudCoverT);                // 0 = crisp .. 1 = fully watery

            // Skip ONLY a byte-for-byte identical frame (frozen clock AND settled illumination). Any
            // motion at all redraws — each star then advances at most one game pixel per frame, which
            // at 60 fps is the smoothest a pixel-perfect sky can move. (Previously this gated on
            // "moved < 1 whole pixel", which lumped motion together and, at 10 fps, produced the
            // multi-pixel star jumps Han reported at UAT.)
            if (
                lastCycleTRef.current != null &&
                cycleT === lastCycleTRef.current &&
                Math.abs(illum - lastIllumRef.current) < ILLUM_EPSILON &&
                Math.abs(cloudCoverT - lastCloudCoverRef.current) < CLOUD_EPSILON
            ) {
                return;
            }
            lastCycleTRef.current = cycleT;
            lastIllumRef.current = illum;
            lastCloudCoverRef.current = cloudCoverT;

            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, Wpx, Hpx);
            ctx.globalAlpha = 1;

            // The full-res label overlay (UAT r4). Cleared every redraw whenever names are enabled; the
            // names pass below repaints it only when the stars are actually up, so by day it stays blank.
            const lcanvas = labelCanvasRef.current;
            let lctx = null;
            if (showConstellationNames && fontReadyRef.current && lcanvas) {
                lctx = lcanvas.getContext('2d');
                lctx.imageSmoothingEnabled = false;
                lctx.clearRect(0, 0, lcanvas.width, lcanvas.height);
            }

            const geom = { Wpx, horizonY };
            const lst = localSiderealDeg(cycleT, lunationPhase);
            // §375: ONE extra factor hides the stars AND — because both constellation passes are
            // nested inside the `alpha >= STAR_ALPHA_FLOOR` guard and derive their own alpha from this
            // one — the lines and the names too, at OVERCAST and DARK_OVERCAST. A 10 s fade, not a pop.
            const alpha = starOpacity(illum) * bodyAlphaMul;
            const onCanvas = (x, y) => x >= 0 && y >= 0 && x < Wpx && y < Hpx;

            // ---- stars -------------------------------------------------------------------------
            // Screen positions are cached per HR because the constellation pass needs them again.
            const starXY = starXYRef.current;
            starXY.clear();
            if (alpha >= STAR_ALPHA_FLOOR) {
                ctx.globalAlpha = alpha;
                for (const s of BRIGHT_STARS) {
                    const { altDeg, azSouthDeg } = altAz(s.ra, s.dec, lst);
                    const p = projectToScreen(altDeg, azSouthDeg, geom);
                    if (!p.visible) continue;
                    const x = Math.round(p.x);
                    const y = Math.round(p.y);
                    // §374 UAT (Han, pre-test 2026-09-04: "sterrenstelsels ... alle stippellijnen altijd
                    // getekend worden, ook naar sterren die buiten beeld zijn"): record the position for
                    // EVERY astronomically-visible star, on-canvas or not, so a constellation line can
                    // reach off-screen — canvas drawing calls outside the bounds simply don't paint
                    // anything, so this is free. Only the STAR PIXEL itself is skipped when off-canvas.
                    starXY.set(s.hr, [x, y]);
                    if (!onCanvas(x, y)) continue;
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
                if (lctx) {
                    lctx.globalAlpha = alpha * CONSTELLATION_NAME_ALPHA;
                    lctx.fillStyle = CONSTELLATION_NAME_COLOR;
                    // Explicit font — never inherited, never Maestro (CLAUDE.md §1a / cr5). `BestiaryPixel`
                    // italic (= SandyForest) at `16 · zoom` px = an exact multiple of its 16 px native
                    // size, drawn on the full-res overlay so it is NOT re-magnified afterwards.
                    lctx.font = `italic ${CONSTELLATION_LABEL_PX * zoom}px BestiaryPixel, monospace`;
                    lctx.textAlign = 'center';
                    lctx.textBaseline = 'middle';
                    for (const c of CONSTELLATIONS) {
                        const pts = [...new Set(c.segments.flat())].map((hr) => starXY.get(hr)).filter(Boolean);
                        if (pts.length === 0) continue;
                        // Centroid in game px (starXY is game px) → full-res px by ×zoom.
                        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
                        const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
                        lctx.fillText(c.name, Math.round(cx * zoom), Math.round(cy * zoom));
                    }
                    lctx.globalAlpha = 1;
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
            // §375: the same `bodyAlphaMul` that hides the stars fades the moon out — and once it is
            // below the shared STAR_ALPHA_FLOOR the 169-pixel terminator loop is skipped entirely.
            const inAzWindow = (pos) => Math.abs(pos.azSouthDeg) <= HALF_FOV_AZ_DEG + 10;
            // §377 UAT (Han, pre-test 2026-09-04: "if moon within the glow radius of the sun, make it
            // invisible"): reuses celestialModel's OWN `SUN_GLOW_RADIUS_GPX` (the sun edge-glow's reach;
            // 110 gpx since UAT r3) as a screen-space "too close to the sun to see" cutoff — one source
            // of truth (cr4). Physically apt too: near conjunction (new moon) sun and moon sit close
            // together in the sky.
            const nearSun = Math.hypot(moonXY.x - sunXY.x, moonXY.y - sunXY.y) < SUN_GLOW_RADIUS_GPX;
            if (!moon.belowHorizon && inAzWindow(moon) && bodyAlphaMul >= STAR_ALPHA_FLOOR && !nearSun) {
                const { sx, sy } = brightLimbUnitVector(moonXY, sunXY);
                // §374 UAT r7: 0 at night and through dusk/dawn (illum ≲ 0.45 → full earthshine),
                // ramping to 1 in real daylight — fades only the moon's unlit half by day.
                const moonDayness = easeInOut((illum - 0.45) / 0.45);
                drawMoonDisc(ctx, moonXY.x, moonXY.y, MOON_R_GPX, moon.illumFraction, sx, sy, bodyAlphaMul, moonDayness);
            }

            // ---- sun ---------------------------------------------------------------------------
            // Drawn while its TOP edge is still above the horizon line (altitude ≥ −R·deg-per-px), so
            // it SINKS behind the parallax scenery — which is mounted in FRONT of this layer — rather
            // than popping out of existence. No clipping code needed; the scenery occludes it.
            // §375: under BEWOLKT the sun stays on its real arc but goes "waterig" — a bigger, softer,
            // core-less diffuse blob (`wet`); under DONKER BEWOLKT `sunAlphaMul` reaches 0 and the whole
            // pass is skipped. The sink-behind-the-scenery condition is recomputed with the WATERY
            // radius so the bigger disc still sinks correctly.
            const sunR = Math.round(SUN_R_GPX * (1 + SUN_WATERY_R_GAIN * wet));
            if (sunAlphaMul > 0 && inAzWindow(sun) && sun.altDeg >= -(sunR * dpp)) {
                // §375 UAT r1: warm yellow when crisp, white when fully watery.
                const g = mixRgbInt(SUN_GLOW_RGB, SUN_WET_GLOW_RGB, wet);
                const glow = `rgba(${g[0]}, ${g[1]}, ${g[2]}, 1)`;
                for (const ring of SUN_GLOW_RINGS) {
                    const pad = Math.round(ring.pad * (1 + SUN_WATERY_R_GAIN * wet));
                    const a = ring.alpha * lerpNum(1, SUN_WET_RING_ALPHA_SCALE, wet) * sunAlphaMul;
                    fillDisc(ctx, sunXY.x, sunXY.y, sunR + pad, glow, a);
                }
                if (wet > 0) {
                    for (const ring of SUN_WET_EXTRA_RINGS) {
                        fillDisc(ctx, sunXY.x, sunXY.y, sunR + ring.pad, glow, ring.alpha * wet * sunAlphaMul);
                    }
                    fillDisc(ctx, sunXY.x, sunXY.y, sunR, glow, SUN_WET_BODY_ALPHA * wet * sunAlphaMul);
                }
                fillDisc(ctx, sunXY.x, sunXY.y, sunR, SUN_CORE, (1 - wet) * sunAlphaMul);
            }

            // ---- debug live position markers ---------------------------------------------------
            // §375: deliberately NOT gated on cloud cover (nor are the orbit paths above). They are
            // debug affordances — Han must still be able to see WHERE the hidden sun/moon are while
            // an overcast sheet covers them.
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
        // `throttled` priority (runs after the clock-critical camera/scroll pass so it can never
        // delay them) but `throttleMs: 0` — i.e. every frame. See the top-of-file cadence note.
    }, [Wpx, Hpx, horizonY, debugMode, showConstellationLines, showConstellationNames], { priority: 'throttled', throttleMs: 0 });

    if (Wpx <= 0 || Hpx <= 0) return null;   // pre-ResizeObserver measurement

    return (
        <>
            {/* The sky itself — native game-px, nearest-neighbour upscaled by `zoom`. */}
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
            {/* UAT r4: constellation names only (debug). Full CSS resolution so `16·zoom` px text is
                NOT re-magnified. Sits above the sky canvas in DOM order. */}
            <canvas
                ref={labelCanvasRef}
                aria-hidden
                width={Math.round(sizePx.w)}
                height={Math.round(sizePx.h)}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            />
        </>
    );
}
