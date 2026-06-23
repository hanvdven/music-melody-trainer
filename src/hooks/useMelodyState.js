import { useState, useCallback, useMemo, useRef } from 'react';
import logger from '../utils/logger';
import Melody from '../model/Melody';
import MelodyGenerator from '../generation/melodyGenerator';
import { chooseGrouping, generateRhythmicDNA } from '../generation/rhythmicPriorities';
import { generateProgression, generateChordOnDegree } from '../theory/chordGenerator';
import { insertPassingChords } from '../generation/passingChords';
import ChordProgression from '../model/ChordProgression';
import { calculateRelativeRange, modulateMelody } from '../theory/musicUtils';
import { getRelativeNoteName } from '../theory/convertToDisplayNotes';
import { GLOBAL_RESOLUTION } from '../constants/generatorDefaults';
import useRefState from './useRefState';

// Percussion note tokens are non-pitched and must never be passed through
// enharmonic conversion or scale-relative display name resolution.
const PERC_TOKENS = new Set(['k', 'c', 'b', 'hh', 's', '/']);

// Resolve one voice for the next generation round.
// - Fixed + pitched (refMelody supplied): modulate from reference scale to new scale.
// - Fixed + unpitched (no refMelody): keep current.
// - canRandomize=false: keep current.
// - Otherwise: generate fresh via MelodyGenerator.
const resolveVoice = ({
  isFixed, currentMelody, refMelody, refScale, targetScale,
  canRandomize, voiceType, settings, nextProgression, nm, ts, runId, rhythm, grouping,
}) => {
  if (isFixed && refMelody) {
    const modulatedNotes = modulateMelody(refMelody.notes, refScale, targetScale);
    const displayNotes = modulatedNotes.map(n => {
      if (!n || PERC_TOKENS.has(n)) return n;
      const idx = targetScale.notes.indexOf(n);
      if (idx !== -1) return targetScale.displayNotes[idx];
      return getRelativeNoteName(n, targetScale.tonic);
    });
    return new Melody(modulatedNotes, refMelody.durations, refMelody.offsets, displayNotes);
  }
  if ((isFixed || !canRandomize) && currentMelody) return currentMelody;
  const effectiveRange = voiceType
    ? calculateRelativeRange(voiceType, settings?.rangeMode, targetScale.tonic) || settings?.range
    : null;
  return new MelodyGenerator(targetScale, nm, ts, settings, nextProgression, effectiveRange, runId, rhythm, grouping).generateMelody();
};

const useMelodyState = (
  numMeasures,
  timeSignature,
  scale,
  percussionScale,
  trebleSettings,
  bassSettings,
  percussionSettings,
  metronomeSettings,
  chordSettings,
  chordComplexity,
  timeSignatureRef = null, // Optional: read latest TS inside randomizeAll to batch with state updates
  numMeasuresRef = null    // Optional: read latest numMeasures inside randomizeAll
) => {
  const [treble, setTreble] = useState(Melody.defaultTrebleMelody());
  const [bass, setBass] = useState(Melody.defaultBassMelody());
  const [percussion, setPercussion] = useState(Melody.defaultPercussionMelody());
  const [metronome, setMetronome] = useState(Melody.defaultMetronomeMelody());
  // chordProgression is owned here so navigateHistory can restore it alongside treble/bass/percussion.
  const [chordProgression, setChordProgression, chordProgressionRef] = useRefState(() => ChordProgression.default());

  // Reference state for lossless modulation
  const [referenceMelody, setReferenceMelody] = useState(Melody.defaultTrebleMelody());
  const [referenceBassMelody, setReferenceBassMelody] = useState(Melody.defaultBassMelody());
  const [referenceScale, setReferenceScale] = useState(scale);

  // History system
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [globalMeasureOffset, setGlobalMeasureOffset] = useState(0);

  // Refs that mirror history state — always reflects the committed value even inside stale
  // closures. Required because navigateHistory and randomizeAll are called from rapid-fire
  // click handlers where React hasn't re-rendered between calls.
  const historyIndexRef = useRef(-1);
  const historyRef = useRef([]);

  const generateChords = useCallback((strategyKey) => {
    let strategy = strategyKey;
    if (strategyKey === true || strategyKey === 'random') {
      strategy = 'modal-random';
    } else if (strategyKey === false || strategyKey === undefined) {
      if (chordProgression && chordProgression.type && chordProgression.type !== 'tonic-tonic-tonic') {
        strategy = chordProgression.type;
      } else {
        strategy = 'tonic-tonic-tonic';
      }
    }

    try {
      const chordCount = chordSettings?.chordCount || 1;
      const enabledPassingTypes = chordSettings?.passingChordTypes ?? [];
      // When passing chords are enabled, exactly 1 structural chord per measure is
      // generated (placed near beat 1). insertPassingChords fills the remaining
      // chordCount-1 slots. Must match the `structuralCount = 1` rule used in the
      // randomizeAll branch below (line ~158) and in Sequencer.js — otherwise the
      // abstract progression pool length and the MelodyGenerator's slot count disagree,
      // which causes half the progression to be wasted or notePool reuse to double-count.
      const structuralCount = enabledPassingTypes.length > 0 ? 1 : chordCount;
      let progressionLength = Math.ceil(numMeasures * structuralCount);
      if (['modal-random', 'inter-modal-random', 'extra-modal-random'].includes(strategy)) {
        progressionLength += 4;
      }

      const chords = generateProgression(scale, progressionLength, strategy, chordComplexity);

      if (!chords || chords.length === 0) {
        const tonicChord = generateChordOnDegree(scale, 1, chordComplexity);
        return new ChordProgression([tonicChord], chordComplexity, 'fallback-tonic', 'modal');
      }

      let modality = 'modal';
      if (strategy === 'inter-modal-random') modality = 'intra-modal';
      else if (strategy === 'extra-modal-random') modality = 'extra-modal';

      return new ChordProgression(chords, chordComplexity, strategy, modality);
    } catch (e) {
      logger.error('useMelodyState', 'E012-GENERATE-PROGRESSION', e);
      try {
        const tonicChord = generateChordOnDegree(scale, 1, chordComplexity);
        return new ChordProgression([tonicChord], chordComplexity, 'fallback-tonic', 'modal');
      } catch (innerE) {
        logger.error('useMelodyState', 'E013-PROGRESSION-FALLBACK', innerE);
        return ChordProgression.default();
      }
    }
  }, [scale, numMeasures, chordComplexity, chordSettings]);

  const randomizeAll = useCallback((randomizeConfig) => {
    // Read from refs when available so callers can update refs synchronously before calling
    // randomizeAll in the same event handler, ensuring new TS/numMeasures are used without
    // waiting for a React re-render (prevents sheet-music crash on TS change).
    const activeTS = timeSignatureRef?.current ?? timeSignature;
    const activeNumMeasures = numMeasuresRef?.current ?? numMeasures;

    const shouldRandomizeChords = !randomizeConfig || randomizeConfig.chords !== false;
    const canRandomizeMelody = !randomizeConfig || randomizeConfig.melody !== false;
    let nextProgression;
    let globalRhythmArray = null;
    // One grouping choice for the entire generation block. All generators (treble, bass,
    // percussion, chords, metronome) receive this so every voice shares the same beat hierarchy.
    const sharedGrouping = chooseGrouping(activeTS[0]);

    const runId = Date.now().toString();

    if (!shouldRandomizeChords && chordProgression && chordProgression.chords) {
      let adaptedChords = chordProgression.chords;
      const oldLen = adaptedChords.length;
      const newLen = activeNumMeasures;

      if (oldLen !== newLen && oldLen <= 32) {
        const newArr = new Array(newLen);
        for (let i = 0; i < newLen; i++) {
          const offset = newLen - oldLen;
          const oldIdx = (((i - offset) % oldLen) + oldLen) % oldLen;
          newArr[i] = adaptedChords[oldIdx];
        }
        adaptedChords = newArr;
      }

      nextProgression = new ChordProgression(
        adaptedChords,
        chordProgression.complexity,
        chordProgression.type,
        chordProgression.modality
      ).transposeToScale(referenceScale.notes, scale.notes);
    } else {
      const abstractProgression = generateChords(chordSettings?.strategy);

      // Build globalRhythmArray at GLOBAL_RESOLUTION (16th-note) using the shared grouping.
      // MelodyGenerator downsamples this by step = GLOBAL_RESOLUTION / localDenom so each
      // instrument reads the correct number of slots at its own resolution.
      // Using generateRhythmicDNA here (instead of the old generateDeterministicRhythm)
      // ensures that chord, melody, and percussion generators all operate on the SAME
      // beat hierarchy derived from sharedGrouping.
      globalRhythmArray = [generateRhythmicDNA(sharedGrouping, activeTS, GLOBAL_RESOLUTION)];

      const notePool = abstractProgression?.chords || [];

      const chordCount = chordSettings?.chordCount || 1;
      const enabledPassingTypes = chordSettings?.passingChordTypes ?? [];
      // When passing chords are enabled, always use 1 structural chord per measure (placed near
      // beat 1 — the highest-ranked slot — by MelodyGenerator's rank+2×distance logic).
      // insertPassingChords then fills the remaining chordCount-1 slots with passing chords.
      // This ensures each measure always gets exactly ONE chord from the progression.
      const structuralCount = enabledPassingTypes.length > 0 ? 1 : chordCount;

      const chordGenSettings = {
        notesPerMeasure: structuralCount,
        smallestNoteDenom: activeTS[1] || 4,
        rhythmVariability: chordSettings?.rhythmVariability || 0,
        enableTriplets: false,
        notePool,
        playStyle: 'chord',
        type: 'progression',
        randomizationRule: 'progression'
      };

      const chordGen = new MelodyGenerator(
        scale,
        activeNumMeasures,
        activeTS,
        chordGenSettings,
        null,
        null,
        runId,
        globalRhythmArray,
        sharedGrouping
      );

      let chordMelody = chordGen.generateMelody();

      // Insert passing chords. chordCount is passed so insertPassingChords can derive
      // passingProbability internally via the same structuralCount halving formula.
      // firstChord is used for the wrap-around gap after the last structural chord.
      // rhythmVariability (0–100) modulates insertion stochasticity: 0 = deterministic.
      if (enabledPassingTypes.length > 0) {
        const firstChord = chordMelody.displayNotes?.find(c => c !== null) ?? null;
        const passingVariability = chordSettings?.rhythmVariability ?? 100;
        chordMelody = insertPassingChords(chordMelody, scale, activeTS, chordSettings?.complexity || 'triad', enabledPassingTypes, chordCount, firstChord, passingVariability, sharedGrouping);
      }

      nextProgression = chordMelody;
      // Set top-level fields so Sequencer can read .type/.complexity/.modality directly
      // (not just via progressionMetadata which the Sequencer doesn't read)
      nextProgression.type = abstractProgression.type;
      nextProgression.complexity = abstractProgression.complexity;
      nextProgression.modality = abstractProgression.modality;
      nextProgression.progressionMetadata = {
        type: abstractProgression.type,
        complexity: abstractProgression.complexity,
        modality: abstractProgression.modality
      };
    }

    const bassSc = scale.generateBassScale();
    // A staff whose clef is disabled ('off') generates nothing — its melody is an
    // empty Melody so downstream rendering/playback simply have no notes for it
    // (Han 2026-06-01: disable generation of a disabled staff).
    const EMPTY = () => new Melody([], [], [], []);
    const newTreble = trebleSettings?.preferredClef === 'off' ? EMPTY() : resolveVoice({
      isFixed: trebleSettings?.randomizationRule === 'fixed',
      currentMelody: treble, refMelody: referenceMelody, refScale: referenceScale, targetScale: scale,
      canRandomize: canRandomizeMelody, voiceType: 'treble', settings: trebleSettings,
      nextProgression, nm: activeNumMeasures, ts: activeTS, runId, rhythm: globalRhythmArray, grouping: sharedGrouping,
    });
    const newBass = bassSettings?.preferredClef === 'off' ? EMPTY() : resolveVoice({
      isFixed: bassSettings?.randomizationRule === 'fixed',
      currentMelody: bass, refMelody: referenceBassMelody, refScale: referenceScale.generateBassScale(), targetScale: bassSc,
      canRandomize: canRandomizeMelody, voiceType: 'bass', settings: bassSettings,
      nextProgression, nm: activeNumMeasures, ts: activeTS, runId, rhythm: globalRhythmArray, grouping: sharedGrouping,
    });
    const newPercussion = percussionSettings?.preferredClef === 'off' ? EMPTY() : resolveVoice({
      isFixed: percussionSettings?.randomizationRule === 'fixed',
      currentMelody: percussion, refMelody: null, refScale: null, targetScale: percussionScale,
      canRandomize: canRandomizeMelody, voiceType: null, settings: percussionSettings,
      nextProgression, nm: activeNumMeasures, ts: activeTS, runId, rhythm: globalRhythmArray, grouping: sharedGrouping,
    });

    const metronomeGenSettings = {
      // One click per denominator-unit beat; wh/wm/wl assigned by generateMetronome based on grouping.
      notesPerMeasure: activeTS[0],
      smallestNoteDenom: activeTS[1],
      rhythmVariability: 0,
      enableTriplets: false,
      notePool: ['wh', 'wm', 'wl'],
      playStyle: 'metronome',
      type: 'metronome',
      randomizationRule: 'metronome'
    };

    const metronomeGen = new MelodyGenerator(
      null,
      activeNumMeasures,
      activeTS,
      metronomeGenSettings,
      null,
      null,
      runId,
      globalRhythmArray,
      sharedGrouping
    );

    const newMetronome = metronomeGen.generateMelody();
    setMetronome(newMetronome);

    setTreble(newTreble);
    setBass(newBass);
    setPercussion(newPercussion);
    setMetronome(newMetronome);
    setChordProgression(nextProgression);

    const nextRefTreble = trebleSettings?.randomizationRule === 'fixed' ? referenceMelody : newTreble;
    const nextRefBass = bassSettings?.randomizationRule === 'fixed' ? referenceBassMelody : newBass;

    setReferenceMelody(nextRefTreble);
    setReferenceBassMelody(nextRefBass);
    setReferenceScale(scale);

    const historyEntry = {
      treble: newTreble,
      bass: newBass,
      percussion: newPercussion,
      metronome: newMetronome,
      chordProgression: nextProgression,
      referenceMelody: nextRefTreble,
      referenceBassMelody: nextRefBass,
      referenceScale: scale,
      scale, // Store full scale object for restoration
      trebleSettings: { ...trebleSettings },
      bassSettings: { ...bassSettings },
    };

    setHistory(prev => {
      // Use historyIndexRef.current (not the closure-captured historyIndex) so rapid-fire
      // calls from handleSkipForward don't all read the same stale index and overwrite each other.
      const curIdx = historyIndexRef.current;
      const newHistory = [...prev.slice(0, curIdx + 1), historyEntry];
      const newIdx = newHistory.length - 1;
      historyIndexRef.current = newIdx;
      historyRef.current = newHistory;
      setHistoryIndex(newIdx);
      return newHistory;
    });

    const result = { ...historyEntry, globalMeasureOffset };
    return result;
  }, [scale, numMeasures, timeSignature, trebleSettings, bassSettings, percussionSettings, metronomeSettings, chordSettings, percussionScale, generateChords, chordProgression, treble, bass, percussion, referenceMelody, referenceBassMelody, referenceScale]);

  const randomizeMeasure = useCallback((measureIndex, trackType) => {
    const runId = `meas-${measureIndex}-${Date.now()}`;

    let generator;
    if (trackType === 'treble') {
      generator = new MelodyGenerator(scale, numMeasures, timeSignature, trebleSettings, chordProgression, trebleSettings?.range, runId);
      const newMelody = generator.generateMelody();
      setTreble(newMelody);
      setReferenceMelody(newMelody);
      setReferenceScale(scale);
    } else if (trackType === 'bass') {
      generator = new MelodyGenerator(
        scale.generateBassScale(),
        numMeasures,
        timeSignature,
        bassSettings,
        chordProgression,
        bassSettings?.range,
        runId
      );
      const newMelody = generator.generateMelody();
      setBass(newMelody);
      setReferenceBassMelody(newMelody);
      setReferenceScale(scale);
    } else if (trackType === 'percussion') {
      const generator = new MelodyGenerator(
        percussionScale,
        numMeasures,
        timeSignature,
        percussionSettings,
        chordProgression,
        null,
        runId
      );
      const newMelody = generator.generateMelody();
      setPercussion(newMelody);
    }
  }, [scale, numMeasures, timeSignature, trebleSettings, bassSettings, percussionSettings, percussionScale, chordProgression]);

  const navigateHistory = useCallback((direction, randomizeConfig = null) => {
    // Read from refs so rapid-fire clicks see the latest committed index/history,
    // not the stale closure values that React hasn't flushed yet.
    const curIdx = historyIndexRef.current;
    const curHistory = historyRef.current;

    // Restore all voices from a history entry identically to how randomizeAll stores them.
    const restoreEntry = (entry) => {
      setTreble(entry.treble);
      setBass(entry.bass);
      setPercussion(entry.percussion);
      // Restore the stored metronome (which carries the correct wh/wm/wl grouping for that
      // generation block) instead of regenerating with Melody.updateMetronome.
      if (entry.metronome) setMetronome(entry.metronome);
      setChordProgression(entry.chordProgression);
      setReferenceMelody(entry.referenceMelody);
      setReferenceBassMelody(entry.referenceBassMelody);
      setReferenceScale(entry.referenceScale);
    };

    if (direction === 'back') {
      if (curIdx > 0) {
        const prevIndex = curIdx - 1;
        const entry = curHistory[prevIndex];
        restoreEntry(entry);
        historyIndexRef.current = prevIndex;
        setHistoryIndex(prevIndex);
        const newOffset = globalMeasureOffset + numMeasures;
        setGlobalMeasureOffset(newOffset);
        return { ...entry, globalMeasureOffset: newOffset };
      }
    } else if (direction === 'forward') {
      if (curIdx < curHistory.length - 1) {
        const nextIdx = curIdx + 1;
        const entry = curHistory[nextIdx];
        restoreEntry(entry);
        historyIndexRef.current = nextIdx;
        setHistoryIndex(nextIdx);
        const newOffset = globalMeasureOffset + numMeasures;
        setGlobalMeasureOffset(newOffset);
        return { ...entry, globalMeasureOffset: newOffset };
      } else {
        // Skip forward past the end of history: generate the next block. Pass the caller's current
        // randomize config (Han 2026-06-14 bug 2) so a LOADED SONG's pin/settings are respected —
        // with `null` this regenerated chords+melody from scratch, discarding the song. numMeasures
        // / time-sig / scale / instrument settings already come from state, so they're kept too.
        const newOffset = globalMeasureOffset + numMeasures;
        setGlobalMeasureOffset(newOffset);
        const newMelody = randomizeAll(randomizeConfig);
        return { ...newMelody, globalMeasureOffset: newOffset };
      }
    }
    return null;
  }, [randomizeAll, globalMeasureOffset, numMeasures]);

  const memoizedMelodies = useMemo(() => ({
    treble,
    bass,
    percussion,
    metronome,
    chordProgression,
    referenceMelody,
    referenceBassMelody,
    referenceScale,
    globalMeasureOffset
  }), [treble, bass, percussion, metronome, chordProgression, referenceMelody, referenceBassMelody, referenceScale, globalMeasureOffset]);

  const memoizedSetters = useMemo(() => ({
    setTreble,
    setBass,
    setPercussion,
    setMetronome,
    setChordProgression,
    setReferenceMelody,
    setReferenceBassMelody,
    setReferenceScale,
    setGlobalMeasureOffset,
  }), [setTreble, setBass, setPercussion, setMetronome, setChordProgression, setReferenceMelody, setReferenceBassMelody, setReferenceScale, setGlobalMeasureOffset]);

  return {
    melodies: memoizedMelodies,
    setters: memoizedSetters,
    randomizeAll,
    randomizeMeasure,
    generateChords,
    navigateHistory,
    historyIndex,
    historyLength: history.length,
    historyIndexRef,
    chordProgressionRef,
  };
};

export default useMelodyState;
