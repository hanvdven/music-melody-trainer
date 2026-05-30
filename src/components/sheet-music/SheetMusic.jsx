// /components/sheet-music/SheetMusic.jsx

import React, { useRef, useState, useMemo } from 'react';
import useSheetMusicHighlight from '../../hooks/useSheetMusicHighlight';
import useSheetMusicTransitions from '../../hooks/useSheetMusicTransitions';
import RandomizeIcon from '../common/RandomizeIcon';
import { processMelodyAndCalculateSlots } from './processMelodyAndCalculateSlots';
import { processMelodyAndCalculateFlags } from './processMelodyAndCalculateFlags';
import SettingsOverlay, { VOL_STEPS } from './overlays/SettingsOverlay';
import RangeStaffOverlay from './overlays/RangeStaffOverlay';
import GenericTypeSelector from '../common/GenericTypeSelector';
import SvgSetter from './SvgSetter';

import MelodyNotesLayer from './MelodyNotesLayer';
import ChordLabelsLayer from './ChordLabelsLayer';
import BarlinesLayer from './BarlinesLayer';
import PreviewOverlay from './PreviewOverlay';
import { renderOneMeasureRepeatSymbols } from './renderOneMeasureRepeatSymbols';
import { renderAccidentals } from './renderAccidentals';
import { calculateAllOffsets } from './calculateAllOffsets';
import { generateAccidentalMap } from './generateAccidentalMap';
import { getChordsWithSlashes } from '../../theory/chordLabelHandler';
import { getNoteSemitone, getKodalySolfege } from '../../theory/noteUtils';
import { getNoteIndex } from '../../theory/musicUtils';
import { getRelativeNoteName } from '../../theory/convertToDisplayNotes';
import { isCompoundMeter, getEffectiveBeatDuration, getBeatDurationTicks, getTakadimiSyllable, getTakadimiSyllableGrouped, getTupletSyllable, isRest } from '../../theory/rhythmicSolfege';

import { getTempoTerm, tempoTerms } from '../../utils/tempo';
import { TICKS_PER_WHOLE } from '../../constants/timing.js';
import { PRESET_RANGES as CLEF_RANGE_PRESET_RANGES } from '../../constants/ranges';
import { TRANSPOSING_INSTRUMENTS, getTranspositionSemitones, getTranspositionDisplay } from '../../constants/transposingInstruments';
import { sliceMelodyByMeasure, sliceChordsForMeasure, sliceToMelodyLike, sliceMelodyByRange, sliceChordsByRange } from '../../utils/melodySlice';
import { calculateMusicalBlocks } from '../../utils/pagination';
import useLongPressTimer from '../../hooks/useLongPressTimer';
import BpmControls from './BpmControls';
import RepeatsControls from './RepeatsControls';
import { usePlaybackConfig } from '../../contexts/PlaybackConfigContext';
import { useInstrumentSettings } from '../../contexts/InstrumentSettingsContext';
import { clampRange, getNoteValue, getNoteFromValue } from '../../utils/rangeUtils';
import { PRESET_RANGES } from '../../constants/ranges';
import { PERCUSSION_PRESETS } from '../../audio/drumKits';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { useMelodies } from '../../contexts/MelodyContext';
import { usePlaybackTransport } from '../../contexts/PlaybackTransportContext';
import { useRoundState } from '../../contexts/RoundStateContext';
import { useTransitionOverlay } from '../../contexts/TransitionOverlayContext';
import { useAnimationRefs } from '../../contexts/AnimationRefsContext';
// ── Static / pure module-level data & helpers ──────────────────────────────

// ── Clef/range picker ─────────────────────────────────────────────────────
// Matches RangeControls rangeOptionsList so clicking the clef in the sheet
// music opens the same full-list picker as the range-mode stepper.
// CLEF_RANGE_PRESET_RANGES is imported from constants/ranges (single source of truth).
const CLEF_VOCAL_RANGES = [
  { label: 'Bass',          min: 'G2', max: 'C4', clef: 'bass' },
  { label: 'Baritone',      min: 'B2', max: 'F4', clef: 'bass' },
  { label: 'Tenor',         min: 'D3', max: 'A4', clef: 'tenor' },
  { label: 'Alto',          min: 'F3', max: 'C5', clef: 'alto' },
  { label: 'Mezzo-soprano', min: 'A3', max: 'G5', clef: 'mezzo-soprano' },
  { label: 'Soprano',       min: 'C4', max: 'G6', clef: 'soprano' },
];
// Ordered top-to-bottom: treble options, then bass, then vocals (Soprano first)
const CLEF_RANGE_OPTIONS = [
  { label: 'TREBLE 8VA',      value: 'TREBLE_RELATIVE',     clefType: 'g' },
  { label: 'TREBLE 15MA',     value: 'TREBLE_RELATIVE_15A', clefType: 'g' },
  { label: 'TREBLE FULL',     value: 'FULL_TREBLE',         clefType: 'g' },
  { label: 'TREBLE LARGE',    value: 'LARGE_TREBLE',        clefType: 'g' },
  { label: 'TREBLE STANDARD', value: 'STANDARD_TREBLE',     clefType: 'g' },
  { label: 'BASS 8VB',        value: 'BASS_RELATIVE',       clefType: 'f' },
  { label: 'BASS LOW',        value: 'BASS_RELATIVE_LOW',   clefType: 'f' },
  { label: 'BASS FULL',       value: 'FULL_BASS',           clefType: 'f' },
  { label: 'BASS LARGE',      value: 'LARGE_BASS',          clefType: 'f' },
  { label: 'BASS STANDARD',   value: 'STANDARD_BASS',       clefType: 'f' },
  ...([...CLEF_VOCAL_RANGES].reverse().map(v => ({
    label: v.label.toUpperCase(), value: v.label, clefType: 'v',
  }))),
];

/** Apply a range-option value (matching CLEF_RANGE_OPTIONS) to an InstrumentSettings setter. */
const applyRangeOption = (val, setter) => {
  if (val === 'TREBLE_RELATIVE')     return setter(p => ({ ...p, rangeMode: 'relative',     preferredClef: 'treble' }));
  if (val === 'TREBLE_RELATIVE_15A') return setter(p => ({ ...p, rangeMode: 'relative_15a', preferredClef: 'treble' }));
  if (val === 'BASS_RELATIVE')       return setter(p => ({ ...p, rangeMode: 'relative',     preferredClef: 'bass'   }));
  if (val === 'BASS_RELATIVE_LOW')   return setter(p => ({ ...p, rangeMode: 'relative_low', preferredClef: 'bass'   }));
  if (val.includes('_')) {
    const parts  = val.split('_');
    const clef   = parts[parts.length - 1].toLowerCase(); // 'treble' | 'bass'
    const mode   = parts.slice(0, -1).join('_');
    const preset = CLEF_RANGE_PRESET_RANGES[mode]?.[clef];
    if (preset) setter(p => ({ ...p, rangeMode: mode, range: preset, preferredClef: clef }));
    return;
  }
  const vocal = CLEF_VOCAL_RANGES.find(v => v.label === val);
  if (vocal) setter(p => ({ ...p, range: { min: vocal.min, max: vocal.max }, preferredClef: vocal.clef, rangeMode: vocal.label }));
};

/** Map current settings back to the matching CLEF_RANGE_OPTIONS value for selection highlight. */
const getCurrentRangeValue = (settings, activeClef) => {
  const mode = settings?.rangeMode;
  const pref = settings?.preferredClef || activeClef;
  if (mode === 'relative')     return pref === 'bass' ? 'BASS_RELATIVE'       : 'TREBLE_RELATIVE';
  if (mode === 'relative_15a') return 'TREBLE_RELATIVE_15A';
  if (mode === 'relative_low') return 'BASS_RELATIVE_LOW';
  if (['STANDARD', 'LARGE', 'FULL'].includes(mode)) return `${mode}_${pref.toUpperCase()}`;
  return mode; // vocal label
};

const clefSymbols = {
  treble: { char: '&', yOffset: 0 },
  alto: { char: 'B', yOffset: -10.0 },
  tenor: { char: 'B', yOffset: -20.0 },
  soprano: { char: 'B', yOffset: 10.0 },
  'mezzo-soprano': { char: 'B', yOffset: 0.0 },
  treble8va: { char: ' ', yOffset: 0 },
  treble8vb: { char: 'V', yOffset: 0 },
  treble15va: { char: '&', yOffset: 0, ottava: '15' },
  treble15vb: { char: '&', yOffset: 0, ottava: '15', below: true },
  bass: { char: '?', yOffset: -20 },
  bass8va: { char: 'æ', yOffset: -20 },
  bass8vb: { char: 't', yOffset: -10 },
  bass15va: { char: '?', yOffset: -20, ottava: '15' },
  bass15vb: { char: '?', yOffset: -10, ottava: '15', below: true },
};


// Maximum extent (offset + duration) across all notes in a melody.
const getMelodyEndTime = (melody) => {
  if (!melody?.offsets?.length) return 0;
  return melody.offsets.reduce((max, off, i) => Math.max(max, off + (melody.durations[i] || 0)), 0);
};

// Dotted durations — used when tagging offsets with 'd' for the calculateAllOffsets dot-flag.
const DOTTED_DURATIONS = new Set([9, 18, 21, 36, 42, 72]);

// Stable references for `scaleNotes` / `processedChords` defaults on layers
// (percussion / metronome) so React.memo on MelodyNotesLayer never sees a fresh
// `[]` on each render and can hit its cache.
const EMPTY_SCALE_NOTES = Object.freeze([]);

const melodyToTaggedOffsets = (melody, accidentals) => {
  if (!melody || !melody.offsets) return [];
  return melody.offsets.map((offset, i) => ({
    offset,
    a: accidentals && accidentals[i] !== null,
    d: DOTTED_DURATIONS.has(melody.durations[i]),
  }));
};

// Clef cycling uses only these three clef keys for the active toggle.
const ACTIVE_CLEF_TYPES = ['treble', 'bass', 'alto'];

const SheetMusic = ({
  timeSignature,
  onTimeSignatureChange,
  bpm,
  onBpmChange,
  isRubato = false,
  onToggleRubato,
  // Anacrusis handling (Han 2026-05-28): the global measureIndex of the song's
  // pickup measure, or null if no song with anacrusis is loaded. BarlinesLayer
  // uses this to suppress the number label on that one measure.
  anacrusisMeasureIndex = null,
  numRepeats,
  onNumRepeatsChange,
  numAccidentals,
  screenWidth,
  onRandomizeMeasure,
  showChords,
  showSettings,
  rangeEditMode,
  onToggleSettings,
  onSettingsInteraction,
  viewMode,    // 'melody' | 'repeat' — see viewMode prop in App.jsx for the source-of-truth computation
  numMeasures, // Added prop
  onNumMeasuresChange,      // NEW — for overlay measure count stepper
  tonic,
  containerHeight = 400,
  musicalBlocks,
  startMeasureIndex = 0,
  visibleMeasures = null,   // number of measures visible on screen at once (scroll/wipe modes)
  isFullscreen = false,
  toggleFullscreen = null,
  headerPlayMode = 'once',
  setHeaderPlayMode = null,
  handleToggleInputTest = null,
  handlePlayMelody = null,
  handlePlayContinuously = null,
  onMusicalBlocksChange = null,
  svgRef: svgRefProp = null,
  onNoteClick = null,          // (notes: string[], staff: string) => void — plays note(s) when a note head is clicked
  onChordClick = null,         // (notes: string[]) => void — plays a chord with strumming when a chord label is clicked
  onEnharmonicToggle = null,   // () => void — toggles tonic to its enharmonic equivalent (e.g. F♯ ↔ G♭)
  onMeasureNumberClick = null, // (globalMeasureIndex: number) => void — navigates to that measure when label is clicked
  onNoteEnharmonicToggle = null, // (staff: string, absoluteOffset: number) => void — toggles a note's accidental spelling
  blockMeasureStart = 1,   // 1-indexed song measure number of the first measure in this block
  blockPlayStart = 0,      // sequence startMeasureIndex when this block was first played (for repeat suffix R)
}) => {
  // ── Context-provided values (formerly props) ──────────────────────────────
  const { treble: trebleMelody, bass: bassMelody, percussion: percussionMelody,
          metronome: metronomeMelody, chordProgression } = useMelodies();
  const { isPlaying } = usePlaybackTransport();
  const { isOddRound, inputTestState, inputTestSubMode, setInputTestSubMode } = useRoundState();
  const { nextLayer = null, previewMelody = null, iterInCurrentSeries = 0 } = useTransitionOverlay();
  const { wipeTransitionRef, scrollTransitionRef, paginationFadeRef,
          transitionRef,
          clearHighlightStateRef, showNoteHighlightRef, setCurrentMeasureIndex,
          sequencerRef, context, rubatoScrollAnchorRef } = useAnimationRefs();
  const { playbackConfig, setPlaybackConfig, toggleRoundSetting } = usePlaybackConfig();
  const { trebleSettings, setTrebleSettings, bassSettings, setBassSettings,
    percussionSettings, setPercussionSettings, chordSettings, setChordSettings } = useInstrumentSettings();

  // ── Range-selector write handlers (Phase 3) ──────────────────────────────
  // Reuse RangeControls' semantics so both surfaces behave identically:
  // clampRange enforces the 12-semitone min span + 21..108 bounds; then detect
  // a preset match to keep rangeMode in sync. Writing through the same setters
  // fires the existing settings→regeneration path unchanged.
  const setMelodicBoundary = React.useCallback((staff, midi, which) => {
    const setter = staff === 'treble' ? setTrebleSettings : setBassSettings;
    setter(prev => {
      const curMin = getNoteValue(prev.range.min);
      const curMax = getNoteValue(prev.range.max);
      // 'nearest' (tap) picks the closer boundary; a drag passes the captured
      // boundary explicitly so it keeps following the finger.
      const bound = which === 'nearest'
        ? (Math.abs(midi - curMin) <= Math.abs(midi - curMax) ? 'min' : 'max')
        : which;
      const startMin = bound === 'min' ? midi : curMin;
      const startMax = bound === 'max' ? midi : curMax;
      const { min, max } = clampRange(startMin, startMax, bound);
      const range = { min: getNoteFromValue(min), max: getNoteFromValue(max) };
      let rangeMode = 'CUSTOM';
      for (const m of ['STANDARD', 'LARGE', 'FULL']) {
        const p = PRESET_RANGES[m][staff];
        if (p.min === range.min && p.max === range.max) { rangeMode = m; break; }
      }
      return { ...prev, range, rangeMode };
    });
  }, [setTrebleSettings, setBassSettings]);

  const applyMelodicPreset = React.useCallback((staff, mode) => {
    const setter = staff === 'treble' ? setTrebleSettings : setBassSettings;
    const p = PRESET_RANGES[mode][staff];
    setter(prev => ({ ...prev, range: { ...p }, rangeMode: mode }));
  }, [setTrebleSettings, setBassSettings]);

  const togglePad = React.useCallback((padId) => {
    setPercussionSettings(prev => {
      const cur = Array.isArray(prev.enabledPads) ? prev.enabledPads : [];
      const next = cur.includes(padId) ? cur.filter(p => p !== padId) : [...cur, padId];
      return { ...prev, enabledPads: next };
    });
  }, [setPercussionSettings]);

  const applyPercussionPreset = React.useCallback((mode) => {
    setPercussionSettings(prev => ({ ...prev, enabledPads: [...PERCUSSION_PRESETS[mode]] }));
  }, [setPercussionSettings]);
  const { noteColoringMode, setNoteColoringMode, debugMode, lyricsMode,
    chordDisplayMode, setChordDisplayMode, showNoteHighlight, setShowNoteHighlight,
    animationMode, courtesyAccidentals = true, percussionVoiceSplit = false } = useDisplaySettings();
  const svgRefInternal = useRef(null);
  // Use the ref passed from App.jsx if provided (so Sequencer callbacks can access the SVG),
  // otherwise fall back to an internal ref.
  const svgRef = svgRefProp ?? svgRefInternal;
  const layoutRef = useRef(null);

  useSheetMusicHighlight({
    sequencerRef,
    svgRef,
    layoutRef,
    context,
    isPlaying,
    melodies: { treble: trebleMelody, bass: bassMelody, percussion: percussionMelody },
    showNoteHighlightRef,
    clearHighlightStateRef,
    setCurrentMeasureIndex,
    wipeTransitionRef,
    scrollTransitionRef,
    paginationFadeRef,
    transitionRef,
    rubatoScrollAnchorRef,
  });

  useSheetMusicTransitions(nextLayer, layoutRef, svgRef);
  // Read theme from DOM attribute set by App.jsx — avoids threading it as a prop.
  const theme = document.documentElement.getAttribute('data-theme') ?? 'default';
  // Alias for overlay-preview state (yellow = same-melody repeat preview, red = new-melody preview).
  const showWipePreview = nextLayer;

  const roundKey = isOddRound ? 'oddRounds' : 'evenRounds';
  const [activeVolumePicker, setActiveVolumePicker] = React.useState(null); // { round, instrumentKey }
  const [activeNumberPicker, setActiveNumberPicker] = React.useState(null); // 'measures' | 'repeats'

  // Overall melody visibility. viewMode is the single source of truth (see App.jsx).
  const notesVisible = viewMode === 'melody';

  // Randomise-measure button rendered inside the SVG. Moved inside for scope.
  // Derived directly from settings — no local state needed.
  // When the user taps to cycle clef, setTrebleSettings/setBassSettings updates preferredClef
  // and these values follow in the same React render (React 18 automatic batching).
  const trebleActiveClef = trebleSettings?.preferredClef ?? 'treble';
  const bassActiveClef = ACTIVE_CLEF_TYPES.includes(bassSettings?.preferredClef)
    ? bassSettings.preferredClef
    : 'bass';

  const measureLengthSlots = (TICKS_PER_WHOLE * timeSignature[0]) / timeSignature[1];
  // noteGroupSize = ticks per BEAT (= one count). processMelodyAndCalculateSlots
  // splits any note that crosses a beat boundary. Delegated to the shared
  // getBeatDurationTicks helper (theory/rhythmicSolfege.js) which already
  // knows the compound-vs-simple rule. Replaces the legacy heuristic
  //   measureLengthSlots % 18 === 0 ? 18 : 12
  // that mis-classified 3/4 as compound (36 % 18 === 0 picked 18 = dotted-
  // quarter, but 3/4 is simple — beat is the quarter, 12 ticks). Han observed
  // this on HBD bass m1: three quarters rendered as q + (e tied to e) + q.
  // Consolidated 2026-05-29 so SheetMusic and rhythmic-solfege agree on what
  // a "beat" is.
  const noteGroupSize = getBeatDurationTicks(timeSignature);

  // --- Vertical Layout Constants (Responsive) ---
  const baseGap = 70;
  const minGap = 29.5;

  // --- Dynamic Staff Visibility & Layout ---

  // Content visibility: current-round value during playback, either-round when stopped.
  const actualTreble = isPlaying
    ? (playbackConfig?.[roundKey]?.trebleEye !== false)
    : (playbackConfig?.oddRounds?.trebleEye !== false || playbackConfig?.evenRounds?.trebleEye !== false);

  const actualBass = isPlaying
    ? (playbackConfig?.[roundKey]?.bassEye !== false)
    : (playbackConfig?.oddRounds?.bassEye !== false || playbackConfig?.evenRounds?.bassEye !== false);

  const actualPerc = isPlaying
    ? (playbackConfig?.[roundKey]?.percussionEye === true)
    : (playbackConfig?.oddRounds?.percussionEye === true || playbackConfig?.evenRounds?.percussionEye === true);

  const actualMetronome = isPlaying
    ? (playbackConfig?.[roundKey]?.percussionEye === 'metronome')
    : (playbackConfig?.oddRounds?.percussionEye === 'metronome' || playbackConfig?.evenRounds?.percussionEye === 'metronome');

  const actualChords = isPlaying
    ? (playbackConfig?.[roundKey]?.chordsEye !== false)
    : (playbackConfig?.oddRounds?.chordsEye !== false || playbackConfig?.evenRounds?.chordsEye !== false);

  // Layout visibility: staff stays visible if ANY round has it active, keeping layout stable across
  // rounds. When the current round has a staff hidden (actualTreble/Bass/Perc = false), the staff
  // stays but shows a repeat symbol instead of notes (see per-staff repeats in the render section).
  // showSettings keeps all staves alive so overlay buttons stay correctly anchored.
  // rangeEditMode also keeps the treble/bass staves alive so the range overlay's
  // selectable note rows have a staff to anchor to even if a staff is hidden.
  const isTrebleVisible = showSettings || rangeEditMode ||
    (playbackConfig?.oddRounds?.trebleEye !== false || playbackConfig?.evenRounds?.trebleEye !== false);
  const isBassVisible = showSettings || rangeEditMode ||
    (playbackConfig?.oddRounds?.bassEye !== false || playbackConfig?.evenRounds?.bassEye !== false);
  const isPercussionVisible = showSettings || rangeEditMode ||
    (playbackConfig?.oddRounds?.percussionEye === true || playbackConfig?.evenRounds?.percussionEye === true ||
      playbackConfig?.oddRounds?.percussionEye === 'metronome' || playbackConfig?.evenRounds?.percussionEye === 'metronome');

  const numVisibleStaves = (isTrebleVisible ? 1 : 0) + (isBassVisible ? 1 : 0) + (isPercussionVisible ? 1 : 0);
  const numGaps = Math.max(1, numVisibleStaves - 1);

  const staffHeight = 40;
  const trebleStart = 100;
  const LYRICS_GAP = 45; // extra vertical space for melodic lyrics row below treble staff
  const melodicLyricsActive = (lyricsMode === 'doremi-rel' || lyricsMode === 'doremi-abs' || lyricsMode === 'kodaly') && isTrebleVisible;
  const rhythmicLyricsActive = lyricsMode === 'takadimi' && isPercussionVisible;
  // Text lyrics from a loaded song (melody.lyrics array) — shown regardless of lyricsMode.
  const textLyricsActive = isTrebleVisible && Array.isArray(trebleMelody?.lyrics) && trebleMelody.lyrics.length > 0;
  // Keep lyricsActive for any backward-compat references
  const lyricsActive = melodicLyricsActive || rhythmicLyricsActive || textLyricsActive;
  const baseStaffGap = containerHeight >= 400
    ? baseGap
    : Math.max(minGap, (containerHeight - 110 - 131) / numGaps);
  const staffGap = (melodicLyricsActive || textLyricsActive) ? baseStaffGap + LYRICS_GAP : baseStaffGap;

  const bassStart = isTrebleVisible ? trebleStart + staffHeight + staffGap : trebleStart;
  const percussionStart = isBassVisible ? bassStart + staffHeight + staffGap : (isTrebleVisible ? trebleStart + staffHeight + staffGap : trebleStart);

  // Final vertical extent for staves and barlines - should use layout visibility
  const bottomY = isPercussionVisible ? percussionStart + staffHeight : (isBassVisible ? bassStart + staffHeight : trebleStart + staffHeight);

  const lyricsExtraBottom = rhythmicLyricsActive ? 50 : 0;
  const logicalHeightForViewBox = bottomY + 80 + lyricsExtraBottom;
  const scaleFactor = Math.min(1.0, containerHeight / logicalHeightForViewBox);
  const logicalScreenWidth = screenWidth / scaleFactor;

  const endX = logicalScreenWidth - 10; // 5 unit margin on each side (Starts at 0, viewBox starts at -5)
  const systemEndX = endX + 5;

  const staffLines = [];
  if (isTrebleVisible) {
    for (let i = 0; i < 5; i++) staffLines.push(trebleStart + i * 10);
  }
  if (isBassVisible) {
    for (let i = 0; i < 5; i++) staffLines.push(bassStart + i * 10);
  }
  if (isPercussionVisible) {
    for (let i = 0; i < 5; i++) staffLines.push(percussionStart + i * 10);
  }

  const measureYPositions = [];
  if (isTrebleVisible) {
    measureYPositions.push(trebleStart + 9);
    measureYPositions.push(trebleStart + 29);
  }
  if (isBassVisible) {
    measureYPositions.push(bassStart + 9);
    measureYPositions.push(bassStart + 29);
  }
  if (isPercussionVisible) {
    measureYPositions.push(percussionStart + 9);
    measureYPositions.push(percussionStart + 29);
  }

  // --- Header spacing multiplier (30% wider at ≥500px, original at ≤400px) ---
  const headerMult = logicalScreenWidth >= 500 ? 1.3
    : logicalScreenWidth <= 400 ? 1.0
    : 1.0 + 0.3 * (logicalScreenWidth - 400) / 100;

  // --- Horizontal Layout Constants ---
  // Minimum gap between clef, accidentals, and time sig reduced by 5 units (was 42/38 → now 37/33).
  const accidentalStartX  = Math.round(37 * headerMult);
  const accidentalSpacing = Math.round(8  * headerMult);
  // Fixed header layout:
  // - startX is fixed so note content always begins at the same horizontal position.
  //   The +5*headerMult tail (previously +15) moves startX ~10 units left vs. the last version,
  //   enabled by the 5-unit reduction in minimum gap above.
  // - measurePositionX is centred between the last header element (accidental or clef) and startX,
  //   so the time signature sits equidistant between content and notes regardless of key signature.
  const accidentalEndX   = accidentalStartX + Math.min(Math.abs(numAccidentals), 7) * accidentalSpacing;
  const clefEndX         = Math.round(33 * headerMult); // approximate right edge of clef glyph (−5 vs. previous)
  const headerContentEnd = numAccidentals !== 0 ? accidentalEndX : clefEndX;
  const extraHeaderPadding = logicalScreenWidth >= 700 ? Math.round(8 * headerMult) : 0;
  // startX shifted +10 units right (more breathing room before notes).
  // measurePositionX is computed against the startX WITHOUT the +10 offset so the
  // time signature stays in the same visual position — it just gets a bit more space to its right.
  const startXBase       = Math.round(7 * accidentalSpacing + 60 * headerMult) + Math.round(5 * headerMult) + extraHeaderPadding;
  const startX           = startXBase + 10;
  const measurePositionX = Math.round((headerContentEnd + startXBase) / 2);
  const [measureTop, measureBottom] = timeSignature;

  // Pass vertical context to renderMelodyNotes - use 0 because we wrap in animated groups
  const vStarts = { treble: 0, bass: 0, percussion: 0 };

  // Uniform measure width: displayNumMeasures fills the screen width exactly.
  // Fallback to 2 if not provided — 3 was the old hardcoded default but 2 is safer for small screens.
  const effectiveVisibleMeasures = visibleMeasures ?? 2;
  const measureWidth = endX > startX ? (endX - startX) / effectiveVisibleMeasures : 0;
  const measurePpt = measureLengthSlots > 0 ? measureWidth / measureLengthSlots : 0;

  // --- Dynamic Clef Logic ---
  const getClefShiftValue = (c) => {
    const shifts = {
      treble: 0, alto: -30, tenor: -40, soprano: -10, 'mezzo-soprano': -20, bass: 0,
      treble8va: 35, treble8vb: -35, treble15va: 70, treble15vb: -70,
      bass8va: 35, bass8vb: -35, bass15va: 70, bass15vb: -70,
      alto8va: 35, alto8vb: -35
    };
    return shifts[c] || 0;
  };

  // Clef types that are inherently vocal — these never receive 8va/8vb markings.
  // Bass and Baritone vocal ranges share the 'bass' clef type but are identified by rangeMode.
  const VOCAL_CLEF_TYPES = new Set(['soprano', 'mezzo-soprano', 'alto', 'tenor']);
  const VOCAL_RANGE_MODES = new Set(['Bass', 'Baritone', 'Tenor', 'Alto', 'Mezzo-soprano', 'Soprano']);

  const calculateOptimalClef = (activeClef, melodyNotes, staff = 'treble', rangeMode = null) => {
    // Vocal clefs never use ottava markings — range selection already constrains their register.
    if (VOCAL_CLEF_TYPES.has(activeClef) || VOCAL_RANGE_MODES.has(rangeMode)) return activeClef;

    if (!melodyNotes || melodyNotes.length === 0) return activeClef;

    const notes = melodyNotes
      .map(n => {
        if (!n) return null;
        if (typeof n === 'string') return getNoteIndex(n);
        if (typeof n.midi === 'number') return n.midi;
        if (typeof n.note === 'string') return getNoteIndex(n.note);
        return null;
      })
      .filter(m => typeof m === 'number');

    if (notes.length === 0) return activeClef;
    const countInRange = (min, max) => notes.filter(m => m >= min && m <= max).length;

    // Ranges use getNoteIndex() indices: A0=0, each semitone = 1 step.
    // C4 = 39 (not 48 — the old comment was wrong and caused all ranges to be off by 9).
    const RANGES = staff === 'bass' ? {
      base: [15, 43],   // C2-E4
      '8vb': [0, 19],   // A0-E2
      '15vb': [0, 0],   // DISABLED
      '8va': [39, 55],  // C4-E5
      '15va': [51, 87]  // C5-C8
    } : {
      base: [36, 63],   // A3-C6
      '8vb': [24, 39],  // A2-C4
      '15vb': [12, 27], // A1-C3
      '8va': [60, 75],  // A5-C7
      '15va': [72, 87]  // A6-C8
    };

    // Rule 1: stay in base if all notes fit
    if (notes.every(m => m >= RANGES.base[0] && m <= RANGES.base[1])) return activeClef;

    const scores = [
      { id: activeClef + '15va', score: countInRange(...RANGES['15va']) },
      { id: activeClef + '15vb', score: countInRange(...RANGES['15vb']) },
      { id: activeClef + '8va', score: countInRange(...RANGES['8va']) },
      { id: activeClef + '8vb', score: countInRange(...RANGES['8vb']) },
      { id: activeClef, score: countInRange(...RANGES.base) }
    ];

    // Pick the one with the highest score, with precedence for later entries (Base > 8va > 15va) in case of a tie
    return scores.reduce((max, s) => s.score >= max.score ? s : max, scores[0]).id;
  };

  // Memoised so the empty-array fallback gets a stable reference across renders —
  // required for React.memo on MelodyNotesLayer to hit the cache (otherwise a
  // fresh [] each render forces re-renders even when nothing has changed).
  const scaleNotes = useMemo(() => trebleSettings?.scaleNotes || [], [trebleSettings?.scaleNotes]);

  // Display-only transposition: how many semitones to shift written notes up/down.
  // Audio always plays concert pitch; only the sheet music notation changes.
  const trebleTransSemitones = useMemo(
    () => getTranspositionSemitones(trebleSettings?.transpositionKey),
    [trebleSettings?.transpositionKey],
  );
  const bassTransSemitones = useMemo(
    () => getTranspositionSemitones(bassSettings?.transpositionKey),
    [bassSettings?.transpositionKey],
  );

  // 'treble' | 'bass' | null — which staff's picker is open
  const [transPicker, setTransPicker] = useState(null);  // transposition key picker
  const [clefPicker,  setClefPicker]  = useState(null);  // clef + range picker
  const [tempoPicker, setTempoPicker] = useState(false); // tempo word picker

  const longPress = useLongPressTimer();
  // Dedicated long-press handler for clef glyphs.
  // Open settings overlay if not already open, then reset the auto-hide timer.
  // Called from all responsive sheet-music elements (clef, time-sig, BPM, tempo) so
  // that a single tap on any of these both performs the action AND opens the overlay.
  const openSettingsIfClosed = () => {
    if (!showSettings && onToggleSettings) onToggleSettings();
    onSettingsInteraction?.();
  };

  // Short tap → cycle clef; long press OR 3rd consecutive short tap → open clef+range list.
  const clefLongPress = useLongPressTimer();
  const clefTapCountRef = useRef({ treble: 0, bass: 0 });
  const clefTapTimerRef = useRef({ treble: null, bass: null });

  const handleClefTap = (staff) => {
    openSettingsIfClosed();
    const count = (clefTapCountRef.current[staff] || 0) + 1;
    clefTapCountRef.current[staff] = count;
    clearTimeout(clefTapTimerRef.current[staff]);

    if (count >= 3) {
      // 3rd consecutive tap → open list
      clefTapCountRef.current[staff] = 0;
      setClefPicker(prev => prev === staff ? null : staff);
      return;
    }

    // 1st or 2nd tap → cycle clef after a short debounce (in case a 3rd tap follows)
    clefTapTimerRef.current[staff] = setTimeout(() => {
      clefTapCountRef.current[staff] = 0;
      const isT = staff === 'treble';
      const activeClef = isT ? trebleActiveClef : bassActiveClef;
      const idx = ACTIVE_CLEF_TYPES.indexOf(activeClef);
      const nextClef = ACTIVE_CLEF_TYPES[(idx + 1) % ACTIVE_CLEF_TYPES.length];
      const setter = isT ? setTrebleSettings : setBassSettings;
      if (setter) {
        const defMin = nextClef === 'bass' ? (isT ? 'A2' : 'E2') : (nextClef === 'alto' ? 'F3' : 'C4');
        const defMax = nextClef === 'bass' ? (isT ? 'C4' : 'E4') : (nextClef === 'alto' ? 'C5' : 'E5');
        const rMode  = nextClef === 'alto' ? 'Alto' : 'STANDARD';
        setter(prev => ({ ...prev, preferredClef: nextClef, rangeMode: rMode, range: { min: defMin, max: defMax } }));
      }
    }, 300);
  };

  const handleTopLongPress = () => {
    // Reset timer before prompt to keep numeric display active
    resetNumericTimer();
    // setTimeout to allow UI update before prompt blocks thread?
    setTimeout(() => {
      const input = window.prompt('Enter time signature top (1-32):', measureTop);
      if (input !== null) {
        wrapHandler('setTop', input);
      }
    }, 10);
  };

  // State for temporary numeric display
  const [showNumeric, setShowNumeric] = React.useState(false);
  const numericTimerRef = React.useRef(null);

  const resetNumericTimer = () => {
    setShowNumeric(true);
    if (numericTimerRef.current) {
      clearTimeout(numericTimerRef.current);
    }
    numericTimerRef.current = setTimeout(() => {
      setShowNumeric(false);
    }, 5000);
  };

  const wrapHandler = (handlerName, ...args) => {
    resetNumericTimer();
    openSettingsIfClosed();
    onTimeSignatureChange(handlerName, ...args);
  };

  const renderStaffMeasureTexts = (yBase) => {
    return [0 + 9, 0 + 29].map((yPos, index) => {
      // shouldShowNumeric: controls whether 'C' is replaced by numbers.
      // Numbers are ALWAYS shown if not common time.
      const isCommonTime =
        (measureTop === 4 && measureBottom === 4) || (measureTop === 2 && measureBottom === 2);
      // In settings overlay: always show numeric so user doesn't need an extra tap to switch from C
      const displayNumeric = !isCommonTime || showNumeric || showSettings;

      if (displayNumeric) {
        const isTop = index % 2 === 0;
        const rectWidth = 60;
        const halfWidth = rectWidth / 2;
        const rectX = measurePositionX - 30;

        const rectY = isTop ? yPos - 25 : yPos - 10;
        const rectHeight = isTop ? 35 : 30;

        return (
          <g key={`measure-group-${yBase}-${index}`}>
            {/* Visual Indicators - Yellow +/-. Only show if showNumeric (active interaction) is true */}
            {showNumeric && (
              <>
                <text x={measurePositionX - 18} y={yPos + 2} className="measure-indicator">
                  -
                </text>
                <text x={measurePositionX + 18} y={yPos + 4.5} className="measure-indicator">
                  +
                </text>
              </>
            )}

            {/* Text Display */}
            <text
              x={measurePositionX}
              y={yPos + 1}
              fontSize="36"
              fill={showSettings ? 'var(--accent-yellow)' : 'var(--text-primary)'}
              fontFamily="Maestro"
              textAnchor="middle"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {isTop ? measureTop : measureBottom}
            </text>

            {/* Left Hitbox (Decrement / Cycle Backward) */}
            {debugMode && <rect x={rectX} y={rectY + 2} width={halfWidth} height={rectHeight} fill="orange" fillOpacity={0.4} stroke="orange" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
            <rect
              x={rectX}
              y={rectY + 2}
              width={halfWidth}
              height={rectHeight}
              fill="transparent"
              style={{ cursor: 'pointer', zIndex: 100 }}
              pointerEvents="all"
              onClick={(e) => {
                e.stopPropagation();
                isTop ? wrapHandler('decrementTop') : wrapHandler('cycleBottomBackward');
              }}
            />
            {/* Right Hitbox (Increment / Cycle Forward) */}
            {debugMode && <rect x={rectX + halfWidth} y={rectY + 2} width={halfWidth} height={rectHeight} fill="orange" fillOpacity={0.4} stroke="orange" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
            <rect
              x={rectX + halfWidth}
              y={rectY + 2}
              width={halfWidth}
              height={rectHeight}
              fill="transparent"
              style={{ cursor: 'pointer', zIndex: 100 }}
              pointerEvents="all"
              onMouseDown={(e) => {
                e.stopPropagation();
                if (isTop) longPress.start(handleTopLongPress);
              }}
              onMouseUp={(e) => {
                e.stopPropagation();
                if (isTop) {
                  longPress.end(e, () => wrapHandler('incrementTop'));
                } else {
                  wrapHandler('cycleBottom');
                }
              }}
              onMouseLeave={(e) => {
                e.stopPropagation();
                if (isTop) longPress.cancel();
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                if (isTop) longPress.start(handleTopLongPress);
              }}
              onTouchEnd={(e) => {
                e.preventDefault(); // Prevent duplicate mouse events
                e.stopPropagation();
                if (isTop) {
                  longPress.end(e, () => wrapHandler('incrementTop'));
                } else {
                  wrapHandler('cycleBottom');
                }
              }}
              onClick={(e) => e.stopPropagation()} // block click from reaching SVG settings-toggle
            />
          </g>
        );
      } else if (index % 2 === 0) {
        // Rendering 'C' or 'c'
        return (
          <g key={`measure-group-${yBase}-${index}`}>
            <text
              x={measurePositionX}
              y={yPos + 10}
              fontSize="36"
              fill={showSettings ? 'var(--accent-yellow)' : 'var(--text-primary)'}
              fontFamily="Maestro"
              textAnchor="middle"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {measureTop === 2 ? 'C' : 'c'}
            </text>
            {/* Hitbox for C/c - Single click activates numeric mode */}
            {debugMode && <rect x={measurePositionX - 15} y={yPos - 15} width="30" height="40" fill="orange" fillOpacity={0.4} stroke="orange" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
            <rect
              x={measurePositionX - 15}
              y={yPos - 15}
              width="30"
              height="40"
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); resetNumericTimer(); openSettingsIfClosed(); }}
            />
          </g>
        );
      } else {
        return null; // Render nothing for this yPos
      }
    });
  };

  const totalMelodyDuration = Math.max(
    getMelodyEndTime(trebleMelody),
    getMelodyEndTime(bassMelody),
    getMelodyEndTime(percussionMelody)
  );

  // Returns the last-measure partial info for a melody whose total duration doesn't fill a whole measure.
  const computePartial = (totalDur) => {
    if (totalDur <= 0) return { partialStart: null, partialTop: null };
    const remainder = totalDur % measureLengthSlots;
    if (remainder <= 0 || totalDur === measureLengthSlots) return { partialStart: null, partialTop: null };
    return {
      partialStart: Math.floor(totalDur / measureLengthSlots) * measureLengthSlots,
      partialTop: Math.round(remainder / (TICKS_PER_WHOLE / timeSignature[1])) || 1,
    };
  };

  const { partialStart: partialMeasureStart, partialTop } = computePartial(totalMelodyDuration);

  // Number of measures the active melody actually spans, derived from note content.
  // This is intentionally independent of the numMeasures generator setting so that
  // changing numMeasures during playback doesn't resize the current melody display.
  // Falls back to numMeasures only for the initial empty state (before first generation).
  const melodyMeasureCount = totalMelodyDuration > 0
    ? Math.max(1, Math.round(totalMelodyDuration / measureLengthSlots))
    : numMeasures;

  // Derive displayed measure count from the actual melody so that generator setting
  // changes (numMeasures) don't immediately add/remove empty measures from the view.
  // MUSICAL PAGINATION: If in pagination mode and musicalBlocks are provided,
  // find the size of the block containing startMeasureIndex.
  const getDisplayNumMeasures = () => {
    if (animationMode === 'pagination' && musicalBlocks && musicalBlocks.length > 0) {
      // Use melodyMeasureCount (not numMeasures) so the page position is stable
      // while numMeasures is changed during playback.
      const localS = startMeasureIndex % (melodyMeasureCount || 1);
      let blockOffset = 0;
      for (const blockSize of musicalBlocks) {
        if (localS >= blockOffset && localS < blockOffset + blockSize) {
          return blockSize;
        }
        blockOffset += blockSize;
      }
      // Block not found (e.g. musicalBlocks haven't updated yet for the new melody):
      // show the full melody rather than the new numMeasures which may be larger/smaller.
      return melodyMeasureCount;
    }
    return melodyMeasureCount;
  };

  const displayNumMeasures = getDisplayNumMeasures();

  // localMeasureStart: position of startMeasureIndex within the current melody's repeat block.
  // Uses melodyMeasureCount so block-navigation arithmetic stays correct when numMeasures
  // is changed while a melody with a different length is active.
  const localMeasureStart = startMeasureIndex % (melodyMeasureCount || 1);

  const sliceMelodyForPagination = (melody) => {
    if (!melody || animationMode !== 'pagination' || !musicalBlocks) return melody;
    return sliceMelodyByRange(melody, measureLengthSlots, displayNumMeasures, localMeasureStart);
  };

  // In pagination mode the melody is sliced so note offsets start at 0 for the visible page.
  // Add the page start offset to recover the absolute offset in the full melody, which is
  // what App.jsx needs to look up the note in state.
  const paginationOffset = (animationMode === 'pagination' && musicalBlocks)
    ? localMeasureStart * measureLengthSlots
    : 0;

  // Memoise the per-page melody slice so unrelated state changes (currentMeasureIndex tick,
  // isOddRound flip, nextLayer, previewMelody, etc.) don't re-run sliceMelodyByRange and
  // the heavier processMelodyAndCalculateSlots downstream. Deps cover everything that
  // affects the slice; if all stay equal-by-reference the cached result is returned.
  const currentTreble = useMemo(() => sliceMelodyForPagination(trebleMelody),
    [trebleMelody, animationMode, musicalBlocks, measureLengthSlots, displayNumMeasures, localMeasureStart]);
  const currentBass = useMemo(() => sliceMelodyForPagination(bassMelody),
    [bassMelody, animationMode, musicalBlocks, measureLengthSlots, displayNumMeasures, localMeasureStart]);
  const currentPercussion = useMemo(() => sliceMelodyForPagination(percussionMelody),
    [percussionMelody, animationMode, musicalBlocks, measureLengthSlots, displayNumMeasures, localMeasureStart]);
  const currentMetronome = useMemo(() => sliceMelodyForPagination(metronomeMelody),
    [metronomeMelody, animationMode, musicalBlocks, measureLengthSlots, displayNumMeasures, localMeasureStart]);
  const currentChordProgression = chordProgression; // ChordProgression is not a Melody — no slicing

  // Clef selection is per visible block (not full melody) so that a passage that sits in a
  // different register than the rest of the piece doesn't force an ottava on every other block.
  const clefTreble = useMemo(
    () => calculateOptimalClef(trebleActiveClef, currentTreble?.notes, 'treble', trebleSettings?.rangeMode),
    [trebleActiveClef, currentTreble, trebleSettings?.rangeMode],
  );
  const clefBass = useMemo(
    () => calculateOptimalClef(bassActiveClef, currentBass?.notes, 'bass', bassSettings?.rangeMode),
    [bassActiveClef, currentBass, bassSettings?.rangeMode],
  );

  const adjustedTrebleMelody = useMemo(() => processMelodyAndCalculateSlots(
    currentTreble,
    timeSignature,
    noteGroupSize,
    displayNumMeasures * measureLengthSlots,
  ), [currentTreble, timeSignature, noteGroupSize, displayNumMeasures, measureLengthSlots]);

  const trebleMelodyFlags = processMelodyAndCalculateFlags(
    adjustedTrebleMelody,
    timeSignature,
    noteGroupSize
  );

  const adjustedBassMelody = useMemo(() => processMelodyAndCalculateSlots(
    currentBass,
    timeSignature,
    noteGroupSize,
    displayNumMeasures * measureLengthSlots,
  ), [currentBass, timeSignature, noteGroupSize, displayNumMeasures, measureLengthSlots]);

  const adjustedPercussionMelody = useMemo(() => processMelodyAndCalculateSlots(
    currentPercussion,
    timeSignature,
    noteGroupSize,
    displayNumMeasures * measureLengthSlots,
  ), [currentPercussion, timeSignature, noteGroupSize, displayNumMeasures, measureLengthSlots]);

  const adjustedMetronomeMelody = useMemo(() => currentMetronome
    ? processMelodyAndCalculateSlots(currentMetronome, timeSignature, noteGroupSize, displayNumMeasures * measureLengthSlots)
    : null,
    [currentMetronome, timeSignature, noteGroupSize, displayNumMeasures, measureLengthSlots]);

  // For rendering, expand chords to match the active melody's measure span so chord labels
  // don't appear/disappear when numMeasures is changed while a different-length melody is shown.
  // processedChordsRaw is also used by the block-layout effect below; calculateAllOffsets
  // always pads to numMeasures measures independently, so using displayNumMeasures here is safe.
  const processedChordsRaw = useMemo(() => getChordsWithSlashes(chordProgression, displayNumMeasures, timeSignature),
    [chordProgression, displayNumMeasures, timeSignature]);
  const processedChords = useMemo(() => (animationMode === 'pagination' && musicalBlocks)
    ? sliceChordsByRange(processedChordsRaw, localMeasureStart, displayNumMeasures, measureLengthSlots)
    : processedChordsRaw,
    [processedChordsRaw, animationMode, musicalBlocks, localMeasureStart, displayNumMeasures, measureLengthSlots]);

  const trebleAccidentals = useMemo(() => generateAccidentalMap(adjustedTrebleMelody.notes, numAccidentals),
    [adjustedTrebleMelody, numAccidentals]);
  const bassAccidentals = useMemo(() => generateAccidentalMap(adjustedBassMelody.notes, numAccidentals),
    [adjustedBassMelody, numAccidentals]);

  // MUSICAL PAGINATION: Calculate ideal block distribution based on available width and slot density.
  // This effect runs whenever the layout or song content changes, ensuring balanced blocks.
  const prevBlocksJsonRef = React.useRef('[]');
  // Debounce timer: during playback, layout changes (endX/startX) fire on every resize frame.
  // Deferring by 350 ms prevents mid-playback re-pagination that looks jarring.
  const blockChangeTimerRef = React.useRef(null);
  React.useEffect(() => {
    // Dry-run: calculate how many slots the WHOLE melody needs
    const fullTrebleAcc = generateAccidentalMap(trebleMelody?.notes || [], numAccidentals);
    const fullBassAcc = generateAccidentalMap(bassMelody?.notes || [], numAccidentals);
    
    // Use melodyMeasureCount (derived from actual note content), NOT numMeasures (generator
    // setting). numMeasures only controls how many measures the generator will produce next
    // time; the sheet music must reflect what is actually in the melody.
    const allOffsetsFull = calculateAllOffsets(
      timeSignature,
      noteGroupSize,
      numRepeats,
      melodyMeasureCount,
      partialMeasureStart,
      trebleMelody?.rhythmicGrouping ?? bassMelody?.rhythmicGrouping ?? percussionMelody?.rhythmicGrouping ?? null,
      (notesVisible && trebleMelody) ? melodyToTaggedOffsets(trebleMelody, fullTrebleAcc) : [],
      (notesVisible && bassMelody) ? melodyToTaggedOffsets(bassMelody, fullBassAcc) : [],
      (notesVisible && percussionMelody) ? percussionMelody.offsets : [],
      metronomeMelody ? metronomeMelody.offsets : [],
      processedChordsRaw.map(c => c.absoluteOffset),
    );

    const totalSlots = allOffsetsFull.length;
    const availableWidth = endX - startX;
    const rawSlotLength = totalSlots > 2 ? availableWidth / (totalSlots - 2) : availableWidth / 2;

    const newBlocks = calculateMusicalBlocks(melodyMeasureCount, rawSlotLength, 10);

    if (!onMusicalBlocksChange || animationMode !== 'pagination') return;

    const newBlocksJson = JSON.stringify(newBlocks);
    if (newBlocksJson === prevBlocksJsonRef.current) return;

    const apply = () => {
      prevBlocksJsonRef.current = newBlocksJson;
      onMusicalBlocksChange(newBlocks);
    };

    // During playback, debounce layout-driven re-paginations (e.g. window resize) by 350 ms
    // so the page boundaries don't jump on every resize frame. Content-driven changes
    // (melody, time signature) are also debounced but 350 ms is imperceptible there.
    // When not playing, update immediately so the stopped view is always accurate.
    if (isPlaying) {
      clearTimeout(blockChangeTimerRef.current);
      blockChangeTimerRef.current = setTimeout(apply, 350);
    } else {
      clearTimeout(blockChangeTimerRef.current);
      apply();
    }
  }, [
    onMusicalBlocksChange,
    animationMode,
    melodyMeasureCount,  // actual measure count from melody content, not the generator setting
    endX,
    startX,
    timeSignature,
    noteGroupSize,
    numRepeats,
    partialMeasureStart,
    notesVisible,
    trebleMelody,
    bassMelody,
    percussionMelody,
    metronomeMelody,
    numAccidentals,
    processedChordsRaw,
    isPlaying,
  ]);

  // Layer A: pure Layer A data — never merged with Layer B so Layer A note positions stay stable
  const allOffsets = useMemo(() => calculateAllOffsets(
    timeSignature,
    noteGroupSize,
    numRepeats,
    displayNumMeasures,
    partialMeasureStart,
    adjustedTrebleMelody?.rhythmicGrouping ?? adjustedBassMelody?.rhythmicGrouping ?? adjustedPercussionMelody?.rhythmicGrouping ?? null,
    (notesVisible && adjustedTrebleMelody) ? melodyToTaggedOffsets(adjustedTrebleMelody, trebleAccidentals) : [],
    (notesVisible && adjustedBassMelody) ? melodyToTaggedOffsets(adjustedBassMelody, bassAccidentals) : [],
    (notesVisible && adjustedPercussionMelody) ? adjustedPercussionMelody.offsets : [],
    adjustedMetronomeMelody ? adjustedMetronomeMelody.offsets : [],
    processedChords.map(c => c.absoluteOffset),
  ), [
    timeSignature, noteGroupSize, numRepeats, displayNumMeasures, partialMeasureStart,
    adjustedTrebleMelody, adjustedBassMelody, adjustedPercussionMelody, adjustedMetronomeMelody,
    trebleAccidentals, bassAccidentals, processedChords, notesVisible,
  ]);

  const noteWidth = useMemo(
    () => (allOffsets.length > 2 ? (endX - startX) / (allOffsets.length - 2) : 0),
    [allOffsets, endX, startX],
  );

  // Preview overlay layout — computed once per previewMelody change instead of
  // every SheetMusic render. The crossfade overlay does its own
  // processMelodyAndCalculateSlots × 3 + getChordsWithSlashes + generateAccidentalMap × 2
  // + calculateAllOffsets pass. Without memoisation that pass re-runs on every
  // currentMeasureIndex tick / isOddRound flip / showNotes toggle during the fade
  // (~16ms of work per render at 120 BPM 16th-note granularity).
  //
  // nextNotesVisible is derived from previewMelody._roundKey (locked by the
  // pagination scheduler at arm time) so it's stable for the fade's lifetime.
  // playbackConfig + isOddRound are listed as deps as a safety net for legacy
  // wipe/scroll callers that don't set _roundKey.
  const previewLayout = useMemo(() => {
    if (!previewMelody) return null;
    const pm = previewMelody;
    const pmDur = Math.max(getMelodyEndTime(pm.treble), getMelodyEndTime(pm.bass), getMelodyEndTime(pm.percussion));
    const pmDisplayMeasures = pmDur > 0 ? Math.max(1, Math.round(pmDur / measureLengthSlots)) : displayNumMeasures;
    const previewTreble = pm.treble ? processMelodyAndCalculateSlots(pm.treble, timeSignature, noteGroupSize, pmDur, null, null) : null;
    const previewBass = pm.bass ? processMelodyAndCalculateSlots(pm.bass, timeSignature, noteGroupSize, pmDur, null, null) : null;
    const previewPerc = pm.percussion ? processMelodyAndCalculateSlots(pm.percussion, timeSignature, noteGroupSize, pmDur, null, null) : null;
    const previewChords = pm.chordProgression ? getChordsWithSlashes(pm.chordProgression, pmDisplayMeasures, timeSignature) : null;
    const pmTrebleAcc = previewTreble ? generateAccidentalMap(previewTreble.notes, numAccidentals) : {};
    const pmBassAcc = previewBass ? generateAccidentalMap(previewBass.notes, numAccidentals) : {};
    const lockedKey = pm._roundKey;
    const nextRoundKey = lockedKey ?? (isOddRound ? 'evenRounds' : 'oddRounds');
    const nextCfg = playbackConfig?.[nextRoundKey] ?? {};
    const nextNotesVisible = !!nextCfg.notes;
    const pmAllOffsets = calculateAllOffsets(
      timeSignature, noteGroupSize, numRepeats, pmDisplayMeasures, null,
      pm.treble?.rhythmicGrouping ?? pm.bass?.rhythmicGrouping ?? pm.percussion?.rhythmicGrouping ?? null,
      (nextNotesVisible && previewTreble) ? melodyToTaggedOffsets(previewTreble, pmTrebleAcc) : [],
      (nextNotesVisible && previewBass) ? melodyToTaggedOffsets(previewBass, pmBassAcc) : [],
      (nextNotesVisible && previewPerc) ? previewPerc.offsets : [],
      [],
      [],
      previewChords ? previewChords.map(c => c.absoluteOffset) : [],
    );
    const pmNoteWidth = pmAllOffsets.length > 2 ? (endX - startX) / (pmAllOffsets.length - 2) : 0;
    return { pm, pmDur, pmDisplayMeasures, previewTreble, previewBass, previewPerc, previewChords,
      pmTrebleAcc, pmBassAcc, pmAllOffsets, pmNoteWidth, nextCfg, nextNotesVisible };
  }, [
    previewMelody, timeSignature, noteGroupSize, numAccidentals, numRepeats,
    measureLengthSlots, displayNumMeasures, endX, startX, playbackConfig, isOddRound,
  ]);

  const ppt = null;

  const getX = (index) => {
    if (index === 0) return startX - 35; // First bar left of startX (was -25)
    return startX + (index - 1) * noteWidth;
  };

  const measureLineXs = allOffsets.reduce((acc, o, i) => { if (o === 'm') acc.push(getX(i)); return acc; }, []);

  // Expose layout geometry to the App rAF loop for playhead positioning.
  // All modes use measurePpt (uniform measure width based on effectiveVisibleMeasures).
  // windowStartMeasure and pageWidth are additionally exposed for stream/wipe rAF.
  React.useEffect(() => {
    if (!layoutRef) return;
    layoutRef.current = {
      measureLineXs: Array.from({ length: effectiveVisibleMeasures + 1 }, (_, i) => startX + i * measureWidth),
      pixelsPerTick: measurePpt,
      startX,
      measureLengthSlots,
      startMeasureIndex,
      topY: trebleStart,
      bottomY,
      fixedPlayheadX: startX + 60,
      pageWidth: endX - startX,
      // melodyWidth = how wide ONE iteration of the current melody is in pixels.
      // Differs from pageWidth (= visible width) when displayNumMeasures < visibleMeasures
      // (e.g. numMeasures=1 with floored visibleMeasures=2). Scroll rAF uses melodyWidth
      // as the per-page travel distance, not pageWidth — otherwise the visual moves at
      // the wrong speed relative to audio when these differ.
      melodyWidth: displayNumMeasures * measureWidth,
    };
  }, [measureWidth, measurePpt, effectiveVisibleMeasures, layoutRef, startX, trebleStart, bottomY, measureLengthSlots, endX, startMeasureIndex, displayNumMeasures]);

  // Barlines + measure-number labels are rendered by <BarlinesLayer>
  // (./BarlinesLayer.jsx). The pure iterator lives there so React.memo can skip
  // the entire pass when its inputs are referentially equal.

  // BPM controls visibility — lifted from BpmControls so renderRandomizeIcons and handleSheetMusicClick can read it
  const [showBpmControls, setShowBpmControls] = React.useState(false);
  const bpmTimerRef = React.useRef(null);
  const resetBpmTimer = () => {
    setShowBpmControls(true);
    if (bpmTimerRef.current) clearTimeout(bpmTimerRef.current);
    bpmTimerRef.current = setTimeout(() => setShowBpmControls(false), 5000);
  };

  // resetRepeatsTimer — no-op stub kept so call sites in handleSheetMusicClick and the number picker don't need to change.
  // The original showRepeatsControls state was never read in the render, so no visible effect was lost.
  const resetRepeatsTimer = () => {};

  // Needed by the tempo-picker dialog (tempoPicker state lives here, not in BpmControls).
  const handleBpmChangeWrapper = (val) => {
    resetBpmTimer();
    openSettingsIfClosed();
    onBpmChange(Math.min(360, Math.max(12, val)));
  };

  // Walk up from el to stopEl looking for an element with the given attribute.
  // Using a manual walk instead of closest() because SVGElement.closest() is unreliable
  // in some WebView / Capacitor environments, causing note clicks to fall through to settings.
  const findAncestorWithAttr = (el, stopEl, attr) => {
    let node = el;
    while (node && node !== stopEl) {
      if (node.hasAttribute?.(attr)) return node;
      node = node.parentElement;
    }
    return null;
  };

  // Briefly flash a note or chord group in the accent colour using the note-glow SVG filter.
  // Runs entirely via DOM manipulation — no React state involved — so it never re-renders.
  const flashElement = (el) => {
    el.classList.add('note-click-flash');
    setTimeout(() => el.classList.remove('note-click-flash'), 400);
  };

  // Global click handler on the sheet music area.
  // Priority order: note click → chord click → toggle settings.
  // Note groups carry data-notes; chord groups carry data-chord-notes.
  // Both are detected via a manual ancestor walk (more reliable than closest() in SVG).
  const handleSheetMusicClick = (e) => {
    const stopEl = e.currentTarget;

    // 1. Note click — always intercept, even if onNoteClick is null, to prevent settings from opening
    const noteGroup = findAncestorWithAttr(e.target, stopEl, 'data-notes');
    if (noteGroup) {
      try {
        const notes = JSON.parse(noteGroup.getAttribute('data-notes'));
        const staff = noteGroup.getAttribute('data-mel') || 'treble';
        if (onNoteClick && notes?.length) {
          flashElement(noteGroup);
          onNoteClick(notes, staff);
        }
      } catch { /* audio context may not be ready */ }
      return;
    }

    // 2. Chord click — uses strumming + bass root via onChordClick (ChordGrid logic)
    const chordGroup = findAncestorWithAttr(e.target, stopEl, 'data-chord-notes');
    if (chordGroup) {
      try {
        const notes = JSON.parse(chordGroup.getAttribute('data-chord-notes'));
        if (onChordClick && notes?.length) {
          flashElement(chordGroup);
          onChordClick(notes);
          return;
        }
      } catch { /* audio context may not be ready */ }
    }

    // 3. Settings toggle
    if (showSettings) {
      if (onToggleSettings) onToggleSettings();
      return;
    }
    if (onToggleSettings) onToggleSettings();
    resetNumericTimer();
    resetBpmTimer();
    resetRepeatsTimer();
  };

  const renderRandomizeIcons = () => {
    if (!showBpmControls && !showSettings) return null;

    // Collect barline x-coordinates to find the last measure interval
    const boundaries = [];
    allOffsets.forEach((ts, i) => { if (ts === 'm') boundaries.push(getX(i)); });
    boundaries.push(startX + allOffsets.length * noteWidth);
    if (boundaries.length < 2) return null;

    const i = boundaries.length - 2; // last measure index
    const span = (systemEndX ?? endX) - startX;
    const xPos = startX + 0.8 * span;

    const wrapIcon = (key, cy, staff) => (
      <g key={key} transform={`translate(${xPos}, ${cy})`}>
        <RandomizeIcon onClick={() => onRandomizeMeasure(i, staff)} debugMode={debugMode} />
      </g>
    );

    return [
      isTrebleVisible && wrapIcon("rand-treble-last", trebleStart + 20, 'treble'),
      isBassVisible && wrapIcon("rand-bass-last", bassStart + 20, 'bass'),
      isPercussionVisible && wrapIcon("rand-perc-last", percussionStart + 20, 'percussion'),
    ].filter(Boolean);
  };

  // Repeat symbols on staves.
  // staveYsOverride: when provided, renders symbols only at those Y values (used for per-staff
  //   eye-off repeats in melody mode). When null, renders for all layout-visible staves.
  // Delegates to the pure helper in ./renderOneMeasureRepeatSymbols.jsx so PreviewOverlay
  // can call the same renderer without closure-capturing parent state.
  const renderRepeatSymbols = (offsets = allOffsets, nw = noteWidth, ppt = null, staveYsOverride = null, color = null) => {
    const staveYs = staveYsOverride ?? [
      { y: 30, show: isTrebleVisible },
      { y: 30, show: isBassVisible },
      { y: 30, show: isPercussionVisible },
    ].filter(s => s.show).map(s => s.y);
    return renderOneMeasureRepeatSymbols({
      offsets,
      noteWidth: nw,
      pixelsPerTick: ppt,
      staveYs,
      color,
      startX,
      displayNumMeasures,
      measureLengthSlots,
      showSettings,
    });
  };

  // ── Debug: RhythmicDNA overlay above chord labels ────────────────────────────────────────
  // DNA debug is now rendered as an HTML overlay above the SVG (see the HTML overlay block
  // just before the SVG wrapper div). Kept here as a no-op stub so call sites compile.
  const renderDNADebug = () => null;

  // ── Lyric color helper — mirrors getMelodicColor / percussion chromatone logic ──────────
  const PERC_CHROMA = {
    k:  'var(--chromatone-percussion-kick)',
    s:  'var(--chromatone-percussion-snare)',
    sg: 'var(--chromatone-percussion-snare-ghost)',
    sr: 'var(--chromatone-percussion-snare-rim)',
    hh: 'var(--chromatone-percussion-hihat-closed)',
    ho: 'var(--chromatone-percussion-hihat-open)',
    hp: 'var(--chromatone-percussion-hihat-pedal)',
    th: 'var(--chromatone-percussion-tom-high)',
    tm: 'var(--chromatone-percussion-tom-mid)',
    tl: 'var(--chromatone-percussion-tom-floor)',
    cc: 'var(--chromatone-percussion-crash)',
    cr: 'var(--chromatone-percussion-ride)',
  };
  // For a chord array, returns the note with the lowest absolute pitch (octave * 12 + pc).
  const lowestNote = (note) => {
    if (!Array.isArray(note)) return note;
    const midiOf = (n) => {
      const m = String(n).match(/^(.+?)(-?\d+)$/);
      return m ? parseInt(m[2]) * 12 + getNoteSemitone(m[1]) : 0;
    };
    return note.reduce((low, n) => midiOf(n) < midiOf(low) ? n : low, note[0]);
  };

  const getLyricFill = (note, absoluteOffset, isPercussion = false) => {
    const mixTarget = theme === 'light' ? 'black' : 'white';
    if (isPercussion) {
      if (noteColoringMode === 'chromatone' || noteColoringMode === 'subtle-chroma') {
        const firstDrum = Array.isArray(note) ? note[0] : note;
        const base = PERC_CHROMA[firstDrum] ?? 'var(--text-primary)';
        return noteColoringMode === 'subtle-chroma'
          ? `color-mix(in srgb, ${base}, ${mixTarget} 60%)`
          : base;
      }
      return 'var(--text-primary)';
    }
    // Melodic — resolve chord array to lowest note
    const resolved = lowestNote(note);
    const pc = getNoteSemitone(resolved);
    if (noteColoringMode === 'chromatone') return `var(--chromatone-${pc})`;
    if (noteColoringMode === 'subtle-chroma')
      return `color-mix(in srgb, var(--chromatone-${pc}), ${mixTarget} 60%)`;
    if (noteColoringMode === 'chords') {
      const active = processedChords.filter(c => !c.isSlash && c.absoluteOffset <= absoluteOffset).at(-1);
      if (active?.chord?.notes?.length > 0 && active.chord.notes.some(cn => getNoteSemitone(cn) === pc))
        return `color-mix(in srgb, var(--chromatone-${getNoteSemitone(active.chord.root)}), ${mixTarget} 30%)`;
      return 'var(--text-primary)';
    }
    if (noteColoringMode === 'tonic_scale_keys') {
      if (pc === getNoteSemitone(tonic)) return 'var(--note-tonic)';
      if (scaleNotes.some(s => getNoteSemitone(s) === pc)) return 'var(--note-scale)';
    }
    return 'var(--text-primary)';
  };

  // Renders melodic solfège lyrics (do-re-mi / Kodály) below the treble staff.
  // lyricsY is the absolute SVG y coordinate for the text baseline.
  // Solfège from display spelling: D♭ → re♭, C♯ → do♯, etc.
  // Uses the letter name of the correctly-spelled display note, not the pitch class,
  // so the accidental matches the written note rather than always picking the sharp variant.
  const NOTE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const DIATONIC_SOLFEGE = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
  const spellingToSolfege = (rawNote, rootLetter) => {
    const displayNote = getRelativeNoteName(rawNote, tonic);
    const letter = displayNote?.match(/^([A-G])/)?.[1];
    if (!letter) return { base: '?', acc: '' };
    const acc = displayNote.replace(/^[A-G]/, '').replace(/-?\d+$/, '');
    const degree = (NOTE_LETTERS.indexOf(letter) - NOTE_LETTERS.indexOf(rootLetter) + 7) % 7;
    return { base: DIATONIC_SOLFEGE[degree], acc };
  };

  const LYRIC_FONT_SIZE = 16;
  // Font size for individual chord notes — slightly smaller to fit multiple stacked syllables
  const LYRIC_CHORD_FONT_SIZE = 13;

  // Returns {base, acc} solfège pair for a single note string.
  const getSolfegeForNote = (rawNote) => {
    if (lyricsMode === 'doremi-rel') {
      const tonicLetter = (tonic || 'C').replace(/[♯♭𝄪𝄫]/gu, '').replace(/-?\d+$/, '')[0] || 'C';
      return spellingToSolfege(rawNote, tonicLetter);
    } else if (lyricsMode === 'doremi-abs') {
      return spellingToSolfege(rawNote, 'C');
    } else {
      return getKodalySolfege(rawNote, tonic);
    }
  };

  const renderLyricsRow = (melody, lyricsY, offsets = allOffsets, nw = noteWidth) => {
    if (!melody || !tonic || !melodicLyricsActive) return null;
    const notes = melody.notes;
    const melOffsets = melody.offsets;
    if (!notes || !melOffsets) return null;
    const ties = melody.ties || [];

    const getXLocal = (index) => startX + (index - 1) * nw;

    // Sort a chord array low-to-high by MIDI pitch
    const sortedChordNotes = (note) => {
      if (!Array.isArray(note)) return [note];
      const midiOf = (n) => {
        const m = String(n).match(/^(.+?)(-?\d+)$/);
        return m ? parseInt(m[2]) * 12 + getNoteSemitone(m[1]) : 0;
      };
      return [...note].sort((a, b) => midiOf(a) - midiOf(b));
    };

    return notes.map((note, i) => {
      if (isRest(note)) return null;
      const tickOffset = melOffsets[i];
      if (tickOffset == null) return null;
      const idx = offsets.indexOf(tickOffset);
      if (idx < 0) return null;
      const x = getXLocal(idx) + 5;

      // Tied continuation: show em dash instead of syllable (not clickable)
      const isTieContinuation = i > 0 && ties[i - 1] === 'tie';
      if (isTieContinuation) {
        const fill = getLyricFill(note, tickOffset, false);
        return (
          <text key={`lyric-${i}`} x={x} y={lyricsY} textAnchor="middle"
            fontSize={LYRIC_FONT_SIZE} fontFamily="serif" fill={fill} opacity={0.45}>
            {'—'}
          </text>
        );
      }

      const chordNotes = sortedChordNotes(note);
      const isChord = chordNotes.length > 1;
      const fontSize = isChord ? LYRIC_CHORD_FONT_SIZE : LYRIC_FONT_SIZE;
      // Stack syllables: lowest note at lyricsY, higher notes going upward
      const spacing = fontSize + 1;

      return (
        <g key={`lyric-${i}`} style={{ cursor: 'pointer' }}
          onClick={(e) => { e.stopPropagation(); if (onNoteClick) onNoteClick(chordNotes, 'treble'); }}>
          <rect x={x - 14} y={lyricsY - spacing * chordNotes.length} width={28} height={spacing * chordNotes.length + 4} fill="transparent" />
          {chordNotes.map((singleNote, ni) => {
            const { base, acc } = getSolfegeForNote(singleNote);
            const fill = getLyricFill(isChord ? singleNote : note, tickOffset, false);
            // ni=0 is the lowest note (bottom), higher indices go upward
            const y = lyricsY - ni * spacing;
            return (
              <text key={ni} x={x} y={y} textAnchor="middle" fontSize={fontSize} fontFamily="serif" fill={fill} style={{ pointerEvents: 'none' }}>
                {base.toLowerCase()}
                {acc && <tspan fontSize={fontSize * 0.95} dy={-2} opacity={0.5}>{acc}</tspan>}
              </text>
            );
          })}
        </g>
      );
    });
  };

  // Renders fermata glyphs above the treble staff. Tick-based format (Han
  // 2026-05-29 round 13): each fermata is { tick, hold } at the song level.
  // The glyph sits above whichever note happens to land on that tick.
  // Maestro 'U' (SHIFT+u) is the arc-down fermata for stem-down notes;
  // stem-direction-aware swap to 'u' is a follow-up refinement.
  const renderFermataGlyphs = (melody, glyphY, offsets = allOffsets, nw = noteWidth) => {
    if (!melody?.fermatas || melody.fermatas.length === 0) return null;
    if (!melody.offsets) return null;
    const getXLocal = (index) => startX + (index - 1) * nw;
    return melody.fermatas.map((f, fi) => {
      if (typeof f?.tick !== 'number') return null;
      const idx = offsets.indexOf(f.tick);
      if (idx < 0) return null;
      const x = getXLocal(idx) + 5;
      return (
        <text
          key={`fermata-${fi}`}
          x={x} y={glyphY}
          fontSize={24}
          fontFamily="Maestro"
          fill="var(--text-primary)"
          textAnchor="middle"
          style={{ userSelect: 'none' }}
        >
          U
        </text>
      );
    });
  };

  // Renders song text lyrics (from melody.lyrics[]) below the treble staff.
  // Used when a song is loaded; independent of the solfège lyricsMode setting.
  const renderTextLyricsRow = (melody, lyricsY, offsets = allOffsets, nw = noteWidth) => {
    if (!melody?.lyrics || !textLyricsActive) return null;
    const notes = melody.notes;
    const melOffsets = melody.offsets;
    if (!notes || !melOffsets) return null;

    const getXLocal = (index) => startX + (index - 1) * nw;
    const FONT_SIZE = 13;

    return notes.map((note, i) => {
      const syllable = melody.lyrics[i];
      if (!syllable) return null;
      const tickOffset = melOffsets[i];
      if (tickOffset == null) return null;
      const idx = offsets.indexOf(tickOffset);
      if (idx < 0) return null;
      const x = getXLocal(idx) + 5;
      const fill = getLyricFill(note, tickOffset, false);
      return (
        <text
          key={`tlyric-${i}`}
          x={x} y={lyricsY}
          textAnchor="middle"
          fontSize={FONT_SIZE}
          fontFamily="Georgia, 'Times New Roman', serif"
          fill={fill}
        >
          {syllable}
        </text>
      );
    });
  };

  // Renders Takadimi rhythmic solfège lyrics below the percussion staff.
  const renderRhythmicLyricsRow = (melody, lyricsY, offsets = allOffsets, nw = noteWidth) => {
    if (!melody || !rhythmicLyricsActive) return null;
    const notes = melody.notes;
    const melOffsets = melody.offsets;
    if (!notes || !melOffsets) return null;

    const compound = isCompoundMeter(timeSignature);
    // Prefer smallestNoteDenom from the melody's generation settings over deriving from durations.
    // e.g. percussion set to 16th-note grid → beat = quarter even if no 16ths were generated.
    const beatDur = getEffectiveBeatDuration(timeSignature, melody.durations, melody.smallestNoteDenom ?? null);
    // Group-aware Takadimi: rhythmicGrouping carries the beat-group sizes (e.g. [2,3] for 5/8).
    // When present, each group independently determines simple (÷2) or compound (÷3) syllables.
    const melodyGrouping = melody.rhythmicGrouping ?? null;
    const unitTicks = TICKS_PER_WHOLE / timeSignature[1];
    const getXLocal = (index) => startX + (index - 1) * nw;

    // Pre-compute tuplet position for each note. melody.triplets[i] identifies the group
    // (same id for all notes in a group); posInGroup is the 0-based index within it.
    // This is more reliable than tick-based detection: Math.round(groupTicks / noteCount)
    // produces non-integer B/N fractions that don't satisfy exact equality checks.
    const triplets = melody.triplets ?? null;
    const tupletPosMap = new Map(); // note index → { noteCount, posInGroup }
    if (triplets) {
      let lastTupletId = null;
      let posInGroup = 0;
      for (let ti = 0; ti < notes.length; ti++) {
        const t = triplets[ti];
        if (t) {
          if (t.id === lastTupletId) {
            posInGroup++;
          } else {
            posInGroup = 0;
            lastTupletId = t.id;
          }
          tupletPosMap.set(ti, { noteCount: t.noteCount, posInGroup });
        } else {
          lastTupletId = null;
        }
      }
    }

    return notes.map((note, i) => {
      // Skip rests and null slots — only annotate actual drum hits
      if (isRest(note)) return null;
      const tickOffset = melOffsets[i];
      if (tickOffset == null) return null;
      const idx = offsets.indexOf(tickOffset);
      if (idx < 0) return null;
      const x = getXLocal(idx) + 5;

      // Tuplet notes use position-within-group syllables (ta ka di mi ti / ta va ki di da ma ti).
      // Regular notes: when rhythmicGrouping is available, derive syllable from the beat group
      // the note falls in (group of 3 = compound ta-ki-da, group of 2 = simple ta-di).
      // Falls back to the single-beatDuration path for metronome / missing grouping.
      const tupletPos = tupletPosMap.get(i);
      const syllable = tupletPos
          ? getTupletSyllable(tupletPos.posInGroup, tupletPos.noteCount)
          : melodyGrouping
              ? getTakadimiSyllableGrouped(tickOffset % measureLengthSlots, melodyGrouping, unitTicks)
              : getTakadimiSyllable(tickOffset, beatDur, compound);
      if (!syllable || syllable === '·') return null;

      const percNotes = Array.isArray(note) ? note : [note];
      return (
        <g key={`rlyric-${i}`} style={{ cursor: 'pointer' }}
          onClick={(e) => { e.stopPropagation(); if (onNoteClick) onNoteClick(percNotes, 'percussion'); }}>
          <rect x={x - 12} y={lyricsY - LYRIC_FONT_SIZE} width={24} height={LYRIC_FONT_SIZE + 6} fill="transparent" />
          <text
            x={x} y={lyricsY} textAnchor="middle"
            fontSize={LYRIC_FONT_SIZE} fontFamily="serif"
            fill={getLyricFill(note, tickOffset, true)}
            style={{ pointerEvents: 'none' }}
          >
            {syllable}
          </text>
        </g>
      );
    });
  };

  // Resolved clef symbol data for the current melody (may differ from base clef e.g. treble8va).
  const cfT = clefSymbols[clefTreble] || clefSymbols.treble;
  const cfB = clefSymbols[clefBass] || clefSymbols.bass;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: '100%', position: 'relative' }}
    >
      {/* Clef + range picker — same visual style as GenericStepper's list popup.
          Opens when the user clicks the clef symbol in the sheet music. */}
      {clefPicker && (
        <>
          <div className="gs-popup-overlay" onClick={() => setClefPicker(null)} />
          <div className="gs-popup" onClick={e => e.stopPropagation()}>
            <div className="gs-popup-options">
              {CLEF_RANGE_OPTIONS.map(opt => {
                const activeSettings = clefPicker === 'treble' ? trebleSettings : bassSettings;
                const activeClef     = clefPicker === 'treble' ? trebleActiveClef : bassActiveClef;
                const current        = getCurrentRangeValue(activeSettings, activeClef);
                const isSelected     = current === opt.value;
                return (
                  <button
                    key={opt.value}
                    className={`gs-popup-option${isSelected ? ' selected' : ''}`}
                    onClick={() => {
                      const setter = clefPicker === 'treble' ? setTrebleSettings : setBassSettings;
                      if (setter) applyRangeOption(opt.value, setter);
                      setClefPicker(null);
                    }}
                  >
                    <div className="gs-popup-option-icon">
                      {/* Clef glyph using Maestro font — g=treble, f=bass, B=vocal */}
                      <span style={{ fontFamily: 'Maestro', fontSize: '20px', lineHeight: 1 }}>
                        {opt.clefType === 'g' ? '&' : opt.clefType === 'f' ? '?' : 'B'}
                      </span>
                    </div>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Transposition instrument picker — same gs-popup style as clef picker.
          Opens when the user clicks the (B♭ inst) label above the staff.
          Shows pitch label + full instrument names on a second line.
          Uses ♭/♯ throughout — never b or # in display. */}
      {transPicker && (
        <>
          <div className="gs-popup-overlay" onClick={() => setTransPicker(null)} />
          <div className="gs-popup" onClick={e => e.stopPropagation()}>
            <div className="gs-popup-options">
              {TRANSPOSING_INSTRUMENTS.map(inst => {
                const activeSettings = transPicker === 'treble' ? trebleSettings : bassSettings;
                const isCurrent = (activeSettings?.transpositionKey || 'C') === inst.key;
                return (
                  <button
                    key={inst.key}
                    className={`gs-popup-option${isCurrent ? ' selected' : ''}`}
                    onClick={() => {
                      const setter = transPicker === 'treble' ? setTrebleSettings : setBassSettings;
                      if (setter) setter(prev => ({ ...prev, transpositionKey: inst.key }));
                      setTransPicker(null);
                    }}
                  >
                    {/* Pitch label in icon position */}
                    <div className="gs-popup-option-icon" style={{ fontFamily: 'serif', fontSize: '13px' }}>
                      {inst.label}
                    </div>
                    {/* Instrument names: max 2 lines */}
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1 }}>
                      {inst.instruments.slice(0, 2).map((name, i) => (
                        <span key={i} style={{ fontSize: i === 0 ? '13px' : '11px', opacity: i === 0 ? 1 : 0.65 }}>{name}</span>
                      ))}
                    </span>
                    {/* Semitone offset on the right */}
                    <span style={{ fontFamily: 'serif', fontSize: '11px', opacity: 0.55, marginLeft: '6px', alignSelf: 'center', whiteSpace: 'nowrap' }}>
                      {inst.semitones > 0 ? `+${inst.semitones}` : inst.semitones < 0 ? `${inst.semitones}` : '±0'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Tempo word picker — opens when the tempo term text is clicked */}
      {tempoPicker && (
        <>
          <div className="gs-popup-overlay" onClick={() => setTempoPicker(false)} />
          <div className="gs-popup" onClick={e => e.stopPropagation()}>
            <div className="gs-popup-options">
              {tempoTerms.map((t, i) => {
                const next = tempoTerms[i + 1];
                const rangeLo = t.bpm;
                const rangeHi = next ? next.bpm - 1 : '∞';
                const isCurrent = !isRubato && bpm >= t.bpm && (next ? bpm < next.bpm : true);
                return (
                  <button
                    key={t.term + i}
                    className={`gs-popup-option${isCurrent ? ' selected' : ''}`}
                    onClick={() => {
                      // Use explicit target if set (e.g. Larghissimo=30, Prestissimo=210),
                      // otherwise midpoint of [bpm[i], bpm[i+1]).
                      const mid = t.target ?? (next ? Math.round((rangeLo + next.bpm) / 2) : rangeLo);
                      // Picking a regular tempo also exits rubato mode (Han 2026-05-29).
                      if (isRubato && onToggleRubato) onToggleRubato();
                      handleBpmChangeWrapper(mid);
                      setTempoPicker(false);
                    }}
                  >
                    <div className="gs-popup-option-icon" style={{ fontFamily: 'serif', fontSize: '13px', minWidth: '28px' }}>
                      {rangeLo}
                    </div>
                    <span style={{ flex: 1 }}>{t.term}</span>
                    <span style={{ fontSize: '11px', opacity: 0.5, marginLeft: '6px', whiteSpace: 'nowrap' }}>
                      {rangeLo}–{rangeHi}
                    </span>
                  </button>
                );
              })}
              {/* Rubato entry — Han 2026-05-29: appended to the tempo list so picking
                  it switches the display to q = T (Maestro SHIFT+T) and the term "rubato".
                  Re-clicking it while already in rubato is a no-op. */}
              {onToggleRubato && (
                <button
                  key="rubato"
                  className={`gs-popup-option${isRubato ? ' selected' : ''}`}
                  onClick={() => {
                    if (!isRubato) onToggleRubato();
                    setTempoPicker(false);
                  }}
                >
                  <div className="gs-popup-option-icon" style={{ fontFamily: 'Maestro', fontSize: '18px', minWidth: '28px' }}>
                    T
                  </div>
                  <span style={{ flex: 1 }}>rubato</span>
                  <span style={{ fontSize: '11px', opacity: 0.5, marginLeft: '6px', whiteSpace: 'nowrap' }}>
                    free time
                  </span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Overlay controls — rendered INSIDE the SVG so coords match stave geometry */}

      <div
        style={{ flex: 1, display: 'flex', justifyContent: 'center', width: '100%', cursor: showSettings ? 'pointer' : 'default' }}
        onClick={handleSheetMusicClick}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`-5 -30 ${logicalScreenWidth} ${logicalHeightForViewBox}`}
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id="note-glow" x="-75%" y="-75%" width="250%" height="250%">
              <feFlood floodColor="white" result="white" />
              <feComposite in="white" in2="SourceGraphic" operator="in" result="whiteShape" />
              <feGaussianBlur in="whiteShape" stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="note-glow-subtle" x="-50%" y="-50%" width="200%" height="200%">
              <feFlood floodColor="white" result="white" />
              <feComposite in="white" in2="SourceGraphic" operator="in" result="whiteShape" />
              <feGaussianBlur in="whiteShape" stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="note-glow-success" x="-75%" y="-75%" width="250%" height="250%">
              <feFlood floodColor="#00FF00" result="green" />
              <feComposite in="green" in2="SourceGraphic" operator="in" result="greenShape" />
              <feGaussianBlur in="greenShape" stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="note-glow-error" x="-75%" y="-75%" width="250%" height="250%">
              <feFlood floodColor="#FF0000" result="red" />
              <feComposite in="red" in2="SourceGraphic" operator="in" result="redShape" />
              <feGaussianBlur in="redShape" stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Scroll mode (playing): soft left fade mask for scroll content group (melodies + chords only).
                Scroll mode (stopped): hard clip so notes don't peek left of startX. */}
            {animationMode === 'scroll' && isPlaying ? (
              <>
                <linearGradient id="scroll-left-fade" x1={startX - 10} y1="0" x2={startX} y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="white" stopOpacity="0" />
                  <stop offset="100%" stopColor="white" stopOpacity="1" />
                </linearGradient>
                <mask id="scroll-left-mask" maskUnits="userSpaceOnUse">
                  {/* fully transparent left of startX-10, gradient fade startX-10→startX,
                      fully opaque at and beyond startX — so notes AT startX are always visible */}
                  <rect x="-9999" y="-9999" width="99999" height="99999" fill="url(#scroll-left-fade)" />
                </mask>
                {/* Right fade: background-coloured rect that fades in from endX-10 to endX,
                    placed as an overlay covering melodies AND staff lines. */}
                <linearGradient id="scroll-right-fade" x1={endX - 10} y1="0" x2={endX} y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="var(--panel-bg)" stopOpacity="0" />
                  <stop offset="100%" stopColor="var(--panel-bg)" stopOpacity="1" />
                </linearGradient>
              </>
            ) : (
              <clipPath id="scroll-content-clip">
                <rect x={startX} y={-9999} width={99999} height={99999} />
              </clipPath>
            )}
          </defs>

          {/* Settings overlay is rendered AFTER blurred content so it appears on top */}
          {/* Vertical Barline - start of system. Animate height. */}
          <line
            x1="0" y1={trebleStart}
            x2="0" y2={bottomY}
            stroke="var(--text-primary)"
            strokeWidth="0.5"
            style={{ transition: 'y1 1s ease-in-out, y2 1s ease-in-out' }}
          />

          {/* Draw BPM Controls */}
          <BpmControls
            bpm={bpm}
            onBpmChange={onBpmChange}
            trebleStart={trebleStart}
            showSettings={showSettings}
            showBpmControls={showBpmControls}
            onResetBpmTimer={resetBpmTimer}
            debugMode={debugMode}
            openSettingsIfClosed={openSettingsIfClosed}
            onSettingsInteraction={onSettingsInteraction}
            setTempoPicker={setTempoPicker}
            isRubato={isRubato}
            onToggleRubato={onToggleRubato}
          />

          {/* Draw Repeats Controls - always visible, shows 4x outside adjustments.
              Hidden in rangeEditMode: the range selector wants plain staves with
              no repeat affordances. */}
          {!rangeEditMode && (
            <RepeatsControls
              numRepeats={numRepeats}
              onNumRepeatsChange={onNumRepeatsChange}
              trebleStart={trebleStart}
              systemEndX={systemEndX}
              showSettings={showSettings}
              debugMode={debugMode}
              onSettingsInteraction={onSettingsInteraction}
              onResetRepeatsTimer={resetRepeatsTimer}
            />
          )}

          {/* Randomize Icons */}
          {renderRandomizeIcons()}

          {/* TREBLE GROUP */}
          <g className="staff-group" style={{
            transform: `translateY(${trebleStart}px)`,
            opacity: isTrebleVisible ? 1 : 0,
            pointerEvents: isTrebleVisible ? 'auto' : 'none',
            transition: 'transform 1s ease-in-out, opacity 1s ease-in-out'
          }}>
            {[0, 10, 20, 30, 40].map(y => (
              <path key={`t-line-${y}`} d={`M 0 ${y} H ${endX}`} stroke="var(--text-primary)" strokeWidth="0.5" />
            ))}
            {isTrebleVisible && (
              <>
                <text
                  x="13"
                  y={30 + (cfT.yOffset || 0)}
                  fontSize="36"
                  fill={showSettings ? 'var(--accent-yellow)' : 'var(--text-primary)'}
                  fontFamily="Maestro"
                  style={{ transition: 'fill 0.2s', pointerEvents: 'none' }}
                >
                  {cfT.char}
                </text>
                {/* Always-active transparent hit rect for treble clef — intercepts clicks
                    regardless of showSettings, preventing accidental settings-close. */}
                {debugMode && <rect x={5} y={-8} width={40} height={65} fill="blue" fillOpacity={0.4} stroke="blue" strokeWidth={1} />}
                <rect
                  x={5} y={-8} width={40} height={65}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseDown={() => clefLongPress.start(() => {
                    clefTapCountRef.current.treble = 0;
                    clearTimeout(clefTapTimerRef.current.treble);
                    setClefPicker(prev => prev === 'treble' ? null : 'treble');
                    onSettingsInteraction?.(10000);
                  })}
                  onMouseUp={(e) => { e.stopPropagation(); clefLongPress.end(e, () => handleClefTap('treble')); }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseLeave={() => clefLongPress.cancel()}
                  onTouchStart={() => clefLongPress.start(() => {
                    clefTapCountRef.current.treble = 0;
                    clearTimeout(clefTapTimerRef.current.treble);
                    setClefPicker(prev => prev === 'treble' ? null : 'treble');
                  })}
                  onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); clefLongPress.end(e, () => handleClefTap('treble')); }}
                />
                {cfT.ottava && (
                  <text
                    x="13"
                    y={30 + cfT.yOffset + (cfT.below ? 30 : -46)}
                    fontSize={cfT.ottava === '15' ? "23" : "14"}
                    fill={showSettings ? 'var(--accent-yellow)' : (cfT.ottava === '15' ? '#ffffff' : 'var(--text-primary)')}
                    fontFamily="Maestro"
                    textAnchor="middle"
                    dx={cfT.ottava === '15' && !cfT.below ? "12" : "10"}
                  >
                    {cfT.ottava === '15' ? String.fromCharCode(134) : cfT.ottava}
                  </text>
                )}
                {renderAccidentals(numAccidentals, clefTreble, 0, noteColoringMode, accidentalStartX, accidentalSpacing)}
                {/* Clickable overlay on key-signature accidentals: toggles tonic to enharmonic equivalent */}
                {numAccidentals !== 0 && onEnharmonicToggle && (() => {
                  const n = Math.min(Math.abs(numAccidentals), 7);
                  const rw = accidentalSpacing * (n - 1) + 18;
                  return (
                    <>
                      {debugMode && <rect x={accidentalStartX - 2} y={-5} width={rw} height={60} fill="teal" fillOpacity={0.3} stroke="teal" strokeWidth={1} />}
                      <rect
                        x={accidentalStartX - 2} y={-5} width={rw} height={60}
                        fill="transparent" style={{ cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); onEnharmonicToggle(); }}
                      />
                    </>
                  );
                })()}
              </>
            )}
            {renderStaffMeasureTexts(0)}
            {/* Transposition label — rendered AFTER renderStaffMeasureTexts so it sits on top
                of the time-signature hitbox rects in SVG z-order, preventing overlap stealing clicks.
                Always visible when non-concert-pitch; shown in settings mode as a click target.
                Click opens the transposition picker list. Font: serif to match all sheet music text. */}
            {isTrebleVisible && (trebleTransSemitones !== 0 || showSettings) && (
              <>
                {debugMode && <rect x={accidentalStartX - 12} y={-20} width={55} height={16} fill="red" fillOpacity={0.4} stroke="red" strokeWidth={1} />}
                <text
                  x={accidentalStartX - 10}
                  y={-8}
                  fontSize="12"
                  fontFamily="serif"
                  fill={showSettings ? 'var(--accent-yellow)' : 'var(--text-dim)'}
                  textAnchor="start"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTransPicker(prev => prev === 'treble' ? null : 'treble');
                    openSettingsIfClosed();
                    onSettingsInteraction?.(10000);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  ({getTranspositionDisplay(trebleSettings?.transpositionKey || 'C')})
                </text>
              </>
            )}
          </g>

          {/* BASS GROUP */}
          <g className="staff-group" style={{
            transform: `translateY(${bassStart}px)`,
            opacity: isBassVisible ? 1 : 0,
            pointerEvents: isBassVisible ? 'auto' : 'none',
            transition: 'transform 1s ease-in-out, opacity 1s ease-in-out'
          }}>
            {[0, 10, 20, 30, 40].map(y => (
              <path key={`b-line-${y}`} d={`M 0 ${y} H ${endX}`} stroke="var(--text-primary)" strokeWidth="0.5" />
            ))}
            {isBassVisible && (
              <>
                <text
                  x="13"
                  y={30 + (cfB.yOffset || 0)}
                  fontSize="36"
                  fill={showSettings ? 'var(--accent-yellow)' : 'var(--text-primary)'}
                  fontFamily="Maestro"
                  style={{ transition: 'fill 0.2s', pointerEvents: 'none' }}
                >
                  {cfB.char}
                </text>
                {/* Always-active transparent hit rect for bass clef */}
                {debugMode && <rect x={5} y={5} width={35} height={30} fill="blue" fillOpacity={0.4} stroke="blue" strokeWidth={1} />}
                <rect
                  x={5} y={5} width={35} height={30}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseDown={() => clefLongPress.start(() => {
                    clefTapCountRef.current.bass = 0;
                    clearTimeout(clefTapTimerRef.current.bass);
                    setClefPicker(prev => prev === 'bass' ? null : 'bass');
                    onSettingsInteraction?.(10000);
                  })}
                  onMouseUp={(e) => { e.stopPropagation(); clefLongPress.end(e, () => handleClefTap('bass')); }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseLeave={() => clefLongPress.cancel()}
                  onTouchStart={() => clefLongPress.start(() => {
                    clefTapCountRef.current.bass = 0;
                    clearTimeout(clefTapTimerRef.current.bass);
                    setClefPicker(prev => prev === 'bass' ? null : 'bass');
                    onSettingsInteraction?.(10000);
                  })}
                  onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); clefLongPress.end(e, () => handleClefTap('bass')); }}
                />
                {cfB.ottava && (
                  <text
                    x="13"
                    y={30 + cfB.yOffset + (cfB.below ? 43 : -17)}
                    fontSize={cfB.ottava === '15' ? "23" : "14"}
                    fill={showSettings ? 'var(--accent-yellow)' : (cfB.ottava === '15' ? '#ffffff' : 'var(--text-primary)')}
                    fontFamily="Maestro"
                    textAnchor="middle"
                    dx="10"
                  >
                    {cfB.ottava === '15' ? String.fromCharCode(134) : cfB.ottava}
                  </text>
                )}
                {renderAccidentals(numAccidentals, clefBass, 0, noteColoringMode, accidentalStartX, accidentalSpacing)}
                {/* Clickable overlay on bass key-signature accidentals */}
                {numAccidentals !== 0 && onEnharmonicToggle && (() => {
                  const n = Math.min(Math.abs(numAccidentals), 7);
                  const rw = accidentalSpacing * (n - 1) + 18;
                  return (
                    <>
                      {debugMode && <rect x={accidentalStartX - 2} y={-5} width={rw} height={60} fill="teal" fillOpacity={0.3} stroke="teal" strokeWidth={1} />}
                      <rect
                        x={accidentalStartX - 2} y={-5} width={rw} height={60}
                        fill="transparent" style={{ cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); onEnharmonicToggle(); }}
                      />
                    </>
                  );
                })()}
              </>
            )}
            {renderStaffMeasureTexts(0)}
            {/* Bass transposition label — same z-order fix as treble: rendered after measure hitboxes */}
            {isBassVisible && (bassTransSemitones !== 0 || showSettings) && (
              <>
                {debugMode && <rect x={accidentalStartX - 12} y={-20} width={55} height={16} fill="red" fillOpacity={0.4} stroke="red" strokeWidth={1} />}
                <text
                  x={accidentalStartX - 10}
                  y={-8}
                  fontSize="12"
                  fontFamily="serif"
                  fill={showSettings ? 'var(--accent-yellow)' : 'var(--text-dim)'}
                  textAnchor="start"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTransPicker(prev => prev === 'bass' ? null : 'bass');
                    openSettingsIfClosed();
                    onSettingsInteraction?.(10000);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  ({getTranspositionDisplay(bassSettings?.transpositionKey || 'C')})
                </text>
              </>
            )}
          </g>

          {/* PERCUSSION GROUP */}
          <g className="staff-group" style={{
            transform: `translateY(${percussionStart}px)`,
            opacity: isPercussionVisible ? 1 : 0,
            pointerEvents: isPercussionVisible ? 'auto' : 'none',
            transition: 'transform 1s ease-in-out, opacity 1s ease-in-out'
          }}>
            {[0, 10, 20, 30, 40].map(y => (
              <path key={`p-line-${y}`} d={`M 0 ${y} H ${endX}`} stroke="var(--text-primary)" strokeWidth="0.5" />
            ))}
            {isPercussionVisible && (
              <text
                x="18"
                y={30}
                fontSize="36"
                fill="var(--text-primary)"
                fontFamily="Maestro"
              >
                /
              </text>
            )}
            {renderStaffMeasureTexts(0)}
          </g>
          <g>
            <g className="layer-a">
              <>
                  {/* Chord Labels Box (Conditional) */}
                  {actualChords && (
                    <rect
                      key={`chord-box-${roundKey}`}
                      x={startX - 10}
                      y={-80} // Moved up (was -70)
                      width={systemEndX - startX + 20}
                      height={50} // Increased (was 40)
                      fill={showSettings ? 'rgba(20, 19, 26, 0.85)' : 'none'}
                      rx="4"
                    />
                  )}
                  <g
                    clipPath={animationMode === 'scroll' && !isPlaying ? 'url(#scroll-content-clip)' : undefined}
                    mask={animationMode === 'scroll' && isPlaying ? 'url(#scroll-left-mask)' : undefined}
                  >
                  <g className="notes-transition" data-scroll-group style={{ willChange: animationMode === 'scroll' ? 'transform' : 'auto',
                    // In rangeEditMode the staves are blank canvases for the range
                    // selector — hide ALL melodic content (notes/chords/lyrics) but
                    // keep the node mounted so transition refs stay valid on exit.
                    display: rangeEditMode ? 'none' : undefined }}>
                    {/* Melody notes: visible in 'melody' viewMode */}
                    {/* In pagination mode, opacity is driven by the rAF loop via data-pagination-old.
                        CSS classes set the resting state; rAF sets style.opacity during the crossfade.
                        React never sets style.opacity in pagination mode (no inline opacity prop),
                        so rAF updates survive re-renders without being overwritten. */}
                    <g
                      data-wipe-role="old"
                      data-pagination-old=""
                      className={animationMode === 'pagination' && !showSettings
                        ? (notesVisible ? 'pagination-old-visible' : 'pagination-old-hidden')
                        : undefined}
                      style={{
                        opacity: showSettings ? 0.6 : (animationMode !== 'pagination' ? (notesVisible ? 1 : 0) : undefined),
                        transition: animationMode === 'scroll' ? 'opacity 0.1s ease-in' : animationMode !== 'pagination' ? 'opacity 0.2s ease-in-out' : undefined,
                        filter: showSettings ? 'blur(1.5px)' : 'none',
                      }}
                    >
                      {/* CHORD MELODY BLURRED BACKGROUND REMOVED */}
                      <g style={{ transform: `translateY(${trebleStart}px)`, transition: 'transform 1s ease-in-out' }}>
                        {actualTreble && <MelodyNotesLayer
                          melody={adjustedTrebleMelody}
                          numAccidentals={numAccidentals}
                          startX={startX}
                          noteWidth={noteWidth}
                          allOffsets={allOffsets}
                          staff="treble"
                          staffYStart={0}
                          noteGroupSize={noteGroupSize}
                          measureLengthSlots={measureLengthSlots}
                          timeSignature={timeSignature}
                          clef={clefTreble}
                          noteColoringMode={noteColoringMode}
                          tonic={tonic}
                          scaleNotes={scaleNotes}
                          processedChords={processedChords}
                          theme={theme}
                          inputTestState={inputTestState}
                          previewMode={false}
                          pixelsPerTick={ppt}
                          startMeasureIndex={startMeasureIndex}
                          transpositionSemitones={trebleTransSemitones}
                          debugMode={debugMode}
                          interactive={true}
                          courtesyAccidentals={courtesyAccidentals}
                          percussionVoiceSplit={false}
                        />}
                        {isTrebleVisible && !actualTreble && renderRepeatSymbols(allOffsets, noteWidth, ppt, [30])}
                      </g>
                      {melodicLyricsActive && actualTreble && (
                        <g className="lyrics-group">
                          {renderLyricsRow(adjustedTrebleMelody, trebleStart + staffHeight + 39)}
                        </g>
                      )}
                      {textLyricsActive && actualTreble && (
                        <g className="text-lyrics-group">
                          {/* Pass original trebleMelody so melody.lyrics indices align correctly. */}
                          {renderTextLyricsRow(trebleMelody, trebleStart + staffHeight + 39)}
                        </g>
                      )}
                      {/* Fermata glyphs just above the top staff line. Han 2026-05-29
                          said the previous trebleStart-18 was unnecessarily high; tightened
                          to -2 so the glyph sits right above the staff. */}
                      {actualTreble && trebleMelody?.fermatas && trebleMelody.fermatas.length > 0 && (
                        <g className="fermata-glyphs-group">
                          {renderFermataGlyphs(trebleMelody, trebleStart - 2)}
                        </g>
                      )}
                      <g style={{ transform: `translateY(${bassStart}px)`, transition: 'transform 1s ease-in-out' }}>
                        {actualBass && <MelodyNotesLayer
                          melody={adjustedBassMelody}
                          numAccidentals={numAccidentals}
                          startX={startX}
                          noteWidth={noteWidth}
                          allOffsets={allOffsets}
                          staff="bass"
                          staffYStart={0}
                          noteGroupSize={noteGroupSize}
                          measureLengthSlots={measureLengthSlots}
                          timeSignature={timeSignature}
                          clef={clefBass}
                          noteColoringMode={noteColoringMode}
                          tonic={tonic}
                          scaleNotes={scaleNotes}
                          processedChords={processedChords}
                          theme={theme}
                          inputTestState={inputTestState}
                          previewMode={false}
                          pixelsPerTick={ppt}
                          startMeasureIndex={startMeasureIndex}
                          transpositionSemitones={bassTransSemitones}
                          debugMode={debugMode}
                          interactive={true}
                          courtesyAccidentals={courtesyAccidentals}
                          percussionVoiceSplit={false}
                        />}
                        {isBassVisible && !actualBass && renderRepeatSymbols(allOffsets, noteWidth, ppt, [30])}
                      </g>
                      <g style={{ transform: `translateY(${percussionStart}px)`, transition: 'transform 1s ease-in-out' }}>
                        {actualPerc && <MelodyNotesLayer
                          melody={adjustedPercussionMelody}
                          numAccidentals={numAccidentals}
                          startX={startX}
                          noteWidth={noteWidth}
                          allOffsets={allOffsets}
                          staff="percussion"
                          staffYStart={0}
                          noteGroupSize={noteGroupSize}
                          measureLengthSlots={measureLengthSlots}
                          timeSignature={timeSignature}
                          clef={null}
                          noteColoringMode={noteColoringMode}
                          tonic={tonic}
                          scaleNotes={EMPTY_SCALE_NOTES}
                          processedChords={processedChords}
                          theme={theme}
                          inputTestState={inputTestState}
                          previewMode={false}
                          pixelsPerTick={ppt}
                          startMeasureIndex={startMeasureIndex}
                          transpositionSemitones={0}
                          debugMode={debugMode}
                          interactive={true}
                          courtesyAccidentals={courtesyAccidentals}
                          percussionVoiceSplit={percussionVoiceSplit}
                        />}
                        {isPercussionVisible && !actualPerc && !actualMetronome && renderRepeatSymbols(allOffsets, noteWidth, ppt, [30])}
                      </g>
                      {rhythmicLyricsActive && actualPerc && (
                        <g className="rhythmic-lyrics-group">
                          {renderRhythmicLyricsRow(adjustedPercussionMelody, percussionStart + staffHeight + 39)}
                        </g>
                      )}
                    </g>
                    {/* Repeat view: one-measure repeat symbols (all visible staves) + metronome melody (percussion) */}
                    <g
                      data-wipe-role="old"
                      style={{ opacity: notesVisible ? 0 : 1, pointerEvents: notesVisible ? 'none' : 'auto' }}
                    >
                      <g style={{ transform: `translateY(${trebleStart}px)`, transition: 'transform 1s ease-in-out' }}>
                        {isTrebleVisible && renderRepeatSymbols(allOffsets, noteWidth, ppt, [30])}
                      </g>
                      <g style={{ transform: `translateY(${bassStart}px)`, transition: 'transform 1s ease-in-out' }}>
                        {isBassVisible && renderRepeatSymbols(allOffsets, noteWidth, ppt, [30])}
                      </g>
                      <g style={{ transform: `translateY(${percussionStart}px)`, transition: 'transform 1s ease-in-out' }}>
                        {isPercussionVisible && renderRepeatSymbols(allOffsets, noteWidth, ppt, [30])}
                        {adjustedMetronomeMelody && <MelodyNotesLayer
                          melody={adjustedMetronomeMelody}
                          numAccidentals={numAccidentals}
                          startX={startX}
                          noteWidth={noteWidth}
                          allOffsets={allOffsets}
                          staff="percussion"
                          staffYStart={0}
                          noteGroupSize={noteGroupSize}
                          measureLengthSlots={measureLengthSlots}
                          timeSignature={timeSignature}
                          clef={null}
                          noteColoringMode={noteColoringMode}
                          tonic={tonic}
                          scaleNotes={EMPTY_SCALE_NOTES}
                          processedChords={processedChords}
                          theme={theme}
                          inputTestState={null}
                          previewMode={false}
                          pixelsPerTick={ppt}
                          startMeasureIndex={startMeasureIndex}
                          transpositionSemitones={0}
                          debugMode={false}
                          interactive={false}
                          courtesyAccidentals={courtesyAccidentals}
                          percussionVoiceSplit={false}
                        />}
                      </g>
                    </g>
                    {/* Regular inner barlines + measure-number labels — fade with the rest
                        of the old layer during pagination crossfade. Same pattern as the
                        chord-labels-group: data-pagination-old marks it for rAF, CSS class
                        owns the resting opacity, inline opacity is undefined in pagination
                        mode so the rAF can freely write style.opacity. */}
                    <g
                      data-wipe-role="old"
                      data-pagination-old=""
                      className={animationMode === 'pagination' && !showSettings
                        ? 'pagination-old-visible'
                        : undefined}
                      style={{
                        opacity: showSettings ? 0.6 : (animationMode !== 'pagination' ? 1 : undefined),
                        filter: showSettings ? 'blur(1.5px)' : 'none',
                      }}
                    >
                      {/* Leading barline at startX for scroll-mode main panel
                          (Han 2026-05-28). Scroll-mode overlay panels already draw
                          their own leading barline so every visual block is delimited;
                          main was missing one (the clef + signature act as visual start
                          in static notation, but scroll mode treats main as a block
                          like any other). Suppressed for wipe/pagination — those modes
                          keep the no-leading-barline convention since main never moves. */}
                      {animationMode === 'scroll' && (
                        <path d={`M ${startX} ${trebleStart} V ${bottomY}`} stroke="var(--text-primary)" strokeWidth="0.5" opacity="0.4" />
                      )}
                      <BarlinesLayer
                        mode="regular"
                        offsets={allOffsets}
                        noteWidth={noteWidth}
                        pixelsPerTick={ppt}
                        startX={startX}
                        startIdx={startMeasureIndex}
                        blockMeasureStart={blockMeasureStart}
                        blockPlayStart={blockPlayStart}
                        partialTop={partialTop}
                        partialMeasureStart={partialMeasureStart}
                        measureBottom={measureBottom}
                        measureYPositions={measureYPositions}
                        trebleStart={trebleStart}
                        bassStart={bassStart}
                        percussionStart={percussionStart}
                        bottomY={bottomY}
                        isTrebleVisible={isTrebleVisible}
                        isBassVisible={isBassVisible}
                        isPercussionVisible={isPercussionVisible}
                        numRepeats={numRepeats}
                        isPlaying={isPlaying}
                        numMeasures={numMeasures}
                        debugMode={debugMode}
                        showSettings={showSettings}
                        measureLengthSlots={measureLengthSlots}
                        onMeasureNumberClick={onMeasureNumberClick}
                        anacrusisMeasureIndex={anacrusisMeasureIndex}
                      />
                    </g>

                    {/* Chord labels */}
                    <g
                      data-wipe-role="old"
                      data-pagination-old=""
                      className={
                        // Mirror the melody-notes-group: in pagination mode the rAF crossfade owns
                        // opacity (rAF writes style.opacity directly). The CSS class restores the
                        // resting opacity (1 when chords visible, 0 when hidden) once the rAF clears
                        // inline opacity at transition end. Without data-pagination-old, the chord
                        // labels stayed at React-set opacity:1 during the crossfade — melody notes
                        // would fade out but chord letters stayed hard-visible.
                        animationMode === 'pagination' && !showSettings
                          ? (actualChords ? 'pagination-old-visible' : 'pagination-old-hidden')
                          : 'chord-labels-group'
                      }
                      style={{
                        filter: showSettings ? 'blur(6px)' : 'none',
                        opacity: showSettings ? 0.6 : (animationMode !== 'pagination' ? 1 : undefined),
                      }}
                    >
                      {actualChords && <ChordLabelsLayer
                        chordProgression={chordProgression}
                        chords={null}
                        processedChords={processedChords}
                        offsets={allOffsets}
                        startX={startX}
                        noteWidth={noteWidth}
                        pixelsPerTick={ppt}
                        displayNumMeasures={displayNumMeasures}
                        measureLengthSlots={measureLengthSlots}
                        trebleStart={trebleStart}
                        startMeasureIndex={startMeasureIndex}
                        chordDisplayMode={chordDisplayMode}
                        noteColoringMode={noteColoringMode}
                        theme={theme}
                        debugMode={debugMode}
                        overrideColor={null}
                        inputTestState={inputTestState}
                      />}
                      {renderDNADebug()}
                    </g>

                    {/* Scroll mode: barline at the block boundary (x=endX in scroll-group coords).
                        New-melody transition (red overlay): double barline 10 units apart.
                        Repeat / stopped: single thin line. */}
                    {animationMode === 'scroll' && nextLayer === 'red' && (
                      <>
                        <path d={`M ${endX - 5} ${trebleStart} V ${bottomY}`} stroke="var(--text-primary)" strokeWidth="0.5" opacity="0.4" />
                        <path d={`M ${endX + 5} ${trebleStart} V ${bottomY}`} stroke="var(--text-primary)" strokeWidth="0.5" opacity="0.4" />
                      </>
                    )}
                    {animationMode === 'scroll' && nextLayer !== 'red' && (
                      <path d={`M ${endX} ${trebleStart} V ${bottomY}`} stroke="var(--text-primary)" strokeWidth="0.5" opacity="0.4" />
                    )}

                    {/* Wipe/pagination mode: yellow = overlay next repeat's notes in the next-round
                        visibility (= current round's opposite). Single overlay slot.
                        Scroll mode: rendered K times side-by-side (left history + right previews)
                        so the visible viewport is always full as the scroll progresses. Scroll
                        renders the CURRENT round's config (all panels share the playing round) and
                        filters offsets to "in current series only" — panels past the series boundary
                        render below via the red/preview path with `previewMelody`. */}
                    {((animationMode !== 'scroll' && showWipePreview === 'yellow') ||
                      (animationMode === 'scroll' && isPlaying)) && (() => {
                      // Round config:
                      //   wipe/pagination yellow = OPPOSITE round (this overlay previews the next repeat).
                      //   scroll = PER-PANEL round (Han 2026-05-28). Each panel represents a
                      //     specific rep — its visibility must match THAT rep's round. The
                      //     master round is the one that's currently PLAYING; for any other
                      //     panel offset i, the round alternates per rep relative to master.
                      //     See per-panel calculation in the offsets.map below.
                      const roundKey = animationMode === 'scroll'
                        ? (isOddRound ? 'oddRounds' : 'evenRounds')
                        : (isOddRound ? 'evenRounds' : 'oddRounds');
                      const defaultCfg = playbackConfig?.[roundKey] ?? {};
                      // In debug mode: tint yellow so the overlay is visually distinct.
                      // In normal mode: render with default note colors (null = no tint).
                      const YCOL = debugMode ? 'var(--accent-yellow)' : null;

                      // Inner content shared across all overlay panels (chord labels + 3 staves + barlines).
                      // panelCfg is the playbackConfig.{odd,even}Rounds object for THIS panel.
                      // MelodyNotesLayer is React.memo'd, so rendering it K times with identical props
                      // results in K-1 cache hits (only one fresh paint per round).
                      const renderContent = (panelCfg) => {
                        const nextNotesVisible = !!panelCfg.notes;
                        const nextTreble = panelCfg.trebleEye !== false;
                        const nextBass = panelCfg.bassEye !== false;
                        const nextPerc = panelCfg.percussionEye === true;
                        const nextMetro = panelCfg.percussionEye === 'metronome';
                        const nextChords = panelCfg.chordsEye !== false;
                        return (<>
                          {/* Leading barline at the panel's startX so each scroll-mode
                              visual block is delimited (Han 2026-05-28). The end barline
                              at endX is drawn outside renderContent at world coords for
                              the main/preview boundary only; right-side overlay panels
                              would otherwise look like one continuous run with no
                              block delimiter. Suppressed for wipe/pagination since the
                              transition already replaces the whole staff in place. */}
                          {animationMode === 'scroll' && (
                            <path d={`M ${startX} ${trebleStart} V ${bottomY}`} stroke="var(--text-primary)" strokeWidth="0.5" opacity="0.4" />
                          )}
                          {/* Chord labels above treble staff — shown if next round has chords visible */}
                          {nextChords && chordProgression && processedChords?.length > 0 &&
                            <ChordLabelsLayer
                              chordProgression={chordProgression}
                              chords={null}
                              processedChords={processedChords}
                              offsets={allOffsets}
                              startX={startX}
                              noteWidth={noteWidth}
                              pixelsPerTick={ppt}
                              displayNumMeasures={displayNumMeasures}
                              measureLengthSlots={measureLengthSlots}
                              trebleStart={trebleStart}
                              startMeasureIndex={startMeasureIndex}
                              chordDisplayMode={chordDisplayMode}
                              noteColoringMode={noteColoringMode}
                              theme={theme}
                              debugMode={debugMode}
                              overrideColor={YCOL}
                              inputTestState={null}
                            />}
                          <g style={{ transform: `translateY(${trebleStart}px)` }}>
                            {isTrebleVisible && nextTreble && nextNotesVisible && adjustedTrebleMelody &&
                              <MelodyNotesLayer
                                melody={adjustedTrebleMelody}
                                numAccidentals={numAccidentals}
                                startX={startX}
                                noteWidth={noteWidth}
                                allOffsets={allOffsets}
                                staff="treble"
                                staffYStart={0}
                                noteGroupSize={noteGroupSize}
                                measureLengthSlots={measureLengthSlots}
                                timeSignature={timeSignature}
                                clef={clefTreble}
                                noteColoringMode={noteColoringMode}
                                tonic={tonic}
                                scaleNotes={scaleNotes}
                                processedChords={processedChords}
                                theme={theme}
                                inputTestState={null}
                                previewMode={YCOL}
                                pixelsPerTick={ppt}
                                startMeasureIndex={startMeasureIndex}
                                transpositionSemitones={trebleTransSemitones}
                              />}
                            {isTrebleVisible && (!nextTreble || !nextNotesVisible) &&
                              renderRepeatSymbols(allOffsets, noteWidth, ppt, [30], YCOL)}
                          </g>
                          <g style={{ transform: `translateY(${bassStart}px)` }}>
                            {isBassVisible && nextBass && nextNotesVisible && adjustedBassMelody &&
                              <MelodyNotesLayer
                                melody={adjustedBassMelody}
                                numAccidentals={numAccidentals}
                                startX={startX}
                                noteWidth={noteWidth}
                                allOffsets={allOffsets}
                                staff="bass"
                                staffYStart={0}
                                noteGroupSize={noteGroupSize}
                                measureLengthSlots={measureLengthSlots}
                                timeSignature={timeSignature}
                                clef={clefBass}
                                noteColoringMode={noteColoringMode}
                                tonic={tonic}
                                scaleNotes={scaleNotes}
                                processedChords={processedChords}
                                theme={theme}
                                inputTestState={null}
                                previewMode={YCOL}
                                pixelsPerTick={ppt}
                                startMeasureIndex={startMeasureIndex}
                                transpositionSemitones={bassTransSemitones}
                              />}
                            {isBassVisible && (!nextBass || !nextNotesVisible) &&
                              renderRepeatSymbols(allOffsets, noteWidth, ppt, [30], YCOL)}
                          </g>
                          <g style={{ transform: `translateY(${percussionStart}px)` }}>
                            {isPercussionVisible && nextPerc && nextNotesVisible && adjustedPercussionMelody &&
                              <MelodyNotesLayer
                                melody={adjustedPercussionMelody}
                                numAccidentals={numAccidentals}
                                startX={startX}
                                noteWidth={noteWidth}
                                allOffsets={allOffsets}
                                staff="percussion"
                                staffYStart={0}
                                noteGroupSize={noteGroupSize}
                                measureLengthSlots={measureLengthSlots}
                                timeSignature={timeSignature}
                                clef={null}
                                noteColoringMode={noteColoringMode}
                                tonic={tonic}
                                scaleNotes={EMPTY_SCALE_NOTES}
                                processedChords={processedChords}
                                theme={theme}
                                inputTestState={null}
                                previewMode={YCOL}
                                pixelsPerTick={ppt}
                                startMeasureIndex={startMeasureIndex}
                                transpositionSemitones={0}
                                debugMode={debugMode}
                                interactive={true}
                                courtesyAccidentals={courtesyAccidentals}
                                percussionVoiceSplit={percussionVoiceSplit}
                              />}
                            {isPercussionVisible && nextMetro && adjustedMetronomeMelody &&
                              <MelodyNotesLayer
                                melody={adjustedMetronomeMelody}
                                numAccidentals={numAccidentals}
                                startX={startX}
                                noteWidth={noteWidth}
                                allOffsets={allOffsets}
                                staff="percussion"
                                staffYStart={0}
                                noteGroupSize={noteGroupSize}
                                measureLengthSlots={measureLengthSlots}
                                timeSignature={timeSignature}
                                clef={null}
                                noteColoringMode={noteColoringMode}
                                tonic={tonic}
                                scaleNotes={EMPTY_SCALE_NOTES}
                                processedChords={processedChords}
                                theme={theme}
                                inputTestState={null}
                                previewMode={YCOL}
                                pixelsPerTick={ppt}
                                startMeasureIndex={startMeasureIndex}
                                transpositionSemitones={0}
                                debugMode={false}
                                interactive={false}
                                courtesyAccidentals={courtesyAccidentals}
                                percussionVoiceSplit={false}
                              />}
                            {isPercussionVisible && (!nextPerc && !nextMetro) &&
                              renderRepeatSymbols(allOffsets, noteWidth, ppt, [30], YCOL)}
                          </g>
                          {/* Barlines for the incoming content — wipe-reveals alongside notes.
                              Show the NEXT iteration's measure numbers (startMeasureIndex + displayNumMeasures)
                              so the numbers visually animate during the wipe instead of jumping at the end. */}
                          <g style={{ opacity: showSettings ? 0.6 : 1 }}>
                            <BarlinesLayer
                              mode="regular"
                              offsets={allOffsets}
                              noteWidth={noteWidth}
                              pixelsPerTick={ppt}
                              startX={startX}
                              startIdx={startMeasureIndex + displayNumMeasures}
                              blockMeasureStart={blockMeasureStart}
                              blockPlayStart={blockPlayStart}
                              partialTop={partialTop}
                              partialMeasureStart={partialMeasureStart}
                              measureBottom={measureBottom}
                              measureYPositions={measureYPositions}
                              trebleStart={trebleStart}
                              bassStart={bassStart}
                              percussionStart={percussionStart}
                              bottomY={bottomY}
                              isTrebleVisible={isTrebleVisible}
                              isBassVisible={isBassVisible}
                              isPercussionVisible={isPercussionVisible}
                              numRepeats={numRepeats}
                              isPlaying={isPlaying}
                              numMeasures={numMeasures}
                              debugMode={debugMode}
                              showSettings={showSettings}
                              measureLengthSlots={measureLengthSlots}
                              onMeasureNumberClick={onMeasureNumberClick}
                              anacrusisMeasureIndex={anacrusisMeasureIndex}
                            />
                          </g>
                      </>);
                      };

                      // Non-scroll modes (wipe / pagination): single overlay at no translate offset.
                      if (animationMode !== 'scroll') {
                        return (
                          <g
                            data-wipe-role="new"
                            data-pagination-new=""
                            className={
                              animationMode === 'wipe' ? 'wipe-new-hidden'
                            : animationMode === 'pagination' ? 'pagination-new-hidden'
                            : undefined
                            }
                            style={{
                              filter: showSettings ? 'blur(1.5px)' : 'none',
                              pointerEvents: 'none',
                            }}
                          >
                            {renderContent(defaultCfg)}
                          </g>
                        );
                      }

                      // Scroll mode: yellow (current-series) panels at offsets [-K_left..K_right]
                      // EXCLUDING positions past the series boundary. Those next-series panels
                      // are rendered by the red/PreviewOverlay path below (gated on previewMelody).
                      //
                      // itersRemaining = how many MORE reps of the same melody after the current
                      // iter (= K_remaining iter offsets that still belong to the current series).
                      //   numRepeats = -1 (infinite repeat mode) → no series boundary → all yellow.
                      //   numRepeats = 1 (typical, repsPerMelody=1)  → itersRemaining = 0 → panel +1 onwards is next series.
                      //   numRepeats = 3, iterInCurrentSeries=0      → itersRemaining = 2 → panels +1, +2 yellow; +3 red.
                      //
                      // Left history panels (i < 0) are always yellow (= current melody copy). This
                      // is an approximation: the very first iters of a new series briefly show new
                      // melody as history, which is technically wrong, but tracking previous-series
                      // melody just for left-history would balloon scope. Accepted limitation.
                      const mw = displayNumMeasures * measureWidth;
                      const K_left = Math.max(1, Math.ceil(0.25 * effectiveVisibleMeasures / displayNumMeasures));
                      const K_right = Math.max(1, Math.ceil(0.75 * effectiveVisibleMeasures / displayNumMeasures));
                      const itersRemaining = numRepeats === -1
                        ? Number.POSITIVE_INFINITY
                        : Math.max(0, (numRepeats ?? 1) - iterInCurrentSeries - 1);
                      const offsets = [];
                      for (let i = -K_left; i <= K_right; i++) {
                        if (i === 0) continue; // main is rendered above
                        if (i > 0 && i > itersRemaining) continue; // beyond series boundary → red path
                        offsets.push(i);
                      }
                      return offsets.map(i => {
                        // Per-panel round (Han 2026-05-28, refined): the panel at offset i
                        // represents the rep at (iterInCurrentSeries + i). Within a series,
                        // round alternates per rep (iteration % 2). Master `isOddRound` is
                        // (iter % 2 === 0). For HISTORY panels (i < 0, especially early in
                        // a new series where iter+i can be NEGATIVE), the panel represents
                        // a rep in the PREVIOUS series; iteration resets to 0 at series-flip
                        // so we wrap modulo numRepeats. For ODD numRepeats this matters —
                        // without the wraparound the history panel's round disagreed with
                        // the just-played rep, producing a visible "flip" right after the
                        // series boundary. For infinite repeat (numRepeats=-1) no wrap.
                        const globalRep = iterInCurrentSeries + i;
                        const localRep = (numRepeats > 0)
                          ? (((globalRep % numRepeats) + numRepeats) % numRepeats)
                          : globalRep;
                        const panelOddRound = (((localRep % 2) + 2) % 2) === 0;
                        const panelRoundKey = panelOddRound ? 'oddRounds' : 'evenRounds';
                        const panelCfg = playbackConfig?.[panelRoundKey] ?? {};
                        return (
                        <g
                          key={`scroll-yellow-${i}`}
                          data-wipe-role={i === 1 ? "new" : undefined}
                          data-pagination-new={i === 1 ? "" : undefined}
                          transform={`translate(${i * mw}, 0)`}
                          style={{
                            // Scroll-mode yellow panels render at full opacity (Han
                            // 2026-05-28). Previously dimmed to 0.55 to distinguish
                            // "overlay" from main; Han finds the dim distracting since
                            // these panels show real upcoming/just-played content.
                            opacity: 1,
                            filter: showSettings ? 'blur(1.5px)' : 'none',
                            pointerEvents: 'none',
                          }}
                        >
                          {renderContent(panelCfg)}
                        </g>
                        );
                      });
                    })()}
                    {/* Red/crossfade overlay (NEW melody preview).
                        - wipe/pagination: gated on showWipePreview; one overlay at translate(melodyWidth).
                        - scroll: gated on previewMelody being set; K right-side panels at offsets
                          (itersRemaining+1)..K_right, each showing the pregen new-melody. */}
                    {((animationMode !== 'scroll' && (showWipePreview === 'red' || showWipePreview === 'crossfade')) ||
                      (animationMode === 'scroll' && isPlaying && previewMelody)) && (() => {
                      const mw = displayNumMeasures * measureWidth;
                      // Common props for every rendered PreviewOverlay instance.
                      const commonProps = {
                        previewMelody, previewLayout, playbackConfig, isOddRound, animationMode,
                        startX, endX, trebleStart, bassStart, percussionStart, bottomY,
                        measureBottom, measureYPositions, partialTop, partialMeasureStart,
                        noteGroupSize, measureLengthSlots, displayNumMeasures,
                        melodyWidth: mw,
                        numAccidentals, pixelsPerTick: ppt, chordProgression, processedChords,
                        timeSignature, tonic, scaleNotes, clefTreble, clefBass,
                        trebleTransSemitones, bassTransSemitones,
                        isTrebleVisible, isBassVisible, isPercussionVisible,
                        chordDisplayMode, noteColoringMode, theme, showSettings, debugMode,
                        blockMeasureStart, blockPlayStart, numRepeats, numMeasures, isPlaying,
                        startMeasureIndex, onMeasureNumberClick, courtesyAccidentals,
                        percussionVoiceSplit, emptyScaleNotes: EMPTY_SCALE_NOTES,
                      };
                      if (animationMode !== 'scroll') {
                        return <PreviewOverlay {...commonProps} />;
                      }
                      // Scroll: render K_left history + K_right right-side preview copies.
                      // K=0 (the main panel) is the existing melody — not rendered here.
                      // Scroll: render red panels ONLY for positions past the series boundary
                      // (= panels representing iters in the next series). Yellow renderer above
                      // covers the current-series positions; together the two tile the viewport.
                      const K_right = Math.max(1, Math.ceil(0.75 * effectiveVisibleMeasures / displayNumMeasures));
                      const itersRemaining = numRepeats === -1
                        ? Number.POSITIVE_INFINITY
                        : Math.max(0, (numRepeats ?? 1) - iterInCurrentSeries - 1);
                      const offsets = [];
                      for (let i = Math.max(1, itersRemaining + 1); i <= K_right; i++) {
                        offsets.push(i);
                      }
                      // Per-panel round (Han 2026-05-28, refined): red panel at offset i
                      // represents next-series rep (i - itersRemaining - 1). At every
                      // series-flip the applyResult sets isOddRound=true, so next-series
                      // rep 0 is always 'oddRounds'. Round alternates per rep. For
                      // K_right > itersRemaining + numRepeats the panel would represent
                      // a rep in the series AFTER next — wrap modulo numRepeats to be
                      // consistent with the yellow-panel wraparound semantics.
                      return offsets.map(i => {
                        const nextSeriesRep = i - (Number.isFinite(itersRemaining) ? itersRemaining : 0) - 1;
                        const localRep = (numRepeats > 0)
                          ? (((nextSeriesRep % numRepeats) + numRepeats) % numRepeats)
                          : nextSeriesRep;
                        const panelOddRound = (((localRep % 2) + 2) % 2) === 0;
                        const panelRoundKey = panelOddRound ? 'oddRounds' : 'evenRounds';
                        return (
                          <PreviewOverlay
                            key={`scroll-red-${i}`}
                            {...commonProps}
                            panelOffset={i * mw}
                            roundKeyOverride={panelRoundKey}
                          />
                        );
                      });
                    })()}
                  </g>
                  </g>{/* end scroll-content-clip wrapper */}

                  {/* Scroll mode playhead REMOVED (Han 2026-05-28). The fixed yellow line
                      at 25% was visually inexact (didn't align cleanly with the active note
                      head) and felt redundant — the active-note highlight already shows where
                      playback is. The 25% position is still the conceptual playhead anchor
                      for the scroll formula; only the visual marker is gone. */}

                  {/* Scroll mode right fade overlay: covers melodies AND staff lines near endX.
                      Placed here (inside layer-a, after staff-groups) so it paints on top of both.
                      Width=15 covers endX-10 → endX+5, stopping at systemEndX so num-repeats stays visible. */}
                  {animationMode === 'scroll' && isPlaying && (
                    <rect
                      x={endX - 10}
                      y={-80}
                      width={15}
                      height={bottomY + 160}
                      fill="url(#scroll-right-fade)"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* Thick repeat barlines — hidden in scroll+playing (no start/end repeat signs in scroll mode).
                      In rangeEditMode we force numRepeats=1 so this layer draws nothing (no repeat signs). */}
                  {!(animationMode === 'scroll' && isPlaying) && (
                    <BarlinesLayer
                      mode="repeat"
                      offsets={allOffsets}
                      noteWidth={noteWidth}
                      pixelsPerTick={ppt}
                      startX={startX}
                      startIdx={startMeasureIndex}
                      blockMeasureStart={blockMeasureStart}
                      blockPlayStart={blockPlayStart}
                      partialTop={partialTop}
                      partialMeasureStart={partialMeasureStart}
                      measureBottom={measureBottom}
                      measureYPositions={measureYPositions}
                      trebleStart={trebleStart}
                      bassStart={bassStart}
                      percussionStart={percussionStart}
                      bottomY={bottomY}
                      isTrebleVisible={isTrebleVisible}
                      isBassVisible={isBassVisible}
                      isPercussionVisible={isPercussionVisible}
                      numRepeats={rangeEditMode ? 1 : numRepeats}
                      isPlaying={isPlaying}
                      numMeasures={numMeasures}
                      debugMode={debugMode}
                      showSettings={showSettings}
                      measureLengthSlots={measureLengthSlots}
                      onMeasureNumberClick={onMeasureNumberClick}
                      anacrusisMeasureIndex={anacrusisMeasureIndex}
                    />
                  )}

                  {/* Range-edit: the usual mode="regular" barlines live inside the
                      hidden notes-transition group, so render a dedicated visible copy
                      here with numRepeats=1 → plain barlines ending in a normal vertical
                      barline, no repeats (Han 2026-05-30). */}
                  {/* Range-edit: no intermediate barlines (ignore measure count);
                      just a single normal vertical end barline closing the staff
                      (Han 2026-05-30). */}
                  {rangeEditMode && (
                    <path
                      d={`M ${endX} ${trebleStart} V ${bottomY}`}
                      stroke="var(--text-primary)"
                      strokeWidth="1"
                    />
                  )}

                  {/* Settings overlay — rendered LAST so it sits above blurred content */}
                  {showSettings && (
                    <SettingsOverlay
                      startX={startX}
                      endX={endX}
                      systemEndX={systemEndX}
                      trebleStart={trebleStart}
                      bassStart={bassStart}
                      percussionStart={percussionStart}
                      isTrebleVisible={isTrebleVisible}
                      isBassVisible={isBassVisible}
                      isPercussionVisible={isPercussionVisible}
                      playbackConfig={playbackConfig}
                      setPlaybackConfig={setPlaybackConfig}
                      toggleRoundSetting={toggleRoundSetting}
                      setActiveVolumePicker={setActiveVolumePicker}
                      setActiveNumberPicker={setActiveNumberPicker}
                      numMeasures={numMeasures}
                      setNumMeasures={onNumMeasuresChange}
                      chordDisplayMode={chordDisplayMode}
                      showNoteHighlight={showNoteHighlight}
                      setShowNoteHighlight={setShowNoteHighlight}
                      animationMode={animationMode}
                        noteColoringMode={noteColoringMode}
                      setNoteColoringMode={setNoteColoringMode}
                      inputTestSubMode={inputTestSubMode}
                      setInputTestSubMode={setInputTestSubMode}
                      isFullscreen={isFullscreen}
                      toggleFullscreen={toggleFullscreen}
                      headerPlayMode={headerPlayMode}
                      setHeaderPlayMode={setHeaderPlayMode}
                      handleToggleInputTest={handleToggleInputTest}
                      handlePlayMelody={handlePlayMelody}
                      handlePlayContinuously={handlePlayContinuously}
                      chordProgression={chordProgression}
                      processedChords={processedChords}
                      onSettingsInteraction={onSettingsInteraction}
                    />
                  )}

                  {/* Range overlay — in-SVG selectable note rows (Phase 2: static). */}
                  {rangeEditMode && (
                    <RangeStaffOverlay
                      startX={startX}
                      endX={endX}
                      trebleStart={trebleStart}
                      bassStart={bassStart}
                      percussionStart={percussionStart}
                      isTrebleVisible={isTrebleVisible}
                      isBassVisible={isBassVisible}
                      isPercussionVisible={isPercussionVisible}
                      clefTreble={clefTreble}
                      clefBass={clefBass}
                      trebleRange={trebleSettings?.range}
                      bassRange={bassSettings?.range}
                      enabledPads={percussionSettings?.enabledPads}
                      onSetMelodicBoundary={setMelodicBoundary}
                      onApplyMelodicPreset={applyMelodicPreset}
                      onTogglePad={togglePad}
                      onApplyPercussionPreset={applyPercussionPreset}
                      timeSignature={timeSignature}
                      theme={theme}
                    />
                  )}
                </>
            </g>
          </g>
        </svg>
      </div>

      {/* ── VOLUME PICKER OVERLAY ── */}
      {activeVolumePicker && (
        <GenericTypeSelector
          options={VOL_STEPS.map(v => ({
            value: v.value,
            label: <span style={{ fontFamily: 'serif', fontWeight: 'bold' }}>{v.label}</span>,
            icon: <span style={{ fontFamily: 'Maestro', fontSize: '24px' }}>{v.glyph}</span>
          }))}
          selectedValue={playbackConfig?.[activeVolumePicker.round]?.[activeVolumePicker.instrumentKey]}
          onSelect={(newVol) => {
            if (setPlaybackConfig) {
              setPlaybackConfig(prev => ({
                ...prev,
                [activeVolumePicker.round]: {
                  ...(prev[activeVolumePicker.round] || {}),
                  [activeVolumePicker.instrumentKey]: newVol
                }
              }));
            }
            setActiveVolumePicker(null);
          }}
          onClose={() => setActiveVolumePicker(null)}
          title={`Set volume`}
        />
      )}

      {/* ── NUMBER PICKER OVERLAY ── */}
      {activeNumberPicker && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onMouseDown={() => setActiveNumberPicker(null)}
        >
          <form
            style={{ backgroundColor: '#222', padding: '24px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '180px', alignItems: 'center' }}
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const val = parseInt(e.target.elements.numInput.value, 10);
              if (!isNaN(val) && val >= 1 && val <= 16) {
                if (activeNumberPicker === 'measures') { onNumMeasuresChange(val); resetNumericTimer(); }
                if (activeNumberPicker === 'repeats') { onNumRepeatsChange(val); resetRepeatsTimer(); }
                setActiveNumberPicker(null);
              }
            }}
          >
            <div style={{ color: 'white', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '1px' }}>
              {activeNumberPicker === 'measures' ? 'Measures' : 'Repeats'}
            </div>
            <input
              name="numInput"
              type="number"
              min="1"
              max="16"
              defaultValue={activeNumberPicker === 'measures'
                ? Math.max(1, Math.min(16, numMeasures ?? 2))
                : Math.max(1, Math.min(16, numRepeats === -1 ? 16 : (numRepeats ?? 4)))}
              autoFocus
              style={{ width: '80px', fontSize: '28px', textAlign: 'center', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '6px', padding: '6px' }}
            />
            <button
              type="submit"
              style={{ width: '100%', padding: '8px', backgroundColor: 'var(--accent-yellow)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              OK
            </button>
          </form>
        </div>
      )}
    </div >
  );
};

// React.memo skips re-renders when all props are referentially equal. The
// upstream callers (App.jsx, TabView.jsx) pass either memoised objects
// (sheetMusicCommonProps via useMemo) or primitives, so re-renders triggered
// by unrelated App state churn (header buttons, tab switches, scale wheel,
// etc.) bypass SheetMusic entirely.
//
// SheetMusic still re-renders when its OWN consumed contexts change
// (MelodyContext, PlaybackStateContext, DisplaySettings, etc.) because
// React's context propagation goes through every consumer regardless of
// React.memo. The earlier useMemo round on context values keeps THOSE
// re-renders to only what actually changed.
export default React.memo(SheetMusic);
