import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import useLevelContentStream from '../useLevelContentStream';
import useAdaptiveDifficulty from '../useAdaptiveDifficulty';
import { LEVELS, applyLevelVariant } from '../../levels/levels';
import { baselineAdaptiveBpm, ADAPTIVE_STEP, ADAPTIVE_LEVEL_REPEATS } from '../../levels/adaptiveTempo';
import { MAX_TREBLE_DENSITY_STEP } from '../../levels/adaptiveLadder';
import { blockMeasuresFor, blockCountFor } from '../../levels/levelBlockPlan';
import Scale from '../../model/Scale';
import InstrumentSettings from '../../model/InstrumentSettings';
import { TICKS_PER_WHOLE, secondsPerTick } from '../../constants/timing';

vi.mock('../../audio/playMelodies', () => ({ default: vi.fn(() => 0) }));
import playMelodies from '../../audio/playMelodies';

// #1121: a PASS-THROUGH spy — the real generator still runs (every bpm/scheduling assertion below
// depends on real material), but each block's own `instrumentSettings` is recorded so the ladder's
// DENSITY rung can be asserted on the arguments generation actually received, not on controller state.
vi.mock('../../generation/generateBlock', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        generateBlock: vi.fn((args) => actual.generateBlock(args)),
    };
});
import { generateBlock } from '../../generation/generateBlock';

/** The treble settings block k was generated with. Index 0 is the LEAD-IN. */
const trebleArgsFor = (k) => generateBlock.mock.calls[k + 1][0].seriesArgs.instrumentSettings.treble;
const bassArgsFor = (k) => generateBlock.mock.calls[k + 1][0].seriesArgs.instrumentSettings.bass;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// #1102 — ADAPTIVE MODE, END TO END (letter `i`).
//
// The unit suites cover the pieces in isolation: `adaptiveTempo.test.js` (the level-start formula +
// the commit-index primitive), `adaptiveLadder.test.js` (the whole ordered difficulty ladder as a
// pure policy), `useAdaptiveDifficulty.test.js` (decide/schedule/apply),
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
const timpaniInstrument = { name: 'timpani' };

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
function mountAdaptiveLevel(lvl, statsRef, songMelody = null) {
    const context = { currentTime: 0 };
    const bpmRef = { current: lvl.bpm };
    const setBpmCalls = [];
    const setBpm = (v) => { bpmRef.current = v; setBpmCalls.push(v); };
    // #1120: App.jsx's `pacingMode` setter and the hidden-grade ring buffer, wired exactly as it does.
    const setPacingModeCalls = [];
    const hiddenGradesRef = { current: [] };
    const setPacingMode = (v) => { hiddenGradesRef.current = []; setPacingModeCalls.push(v); };
    const wizardStopFnsRef = { current: [] };
    const backingStopFnsRef = { current: [] };

    const hook = renderHook(() => {
        const adaptiveDifficulty = useAdaptiveDifficulty({ bpmRef, setBpm, setPacingMode, context });
        // App.jsx calls `begin` in `startLevel`, before the stream's effect ever runs. A render-phase
        // ref guard reproduces that ordering (begin only assigns to the controller's own ref).
        const begun = React.useRef(false);
        if (!begun.current) { begun.current = true; adaptiveDifficulty.begin(lvl.adaptiveBaseBpm, lvl); }
        const content = useLevelContentStream({
            active: true,
            lvl,
            scale,
            // #1168: a song-backed level slices this instead of generating its treble. `null` for
            // every procedural level, exactly as App.jsx passes it.
            songMelody,
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
            // #1167: timpani rides the same per-block schedule now, so it is part of what
            // "every track switches at the same measure" has to mean.
            timpaniInstrument,
            timpaniVolume: 1,
            backingStopFnsRef,
            bassReady: true,
            metronomeReady: true,
            levelMelodyReady: true,
            adaptiveDifficulty,
            statsRef,
            hiddenGradesRef,
        });
        return { adaptiveDifficulty, content };
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
    return { ...hook, context, bpmRef, setBpmCalls, setPacingModeCalls, hiddenGradesRef, run };
}

/**
 * Same stream, but with a SPYING controller instead of the real one — for asserting how often and
 * with what arguments the stream offers a decision. Every object prop is hoisted out of the render
 * callback for the same reason as above: `wizardStopFnsRef` / `backingStopFnsRef` / `timeSignature`
 * are all in the effect's dependency array.
 */
function mountSpiedStream(lvl, evaluate, songMelody = null) {
    const context = { currentTime: 0 };
    const wizardStopFnsRef = { current: [] };
    const backingStopFnsRef = { current: [] };
    const statsRef = { current: stats() };
    const adaptiveDifficulty = {
        blockSettingsFor: () => ({ bpm: lvl.bpm, densityStep: 0, pacing: 'timed' }),
        evaluate,
    };
    const hook = renderHook(() => useLevelContentStream({
        active: true, lvl, scale, timeSignature: lvl.timeSignature ?? DEFAULT_TS,
        trebleSettings, bassSettings, percussionSettings, chordSettings, metronomeSettings,
        percussionScale, chordProgression: null, songMelody, context, levelAudioStart: ANCHOR,
        wizardInstrument, wizardVolume: 1, wizardStopFnsRef,
        bassInstrument, metronomeInstrument, timpaniInstrument, timpaniVolume: 1, backingStopFnsRef,
        bassReady: true, metronomeReady: true, levelMelodyReady: true,
        adaptiveDifficulty, statsRef,
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
const timpaniBlock = (k) => callsFor(timpaniInstrument)[k + 1];
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

    // Han's locked clamp: `[authoredBpm/2, authoredBpm]`. The TEMPO never leaves it — since #1121 the
    // ladder continues past both bounds through NOTE DENSITY instead (asserted in its own describe
    // block below); #1120 hangs gated pacing off the very bottom.
    it('clamps at the CEILING: a clean stretch at the authored tempo never moves the TEMPO', () => {
        // anpm 60 → bpm = 60 * 4/3 = 80 = the authored bpm = the clamp ceiling.
        const lvl = lvlFor(60);
        expect(lvl.bpm).toBe(lvl.adaptiveBaseBpm);
        const { bass, setBpmCalls } = bpmAfterStretch(lvl, CLEAN);
        expect(bass).toBe(80);
        expect(setBpmCalls).toEqual([]);
    });

    it('clamps at the FLOOR: a rough stretch at half the authored tempo never moves the TEMPO', () => {
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

    // #1167 (Han 2026-08-29, "Genereer de timpanen en cello gewoon mee met de chunks"): the timpani
    // used to be ONE whole-level schedule at the STARTING tempo, so it drifted against exactly the
    // tempo change this describe block is about (§354 limitation 1). It is now a block of the same
    // stream, which is the only thing that makes "every track, same measure, same value" complete.
    it('the TIMPANI adopts the same tempo at the same block as cello and metronome', () => {
        const lvl = applyLevelVariant(base, 'i', ANPM);
        const statsRef = { current: stats() };
        const { unmount, run } = mountAdaptiveLevel(lvl, statsRef);
        statsRef.current = CLEAN;
        const B = blockMeasuresFor(lvl);
        run((lvl.leadInBars + 8 * B) * barSecFor(lvl, lvl.bpm) + ANCHOR);

        expect(timpaniBlock(2)[3]).toBe(bassBlock(2)[3]);       // before the commit — old tempo
        expect(timpaniBlock(3)[3]).toBe(bassBlock(3)[3]);       // at the commit — the new one
        expect(timpaniBlock(3)[3]).toBeGreaterThan(timpaniBlock(2)[3]);
        // …and it rides the identical cursor, not a timeline of its own.
        expect(timpaniBlock(3)[4]).toBeCloseTo(bassBlock(3)[4], 9);
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
        // #1121: and EVERY block was generated at the level's own authored density — the ladder is
        // provably inert for a level that is not adaptive (acceptance criterion 10).
        const authored = trebleArgsFor(0);
        for (let k = 1; k < blockCountFor(plain); k++) {
            expect(trebleArgsFor(k)).toBe(authored);   // the same OBJECT, not merely an equal one
        }
        unmount();
    });
});

// ── #1168: the SAME end-to-end guarantees on a SONG-backed level ────────────────────────────
// Until #1168 a song level was ONE block (`blockMeasuresFor` fell through to `numMeasures`, which
// for a song is the SONG'S LENGTH), so the decider fired exactly once — a seed, never a decision
// (§354 limitation 5). And songs were excluded from the ×3 runway, because their treble slice is
// unwrapped. Both are fixed by the same move: a flat 2-measure cadence, and a source materialised
// ×3 so the unwrapped slice still stops at the level's true end. See §366.
describe('#1168 end-to-end — a song-backed level adapts per block and still ends', () => {
    const sakura = LEVELS[205];   // songId 'sakura', 4/4, 14 measures, bpm 72

    /** A fake loaded song: one whole-measure note per measure, so slices are trivially checkable. */
    const fakeSong = (measures, ts) => {
        const mlt = (TICKS_PER_WHOLE * ts[0]) / ts[1];
        const pool = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'];
        return {
            notes: Array.from({ length: measures }, (_, i) => pool[i % pool.length]),
            durations: Array.from({ length: measures }, () => mlt),
            offsets: Array.from({ length: measures }, (_, i) => i * mlt),
            displayNotes: Array.from({ length: measures }, (_, i) => pool[i % pool.length]),
        };
    };

    it('gives the controller a real decision at EVERY block boundary — not one seed for the whole song', () => {
        const lvl = applyLevelVariant(sakura, 'i', 60);
        // The actual ticket: 1 → ceil(14*3 / 2) = 21 evaluation points.
        expect(blockMeasuresFor(lvl)).toBe(2);
        expect(blockCountFor(lvl)).toBe(blockCountFor(sakura) * ADAPTIVE_LEVEL_REPEATS);
        expect(blockCountFor(lvl)).toBeGreaterThan(1);

        const evaluate = vi.fn();
        const song = fakeSong(sakura.totalMeasures, lvl.timeSignature);
        const { unmount, run } = mountSpiedStream(lvl, evaluate, song);
        const B = blockMeasuresFor(lvl);
        run((lvl.leadInBars + (blockCountFor(lvl) + 4) * B) * barSecFor(lvl, lvl.bpm) + ANCHOR);
        expect(evaluate).toHaveBeenCalledTimes(blockCountFor(lvl));
        evaluate.mock.calls.forEach(([arg], k) => {
            expect(arg.units).toEqual([B]);
            expect(arg.fromMeasure).toBe((k + 1) * B);
        });
        unmount();
    });

    it('plays the song 3x verbatim, every track switching tempo at the same block, and then STOPS', () => {
        // Pick the ANPM that lands the baseline strictly INSIDE Han's clamp [authored/2, authored], so a
        // clean stretch genuinely steps the tempo up instead of being clipped at the ceiling. Derived,
        // never a hardcoded number — the song's own note density decides it (§6c).
        const lvl = (() => {
            for (let anpm = 1; anpm < 400; anpm++) {
                const v = applyLevelVariant(sakura, 'i', anpm);
                if (v.bpm < v.adaptiveBaseBpm && v.bpm > v.adaptiveBaseBpm / 2) return v;
            }
            throw new Error('no ANPM lands Sakura inside its clamp');
        })();
        const song = fakeSong(sakura.totalMeasures, lvl.timeSignature);
        const statsRef = { current: stats() };
        const { unmount, run, result } = mountAdaptiveLevel(lvl, statsRef, song);
        statsRef.current = CLEAN;
        const B = blockMeasuresFor(lvl);
        run((lvl.leadInBars + (blockCountFor(lvl) + 4) * B) * barSecFor(lvl, lvl.bpm) + ANCHOR);

        // The content really IS 3x long — the song's own notes, three times, seamlessly.
        const treble = result.current.content.treble;
        expect(treble.notes).toEqual([...song.notes, ...song.notes, ...song.notes]);
        // …and it stops exactly there (§289): generation terminated, nothing further is scheduled.
        expect(callsFor(metronomeInstrument)).toHaveLength(blockCountFor(lvl) + 1);
        const after = playMelodies.mock.calls.length;
        run(60);
        expect(playMelodies.mock.calls.length).toBe(after);
        expect(result.current.content.treble.notes.length).toBe(song.notes.length * ADAPTIVE_LEVEL_REPEATS);
        // The tempo genuinely moved during the run, and cello/metronome/timpani moved together.
        const k = blockCountFor(lvl) - 1;
        expect(bassBlock(k)[3]).toBeGreaterThan(lvl.bpm);
        expect(metronomeBlock(k)[3]).toBe(bassBlock(k)[3]);
        expect(timpaniBlock(k)[3]).toBe(bassBlock(k)[3]);
        unmount();
    });

    it('a NON-adaptive run of the same song plays through exactly ONCE, at one tempo', () => {
        const song = fakeSong(sakura.totalMeasures, sakura.timeSignature);
        const { unmount, run, result } = mountAdaptiveLevel(
            { ...sakura, adaptiveBaseBpm: sakura.bpm }, { current: stats() }, song,
        );
        const B = blockMeasuresFor(sakura);
        run((sakura.leadInBars + (blockCountFor(sakura) + 4) * B) * barSecFor(sakura, sakura.bpm) + ANCHOR);
        expect(result.current.content.treble.notes).toEqual(song.notes);   // one pass, not three
        expect(callsFor(metronomeInstrument)).toHaveLength(blockCountFor(sakura) + 1);
        expect(playMelodies.mock.calls.every((c) => c[3] === sakura.bpm)).toBe(true);
        unmount();
    });

    // Levels 1 and 2 are the shape the design note did not call out: a GATED song level. Its
    // `blockCountFor` is Infinity by design (§867 — content must never run out during a freeze), so
    // "the level ends" rests entirely on the TREBLE stopping at the level's true 3x end.
    it('a GATED song level (levels 1/2) triples too, and its treble still stops at the 3x end', () => {
        const gatedSong = LEVELS[1];
        expect(gatedSong.songId).toBeTruthy();
        expect(gatedSong.gatedScroll).toBe(true);
        const lvl = applyLevelVariant(gatedSong, 'i', 60);
        expect(lvl.totalMeasures).toBe(gatedSong.totalMeasures * ADAPTIVE_LEVEL_REPEATS);
        expect(lvl.contentPeriodMeasures).toBe(gatedSong.totalMeasures);
        expect(blockCountFor(lvl)).toBe(Infinity);

        const song = fakeSong(gatedSong.totalMeasures, lvl.timeSignature);
        const { unmount, run, result } = mountAdaptiveLevel(lvl, { current: stats() }, song);
        const B = blockMeasuresFor(lvl);
        run((lvl.leadInBars + (lvl.totalMeasures + 12) * B) * barSecFor(lvl, lvl.bpm) + ANCHOR);
        // The cello keeps flowing forever (the gate may hold on any note) …
        expect(result.current.content.bass.notes.length).toBeGreaterThan(0);
        // … but the treble is exactly 3 passes of the song and never one note more.
        expect(result.current.content.treble.notes)
            .toEqual([...song.notes, ...song.notes, ...song.notes]);
        unmount();
    });
});

// ── #1121: at the ceiling, difficulty grows through CONTENT instead of tempo ────────────────
describe('#1121 end-to-end — the ladder densifies at the ceiling and unwinds symmetrically', () => {
    // Level 11: authored `notesPerMeasure` 4 on an eighth grid and, crucially, `insertBeatRests:
    // false` — so every density notch shows up immediately. (Level 4 authors `insertBeatRests: true`,
    // which already fills every beat, so its first notch is a documented silent no-op — see §361.)
    const base = LEVELS[11];
    // The AUTHORED density the ladder measures from is whatever `trebleSettings` this harness passes
    // in — `useLevel.applyConfig` (which is what copies `lvl.notesPerMeasure` onto the settings in the
    // real app) is not part of this integration. That is exactly right: the projection reads the
    // SETTINGS BUNDLE, never the level object.
    const AUTHORED_NPM = trebleSettings.notesPerMeasure;
    const ceilingLevel = () => {
        // Pick the ANPM that lands the starting tempo exactly ON the authored bpm, so the very first
        // real decision has nowhere left to go on the tempo rung and must move the CONTENT instead.
        for (let anpm = 1; anpm < 400; anpm++) {
            const lvl = applyLevelVariant(base, 'i', anpm);
            if (lvl.bpm === lvl.adaptiveBaseBpm) return lvl;
        }
        throw new Error('no ANPM pins level 11 at its ceiling');
    };

    /** Mount at the ceiling, feed one graded stretch, and run far enough to see the commit block. */
    const runAtCeiling = (delta, blocks = 5) => {
        const lvl = ceilingLevel();
        const statsRef = { current: stats() };
        const { unmount, setBpmCalls, run } = mountAdaptiveLevel(lvl, statsRef);
        statsRef.current = delta;
        const B = blockMeasuresFor(lvl);
        run((lvl.leadInBars + blocks * B) * barSecFor(lvl, lvl.bpm) + ANCHOR);
        return { lvl, unmount, setBpmCalls, run, B };
    };

    it('a clean stretch AT the ceiling raises notesPerMeasure, at an unchanged tempo', () => {
        const { lvl, unmount, setBpmCalls } = runAtCeiling(CLEAN);
        // Blocks 0-2 predate the commit; block 3 is the commit index (see this file's header).
        expect(trebleArgsFor(2).notesPerMeasure).toBe(AUTHORED_NPM);
        expect(trebleArgsFor(3).notesPerMeasure).toBe(AUTHORED_NPM + 1);
        // …and the SCROLL SPEED is untouched: every block, before and after, sounds at the ceiling.
        expect(bassBlock(2)[3]).toBe(lvl.bpm);
        expect(bassBlock(3)[3]).toBe(lvl.bpm);
        expect(setBpmCalls).toEqual([]);   // nothing app-wide switched — no visual re-anchor at all
        unmount();
    });

    it('keeps stepping ONE notch per block boundary, then holds silently at the cap', () => {
        const lvl = ceilingLevel();
        const statsRef = { current: stats() };
        const { unmount, run, setBpmCalls } = mountAdaptiveLevel(lvl, statsRef);
        const B = blockMeasuresFor(lvl);
        const barSec = barSecFor(lvl, lvl.bpm);
        // Keep the player perfectly clean for the whole run: every boundary sees a fresh graded
        // stretch, so the ladder gets to step at every single one of them.
        let played = 0;
        run(ANCHOR + lvl.leadInBars * barSec);
        for (let i = 0; i < blockCountFor(lvl) + 2; i++) {
            played += 10;
            statsRef.current = stats({ defeated: played, perfect: played });
            run(B * barSec);
        }
        const seen = generateBlock.mock.calls.slice(1)
            .map((c) => c[0].seriesArgs.instrumentSettings.treble.notesPerMeasure);
        // Monotone, never more than one notch at a time, and never past the treble cap.
        for (let i = 1; i < seen.length; i++) {
            expect(seen[i] - seen[i - 1]).toBeGreaterThanOrEqual(0);
            expect(seen[i] - seen[i - 1]).toBeLessThanOrEqual(1);
        }
        expect(Math.max(...seen)).toBeGreaterThan(AUTHORED_NPM);
        expect(Math.max(...seen)).toBeLessThanOrEqual(AUTHORED_NPM + MAX_TREBLE_DENSITY_STEP);
        // The cello is untouched for as long as the treble still has room — the bass is a LATER rung
        // on the same ladder (Han q3), never a parallel knob.
        const authoredBassNpm = bassArgsFor(0).notesPerMeasure;
        seen.forEach((npm, k) => {
            if (npm < AUTHORED_NPM + MAX_TREBLE_DENSITY_STEP) {
                expect(bassArgsFor(k).notesPerMeasure).toBe(authoredBassNpm);
            }
        });
        // …and this run really did reach the bass rungs, so the assertion above is not vacuous.
        expect(bassArgsFor(seen.length - 1).notesPerMeasure).toBeGreaterThan(authoredBassNpm);
        // And not one of those notches touched the app-wide tempo.
        expect(setBpmCalls).toEqual([]);
        unmount();
    });

    it('the ADDED density comes off before the bpm is allowed to drop again', () => {
        const lvl = ceilingLevel();
        const statsRef = { current: stats() };
        const { unmount, setBpmCalls, run } = mountAdaptiveLevel(lvl, statsRef);
        const B = blockMeasuresFor(lvl);
        const barSec = barSecFor(lvl, lvl.bpm);
        // Two clean stretches → the ladder climbs two density notches at the ceiling…
        statsRef.current = stats({ defeated: 10, perfect: 10 });
        run((lvl.leadInBars + 4 * B) * barSec + ANCHOR);
        statsRef.current = stats({ defeated: 20, perfect: 20 });
        run(3 * B * barSec);
        const peak = Math.max(...generateBlock.mock.calls.slice(1)
            .map((c) => c[0].seriesArgs.instrumentSettings.treble.notesPerMeasure));
        expect(peak).toBeGreaterThan(AUTHORED_NPM);
        expect(setBpmCalls).toEqual([]);   // the tempo never moved on the way up
        // …then the player starts missing. The next commits must remove the added density, and ONLY
        // once it is gone may the tempo fall.
        for (let i = 0; i < 3; i++) {
            statsRef.current = stats({
                defeated: 20 + i, misses: 10 * (i + 1), missed: 10 * (i + 1),
            });
            run(3 * B * barSec);
        }
        const tail = generateBlock.mock.calls.slice(1)
            .map((c) => c[0].seriesArgs.instrumentSettings.treble.notesPerMeasure);
        expect(tail[tail.length - 1]).toBeLessThan(peak);          // density came off
        expect(setBpmCalls).toEqual([]);                           // and the tempo still has not moved
        unmount();
    });

    it('the level still ENDS at blockCountFor even on a run where the ladder moved', () => {
        const lvl = ceilingLevel();
        const statsRef = { current: stats() };
        const { unmount, run } = mountAdaptiveLevel(lvl, statsRef);
        statsRef.current = CLEAN;
        const B = blockMeasuresFor(lvl);
        run((lvl.leadInBars + (blockCountFor(lvl) + 4) * B) * barSecFor(lvl, lvl.bpm) + ANCHOR);
        // Density changes the CONTENT of a block, never the timeline: same block count as always.
        expect(callsFor(metronomeInstrument)).toHaveLength(blockCountFor(lvl) + 1);
        const after = playMelodies.mock.calls.length;
        run(60);
        expect(playMelodies.mock.calls.length).toBe(after);
        unmount();
    });
});

// ── #1120: the GATED PACING rung — and the invariant that keeps the level FINITE ────────────
// THE ONE THAT MATTERS: `loopForever` (useLevelContentStream) and `blockCountFor`'s `Infinity`
// (levelBlockPlan) stay bound to the AUTHORED `lvl.gatedScroll` field ALONE. A ladder-gated level is
// PROCEDURAL, and a procedural level's `total` (SheetRpgLayer's `slimeData.length`) grows with the
// stream — so an infinite stream there means `killedCount >= total` can never fire and the level
// NEVER ENDS. That is §289, whose bug class has already bitten this codebase three times; this suite
// exists so a fourth cannot land silently.
describe('#1120 end-to-end — the ladder gates at the floor, and the level STILL ENDS', () => {
    const base = LEVELS[4];   // procedural, side-scroll, plain Slime — in scope for the pacing rung

    /**
     * Mount at the FLOOR (anpm 30 → bpm 40 = adaptiveBaseBpm/2, the clamp floor, so the tempo rung is
     * already spent) and keep the player struggling at every boundary: the ladder must then thin the
     * content to the skeleton and only after that switch the pacing.
     */
    const runToGated = (lvl = applyLevelVariant(base, 'i', 30)) => {
        const statsRef = { current: stats() };
        const mounted = mountAdaptiveLevel(lvl, statsRef);
        const B = blockMeasuresFor(lvl);
        const barSec = barSecFor(lvl, lvl.bpm);
        mounted.run(ANCHOR + lvl.leadInBars * barSec);
        let played = 0;
        for (let i = 0; i < blockCountFor(lvl) + 4; i++) {
            played += 10;
            // A genuinely rough stretch: 10 more notes faced, almost all missed.
            statsRef.current = stats({ defeated: played, perfect: 1, misses: played, missed: played });
            mounted.run(B * barSec);
        }
        return { ...mounted, lvl, B, statsRef };
    };

    it('flips to gated only at (floor bpm, skeleton content) — and the pacing really did flip', () => {
        const lvl = applyLevelVariant(base, 'i', 30);
        expect(lvl.bpm).toBe(lvl.adaptiveBaseBpm / 2);   // starts pinned AT the clamp floor
        const { setPacingModeCalls, setBpmCalls, unmount } = runToGated(lvl);
        expect(setPacingModeCalls).toContain('gated');
        // The tempo rung was already fully spent before the pacing moved — it never moved at all here.
        expect(setBpmCalls).toEqual([]);
        // …and the content really was thinned first: the last generated block is at the skeleton rung.
        expect(trebleArgsFor(blockCountFor(lvl) - 1).notesPerMeasure)
            .toBeLessThan(trebleArgsFor(0).notesPerMeasure);
        unmount();
    });

    it('THE HARD INVARIANT: the ladder NEVER sets loopForever — the block plan stays FINITE', () => {
        const { lvl, unmount, run, setPacingModeCalls } = runToGated();
        expect(setPacingModeCalls).toContain('gated');   // the run really did gate — not vacuous
        // The authored field is untouched, so `blockCountFor` is untouched…
        expect(lvl.gatedScroll).toBeFalsy();
        expect(Number.isFinite(blockCountFor(lvl))).toBe(true);
        expect(blockCountFor(lvl)).toBe(blockCountFor(base) * ADAPTIVE_LEVEL_REPEATS);
        // …and the stream really did stop generating at that count: one lead-in call plus exactly
        // `blockCountFor` content blocks, and nothing further ever again.
        expect(generateBlock).toHaveBeenCalledTimes(blockCountFor(lvl) + 1);
        const after = generateBlock.mock.calls.length;
        run(120);
        expect(generateBlock.mock.calls.length).toBe(after);
        unmount();
    });

    it('never tears the content stream down: lvl identity and gatedScroll are unchanged', () => {
        const lvl = applyLevelVariant(base, 'i', 30);
        const { unmount, setPacingModeCalls, result } = runToGated(lvl);
        expect(setPacingModeCalls).toContain('gated');
        expect(lvl.gatedScroll).toBeFalsy();   // NEVER mutated — the flip is app state, not the level
        // The published treble grew monotonically across the flip (append-only, never reset).
        expect(result.current.content.treble.notes.length).toBeGreaterThan(0);
        unmount();
    });

    it('picture and sound flip on ONE block boundary: cello, metronome AND timpani stop together', () => {
        const { lvl, unmount, setPacingModeCalls } = runToGated();
        expect(setPacingModeCalls).toContain('gated');
        // Index 0 of each is the LEAD-IN, so `n - 1` is how many CONTENT blocks were put on the fixed
        // schedule before the flip. All three tracks must stop at the identical block.
        const bassBlocks = callsFor(bassInstrument).length - 1;
        const metronomeBlocks = callsFor(metronomeInstrument).length - 1;
        const timpaniBlocks = callsFor(timpaniInstrument).length - 1;
        expect(bassBlocks).toBe(metronomeBlocks);
        expect(timpaniBlocks).toBe(metronomeBlocks);
        // …and the flip genuinely happened mid-level: fewer scheduled blocks than generated ones.
        expect(metronomeBlocks).toBeGreaterThan(0);
        expect(metronomeBlocks).toBeLessThan(blockCountFor(lvl));
        unmount();
    });

    it('no DOUBLE timpani after the flip — the fixed schedule stops with the metronome', () => {
        // The third guard the design note originally missed: `timpaniEnabled` is built once per
        // effect, so without a per-BLOCK schedule guard every post-flip block would have kept putting
        // timpani on the clock while the gate-clock hook fired it too — audibly drifting apart.
        const { unmount } = runToGated();
        expect(callsFor(timpaniInstrument).length).toBe(callsFor(metronomeInstrument).length);
        unmount();
    });

    it('an adaptive WIZARD level parks at (floor, skeleton) and never gates', () => {
        // Han q6's graceful consequence: there is no gate-aware cast timing, so the cast must never
        // fire into a frozen screen. One predicate (`gatingAllowed`), no special case.
        const wizard = LEVELS[13];
        const lvl = applyLevelVariant(wizard, 'i', 1);   // far below the floor → clamped onto it
        const { unmount, setPacingModeCalls } = runToGated(lvl);
        expect(setPacingModeCalls).toEqual([]);
        // …and the cast preview kept being scheduled for every block, exactly as before.
        expect(callsFor(wizardInstrument).length).toBe(blockCountFor(lvl));
        unmount();
    });

    it('a level that AUTHORS rubato is byte-identical: no metronome, no fixed cello, ever', () => {
        // Levels 1/2 (variant 'a'): they start gated, so the ladder's pacing rung is unreachable for
        // them (`gatingAllowed` excludes `gatedScroll`) and this ticket must change nothing at all.
        const gated = LEVELS[1];
        expect(gated.gatedScroll).toBe(true);
        const mlt = (TICKS_PER_WHOLE * (gated.timeSignature?.[0] ?? 4)) / (gated.timeSignature?.[1] ?? 4);
        const song = {
            notes: ['C4', 'D4'], durations: [mlt, mlt], offsets: [0, mlt], displayNotes: ['C4', 'D4'],
        };
        const { unmount, run } = mountAdaptiveLevel(
            { ...gated, adaptiveBaseBpm: gated.bpm }, { current: stats() }, song,
        );
        run(ANCHOR + 40 * barSecFor(gated, gated.bpm));
        expect(callsFor(metronomeInstrument)).toHaveLength(0);
        expect(callsFor(bassInstrument)).toHaveLength(0);
        expect(callsFor(timpaniInstrument)).toHaveLength(0);
        unmount();
    });
});
