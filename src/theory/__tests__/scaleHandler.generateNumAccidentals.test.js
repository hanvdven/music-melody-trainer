import { describe, it, expect } from 'vitest';
import { generateNumAccidentals } from '../scaleHandler.js';

// Bug fix (Han 2026-08-17, live UAT: Sakura "E In" (Pentatonic) showed 5 sharps): generateNumAccidentals
// used to ALWAYS combine the GIVEN tonic's own circle-of-fifths position with the mode's `diatonic`
// reference adjustment, correct only for actual Diatonic modes (whose `diatonic` reference genuinely is
// itself, same tonic). For a non-Diatonic mode the `diatonic` field names a DIFFERENT scale built on a
// DIFFERENT tonic that merely contains the mode's notes as a subset — "In" on E is a subset of F Lydian
// (not E Lydian), so combining E's own position (4) with Lydian's adjustment (+1) produced a bogus
// 5-sharp signature for a scale that is actually all-natural (E-F-A-B-C).
//
// Follow-up (Han, correctly, on the FIRST fix's "just return 0 for every non-Diatonic mode" cop-out:
// "wat ben je nu allemaal aan het hardcoden??? In heeft een heptatonic equivalent, de voortekens worden
// automatisch gegeven"): that first fix was itself a hardcoded special case, and WRONG for any
// non-Diatonic mode whose true answer isn't 0 (e.g. "A In" and "F Pentatonic Major" are proven below to
// need real accidentals). The real fix derives the reference scale's TRUE tonic generically from
// `heptaRefIntervals` vs the mode's own `intervals` (deriveReferenceTonicOffset in scaleHandler.js) —
// no lookup table, no per-mode special case (§6c). These values are the CORRECT derivation, verified by
// hand against the actual pitch-class sets each scale produces.
describe('generateNumAccidentals — derived generically from heptaRefIntervals, not hardcoded (2026-08-17)', () => {
    it('Pentatonic "In" on E is 0 (was 5, the reported bug; E-F-A-B-C are all natural)', () => {
        expect(generateNumAccidentals('E4', 'In')).toBe(0);
    });

    it('Pentatonic "In" on A is -1, NOT 0 (A-A♯-D-E-F respells with a flat, not zero accidentals — the naive "always 0" fix would get this wrong)', () => {
        expect(generateNumAccidentals('A4', 'In')).toBe(-1);
    });

    it('Pentatonic Major on F is -1 (F major\'s own 1-flat signature — B never appears in F-G-A-C-D, but the true diatonic reference is still F major itself, not a forced 0)', () => {
        expect(generateNumAccidentals('F4', 'Pentatonic Major')).toBe(-1);
    });

    it('Pentatonic Major on C is 0 (C major, genuinely zero accidentals)', () => {
        expect(generateNumAccidentals('C4', 'Pentatonic Major')).toBe(0);
    });

    it('Pentatonic Minor on A is 0 (A natural minor, the relative minor of C major)', () => {
        expect(generateNumAccidentals('A4', 'Pentatonic Minor')).toBe(0);
    });

    it('real Diatonic modes are unaffected — the general formula reduces to the old correct behaviour, not a special case', () => {
        expect(generateNumAccidentals('E4', 'Phrygian')).toBe(0);
        expect(generateNumAccidentals('C4', 'Major')).toBe(0);
        expect(generateNumAccidentals('D4', 'Major')).toBe(2);
        expect(generateNumAccidentals('A4', 'Minor')).toBe(0);
        expect(generateNumAccidentals('G4', 'Dorian')).toBe(-1); // G Dorian = F major's notes, 1 flat
    });
});
