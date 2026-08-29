import { describe, it, expect } from 'vitest';
import { generateBlock } from '../generateBlock.js';
import { collapseToCallRests } from '../generateLevel9CallResponseBlock.js';
import Scale from '../../model/Scale.js';
import InstrumentSettings from '../../model/InstrumentSettings.js';
import { TICKS_PER_WHOLE } from '../../constants/timing.js';

/**
 * Unit test for the PURE generateBlock() module — the ONE shared "generate one
 * block" entry point (#1164 / #1163a). Mirrors the golden/characterization
 * tests' stance: MelodyGenerator draws from Math.random() with no injectable
 * seed, so only RNG-stable STRUCTURAL invariants are asserted for generated
 * material; deterministic paths (fixed reference, 'song' modulo, call-response
 * over a known source) are asserted exactly.
 *
 * The three golden tests (generationPipeline.golden / quarterGrid.golden /
 * generateNextSeries) are deliberately NOT touched — they guard that the plain
 * pipeline (which generateBlock now wraps) is byte-identical.
 */

const measureLengthTicks = (ts) => (TICKS_PER_WHOLE * ts[0]) / ts[1];

function durationSum(melody) {
  if (!melody?.durations) return 0;
  return melody.durations.filter((d) => d != null).reduce((a, b) => a + b, 0);
}

/** The seriesArgs bundle the Sequencer builds — full-regeneration flavour. */
function makeSeriesArgs(overrides = {}) {
  const scale = Scale.defaultScale();
  return {
    oldTonic: scale.tonic,
    oldMode: scale.name,
    oldFamily: scale.family,
    oldScaleNotes: scale.notes,
    oldDisplayScale: scale.displayNotes,
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
    ...overrides,
  };
}

describe('generateBlock — plain generate (the Sequencer path)', () => {
  const TIME_SIGNATURES = [[4, 4], [7, 8]]; // even + odd meter
  const NUM_MEASURES = 2;
  const TRIALS = 15;

  for (const ts of TIME_SIGNATURES) {
    const tsLabel = `${ts[0]}/${ts[1]}`;
    const expectedTotal = measureLengthTicks(ts) * NUM_MEASURES;

    it(`${tsLabel}: builds treble/bass/percussion, each tiling ${NUM_MEASURES} measures`, () => {
      for (let trial = 0; trial < TRIALS; trial++) {
        let block;
        expect(() => {
          block = generateBlock({
            activeScale: Scale.defaultScale(),
            timeSignature: ts,
            numMeasures: NUM_MEASURES,
            chordProgression: null,
            seriesArgs: makeSeriesArgs(),
          });
        }, `threw for ${tsLabel} trial ${trial}`).not.toThrow();

        for (const key of ['treble', 'bass', 'percussion']) {
          expect(block[key], `${key} missing`).toBeTruthy();
          expect(
            Math.abs(durationSum(block[key]) - expectedTotal),
            `${key} did not tile ${tsLabel}`
          ).toBeLessThan(1e-6);
        }
        // A shared rhythm grid is always produced.
        expect(Array.isArray(block.globalTemplate)).toBe(true);
        expect(block.globalTemplate.length).toBeGreaterThan(0);
      }
    });
  }

  it('turns an abstract chord progression into a rhythmic chord track (.notes string[][], .displayNotes present)', () => {
    const scale = Scale.defaultScale();
    const triad = {
      root: scale.notes[0],
      notes: [scale.notes[0], scale.notes[2], scale.notes[4]],
    };
    const abstractProgression = {
      chords: [triad, triad],
      type: 'tonic-tonic-tonic',
      complexity: 'triad',
      modality: 'modal',
    };
    const block = generateBlock({
      activeScale: scale,
      timeSignature: [4, 4],
      numMeasures: 2,
      chordProgression: abstractProgression,
      seriesArgs: makeSeriesArgs(),
    });
    expect(block.chordProgression).toBeTruthy();
    expect(block.chords).toBe(block.chordProgression); // documented alias
    expect(Array.isArray(block.chordProgression.notes)).toBe(true);
    expect(block.chordProgression.notes.length).toBeGreaterThan(0);
    // rhythmic chord track carries the progression metadata forward
    expect(block.chordProgression.type).toBe('tonic-tonic-tonic');
    expect(block.chordProgression.complexity).toBe('triad');
  });
});

describe("generateBlock — per-track 'fixed' with a reference melody (slice/reuse)", () => {
  it('copies the reference rhythm verbatim (durations + offsets) instead of generating', () => {
    const scale = Scale.defaultScale();
    const referenceMelody = {
      notes: ['C4', 'E4', 'G4', 'C5'],
      durations: [12, 12, 12, 12],
      offsets: [0, 12, 24, 36],
      displayNotes: ['C4', 'E4', 'G4', 'C5'],
    };
    const seriesArgs = makeSeriesArgs({
      currentMelodyContext: { referenceMelody },
    });
    seriesArgs.instrumentSettings.treble.randomizationRule = 'fixed';

    const block = generateBlock({
      activeScale: scale,
      timeSignature: [4, 4],
      numMeasures: 1,
      chordProgression: null,
      seriesArgs,
    });

    expect(block.treble).toBeTruthy();
    expect(block.treble.durations).toEqual(referenceMelody.durations);
    expect(block.treble.offsets).toEqual(referenceMelody.offsets);
    // No ostinato cache is emitted for a track that HAS a reference.
    expect(block.fixedOstinato.treble).toBeUndefined();
  });
});

describe("generateBlock — per-track 'fixed' with NO reference (ostinato across blocks)", () => {
  it('block 0 generates a chunk; blocks 1+ replay it verbatim on every track', () => {
    const ts = [4, 4];
    const mk = (fixedOstinato) => {
      const seriesArgs = makeSeriesArgs();
      seriesArgs.instrumentSettings.treble.randomizationRule = 'fixed';
      seriesArgs.instrumentSettings.bass.randomizationRule = 'fixed';
      seriesArgs.instrumentSettings.percussion.randomizationRule = 'fixed';
      return generateBlock({
        activeScale: Scale.defaultScale(),
        timeSignature: ts,
        numMeasures: 2,
        chordProgression: null,
        seriesArgs,
        fixedOstinato,
      });
    };

    const block0 = mk(null);
    const block1 = mk(block0.fixedOstinato);
    const block2 = mk(block0.fixedOstinato);

    for (const key of ['treble', 'bass', 'percussion']) {
      expect(block0.fixedOstinato[key], `${key} not captured on block 0`).toBeTruthy();
      // Blocks 1 and 2 are note-for-note the same as block 0 — the ostinato.
      expect(block1[key].notes).toEqual(block0[key].notes);
      expect(block1[key].durations).toEqual(block0[key].durations);
      expect(block1[key].offsets).toEqual(block0[key].offsets);
      expect(block2[key].notes).toEqual(block0[key].notes);
      expect(block2[key].durations).toEqual(block0[key].durations);
      expect(block2[key].offsets).toEqual(block0[key].offsets);
      // Cloned, not the same reference — a consumer mutating a block can't poison the cache.
      expect(block1[key]).not.toBe(block0[key]);
      expect(block1[key].notes).not.toBe(block0[key].notes);
    }
  });
});

describe("generateBlock — 'song' chord strategy (per-measure modulo follow)", () => {
  it('wraps past songMeasureCount, picking the right song measure per block measure', () => {
    const ts = [4, 4];
    const mlt = measureLengthTicks(ts); // 48
    // 4-measure song, one chord per measure.
    const songChords = {
      notes: [['C4'], ['D4'], ['E4'], ['F4']],
      durations: [mlt, mlt, mlt, mlt],
      offsets: [0, mlt, 2 * mlt, 3 * mlt],
      displayNotes: ['C', 'D', 'E', 'F'],
      type: 'song',
      complexity: 'triad',
      modality: 'modal',
    };

    const block = generateBlock({
      activeScale: Scale.defaultScale(),
      timeSignature: ts,
      numMeasures: 2,
      chordProgression: null,
      chordStrategy: 'song',
      songChords,
      songMeasureCount: 4,
      blockStartMeasure: 3, // measure 3 → song[3]='F', measure 4 wraps → song[0]='C'
      seriesArgs: makeSeriesArgs(),
    });

    expect(block.chordProgression.notes).toEqual([['F4'], ['C4']]);
    expect(block.chordProgression.offsets).toEqual([0, mlt]);
    expect(block.chordProgression.displayNotes).toEqual(['F', 'C']);
    expect(block.chordProgression.type).toBe('song');
  });
});

describe('generateBlock — shape:"call-response" post-transform', () => {
  const ts = [4, 4];
  const mlt = measureLengthTicks(ts);

  it('over a FIXED (known) source reproduces the sliceSongCallResponseBlock shape exactly', () => {
    // A deterministic 1-measure source: 4 quarter notes.
    const referenceMelody = {
      notes: ['C4', 'D4', 'E4', 'F4'],
      durations: [12, 12, 12, 12],
      offsets: [0, 12, 24, 36],
      displayNotes: ['C4', 'D4', 'E4', 'F4'],
    };
    const seriesArgs = makeSeriesArgs({ currentMelodyContext: { referenceMelody } });
    seriesArgs.instrumentSettings.treble.randomizationRule = 'fixed';

    const block = generateBlock({
      activeScale: Scale.defaultScale(),
      timeSignature: ts,
      numMeasures: 1,
      chordProgression: null,
      seriesArgs,
      shape: 'call-response',
      groupMeasures: 1,
    });

    // Independently build the expected call+response arrays the same way
    // sliceSongCallResponseBlock / generateLevel9CallResponseBlock do.
    const call = collapseToCallRests(
      referenceMelody.notes,
      referenceMelody.durations,
      referenceMelody.offsets,
      referenceMelody.displayNotes,
      mlt
    );
    const responseOffsets = referenceMelody.offsets.map((o) => o + mlt);

    expect(block.treble.notes).toEqual([...call.notes, ...referenceMelody.notes]);
    expect(block.treble.durations).toEqual([...call.durations, ...referenceMelody.durations]);
    expect(block.treble.offsets).toEqual([...call.offsets, ...responseOffsets]);
    // Call half is one whole-rest at the measure downbeat.
    expect(call.notes[0]).toBe('r');
    expect(call.offsets[0]).toBe(0);
    expect(call.durations[0]).toBe(mlt);
  });

  it('over a GENERATED source produces the same structure (call rests + shifted response, 2× span)', () => {
    const block = generateBlock({
      activeScale: Scale.defaultScale(),
      timeSignature: ts,
      numMeasures: 1, // caller passes groupMeasures as numMeasures for call-response
      chordProgression: null,
      seriesArgs: makeSeriesArgs(),
      shape: 'call-response',
      groupMeasures: 1,
    });

    const events = block.treble.offsets
      .map((o, i) => ({ o, d: block.treble.durations[i], n: block.treble.notes[i] }))
      .filter((e) => e.o != null);

    // Call half [0, mlt): only rests.
    const callEvents = events.filter((e) => e.o < mlt);
    expect(callEvents.length).toBeGreaterThan(0);
    for (const e of callEvents) expect(e.n).toBe('r');

    // Response half [mlt, 2*mlt): real notes, filling to the block end.
    const responseEvents = events.filter((e) => e.o >= mlt);
    expect(responseEvents.length).toBeGreaterThan(0);
    const lastEnd = responseEvents.reduce((m, e) => Math.max(m, e.o + e.d), 0);
    expect(Math.abs(lastEnd - 2 * mlt)).toBeLessThan(1e-6);
  });
});
