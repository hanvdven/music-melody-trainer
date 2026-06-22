import React from 'react';
import SvgSetter from '../SvgSetter';
import '../SheetMusic.css';
import { useInstrumentSettings } from '../../../contexts/InstrumentSettingsContext';
import { getNoteSourceLabel, getProgressionLabel, getPlayStyleLabel } from '../../../utils/labelUtils';
import {
  MELODIC_NOTE_POOLS,
  PERC_POOL_PRESETS,
  NOTES_PER_MEASURE,
  CHORD_COMPLEXITY,
  CHORD_STRATEGIES,
  CHORD_COUNTS,
} from '../../../constants/generationFields';
import { RULE_FAMILIES, PERC_FAMILIES } from '../../../constants/instrumentRules';
import { PERCUSSION_PRESETS } from '../../../audio/drumKits';

// ── Play-style cycling (col 2, melodic/perc) ─────────────────────────────────────────────────
// The bottom-view "melody type" is two controls (a family icon + a within-family stepper). For the
// in-sheet setter Han asked for a SINGLE stepper, so we cycle the FLAT list of rules the bottom view
// can land on for this instrument type — every value reachable below is reachable here too (§6d).
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
const cyclePlayStyle = (current, dir, isPerc) => {
  const ring = isPerc ? PERC_RULE_RING : MELODIC_RULE_RING;
  const idx = ring.indexOf(current);
  const base = idx === -1 ? 0 : idx;
  const next = dir === 'up'
    ? (base + 1) % ring.length
    : (base - 1 + ring.length) % ring.length;
  return ring[next];
};

// ── GENERATION setter (Han 2026-06-22) ───────────────────────────────────────────────────────
// An in-sheet-music sibling of the range/clef/colour/instrument/legacy-settings overlays. For each
// VISIBLE "balk" (= row/staff: treble / bass / percussion, plus a CHORDS balk) it draws a row of
// SvgSetter steppers — one column per generation field:
//   col 1 "melody notes"      → treble/bass.notePool · percussion.enabledPads preset · chords.complexity
//   col 2 "melody type"       → treble/bass.randomizationRule (play-style) · chords.strategy (progression)
//   col 3 "notes per measure" → treble/bass/percussion.notesPerMeasure · chords.chordCount
//
// All option arrays/labels are imported from src/constants/generationFields.js so this overlay and
// the bottom-view InstrumentRow.jsx share ONE source of truth (§6d). SvgSetter is reused for every
// stepper (§6c/§6d — never hand-roll the stepper chrome). Cycling walks each field's value list.
//
// PROVISIONAL: the CHORDS-balk mapping is Han's first-pass spec — flag for confirmation.

// Generic helper: find the index of `value` in an array of {value} (or raw value array), defaulting
// to 0 when absent, and return the next/prev value (wrapping).
const cycle = (values, current, dir) => {
  const idx = values.indexOf(current);
  const base = idx === -1 ? 0 : idx;
  const next = dir === 'up'
    ? (base + 1) % values.length
    : (base - 1 + values.length) % values.length;
  return values[next];
};

// Match the current enabledPads array to a preset NAME (mirrors RuleSelector.sameSet fallback).
const sameSet = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const s = new Set(a);
  return b.every(x => s.has(x));
};
const percPresetName = (enabledPads) =>
  PERC_POOL_PRESETS.map(p => p.value).find(n => sameSet(enabledPads, PERCUSSION_PRESETS[n])) || 'STANDARD';

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

  // Three columns spread across the staff width (mirrors SettingsOverlay's oddCol/evenCol idea).
  const span = endX - startX;
  const col1 = startX + 0.25 * span;
  const col2 = startX + 0.55 * span;
  const col3 = startX + 0.85 * span;
  const COLS = [
    { x: col1, header: 'melody notes' },
    { x: col2, header: 'melody type' },
    { x: col3, header: 'notes / measure' },
  ];

  // Shared Y constants borrowed from SettingsOverlay so this overlay aligns with the legacy one.
  const HEADER_Y = trebleStart - 89;
  const CHORD_ROW_Y = trebleStart - 64;

  // Per-balk rows: same anchors + visibility gating SettingsOverlay uses (chords above the staff,
  // melodic rows centred at staffTop+20). The CHORDS balk renders only when its row is visible.
  const rows = [
    { key: 'chords', centerY: CHORD_ROW_Y, show: showChordsRow, isChords: true },
    { key: 'treble', centerY: trebleStart + 20, show: isTrebleVisible },
    { key: 'bass', centerY: bassStart + 20, show: isBassVisible },
    { key: 'percussion', centerY: percussionStart + 20, show: isPercussionVisible },
  ].filter(r => r.show);

  // Build the {value, onIncrement, onDecrement, valueFontFamily?, valueFontSize?} descriptor for one
  // (row, columnIndex) cell. Returns null when the field is N/A for that balk.
  const cellFor = (row, colIdx) => {
    if (row.isChords) {
      if (colIdx === 0) {
        // melody notes → chord complexity
        const vals = CHORD_COMPLEXITY.map(o => o.value);
        const cur = chordSettings?.complexity || 'triad';
        const label = CHORD_COMPLEXITY.find(o => o.value === cur)?.label ?? cur;
        return {
          value: label, family: 'serif', size: 16,
          set: (dir) => setChordSettings(p => ({ ...p, complexity: cycle(vals, cur, dir) })),
        };
      }
      if (colIdx === 1) {
        // melody type → strategy (progression). Label via getProgressionLabel (bottom-view source).
        const cur = chordSettings?.strategy || 'tonic-tonic-tonic';
        // getProgressionLabel may embed a '^' superscript marker; strip it for the flat SVG label.
        const label = (getProgressionLabel(cur) || cur).replace('^', '');
        return {
          value: label, family: 'serif', size: 12,
          set: (dir) => setChordSettings(p => ({ ...p, strategy: cycle(CHORD_STRATEGIES, cur, dir) })),
        };
      }
      // notes per measure → chordCount
      const vals = CHORD_COUNTS.map(o => o.value);
      const cur = chordSettings?.chordCount ?? 1;
      const label = CHORD_COUNTS.find(o => o.value === cur)?.label ?? cur;
      return {
        value: label, family: 'serif', size: 18,
        set: (dir) => setChordSettings(p => ({ ...p, chordCount: cycle(vals, cur, dir) })),
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
        const vals = PERC_POOL_PRESETS.map(p => p.value);
        const cur = percPresetName(cfg?.enabledPads);
        const label = PERC_POOL_PRESETS.find(p => p.value === cur)?.label ?? cur;
        return {
          value: label, family: 'serif', size: 13,
          set: (dir) => {
            const next = cycle(vals, cur, dir);
            set(p => ({ ...p, enabledPads: [...PERCUSSION_PRESETS[next]] }));
          },
        };
      }
      const vals = MELODIC_NOTE_POOLS.map(o => o.value);
      const cur = cfg?.notePool || 'scale';
      const label = MELODIC_NOTE_POOLS.find(o => o.value === cur)?.label ?? getNoteSourceLabel(cur);
      return {
        value: label, family: 'serif', size: 13,
        set: (dir) => set(p => ({ ...p, notePool: cycle(vals, cur, dir) })),
      };
    }
    if (colIdx === 1) {
      // melody type → randomizationRule (play-style). Single stepper cycling the flat rule ring for
      // this instrument type; label via getPlayStyleLabel keeps parity with the bottom view (§6d).
      const cur = cfg?.randomizationRule || 'uniform';
      const label = getPlayStyleLabel(cur);
      return {
        value: label, family: 'serif', size: 12,
        set: (dir) => set(p => ({ ...p, randomizationRule: cyclePlayStyle(p.randomizationRule, dir, isPerc), type: p.type ?? row.key })),
      };
    }
    // notes per measure → notesPerMeasure
    const cur = cfg?.notesPerMeasure || 0;
    return {
      value: cur, family: 'serif', size: 18,
      set: (dir) => set(p => ({ ...p, notesPerMeasure: cycle(NOTES_PER_MEASURE, cur, dir) })),
    };
  };

  return (
    // stopPropagation: clicks inside the overlay must NOT bubble to the sheet-music close handler.
    <g className="generation-overlay" onClick={(e) => e.stopPropagation()}>
      {/* Full-overlay transparent hit-zone (mirrors SettingsOverlay:294-304) so clicks on empty
          space inside the overlay also stop propagation. */}
      <rect
        x={startX - 8} y={trebleStart - 95}
        width={(endX - startX) + 16}
        height={(percussionStart + 40) - (trebleStart - 95)}
        fill="transparent"
        style={{ cursor: 'default' }}
      />

      {/* Column headers — italic serif, var(--text-secondary), fontSize 14 (matches SettingsOverlay). */}
      {COLS.map((c, i) => (
        <text key={`hdr-${i}`} x={c.x} y={HEADER_Y} textAnchor="middle"
          fontFamily="serif" fontStyle="italic" fontSize={14} fill="var(--text-secondary)"
          style={{ userSelect: 'none', pointerEvents: 'none' }}>{c.header}</text>
      ))}

      {/* Per-balk rows of steppers. Each cell reuses SvgSetter (its own debug hitbox handled via
          §3a below). data-fly tags participate in the fly-in cascade like other overlays. */}
      {rows.map(row => (
        <g key={row.key}>
          {COLS.map((c, colIdx) => {
            const cell = cellFor(row, colIdx);
            if (!cell) return null;
            return (
              <g key={`${row.key}-${colIdx}`} data-fly>
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
                  onValueClick={() => cell.set('up')}
                  onInteraction={onSettingsInteraction}
                />
                {/* §3a: debug hit box matching the SvgSetter centre+side hit window. */}
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

export default GenerationSetterOverlay;
