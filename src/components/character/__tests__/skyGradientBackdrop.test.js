import { describe, it, expect } from 'vitest';
import { mixNight, sunsetFactor } from '../SkyGradientBackdrop';

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
