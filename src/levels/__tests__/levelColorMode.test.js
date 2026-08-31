import { describe, it, expect } from 'vitest';
import { LEVELS, DEFAULT_LEVEL_COLOR_SCHEME, DEFAULT_LEVEL_COLOR_SCOPE } from '../levels';

// #1045 (Han 2026-08-17, "Voeg color mode toe aan de settings van een level. Zet standaard op subtle
// chroma"): `normalizeLevel` always fills `colorScheme`/`colorScope` fields, same "explicit field wins,
// else derived" convention as `beatsOnScreen`/`numRepeats` (§231/§248).
// #1049 follow-up (Han 2026-08-17, "scale x subtle chroma... laat dat de default zijn voor alle levels
// die ik nu heb"): default changed from plain 'subtle-chroma'+'all' to 'subtle-chroma'+'scale'.
// #1103 (Han 2026-08-22): the old single `colorMode` field ('scale-subtle-chroma') is now two
// independent fields — see noteUtils.js's own #1103 comment for the full equivalence table.
describe('levels.js — colorScheme/colorScope (#1045/#1049/#1103)', () => {
    it('DEFAULT_LEVEL_COLOR_SCHEME/SCOPE are subtle-chroma+scale (Han\'s updated explicit default)', () => {
        expect(DEFAULT_LEVEL_COLOR_SCHEME).toBe('subtle-chroma');
        expect(DEFAULT_LEVEL_COLOR_SCOPE).toBe('scale');
    });

    it('every normalized level gets colorScheme/colorScope — the default, since no level authors one yet', () => {
        Object.values(LEVELS).forEach((lvl) => {
            expect(lvl.colorScheme).toBe(DEFAULT_LEVEL_COLOR_SCHEME);
            expect(lvl.colorScope).toBe(DEFAULT_LEVEL_COLOR_SCOPE);
        });
    });
});
