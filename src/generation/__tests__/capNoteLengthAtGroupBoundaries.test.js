import { describe, it, expect, vi, afterEach } from 'vitest';
import { capNoteLengthAtGroupBoundaries } from '../melodyGenerator';

afterEach(() => {
    vi.restoreAllMocks();
});

// Hard rule for ALL melody generation (Han 2026-08-26, "de lengte van een noot mag geen twee
// groepsgrenzen passeren... nog een regel: en nooit 2 maatgrenzen"): without a cap, a run of
// consecutive null slots lets a note's duration extend forever — this guards the exact worked
// example Han gave during the interview, so a future refactor can't silently reintroduce the bug.
describe('capNoteLengthAtGroupBoundaries (#1087 follow-up, Han\'s own worked example)', () => {
    it('5/4, groups [2,3], note starting on beat 4 (0-indexed slot 3) extends exactly 4 beats then rests', () => {
        // Force chooseGrouping(5)'s Fisher-Yates to leave [3,2] (decomposeToGroupSizes' own order)
        // swapped into [2,3] — Math.random()=0 -> j=0 -> swaps groups[1]/groups[0].
        vi.spyOn(Math, 'random').mockReturnValue(0);

        const numMeasures = 2;
        const timeSignature = [5, 4];
        const smallestNoteDenom = 4; // quarter-note resolution: 1 slot per beat, matches Han's "tellen"
        // 2 measures x 5 slots = 10. Note starts at slot 3 ("tel 4", 1-indexed), everything else null.
        const melody = [null, null, null, 'A4', null, null, null, null, null, null];

        const result = capNoteLengthAtGroupBoundaries(melody, numMeasures, timeSignature, smallestNoteDenom);

        // Note occupies slots 3,4 (rest of measure 1's 3-group) + slots 5,6 (all of measure 2's
        // 2-group) = 4 beats total ("maximaal 4 tellen lang", exactly Han's own number).
        expect(result[3]).toBe('A4');
        expect(result[4]).toBe(null);
        expect(result[5]).toBe(null);
        expect(result[6]).toBe(null);
        // The note must NOT be allowed to continue into measure 2's second group (a 2nd boundary).
        expect(result[7]).toBe('r');
    });

    it('never crosses a second MEASURE boundary (2/4, one group per measure)', () => {
        // 2/4 is a single-group-per-measure meter, so here the group-cap and measure-cap
        // coincide — this guards the overall "at most 2 measures" invariant either way. (The
        // measureCapAbsolute check in the implementation is a defensive backstop per Han's explicit
        // "en nooit 2 maatgrenzen" — the group-cap can never mathematically exceed it, since the
        // "next group" fallback wraps to at most one full following measure, but the explicit check
        // stays as a safety net against any future change to the group-cap logic.)
        const numMeasures = 4;
        const timeSignature = [2, 4];
        const smallestNoteDenom = 4;
        // 4 measures x 2 slots = 8. Note starts at slot 0.
        const melody = ['C4', null, null, null, null, null, null, null];

        const result = capNoteLengthAtGroupBoundaries(melody, numMeasures, timeSignature, smallestNoteDenom);

        expect(result[0]).toBe('C4');
        // May extend through all of measure 1 (slots 2,3) but must rest by slot 4 (start of measure 2).
        expect(result[4]).toBe('r');
    });

    it('leaves an already-terminated note (followed by a real note or existing rest) untouched', () => {
        const numMeasures = 1;
        const timeSignature = [4, 4];
        const smallestNoteDenom = 4;
        const melody = ['C4', null, 'D4', null];

        const result = capNoteLengthAtGroupBoundaries(melody, numMeasures, timeSignature, smallestNoteDenom);
        expect(result).toEqual(['C4', null, 'D4', null]);
    });

    it('does not re-cap a rest that already absorbed a cut note (only real notes are capped)', () => {
        const numMeasures = 1;
        const timeSignature = [2, 4];
        const smallestNoteDenom = 4;
        // Note at slot 0 gets cut to a rest at the group cap; that rest is free to keep extending.
        const melody = ['C4', null, null, null];
        const result = capNoteLengthAtGroupBoundaries(melody, numMeasures, timeSignature, smallestNoteDenom);
        expect(result.filter((n) => n === 'r').length).toBeLessThanOrEqual(1);
    });
});
