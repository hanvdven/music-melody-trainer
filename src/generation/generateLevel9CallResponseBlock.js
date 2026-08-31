import MelodyGenerator from './melodyGenerator';
import { sliceMelodyByRange } from '../utils/melodySlice';

// Extracted (#1155, Han 2026-08-24 — call-response for songs) so `sliceSongCallResponseBlock.js` can
// reuse the EXACT same "collapse a call group to per-measure rests" transform instead of a second copy
// (§6c) — this was previously inlined directly in `generateLevel9CallResponseBlock` below. PURE: mutates
// nothing, returns new parallel arrays. See the original inline comment (preserved below) for the full
// rationale of why this collapses PER MEASURE and re-anchors each rest to its own measure's downbeat.
export function collapseToCallRests(notes, durations, offsets, displayNotes, measureLengthTicks) {
  const callNotes = [...notes];
  const callDurations = [...durations];
  const callOffsets = [...offsets];
  const callDisplayNotes = [...displayNotes];
  const seenFirstInMeasure = new Set();
  for (let i = 0; i < callNotes.length; i++) {
    if (callOffsets[i] == null || callNotes[i] === 'c') continue;
    const measureIdx = Math.floor(callOffsets[i] / measureLengthTicks);
    if (!seenFirstInMeasure.has(measureIdx)) {
      seenFirstInMeasure.add(measureIdx);
      callNotes[i] = 'r'; callDurations[i] = measureLengthTicks; callDisplayNotes[i] = 'r';
      callOffsets[i] = measureIdx * measureLengthTicks;
    } else {
      callNotes[i] = 'c'; callDurations[i] = null; callOffsets[i] = null; callDisplayNotes[i] = 'c';
    }
  }
  return { notes: callNotes, durations: callDurations, offsets: callOffsets, displayNotes: callDisplayNotes };
}

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
  // #1101 (split from #1087, Han 2026-08-23): was hardcoded to exactly 1 measure of call + 1 measure of
  // response — now a parameter so the a-h level-variant letters (d=1 measure, e=2 measures) can reuse
  // this SAME generator instead of a second call-response mechanism (CLAUDE.md §6c). Level 9-11's own
  // levels.json config and Level 10's useLevelMixedStream.js (fixed 2-measure blocks) both omit this,
  // so they keep their exact existing 1+1 behavior unchanged.
  groupMeasures = 1,
}) {
  const chordSlice = (chordProgression && chordProgression.notes?.length)
    ? sliceMelodyByRange(chordProgression, measureLengthTicks, groupMeasures, chordChunkStartMeasure)
    : null;

  const call = new MelodyGenerator(
    scale,
    groupMeasures,
    timeSignature,
    trebleSettings,
    chordSlice,
    trebleSettings?.range,
    `${runId}-call`,
  ).generateMelody();

  // The call → collapse to a forced whole-rest PER MEASURE (a rest can't span a barline, so a
  // multi-measure call — #1101, groupMeasures>1 — needs one rest per measure, not one giant rest
  // spanning all of them), exactly matching App.jsx's restifyOddMeasures (odd measures are always
  // silent/invisible rhythm guides). The rest is explicitly RE-ANCHORED to its measure's own downbeat
  // rather than left at wherever the first live slot happened to land — a measure doesn't necessarily
  // have a note AT its own downbeat (a leading rest, or a tie continuing in from the previous measure),
  // and a whole-rest starting anywhere but its measure's true start would be nonsensical notation.
  // (#1155: extracted to `collapseToCallRests` so the song-based call-response path reuses it verbatim.)
  const { notes, durations, offsets, displayNotes } = collapseToCallRests(
    call.notes, call.durations, call.offsets, call.displayNotes || call.notes, measureLengthTicks,
  );

  // The response → the call's ORIGINAL raw notes (before collapsing), shifted by the WHOLE call group's
  // length (groupMeasures measures — #1101, was hardcoded to exactly one measure), so it's playable
  // content: the exact pitches the wizard just cast.
  const responseNotes = [...call.notes];
  const responseDurations = [...call.durations];
  const responseOffsets = call.offsets.map((o) => (o == null ? o : o + groupMeasures * measureLengthTicks));
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
