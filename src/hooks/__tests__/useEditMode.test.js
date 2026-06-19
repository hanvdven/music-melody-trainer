// Smoke tests for useEditMode (Han 2026-06-19, ARCHITECTURE_AUDIT.md §4).
// These assert the EXACT behaviour-preserving contract the hook extracted from
// App.jsx: each toggle flips its own flag, and OPENING any edit mode closes the
// three siblings + the settings overlay (via toggleSheetMusicSettings) + stops
// playback. CLOSING a mode must NOT close siblings or stop playback.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useEditMode from '../useEditMode';

function setup({ showSheetMusicSettings = false } = {}) {
    const handleStopAllPlayback = vi.fn();
    const toggleSheetMusicSettings = vi.fn();
    const { result, rerender } = renderHook(
        (props) => useEditMode(props),
        {
            initialProps: {
                handleStopAllPlayback,
                showSheetMusicSettings,
                toggleSheetMusicSettings,
            },
        }
    );
    return { result, rerender, handleStopAllPlayback, toggleSheetMusicSettings };
}

describe('useEditMode', () => {
    let h;
    beforeEach(() => { h = setup(); });

    it('starts with every edit mode off', () => {
        expect(h.result.current.rangeEditMode).toBe(false);
        expect(h.result.current.clefEditMode).toBe(false);
        expect(h.result.current.colorEditMode).toBe(false);
        expect(h.result.current.instrumentEditMode).toBe(false);
    });

    it('toggleRangeEdit flips rangeEditMode on then off', () => {
        act(() => h.result.current.handleToggleRangeEdit());
        expect(h.result.current.rangeEditMode).toBe(true);
        act(() => h.result.current.handleToggleRangeEdit());
        expect(h.result.current.rangeEditMode).toBe(false);
    });

    it.each([
        ['handleToggleClefEdit', 'clefEditMode'],
        ['handleToggleColorEdit', 'colorEditMode'],
        ['handleToggleInstrumentEdit', 'instrumentEditMode'],
    ])('%s flips %s', (handler, flag) => {
        act(() => h.result.current[handler]());
        expect(h.result.current[flag]).toBe(true);
        act(() => h.result.current[handler]());
        expect(h.result.current[flag]).toBe(false);
    });

    it('opening one mode closes the other three siblings', () => {
        act(() => h.result.current.handleToggleRangeEdit());
        expect(h.result.current.rangeEditMode).toBe(true);
        // Opening clef must close range (and leave colour/instrument off).
        act(() => h.result.current.handleToggleClefEdit());
        expect(h.result.current.clefEditMode).toBe(true);
        expect(h.result.current.rangeEditMode).toBe(false);
        expect(h.result.current.colorEditMode).toBe(false);
        expect(h.result.current.instrumentEditMode).toBe(false);
    });

    it('opening an edit mode stops playback', () => {
        act(() => h.result.current.handleToggleColorEdit());
        expect(h.handleStopAllPlayback).toHaveBeenCalledTimes(1);
    });

    it('closing an edit mode does NOT stop playback or close siblings', () => {
        // open instrument (1 stop call), then open range (2nd stop, closes instrument)
        act(() => h.result.current.handleToggleInstrumentEdit());
        act(() => h.result.current.handleToggleRangeEdit());
        expect(h.handleStopAllPlayback).toHaveBeenCalledTimes(2);
        // closing range: no extra stop call
        act(() => h.result.current.handleToggleRangeEdit());
        expect(h.result.current.rangeEditMode).toBe(false);
        expect(h.handleStopAllPlayback).toHaveBeenCalledTimes(2);
    });

    it('opening an edit mode closes the settings overlay when it is open', () => {
        const open = setup({ showSheetMusicSettings: true });
        act(() => open.result.current.handleToggleRangeEdit());
        expect(open.toggleSheetMusicSettings).toHaveBeenCalledTimes(1);
    });

    it('handleToggleSettings stops playback and closes all edit modes on open', () => {
        // turn on an edit mode first
        act(() => h.result.current.handleToggleClefEdit());
        expect(h.result.current.clefEditMode).toBe(true);
        // settings is currently closed → toggling it counts as OPEN
        act(() => h.result.current.handleToggleSettings());
        expect(h.toggleSheetMusicSettings).toHaveBeenCalledTimes(1);
        expect(h.result.current.clefEditMode).toBe(false);
        expect(h.result.current.rangeEditMode).toBe(false);
        expect(h.result.current.colorEditMode).toBe(false);
        expect(h.result.current.instrumentEditMode).toBe(false);
    });

    it('handleOpenClefEdit always lands in clef-edit (pure open, not toggle)', () => {
        act(() => h.result.current.handleOpenClefEdit());
        expect(h.result.current.clefEditMode).toBe(true);
        // calling again keeps it open (not a toggle)
        act(() => h.result.current.handleOpenClefEdit());
        expect(h.result.current.clefEditMode).toBe(true);
    });

    it('handleCloseRangeEdit / handleCloseClefEdit force the flag off', () => {
        act(() => h.result.current.handleToggleRangeEdit());
        act(() => h.result.current.handleCloseRangeEdit());
        expect(h.result.current.rangeEditMode).toBe(false);
        act(() => h.result.current.handleToggleClefEdit());
        act(() => h.result.current.handleCloseClefEdit());
        expect(h.result.current.clefEditMode).toBe(false);
    });

    it('settings catch-all effect closes range/clef when settings becomes visible', () => {
        act(() => h.result.current.handleToggleRangeEdit());
        expect(h.result.current.rangeEditMode).toBe(true);
        // settings overlay turns on by some other path → rerender with new prop
        act(() => {
            h.rerender({
                handleStopAllPlayback: h.handleStopAllPlayback,
                showSheetMusicSettings: true,
                toggleSheetMusicSettings: h.toggleSheetMusicSettings,
            });
        });
        expect(h.result.current.rangeEditMode).toBe(false);
    });
});
