import { useState, useRef, useEffect } from 'react';
import useRefState from './useRefState';

/**
 * Collects all pure UI state for App — state that has no cross-dependencies with
 * audio, instruments, or melody generation. Calling this hook at the top of App
 * keeps the declaration surface visible in one place and frees ~40 lines from App.jsx.
 *
 * Includes the theme side-effect (document data-theme attribute), since that effect
 * is entirely owned by the theme state declared here.
 */
export default function useAppUIState() {
    const [activeTab, setActiveTab] = useState('piano');
    const [displayChordProgression, setDisplayChordProgression] = useState(null);
    const [showNotes, setShowNotes] = useState(true);
    const [activeClef, setActiveClef] = useState('treble');

    const [generatorMode, setGeneratorMode] = useState('presets');
    const [activePreset, setActivePreset] = useState('standard');

    const [theme, setTheme] = useState('default');
    useEffect(() => {
        if (theme === 'default') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const [customScaleLabel, setCustomScaleLabel] = useState(null);
    const [isModulationEnabled, setIsModulationEnabled] = useState(true);
    const [isSimpleView, setIsSimpleView] = useState(true);
    const [minimizeAccidentals, setMinimizeAccidentals] = useState(true);
    const [courtesyAccidentals, setCourtesyAccidentals] = useState(true);
    const [percussionVoiceSplit, setPercussionVoiceSplit] = useState(false);

    const [debugMode, setDebugMode] = useState(false);
    const [noteColoringMode, setNoteColoringMode] = useState('tonic_scale_keys');
    const [showNoteHighlight, setShowNoteHighlight, showNoteHighlightRef] = useRefState(true);
    const clearHighlightStateRef = useRef(false);

    const [startMeasureIndex, setStartMeasureIndex] = useState(0);
    const [headerPlayMode, setHeaderPlayMode] = useState('continuous');
    // currentMeasureIndex is updated by the highlight rAF on every measure
    // boundary (~once per second) but isn't actually rendered by any
    // component — the leftover state forced an App-level re-render on every
    // tick, which propagated through every Provider to every consumer.
    // Switched to a ref so the setter is a pure write with no React work.
    // If a consumer ever needs it back as state, expose a small ref-based
    // hook (e.g. useSyncExternalStore) instead of restoring full state.
    const currentMeasureIndexRef = useRef(0);
    const currentMeasureIndex = 0; // legacy alias for the (now-unused) state value
    const setCurrentMeasureIndex = (n) => { currentMeasureIndexRef.current = n; };
    const [animationMode, setAnimationMode, animationModeRef] = useRefState('pagination');
    // Pagination crossfade speed: 'snel' | 'mid'. See transitionPlanner.PAGINATION_VARIANTS.
    // ('lang' removed 2026-05-28 — no use case.) Only consulted when animationMode === 'pagination'.
    const [paginationVariant, setPaginationVariant, paginationVariantRef] = useRefState('mid');
    // Rubato toggle (Han 2026-05-28 PR-B). When true, the BPM display becomes a
    // rubato glyph (Maestro SHIFT+T) + the word "rubato" instead of the numeric
    // BPM, and tempo-driven playback is replaced by user-input-driven timing
    // (implemented in PR-C+). UI: long-press on the BPM value area toggles this.
    const [isRubato, setIsRubato, isRubatoRef] = useRefState(false);
    const [lyricsMode, setLyricsMode] = useState('none');

    const [nextLayer, setNextLayer] = useState(null);
    const [previewMelody, setPreviewMelody] = useState(null);

    // Scroll-mode multi-panel rendering needs to know how many iterations remain in
    // the current series (= same melody being repeated). Set by Sequencer at each
    // iter boundary; SheetMusic uses it to decide per-panel content (current-series
    // panels render currentMelody, next-series panels render previewMelody).
    //   0 = currently in the LAST rep of the series (next iter is a series boundary).
    //   k (k > 0) = k more reps of the same melody before series flip.
    const [iterInCurrentSeries, setIterInCurrentSeries] = useState(0);

    // Transition refs read by rAF callbacks in SheetMusic/AnimationRefs — stable identity across renders
    const wipeTransitionRef = useRef(null);         // {startTime, endTime} for wipe mask animation
    // Continuous scroll state. Shape: { startTime, startPageFraction, secondsPerPage }.
    // rAF computes pageFraction = startPageFraction + (now-startTime)/secondsPerPage,
    // tx = (0.25 - pageFraction) * pageWidth. Single persistent anchor; Sequencer adjusts
    // startTime/startPageFraction on BPM changes (snap-on-measure) and at page boundaries
    // (startPageFraction -= 1 in the same callback that swaps melody state — visually seamless).
    const scrollTransitionRef = useRef(null);
    const paginationFadeRef = useRef(null);         // {startTime, totalEnd} for rAF-driven pagination crossfade (legacy two-phase path)
    // New unified transition ref consumed by useSheetMusicHighlight in the redesign.
    // Shape: { kind: 'crossfade', startTime, endTime } — extensible for wipe/stream/rubato later.
    const transitionRef = useRef(null);

    const svgRef = useRef(null); // shared ref to the SheetMusic SVG element (used by Sequencer callbacks)
    const [qwertyKeyboardActive, setQwertyKeyboardActive] = useState(false);

    const onPlaybackStartRef = useRef(() => {});

    // Chord visibility — refs needed by Sequencer (reads without React state lag)
    const [chordDisplayMode, setChordDisplayMode] = useState('letters');
    const [showChordLabels, setShowChordLabels] = useState(false);
    const [showChordsOddRounds, setShowChordsOddRounds, showChordsOddRoundsRef] = useRefState(false);
    const [showChordsEvenRounds, setShowChordsEvenRounds, showChordsEvenRoundsRef] = useRefState(false);

    return {
        activeTab, setActiveTab,
        displayChordProgression, setDisplayChordProgression,
        showNotes, setShowNotes,
        activeClef, setActiveClef,
        generatorMode, setGeneratorMode,
        activePreset, setActivePreset,
        theme, setTheme,
        customScaleLabel, setCustomScaleLabel,
        isModulationEnabled, setIsModulationEnabled,
        isSimpleView, setIsSimpleView,
        minimizeAccidentals, setMinimizeAccidentals,
        courtesyAccidentals, setCourtesyAccidentals,
        percussionVoiceSplit, setPercussionVoiceSplit,
        debugMode, setDebugMode,
        noteColoringMode, setNoteColoringMode,
        showNoteHighlight, setShowNoteHighlight, showNoteHighlightRef,
        clearHighlightStateRef,
        startMeasureIndex, setStartMeasureIndex,
        headerPlayMode, setHeaderPlayMode,
        currentMeasureIndex, setCurrentMeasureIndex,
        animationMode, setAnimationMode, animationModeRef,
        paginationVariant, setPaginationVariant, paginationVariantRef,
        isRubato, setIsRubato, isRubatoRef,
        lyricsMode, setLyricsMode,
        nextLayer, setNextLayer,
        previewMelody, setPreviewMelody,
        iterInCurrentSeries, setIterInCurrentSeries,
        wipeTransitionRef,
        scrollTransitionRef,
        paginationFadeRef,
        transitionRef,
        svgRef,
        qwertyKeyboardActive, setQwertyKeyboardActive,
        onPlaybackStartRef,
        chordDisplayMode, setChordDisplayMode,
        showChordLabels, setShowChordLabels,
        showChordsOddRounds, setShowChordsOddRounds, showChordsOddRoundsRef,
        showChordsEvenRounds, setShowChordsEvenRounds, showChordsEvenRoundsRef,
    };
}
