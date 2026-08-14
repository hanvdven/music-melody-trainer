// #992 (Han: 3 new Playback Settings setters — RPG fx volume / RPG music volume / RPG visibility):
// smoke test for rpgVolumeMultiplier — the pure "relative to the setting's OWN default step" math that
// makes the 3 new setters safe additions on top of 3 already-tuned, UNRELATED existing volume paths.
// The one invariant that MUST hold: at the setting's own default, the multiplier is exactly 1.0, so
// nothing already-tuned changes sound/volume on ship (see the ticket's own design-decision writeup).
import { describe, it, expect } from 'vitest';
import { DEFAULT_RPG_FX_VOLUME, DEFAULT_RPG_MUSIC_VOLUME, rpgVolumeMultiplier } from '../dynamics';

describe('rpgVolumeMultiplier (#992)', () => {
    it('DEFAULT_RPG_FX_VOLUME is mezzo-piano (0.6) and DEFAULT_RPG_MUSIC_VOLUME is mezzo-forte (0.8) — matches Han spec (mp/mf)', () => {
        expect(DEFAULT_RPG_FX_VOLUME).toBeCloseTo(0.6);
        expect(DEFAULT_RPG_MUSIC_VOLUME).toBeCloseTo(0.8);
    });

    it('returns exactly 1.0 when the selected step equals the setting\'s own default — the day-one "nothing changes" invariant', () => {
        expect(rpgVolumeMultiplier(DEFAULT_RPG_FX_VOLUME, DEFAULT_RPG_FX_VOLUME)).toBe(1);
        expect(rpgVolumeMultiplier(DEFAULT_RPG_MUSIC_VOLUME, DEFAULT_RPG_MUSIC_VOLUME)).toBe(1);
    });

    it('scales proportionally away from the default, relative to that default — not the raw 0-1 fraction', () => {
        // fx default is mp (0.6): moving to forte (1.0) is a ~1.67x multiplier, not a raw 1.0 replacement.
        expect(rpgVolumeMultiplier(1.0, DEFAULT_RPG_FX_VOLUME)).toBeCloseTo(1.0 / 0.6);
        // music default is mf (0.8): moving to piano (0.4) halves it relative to its own default.
        expect(rpgVolumeMultiplier(0.4, DEFAULT_RPG_MUSIC_VOLUME)).toBeCloseTo(0.5);
        // moving to "silent" (0) mutes regardless of default.
        expect(rpgVolumeMultiplier(0, DEFAULT_RPG_MUSIC_VOLUME)).toBe(0);
    });

    it('is defensive against a zero default (would otherwise divide by zero / return Infinity)', () => {
        expect(rpgVolumeMultiplier(0.5, 0)).toBe(1);
    });
});
