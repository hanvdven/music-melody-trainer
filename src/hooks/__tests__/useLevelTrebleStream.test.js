import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useLevelTrebleStream, { blockScaleForCallResponse } from '../useLevelTrebleStream';
import Scale from '../../model/Scale';
import InstrumentSettings from '../../model/InstrumentSettings';

vi.mock('../../audio/playMelodies', () => ({ default: vi.fn(() => 0) }));
import playMelodies from '../../audio/playMelodies';
// The block CONTENT is irrelevant to the tempo assertions below (and generating real content would drag
// the whole MelodyGenerator pipeline into a timing test) — stub it to one predictable note.
vi.mock('../../generation/generateLevelMixedBlock', () => ({
    generateLevelMixedBlock: vi.fn(() => ({
        notes: ['C4'], durations: [12], offsets: [0], displayNotes: ['C4'], rhythmicGrouping: null,
    })),
}));

// Feature (Han 2026-08-24, replacing the earlier "exclude d/e for decorativeWizard levels" fix, §300/§304:
// "why not have the wizard cast a modulation spell before each call-response block? ... the wizard
// alternates between major and minor 'call'"). `blockScaleForCallResponse` is the pure per-block scale
// decision this merges into `useLevelTrebleStream`'s block generation — see its own comment in
// useLevelTrebleStream.js for the full mechanism.
describe('useLevelTrebleStream — blockScaleForCallResponse (#1101 modulation merge)', () => {
    const scale = Scale.defaultScale();   // C Major

    it('returns the scale UNCHANGED for a non-Wizard block (plain Slime content, never modulates)', () => {
        const lvl = { decorativeWizard: true };
        expect(blockScaleForCallResponse(scale, lvl, false, 0)).toBe(scale);
        expect(blockScaleForCallResponse(scale, lvl, false, 1)).toBe(scale);
    });

    it('returns the scale UNCHANGED for a Wizard block when the level is not decorativeWizard (Levels 13/108/etc, or d/e on a plain level)', () => {
        const lvl = { decorativeWizard: false };
        expect(blockScaleForCallResponse(scale, lvl, true, 0)).toBe(scale);
        expect(blockScaleForCallResponse(scale, lvl, true, 1)).toBe(scale);
    });

    it('alternates Major/Minor per block for a decorativeWizard level once call-response (Wizard) is active', () => {
        const lvl = { decorativeWizard: true };
        const block0 = blockScaleForCallResponse(scale, lvl, true, 0);
        const block1 = blockScaleForCallResponse(scale, lvl, true, 1);
        const block2 = blockScaleForCallResponse(scale, lvl, true, 2);
        expect(block0.name).toBe('Major');
        expect(block1.name).toBe('Minor');
        expect(block2.name).toBe('Major');
    });

    it('never changes the tonic — only the mode alternates (Han: "wisselt tussen major en mineur", same as Level 11)', () => {
        const lvl = { decorativeWizard: true };
        const block0 = blockScaleForCallResponse(scale, lvl, true, 0);
        const block1 = blockScaleForCallResponse(scale, lvl, true, 1);
        expect(block0.tonic).toBe(scale.tonic);
        expect(block1.tonic).toBe(scale.tonic);
    });
});

// ── #1102 (adaptive tempo, Han 2026-08-28) ────────────────────────────────────────────────────────
// This stream is the sole DECIDER for every level whose treble streams via JIT: at each of its own
// block boundaries it evaluates the stats delta and records a commit, then generates/schedules each
// block at the bpm read FRESH at that block's boundary — the same "re-read the live bpm at the top of
// each scheduling unit" pattern Sequencer.scheduleBlock already uses per measure.
describe('useLevelTrebleStream — adaptive tempo (#1102)', () => {
    const timeSignature = [4, 4];
    const scale = Scale.defaultScale();
    const trebleSettings = InstrumentSettings.defaultTrebleInstrumentSettings();
    const wizardInstrument = { name: 'wizard-cast' };
    // 4/4 → measureLengthTicks 48; secondsPerTick(bpm) = 5/bpm, so a bar is exactly 3.0s at 80bpm and
    // exactly 2.4s at 100bpm — round numbers, so the accumulated cursor is assertable exactly.
    const BAR_AT_80 = 3.0;
    const BAR_AT_100 = 2.4;
    // A call-response (Wizard) level: blockMeasures = callResponseMeasures*2 = 2, chunkMeasures
    // (= leadInBars) = 2, totalBlocks = ceil(4/2) = 2, so both blocks are generated synchronously.
    const lvl = {
        sideScroll: true, bpm: 80, enemyType: 'Wizard', callResponseMeasures: 1,
        numMeasures: 1, numRepeats: 2, totalMeasures: 4, leadInBars: 2, visibleMeasures: 2,
        wizardSpawnLeadMeasures: 1, adaptive: true,
    };

    beforeEach(() => { vi.clearAllMocks(); });

    // Every object prop must be a STABLE reference across renders — this hook's effect depends on
    // `context`/`stopFnsRef`/`lvl`, so a fresh literal per render would retrigger it in an infinite loop
    // (the same trap `useLevelBackingStream.test.js`'s own `lvl8` comment already documents).
    const renderStream = (adaptiveTempo, statsRef, level = lvl) => {
        const context = { currentTime: 0 };
        const stopFnsRef = { current: [] };
        return renderHook(() => useLevelTrebleStream({
            active: true, lvl: level, scale, timeSignature, trebleSettings, chordProgression: null,
            context, levelAudioStart: 10, wizardInstrument, wizardVolume: 1,
            stopFnsRef, adaptiveTempo, statsRef,
        }));
    };

    it('generates each block at the bpm read fresh at ITS OWN boundary, accumulating start times', () => {
        const seen = [];
        const adaptiveTempo = {
            bpmForMeasure: (measure, startTime) => { seen.push([measure, startTime]); return measure >= 2 ? 100 : 80; },
            evaluate: vi.fn(),
        };
        const { unmount } = renderStream(adaptiveTempo, { current: {} });

        // contentStartTime = levelAudioStart + leadInBars * bar(80) = 10 + 6 = 16.
        // Block 1's cursor = block 0's start + blockMeasures * block 0's OWN bar duration = 16 + 6 = 22.
        expect(seen).toEqual([[0, 16], [2, 22]]);

        // playMelodies(melodies, instruments, context, bpm, scheduledStart, ...). Each Wizard block's
        // cast is scheduled `wizardSpawnLeadMeasures * barSec` EARLIER than the block itself, at that
        // block's own bar duration — so the lead shrinks with the faster tempo, exactly as it should.
        const calls = playMelodies.mock.calls;
        expect(calls.length).toBe(2);
        expect(calls[0][3]).toBe(80);
        expect(calls[0][4]).toBeCloseTo(16 - BAR_AT_80, 10);
        expect(calls[1][3]).toBe(100);
        expect(calls[1][4]).toBeCloseTo(22 - BAR_AT_100, 10);
        unmount();
    });

    it('decides at each block boundary, against a commit index shared with the backing stream', () => {
        const evaluate = vi.fn();
        const statsRef = { current: { defeated: 1 } };
        const { unmount } = renderStream({ bpmForMeasure: () => 80, evaluate }, statsRef);
        // Two blocks generated synchronously → two evaluations, each naming the NEXT block boundary and
        // both stream cadences (blockMeasures=2, chunkMeasures=leadInBars=2).
        expect(evaluate).toHaveBeenCalledTimes(2);
        expect(evaluate.mock.calls[0][0]).toEqual({ stats: statsRef.current, fromMeasure: 2, units: [2, 2] });
        expect(evaluate.mock.calls[1][0]).toEqual({ stats: statsRef.current, fromMeasure: 4, units: [2, 2] });
        unmount();
    });

    it('does not consult the controller at all for a NON-adaptive level (byte-identical old behaviour)', () => {
        const bpmForMeasure = vi.fn(() => 999);
        const evaluate = vi.fn();
        const plain = { ...lvl, adaptive: false };
        const { unmount } = renderStream({ bpmForMeasure, evaluate }, { current: {} }, plain);
        expect(bpmForMeasure).not.toHaveBeenCalled();
        expect(evaluate).not.toHaveBeenCalled();
        expect(playMelodies.mock.calls.every((c) => c[3] === 80)).toBe(true);
        // Fixed tempo → the accumulated cursor reproduces the original `blockIndex * blockMeasures * barSec`
        // placement exactly: block 0 at 16 - 3, block 1 at 22 - 3.
        expect(playMelodies.mock.calls[0][4]).toBeCloseTo(16 - BAR_AT_80, 10);
        expect(playMelodies.mock.calls[1][4]).toBeCloseTo(22 - BAR_AT_80, 10);
        unmount();
    });
});
