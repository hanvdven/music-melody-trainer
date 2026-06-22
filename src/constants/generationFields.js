// Shared generation-field option arrays (Han 2026-06-22).
//
// WHY this module exists (§6c / §6d): the bottom-view InstrumentRow.jsx defines the
// allowedValues/options/labels for every generator stepper INLINE. The three new in-sheet-music
// generator setters (GenerationSetterOverlay / GenerationAdvancedSetterOverlay) must produce the
// EXACT same behaviour (same allowed values, same labels, same cycling). Rather than duplicate the
// magic arrays into the overlays (which would silently drift the moment one site changes), the
// option arrays that were inline in InstrumentRow are extracted here so BOTH the bottom view and
// the overlays consume ONE source of truth.
//
// Each entry is `{ value, label }`. The overlays cycle a setter by walking the `value` list; the
// `label` is what the SvgSetter shows. Accidentals use Unicode (§5b).

// ── Treble / Bass "melody notes" → notePool (mirrors RuleSelector.RULES_BY_INSTRUMENT) ──
export const MELODIC_NOTE_POOLS = [
  { value: 'root', label: 'Root' },
  { value: 'chord', label: 'Chord' },
  { value: 'scale', label: 'Scale' },
  { value: 'chromatic', label: 'Chromatic' },
];

// ── Percussion "melody notes" → enabledPads preset (mirrors RuleSelector percussion branch) ──
// value is the preset NAME; the overlay writes enabledPads = PERCUSSION_PRESETS[value].
export const PERC_POOL_PRESETS = [
  { value: 'BASIC', label: 'Basic' },
  { value: 'STANDARD', label: 'Standard' },
  { value: 'FULL', label: 'Full' },
];

// ── "notes per measure" → notesPerMeasure (InstrumentRow col 5, melodic branch) ──
export const NOTES_PER_MEASURE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16];

// ── "variability" → rhythmVariability (InstrumentRow col 7), shown with '%' suffix ──
export const RHYTHM_VARIABILITY = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

// ── "span" → maxLeap (InstrumentRow col 8). null = ∞ (no limit). ──
export const LEAP_OPTIONS = [
  { value: 4, label: '3rd' },
  { value: 5, label: '4th' },
  { value: 9, label: '6th' },
  { value: 11, label: '7th' },
  { value: 12, label: '8ve' },
  { value: 14, label: '9th' },
  { value: 16, label: '10th' },
  { value: 17, label: '11th' },
  { value: 19, label: '12th' },
  { value: 24, label: '15th' },
  { value: null, label: '∞' }, // ∞
];

// ── "tuplets" → polyMultiplier (InstrumentRow col 9). ──
export const POLY_LEVELS = [
  { value: 1, label: 'none' },
  { value: 5, label: 'low' },
  { value: 15, label: 'med' },
  { value: 50, label: 'high' },
  { value: 200, label: 'xtreme' },
];

// ── "smallest note" → smallestNoteDenom (InstrumentRow col 6). Labels are Maestro glyphs. ──
// REUSE the glyph approach from InstrumentRow col 6 / SettingsOverlay (§6d). The label here is the
// raw Maestro glyph CHARACTER; the overlay renders it with fontFamily="Maestro" via SvgSetter's
// valueFontFamily — never invent a new offset/font-size.
export const SMALLEST_NOTE_DENOMS = [16, 8, 4, 2, 1];
export const SMALLEST_NOTE_GLYPHS = { 1: 'w', 2: 'h', 4: 'q', 8: 'e', 16: 'x' };

// ── CHORDS row, GENERATION ──────────────────────────────────────────────────────────────
// "melody notes" → complexity (InstrumentRow chords branch col 2).
export const CHORD_COMPLEXITY = [
  { value: 'root', label: 'Root' },
  { value: 'power', label: 'Power' },
  { value: 'triad', label: 'Triad' },
  { value: 'seventh', label: 'Seventh' },
  { value: 'sus', label: 'Sus' },
  { value: 'exotic', label: 'Exotic' },
];

// "melody type" → strategy (InstrumentRow.jsx PROGRESSION_OPTIONS, value list only — the
// human-readable label comes from getProgressionLabel, the bottom-view's source of truth).
export const CHORD_STRATEGIES = [
  'modal-random',
  'tonic-tonic-tonic',
  'ii-v-i',
  'pop-1-5-6-4',
  'pop-6-4-1-5',
  'doo-wop',
  'classical-1-4-5-5',
  'pachelbel',
  'andalusian',
];

// "notes per measure" → chordCount (InstrumentRow chords branch col 5).
export const CHORD_COUNTS = [
  { value: 0.25, label: '¼' },  // ¼
  { value: 0.5, label: '½' },   // ½
  { value: 1, label: '1' },
  { value: 1.5, label: '1½' },  // 1½
  { value: 2, label: '2' },
  { value: 2.5, label: '2½' },  // 2½
  { value: 3, label: '3' },
  { value: 4, label: '4' },
];

// ── CHORDS row, GENERATION ADVANCED — passing chord types (InstrumentRow col 6 chords branch) ──
// The 7-type toggle set. In the advanced setter these are presented as a single SvgSetter that
// CYCLES which type is highlighted, with a discreet column header; tapping the value toggles the
// currently-shown type in the passingChordTypes array (provisional mapping — flag for Han).
export const PASSING_CHORD_TYPES = [
  { key: 'secondary-dominant', label: 'V⁷' },   // V⁷
  { key: 'secondary-dim', label: 'vii°' },       // vii°
  { key: 'tritone-sub', label: '♭II⁷' },    // ♭II⁷
  { key: 'diatonic', label: 'dia' },
  { key: 'sus4', label: 'sus' },
  { key: 'subdominant-approach', label: 'IV' },
  { key: 'borrowed-parallel', label: '♭bor' },   // ♭bor
];

// Hover titles for the bottom-view passing-chord chips only (the in-sheet setter has no titles).
export const PASSING_CHIP_TITLES = {
  'secondary-dominant': 'Secondary dominant (V7/x)',
  'secondary-dim': 'Secondary diminished (vii°7/x)',
  'tritone-sub': 'Tritone substitution (♭II7/x)',
  'diatonic': 'Diatonic step approach',
  'sus4': 'Suspended 4th (sus4)',
  'subdominant-approach': 'Subdominant approach (IV/x)',
  'borrowed-parallel': 'Borrowed parallel chord',
};
