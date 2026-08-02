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

// #661 (Han 2026-08-02, "houd het simpel... introduceer stap voor stap: halve noten, achtste noten,
// verbonden noten"): the two rungs above QUARTER_GRID on the way to full richness (§93/old Level 3, now
// Level 8). `insertBeatRests: false` is the ONE thing that allows a note to be longer than the grid unit
// at all (an inactive slot then EXTENDS the previous note instead of becoming an explicit rest, §91) — so
// turning it off is what "unlocks" half notes. Once a note can be longer than a quarter, it can also
// occasionally span a barline, which the existing rendering pipeline notates with a TIE — a real musical
// necessity, not a separate on/off flag (§6c: reuse — don't invent a second "no ties" mechanism). HALF_NOTE
// keeps the quarter grid resolution (only note LENGTH relaxes); EIGHTH_NOTE additionally finens the grid so
// eighth notes can appear too.
const HALF_NOTE_GRID = { smallestNoteDenom: 4, insertBeatRests: false, polyMultiplier: 1 };
const EIGHTH_NOTE_GRID = { smallestNoteDenom: 8, insertBeatRests: false, polyMultiplier: 1 };

// Level 1 (Han 2026-08-01, quarter-grid since 2026-08-02): treble only (chords/bass/percussion hidden),
// 2 measures, 1 repeat, 2 notes per measure, 30% variability, range C4–G4, quarter-note/quarter-rest grid.
// Done after 8 measures = 4 cleared waves of 2 measures each.
export const LEVEL1 = {
    id: 1,
    name: 'Level 1',
    bpm: 80,                      // not scheduled (static, non-scrolling) — kept for the splash's info panel
    numMeasures: 2,
    numRepeats: 1,
    notesPerMeasure: 2,
    variability: 30,              // rhythmVariability 0–100
    range: { min: 'C4', max: 'G4' },
    totalMeasures: 8,             // level complete after this many measures cleared
    ...QUARTER_GRID,
    // Han 2026-08-02: "in level 1 en 2, toon de bas en percussie ENKEL in debug mode" — bass/percussion
    // notation is hidden by default, visible only while debugMode is on (useLevel reacts live to the
    // debugMode toggle, no restart needed).
    debugOnlyLines: true,
    enemyType: 'Slime',           // Han: "gewoon slimes" — every level, no bestiary theme swap
    intro: 'Kwartnoten en rusten — je eerste gevecht.',
};

// Level 2 (Han 2026-08-02): a SIMPLER on-ramp — 3 notes/measure, 30% variability, side-scroll combat,
// PLUS the quarter-note/quarter-rest grid (QUARTER_GRID). `fixedBass: true` (Han, same-day UAT): the
// generated bass melody sounded great in general but was an octave too high through the cello timbre in
// Level 2 specifically — rather than chase the register match, Han opted to simplify Level 2's bass to a
// fixed C2 whole note per measure (utils/celloWholeNotePattern.js, an explicitly authorized hardcoded
// exception, same spirit as the timpani pattern).
export const LEVEL2 = {
    id: 2,
    name: 'Level 2',
    bpm: 80,
    numMeasures: 8,             // one continuous 8-measure piece (no mid-level regeneration → no seam,
                                 // see the #661 UAT note this replaced: "maatblokken sluiten niet naadloos aan")
    numRepeats: 1,
    notesPerMeasure: 3,
    variability: 30,
    range: { min: 'C4', max: 'G4' },
    totalMeasures: 8,
    sideScroll: true,
    beatsOnScreen: 8,            // spawn (right) → hero (left) takes this many beats
    ...QUARTER_GRID,
    fixedBass: true,
    debugOnlyLines: true,
    enemyType: 'Slime',
    intro: 'Side-scrollend gevecht — bas en metronoom worden hoorbaar.',
};

// Levels 3–7 (Han 2026-08-02, "langzaam opbouwen... stap voor stap"): each rung introduces exactly ONE new
// notation concept on top of the previous rung, ramping from Level 2's quarter-grid toward Level 8's full
// richness. Deliberately vary only the ONE headline setting per level (§6c: minimal, legible diffs) — bpm,
// range, notesPerMeasure etc. stay at Level 2's values unless a level's OWN headline is that axis.
export const LEVEL3 = {
    ...LEVEL2,
    id: 3,
    name: 'Level 3',
    ...HALF_NOTE_GRID,
    intro: 'Halve noten.',
};

export const LEVEL4 = {
    ...LEVEL3,
    id: 4,
    name: 'Level 4',
    ...EIGHTH_NOTE_GRID,
    intro: 'Achtste noten.',
};

export const LEVEL5 = {
    ...LEVEL4,
    id: 5,
    name: 'Level 5',
    notesPerMeasure: 4,   // a bit denser so a note is more likely to reach across a barline
    intro: 'Verbonden noten (ties) over de maatstreep.',
};

export const LEVEL6 = {
    ...LEVEL5,
    id: 6,
    name: 'Level 6',
    range: { min: 'C4', max: 'C5' },   // a full octave, up from the fifth (C4–G4) every prior level used
    intro: 'Groter notenbereik (C4–C5).',
};

export const LEVEL7 = {
    ...LEVEL6,
    id: 7,
    name: 'Level 7',
    debugOnlyLines: false,   // the last training wheel: bas + percussie voortaan altijd zichtbaar
    intro: 'Bas en percussie altijd zichtbaar.',
};

// Level 8 (Han 2026-08-02: "level 3 schuift door naar level 8" — this is the UNCHANGED former Level 3: the
// side-scroll level with 2 notes/measure, 30% variability, FULL generation richness (mixed durations, ties,
// tuplets if Polyrhythm is on elsewhere) — "gewoon gegenereerd zoals nu" (Han, 2026-08-02, earlier the same
// day). Deliberately does NOT spread LEVEL1/2 (which carry the quarter/half/eighth-note grids) — it lists
// its own base fields so it is never accidentally pulled onto any of the earlier grids. Only its `id`/`name`
// changed on the renumbering — every gameplay field is exactly what Level 3 already had.
export const LEVEL8 = {
    id: 8,
    name: 'Level 8',
    bpm: 80,
    numMeasures: 8,
    numRepeats: 1,
    notesPerMeasure: 2,
    variability: 30,
    range: { min: 'C4', max: 'G4' },
    totalMeasures: 8,
    sideScroll: true,
    beatsOnScreen: 8,
    // Explicit (not merely "unset") so a stale value from a just-played earlier level in the SAME session
    // can never leak in — useLevel.applyConfig writes these fields unconditionally on every level switch.
    smallestNoteDenom: 8,    // the app's own default treble resolution (InstrumentSettings.js) — NOT the
                             // quarter/half/eighth grids the earlier levels force
    insertBeatRests: false,
    polyMultiplier: 1,
    fixedBass: false,        // the REAL generated bass melody (Han: "gewoon zoals nu")
    debugOnlyLines: false,   // always shows all 3 lines
    enemyType: 'Slime',
    intro: 'Volledige notenrijkdom — echte baslijn, alles samen.',
};

export const LEVELS = {
    1: LEVEL1, 2: LEVEL2, 3: LEVEL3, 4: LEVEL4, 5: LEVEL5, 6: LEVEL6, 7: LEVEL7, 8: LEVEL8,
};

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
