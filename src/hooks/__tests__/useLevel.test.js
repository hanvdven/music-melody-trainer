import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import useLevel from '../useLevel';

const makeSetters = () => ({
    setNumMeasures: vi.fn(), setTrebleSettings: vi.fn(), setPlaybackConfig: vi.fn(),
    setShowChordsOddRounds: vi.fn(), setShowChordsEvenRounds: vi.fn(),
});
const snap = () => ({ numMeasures: 4, trebleSettings: { x: 1 }, playbackConfig: { y: 1 }, showChordsOddRounds: true, showChordsEvenRounds: true });

const setup = () => {
    const setters = makeSetters();
    const snapshot = vi.fn(snap);
    const regenerate = vi.fn();
    const hook = renderHook(() => useLevel({ setters, snapshot, regenerate }));
    return { setters, snapshot, regenerate, ...hook };
};

describe('useLevel (#659 Level 1)', () => {
    it('start applies the level-1 config, resets stats, and spawns the first wave', () => {
        const { setters, regenerate, result } = setup();
        expect(result.current.active).toBe(false);
        act(() => result.current.start());
        expect(result.current.active).toBe(true);
        expect(setters.setNumMeasures).toHaveBeenCalledWith(2);          // Level 1 = 2 measures
        expect(setters.setTrebleSettings).toHaveBeenCalled();
        expect(setters.setPlaybackConfig).toHaveBeenCalled();
        expect(setters.setShowChordsOddRounds).toHaveBeenCalledWith(false);
        expect(regenerate).toHaveBeenCalledTimes(1);                     // the first wave
        expect(result.current.stats).toMatchObject({ defeated: 0, misses: 0, longestStreak: 0 });
    });

    it('accumulates defeated / misses / longest streak', () => {
        const { result } = setup();
        act(() => result.current.start());
        act(() => { result.current.onHit(); result.current.onHit(); result.current.onHit(); });
        act(() => result.current.onMiss());
        act(() => result.current.onHit());
        expect(result.current.stats).toMatchObject({ defeated: 4, misses: 1, longestStreak: 3 });
    });

    it('accumulates graded timing stats + points (Han 2026-08-02)', () => {
        const { result } = setup();
        act(() => result.current.start());
        act(() => result.current.onHit({ category: 'perfect', points: 1 }));
        act(() => result.current.onHit({ category: 'tooSlow', points: 0.5 }));
        act(() => result.current.onMiss('wrongNote'));
        act(() => result.current.onHit({ category: 'secondAttempt', points: 0.5 }));
        act(() => result.current.onMiss('miss'));
        expect(result.current.stats).toMatchObject({
            defeated: 3, misses: 2, points: 2, perfect: 1, tooSlow: 1, secondAttempt: 1, wrongNotes: 1,
        });
    });

    it('clears 4 waves then flags done; regenerates between waves only', () => {
        const { regenerate, result } = setup();
        act(() => result.current.start());                              // regenerate #1
        act(() => { result.current.onWaveCleared(); });                 // wave 1 → regenerate #2
        act(() => { result.current.onWaveCleared(); });                 // wave 2 → #3
        act(() => { result.current.onWaveCleared(); });                 // wave 3 → #4
        expect(result.current.done).toBe(false);
        act(() => { result.current.onWaveCleared(); });                 // wave 4 → done, NO regen
        expect(result.current.done).toBe(true);
        expect(regenerate).toHaveBeenCalledTimes(4);
    });

    it('close restores the snapshot and deactivates', () => {
        const { setters, result } = setup();
        act(() => result.current.start());
        act(() => result.current.close());
        expect(setters.setNumMeasures).toHaveBeenLastCalledWith(4);     // the snapshot's value
        expect(result.current.active).toBe(false);
        expect(result.current.done).toBe(false);
    });
});
