// Pure clef-resolution helpers, extracted verbatim from SheetMusic.jsx (Han 2026-06-19,
// ARCHITECTURE_AUDIT §4 "clefResolution.js — pure fns defined inside SheetMusic.jsx:565-1029;
// move out → testable, no behaviour change"). These functions decide which clef glyph a staff
// shows: its base family, any 8va/8vb/15va/15vb ottava, and the vertical SVG shift the chosen
// clef implies. They were already pure (no closure over component state) EXCEPT clefForScreen,
// which read the `rangeEditMode`/`clefEditMode` component props; those are now passed in as
// explicit arguments so the whole module is pure and unit-testable. Behaviour is identical.

import { getNoteIndex, transposeMelodyBySemitones } from '../../theory/musicUtils';

// Clef types that are inherently vocal — these never receive 8va/8vb markings.
// The vocal Bass voice uses the 'bass' clef; Baritone uses its own 'baritone-f'
// clef (F on the middle line); both are identified by rangeMode.
export const VOCAL_CLEF_TYPES = new Set(['soprano', 'mezzo-soprano', 'alto', 'tenor']);
export const VOCAL_RANGE_MODES = new Set(['Bass', 'Baritone', 'Tenor', 'Alto', 'Mezzo-soprano', 'Soprano']);

export const getClefShiftValue = (c) => {
  const shifts = {
    treble: 0, alto: -30, tenor: -40, soprano: -10, 'mezzo-soprano': -20, bass: 0,
    treble8va: 35, treble8vb: -35, treble15va: 70, treble15vb: -70,
    bass8va: 35, bass8vb: -35, bass15va: 70, bass15vb: -70,
    alto8va: 35, alto8vb: -35
  };
  return shifts[c] || 0;
};

export const calculateOptimalClef = (activeClef, melodyNotes, staff = 'treble', rangeMode = null) => {
  // 'off' = disabled staff (Han 2026-06-01): never compute an ottava/optimal clef
  // for it; the sentinel flows through so the render can grey it out / show a cross.
  if (activeClef === 'off') return 'off';
  // Vocal clefs never use ottava markings — range selection already constrains their register.
  if (VOCAL_CLEF_TYPES.has(activeClef) || VOCAL_RANGE_MODES.has(rangeMode)) return activeClef;

  if (!melodyNotes || melodyNotes.length === 0) return activeClef;

  const notes = melodyNotes
    .map(n => {
      if (!n) return null;
      if (typeof n === 'string') return getNoteIndex(n);
      if (typeof n.midi === 'number') return n.midi;
      if (typeof n.note === 'string') return getNoteIndex(n.note);
      return null;
    })
    .filter(m => typeof m === 'number');

  if (notes.length === 0) return activeClef;
  const countInRange = (min, max) => notes.filter(m => m >= min && m <= max).length;

  // Ranges use getNoteIndex() indices: A0=0, each semitone = 1 step.
  // C4 = 39 (not 48 — the old comment was wrong and caused all ranges to be off by 9).
  const RANGES = staff === 'bass' ? {
    base: [15, 43],   // C2-E4
    '8vb': [0, 19],   // A0-E2
    '15vb': [0, 0],   // DISABLED
    '8va': [39, 55],  // C4-E5
    '15va': [51, 87]  // C5-C8
  } : {
    base: [36, 63],   // A3-C6
    '8vb': [24, 39],  // A2-C4
    '15vb': [12, 27], // A1-C3
    '8va': [60, 75],  // A5-C7
    '15va': [72, 87]  // A6-C8
  };

  // Rule 1: stay in base if all notes fit
  if (notes.every(m => m >= RANGES.base[0] && m <= RANGES.base[1])) return activeClef;

  const scores = [
    { id: activeClef + '15va', score: countInRange(...RANGES['15va']) },
    { id: activeClef + '15vb', score: countInRange(...RANGES['15vb']) },
    { id: activeClef + '8va', score: countInRange(...RANGES['8va']) },
    { id: activeClef + '8vb', score: countInRange(...RANGES['8vb']) },
    { id: activeClef, score: countInRange(...RANGES.base) }
  ];

  // Pick the one with the highest score, with precedence for later entries (Base > 8va > 15va) in case of a tie
  return scores.reduce((max, s) => s.score >= max.score ? s : max, scores[0]).id;
};

// Octave clef is now DETERMINISTIC from the TRANSPOSITION octave (Han 2026-06-09: "hoe kan het
// dat de bovenste en middelste balk anders reageren op de 8va?"). The old melody-range-based
// optimal clef made the two staves differ under transposition because their melodies differ;
// driving the octave from transpositionOctave instead makes both staves show the SAME clef for
// the same transposition. Base family keeps the user's selection; vocal/off pass through.
const OCTAVE_CLEF_SUFFIX = { '-2': '15vb', '-1': '8vb', '0': '', '1': '8va', '2': '15va' };
export const octaveAdjustedClef = (activeClef, octave, rangeMode) => {
  if (activeClef === 'off') return 'off';
  if (VOCAL_CLEF_TYPES.has(activeClef) || VOCAL_RANGE_MODES.has(rangeMode)) return activeClef;
  const o = Math.max(-2, Math.min(2, octave || 0));
  if (o === 0) return activeClef;
  const base = String(activeClef).replace(/(8|15|22)v[ab]$/, '');
  if (base !== 'treble' && base !== 'bass') return activeClef;
  return base + OCTAVE_CLEF_SUFFIX[String(o)];
};

// Clef octave matches the SCREEN being shown (Han 2026-06-09/10):
//   • RANGE setter → octave fits the (written) RANGE being shown (very low range → 8vb).
//   • CLEF setter AND normal notation → octave from the TRANSPOSITION only. The MELODY NEVER
//     drives an 8va/8vb (Han: "nooooi 8va of 8vb ook al is de melodie 8vb"); both staves also
//     show the SAME clef for the same transposition.
// rangeEditMode / clefEditMode were component props in SheetMusic.jsx; on extraction they are
// passed as explicit arguments so this module stays pure (Han 2026-06-19).
export const clefForScreen = (activeClef, settings, staffName, transSemis, rangeEditMode, clefEditMode) => {
  if (rangeEditMode) {
    const r = settings?.range;
    const rangeNotes = r ? [r.min, r.max] : [];
    return calculateOptimalClef(activeClef, transposeMelodyBySemitones(rangeNotes, transSemis), staffName, settings?.rangeMode);
  }
  if (clefEditMode) {
    // Clefs in the TRANSPOSITION setter are NEVER octave-transposed (Han 2026-06-10): the octave
    // is communicated by the (X inst) ↑/↓ arrows, not an 8va/8vb glyph. Use the BASE family clef.
    if (activeClef === 'off') return 'off';
    if (VOCAL_CLEF_TYPES.has(activeClef) || VOCAL_RANGE_MODES.has(settings?.rangeMode)) return activeClef;
    return String(activeClef).replace(/(8|15|22)v[ab]$/, '');
  }
  return octaveAdjustedClef(activeClef, settings?.transpositionOctave || 0, settings?.rangeMode);
};
