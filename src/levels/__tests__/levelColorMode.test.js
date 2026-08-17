import { describe, it, expect } from 'vitest';
import { LEVELS, DEFAULT_LEVEL_COLOR_MODE } from '../levels';

// #1045 (Han 2026-08-17, "Voeg color mode toe aan de settings van een level. Zet standaard op subtle
// chroma"): `normalizeLevel` always fills a `colorMode` field, same "explicit field wins, else derived"
// convention as `beatsOnScreen`/`numRepeats` (§231/§248).
// #1049 follow-up (Han 2026-08-17, "scale x subtle chroma... laat dat de default zijn voor alle levels
// die ik nu heb"): default changed from plain 'subtle-chroma' to the new 'scale-subtle-chroma' hybrid.
describe('levels.js — colorMode (#1045/#1049)', () => {
    it('DEFAULT_LEVEL_COLOR_MODE is scale-subtle-chroma (Han\'s updated explicit default)', () => {
        expect(DEFAULT_LEVEL_COLOR_MODE).toBe('scale-subtle-chroma');
    });

    it('every normalized level gets a colorMode — the default, since no level authors one yet', () => {
        Object.values(LEVELS).forEach((lvl) => {
            expect(lvl.colorMode).toBe(DEFAULT_LEVEL_COLOR_MODE);
        });
    });
});
