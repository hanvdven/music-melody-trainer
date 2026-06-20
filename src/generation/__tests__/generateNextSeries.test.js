import { describe, it, expect } from 'vitest';
import { generateNextSeries } from '../generateNextSeries.js';
import Scale from '../../model/Scale.js';
import InstrumentSettings from '../../model/InstrumentSettings.js';
import { generateDeterministicRhythm } from '../rhythmicPriorities.js';
import { TICKS_PER_WHOLE } from '../../constants/timing.js';
import { getNoteSemitone } from '../../theory/noteUtils.js';
import { updateScaleWithTonic } from '../../theory/scaleHandler.js';

/**
 * Unit test for the PURE generateNextSeries() module extracted from
 * Sequencer.randomizeScaleAndGenerate (Han 2026-06-19, ARCHITECTURE_AUDIT §4).
 *
 * Mirrors the golden test's stance (MelodyGenerator draws from Math.random() with no
 * injectable seed): assert only RNG-stable STRUCTURAL invariants —
 *   1. full-regeneration path: each track tiles exactly numMeasures, no instrument is
 *      special-cased (all three tracks share the same tiling contract),
 *   2. transpose-without-regenerate path: rhythm is copied verbatim and display notes are
 *      enharmonically equal to their audio notes.
 */

const GLOBAL_RESOLUTION = 16;
const measureLengthTicks = (ts) => (TICKS_PER_WHOLE * ts[0]) / ts[1];

function durationSum(melody) {
  if (!melody?.durations) return 0;
  return melody.durations.filter((d) => d != null).reduce((a, b) => a + b, 0);
}

function makeGlobalTemplate(timeSignature) {
  const measureSlots = (GLOBAL_RESOLUTION * timeSignature[0]) / timeSignature[1];
  return generateDeterministicRhythm(1, timeSignature, measureSlots, 'default', GLOBAL_RESOLUTION);
}

/** Build the full-regeneration arg bundle (randConfig.melody !== false). */
function regenArgs(numMeasures, timeSignature) {
  const scale = Scale.defaultScale();
  return {
    activeScale: scale,
    oldTonic: scale.tonic,
    oldMode: scale.name,
    oldFamily: scale.family,
    oldScaleNotes: scale.notes,
    oldDisplayScale: scale.displayNotes,
    numMeasures,
    timeSignature,
    chordProgression: null,
    globalTemplate: makeGlobalTemplate(timeSignature),
    randConfig: { melody: true },
    currentMelodies: {},
    instrumentSettings: {
      treble: InstrumentSettings.defaultTrebleInstrumentSettings(),
      bass: InstrumentSettings.defaultBassInstrumentSettings(),
      percussion: InstrumentSettings.defaultPercussionInstrumentSettings(),
      chords: InstrumentSettings.defaultChordInstrumentSettings(),
      metronome: InstrumentSettings.defaultMetronomeInstrumentSettings(),
    },
    currentMelodyContext: {},
    targetTrebleDifficulty: null,
    targetBassDifficulty: null,
    percussionScale: Scale.defaultPercussionScale(),
  };
}

describe('generateNextSeries — full-regeneration path', () => {
  const TIME_SIGNATURES = [[4, 4], [5, 4], [7, 8]];
  const NUM_MEASURES = 2;
  const TRIALS = 20;

  for (const ts of TIME_SIGNATURES) {
    const tsLabel = `${ts[0]}/${ts[1]}`;
    const expectedTotal = measureLengthTicks(ts) * NUM_MEASURES;

    it(`${tsLabel}: produces all three tracks, each tiling ${NUM_MEASURES} measures (no instrument special-casing)`, () => {
      for (let trial = 0; trial < TRIALS; trial++) {
        let result;
        expect(() => {
          result = generateNextSeries(regenArgs(NUM_MEASURES, ts));
        }, `threw for ${tsLabel} trial ${trial}`).not.toThrow();

        // All three tracks present.
        for (const key of ['treble', 'bass', 'percussion']) {
          const mel = result[key];
          expect(mel, `${key} missing in ${tsLabel}`).toBeTruthy();
          // Same tiling contract for every instrument — the §6b "identical pipeline" proxy.
          expect(
            Math.abs(durationSum(mel) - expectedTotal),
            `${key} did not tile ${tsLabel} (sum ${durationSum(mel)} vs ${expectedTotal})`
          ).toBeLessThan(1e-6);
        }
      }
    });
  }

  it('does not surface trebleSettings/bassSettings when no difficulty target is active', () => {
    const result = generateNextSeries(regenArgs(NUM_MEASURES, [4, 4]));
    expect(result.trebleSettings).toBeUndefined();
    expect(result.bassSettings).toBeUndefined();
  });
});

describe('generateNextSeries — transpose-without-regenerate path', () => {
  function transposeArgs(currentMelodies) {
    const scale = Scale.defaultScale();
    // A DIFFERENT new scale (same mode/family, different tonic) so transposition runs.
    const newScale = updateScaleWithTonic({
      currentScale: scale,
      newTonic: 'G4',
      rangeUp: scale.rangeUp,
      rangeDown: scale.rangeDown,
    });
    return {
      activeScale: newScale,
      oldTonic: scale.tonic,
      oldMode: scale.name,
      oldFamily: scale.family,
      oldScaleNotes: scale.notes,
      oldDisplayScale: scale.displayNotes,
      numMeasures: 1,
      timeSignature: [4, 4],
      chordProgression: null,
      globalTemplate: makeGlobalTemplate([4, 4]),
      randConfig: { melody: false },
      currentMelodies,
      instrumentSettings: {
        treble: InstrumentSettings.defaultTrebleInstrumentSettings(),
        bass: InstrumentSettings.defaultBassInstrumentSettings(),
        percussion: InstrumentSettings.defaultPercussionInstrumentSettings(),
        chords: InstrumentSettings.defaultChordInstrumentSettings(),
        metronome: InstrumentSettings.defaultMetronomeInstrumentSettings(),
      },
      currentMelodyContext: {},
      targetTrebleDifficulty: null,
      targetBassDifficulty: null,
      percussionScale: Scale.defaultPercussionScale(),
    };
  }

  it('copies the source rhythm verbatim (durations + offsets) and keeps display enharmonically equal to audio', () => {
    const sourceTreble = {
      notes: ['C4', 'D4', 'E4', 'F4'],
      durations: [6, 18, 12, 12],
      offsets: [0, 6, 24, 36],
      displayNotes: ['C4', 'D4', 'E4', 'F4'],
    };
    const result = generateNextSeries(transposeArgs({ treble: sourceTreble, bass: null, percussion: null }));

    expect(result.treble).toBeTruthy();
    // Rhythm copied verbatim — not regenerated.
    expect(result.treble.durations).toEqual(sourceTreble.durations);
    expect(result.treble.offsets).toEqual(sourceTreble.offsets);
    // Display notes index-parallel and enharmonically equal to audio notes.
    expect(result.treble.displayNotes.length).toBe(result.treble.notes.length);
    for (let i = 0; i < result.treble.notes.length; i++) {
      const audio = result.treble.notes[i];
      const disp = result.treble.displayNotes[i];
      if (!audio) {
        expect(disp).toBe(audio);
        continue;
      }
      expect(getNoteSemitone(disp)).toBe(getNoteSemitone(audio));
    }
  });

  it('passes percussion through unchanged and yields null tracks for absent sources', () => {
    const perc = { notes: ['k', 'hh'], durations: [24, 24], offsets: [0, 24], displayNotes: ['k', 'hh'] };
    const result = generateNextSeries(transposeArgs({ treble: null, bass: null, percussion: perc }));
    expect(result.treble).toBeNull();
    expect(result.bass).toBeNull();
    expect(result.percussion).toBe(perc);
  });
});
