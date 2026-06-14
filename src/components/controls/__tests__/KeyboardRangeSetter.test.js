import { describe, it, expect } from 'vitest';
import { buildPresetBracketRows } from '../KeyboardRangeSetter';
import { windowNaturals, getNoteValue } from '../../../utils/rangeUtils';

// Six presets: G-clef + F-clef × STANDARD/LARGE/FULL, each tagged with its clef.
const PRESETS = [
    { label: 'STANDARD', clef: 'treble', min: 'C4', max: 'E5' },
    { label: 'LARGE', clef: 'treble', min: 'C4', max: 'G5' },
    { label: 'FULL', clef: 'treble', min: 'A3', max: 'C6' },
    { label: 'STANDARD', clef: 'bass', min: 'A2', max: 'C4' },
    { label: 'LARGE', clef: 'bass', min: 'G2', max: 'C4' },
    { label: 'FULL', clef: 'bass', min: 'C2', max: 'E4' },
];

const find = (rows, label, clef) => rows.find(r => r.p.label === label && r.p.clef === clef);

describe('buildPresetBracketRows', () => {
    it('aligns bracket x to the selector white-key grid', () => {
        const win = windowNaturals(getNoteValue('C4'), getNoteValue('E5'), 6);
        const rows = buildPresetBracketRows(PRESETS, { min: 'C4', max: 'E5' }, 'treble', win);
        const std = find(rows, 'STANDARD', 'treble');
        const c4Idx = win.findIndex(n => n.midi === getNoteValue('C4'));
        const e5Idx = win.findIndex(n => n.midi === getNoteValue('E5'));
        expect(std.x0).toBe(c4Idx);
        expect(std.x1).toBe(e5Idx + 1);
    });

    it('shares three rows by size (both clefs same y per size)', () => {
        const win = windowNaturals(getNoteValue('C2'), getNoteValue('C6'), 4);
        const rows = buildPresetBracketRows(PRESETS, { min: 'C4', max: 'E5' }, 'treble', win);
        // Same-size brackets of different clefs sit on the same row.
        expect(find(rows, 'FULL', 'treble').yTop).toBe(find(rows, 'FULL', 'bass').yTop);
        expect(find(rows, 'STANDARD', 'treble').yTop).toBe(find(rows, 'STANDARD', 'bass').yTop);
        // FULL above LARGE above STANDARD.
        expect(find(rows, 'FULL', 'treble').yTop).toBeLessThan(find(rows, 'LARGE', 'treble').yTop);
        expect(find(rows, 'LARGE', 'treble').yTop).toBeLessThan(find(rows, 'STANDARD', 'treble').yTop);
    });

    it('paints behind (off-clef) before front (current clef) within a size', () => {
        const win = windowNaturals(getNoteValue('C2'), getNoteValue('C6'), 4);
        const rows = buildPresetBracketRows(PRESETS, { min: 'C4', max: 'E5' }, 'treble', win);
        const fullBassIdx = rows.indexOf(find(rows, 'FULL', 'bass'));
        const fullTrebleIdx = rows.indexOf(find(rows, 'FULL', 'treble'));
        expect(fullBassIdx).toBeLessThan(fullTrebleIdx);   // behind drawn first
    });

    it('records a gap (for the dotted bridge) where the behind bracket is cut', () => {
        const win = windowNaturals(getNoteValue('C2'), getNoteValue('C6'), 4);
        const rows = buildPresetBracketRows(PRESETS, { min: 'C4', max: 'E5' }, 'treble', win);
        // FULL treble A3–C6 overlaps FULL bass C2–E4; the bass one is cut + a gap to
        // the front bracket is recorded for the dotted line.
        const fullBass = find(rows, 'FULL', 'bass');
        expect(fullBass.gap).not.toBeNull();
        expect(fullBass.gap.x1).toBe(find(rows, 'FULL', 'treble').x0);
        expect(fullBass.x1).toBeLessThanOrEqual(find(rows, 'FULL', 'treble').x0);
    });

    it('flags only the active clef + matching preset', () => {
        const win = windowNaturals(getNoteValue('C4'), getNoteValue('G5'), 8);
        const rows = buildPresetBracketRows(PRESETS, { min: 'C4', max: 'G5' }, 'treble', win);
        expect(find(rows, 'LARGE', 'treble').isActive).toBe(true);
        expect(rows.every(r => r.p.clef === 'bass' ? !r.isActive : true)).toBe(true);
    });

    it('swaps front/behind when the bass clef is active', () => {
        const win = windowNaturals(getNoteValue('A2'), getNoteValue('C4'), 6);
        const rows = buildPresetBracketRows(PRESETS, { min: 'A2', max: 'C4' }, 'bass', win);
        expect(find(rows, 'STANDARD', 'bass').isCurrentClef).toBe(true);
        expect(find(rows, 'STANDARD', 'treble').isCurrentClef).toBe(false);
    });

    it('drops presets fully outside the window', () => {
        const win = windowNaturals(getNoteValue('C6'), getNoteValue('C6'), 3);
        const rows = buildPresetBracketRows(PRESETS, { min: 'C4', max: 'E5' }, 'treble', win);
        expect(rows.some(r => r.p.clef === 'bass')).toBe(false);
    });
});
