import { describe, it, expect } from 'vitest';
import { buildPresetBracketRows, PRESET_VIEW_W } from '../KeyboardRangeSetter';

// Treble presets (subset of PRESET_RANGES), widest = FULL.
const PRESETS = [
    { label: 'STANDARD', min: 'C4', max: 'E5' },
    { label: 'LARGE', min: 'C4', max: 'G5' },
    { label: 'FULL', min: 'A3', max: 'C6' },
];

describe('buildPresetBracketRows', () => {
    it('always yields a bracket for EVERY preset (reachability invariant)', () => {
        // Even with the selection at an extreme far from every preset.
        const rows = buildPresetBracketRows(PRESETS, { min: 'C7', max: 'C8' });
        expect(rows).toHaveLength(PRESETS.length);
        expect(rows.every(r => r.x1 > r.x0)).toBe(true);
    });

    it('orders narrowest-first and sizes width by pitch span (widest = FULL)', () => {
        const rows = buildPresetBracketRows(PRESETS, { min: 'C4', max: 'E5' });
        expect(rows.map(r => r.p.label)).toEqual(['STANDARD', 'LARGE', 'FULL']);
        const widths = rows.map(r => r.x1 - r.x0);
        expect(widths[0]).toBeLessThan(widths[1]);
        expect(widths[1]).toBeLessThan(widths[2]);
        // All centred in the strip.
        rows.forEach(r => expect((r.x0 + r.x1) / 2).toBeCloseTo(PRESET_VIEW_W / 2));
    });

    it('flags the matching preset active', () => {
        const rows = buildPresetBracketRows(PRESETS, { min: 'C4', max: 'G5' });
        expect(rows.find(r => r.p.label === 'LARGE').isActive).toBe(true);
        expect(rows.find(r => r.p.label === 'STANDARD').isActive).toBe(false);
    });
});
