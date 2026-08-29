import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import useLevelContentStream from '../useLevelContentStream';
import useAdaptiveTempo from '../useAdaptiveTempo';
import { LEVELS, applyLevelVariant } from '../../levels/levels';
import { baselineAdaptiveBpm, ADAPTIVE_STEP, ADAPTIVE_LEVEL_REPEATS } from '../../levels/adaptiveTempo';
import { blockMeasuresFor, blockCountFor } from '../../levels/levelBlockPlan';
import Scale from '../../model/Scale';
import InstrumentSettings from '../../model/InstrumentSettings';
import { TICKS_PER_WHOLE, secondsPerTick } from '../../constants/timing';

vi.mock('../../audio/playMelodies', () => ({ default: vi.fn(() => 0) }));
import playMelodies from '../../audio/playMelodies';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// #1102 — ADAPTIVE MODE, END TO END (letter `i`).
//
// The unit suites cover the pieces in isolation: `adaptiveTempo.test.js` (the two locked
// formulas + the commit-index primitive), `useAdaptiveTempo.test.js` (decide/schedule/apply),
// `levelVariants.test.js` (what the letter stamps onto a level). What NONE of them proves is
// that the WIRING actually delivers Han's behaviour — that picking `i` on a real level starts
// it at his formula's tempo and that a real graded stretch of play actually moves the tempo of
// the audio the level schedules.
//
// So this file assembles the REAL controller and the REAL content stream around a REAL level
// (`applyLevelVariant(LEVELS[4], 'i', anpm)`), mocking only `playMelodies` — every bpm assertion
// below reads the argument the audio layer would actually have received.
//
// ── The timeline these tests drive ────────────────────────────────────────────────────────
// The stream generates blocks 0 AND 1 synchronously at mount (both retired streams did, so a
// level never starts with a short buffer) and every later block from a timer. `evaluate` runs at
// the END of each block's generation:
//     block 0 → seeds the stats snapshot (nothing to diff against — always a no-op)
//     block 1 → diffs against block 0's snapshot; taken in the SAME synchronous pass, so the
//               delta is empty and this is a no-op too
//     block 2 → the FIRST real decision: diffs everything graded since mount. Its commit lands
//               at `commitIndexFor(3*B, [B]) = 3*B`, i.e. block 3.
// Hence: mutate `statsRef` right after mount, run the clock, and read block 3's scheduled bpm.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const scale = Scale.defaultScale();
const percussionScale = Scale.defaultPercussionScale();
const trebleSettings = InstrumentSettings.defaultTrebleInstrumentSettings();
const bassSettings = InstrumentSettings.defaultBassInstrumentSettings();
const percussionSettings = InstrumentSettings.defaultPercussionInstrumentSettings();
const chordSettings = InstrumentSettings.defaultChordInstrumentSettings();
const metronomeSettings = InstrumentSettings.defaultMetronomeInstrumentSettings();
const wizardInstrument = { name: 'wizard-cast' };
const bassInstrument = { name: 'cello' };
const metronomeInstrument = { name: 'woodblock' };

const ANCHOR = 10;   // levelAudioStart, in AudioContext seconds
// Module-level, never a per-render literal: `timeSignature` is in the stream effect's dependency
// array, so a fresh `[4, 4]` each render would tear the JIT schedule down and rebuild it on every
// state update — an infinite generate/setState loop, not a test failure.
const DEFAULT_TS = [4, 4];

// The `useLevel.js` stats shape — every field a cumulative counter, which is what lets the
// controller diff two snapshots into a "just this block" delta.
const stats = (over = {}) => ({
    defeated: 0, misses: 0, perfect: 0, tooFast: 0, tooSlow: 0, muchTooFast: 0, muchTooSlow: 0,
    secondAttemptCorrected: 0, wrongUncorrected: 0, missed: 0, extraNote: 0, ...over,
});
const CLEAN = stats({ defeated: 10, perfect: 10 });                        // 100% → speed up
const ROUGH = stats({ defeated: 2, perfect: 2, misses: 8, missed: 8 });    // 20%  → slow down
const OK_ISH = stats({ defeated: 8, perfect: 8, misses: 2, missed: 2 });   // 80%  → hold

const barSecFor = (lvl, bpm) => {
    const ts = lvl.timeSignature ?? DEFAULT_TS;
    return ((TICKS_PER_WHOLE * ts[0]) / ts[1]) * secondsPerTick(bpm);
};

/**
 * Mount the controller + the content stream together, exactly the way App.jsx wires them:
 * `bpmRef` is the single source of truth for "the tempo now", `begin()` is called once at level
 * start with the level's AUTHORED tempo (what the clamp is expressed against).
 */
function mountAdaptiveLevel(lvl, statsRef) {
    const context = { currentTime: 0 };
    const bpmRef = { current: lvl.bpm };
    const setBpmCalls = [];
    const setBpm = (v) => { bpmRef.current = v; setBpmCalls.push(v); };
    const wizardStopFnsRef = { current: [] };
    const backingStopFnsRef = { current: [] };

    const hook = renderHook(() => {
        const adaptiveTempo = useAdaptiveTempo({ bpmRef, setBpm, context });
        // App.jsx calls `begin` in `startLevel`, before the stream's effect ever runs. A render-phase
        // ref guard reproduces that ordering (begin only assigns to the controller's own ref).
        const begun = React.useRef(false);
        if (!begun.current) { begun.current = true; adaptiveTempo.begin(lvl.adaptiveBaseBpm); }
        useLevelContentStream({
            active: true,
            lvl,
            scale,
            timeSignature: lvl.timeSignature ?? DEFAULT_TS,
            trebleSettings, bassSettings, percussionSettings, chordSettings, metronomeSettings,
            percussionScale,
            chordProgression: null,
            context,
            levelAudioStart: ANCHOR,
            wizardInstrument,
            wizardVolume: 1,
            wizardStopFnsRef,
            bassInstrument,
            metronomeInstrument,
            backingStopFnsRef,
            bassReady: true,
            metronomeReady: true,
            levelMelodyReady: true,
            adaptiveTempo,
            statsRef,
        });
        return adaptiveTempo;
    });

    // Advance BOTH clocks together: the stream schedules its next generation at an AudioContext
    // time and converts that to a setTimeout delay against `context.currentTime`, so a fake timer
    // alone would compute the delay from a clock that never moves. Small steps keep each nested
    // timer's own delay accurate to within one step.
    const run = (seconds, step = 0.5) => {
        act(() => {
            for (let t = 0; t < seconds; t += step) {
                context.currentTime += step;
                vi.advanceTimersByTime(step * 1000);
            }
        });
    };
    return { ...hook, context, bpmRef, setBpmCalls, run };
}

/**
 * Same stream, but with a SPYING controller instead of the real one — for asserting how often and
 * with what arguments the stream offers a decision. Every object prop is hoisted out of the render
 * callback for the same reason as above: `wizardStopFnsRef` / `backingStopFnsRef` / `timeSignature`
 * are all in the effect's dependency array.
 */
function mountSpiedStream(lvl, evaluate) {
    const context = { currentTime: 0 };
    const wizardStopFnsRef = { current: [] };
    const backingStopFnsRef = { current: [] };
    const statsRef = { current: stats() };
    const adaptiveTempo = { bpmForMeasure: () => lvl.bpm, evaluate };
    const hook = renderHook(() => useLevelContentStream({
        active: true, lvl, scale, timeSignature: lvl.timeSignature ?? DEFAULT_TS,
        trebleSettings, bassSettings, percussionSettings, chordSettings, metronomeSettings,
        percussionScale, chordProgression: null, context, levelAudioStart: ANCHOR,
        wizardInstrument, wizardVolume: 1, wizardStopFnsRef,
        bassInstrument, metronomeInstrument, backingStopFnsRef,
        bassReady: true, metronomeReady: true, levelMelodyReady: true,
        adaptiveTempo, statsRef,
    }));
    const run = (seconds, step = 0.5) => {
        act(() => {
            for (let t = 0; t < seconds; t += step) {
                context.currentTime += step;
                vi.advanceTimersByTime(step * 1000);
            }
        });
    };
    return { ...hook, run };
}

// playMelodies(melodies, instruments, context, bpm, scheduledStart, …)
const callsFor = (instrument) => playMelodies.mock.calls.filter((c) => c[1][0] === instrument);
/** Index 0 is the LEAD-IN; index k+1 is content block k. */
const bassBlock = (k) => callsFor(bassInstrument)[k + 1];
const metronomeBlock = (k) => callsFor(metronomeInstrument)[k + 1];
const castBlock = (k) => callsFor(wizardInstrument)[k];

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

// ── The baseline ───────────────────────────────────────────────────────────────────────────
describe('#1102 end-to-end — the starting tempo comes from the player\'s own ANPM', () => {
    const base = LEVELS[4];   // plain procedural side-scroll level: bpm 80, 3 notes/measure, 8 measures

    it('starts the level at baselineAdaptiveBpm(anpm) and schedules its first audio at that tempo', () => {
        // Level 4 in 4/4: 32 beats over 24 notes → bpm = anpm * 4/3. anpm 45 → 60, comfortably inside
        // the clamp [40, 80] so both directions stay reachable.
        const lvl = applyLevelVariant(base, 'i', 45);
        expect(lvl.bpm).toBe(baselineAdaptiveBpm(base, 45));
        expect(lvl.bpm).toBe(60);
        const { unmount } = mountAdaptiveLevel(lvl, { current: stats() });
        expect(callsFor(bassInstrument)[0][3]).toBe(60);   // the lead-in
        expect(bassBlock(0)[3]).toBe(60);                  // content block 0
        unmount();
    });

    it('with NO ANPM yet, starts at 0.7x the authored tempo — below the ceiling, so it CAN accelerate', () => {
        // Han 2026-08-28 (the UAT bounce): the old fallback was the authored bpm, which is also the clamp
        // ceiling, so a first-time player could only ever be slowed down.
        const lvl = applyLevelVariant(base, 'i', null);
        expect(lvl.bpm).toBe(56);                       // round(80 * 0.7)
        expect(lvl.adaptiveBaseBpm).toBe(base.bpm);     // the clamp is against the AUTHORED tempo
        const { unmount } = mountAdaptiveLevel(lvl, { current: stats() });
        expect(bassBlock(0)[3]).toBe(56);
        unmount();
    });
});

// ── The live adjustment, through the real stream ───────────────────────────────────────────
describe('#1102 end-to-end — a graded stretch actually moves the scheduled tempo', () => {
    const base = LEVELS[4];
    const lvlFor = (anpm) => applyLevelVariant(base, 'i', anpm);

    /**
     * Mount, apply a stats delta as if the player had just played the opening blocks, then run the
     * clock far enough to generate block 3 (block 2 decides, block 3 is the commit index).
     * Returns the bpm block 3's audio was actually scheduled at.
     */
    const bpmAfterStretch = (lvl, delta) => {
        const statsRef = { current: stats() };
        const { unmount, setBpmCalls, run } = mountAdaptiveLevel(lvl, statsRef);
        statsRef.current = delta;
        const B = blockMeasuresFor(lvl);
        // Generate through block 4 so block 3's own generation has certainly happened.
        run((lvl.leadInBars + 5 * B) * barSecFor(lvl, lvl.bpm) + ANCHOR);
        const result = { bass: bassBlock(3)[3], metronome: metronomeBlock(3)[3], setBpmCalls };
        unmount();
        return result;
    };

    it('a CLEAN stretch (>=90% accuracy) raises the next commit block by exactly +5%', () => {
        const lvl = lvlFor(45);   // starts at 60
        const { bass } = bpmAfterStretch(lvl, CLEAN);
        expect(bass).toBeCloseTo(60 * (1 + ADAPTIVE_STEP), 6);   // 63
    });

    it('a ROUGH stretch (<70% accuracy) lowers it by exactly -5%', () => {
        const lvl = lvlFor(45);
        const { bass } = bpmAfterStretch(lvl, ROUGH);
        expect(bass).toBeCloseTo(60 * (1 - ADAPTIVE_STEP), 6);   // 57
    });

    it('an in-between stretch (70-90%) HOLDS — the deadband, not a nudge in either direction', () => {
        const lvl = lvlFor(45);
        const { bass, setBpmCalls } = bpmAfterStretch(lvl, OK_ISH);
        expect(bass).toBe(60);
        expect(setBpmCalls).toEqual([]);   // the app-wide tempo is never touched
    });

    it('the app-wide bpm is updated too, exactly once, when the commit block sounds', () => {
        const lvl = lvlFor(45);
        const { setBpmCalls } = bpmAfterStretch(lvl, CLEAN);
        expect(setBpmCalls).toHaveLength(1);
        expect(setBpmCalls[0]).toBeCloseTo(63, 6);
    });

    // Han's locked clamp: `[authoredBpm/2, authoredBpm]`. Hitting a bound is a SILENT no-op this round —
    // what happens BEYOND either bound is #1120 (floor → rubato) and #1121 (ceiling → note density).
    it('clamps at the CEILING: a clean stretch at the authored tempo changes nothing', () => {
        // anpm 60 → bpm = 60 * 4/3 = 80 = the authored bpm = the clamp ceiling.
        const lvl = lvlFor(60);
        expect(lvl.bpm).toBe(lvl.adaptiveBaseBpm);
        const { bass, setBpmCalls } = bpmAfterStretch(lvl, CLEAN);
        expect(bass).toBe(80);
        expect(setBpmCalls).toEqual([]);
    });

    it('clamps at the FLOOR: a rough stretch at half the authored tempo changes nothing', () => {
        // anpm 30 → bpm = 40 = authoredBpm / 2 = the clamp floor.
        const lvl = lvlFor(30);
        expect(lvl.bpm).toBe(lvl.adaptiveBaseBpm / 2);
        const { bass, setBpmCalls } = bpmAfterStretch(lvl, ROUGH);
        expect(bass).toBe(40);
        expect(setBpmCalls).toEqual([]);
    });
});

// ── Exact cross-track sync ─────────────────────────────────────────────────────────────────
describe('#1102 end-to-end — treble and bass/metronome switch at the SAME content measure', () => {
    // #1165 made this structural rather than arithmetic: with ONE cadence every track of a block is
    // generated and scheduled together at one bpm, so `commitIndexFor` is always called with
    // `units: [B]`. A Wizard level is used here because it is the only shape whose TREBLE is also
    // scheduled as audio (the cast preview), so "treble adopts with the backing" can be asserted on
    // the real scheduling arguments rather than inferred.
    const base = LEVELS[13];   // enemyType 'Wizard', bpm 80, 2 notes/measure, 8 measures
    // 4/4: 32 beats over 16 notes → bpm = anpm * 2. anpm 30 → 60, well inside the clamp [40, 80] so a
    // clean stretch genuinely steps UP rather than being clipped at the ceiling.
    const ANPM = 30;

    it('every track of the commit block carries the identical bpm, and the block before it does not', () => {
        const lvl = applyLevelVariant(base, 'i', ANPM);
        expect(lvl.bpm).toBe(60);
        const statsRef = { current: stats() };
        const { unmount, run } = mountAdaptiveLevel(lvl, statsRef);
        statsRef.current = CLEAN;
        const B = blockMeasuresFor(lvl);
        run((lvl.leadInBars + 8 * B) * barSecFor(lvl, lvl.bpm) + ANCHOR);

        const before = { cast: castBlock(2)[3], bass: bassBlock(2)[3], metronome: metronomeBlock(2)[3] };
        const commit = { cast: castBlock(3)[3], bass: bassBlock(3)[3], metronome: metronomeBlock(3)[3] };
        // Block 2 (the deciding block) is still entirely at the old tempo — the change is scheduled
        // for a FUTURE measure, never applied retroactively to content already scheduled.
        expect(before.cast).toBe(before.bass);
        expect(before.bass).toBe(before.metronome);
        // Block 3 (the commit index) switched — all three tracks, same block, same value.
        expect(commit.cast).toBe(commit.bass);
        expect(commit.bass).toBe(commit.metronome);
        expect(commit.bass).toBeGreaterThan(before.bass);
        unmount();
    });

    it('the commit lands at the block boundary commitIndexFor picked — never mid-block', () => {
        const lvl = applyLevelVariant(base, 'i', ANPM);
        const statsRef = { current: stats() };
        const { unmount, run } = mountAdaptiveLevel(lvl, statsRef);
        statsRef.current = CLEAN;
        const B = blockMeasuresFor(lvl);
        run((lvl.leadInBars + 8 * B) * barSecFor(lvl, lvl.bpm) + ANCHOR);
        // Blocks 0-2 at the baseline, block 3 onwards at the stepped tempo: one clean switch, and no
        // track ever runs at a tempo of its own.
        [0, 1, 2].forEach((k) => expect(bassBlock(k)[3]).toBe(lvl.bpm));
        expect(bassBlock(3)[3]).not.toBe(lvl.bpm);
        unmount();
    });
});

// ── The 3x evaluation runway, and that the level still ENDS ────────────────────────────────
describe('#1102 end-to-end — an adaptive level plays through ~3x, then stops', () => {
    const base = LEVELS[4];

    it('generates ADAPTIVE_LEVEL_REPEATS x the base block count and then stops generating', () => {
        const lvl = applyLevelVariant(base, 'i', 45);
        const expectedBlocks = blockCountFor(base) * ADAPTIVE_LEVEL_REPEATS;
        expect(blockCountFor(lvl)).toBe(expectedBlocks);
        expect(Number.isFinite(expectedBlocks)).toBe(true);

        const { unmount, run } = mountAdaptiveLevel(lvl, { current: stats() });
        const B = blockMeasuresFor(lvl);
        // Run well past the level's own end (the tempo only ever rises here, so the real timeline is
        // never longer than the baseline-tempo estimate).
        run((lvl.leadInBars + (expectedBlocks + 4) * B) * barSecFor(lvl, lvl.bpm) + ANCHOR);

        // One lead-in call + exactly `expectedBlocks` content blocks — the recursion terminated.
        expect(callsFor(metronomeInstrument)).toHaveLength(expectedBlocks + 1);
        const after = playMelodies.mock.calls.length;
        run(60);
        expect(playMelodies.mock.calls.length).toBe(after);   // nothing further is ever scheduled
        unmount();
    });

    it('gives the controller ~3x the evaluation points (the "no visible acceleration" UAT fix)', () => {
        // The complaint that parked #1102: a level was ONE generation chunk, so the decider ran zero
        // times mid-level. Post-#1166 a base level is 4 blocks; the repeat makes it 12. A SPYING
        // controller here (instead of the real one) so the raw call count and its arguments are visible.
        const lvl = applyLevelVariant(base, 'i', 45);
        const evaluate = vi.fn();
        const { unmount, run } = mountSpiedStream(lvl, evaluate);
        const B = blockMeasuresFor(lvl);
        run((lvl.leadInBars + (blockCountFor(lvl) + 4) * B) * barSecFor(lvl, lvl.bpm) + ANCHOR);

        expect(evaluate).toHaveBeenCalledTimes(blockCountFor(lvl));
        expect(evaluate).toHaveBeenCalledTimes(blockCountFor(base) * ADAPTIVE_LEVEL_REPEATS);
        // Every decision is offered at a block boundary, with the one-cadence unit list — which is what
        // makes treble/bass/metronome sync structural rather than arithmetic.
        evaluate.mock.calls.forEach(([arg], k) => {
            expect(arg.units).toEqual([B]);
            expect(arg.fromMeasure).toBe((k + 1) * B);
        });
        unmount();
    });

    it('a NON-adaptive run of the same level is byte-identical — nothing got longer by accident', () => {
        const plain = LEVELS[4];
        const { unmount, run } = mountAdaptiveLevel({ ...plain, adaptiveBaseBpm: plain.bpm }, { current: stats() });
        const B = blockMeasuresFor(plain);
        run((plain.leadInBars + (blockCountFor(plain) + 4) * B) * barSecFor(plain, plain.bpm) + ANCHOR);
        expect(callsFor(metronomeInstrument)).toHaveLength(blockCountFor(plain) + 1);
        expect(playMelodies.mock.calls.every((c) => c[3] === plain.bpm)).toBe(true);
        unmount();
    });
});
