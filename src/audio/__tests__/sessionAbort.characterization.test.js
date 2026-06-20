import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Sequencer from '../Sequencer.js';

/**
 * CHARACTERIZATION TEST — session abort / stop() teardown (Sequencer.js)
 *
 * Pins the CLAUDE.md §6 invariant: "a stopped session does not continue." Phase 2
 * plans to split start()'s scheduling; this guards the two mechanisms that enforce
 * the invariant TODAY so the split can't silently drop either:
 *
 *   1. stop() cancels every pending setTimeout it tracked (this.timeouts) so no
 *      already-armed React-setter callback fires after stop().
 *   2. Every armed callback also early-returns on `!this.isPlaying`, so even a timer
 *      that somehow survived (e.g. armed by a different code path) is a no-op once
 *      stopped. (Belt-and-braces — both are characterized.)
 *
 * WHY STABLE: pure fake timers (vi.useFakeTimers) + a fake AudioContext. No async
 * loop, no real audio, no wall clock. We arm timers via the SAME scheduleTimeout
 * helper the production loop uses, then assert their fate around stop().
 */

function makeContext(t = 0) { return { currentTime: t }; }

function makeRecorder() {
  const calls = [];
  const fn = (...args) => { calls.push(args); };
  fn.calls = calls;
  return fn;
}

function makeSequencer(context) {
  const onStop = makeRecorder();
  const setIsOddRound = makeRecorder();
  const seq = new Sequencer({
    setters: { onStop, setIsOddRound },
    refs: {},
    instruments: {}, // stop() calls .stop?.() on each — absent → optional-chain no-op
    context,
    percussionScale: null,
  });
  return { seq, onStop, setIsOddRound };
}

describe('Sequencer stop() — abort-after-stop invariant (§6)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('stop() cancels pending scheduleTimeout callbacks so they never fire', () => {
    const { seq } = makeSequencer(makeContext());
    seq.isPlaying = true;

    const fired = [];
    seq.scheduleTimeout(() => fired.push('a'), 100);
    seq.scheduleTimeout(() => fired.push('b'), 200);
    expect(vi.getTimerCount()).toBe(2);
    expect(seq.timeouts).toHaveLength(2);

    seq.stop();

    // stop() must clear the tracked timeout array AND clearTimeout each id.
    expect(seq.timeouts).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);

    // Even after advancing well past both delays, NEITHER callback runs.
    vi.advanceTimersByTime(1000);
    expect(fired).toEqual([]);
  });

  it('stop() flips isPlaying false and aborts the session controller', () => {
    const { seq, onStop } = makeSequencer(makeContext());
    seq.isPlaying = true;
    seq.abortController = new AbortController();
    const sig = seq.abortController.signal;
    expect(sig.aborted).toBe(false);

    seq.stop();

    expect(seq.isPlaying).toBe(false);
    expect(sig.aborted).toBe(true); // the loop checks sessionController.signal.aborted
    expect(onStop.calls).toHaveLength(1);
  });

  it('a callback armed BEFORE stop, if it survived, no-ops because of the !isPlaying guard', () => {
    // Characterizes the second line of defense. We arm a callback that mirrors the
    // production guard shape ("if (!this.isPlaying) return;") and force the timer to
    // survive by NOT going through scheduleTimeout's tracking — so stop()'s
    // clearTimeout can't reach it. The guard alone must keep it inert.
    const { seq, setIsOddRound } = makeSequencer(makeContext());
    seq.isPlaying = true;

    let ranBody = false;
    setTimeout(() => {
      if (!seq.isPlaying) return; // SAME guard every armed callback uses
      ranBody = true;
      seq.setters.setIsOddRound(false);
    }, 100);

    seq.stop(); // sets isPlaying=false but cannot clear this untracked timer
    vi.advanceTimersByTime(500);

    expect(ranBody).toBe(false);
    // stop() itself calls setIsOddRound(true) once; the guarded callback added nothing.
    expect(setIsOddRound.calls).toEqual([[true]]);
  });

  it('captured-controller pattern: an aborted session signal stays aborted even after a new start replaces abortController', () => {
    // Mirrors the §6 "capture sessionController at the loop top" rule: the running
    // loop holds a LOCAL const to its own controller. When stop() + a new start()
    // swap this.abortController, the old captured signal must remain aborted so the
    // old loop exits.
    const { seq } = makeSequencer(makeContext());
    seq.isPlaying = true;
    seq.abortController = new AbortController();
    const capturedOldController = seq.abortController; // what the loop would capture

    seq.stop(); // aborts the old controller
    // Simulate a fresh start() replacing the controller (without running the loop).
    seq.abortController = new AbortController();
    seq.isPlaying = true;

    // The OLD loop's captured controller is still aborted — so its `if
    // (sessionController.signal.aborted) break;` checks would terminate it, even
    // though this.abortController now points at a live, non-aborted controller.
    expect(capturedOldController.signal.aborted).toBe(true);
    expect(seq.abortController.signal.aborted).toBe(false);
    expect(capturedOldController).not.toBe(seq.abortController);
  });
});
