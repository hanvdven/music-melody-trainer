import MelodyGenerator from './melodyGenerator';
import { sliceMelodyByRange } from '../utils/melodySlice';

// #663 (Han 2026-08-03, "geen hard-coded oplossingen ... gebruik het gewone protocol voor
// generate melody"): a level's bass (cello) is no longer a hardcoded whole-note pattern —
// it's generated through the SAME MelodyGenerator every other track uses, just `chunkMeasures`
// (#994: the level's own derived `leadInBars`, formerly the fixed LEVEL_LEAD_IN_BARS constant)
// measures ("one chunk") at a time, so useLevelBackingStream.js can generate + schedule it
// incrementally (the JIT mechanism Han asked for) instead of the whole level up front.
//
// PURE: takes everything it needs as arguments, returns the two new Melodies. No React,
// no Sequencer, no `this` — mirrors generateNextSeries.js's "pure generation" boundary (§8).
//
// `chordProgression` is the level's already-generated (once, up front — chords don't have the
// staleness problem this file exists to fix) chord Melody; `chordChunkStartMeasure` is the
// 0-based measure offset INTO that chord progression to slice this chunk's harmonic context
// from. The lead-in chunk (measures -1/0) has no chord data of its own (no chords exist for
// negative measures) — callers pass the FIRST content chunk's start (0) so the lead-in cello
// draws roots from the same harmony the piece opens on, the same "reuse the nearest real
// content" principle the old metronome-lead-in duplication used.
export function generateLevelBackingChunk({
  bassScale,
  timeSignature,
  chunkMeasures,
  bassSettings,
  chordProgression,
  chordChunkStartMeasure,
  measureLengthTicks,
  runId,
  // #663 follow-up (Han 2026-08-03, "cello + timpanen vanaf maat -1, metronoom vanaf maat 0"): the
  // metronome's chunk 0 is shorter than bass's — it must NOT sound during measure -1. Defaults to
  // `chunkMeasures` (every OTHER chunk is identical for both tracks); the lead-in chunk passes
  // `chunkMeasures - 1` (just measure 0) from useLevelBackingStream.js.
  metronomeMeasures = chunkMeasures,
}) {
  const chordSlice = (chordProgression && chordProgression.notes?.length)
    ? sliceMelodyByRange(chordProgression, measureLengthTicks, chunkMeasures, chordChunkStartMeasure)
    : null;

  const bass = new MelodyGenerator(
    bassScale,
    chunkMeasures,
    timeSignature,
    bassSettings,
    chordSlice,
    bassSettings.range,
    `${runId}-bass`,
  ).generateMelody();

  let metronome = { notes: [], durations: [], offsets: [], displayNotes: [] };
  if (metronomeMeasures > 0) {
    // Mirrors useMelodyState.js's metronomeGenSettings exactly (§6c — single source of the
    // metronome generation recipe would be nice, but the two calls differ only in numMeasures/
    // runId; duplicating this small settings object is cheaper and clearer than threading it
    // through as a parameter from a hook that has no other reason to know metronome internals).
    const metronomeGenSettings = {
      notesPerMeasure: timeSignature[0],
      smallestNoteDenom: timeSignature[1],
      rhythmVariability: 0,
      enableTriplets: false,
      notePool: ['wh', 'wm', 'wl'],
      playStyle: 'metronome',
      type: 'metronome',
      randomizationRule: 'metronome',
    };
    metronome = new MelodyGenerator(
      null,
      metronomeMeasures,
      timeSignature,
      metronomeGenSettings,
      null,
      null,
      `${runId}-met`,
    ).generateMelody();
  }

  return { bass, metronome };
}

export default generateLevelBackingChunk;
