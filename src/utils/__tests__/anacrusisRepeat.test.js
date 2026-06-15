import { describe, it, expect } from 'vitest';
import { buildAnacrusisRepeatParts } from '../anacrusisRepeat.js';

// Happy-Birthday-shaped fixture: measureLen 36 (3/4, 12 ticks/beat). m0 is an anacrusis with the
// pickup "Hap-py" on beat 3 (offsets 24, 33). m1..m8 are full bars; m8 ("you!") is a dotted-half
// filling the whole last bar (offset 288, dur 36).
const measureLen = 36;
const melody = {
    notes:     ['D4', 'D4', 'E4', 'F4', 'G4'],
    offsets:   [24,   33,   36,   48,   288],   // pickup (24,33); m1 (36,48); m8 'you!' (288)
    durations: [9,    3,    12,   12,   36],
};

describe('buildAnacrusisRepeatParts', () => {
    it('returns no anacrusis when the first note is on the downbeat', () => {
        const r = buildAnacrusisRepeatParts({ notes: ['C4'], offsets: [0], durations: [12] }, measureLen);
        expect(r.hasAnacrusis).toBe(false);
        expect(r.loopMerged).toBeNull();
    });

    it('splits the pickup into intro and rebases the body to offset 0', () => {
        const { hasAnacrusis, intro, loopClean } = buildAnacrusisRepeatParts(melody, measureLen);
        expect(hasAnacrusis).toBe(true);
        expect(intro.offsets).toEqual([24, 33]);
        expect(intro.notes).toEqual(['D4', 'D4']);
        // body starts at offset 0 (m1 'E4' was at 36 → 0); last bar 'you!' was at 288 → 252.
        expect(loopClean.offsets).toEqual([0, 12, 252]);
        expect(loopClean.notes).toEqual(['E4', 'F4', 'G4']);
    });

    it('merges the pickup into the last bar, clipping the overlapping note', () => {
        const { loopMerged } = buildAnacrusisRepeatParts(melody, measureLen);
        // last body bar starts at 252; pickup beat = 252 + 24 = 276.
        // 'G4' (252, dur 36) overlaps 276 → clipped to dur 24. Pickup 'D4' appended at 276, 285.
        const byOffset = loopMerged.offsets.map((o, i) => [o, loopMerged.notes[i], loopMerged.durations[i]]);
        expect(byOffset).toContainEqual([252, 'G4', 24]);
        expect(byOffset).toContainEqual([276, 'D4', 9]);
        expect(byOffset).toContainEqual([285, 'D4', 3]);
        // no note may start at or after 288 (the bar end) — the tail was clipped/replaced.
        expect(Math.max(...loopMerged.offsets)).toBeLessThan(288);
    });

    it('keeps lyrics bound to their notes through the merge', () => {
        const withLyrics = { ...melody, lyrics: ['Hap-', 'py', 'birth', 'day', 'you!'] };
        const { intro, loopMerged } = buildAnacrusisRepeatParts(withLyrics, measureLen);
        // intro carries the pickup words.
        expect(intro.lyrics).toEqual(['Hap-', 'py']);
        // in the merged body the appended pickup must still read 'Hap-' / 'py' at 276 / 285.
        const wordAt = (o) => loopMerged.lyrics[loopMerged.offsets.indexOf(o)];
        expect(wordAt(276)).toBe('Hap-');
        expect(wordAt(285)).toBe('py');
        expect(wordAt(252)).toBe('you!');   // clipped note keeps its own word
    });

    it('clips a chord that straddles the dropped pickup bar instead of dropping it', () => {
        // A chord track has no leading rest (offset 0) but its first chord spans m0→m1 (HBD-style).
        // The body must KEEP that chord, clipped to its m1 portion, and rebase the rest.
        const chords = {
            notes:     [['G3', 'B3'], ['C4', 'E4'], ['D4', 'F4']],
            offsets:   [0,            108,          288],   // first chord spans bars 0-2
            durations: [108,          180,          36],
        };
        const { hasAnacrusis, intro, loopClean, loopMerged } = buildAnacrusisRepeatParts(chords, measureLen);
        expect(hasAnacrusis).toBe(false);                 // chord track has no leading rest of its own
        expect(intro).toBeNull();                         // nothing lies purely inside m0
        // straddler clipped: starts at 0, loses one bar (36) of duration; rest rebased by -36.
        expect(loopClean.offsets).toEqual([0, 72, 252]);
        expect(loopClean.durations).toEqual([72, 180, 36]);
        expect(loopClean.notes[0]).toEqual(['G3', 'B3']);
        // no pickup to merge → merged body is the clean body unchanged.
        expect(loopMerged.offsets).toEqual(loopClean.offsets);
    });
});
