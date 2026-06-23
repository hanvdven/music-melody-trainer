import React from 'react';
import '../SheetMusic.css';
import { useInstrumentSettings } from '../../../contexts/InstrumentSettingsContext';
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
// Horizontal column centres as fractions of the staff width (3 fields spread across the balk).
const COL_FRACS = [0.20, 0.50, 0.80];

// ── melody-type flat item rings (mirror the bottom view's reachable rules) ──────────────────────
// The bottom-view "melody type" is a family icon + within-family stepper. For the in-sheet carousel
// we flatten to the SAME ordered list of reachable rules per instrument type (every value reachable
// below is reachable here too, §6d). Each item is tagged with its FAMILY so the carousel can draw
// one "blokhaken" bracket per family run (random / arp / walk / chords / fixed).
const MELODIC_RULE_RING = [
  ...RULE_FAMILIES.random,
  ...RULE_FAMILIES.arp,
  ...RULE_FAMILIES.walk,
  ...RULE_FAMILIES.chords,
  ...RULE_FAMILIES.fixed,
];
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
const NOTES_PER_MEASURE_ITEMS = NOTES_PER_MEASURE.map(v => ({ value: v, label: String(v), Icon: NUMERIC_ICONS.count }));
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
  debugMode = false,
}) => {
  const {
    trebleSettings, setTrebleSettings,
    bassSettings, setBassSettings,
    percussionSettings, setPercussionSettings,
    chordSettings, setChordSettings,
  } = useInstrumentSettings();
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
    { key: 'chords', centerY: CHORD_ROW_Y, show: showChordsRow, isChords: true },
    { key: 'treble', centerY: trebleStart + 20, show: isTrebleVisible },
    { key: 'bass', centerY: bassStart + 20, show: isBassVisible },
    { key: 'percussion', centerY: percussionStart + 20, show: isPercussionVisible },
  ].filter(r => r.show);

  const COL_HEADERS = ['melody notes', 'melody type', 'notes / measure'];

  // Build the carousel descriptor for one (row, columnIndex) cell. Returns the props CarouselField
  // needs: items, activeIndex, onSelect, and bracket mode. WIRING UNCHANGED — onSelect writes the
  // exact same field via the exact same setState path as the previous stepper version.
  const fieldFor = (row, colIdx) => {
    if (row.isChords) {
      if (colIdx === 0) {
        // melody notes → chord complexity
        const items = COMPLEXITY_ITEMS;
        const cur = chordSettings?.complexity || 'triad';
        return {
          items, activeIndex: idxOf(items, cur), fieldLabel: 'complexity',
          onSelect: (item) => setChordSettings(p => ({ ...p, complexity: item.value })),
        };
      }
      if (colIdx === 1) {
        // melody type → strategy (progression)
        const items = STRATEGY_ITEMS;
        const cur = chordSettings?.strategy || 'tonic-tonic-tonic';
        return {
          items, activeIndex: idxOf(items, cur), fieldLabel: 'strategy',
          onSelect: (item) => setChordSettings(p => ({ ...p, strategy: item.value })),
        };
      }
      // notes per measure → chordCount
      const items = CHORD_COUNT_ITEMS;
      const cur = chordSettings?.chordCount ?? 1;
      return {
        items, activeIndex: idxOf(items, cur), fieldLabel: 'chords / measure',
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
          items, activeIndex: idxOf(items, cur), fieldLabel: 'percussion',
          onSelect: (item) => set(p => ({ ...p, enabledPads: [...PERCUSSION_PRESETS[item.value]] })),
        };
      }
      const items = NOTE_POOL_ITEMS;
      const cur = cfg?.notePool || 'scale';
      return {
        items, activeIndex: idxOf(items, cur), fieldLabel: 'note pool',
        onSelect: (item) => set(p => ({ ...p, notePool: item.value })),
      };
    }
    if (colIdx === 1) {
      // melody type → randomizationRule (play-style), grouped by FAMILY (blokhaken brackets).
      const items = isPerc ? PERC_RULE_ITEMS : MELODIC_RULE_ITEMS;
      const cur = cfg?.randomizationRule || (isPerc ? 'uniform' : 'uniform');
      return {
        items, activeIndex: idxOf(items, cur),
        familyMode: true, familyName,
        // Keep `type` set alongside the rule (mirrors the previous stepper wiring).
        onSelect: (item) => set(p => ({ ...p, randomizationRule: item.value, type: p.type ?? row.key })),
      };
    }
    // notes per measure → notesPerMeasure
    const items = NOTES_PER_MEASURE_ITEMS;
    const cur = cfg?.notesPerMeasure || 0;
    return {
      items, activeIndex: idxOf(items, cur), fieldLabel: 'notes / measure',
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

      {/* Column headers — italic serif, var(--text-secondary), fontSize 14 (matches siblings). */}
      {COL_HEADERS.map((h, i) => (
        <text key={`hdr-${i}`} x={cols[i]} y={HEADER_Y} textAnchor="middle"
          fontFamily="serif" fontStyle="italic" fontSize={14} fill="var(--text-secondary)"
          style={{ userSelect: 'none', pointerEvents: 'none' }}>{h}</text>
      ))}

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
                baseWidth={CAROUSEL_BASE}
                hitTop={HIT_TOP}
                hitHeight={HIT_H}
                iconSize={ICON_SIZE}
                iconDy={ICON_DY}
                labelDy={LABEL_DY}
                labelFontSize={LABEL_FONT_SIZE}
                bracketDy={BRACKET_DY}
                fieldLabel={f.fieldLabel}
                familyMode={f.familyMode}
                familyName={f.familyName}
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
