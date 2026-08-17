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
const PATTERN = ['C2', 'C2', 'C3', null];
const QUARTER = TICKS_PER_WHOLE / 4;   // 12 ticks

// #994 (Han 2026-08-14/17, "flexible on screen notes"): `silentLeadMeasures` makes the FIRST N measures
// all rests. A side-scroll level's lead-in is now as long as its on-screen span (up to 4 measures for
// Kalinka's 2/4), but only its LAST `countInBars` measures are an audible count-in — the earlier ones are
// scenery: visible notation and barlines, no sound. The silence is baked into the pattern itself rather
// than gated at the scheduling call site, because §108 requires the moving percussion STAFF to be built
// from the exact same pattern the AUDIO is scheduled from (App.jsx's timpaniMelody and SheetMusic.jsx's
// scrollPercussionMelody both call this with the same args) — gating only the audio would show the staff
// playing timpani through measures that are actually silent. Offsets/durations stay fully dense so the
// pattern's tick timeline is unchanged; only the pitches become 'r'.
export default function buildTimpaniPattern(numMeasures, timeSignature = [4, 4], silentLeadMeasures = 0) {
    const measureTicks = TICKS_PER_WHOLE * (timeSignature[0] / timeSignature[1]);
    const quartersPerMeasure = Math.max(1, Math.round(measureTicks / QUARTER));
    const totalQuarters = quartersPerMeasure * Math.max(1, numMeasures);
    const notes = [], offsets = [], durations = [];
    for (let i = 0; i < totalQuarters; i++) {
        const beatInMeasure = i % quartersPerMeasure;
        const inSilentLeadIn = Math.floor(i / quartersPerMeasure) < silentLeadMeasures;
        notes.push(inSilentLeadIn ? 'r' : (PATTERN[beatInMeasure % PATTERN.length] ?? 'r'));
        offsets.push(i * QUARTER);
        durations.push(QUARTER);
    }
    return { notes, offsets, durations, ties: new Array(notes.length).fill(null) };
}
