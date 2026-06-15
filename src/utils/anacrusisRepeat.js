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

// Parallel per-note arrays that must travel WITH the notes when we slice/merge a melody.
// lyrics (HBD's words) and displayNotes (chord objects) are the ones that silently desync
// if forgotten — the words/labels would stick to the wrong notes after a merge.
const PARALLEL_KEYS = ['ties', 'triplets', 'lyrics', 'displayNotes'];

// Rebuild a melody-like object keeping only the given indices (preserves any parallel arrays).
const pick = (mel, idxs) => {
    const out = { ...mel };
    out.notes = idxs.map(i => mel.notes[i]);
    out.offsets = idxs.map(i => mel.offsets[i]);
    out.durations = idxs.map(i => mel.durations[i]);
    for (const k of PARALLEL_KEYS) if (mel[k]) out[k] = sliceArr(mel[k], idxs);
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
    // `keep` records the surviving BODY indices; the appended pickup is taken from the ORIGINAL
    // melody at anacrusisIdx. All parallel arrays follow their note via these index lists.
    const keep = [];
    for (let i = 0; i < body.offsets.length; i++) {
        const o = body.offsets[i], d = body.durations[i];
        if (o >= mergePoint) continue;                       // starts inside the pickup region → drop
        keep.push({ offset: o, duration: Math.min(d, mergePoint - o), idx: i });
    }
    const loopMerged = { ...body };
    loopMerged.notes = [...keep.map(k => body.notes[k.idx]), ...anacrusisIdx.map(i => melody.notes[i])];
    loopMerged.offsets = [
        ...keep.map(k => k.offset),
        ...anacrusisIdx.map(i => lastMeasureStart + melody.offsets[i]),  // same beat, in the last bar
    ];
    loopMerged.durations = [...keep.map(k => k.duration), ...anacrusisIdx.map(i => melody.durations[i])];
    for (const k of PARALLEL_KEYS) {
        if (!body[k] && !melody[k]) continue;
        loopMerged[k] = [
            ...keep.map(kk => body[k]?.[kk.idx] ?? null),
            ...anacrusisIdx.map(i => melody[k]?.[i] ?? null),
        ];
    }

    return { hasAnacrusis: true, intro, loopClean, loopMerged, bodyMeasures };
};
