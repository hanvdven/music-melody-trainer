/**
 * Song unit tests — append-only / monotonic invariants (§6: "Song is append-only —
 * never reset it during playback; getWindow relies on stable monotonically-increasing
 * measureIndex").
 *
 * Song stores a flat, growing array of MeasureSlice objects plus a measureIndex->slice
 * Map for O(1) lookup. We build minimal valid MeasureSlice-like objects: the only field
 * Song itself reads is `measureIndex` (everything else is opaque payload), so we keep a
 * couple of identifying fields to prove the right slice is returned.
 */
import { describe, it, expect } from 'vitest';
import Song from '../Song.js';

/** Minimal MeasureSlice-like object. `measureIndex` is the only field Song uses. */
function makeSlice(measureIndex, tag = `m${measureIndex}`) {
  return {
    measureIndex,
    timeSignature: [4, 4],
    measureLengthTicks: 48,
    treble: null,
    bass: null,
    percussion: null,
    metronome: null,
    chords: [],
    tonic: null,
    numAccidentals: 0,
    display: 'notes',
    metadata: { cycle: 0, repeatBlock: 0, iteration: 0, isOddRound: false },
    tag, // test-only identity marker
  };
}

describe('Song.appendMeasures — idempotency / append-only', () => {
  it('skips a duplicate measureIndex and keeps _byIndex correct', () => {
    const song = new Song();
    const first = makeSlice(0, 'first');
    song.appendMeasures([first]);

    // Append a DIFFERENT object with the SAME measureIndex — must be skipped.
    const duplicate = makeSlice(0, 'duplicate');
    song.appendMeasures([duplicate]);

    // No duplicate slice was added.
    expect(song.measures).toHaveLength(1);
    // The ORIGINAL slice is retained (the duplicate did not overwrite it).
    expect(song.measures[0].tag).toBe('first');

    // _byIndex still maps index 0 to the original slice.
    const [slice0] = song.getWindow(0, 1);
    expect(slice0.tag).toBe('first');
  });

  it('is idempotent across repeated appends of the same batch', () => {
    const song = new Song();
    const batch = [makeSlice(0), makeSlice(1), makeSlice(2)];
    song.appendMeasures(batch);
    song.appendMeasures(batch); // append again
    song.appendMeasures(batch); // and again

    expect(song.measures).toHaveLength(3);
    expect(song.length).toBe(3);
  });

  it('appends genuinely new indices alongside existing ones', () => {
    const song = new Song();
    song.appendMeasures([makeSlice(0), makeSlice(1)]);
    // Mixed batch: 1 already exists (skip), 2 and 3 are new (append).
    song.appendMeasures([makeSlice(1, 'dup'), makeSlice(2), makeSlice(3)]);

    expect(song.measures).toHaveLength(4);
    expect(song.measures.map((s) => s.measureIndex)).toEqual([0, 1, 2, 3]);
    expect(song.measures[1].tag).toBe('m1'); // original m1, not the 'dup'
  });
});

describe('Song.getWindow — null holes + correct slices', () => {
  it('returns null entries for indices not yet built (holes)', () => {
    const song = new Song();
    // Build only indices 0, 2, 4 — leaving holes at 1 and 3.
    song.appendMeasures([makeSlice(0), makeSlice(2), makeSlice(4)]);

    const window = song.getWindow(0, 5);
    expect(window).toHaveLength(5);
    expect(window[0]?.measureIndex).toBe(0);
    expect(window[1]).toBeNull(); // hole
    expect(window[2]?.measureIndex).toBe(2);
    expect(window[3]).toBeNull(); // hole
    expect(window[4]?.measureIndex).toBe(4);
  });

  it('returns the correct slices for built indices at an arbitrary start', () => {
    const song = new Song();
    song.appendMeasures([makeSlice(5, 'a'), makeSlice(6, 'b'), makeSlice(7, 'c')]);

    const window = song.getWindow(5, 3);
    expect(window.map((s) => s.tag)).toEqual(['a', 'b', 'c']);
  });

  it('returns all nulls for a window entirely past what was built', () => {
    const song = new Song();
    song.appendMeasures([makeSlice(0)]);
    expect(song.getWindow(10, 3)).toEqual([null, null, null]);
  });
});

describe('Song — measures stay ordered by measureIndex', () => {
  it('preserves ascending measureIndex order across multiple appends', () => {
    const song = new Song();
    song.appendMeasures([makeSlice(0), makeSlice(1)]);
    song.appendMeasures([makeSlice(2)]);
    song.appendMeasures([makeSlice(3), makeSlice(4)]);

    const indices = song.measures.map((s) => s.measureIndex);
    const sorted = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(sorted);
    expect(indices).toEqual([0, 1, 2, 3, 4]);
  });

  it('lastIndex tracks the highest appended measureIndex (-1 when empty)', () => {
    const song = Song.empty();
    expect(song.lastIndex).toBe(-1);
    expect(song.length).toBe(0);

    song.appendMeasures([makeSlice(0), makeSlice(1), makeSlice(2)]);
    expect(song.lastIndex).toBe(2);
    expect(song.length).toBe(3);
  });
});
