import { TICKS_PER_WHOLE } from '../constants/timing';

// #661 (Han 2026-08-02, "melodische percussie" / Level 2-3 timpani backing): a FIXED pattern — C2, C2,
// C3, rest — repeated every measure. Explicitly hardcoded per Han's own direction ("je mag uitzonderlijk
// hardcoded pauken gebruiken … voorlopig geen generatie") — deliberately NOT routed through
// MelodyGenerator (§6c is waived here by explicit instruction, not by omission). Single source of truth
// for BOTH the visual notation (when `percussionSettings.melodic` is on) and the level's timpani audio,
// so the two can never drift apart.
//
// Cycles the 4-beat pattern by quarter-beat index so it degrades gracefully for any time signature (the
// pattern itself is authored for 4/4 — Han's spec).
const PATTERN = ['C2', 'C2', 'C3', null];
const QUARTER = TICKS_PER_WHOLE / 4;   // 12 ticks

export default function buildTimpaniPattern(numMeasures, timeSignature = [4, 4]) {
    const measureTicks = TICKS_PER_WHOLE * (timeSignature[0] / timeSignature[1]);
    const quartersPerMeasure = Math.max(1, Math.round(measureTicks / QUARTER));
    const totalQuarters = quartersPerMeasure * Math.max(1, numMeasures);
    const notes = [], offsets = [], durations = [];
    for (let i = 0; i < totalQuarters; i++) {
        notes.push(PATTERN[i % PATTERN.length] ?? 'r');
        offsets.push(i * QUARTER);
        durations.push(QUARTER);
    }
    return { notes, offsets, durations, ties: new Array(notes.length).fill(null) };
}
