import { describe, it, expect } from 'vitest';
import {
    INSTRUMENT_GROUPS, INSTRUMENT_LIST, INSTRUMENTS,
    getInstrumentIconUrl, instrumentNameForSlug, instrumentFullLabel, ICON_ATTRIBUTION,
} from '../instruments';

describe('constants/instruments', () => {
    it('groups every instrument and the flat list matches', () => {
        const grouped = INSTRUMENT_GROUPS.flatMap(g => g.items);
        expect(INSTRUMENT_LIST.length).toBe(grouped.length);
        // Extended past the original 13 (Han 2026-06-16).
        expect(INSTRUMENT_LIST.length).toBeGreaterThan(13);
    });

    it('derives the flat INSTRUMENTS label→slug map from the groups (single source)', () => {
        // Keyed by the self-sufficient "group — name" label (Han 2026-06-18) so RangeControls'
        // stepper reads unambiguously even though the carousel card shows only the short name.
        for (const it of INSTRUMENT_LIST) {
            expect(INSTRUMENTS[instrumentFullLabel(it)]).toBe(it.slug);
        }
        // The grand piano is the canonical default slug; its full label disambiguates the card.
        expect(INSTRUMENTS['keys (piano) — grand']).toBe('acoustic_grand_piano');
    });

    it('each item splits into a short card `name` and a "family (subgroup)" `group` bracket', () => {
        // Card name is the short variant (e.g. 'nylon'); group is the bracket header
        // (e.g. 'strings (guitar)'). Han 2026-06-18.
        const nylon = INSTRUMENT_LIST.find(it => it.slug === 'acoustic_guitar_nylon');
        expect(nylon.name).toBe('nylon');
        expect(nylon.group).toBe('strings (guitar)');
        // Every item carries both fields.
        for (const it of INSTRUMENT_LIST) {
            expect(typeof it.name).toBe('string');
            expect(typeof it.group).toBe('string');
        }
    });

    it('every slug resolves an icons8 icon URL and a self-sufficient display label', () => {
        for (const it of INSTRUMENT_LIST) {
            expect(getInstrumentIconUrl(it.slug)).toBeTruthy();
            // instrumentNameForSlug now returns the disambiguated "group — name" label.
            expect(instrumentNameForSlug(it.slug)).toBe(instrumentFullLabel(it));
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
