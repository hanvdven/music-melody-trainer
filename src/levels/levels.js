// #659 Levels — a "level" applies a fixed generation + visibility config, then the player clears waves of
// slimes (the #647 combat) until a target measure count, then a "Well done!" splash with stats.

// #661 rework (Han 2026-08-02): "elke kwartnoot moet kwartnoot of rust zijn" for the early levels, produced
// ROBUSTLY at the GENERATOR level (§6c: reuse existing generation settings — no RPG-layer/post-process
// hack). Three EXISTING InstrumentSettings fields, combined, guarantee this:
//   - smallestNoteDenom: 4  → caps the generator's slot resolution at one quarter (the finest note it will
//     ever place), so no sub-quarter subdivision exists to merge into a longer note in the first place.
//   - insertBeatRests: true → melodyGenerator's step-4f `insertRestsAtBeats` turns every EMPTY on-beat slot
//     into an explicit 'r' BEFORE Melody.fromFlattenedNotes runs. This is the field that was missing: with
//     it OFF (the treble default), an inactive quarter-slot instead silently EXTENDS the duration of the
//     PRECEDING note (that's how a "long note" is represented at all) — and Melody.fromFlattenedNotes'
//     leading-rest edge case additionally left a piece-opening rest with a null offset (invisible — no
//     note, no rest, nothing rendered: the reported "maat 8 is leeg" / gap symptom). With insertBeatRests
//     on, no null slot ever reaches that merge step, so no long note and no invisible leading gap can occur.
//   - polyMultiplier: 1 (the default) → keeps tuplet injection off (generateRankedRhythm only injects
//     tuplets when polyMultiplier > 1), so no beat is ever subdivided into a triplet etc. Set EXPLICITLY
//     here (not just left at its default) so a stale higher Polyrhythm setting from elsewhere in the app
//     can never leak into these levels.
// The combination means NO note or rest is ever longer than a quarter and NO tie is ever needed (ties only
// arise from a note spanning a barline; every quarter aligns with every barline). forceQuarterNotes.js (the
// old post-process patch, which had its own null-entry/leading-gap bugs) is retired — deleted, not disabled.
const QUARTER_GRID = { smallestNoteDenom: 4, insertBeatRests: true, polyMultiplier: 1 };

// Level 1 (Han 2026-08-01, quarter-grid since 2026-08-02): treble only (chords/bass/percussion hidden),
// 2 measures, 1 repeat, 2 notes per measure, 30% variability, range C4–G4, quarter-note/quarter-rest grid.
// Done after 8 measures = 4 cleared waves of 2 measures each.
export const LEVEL1 = {
    id: 1,
    name: 'Level 1',
    numMeasures: 2,
    numRepeats: 1,
    notesPerMeasure: 2,
    variability: 30,              // rhythmVariability 0–100
    range: { min: 'C4', max: 'G4' },
    totalMeasures: 8,             // level complete after this many measures cleared
    ...QUARTER_GRID,
    // Han 2026-08-02: "in level 1 en 2, toon de bas en percussie ENKEL in debug mode" — bass/percussion
    // notation is hidden by default, visible only while debugMode is on (useLevel reacts live to the
    // debugMode toggle, no restart needed). Level 3 keeps them always visible (debugOnlyLines: false).
    debugOnlyLines: true,
};

// Level 3 (Han 2026-08-02): what used to be Level 2 — the side-scroll level with 2 notes/measure, 30%
// variability, FULL generation richness (mixed durations, ties, tuplets if Polyrhythm is on elsewhere) —
// "gewoon gegenereerd zoals nu" (Han). Deliberately does NOT spread LEVEL1 (which now carries QUARTER_GRID)
// — it lists its own base fields so it is never accidentally pulled onto the quarter grid.
export const LEVEL3 = {
    id: 3,
    name: 'Level 3',
    numMeasures: 8,             // one continuous 8-measure piece (no mid-level regeneration → no seam,
                                 // see the #661 UAT note this replaced: "maatblokken sluiten niet naadloos aan")
    numRepeats: 1,
    notesPerMeasure: 2,
    variability: 30,
    range: { min: 'C4', max: 'G4' },
    totalMeasures: 8,
    bpm: 80,
    sideScroll: true,
    beatsOnScreen: 8,            // spawn (right) → hero (left) takes this many beats
    // Explicit (not merely "unset") so a stale value from a just-played Level 1/2 in the SAME session can
    // never leak in — useLevel.applyConfig writes these fields unconditionally on every level switch.
    insertBeatRests: false,
    polyMultiplier: 1,
    fixedBass: false,   // Level 3 keeps the REAL generated bass melody (Han: "gewoon zoals nu")
    debugOnlyLines: false,   // Level 3 always shows all 3 lines (Han only asked for 1/2 to be debug-gated)
};

// Level 2 (Han 2026-08-02): a SIMPLER on-ramp — 3 notes/measure, 30% variability, same side-scroll engine
// as Level 3, PLUS the quarter-note/quarter-rest grid (QUARTER_GRID, overridden on top of LEVEL3's shape).
// `fixedBass: true` (Han, same day, UAT): the generated bass melody sounded great in general but was an
// octave too high through the cello timbre in Level 2 specifically — rather than chase the register match,
// Han opted to simplify Level 2's bass to a fixed C2 whole note per measure (utils/celloWholeNotePattern.js,
// an explicitly authorized hardcoded exception, same spirit as the timpani pattern).
export const LEVEL2 = {
    ...LEVEL3,
    id: 2,
    name: 'Level 2',
    notesPerMeasure: 3,
    variability: 30,
    ...QUARTER_GRID,
    fixedBass: true,
    debugOnlyLines: true,   // overrides LEVEL3's false — Level 2 IS debug-gated (Han: "level 1 en 2")
};

export const LEVELS = { 1: LEVEL1, 2: LEVEL2, 3: LEVEL3 };

// waves to clear = total measures / measures-per-wave (each cleared slime-wave is one melody = numMeasures).
export const wavesForLevel = (lvl) => Math.max(1, Math.round(lvl.totalMeasures / lvl.numMeasures));

// treble-only staff visibility, in the playbackConfig `eyes` shape the app already uses (see PresetPicker).
export const trebleOnlyEyes = (rounds) => ({
    ...rounds, trebleEye: true, bassEye: false, percussionEye: false, chordsEye: false,
});

// #661 (Han 2026-08-02, "de 3 lijnen zichtbaar maken"): side-scroll levels show treble + bass + percussion
// (all 3 scroll — SheetRpgLayer §661) with chords hidden (a level has no chord track/UI).
export const threeLineEyes = (rounds) => ({
    ...rounds, trebleEye: true, bassEye: true, percussionEye: true, chordsEye: false,
});
