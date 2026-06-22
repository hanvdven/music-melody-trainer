import React from 'react';
import '../SheetMusic.css';
import { useInstrumentSettings } from '../../../contexts/InstrumentSettingsContext';
import NonLinearCarousel from './NonLinearCarousel';
import {
  RHYTHM_VARIABILITY,
  LEAP_OPTIONS,
  POLY_LEVELS,
  SMALLEST_NOTE_DENOMS,
  SMALLEST_NOTE_LABELS,
  PASSING_CHORD_TYPES,
  FIELD_ITEM_ICONS,
  NUMERIC_ICONS,
  SPAN_ICON,
} from '../../../constants/generationFields';
import { CarouselField, FieldNameBracket } from '../CarouselFieldItem';

// ── GENERATION ADVANCED setter — CAROUSEL STYLE (Han 2026-06-22) ───────────────────────────────
// Sibling of the GENERATION setter, rebuilt the same way: every field is now a full 5-wide
// NonLinearCarousel (visibleHalf=2) with a LUCIDE ICON on top + TEXT LABEL below + a dashed field
// "blokhaken" bracket above (matching the instrument carousel). REASON FOR THE REBUILD: the old
// smallest-note Maestro glyph stepper was UNREADABLE — now it shows a readable duration WORD
// (whole/half/quarter/eighth/sixteenth, §5b trivially satisfied — no accidentals).
//
// Per VISIBLE balk (treble / bass / percussion + CHORDS), fields laid across the staff width:
//   col 1 "variability"   → rhythmVariability (number-as-label + Percent icon)
//   col 2 "span"          → maxLeap (LEAP_OPTIONS; null = ∞) — melodic only (N/A for perc/chords)
//   col 3 "tuplets"       → polyMultiplier (none/low/med/high/xtreme)
//   col 4 "smallest note" → smallestNoteDenom (readable duration word + note icon)
//
// CHORDS balk: only the "passing chords" control is meaningful — a 7-type carousel in the
// tuplets-column position where selecting a type TOGGLES it in chordSettings.passingChordTypes;
// ENABLED types render bright, disabled dim (custom renderItem). PROVISIONAL — flag for Han.
//
// WIRING IS UNCHANGED from the previous stepper version: each select writes the SAME field via the
// SAME setState path; only the presentation changed. Option arrays/labels come from
// src/constants/generationFields.js (§6d). The carousel ENGINE is reused (NonLinearCarousel via
// CarouselField, plus a direct NonLinearCarousel for the toggle-set passing-chords field).

// ── SIZING / SPACING CONSTANTS (Han 2026-06-22) — tune live ────────────────────────────────────
const CAROUSEL_BASE = 24;     // per-item slot stride (user units); 4 dense columns per balk.
const ICON_SIZE = 16;
const ICON_DY = -22;
const LABEL_DY = 2;
const LABEL_FONT_SIZE = 11;
const BRACKET_DY = -32;
const HIT_TOP = -30;
const HIT_H = 56;
// Four columns spread across the staff width.
const COL_FRACS = [0.16, 0.40, 0.62, 0.86];

// ── static item lists (icon attached from the shared maps) ──────────────────────────────────────
const VARIABILITY_ITEMS = RHYTHM_VARIABILITY.map(v => ({ value: v, label: `${v}%`, Icon: NUMERIC_ICONS.percent }));
const SPAN_ITEMS = LEAP_OPTIONS.map(o => ({ ...o, Icon: SPAN_ICON }));
const POLY_ITEMS = POLY_LEVELS.map(o => ({ ...o, Icon: FIELD_ITEM_ICONS.poly[o.value] }));
// smallest note: readable duration WORD as the label (the whole point), note glyph icon.
const SMALLEST_NOTE_ITEMS = SMALLEST_NOTE_DENOMS.map(v => ({
  value: v, label: SMALLEST_NOTE_LABELS[v], Icon: FIELD_ITEM_ICONS.smallestNote[v],
}));
// passing chords: { value (the toggle key), label, Icon }.
const PASSING_ITEMS = PASSING_CHORD_TYPES.map(t => ({ value: t.key, label: t.label, Icon: FIELD_ITEM_ICONS.passing[t.key] }));

const idxOf = (items, value) => {
  const i = items.findIndex(it => it.value === value);
  return i === -1 ? 0 : i;
};

const GenerationAdvancedSetterOverlay = ({
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
  // The passing-chord carousel's centred type drives which type a tap toggles; track the live centre
  // so the dashed bracket label/highlight stay coherent. MUST precede any early return (hooks rule).
  const [passingPos, setPassingPos] = React.useState(0);
  if (startX == null || endX == null) return null;

  const withInteraction = (fn) => (item, index) => { onSettingsInteraction?.(); fn(item, index); };

  const span = endX - startX;
  const cols = COL_FRACS.map(f => startX + f * span);

  const HEADER_Y = trebleStart - 89;
  const CHORD_ROW_Y = trebleStart - 64;

  const rows = [
    { key: 'chords', centerY: CHORD_ROW_Y, show: showChordsRow, isChords: true },
    { key: 'treble', centerY: trebleStart + 20, show: isTrebleVisible },
    { key: 'bass', centerY: bassStart + 20, show: isBassVisible },
    { key: 'percussion', centerY: percussionStart + 20, show: isPercussionVisible },
  ].filter(r => r.show);

  const COL_HEADERS = ['variability', 'span', 'tuplets', 'smallest note'];

  // Build the carousel descriptor for one melodic/perc (row, columnIndex) cell. Returns null when
  // the field is N/A for that balk. WIRING UNCHANGED vs the stepper version.
  const fieldFor = (row, colIdx) => {
    const set = row.key === 'treble' ? setTrebleSettings
      : row.key === 'bass' ? setBassSettings : setPercussionSettings;
    const cfg = row.key === 'treble' ? trebleSettings
      : row.key === 'bass' ? bassSettings : percussionSettings;
    const isPerc = row.key === 'percussion';

    if (colIdx === 0) {
      // variability → rhythmVariability
      const items = VARIABILITY_ITEMS;
      const cur = cfg?.rhythmVariability || 0;
      return {
        items, activeIndex: idxOf(items, cur), fieldLabel: 'variability',
        onSelect: (item) => set(p => ({ ...p, rhythmVariability: item.value })),
      };
    }
    if (colIdx === 1) {
      // span → maxLeap (melodic only; N/A for percussion)
      if (isPerc) return null;
      const items = SPAN_ITEMS;
      const cur = cfg?.maxLeap ?? null;
      return {
        items, activeIndex: idxOf(items, cur), fieldLabel: 'span',
        onSelect: (item) => set(p => ({ ...p, maxLeap: item.value })),
      };
    }
    if (colIdx === 2) {
      // tuplets → polyMultiplier
      const items = POLY_ITEMS;
      const cur = cfg?.polyMultiplier ?? 1;
      return {
        items, activeIndex: idxOf(items, cur), fieldLabel: 'tuplets',
        onSelect: (item) => set(p => ({ ...p, polyMultiplier: item.value })),
      };
    }
    // smallest note → smallestNoteDenom (readable word)
    const items = SMALLEST_NOTE_ITEMS;
    const cur = cfg?.smallestNoteDenom || 4;
    return {
      items, activeIndex: idxOf(items, cur), fieldLabel: 'smallest note',
      onSelect: (item) => set(p => ({ ...p, smallestNoteDenom: item.value })),
    };
  };

  // ── CHORDS balk: passing-chord toggle-set carousel (provisional) ──────────────────────────────
  // Direct NonLinearCarousel (not CarouselField) because the "active" state is a SET, not one value:
  // we colour each item by whether its type is ENABLED in passingChordTypes, and a select TOGGLES
  // the centred type. The dashed bracket above is the static field name "passing chords".
  const renderPassingItem = (() => {
    const enabled = new Set(chordSettings?.passingChordTypes ?? []);
    const iconY = CHORD_ROW_Y + ICON_DY;
    const labelY = CHORD_ROW_Y + LABEL_DY;
    // render-PROP for NonLinearCarousel (invoked manually), not a React component.
    const renderPassing = (item) => {
      const on = enabled.has(item.value);
      const color = on ? 'var(--text-primary)' : 'var(--text-lowlight)';
      const Icon = item.Icon;
      return (
        <g style={{ pointerEvents: 'none', color }}>
          {Icon && (
            <Icon x={-ICON_SIZE / 2} y={iconY} width={ICON_SIZE} height={ICON_SIZE}
              color="currentColor" strokeWidth={2} style={{ pointerEvents: 'none' }} />
          )}
          <text x={0} y={labelY} textAnchor="middle" fontSize={LABEL_FONT_SIZE}
            fontFamily="sans-serif" fontWeight={on ? 'bold' : 'normal'} fill={color}>
            {item.label}
          </text>
        </g>
      );
    };
    return renderPassing;
  })();

  const passingCol = cols[2]; // tuplets-column position (provisional placement, mirrors old layout)
  const edgeX = (2 + 0.5) * CAROUSEL_BASE; // visibleHalf=2 → fixed window half-width for the bracket.

  return (
    <g className="generation-advanced-overlay" onClick={(e) => e.stopPropagation()}>
      {/* Full-overlay transparent hit-zone (mirrors SettingsOverlay). */}
      <rect
        x={startX - 8} y={trebleStart - 95}
        width={(endX - startX) + 16}
        height={(percussionStart + 40) - (trebleStart - 95)}
        fill="transparent"
        style={{ cursor: 'default' }}
      />

      {/* Column headers — italic serif, var(--text-secondary), fontSize 14. */}
      {COL_HEADERS.map((h, i) => (
        <text key={`hdr-${i}`} x={cols[i]} y={HEADER_Y} textAnchor="middle"
          fontFamily="serif" fontStyle="italic" fontSize={14} fill="var(--text-secondary)"
          style={{ userSelect: 'none', pointerEvents: 'none' }}>{h}</text>
      ))}

      {/* Melodic / percussion balks: field carousels. */}
      {rows.filter(r => !r.isChords).map(row => (
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
                debugMode={debugMode}
              />
            );
          })}
        </g>
      ))}

      {/* CHORDS balk: the passing-chord toggle-set carousel in the tuplets-column position. */}
      {showChordsRow && (
        <g>
          <FieldNameBracket centerX={passingCol} bracketY={CHORD_ROW_Y + BRACKET_DY}
            edgeX={edgeX} label="passing chords" />
          <NonLinearCarousel
            items={PASSING_ITEMS}
            activeIndex={passingPos}
            renderItem={renderPassingItem}
            centerX={passingCol}
            y={CHORD_ROW_Y + HIT_TOP}
            baseWidth={CAROUSEL_BASE}
            height={HIT_H}
            onSelect={withInteraction((item, index) => {
              // Toggle the SELECTED (centred) type in the set; keep the carousel centred on it.
              setPassingPos(index);
              const prev = chordSettings?.passingChordTypes ?? [];
              const next = prev.includes(item.value)
                ? prev.filter(t => t !== item.value)
                : [...prev, item.value];
              setChordSettings(p => ({ ...p, passingChordTypes: next }));
            })}
            onPosChange={(pos) => setPassingPos(Math.round(pos))}
            visibleHalf={2}
            debugMode={debugMode}
          />
        </g>
      )}
    </g>
  );
};

export default GenerationAdvancedSetterOverlay;
