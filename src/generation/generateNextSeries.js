import Melody from '../model/Melody';
import MelodyGenerator from './melodyGenerator';
import {
  transposeMelodyToScale,
  transposeMelodyBySemitones,
  getNoteIndex,
  modulateMelody,
  calculateRelativeRange,
} from '../theory/musicUtils';
import { getMelodyAtDifficulty } from '../utils/melodyDifficultyTable';
import { PRESET_RANGES } from '../constants/musicLayout';
import { transposeDisplayNotes } from '../audio/transposeDisplayNotes';

/**
 * generateNextSeries — PURE "melodies + rhythmic chords → next series of track Melodies".
 *
 * WHY THIS EXISTS (Han 2026-06-19, ARCHITECTURE_AUDIT §4): the §8 boundary says the audio
 * `Sequencer` owns SCHEDULING, not GENERATION. `Sequencer.randomizeScaleAndGenerate` mixed
 * scale-derivation, chord-transposition, melody-construction and `this`-ref/setter side
 * effects in one ~547-line method. This module pulls out the largest CLEANLY-PURE chunk: the
 * per-track (treble / bass / percussion) melody construction — the body of the old
 * `if (randConfig.melody === false) { … } else { … }` branch (Sequencer.js ~:1370-1591).
 *
 * It is pure: it reads NOTHING off `this` and applies NO setters. Everything it needs (the
 * already-resolved scale, the old-scale snapshot, the rhythmic chord progression, the
 * instrument-settings snapshot, the difficulty targets, the percussion scale, the source
 * melodies for the transpose/fixed paths) is passed in as arguments. The ref-reads,
 * setter side effects, scale randomization and `_measureSpan`/`generatedNumMeasures`
 * computation stay in the Sequencer orchestrator.
 *
 * The melody-generation pipeline invariant (architecture §3 / CLAUDE §6b) is preserved:
 * NO per-instrument special-casing of the pipeline — variation is expressed only through
 * the per-track `InstrumentSettings` passed in. The three tracks differ only in which scale
 * (treble vs bass-scale vs percussion) and which settings object they receive.
 *
 * @param {object} args
 * @param {object} args.activeScale       - the resolved (possibly re-tonic'd/re-mode'd) Scale.
 * @param {string} args.oldTonic          - tonic BEFORE this tick's scale randomization.
 * @param {string} args.oldMode           - scale name (mode) BEFORE randomization.
 * @param {string} args.oldFamily         - scale family BEFORE randomization.
 * @param {string[]} args.oldScaleNotes   - `activeScale.notes` BEFORE randomization.
 * @param {string[]} args.oldDisplayScale - `activeScale.displayNotes` BEFORE randomization.
 * @param {number} args.numMeasures
 * @param {[number,number]} args.timeSignature
 * @param {object} args.chordProgression  - the rhythmic chord Melody (context for generation).
 * @param {object} args.globalTemplate    - the global rhythm template (cross-instrument sync).
 * @param {object} args.randConfig        - playbackConfig.randomize snapshot (`melody` flag etc.).
 * @param {object} args.currentMelodies   - per-track source melodies for the transpose path.
 * @param {object} args.instrumentSettings- snapshot of instrumentSettingsRef.current.
 * @param {object} args.currentMelodyContext - snapshot of melodiesRef.current (referenceMelody,
 *   referenceBassMelody, referenceScale) for the 'fixed' randomizationRule path.
 * @param {number|null} args.targetTrebleDifficulty - targetTrebleDifficultyRef.current snapshot.
 * @param {number|null} args.targetBassDifficulty   - targetBassDifficultyRef.current snapshot.
 * @param {object} args.percussionScale   - the Sequencer's percussion scale.
 * @returns {{ treble, bass, percussion, trebleSettings?, bassSettings? }} per-track Melodies
 *   plus (only when a difficulty target overrode them) the effective settings used.
 */
export function generateNextSeries(args) {
  const {
    activeScale,
    oldTonic,
    oldMode,
    oldFamily,
    oldScaleNotes,
    oldDisplayScale,
    numMeasures,
    timeSignature,
    chordProgression,
    globalTemplate,
    randConfig,
    currentMelodies,
    instrumentSettings,
    currentMelodyContext,
    targetTrebleDifficulty,
    targetBassDifficulty,
    percussionScale,
  } = args;

  const out = { treble: null, bass: null, percussion: null };

  let newTreble, newBass, newPercussion;

  if (randConfig.melody === false) {
    // Determine if only tonic changed (same mode and family)
    const onlyTonicChanged =
      activeScale.name === oldMode &&
      activeScale.family === oldFamily &&
      activeScale.tonic !== oldTonic;

    // Transpose
    if (currentMelodies.treble) {
      let transposedNotes, transposedDisplay;

      if (onlyTonicChanged) {
        const semitoneDiff = getNoteIndex(activeScale.tonic) - getNoteIndex(oldTonic);
        transposedNotes = transposeMelodyBySemitones(currentMelodies.treble.notes, semitoneDiff);
        // Display-note map extracted to transposeDisplayNotes() — was duplicated 4× (Han 2026-06-19).
        transposedDisplay = transposeDisplayNotes(
          transposedNotes,
          activeScale.notes,
          activeScale.displayNotes,
          activeScale.tonic
        );
      } else {
        transposedNotes = transposeMelodyToScale(
          currentMelodies.treble.notes,
          oldScaleNotes,
          activeScale.notes
        );
        const currentDisplay = currentMelodies.treble.displayNotes || currentMelodies.treble.notes;
        transposedDisplay = transposeMelodyToScale(
          currentDisplay,
          oldDisplayScale,
          activeScale.displayNotes
        );
      }

      newTreble = new Melody(
        transposedNotes,
        currentMelodies.treble.durations,
        currentMelodies.treble.offsets,
        transposedDisplay
      );
    } else {
      newTreble = null;
    }

    if (currentMelodies.bass) {
      const lowerOctave = (note) => {
        const match = note.match(/([^0-9]+)(\d+)/);
        if (!match) return note;
        return match[1] + (parseInt(match[2]) - 1);
      };

      let transposedNotes, transposedDisplay;

      if (onlyTonicChanged) {
        const semitoneDiff = getNoteIndex(activeScale.tonic) - getNoteIndex(oldTonic);
        transposedNotes = transposeMelodyBySemitones(currentMelodies.bass.notes, semitoneDiff);
        const bassDisplayScale = activeScale.displayNotes.map(lowerOctave);
        const bassNotes = activeScale.notes.map(lowerOctave);
        const bassTonic = lowerOctave(activeScale.tonic);

        // Display-note map extracted to transposeDisplayNotes() — was duplicated 4× (Han 2026-06-19).
        transposedDisplay = transposeDisplayNotes(
          transposedNotes,
          bassNotes,
          bassDisplayScale,
          bassTonic
        );
      } else {
        const oldBassNotes = oldScaleNotes.map(lowerOctave);
        const oldBassDisplay = oldDisplayScale.map(lowerOctave);
        const newBassNotes = activeScale.notes.map(lowerOctave);
        const newBassDisplay = activeScale.displayNotes.map(lowerOctave);
        transposedNotes = transposeMelodyToScale(
          currentMelodies.bass.notes,
          oldBassNotes,
          newBassNotes
        );
        const currentDisplay = currentMelodies.bass.displayNotes || currentMelodies.bass.notes;
        transposedDisplay = transposeMelodyToScale(
          currentDisplay,
          oldBassDisplay,
          newBassDisplay
        );
      }

      newBass = new Melody(
        transposedNotes,
        currentMelodies.bass.durations,
        currentMelodies.bass.offsets,
        transposedDisplay
      );
    } else {
      newBass = null;
    }
    newPercussion = currentMelodies.percussion;
    out.treble = newTreble;
    out.bass = newBass;
    out.percussion = newPercussion;
  } else {
    const refScale = currentMelodyContext.referenceScale || activeScale;

    // ── Treble difficulty-driven settings override ───────────────────────
    const targetMelodyDifficulty = targetTrebleDifficulty;
    let effectiveTrebleSettings = instrumentSettings.treble;
    if (targetMelodyDifficulty != null) {
      const melodyEntry = getMelodyAtDifficulty(targetMelodyDifficulty, 0.5);
      if (melodyEntry) {
        const clefKey = instrumentSettings.treble?.preferredClef === 'bass' ? 'bass' : 'treble';
        const presetRange = PRESET_RANGES[melodyEntry.rangeMode]?.[clefKey];
        effectiveTrebleSettings = {
          ...instrumentSettings.treble,
          notesPerMeasure: melodyEntry.notesPerMeasure,
          smallestNoteDenom: melodyEntry.smallestNoteDenom,
          rhythmVariability: melodyEntry.rhythmVariability,
          notePool: melodyEntry.notePool,
          randomizationRule: melodyEntry.randomizationRule,
          rangeMode: melodyEntry.rangeMode,
          ...(presetRange ? { range: presetRange } : {}),
        };
        out.trebleSettings = effectiveTrebleSettings;
      }
    }

    // ── Bass difficulty-driven settings override ──────────────────────────
    const targetBassDiff = targetBassDifficulty;
    let effectiveBassSettings = instrumentSettings.bass;
    if (targetBassDiff != null) {
      const bassEntry = getMelodyAtDifficulty(targetBassDiff, 0.5);
      if (bassEntry) {
        const presetRange = PRESET_RANGES[bassEntry.rangeMode]?.['bass'];
        effectiveBassSettings = {
          ...instrumentSettings.bass,
          notesPerMeasure: bassEntry.notesPerMeasure,
          smallestNoteDenom: bassEntry.smallestNoteDenom,
          rhythmVariability: bassEntry.rhythmVariability,
          notePool: bassEntry.notePool,
          randomizationRule: bassEntry.randomizationRule,
          rangeMode: bassEntry.rangeMode,
          ...(presetRange ? { range: presetRange } : {}),
        };
        out.bassSettings = effectiveBassSettings;
      }
    }

    // If tonic changed (due to randomization above), recalculate relative ranges so melody
    // generation uses the correct range for the NEW tonic — not the stale range from the ref.
    const newTrebleRelRange = calculateRelativeRange('treble', effectiveTrebleSettings.rangeMode, activeScale.tonic);
    if (newTrebleRelRange) effectiveTrebleSettings = { ...effectiveTrebleSettings, range: newTrebleRelRange };
    const newBassRelRange = calculateRelativeRange('bass', effectiveBassSettings.rangeMode, activeScale.tonic);
    if (newBassRelRange) effectiveBassSettings = { ...effectiveBassSettings, range: newBassRelRange };

    // Treble
    if (effectiveTrebleSettings.randomizationRule === 'fixed' && currentMelodyContext.referenceMelody) {
      // ... fixed logic ... (omitted matching for brevity, keeping existing)
      const modulatedNotes = modulateMelody(currentMelodyContext.referenceMelody.notes, refScale, activeScale);
      // Display-note map extracted to transposeDisplayNotes() — was duplicated 4× (Han 2026-06-19).
      const displayNotes = transposeDisplayNotes(
        modulatedNotes,
        activeScale.notes,
        activeScale.displayNotes,
        activeScale.tonic
      );
      newTreble = new Melody(modulatedNotes, currentMelodyContext.referenceMelody.durations, currentMelodyContext.referenceMelody.offsets, displayNotes);
    } else {
      newTreble = new MelodyGenerator(
        activeScale,
        numMeasures,
        timeSignature,
        effectiveTrebleSettings,
        chordProgression, // PASS THE FULL MELODY OBJECT
        effectiveTrebleSettings.range,
        Date.now(),
        globalTemplate // Pass Global Rhythm!
      ).generateMelody();
    }

    // Bass
    if (effectiveBassSettings.randomizationRule === 'fixed' && currentMelodyContext.referenceBassMelody) {
      // ... fixed logic ...
      const targetBassSc = activeScale.generateBassScale();
      const refBassSc = refScale.generateBassScale();
      const modulatedNotes = modulateMelody(currentMelodyContext.referenceBassMelody.notes, refBassSc, targetBassSc);
      // Display-note map extracted to transposeDisplayNotes() — was duplicated 4× (Han 2026-06-19).
      const displayNotes = transposeDisplayNotes(
        modulatedNotes,
        targetBassSc.notes,
        targetBassSc.displayNotes,
        targetBassSc.tonic
      );
      newBass = new Melody(modulatedNotes, currentMelodyContext.referenceBassMelody.durations, currentMelodyContext.referenceBassMelody.offsets, displayNotes);
    } else {
      newBass = new MelodyGenerator(
        activeScale.generateBassScale(),
        numMeasures,
        timeSignature,
        effectiveBassSettings,
        chordProgression, // PASS THE FULL MELODY OBJECT
        effectiveBassSettings.range,
        Date.now(),
        globalTemplate // Pass Global Rhythm!
      ).generateMelody();
    }

    // Percussion
    if (instrumentSettings.percussion.randomizationRule === 'fixed' && currentMelodies.percussion) {
      newPercussion = currentMelodies.percussion;
    } else {
      newPercussion = new MelodyGenerator(
        percussionScale,
        numMeasures,
        timeSignature,
        instrumentSettings.percussion,
        chordProgression, // PASS THE FULL MELODY OBJECT
        null,
        Date.now(),
        globalTemplate // Pass Global Rhythm!
      ).generateMelody();
    }

    out.treble = newTreble;
    out.bass = newBass;
    out.percussion = newPercussion;
  }

  return out;
}
