import { describe, it, expect } from 'vitest';
import {
    LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6, LEVEL7, LEVEL8, LEVEL9, LEVELS, wavesForLevel,
} from '../levels';

// #661 (Han 2026-08-02, "houd het simpel... introduceer stap voor stap: halve noten, achtste noten,
// verbonden noten, etc." + "maak tussen level 2 en level 3 5 nieuwe levels, dus level 3 schuift door naar
// level 8"): locks in the 8-level ramp's structural invariants so a future edit can't silently break the
// id/LEVELS-map consistency or reintroduce cross-level leakage (§91/§92's discipline extended to 8 levels).
// #679 (Han 2026-08-03): Level 9 (Wizard/projectile combat) added on top — same structural checks extended.
describe('levels.js — 8-level ramp (Han 2026-08-02) + Level 9 (Han 2026-08-03)', () => {
    it('LEVELS map keys 1..9 match each level object\'s own id', () => {
        const all = [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6, LEVEL7, LEVEL8, LEVEL9];
        // Level editor (Han 2026-08-06): levels.json also carries id 0 (the live-editable sandbox) and
        // 101-120 (hand-editable schema examples, see levels.js's SCHEMA REFERENCE) — assert 1-9 are
        // present/correct WITHOUT asserting they're the only keys, so those don't break this check.
        expect(Object.keys(LEVELS).map(Number).filter((id) => id >= 1 && id <= 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        all.forEach((lvl, i) => {
            expect(lvl.id).toBe(i + 1);
            expect(LEVELS[i + 1]).toBe(lvl);
        });
    });

    it('every level explicitly declares smallestNoteDenom/insertBeatRests/polyMultiplier (no ambient inheritance)', () => {
        [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6, LEVEL7, LEVEL8].forEach((lvl) => {
            expect(typeof lvl.smallestNoteDenom).toBe('number');
            expect(typeof lvl.insertBeatRests).toBe('boolean');
            expect(typeof lvl.polyMultiplier).toBe('number');
        });
    });

    it('ramps quarter-grid (1/2) -> half notes (3) -> eighth notes (4-7) -> full richness (8)', () => {
        expect(LEVEL1).toMatchObject({ smallestNoteDenom: 4, insertBeatRests: true });
        expect(LEVEL2).toMatchObject({ smallestNoteDenom: 4, insertBeatRests: true });
        expect(LEVEL3).toMatchObject({ smallestNoteDenom: 4, insertBeatRests: false });   // half notes unlocked
        [LEVEL4, LEVEL5, LEVEL6, LEVEL7].forEach((lvl) => {
            expect(lvl).toMatchObject({ smallestNoteDenom: 8, insertBeatRests: false });   // eighth notes
        });
        expect(LEVEL8).toMatchObject({ smallestNoteDenom: 8, insertBeatRests: false });
    });

    it('range widens exactly at Level 6 (C4-C5), unchanged before and after', () => {
        [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL5].forEach((lvl) => {
            expect(lvl.range).toEqual({ min: 'C4', max: 'G4' });
        });
        expect(LEVEL6.range).toEqual({ min: 'C4', max: 'C5' });
        expect(LEVEL7.range).toEqual({ min: 'C4', max: 'C5' });
    });

    it('debugOnlyLines is true through Level 6, false from Level 7 onward (Level 1 too — "level 1 en 2")', () => {
        [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6].forEach((lvl) => {
            expect(lvl.debugOnlyLines).toBe(true);
        });
        expect(LEVEL7.debugOnlyLines).toBe(false);
        expect(LEVEL8.debugOnlyLines).toBe(false);
    });

    it('fixedBass (the Level 2 whole-note cello exception) persists through Level 7; Level 8 uses the real generated bass', () => {
        [LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6, LEVEL7].forEach((lvl) => {
            expect(lvl.fixedBass).toBe(true);
        });
        expect(LEVEL8.fixedBass).toBe(false);
    });

    it('every level has a bpm, enemyType ("Slime" — Han: "gewoon slimes" — EXCEPT Level 9), and a non-empty intro blurb', () => {
        [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6, LEVEL7, LEVEL8].forEach((lvl) => {
            expect(typeof lvl.bpm).toBe('number');
            expect(lvl.enemyType).toBe('Slime');
            expect(lvl.intro).toEqual(expect.any(String));
            expect(lvl.intro.length).toBeGreaterThan(0);
        });
        expect(typeof LEVEL9.bpm).toBe('number');
        expect(LEVEL9.intro.length).toBeGreaterThan(0);
    });

    // #688 (Han 2026-08-04): every OTHER side-scroll level (2-8) is one continuous 8-measure wave.
    it('every side-scroll level (2-8) clears in exactly 1 wave (one continuous 8-measure piece)', () => {
        [LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6, LEVEL7, LEVEL8].forEach((lvl) => {
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
    it('Level 9 is one continuous 8-measure wave, generated as 4 independent JIT call-response blocks', () => {
        expect(LEVEL9.numMeasures).toBe(8);
        expect(LEVEL9.numRepeats).toBe(1);
        expect(LEVEL9.totalMeasures).toBe(8);
        expect(wavesForLevel(LEVEL9)).toBe(1);
    });

    it('Level 9 keeps Level 2\'s quarter-grid/range/sideScroll settings, with enemyType "Wizard"', () => {
        expect(LEVEL9.enemyType).toBe('Wizard');
        expect(LEVEL9.range).toEqual(LEVEL2.range);
        expect(LEVEL9.smallestNoteDenom).toBe(LEVEL2.smallestNoteDenom);
        expect(LEVEL9.insertBeatRests).toBe(LEVEL2.insertBeatRests);
        expect(LEVEL9.polyMultiplier).toBe(LEVEL2.polyMultiplier);
        expect(LEVEL9.sideScroll).toBe(LEVEL2.sideScroll);
        expect(LEVEL9.fixedBass).toBe(LEVEL2.fixedBass);
        expect(LEVEL9.notesPerMeasure).toBe(2);
        expect(LEVEL9.wizardSpawnLeadMeasures).toBe(1);
    });
});
