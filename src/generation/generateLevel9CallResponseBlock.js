import MelodyGenerator from './melodyGenerator';
import { sliceMelodyByRange } from '../utils/melodySlice';

// #693 (Han 2026-08-04, round 6, "genereer sequentieel 4 blokken zoals maat 1 en 2" +
// "just-in-time genereren, dus een halve maat voor een nieuw maatblok in beeld moet komen, wordt
// ze gegenereerd"): Level 9's treble is no longer one melody generated up front for the whole
// level — it's built ONE CALL-RESPONSE BLOCK (2 measures) at a time, via the SAME MelodyGenerator
// every other track uses (§6b/§6c — no hardcoded pattern), mirroring generateLevelBackingChunk.js's
// "pure, JIT-friendly generation" boundary so useLevelTrebleStream.js can schedule it incrementally.
//
// A block is 2 measures: measure 1 (the "call", generated fresh) collapses to a single forced
// whole-rest — silent, invisible unless debug — and measure 2 (the "response") is a VERBATIM COPY
// of measure 1's raw generated notes at the SAME relative offset, one measure later. This is the
// exact transform `restifyOddMeasures`/`duplicateMeasureOneIntoTwo` (App.jsx) used to apply AFTER
// the fact to a whole pre-generated melody; baking it in here at generation time means each block
// is independently randomized (Han: "blok 2 dus andere toonhoogtes dan blok 1") with no separate
// post-process step needed downstream.
//
// PURE: takes everything it needs as arguments, returns one 2-measure Melody-shaped object whose
// offsets are 0-based (relative to the BLOCK, not the level) — the caller (useLevelTrebleStream)
// shifts them into the growing melody's absolute tick-space, same as appendChunk() does for bass.
export function generateLevel9CallResponseBlock({
  scale,
  timeSignature,
  trebleSettings,
  chordProgression,
  chordChunkStartMeasure,
  measureLengthTicks,
  runId,
}) {
  const chordSlice = (chordProgression && chordProgression.notes?.length)
    ? sliceMelodyByRange(chordProgression, measureLengthTicks, 1, chordChunkStartMeasure)
    : null;

  const call = new MelodyGenerator(
    scale,
    1,
    timeSignature,
    trebleSettings,
    chordSlice,
    trebleSettings?.range,
    `${runId}-call`,
  ).generateMelody();

  const notes = [...call.notes];
  const durations = [...call.durations];
  const offsets = [...call.offsets];
  const displayNotes = [...(call.displayNotes || call.notes)];

  // Measure 1 (the call) → collapse to one forced whole-rest, exactly matching
  // App.jsx's restifyOddMeasures (odd measures are always silent/invisible rhythm guides).
  let seenFirst = false;
  for (let i = 0; i < notes.length; i++) {
    if (offsets[i] == null || notes[i] === 'c') continue;
    if (!seenFirst) {
      seenFirst = true;
      notes[i] = 'r'; durations[i] = measureLengthTicks; displayNotes[i] = 'r';
    } else {
      notes[i] = 'c'; durations[i] = null; offsets[i] = null; displayNotes[i] = 'c';
    }
  }

  // Measure 2 (the response) → the call's ORIGINAL raw notes (before collapsing), shifted one
  // measure later, so it's playable content: the exact pitches the wizard just cast.
  const responseNotes = [...call.notes];
  const responseDurations = [...call.durations];
  const responseOffsets = call.offsets.map((o) => (o == null ? o : o + measureLengthTicks));
  const responseDisplayNotes = [...(call.displayNotes || call.notes)];

  return {
    notes: [...notes, ...responseNotes],
    durations: [...durations, ...responseDurations],
    offsets: [...offsets, ...responseOffsets],
    displayNotes: [...displayNotes, ...responseDisplayNotes],
    rhythmicGrouping: call.rhythmicGrouping ?? null,
  };
}

export default generateLevel9CallResponseBlock;
