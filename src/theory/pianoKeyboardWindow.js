import { whiteKeyOrdinal, noteAtOrdinal } from '../utils/qwertyScheme';
import { noteToMidi } from './noteUtils';

// #UI-overhaul (Han 2026-08-28): the WorldPiano used to be a fixed C4→C5 octave. It should instead
// show the keys covering the ACTIVE CLEF's set range. Rules Han locked in the design interview:
//   - span > 1 octave  → show the whole range (white-key-snapped low..high).
//   - span ≤ 1 octave  → widen to a FULL octave. Prefer a C–C octave that contains the range; else a
//                        G–G octave; else `tonic → tonic + octave`.
//   - keys whose pitch falls outside [rangeMin, rangeMax] are flagged out-of-range (WorldPiano greys
//     them) — the window itself is never smaller than the range, only ever equal or wider.
// Black-key spelling is the app's canonical `generateAllNotesArray` identity (C D♭ D E♭ E F F♯ G A♭
// A B♭ B) so downstream `scaleKeyDisplayPC` respells exactly like PianoView.

const NAT_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const CHROMATIC = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

// The natural ordinal `≤ from` that is congruent to `offset` (mod 7), i.e. the nearest anchor at or
// below `from`. Returns that ordinal only if `[anchor, anchor+7]` also covers `to`, else null.
const octaveAnchorCovering = (from, to, offset) => {
    const a = from - ((((from - offset) % 7) + 7) % 7);
    return to <= a + 7 ? a : null;
};

export function buildPianoWindow(rangeMin, rangeMax, tonic = 'C4') {
    const a = whiteKeyOrdinal(rangeMin);
    const b = whiteKeyOrdinal(rangeMax);
    const loOrd = a != null && b != null ? Math.min(a, b) : 4 * 7;          // default C4
    const hiOrd = a != null && b != null ? Math.max(a, b) : 5 * 7;          // default C5
    const span = hiOrd - loOrd + 1;   // inclusive natural-key count (a full octave = 8)

    let winLo = loOrd;
    let winHi = hiOrd;
    if (span <= 8) {
        const tOrd = whiteKeyOrdinal(tonic);
        const tOffset = tOrd != null ? ((tOrd % 7) + 7) % 7 : 0;
        const anchor = octaveAnchorCovering(loOrd, hiOrd, 0)            // C–C
            ?? octaveAnchorCovering(loOrd, hiOrd, 4)                    // G–G
            ?? octaveAnchorCovering(loOrd, hiOrd, tOffset)             // tonic–tonic+8ve (if it fits)
            ?? (loOrd - ((((loOrd - tOffset) % 7) + 7) % 7));         // …else the tonic octave at loOrd
        winLo = anchor;
        winHi = anchor + 7;
    }

    const whites = [];
    for (let o = winLo; o <= winHi; o++) {
        const m = noteAtOrdinal(o).match(/^([A-G])(-?\d+)$/);
        whites.push({ pc: m[1], oct: parseInt(m[2], 10) });
    }

    const blacks = [];
    for (let i = 0; i < whites.length - 1; i++) {
        const p = NAT_PC[whites[i].pc];
        const gap = ((NAT_PC[whites[i + 1].pc] - p) + 12) % 12;
        if (gap === 2) blacks.push({ pc: CHROMATIC[(p + 1) % 12], oct: whites[i].oct, after: i });
    }

    const m1 = noteToMidi(rangeMin);
    const m2 = noteToMidi(rangeMax);
    const rangeLoMidi = m1 != null && m2 != null ? Math.min(m1, m2) : noteToMidi('C4');
    const rangeHiMidi = m1 != null && m2 != null ? Math.max(m1, m2) : noteToMidi('C5');

    return { whites, blacks, rangeLoMidi, rangeHiMidi };
}
