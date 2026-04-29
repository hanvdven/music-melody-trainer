/**
 * Song — a flat, growing array of MeasureSlice objects.
 *
 * MeasureSlice shape:
 * {
 *   measureIndex:      number,          // global 0-based, baked in at generation time
 *   timeSignature:     [n, d],
 *   measureLengthTicks: number,
 *   treble:            SlicedMelody | null,
 *   bass:              SlicedMelody | null,
 *   percussion:        SlicedMelody | null,
 *   metronome:         SlicedMelody | null,
 *   chords:            Array<{chord, absoluteOffset, isSlash}>,  // offsets relative to measure start
 *   tonic:             object | null,
 *   numAccidentals:    number,
 *   display:           'notes' | 'hidden',
 *   metadata:          { cycle, repeatBlock, iteration, isOddRound }
 * }
 *
 * SlicedMelody shape (offsets are 0-relative within the single measure):
 * { notes, durations, offsets, ties, displayNotes, volumes }
 */
class Song {
  constructor() {
    this.measures = [];        // ordered array of MeasureSlice
    this._byIndex = new Map(); // measureIndex → MeasureSlice (O(1) lookup)
  }

  /**
   * Append an array of MeasureSlice objects to the song.
   * Idempotent: silently skips entries whose measureIndex already exists.
   */
  appendMeasures(slices) {
    for (const s of slices) {
      if (this._byIndex.has(s.measureIndex)) continue;
      this.measures.push(s);
      this._byIndex.set(s.measureIndex, s);
    }
  }

  /**
   * Return `count` slices starting at `globalStart`.
   * Positions not yet generated are returned as null (empty-measure placeholders).
   */
  getWindow(globalStart, count) {
    return Array.from({ length: count }, (_, i) =>
      this._byIndex.get(globalStart + i) ?? null
    );
  }

  /** Total number of measures generated so far. */
  get length() {
    return this.measures.length;
  }

  /** Last global measure index available (-1 if empty). */
  get lastIndex() {
    return this.measures.length > 0
      ? this.measures[this.measures.length - 1].measureIndex
      : -1;
  }

  static empty() {
    return new Song();
  }
}

export default Song;
