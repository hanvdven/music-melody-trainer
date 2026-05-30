import { describe, it, expect } from 'vitest';
import { getNoteValue, getNoteFromValue, clampRange } from '../rangeUtils';

describe('rangeUtils', () => {
    describe('getNoteValue', () => {
        it('maps C4 to MIDI 60', () => {
            expect(getNoteValue('C4')).toBe(60);
        });
        it('round-trips with getNoteFromValue for a natural note', () => {
            expect(getNoteFromValue(getNoteValue('A3'))).toBe('A3');
        });
        it('falls back to 60 for unparseable input', () => {
            expect(getNoteValue('')).toBe(60);
            expect(getNoteValue('nonsense')).toBe(60);
        });
    });

    describe('clampRange', () => {
        it('enforces the 12-semitone minimum span by pushing the opposite side', () => {
            // user moved max down to within 5 semitones of min → min gets pushed down
            expect(clampRange(60, 65, 'max')).toEqual({ min: 53, max: 65 });
            // user moved min up to within 5 semitones of max → max gets pushed up
            expect(clampRange(60, 65, 'min')).toEqual({ min: 60, max: 72 });
        });
        it('clamps to the hard 21..108 bounds', () => {
            expect(clampRange(10, 40, 'min')).toEqual({ min: 21, max: 40 });
            expect(clampRange(80, 120, 'max')).toEqual({ min: 80, max: 108 });
        });
        it('leaves a valid range untouched', () => {
            expect(clampRange(60, 76, 'max')).toEqual({ min: 60, max: 76 });
        });
    });
});
