import { describe, it, expect } from 'vitest';
import {
    LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL7, LEVEL8, LEVEL9, LEVEL10, LEVEL11, LEVEL12, LEVEL13,
    LEVELS, wavesForLevel, totalNotesForLevel, applyLevelVariant,
} from '../levels';
import { blockMeasuresFor, blockCountFor } from '../levelBlockPlan';
import buildTimpaniPattern from '../../utils/timpaniPattern';
import { MELODIC_NOTE_POOLS } from '../../constants/generationFields';

// #661 (Han 2026-08-02, "houd het simpel... introduceer stap voor stap: halve noten, achtste noten,
// verbonden noten, etc." + "maak tussen level 2 en level 3 5 nieuwe levels, dus level 3 schuift door naar
// level 8"): locks in the ramp's structural invariants so a future edit can't silently break the
// id/LEVELS-map consistency or reintroduce cross-level leakage (§91/§92's discipline extended further).
// #679 (Han 2026-08-03): Level 9 (Wizard/projectile combat, since renumbered — see below) added on top —
// same structural checks extended.
//
// #1053 (Han 2026-08-17, "vaste levels 1-4 + renummering"): levels 1-3 are now GATED introductory levels
// (fixed melody / rests / random-uniform — see levelGatedScroll.test.js and songLevels.test.js for their
// own coverage), and level 4 is the former Level 2 relocated unchanged. The note-duration RAMP this file
// tests (quarter-grid -> half notes -> eighth notes -> full richness) now starts at Level 4 and continues
// non-contiguously at 7,8,9,10,11,12 (ids 5/6 were never reused — 4 new slots were inserted, not a blanket
// +4 shift of every old id), with the former Level 9 (Wizard) now at Level 13.
describe('levels.js — ramp from Level 4 (Han 2026-08-02) + Level 13 Wizard (Han 2026-08-03), renumbered #1053', () => {
    it('LEVELS map ids match each level object\'s own id, for the whole main-progression roster', () => {
        const all = [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL7, LEVEL8, LEVEL9, LEVEL10, LEVEL11, LEVEL12, LEVEL13];
        const ids = [1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13];
        // Level editor (Han 2026-08-06): levels.json also carries id 0 (the live-editable sandbox), 14/15/19
        // (Mixed/scale-switch/twoHanded), and 101-120 (hand-editable schema examples) — assert this specific
        // roster is present/correct WITHOUT asserting they're the only keys, so those don't break this check.
        ids.forEach((id) => expect(Object.keys(LEVELS).map(Number)).toContain(id));
        all.forEach((lvl, i) => {
            expect(lvl.id).toBe(ids[i]);
            expect(LEVELS[ids[i]]).toBe(lvl);
        });
    });

    it('every ramp level explicitly declares smallestNoteDenom/insertBeatRests/polyMultiplier (no ambient inheritance)', () => {
        [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL7, LEVEL8, LEVEL9, LEVEL10, LEVEL11, LEVEL12].forEach((lvl) => {
            expect(typeof lvl.smallestNoteDenom).toBe('number');
            expect(typeof lvl.insertBeatRests).toBe('boolean');
            expect(typeof lvl.polyMultiplier).toBe('number');
        });
    });

    it('ramps quarter-grid (Level 4) -> half notes (7) -> eighth notes (8-11) -> full richness (12)', () => {
        expect(LEVEL4).toMatchObject({ smallestNoteDenom: 4, insertBeatRests: true });
        expect(LEVEL7).toMatchObject({ smallestNoteDenom: 4, insertBeatRests: false });   // half notes unlocked
        [LEVEL8, LEVEL9, LEVEL10, LEVEL11].forEach((lvl) => {
            expect(lvl).toMatchObject({ smallestNoteDenom: 8, insertBeatRests: false });   // eighth notes
        });
        expect(LEVEL12).toMatchObject({ smallestNoteDenom: 8, insertBeatRests: false });
    });

    it('range widens exactly at Level 10 (C4-C5), unchanged before and after', () => {
        [LEVEL4, LEVEL7, LEVEL8, LEVEL9].forEach((lvl) => {
            expect(lvl.range).toEqual({ min: 'C4', max: 'G4' });
        });
        expect(LEVEL10.range).toEqual({ min: 'C4', max: 'C5' });
        expect(LEVEL11.range).toEqual({ min: 'C4', max: 'C5' });
    });

    it('debugOnlyLines is true through Level 10, false from Level 11 onward (Levels 1-3 too — gated intro levels)', () => {
        [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL7, LEVEL8, LEVEL9, LEVEL10].forEach((lvl) => {
            expect(lvl.debugOnlyLines).toBe(true);
        });
        expect(LEVEL11.debugOnlyLines).toBe(false);
        expect(LEVEL12.debugOnlyLines).toBe(false);
    });

    it('fixedBass (the Level 4 whole-note cello exception) persists through Level 11; Level 12 uses the real generated bass', () => {
        [LEVEL4, LEVEL7, LEVEL8, LEVEL9, LEVEL10, LEVEL11].forEach((lvl) => {
            expect(lvl.fixedBass).toBe(true);
        });
        expect(LEVEL12.fixedBass).toBe(false);
    });

    it('every level has a bpm, enemyType ("Slime" — Han: "gewoon slimes" — EXCEPT Level 13/Wizard), and a non-empty intro blurb', () => {
        [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL7, LEVEL8, LEVEL9, LEVEL10, LEVEL11, LEVEL12].forEach((lvl) => {
            expect(typeof lvl.bpm).toBe('number');
            expect(lvl.enemyType).toBe('Slime');
            expect(lvl.intro).toEqual(expect.any(String));
            expect(lvl.intro.length).toBeGreaterThan(0);
        });
        expect(typeof LEVEL13.bpm).toBe('number');
        expect(LEVEL13.intro.length).toBeGreaterThan(0);
    });

    // #688 → #1163c (Han 2026-08-29): the ramp levels used to author `numMeasures: 8` /
    // `totalMeasures: 8` = ONE continuous 8-measure wave. #1163c sets `numMeasures: 2` (the real
    // generation chunk size, Han's data model) while `totalMeasures` stays 8 — so the piece is the
    // SAME LENGTH, generated in 4 chunks, and combat is now keyed to that chunk boundary (4 waves).
    it('every side-scroll ramp level (4, 7-12) is 4 chunks of 2 measures — same 8-measure length, ONE wave (#1163c/#1102)', () => {
        [LEVEL4, LEVEL7, LEVEL8, LEVEL9, LEVEL10, LEVEL11, LEVEL12].forEach((lvl) => {
            expect(lvl.numMeasures).toBe(2);
            expect(lvl.numRepeats).toBe(1);
            expect(lvl.totalMeasures).toBe(8);
            expect(lvl.totalMeasures / (lvl.numMeasures * lvl.numRepeats)).toBe(4);
            // 4 GENERATION chunks, but still ONE combat wave: the wave count stopped following the
            // chunk count when #1165 made every level one continuous append-only stream (Han
            // 2026-08-29 UAT — see `wavesForLevel`'s own comment in levels.js).
            expect(wavesForLevel(lvl)).toBe(1);
        });
    });

    // #693 → #1163c: Level 13's block cadence was ALWAYS 2 measures (one call group + one response
    // group — `blockMeasuresFor`'s Wizard branch, `1 * 2`). #1163c makes the authored `numMeasures`
    // agree with that real cadence (8 → 2); `totalMeasures` stays 8, so the level is the same length,
    // generated in 4 call-response blocks — and, since #1102's UAT fix, still cleared as ONE wave.
    it('Level 13 (Wizard) authors numMeasures 2 / totalMeasures 8 → 4 call-response blocks, one wave (#1163c/#1102)', () => {
        expect(LEVEL13.numMeasures).toBe(2);
        expect(LEVEL13.numRepeats).toBe(1);
        expect(LEVEL13.totalMeasures).toBe(8);
        expect(blockCountFor(LEVEL13)).toBe(4);
        expect(wavesForLevel(LEVEL13)).toBe(1);
    });

    it('Level 13 (Wizard) keeps Level 4\'s quarter-grid/range/sideScroll settings, with enemyType "Wizard"', () => {
        expect(LEVEL13.enemyType).toBe('Wizard');
        expect(LEVEL13.range).toEqual(LEVEL4.range);
        expect(LEVEL13.smallestNoteDenom).toBe(LEVEL4.smallestNoteDenom);
        expect(LEVEL13.insertBeatRests).toBe(LEVEL4.insertBeatRests);
        expect(LEVEL13.polyMultiplier).toBe(LEVEL4.polyMultiplier);
        expect(LEVEL13.sideScroll).toBe(LEVEL4.sideScroll);
        expect(LEVEL13.fixedBass).toBe(LEVEL4.fixedBass);
        expect(LEVEL13.notesPerMeasure).toBe(2);
        expect(LEVEL13.wizardSpawnLeadMeasures).toBe(1);
    });
});

// Bug fix (#1044, Han 2026-08-17/24, "levels met... akkoorden werken niet zo goed. Te onderzoeken"):
// Levels 104/115/120 (the 101-120 example-level library) all authored `tracks.treble.notePool: 'all'`.
// 'all' IS a valid `notePool` string — but only for PERCUSSION (`convertRankedArrayToMelody.js`'s
// `getPool()` resolves it to the full drum-pad-id list, `percussionIDs`). For a melodic track (treble/
// bass), the only valid values are `MELODIC_NOTE_POOLS` (generationFields.js, what the in-staff carousel
// actually offers — it never offers 'all'). `getPool()` has no instrument-type awareness — it resolves
// purely off the STRING VALUE — so a melodic track's `notePool: 'all'` silently fell into the percussion
// branch and generated real DRUM PAD CODES ('sg','hp','tm','wh',...) as "treble notes". Nothing crashed:
// `renderMelodyNotes.jsx` just couldn't compute a staff Y-position for a pad code and silently dropped
// the note (`return null`), so the visible symptom was missing/gapped treble notes and console spam
// ("Invalid note position"), not an error a level author would notice while writing the JSON. Fixed by
// correcting the three levels' data to `'chromatic'` (the melodic equivalent of "use notes freely, not
// just the diatonic scale" — closest to each level's evident intent). This test is the actual regression
// guard: it would have caught all three levels' mistake immediately at write time, and catches any future
// one the same way, instead of requiring a live playthrough + console-log archaeology to find (§1044).
describe('levels.js — tracks.*.notePool must be a valid MELODIC pool for treble/bass (#1044 audit)', () => {
    const melodicPoolValues = MELODIC_NOTE_POOLS.map((p) => p.value);

    it('MELODIC_NOTE_POOLS does not include "all" (that string is percussion-only, see getPool())', () => {
        expect(melodicPoolValues).not.toContain('all');
    });

    it('every level\'s tracks.treble/tracks.bass.notePool (when set) is a valid melodic pool value', () => {
        const offenders = [];
        Object.values(LEVELS).forEach((lvl) => {
            ['treble', 'bass'].forEach((track) => {
                const notePool = lvl.tracks?.[track]?.notePool;
                if (notePool != null && !melodicPoolValues.includes(notePool)) {
                    offenders.push(`Level ${lvl.id} (${lvl.name}) tracks.${track}.notePool=${notePool}`);
                }
            });
        });
        expect(offenders).toEqual([]);
    });
});

// #1099 (Han 2026-08-22, ANPM stat): `totalNotesForLevel` is the "total notes in the level" half of Han's
// own ANPM formula (App.jsx divides this by elapsed minutes) — was only exercised implicitly via the
// ANPM EWMA tests (ProfileContext.test.jsx, which mock notesPerMinute directly), never tested in
// isolation. Direct coverage closes that gap (§7b: a pure helper needs its own smoke test).
describe('levels.js — totalNotesForLevel (#1099)', () => {
    it('single-hand level: totalMeasures x treble notesPerMeasure only', () => {
        expect(totalNotesForLevel({ totalMeasures: 8, notesPerMeasure: 3 })).toBe(24);
    });

    it('twoHanded level: totalMeasures x (treble + bass notesPerMeasure) — Han: "bij dual input: optellen"', () => {
        expect(totalNotesForLevel({
            totalMeasures: 8, notesPerMeasure: 3, twoHanded: true, tracks: { bass: { notesPerMeasure: 2 } },
        })).toBe(40);   // 8 * (3+2)
    });

    it('twoHanded level with no explicit bass notesPerMeasure defaults bass to 1 per measure', () => {
        expect(totalNotesForLevel({ totalMeasures: 4, notesPerMeasure: 2, twoHanded: true })).toBe(12);   // 4 * (2+1)
    });

    it('missing fields fall back to 0, never NaN/undefined', () => {
        expect(totalNotesForLevel({})).toBe(0);
        expect(totalNotesForLevel(null)).toBe(0);
    });
});

// #1165 (Han 2026-08-29): `usesTrebleJitStream` is GONE, and so is the question it answered. It was
// the SHARED predicate for "does this level's treble come from the JIT stream rather than
// regenerate()-per-wave" — a question with one possible answer now: EVERY level's content comes from
// `useLevelContentStream`, and `onWaveCleared` never calls `regenerate()` for any level (see
// useLevel.test.js's own #1165 case). `isJitTrebleLevel` — the OTHER predicate its comment was so
// often confused with, which picked between the one-wave and the discrete wave-COUNTING model — is
// gone too as of #1102's UAT fix (Han 2026-08-29): with one continuous stream per level there is only
// one possible clear event, so the model it selected between has a single branch left. This block is
// now the regression net for that unconditional answer.
describe('levels.js — wavesForLevel: ONE wave for every level shape (#1102 UAT fix)', () => {
    it('a JIT-gated plain level: one continuous stream, so exactly ONE wave to clear (#1101, unchanged)', () => {
        expect(wavesForLevel({ sideScroll: true, gatedScroll: true, enemyType: 'Slime' })).toBe(1);
    });

    it('a Wizard/call-response level no longer keeps the discrete numRepeats-based wave model', () => {
        const lvl = { sideScroll: true, gatedScroll: false, enemyType: 'Wizard', numMeasures: 2, numRepeats: 2, totalMeasures: 8 };
        expect(blockCountFor(lvl)).toBe(4);   // still 4 GENERATION blocks (one call+response each)…
        expect(wavesForLevel(lvl)).toBe(1);   // …but one combat wave
    });

    it('a plain non-gated level, a gated SONG level and a non-side-scroll static level are all one wave', () => {
        expect(wavesForLevel({ sideScroll: true, gatedScroll: false, enemyType: 'Slime', numMeasures: 2, totalMeasures: 8 })).toBe(1);
        expect(wavesForLevel({ sideScroll: true, gatedScroll: true, enemyType: 'Slime', songId: 'x' })).toBe(1);
        expect(wavesForLevel({ sideScroll: false, numMeasures: 2, totalMeasures: 12 })).toBe(1);
    });
});

// #1163c (Han 2026-08-29): `numMeasures` 8 → 2 for ids 4,7,8,9,10,11,12,13,14,15,19. `numMeasures` IS the
// generation chunk size (Han's data model, #1163); `totalMeasures` stays 8, so every level is the SAME
// LENGTH — it just generates and fights in 4 two-measure chunks instead of one 8-measure block. This
// block is the regression net: it pins the 11 values, the derived wave count, the fact that
// `totalNotesForLevel` (the ANPM / #1102 adaptive baseline) is BYTE-IDENTICAL across the edit (it reads
// `totalMeasures` only), and that combat stays keyed to the chunk boundary (`blockCountFor === wavesForLevel`).
describe('levels.js — #1163c: ramp levels are 4 two-measure chunks, same 8-measure length', () => {
    const CONVERTED_IDS = [4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 19];

    // Pinned PRE-EDIT `totalNotesForLevel` values. `totalNotesForLevel` = totalMeasures × (treble
    // notesPerMeasure + bass notesPerMeasure-if-twoHanded); it does NOT read `numMeasures` at all, so
    // these must be unchanged by #1163c. Hard-pinned (not re-derived from the function) precisely so a
    // future change to either `totalNotesForLevel` OR the level data is caught.
    const PINNED_TOTAL_NOTES = {
        4: 24, 7: 24, 8: 24,          // notesPerMeasure 3 × 8 measures
        9: 32, 10: 32, 11: 32,        // notesPerMeasure 4 × 8
        12: 16, 13: 16, 14: 16, 15: 16, // notesPerMeasure 2 × 8
        19: 32,                        // twoHanded: (treble 3 + bass 1) × 8
    };

    it.each(CONVERTED_IDS)('level %i: numMeasures 2, numRepeats 1, totalMeasures 8, 4 chunks, ONE wave', (id) => {
        const lvl = LEVELS[id];
        expect(lvl.numMeasures).toBe(2);
        expect(lvl.numRepeats).toBe(1);
        expect(lvl.totalMeasures).toBe(8);
        expect(lvl.totalMeasures / (lvl.numMeasures * lvl.numRepeats)).toBe(4);
        expect(wavesForLevel(lvl)).toBe(1);
    });

    it.each(CONVERTED_IDS)('level %i: totalNotesForLevel is byte-identical to the pre-edit value', (id) => {
        expect(totalNotesForLevel(LEVELS[id])).toBe(PINNED_TOTAL_NOTES[id]);
    });

    // SUPERSEDED (Han 2026-08-29 UAT of #1102). This used to assert `blockCountFor === wavesForLevel`
    // ("combat stays keyed to the chunk boundary", #1163c decision 5). That identity described a wave
    // model whose per-wave clear event #1165's own merge had already removed: with one continuous
    // append-only stream there is exactly ONE "cumulative kills caught up to cumulative content" event
    // per level, so demanding 4 clears left the level unable to finish (the §289 class). The GENERATION
    // cadence — the part decision 5 was really about — is unchanged and still pinned here; only the
    // combat wave count decoupled from it.
    it('generation still runs in 4 chunks per converted level; combat is now one wave (#1102 UAT fix)', () => {
        for (const id of CONVERTED_IDS) {
            const lvl = LEVELS[id];
            expect(blockCountFor(lvl)).toBe(4);
            expect(wavesForLevel(lvl)).toBe(1);
        }
    });

    // The three `blockMeasuresFor` special-case branches (Wizard / Mixed / decorativeWizard): after the
    // edit levels 14/15 hit the same 2 via the fall-through, but levels 13/14/15 must keep IDENTICAL
    // cadence + block count, and the Wizard branch must still win for the d/e call-response variants
    // (where `numMeasures` and `callResponseMeasures` diverge).
    it('levels 13 (native + d + e), 14, 15 keep an identical block cadence and block count', () => {
        // Native level 13: Wizard branch → 1*2 = 2; 8 measures / 2 = 4 blocks.
        expect(blockMeasuresFor(LEVELS[13])).toBe(2);
        expect(blockCountFor(LEVELS[13])).toBe(4);
        // Variant d: callResponseMeasures 1 → 1*2 = 2 (NOT the numMeasures fall-through, which is also 1).
        const d13 = applyLevelVariant(LEVELS[13], 'd');
        expect(d13.callResponseMeasures).toBe(1);
        expect(d13.numMeasures).toBe(1);
        expect(blockMeasuresFor(d13)).toBe(2);
        // Variant e: callResponseMeasures 2 → 2*2 = 4. The fall-through (numMeasures = 2) would be WRONG —
        // this is why the Wizard branch of blockMeasuresFor must never be deleted.
        const e13 = applyLevelVariant(LEVELS[13], 'e');
        expect(e13.callResponseMeasures).toBe(2);
        expect(e13.numMeasures).toBe(2);
        expect(blockMeasuresFor(e13)).toBe(4);
        // Mixed (14) + decorativeWizard (15): authored 2-measure musical period, block count 8/2 = 4.
        expect(blockMeasuresFor(LEVELS[14])).toBe(2);
        expect(blockCountFor(LEVELS[14])).toBe(4);
        expect(blockMeasuresFor(LEVELS[15])).toBe(2);
        expect(blockCountFor(LEVELS[15])).toBe(4);
    });

    // #1163c consumer: App.jsx's `timpaniMelody` and SheetMusic.jsx's `scrollPercussionMelody` now derive
    // the timpani span from `leadInBars + totalMeasures`, NOT `+ numMeasures` (which would cover only the
    // first chunk). Level 3 (numMeasures 2 / totalMeasures 10) exercises the same latent bug and is fixed
    // by the same change.
    it('timpani span must derive from totalMeasures: for a converted level and Level 3 it differs from numMeasures', () => {
        expect(LEVEL4.totalMeasures).not.toBe(LEVEL4.numMeasures);   // 8 vs 2
        expect(LEVEL3.totalMeasures).not.toBe(LEVEL3.numMeasures);   // 10 vs 2
        const leadInBars = LEVEL4.leadInBars ?? 2;
        const beatsPerMeasure = 4;   // 4/4
        const full = buildTimpaniPattern(leadInBars + LEVEL4.totalMeasures, LEVEL4.timeSignature ?? [4, 4]);
        const truncated = buildTimpaniPattern(leadInBars + LEVEL4.numMeasures, LEVEL4.timeSignature ?? [4, 4]);
        expect(full.offsets.length).toBe((leadInBars + LEVEL4.totalMeasures) * beatsPerMeasure);
        expect(full.offsets.length).toBeGreaterThan(truncated.offsets.length);
    });
});

// #1168 (Han 2026-09-01) — THE TRIPWIRE for the alternative this ticket deliberately REJECTED.
// A song level's `numMeasures` is the SONG'S LENGTH (songLevelDefaults back-fills it from the song
// JSON, §871), and #1168 kept it that way: the song's 2-measure generation cadence lives in
// `blockMeasuresFor` (SONG_BLOCK_MEASURES), NOT in levels.json. Re-authoring `numMeasures` as a chunk
// size — the "literal #1166 shape" — would silently break `callResponseOverrides`, which computes a
// call-response song's doubled length from it (the §1155 "de akkoorden zijn op" fix). Both halves of
// that coupling are pinned here, in one test, so the breakage cannot land unnoticed.
describe('levels.js — #1168: a song\'s numMeasures still means "the song\'s length"', () => {
    const SONG_LEVEL_IDS = [200, 201, 202, 203, 204, 205, 206];

    it.each(SONG_LEVEL_IDS)('level %i + letter e: Wizard cadence 4 AND the doubled song length', (id) => {
        const lvl = LEVELS[id];
        const songLen = lvl.numMeasures;
        expect(lvl.totalMeasures).toBe(songLen);          // un-varied: length === the song's own length
        const v = applyLevelVariant(lvl, 'e');
        // Half 1 — the LENGTH still doubles off `lvl.numMeasures`.
        expect(v.totalMeasures).toBe(songLen * 2);
        // Half 2 — the branch ORDER: the Wizard branch (callResponseMeasures * 2 = 4) must keep winning
        // over the new song branch, even though this level has a songId.
        expect(blockMeasuresFor(v)).toBe(4);
        expect(blockCountFor(v)).toBe(Math.ceil((songLen * 2) / 4));
    });

    it('a plain (non-call-response) song level generates in 2-measure chunks, length untouched', () => {
        SONG_LEVEL_IDS.forEach((id) => {
            const lvl = LEVELS[id];
            expect(blockMeasuresFor(lvl)).toBe(2);
            expect(lvl.totalMeasures).toBe(lvl.numMeasures);
            expect(wavesForLevel(lvl)).toBe(1);
        });
    });
});
