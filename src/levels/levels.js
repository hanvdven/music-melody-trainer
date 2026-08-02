// #659 Levels — a "level" applies a fixed generation + visibility config, then the player clears waves of
// slimes (the #647 combat) until a target measure count, then a "Well done!" splash with stats.
//
// #662 (Han 2026-08-02, "sla de level settings op in een json, zodat ik die apart kan bewerken"): the actual
// per-level DATA now lives in `levels.json` (plain, hand-editable — no JS spreads/inheritance, every level is
// fully self-contained so editing one level's field can never silently affect another). This file stays the
// loader + the documented RATIONALE for why the fields are what they are, and the small derived helpers
// (`wavesForLevel`, `trebleOnlyEyes`, `threeLineEyes`) that aren't level DATA, just behaviour.
//
// Field rationale (consolidated from the pre-JSON version of this file — read before editing levels.json):
//
// - smallestNoteDenom / insertBeatRests / polyMultiplier (§6c: reuse existing generation settings — no
//   RPG-layer/post-process hack) — "elke kwartnoot moet kwartnoot of rust zijn" for the early levels,
//   produced ROBUSTLY at the GENERATOR level:
//     - smallestNoteDenom: 4 → caps the generator's slot resolution at one quarter (the finest note it will
//       ever place), so no sub-quarter subdivision exists to merge into a longer note in the first place.
//     - insertBeatRests: true → melodyGenerator's step-4f `insertRestsAtBeats` turns every EMPTY on-beat slot
//       into an explicit 'r' BEFORE Melody.fromFlattenedNotes runs. With it OFF (the treble default), an
//       inactive quarter-slot instead silently EXTENDS the duration of the PRECEDING note (that's how a
//       "long note" is represented at all) — and Melody.fromFlattenedNotes' leading-rest edge case
//       additionally left a piece-opening rest with a null offset (invisible — no note, no rest, nothing
//       rendered: the reported "maat 8 is leeg" / gap symptom). With insertBeatRests on, no null slot ever
//       reaches that merge step, so no long note and no invisible leading gap can occur.
//     - polyMultiplier: 1 (the default) → keeps tuplet injection off (generateRankedRhythm only injects
//       tuplets when polyMultiplier > 1), so no beat is ever subdivided into a triplet etc. Set EXPLICITLY
//       (not just left at its default) so a stale higher Polyrhythm setting from elsewhere in the app can
//       never leak into these levels.
//   The combination means NO note or rest is ever longer than a quarter and NO tie is ever needed (ties only
//   arise from a note spanning a barline; every quarter aligns with every barline) — this is Levels 1–2's
//   QUARTER_GRID. forceQuarterNotes.js (the old post-process patch, which had its own null-entry/leading-gap
//   bugs) is retired — deleted, not disabled.
//
// - Levels 3–7 (Han 2026-08-02, "houd het simpel... introduceer stap voor stap: halve noten, achtste noten,
//   verbonden noten"): each rung introduces exactly ONE new notation concept on top of the previous rung,
//   ramping from Level 2's quarter-grid toward Level 8's full richness. `insertBeatRests: false` (from Level
//   3 on) is the ONE thing that allows a note to be longer than the grid unit at all (an inactive slot then
//   EXTENDS the previous note instead of becoming an explicit rest) — so turning it off is what "unlocks"
//   half notes (Level 3, still smallestNoteDenom 4). Level 4 additionally finens the grid to eighths
//   (smallestNoteDenom 8). Once a note can be longer than a quarter, it can also occasionally span a
//   barline, which the existing rendering pipeline notates with a TIE — a real musical necessity, not a
//   separate on/off flag (§6c: reuse — don't invent a second "no ties" mechanism); Level 5 raises
//   notesPerMeasure so a note is more likely to reach across a barline. Level 6 widens the range to a full
//   octave (C4–C5, up from the fifth C4–G4 every prior level used). Level 7 turns off debugOnlyLines — "the
//   last training wheel: bas + percussie voortaan altijd zichtbaar".
//
// - fixedBass (Han 2026-08-02, Level 2 UAT): the generated bass melody sounded great in general but was an
//   octave too high through the cello timbre in Level 2 specifically — rather than chase the register match,
//   Han opted to simplify Levels 2–7's bass to a fixed C2 whole note per measure
//   (utils/celloWholeNotePattern.js, an explicitly authorized hardcoded exception, same spirit as the
//   timpani pattern). Level 8 uses the real generated bass (`fixedBass: false`) — "gewoon zoals nu".
//
// - debugOnlyLines (Han 2026-08-02, "in level 1 en 2, toon de bas en percussie ENKEL in debug mode", later
//   extended through Level 6): bass/percussion notation is hidden by default, visible only while debugMode
//   is on (useLevel reacts live to the debugMode toggle, no restart needed). false from Level 7 on.
//
// - enemyType is "Slime" on every level (Han: "gewoon slimes" — no bestiary theme swap).
//
// - Level 8 is the UNCHANGED former Level 3 (Han: "level 3 schuift door naar level 8" — "gewoon gegenereerd
//   zoals nu"): the side-scroll level with 2 notes/measure, 30% variability, FULL generation richness (mixed
//   durations, ties, tuplets if Polyrhythm is on elsewhere).
import levelsData from './levels.json';

const byId = Object.fromEntries(levelsData.map((lvl) => [lvl.id, lvl]));

export const LEVEL1 = byId[1];
export const LEVEL2 = byId[2];
export const LEVEL3 = byId[3];
export const LEVEL4 = byId[4];
export const LEVEL5 = byId[5];
export const LEVEL6 = byId[6];
export const LEVEL7 = byId[7];
export const LEVEL8 = byId[8];

export const LEVELS = byId;

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
