import { useState, useEffect, useCallback, useMemo } from 'react';
import Melody from '../model/Melody';
import MelodyGenerator from '../generation/melodyGenerator';
import { generateRankedRhythm } from '../generation/generateRankedRhythm';
import { generateDeterministicRhythm } from '../generation/rhythmicPriorities';
import { generateProgression, generateChordOnDegree } from '../theory/chordGenerator';
import { insertPassingChords } from '../generation/passingChords';
import ChordProgression from '../model/ChordProgression';
import { calculateRelativeRange, modulateMelody } from '../theory/musicUtils';
import { getRelativeNoteName } from '../theory/convertToDisplayNotes';

const useMelodyState = (
  numMeasures,
  timeSignature,
  scale,
  percussionScale,
  trebleSettings,
  bassSettings,
  percussionSettings,
  metronomeSettings,
  chordSettings, // New parameter
  chordComplexity,
  chordProgression, // Elevated as a stable input
  timeSignatureRef = null, // Optional: read latest TS inside randomizeAll to batch with state updates
  numMeasuresRef = null    // Optional: read latest numMeasures inside randomizeAll
) => {
  const [treble, setTreble] = useState(Melody.defaultTrebleMelody());
  const [bass, setBass] = useState(Melody.defaultBassMelody());
  const [percussion, setPercussion] = useState(Melody.defaultPercussionMelody());
  const [metronome, setMetronome] = useState(Melody.defaultMetronomeMelody());

  // Reference state for lossless modulation
  const [referenceMelody, setReferenceMelody] = useState(Melody.defaultTrebleMelody());
  const [referenceBassMelody, setReferenceBassMelody] = useState(Melody.defaultBassMelody());
  const [referenceScale, setReferenceScale] = useState(scale);

  // History system
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [globalMeasureOffset, setGlobalMeasureOffset] = useState(0);

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
      const passingMode = chordSettings?.passingChords ?? 'none';
      // When passing chords are enabled, exactly 1 structural chord per measure is
      // generated (placed near beat 1). insertPassingChords fills the remaining
      // chordCount-1 slots. Must match the `structuralCount = 1` rule used in the
      // randomizeAll branch below (line ~158) and in Sequencer.js — otherwise the
      // abstract progression pool length and the MelodyGenerator's slot count disagree,
      // which causes half the progression to be wasted or notePool reuse to double-count.
      const structuralCount = passingMode !== 'none' ? 1 : chordCount;
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
      console.error('  ✗ generateProgression threw:', e);
      try {
        const tonicChord = generateChordOnDegree(scale, 1, chordComplexity);
        return new ChordProgression([tonicChord], chordComplexity, 'fallback-tonic', 'modal');
      } catch (innerE) {
        console.error('  catch-fallback also failed:', innerE);
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

      // MelodyGenerator's downsampling logic assumes globalDenom=16 (see melodyGenerator.js:72).
      // The template must use 16th-note resolution so that MelodyGenerator's step calculation
      // (step = 16 / smallestNoteDenom) produces the right number of sampled slots.
      // Example for 4/4: measureSlots=16, smallestNoteDenom=4, step=4 → 4 sampled slots per
      // measure → chordCount=2 correctly places chords on beats 1 and 3.
      // Example for 5/8: measureSlots=10, smallestNoteDenom=8, step=2 → 5 sampled slots →
      // decomposeNumeratorToBeatGroups ranks slots 0 and 6 (beats 1 and 4) first.
      // NOTE: The 5/8 chord-distribution fix (C//C/ vs C///C) works via decomposeNumerator-
      // ToBeatGroups in rhythmicPriorities.js — it does NOT depend on this resolution value.
      const globalResolution = 16;
      const measureSlots = Math.round((globalResolution * activeTS[0]) / activeTS[1]);

      const globalTemplate = generateDeterministicRhythm(
        1,
        activeTS,
        measureSlots,
        'default',
        globalResolution
      );
      globalRhythmArray = globalTemplate;

      const notePool = abstractProgression?.chords || [];

      const chordCount = chordSettings?.chordCount || 1;
      const passingMode = chordSettings?.passingChords ?? 'none';
      // When passing chords are enabled, always use 1 structural chord per measure (placed near
      // beat 1 — the highest-ranked slot — by MelodyGenerator's rank+2×distance logic).
      // insertPassingChords then fills the remaining chordCount-1 slots with passing chords.
      // This ensures each measure always gets exactly ONE chord from the progression.
      const structuralCount = passingMode !== 'none' ? 1 : chordCount;

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
        globalRhythmArray
      );

      let chordMelody = chordGen.generateMelody();

      // Insert passing chords. chordCount is passed so insertPassingChords can derive
      // passingProbability internally via the same structuralCount halving formula.
      // firstChord is used for the wrap-around gap after the last structural chord.
      // rhythmVariability (0–100) modulates insertion stochasticity: 0 = deterministic.
      if (passingMode !== 'none') {
        const firstChord = chordMelody.displayNotes?.find(c => c !== null) ?? null;
        const passingVariability = chordSettings?.rhythmVariability ?? 100;
        chordMelody = insertPassingChords(chordMelody, scale, activeTS, chordSettings?.complexity || 'triad', passingMode, chordCount, firstChord, passingVariability);
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

    let newTreble;
    const isTrebleFixed = trebleSettings?.randomizationRule === 'fixed';

    if (isTrebleFixed && referenceMelody) {
      const modulatedNotes = modulateMelody(referenceMelody.notes, referenceScale, scale);
      const displayNotes = modulatedNotes.map(n => {
        if (!n || ['k', 'c', 'b', 'hh', 's', '/'].includes(n)) return n;
        const idx = scale.notes.indexOf(n);
        if (idx !== -1) return scale.displayNotes[idx];
        return getRelativeNoteName(n, scale.tonic);
      });
      newTreble = new Melody(modulatedNotes, referenceMelody.durations, referenceMelody.offsets, displayNotes);
    } else if (!canRandomizeMelody && treble) {
      newTreble = treble;
    } else {
      const effectiveRange = calculateRelativeRange('treble', trebleSettings?.rangeMode, scale.tonic) || trebleSettings?.range;
      newTreble = new MelodyGenerator(
        scale,
        activeNumMeasures,
        activeTS,
        trebleSettings,
        nextProgression,
        effectiveRange,
        runId,
        globalRhythmArray
      ).generateMelody();
    }

    let newBass;
    const isBassFixed = bassSettings?.randomizationRule === 'fixed';
    if (isBassFixed && referenceBassMelody) {
      const targetBassSc = scale.generateBassScale();
      const refBassSc = referenceScale.generateBassScale();
      const modulatedNotes = modulateMelody(referenceBassMelody.notes, refBassSc, targetBassSc);
      const displayNotes = modulatedNotes.map(n => {
        if (!n || ['k', 'c', 'b', 'hh', 's', '/'].includes(n)) return n;
        const idx = targetBassSc.notes.indexOf(n);
        if (idx !== -1) return targetBassSc.displayNotes[idx];
        return getRelativeNoteName(n, targetBassSc.tonic);
      });
      newBass = new Melody(modulatedNotes, referenceBassMelody.durations, referenceBassMelody.offsets, displayNotes);
    } else if (!canRandomizeMelody && bass) {
      newBass = bass;
    } else {
      const targetBassSc = scale.generateBassScale();
      const effectiveRange = calculateRelativeRange('bass', bassSettings?.rangeMode, scale.tonic) || bassSettings?.range;
      newBass = new MelodyGenerator(
        targetBassSc,
        activeNumMeasures,
        activeTS,
        bassSettings,
        nextProgression,
        effectiveRange,
        runId,
        globalRhythmArray
      ).generateMelody();
    }

    let newPercussion;
    const isPercFixed = percussionSettings?.randomizationRule === 'fixed';
    if (isPercFixed && percussion) {
      newPercussion = percussion;
    } else if (!canRandomizeMelody && percussion) {
      newPercussion = percussion;
    } else {
      newPercussion = new MelodyGenerator(
        percussionScale,
        activeNumMeasures,
        activeTS,
        percussionSettings,
        nextProgression,
        null,
        runId,
        globalRhythmArray
      ).generateMelody();
    }

    const metronomeGenSettings = {
      notesPerMeasure: Math.ceil((activeTS[0] / activeTS[1]) * (metronomeSettings?.smallestNoteDenom || 4)),
      smallestNoteDenom: metronomeSettings?.smallestNoteDenom || 4,
      rhythmVariability: 0,
      enableTriplets: false,
      notePool: 'metronome',
      playStyle: 'metronome',
      type: 'metronome',
      randomizationRule: 'uniform'
    };

    const metronomeGen = new MelodyGenerator(
      null,
      activeNumMeasures,
      activeTS,
      metronomeGenSettings,
      null,
      null,
      runId,
      globalRhythmArray
    );

    const newMetronome = metronomeGen.generateMelody();
    setMetronome(newMetronome);

    setTreble(newTreble);
    setBass(newBass);
    setPercussion(newPercussion);

    const nextRefTreble = isTrebleFixed ? referenceMelody : newTreble;
    const nextRefBass = isBassFixed ? referenceBassMelody : newBass;

    setReferenceMelody(nextRefTreble);
    setReferenceBassMelody(nextRefBass);
    setReferenceScale(scale);

    const historyEntry = {
      treble: newTreble,
      bass: newBass,
      percussion: newPercussion,
      chordProgression: nextProgression,
      referenceMelody: nextRefTreble,
      referenceBassMelody: nextRefBass,
      referenceScale: scale,
      scale, // Store full scale object for restoration
      trebleSettings: { ...trebleSettings },
      bassSettings: { ...bassSettings },
    };

    setHistory(prev => {
      const newHistory = [...prev.slice(0, historyIndex + 1), historyEntry];
      setHistoryIndex(newHistory.length - 1);
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

  const navigateHistory = useCallback((direction) => {
    if (direction === 'back') {
      if (historyIndex > 0) {
        const prevIndex = historyIndex - 1;
        const entry = history[prevIndex];
        setTreble(entry.treble);
        setBass(entry.bass);
        setPercussion(entry.percussion);
        setMetronome(Melody.updateMetronome(timeSignature, numMeasures, metronomeSettings?.smallestNoteDenom || 4));
        setReferenceMelody(entry.referenceMelody);
        setReferenceBassMelody(entry.referenceBassMelody);
        setReferenceScale(entry.referenceScale);
        setHistoryIndex(prevIndex);
        // Calculate offset based on previous melodies
        const newOffset = globalMeasureOffset + numMeasures;
        setGlobalMeasureOffset(newOffset);
        return { ...entry, globalMeasureOffset: newOffset };
      }
    } else if (direction === 'forward') {
      if (historyIndex < history.length - 1) {
        const nextIdx = historyIndex + 1;
        const entry = history[nextIdx];
        setTreble(entry.treble);
        setBass(entry.bass);
        setPercussion(entry.percussion);
        setMetronome(Melody.updateMetronome(timeSignature, numMeasures, metronomeSettings?.smallestNoteDenom || 4));
        setReferenceMelody(entry.referenceMelody);
        setReferenceBassMelody(entry.referenceBassMelody);
        setReferenceScale(entry.referenceScale);
        setHistoryIndex(nextIdx);
        const newOffset = globalMeasureOffset + numMeasures;
        setGlobalMeasureOffset(newOffset);
        return { ...entry, globalMeasureOffset: newOffset };
      } else {
        // Skip forward generates new
        const newOffset = globalMeasureOffset + numMeasures;
        setGlobalMeasureOffset(newOffset);
        const newMelody = randomizeAll(null);
        return { ...newMelody, globalMeasureOffset: newOffset };
      }
    }
    return null;
  }, [history, historyIndex, timeSignature, numMeasures, metronomeSettings, randomizeAll, globalMeasureOffset]);

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
    setReferenceMelody,
    setReferenceBassMelody,
    setReferenceScale,
    setGlobalMeasureOffset,
  }), [setTreble, setBass, setPercussion, setMetronome, setReferenceMelody, setReferenceBassMelody, setReferenceScale, setGlobalMeasureOffset]);

  return {
    melodies: memoizedMelodies,
    setters: memoizedSetters,
    randomizeAll,
    randomizeMeasure,
    generateChords,
    navigateHistory,
    historyIndex,
    historyLength: history.length,
  };
};

export default useMelodyState;
