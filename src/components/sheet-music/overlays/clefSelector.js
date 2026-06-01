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

// The three families, in carousel order. `clef` is the default concrete clef the
// family resolves to when first selected.
export const CLEF_FAMILIES = [
    { id: 'g', label: 'Treble', clef: 'treble', glyph: '&' },
    { id: 'f', label: 'Bass', clef: 'bass', glyph: '?' },
    { id: 'vocal', label: 'Vocal', clef: 'alto', glyph: 'B' },
];

// Vocal clefs, low→high (used as the vocal family's variants).
export const VOCAL_VARIANTS = [
    { clef: 'bass', label: 'Bass' },
    { clef: 'tenor', label: 'Tenor' },
    { clef: 'alto', label: 'Alto' },
    { clef: 'mezzo-soprano', label: 'Mezzo' },
    { clef: 'soprano', label: 'Soprano' },
];

// Octave variants per melodic family. `rangeMode` mirrors the existing
// applyRangeOption values so the rest of the app (clef calc, generation) keeps
// working unchanged. `default:true` marks the plain (non-ottava) variant.
export const OCTAVE_VARIANTS = {
    g: [
        { id: 'treble', label: '8', rangeMode: null, default: true },
        { id: 'treble8va', label: '8va', rangeMode: 'relative' },
        { id: 'treble15ma', label: '15ma', rangeMode: 'relative_15a' },
    ],
    f: [
        { id: 'bass', label: '8', rangeMode: null, default: true },
        { id: 'bass8vb', label: '8vb', rangeMode: 'relative_low' },
        { id: 'bass8va', label: '8va', rangeMode: 'relative' },
    ],
};

// Which family a concrete clef belongs to.
export const familyOfClef = (clef) => {
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

// Carousel order starting at `currentFamilyId`: current first, then the others in
// CLEF_FAMILIES order (wrapping). Picking a non-first item should slide the list so
// the picked family becomes first — the view animates L→R between these orders.
export const carouselOrder = (currentFamilyId) => {
    const idx = Math.max(0, CLEF_FAMILIES.findIndex(f => f.id === currentFamilyId));
    return CLEF_FAMILIES.map((_, i) => CLEF_FAMILIES[(idx + i) % CLEF_FAMILIES.length]);
};

// Settings patch for selecting a FAMILY (left carousel). Resolves to the family's
// default clef and resets to the plain octave variant; keeps transpositionKey.
export const patchForFamily = (familyId) => {
    const fam = CLEF_FAMILIES.find(f => f.id === familyId) || CLEF_FAMILIES[0];
    return { preferredClef: fam.clef, rangeMode: familyId === 'vocal' ? 'Alto' : 'STANDARD' };
};

// Settings patch for selecting an OCTAVE variant (melodic families only).
export const patchForOctave = (familyId, variantId) => {
    const v = (OCTAVE_VARIANTS[familyId] || []).find(o => o.id === variantId);
    if (!v) return null;
    const base = familyId === 'g' ? 'treble' : 'bass';
    return { preferredClef: base, rangeMode: v.rangeMode ?? 'STANDARD' };
};

// Settings patch for selecting a VOCAL variant clef.
export const patchForVocal = (clef) => ({ preferredClef: clef, rangeMode: 'Alto' });

// Settings patch for a transposition chip.
export const patchForTransposition = (key) => ({ transpositionKey: key || 'C' });
