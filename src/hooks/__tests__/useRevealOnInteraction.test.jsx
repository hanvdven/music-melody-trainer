import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRevealOnInteraction } from '../useRevealOnInteraction';

describe('useRevealOnInteraction (#428/#429)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('is inert when hidden=false (always open, nothing collapsed)', () => {
        const { result } = renderHook(() => useRevealOnInteraction(false));
        expect(result.current.collapsed).toBe(false);
        expect(result.current.mountAllItems).toBe(true);
        expect(result.current.chromeVisible).toBe(true);
    });

    it('starts collapsed when hidden, and reveal() opens it', () => {
        const { result } = renderHook(() => useRevealOnInteraction(true));
        // At rest: collapsed, only active mounted, chrome hidden.
        expect(result.current.collapsed).toBe(true);
        expect(result.current.mountAllItems).toBe(false);
        expect(result.current.chromeVisible).toBe(false);

        act(() => { result.current.reveal(); });
        expect(result.current.open).toBe(true);
        expect(result.current.collapsed).toBe(false);
        expect(result.current.mountAllItems).toBe(true);
        expect(result.current.chromeVisible).toBe(true);
    });

    it('re-hides after the 3s idle timeout (fade → unmount)', () => {
        const { result } = renderHook(() => useRevealOnInteraction(true, { idleMs: 3000, fadeMs: 280 }));
        act(() => { result.current.reveal(); });
        // After 3s the fade starts (collapsed true again, still mounted for the transition).
        act(() => { vi.advanceTimersByTime(3000); });
        expect(result.current.collapsed).toBe(true);
        // After the fade duration the side items unmount.
        act(() => { vi.advanceTimersByTime(280); });
        expect(result.current.open).toBe(false);
        expect(result.current.mountAllItems).toBe(false);
    });

    it('resetHideTimer() postpones the re-hide (timer restarts on every interaction)', () => {
        const { result } = renderHook(() => useRevealOnInteraction(true, { idleMs: 3000 }));
        act(() => { result.current.reveal(); });
        // Nearly-expire, then interact → the countdown restarts, so at the original deadline it is
        // still open.
        act(() => { vi.advanceTimersByTime(2500); result.current.resetHideTimer(); });
        act(() => { vi.advanceTimersByTime(2500); });
        expect(result.current.open).toBe(true);
    });
});
