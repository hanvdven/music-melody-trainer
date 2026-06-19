// useEditMode.js
//
// Extracted from App.jsx (Han 2026-06-19, ARCHITECTURE_AUDIT.md §4 item #9) as a
// BEHAVIOUR-PRESERVING refactor. It collects the four in-SVG staff-overlay edit
// modes (range / clef / colour / instrument) plus their toggle/open/close handlers
// that previously lived inline in App.jsx (~:196-214 state, ~:658-731 handlers,
// ~:222-225 the settings catch-all effect).
//
// IMPORTANT — the external contract is identical to the old App.jsx code: every
// flag value and every handler function behaves exactly as before. No new
// "only one open" enforcement was added beyond what the original handlers already
// did (each toggle clears its three siblings only on OPEN, never on close).
//
// The general SETTINGS overlay (showSheetMusicSettings) is NOT owned here — it
// lives in useSettingsOverlay. It is passed in as state + toggler because the
// edit-mode handlers must close it on open and are closed by it (mutual exclusion).
import { useState, useEffect, useCallback } from 'react';

export default function useEditMode({
    handleStopAllPlayback,
    showSheetMusicSettings,
    toggleSheetMusicSettings,
}) {
    // In-SVG range-edit mode for the visual settings re-haul. Toggled by the
    // SubHeader RANGE button; drives RangeStaffOverlay inside the SheetMusic SVG.
    const [rangeEditMode, setRangeEditMode] = useState(false);
    // In-SVG clef-edit mode (Han 2026-06-01): drives ClefStaffOverlay. Sibling of
    // rangeEditMode; the two are mutually exclusive (and exclusive with settings).
    const [clefEditMode, setClefEditMode] = useState(false);
    // Note-colouring menu (Han 2026-06-13): a staff overlay showing every colour scheme as a
    // row of C4–C5 notes. Sibling of range/clef; mutually exclusive with them + settings.
    const [colorEditMode, setColorEditMode] = useState(false);
    // Instrument selector (Han 2026-06-16): a staff overlay to pick the playback
    // instrument PER STAFF (treble/bass). Sibling of range/clef/colour; mutually
    // exclusive with them + settings (mirrors colorEditMode exactly).
    const [instrumentEditMode, setInstrumentEditMode] = useState(false);

    // Range-edit and the general settings overlay are mutually exclusive
    // (Han 2026-05-31). This effect is the catch-all: whenever the settings
    // overlay becomes visible (by any path — sheet click, SubHeader, …) close
    // range edit so the two never stack. Clef-edit follows the same rule.
    useEffect(() => {
        if (showSheetMusicSettings && rangeEditMode) setRangeEditMode(false);
        if (showSheetMusicSettings && clefEditMode) setClefEditMode(false);
    }, [showSheetMusicSettings, rangeEditMode, clefEditMode]);

    // Range-edit and playback are mutually exclusive (Han 2026-05-30): opening
    // the range overlay stops playback; see also the close-on-play effect below.
    // Range-edit and the general settings overlay are ALSO mutually exclusive
    // (Han 2026-05-31): opening range closes settings, and vice versa, so the two
    // overlays never stack.
    const handleToggleRangeEdit = useCallback(() => {
        if (!rangeEditMode) {
            handleStopAllPlayback();
            if (showSheetMusicSettings) toggleSheetMusicSettings();
            setClefEditMode(false);   // range & clef modes are mutually exclusive
            setColorEditMode(false);
            setInstrumentEditMode(false);
        }
        setRangeEditMode(v => !v);
    }, [rangeEditMode, handleStopAllPlayback, showSheetMusicSettings, toggleSheetMusicSettings]);

    // Clef-edit toggle — mirrors range-edit (stop playback, close settings/range).
    // The chord-row X/letters/roman selector lives inside this mode (Han #6).
    const handleToggleClefEdit = useCallback(() => {
        if (!clefEditMode) {
            handleStopAllPlayback();
            if (showSheetMusicSettings) toggleSheetMusicSettings();
            setRangeEditMode(false);
            setColorEditMode(false);
            setInstrumentEditMode(false);
        }
        setClefEditMode(v => !v);
    }, [clefEditMode, handleStopAllPlayback, showSheetMusicSettings, toggleSheetMusicSettings]);

    // Note-colouring menu toggle — mirrors range/clef (stop playback, close the others).
    const handleToggleColorEdit = useCallback(() => {
        if (!colorEditMode) {
            handleStopAllPlayback();
            if (showSheetMusicSettings) toggleSheetMusicSettings();
            setRangeEditMode(false);
            setClefEditMode(false);
            setInstrumentEditMode(false);
        }
        setColorEditMode(v => !v);
    }, [colorEditMode, handleStopAllPlayback, showSheetMusicSettings, toggleSheetMusicSettings]);

    // Instrument selector toggle — mirrors colour (stop playback, close the others).
    const handleToggleInstrumentEdit = useCallback(() => {
        if (!instrumentEditMode) {
            handleStopAllPlayback();
            if (showSheetMusicSettings) toggleSheetMusicSettings();
            setRangeEditMode(false);
            setClefEditMode(false);
            setColorEditMode(false);
        }
        setInstrumentEditMode(v => !v);
    }, [instrumentEditMode, handleStopAllPlayback, showSheetMusicSettings, toggleSheetMusicSettings]);

    // Toggle the legacy SETTINGS surface from its own SubHeader button (Han #13).
    // Mutually exclusive with clef/range (the catch-all effect closes those when
    // settings opens, but close them here too so the morph arms cleanly).
    const handleToggleSettings = useCallback(() => {
        if (!showSheetMusicSettings) {
            handleStopAllPlayback();
            setRangeEditMode(false);
            setClefEditMode(false);
            setColorEditMode(false);
            setInstrumentEditMode(false);
        }
        toggleSheetMusicSettings();
    }, [showSheetMusicSettings, handleStopAllPlayback, toggleSheetMusicSettings]);

    // Closing range edit (e.g. clicking outside the bottom range settings, or
    // tapping empty sheet area while in range mode).
    const handleCloseRangeEdit = useCallback(() => setRangeEditMode(false), []);
    const handleCloseClefEdit = useCallback(() => setClefEditMode(false), []);
    // Pure OPEN (not toggle) for clicking a clef glyph in the sheet — always lands
    // in clef-edit (Han 2026-06-01: clicking the clef opens the selector).
    const handleOpenClefEdit = useCallback(() => {
        handleStopAllPlayback();
        if (showSheetMusicSettings) toggleSheetMusicSettings();
        setRangeEditMode(false);
        setClefEditMode(true);
    }, [handleStopAllPlayback, showSheetMusicSettings, toggleSheetMusicSettings]);

    return {
        // flags
        rangeEditMode,
        clefEditMode,
        colorEditMode,
        instrumentEditMode,
        // setters needed by App-level effects (e.g. close range on playback start)
        setRangeEditMode,
        // handlers
        handleToggleRangeEdit,
        handleToggleClefEdit,
        handleToggleColorEdit,
        handleToggleInstrumentEdit,
        handleToggleSettings,
        handleCloseRangeEdit,
        handleCloseClefEdit,
        handleOpenClefEdit,
    };
}
