// #661/Level 2 (Han 2026-08-02): force EVERY note in a melody to a quarter note. A note longer than a quarter
// becomes a quarter + a rest for the remainder (e.g. a half note → quarter + quarter-rest; a whole → quarter +
// dotted-half-rest). Sub-quarter notes and rests pass through unchanged. This is a POST-process applied AFTER
// the generator produces the melody (settings-driven, uniform across instruments — respects the §6b invariant
// that variation lives in InstrumentSettings fields, never in per-instrument branches inside the generator).
//
// Ties are dropped: every kept note is now a standalone quarter, so nothing is tied. Offsets stay consistent —
// the inserted rest sits at the note's offset + a quarter, so the following note keeps its original offset.

const QUARTER = 12;   // ticks per quarter note (GLOBAL_RESOLUTION-based, 12 ticks/beat)

export default function forceQuarterNotes(melody) {
    if (!melody || !Array.isArray(melody.notes)) return melody;
    const src = melody;
    const hasTrip = Array.isArray(src.triplets);
    const notes = [];
    const offsets = [];
    const durations = [];
    const triplets = [];
    for (let i = 0; i < src.notes.length; i++) {
        const note = src.notes[i];
        const off = src.offsets[i];
        const dur = src.durations[i];
        const isReal = note !== 'r' && note !== 'c' && note != null;
        if (isReal && dur > QUARTER) {
            notes.push(note); offsets.push(off); durations.push(QUARTER); if (hasTrip) triplets.push(null);
            notes.push('r'); offsets.push(off + QUARTER); durations.push(dur - QUARTER); if (hasTrip) triplets.push(null);
        } else {
            notes.push(note); offsets.push(off); durations.push(dur); if (hasTrip) triplets.push(src.triplets[i]);
        }
    }
    return {
        notes,
        offsets,
        durations,
        ties: new Array(notes.length).fill(null),
        ...(hasTrip ? { triplets } : {}),
    };
}
