import React from 'react';
import { renderMelodyNotes } from './renderMelodyNotes';

/**
 * MelodyNotesLayer — memoised wrapper around the `renderMelodyNotes` JSX-builder.
 *
 * Why this exists:
 * `SheetMusic.jsx` calls `renderMelodyNotes(...)` inline 11× per render — once per
 * (staff × layer) combination across OLD / yellow-overlay / red-overlay /
 * metronome. Inline calls are not memoised by React: even when all 24+ arguments
 * are referentially equal, the function runs every render (= every measure-tick,
 * every isOddRound flip, every showNotes toggle…). Each call performs heavy
 * work: O(N²) beaming clusters, stem-direction forcing, accidental-map
 * generation, tuplet-bracket layout. That's the dominant cost in the 230–304 ms
 * React renders Han observed in DevTools traces.
 *
 * Wrapping the inline call in a `React.memo`-wrapped component lets React skip
 * the entire `renderMelodyNotes(...)` call when all props are shallow-equal.
 * Parent SheetMusic memoises the inputs (melody/offsets/scaleNotes/clef/etc.)
 * so most renders hit the memo cache.
 *
 * IMPORTANT: this component must keep the EXACT same DOM output as the inline
 * call. `useSheetMusicHighlight` mutates `data-measure-index` / `data-mel` /
 * `data-local-slot` attributes on the rendered `<g>`/`<text>` elements (note
 * highlighting). `renderMelodyNotes.jsx` is unchanged; we only wrap it.
 */
const MelodyNotesLayer = ({
  melody,
  numAccidentals,
  startX,
  noteWidth,
  allOffsets,
  staff,
  staffYStart,
  noteGroupSize,
  measureLengthSlots,
  timeSignature,
  clef,
  noteColoringMode,
  tonic,
  scaleNotes,
  processedChords,
  theme,
  inputTestState,
  previewMode,
  pixelsPerTick,
  startMeasureIndex,
  transpositionSemitones,
  debugMode,
  interactive,
  courtesyAccidentals,
  percussionVoiceSplit,
}) => {
  if (!melody) return null;
  return (
    <>
      {renderMelodyNotes(
        melody,
        numAccidentals,
        startX,
        noteWidth,
        allOffsets,
        staff,
        staffYStart,
        noteGroupSize,
        measureLengthSlots,
        timeSignature,
        clef,
        noteColoringMode,
        tonic,
        scaleNotes,
        processedChords,
        theme,
        inputTestState,
        previewMode,
        pixelsPerTick,
        startMeasureIndex,
        transpositionSemitones,
        debugMode,
        interactive,
        courtesyAccidentals,
        percussionVoiceSplit,
      )}
    </>
  );
};

export default React.memo(MelodyNotesLayer);
