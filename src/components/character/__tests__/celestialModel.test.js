import { describe, it, expect } from 'vitest';
import {
    LAT_DEG, HALF_FOV_AZ_DEG, STAR_PALETTE,
    DUSK_ANCHOR_T, DAWN_ANCHOR_T,
    solarHourAngleDeg, localSiderealDeg, altAz, degPerPx, projectToScreen,
    sunPosition, moonPosition, illuminatedFraction, brightLimbUnitVector,
    moonShine, MOON_SHINE_ALT_FADE_DEG,
    starOpacity, starSizeGpx, starColor, everVisibleFromSouth,
} from '../celestialModel';
import { BRIGHT_STARS } from '../data/brightStars';
import { CONSTELLATIONS } from '../data/constellationLines';

// §374 (#1191). Noon solar altitude at the equinox from Brussels: 90 − φ, with dec = 0.
const NOON_ALT = 90 - LAT_DEG;   // 39.15°
const MID_DAY_T = 0.25;
const MID_NIGHT_T = 0.75;

describe('altAz — the equatorial → horizontal transform', () => {
    it('places a dec-0 body at the four cardinal hour angles', () => {
        // lst === ra ⇒ H = 0 ⇒ transit due south at the equinox noon altitude.
        expect(altAz(0, 0, 0).altDeg).toBeCloseTo(NOON_ALT, 9);
        expect(altAz(0, 0, 0).azSouthDeg).toBeCloseTo(0, 9);

        // H = +90 ⇒ setting, due WEST (positive azSouth = screen-right).
        expect(altAz(0, 0, 90).altDeg).toBeCloseTo(0, 9);
        expect(altAz(0, 0, 90).azSouthDeg).toBeCloseTo(90, 9);

        // H = −90 ⇒ rising, due EAST (negative azSouth = screen-left).
        expect(altAz(0, 0, -90).altDeg).toBeCloseTo(0, 9);
        expect(altAz(0, 0, -90).azSouthDeg).toBeCloseTo(-90, 9);

        // H = 180 ⇒ anti-transit, as far below the horizon as noon is above it.
        expect(altAz(0, 0, 180).altDeg).toBeCloseTo(-NOON_ALT, 9);
    });

    it('transits Sirius at 90 − φ + δ and keeps Polaris circumpolar and out of the southern frame', () => {
        const sirius = { ra: 6.7525, dec: -16.7161 };
        const transit = altAz(sirius.ra, sirius.dec, sirius.ra * 15);
        expect(transit.altDeg).toBeCloseTo(90 - LAT_DEG + sirius.dec, 3);
        expect(transit.azSouthDeg).toBeCloseTo(0, 6);

        // Polaris: never sets (min alt = φ − (90 − δ)) and never enters the ±60° southern window —
        // the atan2 azimuth form is used precisely because tan(δ) blows up this close to the pole.
        const polaris = { ra: 2.5303, dec: 89.2641 };
        for (let lst = 0; lst < 360; lst += 3) {
            const p = altAz(polaris.ra, polaris.dec, lst);
            expect(p.altDeg).toBeGreaterThan(LAT_DEG - (90 - polaris.dec) - 0.01);
            expect(Math.abs(p.azSouthDeg)).toBeGreaterThan(HALF_FOV_AZ_DEG);
        }
        expect(everVisibleFromSouth(polaris.ra, polaris.dec)).toBe(false);
    });
});

describe('solarHourAngleDeg — the two-segment sun arc', () => {
    it('hits 0 / 90 / 180 / 270 at mid-day, mid-dusk, mid-night and mid-dawn', () => {
        expect(DUSK_ANCHOR_T).toBeCloseTo(0.5625, 9);
        expect(DAWN_ANCHOR_T).toBeCloseTo(0.9375, 9);
        expect(solarHourAngleDeg(MID_DAY_T)).toBeCloseTo(0, 9);
        expect(solarHourAngleDeg(DUSK_ANCHOR_T)).toBeCloseTo(90, 9);
        expect(solarHourAngleDeg(MID_NIGHT_T)).toBeCloseTo(180, 9);
        expect(solarHourAngleDeg(DAWN_ANCHOR_T)).toBeCloseTo(270, 9);
    });

    it('advances monotonically across a whole cycle, wrapping exactly once', () => {
        // The hour angle is only meaningful mod 360, so "monotone" means strictly increasing with a
        // single 360→0 wrap — the same shape weatherCycle's own `cycleT` sweep test asserts.
        let wraps = 0;
        let prev = solarHourAngleDeg(0);
        for (let i = 1; i < 1000; i++) {
            const cur = solarHourAngleDeg(i / 1000);
            if (cur < prev) wraps += 1;
            else expect(cur).toBeGreaterThan(prev);
            prev = cur;
        }
        expect(wraps).toBe(1);
    });
});

describe('sunPosition', () => {
    it('is exactly on the horizon at the dusk/dawn anchors, highest at mid-day, lowest at mid-night', () => {
        expect(Math.abs(sunPosition(DUSK_ANCHOR_T, 0).altDeg)).toBeLessThan(1e-9);
        expect(Math.abs(sunPosition(DAWN_ANCHOR_T, 0).altDeg)).toBeLessThan(1e-9);
        expect(sunPosition(MID_DAY_T, 0).altDeg).toBeCloseTo(NOON_ALT, 9);
        expect(sunPosition(MID_NIGHT_T, 0).altDeg).toBeCloseTo(-NOON_ALT, 9);
    });

    it('is above the horizon exactly on (dawn anchor, 1) ∪ [0, dusk anchor)', () => {
        for (let i = 0; i < 400; i++) {
            const t = i / 400;
            const up = t > DAWN_ANCHOR_T || t < DUSK_ANCHOR_T;
            // 1e-9, not 0: a sample landing exactly ON an anchor comes back as float noise around
            // zero (cos of 270° in radians is ~1e-16, not 0), which is "on the horizon", not "up".
            expect(sunPosition(t, 0.37).altDeg > 1e-9).toBe(up);
        }
    });

    it('keeps the same arc regardless of lunation phase (the sun rides the celestial equator)', () => {
        // RA_sun drifts with the compressed year, but LST drifts with it by construction — so the
        // sun's own alt/az depends on cycleT ALONE. This is what makes the star drift free.
        for (const lp of [0, 0.13, 0.5, 0.99]) {
            expect(sunPosition(0.3, lp).altDeg).toBeCloseTo(sunPosition(0.3, 0).altDeg, 9);
            expect(sunPosition(0.3, lp).azSouthDeg).toBeCloseTo(sunPosition(0.3, 0).azSouthDeg, 9);
        }
    });
});

describe('moonPosition — the 28-cycle lunation', () => {
    it('NEW moon rides with the sun by day and is below the horizon all night', () => {
        expect(moonPosition(MID_DAY_T, 0).altDeg).toBeCloseTo(sunPosition(MID_DAY_T, 0).altDeg, 9);
        expect(moonPosition(MID_NIGHT_T, 0).belowHorizon).toBe(true);
        expect(moonPosition(MID_NIGHT_T, 0).illumFraction).toBeCloseTo(0, 9);
    });

    it('FULL moon is up the whole night and down by day', () => {
        for (let i = 1; i < 40; i++) {
            const t = DUSK_ANCHOR_T + (DAWN_ANCHOR_T - DUSK_ANCHOR_T) * (i / 40);
            expect(moonPosition(t, 0.5).altDeg).toBeGreaterThan(0);
        }
        expect(moonPosition(MID_NIGHT_T, 0.5).altDeg).toBeCloseTo(NOON_ALT, 9);
        expect(moonPosition(MID_DAY_T, 0.5).altDeg).toBeLessThan(0);
        expect(moonPosition(MID_NIGHT_T, 0.5).illumFraction).toBeCloseTo(1, 9);
    });

    it('FIRST QUARTER transits due south at DUSK — this pins the elongation SIGN', () => {
        // H_moon = H_sun − 360·lunationPhase (the moon moves EASTWARD as the lunation waxes, and
        // H = LST − RA). With the opposite sign every quarter moon lands on the wrong side of the
        // sky and this test transits at DAWN instead. Do not weaken it.
        const m = moonPosition(DUSK_ANCHOR_T, 0.25);
        expect(m.azSouthDeg).toBeCloseTo(0, 6);
        expect(m.altDeg).toBeCloseTo(NOON_ALT, 6);
        expect(m.illumFraction).toBeCloseTo(0.5, 9);

        // …and at the dawn anchor the first-quarter moon has long set.
        expect(moonPosition(DAWN_ANCHOR_T, 0.25).belowHorizon).toBe(true);
    });

    it('LAST QUARTER rises around midnight', () => {
        expect(moonPosition(MID_NIGHT_T, 0.75).altDeg).toBeCloseTo(0, 6);
        expect(moonPosition(DAWN_ANCHOR_T, 0.75).altDeg).toBeCloseTo(NOON_ALT, 6);
    });

    it('illuminatedFraction runs 0 → 0.5 → 1 → 0.5 → 0 over the lunation', () => {
        expect(illuminatedFraction(0)).toBeCloseTo(0, 12);
        expect(illuminatedFraction(0.25)).toBeCloseTo(0.5, 12);
        expect(illuminatedFraction(0.5)).toBeCloseTo(1, 12);
        expect(illuminatedFraction(0.75)).toBeCloseTo(0.5, 12);
        expect(illuminatedFraction(1)).toBeCloseTo(0, 12);
        for (let i = 1; i <= 50; i++) {
            expect(illuminatedFraction(i / 100)).toBeGreaterThan(illuminatedFraction((i - 1) / 100));
        }
    });

    // §374 UAT r2 (#1191): the scalar that gates §370's moonlight on the REAL moon.
    it('moonShine is 0 whenever the moon is below the horizon', () => {
        expect(moonShine(moonPosition(MID_NIGHT_T, 0))).toBe(0);        // new moon: down all night
        expect(moonShine(moonPosition(MID_DAY_T, 0.5))).toBe(0);        // full moon: down all day
        expect(moonShine(moonPosition(DAWN_ANCHOR_T, 0.25))).toBe(0);   // first quarter has set by dawn
    });

    it('moonShine tracks the lit fraction for a moon that is well up', () => {
        // Full moon transiting due south at midnight — high altitude, so altFade is saturated.
        const full = moonShine(moonPosition(MID_NIGHT_T, 0.5));
        expect(full).toBeCloseTo(1, 6);
        // A gibbous moon (lunationPhase 0.4) up at the same time: dimmer than full, still positive.
        const gibbous = moonShine(moonPosition(MID_NIGHT_T, 0.4));
        expect(gibbous).toBeGreaterThan(0);
        expect(gibbous).toBeLessThan(full);
    });

    it('moonShine fades in over the first MOON_SHINE_ALT_FADE_DEG of altitude', () => {
        // Construct two "up" moon states at the same phase but different altitude by sampling near
        // the full-moon rise (just after dusk) vs its transit.
        const rising = moonPosition(DUSK_ANCHOR_T + 0.01, 0.5);   // low
        const high = moonPosition(MID_NIGHT_T, 0.5);              // ~zenith-ish
        expect(rising.altDeg).toBeLessThan(MOON_SHINE_ALT_FADE_DEG);
        expect(moonShine(rising)).toBeLessThan(moonShine(high));
        expect(moonShine(rising)).toBeGreaterThanOrEqual(0);
    });
});

describe('brightLimbUnitVector', () => {
    it('points the first-quarter crescent WEST, toward the setting sun (screen-right)', () => {
        const geom = { Wpx: 400, horizonY: 200 };
        const moon = moonPosition(DUSK_ANCHOR_T, 0.25);
        const sun = sunPosition(DUSK_ANCHOR_T, 0.25);
        const { sx } = brightLimbUnitVector(
            projectToScreen(moon.altDeg, moon.azSouthDeg, geom),
            projectToScreen(sun.altDeg, sun.azSouthDeg, geom),
        );
        expect(sx).toBeGreaterThan(0);
    });

    it('returns a unit vector, and a safe default at exact conjunction', () => {
        const v = brightLimbUnitVector({ x: 10, y: 10 }, { x: 13, y: 14 });
        expect(Math.hypot(v.sx, v.sy)).toBeCloseTo(1, 12);
        expect(brightLimbUnitVector({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ sx: 1, sy: 0 });
    });
});

describe('projectToScreen — isotropic cylindrical projection', () => {
    const geom = { Wpx: 427, horizonY: 176 };

    it('centres due south, puts altitude 0 on the horizon line and higher altitudes further up', () => {
        expect(projectToScreen(0, 0, geom).x).toBeCloseTo(geom.Wpx / 2, 12);
        expect(projectToScreen(0, 0, geom).y).toBeCloseTo(geom.horizonY, 12);
        expect(projectToScreen(30, 0, geom).y).toBeLessThan(geom.horizonY);
        expect(projectToScreen(10, 20, geom).x).toBeGreaterThan(geom.Wpx / 2);
        expect(projectToScreen(10, -20, geom).x).toBeLessThan(geom.Wpx / 2);
    });

    it('uses ONE deg-per-pixel on both axes, so figures are never stretched by the aspect ratio', () => {
        for (const Wpx of [200, 427, 960]) {
            const dpp = degPerPx(Wpx);
            const a = projectToScreen(0, 10, { Wpx, horizonY: 100 });
            const b = projectToScreen(10, 0, { Wpx, horizonY: 100 });
            expect(a.x - Wpx / 2).toBeCloseTo(10 / dpp, 9);
            expect(100 - b.y).toBeCloseTo(10 / dpp, 9);
        }
    });

    it('culls below the horizon and outside the azimuth window', () => {
        expect(projectToScreen(5, 0, geom).visible).toBe(true);
        expect(projectToScreen(-1, 0, geom).visible).toBe(false);
        expect(projectToScreen(5, 70, geom).visible).toBe(false);
        expect(projectToScreen(5, -70, geom).visible).toBe(false);
    });
});

describe('starOpacity — the shared globalIllumination knob', () => {
    it('is full at the night floor, subtle at dusk/dawn and gone in daylight', () => {
        expect(starOpacity(0.05)).toBeCloseTo(1, 9);
        expect(starOpacity(1)).toBeCloseTo(0, 9);
        const duskDawn = starOpacity(0.33);
        expect(duskDawn).toBeGreaterThan(0.15);
        expect(duskDawn).toBeLessThan(0.35);
    });

    it('never increases as the world brightens', () => {
        let prev = starOpacity(0);
        for (let i = 1; i <= 200; i++) {
            const cur = starOpacity(i / 200);
            expect(cur).toBeLessThanOrEqual(prev + 1e-12);
            prev = cur;
        }
    });
});

describe('star size / colour buckets', () => {
    it('buckets magnitude at exactly 1.5 and 3.0', () => {
        expect(starSizeGpx(-1.46)).toBe(3);
        expect(starSizeGpx(1.49)).toBe(3);
        expect(starSizeGpx(1.5)).toBe(2);
        expect(starSizeGpx(2.99)).toBe(2);
        expect(starSizeGpx(3.0)).toBe(1);
        expect(starSizeGpx(4.5)).toBe(1);
    });

    it('buckets B−V at the palette edges', () => {
        expect(starColor(-0.06)).toBe(STAR_PALETTE[0].color);
        expect(starColor(-0.05)).toBe(STAR_PALETTE[1].color);
        expect(starColor(0.29)).toBe(STAR_PALETTE[1].color);
        expect(starColor(0.30)).toBe(STAR_PALETTE[2].color);
        expect(starColor(0.59)).toBe(STAR_PALETTE[2].color);
        expect(starColor(0.60)).toBe(STAR_PALETTE[3].color);
        expect(starColor(0.99)).toBe(STAR_PALETTE[3].color);
        expect(starColor(1.00)).toBe(STAR_PALETTE[4].color);
        expect(starColor(1.85)).toBe(STAR_PALETTE[4].color);   // Betelgeuse
    });
});

describe('purity', () => {
    it('gives identical results for identical arguments and carries no module state', () => {
        const first = { sun: sunPosition(0.42, 0.17), moon: moonPosition(0.42, 0.17), lst: localSiderealDeg(0.42, 0.17) };
        for (let i = 0; i < 5; i++) sunPosition(Math.random(), Math.random());
        expect({ sun: sunPosition(0.42, 0.17), moon: moonPosition(0.42, 0.17), lst: localSiderealDeg(0.42, 0.17) }).toEqual(first);
    });
});

describe('generated star data', () => {
    it('is well-formed', () => {
        expect(BRIGHT_STARS.length).toBeGreaterThan(400);
        for (const s of BRIGHT_STARS) {
            expect(Number.isInteger(s.hr)).toBe(true);
            expect(s.ra).toBeGreaterThanOrEqual(0);
            expect(s.ra).toBeLessThan(24);
            expect(Math.abs(s.dec)).toBeLessThanOrEqual(90);
            expect(Number.isFinite(s.mag)).toBe(true);
            expect(Number.isFinite(s.bv)).toBe(true);
        }
        expect(new Set(BRIGHT_STARS.map((s) => s.hr)).size).toBe(BRIGHT_STARS.length);
    });

    it('resolves every constellation segment to a shipped star, and every figure is reachable', () => {
        const byHr = new Map(BRIGHT_STARS.map((s) => [s.hr, s]));
        expect(CONSTELLATIONS.length).toBeGreaterThan(25);
        for (const c of CONSTELLATIONS) {
            expect(c.segments.length).toBeGreaterThan(0);
            for (const [a, b] of c.segments) {
                expect(byHr.has(a)).toBe(true);
                expect(byHr.has(b)).toBe(true);
            }
            const stars = [...new Set(c.segments.flat())].map((hr) => byHr.get(hr));
            expect(stars.some((s) => everVisibleFromSouth(s.ra, s.dec))).toBe(true);
        }
    });
});
