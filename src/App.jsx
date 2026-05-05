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
    VOLUME_LEVELS,
    DEFAULT_BPM, DEFAULT_TIME_SIG, DEFAULT_NUM_MEASURES,
    DEFAULT_SCALE_TONIC, DEFAULT_SCALE_MODE,
} from './constants/generatorDefaults';
import useAppLayout from './hooks/useAppLayout';
import logger from './utils/logger';

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
import TabView from './components/layout/TabView';
import { PlaybackConfigProvider } from './contexts/PlaybackConfigContext';
import { InstrumentSettingsProvider } from './contexts/InstrumentSettingsContext';
import { DisplaySettingsProvider } from './contexts/DisplaySettingsContext';
import { MelodyProvider } from './contexts/MelodyContext';
import { PlaybackStateProvider } from './contexts/PlaybackStateContext';
import { AnimationRefsProvider } from './contexts/AnimationRefsContext';



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

    const [activeTab, setActiveTab] = useState('piano');

    const [chordProgression, setChordProgression, chordProgressionRef] = useRefState(() => ChordProgression.default());
    const [displayChordProgression, setDisplayChordProgression] = useState(null);

    const [showNotes, setShowNotes] = useState(true);
    const [activeClef, setActiveClef] = useState('treble');

    const [customPercussionMapping, setCustomPercussionMapping, customPercussionMappingRef] = useRefState({});

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
    const [showNoteHighlight, setShowNoteHighlight, showNoteHighlightRef] = useRefState(true);
    const clearHighlightStateRef = useRef(false);
    const [startMeasureIndex, setStartMeasureIndex] = useState(0);

    // Unified play mode: 'once', 'test', 'continuous'
    const [headerPlayMode, setHeaderPlayMode] = useState('continuous'); // Controls which button is in the header

    // Also need to keep the actual logic toggles in sync or refactor usePlayback/useInputTest to use playMode.
    // For now, let's just make the UI look right and then wire up the logic.
    const [currentMeasureIndex, setCurrentMeasureIndex] = useState(0);
    const [animationMode, setAnimationMode, animationModeRef] = useRefState('pagination');
    const [lyricsMode, setLyricsMode] = useState('none');
    const [nextLayer, setNextLayer] = useState(null); // wipe/scroll-mode preview type: 'yellow' | 'red' | null
    const [previewMelody, setPreviewMelody] = useState(null); // pre-generated next melody for red overlay
    const wipeTransitionRef = useRef(null);         // {startTime, endTime} for wipe mask animation
    const scrollTransitionRef = useRef(null);       // {startTime, endTime} for scroll slide animation
    const pendingScrollTransitionRef = useRef(null); // queued next scroll animation (applied when current finishes)
    const paginationFadeRef = useRef(null);         // {startTime, totalEnd} for rAF-driven pagination crossfade
    const svgRef = useRef(null); // shared ref to the SheetMusic SVG element (used by Sequencer callbacks)
    const [qwertyKeyboardActive, setQwertyKeyboardActive] = useState(false);


    // Input Test Mode — all state, live tracker, and handlers extracted to useInputTest
    // (wired after usePlayback so handleStopAllPlayback / handlePlayContinuously are available)
    const onPlaybackStartRef = useRef(() => { });

    const { isFullscreen, toggleFullscreen, isTouch } = useDeviceState();

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
        randomizeAll: randomizeAllLogic, // Renamed to avoid conflict
        randomizeMeasure,
        generateChords: generateChordsLogic, // Renamed to avoid conflict
        historyIndex,
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
        metronome: metronomeMelody,
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
        isInputTestModeRef, inputTestSubModeRef,
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


    const toggleRoundSetting = useCallback((round, instrument, type = 'audio') => {
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
    }, [setActivePreset, setPlaybackConfig, setTrebleSettings, setBassSettings, setPercussionSettings, setChordSettings]);

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
    // Chord label visibility state — declared here so they are in scope for the Sequencer
    // init useEffect and the setters-refresh useEffect below.
    const [showChordLabels, setShowChordLabels] = useState(false);
    const [showChordsOddRounds, setShowChordsOddRounds, showChordsOddRoundsRef] = useRefState(false);
    const [showChordsEvenRounds, setShowChordsEvenRounds, showChordsEvenRoundsRef] = useRefState(false);

    // Canonical setters object passed to the Sequencer on init and kept fresh by the
    // refresh effect below. Memoized so the refresh effect only fires when a setter
    // identity actually changes (i.e. a useCallback dependency changed).
    // Refs (svgRef, animationModeRef, etc.) have stable identity — no dep needed.
    const sequencerSetters = useMemo(() => ({
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
        setIsOddRound,
        setVolume,
        setCurrentMeasureIndex,
        setDisplayChordProgression,
        setNextLayer,
        setPreviewMelody,
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
        setReferenceScale, setStartMeasureIndex, setIsOddRound, setVolume,
        setCurrentMeasureIndex, setDisplayChordProgression, setNextLayer, setPreviewMelody]);

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



    const handleTimeSignatureChange = useCallback((type, value) => {
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
                logger.error('App', 'E006-TIMESIG-REGEN', e);
            }
        }
    }, [timeSignature, setTimeSignature, isPlayingContinuously, randomizeAll, playbackConfig.randomize]);


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

    // Shared props for both SheetMusic instances (primary + tab view).
    // containerHeight and visibleMeasures differ between instances and are passed inline.
    const sheetMusicCommonProps = useMemo(() => ({
        timeSignature,
        onTimeSignatureChange: handleTimeSignatureChange,
        bpm,
        onBpmChange: setBpm,
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
        onToggleSettings: toggleSheetMusicSettings,
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
        onMeasureNumberClick: handleMeasureNumberClick,
        onNoteEnharmonicToggle: handleNoteEnharmonicToggle,
    }), [timeSignature, handleTimeSignatureChange, bpm, setBpm, playbackConfig, setPlaybackConfig,
        numMeasures, musicalBlocks, setMusicalBlocks, setNumMeasures, scale.numAccidentals, scale.tonic,
        windowSize.width, randomizeMeasure, showSheetMusicSettings, toggleSheetMusicSettings,
        resetSettingsTimer, svgRef, isFullscreen, toggleFullscreen, headerPlayMode, setHeaderPlayMode,
        handleToggleInputTest, handlePlayMelody, handlePlayContinuously, isPlayingContinuously,
        showNotes, showChordLabels, showChordsOddRounds, showChordsEvenRounds,
        handleNoteClick, handleChordClick, handleEnharmonicToggle, handleMeasureNumberClick,
        handleNoteEnharmonicToggle]);

    return (
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
        <PlaybackStateProvider
            isPlaying={isPlaying}
            isPlayingContinuously={isPlayingContinuously}
            isOddRound={isOddRound}
            currentMeasureIndex={currentMeasureIndex}
            showNotes={showNotes}
            nextLayer={nextLayer}
            previewMelody={previewMelody}
            inputTestState={isInputTestMode ? inputTestState : null}
            inputTestSubMode={inputTestSubMode}
            setInputTestSubMode={handleSetInputTestSubMode}
        >
        <AnimationRefsProvider
            wipeTransitionRef={wipeTransitionRef}
            scrollTransitionRef={scrollTransitionRef}
            pendingScrollTransitionRef={pendingScrollTransitionRef}
            paginationFadeRef={paginationFadeRef}
            clearHighlightStateRef={clearHighlightStateRef}
            showNoteHighlightRef={showNoteHighlightRef}
            setCurrentMeasureIndex={setCurrentMeasureIndex}
            sequencerRef={sequencerRef}
            context={context}
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
                            {...sheetMusicCommonProps}
                            containerHeight={sheetHeight}
                            visibleMeasures={idealVisibleMeasures}
                            startMeasureIndex={startMeasureIndex}
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
                    idealVisibleMeasures={idealVisibleMeasures}
                    instruments={instruments}
                    manualInstruments={manualInstruments}
                    context={context}
                    scale={scale}
                    activeClef={activeClef}
                    handleInputTestNote={handleInputTestNote}
                    qwertyKeyboardActive={qwertyKeyboardActive}
                    showSheetMusicSettings={showSheetMusicSettings}
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
                />
            </div>
        </div >
        </AnimationRefsProvider>
        </PlaybackStateProvider>
        </MelodyProvider>
        </DisplaySettingsProvider>
        </InstrumentSettingsProvider>
        </PlaybackConfigProvider>
    );
};

export default App;
