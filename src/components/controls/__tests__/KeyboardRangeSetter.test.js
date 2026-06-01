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

describe('buildPresetBracketRows', () => {
    it('aligns bracket x to the selector white-key grid', () => {
        const win = windowNaturals(getNoteValue('B4'), getNoteValue('B4'), 14);
        const rows = buildPresetBracketRows(PRESETS, { min: 'C4', max: 'E5' }, 'treble', win);
        const std = rows.find(r => r.p.label === 'STANDARD' && r.p.clef === 'treble');
        const c4Idx = win.findIndex(n => n.midi === getNoteValue('C4'));
        const e5Idx = win.findIndex(n => n.midi === getNoteValue('E5'));
        expect(std.x0).toBe(c4Idx);
        expect(std.x1).toBe(e5Idx + 1);
    });

    it('groups treble band above bass band, big-on-top within each', () => {
        // Wide window so all six survive the cull.
        const win = windowNaturals(getNoteValue('C2'), getNoteValue('C6'), 4);
        const rows = buildPresetBracketRows(PRESETS, { min: 'C4', max: 'E5' }, 'treble', win);
        const y = (label, clef) => rows.find(r => r.p.label === label && r.p.clef === clef).yTop;
        // Treble band (rows 0-2) entirely above the bass band (rows 3-5).
        expect(Math.max(y('STANDARD', 'treble'), y('FULL', 'treble')))
            .toBeLessThan(Math.min(y('FULL', 'bass'), y('STANDARD', 'bass')));
        // FULL (widest) sits above LARGE above STANDARD within the treble band.
        expect(y('FULL', 'treble')).toBeLessThan(y('LARGE', 'treble'));
        expect(y('LARGE', 'treble')).toBeLessThan(y('STANDARD', 'treble'));
    });

    it('flags only the active clef + matching preset', () => {
        const win = windowNaturals(getNoteValue('B4'), getNoteValue('B4'), 18);
        const rows = buildPresetBracketRows(PRESETS, { min: 'C4', max: 'G5' }, 'treble', win);
        expect(rows.find(r => r.p.label === 'LARGE' && r.p.clef === 'treble').isActive).toBe(true);
        // Same min/max on a bass preset would NOT be active (wrong clef).
        expect(rows.every(r => r.p.clef === 'bass' ? !r.isActive : true)).toBe(true);
    });

    it('marks current-clef brackets so off-clef ones can be dimmed', () => {
        const win = windowNaturals(getNoteValue('D3'), getNoteValue('D3'), 14);
        const rows = buildPresetBracketRows(PRESETS, { min: 'A2', max: 'C4' }, 'bass', win);
        expect(rows.filter(r => r.isCurrentClef).every(r => r.p.clef === 'bass')).toBe(true);
    });

    it('drops presets fully outside the window', () => {
        // Narrow window high up: bass presets (≤ E4) are entirely below it.
        const win = windowNaturals(getNoteValue('C6'), getNoteValue('C6'), 3);
        const rows = buildPresetBracketRows(PRESETS, { min: 'C4', max: 'E5' }, 'treble', win);
        expect(rows.some(r => r.p.clef === 'bass')).toBe(false);
    });
});
