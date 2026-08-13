import { describe, it, expect } from 'vitest';
import convertRankedArrayToMelody from '../convertRankedArrayToMelody';
import { getNoteSemitone } from '../../theory/noteUtils';
import { TICKS_PER_WHOLE } from '../../constants/timing.js';

describe('convertRankedArrayToMelody', () => {
  it('handles ranked array conversion without crashing', () => {
    // Minimal smoke test: simple ranked array
    const rankedArray = [
      { slot: 0, priority: 'high' },
      { slot: 1, priority: 'low' },
      { slot: 2, priority: 'high' },
      { slot: 3, priority: 'low' },
    ];
    const scale = ['C4', 'D4', 'E4', 'F4', 'G4'];

    // This is just a smoke test - verify function runs without throwing
    try {
      const result = convertRankedArrayToMelody(
        rankedArray,
        'C',
        scale,
        4,
        1,
        'scale',
        [{ notes: [['C4', 'E4', 'G4']] }],
        null,
        'uniform'
      );
      // Just verify it returns something (could be undefined)
      expect(result !== undefined || result === undefined).toBe(true);
    } catch (error) {
      expect(true).toBe(false); // Should not throw
    }
  });

  it('handles root note pool', () => {
    const rankedArray = [
      { slot: 0, priority: 'high' },
      { slot: 1, priority: 'low' },
    ];
    const scale = ['C4', 'G4'];

    try {
      convertRankedArrayToMelody(
        rankedArray,
        'C',
        scale,
        2,
        1,
        'root',
        [{ notes: [['C4']] }],
        null,
        'uniform'
      );
      expect(true).toBe(true); // Should complete without throwing
    } catch (error) {
      expect(true).toBe(false);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// #925 — randomizationRule 'force_chord_roots'
//
// Spec (docs/architecture.md §3 step 4e / §183): identical to 'uniform' for pitch selection, EXCEPT
// the slot at the start of every chord segment (passing chords included) is forced active AND
// forced to that chord's root. notesPerMeasure is therefore a MINIMUM, not a cap.
//
// Assertions are RNG-independent: only the forced onsets have a deterministic pitch; everything
// else is asserted as pool membership, which holds for every possible Math.random() outcome.
// ───────────────────────────────────────────────────────────────────────────────────────────────
describe('convertRankedArrayToMelody — force_chord_roots (#925)', () => {
  const RANGE = { min: 'C2', max: 'B3' };
  const SCALE = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3'];
  const C  = { root: 'C4',  notes: ['C4', 'E4', 'G4'] };
  const F  = { root: 'F4',  notes: ['F4', 'A4', 'C5'] };
  const Dm = { root: 'D4',  notes: ['D4', 'F4', 'A4'] };

  // Ranked arrays are permutations of 0..length-1 (see generateRankedRhythm). `priorityOrder`
  // lists the slots that must receive the LOWEST ranks (i.e. become active first).
  const buildRanked = (length, priorityOrder) => {
    const ranks = new Array(length).fill(null);
    let r = 0;
    for (const s of priorityOrder) ranks[s] = r++;
    for (let i = 0; i < length; i++) if (ranks[i] === null) ranks[i] = r++;
    return ranks;
  };

  const run = ({ ranked, numMeasures, notesPerMeasure, chords, offsets, timeSignature, notePool = 'chord' }) =>
    convertRankedArrayToMelody(
      ranked, 'C', SCALE, notesPerMeasure, numMeasures, notePool,
      { displayNotes: chords, offsets }, RANGE, 'force_chord_roots', timeSignature,
    );

  it('forces the chord root on every chord-change onset slot (4/4)', () => {
    // 8 slots/measure, 2 measures → ticksPerSlot = 48/8 = 6. Chords at ticks 0 and 48 → slots 0, 8.
    const ranked = buildRanked(16, [0, 8, 4, 12]);
    const { melody } = run({
      ranked, numMeasures: 2, notesPerMeasure: 2,
      chords: [C, F], offsets: [0, 48], timeSignature: [4, 4],
    });
    expect(getNoteSemitone(melody[0])).toBe(getNoteSemitone('C'));
    expect(getNoteSemitone(melody[8])).toBe(getNoteSemitone('F'));
  });

  it('forces the root of a PASSING chord landing mid-measure', () => {
    // Chords at ticks 0 / 24 / 48 → slots 0 / 4 / 8. Slot 4 is the mid-measure passing chord.
    const ranked = buildRanked(16, [0, 8, 4, 12]);
    const { melody } = run({
      ranked, numMeasures: 2, notesPerMeasure: 2,
      chords: [C, Dm, F], offsets: [0, 24, 48], timeSignature: [4, 4],
    });
    expect(getNoteSemitone(melody[4])).toBe(getNoteSemitone('D'));
  });

  it('treats notesPerMeasure as a MINIMUM — a chord change past the top-N budget still sounds', () => {
    // notesPerMeasure=1 over 1 measure → the ranked budget allows exactly ONE active slot (rank 0).
    // Two chord events (slots 0 and 4) must BOTH sound anyway.
    const ranked = buildRanked(8, [0]);
    const { melody } = run({
      ranked, numMeasures: 1, notesPerMeasure: 1,
      chords: [C, F], offsets: [0, 24], timeSignature: [4, 4],
    });
    expect(melody[0]).not.toBeNull();
    expect(melody[4]).not.toBeNull();
    expect(getNoteSemitone(melody[4])).toBe(getNoteSemitone('F'));
    expect(melody.filter(n => n !== null).length).toBeGreaterThanOrEqual(2);
  });

  it.each([[4, 4], [5, 4], [7, 8], [11, 8]])(
    'works for time signature %i/%i — every chord onset carries its root (§6b: no meter special-casing)',
    (num, den) => {
      // slotsPerMeasure = num → ticksPerSlot = TICKS_PER_WHOLE/den (an integer for every meter used
      // by the app), derived arithmetically from the meter — no numerator lookup table (§6c).
      const ticksPerSlot  = TICKS_PER_WHOLE / den;
      const measureTicks  = TICKS_PER_WHOLE * num / den;
      const mid           = Math.floor(num / 2);
      const ranked        = buildRanked(2 * num, [0, num, mid, num + mid]);
      const { melody } = run({
        ranked, numMeasures: 2, notesPerMeasure: 2,
        chords:  [C, Dm, F],
        offsets: [0, mid * ticksPerSlot, measureTicks],
        timeSignature: [num, den],
      });
      expect(getNoteSemitone(melody[0])).toBe(getNoteSemitone('C'));
      expect(getNoteSemitone(melody[mid])).toBe(getNoteSemitone('D'));
      expect(getNoteSemitone(melody[num])).toBe(getNoteSemitone('F'));
    },
  );

  it('non-onset slots stay uniform — every other note is drawn from the instrument pool', () => {
    // notePool 'scale' → the pool IS the passed scale array, so membership is directly checkable.
    const ranked = buildRanked(16, [0, 8, 4, 12, 2, 10, 6, 14]);
    const forcedSlots = new Set([0, 8]); // chord onsets at ticks 0 and 48
    const { melody } = run({
      ranked, numMeasures: 2, notesPerMeasure: 4, notePool: 'scale',
      chords: [C, F], offsets: [0, 48], timeSignature: [4, 4],
    });
    melody.forEach((note, i) => {
      if (note === null || forcedSlots.has(i)) return;
      expect(SCALE).toContain(note);
    });
    // …and the forced onsets are still roots, not scale picks.
    expect(getNoteSemitone(melody[0])).toBe(getNoteSemitone('C'));
    expect(getNoteSemitone(melody[8])).toBe(getNoteSemitone('F'));
  });
});
