import { describe, it, expect } from 'vitest';
import { mixNight, sunsetFactor, sunsetWeightAt, cloudSkyStop, cloudFlatBase } from '../SkyGradientBackdrop';
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

// §375 "weertypen" (#1192, Han 2026-09-04): the per-stop cloud-cover colour transform. The mottle
// canvas itself is not unit-tested (jsdom has no real 2D canvas) — its noise field is pure arithmetic
// exercised by the same `cloudCoverT` axis these cases cover.
describe('§375 cloudSkyStop', () => {
    // A representative sampled sky: bluish top → near-white horizon (the §372 fallback endpoints).
    const TOP = [143, 208, 217];
    const HORIZON = [223, 243, 245];
    const STOPS = [TOP, HORIZON];
    const BASE = cloudFlatBase(STOPS);
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
                    expect(cloudSkyStop(stop, f, illum, CLOUD_COVER.LIGHT, BASE))
                        .toEqual(legacyStop(stop, f, illum));
                }
            }
        }
    });

    it('CLEAR saturates the sky — more at the top stop than at the horizon (ac6)', () => {
        const lightTop = cloudSkyStop(TOP, 0, 1, CLOUD_COVER.LIGHT, BASE);
        const clearTop = cloudSkyStop(TOP, 0, 1, CLOUD_COVER.CLEAR, BASE);
        const lightHor = cloudSkyStop(HORIZON, 1, 1, CLOUD_COVER.LIGHT, BASE);
        const clearHor = cloudSkyStop(HORIZON, 1, 1, CLOUD_COVER.CLEAR, BASE);

        expect(spread(clearTop)).toBeGreaterThan(spread(lightTop));
        expect(spread(clearHor)).toBeGreaterThan(spread(lightHor));
        // "het blauw blauwer" more than "de witte fade minder wit"
        expect(spread(clearTop) - spread(lightTop)).toBeGreaterThan(spread(clearHor) - spread(lightHor));
        // it stays a SKY: blue is still the dominant channel at the top
        expect(clearTop[2]).toBeGreaterThan(clearTop[0]);
    });

    it('OVERCAST collapses top and horizon onto one flat colour, day AND night (ac4)', () => {
        for (const illum of [1, 0.12]) {
            const lTop = cloudSkyStop(TOP, 0, illum, CLOUD_COVER.LIGHT, BASE);
            const lHor = cloudSkyStop(HORIZON, 1, illum, CLOUD_COVER.LIGHT, BASE);
            const oTop = cloudSkyStop(TOP, 0, illum, CLOUD_COVER.OVERCAST, BASE);
            const oHor = cloudSkyStop(HORIZON, 1, illum, CLOUD_COVER.OVERCAST, BASE);
            const gap = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);
            expect(gap(oTop, oHor)).toBeLessThan(0.1 * gap(lTop, lHor));
            expect(spread(oTop)).toBe(0);   // fully desaturated sheet
        }
        // …and an overcast NIGHT is a DIM flat grey, not day-bright (Han, plan_review Q2)
        const day = cloudSkyStop(TOP, 0, 1, CLOUD_COVER.OVERCAST, BASE);
        const night = cloudSkyStop(TOP, 0, 0.12, CLOUD_COVER.OVERCAST, BASE);
        expect(lum(night)).toBeLessThan(lum(day));
        expect(lum(night)).toBeGreaterThan(0);
    });

    it('DARK_OVERCAST is a mid grey — darker than OVERCAST at the same illum (ac3)', () => {
        for (const illum of [1, 0.12]) {
            const over = cloudSkyStop(TOP, 0, illum, CLOUD_COVER.OVERCAST, BASE);
            const dark = cloudSkyStop(TOP, 0, illum, CLOUD_COVER.DARK_OVERCAST, BASE);
            expect(lum(dark)).toBeLessThan(lum(over));
            expect(spread(dark)).toBe(0);   // grey, not tinted
        }
    });

    it('is continuous across the whole axis — no jump-cuts (ac2)', () => {
        for (const illum of [1, 0.33, 0.12]) {
            let prev = cloudSkyStop(TOP, 0, illum, 0, BASE);
            for (let t = 0.01; t <= 1.0001; t += 0.01) {
                const cur = cloudSkyStop(TOP, 0, illum, t, BASE);
                cur.forEach((v, i) => expect(Math.abs(v - prev[i])).toBeLessThanOrEqual(8));
                prev = cur;
            }
        }
    });
});
