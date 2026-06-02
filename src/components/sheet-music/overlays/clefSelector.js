// Pure data + logic for the in-staff CLEF selector (Han 2026-06-01).
//
// The selector has two parts:
//   LEFT 20% — a carousel of the three clef FAMILIES (G / F / Vocal). The current
//              family sits leftmost; the other two are shown lowlit beside it.
//              Picking one slides the carousel L→R (animation lives in the view).
//   RIGHT 80% — the VARIANTS of the current family: octave variants (8va/8vb/…)
//              and transposition chips (e.g. G^B♭). The last chip ("…") opens the
//              full transposing-instrument list (same set as the old long-click).
//
// We keep the existing per-staff fields separate (Han): `preferredClef`
// ('treble'|'bass'|vocal clef strings) and `transpositionKey` ('C'|'Bb'|…). This
// module only computes WHICH options to show and HOW to map a pick onto a settings
// patch — it never mutates state. All pure + tested.

import { TRANSPOSING_INSTRUMENTS } from '../../../constants/transposingInstruments';

// The clef families, in carousel order. `clef` is the default concrete clef the
// family resolves to when first selected. The 4th, 'off', is a DISABLE option: a
// large cross that turns the staff off (Han 2026-06-01); it has no variants.
export const CLEF_FAMILIES = [
    { id: 'g', label: 'Treble', clef: 'treble', glyph: '&' },
    { id: 'f', label: 'Bass', clef: 'bass', glyph: '?' },
    { id: 'vocal', label: 'Vocal', clef: 'alto', glyph: 'B' },
    { id: 'off', label: 'Off', clef: 'off', glyph: '✕' },
];

// Sentinel clef value meaning "this staff is disabled" (grey/hidden bar).
export const CLEF_OFF = 'off';

// Vocal voices, low→high (the vocal family's variants). Each carries the clef
// string it notates in AND the glyph to draw, so the selector shows the real clef
// (Han 2026-06-01: show clefs, not names). The vocal BASS/BARITONE notate in the
// F-clef but are distinct VOICES from the instrumental bass clef (Han); the C-clef
// voices (tenor/alto/mezzo/soprano) share the C-clef glyph at different staff
// positions. `rangeMode` is the per-voice label the rest of the app already knows.
export const VOCAL_VARIANTS = [
    { clef: 'bass', rangeMode: 'Bass', label: 'Bass', glyph: '?', glyphClef: 'f' },
    { clef: 'bass', rangeMode: 'Baritone', label: 'Baritone', glyph: '?', glyphClef: 'f' },
    { clef: 'tenor', rangeMode: 'Tenor', label: 'Tenor', glyph: 'B', glyphClef: 'c' },
    { clef: 'alto', rangeMode: 'Alto', label: 'Alto', glyph: 'B', glyphClef: 'c' },
    { clef: 'mezzo-soprano', rangeMode: 'Mezzo-soprano', label: 'Mezzo', glyph: 'B', glyphClef: 'c' },
    { clef: 'soprano', rangeMode: 'Soprano', label: 'Soprano', glyph: 'B', glyphClef: 'c' },
];

// Octave variants per melodic family. `rangeMode` mirrors the existing
// applyRangeOption values so the rest of the app (clef calc, generation) keeps
// working unchanged. `default:true` marks the plain (non-ottava) variant. Each
// carries the GLYPH (Maestro clef char) + the ottava marker (`ott`: number + side)
// so the selector can draw the full ottava CLEF (clef + 8/15 above/below) rather
// than a text label (Han 2026-06-01: show the clefs, minimal text).
export const OCTAVE_VARIANTS = {
    g: [
        { id: 'treble', glyph: '&', ott: null, rangeMode: null, default: true },
        { id: 'treble8va', glyph: '&', ott: { n: '8', above: true }, rangeMode: 'relative' },
        { id: 'treble15ma', glyph: '&', ott: { n: '15', above: true }, rangeMode: 'relative_15a' },
    ],
    f: [
        { id: 'bass', glyph: '?', ott: null, rangeMode: null, default: true },
        { id: 'bass8vb', glyph: '?', ott: { n: '8', above: false }, rangeMode: 'relative_low' },
        { id: 'bass8va', glyph: '?', ott: { n: '8', above: true }, rangeMode: 'relative' },
    ],
};

// Which family a concrete clef belongs to.
export const familyOfClef = (clef) => {
    if (clef === CLEF_OFF) return 'off';
    if (clef === 'treble') return 'g';
    if (clef === 'bass') return 'f';
    return 'vocal';   // alto/tenor/soprano/mezzo-soprano
};

// The transposition chips shown inline on the right (a short, common subset);
// the remaining instruments live behind the "…" full-list chip. Concert pitch (C)
// is the implicit default and not shown as a chip.
export const INLINE_TRANSPOSITIONS = ['Bb', 'Eb', 'F'];

export const transpositionChips = () =>
    INLINE_TRANSPOSITIONS
        .map(key => TRANSPOSING_INSTRUMENTS.find(i => i.key === key))
        .filter(Boolean)
        .map(i => ({ key: i.key, label: i.label }));

// The 3 INLINE instrument-clef cards for the melodic families (Han #14): Concert
// pitch + the two most common transposing instruments (B♭, E♭). Each card renders a
// full clef + a 3-note reference melody transposed by `semitones`, so the
// transposition is visually obvious; `display` ('C inst' / 'B♭ inst' / 'E♭ inst') is
// shown as a small superscript. The rest of the instruments live behind the "…" card.
// `semitones` = add to concert pitch → written pitch (see transposingInstruments.js).
export const INLINE_CLEF_CARDS = ['C', 'Bb', 'Eb'];
export const instrumentClefCards = () =>
    INLINE_CLEF_CARDS
        .map(key => TRANSPOSING_INSTRUMENTS.find(i => i.key === key))
        .filter(Boolean)
        .map(i => ({ key: i.key, label: i.label, display: i.display, semitones: i.semitones }));

// Carousel order starting at `currentFamilyId`: current first, then the others in
// CLEF_FAMILIES order (wrapping). Picking a non-first item should slide the list so
// the picked family becomes first — the view animates L→R between these orders.
export const carouselOrder = (currentFamilyId) => {
    const idx = Math.max(0, CLEF_FAMILIES.findIndex(f => f.id === currentFamilyId));
    return CLEF_FAMILIES.map((_, i) => CLEF_FAMILIES[(idx + i) % CLEF_FAMILIES.length]);
};

// Settings patch for selecting a FAMILY (left carousel). Resolves to the family's
// default clef and resets to the plain octave variant; keeps transpositionKey.
// 'off' disables the staff (no rangeMode change needed).
export const patchForFamily = (familyId) => {
    const fam = CLEF_FAMILIES.find(f => f.id === familyId) || CLEF_FAMILIES[0];
    if (fam.id === 'off') return { preferredClef: CLEF_OFF };
    return { preferredClef: fam.clef, rangeMode: familyId === 'vocal' ? 'Alto' : 'STANDARD' };
};

// Settings patch for selecting an OCTAVE variant (melodic families only).
export const patchForOctave = (familyId, variantId) => {
    const v = (OCTAVE_VARIANTS[familyId] || []).find(o => o.id === variantId);
    if (!v) return null;
    const base = familyId === 'g' ? 'treble' : 'bass';
    return { preferredClef: base, rangeMode: v.rangeMode ?? 'STANDARD' };
};

// Settings patch for selecting a VOCAL voice. `voice` is a VOCAL_VARIANTS entry
// (or a clef string for back-compat). Sets the notating clef + the voice's
// rangeMode so Bass vs Baritone (both F-clef) stay distinct.
export const patchForVocal = (voice) => {
    if (typeof voice === 'string') {
        const v = VOCAL_VARIANTS.find(x => x.clef === voice) || { clef: voice, rangeMode: 'Alto' };
        return { preferredClef: v.clef, rangeMode: v.rangeMode };
    }
    return { preferredClef: voice.clef, rangeMode: voice.rangeMode };
};

// Settings patch for a transposition chip.
export const patchForTransposition = (key) => ({ transpositionKey: key || 'C' });
