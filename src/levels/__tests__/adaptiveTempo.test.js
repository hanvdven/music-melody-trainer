import { describe, it, expect } from 'vitest';
import { baselineAdaptiveBpm, evaluateAdaptiveBpm, commitIndexFor, lcmOf, ADAPTIVE_STEP } from '../adaptiveTempo';

// #1102 (split from #1087, Han 2026-08-23 chat interview, wired up 2026-08-28). These two formulas were
// written during the paused first attempt and deliberately left untested until they were actually
// integrated (docs/architecture.md §298: "add tests when wiring them in, not before") — this is that
// moment. `commitIndexFor`/`lcmOf` are the new exact-cross-stream-sync primitive.

// A minimal level shape: only the fields the formula actually reads (timeSignature/totalMeasures/
// notesPerMeasure/twoHanded/bpm), so a change to unrelated level fields can't break these tests.
const lvl = (over = {}) => ({
    bpm: 80, timeSignature: [4, 4], totalMeasures: 8, notesPerMeasure: 2, ...over,
});

// The stats shape useLevel.js's `emptyStats()` produces — every field is a cumulative counter, which is
// what lets `evaluateAdaptiveBpm` diff two snapshots into a "just this block" delta.
const stats = (over = {}) => ({
    defeated: 0, misses: 0, perfect: 0, tooFast: 0, tooSlow: 0, muchTooFast: 0, muchTooSlow: 0,
    secondAttemptCorrected: 0, wrongUncorrected: 0, missed: 0, extraNote: 0, ...over,
});

describe('adaptiveTempo — baselineAdaptiveBpm (#1102, Han\'s locked formula)', () => {
    it('is the algebraic inverse of #1099\'s ANPM formula: bpm = anpm * beatsInLevel / totalNotes', () => {
        // 4/4 → 4 quarter-beats/measure × 8 measures = 32 beats. 8 measures × 2 notes = 16 notes.
        // 60 × 32 / 16 = 120.
        expect(baselineAdaptiveBpm(lvl(), 60)).toBe(120);
    });

    it('counts BASS notes too, but ONLY on a twoHanded level (Han: "als die in input staat")', () => {
        // twoHanded adds 1 bass note/measure (the shared fallback both level-bass presets use), so the
        // note count doubles from 16 to 24 → 60 × 32 / 24 = 80.
        expect(baselineAdaptiveBpm(lvl({ twoHanded: true }), 60)).toBe(80);
    });

    it('handles odd numerators — 7/8 and 5/4 — via the meter, not a lookup table (§6c)', () => {
        // 7/8 → 4 × 7/8 = 3.5 quarter-beats per measure × 8 = 28 beats; 16 notes → 60 × 28 / 16 = 105.
        expect(baselineAdaptiveBpm(lvl({ timeSignature: [7, 8] }), 60)).toBe(105);
        // 5/4 → 5 quarter-beats × 8 = 40 beats; 16 notes → 60 × 40 / 16 = 150.
        expect(baselineAdaptiveBpm(lvl({ timeSignature: [5, 4] }), 60)).toBe(150);
    });

    it('falls back to the level\'s own authored bpm when ANPM is null (nothing played yet)', () => {
        expect(baselineAdaptiveBpm(lvl({ bpm: 96 }), null)).toBe(96);
        expect(baselineAdaptiveBpm(lvl({ bpm: 96 }), undefined)).toBe(96);
    });

    it('falls back to the authored bpm when the level has no notes to divide by', () => {
        expect(baselineAdaptiveBpm(lvl({ bpm: 96, notesPerMeasure: 0 }), 60)).toBe(96);
        expect(baselineAdaptiveBpm(lvl({ bpm: 96, totalMeasures: 0 }), 60)).toBe(96);
    });
});

describe('adaptiveTempo — evaluateAdaptiveBpm (#1102, ±5% + [base/2, base] clamp)', () => {
    const baseBpm = 100;

    it('speeds up by exactly 5% after a clean stretch (>=90% accuracy)', () => {
        const prev = stats();
        const curr = stats({ defeated: 10, perfect: 10 });   // 10/10 graded = 100%
        expect(evaluateAdaptiveBpm({ prevStats: prev, currStats: curr, currentBpm: 80, baseBpm }))
            .toBeCloseTo(80 * (1 + ADAPTIVE_STEP), 6);
    });

    it('slows down by exactly 5% after a rough stretch (<70% accuracy)', () => {
        const prev = stats();
        const curr = stats({ defeated: 5, perfect: 5, misses: 5, missed: 5 });   // 5/10 = 50%
        expect(evaluateAdaptiveBpm({ prevStats: prev, currStats: curr, currentBpm: 80, baseBpm }))
            .toBeCloseTo(80 * (1 - ADAPTIVE_STEP), 6);
    });

    it('HOLDS steady in the 70-90% deadband rather than chasing noise every block', () => {
        const prev = stats();
        const curr = stats({ defeated: 8, perfect: 8, misses: 2, missed: 2 });   // 8/10 = 80%
        expect(evaluateAdaptiveBpm({ prevStats: prev, currStats: curr, currentBpm: 80, baseBpm })).toBe(80);
    });

    it('is a NO-OP when nothing was graded in the stretch (e.g. the very first block)', () => {
        const snapshot = stats({ defeated: 4, perfect: 4 });
        // Same snapshot twice → zero delta → no notes → hold, regardless of the level\'s running accuracy.
        expect(evaluateAdaptiveBpm({ prevStats: snapshot, currStats: snapshot, currentBpm: 80, baseBpm })).toBe(80);
    });

    it('clamps at the CEILING (the level\'s authored bpm) — a clean stretch there is a silent no-op', () => {
        const curr = stats({ defeated: 10, perfect: 10 });
        expect(evaluateAdaptiveBpm({ prevStats: stats(), currStats: curr, currentBpm: baseBpm, baseBpm }))
            .toBe(baseBpm);
    });

    it('clamps at the FLOOR (authored bpm / 2) — a rough stretch there is a silent no-op', () => {
        const curr = stats({ defeated: 1, perfect: 1, misses: 9, missed: 9 });
        expect(evaluateAdaptiveBpm({ prevStats: stats(), currStats: curr, currentBpm: baseBpm / 2, baseBpm }))
            .toBe(baseBpm / 2);
    });
});

describe('adaptiveTempo — commitIndexFor (#1102, exact cross-stream sync)', () => {
    it('lcmOf ignores non-positive / non-finite units instead of poisoning the result', () => {
        expect(lcmOf([2, 3])).toBe(6);
        expect(lcmOf([4, 2])).toBe(4);
        expect(lcmOf([3, 0, null, 2])).toBe(6);
        expect(lcmOf([])).toBe(1);
    });

    it('returns the first measure index that is a boundary of BOTH streams', () => {
        // treble blocks of 2 measures, backing chunks of 3 → they only coincide every 6 measures.
        expect(commitIndexFor(2, [2, 3])).toBe(6);
        expect(commitIndexFor(6, [2, 3])).toBe(6);
        expect(commitIndexFor(7, [2, 3])).toBe(12);
    });

    it('is the identity on an index that is already a shared boundary', () => {
        expect(commitIndexFor(8, [2, 4])).toBe(8);
        expect(commitIndexFor(0, [2, 3])).toBe(0);
    });

    it('works for the odd-numerator levels too — measure COUNTS stay integers in 5/4 and 7/8', () => {
        // A 7/8 level's odd numerator changes a bar's DURATION, never how many bars a block spans, so the
        // commit index arithmetic is unaffected by meter. Level 3-shaped (blocks of 2) against a 5-measure
        // lead-in chunk (what deriveLevelSpan yields for a fast 7/8 level).
        expect(commitIndexFor(3, [2, 5])).toBe(10);
        // 5/4 with a 3-measure visible span and 4-measure waves.
        expect(commitIndexFor(5, [4, 3])).toBe(12);
    });
});
