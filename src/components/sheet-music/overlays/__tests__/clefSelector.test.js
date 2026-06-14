import { describe, it, expect } from 'vitest';
import {
    familyOfClef, clefFamilyKey, carouselOrder, patchForFamily, patchForOctave, patchForVocal,
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

// clefFamilyKey gates the CR-A2 refly: only a left-carousel FAMILY change animates;
// sub-clef variants (octave / transposition / vocal voice) keep the same key.
describe('clefFamilyKey', () => {
    it('returns the base family for instrumental clefs', () => {
        expect(clefFamilyKey({ preferredClef: 'treble', rangeMode: 'STANDARD' })).toBe('g');
        expect(clefFamilyKey({ preferredClef: 'bass', rangeMode: 'STANDARD' })).toBe('f');
        expect(clefFamilyKey({ preferredClef: CLEF_OFF })).toBe('off');
    });

    it('is stable across OCTAVE sub-clef changes (rangeMode only)', () => {
        // treble → treble8va keeps preferredClef 'treble' and switches rangeMode.
        expect(clefFamilyKey({ preferredClef: 'treble', rangeMode: 'STANDARD' }))
            .toBe(clefFamilyKey({ preferredClef: 'treble', rangeMode: 'relative' }));
    });

    it('is stable across TRANSPOSITION changes', () => {
        expect(clefFamilyKey({ preferredClef: 'treble', rangeMode: 'STANDARD', transpositionKey: 'C' }))
            .toBe(clefFamilyKey({ preferredClef: 'treble', rangeMode: 'STANDARD', transpositionKey: 'Bb' }));
    });

    it('treats ALL vocal voices as the vocal family — even Bass voice (reuses bass clef)', () => {
        expect(clefFamilyKey({ preferredClef: 'bass', rangeMode: 'Bass' })).toBe('vocal');
        expect(clefFamilyKey({ preferredClef: 'baritone-f', rangeMode: 'Baritone' })).toBe('vocal');
        expect(clefFamilyKey({ preferredClef: 'alto', rangeMode: 'Alto' })).toBe('vocal');
        // So switching between vocal voices does NOT change the family key.
        expect(clefFamilyKey({ preferredClef: 'bass', rangeMode: 'Bass' }))
            .toBe(clefFamilyKey({ preferredClef: 'soprano', rangeMode: 'Soprano' }));
    });

    it('DOES change when the base family changes (so the refly fires)', () => {
        expect(clefFamilyKey({ preferredClef: 'treble', rangeMode: 'STANDARD' }))
            .not.toBe(clefFamilyKey({ preferredClef: 'bass', rangeMode: 'STANDARD' }));
        expect(clefFamilyKey({ preferredClef: 'bass', rangeMode: 'STANDARD' }))
            .not.toBe(clefFamilyKey({ preferredClef: 'alto', rangeMode: 'Alto' }));
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
    it('family patch resolves the default clef + range mode; vocal resets transposition to C', () => {
        expect(patchForFamily('g')).toEqual({ preferredClef: 'treble', rangeMode: 'STANDARD' });
        expect(patchForFamily('f')).toEqual({ preferredClef: 'bass', rangeMode: 'STANDARD' });
        // Vocal clefs are never transposing → switching into vocal resets to concert C.
        expect(patchForFamily('vocal')).toEqual({ preferredClef: 'alto', rangeMode: 'Alto', transpositionKey: 'C', transpositionOctave: 0 });
        // Melodic families leave transposition untouched.
        expect(patchForFamily('g').transpositionKey).toBeUndefined();
    });
    it('octave patch maps to the relative rangeModes', () => {
        expect(patchForOctave('g', 'treble8va')).toEqual({ preferredClef: 'treble', rangeMode: 'relative' });
        expect(patchForOctave('f', 'bass8vb')).toEqual({ preferredClef: 'bass', rangeMode: 'relative_low' });
        expect(patchForOctave('g', 'treble')).toEqual({ preferredClef: 'treble', rangeMode: 'STANDARD' });
        expect(patchForOctave('g', 'nope')).toBeNull();
    });
    it('vocal patch sets the chosen voice clef + rangeMode, resetting transposition to C', () => {
        expect(patchForVocal('tenor')).toEqual({ preferredClef: 'tenor', rangeMode: 'Tenor', transpositionKey: 'C' });
        // Bass vs Baritone share the F-clef but stay distinct voices.
        expect(patchForVocal({ clef: 'bass', rangeMode: 'Baritone' }))
            .toEqual({ preferredClef: 'bass', rangeMode: 'Baritone', transpositionKey: 'C' });
    });
    it('transposition patch sets the key + octave (defaults to C, octave 0)', () => {
        expect(patchForTransposition('Bb')).toEqual({ transpositionKey: 'Bb', transpositionOctave: 0 });
        expect(patchForTransposition(null)).toEqual({ transpositionKey: 'C', transpositionOctave: 0 });
        expect(patchForTransposition('C', -1)).toEqual({ transpositionKey: 'C', transpositionOctave: -1 });
    });
});

