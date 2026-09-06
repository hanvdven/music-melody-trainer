import { describe, it, expect } from 'vitest';
import {
    windLevelMult, bedFraction, sweepState, rustleLevels, thirdWorldSpan, thirdHasFoliage,
    WIND_SWEEP_PERIOD_SEC, WIND_SWEEP_STEP_SEC, WIND_BASE_LEVEL, WIND_THIRD_PANS, WIND_MASTER_GAIN,
} from '../windRustle';
import { CHUNK_PX } from '../spatialPan';

describe('windLevelMult / bedFraction', () => {
    it('maps wind level 0-3 the way Han specified', () => {
        expect(windLevelMult(3)).toBe(1);       // "zelfde geluid als nu"
        expect(windLevelMult(2)).toBe(0.5);     // half
        expect(windLevelMult(1)).toBe(0);       // "zachte wind: geen geritsel"
        expect(windLevelMult(0)).toBe(0);
        expect(bedFraction(3)).toBe(0.5);       // half volume
        expect(bedFraction(2)).toBe(0.25);      // kwart volume
        expect(bedFraction(1)).toBe(0);
        expect(bedFraction(0)).toBe(0);
    });

    it('WIND_THIRD_PANS is left / centre / right at ±0.5', () => {
        expect(WIND_THIRD_PANS).toEqual([-0.5, 0, 0.5]);
    });

    it('WIND_MASTER_GAIN trims all wind by 50% (Han 2026-09-01 follow-up)', () => {
        expect(WIND_MASTER_GAIN).toBe(0.5);
    });
});

const STEP = WIND_SWEEP_STEP_SEC;

describe('sweepState — the left→right gust', () => {
    it('dwells on each third for WIND_SWEEP_STEP_SEC and loops every WIND_SWEEP_PERIOD_SEC', () => {
        expect(WIND_SWEEP_PERIOD_SEC).toBe(STEP * 3);
        expect(sweepState(0).activeThird).toBe(0);
        expect(sweepState(STEP - 0.1).activeThird).toBe(0);
        expect(sweepState(STEP).activeThird).toBe(1);
        expect(sweepState(STEP * 2).activeThird).toBe(2);
        expect(sweepState(STEP * 3 - 0.1).activeThird).toBe(2);
        expect(sweepState(WIND_SWEEP_PERIOD_SEC).activeThird).toBe(0);              // wrapped
        expect(sweepState(WIND_SWEEP_PERIOD_SEC * 3 + STEP).activeThird).toBe(1);   // many loops later
    });

    it('swell is 0 at a window edge, 1 at its middle, and never leaves [0,1]', () => {
        expect(sweepState(0).swell).toBeCloseTo(0, 6);
        expect(sweepState(STEP / 2).swell).toBeCloseTo(1, 6);
        expect(sweepState(STEP).swell).toBeCloseTo(0, 6);
        expect(sweepState(STEP + STEP / 2).swell).toBeCloseTo(1, 6);
        for (let t = 0; t < WIND_SWEEP_PERIOD_SEC * 2; t += 0.13) {
            const s = sweepState(t).swell;
            expect(s).toBeGreaterThanOrEqual(0);
            expect(s).toBeLessThanOrEqual(1 + 1e-9);
        }
    });

    it('handles negative time (clock never goes back, but be safe)', () => {
        expect(sweepState(-1).activeThird).toBeGreaterThanOrEqual(0);
        expect(sweepState(-1).activeThird).toBeLessThanOrEqual(2);
    });
});

// t at the peak swell of third 1 (mid): one full STEP in, then half a STEP.
const MID_PEAK_T = STEP + STEP / 2;

describe('rustleLevels', () => {
    it('is all-zero below wind 2 regardless of foliage', () => {
        expect(rustleLevels(1, [true, true, true], MID_PEAK_T)).toEqual([0, 0, 0]);
        expect(rustleLevels(0, [true, true, true], MID_PEAK_T)).toEqual([0, 0, 0]);
    });

    it('a third with no foliage stays silent even under the gust', () => {
        const levels = rustleLevels(3, [false, false, false], MID_PEAK_T);
        expect(levels).toEqual([0, 0, 0]);
        const one = rustleLevels(3, [false, true, false], MID_PEAK_T);
        expect(one[0]).toBe(0);
        expect(one[2]).toBe(0);
        expect(one[1]).toBeGreaterThan(0);
    });

    it('the active third swells above the base; the others sit at the base', () => {
        // just after the window edge → third 1 active but swell ~0 → all three near base
        const early = rustleLevels(3, [true, true, true], STEP + 0.001);
        expect(early[0]).toBeCloseTo(WIND_BASE_LEVEL, 2);
        expect(early[1]).toBeCloseTo(WIND_BASE_LEVEL, 2);

        // peak swell of third 1 → third 1 == 1.0 (full), others == base
        const peak = rustleLevels(3, [true, true, true], MID_PEAK_T);
        expect(peak[1]).toBeCloseTo(1, 6);
        expect(peak[0]).toBeCloseTo(WIND_BASE_LEVEL, 6);
        expect(peak[2]).toBeCloseTo(WIND_BASE_LEVEL, 6);
    });

    it('wind 2 halves every level', () => {
        const w3 = rustleLevels(3, [true, true, true], MID_PEAK_T);
        const w2 = rustleLevels(2, [true, true, true], MID_PEAK_T);
        for (let k = 0; k < 3; k++) expect(w2[k]).toBeCloseTo(w3[k] / 2, 6);
    });
});

describe('thirdWorldSpan / thirdHasFoliage', () => {
    it('splits the viewport into three contiguous equal thirds centred on the camera', () => {
        const [l0] = thirdWorldSpan(1000, 900, 0);
        const [, r2] = thirdWorldSpan(1000, 900, 2);
        expect(l0).toBe(1000 - 450);           // left edge of the viewport
        expect(r2).toBe(1000 + 450);           // right edge
        const [, r0] = thirdWorldSpan(1000, 900, 0);
        const [l1] = thirdWorldSpan(1000, 900, 1);
        expect(r0).toBeCloseTo(l1, 6);         // no gap between thirds
    });

    it('reports foliage only for the thirds that overlap a foliage chunk', () => {
        // camera at 0, viewport 3*CHUNK_PX wide → left third covers chunk -2..-1, mid -1..0(≈), right 0..1
        const vw = CHUNK_PX * 3;
        const set = new Set([1]);   // only the world-chunk starting at +CHUNK_PX
        expect(thirdHasFoliage(set, 0, vw, 0)).toBe(false);
        expect(thirdHasFoliage(set, 0, vw, 2)).toBe(true);   // right third reaches +1.5*CHUNK_PX
    });

    it('is false for an empty/absent set or a zero viewport', () => {
        expect(thirdHasFoliage(null, 0, 900, 0)).toBe(false);
        expect(thirdHasFoliage(new Set(), 0, 900, 0)).toBe(false);
        expect(thirdHasFoliage(new Set([0]), 0, 0, 0)).toBe(false);
    });
});
