import { describe, it, expect } from 'vitest';
import { sliceMelodyByMeasure, sliceMelodyByRange, sliceChordsForMeasure } from '../melodySlice';

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
