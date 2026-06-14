import { ALL_NOTES, getNoteSemitone } from '../theory/noteUtils';

// Shared range helpers — extracted from RangeControls so the new in-SVG range
// overlay and the legacy stepper control use ONE source of truth for
// note-name ↔ MIDI conversion and the range clamp rules (CLAUDE.md §6c).

// Note name (e.g. 'C4', 'F♯3') → MIDI number. Falls back to 60 (C4) when the
// string can't be parsed, matching the previous local implementation.
export const getNoteValue = (note) => {
    if (!note) return 60;
    const match = note.match(/^([A-G][#b♯♭]?)(-?\d+)$/);
    if (!match) return 60;
    const oct = parseInt(match[2], 10);
    return (oct + 1) * 12 + getNoteSemitone(match[1]);
};

// MIDI number → note name using ALL_NOTES (chromatic, sharp spelling).
export const getNoteFromValue = (val) => {
    const oct = Math.floor(val / 12) - 1;
    const pcIndex = val % 12;
    return `${ALL_NOTES[pcIndex]}${oct}`;
};

// Natural (white-key) pitch classes only — the diatonic row shared by the
// sheet-music range row (D1) and the keyboard range setter.
const PC_TO_LETTER = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

// All naturals (white keys) with MIDI in [lowMidi, highMidi], ascending.
export const naturalsInRange = (lowMidi, highMidi) => {
    const out = [];
    for (let m = lowMidi; m <= highMidi; m++) {
        const letter = PC_TO_LETTER[((m % 12) + 12) % 12];
        if (letter) out.push({ midi: m, name: `${letter}${Math.floor(m / 12) - 1}` });
    }
    return out;
};

const nearestNaturalIdx = (naturals, midi) => {
    let bi = 0, bd = Infinity;
    naturals.forEach((n, i) => { const d = Math.abs(n.midi - midi); if (d < bd) { bd = d; bi = i; } });
    return bi;
};

// Boundary-relative window of naturals: every natural between the two boundaries
// plus `context` naturals beyond each side, capped to the piano (A0..C8). Shared
// by the sheet-music row and the keyboard setter so both show the SAME symmetric
// window (3 below min … 3 above max) and both let the user drag a boundary
// outward past the old ±octave limit, revealing fresh context on release.
export const windowNaturals = (selMin, selMax, context) => {
    const all = naturalsInRange(21, 108);
    const iMin = nearestNaturalIdx(all, Math.min(selMin, selMax));
    const iMax = nearestNaturalIdx(all, Math.max(selMin, selMax));
    const a = Math.max(0, iMin - context);
    const b = Math.min(all.length - 1, iMax + context);
    return all.slice(a, b + 1);
};

// Apply a boundary move to a {min,max} note-name range and return the new
// note-name range + matching preset mode. ONE write path for every range
// surface (sheet music, keyboard, steppers) so the clamp rules can't diverge.
// `bound` is 'min' | 'max'; `presets` is a clef-aware [{label,min,max}] list.
export const applyRangeBoundary = (prevRange, midi, bound, presets = []) => {
    const curMin = getNoteValue(prevRange.min);
    const curMax = getNoteValue(prevRange.max);
    const startMin = bound === 'min' ? midi : curMin;
    const startMax = bound === 'max' ? midi : curMax;
    const { min, max } = clampRange(startMin, startMax, bound);
    const range = { min: getNoteFromValue(min), max: getNoteFromValue(max) };
    const hit = presets.find(p => p.min === range.min && p.max === range.max);
    return { range, rangeMode: hit ? hit.label : 'CUSTOM' };
};

// Clamp a {min,max} MIDI pair to the app's range rules:
//  - minimum span of 12 semitones (one octave),
//  - hard bounds 21..108 (A0..C8).
// `bound` is the side the user just moved ('min' | 'max'); the OPPOSITE side is
// pushed to preserve the minimum span, so the moved side stays where the user
// put it. Returns MIDI numbers (callers convert back with getNoteFromValue).
export const clampRange = (newMin, newMax, bound) => {
    if (newMax - newMin < 12) {
        if (bound === 'min') newMax = newMin + 12;
        else newMin = newMax - 12;
    }
    if (newMin < 21) { newMin = 21; if (newMax < 33) newMax = 33; }
    if (newMax > 108) { newMax = 108; if (newMin > 96) newMin = 96; }
    return { min: newMin, max: newMax };
};
