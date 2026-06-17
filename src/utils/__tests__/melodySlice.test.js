import { describe, it, expect } from 'vitest';
import { sliceMelodyByMeasure, sliceMelodyByRange, sliceChordsForMeasure, melodyMeasureSpan } from '../melodySlice';
import { processMelodyAndCalculateSlots } from '../../components/sheet-music/processMelodyAndCalculateSlots';

describe('melodyMeasureSpan', () => {
    // Regression for the "TS change while stopped → malformed sheet" bug (BACKLOG.md 1587):
    // the displayed measure count must round UP so a re-barred melody keeps its partial
    // final measure (and the notes in it) instead of dropping them.
    it('rounds UP for an unevenly-dividing total (192 ticks under 36-tick 3/4 → 6)', () => {
        // 4-bar 4/4 melody = 192 ticks, re-barred into 3/4 (measureLength = 36 ticks).
        // 192 / 36 = 5.33 → must be 6, NOT 5 (Math.round would have given 5 and dropped 180–192).
        expect(melodyMeasureSpan(192, 36, 4)).toBe(6);
    });

    it('stays EXACT for an evenly-dividing total (192 ticks under 48-tick 4/4 → 4)', () => {
        // No floating-point inflation to 5: the -1e-6 epsilon keeps exact multiples exact.
        expect(melodyMeasureSpan(192, 48, 4)).toBe(4);
    });

    it('handles irregular meters (192 ticks under 60-tick 5/4 → 4)', () => {
        // 5/4 measureLength = 60 ticks. 192 / 60 = 3.2 → 4 (no meter special-casing).
        expect(melodyMeasureSpan(192, 60, 4)).toBe(4);
    });

    it('handles irregular meters (192 ticks under 42-tick 7/8 → 5)', () => {
        // 7/8 measureLength = 42 ticks. 192 / 42 = 4.57 → 5.
        expect(melodyMeasureSpan(192, 42, 4)).toBe(5);
    });

    it('floors at 1 for a sub-measure melody', () => {
        expect(melodyMeasureSpan(12, 48, 4)).toBe(1);
    });

    it('falls back to the generator count when the melody is empty', () => {
        expect(melodyMeasureSpan(0, 48, 4)).toBe(4);
    });
});

describe('re-bar after a time-signature change (end-to-end through the slot processor)', () => {
    // A 4-bar 4/4 melody (one quarter per beat, 192 ticks) re-displayed in 3/4.
    // measureLength(3/4) = 36 ticks → spans 192/36 = 5.33 → 6 display measures.
    const melody = {
        notes:     Array.from({ length: 16 }, () => 'C4'),
        durations: Array.from({ length: 16 }, () => 12),
        offsets:   Array.from({ length: 16 }, (_, i) => i * 12), // 0,12,…,180
    };
    const ML_3_4 = 36; // 3/4 with TICKS_PER_WHOLE=48
    const span = melodyMeasureSpan(192, ML_3_4, 4); // 6

    it('keeps ALL notes when sliced over the ceil-derived range', () => {
        // sliceMelodyByRange keeps notes whose START offset is < span*measureLength,
        // so the would-be-dropped notes (offsets 180–192) are retained.
        const sliced = sliceMelodyByRange(melody, ML_3_4, span, 0);
        expect(sliced.notes).toHaveLength(16); // none dropped
        expect(sliced.offsets[sliced.offsets.length - 1]).toBe(180);
    });

    it('ties notes that cross the NEW barlines and pads the final partial measure', () => {
        const sliced = sliceMelodyByRange(melody, ML_3_4, span, 0);
        const processed = processMelodyAndCalculateSlots(
            sliced, [3, 4], 12, span * ML_3_4, // globalMaxDuration = 6 * 36 = 216
        );
        // The processor lays out real notes plus a trailing rest padding to the global end.
        // (a) Real-note content is preserved: at least one 'C4' notehead exists.
        expect(processed.notes.filter(n => n === 'C4').length).toBeGreaterThan(0);
        // (b) A trailing rest pads the partial final measure (192→216) so the bar isn't malformed.
        expect(processed.notes).toContain('r');
        // (c) Cross-barline continuations are tied. Build the cumulative real-note span and
        //     assert the processed content covers the full 192 ticks of real notes (no drops).
        const realEnd = processed.offsets.reduce(
            (max, off, i) => processed.notes[i] !== 'r' ? Math.max(max, off + processed.durations[i]) : max,
            0,
        );
        expect(realEnd).toBe(192); // all real-note content through tick 192 is present
    });

    it('a single note crossing a new barline becomes tied segments', () => {
        // One half-note (24 ticks) starting at tick 24 in 3/4: spans 24→48, crossing the
        // barline at 36. The processor must split it into two tied segments (12 + 12).
        const single = { notes: ['C4'], durations: [24], offsets: [24] };
        const processed = processMelodyAndCalculateSlots(single, [3, 4], 12, 72);
        const cNotes = processed.notes
            .map((n, i) => ({ n, off: processed.offsets[i], dur: processed.durations[i], tie: processed.ties[i] }))
            .filter(e => e.n === 'C4');
        expect(cNotes.length).toBe(2);            // split into two segments
        expect(cNotes[0].off).toBe(24);
        expect(cNotes[1].off).toBe(36);           // continuation starts at the new barline
        // Tie convention (post-shift in processMelodyAndCalculateSlots): the flag marks the
        // segment that ties INTO the next, i.e. the first of the two C4 segments.
        expect(cNotes[0].tie).toBe('tie');
        expect(cNotes[1].tie).toBe(null);         // the continuation segment closes the tie
    });
});

describe('sliceMelodyByMeasure', () => {
    const ML = 48; // 4/4 with TICKS_PER_WHOLE=48 → measureLengthTicks=48

    it('slices a simple melody into per-measure pieces', () => {
        const melody = {
            notes:     ['C4', 'D4', 'E4', 'F4'],
            durations: [12, 12, 12, 12],
            offsets:   [0, 12, 48, 60],
        };
        const slices = sliceMelodyByMeasure(melody, ML, 2);
        expect(slices).toHaveLength(2);
        expect(slices[0].notes).toEqual(['C4', 'D4']);
        expect(slices[0].offsets).toEqual([0, 12]); // measure-relative
        expect(slices[1].notes).toEqual(['E4', 'F4']);
        expect(slices[1].offsets).toEqual([0, 12]); // measure-relative
    });

    it('returns null for empty measures', () => {
        const melody = {
            notes:     ['C4', 'D4'],
            durations: [12, 12],
            offsets:   [0, 96],   // m0 + m2 (skips m1)
        };
        const slices = sliceMelodyByMeasure(melody, ML, 3);
        expect(slices[0].notes).toEqual(['C4']);
        expect(slices[1]).toBeNull();
        expect(slices[2].notes).toEqual(['D4']);
    });

    it('preserves song-level fermatas on every slice', () => {
        // Fermata at tick 0 — every slice should see the same { tick, hold }.
        const melody = {
            notes:     ['C4', 'D4'],
            durations: [12, 12],
            offsets:   [0, 48],
            fermatas:  [{ tick: 0, hold: 18 }],
        };
        const slices = sliceMelodyByMeasure(melody, ML, 2);
        expect(slices[0].fermatas).toEqual([{ tick: 0, hold: 18 }]);
        expect(slices[1].fermatas).toEqual([{ tick: 0, hold: 18 }]);
    });

    it('keeps durations and offsets natural (visual layer reads these as-is)', () => {
        // Fermata extends note duration in playback, but slice durations stay natural.
        const melody = {
            notes:     ['C4'],
            durations: [12],
            offsets:   [0],
            fermatas:  [{ tick: 0, hold: 100 }],
        };
        const [slice] = sliceMelodyByMeasure(melody, ML, 1);
        expect(slice.durations).toEqual([12]); // not 12 + 100 — that's audio only
    });

    it('handles melody.fermatas absent', () => {
        const melody = {
            notes:     ['C4'],
            durations: [12],
            offsets:   [0],
        };
        const [slice] = sliceMelodyByMeasure(melody, ML, 1);
        expect(slice.fermatas).toBeNull();
    });

    it('preserves displayNotes when present', () => {
        const melody = {
            notes:        ['F♯4'],
            displayNotes: ['G♭4'],
            durations:    [12],
            offsets:      [0],
        };
        const [slice] = sliceMelodyByMeasure(melody, ML, 1);
        expect(slice.displayNotes).toEqual(['G♭4']);
    });

    it('falls back to notes when displayNotes is absent', () => {
        const melody = {
            notes:     ['C4'],
            durations: [12],
            offsets:   [0],
        };
        const [slice] = sliceMelodyByMeasure(melody, ML, 1);
        expect(slice.displayNotes).toEqual(['C4']);
    });
});

describe('sliceMelodyByRange', () => {
    const ML = 48;

    it('extracts a sub-range with relative offsets', () => {
        const melody = {
            notes:     ['C4', 'D4', 'E4', 'F4'],
            durations: [12, 12, 12, 12],
            offsets:   [0, 12, 48, 60],
        };
        // Take measure 1 only (= absolute ticks 48..96)
        const slice = sliceMelodyByRange(melody, ML, 1, 1);
        expect(slice.notes).toEqual(['E4', 'F4']);
        expect(slice.offsets).toEqual([0, 12]); // shifted to local
    });

    it('returns empty arrays when no notes in range', () => {
        const melody = {
            notes:     ['C4'],
            durations: [12],
            offsets:   [0],
        };
        const slice = sliceMelodyByRange(melody, ML, 1, 2); // measure 2 = ticks 96..144
        expect(slice.notes).toEqual([]);
        expect(slice.offsets).toEqual([]);
    });
});

describe('sliceChordsForMeasure', () => {
    const ML = 48;

    it('filters and shifts chords to measure-relative offsets', () => {
        const chords = [
            { absoluteOffset: 0,  chord: 'C' },
            { absoluteOffset: 24, chord: 'D' },
            { absoluteOffset: 48, chord: 'E' },
        ];
        const m0 = sliceChordsForMeasure(chords, 0, ML);
        expect(m0).toHaveLength(2);
        expect(m0[0].chord).toBe('C');
        expect(m0[0].absoluteOffset).toBe(0);
        expect(m0[1].absoluteOffset).toBe(24);

        const m1 = sliceChordsForMeasure(chords, 1, ML);
        expect(m1).toHaveLength(1);
        expect(m1[0].chord).toBe('E');
        expect(m1[0].absoluteOffset).toBe(0); // 48 - 48
    });

    it('returns empty for null/empty input', () => {
        expect(sliceChordsForMeasure(null, 0, ML)).toEqual([]);
        expect(sliceChordsForMeasure([], 0, ML)).toEqual([]);
    });
});
