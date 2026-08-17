import { describe, it, expect } from 'vitest';
import { convertAbc } from '../abc-to-song.mjs';

// Bug fix (Han 2026-08-17, sakura UAT: "de noten kloppen, label is verkeerd"): an earlier version of
// parseKeyField computed a forced key signature for non-Diatonic (pentatonic etc.) modes by looking up
// MODE_FIFTHS keyed on the mode's `diatonic` reference field, wrongly assuming that reference scale
// shares the SAME tonic as the pentatonic mode. It does not — "In" on E is a subset of F Lydian (a
// DIFFERENT tonic), not E Lydian. The bogus 5-sharp signature this produced silently forced sharps onto
// every bare F/C/G/D letter in sakura's real tune body, corrupting 13 notes despite the ABC source
// writing plain, correct natural letters throughout. Fixed by forcing NO key signature (fifths=0) for
// any non-Diatonic mode — every accidental must be written explicitly in the source.
const MINIMAL_HEADER = 'X:1\nT:Test\nM:4/4\nL:1/4\nQ:1/4=90\n';

describe('abc-to-song convertAbc — non-Diatonic key signature (2026-08-17 bug fix)', () => {
    it('does not force accidentals onto bare letters for a Pentatonic "In" key (regression: E In corrupted F/C/D)', () => {
        const source = `${MINIMAL_HEADER}K:E In\nEFAB c4|]\n`;
        const { song } = convertAbc(source, { file: 'test.abc' });
        expect(song.generator.scaleFamily).toBe('Pentatonic');
        expect(song.generator.scaleMode).toBe('In');
        // Every bare letter must come out NATURAL — no sharp/flat glyph anywhere.
        song.difficulties.easy.treble.notes.forEach((n) => {
            expect(n, `note "${n}" should have no accidental`).not.toMatch(/[♯♭𝄪𝄫]/u);
        });
    });

    it('does not force accidentals for a Pentatonic Major key either (regression guard, not just "In")', () => {
        const source = `${MINIMAL_HEADER}K:F pentatonic major\nFGA c4|]\n`;
        const { song } = convertAbc(source, { file: 'test.abc' });
        expect(song.generator.scaleFamily).toBe('Pentatonic');
        song.difficulties.easy.treble.notes.forEach((n) => {
            expect(n, `note "${n}" should have no accidental`).not.toMatch(/[♯♭𝄪𝄫]/u);
        });
    });

    it('still applies a real key signature for a Diatonic key (sanity check the fix is scoped correctly)', () => {
        const source = `${MINIMAL_HEADER}K:D\nFGA c4|]\n`; // D major = 2 sharps (F#, C#)
        const { song } = convertAbc(source, { file: 'test.abc' });
        expect(song.generator.scaleFamily).toBe('Diatonic');
        // The bare "F" in D major should be spelled F♯ by the key signature.
        expect(song.difficulties.easy.treble.notes[0]).toMatch(/^F♯/u);
    });
});
