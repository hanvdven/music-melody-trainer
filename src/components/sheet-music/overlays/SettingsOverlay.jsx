import React from 'react';
import SvgSetter from '../SvgSetter';
import { renderRepeatGlyph } from './carouselOptionGlyph';
import { LeftFanCarousel } from './fanCarousels';
import { BeginRepeatSign, EndRepeatSign } from '../repeatSigns';

// #302: the measures fan drags through every count 1..32 (the old stepper's
// bounds), derived — not a hand-picked subset (§6c).
const MEASURE_OPTIONS = Array.from({ length: 32 }, (_, i) => i + 1);

// #992 UAT rework (Han 2026-08-14): the RPG visibility fan's two steps. Ascending so the
// LeftFanCarousel's "high value sits HIGH on screen" layout puts 100 above 50.
const RPG_VISIBILITY_OPTIONS = [50, 100];
import { AXES } from '../../../exercises/exerciseIndex';
import '../SheetMusic.css';
import { usePlaybackConfig } from '../../../contexts/PlaybackConfigContext';
import { useDisplaySettings } from '../../../contexts/DisplaySettingsContext';

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

// Not exported: only used within this module (Han 2026-06-19).
function getVolStep(vol) {
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
  // Group class for the root <g> (Han 2026-06-22). Defaults to 'settings-overlay' so the legacy
  // 'settings' kind is untouched. The PLAYBACK setter reuses this same component but passes
  // 'playback-overlay' so its morph group (useRangeMorph.groupsForKind('playback')) never collides
  // with the legacy one — they are mutually exclusive, so the two classes never coexist (§6c: do
  // not duplicate SettingsOverlay; reuse it with a different group class).
  groupClassName = 'settings-overlay',
  // §3a debug hit-box visualisation. Was referenced in the body (lines ~270/316) but never
  // declared as a prop nor passed by callers → a no-undef lint error AND the hit-boxes never
  // rendered. Declared here (default false) and now wired from both SheetMusic call sites so
  // the §3a orange overlays actually appear in debug mode. (#153 lint-gate fix.)
  debugMode = false,
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

    // #300 (Han: "zet volume setter op een tangens selector, zoals in
    // transposition-links"): each volume cell is a COMPACT vertical tangens fan
    // of VOL_STEPS — at rest only the current Maestro dynamics glyph shows;
    // dragging fans the neighbouring steps out under the finger (ten permanent
    // fans would overlap the grid rows). Same LeftFanCarousel as the
    // GEN. ADVANCED setters (§6d, shared module). Mapping chosen per Han's
    // "werk af" mandate — flagged on the ticket, reversible in UAT.
    const activeVolIdx = Math.max(0, VOL_STEPS.findIndex(s => s.glyph === step.glyph));
    return (
      <g key={`vol-${round}-${row.key}`} style={shouldBlur ? { filter: 'blur(3px)', opacity: 0.5, pointerEvents: 'none' } : {}}>
        <LeftFanCarousel
          cx={vx}
          centerY={vy - 6}
          items={VOL_STEPS}
          activeIndex={activeVolIdx}
          renderLabel={(s) => s.glyph}
          labelFontFamily="Maestro"
          activeLabelSize={32}
          compact
          /* #434 (Han): same intuitive drag as measures — dragging DOWN raises the value. */
          invert
          bandW={36}
          fieldLines={[]}
          onCommit={(i) => {
            onSettingsInteraction?.();
            const newVal = VOL_STEPS[i].value;
            setPlaybackConfig(prev => ({ ...prev, [round]: { ...(prev[round] || {}), [row.key]: newVal } }));
          }}
          debugMode={debugMode}
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
        {debugMode && (
          <rect x={vx - HIT} y={vy - HIT} width={HIT * 2} height={HIT * 2}
            fill="orange" fillOpacity={0.4} stroke="orange" strokeWidth={1}
            style={{ pointerEvents: 'none' }} />
        )}
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

  // #992 UAT rework (Han 2026-08-14: "onder de num measures setter" = THIS overlay, not the bottom
  // TabView panel). A SECOND setter row directly below the measures/repeats row, holding the three
  // RPG knobs. Y is picked so the row's 44-unit compact drag band (rpgRowY ± 22) clears the measures
  // row's band (CHORD_ROW_Y ± 22, i.e. down to trebleStart−42) and still sits ABOVE the staff top —
  // it shares the vertical band of the instrument-row volume fans (volY−6 = trebleStart−10), which
  // live at the odd/even columns, far left of these.
  const RPG_ROW_Y = trebleStart - 16;
  // The measures fan sits at 0.70 and repeats at 0.85 of the system span; the RPG row keeps that same
  // 0.15 column rhythm, with the middle knob directly under the measures fan.
  const rpgFanX = (frac) => startX + frac * ((systemEndX ?? endX) - startX);

  // ONE implementation for all three RPG knobs (§6d): the SAME compact, inverted LeftFanCarousel the
  // measures/repeats/volume fans use, with the SAME serif-italic-14 --text-secondary caption at −25
  // and the SAME Maestro 32 active label. No new geometry constants, no copy-pasted fan code.
  const renderRpgFan = (key, frac, caption, items, activeIndex, renderLabel, commit) => (
    <g key={key} transform={`translate(${rpgFanX(frac)}, ${RPG_ROW_Y})`}>
      <text x="0" y={-25} fontFamily="serif" fontStyle="italic" fontSize="14"
        fill="var(--text-secondary)" textAnchor="middle" className="svg-no-interact">{caption}</text>
      <LeftFanCarousel
        cx={0}
        centerY={-6}
        items={items}
        activeIndex={activeIndex}
        renderLabel={renderLabel}
        labelFontFamily="Maestro"
        activeLabelSize={32}
        compact
        /* Same drag direction as measures/repeats/volume (#430/#434/#435): drag DOWN raises. */
        invert
        fieldLines={[]}
        onCommit={(i) => { onSettingsInteraction?.(); commit(items[i]); }}
        debugMode={debugMode}
      />
    </g>
  );

  // Both RPG volume knobs are plain VOL_STEPS fans — identical items/label/commit shape as the
  // per-instrument volume cells above, so the glyphs can never drift from the canonical table.
  const rpgVolFan = (key, frac, caption, field, value) => renderRpgFan(
    key, frac, caption, VOL_STEPS,
    Math.max(0, VOL_STEPS.findIndex(s => s.glyph === getVolStep(value).glyph)),
    (s) => s.glyph,
    (s) => setPlaybackConfig(prev => ({ ...prev, [field]: s.value })),
  );

  // Full overlay bounding area — clicks anywhere inside must NOT propagate to the
  // sheet-music click handler (which closes the overlay on any non-note click).
  const overlayTop    = trebleStart - 95;
  const overlayBottom = bottomY + 8;
  const overlayLeft   = startX - 8;
  const overlayRight  = (systemEndX ?? endX) + 8;

  return (
    // stopPropagation here prevents all child-element clicks from bubbling to
    // handleSheetMusicClick, which would toggle (close) the overlay immediately.
    <g className={groupClassName} onClick={(e) => e.stopPropagation()}>

      {/* Transparent hit-zone covering the full overlay area so clicks on empty
          space inside the overlay also stop propagation instead of falling
          through to the sheet-music close handler.  */}
      <rect
        x={overlayLeft} y={overlayTop}
        width={overlayRight - overlayLeft} height={overlayBottom - overlayTop}
        fill="transparent"
        style={{ cursor: 'default' }}
      />
      {debugMode && (
        <rect x={overlayLeft} y={overlayTop}
          width={overlayRight - overlayLeft} height={overlayBottom - overlayTop}
          fill="cyan" fillOpacity={0.15} stroke="cyan" strokeWidth={0.5}
          style={{ pointerEvents: 'none' }} />
      )}

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
          {/* #498 (Han 2026-07-19): per-row 'volume' label in the shared setter header style
              (serif italic 14, --text-secondary), left of the two volume fans. The odd/even
              columns above already head the repeat-rounds; this labels what each ROW's fans do.
              Placed BESIDE the fans (not above) — the volume fans already sit just above the
              staff, so there is no room for an above-header; it aligns to the fan's centre line
              (volY−6) in the left gutter (startX→leftFanX). */}
          <text x={(startX + (oddCol - 38 - 16)) / 2} y={volY(row) - 2} textAnchor="middle"
            fontFamily="serif" fontStyle="italic" fontSize={14} fill="var(--text-secondary)"
            style={{ userSelect: 'none', pointerEvents: 'none',
              opacity: playbackConfig?.repsPerMelody === 1 ? 0.4 : 0.9 }}>volume</text>
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

      {/* ── IN-LINE REPEAT SIGNS (#430, Han: "als repeats ≠ 1: render vertical repeat block in
          line") ── a FULL begin-repeat sign at the front of the staff AND a full end-repeat sign at
          the system end, both full staff-height. Same canonical geometry the sheet uses (shared
          repeatSigns module, §6d). Shown whenever repeats ≠ 1 (a finite count > 1 OR 'until'). */}
      {(playbackConfig.untilCorrect || playbackConfig.repsPerMelody > 1) && (
        <g className="svg-no-interact">
          {/* #434 rework (Han: "repeat balken rechts worden geclipt … pixel perfect"). Match
              BarlinesLayer EXACTLY: the sheet's opening repeat anchors at (first barline − 15), and
              the first barline is at startX → startX−15. The sheet's closing repeat is at the LAST
              barline = the staff's right edge endX (NOT systemEndX = the viewBox edge; the old thick
              bar at systemEndX+1 sat 1px off-screen → the clip). endX un-clips it and lines it up
              with the melody's closing barline. */}
          <BeginRepeatSign x={startX - 15} trebleStart={topY}
            bassStart={isBassVisible ? bassStart : null}
            percussionStart={isPercussionVisible ? percussionStart : null}
            bottomY={bottomY}
            isTrebleVisible={isTrebleVisible} isBassVisible={isBassVisible}
            isPercussionVisible={isPercussionVisible} />
          <EndRepeatSign x={endX} trebleStart={topY}
            bassStart={isBassVisible ? bassStart : null}
            percussionStart={isPercussionVisible ? percussionStart : null}
            bottomY={bottomY}
            isTrebleVisible={isTrebleVisible} isBassVisible={isBassVisible}
            isPercussionVisible={isPercussionVisible} />
        </g>
      )}

      {/* ── MEASURE COUNT AREA (#302, Han: "measures ook op een tangens
          selector") — the SAME LeftFanCarousel as the volume cells and the
          GEN. ADVANCED setters (§6d shared module), compact: at rest only the
          current count shows, dragging fans 1..32 out vertically. */}
      <g transform={`translate(${startX + 0.70 * (systemEndX - startX)}, ${CHORD_ROW_Y})`}>
        <text x="0" y={-25} fontFamily="serif" fontStyle="italic" fontSize="14" fill="var(--text-secondary)" textAnchor="middle" className="svg-no-interact">measures</text>
        <LeftFanCarousel
          cx={0}
          centerY={-6}
          items={MEASURE_OPTIONS}
          activeIndex={Math.max(0, MEASURE_OPTIONS.indexOf(numMeasures))}
          renderLabel={(n) => String(n)}
          /* #361 (Han): measures in Maestro, same size as the repeats + BPM (32). */
          labelFontFamily="Maestro"
          activeLabelSize={32}
          compact
          /* #430 (Han): "measures is tegenintuitief" — invert so dragging DOWN raises the count. */
          invert
          fieldLines={[]}
          onCommit={(i) => { onSettingsInteraction?.(); setNumMeasures(MEASURE_OPTIONS[i]); }}
          debugMode={debugMode}
        />
      </g>

      {/* ── REPEAT COUNT AREA (#298, Han 2026-07-02: "hergebruik die setter; het
          zal een carousel zijn met de reeds bestaande parameter") ──
          The stepper became the SAME NonLinearCarousel as the exercise setter's
          REPEAT axis: options from AXES.evaluation (§6c SSOT — ['until',1,2,4,
          6,8,∞]) with the BadgeCheck 'until correct' glyph LEFTMOST. Stored as
          { untilCorrect, repsPerMelody } so the Sequencer's repeat arithmetic
          stays numeric ('until' plays as Infinity). */}
      {/* #430 (Han): repeats becomes the SAME hidden vertical tanh fan as measures (compact
          LeftFanCarousel, §6d) — at rest only the current value shows, dragging fans the options out.
          It renders the canonical Maestro repeat glyphs (renderRepeatGlyph) via the fan's renderNode,
          scaled to the fan's per-row size so until/×N/∞ read exactly like the sheet header. */}
      <g transform={`translate(${startX + 0.85 * (systemEndX - startX)}, ${CHORD_ROW_Y})`}>
        <text x="0" y={-25} fontFamily="serif" fontStyle="italic" fontSize="14" fill="var(--text-secondary)" textAnchor="middle" className="svg-no-interact">repeats</text>
        <LeftFanCarousel
          cx={0}
          centerY={-6}
          items={AXES.evaluation}
          activeIndex={(() => {
            const current = playbackConfig.untilCorrect ? 'until' : playbackConfig.repsPerMelody;
            const idx = AXES.evaluation.findIndex(o => o.value === current);
            return idx === -1 ? AXES.evaluation.findIndex(o => o.value === 4) : idx;
          })()}
          activeLabelSize={32}
          compact
          // #435 (Han 2026-07-19: "de carousel draait in de andere richting dan 'maten', wissel om"):
          // match the measures fan — dragging DOWN raises the value.
          invert
          fieldLines={[]}
          // Draw the repeat glyph per row (§6d — the same renderRepeatGlyph as the sheet header/BPM;
          // the Maestro 'À' renders as the ×N repeat mark). #434: Han only wanted a wider SPACE
          // between the number and the mark — that lives in renderRepeatGlyph now. Scaled from the
          // 32px active size to the fan's per-row size.
          renderNode={(item, { active, size }) => (
            <g transform={`scale(${size / 32})`}>{renderRepeatGlyph(item, active, 0)}</g>
          )}
          onCommit={(i) => {
            onSettingsInteraction?.();
            const item = AXES.evaluation[i];
            setPlaybackConfig(p => ({
              ...p,
              repsPerMelody: item.value === 'until' ? Infinity : item.value,
              untilCorrect: item.value === 'until',
            }));
          }}
          debugMode={debugMode}
        />
      </g>

      {/* ── RPG ROW (#992, Han: "3 setters onder de num measures setter") ──────
          RPG fx volume / RPG music volume / RPG visibility, rendered as three MORE
          LeftFanCarousels one row below the measures fan. These write the same
          playbackConfig.rpgFxVolume / rpgMusicVolume / rpgVisibility fields the
          multiplier math in audio/dynamics.js reads (see docs/architecture.md §230);
          this row is purely their UI. */}
      {rpgVolFan('rpg-fx', 0.55, 'rpg fx', 'rpgFxVolume', playbackConfig?.rpgFxVolume)}
      {rpgVolFan('rpg-music', 0.70, 'rpg music', 'rpgMusicVolume', playbackConfig?.rpgMusicVolume)}
      {renderRpgFan(
        'rpg-visibility', 0.85, 'rpg visibility',
        RPG_VISIBILITY_OPTIONS,
        Math.max(0, RPG_VISIBILITY_OPTIONS.indexOf(playbackConfig?.rpgVisibility ?? 100)),
        (v) => String(v),
        (v) => setPlaybackConfig(prev => ({ ...prev, rpgVisibility: v })),
      )}

    </g>
  );
};

export default SettingsOverlay;
