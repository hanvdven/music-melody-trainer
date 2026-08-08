import { useEffect, useState } from 'react';
import Melody from '../model/Melody';
import { generateLevelMixedBlock } from '../generation/generateLevelMixedBlock';
import { LEVEL_LEAD_IN_BARS, TICKS_PER_WHOLE, secondsPerTick } from '../constants/timing';
import playMelodies from '../audio/playMelodies';

// Level 10 (Han 2026-08-06, "mixed level - stuur 2 maten slimes, dan 2 maten wizard (de gebruikelijke
// rust; speel voor-speel na), dan weer 2 maten slimes, dan weer 2 maten wizard"), confirmed via interview:
// the COMBAT MECHANIC itself alternates per block (wizard blocks get the real Level-9 call-response
// preview audio; slime blocks don't), not just a visual skin. Mirrors useLevelTrebleStream.js's JIT
// per-block generation/scheduling almost exactly — the only real difference is `blockTypeAt` picking
// which of the two existing generation shapes each block uses (generateLevelMixedBlock.js) and only
// scheduling wizard-cast audio for Wizard-type blocks.
//
// This hook OWNS the growing treble Melody (fed to MelodyProvider in place of `melodies.treble` while a
// Mixed level is active) AND the wizard-cast audio for each Wizard block as it arrives. It also exposes
// `blockTypeAt(measureIndex)` so SheetRpgLayer can render each note/slime-vs-projectile according to
// WHICH block it belongs to (a per-item decision, not a level-wide constant like every other enemyType).
const blockMeasures = 2;   // Han's own spec: 2 measures per block, always (not a tunable — see the fixed
                            // "2 maten" wording in the request; a variable block length would need the
                            // Wizard-block generator itself to support >2 measures, which it doesn't).

export const blockTypeAt = (measureIndex) =>
  (Math.floor(Math.max(0, measureIndex) / blockMeasures) % 2 === 0 ? 'Slime' : 'Wizard');

export default function useLevelMixedStream({
  active,           // level.active && lvl?.enemyType === 'Mixed'
  lvl,              // level.current
  scale,
  timeSignature,
  trebleSettings,
  chordProgression,
  context,
  levelAudioStart,
  wizardInstrument,
  wizardVolume,
  stopFnsRef,
}) {
  const [treble, setTreble] = useState(() => Melody.defaultTrebleMelody());

  // Same StrictMode double-invoke discipline as useLevelTrebleStream.js/useLevelBackingStream.js —
  // cleanup fully undoes THIS run's pending timers/scheduled audio so a remount can safely redo
  // everything from scratch.
  useEffect(() => {
    if (!active || !lvl?.sideScroll || levelAudioStart == null || !context || !wizardInstrument) return;

    setTreble(Melody.defaultTrebleMelody());

    const bpm = lvl.bpm || 80;
    const barBeats = timeSignature[0] || 4;
    const measureLengthTicks = (TICKS_PER_WHOLE * barBeats) / (timeSignature[1] || 4);
    // Bug fix (Han 2026-08-06, "de 6/8 maatsoort zorgt dat alles misloopt") — see useLevelBackingStream.js.
    const barSec = measureLengthTicks * secondsPerTick(bpm);
    const totalContentMeasures = lvl.numMeasures;
    const totalBlocks = Math.ceil(totalContentMeasures / blockMeasures);
    const runId = `${levelAudioStart}`;
    const leadOffsetSeconds = (lvl.wizardSpawnLeadMeasures ?? 1) * barSec;
    const contentStartTime = levelAudioStart + LEVEL_LEAD_IN_BARS * barSec;

    let growingTreble = new Melody([], [], [], []);

    const timers = [];
    const ownStopFns = [];
    const scheduleAndTrack = (melodies, instruments, scheduledStart) => {
      const before = stopFnsRef.current.length;
      playMelodies(
        melodies, instruments, context, bpm, scheduledStart, null, null, null, null,
        { treble: wizardVolume, bass: 0, percussion: 0, chords: 0, metronome: 0 },
        stopFnsRef,
      );
      for (let i = before; i < stopFnsRef.current.length; i++) ownStopFns.push(stopFnsRef.current[i]);
    };

    const generateAndScheduleBlock = (blockIndex) => {
      const type = blockTypeAt(blockIndex * blockMeasures);
      const block = generateLevelMixedBlock({
        blockType: type,
        scale,
        timeSignature,
        trebleSettings,
        chordProgression,
        chordChunkStartMeasure: blockIndex * blockMeasures,
        blockMeasures,
        measureLengthTicks,
        runId: `${runId}-${blockIndex}`,
      });

      const baseTicks = blockIndex * blockMeasures * measureLengthTicks;
      growingTreble = appendBlock(growingTreble, block, baseTicks);
      setTreble(growingTreble);

      // Only Wizard blocks get the cast-preview audio (Slime blocks are silent — same as every other
      // side-scroll level's treble, which is never auto-played, only shown/graded).
      if (type === 'Wizard') {
        const blockStartTime = contentStartTime + blockIndex * blockMeasures * barSec;
        scheduleAndTrack([block], [wizardInstrument], blockStartTime - leadOffsetSeconds);
      }

      // Bug fix (Han 2026-08-06, "de noten van een volgend blok verschijnen best laat, niet 2 maten op
      // voorhand; eerder pas 1 maat op voorhand"): this used to schedule the NEXT block's generation
      // relative to ITS OWN cast/start time minus a small buffer (ported from useLevelTrebleStream.js,
      // which needs that because Level 9's cast itself already fires `leadOffsetSeconds` early) — for a
      // Mixed level that shrank the real lookahead to ~1-1.5 measures, well short of the ~2 measures
      // slimes/notes need to already be visible (`beatsOnScreen`). Fixed to match
      // useLevelBackingStream.js's proven pattern instead: generate block N+1 the INSTANT block N begins
      // playing — a constant, full `blockMeasures` (2-measure) lookahead buffer, same as bass/metronome's
      // "2+2 maten op voorhand". The Wizard-block cast's own AUDIO still fires `leadOffsetSeconds` early
      // (unchanged, see scheduleAndTrack above) — only the GENERATION trigger's timing changed.
      const nextIndex = blockIndex + 1;
      if (nextIndex < totalBlocks) {
        if (blockIndex === 0) {
          generateAndScheduleBlock(nextIndex);
        } else {
          const thisBlockStartTime = contentStartTime + blockIndex * blockMeasures * barSec;
          const delayMs = Math.max(0, (thisBlockStartTime - context.currentTime) * 1000);
          timers.push(setTimeout(() => generateAndScheduleBlock(nextIndex), delayMs));
        }
      }
    };

    generateAndScheduleBlock(0);

    return () => {
      timers.forEach((t) => clearTimeout(t));
      ownStopFns.forEach((fn) => { try { fn(); } catch { /* already stopped */ } });
    };
  }, [active, lvl, levelAudioStart, context, scale, timeSignature, trebleSettings,
    chordProgression, wizardInstrument, wizardVolume, stopFnsRef]);

  return { treble };
}

function appendBlock(growing, block, baseTicks) {
  const shiftedOffsets = block.offsets.map((o) => (o == null ? o : o + baseTicks));
  const next = new Melody(
    [...growing.notes, ...block.notes],
    [...growing.durations, ...block.durations],
    [...growing.offsets, ...shiftedOffsets],
    [...(growing.displayNotes || growing.notes), ...(block.displayNotes || block.notes)],
  );
  next.rhythmicGrouping = block.rhythmicGrouping ?? growing.rhythmicGrouping ?? null;
  return next;
}
