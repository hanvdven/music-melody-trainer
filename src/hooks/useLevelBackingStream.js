import { useEffect, useState } from 'react';
import Melody from '../model/Melody';
import { generateLevelBackingChunk } from '../generation/generateLevelBackingChunk';
import { TICKS_PER_WHOLE, secondsPerTick } from '../constants/timing';
import playMelodies from '../audio/playMelodies';

// #663 (Han 2026-08-03) — bugs: "metronoom, timpanen, lopen niet exact gelijk met de noten"
// (root cause: bass/metronome were generated ONCE, up front, for the WHOLE level, racing the
// async cello-instrument swap — a stale/short melody could get locked in for the entire level),
// "metronoom enkel hoorbaar in maat 0" (same race — a too-short stale melody), "cello niet
// hoorbaar" (same race, on the bass side).
//
// Fix: bass (cello) + metronome are no longer generated once for the whole level. They grow
// incrementally, `leadInBars` measures ("one chunk") at a time — #994: the level's own derived span,
// formerly the fixed LEVEL_LEAD_IN_BARS constant — via
// generateLevelBackingChunk.js — the SAME MelodyGenerator pipeline every other track uses, no
// hardcoded pattern (Han: "geen hard-coded oplossingen ... gebruik het gewone protocol"). A new
// chunk is generated one chunk-duration BEFORE it's due (a 2-measure buffer, "2+2 maten op
// voorhand") instead of racing anything against instrument readiness. Timpani (percussion) and
// treble are UNCHANGED — timpani stays the Han-authorized hardcoded pattern (his explicit
// instruction: "hard code de timpani voor nu"), scheduled once exactly as before; treble is not
// part of these bugs.
//
// This hook OWNS the growing bass/metronome Melody objects (for SheetMusic's scrollNotationBass
// to render) AND their audio scheduling (via playMelodies, same param shape every other level-
// backing call uses). It does NOT touch timpani/treble.
//
// Lead-in asymmetry (Han: "cello + timpanen vanaf maat -1, metronoom vanaf maat 0"): bass's chunk 0
// covers both lead-in measures (-1 and 0); the metronome's chunk 0 is trimmed to just measure 0 and
// its schedule shifted one bar later — see `metronomeLength`/`metronomeStartTime` below.
//
// #994 (Han 2026-08-14/17, "flexible on screen notes"): the lead-in is no longer a fixed 2 measures —
// it is the level's whole on-screen span (`lvl.leadInBars`, derived from tempo + meter in levels.js),
// which is 4 measures for Kalinka's 2/4. The chunk SIZE also follows `leadInBars`, which is what keeps
// the lookahead exactly one screenful (see `chunkMeasures`).
//
// Han's lead-in rule, after his live Kalinka UAT rejected an earlier draft (2026-08-17): *"alle opmaten
// cello+timpanen. de tweede helft (round up) + metronoom erbij"* — cello (and timpani, built in App.jsx)
// sound through the ENTIRE lead-in, from its very first measure; there are NO silent lead-in measures.
// Only the metronome is staggered, joining for the second half of the lead-in (`lvl.metronomeBars =
// ceil(leadInBars/2)`), which is the generalization of the original 2-bar behaviour above. The rejected
// draft instead left the earliest lead-in measures completely silent and delayed cello/timpani — see the
// REJECTED DESIGN note in levels.js and §248, and do not reintroduce it.
export default function useLevelBackingStream({
  active,          // level.active && !!level.current?.sideScroll
  lvl,             // level.current
  scale,
  timeSignature,
  bassSettings,    // must already be the level's cello settings (useLevel.applyConfig)
  chordProgression,// the level's once-generated chord Melody (melodies.chordProgression)
  context,
  levelAudioStart, // audio-time anchor for measure -1 (App.jsx)
  // #871 follow-up (Han 2026-08-11): the level's cello track now plays through its own dedicated
  // Soundfont (App.jsx's `celloRef`, `LEVEL_CELLO_SLOT`), never `instruments.bass` — so this is simply
  // "is that dedicated instrument constructed yet" (`!!celloRef.current`), not a rebuilt-shared-slot
  // check anymore. Kept as `bassReady` (not renamed) since its role here — gate this effect until the
  // instrument passed as `bassInstrument` actually exists — is unchanged.
  bassReady,
  metronomeReady,  // true only once instruments.metronome is confirmed ready
  // Bug fix (Han 2026-08-10, "het mag echt niet zijn dat de metronoom start voordat de melodie klaar
  // is... die twee mogen nooit onafhankelijk beginnen"): `levelAudioStart` can only be SET after
  // `levelMelodyReady` was true at pick time (App.jsx's anchor-picking effect), but nothing previously
  // stopped THIS effect from scheduling backing audio if `levelMelodyReady` later flipped false again
  // (e.g. a second regenerate racing in) before this effect got to run. Explicit, redundant-by-design
  // gate — directly enforces "these two may never start independently" rather than relying on ordering.
  levelMelodyReady,
  bassInstrument,
  metronomeInstrument,
  stopFnsRef,      // shared levelBackingStopFnsRef — collects every scheduled note's StopFn
}) {
  const [bass, setBass] = useState(() => Melody.defaultBassMelody());
  const [metronome, setMetronome] = useState(() => Melody.defaultMetronomeMelody());

  // #663 follow-up: React 18 StrictMode (main.jsx wraps the app in it) double-invokes every
  // effect in development — mount, cleanup, mount again — to surface exactly this class of bug.
  // The cleanup below must fully undo THIS run's work (cancel its pending generation timers AND
  // its already-scheduled notes, not just clear a "started" flag) so the SECOND mount can safely
  // redo everything from scratch. An earlier version used a `startedForRef` guard to skip
  // re-scheduling the same `levelAudioStart` — but StrictMode's remount reuses the SAME anchor,
  // so that guard silently blocked the remount from ever rescheduling chunk 2 onward: the first
  // mount's pending timer got cancelled by cleanup, and the second mount refused to reschedule it,
  // reproducing the exact "silence after a couple of measures" bug this file exists to fix.
  useEffect(() => {
    if (!active || !lvl?.sideScroll || levelAudioStart == null || !context) return;
    if (!bassReady || !metronomeReady) return;   // wait for the REAL rebuilt instruments — no stale scheduling
    if (!levelMelodyReady) return;   // never start backing audio ahead of/independent from the treble melody

    setBass(Melody.defaultBassMelody());
    setMetronome(Melody.defaultMetronomeMelody());

    const bpm = lvl.bpm || 80;
    const barBeats = timeSignature[0] || 4;
    const measureLengthTicks = (TICKS_PER_WHOLE * barBeats) / (timeSignature[1] || 4);
    // Bug fix (Han 2026-08-06, "de 6/8 maatsoort zorgt dat alles misloopt"): `barSec = (60/bpm) *
    // timeSignature[0]` only works for a QUARTER-note beat (denominator 4) — it silently treated the
    // numerator as if it always counted quarter notes. For 6/8 (denominator 8), each of the 6 counted
    // units is an EIGHTH note, so that formula computed 6 quarter-notes' worth of seconds instead of 6
    // eighth-notes' worth — literally double the real bar length. Fixed to derive bar duration from
    // `measureLengthTicks` (already denominator-correct) via the timing SSOT `secondsPerTick`, not a
    // beats×denominator-agnostic shortcut.
    const barSec = measureLengthTicks * secondsPerTick(bpm);
    // #994: per-level span, replacing the former fixed LEVEL_LEAD_IN_BARS = 2 for all three of its old
    // jobs. Keeping `chunkMeasures === leadInBars` is what preserves the proven lookahead relationship:
    // a chunk's notes become visible at the right edge exactly `leadInBars` measures before they sound
    // (because the visible span IS leadInBars), and chunk k+1 is generated when chunk k starts — i.e.
    // still "generated exactly one screenful ahead", the same guarantee as the original "2+2 maten op
    // voorhand" but now at whatever span the level actually uses.
    const leadInBars = lvl.leadInBars ?? 2;
    // The metronome joins for the second half of the lead-in, rounded up (Han). Cello covers ALL of it.
    const metronomeBars = lvl.metronomeBars ?? Math.ceil(leadInBars / 2);
    const chunkMeasures = leadInBars;
    const bassScale = scale.generateBassScale();
    const runId = `${levelAudioStart}`;

    let growingBass = new Melody([], [], [], []);
    let growingMetronome = new Melody([], [], [], []);

    const timers = [];
    const ownStopFns = [];   // THIS run's scheduled StopFns — cancelled on cleanup, unlike stopFnsRef
    const scheduleAndTrack = (melodies, instruments, scheduledStart, namedInstruments, trackGains) => {
      const before = stopFnsRef.current.length;
      playMelodies(melodies, instruments, context, bpm, scheduledStart, null, null, namedInstruments, null, trackGains, stopFnsRef);
      for (let i = before; i < stopFnsRef.current.length; i++) ownStopFns.push(stopFnsRef.current[i]);
    };

    // chunk 0 = the lead-in (measures -1/0); chunk k >= 1 = content measures, chunkMeasures at a
    // time (clamped for a trailing remainder). Every chunk starts exactly one chunk-duration after
    // the previous one — the uniform grid that makes "generate chunk k+1 when chunk k begins" a
    // fixed 2-measure lookahead buffer for every chunk, including the first.
    const numContentMeasures = lvl.numMeasures;
    const totalChunks = 1 + Math.ceil(numContentMeasures / chunkMeasures);

    const generateAndScheduleChunk = (chunkIndex) => {
      const isLeadIn = chunkIndex === 0;
      const contentCovered = isLeadIn ? 0 : (chunkIndex - 1) * chunkMeasures;
      // #994 (corrected after Han's Kalinka UAT): the lead-in chunk generates the FULL lead-in span for
      // cello — every lead-in measure is scored, none is silent. `chunkMeasures === leadInBars`, so this
      // is the same expression the content chunks use.
      const length = isLeadIn ? leadInBars : Math.min(chunkMeasures, numContentMeasures - contentCovered);
      if (length <= 0) return;

      // #663 follow-up (Han: "cello + timpanen vanaf maat -1, metronoom vanaf maat 0"): the metronome
      // must NOT sound from the very start of the lead-in — it joins later, so its lead-in "chunk" is
      // shorter than bass's. Every later chunk is identical for both tracks.
      // #994: generalized from `chunkMeasures - 1` to `metronomeBars` (= ceil(leadInBars/2), Han's "de
      // tweede helft (round up)"), so the metronome enters halfway through a lead-in of any length. At
      // the original 2-bar lead-in this is 1, reproducing the #663 behaviour exactly.
      const metronomeLength = isLeadIn ? metronomeBars : length;

      const { bass: bassChunk, metronome: metronomeChunk } = generateLevelBackingChunk({
        bassScale,
        timeSignature,
        chunkMeasures: length,
        metronomeMeasures: metronomeLength,
        bassSettings,
        chordProgression,
        // The lead-in has no chord data of its own — reuse the FIRST content chunk's harmony
        // (mirrors the retired metronomeLeadIn.js's "reuse the nearest real content" approach).
        chordChunkStartMeasure: isLeadIn ? 0 : contentCovered,
        measureLengthTicks,
        runId: `${runId}-${chunkIndex}`,
      });

      // Chunk 0's cello starts at the very first lead-in measure (tick 0) — no offset, since the whole
      // lead-in is scored. `chunkIndex * chunkMeasures` is 0 for the lead-in anyway, so this is the same
      // expression for every chunk; kept unified rather than branched (the branch was the rejected draft).
      const baseTicks = chunkIndex * chunkMeasures * measureLengthTicks;
      // #871 follow-up (Han 2026-08-11): grown/published unconditionally again for every side-scroll
      // level — the cello backing no longer needs to skip itself for a no-bass song, since it now plays
      // through its own dedicated instrument/invisible-melody slot (App.jsx) instead of the visible bass
      // staff / `instruments.bass`, so it can no longer bleed into a song that provides no bass.
      growingBass = appendChunk(growingBass, bassChunk, baseTicks);
      setBass(growingBass);
      // The metronome's lead-in chunk starts LATER than bass's — its own tick-timeline is shifted
      // forward to match, so it never sounds during the first half of the lead-in.
      // #994: derived as "the last `metronomeBars` measures of the lead-in" instead of the hardcoded
      // one-measure offset, so it lands correctly for a lead-in of any length.
      const metronomeBaseTicks = isLeadIn
        ? (leadInBars - metronomeBars) * measureLengthTicks
        : baseTicks;
      growingMetronome = appendChunk(growingMetronome, metronomeChunk, metronomeBaseTicks);
      setMetronome(growingMetronome);

      // #994: audio times mirror the tick offsets above exactly. `levelAudioStart` anchors the very FIRST
      // lead-in measure (the visual clock's zero), and the cello is scheduled AT it — so cello/timpani
      // begin exactly when the first lead-in barline appears on screen. Only the metronome is offset,
      // by the same amount as its tick timeline above.
      const chunkStartTime = levelAudioStart + chunkIndex * chunkMeasures * barSec;
      const metronomeStartTime = isLeadIn
        ? chunkStartTime + (leadInBars - metronomeBars) * barSec
        : chunkStartTime;
      // TEMP DEBUG (Han 2026-08-06, "nog steeds niet gelost"): logs chunk 0's actual scheduling moment —
      // compare `context.currentTime` here against App.jsx's "anchor picked" log and SheetRpgLayer's
      // "first unfrozen tick" log to see how much real time passed between the three, and whether
      // `chunkStartTime`/`metronomeStartTime` (what bass/metronome ACTUALLY get scheduled at) match
      // `levelAudioStart` (what the visual clock is anchored to). Remove once diagnosed.
      if (chunkIndex === 0) {
        // eslint-disable-next-line no-console
        console.debug('[LevelTiming] backing chunk 0 scheduling', {
          nowCtxTime: context.currentTime, levelAudioStart, chunkStartTime,
          metronomeStartTime, barSec, leadInBars, metronomeBars,
        });
      }
      if (bassChunk.notes.length) {
        scheduleAndTrack(
          [bassChunk], [bassInstrument], chunkStartTime, { bass: bassInstrument },
          { treble: 0, bass: 1, percussion: 0, chords: 0, metronome: 0 },
        );
      }
      if (metronomeChunk.notes.length) {
        scheduleAndTrack(
          [metronomeChunk], [metronomeInstrument], metronomeStartTime, { metronome: metronomeInstrument },
          { treble: 0, bass: 0, percussion: 0, chords: 0, metronome: 1 },
        );
      }

      // Schedule the NEXT chunk one chunk-duration ahead of when IT is due — i.e. right when
      // this chunk begins playing, giving a constant `chunkMeasures`-measure generation buffer
      // ("2+2 maten op voorhand"). Chunk 0 and chunk 1 both fire immediately (synchronously,
      // one right after the other) since there's no earlier moment to pre-generate chunk 0 from.
      const nextIndex = chunkIndex + 1;
      if (nextIndex < totalChunks) {
        if (chunkIndex === 0) {
          generateAndScheduleChunk(nextIndex);
        } else {
          const delayMs = Math.max(0, (chunkStartTime - context.currentTime) * 1000);
          timers.push(setTimeout(() => generateAndScheduleChunk(nextIndex), delayMs));
        }
      }
    };

    generateAndScheduleChunk(0);

    return () => {
      timers.forEach((t) => clearTimeout(t));
      ownStopFns.forEach((fn) => { try { fn(); } catch { /* already stopped */ } });
    };
  }, [active, lvl, levelAudioStart, context, bassReady, metronomeReady, levelMelodyReady, scale, timeSignature,
    bassSettings, chordProgression, bassInstrument, metronomeInstrument, stopFnsRef]);

  return { bass, metronome };
}

function appendChunk(growing, chunk, baseTicks) {
  const shiftedOffsets = chunk.offsets.map((o) => (o == null ? o : o + baseTicks));
  const next = new Melody(
    [...growing.notes, ...chunk.notes],
    [...growing.durations, ...chunk.durations],
    [...growing.offsets, ...shiftedOffsets],
    [...(growing.displayNotes || growing.notes), ...(chunk.displayNotes || chunk.notes)],
    [...(growing.volumes || []), ...(chunk.volumes || [])],
  );
  next.ties = [...(growing.ties || []), ...(chunk.ties || [])];
  return next;
}
