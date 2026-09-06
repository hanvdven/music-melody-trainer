import { useEffect, useRef } from 'react';
import { TICKS_PER_WHOLE, secondsPerTick } from '../constants/timing';
import { TIMPANI_BEAT_PATTERN } from '../utils/timpaniPattern';
import playSound from '../audio/playSound';

// #1096 (Han 2026-08-20, "in rubato mode wil ik dat de cello niet speelt aan metronoom tempo... hou de
// noot aan, totdat de tijdslijn de end event passeert"): for a GATED level, cello and timpani stop being
// pre-scheduled against a fixed AudioContext-time clock (`useLevelBackingStream.js`'s own chunk schedule,
// and App.jsx's one-shot timpani `playMelodies` call — both explicitly excluded for `gatedScroll` levels
// now, see their own comments) and are instead triggered HERE, in real time, off the exact same
// frozen-aware clock (`gatedElapsedMsRef`, written every rAF frame by SheetRpgLayer) that already drives
// the visual scroll freeze/resume — so audio and gate can never disagree about "has this measure/beat
// actually arrived yet".
//
// Cello: always exactly 1 whole note per measure (LEVEL_BASS_SIMPLE/LEVEL_BASS_DEFAULT, verified —
// notesPerMeasure:1, smallestNoteDenom:1), so "hold until the measure boundary" is the complete rule —
// no per-note-within-measure logic needed. The currently-sounding note is explicitly stopped (via
// `instrument.stop()` — NOT the StopFn `.start()` returns, which only cancels a still-PENDING future
// dispatch, not an already-sounding voice) the INSTANT the elapsed clock crosses into the next measure
// slot, and the next measure's note starts at that same instant — never two cello notes ringing at once,
// never a gap.
//
// Timpani: each of `TIMPANI_BEAT_PATTERN`'s per-beat hits (beat 1/2/3, matching Han's "tel 3 wacht rustig
// tot tel 3 komt") fires independently the instant the elapsed clock crosses into ITS OWN beat slot —
// confirmed by Han: no dependency on what happened on an earlier beat in the same measure.
//
// This hook OWNS no growing Melody of its own — it reads the cello content `useLevelBackingStream` is
// ALREADY generating (JIT, one chunk ahead) and simply changes WHEN each note is triggered, never what
// content exists. Timpani's pitch sequence is the same deterministic, Han-authorized hardcoded pattern
// (`timpaniPattern.js`) every other level already uses — looked up per-beat here instead of pre-built into
// a whole-piece Melody object, since gate-driven triggering has no fixed "whole piece" to pre-generate.
//
// #1120: this hook is no longer only for levels that AUTHOR `gatedScroll`. The adaptive ladder can
// switch a PROCEDURAL level into gated pacing at its bpm floor, at which point App.jsx turns this
// hook's `active` on mid-level (see its combined `gatedNow` value). Two consequences, both handled
// below: the tempo is then the ladder's FLOOR rather than `lvl.bpm`, and the elapsed clock this reads
// has already crossed several tempo changes — see `bpmRef` and SheetRpgLayer's `gateTempoAnchorRef`.
export default function useLevelGatedRubatoAudio({
  active,             // level.active && !level.done && gatedNow && !!lvl?.sideScroll
  lvl,                // level.current
  timeSignature,
  context,
  levelAudioStart,
  gatedElapsedMsRef,  // SheetRpgLayer's frozen-aware, tempo-normalized elapsed-ms ref (App.jsx owns it)
  bpmRef,             // #1120: App's live tempo ref — the SINGLE source of truth for "the bpm now"
  bassMelody,         // useLevelBackingStream's growing `bass` Melody (cello content)
  bassInstrument,     // celloRef.current
  timpaniInstrument,  // timpaniRef.current — null/undefined when percussion isn't melodic
  bassVolume,
  percussionVolume,
}) {
  // Mutable, not React state — this is written/read every rAF frame (§6, same convention as every other
  // per-frame value in this codebase: element/audio writes via refs, never setState per frame).
  const rubatoStateRef = useRef({ measureSlot: -1, beatKey: null });

  // Bug fix (Han 2026-08-21, "elke volgende maat een EXTRA cello... het 'afzetten' werkt nog niet"): the
  // main effect below used to depend on `bassMelody` directly. `useLevelBackingStream`'s own `bass` state
  // gets a BRAND NEW Melody object every time it appends a JIT chunk (`loopForever`, so this happens
  // continuously for as long as a gated level stays active) — each append re-ran this ENTIRE effect, which
  // cancels the raf loop, resets `rubatoStateRef` to `-1`, and tears down. On the very next frame the reset
  // state (`-1`) no longer matches the current measure, so the loop's own "measure changed" branch fires
  // AGAIN mid-measure: it correctly calls `bassInstrument.stop()` on the already-sounding voice, but that
  // stop applies a 300ms release ramp (`ampRelease`, see the loop's own comment on `.stop()`) — so for
  // ~300ms the fading-out old voice and the freshly re-triggered new voice of the SAME note ring together,
  // audible as "an extra cello". This was never a broken stop mechanism (verified against smplr's own
  // VoiceManager.stopAll — it correctly stops every active voice); it was the effect restarting far more
  // often than the raf loop it owns should ever be torn down. Fix: read the growing melody through a ref
  // that a SEPARATE, cheap effect keeps current, so the main effect (and its raf loop) is no longer in
  // `bassMelody`'s dependency chain at all — new content becomes visible to the loop on its very next
  // frame without restarting anything.
  const bassMelodyRef = useRef(bassMelody);
  useEffect(() => { bassMelodyRef.current = bassMelody; }, [bassMelody]);

  useEffect(() => {
    if (!active || levelAudioStart == null || !context || !bassInstrument || !bassMelodyRef.current) return;

    rubatoStateRef.current = { measureSlot: -1, beatKey: null };

    const barBeats = timeSignature[0] || 4;
    // Tempo-INDEPENDENT, so it stays here at effect level: a measure is the same number of ticks at
    // every bpm.
    const measureLengthTicks = (TICKS_PER_WHOLE * barBeats) / (timeSignature[1] || 4);
    // #1120: `barMs`/`beatMs` are NO LONGER computed once from a captured `lvl.bpm` — they are derived
    // from the LIVE bpm inside the rAF loop below (`msPerBar`/`msPerBeat`). WHY: a ladder-gated level
    // reaches this hook at the adaptive FLOOR tempo, not at `lvl.bpm`, so the captured value would put
    // the cello on a measure of the wrong length and it would sing a different bar than the one on
    // screen. This is the same "re-read the live value at the top of each scheduling unit" pattern
    // `useLevelContentStream` already uses per block and `Sequencer.scheduleBlock` per measure.
    // `bpmRef` is a REF on purpose and is NOT in the dependency array: adding the bpm STATE would
    // restart this effect on every tempo change, which is precisely the #1096 "extra cello" bug.
    //
    // Bug fix (Han 2026-08-06, "de 6/8 maatsoort zorgt dat alles misloopt") — see
    // useLevelContentStream.js for the full explanation: bar duration must derive from ticks
    // (denominator-correct), not a beats×denominator-agnostic quarter-seconds shortcut.
    const msPerBar = (b) => measureLengthTicks * secondsPerTick(b) * 1000;
    // `TIMPANI_BEAT_PATTERN` is indexed by QUARTER-note position within the measure (`timpaniPattern.js`'s
    // own `QUARTER = TICKS_PER_WHOLE/4`), independent of the meter's own counted beat unit — e.g. for 6/8
    // (denominator 8) `timeSignature[0]` counts EIGHTH notes, but the pattern still steps in quarters. Using
    // `barBeats`-based division here would silently desync from `buildTimpaniPattern`'s own indexing for any
    // non-quarter-beat meter (exactly the #1044 bug class) — so beat length is derived from a quarter note
    // directly, matching that function's own math, not re-derived from `timeSignature[0]`.
    const msPerBeat = (b) => (TICKS_PER_WHOLE / 4) * secondsPerTick(b) * 1000;

    // The cello note whose absolute tick range [measureSlot*measureLengthTicks, +measureLengthTicks)
    // contains this measure's content — mirrors `sliceMelodyByRange`'s own range-membership test
    // (melodySlice.js), scoped to a single measure instead of a multi-measure chunk.
    const cellNoteForMeasure = (measureSlot) => {
      const lo = measureSlot * measureLengthTicks;
      const hi = lo + measureLengthTicks;
      const { notes, offsets } = bassMelodyRef.current;
      for (let i = 0; i < offsets.length; i++) {
        const o = offsets[i];
        if (o != null && o >= lo && o < hi) return notes[i];
      }
      return null;
    };

    let raf;
    const loop = () => {
      const elapsedMs = gatedElapsedMsRef?.current;
      if (typeof elapsedMs === 'number' && elapsedMs >= 0) {
        const st = rubatoStateRef.current;
        // #1120: the LIVE tempo, re-read every frame. Paired with SheetRpgLayer's tempo-NORMALIZED
        // `gatedElapsedMsRef` (whose contract is "divide me by the CURRENT beat length to get the true
        // beats elapsed"), so the measure index stays continuous across a tempo change BY
        // CONSTRUCTION rather than by arithmetic that has to be kept in step by hand.
        const bpmNow = bpmRef?.current || lvl.bpm || 80;
        const barMs = msPerBar(bpmNow);
        const beatMs = msPerBeat(bpmNow);
        const measureSlot = Math.floor(elapsedMs / barMs);
        if (measureSlot !== st.measureSlot) {
          // Bug fix (Han 2026-08-21, the REAL root cause behind "elke maat komt er een cello bij" /
          // "het stoppen van de cellonoten werkt nog altijd niet" — 20+ reports, finally traced to
          // smplr's own source, not guessed): the previous round's `.stop()` call (added 2026-08-20 to
          // replace a StopFn misuse) was itself correct API usage, but every note was started via
          // `playSound(..., 999, ...)` — a `duration: 999` "hold basically forever" hack, since
          // `playSound` has no way to say "no duration, hold until I explicitly stop it" (its own
          // `duration = 0.25` default always sets SOME value). smplr's `playNote_fn` treats ANY non-null
          // `duration` as "auto-stop this voice `duration` seconds from now" and calls the voice's OWN
          // `.stop(startTime + duration)` IMMEDIATELY, synchronously, the instant the note starts — NOT
          // 999 seconds later, right then. `Voice.stop()`'s very first line is `if (state !== "playing")
          // return` (idempotent — by design, so calling stop twice on a note that's already stopping is a
          // harmless no-op) and it flips `state` to `"stopping"` BEFORE checking or scheduling anything
          // else. So the instant a cello note started, its internal state was ALREADY "stopping" — every
          // SUBSEQUENT explicit `bassInstrument.stop()` call this hook made at the next measure boundary
          // silently no-opped against that SAME voice (state already "stopping", never "playing" again),
          // and the note just kept ringing/looping (cello samples loop, see `localInstrumentBuffers.
          // generated.js`) until its real, 999-seconds-away scheduled stop — accumulating one more
          // uninterruptible ringing voice every single measure. Fixed at the actual source: pass
          // `duration: null` (not `undefined` — JS default params only substitute for `undefined`, `null`
          // passes through) so smplr's `if (duration != null)` check is false and it never pre-schedules
          // ANY auto-stop at all — this hook's own explicit `.stop()` calls become the ONLY thing that
          // ever stops a cello voice, exactly as originally intended.
          try { bassInstrument.stop({ time: context.currentTime }); } catch { /* already stopped */ }
          st.measureSlot = measureSlot;
          st.beatKey = null;   // a fresh measure means a fresh set of timpani beats to (re)trigger
          const note = cellNoteForMeasure(measureSlot);
          if (note && note !== 'r' && note !== 'c') {
            playSound(note, bassInstrument, context, context.currentTime, null, bassVolume);
          }
        }
        if (timpaniInstrument) {
          const withinMeasureMs = elapsedMs - measureSlot * barMs;
          const beatSlot = Math.max(0, Math.floor(withinMeasureMs / beatMs));
          const beatKey = `${measureSlot}-${beatSlot}`;
          if (beatKey !== st.beatKey) {
            st.beatKey = beatKey;
            const hitNote = TIMPANI_BEAT_PATTERN[beatSlot % TIMPANI_BEAT_PATTERN.length];
            if (hitNote) playSound(hitNote, timpaniInstrument, context, context.currentTime, 0.3, percussionVolume);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      // Silence whatever cello note is still ringing when this stream stops (level ends/closes/replays,
      // or the player leaves the gated section) — same `.stop()` API as the measure-transition fix above.
      try { bassInstrument.stop({ time: context.currentTime }); } catch { /* already stopped */ }
    };
    // #1096 follow-up (Han 2026-08-21): `bassMelody` deliberately NOT in this list — see `bassMelodyRef`'s
    // own comment above for why depending on it directly caused the "extra cello" stacking bug. The
    // effect's initial-mount check above (`!bassMelodyRef.current`) still guards against ever starting the
    // loop before any content exists.
    // #1120: `bpmRef` IS listed, but only because it is a stable ref OBJECT (App's `useRefState`) —
    // its identity never changes, so it can never restart this loop. What must never appear here is
    // the bpm STATE itself: that would restart the effect on every adaptive tempo commit and re-open
    // exactly the "extra cello" stacking bug documented above. The live value is read INSIDE the loop.
  }, [active, lvl, levelAudioStart, context, gatedElapsedMsRef, bpmRef, bassInstrument,
    timpaniInstrument, bassVolume, percussionVolume, timeSignature]);
}
