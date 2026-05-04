import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useSettingsOverlay from '../useSettingsOverlay';

describe('useSettingsOverlay', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts hidden', () => {
        const { result } = renderHook(() => useSettingsOverlay());
        expect(result.current.showSheetMusicSettings).toBe(false);
    });

    it('toggleSheetMusicSettings flips visibility', () => {
        const { result } = renderHook(() => useSettingsOverlay());

        act(() => result.current.toggleSheetMusicSettings());
        expect(result.current.showSheetMusicSettings).toBe(true);

        act(() => result.current.toggleSheetMusicSettings());
        expect(result.current.showSheetMusicSettings).toBe(false);
    });

    it('auto-hides after 5 seconds when shown', () => {
        const { result } = renderHook(() => useSettingsOverlay());

        act(() => result.current.toggleSheetMusicSettings());
        expect(result.current.showSheetMusicSettings).toBe(true);

        act(() => vi.advanceTimersByTime(4999));
        expect(result.current.showSheetMusicSettings).toBe(true);

        act(() => vi.advanceTimersByTime(1));
        expect(result.current.showSheetMusicSettings).toBe(false);
    });

    it('resetSettingsTimer extends the auto-hide window', () => {
        const { result } = renderHook(() => useSettingsOverlay());

        act(() => result.current.toggleSheetMusicSettings());

        // Wait 4s, then reset with 10s
        act(() => vi.advanceTimersByTime(4000));
        act(() => result.current.resetSettingsTimer(10000));

        // After original 5s would have elapsed (1s after reset), still visible
        act(() => vi.advanceTimersByTime(1500));
        expect(result.current.showSheetMusicSettings).toBe(true);

        // After full 10s from reset, hidden
        act(() => vi.advanceTimersByTime(8500));
        expect(result.current.showSheetMusicSettings).toBe(false);
    });

    it('resetSettingsTimer is a no-op when overlay is hidden', () => {
        const { result } = renderHook(() => useSettingsOverlay());

        // Overlay starts hidden — calling reset shouldn't show it
        act(() => result.current.resetSettingsTimer(5000));
        expect(result.current.showSheetMusicSettings).toBe(false);
    });

    it('cleans up timer on unmount', () => {
        const { result, unmount } = renderHook(() => useSettingsOverlay());

        act(() => result.current.toggleSheetMusicSettings());
        expect(result.current.showSheetMusicSettings).toBe(true);

        unmount();

        // After unmount, advancing time should not trigger setState (which would warn)
        // The cleanup should have cleared the timer.
        expect(() => act(() => vi.advanceTimersByTime(10000))).not.toThrow();
    });
});
