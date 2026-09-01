import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useAdaptiveDifficulty from '../useAdaptiveDifficulty';
import {
    MAX_DENSITY_STEP, MIN_DENSITY_STEP, GATED_EXIT_WINDOW, GATED_REENTRY_COOLDOWN_BLOCKS,
} from '../../levels/adaptiveLadder';

// #1102 (adaptive tempo, Han 2026-08-28) + #1121 (the shared difficulty ladder, Han 2026-09-01).
// The controller is the piece that keeps `bpmRef` the single source of truth for "the tempo NOW" while
// still answering "what will measure M play at?" for the JIT stream, which must generate and schedule a
// block's audio one screenful BEFORE it sounds. Since #1121 the answer is a full ladder position
// `{ bpm, densityStep, pacing }`, read through ONE `blockSettingsFor` call.
describe('useAdaptiveDifficulty (#1102 tempo rung, #1121 ladder)', () => {
    const stats = (over = {}) => ({
        defeated: 0, misses: 0, perfect: 0, tooFast: 0, tooSlow: 0, muchTooFast: 0, muchTooSlow: 0,
        secondAttemptCorrected: 0, wrongUncorrected: 0, missed: 0, extraNote: 0, ...over,
    });
    const CLEAN = stats({ defeated: 10, perfect: 10 });          // 100% — speeds up
    const ROUGH = stats({ defeated: 2, perfect: 2, misses: 8, missed: 8 });   // 20% — slows down
    // A plain procedural level: no `songId`, so the ladder's density rungs are in scope.
    const LVL = { id: 4, bpm: 80 };

    let bpmRef;
    let setBpm;
    let setPacingMode;
    let context;
    const setup = (base = 100, startBpm = 80, lvl = LVL) => {
        bpmRef = { current: startBpm };
        setBpm = vi.fn((v) => { bpmRef.current = v; });
        setPacingMode = vi.fn();
        context = { currentTime: 0 };
        const { result } = renderHook(() => useAdaptiveDifficulty({
            bpmRef, setBpm, setPacingMode, context,
        }));
        act(() => result.current.begin(base, lvl));
        return result.current;
    };
    /** The tempo half of a ladder read — most assertions below only care about that one rung. */
    const bpmAt = (c, measure, startTime) => c.blockSettingsFor(measure, startTime).bpm;

    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('returns bpmRef.current until a change has been decided (no parallel bpm value)', () => {
        const c = setup();
        expect(bpmAt(c, 0, 1)).toBe(80);
        bpmRef.current = 90;   // e.g. the player moved the app's own tempo
        expect(bpmAt(c, 4, 2)).toBe(90);
        expect(setBpm).not.toHaveBeenCalled();
    });

    it('starts at ladder rung 0 — the level exactly as authored, timed pacing', () => {
        const c = setup();
        expect(c.blockSettingsFor(0, 1)).toEqual({ bpm: 80, densityStep: 0, pacing: 'timed' });
    });

    it('the FIRST evaluation only seeds the baseline snapshot — nothing changes yet', () => {
        const c = setup();
        c.evaluate({ stats: CLEAN, fromMeasure: 2, units: [2, 2] });
        expect(bpmAt(c, 2, 1)).toBe(80);
    });

    it('a clean stretch commits +5% at the next SHARED boundary, not before it', () => {
        const c = setup(100, 80);
        c.evaluate({ stats: stats(), fromMeasure: 0, units: [2, 3] });     // seed
        c.evaluate({ stats: CLEAN, fromMeasure: 2, units: [2, 3] });       // decide
        // lcm(2,3) = 6 → the commit lands at measure 6, the first index both streams have a boundary at.
        expect(bpmAt(c, 2, 1)).toBe(80);
        expect(bpmAt(c, 4, 2)).toBe(80);
        expect(bpmAt(c, 6, 3)).toBeCloseTo(84, 6);
    });

    it('a rough stretch commits -5%', () => {
        const c = setup(100, 80);
        c.evaluate({ stats: stats(), fromMeasure: 0, units: [2, 2] });
        c.evaluate({ stats: ROUGH, fromMeasure: 2, units: [2, 2] });
        expect(bpmAt(c, 2, 1)).toBeCloseTo(76, 6);
    });

    it('applies the change to the app-wide bpm at the commit chunk\'s own scheduled start time', () => {
        const c = setup(100, 80);
        c.evaluate({ stats: stats(), fromMeasure: 0, units: [2, 2] });
        c.evaluate({ stats: CLEAN, fromMeasure: 2, units: [2, 2] });
        // Generation happens ahead of playback: context.currentTime is 0, the chunk sounds at t=5.
        expect(bpmAt(c, 2, 5)).toBeCloseTo(84, 6);
        expect(setBpm).not.toHaveBeenCalled();          // not yet — the chunk has not sounded
        act(() => { vi.advanceTimersByTime(4999); });
        expect(setBpm).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(2); });
        expect(setBpm).toHaveBeenCalledTimes(1);
        expect(setBpm.mock.calls[0][0]).toBeCloseTo(84, 6);
        // Once applied, bpmRef alone answers again — the commit is gone, not a lingering second value.
        expect(bpmAt(c, 10, 9)).toBeCloseTo(84, 6);
    });

    it('BOTH streams reading the same commit measure get the identical value, and it is armed only once', () => {
        const c = setup(100, 80);
        c.evaluate({ stats: stats(), fromMeasure: 0, units: [2, 2] });
        c.evaluate({ stats: CLEAN, fromMeasure: 2, units: [2, 2] });
        const treble = c.blockSettingsFor(2, 5);
        const backing = c.blockSettingsFor(2, 5);   // the other stream, same measure, same start time
        expect(treble).toEqual(backing);
        act(() => { vi.advanceTimersByTime(6000); });
        expect(setBpm).toHaveBeenCalledTimes(1);   // one write, not one per stream
    });

    it('holds instead of stacking a second decision while one is still pending', () => {
        const c = setup(100, 80);
        c.evaluate({ stats: stats(), fromMeasure: 0, units: [2, 2] });
        c.evaluate({ stats: CLEAN, fromMeasure: 2, units: [2, 2] });
        c.evaluate({ stats: ROUGH, fromMeasure: 4, units: [2, 2] });   // ignored — one change in flight
        expect(bpmAt(c, 2, 1)).toBeCloseTo(84, 6);
    });

    it('cancel() drops a pending change so it can never land after the level closed', () => {
        const c = setup(100, 80);
        c.evaluate({ stats: stats(), fromMeasure: 0, units: [2, 2] });
        c.evaluate({ stats: CLEAN, fromMeasure: 2, units: [2, 2] });
        expect(bpmAt(c, 2, 5)).toBeCloseTo(84, 6);   // arms the timer
        act(() => c.cancel());
        act(() => { vi.advanceTimersByTime(6000); });
        expect(setBpm).not.toHaveBeenCalled();
    });

    it('begin() clears the previous run\'s snapshot AND resets the ladder to rung 0', () => {
        const c = setup(100, 80);
        c.evaluate({ stats: stats(), fromMeasure: 0, units: [2, 2] });
        act(() => c.begin(100, LVL));
        // First evaluation after begin() is a seed again — a clean stretch must NOT immediately step.
        c.evaluate({ stats: CLEAN, fromMeasure: 2, units: [2, 2] });
        expect(c.blockSettingsFor(2, 1)).toEqual({ bpm: 80, densityStep: 0, pacing: 'timed' });
    });

    // ── #1121: the DENSITY rung ────────────────────────────────────────────────────────────────
    describe('#1121 — the density rung at the bpm ceiling', () => {
        /** Drive one HARDER decision at the ceiling (bpm already pinned at baseBpm). */
        const decideAtCeiling = (c, fromMeasure) => {
            c.evaluate({ stats: stats(), fromMeasure: fromMeasure - 2, units: [2] });
            c.evaluate({ stats: CLEAN, fromMeasure, units: [2] });
        };

        it('a clean block AT the ceiling commits a density step, leaving the bpm alone', () => {
            const c = setup(100, 100);   // baseBpm 100, already pinned at the ceiling
            decideAtCeiling(c, 2);
            expect(c.blockSettingsFor(2, 5)).toEqual({ bpm: 100, densityStep: 1, pacing: 'timed' });
        });

        it('a density-only commit NEVER touches the app-wide bpm when it lands', () => {
            const c = setup(100, 100);
            decideAtCeiling(c, 2);
            c.blockSettingsFor(2, 5);                       // arms the commit
            act(() => { vi.advanceTimersByTime(6000); });
            expect(setBpm).not.toHaveBeenCalled();          // nothing app-wide had to switch
        });

        it('the landed rung becomes the controller\'s own state — blocks after the commit keep it', () => {
            const c = setup(100, 100);
            decideAtCeiling(c, 2);
            c.blockSettingsFor(2, 5);
            act(() => { vi.advanceTimersByTime(6000); });
            // The commit is gone, but the ladder stayed where it landed.
            expect(c.blockSettingsFor(10, 9)).toEqual({ bpm: 100, densityStep: 1, pacing: 'timed' });
        });

        it('blocks BEFORE the commit measure still generate at the previous rung', () => {
            const c = setup(100, 100);
            c.evaluate({ stats: stats(), fromMeasure: 0, units: [2, 3] });
            c.evaluate({ stats: CLEAN, fromMeasure: 2, units: [2, 3] });   // commits at lcm boundary 6
            expect(c.blockSettingsFor(2, 1).densityStep).toBe(0);
            expect(c.blockSettingsFor(4, 2).densityStep).toBe(0);
            expect(c.blockSettingsFor(6, 3).densityStep).toBe(1);
        });

        it('holds silently at the TOP of the ladder — no commit, nothing armed', () => {
            const c = setup(100, 100);
            // Walk to the top one clean block at a time, landing each commit as we go.
            for (let i = 0; i < MAX_DENSITY_STEP; i++) {
                c.evaluate({ stats: stats({ defeated: i * 10 }), fromMeasure: i * 2, units: [2] });
                c.evaluate({ stats: stats({ defeated: i * 10 + 10, perfect: 10 }), fromMeasure: i * 2 + 2, units: [2] });
                c.blockSettingsFor(i * 2 + 2, 0);
                act(() => { vi.advanceTimersByTime(1); });
            }
            expect(c.blockSettingsFor(100, 0).densityStep).toBe(MAX_DENSITY_STEP);
            const callsBefore = setBpm.mock.calls.length;
            c.evaluate({ stats: stats({ defeated: 100, perfect: 90 }), fromMeasure: 102, units: [2] });
            act(() => { vi.advanceTimersByTime(1000); });
            expect(c.blockSettingsFor(102, 0).densityStep).toBe(MAX_DENSITY_STEP);
            expect(setBpm.mock.calls.length).toBe(callsBefore);
        });

        it('a SONG-backed level never leaves rung 0 — density cannot apply to a sliced treble', () => {
            const c = setup(100, 100, { id: 900, songId: 'kalinka', bpm: 100 });
            decideAtCeiling(c, 2);
            expect(c.blockSettingsFor(2, 5)).toEqual({ bpm: 100, densityStep: 0, pacing: 'timed' });
        });
    });

    // ── #1120: the PACING rung, and its ONE armed moment ────────────────────────────────────────
    describe('#1120 — the gated pacing rung at the bpm floor', () => {
        // A level the rung is in scope for, pinned at the FLOOR with the content already thinned to
        // the skeleton — i.e. the ladder is standing on its bottom rung.
        const GATABLE = { id: 4, bpm: 100, adaptive: true, sideScroll: true, enemyType: 'Slime' };
        const perfectWindow = () => Array.from({ length: GATED_EXIT_WINDOW }, () => 'perfect');

        /** Walk the controller down to (floor, skeleton) with rough blocks, landing every commit. */
        const walkToBottom = (c) => {
            let played = 0;
            let m = 0;
            for (let i = 0; i < 60; i++) {
                played += 10;
                c.evaluate({
                    stats: stats({ defeated: played, perfect: 1, misses: played, missed: played }),
                    fromMeasure: m, units: [2],
                });
                c.blockSettingsFor(m, 0);
                act(() => { vi.advanceTimersByTime(1); });
                m += 2;
                if (c.blockSettingsFor(m, 0).pacing === 'gated') break;
            }
            return m;
        };

        it('walks bpm → floor, density → skeleton, and only THEN commits pacing "gated"', () => {
            const c = setup(100, 100, GATABLE);
            const m = walkToBottom(c);
            expect(c.blockSettingsFor(m, 0)).toEqual({
                bpm: 50, densityStep: MIN_DENSITY_STEP, pacing: 'gated',
            });
            expect(bpmRef.current).toBe(50);   // the floor, reached before the pacing ever moved
        });

        it('ONE armed timeout fires BOTH setBpm and setPacingMode — picture and sound together', () => {
            const c = setup(100, 100, GATABLE);
            walkToBottom(c);
            // The pacing flip itself: a density/pacing commit does not move the bpm, so what matters
            // is that the pacing landed on exactly one moment, once.
            expect(setPacingMode).toHaveBeenCalledTimes(1);
            expect(setPacingMode).toHaveBeenCalledWith('gated');
            // Every setBpm call happened BEFORE the flip — the tempo rung is fully spent by then.
            expect(setBpm.mock.calls.every(([v]) => v >= 50)).toBe(true);
        });

        it('setPacingMode fires only on a genuine flip, never on every landing commit', () => {
            const c = setup(100, 100, GATABLE);
            // Three ordinary tempo commits at the top of the ladder: no pacing change at all.
            for (let i = 0; i < 3; i++) {
                c.evaluate({ stats: stats({ defeated: i * 10 }), fromMeasure: i * 2, units: [2] });
                c.evaluate({ stats: stats({ defeated: i * 10 + 10, perfect: 10 }), fromMeasure: i * 2 + 2, units: [2] });
                c.blockSettingsFor(i * 2 + 2, 0);
                act(() => { vi.advanceTimersByTime(1); });
            }
            expect(setPacingMode).not.toHaveBeenCalled();
        });

        it('the gated exit needs the hidden buffer — block accuracy alone can never leave gated', () => {
            const c = setup(100, 100, GATABLE);
            const m = walkToBottom(c);
            // A gated block reports ~100% accuracy by construction. With an EMPTY hidden buffer that
            // must change nothing at all.
            c.evaluate({ stats: stats({ defeated: 999, perfect: 999 }), fromMeasure: m, units: [2] });
            act(() => { vi.advanceTimersByTime(1000); });
            expect(c.blockSettingsFor(m + 4, 0).pacing).toBe('gated');
            expect(setPacingMode).toHaveBeenCalledTimes(1);   // still just the entry
        });

        it('a full window of truly-perfect hidden grades commits the return to timed', () => {
            const c = setup(100, 100, GATABLE);
            let m = walkToBottom(c);
            m += 2;
            c.evaluate({
                stats: stats({ defeated: 1000, perfect: 1000 }), hiddenGrades: perfectWindow(),
                fromMeasure: m, units: [2],
            });
            expect(c.blockSettingsFor(m, 5)).toEqual({
                bpm: 50, densityStep: MIN_DENSITY_STEP, pacing: 'timed',
            });
            act(() => { vi.advanceTimersByTime(6000); });
            expect(setPacingMode).toHaveBeenLastCalledWith('timed');
        });

        it('one bad block straight after the exit does NOT re-gate — the cooldown holds', () => {
            const c = setup(100, 100, GATABLE);
            let m = walkToBottom(c);
            m += 2;
            c.evaluate({
                stats: stats({ defeated: 1000, perfect: 1000 }), hiddenGrades: perfectWindow(),
                fromMeasure: m, units: [2],
            });
            c.blockSettingsFor(m, 0);
            act(() => { vi.advanceTimersByTime(1); });
            expect(c.blockSettingsFor(m, 0).pacing).toBe('timed');
            // …and now the player falls apart again, boundary after boundary.
            const pacingAfter = [];
            let played = 2000;
            for (let i = 0; i < GATED_REENTRY_COOLDOWN_BLOCKS + 2; i++) {
                m += 2;
                played += 10;
                c.evaluate({
                    stats: stats({ defeated: played, perfect: 1, misses: played, missed: played }),
                    fromMeasure: m, units: [2],
                });
                c.blockSettingsFor(m, 0);
                act(() => { vi.advanceTimersByTime(1); });
                pacingAfter.push(c.blockSettingsFor(m, 0).pacing);
            }
            // The FIRST boundary after the exit must still be timed (no flicker), and the level does
            // eventually get its rescue back.
            expect(pacingAfter[0]).toBe('timed');
            expect(pacingAfter[pacingAfter.length - 1]).toBe('gated');
        });

        it('cancel() drops an unlanded pacing commit — it can never land on the next run', () => {
            const c = setup(100, 100, GATABLE);
            const m = walkToBottom(c);
            setPacingMode.mockClear();
            c.evaluate({
                stats: stats({ defeated: 5000, perfect: 5000 }), hiddenGrades: perfectWindow(),
                fromMeasure: m + 2, units: [2],
            });
            c.blockSettingsFor(m + 2, 5);      // arms the timer
            act(() => c.cancel());
            act(() => { vi.advanceTimersByTime(6000); });
            expect(setPacingMode).not.toHaveBeenCalled();
        });

        it('begin() resets the pacing rung to timed — a replay never inherits a rubato rescue', () => {
            const c = setup(100, 100, GATABLE);
            walkToBottom(c);
            act(() => c.begin(100, GATABLE));
            expect(c.blockSettingsFor(0, 1)).toEqual({ bpm: 50, densityStep: 0, pacing: 'timed' });
        });

        it('an out-of-scope (Wizard) adaptive level PARKS at the bottom and never gates', () => {
            const c = setup(100, 100, { ...GATABLE, enemyType: 'Wizard' });
            const m = walkToBottom(c);
            expect(c.blockSettingsFor(m, 0).pacing).toBe('timed');
            expect(c.blockSettingsFor(m, 0).densityStep).toBe(MIN_DENSITY_STEP);
            expect(bpmRef.current).toBe(50);
            expect(setPacingMode).not.toHaveBeenCalled();
        });
    });
});
