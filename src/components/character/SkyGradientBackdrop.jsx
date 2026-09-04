import React, { useEffect, useMemo, useRef, useState } from 'react';
import bgLayer5Url from '../../assets/ASSORTED/backgrounds/Normal BG/Background layers_layer 5.png';
import logger from '../../utils/logger';
import { CLOUD_COVER, cloudClearness, cloudCollapseT, cloudDarkT } from './weatherCycle';

// §372 (Han 2026-09-04): the backmost sky used to be TWO stacked static elements in RpgLevelPanel — a
// hard-coded CSS `linear-gradient` div and the painted `Background layers_layer 5.png` image, both
// full-viewport. Han: "vervang de achtergrond (verste parallax) door een gerenderde gradient. Meet de
// kleuren uit de huidige achtergrondlaag eenmalig ... Blauwig naar wit. Bij dusk/dawn wat roze/rood aan
// de horizon. De huidige nachtkleuring vind ik eigenlijk perfect: dezelfde gradient als overdag, met
// donkerblauw ingemengd." This component IS that single rendered gradient:
//   - 5 vertical colour stops sampled ONCE from layer-5 (row-average RGB at 0/25/50/75/100% height);
//   - each stop night-darkened by the SAME multiply-equivalent the parallax bg canvases use, so it
//     tracks the auto weather cycle in lock-step with everything else (no separate DOM darken overlay —
//     that stacked a second multiply on top, the #26 "achtergrond verdwijnt" bug);
//   - a dusk/dawn warm horizon glow on the lower stops, strongest at the horizon.
//
// §375 (#1192, Han 2026-09-04) added the CLOUD-COVER axis on top of that: two extra colour ops that
// bookend the pipeline (see `cloudSkyStop`) plus a procedural pixel-art "mottle" canvas sibling (see
// `buildMottleField`). Both are driven by ONE eased scalar, `cloudCoverT`.

// §370 AMBIENT_DARK twin — same value as RpgLevelPanel's `AMBIENT_DARK_RGB` and the shader's
// `AMBIENT_DARK_COLOR`, so the night mix here lands on the exact same colour as the BgLayer canvas
// darken and the WebGL ground/foliage.
const AMBIENT_DARK_RGB = [8, 15, 43];

// UAT (Han 2026-09-04, screenshot: "waar komt deze streep nu nog vandaan in hoge levels?"): a
// 5-stop `linear-gradient` is 4 straight sRGB segments over the full sky height — the joints
// (especially at 25 %) show as a Mach band / hard line, worse the taller the viewport. Fix: sample
// MANY rows (every ~6 %) so each segment's slope change is imperceptible and the stops trace the
// painted layer-5 curve directly (a subtle horizon-haze band in the source can no longer be aliased
// into a kink either). `SAMPLE_FRACS` is now generated, and everything that was a fixed 5-element
// array is a function of the stop fraction instead.
const STOP_COUNT = 17;
const SAMPLE_FRACS = Array.from({ length: STOP_COUNT }, (_, i) => i / (STOP_COUNT - 1));

// Fallback endpoints (top -> horizon) = the old hard-coded `#8fd0d9 -> #dff3f5`; interpolated across
// SAMPLE_FRACS. Shown until the layer-5 sample resolves (or if it fails) so the sky is never blank.
const FALLBACK_TOP = [143, 208, 217];
const FALLBACK_HORIZON = [223, 243, 245];

// Warm sunset rose the horizon lerps toward at dusk/dawn.
const SUNSET_RGB = [255, 150, 130];
// Per-stop weight of that glow as a function of height fraction `f` (0 = top of sky, 1 = horizon):
// nothing above ~55 % height, ramping to 0.8 at the horizon. Exported for unit tests.
export function sunsetWeightAt(f) {
    return smoothstep(0.55, 1.0, f) * 0.8;
}

function smoothstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
}

function lerpRgb(a, b, t) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

const lerpNum = (a, b, t) => a + (b - a) * t;
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const scaleRgb = (c, k) => c.map((v) => clamp255(v * k));
// Rec.601 luma — the same weights the saturation boost below rotates each channel around.
const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

const FALLBACK_STOPS = SAMPLE_FRACS.map((f) => lerpRgb(FALLBACK_TOP, FALLBACK_HORIZON, f));

// ---------------------------------------------------------------------------------------------
// §375 "weertypen" (#1192, Han 2026-09-04) — the cloud-cover colour transform.
//
// Han: "HELDER: maak de witte fade minder wit en het blauw blauwer. LICHT BEWOLKT: as is. BEWOLKT:
// achtergrond wit + vlekkerig. DONKER BEWOLKT: lucht is grijs en vlekkerig."
//
// This is expressed as TWO extra ops that BOOKEND the existing pipeline (cr6): `mixNight` and the
// dusk/dawn `sunsetFactor` lerp are untouched and — this is the explicit design answer — are NEVER
// bypassed or thresholded. The flat overcast sheet is simply lerped OVER their result in proportion
// to `cloudCollapseT`, and the sheet carries its own gentle night dim, so an overcast sky is the same
// flat grey day AND night, only dimmer at night (Han, plan_review Q2).

// CLEAR: how far the sampled stop is pushed away from its own grey. Saturating the ART rather than
// lerping toward an invented blue means this keeps working if Han ever repaints layer-5 (§6c).
const CLEAR_SAT_GAIN = 0.45;
// …weighted 1.0 at the TOP stop ("het blauw blauwer") falling to this at the horizon ("de witte fade
// minder wit" — saturating a near-white stop is what pulls its residual cyan back out).
const CLEAR_HORIZON_SHARE = 0.45;
const clearWeightAt = (f) => lerpNum(1, CLEAR_HORIZON_SHARE, f);

// OVERCAST → DARK_OVERCAST: the flat sheet goes from near-white to mid grey.
const OVERCAST_DARK_SCALE = 0.55;
// …and an overcast NIGHT is a DIM flat grey glow rather than day-bright (Han, plan_review Q2 = ja).
// Retunable: this is the single knob for "how dark is a clouded-over night".
const OVERCAST_NIGHT_DIM = 0.45;

/**
 * The flat sheet an overcast sky collapses toward, DERIVED from the sampled art: the whitest sampled
 * stop (the horizon), fully desaturated. One source of truth for "cloud colour" — the mottle blobs
 * below tint from this same base.
 */
export function cloudFlatBase(stops) {
    const l = clamp255(luma(stops[stops.length - 1]));
    return [l, l, l];
}
const DEFAULT_FLAT_BASE = cloudFlatBase(FALLBACK_STOPS);

/**
 * The WHOLE 4-op per-stop pipeline for ONE gradient stop. Exported so the colour maths is unit
 * testable in jsdom without a canvas — the same trick §372 used by exporting `mixNight`/`sunsetFactor`.
 *
 * @param dayStop    the sampled [r,g,b] for this stop
 * @param f          its height fraction (0 = top of sky, 1 = horizon)
 * @param illum      globalIllumination (0..1) — ALREADY includes §375's illumMultiplier (cr3)
 * @param cloudCoverT the eased cloud-cover scalar (0..1)
 * @param flatBase   the desaturated sheet colour from `cloudFlatBase(dayStops)`
 */
export function cloudSkyStop(dayStop, f, illum, cloudCoverT, flatBase = DEFAULT_FLAT_BASE) {
    const clearness = cloudClearness(cloudCoverT);
    const collapseT = cloudCollapseT(cloudCoverT);
    const darkT = cloudDarkT(cloudCoverT);

    // op 0 (NEW, BEFORE mixNight) — CLEAR: bluer / less white. Runs first so a clear NIGHT still
    // darkens normally afterwards.
    let c = dayStop;
    const satGain = CLEAR_SAT_GAIN * clearWeightAt(f) * clearness;
    if (satGain > 0) {
        const l = luma(c);
        c = c.map((v) => clamp255(l + (v - l) * (1 + satGain)));
    }

    // op 1 (UNCHANGED, §372) — night mix.
    c = mixNight(c, illum);

    // op 2 (UNCHANGED, §372, plus one factor) — the dusk/dawn horizon glow. A pink horizon under a
    // solid cloud sheet would be wrong, so its weight is additionally scaled by (1 - collapseT).
    const w = sunsetWeightAt(f) * sunsetFactor(illum) * (1 - collapseT);
    if (w > 0) c = lerpRgb(c, SUNSET_RGB, w);

    // op 3 (NEW, AFTER everything) — collapse toward the flat sheet. At LIGHT/CLEAR collapseT is 0
    // and this is a mathematical no-op, which is why LIGHT is bit-identical to the pre-§375 sky.
    if (collapseT > 0) {
        const sheet = scaleRgb(
            flatBase,
            lerpNum(1, OVERCAST_DARK_SCALE, darkT)                                   // white → mid grey
            * lerpNum(1, OVERCAST_NIGHT_DIM, Math.max(0, Math.min(1, 1 - illum))),   // day AND night, dimmed
        );
        c = lerpRgb(c, sheet, collapseT);
    }
    return c;
}

// ---------------------------------------------------------------------------------------------
// §375 "vlekkerig" — the procedural mottle layer.
//
// A two-octave value-noise field, QUANTISED to a handful of alpha levels and painted as integer
// `fillRect` runs on a native-game-pixel canvas that is nearest-neighbour upscaled. Quantising a
// smoothly interpolated field is what makes it read as hard-edged pixel-art blotches with ZERO blur —
// the same discipline as CelestialSky's SUN_GLOW_RINGS and MOON_SHADE. Never a CSS/radial gradient,
// never `ctx.arc`, never a filter (cr4).

const MOTTLE_CELL_GPX = 24;        // octave A cell size in GAME px ⇒ blobs ~24-48 gpx (~72-144 CSS px at worldScale 3)
const MOTTLE_OCTAVE_MIX = 0.35;    // how much of the half-size octave B is mixed in
const MOTTLE_CONTRAST = 1.6;       // >1 ⇒ blotches rather than mush
const MOTTLE_LEVELS = 4;           // quantised alpha steps; level 0 = fully absent
const MOTTLE_PEAK_ALPHA = 0.35;    // alpha of the strongest blob at full collapse
const MOTTLE_SHADOW_SCALE = 0.62;  // DARK_OVERCAST blob colour = flatBase × this (a cool grey)

// Integer xorshift-multiply hash → [0,1). Pure and deterministic: no `Math.random` ever reaches the
// render path, so the blob pattern is identical for the whole session and across a music LEVEL.
function hash2(ix, iy, seed) {
    let h = (Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// One octave of bilinear-interpolated value noise, using the file's existing `smoothstep` on each
// axis so the cell edges are not visible as a diamond lattice.
function valueNoise(x, y, cell, seed) {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    const fx = smoothstep(0, 1, x / cell - gx);
    const fy = smoothstep(0, 1, y / cell - gy);
    const top = lerpNum(hash2(gx, gy, seed), hash2(gx + 1, gy, seed), fx);
    const bot = lerpNum(hash2(gx, gy + 1, seed), hash2(gx + 1, gy + 1, seed), fx);
    return lerpNum(top, bot, fy);
}

/**
 * Build the quantised noise FIELD: one byte (0..MOTTLE_LEVELS-1) per game pixel. Deliberately split
 * from the paint pass — the field depends only on size + seed, so a cloud transition re-tints and
 * re-fades an UNCHANGING pattern instead of swapping the blob shapes mid-ease (which pops).
 */
function buildMottleField(w, h, seed) {
    const out = new Uint8Array(w * h);
    const cellB = MOTTLE_CELL_GPX / 2;   // derived, never a second typed constant
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const a = valueNoise(x, y, MOTTLE_CELL_GPX, seed);
            const b = valueNoise(x, y, cellB, seed + 1);
            let v = lerpNum(a, b, MOTTLE_OCTAVE_MIX);
            v = (v - 0.5) * MOTTLE_CONTRAST + 0.5;
            v = v < 0 ? 0 : v > 1 ? 1 : v;
            out[y * w + x] = Math.min(MOTTLE_LEVELS - 1, Math.floor(v * MOTTLE_LEVELS));
        }
    }
    return out;
}

// Night mix: reproduces the OLD behaviour exactly — an `rgba(AMBIENT_DARK, n)` fill painted with
// `mix-blend-mode: multiply` over the day stop, where `n = 1 - illum`. CSS multiply with alpha n is
// `stop * (1 - n + n * dark/255)` per channel. Exported for unit tests.
export function mixNight(stop, illum) {
    const n = Math.max(0, Math.min(1, 1 - illum));
    return stop.map((c, i) => Math.round(c * (1 - n + n * (AMBIENT_DARK_RGB[i] / 255))));
}

// Dusk/dawn horizon-glow strength: a hump on `globalIllumination` that peaks at ~0.33 (the illum
// plateau dusk and dawn both sit on) and is 0 at deep night (<= 0.05) and well into day (>= 0.75). One
// value covers BOTH dusk and dawn (both phases cross illum 0.33) and tails smoothly into the adjacent
// day/night — Han's "ramp, and also bleed into day/night edges" for free, no phase plumbing.
// Exported for unit tests.
export function sunsetFactor(illum) {
    return smoothstep(0.05, 0.33, illum) * (1 - smoothstep(0.33, 0.75, illum));
}

function sampleLayer5(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            try {
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                const cv = document.createElement('canvas');
                cv.width = w;
                cv.height = h;
                const ctx = cv.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const stops = SAMPLE_FRACS.map((f) => {
                    const y = Math.min(h - 1, Math.max(0, Math.round(f * (h - 1))));
                    const row = ctx.getImageData(0, y, w, 1).data;
                    let r = 0;
                    let g = 0;
                    let b = 0;
                    let count = 0;
                    // Every 4th column is plenty of resolution for a smooth painted sky, and 4x faster.
                    for (let x = 0; x < w; x += 4) {
                        if (row[x * 4 + 3] < 8) continue; // skip fully-transparent margins
                        r += row[x * 4];
                        g += row[x * 4 + 1];
                        b += row[x * 4 + 2];
                        count += 1;
                    }
                    return count === 0 ? null : [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
                });
                if (stops.some((s) => s == null)) {
                    reject(new Error('layer-5 sample produced an empty row'));
                    return;
                }
                resolve(stops);
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = () => reject(new Error('layer-5 background image failed to load'));
        img.src = url;
    });
}

// `globalIllumination` (0..1) comes straight from `foliageParams.globalIllumination` — the same
// continuous value the shaders read. It is NOT quantised here (unlike the parallax canvases' `bgNight`)
// because this component only rebuilds a short CSS string, never re-bakes a canvas, so it can follow the
// 10 s illum crossfade smoothly.
//
// §375: `cloudCoverT` / `cloudSeed` arrive as their OWN props (not through `foliageParams`, which is
// documented as the shader-uniform bag). `cloudCoverT` is the eased SCALAR, not the type string — a
// string would force a hard switch in here and throw the 10 s ease away. RpgLevelPanel hands over a
// 0.05-QUANTISED value so this component re-renders ≤20 times across a transition and 0 while settled
// (the §374 invariant: the raw continuous value must never drive a React render).
export default function SkyGradientBackdrop({
    globalIllumination = 1,
    cloudCoverT = CLOUD_COVER.LIGHT,
    cloudSeed = 0,
    sizePx = { w: 0, h: 0 },
    zoom = 1,
}) {
    const [dayStops, setDayStops] = useState(FALLBACK_STOPS);
    const doneRef = useRef(false);
    const mottleCanvasRef = useRef(null);
    // The cached quantised noise field. State, not a ref, because the paint effect below must re-run
    // the moment a newly-built field arrives.
    const [mottleField, setMottleField] = useState(null);

    // Native GAME pixels, CSS-upscaled with `imageRendering: 'pixelated'` — the exact convention
    // CelestialSky and LdtkScenery's parallax canvases use, so one mottle pixel is one game pixel.
    const Wpx = sizePx.w > 0 && zoom > 0 ? Math.round(sizePx.w / zoom) : 0;
    const Hpx = sizePx.h > 0 && zoom > 0 ? Math.round(sizePx.h / zoom) : 0;

    useEffect(() => {
        if (doneRef.current) return undefined;
        let alive = true;
        sampleLayer5(bgLayer5Url)
            .then((stops) => {
                if (!alive) return;
                doneRef.current = true;
                setDayStops(stops);
            })
            .catch((err) => {
                // System boundary (image load / canvas read). Keep the fallback stops — still a fine
                // blue->white sky — rather than blanking the world.
                logger.error('SkyGradientBackdrop', 'E036-SKY-SAMPLE', err);
            });
        return () => {
            alive = false;
        };
    }, []);

    const flatBase = useMemo(() => cloudFlatBase(dayStops), [dayStops]);

    const css = useMemo(() => {
        const parts = dayStops.map((stop, i) => {
            const c = cloudSkyStop(stop, SAMPLE_FRACS[i], globalIllumination, cloudCoverT, flatBase);
            return `rgb(${c[0]}, ${c[1]}, ${c[2]}) ${(SAMPLE_FRACS[i] * 100).toFixed(2)}%`;
        });
        return `linear-gradient(to bottom, ${parts.join(', ')})`;
    }, [dayStops, globalIllumination, cloudCoverT, flatBase]);

    // §375 FIELD pass — rebuilt ONLY on a canvas resize or a seed change, never on a type change.
    // The seed lives in the weather state (rolled once per session, carried through
    // `weatherCycleStore`), so the blob SHAPES are stable across a music LEVEL and across every cloud
    // transition; only their tint and alpha ease. Han (plan_review Q3) confirmed this is what he wants.
    useEffect(() => {
        if (Wpx <= 0 || Hpx <= 0) {
            setMottleField(null);
            return;
        }
        try {
            setMottleField({ w: Wpx, h: Hpx, data: buildMottleField(Wpx, Hpx, cloudSeed) });
        } catch (err) {
            // System boundary-ish: a pathological size would throw on the Uint8Array allocation. The
            // gradient sky underneath must survive without the mottle rather than blanking the world.
            logger.error('SkyGradientBackdrop', 'E039-SKY-MOTTLE-PAINT', err, { Wpx, Hpx });
            setMottleField(null);
        }
    }, [Wpx, Hpx, cloudSeed]);

    // §375 PAINT pass — cheap: re-tint + re-fade the cached field. Runs only when the QUANTISED cover
    // moves (≤20 times over a 10 s transition, 0 while settled — the same cadence `bgNight` re-bakes
    // the parallax canvases at).
    useEffect(() => {
        const canvas = mottleCanvasRef.current;
        if (!canvas || !mottleField) return;
        try {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;   // jsdom / a lost context — nothing to draw, gradient still fine
            ctx.imageSmoothingEnabled = false;
            const { w, h, data } = mottleField;
            ctx.clearRect(0, 0, w, h);
            const peakAlpha = MOTTLE_PEAK_ALPHA * cloudCollapseT(cloudCoverT);
            // CLEAR and LIGHT pay literally nothing — the canvas is simply empty (ac5).
            if (peakAlpha <= 0) return;
            // WHITE blobs at OVERCAST → cool GREY blobs at DARK_OVERCAST (Han's spec), the grey derived
            // from the SAME `flatBase` sheet colour the gradient collapses toward.
            const blob = lerpRgb([255, 255, 255], scaleRgb(flatBase, MOTTLE_SHADOW_SCALE), cloudDarkT(cloudCoverT));
            ctx.fillStyle = `rgb(${blob[0]}, ${blob[1]}, ${blob[2]})`;
            // Run-length the level bytes per row: one integer `fillRect` per run of equal level.
            for (let y = 0; y < h; y++) {
                const row = y * w;
                let x = 0;
                while (x < w) {
                    const level = data[row + x];
                    let end = x + 1;
                    while (end < w && data[row + end] === level) end += 1;
                    if (level > 0) {
                        ctx.globalAlpha = (level / (MOTTLE_LEVELS - 1)) * peakAlpha;
                        ctx.fillRect(x, y, end - x, 1);
                    }
                    x = end;
                }
            }
            ctx.globalAlpha = 1;
        } catch (err) {
            logger.error('SkyGradientBackdrop', 'E039-SKY-MOTTLE-PAINT', err, { cloudCoverT });
        }
    }, [mottleField, cloudCoverT, flatBase]);

    return (
        <>
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: css, pointerEvents: 'none' }} />
            {Wpx > 0 && Hpx > 0 && (
                <canvas
                    ref={mottleCanvasRef}
                    aria-hidden
                    width={Wpx}
                    height={Hpx}
                    style={{
                        position: 'absolute', inset: 0, width: '100%', height: '100%',
                        imageRendering: 'pixelated', pointerEvents: 'none',
                    }}
                />
            )}
        </>
    );
}
