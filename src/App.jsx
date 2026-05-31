// App.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    getRelativeNoteName,
} from './theory/convertToDisplayNotes';
import { getProgressionLabel } from './theory/progressionDefinitions';
import './styles/App.css';
import './styles/AppLayout.css';
import { modulateMelody } from './theory/musicUtils';
import Sequencer from './audio/Sequencer';
import playMelodies from './audio/playMelodies';
import Melody from './model/Melody';
import ChordProgression from './model/ChordProgression';
import ErrorBoundary from './components/error/ErrorBoundary';
import Scale from './model/Scale';
import SheetMusic from './components/sheet-music/SheetMusic';
import { KIT_NOTE_MAPPINGS } from './audio/drumKits';
import AppHeader from './components/layout/AppHeader';
import SubHeader from './components/layout/SubHeader';

// Hooks
import useRefState from './hooks/useRefState';
import useWindowSize from './hooks/useWindowSize';
import useInstruments from './hooks/useInstruments';
import useMelodyState from './hooks/useMelodyState';
import usePlayback from './hooks/usePlayback';
import useInputTest from './hooks/useInputTest';
import useDeviceState from './hooks/useDeviceState';
import useSettingsOverlay from './hooks/useSettingsOverlay';
import useNoteInteraction from './hooks/useNoteInteraction';
import usePlaybackNavigation from './hooks/usePlaybackNavigation';
import useScaleManagement from './hooks/useScaleManagement';
import useDifficultySettings from './hooks/useDifficultySettings';
import { buildHarmonyTable } from './utils/harmonyTable';
import { resizeMelody } from './utils/melodySlice';
import { TICKS_PER_WHOLE } from './constants/timing';
import {
    DEFAULT_BPM, DEFAULT_TIME_SIG, DEFAULT_NUM_MEASURES,
    DEFAULT_SCALE_TONIC, DEFAULT_SCALE_MODE,
} from './constants/generatorDefaults';
import useAppLayout from './hooks/useAppLayout';
import useAppUIState from './hooks/useAppUIState';
import useAppHandlers from './hooks/useAppHandlers';
import logger from './utils/logger';
import { loadSong } from './songs/loadSong';
import { updateScaleWithTonic, updateScaleWithMode } from './theory/scaleHandler';

// Icons
import {
    Music,
    Piano,
    Settings,
    Guitar,
    Drum,
    BookOpen,
    Mic,
    Keyboard,
    ListRestart,
    Grid3x3,
    GraduationCap,
    Library,
} from 'lucide-react';
import TabView from './components/layout/TabView';
import { PlaybackConfigProvider } from './contexts/PlaybackConfigContext';
import { InstrumentSettingsProvider } from './contexts/InstrumentSettingsContext';
import { DisplaySettingsProvider } from './contexts/DisplaySettingsContext';
import { MelodyProvider } from './contexts/MelodyContext';
import { PlaybackTransportProvider } from './contexts/PlaybackTransportContext';
import { RoundStateProvider } from './contexts/RoundStateContext';
import { TransitionOverlayProvider } from './contexts/TransitionOverlayContext';
import { ProfileProvider } from './contexts/ProfileContext';
import { AnimationRefsProvider } from './contexts/AnimationRefsContext';



/** Tab navigation entries — rendered via .map() in the bottom menu bar. */
const TABS = [
    { id: 'piano', Icon: Piano, label: 'TOP', setClef: 'treble' },
    { id: 'keys-bottom', Icon: Guitar, label: 'BOTTOM', setClef: 'bass' },
    { id: 'percussion', Icon: Drum, label: 'PERCUSSION' },
    { id: 'chords', Icon: Grid3x3, label: 'CHORDS' },
    { id: 'scale', Icon: Music, label: 'SCALES' },
    { id: 'playback', Icon: ListRestart, label: 'GENERATOR', accentColor: 'var(--accent-yellow)' },
    { id: 'songs', Icon: Library, label: 'SONGS', accentColor: 'var(--accent-yellow)' },
    { id: 'other-settings', Icon: Settings, label: 'SETTINGS' },
    { id: 'listen', Icon: Mic, label: 'LISTEN' },
    { id: 'profile', Icon: GraduationCap, label: 'PROFILE' },
];



const App = () => {
    const [context] = useState(() => new (window.AudioContext || window.webkitAudioContext)());

    // useRefState keeps React state and a mutable ref in sync.
    // The ref is read by Sequencer/AudioContext callbacks without stale-closure risk.
    // Declared before configRef so the refs are available when configRef is initialised.
    const [bpm,           setBpm,           bpmRef]   = useRefState(DEFAULT_BPM);
    const [timeSignature, setTimeSignature, tsRef]    = useRefState(DEFAULT_TIME_SIG);
    const [numMeasures,   setNumMeasures,   nmRef]    = useRefState(DEFAULT_NUM_MEASURES);
    const [scale,         setScale,         scaleRef] = useRefState(() => Scale.defaultScale(DEFAULT_SCALE_TONIC, DEFAULT_SCALE_MODE));
    const configRef = useRef({
        repsPerMelody: 4,
        oddRounds: {
            treble: 1, trebleEye: true,
            bass: 1, bassEye: true,
            percussion: 1, percussionEye: true,
            chords: 0.6, chordsEye: true,
            metronome: 0,
            notes: true
        },
        evenRounds: {
            treble: 0, trebleEye: false,
            bass: 0, bassEye: false,
            percussion: 0, percussionEye: false,
            chords: 0.6, chordsEye: true,
            metronome: 1,
            notes: true
        },
        randomize: { tonic: false, mode: false, family: false, melody: true, chords: true },
        totalMelodies: -1,
        chordComplexity: 'triad',
    });
    const instrumentSettingsRef = useRef({
        treble: null, bass: null, percussion: null, metronome: null, chords: null,
    });
    const hasGeneratedInitialChordsRef = useRef(false);
    const instrumentsRef = useRef(null);
    const metronomeRef = useRef(null);
    const melodiesRef = useRef(null);
    const sequencerRef = useRef(null);
    const prevScaleRef = useRef(null);

    // Pure UI state — no cross-dependencies with audio, instruments, or melody generation.
    // Theme side-effect (data-theme attribute) lives inside the hook alongside its state.
    const {
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
        wipeTransitionRef, scrollTransitionRef, paginationFadeRef,
        transitionRef,
        svgRef,
        qwertyKeyboardActive, setQwertyKeyboardActive,
        onPlaybackStartRef,
        showChordLabels, setShowChordLabels,
        showChordsOddRounds, setShowChordsOddRounds, showChordsOddRoundsRef,
        showChordsEvenRounds, setShowChordsEvenRounds, showChordsEvenRoundsRef,
        chordDisplayMode, setChordDisplayMode,
    } = useAppUIState();

    const [customPercussionMapping, setCustomPercussionMapping, customPercussionMappingRef] = useRefState({});

    // Sheet Music Settings state (Lifted)
    const { showSheetMusicSettings, toggleSheetMusicSettings, resetSettingsTimer } = useSettingsOverlay();

    // In-SVG range-edit mode for the visual settings re-haul. Toggled by the
    // SubHeader RANGE button; drives RangeStaffOverlay inside the SheetMusic SVG.
    const [rangeEditMode, setRangeEditMode] = useState(false);

    // Range-edit and the general settings overlay are mutually exclusive
    // (Han 2026-05-31). This effect is the catch-all: whenever the settings
    // overlay becomes visible (by any path — sheet click, SubHeader, …) close
    // range edit so the two never stack.
    useEffect(() => {
        if (showSheetMusicSettings && rangeEditMode) setRangeEditMode(false);
    }, [showSheetMusicSettings, rangeEditMode]);

    // Input Test Mode — wired after usePlayback so handleStopAllPlayback / handlePlayContinuously are available

    const { isFullscreen, toggleFullscreen, isTouch } = useDeviceState();

    // BPM-driven fade duration: 2 quarter notes
    useEffect(() => {
        const dur = (2 * 60 / bpm).toFixed(3);
        document.documentElement.style.setProperty('--note-fade-duration', `${dur}s`);
    }, [bpm]);


    const percussionScale = Scale.defaultPercussionScale();
    const windowSize = useWindowSize();
    const [musicalBlocks, setMusicalBlocks, musicalBlocksRef] = useRefState([1]);

    const { instruments, manualInstruments, settings: instrumentSettingsHooks, setVolume } = useInstruments(context);

    useEffect(() => {
        instrumentsRef.current = instruments;
    }, [instruments]);


    // Factory: creates a setter that also mirrors the new value into instrumentSettingsRef.current[key].
    // Supports both direct values and functional updaters (same API as React's setState).
    const makeInstrumentSetter = useCallback((setter, key) =>
        (val) => {
            if (typeof val === 'function') {
                setter(prev => {
                    const next = val(prev);
                    instrumentSettingsRef.current = { ...instrumentSettingsRef.current, [key]: next };
                    return next;
                });
            } else {
                instrumentSettingsRef.current = { ...instrumentSettingsRef.current, [key]: val };
                setter(val);
            }
        }
        , []);

    const [trebleSettings, _setTrebleSettings] = instrumentSettingsHooks.treble;
    const [bassSettings, _setBassSettings] = instrumentSettingsHooks.bass;
    const [percussionSettings, _setPercussionSettings] = instrumentSettingsHooks.percussion;
    const [metronomeSettings, _setMetronomeSettings] = instrumentSettingsHooks.metronome;
    const [chordSettings, _setChordSettings] = instrumentSettingsHooks.chords;

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const setTrebleSettings = useCallback(makeInstrumentSetter(_setTrebleSettings, 'treble'), [_setTrebleSettings]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const setBassSettings = useCallback(makeInstrumentSetter(_setBassSettings, 'bass'), [_setBassSettings]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const setPercussionSettings = useCallback(makeInstrumentSetter(_setPercussionSettings, 'percussion'), [_setPercussionSettings]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const setMetronomeSettings = useCallback(makeInstrumentSetter(_setMetronomeSettings, 'metronome'), [_setMetronomeSettings]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const setChordSettings = useCallback(makeInstrumentSetter(_setChordSettings, 'chords'), [_setChordSettings]);

    const [playbackConfig, _setPlaybackConfig] = useState(configRef.current);

    const setPlaybackConfig = useCallback((val) => {
        if (typeof val === 'function') {
            _setPlaybackConfig((prev) => {
                const next = val(prev);
                configRef.current = next;
                return next;
            });
        } else {
            configRef.current = val;
            _setPlaybackConfig(val);
        }
    }, [_setPlaybackConfig]);

    const {
        difficultyLevel, setDifficultyLevel,
        difficultyProgression, setDifficultyProgression,
        targetHarmonicDifficulty, setTargetHarmonicDifficulty, targetHarmonicDifficultyRef,
        targetTrebleDifficulty, setTargetTrebleDifficulty, targetTrebleDifficultyRef,
        targetBassDifficulty, setTargetBassDifficulty, targetBassDifficultyRef,
        actualDifficulty,
    } = useDifficultySettings({ scale, trebleSettings, bpm, playbackConfig });

    // Owns scale-related state (tonic, selectedMode) and handlers (setTonic,
    // setSelectedMode, applyHarmonyAtDifficulty, handleScaleClick,
    // handleEnharmonicToggle). Placed after setTrebleSettings/setBassSettings
    // and playbackConfig because setTonic/applyHarmonyAtDifficulty depend on them.
    const {
        selectedMode, isScalePlaying,
        setTonic, setSelectedMode, applyHarmonyAtDifficulty,
        handleScaleClick, handleEnharmonicToggle,
        _setTonic, // raw setter for history-restore in usePlaybackNavigation
    } = useScaleManagement({
        context, instruments, scale, setScale, _setScale: setScale, bpmRef,
        instrumentSettingsRef, setTrebleSettings, setBassSettings,
        minimizeAccidentals, playbackConfig,
    });

    // Initial ref sync for all instruments
    useEffect(() => {
        if (!instrumentSettingsRef.current.treble) instrumentSettingsRef.current.treble = trebleSettings;
        if (!instrumentSettingsRef.current.bass) instrumentSettingsRef.current.bass = bassSettings;
        if (!instrumentSettingsRef.current.percussion) instrumentSettingsRef.current.percussion = percussionSettings;
        if (!instrumentSettingsRef.current.metronome) instrumentSettingsRef.current.metronome = metronomeSettings;
        if (!instrumentSettingsRef.current.chords) instrumentSettingsRef.current.chords = chordSettings;
    }, [trebleSettings, bassSettings, percussionSettings, metronomeSettings, chordSettings]);

    // Keep customPercussionMappingRef in sync: kit base mapping + user overrides.
    // Done inline (not in useEffect) so the Sequencer always reads the correct value
    // even on the very first render before any effects have fired.
    customPercussionMappingRef.current = {
        ...(KIT_NOTE_MAPPINGS[percussionSettings.instrument] || {}),
        ...customPercussionMapping,
    };

    const {
        melodies,
        setters: melodySetters,
        randomizeAll: randomizeAllLogic,
        randomizeMeasure,
        generateChords: generateChordsLogic,
        historyIndex,
        historyIndexRef,
        navigateHistory,
        chordProgressionRef,
    } = useMelodyState(
        numMeasures,
        timeSignature,
        scale,
        percussionScale,
        trebleSettings,
        bassSettings,
        percussionSettings,
        metronomeSettings,
        chordSettings,
        chordSettings?.complexity || 'triad',
        tsRef,
        nmRef
    );


    // Sync chord complexity from chordSettings into playbackConfig so the Sequencer
    // (which reads playbackConfigRef.current.chordComplexity) picks up the latest value.
    useEffect(() => {
        if (chordSettings?.complexity) {
            setPlaybackConfig(p => ({ ...p, chordComplexity: chordSettings.complexity }));
        }
    }, [chordSettings?.complexity]);

    // Sync melodies to ref for Sequencer access
    useEffect(() => {
        melodiesRef.current = melodies;
    }, [melodies]);


    const {
        treble: trebleMelody,
        bass: bassMelody,
        metronome: metronomeMelody,
        chordProgression,
        referenceMelody,
        referenceBassMelody,
        referenceScale,
    } = melodies;

    useEffect(() => {
        metronomeRef.current = metronomeMelody;
    }, [metronomeMelody]);
    const {
        setTreble: setTrebleMelody,
        setBass: setBassMelody,
        setPercussion: setPercussionMelody,
        setChordProgression,
        setReferenceMelody,
        setReferenceBassMelody,
        setReferenceScale,
    } = melodySetters;

    const { handleNoteClick, handleChordClick, handleNoteEnharmonicToggle } = useNoteInteraction({
        context, instruments, customPercussionMappingRef, sequencerRef,
        trebleMelody, bassMelody, setTrebleMelody, setBassMelody,
    });

    // Load a static song definition into the active melody state.
    // useOriginalTonic=true: load in the song's written key and update the app tonic to match.
    // useOriginalTonic=false (default): transpose the song to the user's current tonic.
    //
    // Pipeline:
    //   1. Compute the effective tonic and shift to the song's scale mode.
    //   2. Apply per-instrument settings overrides from `songDef.generator.*Settings`
    //      (shallow merge — songs only need to override the fields they care about).
    //   3. Apply melodies. Tracks the song explicitly provides are also set as the
    //      reference melody so future "fixed"-rule regenerations preserve them
    //      (resolveVoice modulates refMelody from refScale to the current scale).
    //   4. Tracks not provided are cleared to a default empty melody — the user's
    //      next "generate" or "play continuous" populates them according to the
    //      now-applied instrument settings (e.g. walking-bass over the song chords).
    //   5. If the song provides a chord progression: pin it on the next regen
    //      (`playbackConfig.randomize.chords = false`). Otherwise allow regen.
    const handleLoadSong = useCallback((songDef, difficulty, useOriginalTonic = false) => {
        const currentTonic = scale?.tonic?.replace(/-?\d+$/, '') ?? null;
        let targetTonic;
        if (useOriginalTonic) {
            // Load in written key; update the app tonic so scale/key sig aligns with the song.
            targetTonic = null;
            if (songDef.defaultTonic && currentTonic !== songDef.defaultTonic) {
                // setTonic expects a note with octave (e.g. "F4").
                setTonic(songDef.defaultTonic + '4');
            }
        } else {
            targetTonic = currentTonic !== songDef.defaultTonic ? currentTonic : null;
        }
        const loaded = loadSong(songDef, difficulty, targetTonic);

        // Apply scale mode (e.g. 'Major' / 'Dorian') so the key signature, scale
        // wheel, and harmony all reflect the song's intended mode.
        if (loaded.scaleMode) {
            setSelectedMode(loaded.scaleMode);
        }

        // Apply per-instrument settings overrides from the song's generator block.
        const gen = loaded.generator || {};
        if (gen.trebleSettings)     setTrebleSettings(prev => ({ ...prev, ...gen.trebleSettings }));
        if (gen.bassSettings)       setBassSettings(prev => ({ ...prev, ...gen.bassSettings }));
        if (gen.percussionSettings) setPercussionSettings(prev => ({ ...prev, ...gen.percussionSettings }));
        if (gen.chordSettings)      setChordSettings(prev => ({ ...prev, ...gen.chordSettings }));

        // Apply melodies + pin those the song explicitly provides.
        if (loaded.treble) {
            setTrebleMelody(loaded.treble);
            setReferenceMelody(loaded.treble);
        } else {
            setTrebleMelody(Melody.defaultTrebleMelody());
        }
        if (loaded.bass) {
            setBassMelody(loaded.bass);
            setReferenceBassMelody(loaded.bass);
        } else {
            setBassMelody(Melody.defaultBassMelody());
        }
        setPercussionMelody(loaded.percussion ?? Melody.defaultPercussionMelody());

        // referenceScale anchors the source-key of refMelody. resolveVoice
        // modulates from refScale to the (possibly later-changed) app scale; if
        // we leave the previous referenceScale in place, modulateMelody would
        // double-transpose loaded melodies away from their intended key.
        // Build the scale synchronously here because setSelectedMode / setTonic
        // only commit on the next render — resolveVoice may need refScale
        // immediately if the user clicks "play continuous" right after load.
        const effectiveTonic = targetTonic ?? songDef.defaultTonic;
        let refScale = scale;
        if (refScale && refScale.tonic.replace(/-?\d+$/, '') !== effectiveTonic) {
            refScale = updateScaleWithTonic({ currentScale: refScale, newTonic: effectiveTonic + '4' });
        }
        if (loaded.scaleMode && refScale && (refScale.name !== loaded.scaleMode || (loaded.scaleFamily && refScale.family !== loaded.scaleFamily))) {
            refScale = updateScaleWithMode({
                currentScale: refScale,
                newFamily: loaded.scaleFamily ?? refScale.family,
                newMode: loaded.scaleMode,
            });
        }
        if (refScale) setReferenceScale(refScale);

        if (loaded.chordMelody) {
            setChordProgression(loaded.chordMelody);
            // Preserve BOTH the song's chord progression AND its melody on the
            // user's next randomize-on-play (Han 2026-05-29). Loading a song
            // should mean "play THIS song verbatim until I say otherwise" —
            // turning melody pinning back on is how the user opts into
            // "generate variations on this song's harmony". chords=false pins
            // the harmony; melody=false pins the treble/bass content.
            setPlaybackConfig(prev => ({
                ...prev,
                randomize: { ...(prev.randomize || {}), chords: false, melody: false },
            }));
        } else {
            // No chord progression provided — let the next randomize regenerate
            // using the song's chord strategy (or the app defaults). Still pin
            // the melody so the loaded version plays as-is until the user
            // explicitly opts in to variations.
            setPlaybackConfig(prev => ({
                ...prev,
                randomize: { ...(prev.randomize || {}), chords: true, melody: false },
            }));
        }

        setTimeSignature(loaded.timeSignature);
        setNumMeasures(loaded.numMeasures);
        setBpm(loaded.defaultTempo);
        // Reset the on-screen measure index to 0 so the song starts from its
        // first measure visually + behaviorally (Han 2026-05-28). Without this,
        // a song loaded mid-session inherits the previous melody's index, so
        // its first measure is mislabeled and the highlighter/scheduler line up
        // against stale state.
        setStartMeasureIndex(0);
        // Keep the user's current bottom-view tab; loading a song should not
        // hijack the layout. Reported by Han 2026-05-22.
    }, [scale, setTonic, setSelectedMode,
        setTrebleSettings, setBassSettings, setPercussionSettings, setChordSettings,
        setTrebleMelody, setBassMelody, setPercussionMelody, setChordProgression,
        setReferenceMelody, setReferenceBassMelody, setReferenceScale,
        setTimeSignature, setNumMeasures, setBpm, setPlaybackConfig,
        setStartMeasureIndex]);

    // chordProgression is now owned by useMelodyState; no elevation wrapper needed.
    const randomizeAll = randomizeAllLogic;

    const {
        isPlayingContinuously,
        isPlayingScale,
        isPlayingMelody,
        handlePlayContinuously: handlePlayContinuouslyLogic,
        handlePlayScale,
        handlePlayMelody: handlePlayMelodyLogic,
        handlePlayRepeat: handlePlayRepeatLogic,
        handleStopAllPlayback,
        setIsPlayingContinuously,
        setIsPlayingScale,
        setIsPlayingMelody,
        isOddRound,
        setIsOddRound,
        startSequencer,
    } = usePlayback({
        sequencerRef,
        instrumentsRef,
        context,
        bpm,
        scale,
        melodies,
        instruments,
        playbackConfig,
        randomizeAll,
        instrumentSettings: {
            treble: trebleSettings,
            bass: bassSettings,
            percussion: percussionSettings,
            chords: chordSettings,
            metronome: metronomeSettings
        },
        headerPlayMode,
        onPlaybackStart: useCallback(() => onPlaybackStartRef.current(), [])
    });

    // Skip-back/forward and measure-number-click navigation. Placed after usePlayback
    // so isPlayingContinuously/handleStopAllPlayback are initialized.
    const { handleSkipBack, handleSkipForward, handleMeasureNumberClick } = usePlaybackNavigation({
        animationMode, musicalBlocks, startMeasureIndex, setStartMeasureIndex, numMeasures,
        navigateHistory, setScale, _setTonic,
        isPlayingContinuously, isPlayingMelody, handleStopAllPlayback, startSequencer,
        setIsPlayingMelody, setIsPlayingContinuously, melodies,
    });

    // Rubato playback engage hook (PR-C wave 1, Han 2026-05-29).
    // When rubato is active, the Play buttons hand control to input-test mode
    // instead of starting the Sequencer's audio-time loop — the user advances
    // note-by-note from the bottom-pane keyboard. The ref is populated by a
    // useEffect AFTER useInputTest mounts; until then it's a no-op.
    const rubatoEngageRef = useRef(null);

    const handlePlayMelody = useCallback(() => {
        if (isRubatoRef.current && rubatoEngageRef.current) {
            rubatoEngageRef.current('once');
            setHeaderPlayMode('once');
            return;
        }
        handlePlayMelodyLogic();
        setHeaderPlayMode('once');
    }, [handlePlayMelodyLogic, isRubatoRef]);

    const handlePlayContinuously = useCallback(() => {
        if (isRubatoRef.current && rubatoEngageRef.current) {
            rubatoEngageRef.current('continuous');
            setHeaderPlayMode('continuous');
            return;
        }
        handlePlayContinuouslyLogic();
        setHeaderPlayMode('continuous');
    }, [handlePlayContinuouslyLogic, isRubatoRef]);

    // Range-edit and playback are mutually exclusive (Han 2026-05-30): opening
    // the range overlay stops playback; see also the close-on-play effect below.
    // Range-edit and the general settings overlay are ALSO mutually exclusive
    // (Han 2026-05-31): opening range closes settings, and vice versa, so the two
    // overlays never stack.
    const handleToggleRangeEdit = useCallback(() => {
        if (!rangeEditMode) {
            handleStopAllPlayback();
            if (showSheetMusicSettings) toggleSheetMusicSettings();
        }
        setRangeEditMode(v => !v);
    }, [rangeEditMode, handleStopAllPlayback, showSheetMusicSettings, toggleSheetMusicSettings]);

    // Closing range edit (e.g. clicking outside the bottom range settings, or
    // tapping empty sheet area while in range mode).
    const handleCloseRangeEdit = useCallback(() => setRangeEditMode(false), []);

    const handlePlayRepeat = useCallback(() => {
        if (isRubatoRef.current && rubatoEngageRef.current) {
            rubatoEngageRef.current('repeat');
            setHeaderPlayMode('repeat');
            return;
        }
        handlePlayRepeatLogic();
        setHeaderPlayMode('repeat');
    }, [handlePlayRepeatLogic, isRubatoRef]);

    // PR-D wave 2 (Han 2026-05-29): predictive accompaniment for rubato.
    // Track recent advance events to estimate ticks-per-second (TPS) via EWMA;
    // when the user advances a treble note in rubato mode, schedule the
    // bass / chord / percussion notes whose offsets fall in
    // [currentTrebleOffset, nextTrebleOffset) using the estimated TPS so the
    // background tracks "catch up" with the user's tempo. Until 2 advances
    // have happened we fall back to the configured BPM.
    const rubatoEventHistoryRef = useRef([]);
    // Forwarder for inputTestStateRef — populated after useInputTest mounts so
    // onNoteCorrect can read the latest activeIndex without circular TDZ.
    const rubatoInputStateRefForwarderRef = useRef(null);
    // Scroll anchor for rubato (PR-E round 18). When isActive=true, the scroll
    // animation in useSheetMusicHighlight uses pageFraction directly instead
    // of the audio-time formula. Updated on each correct-note advance to
    // point at the NEXT expected note's tick offset so the user sees the
    // cursor glide forward into the upcoming note position.
    const rubatoScrollAnchorRef = useRef({ pageFraction: 0, isActive: false, currentFraction: 0 });
    const RUBATO_HISTORY_LIMIT = 8;
    const RUBATO_EWMA_ALPHA = 0.6; // higher → more reactive to recent intervals

    const estimateRubatoTps = useCallback(() => {
        const hist = rubatoEventHistoryRef.current;
        if (hist.length < 2) return bpmRef.current / 5; // BPM/5 = ticks/sec (since 5/bpm sec/tick)
        let ewma = null;
        for (let i = 1; i < hist.length; i++) {
            const dt = hist[i].wallTime - hist[i - 1].wallTime;
            const dTicks = hist[i].offset - hist[i - 1].offset;
            if (dt <= 0 || dTicks <= 0) continue;
            const tps = dTicks / dt;
            ewma = ewma === null ? tps : RUBATO_EWMA_ALPHA * tps + (1 - RUBATO_EWMA_ALPHA) * ewma;
        }
        return ewma ?? bpmRef.current / 5;
    }, []);

    const scheduleRubatoAccompaniment = useCallback((currentOffset, nextOffset) => {
        if (!context || nextOffset <= currentOffset) return;
        const tps = estimateRubatoTps();
        const bpm = tps * 5;
        const m = melodiesRef.current || {};
        const playList = [];
        const instList = [];
        if (m.bass && instruments.bass) { playList.push(m.bass); instList.push(instruments.bass); }
        if (m.percussion && instruments.percussion) { playList.push(m.percussion); instList.push(instruments.percussion); }
        if (m.chordProgression && instruments.chords) { playList.push(m.chordProgression); instList.push(instruments.chords); }
        if (playList.length === 0) return;
        // Filter [currentOffset+1, nextOffset) — exclude notes at currentOffset because the
        // treble onset already played, and we want bass/chord that synced WITH the treble note
        // to play at the same tap. Actually keep currentOffset INCLUSIVE so simultaneous
        // bass/chord notes do fire alongside the treble tap.
        playMelodies(
            playList,
            instList,
            context,
            bpm,
            context.currentTime,
            null,
            [currentOffset, nextOffset],
            instruments,
            customPercussionMappingRef.current ?? null,
        );
    }, [context, instruments, estimateRubatoTps]);

    const {
        isInputTestMode, setIsInputTestMode,
        inputTestState, setInputTestState,
        inputTestSubMode, setInputTestSubMode,
        isInputTestModeRef, inputTestStateRef, inputTestSubModeRef,
        handleToggleInputTest,
        handleInputTestNote,
    } = useInputTest({
        sequencerRef,
        melodiesRef,
        chordProgressionRef,
        tsRef,
        context,
        isPlayingContinuously,
        handleStopAllPlayback,
        handlePlayContinuously,
        randomizeAll,
        playbackConfig,
        activeTab,
        activeClef,
        onNoteCorrect: useCallback((note, durationTicks) => {
            if (!instruments.treble) return;
            const durationMs = (durationTicks || 12) * (5000 / bpmRef.current);
            setTimeout(() => instruments.treble.stop({ note }), durationMs);
            // PR-D rubato accompaniment hook. inputTestStateRef is read via the
            // ref captured from the input-test-state-ref forwarder below — at
            // call time (= when the user taps), the forwarder ref has been
            // populated by the useEffect after useInputTest mounts. Pulling it
            // from the closure would TDZ-explode because the destructure for
            // inputTestStateRef happens AFTER this useCallback's render pass.
            const stateRef = rubatoInputStateRefForwarderRef.current;
            if (isRubatoRef.current && stateRef?.current?.activeStaff === 'treble') {
                const treble = melodiesRef.current?.treble;
                const idx = stateRef.current.activeIndex;
                if (treble?.offsets && idx >= 0 && idx < treble.offsets.length) {
                    const currentOffset = treble.offsets[idx];
                    const nextOffset = treble.offsets[idx + 1] ?? (currentOffset + (durationTicks || 12));
                    const now = context?.currentTime ?? 0;
                    rubatoEventHistoryRef.current.push({ wallTime: now, offset: currentOffset });
                    if (rubatoEventHistoryRef.current.length > RUBATO_HISTORY_LIMIT) {
                        rubatoEventHistoryRef.current.shift();
                    }
                    scheduleRubatoAccompaniment(currentOffset, nextOffset);
                    // PR-E round 18: drive the scroll-mode cursor to the NEXT
                    // expected note so the user sees what's coming. Linear
                    // pageFraction = nextOffset / total iteration ticks. The
                    // rAF in useSheetMusicHighlight eases from currentFraction
                    // toward this target. isActive flips on so the hook
                    // bypasses its time-based formula.
                    const total = (nmRef.current || 1) * (TICKS_PER_WHOLE * tsRef.current[0] / tsRef.current[1]);
                    if (total > 0) {
                        rubatoScrollAnchorRef.current.pageFraction = nextOffset / total;
                        rubatoScrollAnchorRef.current.isActive = true;
                    }
                }
            }
        }, [instruments.treble, context, scheduleRubatoAccompaniment]),
        onNoteWrong: useCallback((note) => {
            instruments.treble?.stop({ note });
        }, [instruments.treble]),
    });

    const handleSetInputTestSubMode = useCallback((mode) => {
        setInputTestSubMode(mode);
        // Keyboard is only active in 'note' (Piano) mode
        setQwertyKeyboardActive(mode === 'note');
    }, [setInputTestSubMode]);

    // Populate the rubato-play interceptor now that useInputTest is mounted.
    // The Play buttons (handlePlayMelody/Repeat/Continuously) consult this ref
    // when isRubato is true and call into here instead of starting the
    // Sequencer. Wave 1 just flips the user into input-test 'note' sub-mode
    // (= the existing user-driven note advance with red-flash on wrong input)
    // and treats Play/Repeat/Continuously identically — no audio scheduling.
    // Wave 2 (PR-D) will add background-track accompaniment.
    useEffect(() => {
        rubatoEngageRef.current = () => {
            if (!isInputTestModeRef.current) handleToggleInputTest();
            handleSetInputTestSubMode('note');
        };
        return () => { rubatoEngageRef.current = null; };
    }, [handleToggleInputTest, handleSetInputTestSubMode, isInputTestModeRef]);

    // Forward inputTestStateRef so onNoteCorrect (defined earlier, before
    // useInputTest's destructure ran) can reach the latest input-test state.
    useEffect(() => {
        rubatoInputStateRefForwarderRef.current = inputTestStateRef;
    }, [inputTestStateRef]);

    // Update onPlaybackStart logic to use state from useInputTest
    useEffect(() => {
        onPlaybackStartRef.current = () => {
            // In LIVE input test mode, playback and input test coexist — don't kill input test
            if (isInputTestModeRef.current && inputTestSubModeRef.current !== 'live') {
                setIsInputTestMode(false);
                setInputTestState(prev => ({ ...prev, activeIndex: -1, status: 'waiting', chordHits: [], successes: [], score: 0, correctNotes: 0, totalNotes: 0 }));
            }
        };
    }, [isInputTestModeRef, inputTestSubModeRef, setIsInputTestMode, setInputTestState]);

    // Master Volume Automation removed.
    // Instead of automating the global track fader (which abruptly chops fading audio like reverb or
    // cymbal tails at the end of a measure), volumes are now passed directly to the individual notes
    // created by playMelodies.js during Sequencer playback.
    // Manual instrument playing (UI keys/pads) will still use default volumes or respect their individual velocity handling.

    const isPlaying = isPlayingContinuously || isPlayingScale || isPlayingMelody;

    // Starting any playback closes the range overlay (mutually exclusive with
    // range-edit). Covers every play entry point in one place. Closing range-edit
    // never starts playback, so no feedback loop with handleToggleRangeEdit.
    useEffect(() => {
        if (isPlaying) setRangeEditMode(false);
    }, [isPlaying]);

    // Block display state: which song-level measure number the current block starts at,
    // and which sequence position it first appeared at (for computing the repeat suffix R).
    // blockMeasureStart: 1-indexed measure number of the first measure in the current block.
    // blockPlayStart: the startMeasureIndex when the current block first appeared.
    const [blockMeasureStart, setBlockMeasureStart] = useState(1);
    const [blockPlayStart, setBlockPlayStart] = useState(0);

    // Sync block display whenever historyIndex changes — covers: Next button, history navigation,
    // and play start (randomizeAll fires here too). For Sequencer auto-generated blocks during
    // continuous play, applyResultToSetters overrides these via the setBlockMeasureStart /
    // setBlockPlayStart setters passed in sequencerSetters below.
    useEffect(() => {
        if (historyIndex >= 0) {
            setBlockMeasureStart(historyIndex * numMeasures + 1);
            setBlockPlayStart(0);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [historyIndex]);

    // When numMeasures is changed while NOT playing, resize the active melodies so the
    // sheet music immediately reflects the new target length:
    //   - Shorter target: notes beyond the new end are dropped; the last note is clamped.
    //   - Longer target:  one whole-rest measure is appended per missing measure.
    // During playback, the Sequencer owns the active melody: it reads numMeasuresRef.current
    // at each series boundary and generates a fresh melody at the new length. We must NOT
    // update React melody state here during playback — doing so causes SheetMusic to render
    // the new (longer) melody while the Sequencer is still playing the old (shorter) one,
    // which breaks the note-highlight synchronisation (the playhead jumps past the displayed notes).
    useEffect(() => {
        if (isPlaying) return;
        const measureLengthTicks = (TICKS_PER_WHOLE * timeSignature[0]) / timeSignature[1];
        setTrebleMelody(m => resizeMelody(m, numMeasures, measureLengthTicks));
        setBassMelody(m => resizeMelody(m, numMeasures, measureLengthTicks));
        setPercussionMelody(m => resizeMelody(m, numMeasures, measureLengthTicks));
        // Resize reference melodies too, otherwise a subsequent scale change would call
        // modulateMelody on the old-sized reference and undo the resize.
        setReferenceMelody(m => resizeMelody(m, numMeasures, measureLengthTicks));
        setReferenceBassMelody(m => resizeMelody(m, numMeasures, measureLengthTicks));
        // metronome is regenerated by the Sequencer on start; no need to resize
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [numMeasures]);


    const { toggleRoundSetting, generateChords, handleTimeSignatureChange } = useAppHandlers({
        setActivePreset,
        setPlaybackConfig,
        setTrebleSettings,
        setBassSettings,
        setPercussionSettings,
        setChordSettings,
        timeSignature,
        setTimeSignature,
        isPlayingContinuously,
        randomizeAll,
        generateChordsLogic,
        chordSettings,
        setChordProgression,
        playbackConfig,
    });


    useEffect(() => {
        // Transposition Logic
        if (scale && prevScaleRef.current && scale !== prevScaleRef.current) {
            // Determine if we should transpose
            // 1. If manual change (not continuous): Respect Toggle (isModulationEnabled)
            // 2. If continuous play: Respect Random Config (if melody is NOT randomized, we transpose)
            //    Note: If melody IS randomized, Sequencer regenerates it, so we don't transpose here.

            const shouldTransposeGlobal =
                (!isPlayingContinuously && isModulationEnabled) ||
                (isPlayingContinuously && playbackConfig && playbackConfig.randomize && !playbackConfig.randomize.melody);

            const shouldTrebleTranspose = shouldTransposeGlobal || (trebleSettings?.randomizationRule === 'fixed');
            const shouldBassTranspose = shouldTransposeGlobal || (bassSettings?.randomizationRule === 'fixed');

            if (shouldTrebleTranspose || shouldBassTranspose) {
                const newScaleNotes = scale.notes;
                const newDisplayScale = scale.displayNotes;

                // Transpose Treble
                if (shouldTrebleTranspose && trebleMelody && trebleMelody.notes && referenceMelody) {
                    const newNotes = modulateMelody(referenceMelody.notes, referenceScale, scale);
                    const newDisplay = newNotes.map((n) => {
                        if (!n || ['k', 'c', 'b', 'hh', 's', '/'].includes(n)) return n;
                        const idx = newScaleNotes.indexOf(n);
                        if (idx !== -1) return newDisplayScale[idx];
                        return getRelativeNoteName(n, scale.tonic);
                    });
                    setTrebleMelody(
                        new Melody(newNotes, trebleMelody.durations, trebleMelody.offsets, newDisplay)
                    );
                }

                // Transpose Bass
                if (shouldBassTranspose && bassMelody && bassMelody.notes && referenceBassMelody) {
                    const newBassSc = scale.generateBassScale();
                    const refBassSc = referenceScale.generateBassScale();
                    const newBassNotes = modulateMelody(referenceBassMelody.notes, refBassSc, newBassSc);

                    const newBassDisplay = newBassNotes.map((n) => {
                        if (!n || ['k', 'c', 'b', 'hh', 's', '/'].includes(n)) return n;
                        const idx = newBassSc.notes.indexOf(n);
                        if (idx !== -1) return newBassSc.displayNotes[idx];
                        return getRelativeNoteName(n, newBassSc.tonic);
                    });

                    setBassMelody(
                        new Melody(newBassNotes, bassMelody.durations, bassMelody.offsets, newBassDisplay)
                    );
                }
            }
        }
        prevScaleRef.current = scale;
    }, [scale, playbackConfig.randomize.melody, trebleMelody, bassMelody, trebleSettings, bassSettings]);
    // Canonical setters object passed to the Sequencer on init and kept fresh by the
    // refresh effect below. Memoized so the refresh effect only fires when a setter
    // identity actually changes (i.e. a useCallback dependency changed).
    // Refs (svgRef, animationModeRef, etc.) have stable identity — no dep needed.
    const sequencerSetters = useMemo(() => ({
        onStop: () => {
            // Han 2026-05-29: reset all visual playback state on stop so the next
            // play starts from a clean slate. Without this, leftover state like
            // an advanced startMeasureIndex (= where the previous session left off)
            // makes the sheet-music render diverge from a freshly-loaded melody —
            // suspected root cause of the "sheet-music ≠ audio after sequence
            // block 2" report (item 6). Resetting here also kills any in-flight
            // pagination/wipe transition that would otherwise animate after the
            // last audio note of a "Play This" run.
            setIsPlayingContinuously(false);
            setIsPlayingScale(false);
            setIsPlayingMelody(false);
            setNextLayer(null);
            setPreviewMelody(null);
            setCurrentMeasureIndex(null);
            setStartMeasureIndex(0);
            setBlockMeasureStart(1);
            setBlockPlayStart(0);
            setIterInCurrentSeries(0);
            wipeTransitionRef.current = null;
            scrollTransitionRef.current = null;
        },
        setTonic,
        setScale,
        setTrebleSettings,
        setBassSettings,
        setChordProgression,
        generateChords,
        setTrebleMelody,
        setBassMelody,
        setPercussionMelody,
        setShowNotes,
        setShowChordLabels,
        setReferenceMelody,
        setReferenceBassMelody,
        setReferenceScale,
        setStartMeasureIndex,
        setBlockMeasureStart,
        setBlockPlayStart,
        setIsOddRound,
        setVolume,
        setCurrentMeasureIndex,
        setDisplayChordProgression,
        setNextLayer,
        setPreviewMelody,
        setIterInCurrentSeries,
        clearActiveHighlight: () => {
            const svg = svgRef.current;
            if (svg) {
                svg.querySelectorAll('.note-active').forEach(el => el.classList.remove('note-active'));
            }
            clearHighlightStateRef.current = true;
        },
        hideOldGroup: () => {
            // Only apply in wipe mode: prevents a partial-mask flash when React commits
            // new melody content while the wipe sweep mask is still active.
            // In scroll/pagination, this mask can get permanently stuck if React batches
            // setNextLayer('red') + setNextLayer(null) into a null→null no-op.
            if (animationModeRef.current !== 'wipe') return;
            const svg = svgRef.current;
            if (!svg) return;
            const TRANSPARENT = 'linear-gradient(to right, transparent 100%, black 108%)';
            svg.querySelectorAll('[data-wipe-role="old"]').forEach(g => {
                g.style.maskImage = TRANSPARENT;
                g.style.webkitMaskImage = TRANSPARENT;
            });
        },
    }), [setTonic, setScale, setTrebleSettings, setBassSettings, setChordProgression,
        generateChords, setTrebleMelody, setBassMelody, setPercussionMelody,
        setShowNotes, setShowChordLabels, setReferenceMelody, setReferenceBassMelody,
        setReferenceScale, setStartMeasureIndex, setBlockMeasureStart, setBlockPlayStart, setIsOddRound, setVolume,
        setCurrentMeasureIndex, setDisplayChordProgression, setNextLayer, setPreviewMelody, setIterInCurrentSeries]);

    useEffect(() => {
        if (!context || !instruments.treble) return;
        sequencerRef.current = new Sequencer({
            context,
            instruments,
            percussionScale,
            setters: sequencerSetters,
            refs: {
                bpmRef,
                timeSignatureRef: tsRef,
                numMeasuresRef: nmRef,
                historyIndexRef,
                scaleRef,
                playbackConfigRef: configRef,
                metronomeRef,
                melodiesRef,
                instrumentSettingsRef,
                chordProgressionRef,
                showChordsOddRoundsRef,
                showChordsEvenRoundsRef,
                percussionCustomMappingRef: customPercussionMappingRef,
                targetHarmonicDifficultyRef,
                targetTrebleDifficultyRef,
                targetBassDifficultyRef,
                animationModeRef,
                paginationVariantRef,
                wipeTransitionRef,
                scrollTransitionRef,
                paginationFadeRef,
                transitionRef,
                musicalBlocksRef,
            },
        });
        // Auto-start sequencer if user already requested continuous playback
        if (isPlayingContinuously) {
            try {
                const initial = randomizeAll(configRef.current?.randomize);
                sequencerRef.current?.start(initial);
            } catch (e) {
                logger.error('App', 'E004-SEQUENCER-AUTOSTART', e);
            }
        } else {
            // Generate initial chord progression so chord labels are ready before first playback
            try {
                randomizeAll({ melody: false, chords: true });
            } catch (e) {
                logger.error('App', 'E005-CHORD-INIT', e);
            }
        }

        return () => {
            if (sequencerRef.current) sequencerRef.current.stop();
        };
    }, [context, !!instruments.treble]);

    // Keep Sequencer fresh when instruments or any setter identity changes.
    useEffect(() => {
        if (sequencerRef.current) {
            sequencerRef.current.instruments = instruments;
            sequencerRef.current.setters = sequencerSetters;
        }
    }, [instruments, sequencerSetters]);



    // Derived label shown in the header title: "Pop 4 in C Major" instead of "Melody in C Major".
    // displayChordProgression (set by Sequencer, always a ChordProgression with .chords) takes priority.
    // chordProgression (set by randomizeAll) may be a Melody object with .displayNotes instead of .chords.
    const headerProgressionLabel = useMemo(() => {
        const prog = displayChordProgression ?? chordProgression;
        if (!prog) return null;
        const hasChords = prog.chords?.length > 0 || prog.displayNotes?.length > 0;
        if (!hasChords) return null;
        const label = getProgressionLabel(prog.type);
        // Don't show if unknown strategy (fallback = raw key) or plain "Melody" (same as default title)
        if (!label || label === prog.type || label === 'Melody') return null;
        return label;
    }, [displayChordProgression, chordProgression]);


    // Mount Effect: Build harmony table on startup so runtime scale/chord changes are reflected
    useEffect(() => { buildHarmonyTable(); }, []);

    // Mount Effect: Generate initial I-I-I chords once on start
    useEffect(() => {
        if (generateChords && !hasGeneratedInitialChordsRef.current) {
            generateChords('tonic-tonic-tonic');
            hasGeneratedInitialChordsRef.current = true;
        }
    }, [generateChords]);


    const { isDualView, sheetHeight, tabBtnScale, idealVisibleMeasures } = useAppLayout(windowSize, numMeasures);

    // Scroll mode uses a different visibleMeasures formula than pagination/wipe:
    //   - For numMeasures > 1: visible = numMeasures (drop the capacity cap so melodyWidth
    //     always equals pageWidth — keeps the scroll formula `tx = 0.25*pw - pageFraction*mw`
    //     well-conditioned without multi-panel rendering kicking in unnecessarily).
    //   - For numMeasures = 1: visible = 2 (so user sees ~"half-whole-half" = 3 measure-copies
    //     across the visible width, with multi-panel overlays filling the right side).
    // Other modes keep idealVisibleMeasures (capacity-capped, screen-size-aware).
    const scrollVisibleMeasures = numMeasures > 1 ? numMeasures : 2;
    const effectiveVisibleMeasures = animationMode === 'scroll' ? scrollVisibleMeasures : idealVisibleMeasures;

    // Context values — memoized to prevent unnecessary re-renders of consumers
    const playbackConfigCtx = useMemo(() => ({
        playbackConfig, setPlaybackConfig, toggleRoundSetting,
    }), [playbackConfig, setPlaybackConfig, toggleRoundSetting]);

    const instrumentSettingsCtx = useMemo(() => ({
        trebleSettings, setTrebleSettings,
        bassSettings, setBassSettings,
        percussionSettings, setPercussionSettings,
        metronomeSettings, setMetronomeSettings,
        chordSettings, setChordSettings,
    }), [trebleSettings, setTrebleSettings, bassSettings, setBassSettings,
        percussionSettings, setPercussionSettings, metronomeSettings, setMetronomeSettings,
        chordSettings, setChordSettings]);

    const displaySettingsCtx = useMemo(() => ({
        noteColoringMode, setNoteColoringMode,
        debugMode,
        lyricsMode, setLyricsMode,
        chordDisplayMode, setChordDisplayMode,
        showNoteHighlight, setShowNoteHighlight,
        animationMode, setAnimationMode,
        paginationVariant, setPaginationVariant,
        courtesyAccidentals, setCourtesyAccidentals,
        percussionVoiceSplit, setPercussionVoiceSplit,
    }), [noteColoringMode, setNoteColoringMode, debugMode, lyricsMode, setLyricsMode,
        chordDisplayMode, setChordDisplayMode, showNoteHighlight, setShowNoteHighlight,
        animationMode, setAnimationMode, paginationVariant, setPaginationVariant,
        courtesyAccidentals, setCourtesyAccidentals,
        percussionVoiceSplit, setPercussionVoiceSplit]);

    // Shared props for both SheetMusic instances (primary + tab view).
    // containerHeight and visibleMeasures differ between instances and are passed inline.
    // Anacrusis detection (Han 2026-05-28): when the loaded melody's first note
    // sits AFTER tick 0 of measure 0, that measure is a pickup. We treat its
    // global index as the anacrusis marker so BarlinesLayer can suppress the
    // measure-number label. Re-runs whenever trebleMelody flips identity, e.g.
    // after song-load or after a regen that produced a non-anacrusis melody.
    const anacrusisMeasureIndex = useMemo(() => {
        const firstOffset = trebleMelody?.offsets?.[0];
        if (firstOffset == null || firstOffset <= 0) return null;
        return 0;
    }, [trebleMelody]);

    const sheetMusicCommonProps = useMemo(() => ({
        timeSignature,
        onTimeSignatureChange: handleTimeSignatureChange,
        bpm,
        onBpmChange: setBpm,
        isRubato,
        onToggleRubato: () => setIsRubato(p => {
            // Flipping OFF rubato also clears the scroll anchor so the next
            // (audio-time-driven) scroll resumes cleanly without a stale
            // pageFraction holding the playhead in place.
            if (p) {
                rubatoScrollAnchorRef.current.isActive = false;
                rubatoEventHistoryRef.current = [];
            }
            return !p;
        }),
        anacrusisMeasureIndex,
        numRepeats: playbackConfig.repsPerMelody,
        onNumRepeatsChange: (val) => setPlaybackConfig((prev) => ({ ...prev, repsPerMelody: val })),
        numMeasures,
        musicalBlocks,
        onMusicalBlocksChange: setMusicalBlocks,
        onNumMeasuresChange: setNumMeasures,
        numAccidentals: scale.numAccidentals,
        screenWidth: windowSize.width,
        onRandomizeMeasure: randomizeMeasure,
        showSettings: showSheetMusicSettings,
        rangeEditMode: rangeEditMode,
        onToggleSettings: toggleSheetMusicSettings,
        onCloseRangeEdit: handleCloseRangeEdit,
        onSettingsInteraction: resetSettingsTimer,
        tonic: scale.tonic,
        svgRef,
        isFullscreen,
        toggleFullscreen,
        headerPlayMode,
        setHeaderPlayMode,
        handleToggleInputTest,
        handlePlayMelody,
        handlePlayContinuously,
        viewMode: isPlayingContinuously
            ? (showNotes ? 'melody' : 'repeat')
            : (playbackConfig.oddRounds?.notes ? 'melody' : 'repeat'),
        showChords: isPlayingContinuously ? showChordLabels : (showChordsOddRounds || showChordsEvenRounds),
        onNoteClick: handleNoteClick,
        onChordClick: handleChordClick,
        onEnharmonicToggle: handleEnharmonicToggle,
        onMeasureNumberClick: null,
        onNoteEnharmonicToggle: handleNoteEnharmonicToggle,
    }), [timeSignature, handleTimeSignatureChange, bpm, setBpm, isRubato, setIsRubato,
        anacrusisMeasureIndex,
        playbackConfig, setPlaybackConfig,
        numMeasures, musicalBlocks, setMusicalBlocks, setNumMeasures, scale.numAccidentals, scale.tonic,
        windowSize.width, randomizeMeasure, showSheetMusicSettings, rangeEditMode, toggleSheetMusicSettings,
        handleCloseRangeEdit,
        resetSettingsTimer, svgRef, isFullscreen, toggleFullscreen, headerPlayMode, setHeaderPlayMode,
        handleToggleInputTest, handlePlayMelody, handlePlayContinuously, isPlayingContinuously,
        showNotes, showChordLabels, showChordsOddRounds, showChordsEvenRounds,
        handleNoteClick, handleChordClick, handleEnharmonicToggle, handleMeasureNumberClick,
        handleNoteEnharmonicToggle]);

    return (
        <ProfileProvider>
        <PlaybackConfigProvider value={playbackConfigCtx}>
        <InstrumentSettingsProvider value={instrumentSettingsCtx}>
        <DisplaySettingsProvider value={displaySettingsCtx}>
        <MelodyProvider
            treble={melodies.treble}
            bass={melodies.bass}
            percussion={melodies.percussion}
            metronome={melodies.metronome}
            chordProgression={chordProgression}
        >
        <PlaybackTransportProvider
            isPlaying={isPlaying}
            isPlayingContinuously={isPlayingContinuously}
        >
        <RoundStateProvider
            isOddRound={isOddRound}
            showNotes={showNotes}
            inputTestState={isInputTestMode ? inputTestState : null}
            inputTestSubMode={inputTestSubMode}
            setInputTestSubMode={handleSetInputTestSubMode}
        >
        <TransitionOverlayProvider
            nextLayer={nextLayer}
            previewMelody={previewMelody}
            iterInCurrentSeries={iterInCurrentSeries}
        >
        <AnimationRefsProvider
            wipeTransitionRef={wipeTransitionRef}
            scrollTransitionRef={scrollTransitionRef}
            paginationFadeRef={paginationFadeRef}
            transitionRef={transitionRef}
            clearHighlightStateRef={clearHighlightStateRef}
            showNoteHighlightRef={showNoteHighlightRef}
            setCurrentMeasureIndex={setCurrentMeasureIndex}
            sequencerRef={sequencerRef}
            context={context}
            rubatoScrollAnchorRef={rubatoScrollAnchorRef}
        >
        <div className="app-root">
            {/* TOP AREA WRAPPER (Preserves app theme for header/sheet) */}
            <div className="App app-top-wrapper">
                <AppHeader
                    scale={scale}
                    showSheetMusicSettings={showSheetMusicSettings}
                    toggleSheetMusicSettings={toggleSheetMusicSettings}
                    isInputTestMode={isInputTestMode}
                    inputTestState={isInputTestMode ? inputTestState : null}
                    inputTestSubMode={inputTestSubMode}
                    setInputTestSubMode={handleSetInputTestSubMode}
                    isPlayingMelody={isPlayingMelody}
                    handlePlayMelody={handlePlayMelody}
                    handlePlayRepeat={handlePlayRepeat}
                    handleToggleInputTest={handleToggleInputTest}
                    isPlayingContinuously={isPlayingContinuously}
                    handlePlayContinuously={handlePlayContinuously}
                    customScaleLabel={customScaleLabel}
                    headerPlayMode={headerPlayMode}
                    setHeaderPlayMode={setHeaderPlayMode}
                    windowWidth={windowSize.width}
                    setActiveTab={setActiveTab}
                    handleSkipBack={handleSkipBack}
                    handleSkipForward={handleSkipForward}
                    canSkipBack={historyIndex > 0}
                    canSkipForward={true}
                    debugMode={debugMode}
                    setDebugMode={setDebugMode}
                    onScaleClick={handleScaleClick}
                    isScalePlaying={isScalePlaying}
                    progressionLabel={headerProgressionLabel}
                />

                <SubHeader
                    show={showSheetMusicSettings}
                    inputTestSubMode={inputTestSubMode}
                    setInputTestSubMode={handleSetInputTestSubMode}
                    isInputTestMode={isInputTestMode}
                    inputTestState={isInputTestMode ? inputTestState : null}
                    handleToggleInputTest={handleToggleInputTest}
                    headerPlayMode={headerPlayMode}
                    setHeaderPlayMode={setHeaderPlayMode}
                    isPlaying={isPlaying}
                    isPlayingMelody={isPlayingMelody}
                    isPlayingContinuously={isPlayingContinuously}
                    handlePlayMelody={handlePlayMelody}
                    handlePlayContinuously={handlePlayContinuously}
                    onActivateAdjustments={!showSheetMusicSettings ? toggleSheetMusicSettings : undefined}
                    onOpenRange={handleToggleRangeEdit}
                    windowWidth={windowSize.width}
                    difficultyMultiplier={actualDifficulty.multiplier}
                />

                {/* TOP SECTION: SHEET MUSIC & PLAYBACK */}
                <div
                    style={{
                        height: isDualView ? sheetHeight : 'auto',
                        flex: 1,
                        display: (activeTab === 'sheet-music' || isDualView) ? 'flex' : 'none',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 20px',
                        position: 'relative'
                    }}
                >
                    <ErrorBoundary>
                        <SheetMusic
                            {...sheetMusicCommonProps}
                            containerHeight={sheetHeight}
                            visibleMeasures={effectiveVisibleMeasures}
                            startMeasureIndex={startMeasureIndex}
                            blockMeasureStart={blockMeasureStart}
                            blockPlayStart={blockPlayStart}
                        />
                    </ErrorBoundary>
                </div>
            </div> {/* END TOP AREA WRAPPER */}

            {/* BOTTOM SECTION: PANEL (Full height in landscape) */}
            <div
                style={{
                    flex: 1,
                    backgroundColor: 'var(--panel-bg)',
                    borderRadius: isDualView ? '24px 24px 0 0' : '0', // Top rounded only
                    display: 'flex',
                    flexDirection: isDualView ? 'column' : 'row',
                    borderTop: '1px solid #333',
                    margin: '0', // Full width
                    overflow: 'hidden',
                }}
            >
                {/* MENU SELECTOR */}
                <div
                    style={{
                        height: isDualView ? '54px' : '100%',
                        width: isDualView ? 'auto' : '80px',
                        flexShrink: 0,
                        borderBottom: isDualView ? '1px solid #333' : 'none',
                        borderRight: isDualView ? 'none' : '1px solid #333',
                        display: 'flex',
                        flexDirection: isDualView ? 'row' : 'column',
                        gap: '0px',
                        justifyContent: isDualView ? 'center' : 'flex-start',
                        alignItems: 'center',
                        padding: isDualView ? '0 20px' : '10px 0',
                        overflowY: isDualView ? 'hidden' : 'auto',
                        overflowX: isDualView ? 'auto' : 'hidden',
                    }}
                >
                    {/* Single-view-only "Sheet Music" tab */}
                    {!isDualView && (
                        <button
                            className={`tab-button ${activeTab === 'sheet-music' ? 'active' : ''}`}
                            onClick={() => setActiveTab('sheet-music')}
                            style={{
                                width: (75 * tabBtnScale) + 'px',
                                minWidth: (75 * tabBtnScale) + 'px',
                                transform: `scale(${tabBtnScale})`,
                                transformOrigin: 'center',
                                outline: debugMode ? '2px solid cyan' : undefined,
                            }}
                        >
                            <BookOpen size={22} />
                            <span className="tab-label">SHEET MUSIC</span>
                        </button>
                    )}
                    {TABS.map(({ id, Icon, label, setClef, accentColor }) => {
                        const scaledWidth = 75 * tabBtnScale;
                        return (
                            <button
                                key={id}
                                className={`tab-button ${activeTab === id ? 'active' : ''}`}
                                onClick={() => { setActiveTab(id); if (setClef) setActiveClef(setClef); }}
                                style={{
                                    width: scaledWidth + 'px',
                                    minWidth: scaledWidth + 'px',
                                    transform: `scale(${tabBtnScale})`,
                                    transformOrigin: 'center',
                                    outline: debugMode ? '2px solid cyan' : undefined,
                                }}
                            >
                                <Icon
                                    size={22}
                                    color={accentColor && activeTab === id ? accentColor : undefined}
                                />
                                <span className="tab-label">{label}</span>
                            </button>
                        );
                    })}

                    {/* QWERTY Keyboard Input Toggle — piano and percussion tabs */}
                    {(activeTab === 'piano' || activeTab === 'keys-bottom' || activeTab === 'percussion') && !isTouch && (
                        <button
                            onClick={() => setQwertyKeyboardActive(v => !v)}
                            title={qwertyKeyboardActive ? 'QWERTY keyboard input active (click to disable)' : 'Enable QWERTY keyboard input'}
                            className="app-qwerty-btn"
                            style={debugMode ? { outline: '2px solid cyan' } : undefined}
                        >
                            <Keyboard
                                size={20}
                                color={qwertyKeyboardActive ? '#ffffff' : '#555555'}
                                style={qwertyKeyboardActive ? { filter: 'drop-shadow(0 0 5px white)' } : undefined}
                            />
                        </button>
                    )}
                </div>

                {/* CONTENT AREA */}
                <TabView
                    activeTab={activeTab}
                    sheetMusicCommonProps={sheetMusicCommonProps}
                    startMeasureIndex={startMeasureIndex}
                    blockMeasureStart={blockMeasureStart}
                    blockPlayStart={blockPlayStart}
                    idealVisibleMeasures={effectiveVisibleMeasures}
                    instruments={instruments}
                    manualInstruments={manualInstruments}
                    context={context}
                    scale={scale}
                    activeClef={activeClef}
                    handleInputTestNote={handleInputTestNote}
                    qwertyKeyboardActive={qwertyKeyboardActive}
                    showSheetMusicSettings={showSheetMusicSettings}
                    rangeEditMode={rangeEditMode}
                    resetSettingsTimer={resetSettingsTimer}
                    customPercussionMapping={customPercussionMapping}
                    setCustomPercussionMapping={setCustomPercussionMapping}
                    theme={theme}
                    setTheme={setTheme}
                    displayChordProgression={displayChordProgression}
                    chordProgression={chordProgression}
                    sequencerRef={sequencerRef}
                    selectedMode={selectedMode}
                    setSelectedMode={setSelectedMode}
                    customScaleLabel={customScaleLabel}
                    setCustomScaleLabel={setCustomScaleLabel}
                    isModulationEnabled={isModulationEnabled}
                    setIsModulationEnabled={setIsModulationEnabled}
                    isSimpleView={isSimpleView}
                    setIsSimpleView={setIsSimpleView}
                    minimizeAccidentals={minimizeAccidentals}
                    setMinimizeAccidentals={setMinimizeAccidentals}
                    handlePlayScale={handlePlayScale}
                    isPlayingScale={isPlayingScale}
                    setTonic={setTonic}
                    setScale={setScale}
                    numMeasures={numMeasures}
                    setNumMeasures={setNumMeasures}
                    musicalBlocks={musicalBlocks}
                    setShowChordLabels={setShowChordLabels}
                    generatorMode={generatorMode}
                    setGeneratorMode={setGeneratorMode}
                    activePreset={activePreset}
                    setActivePreset={setActivePreset}
                    showChordsOddRounds={showChordsOddRounds}
                    setShowChordsOddRounds={setShowChordsOddRounds}
                    showChordsEvenRounds={showChordsEvenRounds}
                    setShowChordsEvenRounds={setShowChordsEvenRounds}
                    difficultyLevel={difficultyLevel}
                    setDifficultyLevel={setDifficultyLevel}
                    difficultyProgression={difficultyProgression}
                    setDifficultyProgression={setDifficultyProgression}
                    bpm={bpm}
                    setBpm={setBpm}
                    generateChords={generateChords}
                    targetHarmonicDifficulty={targetHarmonicDifficulty}
                    setTargetHarmonicDifficulty={setTargetHarmonicDifficulty}
                    applyHarmonyAtDifficulty={applyHarmonyAtDifficulty}
                    targetTrebleDifficulty={targetTrebleDifficulty}
                    setTargetTrebleDifficulty={setTargetTrebleDifficulty}
                    targetBassDifficulty={targetBassDifficulty}
                    setTargetBassDifficulty={setTargetBassDifficulty}
                    isFullscreen={isFullscreen}
                    toggleFullscreen={toggleFullscreen}
                    windowSize={windowSize}
                    onLoadSong={handleLoadSong}
                />
            </div>
        </div >
        </AnimationRefsProvider>
        </TransitionOverlayProvider>
        </RoundStateProvider>
        </PlaybackTransportProvider>
        </MelodyProvider>
        </DisplaySettingsProvider>
        </InstrumentSettingsProvider>
        </PlaybackConfigProvider>
        </ProfileProvider>
    );
};

export default App;
