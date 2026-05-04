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
} from '../noteUtils';

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
