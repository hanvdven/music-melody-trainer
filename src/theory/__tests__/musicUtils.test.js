import { describe, it, expect } from 'vitest';
import { modulateMelody } from '../musicUtils';
import Scale from '../../model/Scale';
import { updateScaleWithTonic, updateScaleWithMode } from '../scaleHandler';

// Bug fix (Han 2026-08-25 UAT, "de eerste noot moet een A zijn, maar ik zie... G#" — Sakura, "In" on E):
// `modulateMelody`'s heptatonic-reference degree math anchors a non-Diatonic mode's `heptaRefIntervals`
// (its 7-note REFERENCE scale) at the scale's own tonic PLUS `deriveReferenceTonicOffset` semitones —
// wrong when that offset is stale/inconsistent with the scale's OWN `intervals` (confirmed root cause via
// `resolveLoadedSong` + Sakura's real song data: even a SAME-SCALE "no-op" modulation shifted every note
// down a semitone, 'A4' → 'A♭4' — a genuine pitch error, not an enharmonic spelling choice). This file had
// ZERO prior test coverage before this fix. NOTE (#1158, same day): "In" on E's `heptaRefIntervals` was
// LATER corrected to Phrygian's own shape (offset 0, reference tonic = E itself) — see scaleHandler.js's
// own `diatonic`/`heptaRefIntervals` doc comment for the current canonical reference. The tests below still
// pass either way (they only assert modulateMelody's OWN math is internally consistent, not which specific
// reference each scale currently uses) — see `musicUtils.test.js`'s later "cross-shape" describe block for
// a test that DOES depend on the specific (now-corrected) reference.
const inOnE = updateScaleWithMode({
    currentScale: updateScaleWithTonic({ currentScale: Scale.defaultScale(), newTonic: 'E4' }),
    newFamily: 'Pentatonic',
    newMode: 'In',
});
const inOnG = updateScaleWithMode({
    currentScale: updateScaleWithTonic({ currentScale: Scale.defaultScale(), newTonic: 'G4' }),
    newFamily: 'Pentatonic',
    newMode: 'In',
});

describe('modulateMelody — non-Diatonic (heptatonic-reference) modes (bug fix)', () => {
    it('sanity: "In" on E has the expected pentatonic pitch classes', () => {
        expect(inOnE.tonic).toBe('E4');
        expect(inOnE.notes).toEqual(['E4', 'F4', 'A4', 'B4', 'C5', 'E5']);
    });

    it('same-scale "no-op" modulation leaves every note byte-identical (the reported bug)', () => {
        // Sakura's actual opening phrase.
        const notes = ['A4', 'A4', 'B4', 'A4', 'A4', 'B4'];
        expect(modulateMelody(notes, inOnE, inOnE)).toEqual(notes);
    });

    it('every note of the scale itself round-trips through a same-scale modulation unchanged', () => {
        const scaleNotes = inOnE.notes.slice(0, -1); // drop the octave-duplicate top note
        expect(modulateMelody(scaleNotes, inOnE, inOnE)).toEqual(scaleNotes);
    });

    it('modulating between two mode instances of the SAME non-Diatonic mode (In on E → In on G) shifts by the tonic interval, preserving scale degree', () => {
        // E→G is a minor third (3 semitones) higher; degree-for-degree, In-on-E's notes should map to
        // In-on-G's own notes at the same scale position (E→G, F→G... — but as SCALE DEGREES, not a flat
        // chromatic transpose, since "In" itself isn't symmetric under an arbitrary shift).
        const notes = ['E4', 'F4', 'A4', 'B4', 'C5'];
        const result = modulateMelody(notes, inOnE, inOnG);
        expect(result).toEqual(inOnG.notes.slice(0, 5));
    });

    it('non-note tokens (rests/percussion codes) pass through untouched', () => {
        const notes = ['A4', 'r', 'k', null];
        expect(modulateMelody(notes, inOnE, inOnE)).toEqual(['A4', 'r', 'k', null]);
    });
});

// #1153 (Han 2026-08-25, letter g "Modulated" UAT on Sakura): modulating a non-Diatonic scale to a
// DIFFERENT-SHAPED Diatonic mode, SAME tonic (G's exact use case: "In" on E → a random OTHER diatonic
// mode on E) turned A4 into G4 and even the TONIC E4 into D4. Root cause was NOT in modulateMelody's own
// algorithm (2 attempted algorithm fixes here both broke other, already-correct cases) — it was
// scaleHandler.js's `heptaRefIntervals` for "In" being Lydian-shaped (reference tonic F, one semitone away
// from E) when "In" on E is ALSO an exact same-tonic subset of Phrygian (#1158's fix). Once `heptaRefIntervals`
// correctly matches `diatonic` (offset 0, reference tonic = the scale's own tonic), this same-tonic
// modulation is trivially correct BY CONSTRUCTION — no algorithm change needed. This test guards the DATA,
// not the algorithm: if a future scaleHandler.js edit reintroduces an offset for "In", this fails loudly
// instead of silently reshipping the exact bug Han reported.
describe('modulateMelody — cross-shape, same-tonic modulation (#1153, depends on #1158\'s data fix)', () => {
    it('"In" on E → Phrygian on E (same tonic, different shape) leaves every note unchanged — all 5 of "In"\'s notes are already valid Phrygian members', () => {
        const phrygianOnE = updateScaleWithMode({ currentScale: inOnE, newFamily: 'Diatonic', newMode: 'Phrygian' });
        const notes = ['A4', 'E4', 'F4', 'B4', 'C5'];
        expect(modulateMelody(notes, inOnE, phrygianOnE)).toEqual(notes);
    });
});

describe('modulateMelody — plain Diatonic modes (no regression)', () => {
    it('same-scale "no-op" modulation is unchanged (pre-existing behaviour)', () => {
        const cMajor = Scale.defaultScale();
        const notes = ['C4', 'D4', 'E4', 'F4', 'G4'];
        expect(modulateMelody(notes, cMajor, cMajor)).toEqual(notes);
    });

    it('C major → D major transposes up a whole step, degree-for-degree', () => {
        const cMajor = Scale.defaultScale();
        const dMajor = updateScaleWithTonic({ currentScale: cMajor, newTonic: 'D4' });
        const notes = ['C4', 'D4', 'E4'];
        expect(modulateMelody(notes, cMajor, dMajor)).toEqual(['D4', 'E4', 'F♯4']);
    });
});
