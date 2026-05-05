import React from 'react';
import SvgSetter from './SvgSetter';
import './SheetMusic.css';
import { usePlaybackConfig } from '../../contexts/PlaybackConfigContext';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';

// ── Volume steps ─────────────────────────────────────────────────────────────
// 6 levels: //(0), pp(0.2), p(0.4), mp(0.6), mf(0.8), f(1.0)
export const VOL_STEPS = [
  { value: 0.0, glyph: '"', label: 'silent' },
  { value: 0.2, glyph: 'pp', label: 'pianissimo' },
  { value: 0.4, glyph: 'p', label: 'piano' },
  { value: 0.6, glyph: 'P', label: 'mezzo piano' },
  { value: 0.8, glyph: 'F', label: 'mezzo forte' },
  { value: 1.0, glyph: 'f', label: 'forte' },
];

export function getVolStep(vol) {
  if (vol === undefined || vol === null) return VOL_STEPS[5]; // default to forte
  const step = VOL_STEPS.find(s => Math.abs(s.value - vol) < 0.05);
  if (step) return step;
  if (vol >= 0.9) return VOL_STEPS[5]; // f
  if (vol >= 0.7) return VOL_STEPS[4]; // F (mf)
  if (vol >= 0.5) return VOL_STEPS[3]; // P (mp)
  if (vol >= 0.3) return VOL_STEPS[2]; // p
  if (vol > 0.01) return VOL_STEPS[1]; // pp
  return VOL_STEPS[0];                 // silent
}

// ── Chord preview for the "chords" row ───────────────────────────────────────
// Shows the first actual melody chord, or caesura if not visible
const ChordRowPreview = ({ cx, centerY, color, visible, displayMode, processedChords }) => {
  if (!visible) {
    return (
      <text x={cx} y={centerY} textAnchor="middle" fontFamily="Maestro"
        fontSize={30} fill={color} className="svg-no-interact">
        &quot;
      </text>
    );
  }

  const firstChordEntry = Array.isArray(processedChords) && processedChords.find(c => !c.isSlash);
  const firstChord = firstChordEntry?.chord;

  const displayRoot = firstChord
    ? (displayMode === 'letters'
        ? (firstChord.root || '').replace(/\d+/g, '')
        : (firstChord.roman || '').replace(/\d+/g, ''))
    : (displayMode === 'letters' ? 'C' : 'I');
  const displaySuffix = firstChord
    ? (displayMode === 'letters' ? (firstChord.internalSuffix || '') : (firstChord.romanSuffix || ''))
    : 'maj7';

  return (
    <g className="svg-no-interact">
      <text x={cx} y={centerY} textAnchor="start" fontFamily="serif" fontSize={26} fontWeight="bold" fill={color}>
        {displayRoot}
        {displaySuffix && <tspan fontSize={16} dy={-12} dx="2">{displaySuffix}</tspan>}
      </text>
    </g>
  );
};

// ── Barline x-positions for the overlay ──────────────────────────────────────
// If numMeasures == 2: [50%]
// If numMeasures > 2:  [30%, then (numMeasures-2) lines evenly from 50%→95%]
function getOverlayBarlineXs(startX, endX, numMeasures) {
  if (!numMeasures || numMeasures <= 1) return [];
  const span = endX - startX;
  const xs = [startX + 0.5 * span];
  if (numMeasures > 2) {
    const remaining = numMeasures - 1;
    for (let i = 1; i < remaining; i++) {
      xs.push(startX + span * (0.50 + 0.50 * (i / remaining)));
    }
  }
  return xs;
}

// ── Main overlay — an SVG <g> rendered inside the <svg> ──────────────────────
const SettingsOverlay = ({
  startX,
  endX,
  systemEndX,            // for measure count placement (same as repeat setter x anchor)
  trebleStart,
  bassStart,
  percussionStart,
  isTrebleVisible,
  isBassVisible,
  isPercussionVisible,
  setActiveVolumePicker,
  setActiveNumberPicker,
  numMeasures,
  setNumMeasures,
  inputTestSubMode,
  setInputTestSubMode,
  isFullscreen,
  toggleFullscreen,
  headerPlayMode,
  setHeaderPlayMode,
  handleToggleInputTest,
  handlePlayMelody,
  handlePlayContinuously,
  isPlaying,
  isInputTestMode,
  chordProgression,
  processedChords,
  onSettingsInteraction,
}) => {
  // ── Context-provided values (formerly props) ──────────────────────────────
  const { playbackConfig, setPlaybackConfig, toggleRoundSetting } = usePlaybackConfig();
  const { chordDisplayMode } = useDisplaySettings();
  if (startX == null || endX == null) return null;

  const HIT = 16;        // hitbox half-size in SVG units
  const span = endX - startX;
  const oddCol = startX + 0.20 * span;
  const evenCol = startX + 0.40 * span;

  // Instruments rows: staffTop drives beamed-notes position; null for no-staff rows
  const rows = [
    {
      key: 'chords',
      staffTop: null,
      centerY: trebleStart - 64, // Raised 5 units to -64 (Task 2.21)
      show: true,
      isChords: true,
    },
    {
      key: 'treble',
      staffTop: trebleStart,
      centerY: trebleStart + 20,
      show: isTrebleVisible,
    },
    {
      key: 'bass',
      staffTop: bassStart,
      centerY: bassStart + 20,
      show: isBassVisible,
    },
    {
      key: 'percussion',
      staffTop: percussionStart,
      centerY: percussionStart + 20,
      show: isPercussionVisible,
    },
  ].filter(r => r.show);

  // Volume sits ABOVE the staff top (or above centerY for chord row)
  const volY = (row) => row.isChords ? trebleStart - 64 : (row.staffTop != null ? row.staffTop - 4 : row.centerY - 24);
  // Visibility icon center: horizontal middle of the staff
  const visY = (row) => row.isChords ? trebleStart - 64 : (row.staffTop != null ? row.staffTop + 20 : row.centerY + 4);

  // Helper: volume cycle logic
  const cycleVolume = (round, key, direction) => {
    const vol = playbackConfig?.[round]?.[key];
    const step = getVolStep(vol);
    const currentIndex = VOL_STEPS.findIndex(s => s.value === step.value);
    let nextIndex = currentIndex;
    if (direction === 'up') {
      nextIndex = (currentIndex + 1) % VOL_STEPS.length;
    } else if (direction === 'down') {
      nextIndex = (currentIndex - 1 + VOL_STEPS.length) % VOL_STEPS.length;
    }
    const newVal = VOL_STEPS[nextIndex].value;
    if (setPlaybackConfig) {
      setPlaybackConfig(prev => ({
        ...prev,
        [round]: { ...(prev[round] || {}), [key]: newVal }
      }));
    }
  };

  // Helper: volume setter group
  const renderVolGlyph = (round, row, col) => {
    const vol = playbackConfig?.[round]?.[row.key];
    const step = getVolStep(vol);
    const vy = volY(row);
    const vx = col - 38;

    const isEven = round === 'evenRounds';
    const shouldBlur = playbackConfig?.repsPerMelody === 1 && isEven;

    return (
      <g key={`vol-${round}-${row.key}`} style={shouldBlur ? { filter: 'blur(3px)', opacity: 0.5, pointerEvents: 'none' } : {}}>
        <SvgSetter
          x={vx}
          y={vy}
          value={step.glyph}
          label={undefined}
          showLabel={false}
          valueFontFamily="Maestro"
          valueFontSize={32}
          spacing={20}
          onDecrement={() => cycleVolume(round, row.key, 'down')}
          onIncrement={() => cycleVolume(round, row.key, 'up')}
          onValueLongPress={() => setActiveVolumePicker?.({ round, instrumentKey: row.key })}
          onValueClick={() => cycleVolume(round, row.key, 'up')}
          onInteraction={onSettingsInteraction}
        />
      </g>
    );
  };

  const renderVisGlyph = (round, row, col) => {
    const isEven = round === 'evenRounds';
    const isPerc = row.key === 'percussion';
    const eyeVal = playbackConfig?.[round]?.[`${row.key}Eye`];
    const visible = isPerc ? (eyeVal === true || eyeVal === 'metronome') : !!eyeVal;
    const isMetro = isPerc && eyeVal === 'metronome';
    const vy = visY(row);
    const color = isMetro ? 'var(--accent-yellow)' : 'var(--accent-yellow)';
    const vx = row.isChords ? col + 14 : col + 10; // Chords right 4 (Task 2.23)

    let content;
    if (row.isChords) {
      content = <ChordRowPreview cx={vx} centerY={vy + 5} visible={visible} displayMode={chordDisplayMode} color={color} processedChords={processedChords} />;
    } else if (visible) {
      const f_y = row.staffTop + 35; // F4 space
      const a_y = row.staffTop + 25; // A4 space
      const x1 = vx - 12;
      const x2 = vx + 12;

      const headGlyph = isMetro ? 'Ñ' : 'Ï';
      const sx1 = isMetro ? x1 - 4.5 : x1 + 4.5;
      const sx2 = isMetro ? x2 - 4.5 : x2 + 4.5;
      const sy1Start = isMetro ? f_y + 0 : f_y - 2;
      const sy1End = isMetro ? f_y + 25 : f_y - 25;
      const sy2Start = isMetro ? a_y + 0 : a_y - 2;
      const sy2End = isMetro ? a_y + 25 : a_y - 25;

      content = (
        <g className="svg-no-interact">
          <text x={x1} y={f_y} textAnchor="middle" fontFamily="Maestro" fontSize={36} fill={color}>{headGlyph}</text>
          <line x1={sx1} y1={sy1Start} x2={sx1} y2={sy1End} stroke={color} strokeWidth="1.2" />
          <text x={x2} y={a_y} textAnchor="middle" fontFamily="Maestro" fontSize={36} fill={color}>{headGlyph}</text>
          <line x1={sx2} y1={sy2Start} x2={sx2} y2={sy2End} stroke={color} strokeWidth="1.2" />

          {/* Connecting beam */}
          <path d={`M ${sx1 - 0.5} ${sy1End} L ${sx2 + 0.5} ${sy2End} L ${sx2 + 0.5} ${sy2End + (isMetro ? -4 : 4)} L ${sx1 - 0.5} ${sy1End + (isMetro ? -4 : 4)} Z`} fill={color} />
        </g>
      );
    } else {
      content = (
        <text x={vx} y={vy + 9} textAnchor="middle" fontFamily="Maestro"
          fontSize={36} fill="var(--accent-yellow)"
          className="svg-no-interact">
          Ô
        </text>
      );
    }

    // Wrap the rendering into an optional blurred group if evenRound and repsPerMelody === 1
    const shouldBlur = playbackConfig?.repsPerMelody === 1 && isEven;

    return (
      <g key={`vis-${round}-${row.key}`} style={shouldBlur ? { filter: 'blur(3px)', opacity: 0.5, pointerEvents: 'none' } : {}}>
        {content}
        <rect x={vx - HIT} y={vy - HIT} width={HIT * 2} height={HIT * 2}
          fill="transparent" className="svg-pointer"
          onClick={(e) => { e.stopPropagation(); toggleRoundSetting?.(round, row.key, 'visual'); }}
        />
      </g>
    );
  };

  // Barline x-positions for the overlay
  const barlineXs = getOverlayBarlineXs(startX, endX, numMeasures);
  const topY = trebleStart;
  const bottomY = isPercussionVisible
    ? percussionStart + 40
    : isBassVisible ? bassStart + 40 : trebleStart + 40;

  // Measure count control — placed at 75% between startX and endX
  const measSpan = (systemEndX ?? endX) - startX;
  const measX = startX + 0.75 * measSpan;
  const measY = trebleStart - 18;

  // Shared Y constants
  const HEADER_Y    = trebleStart - 89;  // all section header labels
  const CHORD_ROW_Y = trebleStart - 64;  // chord row center (vol/vis icons, measure/repeat setters)

  return (
    <g className="settings-overlay">

      {/* ── COLUMN HEADERS ─────────────────────────────────── */}
      <text x={oddCol} y={HEADER_Y} textAnchor="middle" fontFamily="serif" fontStyle="italic"
        fontSize={14} fill="var(--text-dim)"
        style={{ userSelect: 'none', pointerEvents: 'none', opacity: playbackConfig?.repsPerMelody === 1 ? 0.3 : 0.8 }}>odd repeats</text>
      <text x={evenCol} y={HEADER_Y} textAnchor="middle" fontFamily="serif" fontStyle="italic"
        fontSize={14} fill="var(--text-dim)"
        style={{ userSelect: 'none', pointerEvents: 'none', opacity: playbackConfig?.repsPerMelody === 1 ? 0.3 : 0.8 }}>even repeats</text>

      {/* ── INSTRUMENT ROWS ─────────────────────────────────── */}
      {rows.map(row => (
        <g key={row.key}>
          {renderVolGlyph('oddRounds', row, oddCol)}
          {renderVisGlyph('oddRounds', row, oddCol)}
          {renderVolGlyph('evenRounds', row, evenCol)}
          {renderVisGlyph('evenRounds', row, evenCol)}
        </g>
      ))}

      {/* ── EXTRA BARLINES ───────────────────────────────────── */}
      {barlineXs.map((x, i) => (
        <line key={`extra-bar-${i}`}
          x1={x} y1={topY} x2={x} y2={bottomY}
          stroke="var(--text-primary)" strokeWidth="0.5"
          className="svg-no-interact"
        />
      ))}

      {/* ── MEASURE COUNT AREA ── */}
      <g transform={`translate(${startX + 0.70 * (systemEndX - startX)}, ${CHORD_ROW_Y})`}>
        <text x="0" y={-25} fontFamily="serif" fontStyle="italic" fontSize="14" fill="var(--text-secondary)" textAnchor="middle" className="svg-no-interact">measures</text>
        <SvgSetter
          x={0}
          y={0}
          valueDy={-3}
          value={numMeasures ?? '—'}
          onValueClick={() => setActiveNumberPicker?.('measures')}
          onDecrement={() => numMeasures > 1 ? setNumMeasures(numMeasures - 1) : null}
          onIncrement={() => numMeasures < 32 ? setNumMeasures(numMeasures + 1) : null}
          onInteraction={onSettingsInteraction}
        />
      </g>

      {/* ── REPEAT COUNT AREA ── */}
      <g transform={`translate(${startX + 0.85 * (systemEndX - startX)}, ${CHORD_ROW_Y})`}>
        <text x="0" y={-25} fontFamily="serif" fontStyle="italic" fontSize="14" fill="var(--text-secondary)" textAnchor="middle" className="svg-no-interact">repeats</text>
        <SvgSetter
          x={0}
          y={0}
          valueDy={-3}
          value={playbackConfig.repsPerMelody === Infinity ? 'À' : playbackConfig.repsPerMelody}
          onValueClick={() => setActiveNumberPicker?.('repeats')}
          onDecrement={() => {
            const options = [1, 2, 4, 6, 8, Infinity];
            const currentIndex = options.indexOf(playbackConfig.repsPerMelody);
            let nextIndex = currentIndex === -1 ? options.indexOf(4) : (currentIndex - 1 + options.length) % options.length;
            setPlaybackConfig(p => ({ ...p, repsPerMelody: options[nextIndex] }));
          }}
          onIncrement={() => {
            const options = [1, 2, 4, 6, 8, Infinity];
            const currentIndex = options.indexOf(playbackConfig.repsPerMelody);
            let nextIndex = currentIndex === -1 ? options.indexOf(4) : (currentIndex + 1) % options.length;
            setPlaybackConfig(p => ({ ...p, repsPerMelody: options[nextIndex] }));
          }}
          onInteraction={onSettingsInteraction}
        />
      </g>

    </g>
  );
};

export default SettingsOverlay;
