import React from 'react';
import '../SheetMusic.css';
import { useInstrumentSettings } from '../../../contexts/InstrumentSettingsContext';
import {
  RHYTHM_VARIABILITY,
  LEAP_OPTIONS,
  POLY_LEVELS,
  SMALLEST_NOTE_DENOMS,
  SMALLEST_NOTE_GLYPHS,
  PASSING_CHORD_TYPES,
} from '../../../constants/generationFields';
// §6d — canonical renderers / curve math, NEVER hand-rolled here:
import { StaffQuarterNote, StaffDurationNote } from '../staffNoteGlyph';
import { getNoteFromValue } from '../../../utils/rangeUtils';
import { getNoteAbsoluteY } from '../renderMelodyNotes';
import { curveX, curveY, leftCurveX, X_SPACING, useTangensDrag } from './tangensCurve';

// ── GENERATION ADVANCED setter — IN-STAFF MAESTRO / TANGENS STYLE (Han 2026-06-26, #162) ──────────
// REPLACES the previous Lucide-icon NonLinearCarousel version. Every field is now an in-staff
// "tangens" carousel built from the SAME fan curve + drag mechanics the TranspositionSetter uses
// (tangensCurve.js — §6d single source of truth). Per Han's locked design Q&A:
//
//   span         → RIGHT-fan NOTEHEAD carousel: discrete LEAP_OPTIONS rendered as real staff heads
//                  (StaffQuarterNote) at C4 ± the interval (treble ascending, bass descending);
//                  ∞ = serif infinity glyph in place of a head. Melodic only (N/A for percussion).
//   variability  → LEFT-fan NUMERIC carousel: RHYTHM_VARIABILITY 0..100 in steps of 10.
//   tuplets      → LEFT-fan WORD carousel: POLY_LEVELS none..xtreme.
//   smallest note→ CENTRED tangens carousel of real duration glyphs (StaffDurationNote: 16/8/q/h/w),
//                  active centred on B4 (treble) / D3 (bass) staff middle line.
//   CHORDS balk  → passing-chords TOGGLE-SET (chordSettings.passingChordTypes) — behaviour preserved
//                  from the old overlay, restyled to the serif/Maestro language.
//
// WIRING IS UNCHANGED vs the old overlay: each select writes the SAME InstrumentSettings field via
// the SAME setState path. The PROPS CONTRACT is identical (zero call-site change in SheetMusic.jsx).
// Option arrays come from src/constants/generationFields.js (§6c/§6d). Glyph chars + curve math are
// imported, never copied (§6d).
//
// SPAN/LEAP RANGE NOTE (#162): the ticket text mentioned "min 5th", but the LEAP_OPTIONS SSOT array
// includes 3rd/4th too. Per §6c/§6d we render the SHARED array as-is rather than forking it (Han
// answered Q1 = "discrete LEAP_OPTIONS"); flagged for UAT.

// ── Typography / layout constants (§6d: in-staff LABELS are serif, never Maestro) ────────────────
const LABEL_FONT = "Georgia, 'Times New Roman', serif";   // matches TranspositionSetter LABEL_FONT
const ACTIVE_LABEL_SIZE = 22;   // active numeric/word label size (matches TranspositionSetter)
const ROW_H = 15;               // vertical spacing between LEFT-fan rows (matches TranspositionSetter)
const INTERVAL_LABEL_SIZE = 11; // serif interval name above each span head
const FIELD_LABEL_SIZE = 11;    // field name below the staff
const HEADER_Y_DROP = 89;       // column header sits trebleStart − 89 (kept from old overlay)
const PX_PER_STEP = 16;         // drag sensitivity for the LEFT/centre carousels (px per index step)
const C4_MIDI = 60;
const B4_MIDI = 71;             // treble smallest-note anchor = middle staff line
const D3_MIDI = 50;             // bass smallest-note anchor = middle staff line

const COLOR = 'var(--text-primary)';
const LOW = 'var(--text-lowlight)';
const SECONDARY = 'var(--text-secondary)';

// Column anchors across the staff width (variability | span | tuplets | smallest note).
const COL_FRACS = [0.16, 0.42, 0.64, 0.87];

// Maestro accidental glyph for a (Unicode-spelled) note name — same mapping the TranspositionSetter
// uses for its span heads. '#'/'b' here are MAESTRO FONT GLYPH chars, not display text, so §5b's
// "no ASCII b/#" rule does not apply (the rule is about user-visible TEXT, not font codepoints).
const accidentalGlyph = (name) => (name.includes('♯') ? '#' : name.includes('♭') ? 'b' : null);

// Ledger-line Y positions for a head drawn at `y` on a staff starting at `staffStart`. Identical
// geometry to TranspositionSetter.ledgerYs (caller-side note placement, not glyph drawing — §6d is
// about the glyph itself, which we still draw via StaffQuarterNote). Heads off the staff get ledgers.
const ledgerYs = (y, staffStart) => {
  const out = [];
  for (let g = staffStart - 10; y <= g; g -= 10) out.push(g);   // above the staff
  for (let g = staffStart + 50; y >= g; g += 10) out.push(g);   // below the staff
  return out;
};

// Index of `value` in an options array. Items are either bare values (RHYTHM_VARIABILITY,
// SMALLEST_NOTE_DENOMS) or `{ value, label }` objects (LEAP_OPTIONS, POLY_LEVELS). We must NOT use
// `it.value ?? it` to extract the value: the ∞ span entry is `{ value: null }`, and `null ?? it`
// would yield the object, so a stored maxLeap=null (∞) would never match → defaulted to index 0.
const optValue = (it) => (it != null && typeof it === 'object' && 'value' in it ? it.value : it);
const idxOf = (items, value) => {
  const i = items.findIndex(it => optValue(it) === value);
  return i === -1 ? 0 : i;
};

// Field name below the staff (sans, --text-secondary, possibly multi-line).
const FieldLabel = ({ cx, topY, lines }) => (
  <text x={cx} y={topY} textAnchor="middle" fontSize={FIELD_LABEL_SIZE} fontFamily="sans-serif"
    fill={SECONDARY} style={{ userSelect: 'none', pointerEvents: 'none' }}>
    {lines.map((ln, i) => (
      <tspan key={i} x={cx} dy={i === 0 ? 0 : FIELD_LABEL_SIZE + 1}>{ln}</tspan>
    ))}
  </text>
);

// Shared invisible drag band + its §3a debug mirror.
const DragBand = ({ x, y, w, h, bind, debugMode }) => (
  <>
    <rect x={x} y={y} width={w} height={h}
      fill="transparent" style={{ cursor: 'ns-resize', touchAction: 'none' }} {...bind} />
    {debugMode && (
      <rect x={x} y={y} width={w} height={h}
        fill="orange" fillOpacity={0.4} stroke="orange" strokeWidth={1}
        style={{ pointerEvents: 'none' }} />
    )}
  </>
);

// ── LEFT-fan numeric/word carousel ──────────────────────────────────────────────────────────────
// Mirrors TranspositionSetter's left name carousel: high values sit HIGH on screen, gentle tanh-x
// fan (leftCurveX), active label biggest in --text-primary, neighbours shrink + dim. Drag UP
// increases the index (dirSign +1). `renderLabel(item)` → the text to draw for each option.
const LeftFanCarousel = ({ cx, centerY, items, activeIndex, onCommit, renderLabel, fieldLines, debugMode }) => {
  const { effIndex, dragging, bind } = useTangensDrag(activeIndex, items.length - 1, onCommit, PX_PER_STEP, 1);
  const rowsOut = [];
  for (let i = Math.floor(effIndex) - 4; i <= Math.ceil(effIndex) + 4; i++) {
    if (i < 0 || i > items.length - 1) continue;
    const off = i - effIndex;                 // off>0 = higher value
    const isActive = i === Math.round(effIndex);
    const ry = centerY + 6 - off * ROW_H;     // high value HIGH on screen
    const nx = cx + leftCurveX(off);
    const dist = Math.abs(off);
    const size = Math.max(8, ACTIVE_LABEL_SIZE - dist * 2.0);
    const op = Math.max(0.18, (isActive ? 1 : 0.8) - dist * 0.12);
    rowsOut.push(
      <text key={i} x={nx} y={ry} textAnchor="middle" fontFamily={LABEL_FONT} fontSize={size}
        fill={isActive ? COLOR : LOW} opacity={op} style={{ pointerEvents: 'none' }}>
        {renderLabel(items[i])}
      </text>,
    );
  }
  const bandH = dragging ? 150 : 110;
  const bandTop = centerY + 6 - bandH / 2;
  return (
    <g>
      {rowsOut}
      <DragBand x={cx - 22} y={bandTop} w={44} h={bandH} bind={bind} debugMode={debugMode} />
      <FieldLabel cx={cx} topY={centerY + 50} lines={fieldLines} />
    </g>
  );
};

// ── SPAN — RIGHT-fan notehead carousel of LEAP_OPTIONS ───────────────────────────────────────────
// Heads are real StaffQuarterNote glyphs at C4 ± interval (treble ascending, bass descending), fanned
// on the tangens curve (curveX/curveY) exactly like TranspositionSetter's right carousel. ∞ (value
// null) renders a serif infinity glyph in place of a head. Interval NAME sits above each head.
const SpanFanCarousel = ({ cx, staffStart, clef, staff, ascending, activeIndex, onCommit, fieldLines, debugMode }) => {
  const { effIndex, dragging, bind } = useTangensDrag(activeIndex, LEAP_OPTIONS.length - 1, onCommit, PX_PER_STEP, 1);
  const out = [];
  for (let i = Math.floor(effIndex) - 5; i <= Math.ceil(effIndex) + 5; i++) {
    if (i < 0 || i > LEAP_OPTIONS.length - 1) continue;
    const opt = LEAP_OPTIONS[i];
    const t = i - effIndex;
    const isActive = i === Math.round(effIndex);
    const dist = Math.abs(t);
    const op = Math.max(0.15, (isActive ? 1 : 0.7) - dist * 0.1);
    const fill = isActive ? COLOR : LOW;
    const x = cx + curveX(t);
    if (opt.value == null) {
      // ∞ entry: serif infinity char where the head would be (vertical position = C4 line).
      const baseY = getNoteAbsoluteY('C4', staffStart, clef, staff);
      if (baseY == null) continue;
      const y = baseY + curveY(t);
      out.push(
        <text key={i} x={x} y={y + 8} textAnchor="middle" fontFamily={LABEL_FONT} fontSize={22}
          fill={fill} opacity={op} style={{ pointerEvents: 'none' }}>∞</text>,
      );
      out.push(
        <text key={`lbl-${i}`} x={x} y={y - 22} textAnchor="middle" fontFamily={LABEL_FONT}
          fontSize={INTERVAL_LABEL_SIZE} fill={SECONDARY} opacity={op}
          style={{ pointerEvents: 'none' }}>{opt.label}</text>,
      );
      continue;
    }
    const targetMidi = C4_MIDI + (ascending ? opt.value : -opt.value);
    const name = getNoteFromValue(targetMidi);
    const originY = getNoteAbsoluteY(name, staffStart, clef, staff);
    if (originY == null) continue;
    const y = originY + curveY(t);
    const scale = Math.max(0.5, 1 - dist * 0.09);
    out.push(
      <g key={i} opacity={op}
        transform={`translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`}>
        <StaffQuarterNote x={x} positionY={y} staffYStart={staffStart}
          accidental={accidentalGlyph(name)}
          ledgerYs={dist < 1.5 ? ledgerYs(y, staffStart) : []} color={fill} />
      </g>,
    );
    out.push(
      <text key={`lbl-${i}`} x={x} y={y - 22} textAnchor="middle" fontFamily={LABEL_FONT}
        fontSize={INTERVAL_LABEL_SIZE} fill={SECONDARY} opacity={op}
        style={{ pointerEvents: 'none' }}>{opt.label}</text>,
    );
  }
  const bandH = dragging ? 150 : 110;
  const bandTop = staffStart + 20 + 6 - bandH / 2;
  const bandW = 6 * X_SPACING + 24;
  return (
    <g>
      {out}
      <DragBand x={cx - bandW / 2} y={bandTop} w={bandW} h={bandH} bind={bind} debugMode={debugMode} />
      <FieldLabel cx={cx} topY={staffStart + 20 + 50} lines={fieldLines} />
    </g>
  );
};

// ── SMALLEST NOTE — centred tangens carousel of real duration glyphs ─────────────────────────────
// The active glyph sits on the staff's middle line (B4 treble / D3 bass); neighbours fan via
// curveX/curveY and dim. Glyph chars come from SMALLEST_NOTE_GLYPHS (§6d single source).
const SmallestNoteFanCarousel = ({ cx, staffStart, clef, staff, anchorMidi, activeIndex, onCommit, fieldLines, debugMode }) => {
  const { effIndex, dragging, bind } = useTangensDrag(activeIndex, SMALLEST_NOTE_DENOMS.length - 1, onCommit, PX_PER_STEP, 1);
  const anchorY = getNoteAbsoluteY(getNoteFromValue(anchorMidi), staffStart, clef, staff);
  const out = [];
  for (let i = Math.floor(effIndex) - 4; i <= Math.ceil(effIndex) + 4; i++) {
    if (i < 0 || i > SMALLEST_NOTE_DENOMS.length - 1 || anchorY == null) continue;
    const denom = SMALLEST_NOTE_DENOMS[i];
    const t = i - effIndex;
    const isActive = i === Math.round(effIndex);
    const dist = Math.abs(t);
    const op = Math.max(0.15, (isActive ? 1 : 0.7) - dist * 0.1);
    const x = cx + curveX(t);
    const y = anchorY + curveY(t);
    const scale = Math.max(0.5, 1 - dist * 0.09);
    out.push(
      <StaffDurationNote key={i} glyphChar={SMALLEST_NOTE_GLYPHS[denom]} x={x} positionY={y}
        color={isActive ? COLOR : LOW} opacity={op} scale={scale} />,
    );
  }
  const bandH = dragging ? 150 : 110;
  const bandTop = (anchorY ?? staffStart + 20) - bandH / 2;
  const bandW = 6 * X_SPACING + 24;
  return (
    <g>
      {out}
      <DragBand x={cx - bandW / 2} y={bandTop} w={bandW} h={bandH} bind={bind} debugMode={debugMode} />
      <FieldLabel cx={cx} topY={staffStart + 20 + 50} lines={fieldLines} />
    </g>
  );
};

// ── PASSING CHORDS — toggle-set carousel (behaviour preserved from old overlay) ──────────────────
// The CENTRED type is what a tap toggles; ENABLED types render bold in --text-primary, disabled in
// --text-lowlight. Drag recentres which type is active (does NOT toggle); a tap on the centred row
// toggles its enabled state. `passingPos`/`setPassingPos` are owned by the parent so the centre is
// stable across re-renders.
const PassingChordsFan = ({ cx, centerY, enabled, activeIndex, setPassingPos, onToggle, debugMode }) => {
  const enabledSet = new Set(enabled);
  const { effIndex, dragging, bind } = useTangensDrag(
    activeIndex, PASSING_CHORD_TYPES.length - 1, (i) => setPassingPos(i), PX_PER_STEP, 1,
  );
  const rowsOut = [];
  for (let i = Math.floor(effIndex) - 4; i <= Math.ceil(effIndex) + 4; i++) {
    if (i < 0 || i > PASSING_CHORD_TYPES.length - 1) continue;
    const ct = PASSING_CHORD_TYPES[i];
    const off = i - effIndex;
    const isActive = i === Math.round(effIndex);
    const on = enabledSet.has(ct.key);
    const ry = centerY + 6 - off * ROW_H;
    const nx = cx + leftCurveX(off);
    const dist = Math.abs(off);
    const size = Math.max(8, ACTIVE_LABEL_SIZE - dist * 3.0);
    const op = Math.max(0.18, (isActive ? 1 : 0.8) - dist * 0.12);
    rowsOut.push(
      <text key={i} x={nx} y={ry} textAnchor="middle" fontFamily={LABEL_FONT} fontSize={size}
        fontWeight={on ? 'bold' : 'normal'} fill={on ? COLOR : LOW} opacity={op}
        style={{ pointerEvents: 'none' }}>
        {ct.label}
      </text>,
    );
  }
  const bandH = dragging ? 150 : 110;
  const bandTop = centerY + 6 - bandH / 2;
  return (
    <g>
      <text x={cx} y={centerY - 32} textAnchor="middle" fontFamily="sans-serif"
        fontSize={FIELD_LABEL_SIZE} fill={SECONDARY} style={{ pointerEvents: 'none' }}>
        passing chords
      </text>
      {rowsOut}
      {/* Drag band (recenter). */}
      <rect x={cx - 26} y={bandTop} width={52} height={bandH}
        fill="transparent" style={{ cursor: 'ns-resize', touchAction: 'none' }} {...bind} />
      {/* Central tap target — toggles the centred type's enabled state. */}
      <rect x={cx - 26} y={centerY - ROW_H / 2 - 1} width={52} height={ROW_H}
        fill="transparent" style={{ cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); onToggle(Math.round(effIndex)); }} />
      {debugMode && (
        <>
          <rect x={cx - 26} y={bandTop} width={52} height={bandH}
            fill="orange" fillOpacity={0.25} stroke="orange" strokeWidth={1}
            style={{ pointerEvents: 'none' }} />
          <rect x={cx - 26} y={centerY - ROW_H / 2 - 1} width={52} height={ROW_H}
            fill="lime" fillOpacity={0.3} stroke="lime" strokeWidth={1}
            style={{ pointerEvents: 'none' }} />
        </>
      )}
    </g>
  );
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
  // Live centre of the passing-chord carousel (which type a tap toggles). Must precede any early
  // return (hooks rule).
  const [passingPos, setPassingPos] = React.useState(0);
  if (startX == null || endX == null) return null;

  const fireInteraction = () => onSettingsInteraction?.();
  const span = endX - startX;
  const cols = COL_FRACS.map(f => startX + f * span);
  const HEADER_Y = trebleStart - HEADER_Y_DROP;
  const CHORD_ROW_Y = trebleStart - 64;
  const COL_HEADERS = ['variability', 'span', 'tuplets', 'smallest note'];

  const rows = [
    { key: 'treble', clef: 'treble', staff: 'treble', centerY: trebleStart + 20, staffStart: trebleStart, smallestMidi: B4_MIDI, show: isTrebleVisible },
    { key: 'bass', clef: 'bass', staff: 'bass', centerY: bassStart + 20, staffStart: bassStart, smallestMidi: D3_MIDI, show: isBassVisible },
    { key: 'percussion', clef: 'percussion', staff: 'percussion', centerY: percussionStart + 20, staffStart: percussionStart, smallestMidi: D3_MIDI, show: isPercussionVisible },
  ].filter(r => r.show);

  const settersFor = (rowKey) => (
    rowKey === 'treble' ? { cfg: trebleSettings, set: setTrebleSettings }
      : rowKey === 'bass' ? { cfg: bassSettings, set: setBassSettings }
        : { cfg: percussionSettings, set: setPercussionSettings }
  );

  return (
    <g className="generation-advanced-overlay" onClick={(e) => e.stopPropagation()}>
      {/* Full-overlay transparent hit-zone (mirrors SettingsOverlay) so empty-space clicks don't
          fall through to the staff. */}
      <rect
        x={startX - 8} y={trebleStart - 95}
        width={(endX - startX) + 16}
        height={(percussionStart + 60) - (trebleStart - 95)}
        fill="transparent"
        style={{ cursor: 'default' }}
      />

      {/* Column headers — italic serif, --text-secondary (kept from old overlay). */}
      {COL_HEADERS.map((h, i) => (
        <text key={`hdr-${i}`} x={cols[i]} y={HEADER_Y} textAnchor="middle"
          fontFamily="serif" fontStyle="italic" fontSize={14} fill={SECONDARY}
          style={{ userSelect: 'none', pointerEvents: 'none' }}>{h}</text>
      ))}

      {/* Per-balk in-staff tangens setters. */}
      {rows.map(row => {
        const { cfg, set } = settersFor(row.key);
        const isPerc = row.key === 'percussion';
        const variabilityIdx = idxOf(RHYTHM_VARIABILITY, cfg?.rhythmVariability ?? 0);
        const polyIdx = idxOf(POLY_LEVELS, cfg?.polyMultiplier ?? 1);
        return (
          <g key={row.key}>
            <LeftFanCarousel
              cx={cols[0]} centerY={row.centerY}
              items={RHYTHM_VARIABILITY}
              activeIndex={variabilityIdx}
              onCommit={(i) => { fireInteraction(); set(p => ({ ...p, rhythmVariability: RHYTHM_VARIABILITY[i] })); }}
              renderLabel={(v) => String(v)}
              fieldLines={['rhythmic', `variability = ${cfg?.rhythmVariability ?? 0}`]}
              debugMode={debugMode}
            />

            {!isPerc && (
              <SpanFanCarousel
                cx={cols[1]} staffStart={row.staffStart} clef={row.clef} staff={row.staff}
                ascending={row.key === 'treble'}
                activeIndex={idxOf(LEAP_OPTIONS, cfg?.maxLeap ?? null)}
                onCommit={(i) => { fireInteraction(); set(p => ({ ...p, maxLeap: LEAP_OPTIONS[i].value })); }}
                fieldLines={['span']}
                debugMode={debugMode}
              />
            )}

            <LeftFanCarousel
              cx={cols[2]} centerY={row.centerY}
              items={POLY_LEVELS}
              activeIndex={polyIdx}
              onCommit={(i) => { fireInteraction(); set(p => ({ ...p, polyMultiplier: POLY_LEVELS[i].value })); }}
              renderLabel={(it) => it.label}
              fieldLines={['tuplet', 'frequency', `= ${POLY_LEVELS[polyIdx].label}`]}
              debugMode={debugMode}
            />

            <SmallestNoteFanCarousel
              cx={cols[3]} staffStart={row.staffStart} clef={row.clef} staff={row.staff}
              anchorMidi={row.smallestMidi}
              activeIndex={idxOf(SMALLEST_NOTE_DENOMS, cfg?.smallestNoteDenom ?? 4)}
              onCommit={(i) => { fireInteraction(); set(p => ({ ...p, smallestNoteDenom: SMALLEST_NOTE_DENOMS[i] })); }}
              fieldLines={['smallest', 'note']}
              debugMode={debugMode}
            />
          </g>
        );
      })}

      {/* CHORDS balk — passing-chords toggle set (behaviour preserved, restyled). */}
      {showChordsRow && (
        <PassingChordsFan
          cx={cols[2]} centerY={CHORD_ROW_Y}
          enabled={chordSettings?.passingChordTypes ?? []}
          activeIndex={passingPos}
          setPassingPos={setPassingPos}
          onToggle={(i) => {
            fireInteraction();
            const ct = PASSING_CHORD_TYPES[i];
            const prev = chordSettings?.passingChordTypes ?? [];
            const next = prev.includes(ct.key) ? prev.filter(k => k !== ct.key) : [...prev, ct.key];
            setChordSettings(p => ({ ...p, passingChordTypes: next }));
          }}
          debugMode={debugMode}
        />
      )}
    </g>
  );
};

export default GenerationAdvancedSetterOverlay;
