import { describe, it, expect } from 'vitest';
import { buildPresetBracketRows } from '../KeyboardRangeSetter';
import { windowNaturals, getNoteValue } from '../../../utils/rangeUtils';

const PRESETS = [
    { label: 'STANDARD', min: 'C4', max: 'E5' },
    { label: 'LARGE', min: 'C4', max: 'G5' },
    { label: 'FULL', min: 'A3', max: 'C6' },
];

describe('buildPresetBracketRows', () => {
    it('aligns bracket x to the selector white-key grid', () => {
        const win = windowNaturals(getNoteValue('C4'), getNoteValue('E5'), 4);
        const rows = buildPresetBracketRows(PRESETS, { min: 'C4', max: 'E5' }, win);
        const std = rows.find(r => r.p.label === 'STANDARD');
        // STANDARD spans C4..E5; x0 is the C4 white-key index, x1 one past E5's.
        const c4Idx = win.findIndex(n => n.midi === getNoteValue('C4'));
        const e5Idx = win.findIndex(n => n.midi === getNoteValue('E5'));
        expect(std.x0).toBe(c4Idx);
        expect(std.x1).toBe(e5Idx + 1);
    });

    it('orders widest-first (big on top)', () => {
        const win = windowNaturals(getNoteValue('A3'), getNoteValue('C6'), 4);
        const rows = buildPresetBracketRows(PRESETS, { min: 'C4', max: 'E5' }, win);
        expect(rows.map(r => r.p.label)).toEqual(['FULL', 'LARGE', 'STANDARD']);
        expect(rows[0].yTop).toBeLessThan(rows[2].yTop);
    });

    it('hides presets that fall entirely outside the window', () => {
        // Window way up high — every preset (≤ C6) is below it.
        const win = windowNaturals(getNoteValue('C7'), getNoteValue('C8'), 3);
        expect(buildPresetBracketRows(PRESETS, { min: 'C7', max: 'C8' }, win)).toHaveLength(0);
    });

    it('flags the matching preset active', () => {
        const win = windowNaturals(getNoteValue('C4'), getNoteValue('G5'), 4);
        const rows = buildPresetBracketRows(PRESETS, { min: 'C4', max: 'G5' }, win);
        expect(rows.find(r => r.p.label === 'LARGE').isActive).toBe(true);
        expect(rows.find(r => r.p.label === 'STANDARD').isActive).toBe(false);
    });
});
