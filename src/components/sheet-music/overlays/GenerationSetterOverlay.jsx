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
import { PERCUSSION_PRESETS } from '../../../audio/drumKits';
import { CarouselField } from '../CarouselFieldItem';
import {
  NotePoolGlyph, RhythmMeasureGlyph, ComplexityChordGlyph, RomanProgressionGlyph, ChordCountGlyph,
} from './generationNoteGlyphs';
import { STAFF_CARD_ICON } from './carouselOptionGlyph';
import { MaestroMixedNumber } from './maestroGlyphs';

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
// rowCenterY = staffStart + 20, so instrument's icon top (staffStart+4) → −16 and its label
// (staffStart+58) → +38 relative to rowCenterY.
// #432 rework: the generation previews are a C-based ILLUSTRATION (root C, C-major scale), so they
// colour against a fixed C reference — a "scale" example must not read as non-scale just because the
// real key isn't C. For 'chords'-mode colouring the illustration chord is the C-major triad (the
// same C-E-G the 'chord' note-pool shows). The GLOBAL representativeChord fallback (with the tritone)
// serves the COLOUR setter, which previews the REAL current context.
const GEN_PREVIEW_CHORD = { root: 'C4', notes: ['C4', 'E4', 'G4'] };
const MELODY_TYPE_ICON_DY = -16;   // icon TOP relative to rowCenterY (staff body)
const MELODY_TYPE_LABEL_DY = 38;   // label baseline relative to rowCenterY (below the staff)
const CONTENT_LABEL_DY = 28;  // labels sit just BELOW the staff (staffStart+48) for content rows
const COUNT_FONT_SIZE = 24;   // Maestro numeral under each rhythm-measure item (#362)

// #362 (Han): randomization families take CATEGORY COLOURS — reuse the existing
// --cat-* palette (instrument categories) instead of inventing new colours (§6c).
const FAMILY_COLORS = {
  random: 'var(--cat-synth)',
  arp: 'var(--cat-strings)',
  walk: 'var(--cat-wind)',
  chords: 'var(--cat-guitars)',
  fixed: 'var(--cat-keys)',
  stylized: 'var(--cat-percussion)',
};
const familyColor = (fam) => FAMILY_COLORS[fam] ?? null;
// Horizontal column centres as fractions of the staff width (3 fields spread across the balk).
const COL_FRACS = [0.20, 0.50, 0.80];

// ── melody-type flat item rings (mirror the bottom view's reachable rules) ──────────────────────
// The bottom-view "melody type" is a family icon + within-family stepper. For the in-sheet carousel
// we flatten to the SAME ordered list of reachable rules per instrument type (every value reachable
// below is reachable here too, §6d). Each item is tagged with its FAMILY so the carousel can draw
// one "blokhaken" bracket per family run (random / arp / walk / chords / fixed).
// #295 (Han): arp up / arp down / arp (bounce) are dropped from THIS carousel
// ("haal arp up, down en bounce uit de lijst") — the bottom view keeps them.
const MELODIC_RULE_RING = [
  ...RULE_FAMILIES.random,
  ...RULE_FAMILIES.arp,
  ...RULE_FAMILIES.walk,
  ...RULE_FAMILIES.chords,
  ...RULE_FAMILIES.fixed,
].filter(rule => !['arp_up', 'arp_down', 'arp'].includes(rule));
const PERC_RULE_RING = [
  ...PERC_FAMILIES.random,
  ...PERC_FAMILIES.stylized,
  ...PERC_FAMILIES.fixed,
];
// Build the carousel item list for a rule ring: { value, label, Icon, family }.
const ruleItems = (ring, familyOf) => ring.map(rule => ({
  value: rule,
  label: getPlayStyleLabel(rule),
  Icon: FIELD_ITEM_ICONS.rule[rule],
  family: familyOf[rule],
}));
const MELODIC_RULE_ITEMS = ruleItems(MELODIC_RULE_RING, MELODIC_FAMILY_OF);
const PERC_RULE_ITEMS = ruleItems(PERC_RULE_RING, PERC_FAMILY_OF);
const familyName = (fam) => FAMILY_DISPLAY_NAMES[fam] ?? fam;

// ── static item lists (icon attached from FIELD_ITEM_ICONS / NUMERIC_ICONS) ─────────────────────
const NOTE_POOL_ITEMS = MELODIC_NOTE_POOLS.map(o => ({ ...o, Icon: FIELD_ITEM_ICONS.notePool[o.value] }));
const PERC_POOL_ITEMS = PERC_POOL_PRESETS.map(o => ({ ...o, Icon: FIELD_ITEM_ICONS.percPreset[o.value] }));
const COMPLEXITY_ITEMS = CHORD_COMPLEXITY.map(o => ({ ...o, Icon: FIELD_ITEM_ICONS.complexity[o.value] }));
const STRATEGY_ITEMS = CHORD_STRATEGIES.map(value => ({
  value,
  // getProgressionLabel may embed a '^' superscript marker; strip it for the flat carousel label.
  label: (getProgressionLabel(value) || value).replace('^', ''),
  Icon: FIELD_ITEM_ICONS.strategy[value],
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

  // #295 (Han): 'melody notes' and 'notes / measure' headers were REDUNDANT with the
  // field-name brackets on those carousels — only 'melody type' (family brackets, no
  // field label) keeps a column header.
  const COL_HEADERS = [null, 'melody type', null];

  // Build the carousel descriptor for one (row, columnIndex) cell. Returns the props CarouselField
  // needs: items, activeIndex, onSelect, and bracket mode. WIRING UNCHANGED — onSelect writes the
  // exact same field via the exact same setState path as the previous stepper version.
  const fieldFor = (row, colIdx) => {
    if (row.isChords) {
      if (colIdx === 0) {
        // melody notes → chord complexity. #362 (Han): "geen plaatjes" — each
        // option is the REAL stacked chord it stands for (canonical noteheads),
        // the stack IS the item; the sans label below identifies it.
        const items = COMPLEXITY_ITEMS;
        const cur = chordSettings?.complexity || 'triad';
        return {
          items, activeIndex: idxOf(items, cur), labelAbove: 'complexity',
          renderContent: (item) => (
            <ComplexityChordGlyph complexity={item.value} centerY={row.centerY}
              noteColoringMode={noteColoringMode} activeChord={GEN_PREVIEW_CHORD} theme={theme} />
          ),
          // Stack reaches ~centerY+34 (C4 head) → label clears it; hit box grows to match.
          labelDy: CONTENT_LABEL_DY + 14, hitTop: -32, hitHeight: 84,
          onSelect: (item) => setChordSettings(p => ({ ...p, complexity: item.value })),
        };
      }
      if (colIdx === 1) {
        // melody type → strategy (progression). #295 (Han): rendered as ROMAN
        // NUMERALS — the numeral IS the item, so the sans label is omitted.
        const items = STRATEGY_ITEMS.map(it => ({ ...it, romanLabel: it.label, label: '' }));
        const cur = chordSettings?.strategy || 'tonic-tonic-tonic';
        return {
          items, activeIndex: idxOf(items, cur), labelAbove: 'strategy',
          renderContent: (item, active, color) => (
            <RomanProgressionGlyph label={item.romanLabel} y={row.centerY + 2} color={color} active={active} />
          ),
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
        items, activeIndex: idxOf(items, cur), labelAbove: '#/measure',
        renderContent: (item, active, color) => (
          <g>
            <ChordCountGlyph count={item.value} centerY={row.centerY - 2}
              noteColoringMode={noteColoringMode} activeChord={GEN_PREVIEW_CHORD}
              theme={theme} color={color} />
            {/* #434 (Han: "maak een custom 1/2 etc.") — the count as a real Maestro mixed number
                (big whole + small ½/¼ fraction) instead of the ASCII '2½' Maestro can't draw. */}
            <MaestroMixedNumber value={item.value} cx={0} cy={row.centerY + CONTENT_LABEL_DY + 16}
              size={COUNT_FONT_SIZE} color={color} />
          </g>
        ),
        labelDy: CONTENT_LABEL_DY, hitTop: -32, hitHeight: 84,
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
        return {
          items, activeIndex: idxOf(items, cur), labelAbove: 'percussion',
          // #431 rework (Han: "percussion note pool: breng in lijn met de andere icon+label
          // carousels — grotere afbeelding, label op exact dezelfde hoogte"): same icon size +
          // label alignment as the melody-type field.
          iconSize: STAFF_CARD_ICON, iconDy: MELODY_TYPE_ICON_DY, labelDy: MELODY_TYPE_LABEL_DY,
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
        // #362 (Han): family brackets AND the active item take the family's
        // category colour (--cat-* palette).
        familyMode: true, familyName, familyColor,
        colorOf: (item) => familyColor(item.family),
        // #431 (Han): icons as TALL as the instrument-setter icons (STAFF_CARD_ICON = 38, the
        // shared staff-card height, §6d — not a new literal), and the label aligned the SAME way as
        // the instrument setter: icon on the staff body (top at staffStart+~4 ≈ rowCenterY−16),
        // label below the staff at staffStart+~58 ≈ rowCenterY+38.
        iconSize: STAFF_CARD_ICON, iconDy: MELODY_TYPE_ICON_DY, labelDy: MELODY_TYPE_LABEL_DY,
        // Keep `type` set alongside the rule (mirrors the previous stepper wiring).
        onSelect: (item) => set(p => ({ ...p, randomizationRule: item.value, type: p.type ?? row.key })),
      };
    }
    // notes per measure → notesPerMeasure. #295/#362 (Han): every option 1..16
    // renders as its REAL rhythm pattern — now through MelodyNotesLayer, so 8ths/
    // 16ths BEAM per beat exactly like the sheet ("volgens bestaande protocol
    // renderMelodyNotes"). The count sits below as a Maestro numeral (same font
    // as the BPM/repeats displays); n=0 (auto) keeps its icon + AUTO label.
    const items = NOTES_PER_MEASURE_ITEMS;
    const cur = cfg?.notesPerMeasure || 0;
    // #434 (Han: "notes/measure: plaats een streep hoger (20 units)") — raised 20.
    const rowStaffStart = row.centerY - 40;
    return {
      items, activeIndex: idxOf(items, cur), labelAbove: 'notes / measure',
      renderContent: (item, active, color) => (
        item.value > 0
          ? (
            <g>
              <RhythmMeasureGlyph n={item.value} staffStart={rowStaffStart} color={color} />
              <text x={0} y={row.centerY + CONTENT_LABEL_DY + 16} textAnchor="middle"
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

      {/* Column headers — italic serif, non-capitalised (Han 2026-07-13), var(--text-secondary), 14. */}
      {COL_HEADERS.map((h, i) => (h == null ? null : (
        <text key={`hdr-${i}`} x={cols[i]} y={HEADER_Y} textAnchor="middle"
          fontFamily="serif" fontStyle="italic" fontSize={14} fill="var(--text-secondary)"
          style={{ userSelect: 'none', pointerEvents: 'none' }}>{h}</text>
      )))}

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
                fieldLabel={f.fieldLabel}
                labelAbove={f.labelAbove}
                familyMode={f.familyMode}
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
    </g>
  );
};

export default GenerationSetterOverlay;
