import { describe, it, expect } from 'vitest';
import { LEVELS, wavesForLevel } from '../levels';
import SONGS from '../../songs/songIndex.js';
import { findCreatureByName, findIdleAnim, findMoveAnim } from '../../model/bestiaryAssets';

// #871 (Han 2026-08-11, "abc music en level namen"): 7 named RPG levels (200-206) that each play a FIXED
// song (via `songId`) instead of procedural generation, with an optional decorative `npc`. These tests
// guard the two mechanisms levels.js added for this feature: `songLevelDefaults`'s back-fill (applied
// inside `normalizeLevel`, not directly exported — verified here via its effect on `LEVELS`) and the
// `npc` bestiary-name lookup staying in sync with the generated manifest.
const SONG_IDS = ['arirang', 'frere-jacques', 'kalinka', 'kangding-qingge', 'la-bamba', 'sakura', 'scarborough-fair'];
const SONG_LEVEL_IDS = [200, 201, 202, 203, 204, 205, 206];

describe('levels.js — fixed-song levels 200-206 (#871)', () => {
    it('ids 200-206 are present, unique, and each carries a songId that resolves to a real song', () => {
        const seen = new Set();
        SONG_LEVEL_IDS.forEach((id) => {
            const lvl = LEVELS[id];
            expect(lvl, `LEVELS[${id}] missing`).toBeTruthy();
            expect(lvl.songId).toEqual(expect.any(String));
            expect(SONGS.some((s) => s.id === lvl.songId)).toBe(true);
            expect(seen.has(lvl.id)).toBe(false);
            seen.add(lvl.id);
        });
        expect(SONG_LEVEL_IDS.every((id) => SONGS.some((s) => s.id === LEVELS[id].songId))).toBe(true);
    });

    it('all 7 abc songs are registered in songIndex and used by exactly one level', () => {
        SONG_IDS.forEach((songId) => {
            expect(SONGS.some((s) => s.id === songId)).toBe(true);
            const usedBy = SONG_LEVEL_IDS.filter((id) => LEVELS[id].songId === songId);
            expect(usedBy.length).toBe(1);
        });
    });

    it('bpm/timeSignature/numMeasures/notesPerMeasure/range/key are back-filled from the song definition', () => {
        SONG_LEVEL_IDS.forEach((id) => {
            const lvl = LEVELS[id];
            const songDef = SONGS.find((s) => s.id === lvl.songId);
            expect(lvl.bpm).toBe(songDef.defaultTempo);
            expect(lvl.timeSignature).toEqual(songDef.timeSignature);
            expect(lvl.numMeasures).toBe(songDef.numMeasures);
            expect(lvl.notesPerMeasure).toBe(songDef.generator.trebleSettings.notesPerMeasure);
            expect(lvl.key).toEqual({ tonic: `${songDef.defaultTonic}4`, mode: songDef.generator.scaleMode });
            expect(lvl.range.min).toEqual(expect.any(String));
            expect(lvl.range.max).toEqual(expect.any(String));
        });
    });

    // Bug fix (Han 2026-08-11, #871 follow-up: "scarborough fair: de noten komen na 8 kwart-tellen; dat
    // moet zijn na 2 maten (6 kwarttellen)"): `beatsOnScreen` is always counted in QUARTER-note beats
    // (SheetRpgLayer's beatMs=60000/bpm), not the time signature's own numerator — a literal "8" copied
    // from the 4/4-only levels 1-9 silently broke for the 3/4 songs (arirang, scarborough-fair). Now
    // derived per-song from LEVEL_LEAD_IN_BARS measures' worth of quarter-beats.
    it('beatsOnScreen is derived as 2 measures worth of QUARTER-note beats for the song\'s own time signature', () => {
        const expected = { arirang: 6, 'frere-jacques': 8, kalinka: 4, 'kangding-qingge': 4, 'la-bamba': 8, sakura: 8, 'scarborough-fair': 6 };
        SONG_LEVEL_IDS.forEach((id) => {
            const lvl = LEVELS[id];
            expect(lvl.beatsOnScreen).toBe(expected[lvl.songId]);
        });
    });

    it('each fixed-song level clears in exactly 1 wave (the whole song, no mid-level regeneration)', () => {
        SONG_LEVEL_IDS.forEach((id) => {
            expect(wavesForLevel(LEVELS[id])).toBe(1);
        });
    });

    it('every npc name (Frère Jacques/Kalinka/Sakura/Scarborough Fair) resolves via findCreatureByName to a variant with a non-empty idle or move animation', () => {
        const npcLevels = SONG_LEVEL_IDS.map((id) => LEVELS[id]).filter((lvl) => lvl.npc);
        expect(npcLevels.length).toBe(4);
        npcLevels.forEach((lvl) => {
            const variant = findCreatureByName(lvl.npc);
            expect(variant, `no bestiary entry for npc "${lvl.npc}"`).toBeTruthy();
            const anim = findIdleAnim(variant) || findMoveAnim(variant);
            expect(anim, `no idle/move animation for npc "${lvl.npc}"`).toBeTruthy();
            expect(anim.cells.length).toBeGreaterThan(0);
        });
    });

    it('Arirang, Kangding Qingge, La Bamba have no npc (per ticket text: "de rest hoeft geen npc")', () => {
        expect(LEVELS[200].npc).toBeFalsy();
        expect(LEVELS[203].npc).toBeFalsy();
        expect(LEVELS[204].npc).toBeFalsy();
    });

    it('normalizeLevel does not add song-derived fields to an existing level without songId (no regression)', () => {
        // Level 1 has no songId — its range/key/bpm come straight from levels.json, unaffected by the
        // #871 songLevelDefaults back-fill (which only runs `if (lvl.songId)`).
        expect(LEVELS[1].songId).toBeUndefined();
        expect(LEVELS[1].bpm).toBe(80);
    });
});
