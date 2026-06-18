import { describe, it, expect } from 'vitest';
import { buildAnacrusisRepeatParts, buildMergedRenderMelodies, hasAnacrusis } from '../anacrusisRepeat.js';

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

    it('hasAnacrusis is true only when the first onset lies strictly inside m0', () => {
        expect(hasAnacrusis(melody, measureLen)).toBe(true);                       // first onset 24 ∈ (0,36)
        expect(hasAnacrusis({ offsets: [0] }, measureLen)).toBe(false);            // downbeat → no pickup
        expect(hasAnacrusis({ offsets: [36] }, measureLen)).toBe(false);           // = bar end → not inside m0
        expect(hasAnacrusis(null, measureLen)).toBe(false);
        expect(hasAnacrusis({ offsets: [] }, measureLen)).toBe(false);
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

describe('buildMergedRenderMelodies', () => {
    it('returns the merged HBD body with the pickup at the end and bodyMeasures=8', () => {
        // HBD-shaped treble (same fixture as above): pickup at 24/33, body m1..m8, last note "you!".
        const merged = buildMergedRenderMelodies({ treble: melody }, measureLen);
        expect(merged).not.toBeNull();
        // 9-bar padded song (m0 pickup + 8 body bars) → body loop is 8 bars.
        expect(merged.bodyMeasures).toBe(8);
        // The merged treble matches the canonical util's loopMerged: pickup relocated to the END of
        // the last body bar (252 + 24 = 276, 285), 'you!' clipped to free that beat. No note at/after
        // the bar end (288) — the pickup now leads into the NEXT loop, not a dead m0.
        const { loopMerged } = buildAnacrusisRepeatParts(melody, measureLen);
        expect(merged.treble.offsets).toEqual(loopMerged.offsets);
        expect(merged.treble.notes).toEqual(loopMerged.notes);
        expect(Math.max(...merged.treble.offsets)).toBeLessThan(288);
        // pickup 'D4' appears at the end of the body (276/285), not at the front.
        expect(merged.treble.offsets).toContain(276);
        expect(merged.treble.offsets).toContain(285);
    });

    it('rebases fermatas into the body: shift -measureLen, drop pickup-bar ones (Han 2026-06-17)', () => {
        // A fermata on the 'you!' note (tick 288) must move with it when the pickup bar is removed,
        // so SheetMusic's offsets.indexOf(f.tick) still lands on the right note. A fermata inside the
        // removed pickup bar (tick 24 < measureLen) is dropped.
        const treble = { ...melody, fermatas: [{ tick: 288, hold: 2 }, { tick: 24, hold: 1 }] };
        const merged = buildMergedRenderMelodies({ treble }, measureLen);
        expect(merged.treble.fermatas).toEqual([{ tick: 288 - measureLen, hold: 2 }]); // 252
    });

    it('preserves rhythmicGrouping and chord identity fields on the merged bodies', () => {
        const treble = { ...melody, rhythmicGrouping: [3] };
        const chords = {
            notes:     [['G3', 'B3'], ['C4', 'E4'], ['D4', 'F4']],
            offsets:   [0,            108,          288],
            durations: [108,          180,          36],
            type: 'modal-random', complexity: 'triad', modality: 'modal',
        };
        const merged = buildMergedRenderMelodies({ treble, chordProgression: chords }, measureLen);
        expect(merged.treble.rhythmicGrouping).toEqual([3]);
        // chord straddler kept + rebased; identity fields carried for the label renderer.
        expect(merged.chordProgression.offsets).toEqual([0, 72, 252]);
        expect(merged.chordProgression.type).toBe('modal-random');
        expect(merged.chordProgression.complexity).toBe('triad');
        expect(merged.chordProgression.modality).toBe('modal');
    });

    it('is a no-op (returns null) for a melody with no anacrusis', () => {
        const noPickup = { notes: ['C4', 'D4'], offsets: [0, 36], durations: [36, 36] };
        expect(buildMergedRenderMelodies({ treble: noPickup }, measureLen)).toBeNull();
        // also null when there is no treble at all.
        expect(buildMergedRenderMelodies({}, measureLen)).toBeNull();
    });
});
