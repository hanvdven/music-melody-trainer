import { describe, it, expect } from 'vitest';
import {
    INSTRUMENT_GROUPS, INSTRUMENT_LIST, INSTRUMENTS,
    getInstrumentIconUrl, instrumentNameForSlug, ICON_ATTRIBUTION,
} from '../instruments';

describe('constants/instruments', () => {
    it('groups every instrument and the flat list matches', () => {
        const grouped = INSTRUMENT_GROUPS.flatMap(g => g.items);
        expect(INSTRUMENT_LIST.length).toBe(grouped.length);
        // Extended past the original 13 (Han 2026-06-16).
        expect(INSTRUMENT_LIST.length).toBeGreaterThan(13);
    });

    it('derives the flat INSTRUMENTS name→slug map from the groups (single source)', () => {
        for (const it of INSTRUMENT_LIST) {
            expect(INSTRUMENTS[it.name]).toBe(it.slug);
        }
        // Piano is the canonical default slug.
        expect(INSTRUMENTS['Piano']).toBe('acoustic_grand_piano');
    });

    it('every slug resolves an icons8 icon URL and a display name', () => {
        for (const it of INSTRUMENT_LIST) {
            expect(getInstrumentIconUrl(it.slug)).toBeTruthy();
            expect(instrumentNameForSlug(it.slug)).toBe(it.name);
        }
    });

    it('electric guitar + electric bass both use the Rock Music icon (Han)', () => {
        const eg = getInstrumentIconUrl('electric_guitar_clean');
        const eb = getInstrumentIconUrl('electric_bass_pick');
        expect(eg).toMatch(/rock-music/);
        expect(eb).toMatch(/rock-music/);
    });

    it('credits icons8 (mandatory licence credit)', () => {
        expect(typeof ICON_ATTRIBUTION).toBe('string');
        expect(ICON_ATTRIBUTION).toMatch(/icons8/i);
    });
});
