// #661 (Han 2026-08-02, "de metronoom moet beginnen op maat 0"): prepends ONE extra bar of clicks to a
// generated metronome melody, by duplicating the melody's OWN first bar (its deterministic/uniform click
// pattern repeats every measure, so bar 1 is a faithful stand-in for a lead-in bar) — no new generation,
// no hardcoded click pattern. Scheduling the RESULT starting one bar before the level's real content start
// (App.jsx) lands the duplicated bar at "measure 0" and the untouched original melody at "measure 1"
// onward, exactly where it already plays today.
export default function withMetronomeLeadIn(metronomeMelody, measureTicks) {
    const { notes, offsets, durations } = metronomeMelody;
    const leadInNotes = [], leadInOffsets = [], leadInDurations = [];
    for (let i = 0; i < offsets.length; i++) {
        if (offsets[i] != null && offsets[i] < measureTicks) {
            leadInNotes.push(notes[i]);
            leadInOffsets.push(offsets[i]);
            leadInDurations.push(durations[i]);
        }
    }
    const shiftedOffsets = offsets.map((o) => (o == null ? o : o + measureTicks));
    return {
        notes: [...leadInNotes, ...notes],
        offsets: [...leadInOffsets, ...shiftedOffsets],
        durations: [...leadInDurations, ...durations],
    };
}
