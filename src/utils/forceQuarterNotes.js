// #661/Level 2 (Han 2026-08-02): force EVERY note in a melody to a quarter note. A note longer than a quarter
// becomes a quarter + rest(s) for the remainder. Sub-quarter notes pass through unchanged. This is a
// POST-process applied AFTER the generator produces the melody (settings-driven, uniform across instruments —
// respects the §6b invariant that variation lives in InstrumentSettings fields, never in per-instrument
// branches inside the generator).
//
// Rests are ALSO split into QUARTER-rest chunks (Han 2026-08-02: "elke kwart tel een kwartnoot of een rust
// zien") — a half/whole rest would otherwise render as one long rest and break the beat-per-beat reading grid
// Level 2 teaches. A rest that isn't a whole multiple of a quarter keeps its sub-quarter remainder as a final
// short chunk (can't stretch it without shifting the next note).
//
// Ties are dropped: every kept note is now a standalone quarter, so nothing is tied. Offsets stay consistent —
// inserted rest chunks tile the gap exactly, so the following note keeps its original offset.

const QUARTER = 12;   // ticks per quarter note (GLOBAL_RESOLUTION-based, 12 ticks/beat)

export default function forceQuarterNotes(melody) {
    if (!melody || !Array.isArray(melody.notes)) return melody;
    const src = melody;
    const hasTrip = Array.isArray(src.triplets);
    const notes = [];
    const offsets = [];
    const durations = [];
    const triplets = [];
    // Emit a rest of `dur` ticks at `off` as quarter chunks (+ a sub-quarter remainder chunk if any).
    const pushRests = (off, dur) => {
        let o = off, left = dur;
        while (left > 0) {
            const chunk = Math.min(QUARTER, left);
            notes.push('r'); offsets.push(o); durations.push(chunk); if (hasTrip) triplets.push(null);
            o += chunk; left -= chunk;
        }
    };
    for (let i = 0; i < src.notes.length; i++) {
        const note = src.notes[i];
        const off = src.offsets[i];
        const dur = src.durations[i];
        const isReal = note !== 'r' && note !== 'c' && note != null;
        if (isReal && dur > QUARTER) {
            notes.push(note); offsets.push(off); durations.push(QUARTER); if (hasTrip) triplets.push(null);
            pushRests(off + QUARTER, dur - QUARTER);
        } else if (note === 'r' && dur > QUARTER) {
            pushRests(off, dur);
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
