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

// waves to clear = total measures / measures-per-wave (each cleared slime-wave is one melody = numMeasures).
export const wavesForLevel = (lvl) => Math.max(1, Math.round(lvl.totalMeasures / lvl.numMeasures));

// treble-only staff visibility, in the playbackConfig `eyes` shape the app already uses (see PresetPicker).
export const trebleOnlyEyes = (rounds) => ({
    ...rounds, trebleEye: true, bassEye: false, percussionEye: false, chordsEye: false,
});
