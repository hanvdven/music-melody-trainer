import { describe, it, expect, vi, afterEach } from 'vitest';
import { humanizePercussionSample, MULDJORD_HIHAT_CLOSED_KEYS } from '../drumKits';

// #1091 round 3 (Han 2026-08-19, "add 'humanization': you may randomly take a sample from within 30
// velocity; and very gently quieten/louden it... it should offset the velocity humanization").
describe('humanizePercussionSample (#1091)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('picks the exact matching sample and gainMultiplier 1 when Math.random rolls no offset', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5); // (0.5*2-1)=0 offset
        const samples = Array.from({ length: 11 }, (_, i) => `s${i}`); // 0..127 in steps of 12.7
        const { sample, gainMultiplier } = humanizePercussionSample(samples, 63.5); // exact midpoint
        expect(sample).toBe('s5');
        expect(gainMultiplier).toBeCloseTo(1);
    });

    it('picks a louder sample and compensates with a QUIETER gain when the offset is positive', () => {
        vi.spyOn(Math, 'random').mockReturnValue(1); // (1*2-1)=+1 -> max +15 offset
        const samples = Array.from({ length: 11 }, (_, i) => `s${i}`);
        const { sample, gainMultiplier } = humanizePercussionSample(samples, 63.5);
        // searchVelocity = 63.5+15 = 78.5 -> index round(78.5/127*10) = round(6.18) = 6, louder than s5
        expect(sample).toBe('s6');
        expect(gainMultiplier).toBeLessThan(1);
        expect(gainMultiplier).toBeCloseTo(1 - 0.08, 5); // max offset -> full -8%
    });

    it('picks a softer sample and compensates with a LOUDER gain when the offset is negative', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0); // (0*2-1)=-1 -> min -15 offset
        const samples = Array.from({ length: 11 }, (_, i) => `s${i}`);
        const { sample, gainMultiplier } = humanizePercussionSample(samples, 63.5);
        expect(sample).toBe('s4');
        expect(gainMultiplier).toBeGreaterThan(1);
        expect(gainMultiplier).toBeCloseTo(1 + 0.08, 5);
    });

    it('clamps the search velocity to [0,127] at the extremes instead of going out of range', () => {
        vi.spyOn(Math, 'random').mockReturnValue(1);
        const samples = ['low', 'high'];
        const { sample } = humanizePercussionSample(samples, 127); // 127+15 clamps to 127
        expect(sample).toBe('high');
    });

    it('falls back to a plain uniform pick (gainMultiplier 1) when velocity is not provided', () => {
        const samples = ['a', 'b', 'c'];
        const { sample, gainMultiplier } = humanizePercussionSample(samples, null);
        expect(samples).toContain(sample);
        expect(gainMultiplier).toBe(1);
    });

    it('handles a single-sample array deterministically', () => {
        const { sample, gainMultiplier } = humanizePercussionSample(['only'], 90);
        expect(sample).toBe('only');
        expect(gainMultiplier).toBe(1);
    });

    it('MULDJORD_HIHAT_CLOSED_KEYS has all 29 samples, low-to-high velocity order', () => {
        expect(MULDJORD_HIHAT_CLOSED_KEYS).toHaveLength(29);
        expect(MULDJORD_HIHAT_CLOSED_KEYS[0]).toBe('HihatClosedMuldjord_1');
        expect(MULDJORD_HIHAT_CLOSED_KEYS[28]).toBe('HihatClosedMuldjord_29');
    });
});
