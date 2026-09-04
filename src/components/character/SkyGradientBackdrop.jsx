import React, { useEffect, useMemo, useRef, useState } from 'react';
import bgLayer5Url from '../../assets/ASSORTED/backgrounds/Normal BG/Background layers_layer 5.png';
import logger from '../../utils/logger';

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
// nothing above ~55 % height, ramping to 0.8 at the horizon.
function sunsetWeightAt(f) {
    return smoothstep(0.55, 1.0, f) * 0.8;
}

function smoothstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
}

function lerpRgb(a, b, t) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

const FALLBACK_STOPS = SAMPLE_FRACS.map((f) => lerpRgb(FALLBACK_TOP, FALLBACK_HORIZON, f));

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
export default function SkyGradientBackdrop({ globalIllumination = 1 }) {
    const [dayStops, setDayStops] = useState(FALLBACK_STOPS);
    const doneRef = useRef(false);

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

    const css = useMemo(() => {
        const sun = sunsetFactor(globalIllumination);
        const parts = dayStops.map((stop, i) => {
            let c = mixNight(stop, globalIllumination);
            const w = sunsetWeightAt(SAMPLE_FRACS[i]) * sun;
            if (w > 0) c = lerpRgb(c, SUNSET_RGB, w);
            return `rgb(${c[0]}, ${c[1]}, ${c[2]}) ${(SAMPLE_FRACS[i] * 100).toFixed(2)}%`;
        });
        return `linear-gradient(to bottom, ${parts.join(', ')})`;
    }, [dayStops, globalIllumination]);

    return <div aria-hidden style={{ position: 'absolute', inset: 0, background: css, pointerEvents: 'none' }} />;
}
