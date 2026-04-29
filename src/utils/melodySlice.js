/**
 * Utilities for slicing multi-measure Melody objects into per-measure pieces.
 */

/**
 * Slice a Melody (with absolute offsets spanning 0..numMeasures*measureLengthTicks)
 * into an array of SlicedMelody objects — one per measure — with offsets made relative
 * to each measure's start (0..measureLengthTicks).
 *
 * Returns an array of length numMeasures; entries are null when a measure has no notes.
 *
 * @param {object} melody  — { notes, durations, offsets, ties?, displayNotes?, volumes? }
 * @param {number} measureLengthTicks
 * @param {number} numMeasures
 * @returns {(object|null)[]}
 */
export function sliceMelodyByMeasure(melody, measureLengthTicks, numMeasures) {
  return Array.from({ length: numMeasures }, (_, m) => {
    const lo = m * measureLengthTicks;
    const hi = (m + 1) * measureLengthTicks;
    const idx = [];
    for (let i = 0; i < melody.offsets.length; i++) {
      const o = melody.offsets[i];
      if (o != null && o >= lo && o < hi) idx.push(i);
    }
    if (idx.length === 0) return null;
    return {
      notes:        idx.map(i => melody.notes[i]),
      durations:    idx.map(i => melody.durations[i]),
      offsets:      idx.map(i => melody.offsets[i] - lo),    // make relative to measure start
      ties:         idx.map(i => melody.ties?.[i] ?? null),
      displayNotes: idx.map(i => (melody.displayNotes ?? melody.notes)[i]),
      volumes:      idx.map(i => (melody.volumes ?? [])[i] ?? 1),
      triplets:     melody.triplets ? idx.map(i => melody.triplets[i] ?? null) : null,
    };
  });
}

/**
 * Filter a getChordsWithSlashes() chord array to only those that fall within
 * measure m, and make absoluteOffset relative to that measure's start.
 *
 * @param {object[]} chordsArr  — [{chord, absoluteOffset, isSlash}, ...]
 * @param {number}   m          — 0-based measure index within the melody
 * @param {number}   measureLengthTicks
 * @returns {object[]}
 */
export function sliceChordsForMeasure(chordsArr, m, measureLengthTicks) {
  if (!chordsArr || chordsArr.length === 0) return [];
  const lo = m * measureLengthTicks;
  const hi = (m + 1) * measureLengthTicks;
  return chordsArr
    .filter(c => c.absoluteOffset >= lo && c.absoluteOffset < hi)
    .map(c => ({ ...c, absoluteOffset: c.absoluteOffset - lo }));
}

/**
 * Convert a SlicedMelody (or null) into the plain object shape expected by
 * processMelodyAndCalculateSlots / renderMelodyNotes.
 * When slice is null (empty measure), returns a single whole-rest.
 *
 * @param {object|null} slice
 * @param {number} measureLengthTicks
 * @returns {object}
 */
export function sliceToMelodyLike(slice, measureLengthTicks) {
  if (slice) {
    return {
      notes:        slice.notes,
      durations:    slice.durations,
      offsets:      slice.offsets,
      displayNotes: slice.displayNotes,
      ties:         slice.ties,
      volumes:      slice.volumes,
      triplets:     slice.triplets ?? null,
    };
  }
  // Empty measure: single whole-rest spanning the full measure
  return {
    notes:        ['r'],
    durations:    [measureLengthTicks],
    offsets:      [0],
    displayNotes: ['r'],
    ties:         [null],
    volumes:      [1],
  };
}

/**
 * Slice a Melody into a single Melody object containing a range of measures,
 * with offsets reset to 0 at the start of the range.
 */
export function sliceMelodyByRange(melody, measureLengthTicks, numMeasuresToKeep, startMeasureIndex = 0) {
  const lo = startMeasureIndex * measureLengthTicks;
  const hi = (startMeasureIndex + numMeasuresToKeep) * measureLengthTicks;
  const idx = [];
  for (let i = 0; i < melody.offsets.length; i++) {
    const o = melody.offsets[i];
    if (o != null && o >= lo && o < hi) idx.push(i);
  }
  return {
    notes:        idx.map(i => melody.notes[i]),
    durations:    idx.map(i => melody.durations[i]),
    offsets:      idx.map(i => melody.offsets[i] - lo),
    ties:         idx.map(i => melody.ties?.[i] ?? null),
    displayNotes: idx.map(i => (melody.displayNotes ?? melody.notes)[i]),
    volumes:      idx.map(i => (melody.volumes ?? [])[i] ?? 1),
    triplets:     melody.triplets ? idx.map(i => melody.triplets[i] ?? null) : null,
  };
}

/**
 * Resize a Melody to span exactly targetMeasures measures.
 *
 * - If the melody is longer: notes whose offset falls at or after the new end are dropped.
 *   Notes that start before the boundary but extend past it have their duration clamped.
 * - If the melody is shorter: a single whole-rest note is appended for each missing measure
 *   so the sheet music renders rest symbols rather than showing an unexpectedly short score.
 *
 * Designed to be called when the user changes numMeasures while not playing, so the
 * display immediately reflects the new target length without requiring a full regeneration.
 *
 * @param {object}  melody              — { notes, durations, offsets, displayNotes?, volumes?, ties? }
 * @param {number}  targetMeasures
 * @param {number}  measureLengthTicks
 * @returns {object}  new melody-like object with the same shape
 */
export function resizeMelody(melody, targetMeasures, measureLengthTicks) {
  if (!melody) return melody;
  const newEndTick = targetMeasures * measureLengthTicks;

  // Determine the current melody span in measures (how many measures worth of notes exist)
  let currentEndTick = 0;
  for (let i = 0; i < melody.offsets.length; i++) {
    const o = melody.offsets[i];
    const d = melody.durations[i];
    if (o != null && d != null) currentEndTick = Math.max(currentEndTick, o + d);
  }
  const currentMeasures = currentEndTick > 0
    ? Math.ceil(currentEndTick / measureLengthTicks)
    : 0;

  if (currentMeasures === targetMeasures) return melody;

  const notes        = [];
  const durations    = [];
  const offsets      = [];
  const displayNotes = [];
  const volumes      = [];
  const ties         = [];
  const triplets     = [];

  if (targetMeasures < currentMeasures) {
    // Truncate: keep notes that start before the new end; clamp durations at the boundary.
    for (let i = 0; i < melody.offsets.length; i++) {
      const o = melody.offsets[i];
      const d = melody.durations[i];
      if (o == null) continue; // skip continuation slots
      if (o >= newEndTick) continue; // drop notes in removed measures
      notes.push(melody.notes[i]);
      durations.push(d != null ? Math.min(d, newEndTick - o) : d);
      offsets.push(o);
      displayNotes.push((melody.displayNotes ?? melody.notes)[i]);
      volumes.push((melody.volumes ?? [])[i] ?? 1);
      ties.push(melody.ties?.[i] ?? null);
      triplets.push(melody.triplets?.[i] ?? null);
    }
  } else {
    // Extend: copy all existing notes, then add one whole-rest per new measure.
    for (let i = 0; i < melody.offsets.length; i++) {
      notes.push(melody.notes[i]);
      durations.push(melody.durations[i]);
      offsets.push(melody.offsets[i]);
      displayNotes.push((melody.displayNotes ?? melody.notes)[i]);
      volumes.push((melody.volumes ?? [])[i] ?? 1);
      ties.push(melody.ties?.[i] ?? null);
      triplets.push(melody.triplets?.[i] ?? null);
    }
    for (let m = currentMeasures; m < targetMeasures; m++) {
      notes.push('r');
      durations.push(measureLengthTicks);
      offsets.push(m * measureLengthTicks);
      displayNotes.push('r');
      volumes.push(1);
      ties.push(null);
      triplets.push(null);
    }
  }

  const hasTriplets = triplets.some(t => t !== null);
  return { notes, durations, offsets, displayNotes, volumes, ties, triplets: hasTriplets ? triplets : null };
}

/**
 * Slice a ChordProgression-style chord array into a range of measures.
 */
export function sliceChordsByRange(chordsArr, startMeasureIndex, numMeasuresToKeep, measureLengthTicks) {
  if (!chordsArr || chordsArr.length === 0) return [];
  const lo = startMeasureIndex * measureLengthTicks;
  const hi = (startMeasureIndex + numMeasuresToKeep) * measureLengthTicks;
  return chordsArr
    .filter(c => c.absoluteOffset >= lo && c.absoluteOffset < hi)
    .map(c => ({ ...c, absoluteOffset: c.absoluteOffset - lo }));
}
