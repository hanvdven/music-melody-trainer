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
