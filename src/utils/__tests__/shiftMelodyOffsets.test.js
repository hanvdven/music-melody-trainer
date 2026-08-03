import { describe, it, expect } from 'vitest';
import shiftMelodyOffsets from '../shiftMelodyOffsets';

describe('shiftMelodyOffsets (#662)', () => {
    it('shifts every non-null offset by the given tick amount, leaving other fields untouched', () => {
        const melody = { notes: ['C4', 'r', 'D4'], durations: [12, 12, 12], offsets: [0, 12, 24], ties: [null, null, null] };
        const shifted = shiftMelodyOffsets(melody, 96);
        expect(shifted.offsets).toEqual([96, 108, 120]);
        expect(shifted.notes).toBe(melody.notes);
        expect(shifted.durations).toBe(melody.durations);
    });

    it('leaves a null offset (the leading-rest quirk) as null, not NaN', () => {
        const melody = { notes: ['r', 'C4'], durations: [12, 12], offsets: [null, 12] };
        expect(shiftMelodyOffsets(melody, 96).offsets).toEqual([null, 108]);
    });

    it('returns the melody unchanged when tickShift is 0/falsy or melody is null', () => {
        const melody = { notes: ['C4'], durations: [12], offsets: [0] };
        expect(shiftMelodyOffsets(melody, 0)).toBe(melody);
        expect(shiftMelodyOffsets(null, 96)).toBe(null);
    });
});
