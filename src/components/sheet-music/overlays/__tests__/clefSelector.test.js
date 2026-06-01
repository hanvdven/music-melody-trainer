import { describe, it, expect } from 'vitest';
import {
    familyOfClef, carouselOrder, patchForFamily, patchForOctave, patchForVocal,
    patchForTransposition, transpositionChips, CLEF_FAMILIES,
} from '../clefSelector';

describe('familyOfClef', () => {
    it('maps concrete clefs to families', () => {
        expect(familyOfClef('treble')).toBe('g');
        expect(familyOfClef('bass')).toBe('f');
        expect(familyOfClef('alto')).toBe('vocal');
        expect(familyOfClef('soprano')).toBe('vocal');
    });
});

describe('carouselOrder', () => {
    it('puts the current family first, others wrapping in order', () => {
        expect(carouselOrder('f').map(f => f.id)).toEqual(['f', 'vocal', 'g']);
        expect(carouselOrder('vocal').map(f => f.id)).toEqual(['vocal', 'g', 'f']);
    });
    it('falls back to the first family for unknown ids', () => {
        expect(carouselOrder('???').map(f => f.id)).toEqual(CLEF_FAMILIES.map(f => f.id));
    });
});

describe('patch helpers', () => {
    it('family patch resolves the default clef + range mode, keeps transposition', () => {
        expect(patchForFamily('g')).toEqual({ preferredClef: 'treble', rangeMode: 'STANDARD' });
        expect(patchForFamily('f')).toEqual({ preferredClef: 'bass', rangeMode: 'STANDARD' });
        expect(patchForFamily('vocal')).toEqual({ preferredClef: 'alto', rangeMode: 'Alto' });
        expect(patchForFamily('g').transpositionKey).toBeUndefined();
    });
    it('octave patch maps to the relative rangeModes', () => {
        expect(patchForOctave('g', 'treble8va')).toEqual({ preferredClef: 'treble', rangeMode: 'relative' });
        expect(patchForOctave('f', 'bass8vb')).toEqual({ preferredClef: 'bass', rangeMode: 'relative_low' });
        expect(patchForOctave('g', 'treble')).toEqual({ preferredClef: 'treble', rangeMode: 'STANDARD' });
        expect(patchForOctave('g', 'nope')).toBeNull();
    });
    it('vocal patch sets the chosen vocal clef', () => {
        expect(patchForVocal('tenor')).toEqual({ preferredClef: 'tenor', rangeMode: 'Alto' });
    });
    it('transposition patch sets the key (defaults to C)', () => {
        expect(patchForTransposition('Bb')).toEqual({ transpositionKey: 'Bb' });
        expect(patchForTransposition(null)).toEqual({ transpositionKey: 'C' });
    });
});

describe('transpositionChips', () => {
    it('returns the inline subset with Unicode labels', () => {
        const chips = transpositionChips();
        expect(chips.map(c => c.key)).toEqual(['Bb', 'Eb', 'F']);
        expect(chips[0].label).toBe('B♭');
    });
});
