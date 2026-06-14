// utils/anacrusisRepeat.js
//
// Pickup (anacrusis) REPEAT support (Han 2026-06-14). When a song has a leading anacrusis and it
// REPEATS, the pickup of the next repeat must flow out of the END of the previous repeat's last
// bar — not replay as a separate padded measure with a dead rest. Musically the final note shortens
// on non-final repeats to free the pickup beat, and rings full only on the last repeat.
//
// This module is the PURE core: given a melody whose measure 0 is an anacrusis, it returns the three
// pieces the Sequencer + sheet renderer need. It does no scheduling/rendering itself.
//
//   intro      — the anacrusis notes alone (played ONCE, before repeat 1).
//   loopClean  — the body (measures AFTER the anacrusis), rebased to offset 0. Used for the FINAL
//                repeat: the last note keeps its full length (clean ending).
//   loopMerged — the body with the anacrusis MERGED into the end of its last measure: notes that
//                start inside the pickup region are dropped, a note that overlaps it is clipped to
//                the pickup start, then the anacrusis notes are appended at the pickup beat. Used for
//                repeats 1..N-1 so the pickup of the next repeat sounds at the end of this bar.
//
// All offsets/durations are in ticks. `measureLen` = ticks per measure.

const sliceArr = (arr, idxs) => (Array.isArray(arr) ? idxs.map(i => arr[i]) : undefined);

// Rebuild a melody-like object keeping only the given indices (preserves any parallel arrays).
const pick = (mel, idxs) => {
    const out = { ...mel };
    out.notes = idxs.map(i => mel.notes[i]);
    out.offsets = idxs.map(i => mel.offsets[i]);
    out.durations = idxs.map(i => mel.durations[i]);
    if (mel.ties) out.ties = sliceArr(mel.ties, idxs);
    if (mel.triplets) out.triplets = sliceArr(mel.triplets, idxs);
    return out;
};

/**
 * @param {object} melody  { notes, offsets, durations, ties?, triplets? }
 * @param {number} measureLen ticks per measure
 * @returns {{hasAnacrusis: boolean, intro: object|null, loopClean: object, loopMerged: object|null}}
 */
export const buildAnacrusisRepeatParts = (melody, measureLen) => {
    const offs = melody?.offsets;
    // No anacrusis when the melody is empty or its first note is already on the downbeat (offset 0).
    if (!offs || offs.length === 0 || offs[0] <= 0 || measureLen <= 0) {
        return { hasAnacrusis: false, intro: null, loopClean: melody, loopMerged: null };
    }

    const anacrusisIdx = [];
    const bodyIdx = [];
    for (let i = 0; i < offs.length; i++) (offs[i] < measureLen ? anacrusisIdx : bodyIdx).push(i);
    if (anacrusisIdx.length === 0 || bodyIdx.length === 0) {
        return { hasAnacrusis: false, intro: null, loopClean: melody, loopMerged: null };
    }

    const pickupStart = offs[anacrusisIdx[0]];                 // first onset of the pickup (e.g. 24)

    // intro: the anacrusis notes, offsets unchanged (still within [pickupStart, measureLen)).
    const intro = pick(melody, anacrusisIdx);

    // body: everything after the anacrusis, rebased so the first body measure starts at offset 0.
    const body = pick(melody, bodyIdx);
    body.offsets = body.offsets.map(o => o - measureLen);
    const maxOffset = Math.max(...body.offsets);
    const lastMeasureStart = Math.floor(maxOffset / measureLen) * measureLen;  // start of the last body bar
    const bodyMeasures = lastMeasureStart / measureLen + 1;
    const mergePoint = lastMeasureStart + pickupStart;        // pickup beat of the last body measure

    const loopClean = body;

    // loopMerged: clip the body at mergePoint, then append the anacrusis at the pickup beat.
    const keep = [];
    for (let i = 0; i < body.offsets.length; i++) {
        const o = body.offsets[i], d = body.durations[i];
        if (o >= mergePoint) continue;                       // starts inside the pickup region → drop
        keep.push({ note: body.notes[i], offset: o, duration: Math.min(d, mergePoint - o), idx: i });
    }
    const mergedNotes = keep.map(k => k.note);
    const mergedOffsets = keep.map(k => k.offset);
    const mergedDurations = keep.map(k => k.duration);
    const mergedTies = body.ties ? keep.map(k => body.ties[k.idx]) : undefined;
    const mergedTriplets = body.triplets ? keep.map(k => body.triplets[k.idx]) : undefined;
    anacrusisIdx.forEach((i) => {
        mergedNotes.push(melody.notes[i]);
        mergedOffsets.push(lastMeasureStart + melody.offsets[i]);   // same beat, in the last measure
        mergedDurations.push(melody.durations[i]);
        if (mergedTies) mergedTies.push(melody.ties?.[i] ?? null);
        if (mergedTriplets) mergedTriplets.push(melody.triplets?.[i] ?? null);
    });
    const loopMerged = { ...body, notes: mergedNotes, offsets: mergedOffsets, durations: mergedDurations };
    if (mergedTies) loopMerged.ties = mergedTies;
    if (mergedTriplets) loopMerged.triplets = mergedTriplets;

    return { hasAnacrusis: true, intro, loopClean, loopMerged, bodyMeasures };
};
