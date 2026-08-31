import { describe, it, expect } from 'vitest';
import { scaleDefinitions } from '../scaleHandler';
import { SCALE_ICON_MAP, SCALE_FAMILY_ORDER, SCALE_HEPTA_REF } from '../scaleIconMap.generated';
import { buildScaleGrid, getScaleIcon } from '../scaleIcons';

const MODAL = ['Diatonic', 'Melodic', 'Harmonic Major', 'Harmonic Minor', 'Double Harmonic'];

describe('scaleIconMap.generated', () => {
    it('maps every scale in scaleHandler exactly once', () => {
        const allKeys = Object.entries(scaleDefinitions)
            .flatMap(([fam, arr]) => arr.map((s) => `${fam}|${s.name}`));
        for (const key of allKeys) expect(SCALE_ICON_MAP[key], `missing ${key}`).toBeTruthy();
        // no stray keys
        expect(Object.keys(SCALE_ICON_MAP).sort()).toEqual([...allKeys].sort());
    });

    it('every entry names a real renamed png, an animal, and a hepta-ref colour from the legend', () => {
        const legendColours = new Set(SCALE_HEPTA_REF.map((h) => h.colour));
        for (const [key, e] of Object.entries(SCALE_ICON_MAP)) {
            expect(e.icon, key).toMatch(/^[a-z0-9-]+_[a-z0-9-]+\.png$/);
            expect(e.animal, key).toBeTruthy();
            expect(e.heptaNum, key).toBeGreaterThanOrEqual(1);
            expect(e.heptaNum, key).toBeLessThanOrEqual(7);
            expect(legendColours.has(e.colour), `${key} colour ${e.colour}`).toBe(true);
        }
    });

    it('SCALE_HEPTA_REF has 7 degrees, each a 5-shade palette', () => {
        expect(SCALE_HEPTA_REF).toHaveLength(7);
        for (const h of SCALE_HEPTA_REF) {
            expect(h.palette).toHaveLength(5);
            expect(h.palette.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
            expect(h.palette[2]).toBe(h.colour);
        }
    });

    it('SCALE_FAMILY_ORDER is Han\'s row order', () => {
        expect(SCALE_FAMILY_ORDER).toEqual([
            'Pentatonic', 'Hexatonic', 'Diatonic', 'Melodic', 'Harmonic Minor',
            'Harmonic Major', 'Double Harmonic', 'Other Heptatonic', 'Supertonic',
        ]);
        expect(new Set(SCALE_FAMILY_ORDER)).toEqual(new Set(Object.keys(scaleDefinitions)));
    });
});

describe('buildScaleGrid', () => {
    const grid = buildScaleGrid();

    it('one row per family, in SCALE_FAMILY_ORDER', () => {
        expect(grid.map((r) => r.family)).toEqual(SCALE_FAMILY_ORDER);
    });

    it('modal families have 7 filled cells with a Roman numeral', () => {
        for (const row of grid.filter((r) => MODAL.includes(r.family))) {
            expect(row.modal).toBe(true);
            expect(row.cells).toHaveLength(7);
            row.cells.forEach((c, i) => {
                expect(c, `${row.family}[${i}]`).toBeTruthy();
                expect(c.mode).toBe(i + 1);
                expect(c.roman).toBe(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][i]);
                expect(c.code).toBeTruthy();
            });
        }
    });

    it('non-modal families list one cell per scale, no Roman numeral, sorted Ionian→Locrian', () => {
        for (const row of grid.filter((r) => !MODAL.includes(r.family))) {
            expect(row.modal).toBe(false);
            expect(row.cells).toHaveLength(scaleDefinitions[row.family].length);
            const heptas = row.cells.map((c) => c.heptaNum);
            expect(heptas, row.family).toEqual([...heptas].sort((a, b) => a - b));
            for (const c of row.cells) {
                expect(c.roman).toBeNull();
                expect(c.animal).toBeTruthy();
            }
        }
    });
});

describe('getScaleIcon', () => {
    it('resolves a known scale and returns null for an unknown one', () => {
        expect(getScaleIcon('Diatonic', 'Major')).toMatchObject({ code: 'D1', animal: 'Lion' });
        expect(getScaleIcon('Diatonic', 'Not A Scale')).toBeNull();
    });
});
