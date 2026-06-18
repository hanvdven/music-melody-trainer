import { describe, it, expect } from 'vitest';
import { computeRepeatPass } from '../repeatNumbering.js';

describe('computeRepeatPass (Fix #3 repeat-pass suffix)', () => {
    it('is 1 when not playing (no suffix when stopped)', () => {
        expect(computeRepeatPass({ startMeasureIndex: 40, blockPlayStart: 0, passSpan: 8, isPlaying: false })).toBe(1);
    });

    it('counts passes from the block start (blockPlayStart) over the looped unit (passSpan)', () => {
        // HBD merged body = 8 bars. Within ONE repeat block startMeasureIndex advances 0, 8, 16, 24, 32
        // while blockPlayStart stays at the block start (0). Pass = 1, 2, 3, 4, 5.
        const span = 8, bps = 0;
        expect(computeRepeatPass({ startMeasureIndex: 0,  blockPlayStart: bps, passSpan: span, isPlaying: true })).toBe(1);
        expect(computeRepeatPass({ startMeasureIndex: 8,  blockPlayStart: bps, passSpan: span, isPlaying: true })).toBe(2);
        expect(computeRepeatPass({ startMeasureIndex: 16, blockPlayStart: bps, passSpan: span, isPlaying: true })).toBe(3);
        expect(computeRepeatPass({ startMeasureIndex: 32, blockPlayStart: bps, passSpan: span, isPlaying: true })).toBe(5);
    });

    it('CYCLES 1..repsPerMelody when blockPlayStart is refreshed per repeat block (the Fix #3 bookkeeping)', () => {
        // repsPerMelody = 5, body = 8. After 5 passes the block re-arms and blockPlayStart jumps to the
        // new block start (40). With the refresh, (startMeasureIndex - blockPlayStart) resets → pass 1
        // again, NOT pass 6. THIS is the bug Han saw ("11" instead of "1.x"): without the refresh
        // blockPlayStart stayed 0 and the pass overflowed.
        const span = 8;
        // block 2 starts at global index 40 (5 passes × 8 bars).
        expect(computeRepeatPass({ startMeasureIndex: 40, blockPlayStart: 40, passSpan: span, isPlaying: true })).toBe(1);
        expect(computeRepeatPass({ startMeasureIndex: 48, blockPlayStart: 40, passSpan: span, isPlaying: true })).toBe(2);
        expect(computeRepeatPass({ startMeasureIndex: 72, blockPlayStart: 40, passSpan: span, isPlaying: true })).toBe(5);
        // block 3 (starts at 80) → cycles back to 1 again.
        expect(computeRepeatPass({ startMeasureIndex: 80, blockPlayStart: 80, passSpan: span, isPlaying: true })).toBe(1);
    });

    it('OVERFLOWS (the pre-fix bug) when blockPlayStart is stranded at 0', () => {
        // Documents the corruption: with blockPlayStart never refreshed, pass 11 appears where the
        // cycling fix would show pass 1 (third block, first pass). Confirms the formula itself is fine —
        // the bug was purely the stranded counter, which Fix #3 refreshes.
        expect(computeRepeatPass({ startMeasureIndex: 80, blockPlayStart: 0, passSpan: 8, isPlaying: true })).toBe(11);
    });

    it('grows monotonically when blockPlayStart is held fixed (pure-formula property)', () => {
        // FORMULA property: if a block never re-arms (blockPlayStart fixed at the session start) the
        // pass number climbs 1, 2, 3, …. NOTE: in the live planner repsPerMelody=-1 resolves to 1 so
        // the block DOES re-arm every pass (R pins at 1); true indefinite-growth is deferred (§40b).
        // This test pins the formula's behaviour given stable counters, not the live -1 wiring.
        const span = 8, bps = 0;
        expect(computeRepeatPass({ startMeasureIndex: 24, blockPlayStart: bps, passSpan: span, isPlaying: true })).toBe(4);
        expect(computeRepeatPass({ startMeasureIndex: 800, blockPlayStart: bps, passSpan: span, isPlaying: true })).toBe(101);
    });

    it('falls back to 1 for invalid passSpan', () => {
        expect(computeRepeatPass({ startMeasureIndex: 40, blockPlayStart: 0, passSpan: 0, isPlaying: true })).toBe(1);
    });
});
