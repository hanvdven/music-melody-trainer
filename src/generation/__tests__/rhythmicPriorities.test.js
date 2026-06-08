import { describe, it, expect } from 'vitest';
import {
    decomposeNumeratorToBeatGroups,
    chooseGrouping,
    generateRhythmicDNA,
} from '../rhythmicPriorities';

// These lock the §6c invariant that the rhythm pipeline derives meter grouping from a
// FORMULA (prefer-3s decomposition), not a lookup table — so it works for ANY numerator
// including odd ones (5/4, 7/8, 11/8, 15/8) that no table would list. They also guard the
// §6b regression: generateRhythmicDNA must never produce fractional slot ranks.

describe('decomposeNumeratorToBeatGroups', () => {
    it('decomposes odd numerators into prefer-3s group offsets (the doc examples)', () => {
        expect(decomposeNumeratorToBeatGroups(5)).toEqual([0, 3]);        // 3+2
        expect(decomposeNumeratorToBeatGroups(7)).toEqual([0, 3, 5]);     // 3+2+2
        expect(decomposeNumeratorToBeatGroups(11)).toEqual([0, 3, 6, 9]); // 3+3+3+2
        expect(decomposeNumeratorToBeatGroups(15)).toEqual([0, 3, 6, 9, 12]); // 3+3+3+3+3
    });

    it('covers regular meters too', () => {
        expect(decomposeNumeratorToBeatGroups(4)).toEqual([0, 2]);     // 2+2
        expect(decomposeNumeratorToBeatGroups(6)).toEqual([0, 3]);     // 3+3
        expect(decomposeNumeratorToBeatGroups(8)).toEqual([0, 3, 6]);  // 3+3+2
        expect(decomposeNumeratorToBeatGroups(9)).toEqual([0, 3, 6]);  // 3+3+3
        expect(decomposeNumeratorToBeatGroups(12)).toEqual([0, 3, 6, 9]);
    });

    it('handles trivial/degenerate numerators', () => {
        expect(decomposeNumeratorToBeatGroups(1)).toEqual([]);
        expect(decomposeNumeratorToBeatGroups(2)).toEqual([0]);
        expect(decomposeNumeratorToBeatGroups(3)).toEqual([0]);
    });

    it('first offset is always 0 and offsets are strictly increasing for any n 2..20', () => {
        for (let n = 2; n <= 20; n++) {
            const starts = decomposeNumeratorToBeatGroups(n);
            expect(starts[0]).toBe(0);
            for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeGreaterThan(starts[i - 1]);
            expect(starts[starts.length - 1]).toBeLessThan(n);
        }
    });
});

describe('chooseGrouping', () => {
    // The COUNT of 3s and 2s is fixed by the numerator; only ORDER is random.
    const expectedMultiset = {
        4: [2, 2], 5: [2, 3], 7: [2, 2, 3], 8: [2, 3, 3], 11: [2, 3, 3, 3], 15: [3, 3, 3, 3, 3],
    };
    it('keeps the group-size multiset fixed and summing to the numerator across random runs', () => {
        for (const [num, expected] of Object.entries(expectedMultiset)) {
            const n = Number(num);
            for (let run = 0; run < 50; run++) {
                const g = chooseGrouping(n);
                expect([...g].sort((a, b) => a - b)).toEqual(expected);
                expect(g.reduce((a, b) => a + b, 0)).toBe(n);
            }
        }
    });
});

describe('generateRhythmicDNA — integer-rank invariant (§6b regression guard)', () => {
    const cases = [
        { grouping: [2, 2], ts: [4, 4], denom: 16 },   // 4/4 sixteenths
        { grouping: [2, 2], ts: [4, 4], denom: 2 },    // smallestNoteDenom < denominator (the §6b bug case)
        { grouping: [3, 2], ts: [5, 4], denom: 16 },   // 5/4 odd
        { grouping: [3, 2, 2], ts: [7, 8], denom: 16 }, // 7/8 odd
        { grouping: [3, 3, 3, 2], ts: [11, 8], denom: 16 }, // 11/8 odd
    ];

    it('produces only positive-integer ranks (never fractional) for every case', () => {
        for (const { grouping, ts, denom } of cases) {
            const ranks = generateRhythmicDNA(grouping, ts, denom);
            const [numerator, denominator] = ts;
            const slotsPerBeat = Math.max(denom, denominator) / denominator;
            expect(ranks).toHaveLength(numerator * slotsPerBeat);
            for (const r of ranks) {
                if (r === null) continue;
                expect(Number.isInteger(r)).toBe(true);
                expect(r).toBeGreaterThanOrEqual(1);
            }
        }
    });

    it('puts the strongest rank (1) on the measure downbeat (slot 0)', () => {
        for (const { grouping, ts, denom } of cases) {
            expect(generateRhythmicDNA(grouping, ts, denom)[0]).toBe(1);
        }
    });

    it('assigns a non-null rank to every beat downbeat slot', () => {
        for (const { grouping, ts, denom } of cases) {
            const [numerator, denominator] = ts;
            const slotsPerBeat = Math.max(denom, denominator) / denominator;
            const ranks = generateRhythmicDNA(grouping, ts, denom);
            for (let b = 0; b < numerator; b++) expect(ranks[b * slotsPerBeat]).not.toBeNull();
        }
    });
});
