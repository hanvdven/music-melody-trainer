import { useEffect, useState } from 'react';
import Melody from '../model/Melody';
import MelodyGenerator from '../generation/melodyGenerator';
import { sliceMelodyByRange } from '../utils/melodySlice';
import { updateScaleWithMode } from '../theory/scaleHandler';
import { LEVEL_LEAD_IN_BARS, TICKS_PER_WHOLE, secondsPerTick } from '../constants/timing';

// Level 11 (Han 2026-08-06, "slimes, er staat een groene wizard. die doet elke 2 maten een spell en
// wisselt dan van toonladder (niet van tonic). Wissel tussen majeur en mineur"), confirmed via interview:
// FORWARD-ONLY — a mode switch only affects measures generated AFTER it, already-visible/generated
// measures keep whatever mode they were built with (consistent with how every other JIT stream here
// already works: each chunk reads settings at ITS OWN generation time, never retroactively).
//
// Mirrors useLevelBackingStream.js's JIT-chunk-append pattern almost exactly, but for TREBLE, with no
// cast audio and no call-response transform (Level 11 is otherwise a normal Slime level — only the
// SCALE alternates). Each 2-measure chunk's scale is `updateScaleWithMode` applied to the level's base
// scale (§6c — reuses the app's own mode-switch machinery, the SAME function setSelectedMode calls,
// rather than hand-building a Scale object), alternating Major on even chunks / Minor on odd — tonic is
// whatever the base scale's tonic already is, untouched (`updateScaleWithMode` only ever changes mode).
const chunkMeasures = 2;

export default function useLevelKeyModulationStream({
  active,        // level.active && !!level.current?.decorativeWizard
  lvl,           // level.current
  scale,         // the level's base scale (tonic fixed here; mode alternates per chunk)
  timeSignature,
  trebleSettings,
  chordProgression,
  context,
  levelAudioStart,
}) {
  const [treble, setTreble] = useState(() => Melody.defaultTrebleMelody());

  useEffect(() => {
    if (!active || !lvl?.sideScroll || levelAudioStart == null || !context) return;

    setTreble(Melody.defaultTrebleMelody());

    const bpm = lvl.bpm || 80;
    const barBeats = timeSignature[0] || 4;
    const measureLengthTicks = (TICKS_PER_WHOLE * barBeats) / (timeSignature[1] || 4);
    // Bug fix (Han 2026-08-06, "de 6/8 maatsoort zorgt dat alles misloopt") — see useLevelBackingStream.js.
    const barSec = measureLengthTicks * secondsPerTick(bpm);
    const totalContentMeasures = lvl.numMeasures;
    const totalChunks = Math.ceil(totalContentMeasures / chunkMeasures);
    const runId = `${levelAudioStart}`;
    const contentStartTime = levelAudioStart + LEVEL_LEAD_IN_BARS * barSec;

    let growingTreble = new Melody([], [], [], []);
    const timers = [];

    const generateChunk = (chunkIndex) => {
      const mode = chunkIndex % 2 === 0 ? 'Major' : 'Minor';
      const chunkScale = updateScaleWithMode({ currentScale: scale, newFamily: 'Diatonic', newMode: mode });
      const length = Math.min(chunkMeasures, totalContentMeasures - chunkIndex * chunkMeasures);
      if (length <= 0) return;

      const chordSlice = (chordProgression && chordProgression.notes?.length)
        ? sliceMelodyByRange(chordProgression, measureLengthTicks, length, chunkIndex * chunkMeasures)
        : null;
      const chunk = new MelodyGenerator(
        chunkScale, length, timeSignature, trebleSettings, chordSlice, trebleSettings?.range,
        `${runId}-${chunkIndex}`,
      ).generateMelody();

      const baseTicks = chunkIndex * chunkMeasures * measureLengthTicks;
      growingTreble = appendChunk(growingTreble, chunk, baseTicks);
      setTreble(growingTreble);

      // Bug fix (Han 2026-08-06, "de noten van een volgend blok verschijnen best laat... eerder pas 1
      // maat op voorhand"): matches useLevelBackingStream.js's proven pattern — generate chunk N+1 the
      // INSTANT chunk N begins playing, a constant full `chunkMeasures` (2-measure) lookahead buffer,
      // same as bass/metronome's "2+2 maten op voorhand" and what slimes/notes need to already be
      // visible (`beatsOnScreen`). The old "half a measure before next chunk's start" gave only ~1.5
      // measures.
      const nextIndex = chunkIndex + 1;
      if (nextIndex < totalChunks) {
        if (chunkIndex === 0) {
          generateChunk(nextIndex);
        } else {
          const thisChunkStartTime = contentStartTime + chunkIndex * chunkMeasures * barSec;
          const delayMs = Math.max(0, (thisChunkStartTime - context.currentTime) * 1000);
          timers.push(setTimeout(() => generateChunk(nextIndex), delayMs));
        }
      }
    };

    generateChunk(0);

    return () => { timers.forEach((t) => clearTimeout(t)); };
  }, [active, lvl, levelAudioStart, context, scale, timeSignature, trebleSettings, chordProgression]);

  return { treble };
}

function appendChunk(growing, chunk, baseTicks) {
  const shiftedOffsets = chunk.offsets.map((o) => (o == null ? o : o + baseTicks));
  const next = new Melody(
    [...growing.notes, ...chunk.notes],
    [...growing.durations, ...chunk.durations],
    [...growing.offsets, ...shiftedOffsets],
    [...(growing.displayNotes || growing.notes), ...(chunk.displayNotes || chunk.notes)],
  );
  next.rhythmicGrouping = chunk.rhythmicGrouping ?? growing.rhythmicGrouping ?? null;
  return next;
}
