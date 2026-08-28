import { useEffect, useState } from 'react';
import Melody from '../model/Melody';
import { generateLevelMixedBlock } from '../generation/generateLevelMixedBlock';
import { sliceSongCallResponseBlock } from '../generation/sliceSongCallResponseBlock';
import { TICKS_PER_WHOLE, secondsPerTick } from '../constants/timing';
import playMelodies from '../audio/playMelodies';
import { updateScaleWithMode } from '../theory/scaleHandler';

// Feature (Han 2026-08-24, replacing the earlier "exclude d/e for decorativeWizard levels" fix, §300/§304:
// "why not have the wizard cast a modulation spell before each call-response block? ... the wizard
// alternates between major and minor 'call'"): a `decorativeWizard` level's modulation is now built INTO
// the call-response block cycle itself — one stream owns both jobs (content + modulation) instead of two
// JIT streams (this one and `useLevelKeyModulationStream`) racing over the same treble state. Alternates
// Major/Minor PER BLOCK (same tonic), reusing `updateScaleWithMode` — the SAME function
// `useLevelKeyModulationStream.js`/`setSelectedMode` already use (§6c, not a second mode-switch
// mechanism). Forward-only: already-generated blocks keep whatever mode they were built with, matching
// every other JIT stream in this codebase. Extracted as a pure function (not inlined in the effect below)
// so it has its own direct unit test, mirroring how `generateLevel9CallResponseBlock`/
// `generateLevelBackingChunk` are pulled out for the same reason.
export const blockScaleForCallResponse = (scale, lvl, needsWizard, blockIndex) => (
    (needsWizard && lvl?.decorativeWizard)
        ? updateScaleWithMode({ currentScale: scale, newFamily: 'Diatonic', newMode: blockIndex % 2 === 0 ? 'Major' : 'Minor' })
        : scale
);

// #693 (Han 2026-08-04, round 6, "genereer sequentieel 4 blokken zoals maat 1 en 2" +
// "just-in-time genereren, dus een halve maat voor een nieuw maatblok in beeld moet komen, wordt
// ze gegenereerd"): Level 9's full 8-measure length is 4 independently-randomized 2-measure
// call-response blocks (measure 2b = silent call/rest, measure 2b+1 = the real response), grown
// incrementally instead of generated once up front — mirrors useLevelBackingStream.js's proven
// JIT-chunk-append pattern (same StrictMode-safe mount/cleanup discipline, same `appendChunk`-shaped
// growth) but for treble, with its own wizard-cast-preview scheduling (each newly-arrived Wizard
// block schedules ONLY its own cast — the OLD one-shot "reschedule the whole melody on every change"
// effect this replaced is gone, see App.jsx).
//
// #867 rework round 3 (Han 2026-08-20, "in generate melodies in de gewone bladmuziek is deze logica
// allang geimplementeerd... hergebruik bestaande logica"): GENERALIZED beyond Level 9/Wizard-only —
// this hook now drives ANY level's treble via `generateLevelMixedBlock` (§6c, the SAME generalized
// per-block generator `useLevelMixedStream.js` already uses: `blockType: 'Wizard'` → the call-response
// shape via `generateLevel9CallResponseBlock`; anything else → a PLAIN block through the ordinary
// MelodyGenerator, exactly like a normal side-scroll level's treble). No third generation mechanism
// invented — the plain branch already existed for Level 10's Slime-type blocks, just never used for a
// level whose ENTIRE length is plain blocks (Level 3's actual bug: `onWaveCleared` used to call the
// UNRELATED `randomizeAll`-based `regenerate()`, which throws away and rebuilds the whole melody as an
// independent "new level start" each wave — re-showing the lead-in, re-triggering "song end" after
// every 2-measure wave, and leaving an audible/visual gap while it regenerated. This hook's JIT
// one-block-ahead growth has none of those problems: content simply keeps flowing, seamlessly, for as
// long as the level stays active — see `loopForever` below).
//
// `loopForever` (Han: "ik wil DYNAMISCH genereren, op basis van hoe het gaat" — content must never run
// out while a gated level can freeze for an arbitrary real-time duration): mirrors
// `useLevelBackingStream.js`'s own `loopForever` exactly — for a `gatedScroll` level, blocks are
// generated FOREVER (never stop at the level's own declared length). The chord LOOKUP wraps back into
// the level's own declared content range (same `% totalContentMeasures` bass already uses) so a short
// chord progression never runs dry, but each block's NOTES are still freshly randomized per block
// (`runId` differs every time) — so the harmony loops, the actual melody never literally repeats.
//
// This hook OWNS the growing treble Melody (fed to MelodyProvider in place of `melodies.treble` while
// this level is active) AND the wizard-cast audio for each Wizard-type block as it arrives.
export default function useLevelTrebleStream({
  active,           // level.active && (see App.jsx's activation condition for which levels use this hook)
  lvl,              // level.current
  scale,
  timeSignature,
  trebleSettings,
  chordProgression,
  context,
  levelAudioStart,
  wizardInstrument = null, // the Soundfont instance (App.jsx's wizardPreviewRef.current) — OPTIONAL now;
                           // only required/used when the level's blocks are actually Wizard-type.
  wizardVolume,     // App.jsx's LEVEL_BACKING_VOLUME — same gain the old one-shot effect used
  stopFnsRef,       // dedicated ref (App.jsx's wizardPreviewStopFnsRef) — NOT the shared backing one
  // #1155 (Han 2026-08-24, "waarom is er geen call-response optie bij de liederen?"): the song's OWN,
  // ALREADY-LOADED melody (App.jsx's `melodies.treble`, as `handleLoadSong` set it — never this hook's
  // own output, which for a call-response song WOULD BE that melody already transformed). Only read
  // when `lvl.songId` is set; ignored for procedurally-generated levels. `null` until the song has
  // actually finished loading — see the `isSongCallResponse` early-return below, mirroring the
  // `wizardInstrument`-not-ready gate this hook already has.
  songMelody = null,
  // #1102 (adaptive tempo, letter 'i'): the shared tempo controller (useAdaptiveTempo.js) and the level's
  // LIVE combat stats. Both are refs/stable objects and deliberately NOT in this effect's dependency
  // array — subscribing to `stats` would tear down and rebuild the whole JIT schedule on every single
  // hit/miss, which is exactly why `statsRef` exists (useLevel.js, same activeRef/currentRef convention).
  // Only meaningful when `lvl.adaptive`; both default to null so every other caller is unaffected.
  adaptiveTempo = null,
  statsRef = null,
}) {
  const [treble, setTreble] = useState(() => Melody.defaultTrebleMelody());
  // A level's blocks are UNIFORMLY one type for the whole level (unlike Mixed, which alternates per
  // block via its own `blockTypeAt`) — Wizard-enemy levels get the call-response shape, everything
  // else gets a plain block, same as a normal level's treble.
  const blockType = lvl?.enemyType === 'Wizard' ? 'Wizard' : 'Slime';
  const needsWizard = blockType === 'Wizard';
  // #1155: a call-response level with a songId SLICES the song's own measures instead of generating new
  // content (that's variant H, #1154, a separate feature) — see sliceSongCallResponseBlock.js's own
  // comment for the full contract this shares with generateLevel9CallResponseBlock.
  const isSongCallResponse = needsWizard && !!lvl?.songId;

  // See useLevelBackingStream.js's identical comment: StrictMode double-invokes this effect
  // (mount → cleanup → mount) in dev — cleanup must fully undo THIS run's pending timers and
  // already-scheduled audio so the second mount can safely redo everything from scratch.
  useEffect(() => {
    if (!active || !lvl?.sideScroll || levelAudioStart == null || !context) return;
    if (needsWizard && !wizardInstrument) return;   // only Wizard-type blocks need the cast instrument ready
    if (isSongCallResponse && !songMelody?.notes?.length) return;   // wait for the song to actually load

    setTreble(Melody.defaultTrebleMelody());

    const startBpm = lvl.bpm || 80;
    const barBeats = timeSignature[0] || 4;
    const measureLengthTicks = (TICKS_PER_WHOLE * barBeats) / (timeSignature[1] || 4);
    // Bug fix (Han 2026-08-06, "de 6/8 maatsoort zorgt dat alles misloopt") — see useLevelBackingStream.js
    // for the full explanation: bar duration must derive from ticks (denominator-correct), not
    // beats×denominator-agnostic quarter-seconds.
    // #1102: now a FUNCTION of bpm rather than one constant for the whole level — an adaptive level's bar
    // duration changes when its tempo does, so each block is placed at `previous block start + its OWN
    // blockMeasures × barSec`, an accumulated cursor instead of `blockIndex × blockMeasures × barSec`.
    // Identical arithmetic for every non-adaptive level (the bpm never changes, so the accumulation and
    // the multiplication produce the same numbers).
    const barSecAt = (b) => measureLengthTicks * secondsPerTick(b);
    // The LEAD-IN always plays at the level's own starting tempo: no adaptive commit can exist before the
    // first block has been graded, and both streams derive `contentStartTime` from this same expression,
    // so their content clocks start from the identical instant.
    const leadInBarSec = barSecAt(startBpm);
    // #1101 (split from #1087): a Wizard block's length is `2 x callResponseMeasures` (1 call group +
    // 1 response group of that same size — was hardcoded to exactly 2 = 1+1). `lvl.callResponseMeasures`
    // is set by the d/e level-variant letters (levels.js's `applyLevelVariant`); levels.json entries that
    // author `enemyType: 'Wizard'` directly (9-11) never set it, so `?? 1` preserves their exact existing
    // 1+1 behavior. A plain (Slime-type) block uses the level's OWN per-wave measure count
    // (`lvl.numMeasures` — the same value combat/wave-clearing already paces by, §6c: one shared value,
    // not a second block-size concept).
    const blockMeasures = needsWizard ? (lvl.callResponseMeasures ?? 1) * 2 : (lvl.numMeasures || 2);
    const totalContentMeasures = lvl.totalMeasures ?? lvl.numMeasures;   // level's TRUE full length
    // #867 rework round 3: a gated level's content never runs out (mirrors useLevelBackingStream's
    // own `loopForever` exactly) — the player may freeze on any note for an arbitrary real-time
    // duration, so a FIXED block count would eventually leave the level stuck with nothing left to
    // generate, exactly the bug this fix addresses.
    const loopForever = !!lvl.gatedScroll;
    // #1155: `totalContentMeasures` means two DIFFERENT things depending on the source. For a
    // procedurally-generated level it's the level's own declared PLAYBACK length, already inclusive of
    // the call+response doubling (levels.js bakes that in via numRepeats — §296/§1101) — so dividing by
    // `blockMeasures` (call+response combined) gives the right block count. For a SONG, it's backfilled
    // from the song's own real, undoubled measure count (`songDef.numMeasures` — normalizeLevel) — the
    // whole point is to cover every one of THOSE measures once each, so the block count must divide by
    // the CALL's own length only (`callResponseMeasures`), not the combined call+response length, or the
    // back half of the song would silently never play.
    const totalBlocks = loopForever ? Infinity
      : isSongCallResponse ? Math.ceil(totalContentMeasures / (lvl.callResponseMeasures ?? 1))
      : Math.ceil(totalContentMeasures / blockMeasures);
    const runId = `${levelAudioStart}`;
    // #1102: `useLevelBackingStream`'s own chunk cadence — needed here (not there) because THIS stream is
    // the decider: a commit measure must be a boundary of BOTH streams (see commitIndexFor).
    const chunkMeasures = lvl.leadInBars ?? 2;
    // Treble's own tick-0 (a block's offset 0) is NOT levelAudioStart itself — the level's
    // lead-in (measures -1/0 and, since #994, possibly more) plays first, same anchor bass/metronome
    // use (useLevelBackingStream.js) and the OLD one-shot wizard-preview effect this replaces used
    // (`levelAudioStart + leadInSeconds`).
    // #994: per-level lead-in (was the fixed LEVEL_LEAD_IN_BARS constant).
    const leadInBars = lvl.leadInBars ?? 2;
    const contentStartTime = levelAudioStart + leadInBars * leadInBarSec;
    // #994 (decision D): a block must EXIST before its notes can enter the right edge of the screen,
    // which happens `visibleMeasures` measures before it sounds.
    const lookaheadMeasures = Math.max(blockMeasures, lvl.visibleMeasures ?? blockMeasures);

    let growingTreble = new Melody([], [], [], []);

    const timers = [];
    const ownStopFns = [];   // THIS run's scheduled StopFns — cancelled on cleanup, unlike stopFnsRef
    // #1102: `blockBpm` is passed in per call (was the effect-wide `bpm` const) — an adaptive level's
    // cast audio must sound at the tempo of the block it belongs to, not the level's starting tempo.
    const scheduleAndTrack = (melodies, instruments, scheduledStart, blockBpm) => {
      const before = stopFnsRef.current.length;
      playMelodies(
        melodies, instruments, context, blockBpm, scheduledStart, null, null, null, null,
        { treble: wizardVolume, bass: 0, percussion: 0, chords: 0, metronome: 0 },
        stopFnsRef,
      );
      for (let i = before; i < stopFnsRef.current.length; i++) ownStopFns.push(stopFnsRef.current[i]);
    };

    // #1102: `blockStartTime` is now THREADED THROUGH the recursion (an accumulated audio-time cursor)
    // instead of being recomputed as `contentStartTime + blockIndex * blockMeasures * barSec` — with a
    // tempo that can change between blocks, block k's start is `block k-1's start + block k-1's own
    // measures × ITS OWN bar duration`. Byte-identical placement for a level whose tempo never changes.
    const generateAndScheduleBlock = (blockIndex, blockStartTime) => {
      // #1102: the tempo THIS block is generated and scheduled at, read FRESH here rather than captured
      // once for the whole effect — the same "re-read the live bpm ref at the top of each scheduling
      // unit" pattern `Sequencer.scheduleBlock` already uses per measure (§6c/§6d). A due tempo commit is
      // adopted exactly here, at a block boundary that `commitIndexFor` guaranteed the backing stream
      // also has, so both tracks switch at the identical measure.
      const contentMeasure = blockIndex * blockMeasures;
      const bpm = (lvl.adaptive && adaptiveTempo)
        ? adaptiveTempo.bpmForMeasure(contentMeasure, blockStartTime)
        : startBpm;
      const barSec = barSecAt(bpm);
      // Same lead-measure count SheetRpgLayer uses to gate the projectile's own visibility (§6c:
      // one derived value, never a separately hardcoded "1 measure" here vs. there). Per-block since it
      // is expressed in this block's own bar durations.
      const leadOffsetSeconds = (lvl.wizardSpawnLeadMeasures ?? 1) * barSec;
      // #867 rework round 3: wraps the CHORD LOOKUP back into the level's own declared content range
      // when looping forever (mirrors useLevelBackingStream.js's `contentCovered % numContentMeasures`
      // exactly) — a short chord progression never runs dry past the level's declared length. This does
      // NOT wrap the block's own tick position (`baseTicks`/`blockStartTime` below keep incrementing
      // linearly forever) — only which measure of the (short, repeating) chord progression this block's
      // harmony is drawn from. Each block still gets a UNIQUE `runId`, so the actual NOTES keep varying
      // every time even though the harmony loops underneath — genuinely fresh content, not a repeat.
      const chordChunkStartMeasure = loopForever
        ? (blockIndex * blockMeasures) % Math.max(1, totalContentMeasures)
        : blockIndex * blockMeasures;
      // #1155: a song's call-response SLICES its own measures — no scale/chord/generation params apply
      // (there's nothing to generate), so this branch skips `generateLevelMixedBlock` entirely rather
      // than threading song-only params through a function built for procedural generation.
      let block;
      if (isSongCallResponse) {
        block = sliceSongCallResponseBlock({
          songMelody, groupMeasures: lvl.callResponseMeasures ?? 1, blockIndex, measureLengthTicks,
        });
      } else {
        // See `blockScaleForCallResponse`'s own comment (top of file) — merges Level 11's modulation
        // mechanic into call-response's block cycle instead of running a second, conflicting JIT stream.
        const blockScale = blockScaleForCallResponse(scale, lvl, needsWizard, blockIndex);
        block = generateLevelMixedBlock({
          blockType,
          scale: blockScale,
          timeSignature,
          trebleSettings,
          chordProgression,
          chordChunkStartMeasure,
          blockMeasures,
          measureLengthTicks,
          runId: `${runId}-${blockIndex}`,
        });
      }
      // #1155: the song ran out of measures before `totalBlocks` was reached (a rounding tail, or a
      // song whose length isn't evenly divisible by the group size) — stop here rather than scheduling
      // an empty block and its own (silent) wizard cast.
      if (isSongCallResponse && !block.hasContent) return;

      const baseTicks = blockIndex * blockMeasures * measureLengthTicks;
      growingTreble = appendBlock(growingTreble, block, baseTicks);
      setTreble(growingTreble);

      // Only a Wizard-type block has cast-preview audio to schedule — a plain (Slime-type) block's
      // treble is never auto-played, only shown/graded, same as every other side-scroll level's treble.
      // The whole block is scheduled shifted EARLIER by leadOffsetSeconds — exactly the OLD
      // effect's approach, just applied per-block instead of to the whole melody at once. For the
      // typical wizardSpawnLeadMeasures=1 (leadOffsetSeconds===barSec) this lands the RESPONSE
      // measure's cast exactly on blockStartTime (one measure early = the call/rest measure's own
      // start); the call measure's own (silent, 'r') slot shifts one measure earlier still, which
      // is inaudible and harmless. Only THIS block's 2 measures are scheduled — no
      // cancel-and-reschedule-everything needed since each block's cast is independent and never
      // overlaps another block's.
      if (needsWizard) {
        scheduleAndTrack([block], [wizardInstrument], blockStartTime - leadOffsetSeconds, bpm);
      }

      // #1102: THIS stream is the sole DECIDER for a JIT level — one boundary, one adjustment. It diffs
      // the level's cumulative combat stats against its own previous block-boundary snapshot and, if the
      // tempo should move, records a commit at the next measure index that is a boundary of BOTH this
      // stream and the backing stream. The backing stream never decides; it only ADOPTS at that shared
      // index (see useAdaptiveTempo.js). Reading `statsRef.current` (not a `stats` dependency) is what
      // keeps this from tearing the JIT schedule down on every hit/miss.
      if (lvl.adaptive && adaptiveTempo && statsRef) {
        adaptiveTempo.evaluate({
          stats: statsRef.current,
          fromMeasure: (blockIndex + 1) * blockMeasures,
          units: [blockMeasures, chunkMeasures],
        });
      }

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
        // #1102: the accumulated cursor — this block's own start plus its own measures at its own tempo.
        const nextBlockStartTime = blockStartTime + blockMeasures * barSec;
        if (blockIndex === 0) {
          generateAndScheduleBlock(nextIndex, nextBlockStartTime);
        } else {
          // #994 (decision D): the visibility deadline is when this block's first measure enters the
          // right edge of the screen. For a Wizard-type level, take the EARLIER of that and the cast
          // deadline (below) — Math.min means generation can only ever move EARLIER than the
          // proven-correct #693 timing, so that bug ("vanaf maat 4 komt de muziek van de wizard te
          // laat") cannot regress by construction. A plain (Slime-type) block has no cast to guarantee
          // timing for, so it uses ONLY the visibility deadline (matches `useLevelMixedStream.js`'s own
          // simpler Slime-block timing — no cast-target term to `Math.min` against).
          const visibilityDeadline = nextBlockStartTime - lookaheadMeasures * barSec;
          const generateAt = needsWizard
            ? Math.min(visibilityDeadline, (nextBlockStartTime - leadOffsetSeconds) - 0.5 * barSec)
            : visibilityDeadline;
          const delayMs = Math.max(0, (generateAt - context.currentTime) * 1000);
          timers.push(setTimeout(() => generateAndScheduleBlock(nextIndex, nextBlockStartTime), delayMs));
        }
      }
    };

    generateAndScheduleBlock(0, contentStartTime);

    return () => {
      timers.forEach((t) => clearTimeout(t));
      ownStopFns.forEach((fn) => { try { fn(); } catch { /* already stopped */ } });
    };
  }, [active, lvl, levelAudioStart, context, scale, timeSignature, trebleSettings,
    chordProgression, wizardInstrument, wizardVolume, stopFnsRef, songMelody]);

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
