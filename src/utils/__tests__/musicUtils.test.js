import { describe, it, expect } from 'vitest';
import { getNoteIndex, transposeMelodyToScale } from '../../theory/musicUtils';

describe('getNoteIndex', () => {
    it('returns correct index for C4', () => {
        expect(getNoteIndex('C4')).toBe(39);
    });

    it('handles sharps correctly', () => {
        expect(getNoteIndex('C♯4')).toBe(40);
    });

    it('handles flats correctly', () => {
        expect(getNoteIndex('D♭4')).toBe(40);
    });

    it('returns -1 for invalid notes', () => {
        expect(getNoteIndex(null)).toBe(-1);
        expect(getNoteIndex('')).toBe(-1);
    });

    it('handles different octaves', () => {
        expect(getNoteIndex('C3')).toBe(27);
        expect(getNoteIndex('C5')).toBe(51);
    });
});

describe('transposeMelodyToScale', () => {
    it('transposes melody correctly between scales', () => {
        const melody = ['C4', 'E4', 'G4'];
        const cMajor = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'];
        const gMajor = ['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F♯5'];

        const result = transposeMelodyToScale(melody, cMajor, gMajor);
        expect(result).toEqual(['G4', 'B4', 'D5']);
    });

    it('handles null inputs gracefully', () => {
        const melody = ['C4', 'E4'];
        const scale = ['C4', 'D4', 'E4'];

        expect(transposeMelodyToScale(null, scale, scale)).toBeNull();
        expect(transposeMelodyToScale(melody, null, scale)).toEqual(melody);
        expect(transposeMelodyToScale(melody, scale, null)).toEqual(melody);
    });

    it('preserves percussion notes', () => {
        const melody = ['C4', 'k', 'E4', 'hh'];
        const cMajor = ['C4', 'D4', 'E4'];
        const gMajor = ['G4', 'A4', 'B4'];

        const result = transposeMelodyToScale(melody, cMajor, gMajor);
        expect(result[1]).toBe('k');
        expect(result[3]).toBe('hh');
    });
});
