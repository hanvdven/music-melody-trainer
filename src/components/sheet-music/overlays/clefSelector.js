// Pure data + logic for the in-staff CLEF selector (Han 2026-06-01).
//
// The selector has two parts:
//   LEFT 20% — a carousel of the three clef FAMILIES (G / F / Vocal). The current
//              family sits leftmost; the other two are shown lowlit beside it.
//              Picking one slides the carousel L→R (animation lives in the view).
//   RIGHT 80% — the VARIANTS of the current family. For melodic families this is a
//              SWIPEABLE strip of clef cards (octave variants + every transposing
//              instrument), built in the view from OCTAVE_VARIANTS +
//              TRANSPOSING_INSTRUMENTS. Vocal shows the voice clefs.
//
// We keep the existing per-staff fields separate (Han): `preferredClef`
// ('treble'|'bass'|vocal clef strings) and `transpositionKey` ('C'|'Bb'|…). This
// module only computes WHICH options to show and HOW to map a pick onto a settings
// patch — it never mutates state. All pure + tested.

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
// min/max = each voice's singing range; the setter derives its C-G-C reference
// notes from this range (Han #14, 2026-06-03). NOTE: these ranges mirror
// VOCAL_RANGES (RangeControls.jsx) / CLEF_VOCAL_RANGES (SheetMusic.jsx); the three
// copies should be consolidated into one shared constant in a future cleanup.
export const VOCAL_VARIANTS = [
    { clef: 'bass', rangeMode: 'Bass', label: 'Bass', glyph: '?', glyphClef: 'f', min: 'G2', max: 'C4' },
    // Baritone notates in the F-clef with F on the MIDDLE line (its own 'baritone-f'
    // clef), distinct from the instrumental/Bass F-clef (Han 2026-06-03).
    { clef: 'baritone-f', rangeMode: 'Baritone', label: 'Baritone', glyph: '?', glyphClef: 'f', min: 'B2', max: 'F4' },
    { clef: 'tenor', rangeMode: 'Tenor', label: 'Tenor', glyph: 'B', glyphClef: 'c', min: 'D3', max: 'A4' },
    { clef: 'alto', rangeMode: 'Alto', label: 'Alto', glyph: 'B', glyphClef: 'c', min: 'F3', max: 'C5' },
    { clef: 'mezzo-soprano', rangeMode: 'Mezzo-soprano', label: 'Mezzo', glyph: 'B', glyphClef: 'c', min: 'A3', max: 'G5' },
    { clef: 'soprano', rangeMode: 'Soprano', label: 'Soprano', glyph: 'B', glyphClef: 'c', min: 'C4', max: 'G6' },
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

// The LEFT-carousel family a staff currently shows: 'g' | 'f' | 'vocal' | 'off'.
// Unlike familyOfClef (which only sees the concrete clef glyph), this treats ALL vocal
// voices — including vocal Bass/Baritone, which reuse the 'bass'/'tenor' clef — as the
// vocal family, by checking whether the rangeMode is a vocal voice. Used to gate the
// clef-edit refly (CR-A2, Han 2026-06-08): only a FAMILY change animates; sub-clef
// variants (octave, transposition, vocal voice) must NOT re-trigger the transition.
export const clefFamilyKey = (settings) => {
    if ((settings?.preferredClef ?? 'treble') === CLEF_OFF) return 'off';
    if (VOCAL_VARIANTS.some(v => v.rangeMode === settings?.rangeMode)) return 'vocal';
    return familyOfClef(settings?.preferredClef ?? 'treble');
};

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
    // Switching INTO the vocal family resets transposition to concert C — vocal clefs
    // are never transposing (Han 2026-06-03).
    if (familyId === 'vocal') return { preferredClef: fam.clef, rangeMode: 'Alto', transpositionKey: 'C', transpositionOctave: 0 };
    return { preferredClef: fam.clef, rangeMode: 'STANDARD' };
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
// rangeMode so Bass vs Baritone (both F-clef) stay distinct. ALWAYS resets the
// transposition to concert C — vocal clefs are never transposing (Han 2026-06-03).
export const patchForVocal = (voice) => {
    if (typeof voice === 'string') {
        const v = VOCAL_VARIANTS.find(x => x.clef === voice) || { clef: voice, rangeMode: 'Alto' };
        return { preferredClef: v.clef, rangeMode: v.rangeMode, transpositionKey: 'C' };
    }
    return { preferredClef: voice.clef, rangeMode: voice.rangeMode, transpositionKey: 'C' };
};

// Settings patch for a transposition selection. `octave` carries the whole-octave part of a
// 2-octave transposition (Han 2026-06-09, Stage D); total written shift =
// getTranspositionSemitones(key) + 12*octave. Defaults to 0 so existing callers are unaffected.
export const patchForTransposition = (key, octave = 0) => ({
    transpositionKey: key || 'C',
    transpositionOctave: octave,
});
