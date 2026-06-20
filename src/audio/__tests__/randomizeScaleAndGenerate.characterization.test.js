import { describe, it, expect } from 'vitest';
import Sequencer from '../Sequencer.js';
import Scale from '../../model/Scale.js';
import InstrumentSettings from '../../model/InstrumentSettings.js';
import ChordProgression from '../../model/ChordProgression.js';
import { TICKS_PER_WHOLE } from '../../constants/timing.js';
import { getNoteSemitone } from '../../theory/noteUtils.js';

/**
 * CHARACTERIZATION TEST — Sequencer.randomizeScaleAndGenerate() (Sequencer.js ~:1073)
 *
 * WHY THIS EXISTS (Phase-2 safety net): the audit (§4) flags this ~547-line method
 * as the "next-series builder" that Phase 2 wants to extract into a pure
 * generateNextSeries.js + transposeDisplayNotes() — and specifically calls out a
 * display-note transposition map that is DUPLICATED 3× (the treble/bass/fixed
 * branches). Extracting that map is exactly the change most likely to silently
 * regress, so we pin its observable contract here.
 *
 * WHAT WE ASSERT (RNG-stable structural invariants only — MelodyGenerator draws
 * from Math.random() with no injectable seed, same constraint the existing
 * generationPipeline.golden.test.js documents):
 *   1. The result object has the documented shape (treble/bass/percussion/
 *      chordProgression + generatedNumMeasures).
 *   2. Each generated track tiles exactly numMeasures (no over/underflow) — the
 *      same tiling proxy the golden test uses, here through the Sequencer's own
 *      _measureSpan-driven generatedNumMeasures.
 *   3. TRANSPOSE-WITHOUT-REGENERATE (randConfig.melody === false) path: every
 *      melodic display note is a valid note name AND its pitch class matches its
 *      audio note's pitch class — the load-bearing contract of the 3×-duplicated
 *      display-note map. A regression that mismapped display↔audio (the audit's
 *      worry) would break this enharmonic-equivalence check.
 *
 * WHY STABLE: no timers, no audio, no React. A single synchronous method call with
 * fully-populated refs. randomize flags are turned OFF (no scale/family/tonic/chord
 * randomization) so the run is deterministic in STRUCTURE — only the RNG-driven note
 * CHOICES vary, and we never assert exact notes. Each assertion loops many trials so
 * a structure that only fails for some seeds is still caught.
 */

const PERC_TOKENS = ['k', 'c', 'b', 'hh', 's', '/', 'r'];

/**
 * Build a Sequencer with everything randomizeScaleAndGenerate reads. randomize flags
 * default to all-false (transpose/keep), which is the stable path; callers override.
 */
function makeSequencer({ randomize = {}, currentMelodies = {} } = {}) {
  const scale = Scale.defaultScale();
  const refs = {
    scaleRef: { current: scale },
    chordProgressionRef: { current: ChordProgression.default?.() ?? new ChordProgression([], 'triad', 'modal-random', 'modal') },
    targetHarmonicDifficultyRef: { current: null },
    targetTrebleDifficultyRef: { current: null },
    targetBassDifficultyRef: { current: null },
    instrumentSettingsRef: {
      current: {
        treble: InstrumentSettings.defaultTrebleInstrumentSettings(),
        bass: InstrumentSettings.defaultBassInstrumentSettings(),
        percussion: InstrumentSettings.defaultPercussionInstrumentSettings(),
        chords: InstrumentSettings.defaultChordInstrumentSettings(),
        metronome: InstrumentSettings.defaultMetronomeInstrumentSettings(),
      },
    },
    melodiesRef: { current: {} },
    playbackConfigRef: {
      current: {
        randomize: { tonic: false, family: false, mode: false, chords: false, melody: true, ...randomize },
        oddRounds: { notes: true },
        chordComplexity: 'triad',
      },
    },
  };
  const seq = new Sequencer({
    setters: {
      // generateChords gates the chord-generation branch; setDisplayChordProgression is a sink.
      generateChords: true,
      setDisplayChordProgression: () => {},
    },
    refs,
    instruments: {},
    context: { currentTime: 0 },
    percussionScale: Scale.defaultPercussionScale(),
  });
  seq.refs.melodiesRef.current = currentMelodies;
  return { seq, scale };
}

const measureLengthTicks = (ts) => (TICKS_PER_WHOLE * ts[0]) / ts[1];

/** Sum of all non-null durations — the block-tiling proxy (see golden test). */
function durationSum(melody) {
  if (!melody?.durations) return 0;
  return melody.durations.filter(d => d != null).reduce((a, b) => a + b, 0);
}

describe('Sequencer.randomizeScaleAndGenerate — series shape (Phase-2 safety net)', () => {
  const TIME_SIGNATURES = [[4, 4], [3, 4], [7, 8]];
  const NUM_MEASURES = 2;
  const TRIALS = 25;

  for (const ts of TIME_SIGNATURES) {
    const tsLabel = `${ts[0]}/${ts[1]}`;
    const expectedTotal = measureLengthTicks(ts) * NUM_MEASURES;

    it(`${tsLabel}: result has the documented shape and each track tiles ${NUM_MEASURES} measures`, () => {
      for (let trial = 0; trial < TRIALS; trial++) {
        const { seq } = makeSequencer();
        let result;
        expect(() => {
          result = seq.randomizeScaleAndGenerate(NUM_MEASURES, ts, {});
        }, `threw for ${tsLabel} trial ${trial}`).not.toThrow();

        // Documented result shape.
        expect(result).toHaveProperty('treble');
        expect(result).toHaveProperty('bass');
        expect(result).toHaveProperty('percussion');
        expect(result).toHaveProperty('chordProgression');
        expect(result.generatedNumMeasures).toBeGreaterThan(0);

        // Each generated melodic/percussion track tiles the block exactly.
        for (const key of ['treble', 'bass', 'percussion']) {
          const mel = result[key];
          expect(mel, `${key} missing in ${tsLabel}`).toBeTruthy();
          expect(
            Math.abs(durationSum(mel) - expectedTotal),
            `${key} did not tile ${tsLabel} (sum ${durationSum(mel)} vs ${expectedTotal})`
          ).toBeLessThan(1e-6);
        }

        // generatedNumMeasures reflects the true content span (here == NUM_MEASURES
        // because every track is generated to fill the block).
        expect(result.generatedNumMeasures).toBe(NUM_MEASURES);
      }
    });
  }

  it('transpose-without-regenerate: display notes are enharmonically equal to their audio notes (the 3×-duplicated map contract)', () => {
    // randConfig.melody=false + a tonic change → the transpose branch runs and must
    // build a display-note array whose pitch classes match the audio notes. This is
    // the invariant the audit warns the 3×-duplicated display map could break.
    for (let trial = 0; trial < TRIALS; trial++) {
      // A simple 4/4 source treble: 4 quarter notes on scale degrees.
      const src = Scale.defaultScale();
      const sourceTreble = {
        notes: ['C4', 'E4', 'G4', 'C5'],
        durations: [12, 12, 12, 12],
        offsets: [0, 12, 24, 36],
        displayNotes: ['C4', 'E4', 'G4', 'C5'],
      };
      const sourceBass = {
        notes: ['C3', 'E3', 'G3', 'C4'],
        durations: [12, 12, 12, 12],
        offsets: [0, 12, 24, 36],
        displayNotes: ['C3', 'E3', 'G3', 'C4'],
      };

      const { seq } = makeSequencer({
        // tonic randomization ON so the scale actually changes → exercises transposition.
        randomize: { tonic: true, family: false, mode: false, chords: false, melody: false },
        currentMelodies: {},
      });
      void src;

      const result = seq.randomizeScaleAndGenerate(1, [4, 4], {
        treble: sourceTreble,
        bass: sourceBass,
        percussion: null,
      });

      for (const key of ['treble', 'bass']) {
        const mel = result[key];
        expect(mel, `${key} missing`).toBeTruthy();
        expect(mel.displayNotes, `${key} has no displayNotes`).toBeTruthy();
        expect(mel.displayNotes.length).toBe(mel.notes.length);

        for (let i = 0; i < mel.notes.length; i++) {
          const audio = mel.notes[i];
          const disp = mel.displayNotes[i];
          // Percussion tokens / rests pass through verbatim (the map's own guard).
          if (!audio || PERC_TOKENS.includes(audio)) {
            expect(disp).toBe(audio);
            continue;
          }
          // The display note must be a real note name and SOUND the same pitch
          // class as the audio note (enharmonic spellings allowed — that is the
          // whole point of the display map vs the audio note).
          expect(typeof disp).toBe('string');
          expect(
            getNoteSemitone(disp),
            `${key}[${i}] display ${disp} ≠ audio ${audio} pitch class`
          ).toBe(getNoteSemitone(audio));
        }
      }
    }
  });

  it('transpose path preserves rhythm exactly (durations + offsets copied, not regenerated)', () => {
    // When melody=false the rhythm of the source is carried verbatim — only pitches
    // are transposed. Pin this so an extraction that accidentally re-rhythmised the
    // transpose branch is caught.
    const sourceTreble = {
      notes: ['C4', 'D4', 'E4', 'F4'],
      durations: [6, 18, 12, 12],
      offsets: [0, 6, 24, 36],
      displayNotes: ['C4', 'D4', 'E4', 'F4'],
    };
    const { seq } = makeSequencer({
      randomize: { tonic: true, family: false, mode: false, chords: false, melody: false },
    });
    const result = seq.randomizeScaleAndGenerate(1, [4, 4], {
      treble: sourceTreble, bass: null, percussion: null,
    });
    expect(result.treble.durations).toEqual(sourceTreble.durations);
    expect(result.treble.offsets).toEqual(sourceTreble.offsets);
  });
});
