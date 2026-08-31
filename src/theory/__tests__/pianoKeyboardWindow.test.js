import { describe, it, expect } from 'vitest';
import { buildPianoWindow } from '../pianoKeyboardWindow';

const whiteNames = (w) => w.whites.map(({ pc, oct }) => `${pc}${oct}`);

describe('buildPianoWindow', () => {
    it('sub-octave range widens to the containing C–C octave', () => {
        const w = buildPianoWindow('D4', 'A4', 'C4');
        expect(whiteNames(w)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']);
        expect(w.blacks.map((b) => `${b.pc}${b.oct}`)).toEqual(['D♭4', 'E♭4', 'F♯4', 'A♭4', 'B♭4']);
    });

    it('falls back to a G–G octave when no C–C octave contains the range', () => {
        const w = buildPianoWindow('A4', 'E5', 'C4');
        expect(whiteNames(w)).toEqual(['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5']);
    });

    it('falls back to tonic→tonic+octave when neither C–C nor G–G fits', () => {
        // E4..D5 sits inside no C(n)–C(n+1) or G(n)–G(n+1) octave; tonic E → E4..E5.
        const w = buildPianoWindow('E4', 'D5', 'E4');
        expect(whiteNames(w)[0]).toBe('E4');
        expect(whiteNames(w).at(-1)).toBe('E5');
    });

    it('multi-octave range shows the whole (white-snapped) span', () => {
        const w = buildPianoWindow('C4', 'C6', 'C4');
        expect(whiteNames(w)[0]).toBe('C4');
        expect(whiteNames(w).at(-1)).toBe('C6');
        expect(w.whites.length).toBe(15);
    });

    it('exposes the range as midi bounds for out-of-range greying', () => {
        const w = buildPianoWindow('D4', 'A4', 'C4');
        expect(w.rangeLoMidi).toBe(62); // D4
        expect(w.rangeHiMidi).toBe(69); // A4
    });

    it('tolerates missing range (defaults to C4–C5)', () => {
        const w = buildPianoWindow(undefined, undefined);
        expect(whiteNames(w)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']);
    });
});
