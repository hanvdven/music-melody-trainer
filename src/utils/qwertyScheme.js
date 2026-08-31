// #871 (Han 2026-08-11, #871 UAT: "Sakura: de keyboard range past niet... die regel moet flexibeler"):
// PianoView's QWERTY mapping used to ALWAYS anchor C4=Q (FIXED_ANCHOR_WHITE_KEYS in PianoView.jsx) —
// any note outside the fixed C4-G5 window simply got no physical key. For a song whose range sits
// elsewhere (e.g. Sakura's B3-C5), that meant most of the melody had no QWERTY key at all. This module
// derives a scheme dynamically from a melody's actual note range, following Han's own fallback ladder.
//
// Reordered (Han 2026-08-11, #871 follow-up: "volgorde van range regels moet aangepast... probeer eerst
// (cn-gn+1), probeer dan b(n-1)-a(n+1)... en daarna pas de 12 witte toetsen regel met verschuiving") —
// FIXED, octave-anchored windows are now tried before any range-dependent ("shifted") window, since a
// fixed window is more predictable/memorable across different songs than one anchored to each song's
// own lowest note:
//   a) range fits within SOME C(n)-G(n+1)              -> anchor that C(n)=Q (12-key shape; n=4 is the
//                                                          original default C4-G5 window)
//   b) else, range fits within SOME B(n-1)-A(n+1)       -> anchor that C(n)=Q, but the row is EXTENDED
//                                                          with Tab=B(n-1) (one white key before Q) and
//                                                          \=A(n+1) (one after ]) — same fixed-window
//                                                          idea as (a), just widened by one white key on
//                                                          each side to cover the extra 2 keys (14 total)
//   c) else, range spans <=12 white keys                -> anchor the range's OWN lowest white key on Q
//                                                          ("met verschuiving" — a shifted window, only
//                                                          reached once no fixed window covers it)
//   d) else, range spans <=14 white keys                -> as (c), but extended with Tab/\ same as (b)
//                                                          (kept as a safety fallback for the rare range
//                                                          that misses every fixed B(n-1)-A(n+1) window
//                                                          near the extreme low/high octaves)
//   e) else                                              -> spread over two rows: bottom row (Z../, 10
//                                                           keys) carries the low end starting at Z =
//                                                           the range's lowest note; the top row (Q..])
//                                                           continues immediately where the bottom row's
//                                                           '/' leaves off.
// Returns the same { whiteNotes, whiteKeys, blackGapKeys } shape PianoView.jsx's QWERTY_SCHEMES already
// use (blackGapKeys[i] = physical key for the gap between whiteNotes[i]/[i+1], undefined = no black key
// there — E-F and B-C boundaries never have one).

const NATURAL_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_ORDER = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

// Natural-note-only ordinal (accidentals fold onto their own letter's slot — this scheme only ever
// assigns QWERTY keys to WHITE keys, so a sharp/flat note's exact chroma doesn't change which physical
// key-window it needs to fall inside).
export const whiteKeyOrdinal = (note) => {
    const m = String(note).match(/^([A-G])[#♯b♭]?(-?\d+)$/);
    if (!m) return null;
    return parseInt(m[2], 10) * 7 + NATURAL_ORDER[m[1]];
};

// Inverse of `whiteKeyOrdinal` — the natural note name at a given white-key ordinal. Exported so
// other keyboard builders (WorldPiano's range window) reuse the one definition (§6c).
export const noteAtOrdinal = (ord) => {
    const octave = Math.floor(ord / 7);
    const letter = NATURAL_LETTERS[((ord % 7) + 7) % 7];
    return `${letter}${octave}`;
};

// Top physical row, extended with Tab (before Q) and \ (after ]) for rule (d). Index 0 = Tab.
const TOP_ROW_WHITE_KEYS = ['tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'];
// Gaps for the EXTENDED 14-key row (13 gaps). The original 11 app-scheme gap labels sit in the middle
// (between q and ]); the two new boundary gaps (tab-q, ]-\\) have no established number-row partner in
// this app's convention, so they carry no black key (undefined) rather than inventing a new label.
const TOP_ROW_GAP_KEYS = [undefined, '2', '3', undefined, '5', '6', '7', undefined, '9', '0', undefined, '=', undefined];

const BOTTOM_ROW_WHITE_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'];
const BOTTOM_ROW_GAP_KEYS = ['s', undefined, 'd', 'f', undefined, 'h', 'j', 'k', undefined];

// Builds a { whiteNotes, whiteKeys, blackGapKeys } window: `count` consecutive natural notes starting
// at ordinal `anchorOrd`, using the top row's keys starting at `keyOffset` (1 = skip Tab, the app-scheme
// default; 0 = include Tab as the first key, rule d's low end).
const topRowWindow = (anchorOrd, count, keyOffset) => ({
    whiteNotes: Array.from({ length: count }, (_, i) => noteAtOrdinal(anchorOrd + i)),
    whiteKeys: TOP_ROW_WHITE_KEYS.slice(keyOffset, keyOffset + count),
    blackGapKeys: TOP_ROW_GAP_KEYS.slice(keyOffset, keyOffset + count - 1),
});

export function deriveQwertyScheme(rangeMin, rangeMax) {
    const loOrd = whiteKeyOrdinal(rangeMin);
    const hiOrd = whiteKeyOrdinal(rangeMax);
    if (loOrd == null || hiOrd == null || hiOrd < loOrd) {
        // Malformed input — fall back to the app default rather than throwing (mirrors
        // QWERTY_SCHEMES.app in PianoView.jsx; kept in sync there, not re-imported, to avoid a
        // circular import between the two files).
        return topRowWindow(4 * 7, 12, 1);
    }
    const whiteCount = hiOrd - loOrd + 1;
    const fitsWindow = (anchorOrd, count) => loOrd >= anchorOrd && hiOrd <= anchorOrd + count - 1;

    // a) fits SOME C(n)-G(n+1) — 12-key shape, anchored at that C. n=4 (C4-G5) is checked first so the
    // original default window still wins on a tie against any other n that would also fit.
    const C4_ORD = 4 * 7;
    if (fitsWindow(C4_ORD, 12)) return topRowWindow(C4_ORD, 12, 1);
    for (let n = 0; n <= 9; n++) {
        const anchorOrd = n * 7;
        if (fitsWindow(anchorOrd, 12)) return topRowWindow(anchorOrd, 12, 1);
    }

    // b) fits SOME B(n-1)-A(n+1) — same fixed-window idea as (a), widened by one white key on each side
    // (14 total) so it still covers a range whose lowest/highest note falls just outside every C(n)-G(n+1)
    // window. B(n-1)'s ordinal is exactly C(n)'s ordinal minus 1.
    for (let n = 0; n <= 9; n++) {
        const anchorOrd = n * 7 - 1;
        if (fitsWindow(anchorOrd, 14)) return topRowWindow(anchorOrd, 14, 0);
    }

    // c) doesn't fit any fixed C(n)/B(n-1)-anchored window, but the range itself spans <=12 white keys —
    // anchor the range's OWN lowest white key on Q ("met verschuiving" — a shifted window).
    if (whiteCount <= 12) return topRowWindow(loOrd, whiteCount, 1);

    // d) <=14 white keys — as (c), extended with Tab (before Q) and \ (after ]). Safety fallback for the
    // rare range that spans 13-14 keys but still misses every fixed B(n-1)-A(n+1) window from (b).
    if (whiteCount <= 14) return topRowWindow(loOrd, whiteCount, 0);

    // e) still doesn't fit — spread over two rows. Bottom row (Z../, up to 10 keys) carries the low
    // end starting at the range's own lowest note; the top row (Q..], up to 12 keys, no Tab/\\ needed
    // here) continues immediately where the bottom row leaves off, so the two rows together form one
    // continuous ascending sequence of white keys.
    const bottomCount = Math.min(10, whiteCount);
    const topCount = Math.min(12, whiteCount - bottomCount);
    const bottomOrd = loOrd;
    const topOrd = loOrd + bottomCount;
    return {
        whiteNotes: [
            ...Array.from({ length: bottomCount }, (_, i) => noteAtOrdinal(bottomOrd + i)),
            ...Array.from({ length: topCount }, (_, i) => noteAtOrdinal(topOrd + i)),
        ],
        whiteKeys: [...BOTTOM_ROW_WHITE_KEYS.slice(0, bottomCount), ...TOP_ROW_WHITE_KEYS.slice(1, 1 + topCount)],
        // No black key across the two-row seam (bottom row's last key to top row's first) — the two
        // rows are physically not adjacent, so no single key could represent that gap.
        blackGapKeys: [
            ...BOTTOM_ROW_GAP_KEYS.slice(0, bottomCount - 1),
            undefined,
            ...TOP_ROW_GAP_KEYS.slice(1, topCount),
        ],
    };
}
