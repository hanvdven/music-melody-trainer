import React from 'react';
import '../SheetMusic.css';
import { useInstrumentSettings } from '../../../contexts/InstrumentSettingsContext';
import { useDisplaySettings } from '../../../contexts/DisplaySettingsContext';
import { getProgressionLabel, getPlayStyleLabel } from '../../../utils/labelUtils';
import {
  MELODIC_NOTE_POOLS,
  PERC_POOL_PRESETS,
  NOTES_PER_MEASURE,
  CHORD_COMPLEXITY,
  CHORD_STRATEGIES,
  CHORD_COUNTS,
  FIELD_ITEM_ICONS,
  NUMERIC_ICONS,
  MELODIC_FAMILY_OF,
  PERC_FAMILY_OF,
  FAMILY_DISPLAY_NAMES,
} from '../../../constants/generationFields';
import { RULE_FAMILIES, PERC_FAMILIES } from '../../../constants/instrumentRules';
import { getIconUrlByBasename, ICON_ATTRIBUTION } from '../../../constants/instruments';
import { PERCUSSION_PRESETS } from '../../../audio/drumKits';
import { CarouselField } from '../CarouselFieldItem';
import {
  NotePoolGlyph, RhythmMeasureGlyph, ComplexityChordGlyph, ChordCountGlyph,
  PercPoolGlyph, VoicesGlyph,
} from './generationNoteGlyphs';
import { STAFF_CARD_ICON } from './carouselOptionGlyph';
import { MaestroMixedNumber } from './maestroGlyphs';
import { AlignmentGuides } from './debugGuides';

// ── GENERATION setter — CAROUSEL STYLE (Han 2026-06-22) ────────────────────────────────────────
// REBUILD: previously each field was a tiny SvgSetter stepper (the smallest-note Maestro glyphs were
// unreadable). Han's final interview answer: rebuild EVERY field as a full 5-wide NonLinearCarousel
// (visibleHalf=2 → 5 visible), each item shown as a LUCIDE ICON on top + TEXT LABEL below + a
// dashed category/field "blokhaken" bracket above (same look as the instrument carousel).
//
// For each VISIBLE "balk" (= row/staff: treble / bass / percussion, plus a CHORDS balk) we lay a
// row of field-carousels across the staff width — one per generation field:
//   col 1 "melody notes"      → treble/bass.notePool · percussion.enabledPads preset · chords.complexity
//   col 2 "melody type"       → treble/bass.randomizationRule · perc rule · chords.strategy
//   col 3 "notes per measure" → treble/bass/percussion.notesPerMeasure · chords.chordCount
//
// WIRING IS UNCHANGED from the previous stepper version (§ task): selecting an item writes the SAME
// field via the SAME setState path; only the PRESENTATION (carousel vs stepper) changed. Option
// arrays/labels still come from src/constants/generationFields.js / instrumentRules.js — ONE source
// of truth shared with the bottom view (§6d). The carousel ENGINE is reused (NonLinearCarousel via
// CarouselField) — no second carousel engine (§6d).
//
// PROVISIONAL: the CHORDS-balk mapping is Han's first-pass spec — flag for confirmation.

// ── SIZING / SPACING CONSTANTS (Han 2026-06-22) ────────────────────────────────────────────────
// Han accepts these carousels will be dense and will TUNE THEM LIVE, so EVERY sizing/spacing number
// lives here as a named const for easy tweaking (do NOT inline these into the JSX).
const CAROUSEL_BASE = 26;     // per-item slot stride (user units). 5 visible → ~5*BASE wide per field.
const ICON_SIZE = 16;         // lucide icon size (user units).
const ICON_DY = -22;          // icon top offset from the row centre.
const LABEL_DY = 2;           // text-label offset from the row centre (below the icon).
const LABEL_FONT_SIZE = 11;   // readable label (§ task: ~11-12).
const BRACKET_DY = -32;       // dashed category/field bracket offset above the row centre.
const HIT_TOP = -30;          // carousel hit/debug box top offset from the row centre.
const HIT_H = 56;             // carousel hit/debug box height.
// #295/#362 sizing for the inline-note content fields (Han: follow the colour carousel).
// #362: the pool carousel is now EXACTLY the colour setter's geometry (Han: "precies
// even breed en hoog als de colour setter") — same stride, same tall hit box.
// #432 rework (Han 2026-07-14: "maak de note pool selector iets breder voor alle note pool
// selectors" + same for notes/measure) — wider strides so the wider content (esp. the 13-note
// chromatic run) breathes.
const POOL_BASE = 160;        // note-pool item stride (widened from 115)
const POOL_HIT_TOP = -42;     // colour setter's hit-box top offset from the row centre
const POOL_HIT_H = 104;       // colour setter's hit-box height
const PATTERN_BASE = 135;     // rhythm-measure item stride (widened from 100)
// #431 (Han): melody-type icons match the instrument setter — icon on the staff body, label below.
// rowCenterY = staffStart + 20. The instrument setter (InstrumentStaffOverlay) anchors its icon top
// at staffStart + ICON_DY (ICON_DY = 1) and its label at staffStart + NAME_DY (NAME_DY = 58). So for
// pixel-identical 1-op-1 alignment (Han 2026-07-17 rework): icon top staffStart+1 → −19 relative to
// rowCenterY, label staffStart+58 → +38. (Earlier comment said staffStart+4/−16; that referenced the
// pre-#436 ICON_DY=−4 and was stale — corrected here.)
// #432 rework: the generation previews are a C-based ILLUSTRATION (root C, C-major scale), so they
// colour against a fixed C reference — a "scale" example must not read as non-scale just because the
// real key isn't C. For 'chords'-mode colouring the illustration chord is the C-major triad (the
// same C-E-G the 'chord' note-pool shows). The GLOBAL representativeChord fallback (with the tritone)
// serves the COLOUR setter, which previews the REAL current context.
const GEN_PREVIEW_CHORD = { root: 'C4', notes: ['C4', 'E4', 'G4'] };
const MELODY_TYPE_ICON_DY = -19;   // icon TOP relative to rowCenterY → staffStart+1 (instrument 1-op-1)
const MELODY_TYPE_BASE = 50;       // #434: stride > 38px icon so melody-type icons never clip/overlap
// #431 rework (Han 2026-07-17): ALL value labels share ONE offset (+28) so every column's label lines
// up at the same height — the generation overlay packs 4 rows into the staff spacing, so labels sit
// just below the staff (not at the instrument setter's roomier +38, which collided with the next row's
// header). The ICON stays 1-op-1 with the instrument setter (staffStart+1); only the label is tucked up.
// #431 rework 3 (Han 2026-07-17: "labels staan te hoog; gebruik instrument selector als referentie"):
// the STAFF-row value labels sit at the instrument setter's label height — staffStart+58 = rowCenterY+38
// (NAME_DY 58, rowCenterY = staffStart+20). The CHORDS row is 84px above the treble row (vs 100px
// staff-to-staff), too tight for +38 without its labels colliding with the treble header at −46, so its
// labels stay at +28 (and its tall complexity stack is anchored 8px higher, generationNoteGlyphs
// `virtualStaffStart`, so +28 clears it). Each row is internally consistent; the chords row has no
// instrument-setter analogue, so matching the staff rows there is neither required nor geometrically
// possible.
const CONTENT_LABEL_DY = 38;   // staff rows → staffStart+58 (instrument NAME_DY, 1-op-1)
const MELODY_TYPE_LABEL_DY = CONTENT_LABEL_DY;
const CHORDS_LABEL_DY = 28;    // chords row → clears the treble header (−46) 84px below
const STAFF_HEADER_DY = -46;  // field header baseline for the STAFF rows → rowCenterY-46 = staffStart-26
                              // (instrument setter FIELD_HEADER_DY), clear ABOVE the ledger notes.
const COUNT_FONT_SIZE = 24;   // Maestro numeral under each rhythm-measure item (#362)

// #362 (Han): randomization families take CATEGORY COLOURS — reuse the existing
// --cat-* palette (instrument categories) instead of inventing new colours (§6c).
// #434 fix (Han: "categorien zijn zwart"): the family colours must reference DEFINED --cat-* vars.
// `--cat-percussion` was never defined (only `--cat-percussion-tuned`), so the percussion 'stylized'
// family fell back to black. Each entry now also carries a --text-secondary fallback so an undefined
// var can never render as black again.
const FAMILY_COLORS = {
  random: 'var(--cat-synth, var(--text-secondary))',
  arp: 'var(--cat-strings, var(--text-secondary))',
  walk: 'var(--cat-wind, var(--text-secondary))',
  chords: 'var(--cat-guitars, var(--text-secondary))',
  fixed: 'var(--cat-keys, var(--text-secondary))',
  stylized: 'var(--cat-percussion-tuned, var(--text-secondary))',
};
const familyColor = (fam) => FAMILY_COLORS[fam] ?? 'var(--text-secondary)';
// Horizontal column centres as fractions of the staff width (3 fields spread across the balk).
// #435 (Han): 4 columns — note pool | melody type | VOICES | notes/measure. The voices column
// sits between melody type and notes/measure (Han's spec); the chords row puts complexity there.
// Layout-polish for the tighter spacing is a separate follow-up round (Han 2026-07-17 Q2).
const COL_FRACS = [0.14, 0.38, 0.62, 0.86];

// ── melody-type flat item rings (mirror the bottom view's reachable rules) ──────────────────────
// The bottom-view "melody type" is a family icon + within-family stepper. For the in-sheet carousel
// we flatten to the SAME ordered list of reachable rules per instrument type (every value reachable
// below is reachable here too, §6d). Each item is tagged with its FAMILY so the carousel can draw
// one "blokhaken" bracket per family run (random / arp / walk / fixed).
// #295 (Han): arp up / arp down / arp (bounce) are dropped from THIS carousel
// ("haal arp up, down en bounce uit de lijst") — the bottom view keeps them.
// #435: the chords family (pairedchord/fullchord, #460 "duo chord en chord mogen weg uit de
// picker") no longer exists — simultaneous notes are the separate `voices` field/column.
const MELODIC_RULE_RING = [
  ...RULE_FAMILIES.random,
  ...RULE_FAMILIES.arp,
  ...RULE_FAMILIES.walk,
  ...RULE_FAMILIES.fixed,
].filter(rule => !['arp_up', 'arp_down', 'arp'].includes(rule));
const PERC_RULE_RING = [
  ...PERC_FAMILIES.random,
  ...PERC_FAMILIES.stylized,
  ...PERC_FAMILIES.fixed,
];
// #436 (Han: icons8 pass — the melody-RANDOMIZATION rules get icons8 art). Rule → icons8 basename
// (resolved to a bundled URL via getIconUrlByBasename). Only the rules Han mapped are set; the rest
// keep their lucide glyph (item.iconUrl absent → renderer falls back to item.Icon).
// #460 (Han) — the full rule → icons8 mapping. dice-d20 stands in for the "dice" (random); a
// dedicated plain-dice / d20 split is a follow-up card. Percussion rules share this map.
const RULE_ICON8 = {
  uniform: 'dice',              // #466 (Han): plain six-sided die = the generic random rule
  emphasize_roots: 'anchor',    // "roots on one"
  weighted: 'feather',
  walking_bass: 'guitar',
  arp_var: 'squiggly-arrow',
  arp_group: 'stairs',
  fixed: 'sheet-music',         // keeps the previous / song melody
  // percussion rules
  backbeat: 'snare-drum', backbeat_2: 'snare-drum',
  swing: 'jazz',                // jazz swing
};

// Build the carousel item list for a rule ring: { value, label, Icon, iconUrl, family }.
const ruleItems = (ring, familyOf) => ring.map(rule => ({
  value: rule,
  label: getPlayStyleLabel(rule),
  Icon: FIELD_ITEM_ICONS.rule[rule],
  iconUrl: RULE_ICON8[rule] ? getIconUrlByBasename(RULE_ICON8[rule]) : undefined,
  family: familyOf[rule],
}));
const MELODIC_RULE_ITEMS = ruleItems(MELODIC_RULE_RING, MELODIC_FAMILY_OF);
const PERC_RULE_ITEMS = ruleItems(PERC_RULE_RING, PERC_FAMILY_OF);
const familyName = (fam) => FAMILY_DISPLAY_NAMES[fam] ?? fam;

// ── static item lists (icon attached from FIELD_ITEM_ICONS / NUMERIC_ICONS) ─────────────────────
const NOTE_POOL_ITEMS = MELODIC_NOTE_POOLS.map(o => ({ ...o, Icon: FIELD_ITEM_ICONS.notePool[o.value] }));
// #460 (Han): the percussion POOL presets — BASIC keeps the 3 example drum notes; STANDARD/FULL show
// an icons8 kit icon. ('custom' is a new preset, active only when a custom range is set — follow-up.)
const PERC_POOL_ICON8 = { STANDARD: 'drums', FULL: 'drum-set' };
const PERC_POOL_ITEMS = PERC_POOL_PRESETS.map(o => ({
  ...o,
  Icon: FIELD_ITEM_ICONS.percPreset[o.value],
  iconUrl: PERC_POOL_ICON8[o.value] ? getIconUrlByBasename(PERC_POOL_ICON8[o.value]) : undefined,
}));
const COMPLEXITY_ITEMS = CHORD_COMPLEXITY.map(o => ({ ...o, Icon: FIELD_ITEM_ICONS.complexity[o.value] }));
// #435 (Han 2026-07-19: "Akkoordtype mag naam hebben: unisono, duophony, triphony"): the voices
// options carry POLYPHONY NAMES (rendered ALL-CAPS by makeRenderItem, like every other value label).
// 'var' = the variable-density merge → "variable". Values map straight onto InstrumentSettings.voices.
const VOICES_MELODIC_ITEMS = [
  { value: 1, label: 'unisono' },
  { value: 'var', label: 'variable' },
  { value: 2, label: 'duophony' },
  { value: 3, label: 'triphony' },
];
const VOICES_PERC_ITEMS = [
  { value: 1, label: 'unisono' },
  { value: 'var', label: 'variable' },
];
const VOICES_BASE = 64;       // voices item stride — the widest item ('var': note + chord) is ~44
// #460 (Han) — chord-progression strategy → icons8. #466 (Han 2026-07-17): the 'concert' (pop) and
// plain 'dice' assets were added, so pop-1-5-6-4 now uses concert and the generic 'modal-random'
// takes the plain six-sided die; the 20-sided 'dice-d20' stays for the more exotic inter-modal random.
const STRATEGY_ICON8 = {
  'modal-random': 'dice',              // #466: plain six-sided die = the generic random
  'inter-modal-random': 'dice-d20',   // #462: "d20" — the exotic/chromatic random keeps the 20-sided die
  'tonic-tonic-tonic': 'ground-symbol',
  'ii-v-i': 'jazz',                    // jazz circle-of-fifths maps onto the as-is jazz (Han)
  'pop-1-5-6-4': 'concert',           // #466: asset added
  'pop-6-4-1-5': 'heart',             // "sensitive"
  'doo-wop': 'microphone',            // vintage mic
  'classical-1-4-5-5': 'violinist',
  'pachelbel': 'art-track',           // musical score
  'andalusian': 'flamenco',
  '12-bar-blues': 'blues',            // #461
};
const STRATEGY_ITEMS = CHORD_STRATEGIES.map(value => ({
  value,
  // getProgressionLabel may embed a '^' superscript marker; strip it for the flat carousel label.
  label: (getProgressionLabel(value) || value).replace('^', ''),
  Icon: FIELD_ITEM_ICONS.strategy[value],
  iconUrl: STRATEGY_ICON8[value] ? getIconUrlByBasename(STRATEGY_ICON8[value]) : undefined,
}));
// Numeric carousels: number IS the label, plus a small generic icon (§ task).
// #362: n>0 items drop the sans label — the count is a Maestro numeral under the
// pattern (drawn in renderContent); n=0 keeps its icon + AUTO label fallback.
const NOTES_PER_MEASURE_ITEMS = NOTES_PER_MEASURE.map(v => ({
  value: v, label: v === 0 ? 'auto' : '', Icon: NUMERIC_ICONS.count,
}));
const CHORD_COUNT_ITEMS = CHORD_COUNTS.map(o => ({ ...o, Icon: NUMERIC_ICONS.count }));

// Match the current enabledPads array to a preset NAME (mirrors RuleSelector.sameSet fallback).
const sameSet = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const s = new Set(a);
  return b.every(x => s.has(x));
};
const percPresetName = (enabledPads) =>
  PERC_POOL_PRESETS.map(p => p.value).find(n => sameSet(enabledPads, PERCUSSION_PRESETS[n])) || 'STANDARD';

// Index of `value` in an item list (by `.value`), defaulting to 0 when absent.
const idxOf = (items, value) => {
  const i = items.findIndex(it => it.value === value);
  return i === -1 ? 0 : i;
};

const GenerationSetterOverlay = ({
  startX,
  endX,
  trebleStart,
  bassStart,
  percussionStart,
  isTrebleVisible,
  isBassVisible,
  isPercussionVisible,
  showChordsRow = true,
  onSettingsInteraction,
  // #394a / #398: every field is a hidden (reveal-on-interaction) carousel by default; tests pass
  // false to assert the fully-expanded carousel content.
  hiddenFields = true,
  debugMode = false,
}) => {
  const {
    trebleSettings, setTrebleSettings,
    bassSettings, setBassSettings,
    percussionSettings, setPercussionSettings,
    chordSettings, setChordSettings,
  } = useInstrumentSettings();
  // #431 rework (Han): example notes render through the REAL renderMelodyNotes pipeline, coloured by
  // the ACTIVE note-coloring rule (+ theme for the subtle-chroma mix) — not a hardcoded palette.
  const { noteColoringMode, theme } = useDisplaySettings();
  if (startX == null || endX == null) return null;

  // Wrap every field's onSelect so a selection also pings onSettingsInteraction (resets the
  // overlay's idle/auto-close timer, same as the previous stepper version did via SvgSetter).
  const withInteraction = (fn) => (item, index) => { onSettingsInteraction?.(); fn(item, index); };

  // Three columns spread across the staff width.
  const span = endX - startX;
  const cols = COL_FRACS.map(f => startX + f * span);

  // Header band + per-balk Y anchors (borrowed from the previous overlay so it aligns with siblings).
  const HEADER_Y = trebleStart - 89;
  const CHORD_ROW_Y = trebleStart - 64;

  const rows = [
    // #361 (Han: "ik mis de setters voor akkoorden"): the chords row was gated on
    // showChordsRow (hidden chord labels hid the SETTERS too). Decoupled — always
    // visible, same correction the instrument setter got in #163 Q3.
    { key: 'chords', centerY: CHORD_ROW_Y, show: true, isChords: true },
    { key: 'treble', centerY: trebleStart + 20, show: isTrebleVisible },
    { key: 'bass', centerY: bassStart + 20, show: isBassVisible },
    { key: 'percussion', centerY: percussionStart + 20, show: isPercussionVisible },
  ].filter(r => r.show);

  // #431 rework (Han 2026-07-17): the persistent "melody type" COLUMN header was removed — it stayed
  // visible after the carousel collapsed. It now lives as a per-row `labelAbove` inside each melody-
  // type field's fading chrome (see fieldFor colIdx 1), so it hides with the carousel like every
  // other column header.

  // Build the carousel descriptor for one (row, columnIndex) cell. Returns the props CarouselField
  // needs: items, activeIndex, onSelect, and bracket mode. WIRING UNCHANGED — onSelect writes the
  // exact same field via the exact same setState path as the previous stepper version.
  const fieldFor = (row, colIdx) => {
    if (row.isChords) {
      // #435 (Han: "Plaats chord complexity ook in deze kolom"): complexity moved from column 0
      // to the VOICES column (2); column 0 is empty on the chords row.
      if (colIdx === 0) return null;
      if (colIdx === 2) {
        // chord complexity. #362 (Han): "geen plaatjes" — each option is the REAL stacked chord
        // it stands for (canonical noteheads), the stack IS the item; the sans label below
        // identifies it.
        const items = COMPLEXITY_ITEMS;
        const cur = chordSettings?.complexity || 'triad';
        return {
          items, activeIndex: idxOf(items, cur), labelAbove: 'complexity',
          renderContent: (item) => (
            <ComplexityChordGlyph complexity={item.value} centerY={row.centerY}
              noteColoringMode={noteColoringMode} activeChord={GEN_PREVIEW_CHORD} theme={theme} />
          ),
          // Stack reaches ~centerY+34 (C4 head) → label clears it; hit box grows to match.
          labelDy: CHORDS_LABEL_DY, hitTop: -32, hitHeight: 84,
          onSelect: (item) => setChordSettings(p => ({ ...p, complexity: item.value })),
        };
      }
      if (colIdx === 1) {
        // progression (chord randomization type) — #436 (Han: "de carousel van chords heeft nog geen
        // iconen … melody type / progression"): mirrors the melody-type carousel — the strategy's
        // icons8 icon on the staff body + its name below. #435 rework (Han 2026-07-19: "progression
        // type heeft een serif font en niet all caps — dit soort inconsistenties zou niet moeten"):
        // the label is now the SAME sans-serif ALL-CAPS as every other value label (via
        // makeRenderItem), NOT a serif Roman numeral. Same iconDy/labelDy as melody-type.
        const items = STRATEGY_ITEMS;
        const cur = chordSettings?.strategy || 'tonic-tonic-tonic';
        return {
          items, activeIndex: idxOf(items, cur), labelAbove: 'progression',
          baseWidth: MELODY_TYPE_BASE, visibleHalf: 1,
          iconSize: STAFF_CARD_ICON, iconDy: MELODY_TYPE_ICON_DY, labelDy: CHORDS_LABEL_DY,
          // Strategy names are long ("12-BAR BLUES") — show only the centred label, like melody-type.
          activeLabelOnly: true,
          onSelect: (item) => setChordSettings(p => ({ ...p, strategy: item.value })),
        };
      }
      // chords / measure → chordCount. #431 (Han): render literal chord LABELS (C / C G / C F G /
      // C F G C by count, trailing partial chord lowlit) instead of the numeric icon, with the
      // count as a Maestro numeral BELOW (like notes/measure), and a '#/measure' header.
      // #431/#432: blank the item.label so makeRenderItem does NOT draw the caps count — Han: "eerst
      // in caps, dan in maestro. Enkel maestro is genoeg." The count shows ONLY as the Maestro
      // numeral below (countLabel). The chord letters are coloured by the active rule.
      const items = CHORD_COUNT_ITEMS.map(it => ({ ...it, countLabel: it.label, label: '' }));
      const cur = chordSettings?.chordCount ?? 1;
      return {
        items, activeIndex: idxOf(items, cur), labelAbove: 'chords / measure',
        renderContent: (item, active, color) => (
          <g>
            <ChordCountGlyph count={item.value} centerY={row.centerY - 2}
              noteColoringMode={noteColoringMode} activeChord={GEN_PREVIEW_CHORD}
              theme={theme} color={color} />
            {/* #434 (Han: "maak een custom 1/2 etc.") — the count as a real Maestro mixed number
                (big whole + small ½/¼ fraction) instead of the ASCII '2½' Maestro can't draw. */}
            <MaestroMixedNumber value={item.value} cx={0} cy={row.centerY + CHORDS_LABEL_DY}
              size={COUNT_FONT_SIZE} color={color} />
          </g>
        ),
        labelDy: CHORDS_LABEL_DY, hitTop: -32, hitHeight: 84,
        onSelect: (item) => setChordSettings(p => ({ ...p, chordCount: item.value })),
      };
    }

    // ── Melodic / percussion balk ──
    const set = row.key === 'treble' ? setTrebleSettings
      : row.key === 'bass' ? setBassSettings : setPercussionSettings;
    const cfg = row.key === 'treble' ? trebleSettings
      : row.key === 'bass' ? bassSettings : percussionSettings;
    const isPerc = row.key === 'percussion';

    if (colIdx === 0) {
      // melody notes → notePool (melodic) OR enabledPads preset (percussion)
      if (isPerc) {
        const items = PERC_POOL_ITEMS;
        const cur = percPresetName(cfg?.enabledPads);
        const percStaffStart = row.centerY - 20;
        return {
          items, activeIndex: idxOf(items, cur), labelAbove: 'percussion',
          // #434/#460 (Han): BASIC renders the preset's real drum notes (like the melodic note pool);
          // STANDARD/FULL show their icons8 kit icon.
          renderContent: (item) => (
            item.iconUrl
              ? (
                <image href={item.iconUrl} x={-STAFF_CARD_ICON / 2} y={row.centerY + MELODY_TYPE_ICON_DY}
                  width={STAFF_CARD_ICON} height={STAFF_CARD_ICON}
                  style={{ pointerEvents: 'none', filter: 'var(--instrument-icon-filter, none)' }} />
              )
              : (
                <PercPoolGlyph pads={PERCUSSION_PRESETS[item.value]} staffStart={percStaffStart}
                  noteColoringMode={noteColoringMode} theme={theme} />
              )
          ),
          baseWidth: POOL_BASE, visibleHalf: 1,
          hitTop: POOL_HIT_TOP, hitHeight: POOL_HIT_H, labelDy: CONTENT_LABEL_DY,
          onSelect: (item) => set(p => ({ ...p, enabledPads: [...PERCUSSION_PRESETS[item.value]] })),
        };
      }
      // #295 (Han): pool items are INLINE NOTE RUNS at real staff positions
      // (root C4+C5 · chord C4 E4 G4 C5 · scale C4..C5 · chromatic + ♭♯♮),
      // colour-carousel design. 3-visible window so the wide runs don't collide
      // with the neighbouring columns.
      const items = NOTE_POOL_ITEMS;
      const cur = cfg?.notePool || 'scale';
      const staffStart = row.centerY - 20;
      const clef = cfg?.clef || (row.key === 'bass' ? 'bass' : 'treble');
      return {
        items, activeIndex: idxOf(items, cur), labelAbove: 'note pool',
        renderContent: (item) => (
          <NotePoolGlyph pool={item.value} staffStart={staffStart} clef={clef}
            staffType={row.key} noteColoringMode={noteColoringMode}
            activeChord={GEN_PREVIEW_CHORD} theme={theme} />
        ),
        // #362: colour-setter geometry — same stride AND same tall hit box, so
        // off-staff heads (C4 ledger notes) are never clipped out of the tap zone.
        baseWidth: POOL_BASE, visibleHalf: 1,
        hitTop: POOL_HIT_TOP, hitHeight: POOL_HIT_H,
        labelDy: CONTENT_LABEL_DY,
        onSelect: (item) => set(p => ({ ...p, notePool: item.value })),
      };
    }
    if (colIdx === 1) {
      // melody type → randomizationRule (play-style), grouped by FAMILY (blokhaken brackets).
      // #295 (Han): "mooie ruime carousel" — bigger icons, label just below the staff.
      const items = isPerc ? PERC_RULE_ITEMS : MELODIC_RULE_ITEMS;
      const cur = cfg?.randomizationRule || (isPerc ? 'uniform' : 'uniform');
      return {
        items, activeIndex: idxOf(items, cur),
        // #431 rework (Han 2026-07-17): the "melody type" header is now a PER-ROW label inside the
        // fading chrome (like the instrument setter's "instrument" header), NOT a persistent column
        // header — so it hides together with the carousel when collapsed.
        labelAbove: 'melody type',
        // #362 (Han): family brackets AND the active item take the family's
        // category colour (--cat-* palette).
        familyMode: true, familyName, familyColor,
        colorOf: (item) => familyColor(item.family),
        // #431 (Han): icons as TALL as the instrument-setter icons (STAFF_CARD_ICON = 38, the
        // shared staff-card height, §6d), label aligned the SAME way as the instrument setter.
        iconSize: STAFF_CARD_ICON, iconDy: MELODY_TYPE_ICON_DY, labelDy: MELODY_TYPE_LABEL_DY,
        // #434 (Han: "er is nu nog clipping … breng in lijn met instrument selector"): the 38px
        // icons overlapped at the narrow default 26px stride. Widen the stride (> icon) and show a
        // 3-wide window (visibleHalf 1) so it reads like the instrument carousel without clipping or
        // colliding with the neighbouring columns.
        baseWidth: MELODY_TYPE_BASE, visibleHalf: 1,
        // Keep `type` set alongside the rule (mirrors the previous stepper wiring).
        onSelect: (item) => set(p => ({ ...p, randomizationRule: item.value, type: p.type ?? row.key })),
      };
    }
    if (colIdx === 2) {
      // #435 (Han): VOICES — simultaneous notes per slot. Melodic: 1 · var · 2 · 3;
      // percussion: 'simultaneous' 1 · var. Items render as the notation they produce
      // (VoicesGlyph → the shared MiniMelody pipeline, §6d). Replaces the old
      // pairedchord/fullchord chord-randomization types.
      const items = (isPerc ? VOICES_PERC_ITEMS : VOICES_MELODIC_ITEMS);
      const cur = cfg?.voices ?? 1;
      const vStaffStart = row.centerY - 20;
      const clef = cfg?.clef || (row.key === 'bass' ? 'bass' : 'treble');
      return {
        items, activeIndex: idxOf(items, cur),
        labelAbove: isPerc ? 'simultaneous' : 'voices',
        renderContent: (item) => (
          <VoicesGlyph voices={item.value} staffStart={vStaffStart} clef={clef}
            staffType={row.key} noteColoringMode={noteColoringMode}
            activeChord={GEN_PREVIEW_CHORD} theme={theme} />
        ),
        baseWidth: VOICES_BASE, visibleHalf: 1,
        // Long polyphony names (DUOPHONY…) would collide across the narrow column when expanded;
        // show only the centred item's label (§435, like the melody-type carousel).
        activeLabelOnly: true,
        hitTop: POOL_HIT_TOP, hitHeight: POOL_HIT_H, labelDy: CONTENT_LABEL_DY,
        onSelect: (item) => set(p => ({ ...p, voices: item.value })),
      };
    }
    // notes per measure → notesPerMeasure. #295/#362 (Han): every option 1..16
    // renders as its REAL rhythm pattern — now through MelodyNotesLayer, so 8ths/
    // 16ths BEAM per beat exactly like the sheet ("volgens bestaande protocol
    // renderMelodyNotes"). The count sits below as a Maestro numeral (same font
    // as the BPM/repeats displays); n=0 (auto) keeps its icon + AUTO label.
    const items = NOTES_PER_MEASURE_ITEMS;
    const cur = cfg?.notesPerMeasure || 0;
    // #434 (Han: raised 20, then lowered 10 → net 10 above the row centre).
    const rowStaffStart = row.centerY - 30;
    return {
      items, activeIndex: idxOf(items, cur), labelAbove: 'notes / measure',
      renderContent: (item, active, color) => (
        item.value > 0
          ? (
            <g>
              <RhythmMeasureGlyph n={item.value} staffStart={rowStaffStart} color={color} />
              {/* #431 rework 4 (Han 2026-07-19: "de maestro labels staan niet op dezelfde hoogte als
                  de tekstlabels"): the count baseline == the value-label baseline (CONTENT_LABEL_DY),
                  so the Maestro numeral lines up with the sans labels (WEIGHTED, SCALE, …) in the
                  neighbouring columns. */}
              <text x={0} y={row.centerY + CONTENT_LABEL_DY} textAnchor="middle"
                fontSize={COUNT_FONT_SIZE} fontFamily="Maestro" fill={color}
                style={{ pointerEvents: 'none' }}>{item.value}</text>
            </g>
          )
          : null
      ),
      baseWidth: PATTERN_BASE, visibleHalf: 1,
      hitTop: HIT_TOP, hitHeight: HIT_H + 24,
      labelDy: CONTENT_LABEL_DY,
      onSelect: (item) => set(p => ({ ...p, notesPerMeasure: item.value })),
    };
  };

  return (
    // stopPropagation: clicks inside the overlay must NOT bubble to the sheet-music close handler.
    <g className="generation-overlay" onClick={(e) => e.stopPropagation()}>
      {/* Full-overlay transparent hit-zone (mirrors SettingsOverlay) so clicks on empty space inside
          the overlay also stop propagation. */}
      <rect
        x={startX - 8} y={trebleStart - 95}
        width={(endX - startX) + 16}
        height={(percussionStart + 40) - (trebleStart - 95)}
        fill="transparent"
        style={{ cursor: 'default' }}
      />

      {/* #431 rework: no persistent column headers — each field's header now lives in its own fading
          chrome (labelAbove), so it hides with the carousel. */}

      {/* #436 (Han): debug ALIGNMENT GUIDES — full-width lines at the header, per-row icon-top,
          icon-baseline (staff top+STAFF_CARD_ICON) and label baseline, so their heights can be lined
          up against the colour/instrument setters while iterating. */}
      {debugMode && rows.map(row => {
        const iconTop = row.centerY + MELODY_TYPE_ICON_DY;
        return (
          <AlignmentGuides key={`guides-${row.key}`} startX={startX} endX={endX} guides={[
            row.key === 'treble' ? { y: HEADER_Y, label: 'header', color: '#3b82f6' } : null,
            { y: iconTop, label: 'icon-top' },
            { y: iconTop + STAFF_CARD_ICON, label: 'icon-baseline' },
            { y: row.centerY + MELODY_TYPE_LABEL_DY, label: 'label', color: '#ef4444' },
          ]} />
        );
      })}

      {/* Per-balk rows of field-carousels. CarouselField reuses NonLinearCarousel (§6d) and shows
          its own debug hit box (§3a). */}
      {rows.map(row => (
        <g key={row.key}>
          {cols.map((cx, colIdx) => {
            const f = fieldFor(row, colIdx);
            if (!f) return null;
            return (
              <CarouselField
                key={`${row.key}-${colIdx}`}
                items={f.items}
                activeIndex={f.activeIndex}
                onSelect={withInteraction(f.onSelect)}
                centerX={cx}
                rowCenterY={row.centerY}
                // #295: content fields (inline notes / rhythm patterns) override
                // stride, window, icon size and label position per field.
                baseWidth={f.baseWidth ?? CAROUSEL_BASE}
                hitTop={f.hitTop ?? HIT_TOP}
                hitHeight={f.hitHeight ?? HIT_H}
                iconSize={f.iconSize ?? ICON_SIZE}
                iconDy={f.iconDy ?? ICON_DY}
                labelDy={f.labelDy ?? LABEL_DY}
                labelFontSize={LABEL_FONT_SIZE}
                bracketDy={BRACKET_DY}
                // #431 rework: staff-row headers line up at −46 (clear above the ledger notes); the
                // chords row keeps the tighter −32 (BRACKET_DY default) so it doesn't clip the overlay
                // top. Family brackets stay at BRACKET_DY, sitting BETWEEN header and icons.
                headerDy={row.isChords ? BRACKET_DY : STAFF_HEADER_DY}
                fieldLabel={f.fieldLabel}
                labelAbove={f.labelAbove}
                familyMode={f.familyMode}
                activeLabelOnly={f.activeLabelOnly ?? f.familyMode}
                familyName={f.familyName}
                familyColor={f.familyColor}
                colorOf={f.colorOf}
                renderContent={f.renderContent}
                visibleHalf={f.visibleHalf ?? 2}
                // #394a / #398 (Han): every generation-settings field is a hidden carousel —
                // at rest it shows only the active value; tap to open, tap-away/select to close.
                hidden={hiddenFields}
                debugMode={debugMode}
              />
            );
          })}
        </g>
      ))}

      {/* #465 (Han 2026-07-17: "in de generation settings tab de attributie icons by icons8 mis"):
          icons8 attribution/licence — MANDATORY wherever icons8 art shows. Same convention as the
          instrument setter (§6d): centred, small, dim, below the bottom row. */}
      <text x={(startX + endX) / 2}
        y={rows[rows.length - 1].centerY + MELODY_TYPE_LABEL_DY + 16}
        textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="var(--text-dim, #888)"
        style={{ pointerEvents: 'none' }}>
        {ICON_ATTRIBUTION}
      </text>
    </g>
  );
};

export default GenerationSetterOverlay;
