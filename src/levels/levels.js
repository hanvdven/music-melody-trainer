// #659 Levels — a "level" applies a fixed generation + visibility config, then the player clears waves of
// slimes (the #647 combat) until a target measure count, then a "Well done!" splash with stats.
//
// Level 1 (Han 2026-08-01): treble only (chords/bass/percussion hidden), 2 measures, 1 repeat, 2 notes per
// measure, 30% variability, range C4–G4. Done after 8 measures = 4 cleared waves of 2 measures each.

export const LEVEL1 = {
    id: 1,
    name: 'Level 1',
    numMeasures: 2,
    numRepeats: 1,
    notesPerMeasure: 2,
    variability: 30,              // rhythmVariability 0–100
    range: { min: 'C4', max: 'G4' },
    totalMeasures: 8,             // level complete after this many measures cleared
};

// Level 2 (Han 2026-08-01): same as Level 1 + bpm 80, but SIDE-SCROLL — slimes fly in from the right (walk
// animation, hopping), a note is 8 beats on screen, and you may only kill the leftmost slime once it reaches
// the HIT-ZONE by the hero (playing too early misses; a slime that reaches the hero un-killed fades = miss).
//
// #661 (Han UAT 2026-08-01: "maatblokken sluiten niet naadloos aan"): Level 2 is ONE continuous 8-measure
// piece, NOT 4 regenerated 2-measure waves. The seam Han saw came from mid-level regeneration resetting the
// scroll clock (a fresh 2-bar lead-in = the gap). With numMeasures=8 the whole level is a single wave: one
// generation, one lead-in, and measures 1–8 scroll seamlessly. `wavesForLevel` = round(8/8) = 1, so the
// "Well done!" splash fires once the whole piece is resolved.
// Level 3 (Han 2026-08-02): what used to be Level 2 — the side-scroll with 2 notes/measure, 30% variability,
// mixed durations. Shifted up one slot so Level 2 can be an EASIER on-ramp.
export const LEVEL3 = {
    ...LEVEL1,
    id: 3,
    name: 'Level 3',
    bpm: 80,
    numMeasures: 8,             // one continuous 8-measure piece (no mid-level regeneration → no seam)
    sideScroll: true,
    beatsOnScreen: 8,            // spawn (right) → hero (left) takes this many beats
};

// Level 2 (Han 2026-08-02): a SIMPLER on-ramp — 3 notes/measure, 30% variability, smallest note = quarter,
// and EVERY note forced to a quarter (longer notes → quarter + rests; see forceQuarterNotes). Same
// side-scroll engine as Level 3.
export const LEVEL2 = {
    ...LEVEL3,
    id: 2,
    name: 'Level 2',
    notesPerMeasure: 3,
    variability: 30,
    smallestNoteDenom: 4,       // quarter is the smallest generated note
    forceQuarterNotes: true,    // NEW: post-process every note into a quarter (pad the remainder with rests)
};

export const LEVELS = { 1: LEVEL1, 2: LEVEL2, 3: LEVEL3 };

// waves to clear = total measures / measures-per-wave (each cleared slime-wave is one melody = numMeasures).
export const wavesForLevel = (lvl) => Math.max(1, Math.round(lvl.totalMeasures / lvl.numMeasures));

// treble-only staff visibility, in the playbackConfig `eyes` shape the app already uses (see PresetPicker).
export const trebleOnlyEyes = (rounds) => ({
    ...rounds, trebleEye: true, bassEye: false, percussionEye: false, chordsEye: false,
});
