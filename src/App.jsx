// App.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    getRelativeNoteName,
} from './theory/convertToDisplayNotes';
import { getProgressionLabel } from './theory/progressionDefinitions';
import './styles/App.css';
import './styles/AppLayout.css';
import { modulateMelody, transposeNoteBySemitones } from './theory/musicUtils';
import { respellToKeySignature, getNoteSemitone, stripOctave } from './theory/noteUtils';
import { getTranspositionSemitones, getTranspositionFifths, getTranspositionLabel } from './constants/transposingInstruments';
import Sequencer from './audio/Sequencer';
import playInstrumentPreview from './audio/playInstrumentPreview';
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
import useEditMode from './hooks/useEditMode';
import useRubato from './hooks/useRubato';
import { buildHarmonyTable } from './utils/harmonyTable';
import { resizeMelody } from './utils/melodySlice';
import { buildMergedRenderMelodies, buildFirstPassMergedMelodies, mergedBodyPassIndex, hasAnacrusis } from './utils/anacrusisRepeat';
import { TICKS_PER_WHOLE, secondsPerTick, secondsPerBeat } from './constants/timing';
import {
    DEFAULT_BPM, DEFAULT_TIME_SIG, DEFAULT_NUM_MEASURES,
    DEFAULT_SCALE_TONIC, DEFAULT_SCALE_MODE,
} from './constants/generatorDefaults';
import useAppLayout from './hooks/useAppLayout';
import useAppUIState from './hooks/useAppUIState';
import useAppHandlers from './hooks/useAppHandlers';
import logger from './utils/logger';
import { resolveLoadedSong } from './songs/resolveLoadedSong';

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
import { UniversalTransitionProvider } from './contexts/UniversalTransitionContext';
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
            // Visibility (the *Eye flags) defaults to ON, same as oddRounds — the per-staff eye
            // TOGGLE is the single control for hiding notes (Han 2026-06-15 V3). Previously these
            // defaulted to false, hard-coding an invisible even round that duplicated/contradicted
            // the existing visibility toggle, so a repeating song's even rounds rendered no notes.
            treble: 0, trebleEye: true,
            bass: 0, bassEye: true,
            percussion: 0, percussionEye: true,
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

    // The chord-selector X (chordDisplayMode==='off') fully disables chords: the
    // Sequencer reads this ref to skip chord scheduling (audio off), mirroring the
    // hidden labels (Han 2026-06-01). Kept in a ref so the audio loop sees it live.
    const chordsDisabledRef = useRef(chordDisplayMode === 'off');
    useEffect(() => { chordsDisabledRef.current = chordDisplayMode === 'off'; }, [chordDisplayMode]);

    const [customPercussionMapping, setCustomPercussionMapping, customPercussionMappingRef] = useRefState({});

    // Sheet Music Settings state (Lifted)
    const { showSheetMusicSettings, toggleSheetMusicSettings, resetSettingsTimer } = useSettingsOverlay();

    // Edit-mode flags (range / clef / colour / instrument) + their toggle/open/close
    // handlers + the settings catch-all effect now live in useEditMode (Han 2026-06-19,
    // ARCHITECTURE_AUDIT.md §4). The hook is called below, after handleStopAllPlayback /
    // showSheetMusicSettings are available — see "const { rangeEditMode, … } = useEditMode(…)".
    // Keyboard transposition (Han 2026-06-13): pitch-class offset 0-11 (0 = concert) that
    // relabels/resounds/re-highlights the playable keyboard. Independent of the staff
    // transposition (which transposes the NOTATION); this transposes the KEYS only. Set in
    // TRANSPOSITION mode (clefEditMode) via the keyboard's "concert C =" control.
    const [keyboardTranspose, setKeyboardTranspose] = useState(0);
    // Loaded-song title for the header (Han 2026-06-14): "Happy Birthday in G major". Set on song
    // load; cleared when the user generates a fresh exercise (un-pins the melody) — see effect below.
    const [loadedSongTitle, setLoadedSongTitle] = useState(null);

    // Input Test Mode — wired after usePlayback so handleStopAllPlayback / handlePlayContinuously are available

    const { isFullscreen, toggleFullscreen, isTouch } = useDeviceState();

    // BPM-driven fade duration: 2 quarter notes
    useEffect(() => {
        // 2 quarter-note beats in seconds (Han 2026-06-19): byte-identical to the
        // previous `2 * 60 / bpm`; via the timing SSOT secondsPerBeat(bpm) = 60/bpm.
        const dur = (2 * secondsPerBeat(bpm)).toFixed(3);
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

    // Omit makeInstrumentSetter from deps. It is stable (inline function defined once per render
    // but captures no external state besides instrument type). Including it would cause stale
    // callbacks after the first render — instead, we pass only the set* fn, which IS a true
    // external dep, and makeInstrumentSetter derives the stable wrapper. This avoids a closure race
    // where a callback generated with an old set* handler would try to invoke it after unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const setTrebleSettings = useCallback(makeInstrumentSetter(_setTrebleSettings, 'treble'), [_setTrebleSettings]);
    // Omit makeInstrumentSetter from deps (same race prevention as setTrebleSettings).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const setBassSettings = useCallback(makeInstrumentSetter(_setBassSettings, 'bass'), [_setBassSettings]);
    // Omit makeInstrumentSetter from deps (same race prevention as setTrebleSettings).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const setPercussionSettings = useCallback(makeInstrumentSetter(_setPercussionSettings, 'percussion'), [_setPercussionSettings]);
    // Omit makeInstrumentSetter from deps (same race prevention as setTrebleSettings).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const setMetronomeSettings = useCallback(makeInstrumentSetter(_setMetronomeSettings, 'metronome'), [_setMetronomeSettings]);
    // Omit makeInstrumentSetter from deps (same race prevention as setTrebleSettings).
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
    // setPlaybackConfig is a stable useState setter — identity never changes (React 18).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setGlobalMeasureOffset,
    } = melodySetters;

    const { handleNoteClick, handleChordClick, handleNoteEnharmonicToggle } = useNoteInteraction({
        context, instruments, customPercussionMappingRef, sequencerRef,
        trebleMelody, bassMelody, setTrebleMelody, setBassMelody,
    });

    // INSTRUMENT PREVIEW (Han #163 AC2): plays a short 2×-speed scale or drum pattern
    // when the user selects a new instrument in the carousel. scale + bpm + instruments
    // are all live values captured at call time (via refs for the closure). The callback is
    // memoized on stable refs so sheetMusicCommonProps doesn't re-create on every render.
    const scaleRef_preview = scaleRef;  // alias to be explicit in the memo deps comment below
    const handlePreviewInstrument = useCallback((staff, slug) => {
        // `scale` is captured via scaleRef so this callback never goes stale without needing
        // to be recreated. Same pattern as other sequencer callbacks that read scaleRef.current.
        playInstrumentPreview(staff, slug, instruments, scaleRef_preview.current, context, bpm);
    // instruments and context are stable references (created once, never replaced); bpm and
    // scaleRef_preview.current are read at call time from stable refs — no stale closure risk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instruments, context, bpm]);

    // Universal transition key (Han 2026-06-16). Bumped by `fireTransition` on each
    // transition TRIGGER; the sheet-music surface watches it (via UniversalTransitionContext)
    // and replays the 1.5s fly-in cascade. App owns the key as state and passes it DOWN through
    // the provider, so App — which is also the firer (e.g. handleLoadSong) — never consumes a
    // context it provides. Phase 1 wires only the song-load trigger.
    const [transitionKey, setTransitionKey] = useState(0);
    const fireTransition = useCallback(() => setTransitionKey(k => k + 1), []);

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
        // Pure parse/resolve half lives in resolveLoadedSong (ARCHITECTURE_AUDIT.md §4,
        // Han 2026-06-19). This wrapper only APPLIES the resolved values via setters.
        const { loaded, refScale, tonicToSet } =
            resolveLoadedSong(songDef, difficulty, useOriginalTonic, scale);
        // setTonic was previously called inside the useOriginalTonic branch before
        // loadSong; the resolver now reports it as tonicToSet (octave-suffixed). React
        // batches this with the other setters below, so commit order is unchanged.
        if (tonicToSet) setTonic(tonicToSet);

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
        // double-transpose loaded melodies away from their intended key. refScale
        // is computed synchronously by the resolver (see resolveLoadedSong) so
        // resolveVoice has it immediately if the user clicks "play continuous"
        // right after load — before setSelectedMode / setTonic commit.
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
        setLoadedSongTitle(songDef.title || null);   // header shows "<title> in <key>" until a fresh exercise
        // Also reset the cumulative history offset (Han 2026-06-14 bug): play start uses
        // `melodies.globalMeasureOffset` as the initial measure index. After generating a few
        // exercise blocks this offset is non-zero, so a freshly-loaded song would start mid-song
        // ("halfway"). Reset it so the song begins at measure 0 / its anacrusis.
        setGlobalMeasureOffset(0);
        // Keep the user's current bottom-view tab; loading a song should not
        // hijack the layout. Reported by Han 2026-05-22.
        // Replay the universal 1.5s cascade for the freshly-loaded melody. This setState
        // batches with the melody swaps above into ONE commit, so the runner sees the new
        // content live while its clone still holds the pre-load melody (the OLD that fades).
        fireTransition();
    }, [scale, setTonic, setSelectedMode, fireTransition,
        setTrebleSettings, setBassSettings, setPercussionSettings, setChordSettings,
        setTrebleMelody, setBassMelody, setPercussionMelody, setChordProgression,
        setReferenceMelody, setReferenceBassMelody, setReferenceScale,
        setTimeSignature, setNumMeasures, setBpm, setPlaybackConfig,
        setStartMeasureIndex, setGlobalMeasureOffset]);

    // Clear the loaded-song header label once the user generates a FRESH exercise melody — i.e. when
    // they un-pin the melody (randomize.melody === true). Loading a song pins it (melody=false); the
    // label persists through the song's own repeats/next-blocks, and a different song sets a new one.
    useEffect(() => {
        if (playbackConfig?.randomize?.melody === true) setLoadedSongTitle(null);
    }, [playbackConfig?.randomize?.melody]);

    // Universal transition on DIFFICULTY change (Han 2026-06-16). difficultyLevel feeds the
    // NEXT generation rather than swapping the on-screen melody, so the cascade re-flies the
    // current notes as a deliberate acknowledgement of the change — a chosen trigger, distinct
    // from a manual randomize/regenerate (which keeps its own animation). The mount guard skips
    // the initial value so we only fire on a genuine user change.
    const difficultyMountRef = useRef(true);
    useEffect(() => {
        if (difficultyMountRef.current) { difficultyMountRef.current = false; return; }
        fireTransition();
    }, [difficultyLevel, fireTransition]);

    // Universal transition on SCREEN/TAB change → cascade the SHEET when you land on it (Han
    // 2026-06-16, "sheet only"). The sheet is toggled via display:none (not unmounted), so we
    // fire only when the new tab actually shows it — arriving at the sheet view re-flies its
    // content. Firing while it's hidden would animate an invisible clone (harmless but wasteful),
    // so gate on the sheet-music tab. Mount-guarded so the initial tab doesn't fire on load.
    const tabMountRef = useRef(true);
    useEffect(() => {
        if (tabMountRef.current) { tabMountRef.current = false; return; }
        if (activeTab === 'sheet-music') fireTransition();
    }, [activeTab, fireTransition]);

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
        // onPlaybackStartRef is a ref — stable identity; .current is read at call-time. Adding it
    // would re-memoize the callback on every render, defeating the purpose of useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    onPlaybackStart: useCallback(() => onPlaybackStartRef.current(), [])
    });

    // Skip-back/forward and measure-number-click navigation. Placed after usePlayback
    // so isPlayingContinuously/handleStopAllPlayback are initialized.
    const { handleSkipBack, handleSkipForward, handleMeasureNumberClick } = usePlaybackNavigation({
        animationMode, musicalBlocks, startMeasureIndex, setStartMeasureIndex, numMeasures,
        navigateHistory, setScale, _setTonic,
        isPlayingContinuously, isPlayingMelody, handleStopAllPlayback, startSequencer,
        setIsPlayingMelody, setIsPlayingContinuously, melodies,
        // So a loaded song's pin/settings carry into the next generated block (bug 2).
        randomizeConfig: playbackConfig.randomize,
    });

    // Rubato engine (refs + EWMA estimator + accompaniment scheduler) extracted to
    // useRubato (ARCHITECTURE_AUDIT.md §4, Han 2026-06-19). The entangled consumers —
    // the Play-button interception below, the onNoteCorrect rubato branch, the two
    // ref-population effects, and onToggleRubato — stay in App and read these exports.
    const {
        rubatoEngageRef,
        rubatoEventHistoryRef,
        rubatoInputStateRefForwarderRef,
        rubatoScrollAnchorRef,
        RUBATO_HISTORY_LIMIT,
        scheduleRubatoAccompaniment,
    } = useRubato({ context, instruments, bpmRef, melodiesRef, customPercussionMappingRef });

    const handlePlayMelody = useCallback(() => {
        if (isRubatoRef.current && rubatoEngageRef.current) {
            rubatoEngageRef.current('once');
            setHeaderPlayMode('once');
            return;
        }
        handlePlayMelodyLogic();
        setHeaderPlayMode('once');
    // rubatoEngageRef is a ref (stable identity); setHeaderPlayMode is a stable useState setter. Neither can go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handlePlayMelodyLogic, isRubatoRef]);

    const handlePlayContinuously = useCallback(() => {
        if (isRubatoRef.current && rubatoEngageRef.current) {
            rubatoEngageRef.current('continuous');
            setHeaderPlayMode('continuous');
            return;
        }
        handlePlayContinuouslyLogic();
        setHeaderPlayMode('continuous');
    // rubatoEngageRef is a ref (stable identity); setHeaderPlayMode is a stable useState setter. Neither can go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handlePlayContinuouslyLogic, isRubatoRef]);

    // Edit-mode flags + toggle/open/close handlers + the settings catch-all effect
    // (Han 2026-06-19, ARCHITECTURE_AUDIT.md §4). Behaviour-preserving extraction of the
    // four in-SVG staff-overlay edit modes (range/clef/colour/instrument). Called here —
    // not at the top of App — because the handlers need handleStopAllPlayback /
    // showSheetMusicSettings / toggleSheetMusicSettings, which are only available now.
    const {
        rangeEditMode,
        clefEditMode,
        colorEditMode,
        instrumentEditMode,
        playbackEditMode,
        generationEditMode,
        generationAdvancedEditMode,
        setRangeEditMode,
        handleToggleRangeEdit,
        handleToggleClefEdit,
        handleToggleColorEdit,
        handleToggleInstrumentEdit,
        handleTogglePlaybackEdit,
        handleToggleGenerationEdit,
        handleToggleGenerationAdvancedEdit,
        handleToggleSettings,
        handleCloseRangeEdit,
        handleCloseClefEdit,
        handleOpenClefEdit,
    } = useEditMode({ handleStopAllPlayback, showSheetMusicSettings, toggleSheetMusicSettings });

    const handlePlayRepeat = useCallback(() => {
        if (isRubatoRef.current && rubatoEngageRef.current) {
            rubatoEngageRef.current('repeat');
            setHeaderPlayMode('repeat');
            return;
        }
        handlePlayRepeatLogic();
        setHeaderPlayMode('repeat');
    // rubatoEngageRef is a ref (stable identity); setHeaderPlayMode is a stable useState setter. Neither can go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handlePlayRepeatLogic, isRubatoRef]);

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
            // ms per tick = secondsPerTick(bpm) * 1000, byte-identical to the prior
            // `5000 / bpm` via the timing SSOT (Han 2026-06-19).
            const durationMs = (durationTicks || 12) * (secondsPerTick(bpmRef.current) * 1000);
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
        // All *Ref values (bpmRef, isRubatoRef, nmRef, tsRef, rubatoEventHistoryRef,
        // rubatoInputStateRefForwarderRef, rubatoScrollAnchorRef) are refs — stable identities.
        // RUBATO_HISTORY_LIMIT is a module-level constant; it never changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [instruments.treble, context, scheduleRubatoAccompaniment]),
        onNoteWrong: useCallback((note) => {
            instruments.treble?.stop({ note });
        }, [instruments.treble]),
    });

    const handleSetInputTestSubMode = useCallback((mode) => {
        setInputTestSubMode(mode);
        // Keyboard is only active in 'note' (Piano) mode
        setQwertyKeyboardActive(mode === 'note');
    // setQwertyKeyboardActive is a stable useState setter — identity never changes (React 18).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // rubatoEngageRef is a ref — stable identity; its .current is mutated here intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleToggleInputTest, handleSetInputTestSubMode, isInputTestModeRef]);

    // Forward inputTestStateRef so onNoteCorrect (defined earlier, before
    // useInputTest's destructure ran) can reach the latest input-test state.
    useEffect(() => {
        rubatoInputStateRefForwarderRef.current = inputTestStateRef;
    // rubatoInputStateRefForwarderRef is a ref — stable identity; .current is mutated here intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // onPlaybackStartRef is a ref — stable identity; .current is mutated here intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // setRangeEditMode is a stable useState setter — identity never changes (React 18).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Omit numMeasures from deps. It is read inside setBlockMeasureStart(fn), so changes
    // to numMeasures trigger a new callback (via the closure captured in that state updater),
    // but we do NOT want the effect to re-run if numMeasures changes. Only historyIndex
    // changes should update blockMeasureStart. If numMeasures changes, the Sequencer owns
    // melody resizing; playback navigation (history) should not retroactively shift measures.
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
    // Omit isPlaying from deps (only control flow, not a dependency for the resize calculation).
    // Also omit timeSignature: if time sig changes, numMeasures likely stays the same, but
    // if BOTH change simultaneously, the Sequencer (which owns playback melody state) will
    // trigger a regeneration at the next series boundary, not here. This effect only handles
    // non-playing resizes; the Sequencer is the source of truth during playback.
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
    // isModulationEnabled, isPlayingContinuously, playbackConfig, referenceBassMelody,
    // referenceMelody, referenceScale, setBassMelody, setTrebleMelody are intentionally omitted:
    // the effect fires ONLY on scale changes; reading reference melodies as current values
    // avoids double-transposition. Setter identity is stable (React 18 useState guarantee).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // animationModeRef, clearHighlightStateRef, scrollTransitionRef, wipeTransitionRef, svgRef
    // are all refs — stable identities; .current is read inside closures at call-time.
    // setIsPlayingContinuously, setIsPlayingMelody, setIsPlayingScale are stable useState setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                chordsDisabledRef,
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
    // All *Ref values are refs — stable identities; excluded from deps intentionally.
    // instruments/percussionScale/randomizeAll/sequencerSetters are excluded because Sequencer
    // is ONLY re-created on context/instruments init. Mid-session changes are handled by the
    // keep-fresh effect below; recreating on those would cause audio glitches via stop+restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Representative chord for the KEYBOARD's 'chords' colouring with no playback (Han 2026-06-14):
    // the tonic chord if it is the LAST chord of the progression, else the FIRST — same rule the
    // sheet's in-staff setters use (SheetMusic `pausedActiveChord`), so all untimed surfaces match.
    const keyboardActiveChord = useMemo(() => {
        const prog = displayChordProgression ?? chordProgression;
        // ChordProgression stores Chord objects in .chords; a Melody-style progression stores them
        // in .displayNotes (what getChordsWithSlashes reads). Both have { root, notes }.
        const list = (prog?.chords?.length ? prog.chords : prog?.displayNotes) || [];
        const chords = list.filter(c => c?.notes?.length && c?.root);
        if (!chords.length) return null;
        const last = chords[chords.length - 1];
        return getNoteSemitone(last.root) === getNoteSemitone(scale.tonic) ? last : chords[0];
    }, [displayChordProgression, chordProgression, scale.tonic]);


    // GLOBAL transposition (Han 2026-06-09, item 5): when BOTH staves carry the SAME transposition
    // (key + octave) and it isn't concert, the whole piece is treated as transposed — the displayed
    // KEY/NAMES move to the written domain (concert B♭ denoted as C). Per-staff note positions + key
    // signatures already render written; this drives the header key, the "(X instrument)" line, and
    // (downstream) the chord-label + lyrics name adjustment. null = staff-level / concert.
    const globalTransposition = useMemo(() => {
        const tk = trebleSettings?.transpositionKey || 'C';
        const bk = bassSettings?.transpositionKey || 'C';
        const to = trebleSettings?.transpositionOctave || 0;
        const bo = bassSettings?.transpositionOctave || 0;
        if (tk !== bk || to !== bo) return null;                 // staves differ → staff-level only
        const semis = getTranspositionSemitones(tk) + 12 * to;
        if (semis === 0) return null;                            // concert
        return { semis, key: tk, label: getTranspositionLabel(tk) };
    }, [trebleSettings, bassSettings]);

    // Written tonic shown in the header when global: concert tonic transposed + respelled to the
    // written key signature (reuses respellToKeySignature). Octave stripped for the label.
    const displayTonic = useMemo(() => {
        if (!globalTransposition) return scale.tonic;
        const writtenAcc = (scale.numAccidentals || 0) + getTranspositionFifths(globalTransposition.key);
        const raw = transposeNoteBySemitones(`${scale.tonic}4`, globalTransposition.semis);
        return stripOctave(respellToKeySignature(raw, writtenAcc));
    }, [globalTransposition, scale.tonic, scale.numAccidentals]);

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
    // measureLen (ticks/measure) for the active meter — shared by anacrusis detection AND the
    // looping body-merge below so both agree on what "measure 0" is.
    const anacrusisMeasureLen = (TICKS_PER_WHOLE * timeSignature[0]) / timeSignature[1];

    // Anacrusis detection (Han 2026-05-28; unified 2026-06-15): when the loaded melody's first note
    // sits AFTER tick 0 of measure 0, that measure is a pickup. We treat its global index as the
    // anacrusis marker so BarlinesLayer can suppress the measure-number label. Detection is the
    // SHARED `hasAnacrusis(melody, measureLen)` predicate (src/utils/anacrusisRepeat.js) — the SAME
    // one the Sequencer/render body-merge gates on — so the label-suppression and the merge can never
    // disagree about whether a song is a pickup (arch §34/§40). Re-runs whenever trebleMelody flips
    // identity, e.g. after song-load or after a regen that produced a non-anacrusis melody.
    const anacrusisMeasureIndex = useMemo(() => {
        return hasAnacrusis(trebleMelody, anacrusisMeasureLen) ? 0 : null;
    }, [trebleMelody, anacrusisMeasureLen]);

    // ── Looping body-merge for RENDER (arch §40 render-merge, Han 2026-06-15) ───────────────────
    // During LOOPING playback (repeat OR continuous — i.e. playing and NOT once-mode) of a pickup
    // song, the Sequencer loops the BODY-MERGED melody (pickup relocated to the end of the last body
    // bar; body = bodyMeasures bars) and keys its highlight schedule off that merged, rebased body.
    // The sheet must render the SAME representation, otherwise every body note's highlight resolves
    // one measure below where it is drawn (the old one-bar highlight lag) and the next-loop pickup is
    // never visible. We compute the merged body HERE and feed it to MelodyProvider so SheetMusic —
    // which just renders whatever the context gives it — automatically shows the merged body. When
    // stopped or in once-mode this is null → the original padded melodies render unchanged. For a
    // non-anacrusis melody buildMergedRenderMelodies returns null (a no-op), so generated/continuous
    // rounds after series 1 (which carry no pickup) are untouched.
    const isLoopingPlayback = isPlaying && headerPlayMode !== 'once';
    const mergedRenderMelodies = useMemo(() => {
        if (!isLoopingPlayback) return null;
        const sources = { treble: trebleMelody, bass: bassMelody, percussion: melodies.percussion, chordProgression };
        // ── Phase 3: leading pickup bar on the FIRST pass (arch §40, Han 2026-06-17) ──────────────
        // The audio sounds the pickup ONCE as a lead-in before the looping body. On the FIRST visual
        // pass we draw that pickup as an EXTRA LEADING BAR (original m0) glued to the left of the body;
        // every later pass shows just the merged body (the end-pickup of each body leads into the
        // next loop). The body-merge advances startMeasureIndex by bodyMeasures per pass from the
        // session origin (0 for a loaded song), so the SESSION-GLOBAL pass index is
        // startMeasureIndex / bodyMeasures — independent of the per-block blockPlayStart, because the
        // intro lead-in plays ONCE for the whole session (not per repeat block). We need bodyMeasures
        // up front to compute the pass index, so probe the plain merge once (cheap, pure) for it.
        const probe = buildMergedRenderMelodies(sources, anacrusisMeasureLen);
        if (!probe) return null;
        const passIndex = mergedBodyPassIndex({ startMeasureIndex, originMeasureIndex: 0, bodyMeasures: probe.bodyMeasures });
        if (passIndex === 0) {
            // First pass: pickup bar + body. firstPass.bodyMeasures = bodyMeasures + 1, but we render it
            // through the ORIGINAL anacrusis path (mergedBodyMeasures stays null below), so the existing
            // pickup-measure suppression + 1..N numbering apply — no new barline code (§6d).
            const firstPass = buildFirstPassMergedMelodies(sources, anacrusisMeasureLen);
            if (firstPass) return { ...firstPass, isFirstPass: true };
        }
        return probe;
    }, [isLoopingPlayback, trebleMelody, bassMelody, melodies.percussion, chordProgression, anacrusisMeasureLen, startMeasureIndex]);

    // ── First-pass render start-index alignment (arch §40 Phase 3, §40a highlight invariant) ──────
    // On the FIRST pass the rendered melody has an EXTRA leading pickup bar (local bar 0), so its body
    // bars sit one bar to the RIGHT of where the highlight SCHEDULE expects them: the Sequencer plays
    // the pickup ONCE (a one-shot lead-in, NOT in scheduledNotes) and then numbers the looping body
    // from globalMeasureIndex 0. SheetMusic derives each note's data-measure-index as
    // startMeasureIndex + floorBar(offset); the highlight matches that against the schedule's
    // measureIndex (= globalMeasureIndex). To keep the body aligned (§40a: render and schedule MUST
    // view the same measure indices) we hand SheetMusic a startMeasureIndex shifted back by ONE bar on
    // the first pass — so the pickup bar lands on (startMeasureIndex − 1) (no schedule entry → never
    // highlighted, correct) and the body bars realign to 0..N. On pass ≥2 (merged body, no pickup bar)
    // the real startMeasureIndex is used unchanged.
    const renderStartMeasureIndex = mergedRenderMelodies?.isFirstPass ? startMeasureIndex - 1 : startMeasureIndex;

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
        // On the FIRST looping pass we render the pickup bar + body through the ORIGINAL anacrusis
        // path: anacrusisMeasureIndex=0 keeps the pickup-measure label suppression + the -1 number
        // shift, so the pickup bar at m0 is unlabeled and the body bars number 1..N (Phase 3). On
        // pass ≥2 there is no pickup bar (it was relocated into the body's last bar), so the merged-
        // body numbering takes over and anacrusisMeasureIndex must NOT fire (the merged-body branch in
        // BarlinesLayer already gates the suppression on mergedBodyMeasures==null).
        anacrusisMeasureIndex: mergedRenderMelodies?.isFirstPass ? 0 : anacrusisMeasureIndex,
        // When the looping body-merge is active the sheet renders the merged BODY (no separate pickup
        // measure), so BarlinesLayer must number plainly from bar 1 and compute the repeat-pass count
        // from bodyMeasures, not the padded numMeasures (arch §40 numbering). null when not merging →
        // BarlinesLayer keeps its original anacrusis-aware numbering. On the FIRST pass (pickup bar
        // shown) we ALSO pass null so the original anacrusis numbering applies — the merged-body
        // suffix only kicks in from pass ≥2.
        mergedBodyMeasures: (mergedRenderMelodies && !mergedRenderMelodies.isFirstPass) ? mergedRenderMelodies.bodyMeasures : null,
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
        clefEditMode: clefEditMode,
        colorEditMode: colorEditMode,
        instrumentEditMode: instrumentEditMode,
        playbackEditMode: playbackEditMode,
        generationEditMode: generationEditMode,
        generationAdvancedEditMode: generationAdvancedEditMode,
        onToggleSettings: toggleSheetMusicSettings,
        onCloseRangeEdit: handleCloseRangeEdit,
        onCloseClefEdit: handleCloseClefEdit,
        onOpenClefEdit: handleOpenClefEdit,
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
        // Live per-round note/chord visibility during ANY LOOPING playback (continuous OR a
        // repeated SONG), gated identically to the merged-body (isLoopingPlayback = isPlaying &&
        // headerPlayMode !== 'once'). Songs play via handlePlayRepeat → isPlayingMelody (NOT
        // continuous), so keying these on isPlayingContinuously hid the live odd/even visibility for
        // songs while it worked for generated melodies (Han #4, 2026-06-17). When stopped we keep
        // the static oddRounds preview.
        viewMode: (isPlaying && headerPlayMode !== 'once')
            ? (showNotes ? 'melody' : 'repeat')
            : (playbackConfig.oddRounds?.notes ? 'melody' : 'repeat'),
        showChords: (isPlaying && headerPlayMode !== 'once') ? showChordLabels : (showChordsOddRounds || showChordsEvenRounds),
        onNoteClick: handleNoteClick,
        onChordClick: handleChordClick,
        onEnharmonicToggle: handleEnharmonicToggle,
        onMeasureNumberClick: null,
        onNoteEnharmonicToggle: handleNoteEnharmonicToggle,
        // INSTRUMENT PREVIEW (Han #163): fires on every instrument carousel select.
        onPreviewInstrument: handlePreviewInstrument,
    // rubatoEventHistoryRef and rubatoScrollAnchorRef are refs — stable identities; .current
    // written inside closures at call-time only. Adding them re-creates this memo on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [timeSignature, handleTimeSignatureChange, bpm, setBpm, isRubato, setIsRubato,
        anacrusisMeasureIndex, mergedRenderMelodies,
        playbackConfig, setPlaybackConfig,
        numMeasures, musicalBlocks, setMusicalBlocks, setNumMeasures, scale.numAccidentals, scale.tonic,
        windowSize.width, randomizeMeasure, showSheetMusicSettings, rangeEditMode, clefEditMode, colorEditMode, instrumentEditMode,
        playbackEditMode, generationEditMode, generationAdvancedEditMode, toggleSheetMusicSettings,
        handleCloseRangeEdit, handleCloseClefEdit, handleOpenClefEdit,
        resetSettingsTimer, svgRef, isFullscreen, toggleFullscreen, headerPlayMode, setHeaderPlayMode,
        handleToggleInputTest, handlePlayMelody, handlePlayContinuously, isPlayingContinuously, isPlaying,
        showNotes, showChordLabels, showChordsOddRounds, showChordsEvenRounds,
        handleNoteClick, handleChordClick, handleEnharmonicToggle, handleMeasureNumberClick,
        handleNoteEnharmonicToggle, handlePreviewInstrument]);

    return (
        <ProfileProvider>
        <PlaybackConfigProvider value={playbackConfigCtx}>
        <InstrumentSettingsProvider value={instrumentSettingsCtx}>
        <DisplaySettingsProvider value={displaySettingsCtx}>
        <MelodyProvider
            treble={mergedRenderMelodies ? mergedRenderMelodies.treble : melodies.treble}
            bass={mergedRenderMelodies ? mergedRenderMelodies.bass : melodies.bass}
            percussion={mergedRenderMelodies ? mergedRenderMelodies.percussion : melodies.percussion}
            metronome={melodies.metronome}
            chordProgression={mergedRenderMelodies ? mergedRenderMelodies.chordProgression : chordProgression}
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
        <UniversalTransitionProvider transitionKey={transitionKey}>
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
                    displayTonic={displayTonic}
                    globalInstLabel={globalTransposition ? `${globalTransposition.label} instrument` : null}
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
                    onOpenKanban={() => window.open('http://localhost:5174', '_blank')}
                    onScaleClick={handleScaleClick}
                    isScalePlaying={isScalePlaying}
                    progressionLabel={headerProgressionLabel}
                    songTitle={loadedSongTitle}
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
                    onOpenSettings={handleToggleSettings}
                    onOpenRange={handleToggleRangeEdit}
                    onOpenClef={handleToggleClefEdit}
                    onOpenColor={handleToggleColorEdit}
                    onOpenInstrument={handleToggleInstrumentEdit}
                    onOpenPlayback={handleTogglePlaybackEdit}
                    onOpenGeneration={handleToggleGenerationEdit}
                    onOpenGenerationAdvanced={handleToggleGenerationAdvancedEdit}
                    rangeEditMode={rangeEditMode}
                    clefEditMode={clefEditMode}
                    colorEditMode={colorEditMode}
                    instrumentEditMode={instrumentEditMode}
                    playbackEditMode={playbackEditMode}
                    generationEditMode={generationEditMode}
                    generationAdvancedEditMode={generationAdvancedEditMode}
                    showSheetMusicSettings={showSheetMusicSettings}
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
                    <ErrorBoundary boundary="sheet-music">
                        <SheetMusic
                            {...sheetMusicCommonProps}
                            containerHeight={sheetHeight}
                            visibleMeasures={effectiveVisibleMeasures}
                            startMeasureIndex={renderStartMeasureIndex}
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
                    startMeasureIndex={renderStartMeasureIndex}
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
                    clefEditMode={clefEditMode}
                    keyboardTranspose={keyboardTranspose}
                    setKeyboardTranspose={setKeyboardTranspose}
                    keyboardActiveChord={keyboardActiveChord}
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
        </UniversalTransitionProvider>
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
