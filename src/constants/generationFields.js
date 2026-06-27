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

// ── LUCIDE ICON + LABEL MAPS for the carousel-style generation setters (Han 2026-06-22) ─────────
// WHY (§6c/§6d): Han rebuilt every generation/advanced field as a 5-wide NonLinearCarousel where
// each option shows a LUCIDE ICON on top + a TEXT LABEL below. The icon-per-option mapping lives
// HERE (single source) so the two overlays + bottom view never fork the choice of glyph. "voorlopig
// lucid icons" — these are placeholders Han may swap; keeping them in one place makes that trivial.
// We import the lucide React components and attach one to each option's value/key below.
import {
  Circle, Layers, Grid3x3, Sparkles,           // notePool: root / chord / scale / chromatic
  Dices, ArrowUp, Footprints, Combine, PenLine, // melody-type families: random/arp/walk/chords/fixed
  Hash, Percent, MoveHorizontal,                // numeric + span
  Music, Music2, Music3, Music4,                // smallest-note durations
  Triangle, Layers3, RotateCw,                  // chord complexity / tuplets / strategy
  Anchor, Waves, Flame, Star, Crown, Zap, GitBranch, Repeat, Network, // strategies / passing chords
  Drum, // perc presets
} from 'lucide-react';

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
  { value: 7, label: '5th' }, // added (#162) so the span setter can truly start at a 5th (was missing → list began at 6th)
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

// ── FIELD ITEM ICONS (Han 2026-06-22) — one lucide glyph per option value/key ──────────────────
// Single source of truth for the carousel item icons. Keyed by the option's `value` (or `key` for
// passing chords). Distinct, sensible glyphs per the build guidance:
//   notePool: root=Circle (single pitch), chord=Layers (stacked), scale=Grid3x3 (a run of steps),
//             chromatic=Sparkles (all 12).
//   chord complexity: root=Circle, power=Zap, triad=Triangle (3 notes), seventh=Layers3,
//             sus=MoveHorizontal (suspended), exotic=Star.
//   melody-type rules: grouped icons per family idea (Dices=random, ArrowUp=arpeggio motion,
//             Footprints=walking bass, Combine=chord-grab, PenLine=fixed/hand-written).
//   perc presets: Drum for all (sized differences not meaningful as glyphs) — label carries Basic/
//             Standard/Full.
//   strategies: one distinct glyph each (purely mnemonic placeholders).
//   passing chords: one glyph each.
// Numeric fields (notesPerMeasure, rhythmVariability) DON'T use this map — they render the NUMBER
// big as the label + a small generic icon (Hash / Percent), set in the overlay.
export const FIELD_ITEM_ICONS = {
  notePool: { root: Circle, chord: Layers, scale: Grid3x3, chromatic: Sparkles },
  complexity: { root: Circle, power: Zap, triad: Triangle, seventh: Layers3, sus: MoveHorizontal, exotic: Star },
  percPreset: { BASIC: Drum, STANDARD: Drum, FULL: Drum },
  // melody-type rule → icon (keyed by rule id). Family-level fallback handled by the overlay.
  rule: {
    // random family
    uniform: Dices, emphasize_roots: Dices, weighted: Dices,
    // arp family
    arp_up: ArrowUp, arp_down: ArrowUp, arp: ArrowUp, arp_var: ArrowUp, arp_group: ArrowUp,
    // walk family
    walking_bass: Footprints,
    // chords family
    pairedchord: Combine, fullchord: Combine,
    // fixed family
    fixed: PenLine,
    // perc stylized
    backbeat: Drum, backbeat_2: Drum, swing: Drum,
  },
  // chord strategies → one distinct mnemonic glyph each.
  strategy: {
    'modal-random': Dices,
    'tonic-tonic-tonic': Anchor,
    'ii-v-i': RotateCw,
    'pop-1-5-6-4': Star,
    'pop-6-4-1-5': Crown,
    'doo-wop': Waves,
    'classical-1-4-5-5': GitBranch,
    'pachelbel': Repeat,
    'andalusian': Flame,
  },
  // tuplets (polyMultiplier) — Layers3 for all; label carries none/low/med/high/xtreme.
  poly: { 1: Layers3, 5: Layers3, 15: Layers3, 50: Layers3, 200: Layers3 },
  // span (maxLeap) — MoveHorizontal for all; label carries 3rd/4th/…/∞.
  // (kept as a single glyph so the interval is read from the big label.)
  // smallest note — durative note glyphs (the whole point: Maestro was unreadable, §5b/§6d).
  // whole=Music (generic), half=Music2, quarter=Music3, eighth=Music4, sixteenth=Music4.
  smallestNote: { 1: Music, 2: Music2, 4: Music3, 8: Music4, 16: Music4 },
  // passing chords (keyed by `key`).
  passing: {
    'secondary-dominant': Zap,
    'secondary-dim': Star,
    'tritone-sub': RotateCw,
    'diatonic': GitBranch,
    'sus4': MoveHorizontal,
    'subdominant-approach': Anchor,
    'borrowed-parallel': Network,
  },
};
// Generic icons for the NUMERIC carousels (number-as-label).
export const NUMERIC_ICONS = { count: Hash, percent: Percent };
// Generic icon for the span (maxLeap) carousel (interval read from the big label).
export const SPAN_ICON = MoveHorizontal;

// ── smallest-note READABLE duration labels (Han 2026-06-22) ─────────────────────────────────────
// The whole point of the rebuild: Maestro glyphs were unreadable. Show a plain word. No accidentals
// here, so §5b is trivially satisfied.
export const SMALLEST_NOTE_LABELS = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth' };

// ── melody-type rule → FAMILY map + family display names (for the grouped "blokhaken" brackets) ──
// Mirrors InstrumentStaffOverlay's category brackets but grouping by rule FAMILY. The overlay builds
// a flat item list tagged with `family` so CarouselFieldItem.familyBrackets can draw one bracket per
// consecutive same-family run (random / arp / walk / chords / fixed).
export const MELODIC_FAMILY_OF = {
  uniform: 'random', emphasize_roots: 'random', weighted: 'random',
  arp_up: 'arp', arp_down: 'arp', arp: 'arp', arp_var: 'arp', arp_group: 'arp',
  walking_bass: 'walk',
  pairedchord: 'chords', fullchord: 'chords',
  fixed: 'fixed',
};
export const PERC_FAMILY_OF = {
  uniform: 'random',
  backbeat: 'stylized', backbeat_2: 'stylized', swing: 'stylized',
  fixed: 'fixed',
};
export const FAMILY_DISPLAY_NAMES = {
  random: 'Random', arp: 'Arpeggio', walk: 'Walking', chords: 'Chords', fixed: 'Fixed',
  stylized: 'Stylized',
};

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
