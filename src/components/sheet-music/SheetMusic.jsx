// /components/sheet-music/SheetMusic.jsx

import React, { useRef, useState } from 'react';
import useSheetMusicHighlight from '../../hooks/useSheetMusicHighlight';
import useSheetMusicTransitions from '../../hooks/useSheetMusicTransitions';
import RandomizeIcon from '../common/RandomizeIcon';
import { processMelodyAndCalculateSlots } from './processMelodyAndCalculateSlots';
import { processMelodyAndCalculateFlags } from './processMelodyAndCalculateFlags';
import SettingsOverlay, { VOL_STEPS } from './SettingsOverlay';
import GenericTypeSelector from '../common/GenericTypeSelector';
import SvgSetter from './SvgSetter';

import { renderMelodyNotes } from './renderMelodyNotes';
import { renderAccidentals } from './renderAccidentals';
import { calculateAllOffsets } from './calculateAllOffsets';
import { generateAccidentalMap } from './generateAccidentalMap';
import { getChordsWithSlashes } from '../../theory/chordLabelHandler';
import { getNoteSemitone, getKodalySolfege } from '../../theory/noteUtils';
import { getNoteIndex } from '../../theory/musicUtils';
import { getRelativeNoteName } from '../../theory/convertToDisplayNotes';
import { isCompoundMeter, getEffectiveBeatDuration, getTakadimiSyllable, isRest } from '../../theory/rhythmicSolfege';

import { getTempoTerm, tempoTerms } from '../../utils/tempo';
import { TICKS_PER_WHOLE } from '../../constants/timing.js';
import { PRESET_RANGES as CLEF_RANGE_PRESET_RANGES } from '../../constants/ranges';
import { TRANSPOSING_INSTRUMENTS, getTranspositionSemitones, getTranspositionDisplay } from '../../constants/transposingInstruments';
import { sliceMelodyByMeasure, sliceChordsForMeasure, sliceToMelodyLike, sliceMelodyByRange, sliceChordsByRange } from '../../utils/melodySlice';
import { calculateMusicalBlocks } from '../../utils/pagination';
import useLongPressTimer from '../../hooks/useLongPressTimer';
import { usePlaybackConfig } from '../../contexts/PlaybackConfigContext';
import { useInstrumentSettings } from '../../contexts/InstrumentSettingsContext';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { useMelodies } from '../../contexts/MelodyContext';
import { usePlaybackState } from '../../contexts/PlaybackStateContext';
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
  numRepeats,
  onNumRepeatsChange,
  numAccidentals,
  screenWidth,
  onRandomizeMeasure,
  showChords,
  showSettings,
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
}) => {
  // ── Context-provided values (formerly props) ──────────────────────────────
  const { treble: trebleMelody, bass: bassMelody, percussion: percussionMelody,
          metronome: metronomeMelody, chordProgression } = useMelodies();
  const { isPlaying, isOddRound, nextLayer = null, previewMelody = null,
          inputTestState, inputTestSubMode, setInputTestSubMode } = usePlaybackState();
  const { wipeTransitionRef, scrollTransitionRef, pendingScrollTransitionRef, paginationFadeRef,
          clearHighlightStateRef, showNoteHighlightRef, setCurrentMeasureIndex,
          sequencerRef, context } = useAnimationRefs();
  const { playbackConfig, setPlaybackConfig, toggleRoundSetting } = usePlaybackConfig();
  const { trebleSettings, setTrebleSettings, bassSettings, setBassSettings,
    percussionSettings, setPercussionSettings, chordSettings, setChordSettings } = useInstrumentSettings();
  const { noteColoringMode, setNoteColoringMode, debugMode, lyricsMode,
    chordDisplayMode, setChordDisplayMode, showNoteHighlight, setShowNoteHighlight,
    animationMode } = useDisplaySettings();
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
    pendingScrollTransitionRef,
    paginationFadeRef,
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
  const noteGroupSize = measureLengthSlots % 18 === 0 ? 18 : 12;

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
  const isTrebleVisible = showSettings ||
    (playbackConfig?.oddRounds?.trebleEye !== false || playbackConfig?.evenRounds?.trebleEye !== false);
  const isBassVisible = showSettings ||
    (playbackConfig?.oddRounds?.bassEye !== false || playbackConfig?.evenRounds?.bassEye !== false);
  const isPercussionVisible = showSettings ||
    (playbackConfig?.oddRounds?.percussionEye === true || playbackConfig?.evenRounds?.percussionEye === true ||
      playbackConfig?.oddRounds?.percussionEye === 'metronome' || playbackConfig?.evenRounds?.percussionEye === 'metronome');

  const numVisibleStaves = (isTrebleVisible ? 1 : 0) + (isBassVisible ? 1 : 0) + (isPercussionVisible ? 1 : 0);
  const numGaps = Math.max(1, numVisibleStaves - 1);

  const staffHeight = 40;
  const trebleStart = 100;
  const LYRICS_GAP = 45; // extra vertical space for melodic lyrics row below treble staff
  const melodicLyricsActive = (lyricsMode === 'doremi-rel' || lyricsMode === 'doremi-abs' || lyricsMode === 'kodaly') && isTrebleVisible;
  const rhythmicLyricsActive = lyricsMode === 'takadimi' && isPercussionVisible;
  // Keep lyricsActive for any backward-compat references
  const lyricsActive = melodicLyricsActive || rhythmicLyricsActive;
  const baseStaffGap = containerHeight >= 400
    ? baseGap
    : Math.max(minGap, (containerHeight - 110 - 131) / numGaps);
  const staffGap = melodicLyricsActive ? baseStaffGap + LYRICS_GAP : baseStaffGap;

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

  const calculateOptimalClef = (activeClef, melodyNotes, staff = 'treble') => {
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

    // Ranges per user requirement (INTERNAL MIDI: C4 = 48)
    const RANGES = staff === 'bass' ? {
      base: [24, 52],   // C2-E4
      '8vb': [9, 28],   // A0-E2 (Extended down to A0=9)
      '15vb': [0, 0],   // DISABLED
      '8va': [48, 64],  // C4-E5
      '15va': [60, 96]  // C5-C8 (Extended up to C8=96)
    } : {
      base: [45, 72],   // A3-C6
      '8vb': [33, 48],  // A2-C4
      '15vb': [21, 36], // A1-C3
      '8va': [69, 84],  // A5-C7
      '15va': [81, 96]  // A6-C8
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

  const scaleNotes = trebleSettings?.scaleNotes || [];

  const clefTreble = calculateOptimalClef(trebleActiveClef, trebleMelody?.notes, 'treble');
  const clefBass = calculateOptimalClef(bassActiveClef, bassMelody?.notes, 'bass');

  // Display-only transposition: how many semitones to shift written notes up/down.
  // Audio always plays concert pitch; only the sheet music notation changes.
  const trebleTransSemitones = getTranspositionSemitones(trebleSettings?.transpositionKey);
  const bassTransSemitones   = getTranspositionSemitones(bassSettings?.transpositionKey);

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

  // Per-staff accidental-click handlers. Only created when the consumer provides the callback.
  const trebleAccidentalClick = onNoteEnharmonicToggle
    ? (relOffset) => onNoteEnharmonicToggle('treble', relOffset + paginationOffset)
    : null;
  const bassAccidentalClick = onNoteEnharmonicToggle
    ? (relOffset) => onNoteEnharmonicToggle('bass', relOffset + paginationOffset)
    : null;

  const currentTreble = sliceMelodyForPagination(trebleMelody);
  const currentBass = sliceMelodyForPagination(bassMelody);
  const currentPercussion = sliceMelodyForPagination(percussionMelody);
  const currentMetronome = sliceMelodyForPagination(metronomeMelody);
  const currentChordProgression = chordProgression; // ChordProgression is not a Melody — no slicing

  const adjustedTrebleMelody = processMelodyAndCalculateSlots(
    currentTreble,
    timeSignature,
    noteGroupSize,
    displayNumMeasures * measureLengthSlots, // use block duration
    partialMeasureStart,
    partialTop
  );

  const trebleMelodyFlags = processMelodyAndCalculateFlags(
    adjustedTrebleMelody,
    timeSignature,
    noteGroupSize
  );

  const adjustedBassMelody = processMelodyAndCalculateSlots(
    currentBass,
    timeSignature,
    noteGroupSize,
    displayNumMeasures * measureLengthSlots,
    partialMeasureStart,
    partialTop
  );

  const adjustedPercussionMelody = processMelodyAndCalculateSlots(
    currentPercussion,
    timeSignature,
    noteGroupSize,
    displayNumMeasures * measureLengthSlots,
    partialMeasureStart,
    partialTop
  );

  const adjustedMetronomeMelody = currentMetronome
    ? processMelodyAndCalculateSlots(currentMetronome, timeSignature, noteGroupSize, displayNumMeasures * measureLengthSlots, partialMeasureStart, partialTop)
    : null;

  // For rendering, expand chords to match the active melody's measure span so chord labels
  // don't appear/disappear when numMeasures is changed while a different-length melody is shown.
  // processedChordsRaw is also used by the block-layout effect below; calculateAllOffsets
  // always pads to numMeasures measures independently, so using displayNumMeasures here is safe.
  const processedChordsRaw = getChordsWithSlashes(chordProgression, displayNumMeasures, timeSignature);
  const processedChords = (animationMode === 'pagination' && musicalBlocks)
    ? sliceChordsByRange(processedChordsRaw, localMeasureStart, displayNumMeasures, measureLengthSlots)
    : processedChordsRaw;

  const trebleAccidentals = generateAccidentalMap(adjustedTrebleMelody.notes, numAccidentals);
  const bassAccidentals = generateAccidentalMap(adjustedBassMelody.notes, numAccidentals);

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
  const allOffsets = calculateAllOffsets(
    timeSignature,
    noteGroupSize,
    numRepeats,
    displayNumMeasures,
    partialMeasureStart,
    (notesVisible && adjustedTrebleMelody) ? melodyToTaggedOffsets(adjustedTrebleMelody, trebleAccidentals) : [],
    (notesVisible && adjustedBassMelody) ? melodyToTaggedOffsets(adjustedBassMelody, bassAccidentals) : [],
    (notesVisible && adjustedPercussionMelody) ? adjustedPercussionMelody.offsets : [],
    adjustedMetronomeMelody ? adjustedMetronomeMelody.offsets : [],
    processedChords.map(c => c.absoluteOffset),
  );

  const noteWidth = (allOffsets.length > 2 ? (endX - startX) / (allOffsets.length - 2) : 0);

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
    };
  }, [measureWidth, measurePpt, effectiveVisibleMeasures, layoutRef, startX, trebleStart, bottomY, measureLengthSlots, endX, startMeasureIndex]);

  // Shared measure-line iteration — called twice to separate fadeable from non-fadeable elements.
  // mode='regular'  → thin inner barlines + adaptive-TS labels (go into the masked group)
  // mode='repeat'   → thick start/end repeat barlines with dots (always visible)
  // ppt: when non-null, barlines are placed at startX + barlineCount*measureLengthSlots*ppt
  //      (uniform tick-based spacing); when null, uses elastic slot-index spacing.
  const _iterMeasureLines = (mode, offsets = allOffsets, nw = noteWidth, ppt = null, startIdx = startMeasureIndex) => {
    const getXLocal = (index) => index === 0 ? startX - 35 : startX + (index - 1) * nw;
    const lastIdx = offsets.length - 1;
    let barlineCount = 0;
    return offsets.map((timestamp, index) => {
      // Adaptive time-signature change label: always in the regular (fadeable) group
      // Only render inline if it does not happen exactly at the start of the staff (0)
      if (timestamp === 'ts' && partialTop !== null && partialMeasureStart !== 0) {
        if (mode !== 'regular') return null;
        const x = getXLocal(index);
        return (
          <g key={`ts-${index}`}>
            {measureYPositions.map((yPos, i) => {
              const isTop = i % 2 === 0;
              return (
                <text
                  key={i}
                  x={x}
                  y={yPos + 1}
                  fontSize="36"
                  fill="var(--text-primary)"
                  fontFamily="Maestro"
                  textAnchor="middle"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {isTop ? partialTop : measureBottom}
                </text>
              );
            })}
          </g>
        );
      }

      if (timestamp === 'm') {
        const x = ppt !== null
          ? startX + barlineCount * measureLengthSlots * ppt
          : getXLocal(index);
        const barlineOffset = barlineCount * measureLengthSlots;
        const measureNumForLabel = barlineCount; // 0-indexed series measure that starts after this barline
        barlineCount++;
        const isStart = index === (numRepeats > 1 ? 1 : 0);
        const isEnd = index === lastIdx;

        if (numRepeats > 1) {
          if (isStart) {
            if (mode === 'regular') {
              // Show measure number label above the start barline even when repeats > 1
              const globalIdx = startIdx;
              return (
                <g key={`measure-line-${index}`}
                  onClick={onMeasureNumberClick ? (e) => { e.stopPropagation(); onMeasureNumberClick(globalIdx); } : undefined}
                  style={{ cursor: onMeasureNumberClick ? 'pointer' : 'default' }}
                >
                  <rect x={startX - 10} y={trebleStart - 28} width={28} height={18} fill="transparent" />
                  <text
                    x={startX}
                    y={trebleStart - 14}
                    fontSize="18"
                    fill={showSettings ? 'var(--accent-yellow)' : 'var(--text-primary)'}
                    fontFamily="Maestro"
                    style={{ userSelect: 'none', opacity: showSettings ? 0.8 : 0.3 }}
                  >
                    {startIdx + 1}
                  </text>
                  {debugMode && <rect x={startX - 10} y={trebleStart - 28} width={28} height={18} fill="magenta" fillOpacity={0.3} stroke="magenta" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
                </g>
              );
            }
            if (mode !== 'repeat') return null;
            const startXOffset = x - 15;
            return (
              <g key={`measure-line-${index}`} data-offset={barlineOffset} data-mel="barline">
                <rect x={startXOffset - 2} y={trebleStart} width="3" height={bottomY - trebleStart} fill="var(--text-primary)" />
                <path d={`M ${startXOffset + 4} ${trebleStart} V ${bottomY}`} stroke="var(--text-primary)" strokeWidth="1" />
                {[trebleStart, bassStart, percussionStart].map((start, sIdx) => {
                  const showDots = sIdx === 0 ? isTrebleVisible : (sIdx === 1 ? isBassVisible : isPercussionVisible);
                  if (!showDots) return null;
                  return (
                    <g key={`rep-dot-start-${start}-${sIdx}`}>
                      <text x={startXOffset + 9} y={start + 18.5} fontSize="21" fontFamily="Maestro" fill="var(--text-primary)" textAnchor="middle">k</text>
                      <text x={startXOffset + 9} y={start + 28.5} fontSize="21" fontFamily="Maestro" fill="var(--text-primary)" textAnchor="middle">k</text>
                    </g>
                  );
                })}
              </g>
            );
          }
          if (isEnd) {
            if (mode !== 'repeat') return null;
            return (
              <g key={`measure-line-${index}`} data-offset={barlineOffset} data-mel="barline">
                {[trebleStart, bassStart, percussionStart].map((start, sIdx) => {
                  const showDots = sIdx === 0 ? isTrebleVisible : (sIdx === 1 ? isBassVisible : isPercussionVisible);
                  if (!showDots) return null;
                  return (
                    <g key={`rep-dot-end-${start}-${sIdx}`}>
                      <text x={x - 9} y={start + 18.5} fontSize="21" fontFamily="Maestro" fill="var(--text-primary)" textAnchor="middle">k</text>
                      <text x={x - 9} y={start + 28.5} fontSize="21" fontFamily="Maestro" fill="var(--text-primary)" textAnchor="middle">k</text>
                    </g>
                  );
                })}
                <path d={`M ${x - 4} ${trebleStart} V ${bottomY}`} stroke="var(--text-primary)" strokeWidth="1" />
                <rect x={x + 1} y={trebleStart} width="3" height={bottomY - trebleStart} fill="var(--text-primary)" />
              </g>
            );
          }
        }

        if (mode !== 'regular') return null;

        // For the opening barline (numRepeats <= 1): suppress the barline itself but
        // still render the "1" measure label above startX (the first note position).
        if (isStart && numRepeats <= 1) {
          const globalIdx = startIdx + measureNumForLabel;
          return (
            <g key={`measure-line-${index}`}
              onClick={onMeasureNumberClick ? (e) => { e.stopPropagation(); onMeasureNumberClick(globalIdx); } : undefined}
              style={{ cursor: onMeasureNumberClick ? 'pointer' : 'default' }}
            >
              <rect x={startX - 10} y={trebleStart - 28} width={28} height={18} fill="transparent" />
              <text
                x={startX}
                y={trebleStart - 14}
                fontSize="18"
                fill={showSettings ? 'var(--accent-yellow)' : 'var(--text-primary)'}
                fontFamily="Maestro"
                style={{ userSelect: 'none', opacity: showSettings ? 0.8 : 0.3 }}
              >
                {startIdx + measureNumForLabel + 1}
              </text>
              {debugMode && <rect x={startX - 10} y={trebleStart - 28} width={28} height={18} fill="magenta" fillOpacity={0.3} stroke="magenta" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
            </g>
          );
        }

        return (
          <g key={`measure-line-${index}`}>
            <path
              data-offset={barlineOffset}
              data-mel="barline"
              d={`M ${x} ${trebleStart} V ${bottomY}`}
              stroke="var(--text-primary)"
              strokeWidth=".5"
            />
            {!isEnd && (() => {
              const globalIdx = startIdx + measureNumForLabel;
              return (
                <g
                  onClick={onMeasureNumberClick ? (e) => { e.stopPropagation(); onMeasureNumberClick(globalIdx); } : undefined}
                  style={{ cursor: onMeasureNumberClick ? 'pointer' : 'default' }}
                >
                  <rect x={x - 10} y={trebleStart - 28} width={28} height={18} fill="transparent" />
                  <text
                    x={x}
                    y={trebleStart - 14}
                    fontSize="18"
                    fill={showSettings ? 'var(--accent-yellow)' : 'var(--text-primary)'}
                    fontFamily="Maestro"
                    style={{ userSelect: 'none', opacity: showSettings ? 0.8 : 0.3 }}
                  >
                    {startIdx + measureNumForLabel + 1}
                  </text>
                  {debugMode && <rect x={x - 10} y={trebleStart - 28} width={28} height={18} fill="magenta" fillOpacity={0.3} stroke="magenta" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
                </g>
              );
            })()}
          </g>
        );
      }
      return null;
    });
  };

  // Regular (inner) barlines — included in the mask animation
  const renderRegularBarlines = (offsets = allOffsets, nw = noteWidth, ppt = null, startIdx = startMeasureIndex) => _iterMeasureLines('regular', offsets, nw, ppt, startIdx);
  // Thick repeat barlines — always visible, never masked
  const renderRepeatBarlines = (ppt = null) => _iterMeasureLines('repeat', allOffsets, noteWidth, ppt);

  // State for BPM controls visibility
  const [showBpmControls, setShowBpmControls] = React.useState(false);
  const bpmTimerRef = React.useRef(null);

  // TAP BPM — accumulate up to 4 tap timestamps; use the last 4 intervals to derive BPM.
  // Taps older than 3 s reset the sequence (stale tap).
  const tapTimesRef = React.useRef([]);
  const [tapFlash, setTapFlash] = React.useState(false);
  const tapFlashTimerRef = React.useRef(null);

  const handleTap = () => {
    resetBpmTimer();
    openSettingsIfClosed();
    const now = performance.now();
    const times = tapTimesRef.current;
    // Drop taps older than 3 s
    const fresh = times.filter(t => now - t < 3000);
    fresh.push(now);
    // Keep only the last 5 timestamps (gives 4 intervals)
    if (fresh.length > 5) fresh.shift();
    tapTimesRef.current = fresh;

    if (fresh.length >= 2) {
      const intervals = [];
      for (let i = 1; i < fresh.length; i++) intervals.push(fresh[i] - fresh[i - 1]);
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const tappedBpm = Math.round(60000 / avgInterval);
      onBpmChange(clampBpm(tappedBpm));
    }

    // Brief visual flash on the TAP label
    setTapFlash(true);
    if (tapFlashTimerRef.current) clearTimeout(tapFlashTimerRef.current);
    tapFlashTimerRef.current = setTimeout(() => setTapFlash(false), 120);
  };

  const resetBpmTimer = () => {
    setShowBpmControls(true);
    if (bpmTimerRef.current) {
      clearTimeout(bpmTimerRef.current);
    }
    bpmTimerRef.current = setTimeout(() => {
      setShowBpmControls(false);
    }, 5000);
  };

  const BPM_MIN = 12;
  const BPM_MAX = 360;
  const clampBpm = (v) => Math.min(BPM_MAX, Math.max(BPM_MIN, v));

  const handleBpmChangeWrapper = (val) => {
    resetBpmTimer();
    openSettingsIfClosed();
    onBpmChange(clampBpm(val));
  };

  // Inner -/+: jump to nearest integer (always moves by at least 1)
  const bpmDecrement = () => handleBpmChangeWrapper(Math.floor(bpm - 0.001));
  const bpmIncrement = () => handleBpmChangeWrapper(Math.ceil(bpm + 0.001));
  // Outer --/++: jump to nearest multiple of 5
  const bpmDecrementFive = () => handleBpmChangeWrapper(Math.floor((bpm - 0.001) / 5) * 5);
  const bpmIncrementFive = () => handleBpmChangeWrapper(Math.ceil((bpm + 0.001) / 5) * 5);

  // Long press for BPM
  const handleBpmLongPress = () => {
    resetBpmTimer();
    setTimeout(() => {
      const input = window.prompt('Enter BPM:', bpm);
      if (input !== null) {
        const val = parseFloat(input);
        if (!isNaN(val) && val >= BPM_MIN && val <= BPM_MAX) {
          onBpmChange(clampBpm(val));
        }
      }
    }, 10);
  };
  const bpmLongPress = useLongPressTimer();

  const renderBpmControls = () => {
    const x = 25;
    const term = getTempoTerm(bpm);
    const headerY = trebleStart - 89;
    const valueY = trebleStart - 59; // aligned with sheet music chords

    // Button zones (relative to x=25, total span from x-22 to x+112):
    // --  : x-22 .. x+3   (25px)
    // -   : x+3  .. x+45  (42px)  ← inner edge meets + at x+45
    // +   : x+45 .. x+87  (42px)
    // ++  : x+87 .. x+112 (25px)
    const zL2 = x - 22, zL2w = 25;   // -- button
    const zL1 = x + 3,  zL1w = 42;   // -  button
    const zR1 = x + 45, zR1w = 42;   // +  button
    const zR2 = x + 87, zR2w = 25;   // ++ button
    const zH  = valueY - 30;          // top of all hit rects
    const zHh = 45;                   // height of all hit rects
    const dc  = debugMode ? 'orange' : 'transparent';
    const dop = debugMode ? 0.4 : 1;
    const ds  = debugMode ? 1 : 0;

    const mkRect = (rx, rw, onUp, longPressOpts) => (
      <rect
        x={rx} y={zH} width={rw} height={zHh}
        fill={dc} fillOpacity={dop} stroke={dc} strokeWidth={ds}
        style={{ cursor: 'pointer' }}
        onMouseDown={() => longPressOpts && bpmLongPress.start(handleBpmLongPress)}
        onMouseUp={(e) => { e.stopPropagation(); longPressOpts ? bpmLongPress.end(e, onUp) : onUp(); }}
        onClick={(e) => e.stopPropagation()} // prevent click from bubbling to SVG's settings-toggle handler
        onMouseLeave={() => longPressOpts && bpmLongPress.cancel()}
        onTouchStart={() => longPressOpts && bpmLongPress.start(handleBpmLongPress)}
        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); longPressOpts ? bpmLongPress.end(e, onUp) : onUp(); }}
      />
    );

    return (
      <g>
        {/* Tempo term — clickable to open tempo word picker */}
        <text x={x + 10} y={headerY} className="tempo-term" fontSize="14"
          style={{ cursor: 'pointer', fill: showSettings ? 'var(--accent-yellow)' : undefined }}
        >
          {term}
        </text>
        {debugMode && <rect x={x + 6} y={headerY - 14} width={80} height={18} fill="green" fillOpacity={0.4} stroke="green" strokeWidth={1} />}
        <rect
          x={x + 6} y={headerY - 14} width={80} height={18}
          fill="transparent" style={{ cursor: 'pointer' }}
          onClick={(e) => { e.stopPropagation(); setTempoPicker(p => !p); openSettingsIfClosed(); onSettingsInteraction?.(10000); }}
        />

        {/* q = BPM */}
        <text x={x} y={valueY} className="bpm-note" fill={showSettings ? 'var(--accent-yellow)' : undefined}>q</text>
        <text x={x + 15} y={valueY} className="bpm-equals" fill={showSettings ? 'var(--accent-yellow)' : undefined}>=</text>
        <text x={x + 30} y={valueY - 8} className="bpm-value" fontFamily="Maestro" fill={showSettings ? 'var(--accent-yellow)' : undefined}>{bpm}</text>

        {/* -- / - / + / ++ indicators */}
        {(showBpmControls || showSettings) && (
          <>
            <text x={x - 12} y={valueY - 5} className="measure-indicator" fontSize="10">--</text>
            <text x={x + 17} y={valueY - 5} className="measure-indicator">-</text>
            <text x={x + 70} y={valueY - 4} className="measure-indicator">+</text>
            <text x={x + 91} y={valueY - 4} className="measure-indicator" fontSize="10">++</text>
          </>
        )}

        {/* -- (outer left): jump to next lower multiple of 5 */}
        {mkRect(zL2, zL2w, bpmDecrementFive, false)}
        {/* -  (inner left): jump to next lower integer, long-press = prompt */}
        {mkRect(zL1, zL1w, bpmDecrement, true)}
        {/* +  (inner right): jump to next higher integer, long-press = prompt */}
        {mkRect(zR1, zR1w, bpmIncrement, true)}
        {/* ++ (outer right): jump to next higher multiple of 5 */}
        {mkRect(zR2, zR2w, bpmIncrementFive, false)}

        {/* TAP button — always visible in settings, appears briefly after first BPM interaction */}
        {(showBpmControls || showSettings) && (
          <>
            <rect
              x={x + 3} y={valueY + 12} width={84} height={18} rx="3"
              fill={tapFlash ? 'var(--accent-yellow)' : (showSettings ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)')}
              stroke={showSettings ? 'var(--accent-yellow)' : 'var(--text-dim)'}
              strokeWidth="0.5"
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); handleTap(); }}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleTap(); }}
            />
            <text
              x={x + 45} y={valueY + 24}
              fontSize="9" fontFamily="sans-serif" textAnchor="middle"
              fill={tapFlash ? '#222' : (showSettings ? 'var(--accent-yellow)' : 'var(--text-dim)')}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              TAP
            </text>
          </>
        )}
      </g>
    );
  };

  /* =========================
       REPEATS CONTROLS
       ========================= */
  const [showRepeatsControls, setShowRepeatsControls] = React.useState(false);
  const repeatsTimerRef = React.useRef(null);

  const resetRepeatsTimer = () => {
    setShowRepeatsControls(true);
    if (repeatsTimerRef.current) {
      clearTimeout(repeatsTimerRef.current);
    }
    repeatsTimerRef.current = setTimeout(() => {
      setShowRepeatsControls(false);
    }, 5000);
  };

  const cycleRepeats = (direction) => {
    onSettingsInteraction?.();
    resetRepeatsTimer();
    const options = [1, 2, 4, 6, 8, -1];
    const currentIndex = options.indexOf(numRepeats);

    let nextIndex;
    if (currentIndex === -1) {
      nextIndex = options.indexOf(4); // Default to 4 if unknown
    } else {
      if (direction === 'up') {
        nextIndex = (currentIndex + 1) % options.length;
      } else {
        nextIndex = (currentIndex - 1 + options.length) % options.length;
      }
    }
    onNumRepeatsChange(options[nextIndex]);
  };

  const resetRepeatsToDefault = () => {
    resetRepeatsTimer();
    onNumRepeatsChange(4);
  }

  const renderRepeatsControls = () => {
    const cx = showSettings ? systemEndX - 30 : systemEndX - 20;
    const baseY = trebleStart - 18;
    const displayVal = numRepeats === -1 ? '∞' : numRepeats;

    if (!showSettings) {
      // Outside adjustments: right-aligned [numRepeats]À in Maestro — clickable to show repeat controls
      return (
        <g onClick={(e) => { e.stopPropagation(); resetRepeatsTimer(); }} style={{ cursor: 'pointer' }}>
          {debugMode && <rect x={systemEndX - 55} y={trebleStart - 50} width={55} height={30} fill="magenta" fillOpacity={0.4} stroke="magenta" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
          <rect x={systemEndX - 55} y={trebleStart - 50} width={55} height={30} fill="transparent" />
          <text
            x={systemEndX}
            y={trebleStart - 25}
            fontFamily="Maestro"
            fontWeight="normal"
            textAnchor="end"
            style={{ pointerEvents: 'none' }}
          >
            {numRepeats === -1 ? '' : (
              <>
                <tspan fontSize="32" fill="var(--text-dim)">{numRepeats}</tspan>
                <tspan fontSize="26" fill="var(--text-dim)"> À</tspan>
              </>
            )}
          </text>
        </g>
      );
    }

    return null;
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
  const renderRepeatSymbols = (offsets = allOffsets, nw = noteWidth, ppt = null, staveYsOverride = null, color = null) => {
    if (displayNumMeasures <= 0) return null;
    const staveYsRaw = staveYsOverride ?? [
      { y: 30, show: isTrebleVisible },
      { y: 30, show: isBassVisible },
      { y: 30, show: isPercussionVisible },
    ].filter(s => s.show);

    // Hide repeat labels (like 4x) when adjustments mode is active
    const opacity = showSettings ? 0 : 0.8;
    const staveYs = staveYsRaw.map(s => typeof s === 'object' ? s.y : s);
    const symbols = [];
    let measureXs;
    if (ppt !== null) {
      measureXs = Array.from({ length: displayNumMeasures + 1 }, (_, i) => startX + i * measureLengthSlots * ppt);
    } else {
      if (nw === 0) return null;
      const getXLocal = (index) => index === 0 ? startX - 35 : startX + (index - 1) * nw;
      measureXs = [];
      offsets.forEach((o, i) => { if (o === 'm') measureXs.push(getXLocal(i)); });
    }

    for (let m = 0; m < displayNumMeasures; m++) {
      if (m + 1 >= measureXs.length) break;
      const cx = (measureXs[m] + measureXs[m + 1]) / 2;
      for (const y of staveYs) {
        symbols.push(
          <text
            key={`onemrep-${y}-${m}`}
            x={cx}
            y={y - 1}
            fontSize="36"
            fontFamily="Maestro"
            fill={color ?? 'var(--text-primary)'}
            textAnchor="middle"
            style={{ pointerEvents: 'none', userSelect: 'none', opacity, transition: 'opacity 0.3s' }}
          >
            Ô
          </text>
        );
      }
    }
    return symbols;
  };

  const renderChordLabels = (customChords = null, offsets = allOffsets, nw = noteWidth, ppt = null, overrideColor = null) => {
    const chordsToRender = customChords ?? processedChords;
    if (!chordProgression || !chordsToRender || chordsToRender.length === 0) return null;

    const getXLocal = (index) => index === 0 ? startX - 35 : startX + (index - 1) * nw;
    const labels = [];

    const totalSlots = displayNumMeasures * measureLengthSlots;
    chordsToRender.forEach((item, idx) => {
      const { chord, absoluteOffset } = item;
      if (!chord) return;
      const nextOffset = idx < chordsToRender.length - 1 ? chordsToRender[idx + 1].absoluteOffset : totalSlots;
      const chordDuration = nextOffset - absoluteOffset;

      if (ppt !== null) {
        // Tick-based: position directly from absoluteOffset (no slot-index search needed)
        const xPos = startX + absoluteOffset * ppt;
        renderSingleChordLabel(chord, xPos, absoluteOffset, chordDuration, `chord-p-${idx}`, labels, idx, overrideColor);
      } else {
        // Elastic: find visual position in the provided offsets grid
        let visualIdx = -1;
        for (let i = 0; i < offsets.length; i++) {
          if (typeof offsets[i] === 'number' && Math.abs(offsets[i] - absoluteOffset) < 0.01) {
            visualIdx = i;
            break;
          }
        }
        if (visualIdx !== -1) {
          const xPos = getXLocal(visualIdx);
          renderSingleChordLabel(chord, xPos, absoluteOffset, chordDuration, `chord-p-${idx}`, labels, idx, overrideColor);
        }
      }
    });

    return labels;
  };

  const renderSingleChordLabel = (chord, xPos, absoluteOffset, chordDuration, key, container, idx, overrideColor = null) => {
    const CHORD_ROOT_Y  = trebleStart - 58;  // root text baseline
    const CHORD_SUPER_DY = 12;               // units above root for superscript

    const rawRomanBase = chord.romanBaseRaw || chord.romanBase || '';
    const isMinorish = chord.quality === 'minor' || chord.quality === 'diminished' || chord.quality === 'dim';
    const romanBaseDisplay = isMinorish ? String(rawRomanBase).toLowerCase() : rawRomanBase;

    const internalRoot  = (chord.internalRoot || chord.root || '').replace(/\d+/g, '');
    // internalRoot is now key-spelled at generation time (e.g. G♭ in C Locrian, not F♯)
    const spelledRoot = internalRoot;
    const isSlash = chord.type === 'slash';
    // Passing chords are rendered smaller and carry a right-arrow indicator.
    // isPassing lives in meta to avoid mutating the base Chord model.
    const isPassing = chord.meta?.isPassing === true;

    // Merge letters/roman branches — differ only in which fields to display
    const displayRoot   = chordDisplayMode === 'letters' ? spelledRoot              : romanBaseDisplay;
    const displaySuffix = chordDisplayMode === 'letters' ? (chord.internalSuffix || '') : (chord.romanSuffix || '');
    // Split slash notation (V7/vi) so the /vi part renders as subscript, not superscript.
    // slashIdx = -1 means no slash → old behaviour (entire suffix as superscript).
    const slashIdx  = displaySuffix.indexOf('/');
    const superPart = slashIdx === -1 ? displaySuffix : displaySuffix.slice(0, slashIdx);
    const slashPart = slashIdx === -1 ? ''             : displaySuffix.slice(slashIdx);
    const chordColor = overrideColor ?? (noteColoringMode === 'chords'
      ? `color-mix(in srgb, var(--chromatone-${getNoteSemitone(internalRoot)}), ${theme === 'light' ? 'black' : 'white'} 30%)`
      : 'var(--text-primary)');

    // Passing chords use a 20% smaller font so they visually subordinate to structural chords
    const rootFontSize    = isPassing ? 21 : 26;
    const suffixFontSize  = isPassing ? 13 : 16;

    let inputTestClass = '';
    if (inputTestState && inputTestState.activeStaff === 'chords') {
      if (inputTestState.activeIndex === idx) {
        inputTestClass = ` input-test-${inputTestState.status}`;
      } else if (inputTestState.successes?.includes(idx)) {
        inputTestClass = ' input-test-success';
      }
    }

    // data-chord-notes enables tap-to-play: handleSheetMusicClick reads this attribute
    // via ancestor walk and passes the note array to onNoteClick for immediate playback.
    const chordNotesJson = (!isSlash && chord.notes?.length)
      ? JSON.stringify(chord.notes)
      : null;

    container.push(
      <g key={key} data-offset={absoluteOffset} data-mel="chord" data-duration={chordDuration}
        data-measure-index={Math.floor(absoluteOffset / measureLengthSlots) + startMeasureIndex}
        data-local-slot={absoluteOffset % measureLengthSlots}
        {...(chordNotesJson ? { 'data-chord-notes': chordNotesJson } : {})}
        className={inputTestClass.trim() || undefined}>
        {isSlash ? (
          <text
            x={xPos}
            y={CHORD_ROOT_Y - CHORD_SUPER_DY + 10}
            fontSize="32"
            fontFamily="Maestro"
            fill="var(--text-primary)"
            textAnchor="start"
            style={{ opacity: 0.4 }}
          >
            Ë
          </text>
        ) : (
          <>
            {/* Arrow for passing chords — fixed Y so it is never displaced by superscript dy offsets */}
            {isPassing && (
              <text
                x={xPos}
                y={CHORD_ROOT_Y - CHORD_SUPER_DY - 10}
                fontSize="10"
                fontFamily="sans-serif"
                fill={chordColor}
                textAnchor="start"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >→</text>
            )}
            {/* textAnchor="start" anchors the left edge of the root letter at xPos,
                so the root is always directly above the note regardless of superscript width. */}
            <text
              x={xPos}
              y={CHORD_ROOT_Y}
              textAnchor="start"
              fontFamily="serif"
              fontSize={rootFontSize}
              fontWeight="normal"
              fill={chordColor}
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {displayRoot}
              {displaySuffix && (
                slashIdx === -1 ? (
                  // No slash — entire suffix is superscript (unchanged behaviour)
                  <tspan fontSize={suffixFontSize} dy={-CHORD_SUPER_DY} dx="2">{displaySuffix}</tspan>
                ) : (
                  // Slash notation (e.g. V7/vi): superscript quality only in this text element.
                  // The subscript /target is a separate text element below for predictable positioning
                  // (tspan dy is relative to cursor after superPart, causing drift when superPart has text).
                  <tspan fontSize={suffixFontSize} dy={-CHORD_SUPER_DY} dx="2">{superPart}</tspan>
                )
              )}
            </text>
            {/* Slash subscript (/vi, /IV, etc.) as separate text element.
                x aligns with the root character's right edge (estimated: rootFontSize * 0.65).
                y is at root baseline so the subscript sits visually below the superscript.
                Font is 60% larger than the old tspan (suffixFontSize − 3) for better legibility. */}
            {slashPart && (
              <text
                x={xPos + Math.round(rootFontSize * 0.65)}
                y={CHORD_ROOT_Y + 2}
                textAnchor="start"
                fontFamily="serif"
                fontSize={Math.round(suffixFontSize * 1.6)}
                fontWeight="normal"
                fill={chordColor}
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >{slashPart}</text>
            )}
          </>
        )}
        {/* Transparent hit area — chord texts have pointerEvents:none so this rect
            catches clicks and lets the ancestor walk find data-chord-notes on the <g>. */}
        {chordNotesJson && (
          <rect
            x={xPos - 3}
            y={CHORD_ROOT_Y - 28}
            width={45}
            height={36}
            fill={debugMode ? 'teal' : 'transparent'}
            fillOpacity={debugMode ? 0.4 : 1}
            stroke={debugMode ? 'teal' : 'none'}
            strokeWidth={debugMode ? 1 : 0}
            style={{ cursor: 'pointer' }}
          />
        )}
      </g>
    );
  };

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
    const getXLocal = (index) => startX + (index - 1) * nw;

    return notes.map((note, i) => {
      // Skip rests and null slots — only annotate actual drum hits
      if (isRest(note)) return null;
      const tickOffset = melOffsets[i];
      if (tickOffset == null) return null;
      const idx = offsets.indexOf(tickOffset);
      if (idx < 0) return null;
      const x = getXLocal(idx) + 5;

      const syllable = getTakadimiSyllable(tickOffset, beatDur, compound);
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
                const isCurrent = bpm >= t.bpm && (next ? bpm < next.bpm : true);
                return (
                  <button
                    key={t.term + i}
                    className={`gs-popup-option${isCurrent ? ' selected' : ''}`}
                    onClick={() => {
                      // Use explicit target if set (e.g. Larghissimo=30, Prestissimo=210),
                      // otherwise midpoint of [bpm[i], bpm[i+1]).
                      const mid = t.target ?? (next ? Math.round((rangeLo + next.bpm) / 2) : rangeLo);
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
          {renderBpmControls()}


          {/* Draw Repeats Controls - always visible, shows 4x outside adjustments */}
          {renderRepeatsControls()}

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
                  <g className="notes-transition" data-scroll-group style={{ willChange: animationMode === 'scroll' ? 'transform' : 'auto' }}>
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
                        {actualTreble && renderMelodyNotes(adjustedTrebleMelody, numAccidentals, startX, noteWidth, allOffsets, 'treble', 0, noteGroupSize, measureLengthSlots, timeSignature, clefTreble, noteColoringMode, tonic, scaleNotes, processedChords, theme, inputTestState, false, ppt, startMeasureIndex, trebleTransSemitones, debugMode, true, trebleAccidentalClick)}
                        {isTrebleVisible && !actualTreble && renderRepeatSymbols(allOffsets, noteWidth, ppt, [30])}
                      </g>
                      {melodicLyricsActive && actualTreble && (
                        <g className="lyrics-group">
                          {renderLyricsRow(adjustedTrebleMelody, trebleStart + staffHeight + 39)}
                        </g>
                      )}
                      <g style={{ transform: `translateY(${bassStart}px)`, transition: 'transform 1s ease-in-out' }}>
                        {actualBass && renderMelodyNotes(adjustedBassMelody, numAccidentals, startX, noteWidth, allOffsets, 'bass', 0, noteGroupSize, measureLengthSlots, timeSignature, clefBass, noteColoringMode, tonic, scaleNotes, processedChords, theme, inputTestState, false, ppt, startMeasureIndex, bassTransSemitones, debugMode, true, bassAccidentalClick)}
                        {isBassVisible && !actualBass && renderRepeatSymbols(allOffsets, noteWidth, ppt, [30])}
                      </g>
                      <g style={{ transform: `translateY(${percussionStart}px)`, transition: 'transform 1s ease-in-out' }}>
                        {actualPerc && renderMelodyNotes(adjustedPercussionMelody, numAccidentals, startX, noteWidth, allOffsets, 'percussion', 0, noteGroupSize, measureLengthSlots, timeSignature, null, noteColoringMode, tonic, [], processedChords, theme, inputTestState, false, ppt, startMeasureIndex, 0, debugMode)}
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
                        {adjustedMetronomeMelody && renderMelodyNotes(adjustedMetronomeMelody, numAccidentals, startX, noteWidth, allOffsets, 'percussion', 0, noteGroupSize, measureLengthSlots, timeSignature, null, noteColoringMode, tonic, [], processedChords, theme, null, false, ppt, startMeasureIndex, 0, false, false)}
                      </g>
                    </g>
                    {/* Regular inner barlines — masked with old content during wipe */}
                    <g data-wipe-role="old" style={{ opacity: showSettings ? 0.6 : 1, filter: showSettings ? 'blur(1.5px)' : 'none' }}>
                      {renderRegularBarlines(allOffsets, noteWidth, ppt)}
                    </g>

                    {/* Chord labels */}
                    <g
                      data-wipe-role="old"
                      className="chord-labels-group"
                      style={{ filter: showSettings ? 'blur(6px)' : 'none', opacity: showSettings ? 0.6 : 1 }}
                    >
                      {actualChords && renderChordLabels(null, allOffsets, noteWidth, ppt)}
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

                    {/* Wipe mode: yellow = overlay next repeat's notes in the next-round visibility,
                        red = "NEXT BLOCK" text (new melody not yet known). */}
                    {showWipePreview === 'yellow' && (() => {
                      const nextRoundKey = isOddRound ? 'evenRounds' : 'oddRounds';
                      const nextCfg = playbackConfig?.[nextRoundKey] ?? {};
                      const nextNotesVisible = !!nextCfg.notes;
                      const nextTreble = nextCfg.trebleEye !== false;
                      const nextBass = nextCfg.bassEye !== false;
                      const nextPerc = nextCfg.percussionEye === true;
                      const nextMetro = nextCfg.percussionEye === 'metronome';
                      // In debug mode: tint yellow so the overlay is visually distinct.
                      // In normal mode: render with default note colors (null = no tint).
                      const YCOL = debugMode ? 'var(--accent-yellow)' : null;
                      return (
                        <g
                          data-wipe-role="new"
                          data-pagination-new=""
                          transform={animationMode === 'scroll' ? `translate(${endX - startX}, 0)` : undefined}
                          className={
                            // CSS class controls resting opacity — NOT inline style.
                            // Reason: React re-renders would reset inline style.opacity on every
                            // commit, fighting with the rAF / useLayoutEffect that own opacity
                            // during the transition. With a class (not inline style), React only
                            // reconciles className and never touches style.opacity.
                            animationMode === 'wipe' ? 'wipe-new-hidden'          // opacity:0; useLayoutEffect sets style.opacity='1' once
                          : animationMode === 'pagination' ? 'pagination-new-hidden' // opacity:0; rAF animates to 1
                          : undefined
                          }
                          style={{
                            // scroll: tinted yellow at 0.55 opacity (no transition needed).
                            opacity: animationMode === 'scroll' ? 0.55 : undefined,
                            filter: showSettings ? 'blur(1.5px)' : 'none',
                            pointerEvents: 'none',
                          }}
                        >
                          {/* Chord labels above treble staff — shown if next round has chords visible */}
                          {nextCfg.chordsEye !== false && chordProgression && processedChords?.length > 0 &&
                            renderChordLabels(null, allOffsets, noteWidth, ppt, YCOL)}
                          <g style={{ transform: `translateY(${trebleStart}px)` }}>
                            {isTrebleVisible && nextTreble && nextNotesVisible && adjustedTrebleMelody &&
                              renderMelodyNotes(adjustedTrebleMelody, numAccidentals, startX, noteWidth, allOffsets, 'treble', 0, noteGroupSize, measureLengthSlots, timeSignature, clefTreble, noteColoringMode, tonic, scaleNotes, processedChords, theme, null, YCOL, ppt, startMeasureIndex, trebleTransSemitones)}
                            {isTrebleVisible && (!nextTreble || !nextNotesVisible) &&
                              renderRepeatSymbols(allOffsets, noteWidth, ppt, [30], YCOL)}
                          </g>
                          <g style={{ transform: `translateY(${bassStart}px)` }}>
                            {isBassVisible && nextBass && nextNotesVisible && adjustedBassMelody &&
                              renderMelodyNotes(adjustedBassMelody, numAccidentals, startX, noteWidth, allOffsets, 'bass', 0, noteGroupSize, measureLengthSlots, timeSignature, clefBass, noteColoringMode, tonic, scaleNotes, processedChords, theme, null, YCOL, ppt, startMeasureIndex, bassTransSemitones)}
                            {isBassVisible && (!nextBass || !nextNotesVisible) &&
                              renderRepeatSymbols(allOffsets, noteWidth, ppt, [30], YCOL)}
                          </g>
                          <g style={{ transform: `translateY(${percussionStart}px)` }}>
                            {isPercussionVisible && nextPerc && nextNotesVisible && adjustedPercussionMelody &&
                              renderMelodyNotes(adjustedPercussionMelody, numAccidentals, startX, noteWidth, allOffsets, 'percussion', 0, noteGroupSize, measureLengthSlots, timeSignature, null, noteColoringMode, tonic, [], processedChords, theme, null, YCOL, ppt, startMeasureIndex)}
                            {isPercussionVisible && nextMetro && adjustedMetronomeMelody &&
                              renderMelodyNotes(adjustedMetronomeMelody, numAccidentals, startX, noteWidth, allOffsets, 'percussion', 0, noteGroupSize, measureLengthSlots, timeSignature, null, noteColoringMode, tonic, [], processedChords, theme, null, YCOL, ppt, startMeasureIndex, 0, false, false)}
                            {isPercussionVisible && (!nextPerc && !nextMetro) &&
                              renderRepeatSymbols(allOffsets, noteWidth, ppt, [30], YCOL)}
                          </g>
                          {/* Barlines for the incoming content — wipe-reveals alongside notes.
                              Show the NEXT iteration's measure numbers (startMeasureIndex + displayNumMeasures)
                              so the numbers visually animate during the wipe instead of jumping at the end. */}
                          <g style={{ opacity: showSettings ? 0.6 : 1 }}>
                            {renderRegularBarlines(allOffsets, noteWidth, ppt, startMeasureIndex + displayNumMeasures)}
                          </g>
                        </g>
                      );
                    })()}
                    {showWipePreview === 'red' && (() => {
                      // Use next-round visibility (same as yellow overlay)
                      const nextRoundKey = isOddRound ? 'evenRounds' : 'oddRounds';
                      const nextCfg = playbackConfig?.[nextRoundKey] ?? {};
                      const nextNotesVisible = !!nextCfg.notes;
                      const nextTreble = nextCfg.trebleEye !== false;
                      const nextBass = nextCfg.bassEye !== false;
                      const nextPerc = nextCfg.percussionEye === true;
                      const nextMetro = nextCfg.percussionEye === 'metronome';
                      const RED = 'rgba(220,30,30,0.75)';
                      // In debug mode: tint red so the pre-generated melody overlay is distinct.
                      // In normal mode: render with default note colors (null = no tint).
                      const RCOL = debugMode ? RED : null;
                      // If pre-generated melody is available, render its notes
                      if (previewMelody) {
                        const pm = previewMelody;
                        const pmDur = Math.max(getMelodyEndTime(pm.treble), getMelodyEndTime(pm.bass), getMelodyEndTime(pm.percussion));
                        const pmDisplayMeasures = pmDur > 0 ? Math.max(1, Math.round(pmDur / measureLengthSlots)) : displayNumMeasures;
                        // Process preview melodies with their own slot calculation
                        const previewTreble = pm.treble ? processMelodyAndCalculateSlots(pm.treble, timeSignature, noteGroupSize, pmDur, null, null) : null;
                        const previewBass = pm.bass ? processMelodyAndCalculateSlots(pm.bass, timeSignature, noteGroupSize, pmDur, null, null) : null;
                        const previewPerc = pm.percussion ? processMelodyAndCalculateSlots(pm.percussion, timeSignature, noteGroupSize, pmDur, null, null) : null;
                        const previewChords = pm.chordProgression ? getChordsWithSlashes(pm.chordProgression, pmDisplayMeasures, timeSignature) : null;
                        // Compute independent layout (allOffsets + noteWidth) for the preview melody
                        const pmTrebleAcc = previewTreble ? generateAccidentalMap(previewTreble.notes, numAccidentals) : {};
                        const pmBassAcc = previewBass ? generateAccidentalMap(previewBass.notes, numAccidentals) : {};
                        const pmAllOffsets = calculateAllOffsets(
                          timeSignature, noteGroupSize, numRepeats, pmDisplayMeasures, null,
                          (nextNotesVisible && previewTreble) ? melodyToTaggedOffsets(previewTreble, pmTrebleAcc) : [],
                          (nextNotesVisible && previewBass) ? melodyToTaggedOffsets(previewBass, pmBassAcc) : [],
                          (nextNotesVisible && previewPerc) ? previewPerc.offsets : [],
                          [],
                          [],
                          previewChords ? previewChords.map(c => c.absoluteOffset) : [],
                        );
                        const pmNoteWidth = pmAllOffsets.length > 2 ? (endX - startX) / (pmAllOffsets.length - 2) : 0;
                        return (
                          <g
                            data-wipe-role={animationMode === 'wipe' ? 'new' : undefined}
                            data-pagination-new={animationMode === 'pagination' ? '' : undefined}
                            transform={animationMode === 'scroll' ? `translate(${endX - startX}, 0)` : undefined}
                            className={
                              // Same pattern as yellow overlay: CSS class owns resting opacity,
                              // never inline style — prevents React re-renders from overriding
                              // the rAF/useLayoutEffect that animate opacity during the transition.
                              animationMode === 'wipe' ? 'wipe-new-hidden'
                            : animationMode === 'pagination' ? 'pagination-new-hidden'
                            : undefined
                            }
                            style={{
                              // scroll: tinted red; fades in via CSS animation (scroll mode only).
                              opacity: animationMode === 'scroll' ? undefined : undefined,
                              animation: animationMode === 'scroll' ? 'scrollPreviewFadeIn 0.5s ease-in forwards' : undefined,
                              filter: showSettings ? 'blur(1.5px)' : 'none',
                              pointerEvents: 'none',
                            }}
                          >
                            {nextCfg.chordsEye !== false && previewChords?.length > 0 &&
                              renderChordLabels(previewChords, pmAllOffsets, pmNoteWidth, ppt, RCOL)}
                            <g style={{ transform: `translateY(${trebleStart}px)` }}>
                              {isTrebleVisible && nextTreble && nextNotesVisible && previewTreble &&
                                renderMelodyNotes(previewTreble, numAccidentals, startX, pmNoteWidth, pmAllOffsets, 'treble', 0, noteGroupSize, measureLengthSlots, timeSignature, clefTreble, noteColoringMode, tonic, scaleNotes, previewChords ?? processedChords, theme, null, RCOL, ppt, startMeasureIndex, trebleTransSemitones)}
                              {isTrebleVisible && (!nextTreble || !nextNotesVisible) &&
                                renderRepeatSymbols(pmAllOffsets, pmNoteWidth, ppt, [30], RCOL)}
                            </g>
                            <g style={{ transform: `translateY(${bassStart}px)` }}>
                              {isBassVisible && nextBass && nextNotesVisible && previewBass &&
                                renderMelodyNotes(previewBass, numAccidentals, startX, pmNoteWidth, pmAllOffsets, 'bass', 0, noteGroupSize, measureLengthSlots, timeSignature, clefBass, noteColoringMode, tonic, scaleNotes, previewChords ?? processedChords, theme, null, RCOL, ppt, startMeasureIndex, bassTransSemitones)}
                              {isBassVisible && (!nextBass || !nextNotesVisible) &&
                                renderRepeatSymbols(pmAllOffsets, pmNoteWidth, ppt, [30], RCOL)}
                            </g>
                            <g style={{ transform: `translateY(${percussionStart}px)` }}>
                              {isPercussionVisible && nextPerc && nextNotesVisible && previewPerc &&
                                renderMelodyNotes(previewPerc, numAccidentals, startX, pmNoteWidth, pmAllOffsets, 'percussion', 0, noteGroupSize, measureLengthSlots, timeSignature, null, noteColoringMode, tonic, [], previewChords ?? processedChords, theme, null, RCOL, ppt, startMeasureIndex)}
                              {isPercussionVisible && (!nextPerc && !nextMetro) &&
                                renderRepeatSymbols(pmAllOffsets, pmNoteWidth, ppt, [30], RCOL)}
                            </g>
                            {/* Barlines for the incoming content — use the preview's startMeasureIndex so
                                measure numbers are correct during the wipe (not the old block's numbers) */}
                            <g style={{ opacity: showSettings ? 0.6 : 1 }}>
                              {renderRegularBarlines(pmAllOffsets, pmNoteWidth, ppt, pm.startMeasureIndex ?? startMeasureIndex)}
                            </g>
                          </g>
                        );
                      }
                      // Fallback: no preview melody yet — show "NEXT BLOCK" text
                      return (
                        <text
                          x={(startX + endX) / 2}
                          y={(trebleStart + bottomY) / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={Math.round((endX - startX) / 5)}
                          fill={RED}
                          fontFamily="serif"
                          fontWeight="bold"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          NEXT BLOCK
                        </text>
                      );
                    })()}
                  </g>
                  </g>{/* end scroll-content-clip wrapper */}

                  {/* Scroll mode playhead — fixed vertical line at 25% from left, outside the scroll group */}
                  {animationMode === 'scroll' && isPlaying && startX != null && endX != null && (
                    <line
                      x1={startX + 0.25 * (endX - startX)}
                      y1={trebleStart - 20}
                      x2={startX + 0.25 * (endX - startX)}
                      y2={bottomY + 10}
                      stroke="var(--accent-yellow)"
                      strokeWidth={2}
                      opacity={0.75}
                      pointerEvents="none"
                    />
                  )}

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

                  {/* Thick repeat barlines — hidden in scroll+playing (no start/end repeat signs in scroll mode) */}
                  {!(animationMode === 'scroll' && isPlaying) && renderRepeatBarlines(ppt)}

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

export default SheetMusic;
