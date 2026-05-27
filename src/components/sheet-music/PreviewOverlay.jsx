import React from 'react';
import MelodyNotesLayer from './MelodyNotesLayer';
import ChordLabelsLayer from './ChordLabelsLayer';
import BarlinesLayer from './BarlinesLayer';
import { renderOneMeasureRepeatSymbols } from './renderOneMeasureRepeatSymbols';

/**
 * PreviewOverlay — the RED/crossfade overlay that shows the NEXT block's
 * melody during a pagination transition.
 *
 * Why this exists:
 * SheetMusic.jsx had this overlay as an inline IIFE (~220 LOC) that was
 * evaluated on EVERY render — even when no transition was active. The IIFE
 * always ran the visibility derivations, the previewLayout destructure, and
 * the JSX for ChordLabelsLayer + 3× MelodyNotesLayer + BarlinesLayer +
 * renderRepeatSymbols × 3. With `previewMelody` null (stopped state) it
 * fell back to a "NEXT BLOCK" text label — still 220 LOC of work to
 * conclude "render one text element".
 *
 * Moving to a `React.memo`-wrapped component lets React skip the whole
 * overlay when its inputs are referentially equal. The parent now mounts
 * `<PreviewOverlay …/>` only when `showWipePreview === 'red'` OR
 * `'crossfade'`, so the overlay is completely absent from the DOM for the
 * other 90% of the session. The "NEXT BLOCK" fallback is removed — if
 * `previewMelody` is null at mount-time the overlay simply renders
 * nothing.
 *
 * DOM output is unchanged: same `<g data-pagination-new>` / `<g
 * data-wipe-role="new">` wrappers, same staff translateY transforms,
 * same chord/melody/barline children. `useSheetMusicHighlight` reads
 * `[data-pagination-new]` and re-caches on isConnected=false, so
 * mount/unmount is safe.
 */

const RED = 'rgba(220,30,30,0.75)';

const PreviewOverlay = ({
  previewMelody,
  previewLayout,
  // round / playback config
  playbackConfig,
  isOddRound,
  // animation mode
  animationMode,
  // layout
  startX,
  endX,
  trebleStart,
  bassStart,
  percussionStart,
  bottomY,
  measureBottom,
  measureYPositions,
  partialTop,
  partialMeasureStart,
  noteGroupSize,
  measureLengthSlots,
  displayNumMeasures,
  melodyWidth,
  numAccidentals,
  pixelsPerTick,
  // music data
  chordProgression,
  processedChords,
  timeSignature,
  tonic,
  scaleNotes,
  clefTreble,
  clefBass,
  trebleTransSemitones,
  bassTransSemitones,
  // visibility
  isTrebleVisible,
  isBassVisible,
  isPercussionVisible,
  // styling
  chordDisplayMode,
  noteColoringMode,
  theme,
  showSettings,
  debugMode,
  // block / measure tracking
  blockMeasureStart,
  blockPlayStart,
  numRepeats,
  numMeasures,
  isPlaying,
  startMeasureIndex,
  // interaction
  onMeasureNumberClick,
  // misc
  courtesyAccidentals,
  percussionVoiceSplit,
  emptyScaleNotes,
}) => {
  if (!previewMelody || !previewLayout) return null;

  // The incoming round is locked into previewMelody._roundKey by the pagination
  // scheduler at arm time. Reading it from React's isOddRound state instead
  // would let the overlay's visibility flip mid-overshoot for the 'lang' variant
  // (when isOddRound updates at the boundary while the overlay is still up
  // for another 0.25m).
  const lockedKey = previewMelody?._roundKey;
  const nextRoundKey = lockedKey ?? (isOddRound ? 'evenRounds' : 'oddRounds');
  const nextCfg = previewLayout?.nextCfg ?? (playbackConfig?.[nextRoundKey] ?? {});
  const nextNotesVisible = previewLayout?.nextNotesVisible ?? !!nextCfg.notes;
  const nextTreble = nextCfg.trebleEye !== false;
  const nextBass = nextCfg.bassEye !== false;
  const nextPerc = nextCfg.percussionEye === true;
  const nextMetro = nextCfg.percussionEye === 'metronome';
  // In debug mode: tint red so the pre-generated melody overlay is distinct.
  // In normal mode: render with default note colors (null = no tint).
  const RCOL = debugMode ? RED : null;

  const { previewTreble, previewBass, previewPerc, previewChords, pmAllOffsets, pmNoteWidth } = previewLayout;
  const pm = previewMelody;

  const repeatSymbolsCommon = {
    offsets: pmAllOffsets,
    noteWidth: pmNoteWidth,
    pixelsPerTick,
    staveYs: [30],
    color: RCOL,
    startX,
    displayNumMeasures,
    measureLengthSlots,
    showSettings,
  };

  return (
    <g
      data-wipe-role={animationMode === 'wipe' ? 'new' : undefined}
      data-pagination-new={animationMode === 'pagination' ? '' : undefined}
      transform={animationMode === 'scroll' ? `translate(${melodyWidth ?? (endX - startX)}, 0)` : undefined}
      className={
        // Same pattern as yellow overlay: CSS class owns resting opacity,
        // never inline style — prevents React re-renders from overriding
        // the rAF/useLayoutEffect that animate opacity during the transition.
        animationMode === 'wipe' ? 'wipe-new-hidden'
        : animationMode === 'pagination' ? 'pagination-new-hidden'
        : undefined
      }
      style={{
        // scroll: tinted red; fades in via CSS animation (scroll mode only).
        opacity: animationMode === 'scroll' ? undefined : undefined,
        animation: animationMode === 'scroll' ? 'scrollPreviewFadeIn 0.5s ease-in forwards' : undefined,
        filter: showSettings ? 'blur(1.5px)' : 'none',
        pointerEvents: 'none',
      }}
    >
      {nextCfg.chordsEye !== false && previewChords?.length > 0 &&
        <ChordLabelsLayer
          chordProgression={chordProgression}
          chords={previewChords}
          processedChords={processedChords}
          offsets={pmAllOffsets}
          startX={startX}
          noteWidth={pmNoteWidth}
          pixelsPerTick={pixelsPerTick}
          displayNumMeasures={displayNumMeasures}
          measureLengthSlots={measureLengthSlots}
          trebleStart={trebleStart}
          startMeasureIndex={startMeasureIndex}
          chordDisplayMode={chordDisplayMode}
          noteColoringMode={noteColoringMode}
          theme={theme}
          debugMode={debugMode}
          overrideColor={RCOL}
          inputTestState={null}
        />}
      <g style={{ transform: `translateY(${trebleStart}px)` }}>
        {isTrebleVisible && nextTreble && nextNotesVisible && previewTreble &&
          <MelodyNotesLayer
            melody={previewTreble}
            numAccidentals={numAccidentals}
            startX={startX}
            noteWidth={pmNoteWidth}
            allOffsets={pmAllOffsets}
            staff="treble"
            staffYStart={0}
            noteGroupSize={noteGroupSize}
            measureLengthSlots={measureLengthSlots}
            timeSignature={timeSignature}
            clef={clefTreble}
            noteColoringMode={noteColoringMode}
            tonic={tonic}
            scaleNotes={scaleNotes}
            processedChords={previewChords ?? processedChords}
            theme={theme}
            inputTestState={null}
            previewMode={RCOL}
            pixelsPerTick={pixelsPerTick}
            startMeasureIndex={startMeasureIndex}
            transpositionSemitones={trebleTransSemitones}
          />}
        {isTrebleVisible && (!nextTreble || !nextNotesVisible) &&
          renderOneMeasureRepeatSymbols(repeatSymbolsCommon)}
      </g>
      <g style={{ transform: `translateY(${bassStart}px)` }}>
        {isBassVisible && nextBass && nextNotesVisible && previewBass &&
          <MelodyNotesLayer
            melody={previewBass}
            numAccidentals={numAccidentals}
            startX={startX}
            noteWidth={pmNoteWidth}
            allOffsets={pmAllOffsets}
            staff="bass"
            staffYStart={0}
            noteGroupSize={noteGroupSize}
            measureLengthSlots={measureLengthSlots}
            timeSignature={timeSignature}
            clef={clefBass}
            noteColoringMode={noteColoringMode}
            tonic={tonic}
            scaleNotes={scaleNotes}
            processedChords={previewChords ?? processedChords}
            theme={theme}
            inputTestState={null}
            previewMode={RCOL}
            pixelsPerTick={pixelsPerTick}
            startMeasureIndex={startMeasureIndex}
            transpositionSemitones={bassTransSemitones}
          />}
        {isBassVisible && (!nextBass || !nextNotesVisible) &&
          renderOneMeasureRepeatSymbols(repeatSymbolsCommon)}
      </g>
      <g style={{ transform: `translateY(${percussionStart}px)` }}>
        {isPercussionVisible && nextPerc && nextNotesVisible && previewPerc &&
          <MelodyNotesLayer
            melody={previewPerc}
            numAccidentals={numAccidentals}
            startX={startX}
            noteWidth={pmNoteWidth}
            allOffsets={pmAllOffsets}
            staff="percussion"
            staffYStart={0}
            noteGroupSize={noteGroupSize}
            measureLengthSlots={measureLengthSlots}
            timeSignature={timeSignature}
            clef={null}
            noteColoringMode={noteColoringMode}
            tonic={tonic}
            scaleNotes={emptyScaleNotes}
            processedChords={previewChords ?? processedChords}
            theme={theme}
            inputTestState={null}
            previewMode={RCOL}
            pixelsPerTick={pixelsPerTick}
            startMeasureIndex={startMeasureIndex}
            transpositionSemitones={0}
            debugMode={debugMode}
            interactive={true}
            courtesyAccidentals={courtesyAccidentals}
            percussionVoiceSplit={percussionVoiceSplit}
          />}
        {isPercussionVisible && (!nextPerc && !nextMetro) &&
          renderOneMeasureRepeatSymbols(repeatSymbolsCommon)}
      </g>
      {/* Barlines for the incoming content — use the preview's startMeasureIndex so
          measure numbers are correct during the wipe (not the old block's numbers).
          _blockMeasureStart / _blockPlayStart (set by pagination scheduler at
          arm-time) override the still-current React state for series-flip, so the
          label says "3" not "1 . 5" when crossing a sequence boundary. */}
      <g style={{ opacity: showSettings ? 0.6 : 1 }}>
        <BarlinesLayer
          mode="regular"
          offsets={pmAllOffsets}
          noteWidth={pmNoteWidth}
          pixelsPerTick={pixelsPerTick}
          startX={startX}
          startIdx={pm.startMeasureIndex ?? startMeasureIndex}
          blockMeasureStart={pm._blockMeasureStart ?? blockMeasureStart}
          blockPlayStart={pm._blockPlayStart ?? blockPlayStart}
          partialTop={partialTop}
          partialMeasureStart={partialMeasureStart}
          measureBottom={measureBottom}
          measureYPositions={measureYPositions}
          trebleStart={trebleStart}
          bassStart={bassStart}
          percussionStart={percussionStart}
          bottomY={bottomY}
          isTrebleVisible={isTrebleVisible}
          isBassVisible={isBassVisible}
          isPercussionVisible={isPercussionVisible}
          numRepeats={numRepeats}
          isPlaying={isPlaying}
          numMeasures={numMeasures}
          debugMode={debugMode}
          showSettings={showSettings}
          measureLengthSlots={measureLengthSlots}
          onMeasureNumberClick={onMeasureNumberClick}
        />
      </g>
    </g>
  );
};

export default React.memo(PreviewOverlay);
