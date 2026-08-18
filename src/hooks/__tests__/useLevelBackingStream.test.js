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
  const lvl = { sideScroll: true, bpm: 80, numMeasures: 4 };
  const lvl8 = { sideScroll: true, bpm: 80, numMeasures: 8 };
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

  it('#1052 third follow-up: a gatedScroll level NEVER stops generating chunks (wraps back to measure 0 instead of running out, so the cello never goes silent during an arbitrarily long freeze)', () => {
    vi.useFakeTimers();
    const context = { currentTime: 10 };   // fake timers, not real audio time — chunk scheduling below is timer-driven
    const stopFnsRef = { current: [] };
    const gatedLvl = { sideScroll: true, gatedScroll: true, bpm: 80, numMeasures: 2 };
    const { unmount } = renderHook(() => useLevelBackingStream({
      active: true, lvl: gatedLvl, scale, timeSignature, bassSettings, chordProgression: null,
      context, levelAudioStart: 10.35, bassReady: true, metronomeReady: true, levelMelodyReady: true,
      bassInstrument, metronomeInstrument, stopFnsRef,
    }));
    const callsAfterInitial = playMelodies.mock.calls.length;   // lead-in + chunk1, same as the non-gated tests above

    // A non-gated 2-measure level (totalChunks = 1 + ceil(2/2) = 2) would have NOTHING left to
    // schedule beyond this point — advancing timers well past its own short real-time schedule proves
    // the gated level keeps going instead of falling silent.
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(playMelodies.mock.calls.length).toBeGreaterThan(callsAfterInitial);
    unmount();
    vi.useRealTimers();
  });
});
