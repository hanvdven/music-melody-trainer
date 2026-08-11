import { describe, it, expect } from 'vitest';
import { deriveQwertyScheme, whiteKeyOrdinal } from '../qwertyScheme';

// #871 (Han 2026-08-11 UAT: "Sakura: de keyboard range past niet... die regel moet flexibeler").
// Fallback ladder, REORDERED (Han 2026-08-11 follow-up: "volgorde van range regels moet aangepast...
// probeer eerst (cn-gn+1), probeer dan b(n-1)-a(n+1)... en daarna pas de 12 witte toetsen regel met
// verschuiving") so FIXED, octave-anchored windows are always preferred over a window anchored to the
// song's own lowest note:
//   a) any C(n)-G(n+1)          -> anchor C(n)=Q (12 keys)
//   b) any B(n-1)-A(n+1)        -> anchor C(n)=Q, extended with Tab=B(n-1) and \=A(n+1) (14 keys)
//   c) <=12 white keys          -> anchor the range's OWN lowest note on Q (only once a/b both miss)
//   d) <=14 white keys          -> as (c), extended with Tab/\ (safety fallback, rarely reached since
//                                  (b) already tiles every octave 0-9 with no gaps)
//   e) still too big            -> spread over 2 rows
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

    it('rule a: a range outside C4-G5 but fitting another C(n)-G(n+1) anchors THAT C on Q', () => {
        // C3-G4 fits C3-G4 (n=3) — one octave down from the default.
        const s = deriveQwertyScheme('D3', 'F4');
        expect(s.whiteNotes[0]).toBe('C3');
        expect(s.whiteKeys[0]).toBe('q');
        expect(s.whiteNotes).toHaveLength(12);
    });

    it('rule b: Sakura\'s actual range (B3-C5) fits the B3-A5 fixed window — Tab=B3, Q=C4, 14 keys', () => {
        // B3-C5 does NOT fit any C(n)-G(n+1) (would need to start at B, one below C) — falls through to
        // rule b, where it DOES fit the B3-A5 window (B(n-1)-A(n+1) for n=4) exactly at its own low end.
        const s = deriveQwertyScheme('B3', 'C5');
        expect(s.whiteNotes).toHaveLength(14);
        expect(s.whiteKeys[0]).toBe('tab');
        expect(s.whiteNotes[0]).toBe('B3');
        expect(s.whiteKeys[1]).toBe('q');
        expect(s.whiteNotes[1]).toBe('C4');
        expect(s.whiteKeys[s.whiteKeys.length - 1]).toBe('\\');
        expect(s.whiteNotes[s.whiteNotes.length - 1]).toBe('A5');
    });

    it('rule b: a range that misses every C(n)-G(n+1) but fits a B(n-1)-A(n+1) window is preferred over the own-anchor rule c', () => {
        // A3-A4 (8 white keys) fits neither C3-G4 nor C4-G5, but DOES fit the B2-A4 window (n=3:
        // anchorOrd = 3*7-1 = 20 = B2's ordinal) — rule b wins over the range's-own-anchor rule c.
        const s = deriveQwertyScheme('A3', 'A4');
        expect(s.whiteKeys[0]).toBe('tab');
        expect(s.whiteNotes[0]).toBe('B2');
        expect(s.whiteNotes).toHaveLength(14);
    });

    it('rule c: a range past every fixed window\'s octave sweep (n=0..9) falls back to its own lowest note on Q', () => {
        // C11-G11 (5 white keys) would need n=10 for either fixed rule — outside the 0..9 sweep — so it
        // correctly falls through both (a) and (b) to (c).
        const s = deriveQwertyScheme('C11', 'G11');
        expect(s.whiteNotes[0]).toBe('C11');
        expect(s.whiteKeys[0]).toBe('q');
        expect(s.whiteNotes).toHaveLength(5);
    });

    it('rule d: a 13-14 white-key range past every fixed window\'s octave sweep extends with Tab (before Q) and \\ (after ])', () => {
        // C11-B12: 14 white keys, needs n=10 for both fixed rules — outside the 0..9 sweep — falls through
        // to (d): own-lowest-anchor, extended with Tab/\.
        const s = deriveQwertyScheme('C11', 'B12');
        expect(s.whiteNotes).toHaveLength(14);
        expect(s.whiteKeys[0]).toBe('tab');
        expect(s.whiteKeys[1]).toBe('q');
        expect(s.whiteKeys[s.whiteKeys.length - 1]).toBe('\\');
        expect(s.whiteNotes[0]).toBe('C11');
        expect(s.whiteNotes[s.whiteNotes.length - 1]).toBe('B12');
    });

    it('rule e: a range spanning >14 white keys spreads over two rows, z = lowest note', () => {
        // C2-C5: 22 white keys (3 octaves + 1) — too wide for any fixed or own-anchor window.
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
            ['D4', 'A4'], ['D3', 'F4'], ['B3', 'C5'], ['C11', 'B12'], ['C2', 'C5'],
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
