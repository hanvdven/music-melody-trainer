import { describe, it, expect } from 'vitest';
import MelodyGenerator from '../melodyGenerator.js';
import InstrumentSettings from '../../model/InstrumentSettings.js';
import Scale from '../../model/Scale.js';
import { TICKS_PER_WHOLE } from '../../constants/timing.js';

/**
 * GOLDEN / CHARACTERIZATION TEST — guards the CLAUDE.md §6b invariant and
 * docs/architecture.md §3 step 4 ("six sub-steps, identical for ALL instrument
 * tracks; no instrument-specific special-casing; InstrumentSettings carry all
 * per-instrument variation").
 *
 * The May-2026 regression this exists to catch: a per-instrument workaround
 * (hardcoding smallestNoteDenom for bass at the call site / in settings instead
 * of fixing generateRhythmicDNA's slotsPerBeat math). Such a fix would make one
 * instrument type's melody structurally inconsistent with the time signature
 * while the others stayed correct — exactly what the per-instrument-loop
 * assertions below would surface.
 *
 * WHY ONLY STRUCTURAL ASSERTIONS (not exact pitches):
 * MelodyGenerator draws from Math.random() directly (no seed/RNG injection is
 * exposed by the constructor — verified against src/generation/melodyGenerator.js
 * and every call site in Sequencer.js / useMelodyState.js). So we assert only
 * properties that hold for EVERY possible RNG outcome:
 *   1. generation never throws,
 *   2. the produced Melody's offsets+durations exactly tile each measure —
 *      total ticks == measureLengthTicks * numMeasures, with no overflow or
 *      underflow — which is the observable proxy for "all instruments ran the
 *      same pipeline against the same (numerator/denominator) time math".
 * These hold regardless of which notes/rhythms RNG selects because:
 *   - Melody.fromFlattenedNotes derives timeScale from notes.length so the flat
 *     slot array always tiles the measure (continuation nulls extend durations).
 *   - The tuplet post-pass (4g) re-splits a note's groupTicks with the last
 *     sub-note absorbing the floor() remainder, so the per-group total — and
 *     therefore the melody total — is preserved exactly.
 *
 * CHARACTERIZED QUIRK (intentional, locked here): when a melody begins with a
 * rest (leading null slots), Melody.fromFlattenedNotes accumulates those leading
 * ticks into durations[0] while notes[0] / offsets[0] stay null. So the leading
 * rest's ticks live at a NULL-offset index. The total-coverage invariant below
 * therefore sums ALL non-null durations (not only those at non-null offsets) —
 * otherwise a leading rest would be miscounted as underflow.
 *
 * Each assertion runs over many trials so a structure that only fails for some
 * RNG seeds is still caught (non-flaky in the success direction: a correct
 * pipeline passes for every seed).
 */

// Representative settings for the three core instrument types. These are the
// app's real defaults — bass deliberately uses smallestNoteDenom=2 (coarser
// than a beat), which is the exact configuration the May-2026 bug mishandled.
const INSTRUMENT_CASES = [
  {
    type: 'treble',
    makeScale: () => Scale.defaultScale(),
    makeSettings: () => InstrumentSettings.defaultTrebleInstrumentSettings(),
  },
  {
    type: 'bass',
    makeScale: () => Scale.defaultScale().generateBassScale(),
    makeSettings: () => InstrumentSettings.defaultBassInstrumentSettings(),
  },
  {
    type: 'percussion',
    makeScale: () => Scale.defaultPercussionScale(),
    makeSettings: () => InstrumentSettings.defaultPercussionInstrumentSettings(),
  },
];

// 4/4 (even), 5/4 (odd numerator, quarter beat), 7/8 (odd numerator, eighth beat).
const TIME_SIGNATURES = [[4, 4], [5, 4], [7, 8]];

const NUM_MEASURES = 2;
const TRIALS = 80; // exercise many RNG outcomes per case
const EPS = 1e-6;

// Minimal but faithful chord stand-in: a dense array (one chord per measure),
// which getActiveChord resolves via the progressionArray[measureIdx] fallback.
// Chords carry .root + .notes (note-name strings) as real Chord objects do.
const makeChords = (scale, numMeasures) => {
  const triad = {
    root: scale.notes[0],
    notes: [
      scale.notes[0],
      scale.notes[2] ?? scale.notes[0],
      scale.notes[4] ?? scale.notes[0],
    ],
  };
  return Array.from({ length: numMeasures }, () => triad);
};

const measureLengthTicks = (ts) => TICKS_PER_WHOLE * (ts[0] / ts[1]);

describe('generation pipeline golden invariants (§6b: identical pipeline for all instruments)', () => {
  for (const ts of TIME_SIGNATURES) {
    const tsLabel = `${ts[0]}/${ts[1]}`;
    const expectedTotal = measureLengthTicks(ts) * NUM_MEASURES;

    for (const inst of INSTRUMENT_CASES) {
      it(`${inst.type} in ${tsLabel}: generates and exactly tiles ${NUM_MEASURES} measures (RNG-stable across ${TRIALS} trials)`, () => {
        for (let trial = 0; trial < TRIALS; trial++) {
          const scale = inst.makeScale();
          const settings = inst.makeSettings();
          const chords = makeChords(scale, NUM_MEASURES);

          // Same call shape used at every real call site — no per-instrument
          // branching in the call itself; only `settings` differs.
          let melody;
          expect(() => {
            melody = new MelodyGenerator(
              scale,
              NUM_MEASURES,
              ts,
              settings,
              chords,
              settings.range || null
            ).generateMelody();
          }, `generation threw for ${inst.type} in ${tsLabel} (trial ${trial})`).not.toThrow();

          // Basic shape: parallel arrays of equal length.
          expect(Array.isArray(melody.notes)).toBe(true);
          expect(melody.offsets.length).toBe(melody.notes.length);
          expect(melody.durations.length).toBe(melody.notes.length);
          expect(melody.notes.length).toBeGreaterThan(0);

          // Real (sounding) events: entries with a non-null offset. A leading
          // rest's ticks are NOT here — they sit at the null-offset index 0
          // (see CHARACTERIZED QUIRK above) and are picked up by the all-durations
          // sum used for invariant 1.
          const realEvents = [];
          for (let i = 0; i < melody.notes.length; i++) {
            if (melody.offsets[i] != null) {
              realEvents.push({ offset: melody.offsets[i], duration: melody.durations[i] });
            }
          }

          expect(realEvents.length).toBeGreaterThan(0);

          // Every sounding-note duration is strictly positive; no degenerate
          // zero-length notes.
          for (const ev of realEvents) {
            expect(ev.duration).toBeGreaterThan(0);
          }

          // Offsets are non-negative, ordered, and stay inside the block.
          let prev = -Infinity;
          for (const ev of realEvents) {
            expect(ev.offset).toBeGreaterThanOrEqual(0);
            expect(ev.offset).toBeLessThan(expectedTotal + EPS);
            expect(ev.offset).toBeGreaterThanOrEqual(prev - EPS);
            prev = ev.offset;
          }

          // INVARIANT 1 — no underflow/overflow: ALL non-null durations sum to
          // exactly one block (measureLengthTicks * numMeasures). Includes the
          // leading-rest ticks parked at the null-offset index. This is the
          // formula TICKS_PER_WHOLE * (numerator/denominator) * numMeasures
          // applied identically for every instrument type.
          const durSum = melody.durations
            .filter((d) => d != null)
            .reduce((a, b) => a + b, 0);
          expect(Math.abs(durSum - expectedTotal)).toBeLessThan(EPS);

          // INVARIANT 2 — the last sounding note ends exactly at the block
          // boundary (consistent offset+duration math). The earliest sounding
          // note may start after 0 (leading rest), but the block must always be
          // filled to its end. Together with invariant 1 and ordering, this
          // proves the events tile [0, expectedTotal) with no gap/overhang.
          const lastEnd = realEvents.reduce(
            (max, ev) => Math.max(max, ev.offset + ev.duration),
            -Infinity
          );
          expect(Math.abs(lastEnd - expectedTotal)).toBeLessThan(EPS);
        }
      });
    }
  }

  // Cross-instrument consistency: the SAME call (only `settings` varies) must
  // yield a structurally valid, identically-tiled melody for all three types in
  // the same time signature. A per-instrument special-case that broke one type's
  // tiling (the May-2026 bug class) would fail here while the others pass — the
  // observable proxy for "no instrument-type branching inside generation".
  for (const ts of TIME_SIGNATURES) {
    const tsLabel = `${ts[0]}/${ts[1]}`;
    const expectedTotal = measureLengthTicks(ts) * NUM_MEASURES;

    it(`all instrument types tile identically in ${tsLabel} under one shared call shape`, () => {
      for (const inst of INSTRUMENT_CASES) {
        const scale = inst.makeScale();
        const settings = inst.makeSettings();
        const chords = makeChords(scale, NUM_MEASURES);
        const melody = new MelodyGenerator(
          scale,
          NUM_MEASURES,
          ts,
          settings,
          chords,
          settings.range || null
        ).generateMelody();

        const durSum = melody.durations
          .filter((d) => d != null)
          .reduce((a, b) => a + b, 0);
        expect(
          Math.abs(durSum - expectedTotal),
          `${inst.type} did not tile ${tsLabel} like the others`
        ).toBeLessThan(EPS);
      }
    });
  }
});
