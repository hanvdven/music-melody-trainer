import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import usePlaybackNavigation from '../usePlaybackNavigation';

const baseDeps = () => ({
    animationMode: 'pagination',
    musicalBlocks: [2, 2],          // two blocks of 2 measures each
    startMeasureIndex: 0,
    setStartMeasureIndex: vi.fn(),
    numMeasures: 4,
    navigateHistory: vi.fn(),
    setScale: vi.fn(),
    _setTonic: vi.fn(),
    isPlayingContinuously: false,
    isPlayingMelody: false,
    handleStopAllPlayback: vi.fn(),
    startSequencer: vi.fn(),
    setIsPlayingMelody: vi.fn(),
    setIsPlayingContinuously: vi.fn(),
    melodies: { treble: {}, bass: {}, percussion: {}, chordProgression: {} },
});

describe('usePlaybackNavigation', () => {
    describe('handleMeasureNumberClick', () => {
        it('updates startMeasureIndex to the clicked measure', () => {
            const deps = baseDeps();
            const { result } = renderHook(() => usePlaybackNavigation(deps));

            act(() => result.current.handleMeasureNumberClick(7));
            expect(deps.setStartMeasureIndex).toHaveBeenCalledWith(7);
        });

        it('stops playback if continuously playing', () => {
            const deps = { ...baseDeps(), isPlayingContinuously: true };
            const { result } = renderHook(() => usePlaybackNavigation(deps));

            act(() => result.current.handleMeasureNumberClick(2));
            expect(deps.handleStopAllPlayback).toHaveBeenCalled();
        });

        it('does not stop playback if idle', () => {
            const deps = baseDeps();
            const { result } = renderHook(() => usePlaybackNavigation(deps));

            act(() => result.current.handleMeasureNumberClick(2));
            expect(deps.handleStopAllPlayback).not.toHaveBeenCalled();
        });
    });

    describe('handleSkipBack — pagination block math', () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => vi.useRealTimers());

        it('moves to previous block when in second block', () => {
            // startMeasureIndex=2 → in block 1 (which starts at 2). Previous block: 0.
            const deps = { ...baseDeps(), startMeasureIndex: 2 };
            const { result } = renderHook(() => usePlaybackNavigation(deps));

            act(() => result.current.handleSkipBack());
            // Block math: floor(2/4)*4 + prevBlockStart(0) = 0
            expect(deps.setStartMeasureIndex).toHaveBeenCalledWith(0);
            expect(deps.navigateHistory).not.toHaveBeenCalled();
        });

        it('falls through to history when at first block', () => {
            // startMeasureIndex=0 → in block 0 (first). No prev block exists.
            const deps = { ...baseDeps(), startMeasureIndex: 0 };
            const { result } = renderHook(() => usePlaybackNavigation(deps));

            act(() => result.current.handleSkipBack());
            expect(deps.navigateHistory).toHaveBeenCalledWith('back');
        });

        it('uses history navigation when not in pagination mode', () => {
            const deps = { ...baseDeps(), animationMode: 'wipe' };
            const { result } = renderHook(() => usePlaybackNavigation(deps));

            act(() => result.current.handleSkipBack());
            expect(deps.navigateHistory).toHaveBeenCalledWith('back');
            expect(deps.setStartMeasureIndex).not.toHaveBeenCalled();
        });

        it('uses history navigation when only one block exists', () => {
            const deps = { ...baseDeps(), musicalBlocks: [4] };
            const { result } = renderHook(() => usePlaybackNavigation(deps));

            act(() => result.current.handleSkipBack());
            expect(deps.navigateHistory).toHaveBeenCalledWith('back');
        });
    });

    describe('handleSkipForward — pagination block math', () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => vi.useRealTimers());

        it('moves to next block when in first block', () => {
            // startMeasureIndex=0 → in block 0. Next block starts at 2.
            const deps = { ...baseDeps(), startMeasureIndex: 0 };
            const { result } = renderHook(() => usePlaybackNavigation(deps));

            act(() => result.current.handleSkipForward());
            // Block math: floor(0/4)*4 + nextBlockStart(2) = 2
            expect(deps.setStartMeasureIndex).toHaveBeenCalledWith(2);
            expect(deps.navigateHistory).not.toHaveBeenCalled();
        });

        it('falls through to history when at last block', () => {
            // startMeasureIndex=2 → in block 1 (last). No next block.
            const deps = { ...baseDeps(), startMeasureIndex: 2 };
            const { result } = renderHook(() => usePlaybackNavigation(deps));

            act(() => result.current.handleSkipForward());
            expect(deps.navigateHistory).toHaveBeenCalledWith('forward');
        });

        it('handles multi-block configurations', () => {
            // 3 blocks of varying width: [1, 3, 2]. startMeasureIndex=4 → in block 1 (starts at 1).
            const deps = {
                ...baseDeps(),
                musicalBlocks: [1, 3, 2],
                numMeasures: 6,
                startMeasureIndex: 1, // local 1 → in block 1 (cumul 1, span 3)
            };
            const { result } = renderHook(() => usePlaybackNavigation(deps));

            act(() => result.current.handleSkipForward());
            // Next block starts at 1+3=4
            expect(deps.setStartMeasureIndex).toHaveBeenCalledWith(4);
        });
    });
});
