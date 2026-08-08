import { useEffect, useState } from 'react';
import Melody from '../model/Melody';
import { generateLevel9CallResponseBlock } from '../generation/generateLevel9CallResponseBlock';
import { LEVEL_LEAD_IN_BARS, TICKS_PER_WHOLE, secondsPerTick } from '../constants/timing';
import playMelodies from '../audio/playMelodies';

// #693 (Han 2026-08-04, round 6, "genereer sequentieel 4 blokken zoals maat 1 en 2" +
// "just-in-time genereren, dus een halve maat voor een nieuw maatblok in beeld moet komen, wordt
// ze gegenereerd"): Level 9's full 8-measure length is 4 independently-randomized 2-measure
// call-response blocks (measure 2b = silent call/rest, measure 2b+1 = the real response — see
// generateLevel9CallResponseBlock.js), grown incrementally instead of generated once up front —
// mirrors useLevelBackingStream.js's proven JIT-chunk-append pattern (same StrictMode-safe
// mount/cleanup discipline, same `appendChunk`-shaped growth) but for treble, with its own
// generation function and its own wizard-cast-preview scheduling (each newly-arrived block
// schedules ONLY its own cast — the OLD one-shot "reschedule the whole melody on every change"
// effect this replaced is gone, see App.jsx).
//
// This hook OWNS the growing treble Melody (fed to MelodyProvider in place of `melodies.treble`
// while Level 9 is active) AND the wizard-cast audio for each block as it arrives.
export default function useLevelTrebleStream({
  active,           // level.active && lvl?.enemyType === 'Wizard'
  lvl,              // level.current
  scale,
  timeSignature,
  trebleSettings,
  chordProgression,
  context,
  levelAudioStart,
  wizardInstrument, // the Soundfont instance (App.jsx's wizardPreviewRef.current)
  wizardVolume,     // App.jsx's LEVEL_BACKING_VOLUME — same gain the old one-shot effect used
  stopFnsRef,       // dedicated ref (App.jsx's wizardPreviewStopFnsRef) — NOT the shared backing one
}) {
  const [treble, setTreble] = useState(() => Melody.defaultTrebleMelody());

  // See useLevelBackingStream.js's identical comment: StrictMode double-invokes this effect
  // (mount → cleanup → mount) in dev — cleanup must fully undo THIS run's pending timers and
  // already-scheduled audio so the second mount can safely redo everything from scratch.
  useEffect(() => {
    if (!active || !lvl?.sideScroll || levelAudioStart == null || !context || !wizardInstrument) return;

    setTreble(Melody.defaultTrebleMelody());

    const bpm = lvl.bpm || 80;
    const barBeats = timeSignature[0] || 4;
    const measureLengthTicks = (TICKS_PER_WHOLE * barBeats) / (timeSignature[1] || 4);
    // Bug fix (Han 2026-08-06, "de 6/8 maatsoort zorgt dat alles misloopt") — see useLevelBackingStream.js
    // for the full explanation: bar duration must derive from ticks (denominator-correct), not
    // beats×denominator-agnostic quarter-seconds.
    const barSec = measureLengthTicks * secondsPerTick(bpm);
    const blockMeasures = 2;   // 1 call (rest) + 1 response (real) measure per block
    const totalContentMeasures = lvl.numMeasures;   // level's full length (8) — see levels.json
    const totalBlocks = Math.ceil(totalContentMeasures / blockMeasures);
    const runId = `${levelAudioStart}`;
    // Same lead-measure count SheetRpgLayer uses to gate the projectile's own visibility (§6c:
    // one derived value, never a separately hardcoded "1 measure" here vs. there).
    const leadOffsetSeconds = (lvl.wizardSpawnLeadMeasures ?? 1) * barSec;
    // Treble's own tick-0 (a block's offset 0) is NOT levelAudioStart itself — the level's
    // lead-in (measures -1/0, LEVEL_LEAD_IN_BARS) plays first, same anchor bass/metronome use
    // (useLevelBackingStream.js) and the OLD one-shot wizard-preview effect this replaces used
    // (`levelAudioStart + leadInSeconds`).
    const contentStartTime = levelAudioStart + LEVEL_LEAD_IN_BARS * barSec;

    let growingTreble = new Melody([], [], [], []);

    const timers = [];
    const ownStopFns = [];   // THIS run's scheduled StopFns — cancelled on cleanup, unlike stopFnsRef
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
      const block = generateLevel9CallResponseBlock({
        scale,
        timeSignature,
        trebleSettings,
        chordProgression,
        chordChunkStartMeasure: blockIndex * blockMeasures,
        measureLengthTicks,
        runId: `${runId}-${blockIndex}`,
      });

      const baseTicks = blockIndex * blockMeasures * measureLengthTicks;
      growingTreble = appendBlock(growingTreble, block, baseTicks);
      setTreble(growingTreble);

      // block's own tick-0 (its call/rest measure) plays at this absolute time.
      const blockStartTime = contentStartTime + blockIndex * blockMeasures * barSec;
      // The whole block is scheduled shifted EARLIER by leadOffsetSeconds — exactly the OLD
      // effect's approach, just applied per-block instead of to the whole melody at once. For the
      // typical wizardSpawnLeadMeasures=1 (leadOffsetSeconds===barSec) this lands the RESPONSE
      // measure's cast exactly on blockStartTime (one measure early = the call/rest measure's own
      // start); the call measure's own (silent, 'r') slot shifts one measure earlier still, which
      // is inaudible and harmless. Only THIS block's 2 measures are scheduled — no
      // cancel-and-reschedule-everything needed since each block's cast is independent and never
      // overlaps another block's.
      scheduleAndTrack([block], [wizardInstrument], blockStartTime - leadOffsetSeconds);

      // #693 (Han 2026-08-04, bug: "vanaf maat 4 komt de muziek van de wizard te laat, ongeveer
      // een halve maat"): the NEXT block's own cast fires `leadOffsetSeconds` (1 measure) BEFORE
      // its blockStartTime, not AT it — generating "half a measure before the block visually
      // starts" left only `leadOffsetSeconds - 0.5*barSec` = HALF A MEASURE of slack before that
      // cast's target time was due. Once a later block's generation (chained through prior
      // setTimeout delays, not the synchronous block-0-triggers-block-1 path) landed even slightly
      // after that target, `playMelodies`'s own `adjustedStart = Math.max(scheduledStart,
      // context.currentTime + safetyBuffer)` clamp (playMelodies.js) silently pulled the cast
      // forward to "now" instead of erroring — audible as a late, sluggish cast rather than a
      // crash. Fix: schedule generation half a measure before the CAST's own target time (which is
      // already `leadOffsetSeconds` earlier than blockStartTime), not half a measure before the
      // block's visual start — guarantees a real buffer regardless of `wizardSpawnLeadMeasures`.
      const nextIndex = blockIndex + 1;
      if (nextIndex < totalBlocks) {
        if (blockIndex === 0) {
          generateAndScheduleBlock(nextIndex);
        } else {
          const nextCastTarget = contentStartTime + nextIndex * blockMeasures * barSec - leadOffsetSeconds;
          const delayMs = Math.max(0, (nextCastTarget - 0.5 * barSec - context.currentTime) * 1000);
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
