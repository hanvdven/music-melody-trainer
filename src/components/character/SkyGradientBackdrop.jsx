import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import bgLayer5Url from '../../assets/ASSORTED/backgrounds/Normal BG/Background layers_layer 5.png';
import logger from '../../utils/logger';
import useFrameLoop from '../../hooks/useFrameLoop';
import { cloudClearness, cloudCollapseT, cloudDarkT, weatherOutputs } from './weatherCycle';
// §377 UAT r2: `sunGlowColor` no longer imports the sun DISC's saturated yellow — the rim tint is a
// warm near-white of its own (SUN_GLOW_RIM_DAY / SUN_GLOW_RIM_DUSK below). `sunGlowColor` still lives
// in THIS file because it owns `sunsetFactor`, the one shared dusk/dawn curve (cr2).

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
// bookend the pipeline (see `cloudSkyStop`), driven by ONE eased scalar, `cloudCoverT`.
// §375 UAT r1 (Han: "de vlekken hoeven niet. Maak de achtergrond maar gewoon wit (bewolkt) en mat
// grijs (zwaar bewolkt) met subtiele gradient"): the procedural "mottle" canvas is GONE — an overcast
// sky is now just the flat sheet with a gentle top→horizon falloff, nothing more.

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

// Warm sunset rose the horizon lerps toward at dusk/dawn. Exported since §377 so the sun EDGE-GLOW
// tint can lerp toward the EXACT same rose on the EXACT same curve — no second pink, no second
// dusk/dawn curve anywhere in the app.
export const SUNSET_RGB = [255, 150, 130];
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
// bypassed or thresholded. The overcast sheet is simply lerped OVER their result in proportion to
// `cloudCollapseT`, and the sheet carries its own night dim, so an overcast sky is the same colour
// day AND night, only much dimmer at night (Han, UAT r1: "bewolkte nacht moet ook donker worden").

// CLEAR ("HELDER"): Han UAT r1 — "de zeer heldere dag, echt mooi helder blauw, nog niet gezien". The
// r0 version only *saturated* the sampled cyan-ish stop, which stayed pale. Now it does BOTH: a
// stronger saturation bump AND a lerp toward a real deep sky-blue, so HELDER actually reads as a
// vivid blue sky.
const CLEAR_SAT_GAIN = 0.85;
const CLEAR_SKY_BLUE = [64, 132, 220];   // the deep clear-sky blue the top stops lerp toward
const CLEAR_BLUE_SHARE = 0.55;           // how far toward CLEAR_SKY_BLUE at full clearness, at the top stop
// …both effects weighted 1.0 at the TOP stop ("het blauw blauwer") falling to this at the horizon
// ("de witte fade minder wit").
const CLEAR_HORIZON_SHARE = 0.4;
const clearWeightAt = (f) => lerpNum(1, CLEAR_HORIZON_SHARE, f);

// OVERCAST → DARK_OVERCAST: the sheet goes from near-white to a matte mid grey (Han UAT r1: "gewoon
// wit (bewolkt) en mat grijs (zwaar bewolkt)").
const CLOUD_SHEET_WHITE = [250, 250, 250];   // neutral white — BEWOLKT ("gewoon wit")
const OVERCAST_DARK_SCALE = 0.46;            // × this ⇒ ~[115,115,115] matte grey — ZWAAR BEWOLKT
// A SUBTLE top→horizon falloff so the sheet is a gentle gradient, not a dead flat fill (Han: "met
// subtiele gradient"). 1.0 at the top stop, this at the horizon.
const CLOUD_SHEET_VGRAD = 0.92;
// An overcast NIGHT is DARK — much darker than the r0 0.45. This is the single knob for "how dark is
// a clouded-over night".
const OVERCAST_NIGHT_DIM = 0.26;

/**
 * The overcast sheet colour for one stop: a barely-cool white (BEWOLKT) → matte grey (DARK_OVERCAST),
 * with a subtle vertical falloff and a night dim. Explicit white/grey per Han's UAT-r1 instruction
 * (not derived from the art — "gewoon wit").
 * @param f      height fraction (0 = top, 1 = horizon)
 * @param darkT  0 at ≤ OVERCAST → 1 at DARK_OVERCAST
 * @param illum  globalIllumination (already incl. §375's illumMultiplier)
 */
export function cloudSheetAt(f, darkT, illum) {
    const k = lerpNum(1, CLOUD_SHEET_VGRAD, f)                            // subtle top→horizon falloff
        * lerpNum(1, OVERCAST_DARK_SCALE, darkT)                          // white → matte grey
        * lerpNum(1, OVERCAST_NIGHT_DIM, Math.max(0, Math.min(1, 1 - illum)));   // day AND night, night dark
    return scaleRgb(CLOUD_SHEET_WHITE, k);
}

/**
 * The WHOLE 4-op per-stop pipeline for ONE gradient stop. Exported so the colour maths is unit
 * testable in jsdom without a canvas — the same trick §372 used by exporting `mixNight`/`sunsetFactor`.
 *
 * @param dayStop    the sampled [r,g,b] for this stop
 * @param f          its height fraction (0 = top of sky, 1 = horizon)
 * @param illum      globalIllumination (0..1) — ALREADY includes §375's illumMultiplier (cr3)
 * @param cloudCoverT the eased cloud-cover scalar (0..1)
 */
export function cloudSkyStop(dayStop, f, illum, cloudCoverT) {
    const clearness = cloudClearness(cloudCoverT);
    const collapseT = cloudCollapseT(cloudCoverT);
    const darkT = cloudDarkT(cloudCoverT);

    // op 0 (NEW, BEFORE mixNight) — CLEAR: bluer + more saturated. Runs first so a clear NIGHT still
    // darkens normally afterwards. Saturation bump AND a lerp toward a real deep sky-blue (UAT r1).
    let c = dayStop;
    const cw = clearWeightAt(f) * clearness;
    if (cw > 0) {
        const l = luma(c);
        c = c.map((v) => clamp255(l + (v - l) * (1 + CLEAR_SAT_GAIN * cw)));
        c = lerpRgb(c, CLEAR_SKY_BLUE, CLEAR_BLUE_SHARE * cw);
    }

    // op 1 (UNCHANGED, §372) — night mix.
    c = mixNight(c, illum);

    // op 2 (UNCHANGED, §372, plus one factor) — the dusk/dawn horizon glow. A pink horizon under a
    // solid cloud sheet would be wrong, so its weight is additionally scaled by (1 - collapseT).
    const w = sunsetWeightAt(f) * sunsetFactor(illum) * (1 - collapseT);
    if (w > 0) c = lerpRgb(c, SUNSET_RGB, w);

    // op 3 (NEW, AFTER everything) — collapse toward the overcast sheet (white → matte grey, subtle
    // vertical gradient, night-dark). At LIGHT/CLEAR collapseT is 0 and this is a mathematical no-op,
    // which is why LIGHT is bit-identical to the pre-§375 sky.
    if (collapseT > 0) c = lerpRgb(c, cloudSheetAt(f, darkT, illum), collapseT);
    return c;
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

// §377 UAT r2 (Han, screenshot 2026-09-06: "ik wil bijv dat de buitenste paar pixels in de buurt van
// de zon 'overbelicht' zijn, precies zoals bij de maan ... effect bestaat al voor de maan; je moet
// hetzelfde effect hergebruiken"). The moon's rim (`MOON_RIM_COLOR = vec3(1.0)`) blows edge pixels
// toward pure WHITE — that "overbelicht" read is the whole point. A saturated yellow tint (r0/r1) only
// warms the edge, it never overexposes it. So the sun rim colour is now a warm near-WHITE by day,
// lerping to a warm pink-white at dusk/dawn — the sun's colour is a CAST on an otherwise white
// blow-out, not a saturated fill. `SUN_GLOW_RGB` (the saturated yellow) stays as-is: it is the DISC's
// colour, not the rim's.
export const SUN_GLOW_RIM_DAY = [255, 247, 230];    // barely-warm white — blows out like the moon, faint gold cast
export const SUN_GLOW_RIM_DUSK = [255, 226, 214];   // warm pink-white for the dusk/dawn plateau

/**
 * §377: the sun EDGE-GLOW tint (see UAT r2 note above). Lerps `SUN_GLOW_RIM_DAY → SUN_GLOW_RIM_DUSK`
 * on the SAME `sunsetFactor` curve the sky gradient uses — one dusk/dawn curve for the whole app (cr2).
 *
 * Lives here (not in celestialModel, not inline in RpgLevelPanel) because this file OWNS `sunsetFactor`,
 * and its pure helpers are exported precisely so the colour maths stays testable in jsdom without a
 * canvas.
 *
 * `lerpRgb` ROUNDS to integers, so the result is inherently quantised to 1/255 steps — which is why
 * this needs no term of its own in RpgLevelPanel's per-tick change-detection list: it is a pure
 * function of `globalIllumination`, which is already in that list at 0.004 granularity (cr3).
 */
export function sunGlowColor(illum) {
    return lerpRgb(SUN_GLOW_RIM_DAY, SUN_GLOW_RIM_DUSK, sunsetFactor(illum));
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

function buildGradientCss(dayStops, illum, cloudCoverT) {
    const parts = dayStops.map((stop, i) => {
        const c = cloudSkyStop(stop, SAMPLE_FRACS[i], illum, cloudCoverT);
        return `rgb(${c[0]}, ${c[1]}, ${c[2]}) ${(SAMPLE_FRACS[i] * 100).toFixed(2)}%`;
    });
    return `linear-gradient(to bottom, ${parts.join(', ')})`;
}

// Perf (#1192-jank, Han 2026-09-04, "transitie van gradient loopt ook nog wat schokkerig"): same
// early-out epsilons CelestialSky.jsx (§374) uses for its own per-frame draw guard — kept as separate
// local constants rather than imported, since the two components' early-out guards are otherwise
// independent (no shared state between them beyond the values themselves).
const ILLUM_EPSILON = 0.004;
const CLOUD_EPSILON = 0.002;

// `weatherRef` — the SAME ref RpgLevelPanel's weather-tick loop and `<CelestialSky>` (§374) already
// read `weatherOutputs()` off directly, instead of a React-state-driven prop. Before this fix,
// `cloudCoverT` arrived QUANTISED to 0.05 (RpgLevelPanel's `quantCloudCover`) specifically so this
// component wouldn't force a React render on every one of the weather tick's frames — but that meant
// a full 10 s cloud-cover transition only repainted ≤20 times (~2/s), visibly "schokkerig" for a
// full-screen colour sweep (`globalIllumination`, by contrast, was already fine — its 0.004 gating
// granularity is fine enough to look smooth). Fix: read the RAW continuous weather state directly
// inside a `useFrameLoop` callback and write `style.background` imperatively, exactly like
// CelestialSky already does for its canvas — bypassing React state/props (and therefore any
// render-triggering threshold) for this value entirely. `buildGradientCss` (17 stops, plain arithmetic,
// no trig) is cheap enough for 60fps, same reasoning as `tickWeather`/`weatherOutputs` themselves
// (see architecture.md §378's identical fix for the star field's `cycleT`).
export default function SkyGradientBackdrop({ weatherRef }) {
    const [dayStops, setDayStops] = useState(FALLBACK_STOPS);
    const doneRef = useRef(false);
    const divRef = useRef(null);
    const lastIllumRef = useRef(null);
    const lastCloudCoverRef = useRef(null);

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

    // Paints synchronously before first browser paint (mount), and again the instant `dayStops`
    // resolves from the async image sample — so the div is NEVER left without a `background` waiting
    // for the next rAF tick. CLAUDE.md §6 ("never set opacity via JSX props on animated elements,
    // generalized to any imperatively-driven style") is why this is a `useLayoutEffect` write, not a
    // `style={{ background: ... }}` JSX prop: a JSX prop would fight the rAF write below on every
    // unrelated parent re-render (React resets inline styles it controls on every commit).
    useLayoutEffect(() => {
        if (!divRef.current) return;
        const { globalIllumination, cloudCoverT } = weatherOutputs(weatherRef.current);
        divRef.current.style.background = buildGradientCss(dayStops, globalIllumination, cloudCoverT);
        lastIllumRef.current = globalIllumination;
        lastCloudCoverRef.current = cloudCoverT;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dayStops]);

    useFrameLoop(() => {
        if (!divRef.current) return;
        const { globalIllumination, cloudCoverT } = weatherOutputs(weatherRef.current);
        if (
            lastIllumRef.current != null &&
            Math.abs(globalIllumination - lastIllumRef.current) < ILLUM_EPSILON &&
            Math.abs(cloudCoverT - lastCloudCoverRef.current) < CLOUD_EPSILON
        ) {
            return;   // settled — skip the DOM write, same early-out CelestialSky's draw loop uses
        }
        lastIllumRef.current = globalIllumination;
        lastCloudCoverRef.current = cloudCoverT;
        divRef.current.style.background = buildGradientCss(dayStops, globalIllumination, cloudCoverT);
    }, [], { priority: 'critical' });

    return <div ref={divRef} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />;
}
