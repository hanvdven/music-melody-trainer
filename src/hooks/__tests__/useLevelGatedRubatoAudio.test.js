import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useLevelGatedRubatoAudio from '../useLevelGatedRubatoAudio';

vi.mock('../../audio/playSound', () => ({ default: vi.fn() }));
import playSound from '../../audio/playSound';

// #1096 follow-up (Han 2026-08-21, "elke volgende maat een EXTRA cello... het 'afzetten' werkt nog niet"):
// regression test for the root cause — the main effect used to depend on `bassMelody` directly, and
// `useLevelBackingStream`'s growing `bass` state gets a BRAND NEW object every JIT chunk append (continuous,
// for a `loopForever` gated level). Each new reference tore the whole effect (and its raf loop) down and
// re-armed it mid-measure, re-triggering a `stop()`+`playSound()` for the CURRENTLY-sounding note — audible
// as an extra overlapping cello for the ~300ms release ramp. The fix reads `bassMelody` through a ref a
// separate small effect keeps current, so the raf-loop-owning effect never restarts when new content arrives.
describe('useLevelGatedRubatoAudio (#1096 follow-up)', () => {
  const timeSignature = [4, 4];
  const lvl = { bpm: 80 };   // barMs = 48 ticks * (5/80)s * 1000 = 3000ms; beatMs = 750ms
  const bassInstrument = { stop: vi.fn() };
  const makeMelody = () => ({ notes: ['C2', 'D2'], offsets: [0, 48] });   // measure 0 -> C2, measure 1 -> D2

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  });

  const tick = () => act(() => { vi.advanceTimersByTime(16); });

  it('triggers the cello note for the current measure and stops the previous one on a genuine measure change', () => {
    const context = { currentTime: 0 };
    const gatedElapsedMsRef = { current: 0 };
    renderHook(() => useLevelGatedRubatoAudio({
      active: true, lvl, timeSignature, context, levelAudioStart: 0, gatedElapsedMsRef,
      bassMelody: makeMelody(), bassInstrument, timpaniInstrument: null, bassVolume: 1, percussionVolume: 1,
    }));

    tick();
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound.mock.calls[0][0]).toBe('C2');
    expect(bassInstrument.stop).toHaveBeenCalledTimes(1);   // harmless no-op stop before the very first note

    gatedElapsedMsRef.current = 3000;   // crosses into measure 1
    tick();
    expect(playSound).toHaveBeenCalledTimes(2);
    expect(playSound.mock.calls[1][0]).toBe('D2');
    expect(bassInstrument.stop).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('does NOT stop/restart the currently-sounding note when bassMelody gets a new object reference mid-measure (JIT chunk append)', () => {
    const context = { currentTime: 0 };
    const gatedElapsedMsRef = { current: 0 };
    const { rerender } = renderHook(
      (props) => useLevelGatedRubatoAudio(props),
      {
        initialProps: {
          active: true, lvl, timeSignature, context, levelAudioStart: 0, gatedElapsedMsRef,
          bassMelody: makeMelody(), bassInstrument, timpaniInstrument: null, bassVolume: 1, percussionVolume: 1,
        },
      },
    );

    tick();
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(bassInstrument.stop).toHaveBeenCalledTimes(1);

    // Simulate useLevelBackingStream appending a new JIT chunk: a NEW Melody object, same measure still
    // sounding (gatedElapsedMsRef unchanged) — this is exactly what used to tear the effect down.
    rerender({
      active: true, lvl, timeSignature, context, levelAudioStart: 0, gatedElapsedMsRef,
      bassMelody: makeMelody(), bassInstrument, timpaniInstrument: null, bassVolume: 1, percussionVolume: 1,
    });
    tick();

    // No new stop/start — the currently-sounding measure-0 note must ring uninterrupted.
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(bassInstrument.stop).toHaveBeenCalledTimes(1);

    // The loop must still react correctly to a REAL measure change after the reference churn above —
    // proves the fix reads the new content via the ref, it just doesn't restart the loop for it.
    gatedElapsedMsRef.current = 3000;
    tick();
    expect(playSound).toHaveBeenCalledTimes(2);
    expect(playSound.mock.calls[1][0]).toBe('D2');

    vi.useRealTimers();
  });

  it('bug fix (Han 2026-08-21, the REAL root cause — 20+ reports of "cello stacking"/"stoppen werkt niet"): starts every cello note with duration:null, never a finite duration', () => {
    // Root cause traced into smplr's own source (node_modules/smplr/dist/index.mjs): ANY non-null
    // `duration` makes smplr call the voice's OWN `.stop(startTime + duration)` SYNCHRONOUSLY the instant
    // the note starts — not later. `Voice.stop()` is idempotent (`if (state !== "playing") return`), so
    // that immediately flips the voice's internal state to "stopping" for good — every SUBSEQUENT
    // explicit `bassInstrument.stop()` call this hook makes at later measure boundaries silently no-ops
    // against that SAME already-"stopping" voice, and the (looping) cello sample just keeps ringing
    // indefinitely while new notes pile on top each measure. The previous `duration: 999` "hold nearly
    // forever" value was ITSELF the bug, not a workaround for it — `duration: null` is the only value
    // smplr treats as "no auto-stop at all", leaving this hook's own explicit `.stop()` calls as the ONLY
    // thing that can ever silence a voice, exactly as intended.
    const context = { currentTime: 0 };
    const gatedElapsedMsRef = { current: 0 };
    renderHook(() => useLevelGatedRubatoAudio({
      active: true, lvl, timeSignature, context, levelAudioStart: 0, gatedElapsedMsRef,
      bassMelody: makeMelody(), bassInstrument, timpaniInstrument: null, bassVolume: 1, percussionVolume: 1,
    }));

    tick();
    expect(playSound).toHaveBeenCalledTimes(1);
    // playSound(note, instrument, context, time, duration, volume, ...) — duration is argument index 4.
    expect(playSound.mock.calls[0][4]).toBeNull();

    gatedElapsedMsRef.current = 3000;
    tick();
    expect(playSound.mock.calls[1][4]).toBeNull();

    vi.useRealTimers();
  });
});
