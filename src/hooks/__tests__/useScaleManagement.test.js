import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useScaleManagement from '../useScaleManagement';

vi.mock('../../audio/playSound', () => ({
    default: vi.fn(),
}));

import playSound from '../../audio/playSound';

const makeContext = (state = 'running') => ({
    state,
    currentTime: 0,
    resume: vi.fn().mockResolvedValue(undefined),
});

const makeScale = (tonic = 'C4', notes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4']) => ({
    tonic,
    notes,
    displayNotes: notes,
    family: 'Diatonic',
    name: 'Major',
});

const makeDeps = (overrides = {}) => ({
    context: makeContext(),
    instruments: { treble: { id: 'treble' } },
    scale: makeScale(),
    setScale: vi.fn(),
    bpmRef: { current: 120 },
    ...overrides,
});

describe('useScaleManagement.handleScaleClick', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        playSound.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('plays each scale note sequentially', async () => {
        const deps = makeDeps();
        const { result } = renderHook(() => useScaleManagement(deps));

        await act(async () => {
            await result.current.handleScaleClick();
        });

        expect(playSound).toHaveBeenCalledTimes(7); // 7 scale notes
    });

    it('sets isScalePlaying true while audio is in flight, then false after duration', async () => {
        const deps = makeDeps();
        const { result } = renderHook(() => useScaleManagement(deps));

        expect(result.current.isScalePlaying).toBe(false);

        await act(async () => {
            await result.current.handleScaleClick();
        });

        expect(result.current.isScalePlaying).toBe(true);

        // Spacing is 60/120 = 0.5s/note × 7 notes = 3.5s total
        act(() => vi.advanceTimersByTime(3500));
        expect(result.current.isScalePlaying).toBe(false);
    });

    it('uses BPM from bpmRef for spacing', async () => {
        const deps = makeDeps({ bpmRef: { current: 240 } }); // half the spacing
        const { result } = renderHook(() => useScaleManagement(deps));

        await act(async () => {
            await result.current.handleScaleClick();
        });

        // Spacing should be 60/240 = 0.25s. Second note at 0.25s.
        const firstCallTime = playSound.mock.calls[0][3];
        const secondCallTime = playSound.mock.calls[1][3];
        expect(secondCallTime - firstCallTime).toBeCloseTo(0.25, 5);
    });

    it('clamps BPM to a minimum of 60 to prevent absurdly long scale plays', async () => {
        const deps = makeDeps({ bpmRef: { current: 30 } }); // very slow
        const { result } = renderHook(() => useScaleManagement(deps));

        await act(async () => {
            await result.current.handleScaleClick();
        });

        // With clamp at 60, spacing should be 60/60 = 1.0s, not 60/30 = 2.0s
        const firstCallTime = playSound.mock.calls[0][3];
        const secondCallTime = playSound.mock.calls[1][3];
        expect(secondCallTime - firstCallTime).toBeCloseTo(1.0, 5);
    });

    it('does nothing if context is missing', async () => {
        const deps = makeDeps({ context: null });
        const { result } = renderHook(() => useScaleManagement(deps));

        await act(async () => {
            await result.current.handleScaleClick();
        });

        expect(playSound).not.toHaveBeenCalled();
    });

    it('does nothing if treble instrument is missing', async () => {
        const deps = makeDeps({ instruments: {} });
        const { result } = renderHook(() => useScaleManagement(deps));

        await act(async () => {
            await result.current.handleScaleClick();
        });

        expect(playSound).not.toHaveBeenCalled();
    });

    it('does nothing if scale has no notes', async () => {
        const deps = makeDeps({ scale: { ...makeScale(), notes: [] } });
        const { result } = renderHook(() => useScaleManagement(deps));

        await act(async () => {
            await result.current.handleScaleClick();
        });

        expect(playSound).not.toHaveBeenCalled();
    });

    it('resumes a suspended AudioContext', async () => {
        const ctx = makeContext('suspended');
        const deps = makeDeps({ context: ctx });
        const { result } = renderHook(() => useScaleManagement(deps));

        await act(async () => {
            await result.current.handleScaleClick();
        });

        expect(ctx.resume).toHaveBeenCalled();
    });
});

describe('useScaleManagement.handleEnharmonicToggle', () => {
    it('flips F♯ to G♭', () => {
        const setScale = vi.fn();
        const deps = makeDeps({
            scale: makeScale('F♯4'),
            setScale,
        });
        const { result } = renderHook(() => useScaleManagement(deps));

        act(() => result.current.handleEnharmonicToggle());

        expect(setScale).toHaveBeenCalled();
        // setScale was called with a function — invoke it with the current scale
        // to verify the result.
        const updateFn = setScale.mock.calls[0][0];
        const next = updateFn(deps.scale);
        expect(next.tonic.startsWith('G♭')).toBe(true);
    });

    it('preserves the octave when flipping enharmonic', () => {
        const setScale = vi.fn();
        const deps = makeDeps({
            scale: makeScale('C♯5'),
            setScale,
        });
        const { result } = renderHook(() => useScaleManagement(deps));

        act(() => result.current.handleEnharmonicToggle());

        const updateFn = setScale.mock.calls[0][0];
        const next = updateFn(deps.scale);
        expect(next.tonic).toMatch(/5$/); // octave 5 preserved
    });

    it('returns the previous scale unchanged when no enharmonic exists', () => {
        // Wait — per ENHARMONIC_PAIRS, ALL natural notes (C, D, E, F, G, A, B) DO have
        // enharmonic equivalents (C↔B♯, D has none... actually D does NOT have one in
        // ENHARMONIC_PAIRS). Let me use D as the test case.
        const setScale = vi.fn();
        const deps = makeDeps({
            scale: makeScale('D4'),
            setScale,
        });
        const { result } = renderHook(() => useScaleManagement(deps));

        act(() => result.current.handleEnharmonicToggle());

        const updateFn = setScale.mock.calls[0][0];
        const prev = deps.scale;
        const next = updateFn(prev);
        // D has no enharmonic in ENHARMONIC_PAIRS — should return prev unchanged
        expect(next).toBe(prev);
    });

    it('returns prev unchanged if scale has no tonic', () => {
        const setScale = vi.fn();
        const deps = makeDeps({ setScale });
        const { result } = renderHook(() => useScaleManagement(deps));

        act(() => result.current.handleEnharmonicToggle());

        const updateFn = setScale.mock.calls[0][0];
        expect(updateFn({})).toEqual({});
        expect(updateFn(null)).toBe(null);
    });
});
