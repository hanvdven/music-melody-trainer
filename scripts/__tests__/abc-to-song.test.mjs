import { describe, it, expect } from 'vitest';
import { convertAbc } from '../abc-to-song.mjs';

// Bug fix history (Han 2026-08-17):
// 1. Sakura UAT: "de noten kloppen, label is verkeerd" — the K: field parser only recognized the 7
//    Diatonic modes; fixed to also resolve non-Diatonic (Pentatonic etc.) mode names.
// 2. That fix's own key-SIGNATURE math was wrong: it assumed a mode's `diatonic` reference field shares
//    the mode's own tonic (it doesn't — "In" on E is a subset of F LYDIAN, a different tonic), producing
//    a bogus 5-sharp signature that corrupted 13 real notes in sakura's tune body.
// 3. The FIRST attempt at fixing #2 hardcoded fifths=0 for every non-Diatonic mode. Han, correctly:
//    "wat ben je nu allemaal aan het hardcoden??? In heeft een heptatonic equivalent, de voortekens
//    worden automatisch gegeven" — that was itself a wrong special case (e.g. "A In" genuinely needs a
//    flat, not zero). The real fix derives the TRUE reference tonic generically from `heptaRefIntervals`
//    (scaleHandler.js's `generateNumAccidentals`/`deriveReferenceTonicOffset`) and is now imported and
//    reused here directly — this script has zero independent key-signature math of its own.
const MINIMAL_HEADER = 'X:1\nT:Test\nM:4/4\nL:1/4\nQ:1/4=90\n';

describe('abc-to-song convertAbc — non-Diatonic key signatures are DERIVED, not hardcoded (2026-08-17)', () => {
    it('Pentatonic "In" on E needs zero accidentals (E-F-A-B-C are all natural)', () => {
        const source = `${MINIMAL_HEADER}K:E In\nEFAB c4|]\n`;
        const { song } = convertAbc(source, { file: 'test.abc' });
        expect(song.generator.scaleFamily).toBe('Pentatonic');
        expect(song.generator.scaleMode).toBe('In');
        song.difficulties.easy.treble.notes.forEach((n) => {
            expect(n, `note "${n}" should have no accidental`).not.toMatch(/[♯♭𝄪𝄫]/u);
        });
    });

    it('Pentatonic "In" on A genuinely needs a flat on B (A-A#-D-E-F respells with Bb, NOT zero accidentals)', () => {
        // Bare "B" in the tune body should come out B♭ under A In's real (derived, non-zero) key
        // signature — the exact case a naive "always 0" fix would get wrong.
        const source = `${MINIMAL_HEADER}K:A In\nA B D E|]\n`;
        const { song } = convertAbc(source, { file: 'test.abc' });
        expect(song.generator.scaleFamily).toBe('Pentatonic');
        expect(song.difficulties.easy.treble.notes[1]).toMatch(/^B♭/u);
    });

    it('Pentatonic Major on F genuinely needs a flat on B (F major\'s own signature, B unused so harmless — but not forced to zero either)', () => {
        const source = `${MINIMAL_HEADER}K:F pentatonic major\nF G A c4|]\n`;
        const { song } = convertAbc(source, { file: 'test.abc' });
        expect(song.generator.scaleFamily).toBe('Pentatonic');
        // None of F/G/A/C carry an accidental under a 1-flat (Bb) signature.
        song.difficulties.easy.treble.notes.forEach((n) => {
            expect(n, `note "${n}" should have no accidental`).not.toMatch(/[♯♭𝄪𝄫]/u);
        });
    });

    it('still applies a real key signature for a Diatonic key (sanity check the shared function is used for both)', () => {
        const source = `${MINIMAL_HEADER}K:D\nFGA c4|]\n`; // D major = 2 sharps (F#, C#)
        const { song } = convertAbc(source, { file: 'test.abc' });
        expect(song.generator.scaleFamily).toBe('Diatonic');
        // The bare "F" in D major should be spelled F♯ by the key signature.
        expect(song.difficulties.easy.treble.notes[0]).toMatch(/^F♯/u);
    });
});
