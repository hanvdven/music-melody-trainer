import React from 'react';
import '../SheetMusic.css';
import { useInstrumentSettings } from '../../../contexts/InstrumentSettingsContext';
import {
  RHYTHM_VARIABILITY,
  LEAP_OPTIONS,
  POLY_LEVELS,
  SMALLEST_NOTE_DENOMS,
  PASSING_CHORD_TYPES,
} from '../../../constants/generationFields';
// §6d — canonical renderers / curve math, NEVER hand-rolled here:
import { LeftFanCarousel, DragBand, FieldLabel, FAN_LABEL_FONT, FAN_ACTIVE_LABEL_SIZE, FAN_ROW_H, FAN_PX_PER_STEP } from './fanCarousels';
import { StaffQuarterNote, StaffMelodyNote } from '../staffNoteGlyph';
import { getNoteFromValue } from '../../../utils/rangeUtils';
import { getNoteAbsoluteY } from '../renderMelodyNotes';
import { curveX, curveY, leftCurveX, X_SPACING, useTangensDrag } from './tangensCurve';

// ── GENERATION ADVANCED setter — IN-STAFF MAESTRO / TANGENS STYLE (Han 2026-06-26, #162) ──────────
// REPLACES the previous Lucide-icon NonLinearCarousel version. Every field is an in-staff "tangens"
// carousel built from the SAME fan curve + drag mechanics the TranspositionSetter uses
// (tangensCurve.js — §6d single source of truth).
//
//   span         → RIGHT-fan NOTEHEAD carousel: discrete SPAN_OPTIONS (≥5th) rendered as real staff
//                  heads (StaffQuarterNote) at C4 ± the interval (treble ascending, bass descending),
//                  with a FIXED C4 anchor head at the left. ∞ = serif infinity glyph drawn at the
//                  15th's pitch (the top of the fan). Melodic only (N/A for percussion).
//   variability  → LEFT-fan NUMERIC carousel: RHYTHM_VARIABILITY 0..100 in steps of 10.
//   tuplets      → RIGHT-fan WORD carousel: POLY_LEVELS none..xtreme (Han UAT: tuplets fan
//                  LEFT-to-RIGHT — i.e. the notehead-style RIGHT fan direction — with a smaller font).
//   smallest note→ FLAT tangens carousel of REAL melody notes (StaffMelodyNote — head+stem+flag+dot,
//                  the existing melody-note renderer, Han UAT 2026-06-27 "gebruik bestaande melody-note
//                  functie"), all anchored on the staff middle line (B4 treble / D3 bass); only X fans.
//   CHORDS balk  → passing-chords TOGGLE-SET (chordSettings.passingChordTypes).
//
// CONSISTENCY WITH TranspositionSetter (Han UAT 2026-06-27 "ernstige zorgen over consistentie"):
//   - Span heads use the SAME StaffQuarterNote + curveX/curveY fan, the SAME ledger geometry, and the
//     SAME `data-fly` note-by-note slide-in as the TranspositionSetter's right carousel.
//   - LEAP/span option order is NATURAL ASCENDING [5th, …, 15th, ∞] — NO flip (Han UAT 2026-06-27:
//     "de span is nu ook geflipt voor treble — ongevraagd"). Each head sits at its TRUE staff Y, so
//     treble ascends from C4 / bass descends — clef-correct, never a list reversal.
//   - ONLY the active/centre interval name is labelled (Han UAT: "toon alleen de naam van de gekozen
//     afstand"), BELOW the staff for treble / ABOVE for bass.
//
// WIRING IS UNCHANGED vs the old overlay: each setter writes the SAME InstrumentSettings field via
// the SAME setState path. The PROPS CONTRACT is identical (zero call-site change in SheetMusic.jsx).

// ── Typography / layout constants (§6d: in-staff LABELS are serif, never Maestro) ────────────────
const LABEL_FONT = FAN_LABEL_FONT;   // shared with fanCarousels (§6d)
const ACTIVE_LABEL_SIZE = FAN_ACTIVE_LABEL_SIZE;   // shared with fanCarousels (§6d)
const TUPLET_LABEL_SIZE = 15;   // tuplet words read smaller (Han UAT: "veel te groot lettertype")
const ROW_H = FAN_ROW_H;               // shared with fanCarousels (§6d)
const INTERVAL_LABEL_SIZE = 11; // serif interval name above/below each span head
const FIELD_LABEL_SIZE = 11;    // field name below the staff
const HEADER_Y_DROP = 89;       // column header sits trebleStart − 89 (kept from old overlay)
const PX_PER_STEP = FAN_PX_PER_STEP;   // shared with fanCarousels (§6d)
const SPAN_X_SPACING = 18;      // span/smallest-note horizontal fan spacing — TIGHTER than the
                                // transposition X_SPACING=30 (Han UAT: "afstand tussen noten is groter").
const C4_MIDI = 60;

const COLOR = 'var(--text-primary)';
const LOW = 'var(--text-lowlight)';
const SECONDARY = 'var(--text-secondary)';

// Column anchors across the staff width (variability | span | tuplets | smallest note).
const COL_FRACS = [0.16, 0.42, 0.64, 0.87];

// SPAN options: discrete intervals from the SSOT LEAP_OPTIONS, constrained to a minimum of a 5th
// (≥7 semitones — a 5th now EXISTS in LEAP_OPTIONS, added #162) plus the ∞ (value null) entry.
// NATURAL ASCENDING order — NO reverse (Han UAT 2026-06-27: "de span is nu ook geflipt voor treble
// — ongevraagd"). Index increases with interval size; each head is placed at its TRUE staff Y via
// getNoteAbsoluteY, so treble heads ascend from C4 and bass heads descend — clef-correct, never a
// list flip. §6c: derived from the shared array by filter, never a forked hand-written table.
const SPAN_OPTIONS = LEAP_OPTIONS.filter(o => o.value == null || o.value >= 7);

// smallest-note denom → VISUAL DURATION in ticks (the value StaffMelodyNote / the renderer's glyph
// maps are keyed on). 16th=3, 8th=6, quarter=12, half=24, whole=48. Derived arithmetically from the
// denom (48 ticks = whole) — §6c, not a hand-written table.
const denomToTicks = (denom) => 48 / denom;

// Maestro accidental glyph for a (Unicode-spelled) note name — same mapping the TranspositionSetter
// uses for its span heads. '#'/'b' here are MAESTRO FONT GLYPH chars, not display text, so §5b's
// "no ASCII b/#" rule does not apply (the rule is about user-visible TEXT, not font codepoints).
// #361: diatonic note name `steps` scale-steps from C4 (naturals only — the
// span setter shows INTERVALS; the major/perfect variant from C is natural).
const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const diatonicFromC4 = (steps) => {
  const idx = ((steps % 7) + 7) % 7;
  const oct = 4 + Math.floor(steps / 7);
  return NATURALS[idx] + oct;
};

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
// SMALLEST_NOTE_DENOMS) or `{ value, label }` objects (SPAN_OPTIONS, POLY_LEVELS). We must NOT use
// `it.value ?? it` to extract the value: the ∞ span entry is `{ value: null }`, and `null ?? it`
// would yield the object, so a stored maxLeap=null (∞) would never match → defaulted to index 0.
const optValue = (it) => (it != null && typeof it === 'object' && 'value' in it ? it.value : it);
const idxOf = (items, value) => {
  const i = items.findIndex(it => optValue(it) === value);
  return i === -1 ? 0 : i;
};

// FieldLabel / DragBand / LeftFanCarousel moved to ./fanCarousels.jsx (#300/#302
// extraction, §6d) — the PLAYBACK setter's volume + measures fans share them.

// ── HORIZONTAL WORD carousel (tuplets) — low LEFT-down → xtreme RIGHT-up ───────────────────────────
// Han UAT 2026-06-27: "tuplet, ik wil de x inverteren, dus ik wil low 'linksonder' en 'xtreme'
// rechtsboven." So a higher value (higher index) fans to the RIGHT and slightly UP, a lower value to
// the LEFT and slightly DOWN — the INVERSE X of the notehead RIGHT-fan. We negate curveX (higher
// index → +x → RIGHT) and use curveY so higher index fans up. Smaller font (Han UAT earlier).
const TupletWordFanCarousel = ({ cx, centerY, items, activeIndex, onCommit, renderLabel, fieldLines, debugMode }) => {
  const { effIndex, dragging, bind } = useTangensDrag(activeIndex, items.length - 1, onCommit, PX_PER_STEP, 1);
  const rowsOut = [];
  for (let i = Math.floor(effIndex) - 4; i <= Math.ceil(effIndex) + 4; i++) {
    if (i < 0 || i > items.length - 1) continue;
    const t = i - effIndex;                    // t>0 = higher value → fans RIGHT + UP
    const isActive = i === Math.round(effIndex);
    const dist = Math.abs(t);
    // INVERTED X (Han UAT): negate curveX so higher index reads to the RIGHT; curveY fans higher
    // index UP → "xtreme rechtsboven", "low linksonder".
    const nx = cx - curveX(t) * (SPAN_X_SPACING / X_SPACING);
    const ry = centerY + 6 + curveY(t);
    const size = Math.max(7, TUPLET_LABEL_SIZE - dist * 1.6);
    const op = Math.max(0.18, (isActive ? 1 : 0.8) - dist * 0.12);
    rowsOut.push(
      <text key={i} data-fly="" x={nx} y={ry} textAnchor="middle" fontFamily={LABEL_FONT} fontSize={size}
        fill={isActive ? COLOR : LOW} opacity={op} style={{ pointerEvents: 'none' }}>
        {renderLabel(items[i])}
      </text>,
    );
  }
  const bandH = dragging ? 150 : 110;
  const bandTop = centerY + 6 - bandH / 2;
  const bandW = 6 * SPAN_X_SPACING + 24;
  return (
    <g>
      {rowsOut}
      <DragBand x={cx - bandW / 2} y={bandTop} w={bandW} h={bandH} bind={bind} debugMode={debugMode} />
      <FieldLabel cx={cx} topY={centerY + 50} lines={fieldLines} />
    </g>
  );
};

// ── SPAN — RIGHT-fan notehead carousel of SPAN_OPTIONS, with a fixed C4 anchor head ───────────────
// Heads are real StaffQuarterNote glyphs at C4 ± interval (treble ascending, bass descending), fanned
// on the tangens curve (curveX/curveY) exactly like TranspositionSetter's right carousel. A FIXED C4
// reference head sits at the left (Han UAT: "ik mis de gerenderde C4 noot"). ∞ (value null) renders a
// serif infinity glyph at the 15th's pitch (top of the fan). Interval NAME sits BELOW the staff for
// treble / ABOVE for bass (Han UAT). Heads carry data-fly so they slide in note-by-note (consistency).
const SpanFanCarousel = ({ cx, staffStart, clef, staff, ascending, activeIndex, onCommit, debugMode }) => {
  // #162 rework (Han 2026-07-02): the setter is CLEF-dependent, not staff-dependent.
  // ascending (treble/vocal clefs): intervals rise from C4; the fixed C4 sits DIRECTLY
  // UNDER the selected note (same x = the fan centre) and the interval name reads ABOVE.
  // descending (bass clef): mirrored — C4 directly ABOVE the selected note, name BELOW,
  // and the fan direction REVERSES ("de noten gaan van laag naar hoog in plaats van
  // andersom"): larger (lower-pitched) intervals fan LEFT so left→right stays low→high.
  const dir = ascending ? 1 : -1;   // X-fan LAYOUT direction (clef-dependent)
  // #434 (Han: intuitive invert like measures — drag DOWN always raises the span, both clefs; this
  // was inconsistent before, ascending was up=increase). DRAG sign is decoupled from the layout dir.
  const { effIndex, dragging, bind } = useTangensDrag(activeIndex, SPAN_OPTIONS.length - 1, onCommit, PX_PER_STEP, -1);
  const labelY = ascending ? staffStart - 18 : staffStart + 64;
  const bandW = 6 * SPAN_X_SPACING + 24;
  // Fixed C4 anchor on the fan CENTRE axis — the selected head lands at cx, so the
  // pair reads vertically: name / selected note / C4 (treble) or C4 / note / name (bass).
  const anchorX = cx;
  const c4Y = getNoteAbsoluteY('C4', staffStart, clef, staff);
  // The ∞ entry draws where the 15th head would be (top of the fan). Resolve the 15th's pitch once
  // so ∞ aligns with it (Han UAT: "infinity mag op dezelfde hoogte als de 15th").
  const fifteenth = LEAP_OPTIONS.find(o => o.label === '15th');
  const infMidi = C4_MIDI + (ascending ? fifteenth.value : -fifteenth.value);
  const infBaseY = getNoteAbsoluteY(getNoteFromValue(infMidi), staffStart, clef, staff);
  const activeIdxRounded = Math.round(effIndex);

  const out = [];
  for (let i = Math.floor(effIndex) - 5; i <= Math.ceil(effIndex) + 5; i++) {
    if (i < 0 || i > SPAN_OPTIONS.length - 1) continue;
    const opt = SPAN_OPTIONS[i];
    const t = i - effIndex;
    const isActive = i === activeIdxRounded;
    // #434 (Han: "maak die carousels ook hidden") — compact: only the active head at rest.
    if (!dragging && !isActive) continue;
    const dist = Math.abs(t);
    const op = Math.max(0.15, (isActive ? 1 : 0.7) - dist * 0.1);
    const fill = isActive ? COLOR : LOW;
    const x = cx + dir * curveX(t) * (SPAN_X_SPACING / X_SPACING);
    if (opt.value == null) {
      // ∞ entry: serif infinity char at the 15th's pitch (top of the fan), fanned with the rest.
      if (infBaseY == null) continue;
      const y = infBaseY + curveY(t);
      out.push(
        <g key={i} data-fly="">
          <text x={x} y={y + 8} textAnchor="middle" fontFamily={LABEL_FONT} fontSize={22}
            fill={fill} opacity={op} style={{ pointerEvents: 'none' }}>∞</text>
        </g>,
      );
    } else {
      // #361 (Han): intervals, not exact pitches — "ga altijd uit van de grote
      // variant", no accidentals. The MAJOR/PERFECT variant of every interval
      // from C4 is a NATURAL (E, F, G, A, B, C…), so the head is placed
      // DIATONICALLY from the interval NAME (3rd → 2 steps, … 15th → 14) and
      // never carries an accidental glyph.
      const steps = (parseInt(opt.label, 10) || 1) - 1;
      const name = diatonicFromC4(ascending ? steps : -steps);
      const originY = getNoteAbsoluteY(name, staffStart, clef, staff);
      if (originY == null) continue;
      // #361: on a BASS clef the heads read left→right high→low, so the fan's
      // Y-curve inverts with the direction (same dir that mirrors the X-fan).
      const y = originY + dir * curveY(t);
      const scale = Math.max(0.5, 1 - dist * 0.09);
      out.push(
        // data-fly OUTER wrapper so the cascade's translateX slides the head in without clobbering the
        // inner scale transform — same pattern as TranspositionSetter (consistency).
        <g key={i} data-fly="">
          <g opacity={op}
            transform={`translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`}>
            <StaffQuarterNote x={x} positionY={y} staffYStart={staffStart}
              ledgerYs={dist < 1.5 ? ledgerYs(y, staffStart) : []} color={fill} />
          </g>
        </g>,
      );
    }
    // Interval-name label: ONLY for the ACTIVE/centre option (Han UAT: "toon alleen de naam van de
    // gekozen afstand" — no per-head label spam).
    if (isActive) {
      out.push(
        <text key={`lbl-${i}`} x={cx} y={labelY} textAnchor="middle" fontFamily={LABEL_FONT}
          fontSize={INTERVAL_LABEL_SIZE} fill={SECONDARY} style={{ pointerEvents: 'none' }}>
          {opt.label}
        </text>,
      );
    }
  }
  const bandH = dragging ? 150 : 110;
  const bandTop = staffStart + 20 + 6 - bandH / 2;
  return (
    <g>
      {/* Fixed C4 reference head (anchor) — clamped on screen; the interval reads "C4 → target". */}
      {c4Y != null && (
        <g data-fly="">
          <StaffQuarterNote x={anchorX} positionY={c4Y} staffYStart={staffStart}
            ledgerYs={ledgerYs(c4Y, staffStart)} color={COLOR} />
        </g>
      )}
      {out}
      <DragBand x={cx - bandW / 2} y={bandTop} w={bandW} h={bandH} bind={bind} debugMode={debugMode} />
    </g>
  );
};

// ── SMALLEST NOTE — FLAT tangens carousel of REAL melody notes ────────────────────────────────────
// Renders each duration as a FULL melody note (head+stem+flag+dot via StaffMelodyNote — the existing
// melody-note renderer, Han UAT 2026-06-27: "gebruik bestaande melody-note functie (zoals in de color
// setter carousel)"), NOT a single Maestro glyph. All notes sit on the staff's MIDDLE LINE — only
// the X fans (Han UAT: "smallest note staan niet allemaal op b4 hoogte").
// #362 (Han: "percussie smallest-note staat te hoog"): the anchor was resolved via a note name
// (B4/D3) through getNoteAbsoluteY, and the percussion clef's mapping put that note ABOVE the middle
// line. The anchor IS the middle line by definition, so derive it from staffStart directly (§6c) —
// clef-independent, and it lets the CHORDS balk host this fan on a virtual staff too.
// Active note full size; neighbours shrink + dim. Durations (ticks) derived from SMALLEST_NOTE_DENOMS.
const SmallestNoteFanCarousel = ({ cx, staffStart, activeIndex, onCommit, fieldLines, debugMode }) => {
  // #434 (Han: intuitive invert like measures — drag DOWN raises the index).
  const { effIndex, dragging, bind } = useTangensDrag(activeIndex, SMALLEST_NOTE_DENOMS.length - 1, onCommit, PX_PER_STEP, -1);
  const anchorY = staffStart + 20; // middle of the five 10-unit-spaced staff lines
  const out = [];
  for (let i = Math.floor(effIndex) - 4; i <= Math.ceil(effIndex) + 4; i++) {
    if (i < 0 || i > SMALLEST_NOTE_DENOMS.length - 1) continue;
    const denom = SMALLEST_NOTE_DENOMS[i];
    const t = i - effIndex;
    const isActive = i === Math.round(effIndex);
    // #434 (Han: "maak die carousels ook hidden") — compact: at rest only the active note shows;
    // the fan opens under the finger while dragging.
    if (!dragging && !isActive) continue;
    const dist = Math.abs(t);
    const op = Math.max(0.15, (isActive ? 1 : 0.7) - dist * 0.1);
    const x = cx + curveX(t) * (SPAN_X_SPACING / X_SPACING);
    const y = anchorY;   // FLAT — all notes on the middle line (Han UAT)
    const scale = Math.max(0.5, 1 - dist * 0.09);
    out.push(
      <g key={i} data-fly="">
        <StaffMelodyNote visualDuration={denomToTicks(denom)} x={x} positionY={y}
          staffYStart={staffStart} color={isActive ? COLOR : LOW} opacity={op} scale={scale} />
        {/* #434 (Han: "voeg labels toe; 1/4, 1/8, etc.") — the duration name below the note. */}
        <text x={x} y={staffStart + 56} textAnchor="middle" fontFamily="sans-serif" fontSize={10}
          fill={isActive ? COLOR : LOW} opacity={op} style={{ pointerEvents: 'none' }}>
          {`1/${denom}`}
        </text>
      </g>,
    );
  }
  const bandH = dragging ? 150 : 110;
  const bandTop = anchorY - bandH / 2;
  const bandW = 6 * SPAN_X_SPACING + 24;
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
  // #434 (Han: intuitive invert like measures — drag DOWN advances the centred type).
  const { effIndex, dragging, bind } = useTangensDrag(
    activeIndex, PASSING_CHORD_TYPES.length - 1, (i) => setPassingPos(i), PX_PER_STEP, -1,
  );
  const rowsOut = [];
  for (let i = Math.floor(effIndex) - 4; i <= Math.ceil(effIndex) + 4; i++) {
    if (i < 0 || i > PASSING_CHORD_TYPES.length - 1) continue;
    const ct = PASSING_CHORD_TYPES[i];
    const off = i - effIndex;
    const isActive = i === Math.round(effIndex);
    // #434 (Han: "maak die carousels ook hidden") — compact: only the centred type at rest; the
    // fan opens under the finger while dragging. Tap the centred type to toggle it on/off.
    if (!dragging && !isActive) continue;
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
  // NOTE: the former `showChordsRow` prop is intentionally NOT destructured/used anymore — the
  // passing-chords toggle is DECOUPLED from it (Han UAT 2026-06-27) and always renders. The caller
  // may still pass it; it is simply ignored.
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
    { key: 'treble', clef: 'treble', staff: 'treble', centerY: trebleStart + 20, staffStart: trebleStart, show: isTrebleVisible },
    { key: 'bass', clef: 'bass', staff: 'bass', centerY: bassStart + 20, staffStart: bassStart, show: isBassVisible },
    { key: 'percussion', clef: 'percussion', staff: 'percussion', centerY: percussionStart + 20, staffStart: percussionStart, show: isPercussionVisible },
  ].filter(r => r.show);

  // #162 rework: the row's REAL clef comes from its instrument settings (falling
  // back to the staff default); 'off' keeps the default so positions stay sane.
  const spanClefFor = (row, cfg) => {
    const c = cfg?.clef;
    return c && c !== 'off' ? c : row.clef;
  };
  // Bass FAMILY (bass, bass8vb, …, baritone-f) descends from C4; treble + vocal
  // clefs ascend (Han: "sleutel-afhankelijk (viool/zang/bas)").
  const isBassFamilyClef = (clef) => /^bass/.test(String(clef)) || String(clef) === 'baritone-f';

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
              /* #361 (Han): "gebruik dezelfde setter als voor volume, dus hidden
                 vertical carousel" — fan only under the finger. #434: intuitive invert (drag DOWN
                 raises) like measures, and a % sign after the number. */
              compact
              invert
              activeIndex={variabilityIdx}
              onCommit={(i) => { fireInteraction(); set(p => ({ ...p, rhythmVariability: RHYTHM_VARIABILITY[i] })); }}
              renderLabel={(v) => `${v} %`}
              fieldLines={[]} /* header 'variability' + the centred number suffice (Han UAT: redundant) */
              debugMode={debugMode}
            />

            {!isPerc && (
              <SpanFanCarousel
                cx={cols[1]} staffStart={row.staffStart} clef={spanClefFor(row, cfg)} staff={row.staff}
                /* #162 rework (Han): CLEF-dependent, not staff-dependent — a treble
                   staff set to a bass clef behaves like bass, and vocal clefs like
                   treble. */
                ascending={!isBassFamilyClef(spanClefFor(row, cfg))}
                activeIndex={idxOf(SPAN_OPTIONS, cfg?.maxLeap ?? null)}
                onCommit={(i) => { fireInteraction(); set(p => ({ ...p, maxLeap: SPAN_OPTIONS[i].value })); }}
                debugMode={debugMode}
              />
            )}

            {/* #361 (Han): "gebruik geen tanh setter, maar een hidden vertical
                carousel" — the tuplet word fans vertically under the finger only,
                which also clears the passing-chords label conflict. */}
            <LeftFanCarousel
              cx={cols[2]} centerY={row.centerY}
              items={POLY_LEVELS}
              compact
              invert
              activeIndex={polyIdx}
              onCommit={(i) => { fireInteraction(); set(p => ({ ...p, polyMultiplier: POLY_LEVELS[i].value })); }}
              renderLabel={(it) => it.label}
              activeLabelSize={15}
              fieldLines={[]}
              debugMode={debugMode}
            />

            <SmallestNoteFanCarousel
              cx={cols[3]} staffStart={row.staffStart}
              activeIndex={idxOf(SMALLEST_NOTE_DENOMS, cfg?.smallestNoteDenom ?? 4)}
              onCommit={(i) => { fireInteraction(); set(p => ({ ...p, smallestNoteDenom: SMALLEST_NOTE_DENOMS[i] })); }}
              fieldLines={[]} /* header 'smallest note' suffices (Han UAT: redundant) */
              debugMode={debugMode}
            />
          </g>
        );
      })}

      {/* CHORDS balk — passing-chords toggle set. DECOUPLED from showChordsRow (Han UAT 2026-06-27
          "ik zie geen instellingen voor de akkoorden"): the row was gated on showChordsRow, which is
          usually FALSE in generation-advanced edit mode, so the whole chord setter vanished. The
          passing-chords toggle is part of THIS overlay's contract, so it renders whenever the overlay
          is mounted. */}
      {/* #362 (Han): the chords balk gets its own VARIABILITY + SMALLEST NOTE —
          the same fans as the melodic rows (they sit under the same column
          headers), writing chordSettings.rhythmVariability /.smallestNoteDenom
          (both consumed by the chord generation in useMelodyState + Sequencer). */}
      <LeftFanCarousel
        cx={cols[0]} centerY={CHORD_ROW_Y}
        items={RHYTHM_VARIABILITY}
        compact
        invert
        activeIndex={idxOf(RHYTHM_VARIABILITY, chordSettings?.rhythmVariability ?? 0)}
        onCommit={(i) => { fireInteraction(); setChordSettings(p => ({ ...p, rhythmVariability: RHYTHM_VARIABILITY[i] })); }}
        renderLabel={(v) => `${v} %`}
        fieldLines={[]}
        debugMode={debugMode}
      />
      <SmallestNoteFanCarousel
        /* No real staff on the chords row — anchor on a VIRTUAL staff whose
           middle line is the row's note line (CHORD_ROW_Y − 6), same trick as
           the complexity stack in the GENERATION setter. */
        cx={cols[3]} staffStart={CHORD_ROW_Y - 26}
        activeIndex={idxOf(SMALLEST_NOTE_DENOMS, chordSettings?.smallestNoteDenom ?? 4)}
        onCommit={(i) => { fireInteraction(); setChordSettings(p => ({ ...p, smallestNoteDenom: SMALLEST_NOTE_DENOMS[i] })); }}
        fieldLines={[]}
        debugMode={debugMode}
      />
      {(
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
