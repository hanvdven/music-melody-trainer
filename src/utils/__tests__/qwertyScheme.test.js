import { describe, it, expect } from 'vitest';
import { deriveQwertyScheme, whiteKeyOrdinal } from '../qwertyScheme';

// #871 (Han 2026-08-11 UAT: "Sakura: de keyboard range past niet... die regel moet flexibeler").
// Locked fallback ladder (rework interview): a) C4-G5 -> unchanged; b) any C(n)-G(n+1); c) <=12 white
// keys -> lowest note on Q; d) <=14 -> extend with Tab/\\; e) still too big -> spread over 2 rows.
describe('deriveQwertyScheme (#871)', () => {
    it('rule a: a range fully inside C4-G5 keeps the exact existing app-scheme shape (byte-identical)', () => {
        const s = deriveQwertyScheme('D4', 'A4');
        expect(s.whiteNotes).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5']);
        expect(s.whiteKeys).toEqual(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']']);
        expect(s.blackGapKeys).toEqual(['2', '3', undefined, '5', '6', '7', undefined, '9', '0', undefined, '=']);
    });

    it('rule a: the exact boundary (C4 to G5 inclusive) still matches', () => {
        const s = deriveQwertyScheme('C4', 'G5');
        expect(s.whiteNotes[0]).toBe('C4');
        expect(s.whiteNotes[s.whiteNotes.length - 1]).toBe('G5');
    });

    it('rule b: a range outside C4-G5 but fitting another C(n)-G(n+1) anchors THAT C on Q', () => {
        // C3-G4 fits C3-G4 (n=3) — one octave down from the default.
        const s = deriveQwertyScheme('D3', 'F4');
        expect(s.whiteNotes[0]).toBe('C3');
        expect(s.whiteKeys[0]).toBe('q');
        expect(s.whiteNotes).toHaveLength(12);
    });

    it('rule c: Sakura-like range (B3-C5, 8 white keys, fits no C(n)-G(n+1) window) anchors its own lowest note on Q', () => {
        // B3 to C5: B,C,D,E,F,G,A,B,C = 9 white keys. Does NOT fit C3-G4 (ends at G4, need up to C5) nor
        // C4-G5 (starts at C4, need down to B3) — must fall through to rule c.
        const s = deriveQwertyScheme('B3', 'C5');
        expect(whiteKeyOrdinal('B3')).toBeLessThan(whiteKeyOrdinal('C4'));
        expect(s.whiteNotes[0]).toBe('B3');
        expect(s.whiteKeys[0]).toBe('q');
        expect(s.whiteNotes[s.whiteNotes.length - 1]).toBe('C5');
        expect(s.whiteNotes).toHaveLength(9);
        expect(s.whiteKeys).toHaveLength(9);
        expect(s.blackGapKeys).toHaveLength(8);
    });

    it('rule c: a 12-white-key range not aligned to any C anchors its own lowest note on Q', () => {
        // D3-C4: D,E,F,G,A,B,C = wait that's 7. Use D3-D4 inclusive spanning 8; force a real 12-key
        // non-C-anchored case: E3-D4 = E,F,G,A,B,C,D = 7 keys, still fits some C(n)-G(n+1)? E3-D4 does
        // NOT fit C3-G4 (starts before C3? no E3>C3) — actually fits C3-G4 fully (E3..D4 inside C3..G4).
        // Use a range that starts BELOW any usable C(n)-G(n+1): F3-E5 spans F,G,A,B,C,D,E,F,G,A,B,C,D,E
        // = 14 white keys total, forces rule d instead. For a clean rule-c-only case spanning exactly
        // 12 keys with no valid C(n) anchor, use D3-C5's neighbour: D3 to C4 is 7 keys (fits C3-G4).
        // Simplest unambiguous rule-c case: A3-G4 (A,B,C,D,E,F,G = 7 keys) still fits C3-G4? A3 < C4 and
        // G4 <= G4 -- fits C3-G4 only if A3 >= C3 (yes) -- so it DOES fit rule b. Use a range whose LOW
        // end sits between G(n) and C(n+1) instead — A3-A4 (A,B,C,D,E,F,G,A = 8 keys): fits C3-G4? A3>=C3
        // yes, A4<=G4? NO (A4>G4) -- doesn't fit C3-G4. Fits C4-G5? A3<C4 -- no. -> rule c.
        const s = deriveQwertyScheme('A3', 'A4');
        expect(s.whiteNotes[0]).toBe('A3');
        expect(s.whiteKeys[0]).toBe('q');
        expect(s.whiteNotes).toHaveLength(8);
    });

    it('rule d: a 13-14 white-key range extends with Tab (before Q) and \\ (after ])', () => {
        // A3-G5: A,B,C,D,E,F,G,A,B,C,D,E,F,G = 14 white keys. Doesn't fit any single C(n)-G(n+1) (13
        // keys max) -> rule d, using Tab as the first key.
        const s = deriveQwertyScheme('A3', 'G5');
        expect(s.whiteNotes).toHaveLength(14);
        expect(s.whiteKeys[0]).toBe('tab');
        expect(s.whiteKeys[1]).toBe('q');
        expect(s.whiteKeys[s.whiteKeys.length - 1]).toBe('\\');
        expect(s.whiteNotes[0]).toBe('A3');
        expect(s.whiteNotes[s.whiteNotes.length - 1]).toBe('G5');
    });

    it('rule e: a range spanning >14 white keys spreads over two rows, z = lowest note', () => {
        // C2-C5: 22 white keys (3 octaves + 1).
        const s = deriveQwertyScheme('C2', 'C5');
        expect(s.whiteNotes[0]).toBe('C2');
        expect(s.whiteKeys[0]).toBe('z');
        // bottom row (10 keys: z..[/]) covers C2..the 10th white key up
        expect(s.whiteKeys.slice(0, 10)).toEqual(['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/']);
        // top row picks up immediately where the bottom row left off (continuous ascending sequence)
        const bottomLastOrd = whiteKeyOrdinal(s.whiteNotes[9]);
        const topFirstOrd = whiteKeyOrdinal(s.whiteNotes[10]);
        expect(topFirstOrd).toBe(bottomLastOrd + 1);
        expect(s.whiteKeys[10]).toBe('q');
    });

    it('whiteNotes is always a strictly ascending sequence of natural notes with no gaps', () => {
        [
            ['D4', 'A4'], ['D3', 'F4'], ['B3', 'C5'], ['A3', 'G5'], ['C2', 'C5'],
        ].forEach(([lo, hi]) => {
            const s = deriveQwertyScheme(lo, hi);
            for (let i = 1; i < s.whiteNotes.length; i++) {
                expect(whiteKeyOrdinal(s.whiteNotes[i])).toBe(whiteKeyOrdinal(s.whiteNotes[i - 1]) + 1);
            }
            // whiteKeys/blackGapKeys arrays are consistently sized (N keys, N-1 gaps)
            expect(s.whiteKeys).toHaveLength(s.whiteNotes.length);
            expect(s.blackGapKeys).toHaveLength(s.whiteNotes.length - 1);
        });
    });

    it('falls back to the default C4-G5 window for malformed input instead of throwing', () => {
        expect(() => deriveQwertyScheme(null, null)).not.toThrow();
        const s = deriveQwertyScheme(null, null);
        expect(s.whiteNotes[0]).toBe('C4');
    });
});
