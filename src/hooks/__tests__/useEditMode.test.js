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
        // Three new generator setters (Han 2026-06-22).
        expect(h.result.current.playbackEditMode).toBe(false);
        expect(h.result.current.generationEditMode).toBe(false);
        expect(h.result.current.generationAdvancedEditMode).toBe(false);
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
        ['handleTogglePlaybackEdit', 'playbackEditMode'],
        ['handleToggleGenerationEdit', 'generationEditMode'],
        ['handleToggleGenerationAdvancedEdit', 'generationAdvancedEditMode'],
    ])('%s flips %s', (handler, flag) => {
        act(() => h.result.current[handler]());
        expect(h.result.current[flag]).toBe(true);
        act(() => h.result.current[handler]());
        expect(h.result.current[flag]).toBe(false);
    });

    // Full mutual exclusion across ALL seven in-SVG modes (Han 2026-06-22). Opening any one
    // generator setter must close every other edit mode (the existing four + the other two new).
    const ALL_FLAGS = [
        'rangeEditMode', 'clefEditMode', 'colorEditMode', 'instrumentEditMode',
        'playbackEditMode', 'generationEditMode', 'generationAdvancedEditMode',
    ];
    it.each([
        ['handleTogglePlaybackEdit', 'playbackEditMode'],
        ['handleToggleGenerationEdit', 'generationEditMode'],
        ['handleToggleGenerationAdvancedEdit', 'generationAdvancedEditMode'],
    ])('%s is mutually exclusive with all other edit modes', (handler, flag) => {
        // open every OTHER mode first (sequentially), then the new one, asserting only it remains.
        act(() => h.result.current.handleToggleRangeEdit());
        act(() => h.result.current.handleToggleClefEdit());
        act(() => h.result.current.handleToggleColorEdit());
        act(() => h.result.current.handleToggleInstrumentEdit());
        act(() => h.result.current.handleTogglePlaybackEdit());
        act(() => h.result.current.handleToggleGenerationEdit());
        act(() => h.result.current.handleToggleGenerationAdvancedEdit());
        // now open the one under test — it should be the SOLE active mode.
        act(() => {
            // close it first if the loop above already left it open, so this is a clean OPEN.
            if (h.result.current[flag]) h.result.current[handler]();
        });
        act(() => h.result.current[handler]());
        expect(h.result.current[flag]).toBe(true);
        for (const other of ALL_FLAGS) {
            if (other === flag) continue;
            expect(h.result.current[other]).toBe(false);
        }
    });

    it('opening a new generator setter closes the four original modes', () => {
        act(() => h.result.current.handleToggleRangeEdit());
        expect(h.result.current.rangeEditMode).toBe(true);
        act(() => h.result.current.handleToggleGenerationEdit());
        expect(h.result.current.generationEditMode).toBe(true);
        expect(h.result.current.rangeEditMode).toBe(false);
        expect(h.result.current.clefEditMode).toBe(false);
        expect(h.result.current.colorEditMode).toBe(false);
        expect(h.result.current.instrumentEditMode).toBe(false);
    });

    it('opening an original mode closes the new generator setters', () => {
        act(() => h.result.current.handleToggleGenerationAdvancedEdit());
        expect(h.result.current.generationAdvancedEditMode).toBe(true);
        act(() => h.result.current.handleToggleRangeEdit());
        expect(h.result.current.rangeEditMode).toBe(true);
        expect(h.result.current.generationAdvancedEditMode).toBe(false);
        expect(h.result.current.playbackEditMode).toBe(false);
        expect(h.result.current.generationEditMode).toBe(false);
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
