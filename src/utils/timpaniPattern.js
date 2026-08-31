import { TICKS_PER_WHOLE } from '../constants/timing';

// #661 (Han 2026-08-02, "melodische percussie" / Level 2-3 timpani backing): a FIXED pattern — C2, C2,
// C3, rest — repeated every measure. Explicitly hardcoded per Han's own direction ("je mag uitzonderlijk
// hardcoded pauken gebruiken … voorlopig geen generatie") — deliberately NOT routed through
// MelodyGenerator (§6c is waived here by explicit instruction, not by omission). Single source of truth
// for BOTH the visual notation (when `percussionSettings.melodic` is on) and the level's timpani audio,
// so the two can never drift apart.
//
// Bug fix (Han 2026-08-11, #871 UAT: "Scarborough Fair is in 3/4, maar de timpanen spelen in 4/4"): the
// pattern index USED to be a single free-running counter across the whole piece, never reset at a
// barline — for a 4/4 song that's indistinguishable from "restart every measure" (quartersPerMeasure=4
// happens to equal the pattern's own length), but for a 3/4 song (quartersPerMeasure=3) each subsequent
// measure started on a DIFFERENT pattern index than the last (measure 1: C2 C2 C3, measure 2: rest C2
// C2, measure 3: C3 rest C2, ...) — audibly and visually drifting out of phase with the actual barlines,
// i.e. "playing in 4/4" regardless of the song's own meter. Now indexed by BEAT-WITHIN-MEASURE instead of
// an absolute counter, so beat 1 of every measure always lands on the pattern's own downbeat (PATTERN[0])
// — byte-identical output for 4/4 (quartersPerMeasure===PATTERN.length, so this is a no-op there).
// #1096 (Han 2026-08-20, rubato gate-synced timpani): exported so `useLevelGatedRubatoAudio.js` can look
// up "which pitch does beat N of a measure hit" directly — the SAME pattern array `buildTimpaniPattern`
// below already uses (§6c, one source of truth, not a second copy of the C2/C2/C3/rest sequence).
export const TIMPANI_BEAT_PATTERN = ['C2', 'C2', 'C3', null];
const PATTERN = TIMPANI_BEAT_PATTERN;
const QUARTER = TICKS_PER_WHOLE / 4;   // 12 ticks

// #994 (Han 2026-08-14/17, "flexible on screen notes"): a side-scroll level's lead-in is now as long as
// its on-screen span (4 measures for Kalinka's 2/4) instead of a fixed 2, and TIMPANI SOUNDS THROUGH ALL
// OF IT. An earlier #994 draft added a third `silentLeadMeasures` parameter that rested out the first N
// measures, so the earliest lead-in measures were visible-but-silent scenery. Han live-tested that on
// Kalinka and rejected it — *"alle opmaten cello+timpanen. de tweede helft (round up) + metronoom
// erbij"*: every lead-in measure carries cello+timpani, and only the METRONOME is staggered (which this
// function has nothing to do with — see useLevelBackingStream.js). The parameter was therefore removed
// rather than left defaulting to 0 (§7: no dead configurability), so nothing can reintroduce leading
// silence here by accident. Callers pass only (numMeasures, timeSignature); App.jsx's `timpaniMelody`
// and SheetMusic.jsx's `scrollPercussionMelody` must stay argument-identical, per §108.
//
// Bug fix (#1044, Han 2026-08-17, "levels met bijv 7/8 maten werken nog niet goed - veel glitches"):
// this used to derive a single `quartersPerMeasure = Math.round(measureTicks / QUARTER)` and then lay
// hits out on a UNIFORM quartersPerMeasure-per-measure grid (`i * QUARTER` where `i` free-runs across
// the whole piece). That rounding is exact for any meter whose measure divides evenly into quarter
// notes (4/4, 3/4, 2/4, 6/8, …) but for 7/8 (42 ticks = 3.5 quarters) it rounds to 4 — so each
// "measure" of hits the loop laid out was actually 48 ticks of uniform grid, 6 ticks longer than the
// REAL 42-tick measure. That 6-tick error compounded every single measure (measure 2 already 12 ticks
// off, measure 3 18 ticks off, …), an ever-growing desync between the timpani/notation and the real
// barlines. Fixed by deriving `beatInMeasure`/measure membership from each hit's OWN absolute tick
// position modulo the REAL `measureTicks`, instead of from a rounded per-measure hit count — every
// measure re-syncs to its own true boundary, so any phase slip within a measure (unavoidable when a
// meter doesn't divide evenly into quarters) never accumulates into the next one. Byte-identical output
// for every meter that DOES divide evenly (the whole existing test suite), since `beatInMeasure` reduces
// to the old `i % quartersPerMeasure` exactly when `measureTicks` is a multiple of `QUARTER`.
export default function buildTimpaniPattern(numMeasures, timeSignature = [4, 4]) {
    const measureTicks = TICKS_PER_WHOLE * (timeSignature[0] / timeSignature[1]);
    const totalTicks = measureTicks * Math.max(1, numMeasures);
    const notes = [], offsets = [], durations = [];
    for (let t = 0; t < totalTicks; t += QUARTER) {
        const measureIndex = Math.floor(t / measureTicks);
        const beatInMeasure = Math.floor((t - measureIndex * measureTicks) / QUARTER);
        notes.push(PATTERN[beatInMeasure % PATTERN.length] ?? 'r');
        offsets.push(t);
        durations.push(QUARTER);
    }
    return { notes, offsets, durations, ties: new Array(notes.length).fill(null) };
}
