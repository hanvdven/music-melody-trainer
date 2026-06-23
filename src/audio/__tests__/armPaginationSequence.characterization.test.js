import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Sequencer from '../Sequencer.js';
import { PAGINATION_VARIANTS, planPaginationSequence } from '../transitionPlanner.js';
import { secondsPerTick } from '../../constants/timing.js';

/**
 * CHARACTERIZATION TEST — Sequencer._armPaginationSequence (Sequencer.js ~:1798)
 *
 * WHY THIS EXISTS (Phase-2 safety net): the architecture audit (§6 / §4) marks
 * Sequencer.start()'s pagination scheduling as high-risk, untested core that
 * Phase 2 plans to split into a scheduleTransitions()/scheduleBlock() pair.
 * `_armPaginationSequence` is the part that turns a pure plan (planPaginationSequence,
 * already unit-tested in transitionPlanner.test.js) into the actual setTimeout
 * schedule that drives React setters. This test pins the boundary→setTimeout
 * MAPPING — the bit the split must preserve — without depending on any wall clock.
 *
 * WHY IT IS STABLE (no flakiness):
 *   • AudioContext is a tiny fake with a CONTROLLABLE `currentTime` (no real audio).
 *   • Time is driven by vitest fake timers (vi.useFakeTimers) — every setTimeout the
 *     Sequencer schedules is advanced deterministically by us, never by real time.
 *   • `_armPaginationSequence` is called DIRECTLY (no start() loop, no async sleeps),
 *     so there is exactly one synchronous arming pass and a fully determined timer set.
 *   • We assert delays the Sequencer itself derives from the SAME pure helpers
 *     (planPaginationSequence + secondsPerTick) the production code uses, so the
 *     expectations track the documented timing model rather than magic numbers.
 *
 * Convention: ticks → seconds via secondsPerTick(bpm); a setTimeout fires at
 * `(audioTime - context.currentTime) * 1000` ms. The fade-arm has a −200ms React
 * lead; the JIT generation deadline fires at generationDeadlineTick.
 */

// --- minimal fake AudioContext: only currentTime is read by the Sequencer ---
function makeContext(startTime = 100) {
  return { currentTime: startTime };
}

// Recording setter: stores [fireOrderTimestamp via vi clock, args]. We mostly
// care THAT it fired and WITH what, in response to which advanced timer.
function makeRecorder() {
  const calls = [];
  const fn = (...args) => { calls.push(args); };
  fn.calls = calls;
  return fn;
}

/**
 * Build a Sequencer whose refs/setters/context are all controllable. Only the
 * fields _armPaginationSequence reads are populated. isPlaying is forced true so
 * the armed callbacks (which all early-return on !this.isPlaying) actually run.
 */
function makeSequencer({ bpm = 120, numMeasures = 4, repsPerMelody = 1, context }) {
  const setters = {
    setStartMeasureIndex: makeRecorder(),
    setIsOddRound: makeRecorder(),
    setNextLayer: makeRecorder(),
    setPreviewMelody: makeRecorder(),
    setBlockMeasureStart: makeRecorder(),
    setBlockPlayStart: makeRecorder(),
    setTrebleMelody: makeRecorder(),
    setBassMelody: makeRecorder(),
    setPercussionMelody: makeRecorder(),
    setChordProgression: makeRecorder(),
  };
  const refs = {
    bpmRef: { current: bpm },
    numMeasuresRef: { current: numMeasures },
    timeSignatureRef: { current: [4, 4] },
    historyIndexRef: { current: 0 },
    melodiesRef: { current: { treble: null, bass: null, percussion: null } },
    playbackConfigRef: { current: { repsPerMelody, totalMelodies: -1 } },
    transitionRef: { current: null },
  };
  const seq = new Sequencer({
    setters,
    refs,
    instruments: {},
    context,
    percussionScale: null,
  });
  seq.isPlaying = true;
  seq.isOnceMode = false;
  seq.isRepeatMode = false;
  seq.melodyCount = 0;
  seq.globalMeasureIndex = 0;
  // Avoid the heavy generation path: pre-seed pregenResult so the series-flip JIT
  // generation callback short-circuits (`if (this.pregenResult) return;`). The
  // preview build uses _buildPaginationPreview on this object, which just slices
  // null melodies → harmless. This keeps the test about SCHEDULING, not generation.
  seq.pregenResult = {
    treble: null, bass: null, percussion: null, chordProgression: null,
    generatedNumMeasures: numMeasures,
  };
  return { seq, setters, refs };
}

describe('Sequencer._armPaginationSequence — boundary→setTimeout characterization', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('arms exactly one timer per documented phase for a single series-flip (4/4, snel)', () => {
    const baseTime = 100;
    const context = makeContext(baseTime);
    const bpm = 120;
    const measureLengthTicks = 48; // 4/4
    const numMeasures = 4;
    const { seq, setters } = makeSequencer({ bpm, numMeasures, context });

    seq._armPaginationSequence({
      baseAudioTime: baseTime,
      sequenceStartGlobalMeasure: 0,
      plan: {
        numMeasures,
        repsPerMelody: 1,
        measureLengthTicks,
        musicalBlocks: [numMeasures], // one visual block → only a series-flip
      },
      variant: 'snel',
      currentMelodies: { treble: null, bass: null, percussion: null, chordProgression: null },
      startSkipTick: 0,
    });

    // One block with a single visual block + reps=1 → exactly ONE boundary, a
    // series-flip (matches planPaginationSequence, asserted via the pure helper).
    const events = planPaginationSequence({
      plan: { numMeasures, repsPerMelody: 1, measureLengthTicks, musicalBlocks: [numMeasures] },
      variant: 'snel',
    });
    expect(events).toHaveLength(1);
    expect(events[0].boundary.kind).toBe('series-flip');

    // Timers armed: initial-state callback (always) + per series-flip: JIT gen +
    // fade-arm. snel has no overshoot, so for a series-flip the atTime swap callback
    // is NOT armed here (that's owned by the outer-loop applyResult), and there is no
    // separate fadeEnd cleanup. → 3 timers total.
    expect(vi.getTimerCount()).toBe(3);

    // ── Phase A: initial setStartMeasureIndex + setIsOddRound at baseAudioTime ──
    // Delay = (baseAudioTime - currentTime)*1000 = 0ms.
    vi.advanceTimersByTime(0);
    expect(setters.setStartMeasureIndex.calls).toEqual([[0]]);
    expect(setters.setIsOddRound.calls).toEqual([[true]]); // iter 0 is always odd
    expect(setters.setNextLayer.calls).toEqual([]); // MUST NOT clear overlay here

    // ── Phase B: JIT generation deadline ──
    // snel generationLeadMeasures=0.5 → deadlineTick = atTick - 0.5m.
    const tf = secondsPerTick(bpm);
    const fade = events[0].fade;
    const deadlineMs = (baseTime + fade.generationDeadlineTick * tf - baseTime) * 1000;
    // Fade-arm fires 200ms before fadeStartTick.
    const armMs = (baseTime + fade.fadeStartTick * tf - baseTime) * 1000 - 200;
    expect(deadlineMs).toBeGreaterThan(0);
    expect(armMs).toBeGreaterThan(deadlineMs); // generation completes before the fade arms

    // Advance to just past the JIT deadline. pregenResult is pre-seeded so the JIT
    // callback short-circuits; no setter fires yet (proves the deadline timer is the
    // generation one, not a render one).
    vi.advanceTimersByTime(Math.ceil(deadlineMs) + 1 - 0);
    expect(setters.setNextLayer.calls).toEqual([]);
    expect(setters.setPreviewMelody.calls).toEqual([]);

    // ── Phase C: fade arm sets transitionRef=crossfade + nextLayer='crossfade' + preview ──
    vi.advanceTimersByTime(Math.ceil(armMs - deadlineMs) + 2);
    expect(setters.setNextLayer.calls).toEqual([['crossfade']]);
    // preview was built from the pre-seeded pregenResult (sliced null melodies).
    expect(setters.setPreviewMelody.calls.length).toBe(1);
    expect(seq.refs.transitionRef.current).toMatchObject({ kind: 'crossfade' });
  });

  it('mid variant arms the same 3 timers but with the 1m generation lead / 0.5m fade', () => {
    const baseTime = 50;
    const context = makeContext(baseTime);
    const bpm = 100;
    const measureLengthTicks = 48;
    const numMeasures = 4;
    const { seq } = makeSequencer({ bpm, numMeasures, context });

    seq._armPaginationSequence({
      baseAudioTime: baseTime,
      sequenceStartGlobalMeasure: 0,
      plan: { numMeasures, repsPerMelody: 1, measureLengthTicks, musicalBlocks: [numMeasures] },
      variant: 'mid',
      currentMelodies: { treble: null, bass: null, percussion: null, chordProgression: null },
      startSkipTick: 0,
    });

    expect(vi.getTimerCount()).toBe(3);
    // mid has no overshoot (PAGINATION_VARIANTS.mid.fadeOvershootMeasures === 0), so
    // there is no separate fadeEnd-cleanup timer — same shape as snel, only timings differ.
    expect(PAGINATION_VARIANTS.mid.fadeOvershootMeasures).toBe(0);
  });

  it('multi-block / multi-rep arms initial + (per-boundary) fade-arm and at-swap timers', () => {
    // 5 measures, 2 reps, visual blocks [3,2]:
    // boundaries = visual(3m), repeat(5m), visual(8m), series(10m). (matches
    // computeSequenceBoundaries, exercised in transitionPlanner.test.js)
    const baseTime = 0;
    const context = makeContext(baseTime);
    const measureLengthTicks = 48;
    const numMeasures = 5;
    const { seq } = makeSequencer({ bpm: 120, numMeasures, repsPerMelody: 2, context });

    seq._armPaginationSequence({
      baseAudioTime: baseTime,
      sequenceStartGlobalMeasure: 0,
      plan: { numMeasures, repsPerMelody: 2, measureLengthTicks, musicalBlocks: [3, 2] },
      variant: 'snel',
      currentMelodies: { treble: null, bass: null, percussion: null, chordProgression: null },
      startSkipTick: 0,
    });

    const events = planPaginationSequence({
      plan: { numMeasures, repsPerMelody: 2, measureLengthTicks, musicalBlocks: [3, 2] },
      variant: 'snel',
    });
    const kinds = events.map(e => e.boundary.kind);
    expect(kinds).toEqual(['visual-flip', 'repeat-flip', 'visual-flip', 'series-flip']);

    // Timer accounting (snel, no overshoot):
    //   initial state callback ................................. 1
    //   per visual/repeat-flip (3 of them): fade-arm + at-swap .. 2 each = 6
    //   per series-flip (1): JIT gen + fade-arm (no at-swap) .... 2
    //   → 1 + 6 + 2 = 9
    expect(vi.getTimerCount()).toBe(9);
  });

  it('skips boundaries whose atTick <= startSkipTick (mid-block start)', () => {
    // Starting at startSkipTick = 3 measures: the visual-flip at 3m is at the
    // boundary (<=), so it is skipped; the series-flip at 4m survives.
    const baseTime = 0;
    const context = makeContext(baseTime);
    const measureLengthTicks = 48;
    const numMeasures = 4;
    const { seq } = makeSequencer({ bpm: 120, numMeasures, context });

    seq._armPaginationSequence({
      baseAudioTime: baseTime,
      sequenceStartGlobalMeasure: 0,
      plan: { numMeasures, repsPerMelody: 1, measureLengthTicks, musicalBlocks: [3, 1] },
      variant: 'snel',
      currentMelodies: { treble: null, bass: null, percussion: null, chordProgression: null },
      startSkipTick: 3 * measureLengthTicks, // skip the visual-flip at exactly 3m
    });

    // initial-state timer (1) + series-flip (JIT + fade-arm = 2). The visual-flip at
    // 3m is skipped (atTick <= startSkipTick), so its 2 timers are absent.
    expect(vi.getTimerCount()).toBe(3);
  });

  it('once-mode skips the series-flip JIT/preview entirely (only the initial timer)', () => {
    const baseTime = 0;
    const context = makeContext(baseTime);
    const measureLengthTicks = 48;
    const numMeasures = 4;
    const { seq } = makeSequencer({ bpm: 120, numMeasures, context });
    seq.isOnceMode = true; // "Play This Melody"

    seq._armPaginationSequence({
      baseAudioTime: baseTime,
      sequenceStartGlobalMeasure: 0,
      plan: { numMeasures, repsPerMelody: 1, measureLengthTicks, musicalBlocks: [numMeasures] },
      variant: 'snel',
      currentMelodies: { treble: null, bass: null, percussion: null, chordProgression: null },
      startSkipTick: 0,
    });

    // The only boundary is a series-flip; once-mode `continue`s past it (no crossfade
    // anyone would see). So only the initial setStartMeasureIndex/setIsOddRound timer arms.
    expect(vi.getTimerCount()).toBe(1);
  });
});
