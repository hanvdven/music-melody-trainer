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

    it('grows UNBOUNDED when blockPlayStart is PINNED to a stable origin (INDEFINITE repeat, Han 2026-06-18)', () => {
        // INDEFINITE repeat (repsPerMelody === -1): Sequencer._armPaginationSequence PINS blockPlayStart
        // to the session's first body play-start (the origin) and never refreshes it, so the suffix
        // climbs without bound — maat 1 on pass 7 = "1.7", pass 23 = "1.23", pass 1000 = "1.1000". No
        // cap, no reset. This is the live indefinite wiring (the arm site stops refreshing the origin),
        // not just a pure-formula curiosity. span=8 (HBD merged body); origin pinned at 0.
        const span = 8, origin = 0;
        // pass index k → startMeasureIndex = k*span; computeRepeatPass returns k+1 (1-based).
        expect(computeRepeatPass({ startMeasureIndex: 6 * span,   blockPlayStart: origin, passSpan: span, isPlaying: true })).toBe(7);    // "1.7"
        expect(computeRepeatPass({ startMeasureIndex: 22 * span,  blockPlayStart: origin, passSpan: span, isPlaying: true })).toBe(23);   // "1.23"
        expect(computeRepeatPass({ startMeasureIndex: 997 * span, blockPlayStart: origin, passSpan: span, isPlaying: true })).toBe(998);  // "1.998"
        expect(computeRepeatPass({ startMeasureIndex: 999 * span, blockPlayStart: origin, passSpan: span, isPlaying: true })).toBe(1000); // "1.1000"
        // Climbs strictly monotonically across consecutive passes — never wraps/caps.
        let prev = 0;
        for (let k = 0; k < 1200; k++) {
            const r = computeRepeatPass({ startMeasureIndex: k * span, blockPlayStart: origin, passSpan: span, isPlaying: true });
            expect(r).toBe(k + 1);
            expect(r).toBeGreaterThan(prev);
            prev = r;
        }
    });

    it('still CYCLES 1..N when blockPlayStart is refreshed per block (FINITE — must not regress)', () => {
        // FINITE repsPerMelody must keep cycling: the arm site still refreshes blockPlayStart to each
        // block start, so within every block the pass resets to 1. Guards against the indefinite fix
        // accidentally pinning the origin for finite repeats too. N=5, span=8.
        const span = 8;
        // block 1 (origin 0): passes 1..5
        expect(computeRepeatPass({ startMeasureIndex: 0,  blockPlayStart: 0,  passSpan: span, isPlaying: true })).toBe(1);
        expect(computeRepeatPass({ startMeasureIndex: 32, blockPlayStart: 0,  passSpan: span, isPlaying: true })).toBe(5);
        // block 2 (origin refreshed to 40): cycles back to 1, NOT 6
        expect(computeRepeatPass({ startMeasureIndex: 40, blockPlayStart: 40, passSpan: span, isPlaying: true })).toBe(1);
        expect(computeRepeatPass({ startMeasureIndex: 72, blockPlayStart: 40, passSpan: span, isPlaying: true })).toBe(5);
    });

    it('falls back to 1 for invalid passSpan', () => {
        expect(computeRepeatPass({ startMeasureIndex: 40, blockPlayStart: 0, passSpan: 0, isPlaying: true })).toBe(1);
    });
});
