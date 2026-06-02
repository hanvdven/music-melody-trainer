import { describe, it, expect } from 'vitest';
import {
    familyOfClef, carouselOrder, patchForFamily, patchForOctave, patchForVocal,
    patchForTransposition, CLEF_FAMILIES, CLEF_OFF,
} from '../clefSelector';

describe('familyOfClef', () => {
    it('maps concrete clefs to families', () => {
        expect(familyOfClef('treble')).toBe('g');
        expect(familyOfClef('bass')).toBe('f');
        expect(familyOfClef('alto')).toBe('vocal');
        expect(familyOfClef('soprano')).toBe('vocal');
        expect(familyOfClef(CLEF_OFF)).toBe('off');
    });
});

describe('off (disabled staff)', () => {
    it('is the 4th family and patches to the off sentinel clef', () => {
        expect(CLEF_FAMILIES.map(f => f.id)).toEqual(['g', 'f', 'vocal', 'off']);
        expect(patchForFamily('off')).toEqual({ preferredClef: CLEF_OFF });
        // no rangeMode change for off (just disables the staff)
        expect(patchForFamily('off').rangeMode).toBeUndefined();
    });
});

describe('carouselOrder', () => {
    it('puts the current family first, others wrapping in order (incl. off)', () => {
        expect(carouselOrder('f').map(f => f.id)).toEqual(['f', 'vocal', 'off', 'g']);
        expect(carouselOrder('vocal').map(f => f.id)).toEqual(['vocal', 'off', 'g', 'f']);
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
    it('vocal patch sets the chosen voice clef + rangeMode', () => {
        expect(patchForVocal('tenor')).toEqual({ preferredClef: 'tenor', rangeMode: 'Tenor' });
        // Bass vs Baritone share the F-clef but stay distinct voices.
        expect(patchForVocal({ clef: 'bass', rangeMode: 'Baritone' }))
            .toEqual({ preferredClef: 'bass', rangeMode: 'Baritone' });
    });
    it('transposition patch sets the key (defaults to C)', () => {
        expect(patchForTransposition('Bb')).toEqual({ transpositionKey: 'Bb' });
        expect(patchForTransposition(null)).toEqual({ transpositionKey: 'C' });
    });
});

