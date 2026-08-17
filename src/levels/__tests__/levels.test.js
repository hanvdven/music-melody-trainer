import { describe, it, expect } from 'vitest';
import {
    LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL7, LEVEL8, LEVEL9, LEVEL10, LEVEL11, LEVEL12, LEVEL13,
    LEVELS, wavesForLevel,
} from '../levels';

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
