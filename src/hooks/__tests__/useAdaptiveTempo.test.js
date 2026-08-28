import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useAdaptiveTempo from '../useAdaptiveTempo';

// #1102 (adaptive tempo, Han 2026-08-28). The controller is the piece that keeps `bpmRef` the single
// source of truth for "the tempo NOW" while still answering "what tempo will measure M play at?" for the
// JIT streams, which must generate and schedule a chunk's audio one screenful BEFORE it sounds.
describe('useAdaptiveTempo (#1102)', () => {
    const stats = (over = {}) => ({
        defeated: 0, misses: 0, perfect: 0, tooFast: 0, tooSlow: 0, muchTooFast: 0, muchTooSlow: 0,
        secondAttemptCorrected: 0, wrongUncorrected: 0, missed: 0, extraNote: 0, ...over,
    });
    const CLEAN = stats({ defeated: 10, perfect: 10 });          // 100% — speeds up
    const ROUGH = stats({ defeated: 2, perfect: 2, misses: 8, missed: 8 });   // 20% — slows down

    let bpmRef;
    let setBpm;
    let context;
    const setup = (base = 100, startBpm = 80) => {
        bpmRef = { current: startBpm };
        setBpm = vi.fn((v) => { bpmRef.current = v; });
        context = { currentTime: 0 };
        const { result } = renderHook(() => useAdaptiveTempo({ bpmRef, setBpm, context }));
        act(() => result.current.begin(base));
        return result.current;
    };

    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('returns bpmRef.current until a change has been decided (no parallel bpm value)', () => {
        const c = setup();
        expect(c.bpmForMeasure(0, 1)).toBe(80);
        bpmRef.current = 90;   // e.g. the player moved the app's own tempo
        expect(c.bpmForMeasure(4, 2)).toBe(90);
        expect(setBpm).not.toHaveBeenCalled();
    });

    it('the FIRST evaluation only seeds the baseline snapshot — nothing changes yet', () => {
        const c = setup();
        c.evaluate({ stats: CLEAN, fromMeasure: 2, units: [2, 2] });
        expect(c.bpmForMeasure(2, 1)).toBe(80);
    });

    it('a clean stretch commits +5% at the next SHARED boundary, not before it', () => {
        const c = setup(100, 80);
        c.evaluate({ stats: stats(), fromMeasure: 0, units: [2, 3] });     // seed
        c.evaluate({ stats: CLEAN, fromMeasure: 2, units: [2, 3] });       // decide
        // lcm(2,3) = 6 → the commit lands at measure 6, the first index both streams have a boundary at.
        expect(c.bpmForMeasure(2, 1)).toBe(80);
        expect(c.bpmForMeasure(4, 2)).toBe(80);
        expect(c.bpmForMeasure(6, 3)).toBeCloseTo(84, 6);
    });

    it('a rough stretch commits -5%', () => {
        const c = setup(100, 80);
        c.evaluate({ stats: stats(), fromMeasure: 0, units: [2, 2] });
        c.evaluate({ stats: ROUGH, fromMeasure: 2, units: [2, 2] });
        expect(c.bpmForMeasure(2, 1)).toBeCloseTo(76, 6);
    });

    it('applies the change to the app-wide bpm at the commit chunk\'s own scheduled start time', () => {
        const c = setup(100, 80);
        c.evaluate({ stats: stats(), fromMeasure: 0, units: [2, 2] });
        c.evaluate({ stats: CLEAN, fromMeasure: 2, units: [2, 2] });
        // Generation happens ahead of playback: context.currentTime is 0, the chunk sounds at t=5.
        expect(c.bpmForMeasure(2, 5)).toBeCloseTo(84, 6);
        expect(setBpm).not.toHaveBeenCalled();          // not yet — the chunk has not sounded
        act(() => { vi.advanceTimersByTime(4999); });
        expect(setBpm).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(2); });
        expect(setBpm).toHaveBeenCalledTimes(1);
        expect(setBpm.mock.calls[0][0]).toBeCloseTo(84, 6);
        // Once applied, bpmRef alone answers again — the commit is gone, not a lingering second value.
        expect(c.bpmForMeasure(10, 9)).toBeCloseTo(84, 6);
    });

    it('BOTH streams reading the same commit measure get the identical bpm, and it is armed only once', () => {
        const c = setup(100, 80);
        c.evaluate({ stats: stats(), fromMeasure: 0, units: [2, 2] });
        c.evaluate({ stats: CLEAN, fromMeasure: 2, units: [2, 2] });
        const treble = c.bpmForMeasure(2, 5);
        const backing = c.bpmForMeasure(2, 5);   // the other stream, same measure, same start time
        expect(treble).toBe(backing);
        act(() => { vi.advanceTimersByTime(6000); });
        expect(setBpm).toHaveBeenCalledTimes(1);   // one write, not one per stream
    });

    it('holds instead of stacking a second decision while one is still pending', () => {
        const c = setup(100, 80);
        c.evaluate({ stats: stats(), fromMeasure: 0, units: [2, 2] });
        c.evaluate({ stats: CLEAN, fromMeasure: 2, units: [2, 2] });
        c.evaluate({ stats: ROUGH, fromMeasure: 4, units: [2, 2] });   // ignored — one change in flight
        expect(c.bpmForMeasure(2, 1)).toBeCloseTo(84, 6);
    });

    it('cancel() drops a pending change so it can never land after the level closed', () => {
        const c = setup(100, 80);
        c.evaluate({ stats: stats(), fromMeasure: 0, units: [2, 2] });
        c.evaluate({ stats: CLEAN, fromMeasure: 2, units: [2, 2] });
        expect(c.bpmForMeasure(2, 5)).toBeCloseTo(84, 6);   // arms the timer
        act(() => c.cancel());
        act(() => { vi.advanceTimersByTime(6000); });
        expect(setBpm).not.toHaveBeenCalled();
    });

    it('begin() clears the previous run\'s snapshot so a replay starts from its own baseline', () => {
        const c = setup(100, 80);
        c.evaluate({ stats: stats(), fromMeasure: 0, units: [2, 2] });
        act(() => c.begin(100));
        // First evaluation after begin() is a seed again — a clean stretch must NOT immediately step.
        c.evaluate({ stats: CLEAN, fromMeasure: 2, units: [2, 2] });
        expect(c.bpmForMeasure(2, 1)).toBe(80);
    });
});
