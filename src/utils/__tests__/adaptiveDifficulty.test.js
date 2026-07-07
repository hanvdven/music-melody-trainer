import { describe, it, expect } from 'vitest';
import {
    stepTarget, stepAdaptiveTargets, CHALLENGE_BAND, STEP_UP_FRAC, STEP_DOWN_FRAC,
} from '../adaptiveDifficulty';

const range = { min: 0, max: 10 };

describe('adaptive difficulty (#144)', () => {
    it('steps UP after an easy round (outcome above the band)', () => {
        expect(stepTarget(5, 1.0, range)).toBeCloseTo(5 + 10 * STEP_UP_FRAC);
    });

    it('steps DOWN faster after a hard round (outcome below the band)', () => {
        expect(stepTarget(5, 0.2, range)).toBeCloseTo(5 - 10 * STEP_DOWN_FRAC);
        expect(STEP_DOWN_FRAC).toBeGreaterThan(STEP_UP_FRAC);
    });

    it('holds inside the challenge zone', () => {
        const mid = (CHALLENGE_BAND.low + CHALLENGE_BAND.high) / 2;
        expect(stepTarget(5, mid, range)).toBe(5);
    });

    it('clamps to the range and seeds a null target from the actual difficulty', () => {
        expect(stepTarget(9.9, 1.0, range)).toBe(10);
        expect(stepTarget(0.1, 0.0, range)).toBe(0);
        // null target: seeded from the current actual, then stepped.
        expect(stepTarget(null, 1.0, range, 4)).toBeCloseTo(4 + 10 * STEP_UP_FRAC);
        // seed clamped into the range
        expect(stepTarget(null, 0.9, range, 42)).toBe(10);
    });

    it('null outcome changes nothing', () => {
        expect(stepTarget(5, null, range)).toBe(5);
    });

    it('steps all three dimensions and returns a new object', () => {
        const targets = { harmonic: 3, treble: 5, bass: null };
        const ranges = { harmonic: range, treble: range, bass: range };
        const seeds = { harmonic: 3, treble: 5, bass: 2 };
        const next = stepAdaptiveTargets({ outcome: 1.0, targets, ranges, seeds });
        expect(next).not.toBe(targets);
        expect(next.harmonic).toBeGreaterThan(3);
        expect(next.treble).toBeGreaterThan(5);
        expect(next.bass).toBeGreaterThan(2); // seeded then stepped
    });
});
