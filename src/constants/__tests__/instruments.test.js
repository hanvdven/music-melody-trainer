import { describe, it, expect } from 'vitest';
import {
    INSTRUMENT_GROUPS, INSTRUMENT_LIST, INSTRUMENTS,
    getInstrumentIconUrl, getIconUrlByBasename, categoryColorVar,
    instrumentNameForSlug, instrumentFullLabel, ICON_ATTRIBUTION,
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
        // Re-categorised 2026-06-22: group 'keys', card name 'grand piano'.
        expect(INSTRUMENTS['keys — grand piano']).toBe('acoustic_grand_piano');
    });

    it('each item splits into a short card `name` and a top-category `group` bracket', () => {
        // Card name is the short variant (e.g. 'nylon'); group is the bracket header.
        // Re-categorised 2026-06-22: group is now the bare top category ('guitars').
        const nylon = INSTRUMENT_LIST.find(it => it.slug === 'acoustic_guitar_nylon');
        expect(nylon.name).toBe('nylon');
        expect(nylon.group).toBe('guitars');
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

    it('maps each top category to its --cat-* CSS var (Task B colouring)', () => {
        // categoryColorVar reads the category STRING off an item (§6c — no slug→colour table) and
        // returns the matching CSS var. Every top category in the data must resolve to a var.
        const topCategories = [...new Set(INSTRUMENT_LIST.map(it => it.family))];
        for (const cat of topCategories) {
            const v = categoryColorVar(cat);
            expect(v).toBe(`var(--cat-${cat.replace(/ /g, '-')})`);
        }
        // Unknown category → caller-supplied fallback (default --text-primary).
        expect(categoryColorVar('nope')).toBe('var(--text-primary)');
        expect(categoryColorVar('nope', 'var(--text-lowlight)')).toBe('var(--text-lowlight)');
    });

    it('getIconUrlByBasename resolves existing basenames + falls back for unknown', () => {
        // The shared low-level icon resolver (reused by the kit carousel). Existing assets resolve.
        expect(getIconUrlByBasename('grand-piano')).toBeTruthy();
        expect(getIconUrlByBasename('drum-set')).toMatch(/drum-set/);
        expect(getIconUrlByBasename('drums')).toMatch(/drums/);
        // Unknown basename → grand-piano fallback (never undefined).
        expect(getIconUrlByBasename('definitely-not-an-icon')).toBeTruthy();
    });
});
