import { describe, it, expect } from 'vitest';
import {
    getNoteSemitone,
    getCanonicalNote,
    normalizeNoteChars,
    collapseAccidentals,
    CANONICAL_MAP,
    ENHARMONIC_PAIRS,
    getTraditionalSolfege,
    getKodalySolfege,
    respellToKeySignature,
    melodicNoteColor,
} from '../noteUtils';
import { getTranspositionFifths } from '../../constants/transposingInstruments';

describe('getNoteSemitone', () => {
    it('returns 0-11 for natural notes', () => {
        expect(getNoteSemitone('C')).toBe(0);
        expect(getNoteSemitone('D')).toBe(2);
        expect(getNoteSemitone('E')).toBe(4);
        expect(getNoteSemitone('F')).toBe(5);
        expect(getNoteSemitone('G')).toBe(7);
        expect(getNoteSemitone('A')).toBe(9);
        expect(getNoteSemitone('B')).toBe(11);
    });

    it('handles octaves (strips trailing digits)', () => {
        expect(getNoteSemitone('C4')).toBe(0);
        expect(getNoteSemitone('C5')).toBe(0);
        expect(getNoteSemitone('A-1')).toBe(9);
    });

    it('handles Unicode sharps and flats identically to enharmonic equivalents', () => {
        expect(getNoteSemitone('C♯')).toBe(1);
        expect(getNoteSemitone('D♭')).toBe(1);
        expect(getNoteSemitone('D♯')).toBe(3);
        expect(getNoteSemitone('E♭')).toBe(3);
        expect(getNoteSemitone('F♯')).toBe(6);
        expect(getNoteSemitone('G♭')).toBe(6);
        expect(getNoteSemitone('G♯')).toBe(8);
        expect(getNoteSemitone('A♭')).toBe(8);
        expect(getNoteSemitone('A♯')).toBe(10);
        expect(getNoteSemitone('B♭')).toBe(10);
    });

    it('handles ASCII sharps and flats (via internal normalize)', () => {
        expect(getNoteSemitone('C#')).toBe(1);
        expect(getNoteSemitone('Db')).toBe(1);
        expect(getNoteSemitone('Bb4')).toBe(10);
    });

    it('handles enharmonic edge cases (B♯ = C, C♭ = B, E♯ = F, F♭ = E)', () => {
        expect(getNoteSemitone('B♯')).toBe(0);
        expect(getNoteSemitone('C♭')).toBe(11);
        expect(getNoteSemitone('E♯')).toBe(5);
        expect(getNoteSemitone('F♭')).toBe(4);
    });

    it('handles double accidentals', () => {
        expect(getNoteSemitone('C𝄪')).toBe(2); // C double-sharp = D
        expect(getNoteSemitone('D𝄫')).toBe(0); // D double-flat = C
        expect(getNoteSemitone('F𝄪')).toBe(7); // F double-sharp = G
        expect(getNoteSemitone('B𝄫')).toBe(9); // B double-flat = A
    });

    it('returns 0 for falsy input', () => {
        expect(getNoteSemitone('')).toBe(0);
        expect(getNoteSemitone(null)).toBe(0);
        expect(getNoteSemitone(undefined)).toBe(0);
    });
});

describe('getCanonicalNote', () => {
    it('applies CANONICAL_MAP entries (preserves octave)', () => {
        expect(getCanonicalNote('C♯4')).toBe('D♭4');
        expect(getCanonicalNote('D♯4')).toBe('E♭4');
        expect(getCanonicalNote('G♭4')).toBe('F♯4');
        expect(getCanonicalNote('G♯4')).toBe('A♭4');
        expect(getCanonicalNote('A♯4')).toBe('B♭4');
        expect(getCanonicalNote('E♯4')).toBe('F4');
        expect(getCanonicalNote('B♯4')).toBe('C4');
        expect(getCanonicalNote('C♭4')).toBe('B4');
        expect(getCanonicalNote('F♭4')).toBe('E4');
    });

    it('leaves canonical-form notes unchanged', () => {
        expect(getCanonicalNote('C4')).toBe('C4');
        expect(getCanonicalNote('D♭4')).toBe('D♭4');
        expect(getCanonicalNote('F♯5')).toBe('F♯5');
        expect(getCanonicalNote('B♭3')).toBe('B♭3');
    });

    it('handles negative octaves', () => {
        expect(getCanonicalNote('C♯-1')).toBe('D♭-1');
        expect(getCanonicalNote('B0')).toBe('B0');
    });

    it('returns input unchanged when format does not match', () => {
        expect(getCanonicalNote('not-a-note')).toBe('not-a-note');
    });

    it('every CANONICAL_MAP entry roundtrips to a valid pitch class', () => {
        // For every (input → output) pair, the resulting canonical note should
        // have the same semitone as the input.
        for (const [from, to] of Object.entries(CANONICAL_MAP)) {
            expect(getNoteSemitone(from)).toBe(getNoteSemitone(to));
        }
    });
});

describe('normalizeNoteChars', () => {
    it('promotes ASCII # and b to Unicode', () => {
        expect(normalizeNoteChars('C#')).toBe('C♯');
        expect(normalizeNoteChars('Bb')).toBe('B♭');
        expect(normalizeNoteChars('F#5')).toBe('F♯5');
    });

    it('processes double accidentals before single (no partial replacement)', () => {
        expect(normalizeNoteChars('C##')).toBe('C𝄪');
        expect(normalizeNoteChars('Bbb')).toBe('B𝄫');
        expect(normalizeNoteChars('F##4')).toBe('F𝄪4');
    });

    it('is idempotent on already-Unicode strings', () => {
        expect(normalizeNoteChars('C♯')).toBe('C♯');
        expect(normalizeNoteChars('B♭')).toBe('B♭');
        expect(normalizeNoteChars('F𝄪4')).toBe('F𝄪4');
    });

    it('handles falsy and non-string input safely', () => {
        expect(normalizeNoteChars('')).toBe('');
        expect(normalizeNoteChars(null)).toBe(null);
        expect(normalizeNoteChars(undefined)).toBe(undefined);
    });
});

describe('collapseAccidentals', () => {
    it('removes ♯♭ and ♭♯ cancellations', () => {
        expect(collapseAccidentals('C♯♭')).toBe('C');
        expect(collapseAccidentals('D♭♯')).toBe('D');
    });

    it('compresses ♯♯ to 𝄪 and ♭♭ to 𝄫', () => {
        expect(collapseAccidentals('F♯♯')).toBe('F𝄪');
        expect(collapseAccidentals('B♭♭')).toBe('B𝄫');
    });

    it('leaves single accidentals unchanged', () => {
        expect(collapseAccidentals('C♯')).toBe('C♯');
        expect(collapseAccidentals('B♭')).toBe('B♭');
        expect(collapseAccidentals('A')).toBe('A');
    });
});

describe('ENHARMONIC_PAIRS', () => {
    it('is bidirectional for all entries', () => {
        for (const [from, to] of Object.entries(ENHARMONIC_PAIRS)) {
            expect(ENHARMONIC_PAIRS[to]).toBe(from);
        }
    });

    it('every pair has matching semitone', () => {
        for (const [from, to] of Object.entries(ENHARMONIC_PAIRS)) {
            expect(getNoteSemitone(from)).toBe(getNoteSemitone(to));
        }
    });
});

describe('getTraditionalSolfege', () => {
    it('returns do for tonic', () => {
        const r = getTraditionalSolfege('C4', 'C4');
        expect(r.base).toBe('do');
        expect(r.acc).toBe('');
    });

    it('returns sol for fifth', () => {
        const r = getTraditionalSolfege('G4', 'C4');
        expect(r.base).toBe('sol');
        expect(r.acc).toBe('');
    });

    it('returns mi♭ for minor third', () => {
        const r = getTraditionalSolfege('E♭4', 'C4');
        expect(r.base).toBe('mi');
        expect(r.acc).toBe('♭');
    });

    it('handles enharmonic equivalents identically', () => {
        const sharp = getTraditionalSolfege('D♯4', 'C4');
        const flat = getTraditionalSolfege('E♭4', 'C4');
        expect(sharp).toEqual(flat);
    });

    it('wraps around the octave correctly', () => {
        // From C tonic, B (semitone 11) is "si" (leading tone)
        const r = getTraditionalSolfege('B4', 'C4');
        expect(r.base).toBe('si');
        expect(r.acc).toBe('');
    });
});

describe('getKodalySolfege', () => {
    it('returns Do for tonic', () => {
        expect(getKodalySolfege('C4', 'C4').base).toBe('Do');
    });

    it('returns Sol for fifth', () => {
        expect(getKodalySolfege('G4', 'C4').base).toBe('Sol');
    });

    it('returns Me for minor third', () => {
        expect(getKodalySolfege('E♭4', 'C4').base).toBe('Me');
    });

    it('returns Ti for major seventh', () => {
        expect(getKodalySolfege('B4', 'C4').base).toBe('Ti');
    });

    it('always returns empty acc (chromatic syllables already encode accidental)', () => {
        for (const note of ['C4', 'D♭4', 'D4', 'E♭4', 'E4', 'F4', 'F♯4', 'G4', 'A♭4', 'A4', 'B♭4', 'B4']) {
            expect(getKodalySolfege(note, 'C4').acc).toBe('');
        }
    });
});

describe('getTranspositionFifths', () => {
    it('returns 0 for concert / unknown', () => {
        expect(getTranspositionFifths('C')).toBe(0);
        expect(getTranspositionFifths(null)).toBe(0);
        expect(getTranspositionFifths('Z')).toBe(0);
    });
    it('matches the standard transposing-instrument key-signature shifts', () => {
        expect(getTranspositionFifths('Bb')).toBe(2);   // B♭ inst: +2 sharps
        expect(getTranspositionFifths('Eb')).toBe(3);   // E♭ inst: +3
        expect(getTranspositionFifths('Ab')).toBe(4);   // A♭ inst: +4 (concert C → written E major)
        expect(getTranspositionFifths('F')).toBe(1);    // F horn: +1
        expect(getTranspositionFifths('A')).toBe(-3);   // A clarinet: −3
        expect(getTranspositionFifths('G')).toBe(-1);   // alto flute: −1
    });
});

describe('respellToKeySignature', () => {
    it('leaves notes already matching the key signature untouched', () => {
        expect(respellToKeySignature('F♯4', 4)).toBe('F♯4');   // E major has F♯
        expect(respellToKeySignature('C4', 0)).toBe('C4');
    });
    it('respells flats to sharps for a sharp key (A♭ instr. in C major → E major)', () => {
        // C major (C D E F G A B) up a major third = E F♯ G♯ A B C♯ D♯; the chromatic shift
        // spells the black keys as flats, which must respell to the E-major sharp spellings.
        expect(respellToKeySignature('A♭4', 4)).toBe('G♯4');
        expect(respellToKeySignature('D♭5', 4)).toBe('C♯5');
        expect(respellToKeySignature('E♭4', 4)).toBe('D♯4');
    });
    it('respells sharps to flats for a flat key (A♯ → B♭ in E♭ major)', () => {
        // E♭ major (−3) flats B,E,A → B♭ is diatonic; the F♯-spelled black key A♯ becomes B♭.
        expect(respellToKeySignature('A♯4', -3)).toBe('B♭4');
    });
    it('keeps the original octave digit and sounding pitch', () => {
        expect(respellToKeySignature('C♭4', -7)).toBe('C♭4'); // C♭ major has C♭, octave digit kept
        expect(getNoteSemitone(respellToKeySignature('A♭4', 4))).toBe(getNoteSemitone('A♭4'));
    });
    it('keeps pitch classes not diatonic to the key with their incoming spelling', () => {
        // C♯/D♭ is not in C major → unchanged.
        expect(respellToKeySignature('D♭4', 0)).toBe('D♭4');
    });
    it('does not touch percussion / non-pitched tokens', () => {
        expect(respellToKeySignature('r', 4)).toBe('r');
        expect(respellToKeySignature('hh', 4)).toBe('hh');
    });
});

describe("melodicNoteColor — 'scale' mode (Han 2026-06-16)", () => {
    // C major: tonic C, scale notes C D E F G A B. F♯ is the chromatic blue note.
    const tonic = 'C';
    const scaleNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

    it('colours the tonic pitch-class with --note-tonic', () => {
        expect(melodicNoteColor('C4', { noteColoringMode: 'scale', tonic, scaleNotes }))
            .toBe('var(--note-tonic)');
    });

    it('colours an in-scale (non-tonic) pitch-class with --note-scale', () => {
        expect(melodicNoteColor('G4', { noteColoringMode: 'scale', tonic, scaleNotes }))
            .toBe('var(--note-scale)');
    });

    it('colours an out-of-scale chromatic blue note with --note-blue', () => {
        expect(melodicNoteColor('F♯4', { noteColoringMode: 'scale', tonic, scaleNotes }))
            .toBe('var(--note-blue)');
    });

    it('uses enharmonic-correct comparison (G♭ == F♯ → blue note)', () => {
        expect(melodicNoteColor('G♭4', { noteColoringMode: 'scale', tonic, scaleNotes }))
            .toBe('var(--note-blue)');
    });
});
