/**
 * Utilities for slicing multi-measure Melody objects into per-measure pieces.
 */

/**
 * Number of measures an active melody actually spans, derived from its total note
 * duration (in ticks/slots) under a given measure length.
 *
 * Rounds UP (ceil), not nearest, so a melody that does NOT divide evenly into the
 * current meter still gets a trailing measure to hold its leftover notes. This is the
 * normal case after a TIME SIGNATURE change while stopped: the melody stores
 * METER-INDEPENDENT absolute ticks, so re-barring is just re-slicing the same notes by
 * the new measure length. Example: a 192-tick (4-bar 4/4) melody re-barred into 3/4
 * (measureLengthTicks ≈ 36) spans 192/36 = 5.33 measures. Math.round would give 5 and
 * DROP the partial final measure's notes (offsets 180–192) — the persistent malformed-
 * sheet bug. Math.ceil gives 6: the trailing partial measure is shown, and the renderer
 * pads a trailing rest + ties notes across the new barlines.
 *
 * The -1e-6 epsilon stops floating-point error pushing an EXACT multiple up by a whole
 * measure (e.g. 192/12 must be 16, not 17).
 *
 * @param {number} totalMelodyDuration  — last note end tick (0 when empty)
 * @param {number} measureLengthTicks
 * @param {number} fallbackMeasures     — used when the melody is empty (initial state)
 * @returns {number}
 */
export function melodyMeasureSpan(totalMelodyDuration, measureLengthTicks, fallbackMeasures) {
  if (totalMelodyDuration > 0) {
    return Math.max(1, Math.ceil(totalMelodyDuration / measureLengthTicks - 1e-6));
  }
  return fallbackMeasures;
}

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
  // Fermata semantics (Han 2026-05-29 round 13): song-level events of shape
  // { tick, hold }. Per-measure slicing carries the SAME tick-based events
  // unchanged — they're global by definition, so a slice doesn't need to
  // translate them. Renderers that want to show a glyph compare tick against
  // the slice's absolute measure-start to decide if the glyph belongs in
  // this measure.
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
      triplets:         melody.triplets ? idx.map(i => melody.triplets[i] ?? null) : null,
      rhythmicGrouping: melody.rhythmicGrouping ?? null,
      rhythmicDNA:      melody.rhythmicDNA ?? null,
      fermatas:         melody.fermatas ?? null,
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
      triplets:         slice.triplets ?? null,
      rhythmicGrouping: slice.rhythmicGrouping ?? null,
      rhythmicDNA:      slice.rhythmicDNA ?? null,
      fermatas:         slice.fermatas ?? null,
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
    triplets:         melody.triplets ? idx.map(i => melody.triplets[i] ?? null) : null,
    rhythmicGrouping: melody.rhythmicGrouping ?? null,
    rhythmicDNA:      melody.rhythmicDNA ?? null,
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
  return { notes, durations, offsets, displayNotes, volumes, ties, triplets: hasTriplets ? triplets : null, rhythmicGrouping: melody.rhythmicGrouping ?? null, rhythmicDNA: melody.rhythmicDNA ?? null };
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
