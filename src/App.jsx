// App.jsx
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import {
    standardizeTonic,
    getRelativeNoteName,
} from './theory/convertToDisplayNotes';
import { getProgressionLabel } from './theory/progressionDefinitions';
import RangeControls from './components/controls/RangeControls';
import { instrumentOptions } from './components/controls/instrumentOptions';
import './styles/App.css';
import './styles/AppLayout.css';
import ScaleSelector from './components/scale/ScaleSelector';
import { transposeMelodyToScale, transposeMelodyBySemitones, modulateMelody, calculateRelativeRange } from './theory/musicUtils';
import {
    formatScaleName,
    updateScaleWithTonic,
    updateScaleWithMode,
    getBestEnharmonicTonic,
    modes,
} from './theory/scaleHandler';
import PlaybackSettings from './components/controls/PlaybackSettings';
import Sequencer from './audio/Sequencer';
import Melody from './model/Melody';
import ChordProgression from './model/ChordProgression';
import ErrorBoundary from './components/error/ErrorBoundary';
import Scale from './model/Scale';
import SheetMusic from './components/sheet-music/SheetMusic';
import PianoView from './components/controls/PianoView';
import DrumPad from './components/controls/DrumPad';
import { KIT_NOTE_MAPPINGS } from './audio/drumKits';
import AppHeader from './components/layout/AppHeader';
import SubHeader from './components/layout/SubHeader';
import GenericStepper from './components/common/GenericStepper';
import { MetronomeIcon, IconOne } from './components/common/CustomIcons';
import ToneRecognizer from './components/controls/ToneRecognizer';

// Hooks
import useWindowSize from './hooks/useWindowSize';
import useInstruments from './hooks/useInstruments';
import useMelodyState from './hooks/useMelodyState';
import usePlayback from './hooks/usePlayback';
import useInputTest from './hooks/useInputTest';
import useSheetMusicHighlight from './hooks/useSheetMusicHighlight';
import useDeviceState from './hooks/useDeviceState';
import useSettingsOverlay from './hooks/useSettingsOverlay';
import useNoteInteraction from './hooks/useNoteInteraction';
import usePlaybackNavigation from './hooks/usePlaybackNavigation';
import useScaleManagement from './hooks/useScaleManagement';
import SettingsPanel from './components/controls/SettingsPanel';
import useDifficultySettings from './hooks/useDifficultySettings';
import { buildHarmonyTable, getHarmonyAtDifficulty, HARMONY_DIFFICULTY_RANGE } from './utils/harmonyTable';
import { calculateMusicalBlocks } from './utils/pagination';
import { resizeMelody } from './utils/melodySlice';
import { TICKS_PER_WHOLE } from './constants/timing';
import playSound from './audio/playSound';

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
} from 'lucide-react';
import ChordGrid from './components/controls/ChordGrid';
import InstrumentRow from './components/controls/rows/InstrumentRow';
import { SectionHeader, ColumnHeaders } from './components/controls/PlaybackSubComponents';
import { PlaybackConfigProvider } from './contexts/PlaybackConfigContext';
import { InstrumentSettingsProvider } from './contexts/InstrumentSettingsContext';
import { DisplaySettingsProvider } from './contexts/DisplaySettingsContext';

const VOLUME_LEVELS = [1.0, 0.8, 0.6, 0.4, 0.2, 0.0];

/** Tab navigation entries — rendered via .map() in the bottom menu bar. */
const TABS = [
    { id: 'piano', Icon: Piano, label: 'TOP', setClef: 'treble' },
    { id: 'keys-bottom', Icon: Guitar, label: 'BOTTOM', setClef: 'bass' },
    { id: 'percussion', Icon: Drum, label: 'PERCUSSION' },
    { id: 'chords', Icon: Grid3x3, label: 'CHORDS' },
    { id: 'scale', Icon: Music, label: 'SCALES' },
    { id: 'playback', Icon: ListRestart, label: 'GENERATOR', accentColor: 'var(--accent-yellow)' },
    { id: 'other-settings', Icon: Settings, label: 'SETTINGS' },
    { id: 'listen', Icon: Mic, label: 'LISTEN' },
];



const App = () => {
    const [context] = useState(() => new (window.AudioContext || window.webkitAudioContext)());

    const bpmRef = useRef(120);
    const tsRef = useRef([4, 4]);
    const nmRef = useRef(2);
    const scaleRef = useRef(Scale.defaultScale('C4', 'Major'));
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
    const chordProgressionRef = useRef(ChordProgression.default());
    const showChordsOddRoundsRef = useRef(false);
    const showChordsEvenRoundsRef = useRef(false);
    const sequencerRef = useRef(null);
    const prevScaleRef = useRef(null);

    const [activeTab, setActiveTab] = useState('piano');

    const [bpm, _setBpm] = useState(120);
    const setBpm = useCallback((val) => {
        if (typeof val === 'function') {
            _setBpm((p) => {
                const next = val(p);
                bpmRef.current = next;
                return next;
            });
        } else {
            bpmRef.current = val;
            _setBpm(val);
        }
    }, []);

    const [timeSignature, _setTimeSignature] = useState([4, 4]);
    const setTimeSignature = useCallback((val) => {
        if (typeof val === 'function') {
            _setTimeSignature((p) => {
                const next = val(p);
                tsRef.current = next;
                return next;
            });
        } else {
            tsRef.current = val;
            _setTimeSignature(val);
        }
    }, []);

    const [numMeasures, _setNumMeasures] = useState(2);
    const setNumMeasures = useCallback((val) => {
        if (typeof val === 'function') {
            _setNumMeasures((p) => {
                const next = val(p);
                nmRef.current = next;
                return next;
            });
        } else {
            nmRef.current = val;
            _setNumMeasures(val);
        }
    }, []);

    const [scale, _setScale] = useState(() => Scale.defaultScale('C4', 'Major'));
    const setScale = useCallback((val) => {
        if (typeof val === 'function') {
            _setScale((p) => {
                const next = val(p);
                scaleRef.current = next;
                return next;
            });
        } else {
            scaleRef.current = val;
            _setScale(val);
        }
    }, []);

    const [chordProgression, setChordProgression] = useState(() => {
        return ChordProgression.default();
    });
    const [displayChordProgression, setDisplayChordProgression] = useState(null);
    const [chordTabRandTypeSelector, setChordTabRandTypeSelector] = useState(null);

    const [showNotes, setShowNotes] = useState(true);
    const [activeClef, setActiveClef] = useState('treble');

    const [customPercussionMapping, setCustomPercussionMapping] = useState({});
    const customPercussionMappingRef = useRef({});
    useEffect(() => { customPercussionMappingRef.current = customPercussionMapping; }, [customPercussionMapping]);

    // UI State persistence for Generator
    const [generatorMode, setGeneratorMode] = useState('presets');
    const [activePreset, setActivePreset] = useState('standard');

    // Theme State
    const [theme, setTheme] = useState('default');
    const [customScaleLabel, setCustomScaleLabel] = useState(null);

    // Modulation Toggle State (default true)
    const [isModulationEnabled, setIsModulationEnabled] = useState(true);

    // Scale View Mode State (default true for initial C Major)
    const [isSimpleView, setIsSimpleView] = useState(true);

    const [minimizeAccidentals, setMinimizeAccidentals] = useState(true);

    // Sheet Music Settings state (Lifted)
    const { showSheetMusicSettings, toggleSheetMusicSettings, resetSettingsTimer } = useSettingsOverlay();
    const [debugMode, setDebugMode] = useState(false);
    const [noteColoringMode, setNoteColoringMode] = useState('tonic_scale_keys');
    const [showNoteHighlight, setShowNoteHighlight] = useState(true);
    const showNoteHighlightRef = useRef(true);
    const clearHighlightStateRef = useRef(false);
    const [startMeasureIndex, setStartMeasureIndex] = useState(0);
    const songRef = useRef(null);

    // Unified play mode: 'once', 'test', 'continuous'
    const [headerPlayMode, setHeaderPlayMode] = useState('continuous'); // Controls which button is in the header

    // Also need to keep the actual logic toggles in sync or refactor usePlayback/useInputTest to use playMode.
    // For now, let's just make the UI look right and then wire up the logic.
    const [songVersion, setSongVersion] = useState(0);
    const [currentMeasureIndex, setCurrentMeasureIndex] = useState(0);
    const [animationMode, setAnimationMode] = useState('pagination');
    const animationModeRef = useRef('pagination');
    useEffect(() => { animationModeRef.current = animationMode; }, [animationMode]);
    const [lyricsMode, setLyricsMode] = useState('none');
    const [nextLayer, setNextLayer] = useState(null); // wipe/scroll-mode preview type: 'yellow' | 'red' | null
    const [previewMelody, setPreviewMelody] = useState(null); // pre-generated next melody for red overlay
    const wipeTransitionRef = useRef(null);         // {startTime, endTime} for wipe mask animation
    const scrollTransitionRef = useRef(null);       // {startTime, endTime} for scroll slide animation
    const pendingScrollTransitionRef = useRef(null); // queued next scroll animation (applied when current finishes)
    const paginationFadeRef = useRef(null);         // {startTime, totalEnd} for rAF-driven pagination crossfade
    const svgRef = useRef(null); // shared ref to the SheetMusic SVG element (used by Sequencer callbacks)
    const [qwertyKeyboardActive, setQwertyKeyboardActive] = useState(false);

    // Tracks showNotes for the rAF without causing re-renders
    const showNotesRef = useRef(true);
    useEffect(() => { showNotesRef.current = showNotes; }, [showNotes]);

    // Input Test Mode — all state, live tracker, and handlers extracted to useInputTest
    // (wired after usePlayback so handleStopAllPlayback / handlePlayContinuously are available)
    const onPlaybackStartRef = useRef(() => { });

    const { isFullscreen, toggleFullscreen, isLandscape, isTouch } = useDeviceState();

    // BPM-driven fade duration: 2 quarter notes
    useEffect(() => {
        const dur = (2 * 60 / bpm).toFixed(3);
        document.documentElement.style.setProperty('--note-fade-duration', `${dur}s`);
    }, [bpm]);


    useEffect(() => {
        if (theme === 'default') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }, [theme]);

    const [selectedMode, _setSelectedMode] = useState('Major');

    const percussionScale = Scale.defaultPercussionScale();
    const windowSize = useWindowSize();
    const [musicalBlocks, setMusicalBlocks] = useState([1]);

    const musicalBlocksRef = useRef(musicalBlocks);
    useEffect(() => { musicalBlocksRef.current = musicalBlocks; }, [musicalBlocks]);

    const { instruments, manualInstruments, settings: instrumentSettingsHooks, setVolume } = useInstruments(context);

    useEffect(() => {
        instrumentsRef.current = instruments;
    }, [instruments]);


    const { isScalePlaying, handleScaleClick, handleEnharmonicToggle } = useScaleManagement({
        context, instruments, scale, setScale, bpmRef,
    });


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

    const [tonic, _setTonic] = useState('C4');
    const setTonic = useCallback((newTonic, isManualOverride = false) => {
        let finalTonic = newTonic;
        // Apply minimization only if NOT manually overridden and toggle is ON
        if (minimizeAccidentals && !isManualOverride) {
            finalTonic = getBestEnharmonicTonic(newTonic, selectedMode);
        }
        _setTonic(finalTonic);

        // SYNC RANGES SYNCHRONOUSLY to prevent lag between tonic change and melody generation
        const trebleRange = calculateRelativeRange('treble', instrumentSettingsRef.current.treble?.rangeMode, finalTonic);
        if (trebleRange) {
            setTrebleSettings(p => ({ ...p, range: trebleRange }));
        }
        const bassRange = calculateRelativeRange('bass', instrumentSettingsRef.current.bass?.rangeMode, finalTonic);
        if (bassRange) {
            setBassSettings(p => ({ ...p, range: bassRange }));
        }

        // Also update scale since tonic usually changes scale
        _setScale((prev) => {
            if (!prev) return prev;
            return updateScaleWithTonic({ currentScale: prev, newTonic: finalTonic });
        });
    }, [minimizeAccidentals, selectedMode, setTrebleSettings, setBassSettings]);

    const setSelectedMode = useCallback((newMode) => {
        _setSelectedMode(newMode);

        // When mode changes, if minimize is on, we might need a better tonic for THIS mode
        if (minimizeAccidentals) {
            _setTonic((prevTonic) => {
                const bestTonic = getBestEnharmonicTonic(prevTonic, newMode);
                if (bestTonic !== prevTonic) {
                    // Update scale too if we switched tonic
                    _setScale((prevScale) => {
                        if (!prevScale) return prevScale;
                        return updateScaleWithTonic({ currentScale: prevScale, newTonic: bestTonic });
                    });

                    // SYNC RANGES SYNCHRONOUSLY
                    const trebleRange = calculateRelativeRange('treble', instrumentSettingsRef.current.treble?.rangeMode, bestTonic);
                    if (trebleRange) {
                        setTrebleSettings(p => ({ ...p, range: trebleRange }));
                    }
                    const bassRange = calculateRelativeRange('bass', instrumentSettingsRef.current.bass?.rangeMode, bestTonic);
                    if (bassRange) {
                        setBassSettings(p => ({ ...p, range: bassRange }));
                    }

                    return bestTonic;
                }
                return prevTonic;
            });
        }
    }, [minimizeAccidentals, setTrebleSettings, setBassSettings]);

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

    /**
     * Picks a random (family, mode, tonic) whose harmonic difficulty matches
     * `target` within ±tolerance and applies it to the current scale.
     */
    const applyHarmonyAtDifficulty = useCallback((target) => {
        const rand = playbackConfig.randomize;
        const constraints = {
            fixedTonic: !rand.tonic ? scale.displayTonic?.replace(/\d+$/, '') ?? scale.tonic.replace(/\d+$/, '') : null,
            fixedFamily: rand.family === false ? scale.family : null,
            fixedMode: (rand.family === false && !rand.mode) ? scale.name : null,
        };
        const entry = getHarmonyAtDifficulty(target, 0.5, constraints);
        if (!entry) return;
        if (rand.family !== false || rand.mode) {
            _setScale((prev) => updateScaleWithMode({ currentScale: prev, newFamily: entry.family, newMode: entry.modeName }));
            _setSelectedMode(entry.modeName);
        }
        if (rand.tonic) {
            setTonic(entry.tonic + '4');
        }
    }, [setTonic, playbackConfig, scale]);

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
        randomizeAll: randomizeAllLogic, // Renamed to avoid conflict
        randomizeMeasure,
        generateChords: generateChordsLogic, // Renamed to avoid conflict
        historyIndex,
        historyLength,
        navigateHistory,
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
        chordProgression,
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
        percussion: percussionMelody,
        metronome: metronomeMelody,
        // chordProgression, // No longer destructured from useMelodyState
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
        setMetronome: setMetronomeMelody,
        setReferenceMelody,
        setReferenceBassMelody,
        setReferenceScale,
        // setChordProgression is now handled by App state
    } = melodySetters;

    const { handleNoteClick, handleChordClick, handleNoteEnharmonicToggle } = useNoteInteraction({
        context, instruments, customPercussionMappingRef, sequencerRef,
        trebleMelody, bassMelody, setTrebleMelody, setBassMelody,
    });

    // Wrapper for randomizeAll from useMelodyState to update elevated chordProgression
    const randomizeAll = useCallback((config) => {
        const result = randomizeAllLogic(config);
        setChordProgression(result.chordProgression);
        return result;
    }, [randomizeAllLogic, setChordProgression]);

    const {
        isPlayingContinuously,
        isPlayingScale,
        isPlayingMelody,
        handlePlayContinuously: handlePlayContinuouslyLogic,
        handlePlayScale,
        handlePlayMelody: handlePlayMelodyLogic,
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
        musicalBlocksRef,
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

    const handlePlayMelody = useCallback(() => {
        handlePlayMelodyLogic();
        setHeaderPlayMode('once');
    }, [handlePlayMelodyLogic]);

    const handlePlayContinuously = useCallback(() => {
        handlePlayContinuouslyLogic();
        setHeaderPlayMode('continuous');
    }, [handlePlayContinuouslyLogic]);

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
        }, [instruments.treble]),
        onNoteWrong: useCallback((note) => {
            instruments.treble?.stop({ note });
        }, [instruments.treble]),
    });

    const handleSetInputTestSubMode = useCallback((mode) => {
        setInputTestSubMode(mode);
        // Keyboard is only active in 'note' (Piano) mode
        setQwertyKeyboardActive(mode === 'note');
    }, [setInputTestSubMode]);

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

    // When numMeasures is changed while NOT playing, resize the active melodies so the
    // sheet music immediately reflects the new target length:
    //   - Shorter target: notes beyond the new end are dropped; the last note is clamped.
    //   - Longer target:  one whole-rest measure is appended per missing measure.
    // During playback, the Sequencer owns the active melody and will apply numMeasures
    // to the next generated series — so we skip the resize to avoid disrupting playback.
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

    // When numMeasures changes DURING continuous playback, regenerate melodies immediately
    // so the Sequencer picks them up at the next melody cycle boundary instead of finishing
    // the entire current series at the old length. Same pattern as handleTimeSignatureChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!isPlayingContinuously) return;
        try {
            randomizeAll(configRef.current?.randomize);
        } catch (e) {
            console.error('[numMeasures change during playback] Melody regen failed:', e);
        }
    }, [numMeasures]); // intentionally omit randomizeAll/isPlayingContinuously — only trigger on numMeasures change

    // Keep highlight-enabled ref in sync (avoids restarting the rAF on toggle)
    useEffect(() => { showNoteHighlightRef.current = showNoteHighlight; }, [showNoteHighlight]);


    // Synchronously manage wipe masks on every nextLayer change (before browser paint).



    const toggleRoundSetting = (round, instrument, type = 'audio') => {
        if (setActivePreset) setActivePreset('custom');
        const field = type === 'visual' ? `${instrument}Eye` : instrument;

        setPlaybackConfig((prev) => {
            const current = prev[round][field];
            let next;

            if (type === 'visual') {
                if (instrument === 'percussion') {
                    // Eye (true) -> Metronome ('metronome') -> EyeOff (false)
                    if (current === true) next = 'metronome';
                    else if (current === 'metronome') next = false;
                    else next = true;
                } else {
                    next = !current;
                }
            } else {
                // Volume cycle: f → mf → mp → p → pp → // → f
                const idx = VOLUME_LEVELS.findIndex(v => Math.abs(v - current) < 0.05);
                next = VOLUME_LEVELS[(idx < 0 ? 0 : idx + 1) % VOLUME_LEVELS.length];
            }

            const nextConfig = {
                ...prev,
                [round]: { ...prev[round], [field]: next }
            };

            // If enabling 'chords' audio, apply the requested presets if it was 0
            if (instrument === 'chords' && type === 'audio' && current === 0 && next > 0) {
                if (setTrebleSettings) setTrebleSettings(p => ({ ...p, notePool: 'scale', randomizationRule: 'weighted' }));
                if (setBassSettings) setBassSettings(p => ({ ...p, notePool: 'chord', randomizationRule: 'emphasize_roots' }));
                if (setPercussionSettings) setPercussionSettings(p => ({ ...p, notePool: 'all', randomizationRule: 'uniform' }));
                if (setChordSettings) setChordSettings(p => ({ ...p, strategy: 'modal-random' }));
            }

            return nextConfig;
        });
    };

    // OPTION+p → set all instrument volumes to pp (pianissimo)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!e.altKey || e.code !== 'KeyP') return;
            e.preventDefault();
            setPlaybackConfig((prev) => ({
                ...prev,
                oddRounds: { ...prev.oddRounds, treble: 0.2, bass: 0.2, chords: 0.2, percussion: 0.2 },
                evenRounds: { ...prev.evenRounds, treble: 0.2, bass: 0.2, chords: 0.2, percussion: 0.2 },
            }));
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setPlaybackConfig]);

    // Wrapper for generateChords from useMelodyState to update elevated chordProgression
    const generateChords = useCallback((strategy) => {
        const nextProgression = generateChordsLogic(strategy || chordSettings.strategy);
        setChordProgression(nextProgression);
        return nextProgression;
    }, [generateChordsLogic, chordSettings.strategy]);


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
                const oldScaleNotes = prevScaleRef.current.notes;
                const newScaleNotes = scale.notes;
                const oldDisplayScale = prevScaleRef.current.displayNotes;
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
    // Chord label visibility state — declared here so they are in scope for the Sequencer
    // init useEffect and the setters-refresh useEffect below.
    const [showChordLabels, setShowChordLabels] = useState(false);
    const [showChordsOddRounds, setShowChordsOddRounds] = useState(false);
    const [showChordsEvenRounds, setShowChordsEvenRounds] = useState(false);
    useEffect(() => { showChordsOddRoundsRef.current = showChordsOddRounds; }, [showChordsOddRounds]);
    useEffect(() => { showChordsEvenRoundsRef.current = showChordsEvenRounds; }, [showChordsEvenRounds]);

    useEffect(() => {
        if (!context || !instruments.treble) return;
        sequencerRef.current = new Sequencer({
            context,
            instruments,
            percussionScale,
            setters: {
                onStop: () => {
                    setIsPlayingContinuously(false);
                    setIsPlayingScale(false);
                    setIsPlayingMelody(false);
                    setNextLayer(null);
                    setPreviewMelody(null);
                    wipeTransitionRef.current = null;
                    scrollTransitionRef.current = null;
                },
                setTonic,
                setScale,
                setTrebleSettings,
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
                setIsOddRound,
                setVolume,
                setSong: (song, version) => { songRef.current = song; setSongVersion(version); },
                setCurrentMeasureIndex,
                clearActiveHighlight: () => {
                    const svg = svgRef.current;
                    if (svg) {
                        svg.querySelectorAll('.note-active').forEach(el => el.classList.remove('note-active'));
                    }
                    clearHighlightStateRef.current = true;
                },
                setNextLayer,
                setPreviewMelody,
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
            },
            refs: {
                bpmRef,
                timeSignatureRef: tsRef,
                numMeasuresRef: nmRef,
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
                wipeTransitionRef,
                scrollTransitionRef,
                pendingScrollTransitionRef,
                paginationFadeRef,
                musicalBlocksRef,
            },
        });
        // Auto-start sequencer if user already requested continuous playback
        if (isPlayingContinuously) {
            try {
                const initial = randomizeAll(configRef.current?.randomize);
                sequencerRef.current?.start(initial);
            } catch (e) {
                console.error('Failed to auto-start sequencer:', e);
            }
        } else {
            // Generate initial chord progression so chord labels are ready before first playback
            try {
                randomizeAll({ melody: false, chords: true });
            } catch (e) {
                console.error('Failed to initialize chord progression:', e);
            }
        }

        return () => {
            if (sequencerRef.current) sequencerRef.current.stop();
        };
    }, [context, !!instruments.treble]);

    // Keep Sequencer fresh to avoid stale closures or stale instrument instances
    useEffect(() => {
        if (sequencerRef.current) {
            sequencerRef.current.instruments = instruments;
            sequencerRef.current.setters = {
                setTrebleMelody,
                setBassMelody,
                setPercussionMelody,
                setTonic,
                setScale,
                setTrebleSettings,
                setBassSettings,
                setChordProgression,
                generateChords,
                setShowNotes,
                setShowChordLabels,
                onStop: () => {
                    setIsPlayingContinuously(false);
                    setIsPlayingScale(false);
                    setIsPlayingMelody(false);
                    setNextLayer(null);
                    setPreviewMelody(null);
                    wipeTransitionRef.current = null;
                    scrollTransitionRef.current = null;
                },
                setReferenceMelody,
                setReferenceBassMelody,
                setReferenceScale,
                setStartMeasureIndex,
                setIsOddRound,
                setVolume,
                setSong: (song, version) => { songRef.current = song; setSongVersion(version); },
                setCurrentMeasureIndex,
                clearActiveHighlight: () => {
                    const svg = svgRef.current;
                    if (svg) {
                        svg.querySelectorAll('.note-active').forEach(el => el.classList.remove('note-active'));
                    }
                    clearHighlightStateRef.current = true;
                },
                setDisplayChordProgression,
                setNextLayer,
                setPreviewMelody,
                hideOldGroup: () => {
                    if (animationModeRef.current !== 'wipe') return;
                    const svg = svgRef.current;
                    if (!svg) return;
                    const TRANSPARENT = 'linear-gradient(to right, transparent 100%, black 108%)';
                    svg.querySelectorAll('[data-wipe-role="old"]').forEach(g => {
                        g.style.maskImage = TRANSPARENT;
                        g.style.webkitMaskImage = TRANSPARENT;
                    });
                },
            };
        }
    }, [instruments, setTrebleMelody, setBassMelody, setPercussionMelody, generateChords, setShowNotes, setShowChordLabels, setTonic, setScale, setTrebleSettings, setBassSettings, setChordProgression, setDisplayChordProgression, setReferenceMelody, setReferenceBassMelody, setReferenceScale, setStartMeasureIndex, setSongVersion, setCurrentMeasureIndex, setNextLayer, setPreviewMelody]);



    const handleTimeSignatureChange = (type, value) => {
        // Compute new TS inline. Using setTimeSignature(scalar) updates tsRef.current
        // synchronously, so randomizeAll (which reads tsRef.current) can use the new
        // TS immediately. All setState calls inside one event handler are batched by
        // React 18 into a single commit — so the render sees new TS + new melodies
        // together, eliminating the intermediate frame that caused SheetMusic to crash.
        const [top, bottom] = timeSignature;
        let newTS;
        if (type === 'incrementTop') newTS = [Math.min(32, top + 1), bottom];
        else if (type === 'decrementTop') newTS = [Math.max(1, top - 1), bottom];
        else if (type === 'cycleBottom') newTS = [top, bottom === 16 ? 2 : bottom * 2];
        else if (type === 'cycleBottomBackward') newTS = [top, Math.max(2, bottom / 2)];
        else if (type === 'setTop') {
            // Direct numeric input from long-press prompt dialog; value arrives as a string
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) newTS = [Math.max(1, Math.min(32, parsed)), bottom];
        }
        if (!newTS) return;

        setTimeSignature(newTS); // also updates tsRef.current synchronously

        if (isPlayingContinuously) {
            try {
                // We keep randomizeAll here for Time Signature changes 
                // until we implement the "graceful partial-measure display" feature
                randomizeAll(playbackConfig.randomize);
            } catch (e) {
                console.error('[handleTimeSignatureChange] Melody regen failed:', e);
            }
        }
    };


    const [chordDisplayMode, setChordDisplayMode] = useState('letters');

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

    // Sync chordProgressionRef whenever chordProgression state changes
    // Key fix for live strategy: Sequencer reads ref, not state
    useEffect(() => {
        chordProgressionRef.current = chordProgression;
    }, [chordProgression]);

    // Mount Effect: Build harmony table on startup so runtime scale/chord changes are reflected
    useEffect(() => { buildHarmonyTable(); }, []);

    // Mount Effect: Generate initial I-I-I chords once on start
    useEffect(() => {
        if (generateChords && !hasGeneratedInitialChordsRef.current) {
            generateChords('tonic-tonic-tonic');
            hasGeneratedInitialChordsRef.current = true;
        }
    }, [generateChords]);


    const isDualView = windowSize.height >= 700;
    const usableHeight = windowSize.height - 100; // Subtract header (100px)
    let sheetHeight, btmPanelHeight;

    if (!isDualView) {
        // Single view mode: active tab takes full height
        sheetHeight = usableHeight;
        btmPanelHeight = usableHeight;
    } else if (usableHeight <= 700) {
        // 700-800px range: 300px bottom, remainder sheet
        btmPanelHeight = 300;
        sheetHeight = usableHeight - 300;
    } else if (usableHeight <= 800) {
        // 800-900px range: 400px sheet, remainder bottom
        sheetHeight = 400;
        btmPanelHeight = usableHeight - 400;
    } else {
        // > 900px: 50/50 split
        btmPanelHeight = usableHeight / 2;
        sheetHeight = usableHeight / 2;
    }

    const tabBtnScale = windowSize.width >= 550 ? 1 : Math.max(0.5, windowSize.width / 550);

    // Ideal visible measures for scroll/wipe animation: how many measures fit in the
    // sheet music viewport at a comfortable note width (~120px per measure).
    // Clamped to [2, numMeasures] — minimum 2 so there is always a prev+current visible.
    // Replaces the hardcoded visibleMeasures={3} that was too wide on small screens.
    const sheetWidth = windowSize.width;
    const APPROX_HEADER_WIDTH = 70; // px reserved for clef/key/time-sig
    const APPROX_PX_PER_MEASURE = 120;
    const idealVisibleMeasures = Math.max(2, Math.min(
        numMeasures,
        Math.round((sheetWidth - APPROX_HEADER_WIDTH) / APPROX_PX_PER_MEASURE)
    ));

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
    }), [noteColoringMode, setNoteColoringMode, debugMode, lyricsMode, setLyricsMode,
        chordDisplayMode, setChordDisplayMode, showNoteHighlight, setShowNoteHighlight,
        animationMode, setAnimationMode]);

    return (
        <PlaybackConfigProvider value={playbackConfigCtx}>
        <InstrumentSettingsProvider value={instrumentSettingsCtx}>
        <DisplaySettingsProvider value={displaySettingsCtx}>
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
                            containerHeight={sheetHeight}
                            timeSignature={timeSignature}
                            onTimeSignatureChange={handleTimeSignatureChange}
                            bpm={bpm}
                            onBpmChange={setBpm}
                            numRepeats={playbackConfig.repsPerMelody}
                            onNumRepeatsChange={(val) =>
                                setPlaybackConfig((prev) => ({ ...prev, repsPerMelody: val }))
                            }
                            onNumMeasuresChange={setNumMeasures}
                            numMeasures={numMeasures}
                            musicalBlocks={musicalBlocks}
                            onMusicalBlocksChange={setMusicalBlocks}
                            trebleMelody={melodies.treble}
                            bassMelody={melodies.bass}
                            percussionMelody={melodies.percussion}
                            numAccidentals={scale.numAccidentals}
                            screenWidth={windowSize.width}
                            onRandomizeMeasure={randomizeMeasure}
                            chordProgression={chordProgression}
                            showSettings={showSheetMusicSettings}
                            onToggleSettings={toggleSheetMusicSettings}
                            onSettingsInteraction={resetSettingsTimer}
                            visibleMeasures={idealVisibleMeasures}
                            startMeasureIndex={startMeasureIndex}
                            inputTestSubMode={inputTestSubMode}
                            setInputTestSubMode={handleSetInputTestSubMode}
                            tonic={scale.tonic}
                            nextLayer={nextLayer}
                            wipeTransitionRef={wipeTransitionRef}
                            scrollTransitionRef={scrollTransitionRef}
                            pendingScrollTransitionRef={pendingScrollTransitionRef}
                            paginationFadeRef={paginationFadeRef}
                            svgRef={svgRef}
                            sequencerRef={sequencerRef}
                            context={context}
                            clearHighlightStateRef={clearHighlightStateRef}
                            setCurrentMeasureIndex={setCurrentMeasureIndex}
                            showNoteHighlightRef={showNoteHighlightRef}
                            metronomeMelody={melodies.metronome}
                            inputTestState={isInputTestMode ? inputTestState : null}
                            isPlaying={isPlaying}
                            isOddRound={isOddRound}
                            previewMelody={previewMelody}
                            isFullscreen={isFullscreen}
                            toggleFullscreen={toggleFullscreen}
                            headerPlayMode={headerPlayMode}
                            setHeaderPlayMode={setHeaderPlayMode}
                            handleToggleInputTest={handleToggleInputTest}
                            handlePlayMelody={handlePlayMelody}
                            handlePlayContinuously={handlePlayContinuously}
                            song={songRef.current}
                            songVersion={songVersion}
                            currentMeasureIndex={currentMeasureIndex}
                            viewMode={isPlayingContinuously
                                ? (showNotes ? 'melody' : 'repeat')
                                : (playbackConfig.oddRounds?.notes ? 'melody' : 'repeat')}
                            showChords={isPlayingContinuously ? showChordLabels : (showChordsOddRounds || showChordsEvenRounds)}
                            onNoteClick={handleNoteClick}
                            onChordClick={handleChordClick}
                            onEnharmonicToggle={handleEnharmonicToggle}
                            onMeasureNumberClick={handleMeasureNumberClick}
                            onNoteEnharmonicToggle={handleNoteEnharmonicToggle}
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
                <div className="app-content-area">
                    {activeTab === 'sheet-music' && (
                        <div className="app-tab-sheet">
                            <ErrorBoundary>
                                <SheetMusic
                                    timeSignature={timeSignature}
                                    onTimeSignatureChange={handleTimeSignatureChange}
                                    bpm={bpm}
                                    onBpmChange={setBpm}
                                    numRepeats={playbackConfig.repsPerMelody}
                                    onNumRepeatsChange={(val) =>
                                        setPlaybackConfig((prev) => ({ ...prev, repsPerMelody: val }))
                                    }
                                    numMeasures={numMeasures}
                                    musicalBlocks={musicalBlocks}
                                    onMusicalBlocksChange={setMusicalBlocks}
                                    trebleMelody={melodies.treble}
                                    bassMelody={melodies.bass}
                                    percussionMelody={melodies.percussion}
                                    numAccidentals={scale.numAccidentals}
                                    screenWidth={windowSize.width}
                                    onRandomizeMeasure={randomizeMeasure}
                                    chordProgression={chordProgression}
                                    showChords={isPlayingContinuously ? showChordLabels : (showChordsOddRounds || showChordsEvenRounds)}
                                    showSettings={showSheetMusicSettings}
                                    onNumMeasuresChange={setNumMeasures}
                                    onToggleSettings={toggleSheetMusicSettings}
                                    onSettingsInteraction={resetSettingsTimer}
                                    isFullscreen={isFullscreen}
                                    toggleFullscreen={toggleFullscreen}
                                    headerPlayMode={headerPlayMode}
                                    setHeaderPlayMode={setHeaderPlayMode}
                                    handleToggleInputTest={handleToggleInputTest}
                                    handlePlayMelody={handlePlayMelody}
                                    handlePlayContinuously={handlePlayContinuously}
                                    viewMode={isPlayingContinuously
                                        ? (showNotes ? 'melody' : 'repeat')
                                        : (playbackConfig.oddRounds?.notes ? 'melody' : 'repeat')}
                                    visibleMeasures={idealVisibleMeasures}
                                    tonic={scale.tonic}
                                    nextLayer={nextLayer}
                                    wipeTransitionRef={wipeTransitionRef}
                                    scrollTransitionRef={scrollTransitionRef}
                                    pendingScrollTransitionRef={pendingScrollTransitionRef}
                                    paginationFadeRef={paginationFadeRef}
                                    svgRef={svgRef}
                                    sequencerRef={sequencerRef}
                                    context={context}
                                    clearHighlightStateRef={clearHighlightStateRef}
                                    setCurrentMeasureIndex={setCurrentMeasureIndex}
                                    showNoteHighlightRef={showNoteHighlightRef}
                                    metronomeMelody={melodies.metronome}
                                    inputTestState={isInputTestMode ? inputTestState : null}
                                    startMeasureIndex={startMeasureIndex}
                                    song={songRef.current}
                                    songVersion={songVersion}
                                    currentMeasureIndex={currentMeasureIndex}
                                    onNoteClick={handleNoteClick}
                                    onChordClick={handleChordClick}
                                    onEnharmonicToggle={handleEnharmonicToggle}
                                    onMeasureNumberClick={handleMeasureNumberClick}
                                    onNoteEnharmonicToggle={handleNoteEnharmonicToggle}
                                />
                            </ErrorBoundary>
                        </div>
                    )}
                    {activeTab === 'piano' && (
                        <div className="app-instrument-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                            {instruments.treble ? (
                                <div style={{ flex: 1, position: 'relative', width: '100%', overflow: 'visible' }}>
                                    <PianoView
                                        scale={scale}
                                        trebleInstrument={activeClef === 'treble' ? manualInstruments.treble : manualInstruments.bass}
                                        activeClef={activeClef}
                                        minNote={activeClef === 'treble' ? trebleSettings?.range?.min : bassSettings?.range?.min}
                                        maxNote={activeClef === 'treble' ? trebleSettings?.range?.max : bassSettings?.range?.max}
                                        noteColoringMode={noteColoringMode}
                                        onNoteInput={handleInputTestNote}
                                        qwertyKeyboardActive={qwertyKeyboardActive}
                                    />
                                    {/* Range Controls - overlaid on top of piano when settings open */}
                                    {showSheetMusicSettings && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 0, left: 0, right: 0,
                                            background: 'var(--panel-bg)', // Match bottom view background
                                            zIndex: 20,
                                            padding: '4px 8px 20px 8px', // Reduced bottom padding to 20px
                                        }}>
                                            <RangeControls
                                                activeSettings={activeClef === 'treble' ? trebleSettings : bassSettings}
                                                setSettings={activeClef === 'treble' ? setTrebleSettings : setBassSettings}
                                                tonic={scale.tonic}
                                                activeClef={activeClef}
                                                instrumentOptions={instrumentOptions}
                                                setInstrument={(slug) => {
                                                    if (activeClef === 'treble') setTrebleSettings(p => ({ ...p, instrument: slug }));
                                                    else setBassSettings(p => ({ ...p, instrument: slug }));
                                                }}
                                                noteColoringMode={noteColoringMode}
                                                setNoteColoringMode={setNoteColoringMode}
                                                onSettingsInteraction={resetSettingsTimer}
                                            />
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="app-instrument-loading">Waking up instruments...</div>
                            )}
                        </div>
                    )}
                    {/* Persistent ToneRecognizer for mic input across tabs */}
                    {(activeTab === 'listen' || inputTestSubMode === 'live') && (
                        <div className="app-tab-listen" style={{ display: activeTab === 'listen' ? 'block' : 'none' }}>
                            <ToneRecognizer
                                context={context}
                                scale={scale}
                                noteColoringMode={noteColoringMode}
                                onNoteInput={handleInputTestNote}
                                inputTestSubMode={inputTestSubMode}
                                activeTab={activeTab}
                            />
                        </div>
                    )}
                    {activeTab === 'keys-bottom' && (
                        <div className="app-instrument-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {instruments.bass ? (
                                <div style={{ flex: 1, position: 'relative', width: '100%', overflow: 'visible' }}>
                                    <PianoView
                                        scale={scale}
                                        trebleInstrument={manualInstruments.bass}
                                        activeClef={'bass'}
                                        minNote={bassSettings?.range?.min}
                                        maxNote={bassSettings?.range?.max}
                                        noteColoringMode={noteColoringMode}
                                        onNoteInput={handleInputTestNote}
                                        qwertyKeyboardActive={qwertyKeyboardActive}
                                    />
                                    {showSheetMusicSettings && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 0, left: 0, right: 0,
                                            background: 'var(--panel-bg)', // Match bottom view background
                                            zIndex: 20,
                                            padding: '4px 8px 20px 8px', // Reduced bottom padding to 20px
                                        }}>
                                            <RangeControls
                                                activeSettings={bassSettings}
                                                setSettings={setBassSettings}
                                                tonic={scale.tonic}
                                                activeClef={'bass'}
                                                instrumentOptions={instrumentOptions}
                                                setInstrument={(slug) => setBassSettings(p => ({ ...p, instrument: slug }))}
                                                noteColoringMode={noteColoringMode}
                                                setNoteColoringMode={setNoteColoringMode}
                                                onSettingsInteraction={resetSettingsTimer}
                                            />
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="app-instrument-loading">Waking up instruments...</div>
                            )}
                        </div>
                    )}
                    {activeTab === 'percussion' && (
                        <div style={{
                            width: '100%',
                            flex: 1,
                            minHeight: 0,
                            maxHeight: `${Math.min(windowSize.height * 0.65, windowSize.width * 0.75)}px`,
                        }}>
                            <DrumPad
                                instruments={manualInstruments}
                                context={context}
                                customMapping={customPercussionMapping}
                                setCustomMapping={setCustomPercussionMapping}
                                percussionSettings={percussionSettings}
                                setPercussionSettings={setPercussionSettings}
                                onNoteInput={handleInputTestNote}
                                qwertyKeyboardActive={qwertyKeyboardActive}
                                theme={theme}
                            />
                        </div>
                    )}
                    {activeTab === 'chords' && (
                        <div className="app-tab-chords">
                            <div className="app-tab-chords-inner">
                                <SectionHeader label="Chords" />
                                <ColumnHeaders
                                    gridConfig="12% 18% 12% 22% 12% 12% 12%"
                                    columns={['chord notation', 'complexity', 'randomization', 'progression', 'chords/ MEASURE', '', 'variability']}
                                />
                                <InstrumentRow
                                    label="Chords"
                                    glyph="/"
                                    instrumentKey="chords"
                                    settings={chordSettings}
                                    setSettings={setChordSettings}
                                    setActiveRandTypeSelector={setChordTabRandTypeSelector}
                                    firstChord={chordProgression?.chords?.[0] ?? null}
                                    renderMode="instrument"
                                />
                            </div>
                            <ChordGrid
                                scale={scale}
                                chordProgression={displayChordProgression}
                                chordDisplayMode={chordDisplayMode}
                                setChordDisplayMode={setChordDisplayMode}
                                isPlaying={isPlayingContinuously || isPlayingMelody}
                                liveComplexity={chordSettings?.complexity || 'triad'}
                                context={context}
                                sequencerRef={sequencerRef}
                            />
                        </div>
                    )}
                    {activeTab === 'scale' && (
                        <ErrorBoundary>
                            <ScaleSelector
                                trebleInstrument={manualInstruments.treble}
                                windowSize={windowSize}
                                scale={scale}
                                setScale={setScale}
                                scaleRange={trebleSettings?.range}
                                setTonic={(v, isManualOverride) => {
                                    setTonic(v, isManualOverride);
                                }}
                                activeMode={selectedMode}
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
                            />
                        </ErrorBoundary>
                    )}
                    {activeTab === 'playback' && (
                        <div className="app-tab-playback">
                            <ErrorBoundary>
                                <PlaybackSettings
                                    numMeasures={numMeasures}
                                    musicalBlocks={musicalBlocks}
                                    setNumMeasures={setNumMeasures}
                                    setShowChordLabels={setShowChordLabels}
                                    activeScale={scale}
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
                                    setScale={setScale}
                                    setSelectedMode={setSelectedMode}
                                    targetHarmonicDifficulty={targetHarmonicDifficulty}
                                    setTargetHarmonicDifficulty={setTargetHarmonicDifficulty}
                                    onApplyHarmonyDifficulty={applyHarmonyAtDifficulty}
                                    harmonyDifficultyRange={HARMONY_DIFFICULTY_RANGE}
                                    targetTrebleDifficulty={targetTrebleDifficulty}
                                    setTargetTrebleDifficulty={setTargetTrebleDifficulty}
                                    targetBassDifficulty={targetBassDifficulty}
                                    setTargetBassDifficulty={setTargetBassDifficulty}
                                    chordProgression={chordProgression}
                                />
                            </ErrorBoundary>
                        </div>
                    )}
                    {activeTab === 'other-settings' && (
                        <SettingsPanel
                            theme={theme} setTheme={setTheme}
                            isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen}
                            minimizeAccidentals={minimizeAccidentals} setMinimizeAccidentals={setMinimizeAccidentals}
                            isModulationEnabled={isModulationEnabled} setIsModulationEnabled={setIsModulationEnabled}
                        />
                    )}
                </div>
            </div>
        </div >
        </DisplaySettingsProvider>
        </InstrumentSettingsProvider>
        </PlaybackConfigProvider>
    );
};

export default App;
