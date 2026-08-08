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
// (The legacy general SETTINGS overlay was removed 2026-07-20 — fully replaced by the PLAYBACK
// setter + the moved adjustment carousels in the COLOUR setter — so useEditMode no longer takes it.)
import { useState, useCallback } from 'react';

export default function useEditMode({
    handleStopAllPlayback,
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
    // Three new generator setters (Han 2026-06-22): PLAYBACK (the legacy SettingsOverlay content
    // shown under a distinct group class), GENERATION (per-balk melody-notes / melody-type /
    // notes-per-measure) and GENERATION ADVANCED (per-balk variability / span / tuplets /
    // smallest-note). Each is a sibling of range/clef/colour/instrument/legacy-settings and FULLY
    // mutually exclusive with all of them AND with each other (mirrors instrumentEditMode exactly).
    const [playbackEditMode, setPlaybackEditMode] = useState(false);
    const [generationEditMode, setGenerationEditMode] = useState(false);
    const [generationAdvancedEditMode, setGenerationAdvancedEditMode] = useState(false);
    // Exercise selector (#266, Han 2026-07-02): in-staff carousel of the exercise
    // registry; while open the bottom view shows the songs tab (App effect).
    // Sibling of all the above — fully mutually exclusive.
    const [exerciseEditMode, setExerciseEditMode] = useState(false);

    // Range-edit and playback are mutually exclusive (Han 2026-05-30): opening
    // the range overlay stops playback; see also the close-on-play effect below.
    // Range-edit and the general settings overlay are ALSO mutually exclusive
    // (Han 2026-05-31): opening range closes settings, and vice versa, so the two
    // overlays never stack.
    const handleToggleRangeEdit = useCallback(() => {
        if (!rangeEditMode) {
            handleStopAllPlayback();
            setClefEditMode(false);   // range & clef modes are mutually exclusive
            setColorEditMode(false);
            setInstrumentEditMode(false);
            setPlaybackEditMode(false);            // close the 3 generator setters too (Han 2026-06-22)
            setGenerationEditMode(false);
            setGenerationAdvancedEditMode(false);
            setExerciseEditMode(false);
        }
        setRangeEditMode(v => !v);
    }, [rangeEditMode, handleStopAllPlayback]);

    // Clef-edit toggle — mirrors range-edit (stop playback, close settings/range).
    // The chord-row X/letters/roman selector lives inside this mode (Han #6).
    const handleToggleClefEdit = useCallback(() => {
        if (!clefEditMode) {
            handleStopAllPlayback();
            setRangeEditMode(false);
            setColorEditMode(false);
            setInstrumentEditMode(false);
            setPlaybackEditMode(false);            // Han 2026-06-22
            setGenerationEditMode(false);
            setGenerationAdvancedEditMode(false);
            setExerciseEditMode(false);
        }
        setClefEditMode(v => !v);
    }, [clefEditMode, handleStopAllPlayback]);

    // Note-colouring menu toggle — mirrors range/clef (stop playback, close the others).
    const handleToggleColorEdit = useCallback(() => {
        if (!colorEditMode) {
            handleStopAllPlayback();
            setRangeEditMode(false);
            setClefEditMode(false);
            setInstrumentEditMode(false);
            setPlaybackEditMode(false);            // Han 2026-06-22
            setGenerationEditMode(false);
            setGenerationAdvancedEditMode(false);
            setExerciseEditMode(false);
        }
        setColorEditMode(v => !v);
    }, [colorEditMode, handleStopAllPlayback]);

    // Instrument selector toggle — mirrors colour (stop playback, close the others).
    const handleToggleInstrumentEdit = useCallback(() => {
        if (!instrumentEditMode) {
            handleStopAllPlayback();
            setRangeEditMode(false);
            setClefEditMode(false);
            setColorEditMode(false);
            setPlaybackEditMode(false);            // Han 2026-06-22
            setGenerationEditMode(false);
            setGenerationAdvancedEditMode(false);
            setExerciseEditMode(false);
        }
        setInstrumentEditMode(v => !v);
    }, [instrumentEditMode, handleStopAllPlayback]);

    // ── Three new generator-setter toggles (Han 2026-06-22) ───────────────────
    // Each mirrors handleToggleInstrumentEdit EXACTLY: stop playback, close the legacy settings
    // overlay, and close every OTHER edit mode (full mutual exclusion across all 7 in-SVG modes).
    const handleTogglePlaybackEdit = useCallback(() => {
        if (!playbackEditMode) {
            handleStopAllPlayback();
            setRangeEditMode(false);
            setClefEditMode(false);
            setColorEditMode(false);
            setInstrumentEditMode(false);
            setGenerationEditMode(false);
            setGenerationAdvancedEditMode(false);
            setExerciseEditMode(false);
        }
        setPlaybackEditMode(v => !v);
    }, [playbackEditMode, handleStopAllPlayback]);

    const handleToggleGenerationEdit = useCallback(() => {
        if (!generationEditMode) {
            handleStopAllPlayback();
            setRangeEditMode(false);
            setClefEditMode(false);
            setColorEditMode(false);
            setInstrumentEditMode(false);
            setPlaybackEditMode(false);
            setGenerationAdvancedEditMode(false);
            setExerciseEditMode(false);
        }
        setGenerationEditMode(v => !v);
    }, [generationEditMode, handleStopAllPlayback]);

    const handleToggleGenerationAdvancedEdit = useCallback(() => {
        if (!generationAdvancedEditMode) {
            handleStopAllPlayback();
            setRangeEditMode(false);
            setClefEditMode(false);
            setColorEditMode(false);
            setInstrumentEditMode(false);
            setPlaybackEditMode(false);
            setGenerationEditMode(false);
            setExerciseEditMode(false);
        }
        setGenerationAdvancedEditMode(v => !v);
    }, [generationAdvancedEditMode, handleStopAllPlayback]);

    // EXERCISES selector toggle (#266, Han 2026-07-02) — mirrors the other
    // setter toggles exactly (stop playback, close settings + every sibling).
    const handleToggleExerciseEdit = useCallback(() => {
        if (!exerciseEditMode) {
            handleStopAllPlayback();
            setRangeEditMode(false);
            setClefEditMode(false);
            setColorEditMode(false);
            setInstrumentEditMode(false);
            setPlaybackEditMode(false);
            setGenerationEditMode(false);
            setGenerationAdvancedEditMode(false);
        }
        setExerciseEditMode(v => !v);
    }, [exerciseEditMode, handleStopAllPlayback]);

    // Closing range edit (e.g. clicking outside the bottom range settings, or
    // tapping empty sheet area while in range mode).
    const handleCloseRangeEdit = useCallback(() => setRangeEditMode(false), []);
    const handleCloseClefEdit = useCallback(() => setClefEditMode(false), []);
    // Pure OPEN (not toggle) for clicking a clef glyph in the sheet — always lands
    // in clef-edit (Han 2026-06-01: clicking the clef opens the selector).
    const handleOpenClefEdit = useCallback(() => {
        handleStopAllPlayback();
        setRangeEditMode(false);
        setClefEditMode(true);
    }, [handleStopAllPlayback]);

    // #667 (Han 2026-08-03): avatar-context (the character/equipment/bestiary screens replacing the old
    // popup) is a sibling of all the above and fully mutually exclusive with them — entering it must close
    // whichever of these was open, same as every other toggle above closes its siblings. Avatar-context
    // itself hides the SubHeader row these all live on, so the reverse direction can't be triggered by the
    // user (there's nothing to click) and needs no handling here.
    const closeAllEditModes = useCallback(() => {
        setRangeEditMode(false);
        setClefEditMode(false);
        setColorEditMode(false);
        setInstrumentEditMode(false);
        setPlaybackEditMode(false);
        setGenerationEditMode(false);
        setGenerationAdvancedEditMode(false);
        setExerciseEditMode(false);
    }, []);

    return {
        // flags
        rangeEditMode,
        clefEditMode,
        colorEditMode,
        instrumentEditMode,
        playbackEditMode,
        generationEditMode,
        generationAdvancedEditMode,
        exerciseEditMode,
        // setters needed by App-level effects (e.g. close range on playback start)
        setRangeEditMode,
        setExerciseEditMode,
        // handlers
        handleToggleRangeEdit,
        handleToggleClefEdit,
        handleToggleColorEdit,
        handleToggleInstrumentEdit,
        handleTogglePlaybackEdit,
        handleToggleGenerationEdit,
        handleToggleGenerationAdvancedEdit,
        handleToggleExerciseEdit,
        handleCloseRangeEdit,
        handleCloseClefEdit,
        handleOpenClefEdit,
        closeAllEditModes,
    };
}
