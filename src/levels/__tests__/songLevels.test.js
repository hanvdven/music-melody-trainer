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
    // from the 4/4-only levels 1-9 silently broke for the 3/4 songs (arirang, scarborough-fair). Was
    // derived per-song from LEVEL_LEAD_IN_BARS (a fixed 2) measures' worth of quarter-beats.
    //
    // #994 (Han 2026-08-14/17, "flexible on screen notes"): the span is no longer a fixed 2 measures —
    // it is derived from each song's TEMPO as well as its meter, targeting ~6s of on-screen time, so a
    // short 2/4 bar no longer scrolls three times faster than a 4/4 one. Kalinka was the motivating
    // case: 4 measures on screen (2 bars' worth of quarter-beats is the same 8, but spread over 4 short
    // bars instead of 2). See levelSpan.test.js for the formula itself; this only pins the 7 songs'
    // resulting values so a song's tempo/meter metadata changing can't silently shift its scroll speed.
    it('beatsOnScreen + visible span are derived per song from its own tempo AND meter (#994)', () => {
        const expected = {
            arirang: { bpm: 90, ts: [3, 4], visible: 3, beatsOnScreen: 9 },
            'frere-jacques': { bpm: 90, ts: [4, 4], visible: 2, beatsOnScreen: 8 },
            kalinka: { bpm: 90, ts: [2, 4], visible: 4, beatsOnScreen: 8 },
            'kangding-qingge': { bpm: 90, ts: [2, 4], visible: 4, beatsOnScreen: 8 },
            'la-bamba': { bpm: 150, ts: [4, 4], visible: 4, beatsOnScreen: 16 },
            sakura: { bpm: 72, ts: [4, 4], visible: 2, beatsOnScreen: 8 },
            'scarborough-fair': { bpm: 90, ts: [3, 4], visible: 3, beatsOnScreen: 9 },
        };
        SONG_LEVEL_IDS.forEach((id) => {
            const lvl = LEVELS[id];
            const exp = expected[lvl.songId];
            expect(lvl.bpm, `${lvl.songId} bpm`).toBe(exp.bpm);
            expect(lvl.timeSignature, `${lvl.songId} ts`).toEqual(exp.ts);
            expect(lvl.beatsOnScreen, `${lvl.songId} beatsOnScreen`).toBe(exp.beatsOnScreen);
            expect(lvl.visibleMeasures, `${lvl.songId} visibleMeasures`).toBe(exp.visible);
            expect(lvl.leadInBars, `${lvl.songId} leadInBars`).toBe(exp.visible);
        });
    });

    // #994: Kalinka is the ticket's motivating example, so its lead-in is pinned explicitly.
    // Han's corrected design after his live UAT (2026-08-17): "alle opmaten cello+timpanen. de tweede
    // helft (round up) + metronoom erbij" — all 4 lead-in measures (-3..0) carry cello+timpani, NONE is
    // silent, and the metronome joins for the second half (measures -1 and 0). An earlier pass instead
    // left -3/-2 silent and delayed cello to -1; Han heard the backing start too late and rejected it.
    it('Kalinka (2/4): all 4 lead-in measures are scored, metronome joins for the last 2', () => {
        const kalinka = LEVELS[202];
        expect(kalinka.songId).toBe('kalinka');
        expect(kalinka.visibleMeasures).toBe(4);
        expect(kalinka.leadInBars).toBe(4);
        expect(kalinka.metronomeBars).toBe(2);
        // The rejected concepts must not come back.
        expect(kalinka.silentLeadInBars).toBeUndefined();
        expect(kalinka.countInBars).toBeUndefined();
        expect(kalinka.celloOnlyBars).toBeUndefined();
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
