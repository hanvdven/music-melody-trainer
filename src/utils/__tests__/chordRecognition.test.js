import { describe, it, expect } from 'vitest';
import { getChordInfo } from '../../theory/chordRecognition';

describe('getChordInfo', () => {
    it('recognizes major triad', () => {
        const result = getChordInfo([0, 4, 7], 'C', 'I');
        expect(result).toBeTruthy();
        expect(result.name).toBe('Major Triad');
        expect(result.notation).toBe('');
        expect(result.quality).toBe('major');
    });

    it('recognizes minor triad', () => {
        const result = getChordInfo([0, 3, 7], 'C', 'i');
        expect(result).toBeTruthy();
        expect(result.name).toBe('Minor Triad');
        expect(result.notation).toBe('−');
        expect(result.quality).toBe('minor');
    });

    it('recognizes diminished triad', () => {
        const result = getChordInfo([0, 3, 6], 'C', 'i');
        expect(result).toBeTruthy();
        expect(result.name).toBe('Diminished Triad');
        expect(result.notation).toBe('°');
        expect(result.quality).toBe('diminished');
    });

    it('recognizes augmented triad', () => {
        const result = getChordInfo([0, 4, 8], 'C', 'I');
        expect(result).toBeTruthy();
        expect(result.name).toBe('Augmented Triad');
        expect(result.notation).toBe('+');
        expect(result.quality).toBe('augmented');
    });

    it('recognizes dominant seventh', () => {
        const result = getChordInfo([0, 4, 7, 10], 'C', 'V');
        expect(result).toBeTruthy();
        expect(result.name).toBe('Dominant Seventh');
        expect(result.notation).toBe('7');
    });

    it('recognizes major seventh', () => {
        const result = getChordInfo([0, 4, 7, 11], 'C', 'I');
        expect(result).toBeTruthy();
        expect(result.name).toBe('Major Seventh');
        expect(result.notation).toBe('maj7');
    });

    it('recognizes minor seventh', () => {
        const result = getChordInfo([0, 3, 7, 10], 'C', 'ii');
        expect(result).toBeTruthy();
        expect(result.name).toBe('Minor Seventh');
        expect(result.notation).toBe('−7');
    });

    it('recognizes half-diminished seventh', () => {
        const result = getChordInfo([0, 3, 6, 10], 'C', 'viio');
        expect(result).toBeTruthy();
        expect(result.name).toBe('Half Diminished Seventh');
        expect(result.notation).toBe('ø7');
    });

    it('returns Unrecognized Chord object for unrecognized chords', () => {
        const result = getChordInfo([0, 1, 2], 'C', 'I');
        expect(result.name).toBe('Unrecognized Chord');
        expect(result.quality).toBe('unknown');
    });

    it('handles empty intervals', () => {
        const result = getChordInfo([], 'C', 'I');
        expect(result.name).toBe('Unrecognized Chord');
        expect(result.quality).toBe('unknown');
    });
});
