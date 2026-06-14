import { describe, it, expect } from 'vitest';
import { getNoteValue, getNoteFromValue, clampRange, naturalsInRange, windowNaturals, applyRangeBoundary } from '../rangeUtils';

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

    describe('naturalsInRange', () => {
        it('returns only white-key naturals in order', () => {
            const ns = naturalsInRange(60, 72); // C4..C5
            expect(ns.map(n => n.name)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']);
        });
    });

    describe('windowNaturals', () => {
        it('includes `context` naturals beyond each boundary, balanced', () => {
            const win = windowNaturals(60, 72, 3); // C4..C5 + 3 context each side
            const midis = win.map(n => n.midi);
            expect(midis.filter(m => m < 60).length).toBe(3);
            expect(midis.filter(m => m > 72).length).toBe(3);
        });
        it('caps at the piano edges (A0..C8)', () => {
            const win = windowNaturals(getNoteValue('A0'), getNoteValue('C2'), 3);
            expect(win[0].midi).toBe(getNoteValue('A0')); // no naturals below A0
        });
    });

    describe('applyRangeBoundary', () => {
        it('moves the requested boundary and clamps the span', () => {
            const { range } = applyRangeBoundary({ min: 'C4', max: 'E5' }, getNoteValue('G4'), 'min');
            // min moved to G4 (67); span < 12 → max pushed to G5 (79).
            expect(range.min).toBe('G4');
            expect(getNoteValue(range.max)).toBe(79);
        });
        it('labels a matching preset, else CUSTOM', () => {
            const presets = [{ label: 'STANDARD', min: 'C4', max: 'E5' }];
            expect(applyRangeBoundary({ min: 'C4', max: 'D5' }, getNoteValue('E5'), 'max', presets).rangeMode).toBe('STANDARD');
            expect(applyRangeBoundary({ min: 'C4', max: 'D5' }, getNoteValue('F5'), 'max', presets).rangeMode).toBe('CUSTOM');
        });
    });
});
