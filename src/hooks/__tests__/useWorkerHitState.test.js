// Smoke tests for useWorkerHitState (#1095, Han 2026-08-20: "rol elke 2 maten of de animatie start
// (50%); draai de animatie voor 2 maten"). Covers the 3 behaviours the rewrite must get right: silent
// idle looping when hitConfig is null, staying on idle when a roll fails, and — the part most likely to
// regress — switching to the work animation on a successful roll, firing the note on EVERY loop
// repetition (not just once), and returning to idle once the full measures-window has elapsed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useWorkerHitState from '../useWorkerHitState';

const variant = {
    animations: [
        { key: 'idle', cells: [1, 2, 3, 4, 5] },
        { key: 'work', cells: ['a', 'b', 'c', 'd', 'e'] },
    ],
};

function setup(props) {
    return renderHook(
        (p) => useWorkerHitState(p.variant, p.hitConfig, p.petFrame, p.timeSignature, p.context, p.triggerBell, p.npcWorldX, p.getListenerX),
        { initialProps: props }
    );
}

describe('useWorkerHitState', () => {
    let randomSpy;
    beforeEach(() => { randomSpy = vi.spyOn(Math, 'random'); });
    afterEach(() => { randomSpy.mockRestore(); });

    it('loops the idle animation and never fires when hitConfig is null (silent worker)', () => {
        const triggerBell = vi.fn();
        const props = { variant, hitConfig: null, petFrame: 0, timeSignature: [4, 4], context: { currentTime: 0 }, triggerBell, npcWorldX: 0, getListenerX: () => 0 };
        const { result, rerender } = setup(props);
        expect(result.current.anim.key).toBe('idle');
        rerender({ ...props, petFrame: 7 });
        expect(result.current.frame).toBe(7);
        expect(triggerBell).not.toHaveBeenCalled();
    });

    it('stays on idle when the roll fails at a measure-pair boundary', () => {
        randomSpy.mockReturnValue(0.9);   // >= chance -> roll fails
        const triggerBell = vi.fn();
        const hitConfig = { workAnimKey: 'work', hitFrameIndices: [2], chance: 0.5, measures: 1, note: 'C4' };
        const { result } = setup({ variant, hitConfig, petFrame: 0, timeSignature: [4, 4], context: { currentTime: 0 }, triggerBell, npcWorldX: 0, getListenerX: () => 0 });
        expect(result.current.anim.key).toBe('idle');
        expect(triggerBell).not.toHaveBeenCalled();
    });

    it('switches to work on a successful roll, fires the note every loop repetition (scheduled ONE frame early), then returns to idle after the window', () => {
        randomSpy.mockReturnValue(0);   // < chance -> roll succeeds
        const triggerBell = vi.fn();
        // 1 measure @ 4/4 * 5 frames/beat (FRAMES_PER_BEAT) = 20-frame window.
        const hitConfig = { workAnimKey: 'work', hitFrameIndices: [2], chance: 0.5, measures: 1, note: 'C4' };
        // context.currentTime kept large so the Math.max("not in the past") guard collapses the
        // computed grid time to "now" — keeps this test about WHICH frame fires, not the exact time
        // (a dedicated test below covers the future grid time).
        const props = { variant, hitConfig, petFrame: 0, timeSignature: [4, 4], context: { currentTime: 9 }, triggerBell, npcWorldX: 3, getListenerX: () => 30 };
        const { result, rerender } = setup(props);

        rerender({ ...props, petFrame: 1 });
        expect(result.current.anim.key).toBe('work');
        // sync fix: the hit for work-frame 2 is scheduled while petFrame is still 1 (one frame early).
        expect(triggerBell).toHaveBeenCalledWith('C4', 9, 3, 30);
        triggerBell.mockClear();

        rerender({ ...props, petFrame: 2 });   // nextElapsed 3 % 5 === 3 -> nothing
        expect(triggerBell).not.toHaveBeenCalled();

        rerender({ ...props, petFrame: 6 });   // nextElapsed 7 % 5 === 2 -> schedules the next loop's hit
        expect(triggerBell).toHaveBeenCalledTimes(1);

        rerender({ ...props, petFrame: 20 });   // window elapsed (>=20) -> back to idle
        expect(result.current.anim.key).toBe('idle');
    });

    it('schedules the hit at a FUTURE world-clock grid time (frameSec · hitFrame) minus output latency', () => {
        randomSpy.mockReturnValue(0);   // roll succeeds
        const triggerBell = vi.fn();
        const hitConfig = { workAnimKey: 'work', hitFrameIndices: [2], chance: 0.5, measures: 1, note: 'C4' };
        // currentTime near 0 and an outputLatency reported → the computed time is in the future and
        // pulled 20 ms earlier. frameSec at WORLD_BPM 100 / 4-4 = 0.12 s, hitFrame = 2 → 0.24 s.
        const context = { currentTime: 0.01, outputLatency: 0.02 };
        const props = { variant, hitConfig, petFrame: 0, timeSignature: [4, 4], context, triggerBell, npcWorldX: 3, getListenerX: () => 30 };
        const { rerender } = setup(props);
        rerender({ ...props, petFrame: 1 });   // schedules work-frame 2
        expect(triggerBell).toHaveBeenCalledTimes(1);
        const [, when] = triggerBell.mock.calls[0];
        expect(when).toBeCloseTo(2 * 0.12 - 0.02, 6);   // 0.22
        expect(when).toBeGreaterThan(context.currentTime);
    });
});
