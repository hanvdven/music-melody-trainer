// App.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    getRelativeNoteName,
} from './theory/convertToDisplayNotes';
import { getProgressionLabel } from './theory/progressionDefinitions';
import './styles/App.css';
import './styles/AppLayout.css';
import { modulateMelody, transposeNoteBySemitones } from './theory/musicUtils';
import { respellToKeySignature, getNoteSemitone, stripOctave, representativeChord } from './theory/noteUtils';
import { getTranspositionSemitones, getTranspositionFifths, getTranspositionLabel } from './constants/transposingInstruments';
import Sequencer from './audio/Sequencer';
import playInstrumentPreview from './audio/playInstrumentPreview';
import Melody from './model/Melody';
import ChordProgression from './model/ChordProgression';
import SONGS from './songs/songIndex.js';
import ErrorBoundary from './components/error/ErrorBoundary';
import Scale from './model/Scale';
import SheetMusic from './components/sheet-music/SheetMusic';
import { KIT_NOTE_MAPPINGS } from './audio/drumKits';
import AppHeader from './components/layout/AppHeader';
import DiscoBackground from './components/layout/DiscoBackground';
import useCharacterEditor from './components/character/useCharacterEditor';
import useBestiaryEditor from './components/character/useBestiaryEditor';
import useRpgLevelState from './hooks/useRpgLevelState';
import CharacterAvatarPanel from './components/character/CharacterAvatarPanel';
import CharacterOptionsPanel from './components/character/CharacterOptionsPanel';
import { BestiaryTopPanel, BestiaryBottomPanel } from './components/character/BestiaryPanels';
import RpgLevelPanel from './components/character/RpgLevelPanel';
import { StatsTopPanel, StatsBottomPanel } from './components/character/CharacterStatsPanels';
import { CHARACTER_CATEGORIES, catByKeyLabel } from './components/character/characterEditorShared';
import { CATEGORIES as AVATAR_CATEGORIES } from './model/characterAssets';
import AvatarSubHeader from './components/layout/AvatarSubHeader';
import LevelSplash from './components/levels/LevelSplash';
import TwoHandedKeyboardPanel from './components/levels/TwoHandedKeyboardPanel';
import DialogueBox from './components/character/DialogueBox';
import { SLIME_CROP, SLIME_FRAME, SLIME_COLORS, WIZARD_URL, WIZARD_CROP, WIZARD_FRAME } from './model/enemyAssets';
import { findCreatureByName } from './model/bestiaryAssets';
import useConversationInstruments from './hooks/useConversationInstruments';
import useConversationDialogue from './hooks/useConversationDialogue';
import useWorldAmbientMusic from './hooks/useWorldAmbientMusic';
import { WIZARD_VICTORY_LINES, NPC_GREETING_LINES, SLIME_DEFEAT_LINES } from './model/conversationContent';
import LevelStartSplash from './components/levels/LevelStartSplash';
import LevelPausePopup from './components/levels/LevelPausePopup';
import SubHeader from './components/layout/SubHeader';

// Hooks
import useRefState from './hooks/useRefState';
import useWindowSize from './hooks/useWindowSize';
import useInstruments from './hooks/useInstruments';
import useMelodyState from './hooks/useMelodyState';
import useLevel from './hooks/useLevel';
import useMidiInput from './hooks/useMidiInput';
import playSound from './audio/playSound';
import playMelodies from './audio/playMelodies';
import { createMelodicInstrument } from './audio/localInstruments';
import buildTimpaniPattern from './utils/timpaniPattern';
import { LEVEL_TIMPANI_SLOT, LEVEL_CELLO_SLOT } from './constants/melodyInstances';
import useLevelBackingStream from './hooks/useLevelBackingStream';
import useTwoHandedBass from './hooks/useTwoHandedBass';
import useLevelTrebleStream from './hooks/useLevelTrebleStream';
import useLevelMixedStream from './hooks/useLevelMixedStream';
import useLevelKeyModulationStream from './hooks/useLevelKeyModulationStream';
import { VOL_STEPS } from './components/sheet-music/overlays/SettingsOverlay';
import { DEFAULT_RPG_FX_VOLUME, DEFAULT_RPG_MUSIC_VOLUME, rpgVolumeMultiplier } from './audio/dynamics';
import { LEVELS } from './levels/levels';
import usePlayback from './hooks/usePlayback';
import useInputTest from './hooks/useInputTest';
import useDeviceState from './hooks/useDeviceState';
import useNoteInteraction from './hooks/useNoteInteraction';
import usePlaybackNavigation from './hooks/usePlaybackNavigation';
import useScaleManagement from './hooks/useScaleManagement';
import useDifficultySettings from './hooks/useDifficultySettings';
import useEditMode from './hooks/useEditMode';
import useRubato from './hooks/useRubato';
import { buildHarmonyTable } from './utils/harmonyTable';
import { resizeMelody } from './utils/melodySlice';
import { buildMergedRenderMelodies, buildFirstPassMergedMelodies, mergedBodyPassIndex, hasAnacrusis } from './utils/anacrusisRepeat';
import { TICKS_PER_WHOLE, secondsPerTick, secondsPerBeat, LEVEL_LEAD_IN_BARS } from './constants/timing';
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
import { useProfile } from './contexts/ProfileContext';
import SessionSummaryCard from './components/profile/SessionSummaryCard';
import { applyExerciseConfig, configFromAxes, EXERCISES } from './exercises/exerciseIndex';
import { gradedOutcome } from './utils/gamification';
import { stepAdaptiveTargets } from './utils/adaptiveDifficulty';
import { calcHarmonicDifficulty } from './utils/difficultyCalculator';
import { calcTrebleDifficulty, MELODY_DIFFICULTY_RANGE } from './utils/melodyDifficultyTable';
import { HARMONY_DIFFICULTY_RANGE } from './utils/harmonyTable';
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
        // #992 (Han: 3 new Playback Settings setters): independent RPG audio/visual gain knobs, same
        // "loose UI setting on playbackConfig" shape as repsPerMelody above (see docs/architecture.md
        // for the full multiplier-semantics writeup). Defaults are DEFAULT_RPG_FX_VOLUME/
        // DEFAULT_RPG_MUSIC_VOLUME (audio/dynamics.js, mp/mf) so the day-one multiplier is exactly 1.0
        // on every existing path — see rpgVolumeMultiplier for why that must hold.
        rpgFxVolume: DEFAULT_RPG_FX_VOLUME,
        rpgMusicVolume: DEFAULT_RPG_MUSIC_VOLUME,
        rpgVisibility: 100,
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
        appFont, setAppFont,
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

    // Gamification (#134): ProfileProvider now wraps <App/> in main.jsx, so the
    // event sink is consumed here. recordEvent/beginSession/endSession are
    // memoised with stable deps in ProfileContext. recordEventRef lets
    // sequencerSetters (memoised, long-lived) emit without adding a dep.
    const { recordEvent, beginSession, endSession, recordExerciseProgress } = useProfile();
    const recordEventRef = useRef(recordEvent);
    useEffect(() => { recordEventRef.current = recordEvent; }, [recordEvent]);
    // #268: persistent per-exercise counters — written from the score-event
    // callback, so both live in refs (state would go stale there).
    const recordExerciseProgressRef = useRef(recordExerciseProgress);
    useEffect(() => { recordExerciseProgressRef.current = recordExerciseProgress; }, [recordExerciseProgress]);
    const activeExerciseIdRef = useRef(null);
    // Post-session summary card data (#131); null = hidden.
    const [sessionSummary, setSessionSummary] = useState(null);

    // Exercise RUN (#267): a bounded run of N melodies started by START.
    // State drives the SubHeader "melody N/10" chip; the ref is the source the
    // score-event callback reads/writes (it fires from input-test internals —
    // reading state there would go stale). endExerciseRunRef is populated after
    // useInputTest mounts (it needs handleToggleInputTest, which doesn't exist
    // yet at this point in the component body).
    const EXERCISE_RUN_TARGET = 10; // fixed 10 per the original #245 spec (A1 in the #267 plan)
    const [exerciseRun, setExerciseRun] = useState(null);
    const exerciseRunRef = useRef(null);
    const endExerciseRunRef = useRef(null);

    const [customPercussionMapping, setCustomPercussionMapping, customPercussionMappingRef] = useRefState({});

    // Sheet Music Settings state (Lifted)

    // Edit-mode flags (range / clef / colour / instrument) + their toggle/open/close
    // handlers + the settings catch-all effect now live in useEditMode (Han 2026-06-19,
    // ARCHITECTURE_AUDIT.md §4). The hook is called below, after handleStopAllPlayback /
    // showSheetMusicSettings are available — see "const { rangeEditMode, … } = useEditMode(…)".
    // Keyboard transposition (Han 2026-06-13): pitch-class offset 0-11 (0 = concert) that
    // relabels/resounds/re-highlights the playable keyboard. Independent of the staff
    // transposition (which transposes the NOTATION); this transposes the KEYS only. Set in
    // TRANSPOSITION mode (clefEditMode) via the keyboard's "concert C =" control.
    const [keyboardTranspose, setKeyboardTranspose] = useState(0);
    // #667 (Han 2026-08-03): the character-creator popup is gone — avatar-context now REPLACES the
    // sheet-music area (top) and bottom panel (bottom) in-place. null = normal practice view; else one of
    // 'character' | 'stats' | 'equipment' | 'bestiary' (the 4 avatar-context screens, see AvatarSubHeader).
    const [characterScreen, setCharacterScreen] = useState(null);
    const characterEditor = useCharacterEditor();
    const bestiaryEditor = useBestiaryEditor();
    const rpgLevel = useRpgLevelState();
    // #924 (Han 2026-08-12, "wereldlevel: speel op de achtergrond zachtjes random generated muziek... +
    // 3 lagen bird song"): only runs while the open-world RPG-level tab is active.
    // #992 — reads configRef.current directly (not the `playbackConfig` state var, which isn't declared
    // until further down this component) — configRef.current is kept in perfect sync with playbackConfig
    // by setPlaybackConfig (below) on every update, and this whole component re-renders on every such
    // update anyway, so this always reflects the latest value. Same ONE combined knob as
    // rpgMusicMultiplier further down (App.jsx's own resolveLevelVolume call sites) — see that comment
    // for the full "why one knob over two unrelated paths" rationale.
    useWorldAmbientMusic({
        active: characterScreen === 'rpg-level', context,
        musicVolumeMultiplier: rpgVolumeMultiplier(configRef.current.rpgMusicVolume, DEFAULT_RPG_MUSIC_VOLUME),
    });
    const [showLevelPicker, setShowLevelPicker] = useState(false);   // #661: level-start splash (tanh carousel)
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

    const { instruments, loadedSlug, manualInstruments, settings: instrumentSettingsHooks, setVolume, setChorusStrength, setTremoloStrength } = useInstruments(context);

    useEffect(() => {
        instrumentsRef.current = instruments;
    }, [instruments]);

    // #141 round 24 (Han: "indien nodig, voeg een app-wide laadscherm toe"): the app-wide boot splash
    // (index.html's static `#boot-splash`) stays visible until this flips true, so the very first thing
    // a user can interact with already has working audio — no silent playback on first note-click while
    // smplr is still fetching samples in the background. `instrument.load` is smplr's own Promise,
    // resolving once ALL of that instrument's sample buffers have loaded (see node_modules/smplr's own
    // type defs — `readonly load: Promise<this>`); `instruments.*` become non-null the moment
    // useInstruments CONSTRUCTS them, well before their samples finish loading, so gating on `.load` too
    // is required — gating on non-null alone would hide the splash too early.
    //
    // #141 round 25 (Han: "kun je in laadscherm weergeven 'wat je laadt'? audio-context/sprites/level"):
    // `spritesReady` tracks `window`'s own `load` event — fires once every resource the initial page
    // requested (scripts, styles, and every <img>/CSS-background image referenced by them) has finished
    // loading, a real, honest signal for "assets/sprites," not a fabricated progress bar. "level" is
    // DELIBERATELY not part of this boot-time status: the RPG level's own sprite sheets and runtime-
    // generated normal maps only start loading once a user actually opens that tab (RpgLevelPanel's own
    // `!runtimeTextures` DOM fallback already covers that moment locally — see §150) — blocking the WHOLE
    // app's boot splash on assets nobody may ever request would be dishonest, not helpful.
    const [audioReady, setAudioReady] = useState(false);
    const [spritesReady, setSpritesReady] = useState(document.readyState === 'complete');
    // #859 (Han 2026-08-11, "ik wacht soms 30s, zou niet mogen"): a hung network fetch (a stalled
    // CDN request, antivirus intercepting every local request, ...) used to block this boot gate
    // FOREVER — no timeout on either half of the `audioReady && spritesReady` condition. This
    // BOOT_GATE_TIMEOUT_MS forces the splash open regardless after 10s so the app is at worst
    // usable-but-silent instead of stuck; the REAL load (instrument .load promises / window `load`)
    // is never cancelled, so audio/sprites still finish whenever they actually do — only the splash
    // stops waiting on them.
    const BOOT_GATE_TIMEOUT_MS = 10000;
    useEffect(() => {
        if (spritesReady) return undefined;
        const onLoad = () => setSpritesReady(true);
        window.addEventListener('load', onLoad);
        const timer = setTimeout(() => {
            if (debugMode) logger.warn('App', 'boot-splash sprites-ready timeout (10s) — continuing without waiting further');
            setSpritesReady(true);
        }, BOOT_GATE_TIMEOUT_MS);
        return () => { window.removeEventListener('load', onLoad); clearTimeout(timer); };
    }, [spritesReady, debugMode]);

    useEffect(() => {
        const insts = [instruments.treble, instruments.bass, instruments.percussion, instruments.metronome, instruments.chords];
        if (insts.some((inst) => !inst)) return undefined;
        let cancelled = false;
        Promise.all(insts.map((inst) => inst.load || Promise.resolve()))
            .catch((err) => logger.error('App', 'E024-INSTRUMENT-LOAD-WAIT', err))
            .finally(() => { if (!cancelled) setAudioReady(true); });
        const timer = setTimeout(() => {
            if (cancelled) return;
            if (debugMode) logger.warn('App', 'boot-splash audio-load timeout (10s) — continuing without waiting further, load keeps running in the background');
            setAudioReady(true);
        }, BOOT_GATE_TIMEOUT_MS);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [instruments.treble, instruments.bass, instruments.percussion, instruments.metronome, instruments.chords, debugMode]);

    useEffect(() => {
        const statusEl = document.getElementById('boot-splash-status');
        if (!statusEl) return;
        if (!spritesReady) statusEl.textContent = 'Sprites/assets laden…';
        else if (!audioReady) statusEl.textContent = 'Audio-instrumenten laden…';
    }, [spritesReady, audioReady]);

    useEffect(() => {
        if (!audioReady || !spritesReady) return;
        document.getElementById('boot-splash')?.remove();
    }, [audioReady, spritesReady]);


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

    // Gamification (#128): live difficulty multiplier (harmNorm + trebleNorm, 0–2)
    // in a ref so score-event payload builders read it without memo churn.
    const actualDifficultyRef = useRef(0);
    useEffect(() => { actualDifficultyRef.current = actualDifficulty?.multiplier ?? 0; }, [actualDifficulty]);

    // Enriches a gamification event with the musical context the scoring math
    // needs (attribution + multipliers + novelty detection). Reads refs only —
    // stable identity for the callbacks below.
    const buildScorePayload = useCallback(() => {
        const s = scaleRef.current;
        return {
            tonicPC: (s?.tonic || '').replace(/-?\d+$/, ''),
            family: s?.family,
            mode: s?.name,
            meterNumerator: tsRef.current?.[0],
            bpm: bpmRef.current,
            difficultyMultiplier: actualDifficultyRef.current,
        };
    // All inputs are refs — stable identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        exerciseEditMode,
        setRangeEditMode,
        setExerciseEditMode,
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
    } = useEditMode({ handleStopAllPlayback });

    // ── Exercise view (#265/#266 rework, epic #245, Han 2026-07-02) ───────────
    // Exercises are PRESETS over four axes (melodyType / input / tempo /
    // evaluation); selecting one seeds the axes, and each axis stays
    // individually adjustable in the setter (Han: "de oefeningen zijn presets;
    // rubato instelbaar via tempo"). Every change applies the derived config
    // through the existing setters. Opening the selector flips the bottom view
    // to the songs tab.
    const [activeExerciseId, setActiveExerciseId] = useState(EXERCISES[0].id);
    useEffect(() => { activeExerciseIdRef.current = activeExerciseId; }, [activeExerciseId]);
    const [exerciseAxes, setExerciseAxes] = useState(() => ({ ...EXERCISES[0].axes }));
    const exerciseSetters = useMemo(() => ({
        setPlaybackConfig, setTrebleSettings, setBpm, setNumMeasures, setIsRubato,
    }), [setPlaybackConfig, setTrebleSettings, setBpm, setNumMeasures, setIsRubato]);
    const handleSelectExercise = useCallback((exercise) => {
        setActiveExerciseId(exercise.id);
        const ax = { ...exercise.axes };
        setExerciseAxes(ax);
        applyExerciseConfig(configFromAxes(ax), exerciseSetters);
        // Preset fine-tune patch (variability, note density, bpm …) on top of the axes.
        if (exercise.extra) applyExerciseConfig(exercise.extra, exerciseSetters);
    }, [exerciseSetters]);
    const handleExerciseAxisChange = useCallback((axis, value) => {
        const ax = { ...exerciseAxes, [axis]: value };
        setExerciseAxes(ax);
        applyExerciseConfig(configFromAxes(ax), exerciseSetters);
    }, [exerciseAxes, exerciseSetters]);
    useEffect(() => {
        if (exerciseEditMode) setActiveTab('songs');
    // setActiveTab is a stable useState setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [exerciseEditMode]);

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
        // #990 (Han 2026-08-14, "op foute noten gewoon chorus 1 zetten" + follow-up "moet hoorbaar
        // zijn wanneer er in beeld ook 'wrong note' wordt getoond ... chorus 1 en tremolo 0,7"): a
        // wrong tap gets an immediate, full-strength chorus wobble PLUS a 0.7-depth tremolo on the
        // treble channel — no ramp-up, an audible "that was wrong" cue the instant the on-screen
        // 'wrong note' label appears — then both ring back down to 0 over the same window
        // useInputTest's own errorTimeoutRef uses to clear the error state (1000ms), so the effect
        // decays alongside the visual error feedback rather than cutting off abruptly or lingering.
        onNoteWrong: useCallback((note) => {
            instruments.treble?.stop({ note });
            setChorusStrength('treble', 1, 0);
            setChorusStrength('treble', 0, 1);
            setTremoloStrength('treble', 0.7, 0);
            setTremoloStrength('treble', 0, 1);
        }, [instruments.treble, setChorusStrength, setTremoloStrength]),
        // #134 gamification: enrich input-test score events with musical context
        // and forward to the profile. buildScorePayload/recordEventRef read refs
        // only, so this callback is stable.
        onScoreEvent: useCallback((type, detail) => {
            recordEventRef.current(type, { ...detail, ...buildScorePayload() });
            // #144 adaptive difficulty (Han: override — the engine writes the SAME
            // targets the sliders write; the Sequencer reads them at the next
            // series boundary, so the very next melody adapts). Cadence: per
            // completed melody attempt; signal: the same graded outcome the ELO
            // ratings consume. Null targets seed from the CURRENT actual
            // difficulty so switching adaptive on never jumps the material.
            if (type === 'melodyComplete' && detail.total > 0 && configRef.current?.adaptiveDifficulty) {
                const outcome = gradedOutcome(detail.correct, detail.total);
                const inst = instrumentSettingsRef.current;
                const next = stepAdaptiveTargets({
                    outcome,
                    targets: {
                        harmonic: targetHarmonicDifficultyRef.current,
                        treble: targetTrebleDifficultyRef.current,
                        bass: targetBassDifficultyRef.current,
                    },
                    ranges: {
                        harmonic: HARMONY_DIFFICULTY_RANGE,
                        treble: MELODY_DIFFICULTY_RANGE,
                        bass: MELODY_DIFFICULTY_RANGE,
                    },
                    seeds: {
                        harmonic: calcHarmonicDifficulty(scaleRef.current).score,
                        treble: calcTrebleDifficulty(inst.treble),
                        bass: calcTrebleDifficulty(inst.bass),
                    },
                });
                setTargetHarmonicDifficulty(next.harmonic);
                setTargetTrebleDifficulty(next.treble);
                setTargetBassDifficulty(next.bass);
            }
            // #267 run counter: with untilCorrect only a FLAWLESS pass advances
            // the run (matches the restart-until-flawless loop); otherwise every
            // completion counts. Ending the run is deferred a tick — this event
            // fires from inside advanceToNext, and stopping the input test
            // mid-handler would race its own setState calls.
            const run = exerciseRunRef.current;
            if (run && type === 'melodyComplete') {
                const counts = configRef.current?.untilCorrect ? detail.flawless === true : true;
                if (counts) {
                    const next = { ...run, completed: run.completed + 1 };
                    exerciseRunRef.current = next;
                    setExerciseRun(next);
                    const finished = next.completed >= next.target;
                    // #268: persistent per-exercise counters (melody rides along with
                    // recordEvent's melodyComplete flush; a finished run flushes itself).
                    recordExerciseProgressRef.current?.(activeExerciseIdRef.current, {
                        melodies: 1, runs: finished ? 1 : 0,
                    });
                    if (finished) {
                        setTimeout(() => endExerciseRunRef.current?.(), 0);
                    }
                }
            }
        // configRef, exerciseRunRef, endExerciseRunRef are refs — stable identities.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [buildScorePayload]),
    });

    // #647 combat: EVERY played note funnels through handleInputTestNote (piano/QWERTY/mic; MIDI later).
    // Relay it to the sheet-music RPG layer as { note, nonce } so the hero attacks once and the leftmost
    // matching slime dies. Wrapping here keeps the existing input-test behaviour untouched.
    const [combatNote, setCombatNote] = useState(null);
    const combatNonceRef = useRef(0);
    // Dedupe guard (Han 2026-08-02 "22 missers???"): some MIDI keyboards expose TWO ports (USB + thru) or
    // double-trigger a key — the duplicate note-on arrived ms after the kill, found its slime already
    // resolved, and was judged a spurious miss/wrong-note. The REAL bug (a QWERTY keyup double-firing combat
    // — see PianoView.jsx handleKeyUp) is fixed separately; this guard stays as a safety net for genuine
    // hardware duplicates. Window = a 1/128 note at the current tempo (Han's ask), floored at 15ms so it
    // still catches near-simultaneous duplicates at very slow bpm without being long enough to ever drop a
    // deliberate fast repeated note. Dropped from COMBAT only — the input-test path still receives every
    // event (its own state machine tolerates repeats).
    const combatLastRef = useRef({ note: null, at: 0 });
    const handleNoteInputCombat = useCallback((note, isTap = false) => {
        handleInputTestNote(note, isTap);
        const now = performance.now();
        const beatMs = bpmRef.current > 0 ? 60000 / bpmRef.current : 500;
        const dedupeMs = Math.max(15, beatMs / 32);   // 1/128 note
        if (combatLastRef.current.note === note && now - combatLastRef.current.at < dedupeMs) return;
        combatLastRef.current = { note, at: now };
        combatNonceRef.current += 1;
        setCombatNote({ note, nonce: combatNonceRef.current });
    }, [handleInputTestNote, bpmRef]);

    // #661 (Han): GLOBAL MIDI input. A connected MIDI keyboard plays the note (treble instrument for now) and
    // routes it into the SAME combat/input path as QWERTY/piano — regardless of which view is active (the old
    // PianoView-local listener only worked while the piano was mounted, so events "kwamen niet door"). note-on
    // starts a sustained note (stopFn kept per note); note-off releases it.
    const midiStopsRef = useRef({});
    const handleMidiNoteOn = useCallback((note) => {
        if (instruments.treble && context) {
            if (context.state !== 'running') context.resume();
            const stop = playSound(note, instruments.treble, context, context.currentTime, null);
            if (stop) midiStopsRef.current[note] = stop;
        }
        handleNoteInputCombat(note, true);
    }, [context, instruments.treble, handleNoteInputCombat]);
    const handleMidiNoteOff = useCallback((note) => {
        const stop = midiStopsRef.current[note];
        if (stop) { stop(); delete midiStopsRef.current[note]; }
    }, []);
    const midiStatus = useMidiInput({ onNoteOn: handleMidiNoteOn, onNoteOff: handleMidiNoteOff });

    // #659 Level 1: a header button applies the level config (treble only, 2 measures, 2 notes/measure, 30%
    // variability, C4–G4), the player clears 4 waves of slimes, then a "Well done!" splash. The setters update
    // their refs synchronously, so regenerating right after applying config uses the new settings.
    // Bug fix / feature (Han 2026-08-06, level editor: "key/vocal range/clef" fields — see levels.js's
    // schema reference): `setTonic`/`setSelectedMode` are included so a level can force its own key
    // (e.g. a vocal-range level pinned to a comfortable key) — added to BOTH setters and snapshot so
    // `restore()` reverts the user's own key exactly, the same way every other level-applied field does.
    const levelSnapshot = useCallback(() => ({
        numMeasures, trebleSettings, bassSettings, percussionSettings, chordSettings, playbackConfig, showChordsOddRounds, showChordsEvenRounds, bpm, animationMode,
        tonic: scale.tonic, selectedMode, theme, timeSignature,
    }), [numMeasures, trebleSettings, bassSettings, percussionSettings, chordSettings, playbackConfig, showChordsOddRounds, showChordsEvenRounds, bpm, animationMode, scale.tonic, selectedMode, theme, timeSignature]);
    // Defer the (re)generation to the next frame so the just-applied config setters have flushed to their
    // refs first (setTrebleSettings mirrors into instrumentSettingsRef only during the render it triggers;
    // randomizeAll reads that ref) — otherwise the FIRST wave would generate from the old settings.
    // Han BUG (2026-08-01): the FIRST generation ignored the level's range/settings. `randomizeAll` closes over
    // `trebleSettings` (a useCallback dep), so it only picks up applyConfig's setTrebleSettings AFTER the state
    // commit re-creates it. The rAF defer alone wasn't enough — it captured the STALE randomizeAll. Calling the
    // LATEST randomizeAll via a ref (after React has flushed the setters on the next frame) guarantees the range
    // + every other applied setting are in effect BEFORE generation.
    const randomizeAllRef = useRef(randomizeAll); randomizeAllRef.current = randomizeAll;
    // #RAM-level (Han 2026-08-11, "twee knoppen toe: treble melody en bass melody... genereert random
    // melodieën... ook meteen afspelen"): reuses the SAME defer-then-read-via-ref pattern as
    // `levelRegenerate` right below (Han's own prior bug fix note explains why: `randomizeAll`'s setters
    // only land in state on the NEXT render, so playing back synchronously afterward would still read the
    // OLD melody). `handlePlayMelodyRef` mirrors `randomizeAllRef`'s own convention.
    const handlePlayMelodyRef = useRef(handlePlayMelody); handlePlayMelodyRef.current = handlePlayMelody;
    const generateAndPlayVoice = useCallback((voice) => {
        const perVoice = { treble: false, bass: false, percussion: false, [voice]: true };
        randomizeAllRef.current(perVoice);
        requestAnimationFrame(() => { handlePlayMelodyRef.current(); });
    }, []);
    // Bug fix (Han 2026-08-06, "ik zie noten van de basismelodie"): tracks whether the level's OWN
    // treble melody has actually landed yet. False for the span between requesting a level (re)gen and
    // the deferred randomizeAll below actually running — SheetMusic/SheetRpgLayer use this to withhold
    // the stale pre-regen melody instead of flashing it. See SheetMusic.jsx's `levelMelodyReady` prop doc.
    const [levelMelodyReady, setLevelMelodyReady] = useState(true);
    // #663 (Han 2026-08-03, "genereer ook akkoordenprogressie (I-I-I) tonic progressie"): every OTHER
    // level regen (wave-to-wave) keeps `chords: false` — the existing progression is just adapted to the
    // new length, unchanged behaviour. Only the LEVEL'S FIRST regeneration (begin()) needs `chords: true`
    // to actually run `generateChords(chordSettings.strategy)` and produce a fresh 'tonic-tonic-tonic'
    // progression (useLevel.applyConfig sets that strategy just before this fires) — without this, the
    // level would silently reuse whatever chord progression was left over from normal (non-level) play.
    const levelRegenerate = useCallback((forceNewChords = false) => {
        setLevelMelodyReady(false);
        requestAnimationFrame(() => {
            randomizeAllRef.current({ chords: forceNewChords });
            setLevelMelodyReady(true);
        });
    }, []);
    // #871 (Han 2026-08-11, "abc music en level namen"): mirrors `levelRegenerate` right above exactly —
    // same rAF-defer + `levelMelodyReady` false→true gate (so the backing-audio anchor at ~line 1229
    // never starts ahead of the melody) — but loads a FIXED song via the existing handleLoadSong pipeline
    // instead of generating one. `useOriginalTonic: true` plays the song in the abc's own written key.
    const handleLoadSongRef = useRef(handleLoadSong); handleLoadSongRef.current = handleLoadSong;
    const levelLoadSong = useCallback((songId) => {
        const songDef = SONGS.find((s) => s.id === songId);
        if (!songDef) return;
        setLevelMelodyReady(false);
        requestAnimationFrame(() => {
            handleLoadSongRef.current(songDef, 'easy', true);
            setLevelMelodyReady(true);
        });
    }, []);
    const levelSetters = useMemo(() => ({
        setNumMeasures, setTrebleSettings, setBassSettings, setPercussionSettings, setChordSettings, setPlaybackConfig,
        setShowChordsOddRounds, setShowChordsEvenRounds, setStartMeasureIndex, setBpm, setAnimationMode,
        setTonic, setSelectedMode, setTheme, setTimeSignature, loadSong: levelLoadSong,
    }), [setNumMeasures, setTrebleSettings, setBassSettings, setPercussionSettings, setChordSettings, setPlaybackConfig, setShowChordsOddRounds, setShowChordsEvenRounds, setStartMeasureIndex, setBpm, setAnimationMode, setTonic, setSelectedMode, setTheme, setTimeSignature, levelLoadSong]);
    const level = useLevel({ setters: levelSetters, snapshot: levelSnapshot, regenerate: levelRegenerate, debugMode });

    // #661 rework (Han 2026-08-02: "ik wil dat je playAllMelodies gebruikt... via de bestaande play all
    // melody params"): the old §88 backing hand-rolled its OWN note-by-note scheduling on two throwaway
    // Soundfont instances (celloRef/timpaniRef) with a fixed C2-whole-note / [C2,C2,C3,r] pattern. That is
    // gone. The bass line plays a REAL GENERATED melody (`useLevelBackingStream`'s growing `bass`), the
    // SAME generation pipeline every other track uses. The metronome likewise plays `melodies.metronome`,
    // the SAME generated metronome every other playback path uses. Both are scheduled with the exact same
    // `playMelodies()` function + `namedInstruments`/`trackGains` params the Sequencer itself uses per
    // iteration (src/audio/Sequencer.js) — see scheduleLevelBackingAudio below. Percussion stays silent
    // in the sense of never touching the visible percussion staff (Han's explicit choice) — the timpani
    // AUDIO layer described below is separate.
    //
    // #871 follow-up (Han 2026-08-11, "cello... moet niet op bass melody staan; op een invisible
    // melody"): the paragraph above originally described the bass line as playing through the app's REAL
    // `instruments.bass` slot (temporarily retimbred to 'cello' by `useLevel.applyConfig`). That's no
    // longer true — cello now plays through its own dedicated `celloRef` Soundfont (below), and its
    // generated Melody is exposed as `LEVEL_CELLO_SLOT`, an audio-only invisible-melody instance (§187/
    // §858) — `instruments.bass` is never touched by a level anymore.
    //
    // `levelAudioStart` (audio-time seconds) is BOTH the scroll's t=0 anchor (passed to SheetRpgLayer) AND
    // the base the backing is scheduled on, so a slime reaches the hero at exactly the beat that sounds.
    const [levelAudioStart, setLevelAudioStart] = useState(null);
    // Han (2026-08-02): "ik hoor de timpanen en cello niet, zet hun volume op mp" — the bass/metronome
    // instruments' PERSISTENT output fader (useInstruments.js's `setVolume`, a GainNode separate from any
    // per-note velocity) is whatever the user last left it at — inaudible if never raised. A level makes
    // its backing tracks explicitly audible at mezzo-piano (reusing the canonical VOL_STEPS dynamics table,
    // §6c, rather than a new hardcoded gain constant) and restores full volume on close.
    const LEVEL_BACKING_VOLUME = VOL_STEPS.find((s) => s.label === 'mezzo piano').value;
    // Han (2026-08-03, "zet de cello op mf, om te testen"): the cello alone gets a louder persistent
    // fader than the rest of the backing (timpani/metronome stay at mezzo-piano) — a deliberate imbalance
    // to test whether it's simply drowned out next to the punchy timpani (§104's inaudible-cello finding
    // was inconclusive: the audio pipeline traced structurally sound, so this is the perceived-loudness
    // mitigation flagged there as a follow-up).
    const LEVEL_BASS_VOLUME = VOL_STEPS.find((s) => s.label === 'mezzo forte').value;
    // #992 (Han: "RPG music volume" setter) — ONE combined multiplier applied on top of BOTH the level
    // backing (bass/metronome/percussion, resolveLevelVolume below) AND the open-world ambient music/
    // birds (useWorldAmbientMusic, MF_VOLUME-based) — Han's explicit spec: one knob over both existing
    // paths, not two separate ones. At the shipped default (mezzo-forte) this is exactly 1.0, so neither
    // path's tuned volume changes until the player actually moves the setter (see rpgVolumeMultiplier).
    const rpgMusicMultiplier = rpgVolumeMultiplier(playbackConfig.rpgMusicVolume, DEFAULT_RPG_MUSIC_VOLUME);
    // Level editor (Han 2026-08-06, "tracks.<name>.volume"): resolves a track's persistent output fader
    // from the level's own `tracks.<name>.volume` (a VOL_STEPS glyph string — "pp"/"p"/"mp"/"mf"/"f"/
    // "silent", see levels.js's schema reference), falling back to the hardcoded defaults above when the
    // level doesn't specify one (100% backward compatible with levels 1-9, none of which set it).
    const resolveLevelVolume = (lvl, trackName, fallback) => {
        const glyph = lvl?.tracks?.[trackName]?.volume;
        const step = glyph ? VOL_STEPS.find((s) => s.glyph === glyph) : null;
        return step ? step.value : fallback;
    };
    // #661 (Han 2026-08-02, "melodische percussie … hardcoded timpani enkel in levels"): the app's normal
    // `instruments.percussion` slot is ALWAYS an unpitched DrumMachine/Sampler/GM-drum-kit
    // (useInstruments.js) — it structurally cannot play the pitched timpani pattern, and Han explicitly
    // does NOT want the general percussion instrument dropdown to switch to melodic instruments. So
    // percussion's level audio needs its own small dedicated Soundfont — preloaded once the AudioContext
    // exists, own instrument so it never disturbs the user's real percussion-kit selection. (#871 follow-
    // up: `celloRef` right below now mirrors this exact same pattern for bass.)
    const timpaniRef = useRef(null);
    useEffect(() => {
        if (!context) return;
        try { if (!timpaniRef.current) timpaniRef.current = createMelodicInstrument(context, 'timpani'); } catch { /* offline / CDN blocked */ }
    }, [context]);
    // #858 (Han 2026-08-10, "doe de refactor 858 nu"): timpani used to be scheduled from a raw
    // pattern array built inline at schedule time, with zero representation in the Melody/
    // MelodyContext model — the one genuinely ad-hoc audio-only layer in the app. Hoisted into a
    // memo so it's built ONCE and both (a) scheduled below and (b) exposed to MelodyProvider as
    // `invisibleMelody1` (constants/melodyInstances.js) — the first concrete instance of the new
    // generalized audio-only-instance mechanism. Depends on primitive fields (not `level.current`
    // itself) so it doesn't recompute on every unrelated App.jsx render.
    const timpaniMelody = useMemo(() => {
        if (!percussionSettings?.melodic || !level.current?.numMeasures) return null;
        return buildTimpaniPattern(LEVEL_LEAD_IN_BARS + level.current.numMeasures, timeSignature);
    }, [percussionSettings?.melodic, level.current?.numMeasures, level.current?.id, timeSignature]);
    // #871 follow-up (Han 2026-08-11, "cello en timpanen... moeten niet op bass melody en percussion
    // melody staan; ze zouden op twee van de invisible melodies moeten staan. Geldt voor alle levels."):
    // the level's cello backing now plays through its OWN dedicated Soundfont — exactly the same pattern
    // `timpaniRef` above already uses for percussion — instead of temporarily rebuilding the REAL,
    // shared `instruments.bass` slot to a 'cello' timbre. This also sidesteps the old §171 mitigation's
    // problem entirely (a rebuilt shared slot's async sample-fetch time delaying level start): a
    // dedicated instrument, preloaded once on mount exactly like timpani, never needs a "warm cache
    // then rebuild" two-step — it just exists, ready, the whole session. `instruments.bass` is now
    // NEVER touched by a level; it stays whatever the player has chosen for their own bass practice.
    const celloRef = useRef(null);
    useEffect(() => {
        if (!context) return;
        try { if (!celloRef.current) celloRef.current = createMelodicInstrument(context, 'cello'); } catch { /* offline / CDN blocked */ }
    }, [context]);
    // #662 (Han 2026-08-03, "timpanen en cello worden niet onderbroken door de stop-knop"): the level's
    // backing is scheduled ALL AT ONCE, far ahead (the whole -1..8 measure span) — unlike the Sequencer's
    // own short-horizon incremental scheduling. `instrument.stop()` alone only halts voices that are
    // ALREADY SOUNDING; it can't reach notes still waiting in smplr's internal Scheduler for their future
    // dispatch time. Every playMelodies() call below for the level backing is passed this SAME ref, which
    // collects each note's StopFn (playMelodies.js's new `stopHandlesRef` param) — calling all of them
    // cancels the ENTIRE remaining schedule, pending or not.
    const levelBackingStopFnsRef = useRef([]);
    const stopAllBackingAudio = useCallback(() => {
        levelBackingStopFnsRef.current.forEach((fn) => { try { fn(); } catch { /* already stopped */ } });
        levelBackingStopFnsRef.current = [];
        try { celloRef.current?.stop(); } catch { /* not started */ }
        try { instruments.metronome?.stop(); } catch { /* not started */ }
        try { timpaniRef.current?.stop(); } catch { /* not started */ }
        setVolume('bass', 1.0);
        setVolume('metronome', 1.0);
    }, [instruments, setVolume]);
    // #871 follow-up (Han 2026-08-11): `bassReady` now simply asks whether the level's OWN dedicated
    // `celloRef` instrument has been constructed — exactly the same shape as the `timpaniRef.current`
    // checks already used below, since cello no longer depends on `instruments.bass` being rebuilt to
    // anything. This also structurally FIXES the earlier `bassReady` deadlock (a no-bass song's level
    // never rebuilding `instruments.bass` to 'cello', so `bassReady` stayed false forever and the
    // `levelAudioStart` anchor never got picked — see the now-obsolete prior version of this comment):
    // `celloRef` is constructed once, unconditionally, on mount, so this is never permanently false.
    const bassReady = !!celloRef.current;
    const metronomeReady = loadedSlug.metronome === metronomeSettings.instrument && !!instruments.metronome;
    // Bug fix (Han 2026-08-06, "ik hoor geen van de melodieën" — intermittently silent/garbled level
    // audio): this used to be set at CLICK time (+0.35s pre-roll) by a `scheduleLevelBacking` callback,
    // before instruments were confirmed ready. `instruments.bass`/`instruments.metronome` rebuild
    // ASYNCHRONOUSLY (useInstruments.js fetches the cello Soundfont's samples) — whenever that rebuild
    // took longer than 0.35s (uncached samples, slow network — inherently variable, hence "sometimes
    // works"), `bassReady`/`metronomeReady` only flipped true AFTER the anchor's intended start time had
    // already elapsed. The scheduling effect below still fired once ready, but scheduled every chunk
    // against that now-stale anchor; playMelodies.js clamps any past `scheduledStart` to
    // `context.currentTime` (see its `adjustedStart` line), which collapsed/overlapped the level's
    // opening bars instead of silently waiting. Fix: don't pick the anchor until every instrument the
    // level's audio needs is CONFIRMED ready — the same flags the scheduling effect below already gates
    // on — so by construction the anchor can never be in the past once anything schedules against it.
    // This also removes the visual (SheetRpgLayer) vs. audio start-time divergence that the old
    // click-time anchor could cause, since both now share this same, later, readiness-gated anchor.
    // Bug fix (Han 2026-08-06, "noten komen pas laat invliegen van rechts... mss preloaden van
    // melodie?"): this anchor-setting effect already waited for audio readiness, but NOT for the
    // treble melody itself (`levelMelodyReady`, §166) — the tick clock could start advancing (once
    // audio was ready) while `trebleMelody` was still `null`/regenerating, so by the time the melody
    // finally arrived, its notes' spawn positions (computed from `beat` vs. the ALREADY-elapsed tick)
    // landed partway across the lane instead of starting fresh from the right edge — i.e. "late,
    // not enough lead-in from the right", on EVERY level, not just non-4/4 ones. Fix: also wait for
    // `levelMelodyReady` before picking the anchor, so the melody is always fully "preloaded" before
    // the clock ever starts ticking.
    useEffect(() => {
        const lvl = level.current;
        if (!level.active || !lvl?.sideScroll || levelAudioStart != null || !context) return;
        if (!bassReady || !metronomeReady || !levelMelodyReady) return;
        if (percussionSettings?.melodic && !timpaniRef.current) return;
        // Bug fix (Han 2026-08-06, "maat -1 is pas na anderhalve maat in beeld... metronoom/cello/melodie
        // zouden allemaal dezelfde timer moeten gebruiken"): they DO already share one AudioContext — the
        // remaining desync is that THIS anchor is picked once readiness fires, but bass/metronome/treble
        // JIT scheduling (useLevelBackingStream/useLevelMixedStream/useLevelKeyModulationStream/
        // SheetRpgLayer's own tick pickup) each fire in SEPARATE, chained React effects/commits after
        // this one — real wall-clock time passes between "anchor picked" and "every track's first note
        // actually scheduled". 0.35s was too tight a margin for that whole chain on a cold start;
        // playMelodies.js's own clamp then silently pulled straggling tracks' first notes forward to
        // "now", desyncing them from tracks that made the original anchor. Widened to 1.0s — cheap
        // (worst case: the level starts a little later), removes the race instead of shrinking it.
        //
        // Bug fix round 2 (Han 2026-08-10, "de noten moeten ónmiddellijk rechts in beeld komen, en binnen
        // 2 maten speelbaar zijn"): confirmed via a targeted debug log that the visual flight formula IS
        // exactly `beatsOnScreen * beatMs` (6000ms at 80bpm/8 beats) — not itself the source of extra
        // delay. Narrowed this buffer to 0.5s to cut perceived latency.
        //
        // REVERTED round 4 (Han 2026-08-10, "ik zie 1 frame de correcte positionering, waarna -1 en 0
        // plotseling naar rechts springen... het mag NOOIT zo zijn dat de metronoom en de noten een
        // andere klok hebben"): that 0.5s narrowing was the actual regression. SheetRpgLayer's tick
        // clock stays FROZEN (not advancing at all) while `scrollStartTime` is null, then on the FIRST
        // unfrozen frame computes `t = round((nowMs - anchor) / INTERVAL_MS)`. If real wall-clock time has
        // already passed `anchor` by the time that first unfrozen frame actually runs — because React's
        // effect/commit chain (this state update → SheetMusic → SheetRpgLayer prop → its own rAF loop
        // picking it up) took longer than the buffer — `t` is NOT 0, it's already a positive "catch-up"
        // value: the very first thing the visual clock does is SNAP to where it should already be,
        // instead of counting up smoothly through 0 from a negative pre-roll. That is exactly a
        // one-frame-correct-then-jump. 0.5s was too tight a margin for that chain (same failure mode as
        // the already-proven-too-tight 0.35s, just a different number) — reverted to the PROVEN-safe
        // 1.0s. This buffer is NOT "wasted time before the note shows" — it's the lead time the render
        // chain needs to finish scheduling BEFORE the promised anchor moment arrives; shrinking it doesn't
        // make notes appear sooner, it breaks the promise (a late catch-up jump instead of a clean
        // pre-roll). If perceived latency still needs to come down, the real lever is speeding up the
        // effect chain itself (readiness/generation), not this buffer.
        const anchor = context.currentTime + 1.0;
        logger.debug('LevelTiming', 'anchor picked', { nowCtxTime: context.currentTime, anchor, bpm: lvl.bpm });
        setLevelAudioStart(anchor);
    }, [level.active, level.current, levelAudioStart, context, bassReady, metronomeReady, levelMelodyReady, percussionSettings?.melodic]);
    const backingScheduledForRef = useRef(null);   // the levelAudioStart we already scheduled TIMPANI for
    useEffect(() => {
        const lvl = level.current;
        if (!level.active || !lvl?.sideScroll || levelAudioStart == null || !context) return;
        if (backingScheduledForRef.current === levelAudioStart) return;   // already scheduled this anchor
        if (!bassReady || !metronomeReady) return;
        // Bug fix (Han 2026-08-10, "die twee mogen nooit onafhankelijk beginnen"): timpani must never
        // schedule ahead of/independent from the treble melody either — same explicit gate as
        // useLevelBackingStream.js's bass/metronome effect.
        if (!levelMelodyReady) return;
        // Wait for the dedicated timpani Soundfont too when percussion is melodic — scheduling before
        // it's ready would silently skip it for the whole level session (backingScheduledForRef locks in).
        if (percussionSettings?.melodic && !timpaniRef.current) return;
        backingScheduledForRef.current = levelAudioStart;
        levelBackingStopFnsRef.current = [];   // fresh schedule — drop any stale handles from a prior level
        const bpm = lvl.bpm || 80;
        // #992 — rpgMusicMultiplier applied on top of the resolved value, not replacing it (relative-
        // to-default semantics, see its own comment above); == 1.0 at the shipped default.
        const bassVolume = resolveLevelVolume(lvl, 'bass', LEVEL_BASS_VOLUME) * rpgMusicMultiplier;
        const metronomeVolume = resolveLevelVolume(lvl, 'metronome', LEVEL_BACKING_VOLUME) * rpgMusicMultiplier;
        const percussionVolume = resolveLevelVolume(lvl, 'percussion', LEVEL_BACKING_VOLUME) * rpgMusicMultiplier;
        setVolume('bass', bassVolume);
        setVolume('metronome', metronomeVolume);

        // #663 (Han 2026-08-03, "hard code de timpani voor nu"): timpani stays the ONE Han-authorized
        // hardcoded pattern, scheduled ONCE for the whole piece (lead-in + content) from measure -1 —
        // unlike bass/metronome below, which are now JIT-generated chunk by chunk (useLevelBackingStream)
        // to fix the desync/measure-0-only/inaudible-cello bugs. Timpani never had those bugs (it isn't
        // racing an async instrument swap or a regenerated melody), so it needs no change in kind.
        if (percussionSettings?.melodic && timpaniRef.current && timpaniMelody) {
            playMelodies(
                [timpaniMelody], [timpaniRef.current],
                context, bpm, levelAudioStart,
                null, null, { ...instruments, percussion: timpaniRef.current }, null,
                { treble: 0, bass: 0, percussion: percussionVolume, chords: 0, metronome: 0 },
                levelBackingStopFnsRef,
            );
        }
    }, [level.active, level.current, levelAudioStart, context, instruments, bassReady, metronomeReady,
        levelMelodyReady, setVolume, LEVEL_BACKING_VOLUME, LEVEL_BASS_VOLUME, percussionSettings?.melodic, timeSignature, timpaniMelody, rpgMusicMultiplier]);

    // #688 (Han 2026-08-04, Level 9 rework: "ik hoor te veel tonen. lijkt of er meerdere melodieën
    // gegenereerd zijn" + "ik verwacht een soepele aangesloten reeks maten... alle 10 maten naadloos"):
    // reverted to ONE continuous 8-measure melody (`numMeasures: 8, numRepeats: 1` in levels.json — matches
    // Level 2 exactly again) instead of §686's 4-separate-2-measure-waves structure. That structure needed
    // its own wave-advance timer + per-wave melody regeneration + per-wave audio (re)scheduling — several
    // OVERLAPPING schedules were almost certainly the source of the "too many tones" bug, and the repeated
    // per-wave resets broke the lead-in/final-barline math (which assumes one level-length melody). Level 9
    // now advances/ends exactly like every other side-scroll level (`onSlimesCleared` below, unchanged).
    //
    // #692 (Han 2026-08-04, Level 9 bug report: "ik hoor te veel tonen... ik hoor andere noten dan de te
    // spelen noten... vermoeden is dat er twee aparte melodieën bestaan"): the §688 odd/even-measure "call"/
    // "response" split literally WAS two different note streams sharing one beat grid — the square-synth
    // "call" always played the ODD measures' pitches while the projectile/combat grading (slimeData, in
    // SheetRpgLayer) fires for EVERY note including the even ones, whose pitches were never previewed. Han's
    // corrected model: there is only ONE melody (single source of truth = `trebleMelody`, unmodified — same
    // pitches heard and played). Every note goes through the SAME 3 phases relative to its OWN beat: (a) ~2
    // measures out, spawns off-screen invisibly (SheetRpgLayer's existing beatsOnScreen flight, unchanged);
    // (b) `wizardSpawnLeadMeasures` measures out, becomes visible AND is audibly "cast" by the wizard (this
    // square-lead voice) at its OWN pitch; (c) at its real beat, the player must play that same pitch. So the
    // cast-audio is the WHOLE unmodified melody, scheduled `wizardSpawnLeadMeasures` measures EARLIER than
    // the player's real position — not a per-measure mute — which keeps every cast pitch identical to the
    // pitch that must eventually be played, one measure later.
    // #693 (Han 2026-08-04, Level 9 UAT round 2 — "de noten zijn niet netjes per maat gescheiden. ik wil
    // echt: oneven maat: leeg, even maat noten"): odd/even is now baked into the CANONICAL `trebleMelody`
    // itself (not just a rendering trick) — odd measures collapse to ONE whole-measure rest (Han: "je mag in
    // de volledig lege maten een hele rust plaatsen, niet een 4x kwartrust"), even measures keep every real
    // note untouched. Single source of truth: SheetRpgLayer's notation, `slimeData`/combat grading, AND this
    // wizard-cast audio all read the SAME already-collapsed melody, so odd measures are truly silent/unplayed
    // everywhere (no separate "mute" logic needed anywhere downstream).
    // #693 (Han 2026-08-04, round 4 — FINAL: "de noten om te spelen staan in de EVEN maten. de ONEVEN maten
    // hebben altijd een hele rust (forceer dat). de noten in de EVEN maten worden een maat op voorhand óók
    // door de wizard gespeeld; en op dat moment verschijnen de projectiles"): round 3's flip (collapse EVEN,
    // keep ODD) was itself wrong — Han confirmed the ORIGINAL round-2 mapping was right all along. Back to
    // collapsing ODD measures to a single whole-rest; EVEN measures keep their real playable notes.
    // #693 (Han 2026-08-04, round 6 — "genereer sequentieel 4 blokken zoals maat 1 en 2", JIT):
    // Level 9's treble (the wizard's call-response melody) is no longer generated once up front
    // and post-processed — useLevelTrebleStream owns generating + growing it 2 measures ("1
    // call-response block") at a time, and schedules each block's own wizard-cast preview as it
    // arrives. This REPLACES the old restify/duplicate-in-place transform (round 5) and the old
    // one-shot "reschedule the whole melody on every trebleMelody change" preview effect — both
    // only ever handled Level 9's OWN, now-JIT-generated `treble`, not the shared `trebleMelody`
    // state every other level/mode uses, so removing them here is scoped to Level 9 only.
    const wizardPreviewRef = useRef(null);
    useEffect(() => {
        if (!context) return;
        try { if (!wizardPreviewRef.current) wizardPreviewRef.current = createMelodicInstrument(context, 'lead_1_square'); } catch { /* offline / CDN blocked */ }
    }, [context]);
    // Dedicated stop-fns ref (NOT the shared `levelBackingStopFnsRef` — that's also used by bass/
    // metronome/timpani schedules and must not be blanket-cancelled from here).
    const wizardPreviewStopFnsRef = useRef([]);
    const levelTrebleStream = useLevelTrebleStream({
        active: level.active && level.current?.enemyType === 'Wizard',
        lvl: level.current,
        scale,
        timeSignature,
        trebleSettings,
        chordProgression: melodies.chordProgression,
        context,
        levelAudioStart,
        wizardInstrument: wizardPreviewRef.current,
        wizardVolume: LEVEL_BACKING_VOLUME,
        stopFnsRef: wizardPreviewStopFnsRef,
    });
    // Level 10 (Han 2026-08-06, "mixed level - stuur 2 maten slimes, dan 2 maten wizard"): reuses the
    // SAME wizard-cast Soundfont as Level 9 above, own dedicated stop-fns ref (§6c — mirrors
    // wizardPreviewStopFnsRef's own rationale: never blanket-cancel a schedule that isn't this stream's).
    // Scope note (see useLevelMixedStream.js's own header comment): only the MELODY/AUDIO mechanic
    // alternates per block for now — the visual enemy stays rendered as Slime throughout (SheetRpgLayer
    // gets `enemyType: 'Slime'` for a Mixed level, see the `enemyType` prop below), not a full
    // slime↔wizard sprite swap, which would need a much deeper SheetRpgLayer rendering fork this pass
    // couldn't safely verify without live testing.
    const mixedPreviewStopFnsRef = useRef([]);
    const levelMixedStream = useLevelMixedStream({
        active: level.active && level.current?.enemyType === 'Mixed',
        lvl: level.current,
        scale,
        timeSignature,
        trebleSettings,
        chordProgression: melodies.chordProgression,
        context,
        levelAudioStart,
        wizardInstrument: wizardPreviewRef.current,
        wizardVolume: LEVEL_BACKING_VOLUME,
        stopFnsRef: mixedPreviewStopFnsRef,
    });
    // Level 11 (Han 2026-08-06, "slimes, er staat een groene wizard... wisselt dan van toonladder"):
    // JIT treble stream that alternates Major/Minor every 2 measures (tonic fixed) — see
    // useLevelKeyModulationStream.js's own header for the full rationale (forward-only, reuses
    // updateScaleWithMode). Active for any Slime-enemy level with `decorativeWizard: true`, independent
    // of the Wizard/Mixed streams above (mutually exclusive per level — only one is ever `active`).
    const levelKeyModulationStream = useLevelKeyModulationStream({
        active: level.active && !!level.current?.decorativeWizard,
        lvl: level.current,
        scale,
        timeSignature,
        trebleSettings,
        chordProgression: melodies.chordProgression,
        context,
        levelAudioStart,
    });

    // #663: bass (cello) + metronome are generated + scheduled incrementally, LEVEL_LEAD_IN_BARS
    // ("one chunk") at a time — see useLevelBackingStream.js for the full rationale. `bass`/`metronome`
    // here are the level's GROWING melodies, threaded into MelodyProvider below in place of
    // `melodies.bass`/`melodies.metronome` while a side-scroll level is active.
    const levelBackingStream = useLevelBackingStream({
        active: level.active && !!level.current?.sideScroll,
        lvl: level.current,
        scale,
        timeSignature,
        bassSettings,
        chordProgression: melodies.chordProgression,
        context,
        levelAudioStart,
        bassReady,
        metronomeReady,
        levelMelodyReady,
        // #871 follow-up (Han 2026-08-11): the level's cello track now plays through its own dedicated
        // `celloRef` Soundfont instead of `instruments.bass`.
        bassInstrument: celloRef.current,
        metronomeInstrument: instruments.metronome,
        stopFnsRef: levelBackingStopFnsRef,
    });
    // #861 (Han 2026-08-10, "de basnoten moeten pas komen vanaf maat 1, niet vanaf maat -1" — scoped to
    // twoHanded levels only, confirmed via interview: the cello GUIDE audio in ordinary levels 2-9 keeps
    // starting at measure -1 on purpose, unchanged). `levelBackingStream.bass` still covers the lead-in
    // (measures -1/0) because the AUDIO guide still plays there — only the RENDERED/combat-relevant bass
    // content for a twoHanded level's own bass staff should start at measure 1. Strips any note whose
    // offset is before that point; a truncation from the FRONT (not the end, unlike SheetRpgLayer's
    // trebleFinalBarTick clamp for the SAME reason: never orphan a tie-continuation slot).
    const twoHandedBassMelody = useMemo(() => {
        if (!(level.active && level.current?.twoHanded) || !levelBackingStream.bass?.offsets?.length) {
            return levelBackingStream.bass;
        }
        const barBeats = timeSignature[0] || 4;
        const measureLengthTicks = (TICKS_PER_WHOLE * barBeats) / (timeSignature[1] || 4);
        const contentStartTick = LEVEL_LEAD_IN_BARS * measureLengthTicks;
        const { notes, offsets, durations, displayNotes, volumes, ties } = levelBackingStream.bass;
        let startIndex = 0;
        while (startIndex < offsets.length && (offsets[startIndex] == null || offsets[startIndex] < contentStartTick)) startIndex++;
        if (startIndex === 0) return levelBackingStream.bass;
        return {
            ...levelBackingStream.bass,
            notes: notes.slice(startIndex),
            offsets: offsets.slice(startIndex),
            durations: durations.slice(startIndex),
            displayNotes: displayNotes ? displayNotes.slice(startIndex) : displayNotes,
            volumes: volumes ? volumes.slice(startIndex) : volumes,
            ties: ties ? ties.slice(startIndex) : ties,
        };
    }, [level.active, level.current, levelBackingStream.bass, timeSignature]);
    // #FR2 (Han 2026-08-10, Level 15 "twee toetsen!!!"): the bass/left-hand keyboard's own simple
    // per-measure grading — see useTwoHandedBass.js. `twoHandedActive` gates BOTH this hook and the
    // second PianoView rendered below; only Level 15 (levels.json's `twoHanded: true`) turns it on.
    // Bug fix (Han 2026-08-10, "na voltooiing level blijven er 'missed' noten bijkomen"): `level.done`
    // stays a SEPARATE flag from `level.active` (see useLevel.js — `done` only means "show the splash",
    // it never flips `active` off), so this used to stay true even after the level finished, leaving
    // useTwoHandedBass's per-measure tick loop running indefinitely — it kept counting phantom misses
    // for measures past the song's real end. `!level.done` stops the whole bass-hand system (grading,
    // keyboard panel, combat visuals) the instant the splash appears — see also useTwoHandedBass.js's
    // own defensive fix (never miss-score a measure with no real expected root).
    const twoHandedActive = level.active && !level.done && !!level.current?.twoHanded;
    // #864 (Han 2026-08-10, "in het portret staat het portret van de enemy (wizard), en anders een groene
    // slime") + #922 round 2 (Han: "level 11 heeft een wizard enemy, ik verwacht het portret te zien. zelfde
    // bij levels met echte vijanden, toon portret of sprite. bijvoorbeeld bij sakura wil ik de japanese
    // musician zien... enkel slime bij geen npc enemy"): the earlier Wizard/Slime-only binary missed TWO
    // other level fields that also mean "there's a real speaker here, not just a slime" — a level's own
    // named decorative NPC (`npc`, e.g. Sakura's "Japanese Musician" — resolved via the SAME
    // `findCreatureByName` SheetRpgLayer already uses to render it in-level, §6c/§6d) and `decorativeWizard`
    // (a green wizard standing beside, even though the actual combat `enemyType` might still be Slime —
    // Level 11). Priority: named npc > decorativeWizard/Wizard enemyType > default green slime (no real or
    // decorative NPC at all).
    const levelResultSpeaker = useMemo(() => {
        const lv = level.current;
        const npcName = lv?.npc;
        if (npcName) {
            const variant = findCreatureByName(npcName);
            if (variant) return { kind: 'npc', entity: npcName, variant };
        }
        if (lv?.decorativeWizard || lv?.enemyType === 'Wizard') return { kind: 'wizard', entity: 'wizard' };
        return { kind: 'slime', entity: 'slime' };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [level.current?.id]);
    const levelResultPortrait = levelResultSpeaker.kind === 'npc'
        ? { url: levelResultSpeaker.variant.url, crop: levelResultSpeaker.variant.crop, cellW: levelResultSpeaker.variant.frame.w, cellH: levelResultSpeaker.variant.frame.h }
        : levelResultSpeaker.kind === 'wizard'
            ? { url: WIZARD_URL, crop: WIZARD_CROP, cellW: WIZARD_FRAME.w, cellH: WIZARD_FRAME.h }
            : { url: SLIME_COLORS.green, crop: SLIME_CROP, cellW: SLIME_FRAME.w, cellH: SLIME_FRAME.h };
    // #922 (Han 2026-08-12, "de wizard heeft een portret, toon het portret niet de sprite"): the Wizard's
    // OWN dedicated Bestiary portrait (a DIFFERENT asset than the in-combat sprite crop above), shown
    // instead of the sprite for the post-combat conversation. Neither the slime nor Sakura's Japanese
    // Musician has a dedicated portrait, so both keep using their sprite crop (`levelResultPortrait` above).
    const wizardDedicatedPortrait = useMemo(() => (levelResultSpeaker.kind === 'wizard' ? findCreatureByName('Wizard') : null), [levelResultSpeaker.kind]);
    // #922 round 2 (Han: "je hebt nu de lorem ipsum op de slime van het level gezet, maar ik wou die op de
    // slime van de RPG-wereld"): post-combat now gets a short line per speaker kind — the full lorem ipsum
    // moved to the open-world slime (useRpgLevelState.js's `clickSlime`). Memoized on the level id so a
    // re-render mid-conversation doesn't reshuffle the content underneath it.
    const levelResultPages = useMemo(() => {
        const pool = levelResultSpeaker.kind === 'wizard' ? WIZARD_VICTORY_LINES
            : levelResultSpeaker.kind === 'npc' ? NPC_GREETING_LINES
                : SLIME_DEFEAT_LINES;
        return [pool[Math.floor(Math.random() * pool.length)]];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [level.current?.id, levelResultSpeaker.kind]);
    // #922: ONE shared instrument cache for the whole app's conversation system (§6c) — created here so
    // both this post-combat dialogue AND RpgLevelBottomPanel's wisp/slime dialogue (passed down via
    // TabView) reuse the SAME lazily-loaded Soundfont instances instead of loading ocarina/marimba/
    // xylophone/koto twice.
    const getConversationProfile = useConversationInstruments(context);
    const levelResultProfile = getConversationProfile(levelResultSpeaker.entity);
    const levelResultDialogue = useConversationDialogue({
        pages: levelResultPages, active: characterScreen === 'levelResult' && !!level.current,
        context, bpm, timeSignature, profile: levelResultProfile,
        autoContinue: rpgLevel.autoContinue,
    });
    const twoHandedBass = useTwoHandedBass({
        active: twoHandedActive,
        context,
        levelAudioStart,
        bpm,
        timeSignature,
        bassMelody: levelBackingStream.bass,
        onHit: level.onHit,
        onMiss: level.onMiss,
    });
    // Toggle between Han's two Level 15 keyboard-layout options (both required, per interview):
    // 'separate' = two full keyboards (ZXCV.../ bass row + the app-wide QWERTY treble row); 'split' =
    // one keyboard split into a C3-G3 half (Q-T) and a C4-G4 half (I-]). Persisted like other simple
    // UI prefs (localStorage), defaults to 'separate' (matches the "twee toetsenborden" framing most
    // directly).
    const [twoHandedLayout, setTwoHandedLayout] = useState(() => {
        try { return localStorage.getItem('twoHandedLayout') || 'separate'; } catch { return 'separate'; }
    });
    useEffect(() => {
        try { localStorage.setItem('twoHandedLayout', twoHandedLayout); } catch { /* storage unavailable */ }
    }, [twoHandedLayout]);
    // #693 (Han 2026-08-04, round 7): starting a level closes the character UI + any open edit-mode
    // overlays (they don't make sense mid-combat and would otherwise cover the level) and switches
    // the input view to the TOP (treble) key row — the input the player actually needs.
    // Level 0 (Han 2026-08-06, "dat wil ik in de 'config' voor het begin van het level doen, dus niet
    // via instelling overlay"): `n` is normally a level id (number), but LevelStartSplash's Level-0 form
    // now passes a FULL, hand-edited level object instead — `level.start` already accepts either shape
    // (it just assigns whatever it's given to `current`), so this only needs to skip the id lookup.
    const startLevel = useCallback((n) => {
        const lvl = typeof n === 'object' ? n : (LEVELS[n] || LEVELS[1]);
        // Bug fix (Han 2026-08-06, "audio-context mag niet starten met spelen voordat de melodie geladen
        // is... metronoom, cello, en melodie time checker zouden allemaal gebruik moeten maken van
        // dezelfde timer"): if the user was mid-playback (normal practice-mode Sequencer running) when
        // they hit Start, that playback was NEVER stopped — it kept sounding concurrently with the
        // level's own bass/metronome/timpani scheduling, an entirely separate, unrelated audio source
        // layered on top. That's real, audible "soup" with no shared clock at all (it isn't anchored to
        // `levelAudioStart`), independent of every anchor/readiness fix so far. Stop it FIRST, before
        // anything else, so the level always starts from total silence.
        handleStopAllPlayback();
        context.resume?.();
        closeAllEditModes();
        setCharacterScreen(null);
        setActiveTab('piano');
        level.start(lvl);
    }, [context, level, closeAllEditModes, setCharacterScreen, setActiveTab, handleStopAllPlayback]);
    // #693 (round 7): the header Pause button opens LevelPausePopup instead of the old floating
    // "■ Stop" button. Quit ends the level exactly like the old Stop button did; Resume rewinds to
    // the start of the measure the player was in, plays a 1-measure metronome count-in, then
    // continues — see the popup's render site below for the full rationale.
    const [levelPaused, setLevelPaused] = useState(false);
    const handleQuitLevel = useCallback(() => {
        stopAllBackingAudio();
        handleStopAllPlayback();
        level.close();
        setLevelPaused(false);
        // Han: "quit: go to splash screen immediately" — reopens the level-picker splash (the same
        // one Start Level opens) so quitting flows straight back into picking another level.
        setShowLevelPicker(true);
    }, [stopAllBackingAudio, handleStopAllPlayback, level]);
    const handleResumeLevel = useCallback(() => {
        setLevelPaused(false);
        if (!context || levelAudioStart == null || !level.active || !level.current) return;
        const lvl = level.current;
        const barBeats = timeSignature[0] || 4;
        // Bug fix (Han 2026-08-06, "de 6/8 maatsoort zorgt dat alles misloopt") — see
        // useLevelBackingStream.js's comment: bar duration must derive from ticks, not
        // beats×denominator-agnostic quarter-seconds.
        const measureLengthTicks = (TICKS_PER_WHOLE * barBeats) / (timeSignature[1] || 4);
        const barSec = measureLengthTicks * secondsPerTick(lvl.bpm || 80);
        const contentStartTime = levelAudioStart + LEVEL_LEAD_IN_BARS * barSec;
        // The measure the player was IN at the moment of pause (0-based, clamped so a pause during
        // the lead-in rewinds to measure 1, not a negative index).
        const elapsedContent = Math.max(0, context.currentTime - contentStartTime);
        const measureIndexAtPause = Math.floor(elapsedContent / barSec);
        const measureStartOffsetSec = measureIndexAtPause * barSec;
        // Tear down everything currently scheduled/sounding (identical to Quit's cleanup) WITHOUT
        // ending the level — stats/wave/current-level state all stay intact.
        stopAllBackingAudio();
        handleStopAllPlayback();
        // Re-anchor so a 1-measure metronome count-in starts NOW and the level's content resumes
        // exactly at the start of the measure the player left off in. Every side-scroll track
        // (bass/metronome/percussion via useLevelBackingStream, treble/wizard via
        // useLevelTrebleStream) is keyed off `levelAudioStart` and regenerates from its own start
        // relative to this new anchor — Han's "clear the input track's pending notes, don't touch
        // the other tracks" is honoured for what the PLAYER must still play (nothing carries over
        // as already-due/already-missed), though the backing/wizard content itself is freshly
        // generated from the resume point rather than replaying byte-identical old content (a full
        // non-destructive resume would need the JIT streams to persist already-generated blocks
        // across a re-anchor — noted as a follow-up, not attempted here).
        setLevelAudioStart(context.currentTime + barSec - LEVEL_LEAD_IN_BARS * barSec - measureStartOffsetSec);
    }, [context, levelAudioStart, level, timeSignature, stopAllBackingAudio, handleStopAllPlayback]);
    // Bug fix (Han 2026-08-10, #824 "de opnieuwknop lijkt het level/audio twee keer te starten"):
    // `level.replay()` alone only resets stats/wave/done and regenerates the practice-mode melody
    // (useLevel.js's `begin`) — it never stops the PREVIOUS playthrough's backing audio nor drops
    // `levelAudioStart`. Since the splash is shown with `level.active` already true, replaying never
    // transitions active false→true, so the `!level.active` cleanup effect above never fires either —
    // any still-sounding/pending backing audio from the finished run is left untouched while a fresh
    // one gets requested, i.e. exactly the doubling Han reported. `handleResumeLevel` above already
    // solves the identical "cleanly restart this level's audio" problem for pause/resume — reuse that
    // same stop-then-reanchor shape (§6c) rather than inventing a second one: stop everything, then null
    // the anchor so the EXISTING readiness-gated anchor-picking effect (line ~1199) naturally re-fires
    // and every JIT stream (useLevelBackingStream/useLevelTrebleStream/etc.) tears down its stale timers
    // via their own effect cleanup and starts clean.
    const handleReplayLevel = useCallback(() => {
        stopAllBackingAudio();
        handleStopAllPlayback();
        setLevelAudioStart(null);
        level.replay();
        setCharacterScreen(null);   // #863 — leave the level-result top-view panel, back to live gameplay
    }, [stopAllBackingAudio, handleStopAllPlayback, level]);
    // #863 (Han 2026-08-10, "zet het splash screen in zijn volledigheid in de top view. sluit het level
    // af, en toon de statistieken"): the level-result panel now lives in the SAME top-view slot as the
    // avatar/stats/bestiary panels (characterScreen === 'levelResult') instead of a floating modal — auto-
    // selected the instant the level completes, so it isn't a separate render condition to keep in sync.
    useEffect(() => { if (level.done) setCharacterScreen('levelResult'); }, [level.done]);
    const handleCloseLevelResult = useCallback(() => {
        level.close();
        setCharacterScreen(null);
    }, [level]);
    // Stop any scheduled backing + drop the anchor when the level ends (splash close / replay handles its own).
    useEffect(() => {
        if (!level.active) {
            stopAllBackingAudio();
            setLevelAudioStart(null);
        }
    }, [level.active, stopAllBackingAudio]);
    // Watchdog + self-heal (Han 2026-08-10, "ik zit nu zelfs in de situatie dat de melodie helemaal nooit
    // komt... het is NIET robuust geïmplementeerd"): a structural safety net for the case where the
    // visual clock (SheetRpgLayer's own tick loop) never unfreezes at all despite `levelAudioStart`
    // being set — root cause unconfirmed (couldn't be reproduced live), so this doesn't claim to FIX the
    // cause; it detects the symptom and recovers instead of leaving the level permanently stuck. If
    // `onFirstTickUnfrozen` (below) hasn't fired within a generous window after an anchor is set, log an
    // error and null the anchor so the readiness-gated anchor-picking effect (line ~1201) re-fires and
    // tries again from scratch — capped at 2 retries so a persistently broken state fails loudly
    // (E026) instead of retrying forever.
    const firstTickUnfrozenRef = useRef(false);
    const watchdogRetriesRef = useRef(0);
    const handleFirstTickUnfrozen = useCallback(() => {
        firstTickUnfrozenRef.current = true;
        watchdogRetriesRef.current = 0;   // a successful unfreeze resets the retry budget for next time
    }, []);
    useEffect(() => {
        if (levelAudioStart == null || !level.active) return;
        firstTickUnfrozenRef.current = false;
        const WATCHDOG_MS = 4000;   // generous: 0.5s anchor buffer + instrument-load slack, well under it
        const timer = setTimeout(() => {
            if (firstTickUnfrozenRef.current) return;
            if (watchdogRetriesRef.current >= 2) {
                logger.error('App', 'E026-LEVEL-VISUAL-CLOCK-STUCK', new Error('visual clock never unfroze after retries'), {
                    levelAudioStart, retries: watchdogRetriesRef.current,
                });
                return;
            }
            watchdogRetriesRef.current += 1;
            logger.warn('App', 'Level visual clock did not unfreeze in time — resetting anchor and retrying', {
                levelAudioStart, attempt: watchdogRetriesRef.current,
            });
            stopAllBackingAudio();
            setLevelAudioStart(null);   // the anchor-picking effect re-fires once readiness is (still) true
        }, WATCHDOG_MS);
        return () => clearTimeout(timer);
    }, [levelAudioStart, level.active, stopAllBackingAudio]);

    // #659 (Han): on PC (non-touch) the QWERTY keyboard input is ON by default — so you can play the combat
    // notes straight away without toggling it on. Touch devices keep it off (no physical keyboard).
    useEffect(() => { if (!isTouch) setQwertyKeyboardActive(true); }, [isTouch, setQwertyKeyboardActive]);

    const handleSetInputTestSubMode = useCallback((mode) => {
        setInputTestSubMode(mode);
        // Keyboard is only active in 'note' (Piano) mode
        setQwertyKeyboardActive(mode === 'note');
    // setQwertyKeyboardActive is a stable useState setter — identity never changes (React 18).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setInputTestSubMode]);

    // START an exercise (#266 rework 3, Han 2026-07-05: the exercise must be
    // FUNCTIONAL). What starting means follows the TEMPO axis:
    //   fixed  → the music PLAYS (continuous playback; the active input staff is
    //            muted by the axes config) and the input test runs in 'live'
    //            submode — the rAF tracker follows the sounding note and a note
    //            you don't answer in time counts as a miss + TOO SLOW flash.
    //   rubato → input-test 'note' mode: no fixed clock, the accompaniment
    //            follows YOUR tempo (isRubato is already ON via the tempo axis —
    //            note mode IS the rubato entry point, see rubatoEngageRef).
    // Defined here (not with the axes handlers) because it needs the playback +
    // input-test handlers that only exist after usePlayback/useInputTest.
    const handleStartExercise = useCallback(() => {
        setExerciseEditMode(false); // close the setter; the songs tab stays below
        // #267: every START opens a bounded run (A3 in the plan) — the score-event
        // wrapper counts completions and ends the run at the target.
        exerciseRunRef.current = { target: EXERCISE_RUN_TARGET, completed: 0 };
        setExerciseRun(exerciseRunRef.current);
        if (!isInputTestModeRef.current) handleToggleInputTest();
        if (exerciseAxes.tempo === 'rubato') {
            handleSetInputTestSubMode('note');
            return;
        }
        handleSetInputTestSubMode('live');
        // Write the ref SYNCHRONOUSLY: onPlaybackStartRef (fired by the play
        // call below, same tick) reads inputTestSubModeRef.current to decide
        // whether to kill the input test — the state-sync effect only lands
        // after the next render, which would be too late.
        inputTestSubModeRef.current = 'live';
        // In LIVE submode playback and input test coexist (onPlaybackStartRef
        // keeps the test alive); handlePlayContinuouslyLogic starts the plain
        // sequencer loop — deliberately NOT the rubato-intercepting wrapper.
        handlePlayContinuouslyLogic();
    // isInputTestModeRef is a ref — stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [exerciseAxes.tempo, setExerciseEditMode, handleToggleInputTest, handleSetInputTestSubMode, handlePlayContinuouslyLogic]);

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

    // #267: end-of-run stopper — populated here because it needs
    // handleStopAllPlayback + handleToggleInputTest, which don't exist where the
    // run refs are declared. Stops playback AND the input test; the session-end
    // effect then fires and shows the summary card (gate already satisfied by
    // the completed melodies).
    useEffect(() => {
        endExerciseRunRef.current = () => {
            exerciseRunRef.current = null;
            handleStopAllPlayback();
            if (isInputTestModeRef.current) handleToggleInputTest();
        };
        return () => { endExerciseRunRef.current = null; };
    // endExerciseRunRef/exerciseRunRef/isInputTestModeRef are refs — stable identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleStopAllPlayback, handleToggleInputTest]);

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

    // Gamification session boundaries (#134). A "session" is any continuous
    // stretch of playback and/or input-test activity; watching the combined
    // flag here means NO wrapping of handleStopAllPlayback (which a dozen
    // consumers hold) and no onPlaybackStart coupling. Rapid stop→start while
    // configuring produces tiny sessions that the ≥1-completed-melody gate in
    // endSession() filters out (Han 2026-07-02).
    const sessionActiveRef = useRef(false);
    useEffect(() => {
        const active = isPlaying || isInputTestMode;
        if (active && !sessionActiveRef.current) {
            sessionActiveRef.current = true;
            setSessionSummary(null); // starting new activity dismisses a lingering card
            beginSession();
        } else if (!active && sessionActiveRef.current) {
            sessionActiveRef.current = false;
            // #267: a session end also ends any exercise run (user stopped early,
            // or the run stopper just fired — either way the chip must clear).
            exerciseRunRef.current = null;
            setExerciseRun(null);
            const summary = endSession();
            if (summary) setSessionSummary(summary);
        }
    }, [isPlaying, isInputTestMode, beginSession, endSession]);

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
        // #134 gamification: the Sequencer calls this at every repetition boundary
        // (n ≥ 1 per rep, n === 0 at each series flip), which is exactly the
        // "listened to a full melody / full series" signal — no Sequencer edits
        // needed. Gate on isPlaying so App's own resets (onStop above passes
        // through the raw setter) and mount-time calls don't award listen XP.
        setIterInCurrentSeries: (n) => {
            setIterInCurrentSeries(n);
            if (sequencerRef.current?.isPlaying) {
                recordEventRef.current(n === 0 ? 'seriesComplete' : 'melodyListened', buildScorePayload());
            }
        },
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
        setCurrentMeasureIndex, setDisplayChordProgression, setNextLayer, setPreviewMelody, setIterInCurrentSeries,
        buildScorePayload]);

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
        // #436 (Han: the range-PRESET setter "weet niet dat ze chord kleuren mag gebruiken als er
        // geen akkoord actief is") — route through the SHARED representativeChord, which adds the
        // tritone-of-tonic fallback when the progression has no chord, so 'chords' colouring is
        // ALWAYS visible on the keyboard / range-preset surfaces too.
        return representativeChord(chords.map(c => ({ isSlash: false, chord: c })), scale.tonic);
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


    const { isDualView, sheetHeight, btmPanelHeight, rpgLevelTopHeight, tabBtnScale, idealVisibleMeasures } = useAppLayout(windowSize, numMeasures);

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
        rangeEditMode: rangeEditMode,
        clefEditMode: clefEditMode,
        colorEditMode: colorEditMode,
        instrumentEditMode: instrumentEditMode,
        playbackEditMode: playbackEditMode,
        generationEditMode: generationEditMode,
        generationAdvancedEditMode: generationAdvancedEditMode,
        exerciseEditMode: exerciseEditMode,
        onSelectExercise: handleSelectExercise,
        activeExerciseId: activeExerciseId,
        exerciseAxes: exerciseAxes,
        onExerciseAxisChange: handleExerciseAxisChange,
        onStartExercise: handleStartExercise,
        onCloseRangeEdit: handleCloseRangeEdit,
        onCloseClefEdit: handleCloseClefEdit,
        onOpenClefEdit: handleOpenClefEdit,
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
        windowSize.width, randomizeMeasure, rangeEditMode, clefEditMode, colorEditMode, instrumentEditMode,
        playbackEditMode, generationEditMode, generationAdvancedEditMode, exerciseEditMode,
        handleSelectExercise, activeExerciseId, exerciseAxes, handleExerciseAxisChange,
        handleStartExercise,
        handleCloseRangeEdit, handleCloseClefEdit, handleOpenClefEdit,
        svgRef, isFullscreen, toggleFullscreen, headerPlayMode, setHeaderPlayMode,
        handleToggleInputTest, handlePlayMelody, handlePlayContinuously, isPlayingContinuously, isPlaying,
        showNotes, showChordLabels, showChordsOddRounds, showChordsEvenRounds,
        handleNoteClick, handleChordClick, handleEnharmonicToggle, handleMeasureNumberClick,
        handleNoteEnharmonicToggle, handlePreviewInstrument]);

    return (
        <PlaybackConfigProvider value={playbackConfigCtx}>
        <InstrumentSettingsProvider value={instrumentSettingsCtx}>
        <DisplaySettingsProvider value={displaySettingsCtx}>
        <MelodyProvider
            // #693 (round 6): while Level 9 is streaming its JIT-generated call-response blocks, the
            // growing treble melody replaces the normal one — same override pattern bass/metronome
            // already use below.
            treble={(level.active && level.current?.enemyType === 'Wizard') ? levelTrebleStream.treble
                : (level.active && level.current?.enemyType === 'Mixed') ? levelMixedStream.treble
                : (level.active && level.current?.decorativeWizard) ? levelKeyModulationStream.treble
                : (mergedRenderMelodies ? mergedRenderMelodies.treble : melodies.treble)}
            // #663: while a side-scroll level is streaming its JIT-generated backing, the growing
            // level bass/metronome melodies replace the normal ones — SheetMusic's scrollNotationBass
            // (and the level's metronome audio, scheduled inside useLevelBackingStream) must show/play
            // exactly the same content, never the once-generated `melodies.bass`/`.metronome`.
            bass={(level.active && level.current?.sideScroll) ? twoHandedBassMelody
                : (mergedRenderMelodies ? mergedRenderMelodies.bass : melodies.bass)}
            percussion={mergedRenderMelodies ? mergedRenderMelodies.percussion : melodies.percussion}
            metronome={(level.active && level.current?.sideScroll) ? levelBackingStream.metronome : melodies.metronome}
            chordProgression={mergedRenderMelodies ? mergedRenderMelodies.chordProgression : chordProgression}
            // #858/#871 follow-up: timpani and (now) the level's cello backing are both audio-only
            // instances — see the `timpaniMelody` useMemo above and `levelBackingStream.bass` below.
            // `undefined` (not an empty object) when there's nothing to carry, so MelodyProvider's own
            // stable-empty-object default applies.
            invisibleMelodies={(timpaniMelody || (level.active && level.current?.sideScroll && levelBackingStream.bass)) ? {
                ...(timpaniMelody ? { [LEVEL_TIMPANI_SLOT]: timpaniMelody } : {}),
                ...((level.active && level.current?.sideScroll) ? { [LEVEL_CELLO_SLOT]: levelBackingStream.bass } : {}),
            } : undefined}
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
            {/* #661 MIDI debug overlay (Han: "kun je ergens debug midi events tonen"). Web-MIDI status,
                connected input names, event count + last raw bytes — only in debugMode now that MIDI is
                confirmed working (Han 2026-08-01: works in Chrome; VS Code's webview blocked it). */}
            {debugMode && (
                <div style={{ position: 'fixed', top: 4, right: 4, zIndex: 99999, background: 'rgba(0,0,0,0.72)',
                    color: midiStatus.state === 'granted' ? '#6f6' : (midiStatus.state === 'denied' || midiStatus.state === 'unsupported' ? '#f66' : '#fd6'),
                    font: '10px monospace', padding: '3px 6px', borderRadius: 4, pointerEvents: 'none', whiteSpace: 'pre', lineHeight: 1.3 }}>
                    {`MIDI: ${midiStatus.state}${midiStatus.inputs.length ? ` [${midiStatus.inputs.join(', ')}]` : ''}`}
                    {midiStatus.lastData ? `\n#${midiStatus.count}  [${midiStatus.lastData.join(', ')}]` : '\n(no events yet)'}
                </div>
            )}
            {/* Level config debug dump MOVED (Han 2026-08-06, "ik wil de level params zien tijdens het
                'start level' splash screen, niet tijdens het level") — now lives in LevelStartSplash
                (the level picker), not here; during-level was the wrong place since you can't change
                your pick by then anyway. See LevelStartSplash.jsx's own `debugMode` dump. Level 0's own
                editing ALSO moved there (a pre-start config form, Han: "niet via instelling overlay") —
                the `LevelZeroPanel` in-level corner panel is gone. */}
            {/* #693 (Han 2026-08-04, round 7 — "de stop button voelt totally not integrated... zou de
                'start level' button moeten vervangen in de header"): the old floating "■ Stop" button
                is gone — the header's Swords/Pause button slot (AppHeader) now handles this, opening
                LevelPausePopup below instead of stopping outright. */}
            {levelPaused && level.active && !level.done && (
                <LevelPausePopup levelName={level.current?.name} onResume={handleResumeLevel} onQuit={handleQuitLevel} />
            )}
            {/* TOP AREA WRAPPER (Preserves app theme for header/sheet) */}
            <div className="App app-top-wrapper">
                {/* #628-S5: canvas disco-ball background — only mounted for the disco theme; sits behind
                    the (transparent) header + sheet via .disco-canvas (z-index:-1 + isolate). */}
                {theme === 'disco' && <DiscoBackground />}
                {/* #661 (Han 2026-08-02): "een splash screen voor het level start, met daarin een tanh
                    carousel dat het level nummer kiest" — replaces the header's old 3 separate per-level
                    buttons. */}
                {showLevelPicker && (
                    <LevelStartSplash
                        onStart={(n) => { startLevel(n); setShowLevelPicker(false); }}
                        onClose={() => setShowLevelPicker(false)}
                        debugMode={debugMode}
                    />
                )}
                <AppHeader
                    onOpenLevelPicker={() => setShowLevelPicker(true)}
                    levelActive={level.active && !level.done}
                    onPauseLevel={() => setLevelPaused(true)}
                    scale={scale}
                    onStartExercise={handleStartExercise}
                    /* #533: the header Thronefall crown was removed — the colour setter's theme
                       carousel now covers it (and every other theme). */
                    isFullscreen={isFullscreen}
                    toggleFullscreen={toggleFullscreen}
                    displayTonic={displayTonic}
                    globalInstLabel={globalTransposition ? `${globalTransposition.label} instrument` : null}
                    isPlayingMelody={isPlayingMelody}
                    handlePlayMelody={handlePlayMelody}
                    handlePlayRepeat={handlePlayRepeat}
                    isPlayingContinuously={isPlayingContinuously}
                    handlePlayContinuously={handlePlayContinuously}
                    customScaleLabel={customScaleLabel}
                    headerPlayMode={headerPlayMode}
                    setHeaderPlayMode={setHeaderPlayMode}
                    windowWidth={windowSize.width}
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
                    characterScreen={characterScreen}
                    onToggleCharacterView={() => setCharacterScreen((s) => {
                        if (s) return null;
                        closeAllEditModes();   // #667: avatar-context is exclusive with range/clef/colour/etc.
                        return 'equipment';
                    })}
                />

                {/* #667 (Han 2026-08-03): "binnen LEVEL context: geen subheader; binnen AVATAR context: 4
                    char opties; binnen bladmuziek context: 8 bestaande sub header opties." Level 0's
                    live-editing was moved to a PRE-START config form in LevelStartSplash (Han 2026-08-06,
                    "dat wil ik in de config voor het begin van het level doen, niet via instelling
                    overlay") — so this stays a flat, unconditional level-hides-subheader rule again, no
                    id-0 exception. */}
                {level.active ? null : characterScreen ? (
                    <AvatarSubHeader screen={characterScreen} setScreen={setCharacterScreen} />
                ) : (
                <SubHeader
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
                    onOpenRange={handleToggleRangeEdit}
                    onOpenClef={handleToggleClefEdit}
                    onOpenColor={handleToggleColorEdit}
                    onOpenInstrument={handleToggleInstrumentEdit}
                    onOpenPlayback={handleTogglePlaybackEdit}
                    onOpenGeneration={handleToggleGenerationEdit}
                    onOpenGenerationAdvanced={handleToggleGenerationAdvancedEdit}
                    onOpenExercises={handleToggleExerciseEdit}
                    rangeEditMode={rangeEditMode}
                    clefEditMode={clefEditMode}
                    colorEditMode={colorEditMode}
                    instrumentEditMode={instrumentEditMode}
                    playbackEditMode={playbackEditMode}
                    generationEditMode={generationEditMode}
                    generationAdvancedEditMode={generationAdvancedEditMode}
                    exerciseEditMode={exerciseEditMode}
                    exerciseRun={exerciseRun}
                    windowWidth={windowSize.width}
                    difficultyMultiplier={actualDifficulty.multiplier}
                />
                )}

                {/* TOP SECTION: SHEET MUSIC & PLAYBACK
                    Han 2026-08-02 (BUG — "bottom view schuift weer omhoog" after the scaleFactor cap):
                    `flex: 1` sets flex-basis to 0%, which OVERRIDES the explicit `height: sheetHeight` for
                    sizing purposes — so in dual-view this box's actual height was never really pinned at
                    `sheetHeight`, it was just winning a 1-vs-1 flex-grow contest against the BOTTOM SECTION
                    below (line ~2058, also `flex: 1`), which happened to land near the intended split only
                    when the sheet-music content's min-content height cooperated. Once the reference-capped
                    scaleFactor (§98) made the rendered content shorter, that contest could resolve
                    differently and the bottom panel crept up. Fix (dual-view only, Han): give this box a
                    fixed flex-basis of `sheetHeight` with grow/shrink OFF, so it never competes for space —
                    the BOTTOM SECTION's own `flex: 1` then simply fills 100% of whatever remains below it,
                    pinning it to the screen's bottom edge regardless of how tall the sheet-music content
                    renders. Single-view (mobile) is untouched — Han scoped this fix to dual-view only. */}
                <div
                    style={{
                        // #RAM-level (Han 2026-08-11, "je mag bottom view iets kleiner maken om ruimte te
                        // maken"): the RPG hub level gets its own, taller top-panel height instead of the
                        // shared sheet-music split — see useAppLayout.js's `rpgLevelTopHeight`.
                        flex: isDualView ? `0 0 ${characterScreen === 'rpg-level' ? rpgLevelTopHeight : sheetHeight}px` : 1,
                        height: isDualView ? (characterScreen === 'rpg-level' ? rpgLevelTopHeight : sheetHeight) : 'auto',
                        display: (activeTab === 'sheet-music' || isDualView || characterScreen) ? 'flex' : 'none',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 20px',
                        position: 'relative'
                    }}
                >
                    {/* #667 (Han 2026-08-03): avatar-context REPLACES sheet-music here (top) — the popup is
                        gone; the same top slot now shows the avatar (+ equipment slots, or the bestiary
                        preview) instead. */}
                    {characterScreen === 'character' && <CharacterAvatarPanel editor={characterEditor} screen="character" debugMode={debugMode} />}
                    {characterScreen === 'equipment' && <CharacterAvatarPanel editor={characterEditor} screen="equipment" debugMode={debugMode} />}
                    {characterScreen === 'stats' && <StatsTopPanel />}
                    {characterScreen === 'bestiary' && <BestiaryTopPanel editor={bestiaryEditor} debugMode={debugMode} />}
                    {characterScreen === 'rpg-level' && <RpgLevelPanel characterEditor={characterEditor} rpgLevel={rpgLevel} debugMode={debugMode} bpm={bpm} timeSignature={timeSignature} context={context} instruments={instruments} onGenerateVoice={generateAndPlayVoice} />}
                    {characterScreen === 'levelResult' && level.current && (
                        <LevelSplash levelName={level.current.name} stats={level.stats}
                            totalEnemies={level.totalEnemies} totalCritters={level.totalCritters}
                            timed={!!level.current.sideScroll} twoHanded={!!level.current.twoHanded}
                            onReplay={handleReplayLevel} onClose={handleCloseLevelResult} />
                    )}
                    {!characterScreen && (
                    <ErrorBoundary boundary="sheet-music">
                        <SheetMusic
                            {...sheetMusicCommonProps}
                            onOpenCharacter={() => { closeAllEditModes(); setCharacterScreen('equipment'); }}   // #647/#667 hero click opens avatar-context
                            combatNote={combatNote}                          // #647 combat — last played note
                            // #862 (Han 2026-08-10, "doe maar meteen - ik wil 15 volledig kunnen testen"):
                            // bass-hand combat for twoHanded levels — the melody to spawn bass-slimes from
                            // (already clipped to start at measure 1, §189) and the hit/miss EVENT
                            // useTwoHandedBass emits (SheetRpgLayer resolves the matching slime off it,
                            // reusing that hook's grading rather than re-deriving it — §6c).
                            twoHandedBassMelody={twoHandedActive ? twoHandedBassMelody : null}
                            bassCombatEvent={twoHandedActive ? twoHandedBass.event : null}
                            // #647/#659: a cleared wave advances the level (splash at the end); otherwise it
                            // just regenerates a fresh wave. #688: Level 9 is a single wave again (like
                            // every other side-scroll level), so this is unconditional again.
                            onSlimesCleared={() => { if (!level.onWaveCleared()) randomizeAll({ chords: false }); }}
                            // #688 (Han: "end of level splash... pas wanneer end of song de hit zone
                            // bereikt") — fired by SheetRpgLayer when the final barline visually crosses
                            // the strike line; flips `done` only if a wave-clear is pending one.
                            onSongEnd={level.onSongEnd}
                            onFirstTickUnfrozen={handleFirstTickUnfrozen}
                            onCombatHit={level.active ? level.onHit : undefined}
                            onCombatMiss={level.active ? level.onMiss : undefined}
                            // #693 round 8 ("critters onder rusten... critters killed" stat + "enemies
                            // vanquished x/n" / "critters saved y/m" totals for the splash).
                            onCritterKilled={level.active ? level.onCritterKilled : undefined}
                            onEnemyTotal={level.active ? level.setTotalEnemies : undefined}
                            onCritterTotal={level.active ? level.setTotalCritters : undefined}
                            sideScroll={level.active && !!level.current.sideScroll}   // #660 Level 2
                            levelActive={level.active}                                // #662 no slimes outside a level
                            levelMelodyReady={levelMelodyReady}                       // Bug fix 2026-08-06: withhold stale pre-regen melody
                            // Level 10 (Han 2026-08-06, Mixed): SheetRpgLayer now understands 'Mixed'
                            // natively — a black static wizard is always shown, and each note renders
                            // as a Slime or Projectile per its OWN block (Han: "de noten van de
                            // wizardmaten moeten geen slime hebben, maar een projectile krijgen").
                            enemyType={level.active ? level.current.enemyType : 'Slime'}   // #679 Level 9 — Wizard/projectile combat
                            wizardSpawnLeadMeasures={level.active ? (level.current.wizardSpawnLeadMeasures ?? 1) : 1}   // #686
                            decorativeWizard={level.active && !!level.current?.decorativeWizard}   // Level 11
                            npc={level.active ? (level.current?.npc ?? null) : null}               // #871
                            hideHero={activeTab === 'other-settings'}                 // #662 hide avatar on the Settings tab
                            levelAudioStart={level.active ? levelAudioStart : null}   // §88 scroll↔metronome anchor
                            containerHeight={sheetHeight}
                            visibleMeasures={effectiveVisibleMeasures}
                            startMeasureIndex={renderStartMeasureIndex}
                            blockMeasureStart={blockMeasureStart}
                            blockPlayStart={blockPlayStart}
                            // #529: the authoritative Scale (sheetMusicCommonProps only carries
                            // scale.tonic / scale.numAccidentals, not the object) — the chord-notation
                            // setter derives its key-relative diatonic ii-V-I sample from it.
                            scale={scale}
                            // #533: the colour setter's in-staff theme carousel switches the app theme.
                            // appTheme is the REACTIVE theme (SheetMusic otherwise reads data-theme off
                            // the DOM non-reactively, so it wouldn't re-render — and the theme carousel's
                            // activeIndex would stay stale — after a swatch pick).
                            setTheme={setTheme}
                            appTheme={theme}
                            // #532: the colour setter's font carousel switches the app-wide text font.
                            appFont={appFont}
                            setAppFont={setAppFont}
                        />
                    </ErrorBoundary>
                    )}
                </div>
            </div> {/* END TOP AREA WRAPPER */}

            {/* BOTTOM SECTION: PANEL (Full height in landscape)
                `flex: 1` here now fills exactly whatever remains below the TOP SECTION (which lost its
                grow/shrink above) — pinning this panel to the screen's bottom edge (Han 2026-08-02). */}
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
                    {/* #679/#681 (Han 2026-08-03/04, correction: "de subtypes... kwamen te staan waar nu
                        staat top bottom percussion... die bottom view settings zijn redundant in bestiary
                        mode"): while avatar-context is active, TOP/BOTTOM/PERCUSSION/etc select a sheet-music
                        tab that isn't even rendered (TabView's characterScreen branch ignores activeTab
                        entirely, §667) — dead controls. Swap this whole column for the active screen's OWN
                        category tabs instead (character's skin/ears/hair); a screen with no categories
                        (equipment — its top slot-grid is its own picker; stats) simply renders no tabs here.
                        #870 (Han 2026-08-12, "de oude 'passive, with portrait, etc.' pre-selecties zijn
                        vervangen voor het tag-systeem"): bestiary no longer gets a category-tab row at all —
                        replaced by BestiaryBottomPanel's own filter bar (Mature/Unfinished + tag chips), so
                        it now renders no tabs here either, same as equipment/stats. */}
                    {characterScreen ? (
                        (characterScreen === 'character'
                            ? CHARACTER_CATEGORIES.map((key) => ({
                                key, label: catByKeyLabel(key, AVATAR_CATEGORIES) || key,
                                active: characterEditor.activeCat === key,
                                onClick: () => characterEditor.setActiveCat(key),
                            }))
                            : []
                        ).map((t) => (
                            <button key={t.key}
                                className={`tab-button ${t.active ? 'active' : ''}`}
                                onClick={t.onClick}
                                style={{
                                    width: (75 * tabBtnScale) + 'px',
                                    minWidth: (75 * tabBtnScale) + 'px',
                                    transform: `scale(${tabBtnScale})`,
                                    transformOrigin: 'center',
                                    outline: debugMode ? '2px solid cyan' : undefined,
                                }}
                            >
                                <span className="tab-label">{t.label}</span>
                            </button>
                        ))
                    ) : (
                    <>
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
                    </>
                    )}
                </div>

                {/* CONTENT AREA — Han 2026-08-01: the bottom panel (keyboard + selector) was taking ~60% of the
                    screen; useAppLayout computes a 40%-of-height cap in `btmPanelHeight` but App wasn't applying
                    it. Wrap the content in a height-capped, overflow-hidden flex column so the keyboard scales
                    to ≤40% (dual-view only; single-view keeps auto height). */}
                <div style={isDualView
                    ? { height: btmPanelHeight, maxHeight: btmPanelHeight, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }
                    : undefined}>
                {twoHandedActive ? (
                    // #FR2 (Han 2026-08-10, Level 15): TabView's tab bar is already suppressed while a
                    // level is active (`level.active ? null : ...` above) — replacing its content
                    // outright with the two-handed panel is safe, no other tab is reachable mid-level.
                    <TwoHandedKeyboardPanel
                        scale={scale}
                        trebleInstrument={instruments.treble}
                        // Bug fix (Han 2026-08-10, "zet bass instrument op piano" + "zet de cello... op een
                        // apart kanaal als extra melodie... niet als bass melody"): the bass-hand keyboard
                        // plays through the SAME instrument the treble keyboard uses (piano) instead of
                        // `instruments.bass` — this ALSO satisfies the "separate channel" ask for free.
                        // #871 follow-up (Han 2026-08-11): the level's cello guide (`levelBackingStream.bass`)
                        // now plays through its own dedicated `celloRef` Soundfont, not `instruments.bass`
                        // at all anymore — the separation this comment originally called out is now even
                        // stronger than when it was written.
                        bassInstrument={instruments.treble}
                        noteColoringMode={noteColoringMode}
                        theme={theme}
                        qwertyKeyboardActive={qwertyKeyboardActive}
                        onTrebleNoteInput={handleNoteInputCombat}
                        onBassNoteInput={twoHandedBass.handleBassNoteInput}
                        layout={twoHandedLayout}
                        onLayoutChange={setTwoHandedLayout}
                        // Bug fix (Han 2026-08-10, "die tonen opeens full range, niet de level range"):
                        // both keyboards must show the LEVEL's own configured range, for both layouts.
                        trebleRange={trebleSettings?.range}
                        bassRange={bassSettings?.range}
                    />
                ) : characterScreen === 'levelResult' && level.current ? (
                    // #864 (Han 2026-08-10, "na het level, tijdens splash screen, wil ik beneden een
                    // dialoogveld, zoals de wisp heeft in de rpg-wereld: 'woah, you beat me...!'"): the
                    // bottom panel mirrors RpgLevelBottomPanel's own placement pattern exactly — the
                    // dialogue box replaces the keyboard/TabView down here while the level-result panel
                    // occupies the top-view slot above (§189/§191's `characterScreen === 'levelResult'`).
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                        <DialogueBox
                            portraitUrl={levelResultPortrait.url}
                            portraitCrop={levelResultPortrait.crop}
                            portraitCellW={levelResultPortrait.cellW}
                            portraitCellH={levelResultPortrait.cellH}
                            dedicatedPortraitUrl={wizardDedicatedPortrait?.portraitUrl}
                            dedicatedPortraitCell={wizardDedicatedPortrait?.portraitCell}
                            dedicatedPortraitFrame={wizardDedicatedPortrait?.portraitFrame}
                            text={levelResultDialogue.visibleText}
                            onClick={levelResultDialogue.handleTextClick}
                            autoContinue={rpgLevel.autoContinue}
                            onToggleAutoContinue={rpgLevel.toggleAutoContinue}
                            hasMorePages={levelResultDialogue.hasNextPage}
                        />
                    </div>
                ) : (
                <TabView
                    characterScreen={characterScreen}
                    characterEditor={characterEditor}
                    bestiaryEditor={bestiaryEditor}
                    rpgLevel={rpgLevel}
                    activeTab={activeTab}
                    sheetMusicCommonProps={sheetMusicCommonProps}
                    startMeasureIndex={renderStartMeasureIndex}
                    blockMeasureStart={blockMeasureStart}
                    blockPlayStart={blockPlayStart}
                    idealVisibleMeasures={effectiveVisibleMeasures}
                    instruments={instruments}
                    manualInstruments={manualInstruments}
                    context={context}
                    timeSignature={timeSignature}
                    getConversationProfile={getConversationProfile}
                    scale={scale}
                    activeClef={activeClef}
                    handleInputTestNote={handleNoteInputCombat}
                    qwertyKeyboardActive={qwertyKeyboardActive}
                    rangeEditMode={rangeEditMode}
                    clefEditMode={clefEditMode}
                    keyboardTranspose={keyboardTranspose}
                    setKeyboardTranspose={setKeyboardTranspose}
                    keyboardActiveChord={keyboardActiveChord}
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
                )}
                </div>
            </div>

            {/* Post-session summary (#131). Rendered only when endSession()
                returned a gated summary; starting new activity clears it. */}
            {sessionSummary && (
                <SessionSummaryCard
                    summary={sessionSummary}
                    onDismiss={() => setSessionSummary(null)}
                    debugMode={debugMode}
                />
            )}
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
    );
};

export default App;
