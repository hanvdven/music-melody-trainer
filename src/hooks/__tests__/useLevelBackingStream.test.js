import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useLevelBackingStream from '../useLevelBackingStream';
import Scale from '../../model/Scale.js';
import InstrumentSettings from '../../model/InstrumentSettings.js';
import { LEVEL_BASS_SIMPLE } from '../../levels/levels.js';

vi.mock('../../audio/playMelodies', () => ({ default: vi.fn(() => 0) }));
import playMelodies from '../../audio/playMelodies';

// #663 (Han 2026-08-03): smoke test for the JIT-chunked level backing stream — verifies the
// FIX for the reported bugs: chunk 0 (lead-in, measures -1/0) is generated + scheduled
// immediately, chunk 1 is pre-generated in the SAME synchronous pass ("2+2 measures ahead"),
// and later chunks are scheduled via timers rather than everything up front.
describe('useLevelBackingStream (#663)', () => {
  const timeSignature = [4, 4];
  const scale = Scale.defaultScale();
  const bassSettings = { ...InstrumentSettings.defaultBassInstrumentSettings(), ...LEVEL_BASS_SIMPLE, instrument: 'cello' };
  const lvl = { sideScroll: true, bpm: 80, numMeasures: 4, totalMeasures: 4 };
  const lvl8 = { sideScroll: true, bpm: 80, numMeasures: 8, totalMeasures: 8 };
  const bassInstrument = { name: 'cello-instance' };
  const metronomeInstrument = { name: 'metronome-instance' };

  const makeContext = () => ({ currentTime: 10 });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing until bassReady/metronomeReady are true (no stale-instrument scheduling)', () => {
    const context = makeContext();
    renderHook(() => useLevelBackingStream({
      active: true, lvl, scale, timeSignature, bassSettings, chordProgression: null,
      context, levelAudioStart: 10.35, bassReady: false, metronomeReady: true, levelMelodyReady: true,
      bassInstrument, metronomeInstrument, stopFnsRef: { current: [] },
    }));
    expect(playMelodies).not.toHaveBeenCalled();
  });

  it('generates + schedules chunk 0 and chunk 1 synchronously once ready (the "2+2 measures ahead" buffer)', () => {
    const context = makeContext();
    const stopFnsRef = { current: [] };
    // unmount() so this test's real "generate chunk 2" timer (numMeasures=4 → 3 chunks total)
    // doesn't stay pending after the test ends — see the setTimeout test's comment for why.
    const { result, unmount } = renderHook(() => useLevelBackingStream({
      active: true, lvl, scale, timeSignature, bassSettings, chordProgression: null,
      context, levelAudioStart: 10.35, bassReady: true, metronomeReady: true, levelMelodyReady: true,
      bassInstrument, metronomeInstrument, stopFnsRef,
    }));

    // Two chunks (lead-in + first content chunk) scheduled immediately, for bass AND metronome
    // each — 4 playMelodies calls total, no setTimeout needed for these first two.
    expect(playMelodies).toHaveBeenCalledTimes(4);
    expect(result.current.bass.notes.length).toBeGreaterThan(0);
    expect(result.current.metronome.notes.length).toBeGreaterThan(0);
    unmount();
  });

  it('caps generation at one chunk ahead, not all 5 chunks up front', () => {
    const context = makeContext();
    const stopFnsRef = { current: [] };
    // Deliberately NOT asserting via setTimeout spying/real timers here (a multi-second real
    // delay would leave the process waiting on a pending timer) — instead assert the OBSERVABLE
    // effect of the lookahead cap: only the lead-in + chunk1 have been generated so far, proving
    // the remaining 3 (of 5 total, for an 8-measure level) are NOT generated up front. `lvl8` is a
    // STABLE reference (not a fresh object literal per render) — the hook's effect depends on
    // `lvl`, so a fresh object every render would retrigger it in an infinite loop.
    const { result, unmount } = renderHook(() => useLevelBackingStream({
      active: true, lvl: lvl8, scale, timeSignature, bassSettings, chordProgression: null,
      context, levelAudioStart: 10.35, bassReady: true, metronomeReady: true, levelMelodyReady: true,
      bassInstrument, metronomeInstrument, stopFnsRef,
    }));

    expect(playMelodies).toHaveBeenCalledTimes(4);   // lead-in + chunk1 only (bass + metronome each)
    // 2 chunks generated so far (lead-in + chunk1) = 4 measures of ticks, not the full 10 (lead-in + 8).
    const measureLengthTicks = 48;   // TICKS_PER_WHOLE * 4/4
    expect(result.current.bass.offsets.every((o) => o < 4 * measureLengthTicks)).toBe(true);
    unmount();
  });

  it('#1052 third follow-up / #1096: a gatedScroll level NEVER stops generating chunks (wraps back to measure 0 instead of running out, so the cello content never runs dry during an arbitrarily long freeze) — but no longer calls playMelodies for bass/metronome at all, since #1096 routes gated cello/timpani audio through useLevelGatedRubatoAudio instead', () => {
    vi.useFakeTimers();
    const context = { currentTime: 10 };   // fake timers, not real audio time — chunk scheduling below is timer-driven
    const stopFnsRef = { current: [] };
    const gatedLvl = { sideScroll: true, gatedScroll: true, bpm: 80, numMeasures: 2, totalMeasures: 2 };
    const { result, unmount } = renderHook(() => useLevelBackingStream({
      active: true, lvl: gatedLvl, scale, timeSignature, bassSettings, chordProgression: null,
      context, levelAudioStart: 10.35, bassReady: true, metronomeReady: true, levelMelodyReady: true,
      bassInstrument, metronomeInstrument, stopFnsRef,
    }));
    // #867/#1096: bass AND metronome are both excluded from playMelodies scheduling for a gated level
    // (metronome: §867 rework round 1 — "wel timpanen, geen metronoom"; bass: #1096 — cello audio now
    // triggered by useLevelGatedRubatoAudio off the gate's own clock, not this fixed schedule).
    expect(playMelodies).not.toHaveBeenCalled();
    const notesAfterInitial = result.current.bass.notes.length;   // lead-in + chunk1, content still generated

    // A non-gated 2-measure level (totalChunks = 1 + ceil(2/2) = 2) would have NOTHING left to
    // generate beyond this point — advancing timers well past its own short real-time schedule proves
    // the gated level's CONTENT keeps growing (loopForever) instead of running dry, even though none of
    // it is scheduled here any more.
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.bass.notes.length).toBeGreaterThan(notesAfterInitial);
    expect(playMelodies).not.toHaveBeenCalled();
    unmount();
    vi.useRealTimers();
  });

  // Bug fix (Han 2026-08-24, Level 8 mode D): #1101's call-response variants shrink `numMeasures`
  // to the call/response GROUP size (e.g. 1) while `totalMeasures` still holds the level's real
  // length (e.g. 8) — content length MUST follow `totalMeasures`, not `numMeasures`, or backing
  // audio for a non-gated call-response level falls silent after just one measure.
  it('#1101/Level-8-mode-D: content length follows totalMeasures, not the smaller numMeasures (call-response group size)', () => {
    vi.useFakeTimers();
    const context = { currentTime: 10 };
    const stopFnsRef = { current: [] };
    // Mirrors applyLevelVariant's callResponseOverrides shape: numMeasures shrunk to the group size,
    // totalMeasures left at the level's real (much larger) length, gatedScroll:false (non-gated).
    const callResponseLvl = { sideScroll: true, gatedScroll: false, bpm: 60, numMeasures: 1, totalMeasures: 8 };
    const { result, unmount } = renderHook(() => useLevelBackingStream({
      active: true, lvl: callResponseLvl, scale, timeSignature, bassSettings, chordProgression: null,
      context, levelAudioStart: 10.35, bassReady: true, metronomeReady: true, levelMelodyReady: true,
      bassInstrument, metronomeInstrument, stopFnsRef,
    }));
    const notesAfterInitial = result.current.bass.notes.length;
    expect(notesAfterInitial).toBeGreaterThan(0);
    // Advancing well past what a 1-measure (numMeasures) schedule would cover must still yield MORE
    // scheduled bass content — proving generation keeps going out to totalMeasures=8, not numMeasures=1.
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.bass.notes.length).toBeGreaterThan(notesAfterInitial);
    unmount();
    vi.useRealTimers();
  });
  // ── #1102 (adaptive tempo, Han 2026-08-28) ──────────────────────────────────────────────────────
  // This stream never DECIDES a tempo change — it ADOPTS one at its own next chunk boundary, reading
  // the live value fresh per chunk (the same "re-read bpmRef at the top of each scheduling unit"
  // pattern Sequencer.scheduleBlock uses per measure), and places each chunk with an ACCUMULATED
  // seconds cursor so a chunk generated at a new tempo does not retroactively move earlier chunks.
  describe('adaptive tempo (#1102)', () => {
    // 4/4 at TICKS_PER_WHOLE=48 → measureLengthTicks 48; secondsPerTick(bpm) = 5/bpm, so a bar at
    // 80bpm is exactly 3.0s and at 100bpm exactly 2.4s — deliberately round numbers so the accumulated
    // cursor can be asserted exactly rather than approximately.
    const adaptiveLvl = {
      sideScroll: true, bpm: 80, numMeasures: 8, totalMeasures: 8, leadInBars: 2, adaptive: true,
    };
    const BAR_AT_80 = 3.0;

    it('reads the bpm FRESH per chunk and accumulates each chunk start at its own bar duration', () => {
      const context = { currentTime: 0 };
      const stopFnsRef = { current: [] };
      const seen = [];
      // A controller that switches tempo from content measure 0 onward — i.e. at chunk 1, the first
      // content chunk. Chunk 0 (the lead-in) must NOT consult it at all (it is pinned to the level's
      // own starting tempo so both streams' content clocks start at the identical instant).
      const adaptiveTempo = {
        bpmForMeasure: (measure, startTime) => { seen.push([measure, startTime]); return measure >= 0 ? 100 : 80; },
      };
      const { unmount } = renderHook(() => useLevelBackingStream({
        active: true, lvl: adaptiveLvl, scale, timeSignature, bassSettings, chordProgression: null,
        context, levelAudioStart: 10, bassReady: true, metronomeReady: true, levelMelodyReady: true,
        bassInstrument, metronomeInstrument, stopFnsRef, adaptiveTempo,
      }));

      // Only chunk 1 consulted the controller, and it did so with its own content measure + start time.
      expect(seen).toEqual([[0, 10 + 2 * BAR_AT_80]]);

      // playMelodies(melodies, instruments, context, bpm, scheduledStart, ...) — 4 calls: bass+metronome
      // for chunk 0, then bass+metronome for chunk 1.
      const calls = playMelodies.mock.calls;
      expect(calls.length).toBe(4);
      // Chunk 0 (lead-in): the level's own starting tempo, anchored at levelAudioStart.
      expect(calls[0][3]).toBe(80);
      expect(calls[0][4]).toBeCloseTo(10, 10);
      // Chunk 1: the NEW tempo, but placed at the cursor accumulated at the LEAD-IN's bar duration —
      // not re-derived from the new bpm (which would have pulled it earlier and desynced the streams).
      expect(calls[2][3]).toBe(100);
      expect(calls[2][4]).toBeCloseTo(10 + 2 * BAR_AT_80, 10);
      unmount();
    });

    it('does not consult the controller at all for a NON-adaptive level (byte-identical old behaviour)', () => {
      const context = { currentTime: 0 };
      const stopFnsRef = { current: [] };
      const bpmForMeasure = vi.fn(() => 999);
      const { unmount } = renderHook(() => useLevelBackingStream({
        active: true, lvl: lvl8, scale, timeSignature, bassSettings, chordProgression: null,
        context, levelAudioStart: 10, bassReady: true, metronomeReady: true, levelMelodyReady: true,
        bassInstrument, metronomeInstrument, stopFnsRef, adaptiveTempo: { bpmForMeasure },
      }));
      expect(bpmForMeasure).not.toHaveBeenCalled();
      expect(playMelodies.mock.calls.every((c) => c[3] === 80)).toBe(true);
      unmount();
    });
  });
});
