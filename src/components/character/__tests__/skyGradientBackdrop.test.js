import { describe, it, expect } from 'vitest';
import { mixNight, sunsetFactor, sunsetWeightAt, cloudSkyStop, cloudSheetAt } from '../SkyGradientBackdrop';
import { CLOUD_COVER } from '../weatherCycle';

// §372 — the rendered sky-gradient backdrop. These cover the two pure colour helpers; the canvas
// sampling / DOM render is not unit-tested (jsdom has no real 2D canvas).

describe('mixNight', () => {
    it('is a no-op at full daylight (illum = 1)', () => {
        expect(mixNight([143, 208, 217], 1)).toEqual([143, 208, 217]);
    });

    it('pulls every channel toward AMBIENT_DARK as illum drops', () => {
        const day = [200, 220, 240];
        const dusk = mixNight(day, 0.33);
        const night = mixNight(day, 0.05);
        day.forEach((c, i) => {
            expect(dusk[i]).toBeLessThan(c);
            expect(night[i]).toBeLessThan(dusk[i]);
        });
    });

    it('at illum 0 approaches stop * AMBIENT_DARK/255 (the old multiply overlay result)', () => {
        // AMBIENT_DARK_RGB = [8, 15, 43]
        const [r, g, b] = mixNight([255, 255, 255], 0);
        expect(r).toBe(8);
        expect(g).toBe(15);
        expect(b).toBe(43);
    });
});

describe('sunsetFactor', () => {
    it('is ~0 in full day and in deep night', () => {
        expect(sunsetFactor(1)).toBeLessThan(0.01);
        expect(sunsetFactor(0.75)).toBeLessThan(0.01);
        expect(sunsetFactor(0.05)).toBeLessThan(0.01);
        expect(sunsetFactor(0)).toBe(0);
    });

    it('peaks on the dusk/dawn illum plateau (~0.33)', () => {
        const peak = sunsetFactor(0.33);
        expect(peak).toBeGreaterThan(0.9);
        expect(peak).toBeGreaterThan(sunsetFactor(0.6));
        expect(peak).toBeGreaterThan(sunsetFactor(0.15));
    });

    it('bleeds into the adjacent day and night rather than snapping', () => {
        // non-zero on both sides of the plateau — the "bleed into day/night edges" behaviour
        expect(sunsetFactor(0.5)).toBeGreaterThan(0);
        expect(sunsetFactor(0.15)).toBeGreaterThan(0);
    });
});

// §375 "weertypen" (#1192, Han 2026-09-04): the per-stop cloud-cover colour transform.
// UAT r1 (Han): the procedural mottle canvas was DROPPED ("de vlekken hoeven niet"); an overcast sky
// is now the flat white/grey sheet with a subtle top→horizon falloff, and a clouded NIGHT is dark.
describe('§375 cloudSkyStop', () => {
    // A representative sampled sky: bluish top → near-white horizon (the §372 fallback endpoints).
    const TOP = [143, 208, 217];
    const HORIZON = [223, 243, 245];
    const STOPS = [TOP, HORIZON];
    const SUNSET_RGB = [255, 150, 130];
    const spread = (c) => Math.max(...c) - Math.min(...c);
    const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

    // The pre-§375 pipeline, reproduced from the two already-exported helpers.
    function legacyStop(stop, f, illum) {
        let c = mixNight(stop, illum);
        const w = sunsetWeightAt(f) * sunsetFactor(illum);
        if (w > 0) c = c.map((v, i) => Math.round(v + (SUNSET_RGB[i] - v) * w));
        return c;
    }

    it('at LIGHT is EXACTLY the pre-§375 mixNight + sunset result (ac5, "as is")', () => {
        for (const illum of [1, 0.75, 0.33, 0.2, 0.12, 0]) {
            for (const f of [0, 0.25, 0.5, 0.75, 1]) {
                for (const stop of STOPS) {
                    expect(cloudSkyStop(stop, f, illum, CLOUD_COVER.LIGHT))
                        .toEqual(legacyStop(stop, f, illum));
                }
            }
        }
    });

    it('CLEAR pushes the sky bluer + more saturated — more at the top than the horizon (ac6)', () => {
        const lightTop = cloudSkyStop(TOP, 0, 1, CLOUD_COVER.LIGHT);
        const clearTop = cloudSkyStop(TOP, 0, 1, CLOUD_COVER.CLEAR);
        const lightHor = cloudSkyStop(HORIZON, 1, 1, CLOUD_COVER.LIGHT);
        const clearHor = cloudSkyStop(HORIZON, 1, 1, CLOUD_COVER.CLEAR);

        // more saturated (bigger channel spread) at both stops…
        expect(spread(clearTop)).toBeGreaterThan(spread(lightTop));
        expect(spread(clearHor)).toBeGreaterThan(spread(lightHor));
        // …and the change is bigger at the top ("het blauw blauwer") than at the horizon
        const chg = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);
        expect(chg(clearTop, lightTop)).toBeGreaterThan(chg(clearHor, lightHor));
        // it stays a SKY: blue is still the dominant channel at the top, and clearly bluer than LIGHT
        expect(clearTop[2]).toBeGreaterThan(clearTop[0]);
        expect(clearTop[2] - clearTop[0]).toBeGreaterThan(lightTop[2] - lightTop[0]);
    });

    it('OVERCAST collapses the stops close together (a subtle gradient, not a hard fade), day AND night (ac4)', () => {
        for (const illum of [1, 0.12]) {
            const lTop = cloudSkyStop(TOP, 0, illum, CLOUD_COVER.LIGHT);
            const lHor = cloudSkyStop(HORIZON, 1, illum, CLOUD_COVER.LIGHT);
            const oTop = cloudSkyStop(TOP, 0, illum, CLOUD_COVER.OVERCAST);
            const oHor = cloudSkyStop(HORIZON, 1, illum, CLOUD_COVER.OVERCAST);
            const gap = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);
            // far closer together than the LIGHT sky's top↔horizon spread…
            expect(gap(oTop, oHor)).toBeLessThan(0.5 * gap(lTop, lHor));
            // …but NOT identical — a gentle top→horizon falloff (Han: "met subtiele gradient")
            expect(gap(oTop, oHor)).toBeGreaterThan(0);
            expect(lum(oTop)).toBeGreaterThan(lum(oHor));   // top a touch lighter than the horizon
            expect(spread(oTop)).toBe(0);                   // neutral grey, no tint
        }
        // an overcast NIGHT is DARK — much darker than the overcast day (Han UAT r1)
        const day = cloudSkyStop(TOP, 0, 1, CLOUD_COVER.OVERCAST);
        const night = cloudSkyStop(TOP, 0, 0.12, CLOUD_COVER.OVERCAST);
        expect(lum(night)).toBeLessThan(0.5 * lum(day));
        expect(lum(night)).toBeGreaterThan(0);
    });

    it('DARK_OVERCAST is a matte grey — darker than OVERCAST at the same illum (ac3)', () => {
        for (const illum of [1, 0.12]) {
            const over = cloudSkyStop(TOP, 0, illum, CLOUD_COVER.OVERCAST);
            const dark = cloudSkyStop(TOP, 0, illum, CLOUD_COVER.DARK_OVERCAST);
            expect(lum(dark)).toBeLessThan(lum(over));
            expect(spread(dark)).toBe(0);   // grey, not tinted
        }
    });

    it('cloudSheetAt: white → matte grey with a subtle vertical falloff, dark at night', () => {
        const whiteTop = cloudSheetAt(0, 0, 1);
        const whiteHor = cloudSheetAt(1, 0, 1);
        expect(spread(whiteTop)).toBe(0);
        expect(whiteTop[0]).toBeGreaterThan(whiteHor[0]);        // subtle falloff
        expect(whiteHor[0]).toBeGreaterThan(0.85 * whiteTop[0]); // …but SUBTLE
        expect(cloudSheetAt(0, 1, 1)[0]).toBeLessThan(0.6 * whiteTop[0]);   // DARK_OVERCAST = matte grey
        expect(cloudSheetAt(0, 0, 0.12)[0]).toBeLessThan(0.5 * whiteTop[0]); // night is dark
    });

    it('is continuous across the whole axis — no jump-cuts (ac2)', () => {
        for (const illum of [1, 0.33, 0.12]) {
            let prev = cloudSkyStop(TOP, 0, illum, 0);
            for (let t = 0.01; t <= 1.0001; t += 0.01) {
                const cur = cloudSkyStop(TOP, 0, illum, t);
                cur.forEach((v, i) => expect(Math.abs(v - prev[i])).toBeLessThanOrEqual(8));
                prev = cur;
            }
        }
    });
});
