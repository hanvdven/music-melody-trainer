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
export const LEVEL2 = {
    ...LEVEL1,
    id: 2,
    name: 'Level 2',
    bpm: 80,
    sideScroll: true,
    beatsOnScreen: 8,            // spawn (right) → hero (left) takes this many beats
};

export const LEVELS = { 1: LEVEL1, 2: LEVEL2 };

// waves to clear = total measures / measures-per-wave (each cleared slime-wave is one melody = numMeasures).
export const wavesForLevel = (lvl) => Math.max(1, Math.round(lvl.totalMeasures / lvl.numMeasures));

// treble-only staff visibility, in the playbackConfig `eyes` shape the app already uses (see PresetPicker).
export const trebleOnlyEyes = (rounds) => ({
    ...rounds, trebleEye: true, bassEye: false, percussionEye: false, chordsEye: false,
});
