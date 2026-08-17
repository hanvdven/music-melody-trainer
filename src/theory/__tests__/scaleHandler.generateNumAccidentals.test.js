import { describe, it, expect } from 'vitest';
import { generateNumAccidentals } from '../scaleHandler.js';

// Bug fix (Han 2026-08-17, live UAT: Sakura "E In" (Pentatonic) showed 5 sharps): generateNumAccidentals
// used to ALWAYS combine the GIVEN tonic's own circle-of-fifths position with the mode's `diatonic`
// reference adjustment, correct only for actual Diatonic modes (whose `diatonic` reference genuinely is
// itself, same tonic). For a non-Diatonic mode the `diatonic` field names a DIFFERENT scale built on a
// DIFFERENT tonic that merely contains the mode's notes as a subset — "In" on E is a subset of F Lydian
// (not E Lydian), so combining E's own position (4) with Lydian's adjustment (+1) produced a bogus
// 5-sharp signature for a scale that is actually all-natural (E-F-A-B-C). Same bug/fix as
// scripts/abc-to-song.mjs's parseKeyField (§252).
describe('generateNumAccidentals — non-Diatonic modes get no forced key signature (2026-08-17 bug fix)', () => {
    it('Pentatonic "In" on E is 0 (was 5, the reported bug)', () => {
        expect(generateNumAccidentals('E4', 'In')).toBe(0);
    });

    it('Pentatonic "In" on A is 0 (was wrong before too, just never reported)', () => {
        expect(generateNumAccidentals('A4', 'In')).toBe(0);
    });

    it('Pentatonic Major on F is 0', () => {
        expect(generateNumAccidentals('F4', 'Pentatonic Major')).toBe(0);
    });

    it('real Diatonic modes are unaffected (sanity check the fix is scoped correctly)', () => {
        expect(generateNumAccidentals('E4', 'Phrygian')).toBe(0);
        expect(generateNumAccidentals('C4', 'Major')).toBe(0);
        expect(generateNumAccidentals('D4', 'Major')).toBe(2);
        expect(generateNumAccidentals('A4', 'Minor')).toBe(0);
    });
});
