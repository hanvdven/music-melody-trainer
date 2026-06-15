// utils/anacrusisRepeat.js
//
// Pickup (anacrusis) REPEAT support (Han 2026-06-14). When a song has a leading anacrusis and it
// REPEATS, the pickup of the next repeat must flow out of the END of the previous repeat's last
// bar — not replay as a separate padded measure with a dead rest. Musically the final note shortens
// on non-final repeats to free the pickup beat, and rings full only on the last repeat.
//
// This module is the PURE core. It treats measure 0 ([0, measureLen)) as the anacrusis bar to be
// lifted out of the repeating loop, and returns the pieces the Sequencer + sheet renderer need:
//
//   intro      — notes lying ENTIRELY within m0 (the pickup). Played ONCE, before repeat 1.
//   loopClean  — the body (everything from m1 on), rebased to offset 0. A note that STRADDLES the
//                m0→m1 boundary (e.g. a chord that starts in the pickup bar and holds into m1 — HBD's
//                first chord does exactly this) is clipped to its m1 portion, so chords/bass survive.
//   loopMerged — loopClean with the pickup merged into the end of the last body bar: a note that
//                overlaps the pickup beat is clipped to the pickup onset, then the pickup notes are
//                appended at that beat. A track with NO pickup notes (chords, pickup-less bass) loops
//                its body unchanged (loopMerged === loopClean).
//
// IMPORTANT: this function assumes m0 IS an anacrusis bar — the caller must gate on the SONG's
// treble (`hasAnacrusis`) and then apply the parts to EVERY track, because a chord track that merely
// straddles m0 has no leading rest of its own yet still needs the same rebasing.
//
// All offsets/durations are in ticks. `measureLen` = ticks per measure. NOTE: song-level `fermatas`
// are absolute-tick events, not per-note arrays — the caller must re-base them by -measureLen.

// Parallel per-note arrays that must travel WITH the notes when we slice/merge a melody.
// lyrics (HBD's words) and displayNotes (chord objects) are the ones that silently desync
// if forgotten — the words/labels would stick to the wrong notes after a merge.
const PARALLEL_KEYS = ['ties', 'triplets', 'lyrics', 'displayNotes'];

// Build a melody-like object from entries { idx, offset, duration }, where `idx` indexes into `base`.
// notes + every present parallel array follow their note via `idx`; offset/duration come from the entry
// (so a straddler can carry a clipped duration without disturbing the source).
const build = (base, entries) => {
    const out = { ...base };
    out.notes = entries.map(e => base.notes[e.idx]);
    out.offsets = entries.map(e => e.offset);
    out.durations = entries.map(e => e.duration);
    for (const k of PARALLEL_KEYS) if (base[k]) out[k] = entries.map(e => base[k][e.idx] ?? null);
    return out;
};

/**
 * @param {object} melody  { notes, offsets, durations, ties?, triplets?, lyrics?, displayNotes? }
 * @param {number} measureLen ticks per measure
 * @returns {{hasAnacrusis: boolean, intro: object|null, loopClean: object, loopMerged: object|null, bodyMeasures?: number}}
 */
export const buildAnacrusisRepeatParts = (melody, measureLen) => {
    const offs = melody?.offsets;
    if (!offs || offs.length === 0 || measureLen <= 0) {
        return { hasAnacrusis: false, intro: null, loopClean: melody, loopMerged: null };
    }

    // Classify each note against measure 0 = [0, measureLen).
    const introEntries = [];   // notes entirely inside m0 → the pickup (offsets unchanged)
    const bodyEntries = [];    // body notes, rebased by -measureLen (straddlers clipped to the m1 side)
    for (let i = 0; i < offs.length; i++) {
        const o = offs[i], d = melody.durations[i];
        if (o + d <= measureLen) {
            introEntries.push({ idx: i, offset: o, duration: d });                 // pure m0 → pickup
        } else if (o < measureLen) {
            bodyEntries.push({ idx: i, offset: 0, duration: o + d - measureLen });  // straddler → m1 part
        } else {
            bodyEntries.push({ idx: i, offset: o - measureLen, duration: d });      // pure body
        }
    }

    // Self-check for THIS track (a leading rest inside m0). The caller gates on the treble's value.
    const hasAnacrusis = offs[0] > 0 && offs[0] < measureLen;
    const intro = introEntries.length ? build(melody, introEntries) : null;

    if (bodyEntries.length === 0) {
        return { hasAnacrusis, intro, loopClean: melody, loopMerged: null };
    }

    const loopClean = build(melody, bodyEntries);
    const maxOffset = Math.max(...bodyEntries.map(e => e.offset));
    const lastMeasureStart = Math.floor(maxOffset / measureLen) * measureLen;   // start of last body bar
    const bodyMeasures = lastMeasureStart / measureLen + 1;

    // Merge the pickup into the last bar — only for a track that actually carries the pickup.
    let loopMerged = loopClean;
    if (introEntries.length) {
        const pickupStart = introEntries[0].offset;             // first pickup onset (e.g. 24)
        const mergePoint = lastMeasureStart + pickupStart;       // pickup beat of the last body bar
        const kept = bodyEntries
            .filter(e => e.offset < mergePoint)                 // a note starting in the pickup region → drop
            .map(e => ({ idx: e.idx, offset: e.offset, duration: Math.min(e.duration, mergePoint - e.offset) }));
        const appended = introEntries.map(e => ({ idx: e.idx, offset: lastMeasureStart + e.offset, duration: e.duration }));
        loopMerged = build(melody, [...kept, ...appended]);
    }

    return { hasAnacrusis, intro, loopClean, loopMerged, bodyMeasures };
};
