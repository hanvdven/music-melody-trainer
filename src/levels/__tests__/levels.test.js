import { describe, it, expect } from 'vitest';
import {
    LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6, LEVEL7, LEVEL8, LEVELS, wavesForLevel,
} from '../levels';

// #661 (Han 2026-08-02, "houd het simpel... introduceer stap voor stap: halve noten, achtste noten,
// verbonden noten, etc." + "maak tussen level 2 en level 3 5 nieuwe levels, dus level 3 schuift door naar
// level 8"): locks in the 8-level ramp's structural invariants so a future edit can't silently break the
// id/LEVELS-map consistency or reintroduce cross-level leakage (§91/§92's discipline extended to 8 levels).
describe('levels.js — 8-level ramp (Han 2026-08-02)', () => {
    it('LEVELS map keys 1..8 match each level object\'s own id', () => {
        const all = [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6, LEVEL7, LEVEL8];
        expect(Object.keys(LEVELS).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
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

    it('every level has a bpm, enemyType ("Slime" — Han: "gewoon slimes"), and a non-empty intro blurb', () => {
        [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6, LEVEL7, LEVEL8].forEach((lvl) => {
            expect(typeof lvl.bpm).toBe('number');
            expect(lvl.enemyType).toBe('Slime');
            expect(lvl.intro).toEqual(expect.any(String));
            expect(lvl.intro.length).toBeGreaterThan(0);
        });
    });

    it('every side-scroll level (2-8) clears in exactly 1 wave (one continuous 8-measure piece)', () => {
        [LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6, LEVEL7, LEVEL8].forEach((lvl) => {
            expect(wavesForLevel(lvl)).toBe(1);
        });
    });
});
