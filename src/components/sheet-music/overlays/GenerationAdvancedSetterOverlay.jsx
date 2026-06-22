import React from 'react';
import SvgSetter from '../SvgSetter';
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

// ── GENERATION ADVANCED setter (Han 2026-06-22) ──────────────────────────────────────────────
// Sibling of the GENERATION setter. For each VISIBLE balk (treble / bass / percussion + CHORDS) it
// draws a row of SvgSetter steppers, one column per advanced field:
//   col 1 "variability"   → rhythmVariability (RHYTHM_VARIABILITY, '%' suffix)
//   col 2 "span"          → maxLeap (LEAP_OPTIONS; null = ∞) — melodic only (N/A for perc/chords)
//   col 3 "tuplets"       → polyMultiplier (POLY_LEVELS) — melodic/perc
//   col 4 "smallest note" → smallestNoteDenom (Maestro glyphs) — melodic/perc
//
// CHORDS balk: only the "passing chords" control is meaningful. PROVISIONAL (flag for Han): it is
// placed in the "tuplets" column position as a single SvgSetter that CYCLES which passing-chord type
// is shown; tapping the value TOGGLES that type in chordSettings.passingChordTypes. The other
// advanced columns are blank for the chords balk (variability / span / smallest-note are N/A).
//
// All option arrays/labels are imported from src/constants/generationFields.js (§6d — single source
// of truth, shared with the bottom-view InstrumentRow.jsx). SvgSetter is reused for every stepper.

const cycle = (values, current, dir) => {
  const idx = values.indexOf(current);
  const base = idx === -1 ? 0 : idx;
  const next = dir === 'up'
    ? (base + 1) % values.length
    : (base - 1 + values.length) % values.length;
  return values[next];
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
  // For the CHORDS balk, track which passing-chord type the single cycler is currently showing.
  // Local UI state only — the chord settings themselves hold the enabled SET (passingChordTypes).
  // MUST be declared before any early return (rules-of-hooks).
  const [passingIdx, setPassingIdx] = React.useState(0);
  if (startX == null || endX == null) return null;

  // Four columns spread across the staff width.
  const span = endX - startX;
  const col1 = startX + 0.20 * span;
  const col2 = startX + 0.45 * span;
  const col3 = startX + 0.68 * span;
  const col4 = startX + 0.90 * span;
  const COLS = [
    { x: col1, header: 'variability' },
    { x: col2, header: 'span' },
    { x: col3, header: 'tuplets' },
    { x: col4, header: 'smallest note' },
  ];

  const HEADER_Y = trebleStart - 89;
  const CHORD_ROW_Y = trebleStart - 64;

  const rows = [
    { key: 'chords', centerY: CHORD_ROW_Y, show: showChordsRow, isChords: true },
    { key: 'treble', centerY: trebleStart + 20, show: isTrebleVisible },
    { key: 'bass', centerY: bassStart + 20, show: isBassVisible },
    { key: 'percussion', centerY: percussionStart + 20, show: isPercussionVisible },
  ].filter(r => r.show);

  const cellFor = (row, colIdx) => {
    if (row.isChords) {
      // Only the tuplets-position column carries the passing-chord cycler/toggle (provisional).
      if (colIdx !== 2) return null;
      const enabled = chordSettings?.passingChordTypes ?? [];
      const type = PASSING_CHORD_TYPES[passingIdx];
      const isOn = enabled.includes(type.key);
      // Show the type label; an active type is brightened by appending a check-like marker is avoided
      // (keep it tidy) — instead the value font weight conveys nothing; tap toggles. The label text
      // itself is the type symbol. onIncrement/onDecrement cycle WHICH type is shown.
      return {
        value: type.label, family: 'serif', size: 13,
        dim: !isOn, // dim when the shown type is currently disabled
        set: (dir) => setPassingIdx(i => (i + (dir === 'up' ? 1 : -1) + PASSING_CHORD_TYPES.length) % PASSING_CHORD_TYPES.length),
        toggle: () => {
          const prev = chordSettings?.passingChordTypes ?? [];
          const next = isOn ? prev.filter(t => t !== type.key) : [...prev, type.key];
          setChordSettings(p => ({ ...p, passingChordTypes: next }));
        },
      };
    }

    const set = row.key === 'treble' ? setTrebleSettings
      : row.key === 'bass' ? setBassSettings : setPercussionSettings;
    const cfg = row.key === 'treble' ? trebleSettings
      : row.key === 'bass' ? bassSettings : percussionSettings;
    const isPerc = row.key === 'percussion';

    if (colIdx === 0) {
      // variability → rhythmVariability, '%' suffix
      const cur = cfg?.rhythmVariability || 0;
      return {
        value: `${cur}%`, family: 'serif', size: 16,
        set: (dir) => set(p => ({ ...p, rhythmVariability: cycle(RHYTHM_VARIABILITY, cur, dir) })),
      };
    }
    if (colIdx === 1) {
      // span → maxLeap (melodic only; N/A for percussion)
      if (isPerc) return null;
      const vals = LEAP_OPTIONS.map(o => o.value);
      const cur = cfg?.maxLeap ?? null;
      const label = LEAP_OPTIONS.find(o => o.value === cur)?.label ?? '∞';
      return {
        value: label, family: 'serif', size: 13,
        set: (dir) => set(p => ({ ...p, maxLeap: cycle(vals, cur, dir) })),
      };
    }
    if (colIdx === 2) {
      // tuplets → polyMultiplier
      const vals = POLY_LEVELS.map(o => o.value);
      const cur = cfg?.polyMultiplier ?? 1;
      const label = POLY_LEVELS.find(o => o.value === cur)?.label ?? 'none';
      return {
        value: label, family: 'serif', size: 13,
        set: (dir) => set(p => ({ ...p, polyMultiplier: cycle(vals, cur, dir) })),
      };
    }
    // smallest note → smallestNoteDenom, rendered as a Maestro glyph (§6d — reuse the glyph map).
    const cur = cfg?.smallestNoteDenom || 4;
    const glyph = SMALLEST_NOTE_GLYPHS[cur] || 'q';
    return {
      value: glyph, family: 'Maestro', size: 28,
      set: (dir) => set(p => ({ ...p, smallestNoteDenom: cycle(SMALLEST_NOTE_DENOMS, cur, dir) })),
    };
  };

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
      {COLS.map((c, i) => (
        <text key={`hdr-${i}`} x={c.x} y={HEADER_Y} textAnchor="middle"
          fontFamily="serif" fontStyle="italic" fontSize={14} fill="var(--text-secondary)"
          style={{ userSelect: 'none', pointerEvents: 'none' }}>{c.header}</text>
      ))}

      {/* Discreet header for the chords passing-chord cell so its meaning is clear. */}
      {showChordsRow && (
        <text x={col3} y={CHORD_ROW_Y - 24} textAnchor="middle"
          fontFamily="serif" fontStyle="italic" fontSize={11} fill="var(--text-secondary)"
          style={{ userSelect: 'none', pointerEvents: 'none', opacity: 0.85 }}>passing chords</text>
      )}

      {rows.map(row => (
        <g key={row.key}>
          {COLS.map((c, colIdx) => {
            const cell = cellFor(row, colIdx);
            if (!cell) return null;
            return (
              <g key={`${row.key}-${colIdx}`} data-fly style={cell.dim ? { opacity: 0.4 } : undefined}>
                <SvgSetter
                  x={c.x}
                  y={row.centerY}
                  value={cell.value}
                  valueFontFamily={cell.family}
                  valueFontSize={cell.size}
                  valueDy={-3}
                  showLabel={false}
                  onDecrement={() => cell.set('down')}
                  onIncrement={() => cell.set('up')}
                  // For the chords passing-chord cell a value-tap TOGGLES the shown type; for every
                  // other cell it advances the value (mirrors GenerationSetterOverlay).
                  onValueClick={() => (cell.toggle ? cell.toggle() : cell.set('up'))}
                  onInteraction={onSettingsInteraction}
                />
                {/* §3a: debug hit box matching the SvgSetter hit window. */}
                {debugMode && (
                  <rect x={c.x - 40} y={row.centerY - 28} width={80} height={36}
                    fill="orange" fillOpacity={0.25} stroke="orange" strokeWidth={1}
                    style={{ pointerEvents: 'none' }} />
                )}
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
};

export default GenerationAdvancedSetterOverlay;
