import { describe, it, expect } from 'vitest';
import { LEVELS, DEFAULT_LEVEL_COLOR_MODE } from '../levels';

// #1045 (Han 2026-08-17, "Voeg color mode toe aan de settings van een level. Zet standaard op subtle
// chroma"): `normalizeLevel` always fills a `colorMode` field, same "explicit field wins, else derived"
// convention as `beatsOnScreen`/`numRepeats` (§231/§248).
describe('levels.js — colorMode (#1045)', () => {
    it('DEFAULT_LEVEL_COLOR_MODE is subtle-chroma (Han\'s explicit default)', () => {
        expect(DEFAULT_LEVEL_COLOR_MODE).toBe('subtle-chroma');
    });

    it('every normalized level gets a colorMode — the default, since no level authors one yet', () => {
        Object.values(LEVELS).forEach((lvl) => {
            expect(lvl.colorMode).toBe(DEFAULT_LEVEL_COLOR_MODE);
        });
    });
});
