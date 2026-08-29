import { describe, it, expect } from 'vitest';
import {
    LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL7, LEVEL8, LEVEL9, LEVEL10, LEVEL11, LEVEL12, LEVEL13,
    LEVELS, wavesForLevel, totalNotesForLevel, isJitTrebleLevel,
} from '../levels';
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

    // #688 (Han 2026-08-04): every OTHER side-scroll level in the ramp is one continuous 8-measure wave.
    it('every side-scroll ramp level (4, 7-12) clears in exactly 1 wave (one continuous 8-measure piece)', () => {
        [LEVEL4, LEVEL7, LEVEL8, LEVEL9, LEVEL10, LEVEL11, LEVEL12].forEach((lvl) => {
            expect(wavesForLevel(lvl)).toBe(1);
        });
    });

    // #693 (Han 2026-08-04, round 5): `numMeasures=1/numRepeats=2` turned out to drive
    // `playbackConfig.repsPerMelody` (a ROUND repeat) rather than a second VISUAL measure — reverted to the
    // two-measure structure (numMeasures=2, numRepeats=1) with measure 2 duplicated from measure 1 in
    // App.jsx.
    // #693 (round 6, Han 2026-08-04 — "nu is de lengte van het level maar 2 maten; maar daar 8 van (dus
    // genereer sequentieel 4 blokken zoals maat 1 en 2"): the level's full length is now 8 measures — 4
    // INDEPENDENTLY-generated 2-measure call-response blocks (each its own random pitches), grown
    // JUST-IN-TIME by useLevelTrebleStream.js (half a measure of lead time per block, Han's explicit
    // choice over generating all 8 measures up front) rather than App.jsx's old single-melody
    // restify/duplicate post-process (round 5, now removed — superseded by generation-time baking in
    // generateLevel9CallResponseBlock.js). `numMeasures` here is the level's TOTAL content length (matches
    // how bass/metronome's `useLevelBackingStream` already treats it), not a per-block size — the hook
    // internally chunks it into 2-measure blocks. `totalMeasures` stays equal to `numMeasures` so this
    // remains exactly 1 wave (one continuous piece, §130's proven "no per-wave regeneration" precedent) —
    // the 4-block structure is an internal JIT-generation detail invisible to the wave-counting system.
    it('Level 13 (Wizard) is one continuous 8-measure wave, generated as 4 independent JIT call-response blocks', () => {
        expect(LEVEL13.numMeasures).toBe(8);
        expect(LEVEL13.numRepeats).toBe(1);
        expect(LEVEL13.totalMeasures).toBe(8);
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
// useLevel.test.js's own #1165 case). What still matters, and is asserted here, is the OTHER predicate
// its comment was so often confused with: `isJitTrebleLevel` — which picks the wave-COUNTING model and
// is deliberately narrower.
describe('levels.js — isJitTrebleLevel (the wave-COUNTING model, NOT "where does content come from")', () => {
    it('true for a JIT-gated plain level: one continuous stream, so exactly ONE wave to clear', () => {
        const lvl = { sideScroll: true, gatedScroll: true, enemyType: 'Slime' };
        expect(isJitTrebleLevel(lvl)).toBe(true);
        expect(wavesForLevel(lvl)).toBe(1);
    });

    it('false for a Wizard/call-response level — it keeps the DISCRETE numRepeats-based wave model', () => {
        const lvl = { sideScroll: true, gatedScroll: false, enemyType: 'Wizard', numMeasures: 2, numRepeats: 2, totalMeasures: 8 };
        expect(isJitTrebleLevel(lvl)).toBe(false);
        expect(wavesForLevel(lvl)).toBe(2);
    });

    it('false for a plain non-gated level (discrete waves), and for a gated SONG level', () => {
        expect(isJitTrebleLevel({ sideScroll: true, gatedScroll: false, enemyType: 'Slime' })).toBe(false);
        expect(isJitTrebleLevel({ sideScroll: true, gatedScroll: true, enemyType: 'Slime', songId: 'x' })).toBe(false);
    });
});
