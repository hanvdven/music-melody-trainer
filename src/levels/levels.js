// #659 Levels — a "level" applies a fixed generation + visibility config, then the player clears waves of
// slimes (the #647 combat) until a target measure count, then a "Well done!" splash with stats.
//
// #662 (Han 2026-08-02, "sla de level settings op in een json, zodat ik die apart kan bewerken"): the actual
// per-level DATA now lives in `levels.json` (plain, hand-editable — no JS spreads/inheritance, every level is
// fully self-contained so editing one level's field can never silently affect another). This file stays the
// loader + the documented RATIONALE for why the fields are what they are, and the small derived helpers
// (`wavesForLevel`, `trebleOnlyEyes`, `threeLineEyes`) that aren't level DATA, just behaviour.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// SCHEMA REFERENCE (Han 2026-08-06, level editor: "kijk hoe levels worden opgeslagen en welke
// params ik kan aanpassen... zelfs ok als de file mooi gestructureerd is zodat ik die handmatig
// kan aanpassen"). JSON has no comment syntax, so this reference lives HERE, right next to the
// loader — open this file whenever you edit levels.json. A matching copy lives in
// docs/architecture.md (search "Level schema reference") for browsing outside an editor.
//
// Every field below is per-level (one entry in the levels.json array = one level, fully
// self-contained — never inherited from another level). Fields marked OPTIONAL can be omitted
// entirely; omitting them keeps the exact behaviour every existing level (1-9) already has —
// adding a new field to the schema NEVER changes an existing level that doesn't set it.
//
// ── Identity ─────────────────────────────────────────────────────────────────────────────────
//   id            number   Unique, matches the level's position in the picker.
//   name          string   Shown in the header/splash.
//   intro         string   One-line blurb shown on the level-start splash.
//
// ── Tempo & structure ────────────────────────────────────────────────────────────────────────
//   bpm            OPTIONAL number. Tempo. Also drives the sprite frame rate (SheetRpgLayer: 12000/bpm
//                  ms/frame). Applied via the app's own `setBpm`. Omit → DEFAULT_BPM
//                  (constants/generatorDefaults.js), NOT whatever the app's ambient bpm happened to be —
//                  see the bug-fix note under `key` below for why "leave ambient" was wrong.
//   timeSignature  OPTIONAL [numerator, denominator], e.g. [4,4] | [3,4] | [6,8] | [5,4]. Forces the
//                  app's global time signature for the level's duration (via the existing
//                  `setTimeSignature` — no new mechanism), reverted on close like `key`/`theme`. Omit →
//                  DEFAULT_TIME_SIG ([4,4]) — always applied, never "leave ambient" (see `key` below).
//   numMeasures    number   How many measures ONE generated block/wave covers ("measures per block").
//   numBlocks      OPTIONAL number. How many blocks/waves the level has. When given, `totalMeasures`
//                  is computed as numMeasures * numRepeats * numBlocks — write THIS, not totalMeasures,
//                  for a new level (no hand-multiplying). Ignored if `totalMeasures` is also present.
//   numRepeats     OPTIONAL number. How many measure-slots one block is shown for. DEFAULT: derived
//                  from `enemyType` — 1 for Slime, 2 for Wizard (its call-response needs a 2nd slot
//                  for the player's repeat) — see `normalizeLevel` above. Only set this explicitly to
//                  override that default.
//   totalMeasures  OPTIONAL number. Total measures across the whole level. Derived from `numBlocks`
//                  above when omitted; write one or the other, not both by hand.
//   sideScroll     boolean  false = static idle combat (Level 1). true = the notation scrolls
//                           and the level has its own audio-scheduled backing (bass/metronome/
//                           timpani) — see docs/architecture.md §110/§166 for how that's timed.
//   beatsOnScreen  number   Side-scroll only: how many beats of lead-time a slime/note gets
//                           before it reaches the hit zone (bigger = more reaction time).
//
// ── Melody (treble) generator settings — LEGACY FLAT FIELDS (levels 1-9's own convention) ──────
// These map 1:1 onto InstrumentSettings fields via the SAME MelodyGenerator pipeline every other
// track uses (CLAUDE.md §6b — never special-cased per level). Kept for levels 1-9 exactly as they
// were; NEW levels should prefer the unified `tracks.treble` object below instead (same fields,
// same meaning, just grouped with bass/percussion for symmetry — "voor elk van de tracks").
//   notesPerMeasure     number   Target note density.
//   variability         0-100   Rhythmic variability (→ trebleSettings.rhythmVariability).
//   range               {min,max} note names, e.g. {"min":"C4","max":"G4"}. Fixed (not tonic-relative).
//   smallestNoteDenom   number   Finest note the generator will ever place (4=quarter, 8=eighth, 16=…).
//   insertBeatRests     boolean  true = every empty on-beat slot becomes an explicit rest (used
//                                for the early "quarter-grid" levels — see the rationale below).
//   polyMultiplier      number   Tuplet-injection multiplier. 1 = off (default for every level so
//                                far — write it explicitly, don't rely on the app's ambient value).
//
// ── OPTIONAL: `tracks` — unified per-track generator/mix/visibility overrides (Han 2026-08-06,
//    "varieer voor elk van de tracks: note pool, melody type, voices, notes/measure, beat rests,
//    variability, span, tuplets, smallest note, volume, visibility") ───────────────────────────────
// `tracks: { treble?, bass?, percussion? }` — each an OPTIONAL object. Every field inside uses the
// REAL InstrumentSettings/chordSettings field name directly (no separate vocabulary to learn/keep in
// sync — §6c: reuse, don't re-invent):
//   notePool           "scale" | "chord" | "all" | "metronome" — which notes the generator draws from.
//   randomizationRule  "melody type": "uniform" | "emphasize_roots" | "force_chord_roots" | "weighted" |
//                       "arp" | "arp_var" | "arp_group" | "fixed". arp_var/arp_group also use `maxLeap`
//                       as their span window. force_chord_roots treats notesPerMeasure as a MINIMUM.
//   voices             "voices" = polyphony: 1 (single-note melody, default) | 2 | 3 (every active slot
//                       becomes a chord of that many distinct notes) | "var" (three interleaved melodies
//                       at 100/60/40% density, coinciding onsets become chords). See InstrumentSettings.js
//                       §435 for the full rationale.
//   notesPerMeasure, rhythmVariability, maxLeap ("span" — max melodic leap in semitones, null =
//   unlimited), polyMultiplier ("tuplets" — injection multiplier, 1 = off), smallestNoteDenom,
//   insertBeatRests, range, preferredClef — same meaning as the flat treble fields above, just
//   nested per-track here.
//   volume   OPTIONAL VOL_STEPS glyph string: "silent" | "pp" | "p" | "mp" | "mf" | "f" (see
//            SettingsOverlay.jsx's VOL_STEPS). Sets that track's persistent output fader for the
//            level's duration (App.jsx's `setVolume`); reset to full (1.0 = "f") when the level closes,
//            same as the pre-existing bass/metronome level-volume mechanism this generalizes.
//   visible  OPTIONAL boolean. Overrides the track's notation visibility for THIS level, regardless
//            of `debugOnlyLines` below — e.g. `"tracks": { "bass": { "visible": true } }` shows bass
//            notation even on a `debugOnlyLines: true` level with debugMode off.
// `tracks.percussion` is more limited: percussion during a side-scroll level does NOT go through the
// generator at all (see the "NOT yet parameterizable" note below) — only `volume`/`visible` have any
// effect there; notePool/randomizationRule/voices/etc. under `tracks.percussion` are silently ignored.
// `tracks.metronome` is more limited still: only `volume` has any effect (the metronome has no
// notation/visibility toggle of its own to override). `tracks.bass` TAKES PRECEDENCE over the legacy
// `fixedBass` boolean when present (see below); a level that sets ONLY `tracks.bass.volume`/`visible`
// (no generator fields) still falls through to `fixedBass` — see useLevel.js's `hasBassGenOverride`.
//
// ── `fixedBass` — the two ready-made bass presets (still supported, used by levels 1-9) ─────────
//   fixedBass      boolean  Ignored when `tracks.bass` (above) is present. Otherwise: true → the bass
//                  generator uses LEVEL_BASS_SIMPLE (root notes, 1/measure, no variability, whole
//                  notes); false → LEVEL_BASS_DEFAULT (the app's normal full-richness bass
//                  generation). sideScroll only (Level 1 has no bass staff at all). For anything
//                  those two presets don't cover (e.g. a future "walking bass" level), use
//                  `tracks.bass` instead: `"tracks": { "bass": { "notesPerMeasure": 4,
//                  "smallestNoteDenom": 4, "rhythmVariability": 20, "notePool": "chord",
//                  "randomizationRule": "arp", "range": {"min":"C2","max":"C3"} } }`.
//
// ── key / vocal range / clef (Han 2026-08-06) ────────────────────────────────────────────────
// Added for levels aimed at SINGING, which need a comfortable key + the right clef for the voice
// type, on top of `range` above. Reuses the app's EXISTING scale/clef machinery (useScaleManagement,
// clefSelector.js) — no new mechanism.
//   key            OPTIONAL {tonic, mode}. tonic e.g. "C4" (setTonic), mode e.g. "Major"/"Minor"/
//                  a scaleHandler.js mode name (setSelectedMode). Forces the app's GLOBAL key for
//                  the level's duration; reverted to whatever the user had when the level closes.
//                  BUG FIX (Han 2026-08-06, "ik zet de tonic op Gb, en wil dan level 2 spelen. Die
//                  heeft nog allemaal voortekens staan, en genereert helemaal niet vanuit C-majeur"):
//                  `key` (and `bpm`/`timeSignature` above) used to only apply "if the level sets it" —
//                  for levels 1-9 (no `key` field) that meant "whatever tonic/mode the app happened to
//                  be ambiently in", which silently broke the moment a user changed tonic before
//                  entering a level. Every level now ALWAYS applies a key, falling back to
//                  DEFAULT_SCALE_TONIC/DEFAULT_SCALE_MODE ('C4'/'Major', constants/generatorDefaults.js
//                  — the SAME defaults the app's own initial state uses) when omitted — Han's own
//                  preferred fix: "een lijst defaults 'if none provided'". A level is now ALWAYS
//                  deterministic, never dependent on ambient app state left over from before it started.
//   tracks.treble.preferredClef / tracks.bass.preferredClef   OPTIONAL string. Any preferredClef the
//                  clef selector supports: "treble" | "bass" | "alto" | "tenor" | "soprano" |
//                  "baritone-f" | … (see clefSelector.js's CLEF_FAMILIES) — e.g. "alto" for a
//                  mezzo-soprano vocal level. Omit to leave whatever clef was already showing.
//
// ── OPTIONAL: chord progression override (Han 2026-08-06, extended same day: "instelbaar:
//    progression type, chord complexity, chords/measure, variability, passing chords") ────────────
//   chords         OPTIONAL object, merged over the default `{ strategy: 'tonic-tonic-tonic',
//                  fixedTonic: <the level's own key.tonic, or 'C4' if no key>, chordCount: 1 }`. Any
//                  chordSettings field can be overridden:
//                    strategy            "progression type" — src/constants/generationFields.js's
//                                        CHORD_STRATEGIES ('pop-1-5-6-4', 'modal-random', 'ii-v-i', …).
//                    complexity          CHORD_COMPLEXITY ('root'|'power'|'triad'|'seventh'|'exotic').
//                    chordCount          chords per measure.
//                    rhythmVariability   "variability" (0-100), same meaning as every other track's.
//                    passingChordTypes   array of 'secondary-dominant'|'secondary-dim'|'tritone-sub'|
//                                        'diatonic'|'sus4'|'subdominant-approach'|'borrowed-parallel'.
//                    fixedTonic          normally left to the automatic key-follow above; only set this
//                                        explicitly to pin the chords to a DIFFERENT tonic than the
//                                        level's own melody key (rare).
//                  Not part of `tracks` (chords aren't a melodic voice with notePool/voices/etc. in the
//                  same sense) — kept as its own field. Omit for every existing level's static
//                  single-chord drone.
//                  BUG FIX (Han 2026-08-06): `fixedTonic` used to be hardcoded 'C4' regardless of the
//                  level's own `key` — any level with a non-C key (e.g. Level 113, F♯) had its chord
//                  progression (and therefore `fixedBass: true`'s cello, which follows chord roots)
//                  silently stuck in the wrong key. Now defaults to `key.tonic` automatically.
//
// ── OPTIONAL: theme (Han 2026-08-06, "theme = app kleurenschema") ────────────────────────────
//   theme          OPTIONAL string. Any theme id the app's own theme picker supports (see
//                  ThemeToggle.jsx's THEMES list — "default", "classical", "sunset", "disco", "lava",
//                  "stars", …). Sets the app's global colour theme for the level's duration, reverted
//                  to the user's own theme when the level closes (same snapshot/restore guarantee as
//                  `key`). Omit to leave the user's current theme untouched (existing behaviour).
//
// ── Visibility / difficulty ramp ─────────────────────────────────────────────────────────────
//   debugOnlyLines boolean  true = bass/percussion notation hidden unless the app's debugMode is
//                           on (the early "training wheels" levels). false = always visible. A
//                           per-track `tracks.<name>.visible` (above) overrides this for that track.
//
// ── Enemy ─────────────────────────────────────────────────────────────────────────────────────
//   enemyType             "Slime" (default) | "Wizard" | "Mixed" (Level 10, Han 2026-08-06: alternates
//                          Slime/Wizard-mechanic every 2 measures, starting with Slime — see
//                          useLevelMixedStream.js. Rendered visually as Slime throughout — only the
//                          melody/audio mechanic alternates, see that hook's own scope note). Also
//                          drives the `numRepeats` default above (Wizard/Mixed → 2, else → 1).
//   wizardSpawnLeadMeasures  number, Wizard/Mixed only — how many measures ahead a projectile/cast
//                            becomes visible/audible.
//   decorativeWizard       OPTIONAL boolean (Level 11, Han 2026-08-06). A non-combat, green-tinted
//                          idle Wizard shown alongside Slime enemies, purely visual — pairs with the
//                          forward-only Major/Minor scale alternation every 2 measures
//                          (useLevelKeyModulationStream.js, tonic untouched). Independent of
//                          `enemyType` (stays "Slime").
//
// ── OPTIONAL: fixed song (Han 2026-08-11, #871 "abc music en level namen") ──────────────────────
//   songId          OPTIONAL string. The `id` of a song definition in songs/songIndex.js. When
//                   present, the level plays that FIXED song (via songs/loadSong.js) instead of
//                   procedural generation — see useLevel.begin()'s `songId ? loadSong : regenerate`
//                   branch. bpm/timeSignature/numMeasures/notesPerMeasure/range/key are all BACK-FILLED
//                   from the song definition by `songLevelDefaults()` below — a song-backed level entry
//                   should normally OMIT those fields entirely rather than duplicating what the song
//                   JSON already states (single source of truth). An explicit field on the level entry
//                   still overrides the song-derived value if you ever need to.
//   npc             OPTIONAL string. A bestiary creature NAME (resolved via
//                   model/bestiaryAssets.js's findCreatureByName — the SAME generated manifest every
//                   other creature sprite comes from, no separate asset file) shown standing decoratively
//                   at the wizard's anchor position (right edge of the side-scroll viewport). Purely
//                   visual — no combat/interaction logic, independent of `enemyType`. Distinct from
//                   `decorativeWizard` above, which stays coupled to Level 11's own key-modulation
//                   mechanic; `npc` is the general-purpose decorative-character mechanism for any level.
//   Levels 200-206 (Arirang, Frère Jacques, Kalinka, Kangding Qingge, La Bamba, Sakura, Scarborough
//   Fair) are the first users of `songId`/`npc` — each converted offline from src/songs/abc/*.abc via
//   `npm run abc:song` (scripts/abc-to-song.mjs, kept as a permanent/reusable tool for future abc
//   imports, not a throwaway script).
//
// ── NOT yet parameterizable (known gap — do not fabricate a field for these without extending
//    the underlying mechanism first, see CLAUDE.md §6c) ─────────────────────────────────────────
//   Percussion (timpani) NOTE CONTENT during a side-scroll level is ONE hardcoded pattern
//   (utils/timpaniPattern.js, Han's own explicit "hard code de timpani voor nu" instruction, §663) —
//   there is currently no generator path for it at all, so `tracks.percussion.notePool`/`voices`/etc.
//   would have nothing to apply to (only `volume`/`visible` work, see above). Making percussion note
//   content level-configurable is a separate feature (extending buildTimpaniPattern or routing
//   percussion through the real MelodyGenerator like every other track) — flag it as a new request
//   rather than expecting these fields to do anything beyond volume/visibility.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
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
// - fixedBass (Han 2026-08-02, Level 2 UAT; REWORKED Han 2026-08-03 #663 — "geen hard-coded oplossingen,
//   gebruik het gewone protocol voor generate melody"): the generated bass melody sounded great in general
//   but was an octave too high through the cello timbre in Level 2 specifically. Originally "fixed" via a
//   hardcoded whole-note-pattern function (utils/celloWholeNotePattern.js, since deleted); now it's simplified
//   through the REAL generation pipeline instead — LEVEL_BASS_SIMPLE (below) overrides bass
//   notesPerMeasure/smallestNoteDenom/rhythmVariability/notePool/randomizationRule/range to Han's exact spec
//   ("roots on 1, 1 note per measure, variability 0, smallest note denom whole, note pool C2-C3"), still
//   generated by MelodyGenerator like every other track (§6b/§6c — no per-instrument special-casing, no
//   hardcoded pattern function). Level 8 keeps the full generated bass unmodified (`fixedBass: false`) —
//   "gewoon zoals nu".
//
// - debugOnlyLines (Han 2026-08-02, "in level 1 en 2, toon de bas en percussie ENKEL in debug mode", later
//   extended through Level 6): bass/percussion notation is hidden by default, visible only while debugMode
//   is on (useLevel reacts live to the debugMode toggle, no restart needed). false from Level 7 on.
//
// - enemyType is "Slime" on every level (Han: "gewoon slimes" — no bestiary theme swap) EXCEPT Level 9
//   (Han 2026-08-03 #679: "zet rechts de wizard tegenover de avatar... ipv slimes, gebruik cast 2"), whose
//   config otherwise mirrors Level 2's parameters exactly (Han's interview answer) — only enemyType and the
//   intro blurb differ. SheetRpgLayer branches its rendering/combat on this field (see its own §679 comment).
//
// - Level 8 is the UNCHANGED former Level 3 (Han: "level 3 schuift door naar level 8" — "gewoon gegenereerd
//   zoals nu"): the side-scroll level with 2 notes/measure, 30% variability, FULL generation richness (mixed
//   durations, ties, tuplets if Polyrhythm is on elsewhere).
import levelsData from './levels.json';
import InstrumentSettings from '../model/InstrumentSettings';
import SONGS from '../songs/songIndex.js';
import { noteToMidi } from '../theory/noteUtils';
import { TICKS_PER_WHOLE, TICKS_PER_BEAT } from '../constants/timing';
import { DEFAULT_TIME_SIG, DEFAULT_SCALE_MODE, DEFAULT_SCALE_TONIC } from '../constants/generatorDefaults';
import { scaleDefinitions } from '../theory/scaleHandler';
// #1102: adaptiveTempo.js owns Han's locked bpm formulas and imports `totalNotesForLevel` back from THIS
// file — a deliberate, ESM-safe import cycle: neither module CALLS the other at module-init time (both
// only reference each other inside function bodies), and keeping the two formulas in the one file that
// documents them is worth more than breaking the cycle by duplicating either (§6c).
import { baselineAdaptiveBpm, ADAPTIVE_LEVEL_REPEATS } from './adaptiveTempo';

const SONG_BY_ID = Object.fromEntries(SONGS.map((s) => [s.id, s]));

// #1045 (Han 2026-08-17): every level's default note-coloring scheme, unless the level overrides it
// with its own `colorScheme`/`colorScope`. Must match NoteColoringStaffOverlay.jsx's COLOR_SCHEMES/
// COLOR_SCOPES values.
// #1049 follow-up (Han 2026-08-17, "laat dat de default zijn voor alle levels die ik nu heb"):
// changed from plain 'subtle-chroma' (colors every note) to the 'scale-subtle-chroma' hybrid (colors
// only in-scale notes, same subtle-chroma gradient) — no level currently sets its own explicit
// override, so a single constant change already updates every shipped level.
// #1103 (Han 2026-08-22): the old single `colorMode` field is now two independent fields — this old
// combined value is expressed as `colorScheme: 'subtle-chroma'` + `colorScope: 'scale'` (see noteUtils.js's
// own #1103 comment for the full equivalence table).
export const DEFAULT_LEVEL_COLOR_SCHEME = 'subtle-chroma';
export const DEFAULT_LEVEL_COLOR_SCOPE = 'scale';

// Bug fix (Han 2026-08-11, #871 follow-up: "scarborough fair: de noten komen na 8 kwart-tellen; dat
// moet zijn na 2 maten (6 kwarttellen)"), generalized #889 (Han 2026-08-14): `beatsOnScreen` (the
// slime/note flight lead-time) is always counted in QUARTER-note beats (SheetRpgLayer's
// `beatMs = 60000/bpm`, TICKS_PER_BEAT = a quarter note — timing.js) — NOT in the time signature's
// own numerator/denominator units. A literal "8" (copy-pasted from the original 4/4-only levels 1-9,
// where 2 measures of 4/4 happens to equal 8 quarter-beats) silently breaks for any other meter: 3/4
// -> 6, 6/8 -> 6 (NOT 12 — 6/8 is 2 dotted-half-notes = 6 quarter-beats' worth of TIME, not 6
// numerator-units), 7/8 -> 7, 5/4 -> 10. Derived from ticks so it's correct for every time signature,
// compound or simple (§6c) — used as the ALWAYS-derived default for every level (song-backed or
// procedural); no level should hand-write this literal.
//
// A measure's length in QUARTER-note beats. Extracted from the old `deriveBeatsOnScreen` (#889) so
// the whole span derivation below shares one meter→beats conversion (§6c).
const beatsPerMeasure = (timeSignature) =>
    TICKS_PER_WHOLE * (timeSignature[0] / timeSignature[1]) / TICKS_PER_BEAT;

// #994 (Han 2026-08-14/17, "kalinka is 2/4, so a measure is really short... I would like to have 4
// measures headstart and 4 measures on screen, and a 2 measures count-in. This should be made
// flexible"): the on-screen span is no longer a FIXED 2 measures (the old `LEVEL_LEAD_IN_BARS`
// constant) — it's derived per level from that level's own tempo and meter, targeting a roughly
// CONSTANT on-screen TIME (~6 seconds) rather than a constant measure count. A 2/4 bar at 90bpm
// lasts a third as long as a 4/4 bar at 60bpm; showing 2 of either is what made Kalinka feel frantic.
//
// `roundHalfDown` (NOT Math.round): the quotient lands on an exact .5 for Kalinka (2/4 @90bpm ->
// round(90/10)=9 targetBeats, 9/2 = 4.5), and the tie-break decides whether Han's own worked examples
// hold. Math.round (half-UP) gives Kalinka 5 measures, contradicting his "4 measures on
// screen"; Math.floor gives Kalinka 4 but then gives 3/4 @84bpm only 2 measures,
// contradicting his "3/4 should have 3 measures on screen". Half-DOWN is the only tie-break that
// satisfies both. Confirmed by Han 2026-08-17 (decision A). Only exact-.5 cases differ from Math.round.
const roundHalfDown = (x) => Math.ceil(x - 0.5);

// REJECTED DESIGN — DO NOT REINTRODUCE (Han, live Kalinka UAT 2026-08-17). An earlier #994 pass split
// the lead-in three ways: `silentLeadInBars` (visible but COMPLETELY silent scenery) + `celloOnlyBars`
// + `metronomeBars`, via `countInBars = min(visibleMeasures, max(2, ceil(visibleMeasures/2)))`. On
// Kalinka (leadInBars 4) that made measures -3 and -2 silent and delayed cello/timpani to measure -1;
// Han heard all three backing tracks starting too late against a (correct) visual lead-in and rejected
// the whole concept: *"alle opmaten cello+timpanen. de tweede helft (round up) + metronoom erbij"* —
// EVERY lead-in measure carries cello+timpani, there is never a silent lead-in measure, and only the
// METRONOME is staggered. So there is no count-in "window" at all: the lead-in is fully scored from its
// first measure, and `metronomeBars` below is simply which trailing part of it also gets the metronome.
//
// The metronome joins for the second half of the lead-in, rounded up (Han's "de tweede helft (round
// up)"). No clamping is needed: ceil(x/2) is inherently within [1, x] for every x >= 1, so this also
// covers the degenerate leadInBars === 1 case (metronome joins that single measure alongside the
// cello/timpani) without any special-casing.
const deriveMetronomeBars = (leadInBars) => Math.ceil(leadInBars / 2);

// The single source of truth for a side-scroll level's span. Returns every value the rest of the app
// used to read off the global `LEVEL_LEAD_IN_BARS` constant, which could not survive becoming
// per-level (it did three unrelated jobs at once: audible count-in length, JIT generation chunk size,
// and the visual/notation lead-in span — see §248 in docs/architecture.md).
//
// INVARIANT (§108): `beatsOnScreen * TICKS_PER_BEAT === leadInBars * measureLengthTicks`, exactly.
// SheetRpgLayer positions the barline row at `viewRight - leadInTicks·scrollPPT` where
// `scrollPPT = dist / (beatsOnScreen·TICKS_PER_BEAT)`; measure "-1" only lands on the hero at level
// start if those two agree. So `beatsOnScreen` must NOT be rounded — for 7/8 at 3 visible measures
// the exact value is 10.5, and rounding it to 10 or 11 would drift barlines about half a beat away
// from their own notes (levels 109/120). #889's outer Math.round was a no-op for every meter shipped
// at the time (2 × 3.5 = 7) and is deliberately gone. `beatsOnScreen` is only ever consumed in float
// arithmetic (dist/(bos·TICKS_PER_BEAT), bos·beatMs, dist/bos), so a fractional value is correct.
export const deriveLevelSpan = ({ bpm, timeSignature }) => {
    const bpMeasure = beatsPerMeasure(timeSignature);
    // ~6 seconds of on-screen time: at 60bpm a quarter-beat is 1s, so bpm/10 quarter-beats is
    // 6·(60/bpm)·(bpm/10) = 6 seconds at ANY tempo — the "constant on-screen time" Han asked for
    // ("around 8-12 beats on screen ... for 80-120 bpm").
    const targetBeats = Math.round((bpm || 80) / 10);
    const visibleMeasures = Math.max(1, roundHalfDown(targetBeats / bpMeasure));
    return {
        visibleMeasures,
        leadInBars: visibleMeasures,          // the visual/notation lead-in IS the visible span
        // Cello + timpani always span ALL `leadInBars` measures — there is no field for that because
        // there is no choice to make. Only the metronome is staggered (see deriveMetronomeBars).
        metronomeBars: deriveMetronomeBars(visibleMeasures),
        beatsOnScreen: visibleMeasures * bpMeasure,
    };
};

// A level that hand-writes an explicit `beatsOnScreen` must still satisfy the §108 invariant above,
// so its lead-in bar count is derived BACK from that literal rather than from the formula — the two
// can never disagree. (No level ships one today; #994 deleted every literal from levels.json.)
const spanForExplicitBeatsOnScreen = (beatsOnScreen, timeSignature) => {
    const visibleMeasures = Math.max(1, Math.round(beatsOnScreen / beatsPerMeasure(timeSignature)));
    return {
        visibleMeasures,
        leadInBars: visibleMeasures,
        metronomeBars: deriveMetronomeBars(visibleMeasures),
        beatsOnScreen,
    };
};

// #871 (Han 2026-08-11, "abc music en level namen"): a level with `songId` plays a FIXED song (see
// songs/loadSong.js) instead of procedural generation. bpm/timeSignature/numMeasures/notesPerMeasure/
// range/key are derived from the song definition — the song JSON is the single source of truth for its
// own musical metadata, never hand-duplicated into levels.json (CLAUDE.md §6c). Explicit level fields
// still win (see normalizeLevel below) — this is only a fallback for whatever the level entry omits.
const songLevelDefaults = (songDef) => {
    const notes = songDef.difficulties.easy.treble.notes.filter((n) => n !== 'r');
    let min = notes[0];
    let max = notes[0];
    for (const n of notes) {
        if (noteToMidi(n) < noteToMidi(min)) min = n;
        if (noteToMidi(n) > noteToMidi(max)) max = n;
    }
    return {
        bpm: songDef.defaultTempo,
        timeSignature: songDef.timeSignature,
        numMeasures: songDef.numMeasures,
        notesPerMeasure: songDef.generator.trebleSettings.notesPerMeasure,
        // #1154 (Han 2026-08-25, letter h "Randomized Notes" — "notes/measure = aantal maten / aantal
        // noten... bepaal instellingen die bij het nummer passen"): the song's OWN average note density
        // (real notes only, rests already filtered above), used as the generation notesPerMeasure when
        // variant 'h' regenerates this song's melody from scratch. Derived per-song here (not a level.js
        // constant) since every song has a different density — §6c, no hardcoded table.
        randomizedNotesPerMeasure: Math.max(1, Math.round(notes.length / songDef.numMeasures)),
        range: { min, max },
        // `family` added (Han 2026-08-17 bug fix): a song-level's key was silently applied inside
        // whichever scale family the app happened to already have selected — harmless for a Diatonic
        // song, but broken for e.g. Sakura's Pentatonic "In" (see useLevel.js's applyConfig, which now
        // passes this through to setSelectedMode's newFamily param).
        key: { tonic: `${songDef.defaultTonic}4`, mode: songDef.generator.scaleMode, family: songDef.generator.scaleFamily },
        // #994: `beatsOnScreen` is deliberately NOT set here any more (it was, under #889). The span
        // now depends on TEMPO as well as meter, and normalizeLevel derives the whole bundle from the
        // MERGED bpm/timeSignature below — deriving it here too would (a) duplicate the formula and
        // (b) make a derived value indistinguishable from an author-written explicit override. This
        // function's job is just to supply bpm/timeSignature; the span follows from them.
        // Bug fix (Han 2026-08-11, #871 UAT: "percussie en bas zijn zichtbaar, terwijl er geen muziek
        // is meegegeven in het lied" / "laat die dan leeg"): these 7 abc songs ship `bass: null,
        // percussion: null` (only a fixed treble line + chords). Read by useLevel's applyConfig to skip
        // the cello-generator preset / timpani-generation flag / staff visibility for whichever track
        // the song doesn't provide, instead of the level's normal "always generate a backing track"
        // behaviour bleeding through underneath the loaded (empty) song track.
        songHasBass: songDef.difficulties.easy.bass != null,
        songHasPercussion: songDef.difficulties.easy.percussion != null,
    };
};

// Level editor (Han 2026-08-06, "koppel num-repeats gewoon aan de enemy: slime = 1, wizard = 2" +
// "numMeasures per block, en number of blocks"): a ONE-TIME normalization pass at load time, so every
// downstream consumer (wavesForLevel, useLevel.applyConfig) keeps reading plain `numRepeats`/
// `totalMeasures` exactly as before — no special-casing scattered through the codebase (§6c).
//   - `numRepeats`: OPTIONAL. When omitted, derived from `enemyType` (Wizard's call-response needs 2
//     measure-slots per generated block; every other enemy needs 1). Existing levels 1-9 all set this
//     explicitly already, so this is a pure fallback for NEW levels that omit it — no existing level's
//     behaviour changes.
//   - `totalMeasures`: if omitted but `numBlocks` (= how many waves the level has) IS given, computed as
//     numMeasures * (effective numRepeats) * numBlocks — `numBlocks` reads more directly than having to
//     hand-multiply `totalMeasures` yourself. Explicit `totalMeasures` always wins if both are present.
const normalizeLevel = (lvl) => {
    // #871: song-derived defaults are applied FIRST, then the level's own explicit fields are spread
    // on top — a level entry can still override any individual derived field (rare, but keeps the
    // "explicit fields always win" rule from the rest of this schema, e.g. `key`/`bpm` below).
    const merged = lvl.songId ? { ...songLevelDefaults(SONG_BY_ID[lvl.songId]), ...lvl } : lvl;
    const numRepeats = merged.numRepeats ?? (merged.enemyType === 'Wizard' ? 2 : 1);
    const totalMeasures = merged.totalMeasures ?? (merged.numBlocks != null ? merged.numMeasures * numRepeats * merged.numBlocks : merged.numMeasures);
    // #889: procedural (non-song) levels had no beatsOnScreen derivation at all — every entry had to
    // hand-write the literal, and several non-4/4 levels (6/8, 3/4, 7/8, 5/4) carried the wrong
    // 4/4-derived "8". Song levels already get a correct derived value via songLevelDefaults; this
    // covers the procedural side too, same formula, same fallback-only-if-omitted convention as
    // numRepeats/totalMeasures above.
    // #994: this now produces the WHOLE span bundle (visibleMeasures/leadInBars/metronomeBars/
    // beatsOnScreen), derived from bpm + meter, and it is
    // derived from `merged` — i.e. AFTER a song level's defaults and the level's own explicit
    // bpm/timeSignature have been resolved — so an explicit `bpm` override always gets a matching span.
    // Explicit `beatsOnScreen` still wins (the established convention), but its lead-in bar count is
    // derived back from it so the §108 invariant can't be broken by a hand-written value.
    const span = merged.sideScroll
        ? (merged.beatsOnScreen != null
            ? spanForExplicitBeatsOnScreen(merged.beatsOnScreen, merged.timeSignature ?? DEFAULT_TIME_SIG)
            : deriveLevelSpan({ bpm: merged.bpm, timeSignature: merged.timeSignature ?? DEFAULT_TIME_SIG }))
        : null;
    // #1045 (Han 2026-08-17, "Voeg color mode toe aan de settings van een level. Zet standaard op
    // subtle chroma"): same "explicit field wins, else derived" convention as beatsOnScreen/numRepeats
    // above — a level can author its own `colorScheme`/`colorScope` (#1103: the old single `colorMode`
    // enum split into two independent axes, see noteUtils.js's own #1103 comment), applied by useLevel's
    // applyConfig via setColorScheme/setColorScope. Every level gets both (not just sideScroll), matching
    // how key/bpm/timeSignature are always-applied rather than side-scroll-only.
    const colorScheme = merged.colorScheme ?? DEFAULT_LEVEL_COLOR_SCHEME;
    const colorScope = merged.colorScope ?? DEFAULT_LEVEL_COLOR_SCOPE;
    return { ...merged, numRepeats, totalMeasures, colorScheme, colorScope, ...(span || {}) };
};

const byId = Object.fromEntries(levelsData.map((lvl) => [lvl.id, normalizeLevel(lvl)]));

// #663 (Han 2026-08-03): the "fixedBass" simplification, expressed as real InstrumentSettings fields
// instead of a hardcoded pattern function — Han's exact protocol: "roots on 1, 1 note per measure,
// variability 0, smallest note denom whole, note pool c2-c3" (range later adjusted to c2-b2, same day).
// Applied by useLevel.applyConfig.
//
// #925 (Han 2026-08-13, "zet voor alle liedjes de cello default op 'on chord change', en roots …
// notes per measure = 2"): the level cello's rule is now `force_chord_roots` — it plants the chord
// root on EVERY chord change (passing chords included) and fills the rest of the measure with the
// usual ranked-slot priority. notesPerMeasure is a MINIMUM under that rule.
// #889 (Han 2026-08-14, "zet de bass; notes per measure default voor alle levels op 1"): reverts
// #925's bump back to 1 for both level bass presets below — notesPerMeasure stays a MINIMUM under
// force_chord_roots, so a forced root on every chord change can still add more notes than 1/measure;
// this only lowers the floor when a measure has no chord change of its own.
export const LEVEL_CELLO_RULE = 'force_chord_roots';

export const LEVEL_BASS_SIMPLE = {
    notesPerMeasure: 1,            // #889 (was 2 under #925, originally 1 under #663)
    smallestNoteDenom: 1,          // whole note
    rhythmVariability: 0,
    notePool: 'chord',
    randomizationRule: LEVEL_CELLO_RULE,
    // #889 follow-up (Han 2026-08-14, "cello is heel lelijk... ook te hoog voor mijn gevoel. Zet de
    // cello range op g#1-g2" — the cello track's purpose is a constant "threatening" undertone):
    // was C2-B2. G#1 sits below the lowest actually-recorded local cello sample (C#2,
    // localInstrumentBuffers.generated.js) — Han explicitly accepted the resulting downward
    // pitch-shift/detune rather than staying inside the sampled range.
    range: { min: 'G#1', max: 'G2' },
};

// The non-simplified values (Level 8's "gewoon zoals nu") — derived from the app's own bass default so
// there is exactly ONE place these numbers live (§6c), not a second hardcoded copy for the "off" case,
// EXCEPT notesPerMeasure/randomizationRule which the level cello deliberately overrides (see #889/#925
// comments above — the app-wide plain-bass default stays untouched for non-level bass usage).
const DEFAULT_BASS = InstrumentSettings.defaultBassInstrumentSettings();
export const LEVEL_BASS_DEFAULT = {
    notesPerMeasure: 1,            // #889: level default, independent of the app-wide DEFAULT_BASS value
    smallestNoteDenom: DEFAULT_BASS.smallestNoteDenom,
    rhythmVariability: DEFAULT_BASS.rhythmVariability,
    notePool: DEFAULT_BASS.notePool,
    // #925: the LEVEL cello overrides the app's plain-bass rule. defaultBassInstrumentSettings()
    // itself is deliberately NOT touched — a plain (non-level, non-cello) bass track keeps
    // 'emphasize_roots'; only the level cello follows the chord changes.
    randomizationRule: LEVEL_CELLO_RULE,
    range: DEFAULT_BASS.range,
};

// #1053 (Han 2026-08-17, "vaste levels 1-4 + renummering"): new gated levels 1-3 inserted at the front,
// old level 2 relocated to id 4 unchanged, every level from the old id-3-onward ramp shifted +4 (ids 5/6
// were never reused — old level 3 landed on 7, not 5, matching the "insert 4 new slots" scheme, not a
// literal "shift everything by exactly 4" renumbering of EVERY prior id). Named exports now cover the
// full main-progression roster (ids jump 4→7 — non-contiguous, matches levels.json itself) rather than
// stopping at 9.
export const LEVEL1 = byId[1];
export const LEVEL2 = byId[2];
export const LEVEL3 = byId[3];
export const LEVEL4 = byId[4];
export const LEVEL7 = byId[7];
export const LEVEL8 = byId[8];
export const LEVEL9 = byId[9];
export const LEVEL10 = byId[10];
export const LEVEL11 = byId[11];
export const LEVEL12 = byId[12];
export const LEVEL13 = byId[13];
export const LEVEL14 = byId[14];
export const LEVEL15 = byId[15];
export const LEVEL19 = byId[19];

export const LEVELS = byId;

// #1100 (split from #1087, Han 2026-08-22 chat interview): selectable per-play "mode variants", chosen at
// the level-start splash — NEVER persisted to the level's own authored config (this file stays the single
// source of truth for a level's OWN defaults; a variant only overrides the EFFECTIVE object passed to
// `level.start`). Bundles {speed, colorScheme, colorScope} per letter (CLAUDE.md §6c: this IS the
// legitimate "no formula exists" case — a per-variant CONFIG bundle, not a value derivable from anything
// else). 'a' reuses the EXISTING gatedScroll/JIT-generation mechanism (useLevelTrebleStream.js etc —
// already keyed off the plain `lvl.gatedScroll` boolean, never a hardcoded level id) rather than
// inventing a second "rubato" concept.
// Locked speed multipliers (chat interview): full=1x/medium=0.75x/slow=0.5x — ONE generic formula applied
// to whatever bpm the level already declares, never a per-level bpm table.
// #1103 follow-up (Han 2026-08-22, coloring redesign): colors re-specified in the new colorScheme x
// colorScope terms — a,b=chroma+scale; c,d=subtle-chroma+scale; e,f=none.
// #1101 (split from #1087, Han 2026-08-23 chat interview, "call response is altijd black wizard — dus
// slime is thans een MODE van een level"): d/e are call-response — FORCE `enemyType: 'Wizard'` on
// whatever level they're applied to (the wizard cast-audio mechanism is NOT decoupled from
// call-response, only from levels.json's static per-level `enemyType` authoring) and set
// `callResponseMeasures` (1 for d, 2 for e — see generateLevel9CallResponseBlock.js's own `groupMeasures`
// param). `gatedScroll: false` is DELIBERATE: `isJitTrebleLevel` excludes `enemyType==='Wizard'`, so
// forcing Wizard on an originally-gatedScroll level (1-3) while leaving gatedScroll on would flip its
// wave-counting to the discrete numRepeats-based model while `loopForever` (keyed on gatedScroll alone)
// stayed true underneath — risking a repeat of §289's "level never ends" bug class. Rubato ('a') and
// call-response ('d'/'e') are mutually exclusive per-letter choices anyway, never combined.
// #1153 (Han 2026-08-25, letter g "Modulated" — chat interview: "ik wil dan een 'variant' van het nummer
// in een andere toonladder. Kies voorlopig een random diatonische toonladder die verschilt van de
// oorspronkelijke"; scope confirmed for ALL sideScroll levels (songs + procedural), FIXED for the whole
// level, not alternating per block like Level 11's decorativeWizard): the 7 canonical Diatonic mode
// `name` values `getScaleDefinition('Diatonic', name)` accepts (scaleDefinitions.Diatonic above) — reused
// verbatim, not re-derived, so a new diatonic mode added there is automatically available here too.
const DIATONIC_MODE_NAMES = scaleDefinitions.Diatonic.map((m) => m.name);

// Bug fix (Han 2026-08-25 UAT: "Ik heb nog steeds ALTIJD E phrygian op sakura - lijkt deterministisch;
// dus ja, ik wil elke keer dat je het level start een random diatonische toonladder"): the old `lvl.id`-
// seeded pick was deliberately deterministic (see git history) on the theory that the live preview
// re-invoking `applyLevelVariant` on every render needed a stable answer — but the preview never actually
// surfaces the SPECIFIC picked mode name anywhere a player sees (LevelStartSplash.jsx's variant label just
// shows the letter's static "Modulated" title; only the debugMode JSON dump shows the resolved `key.mode`,
// and re-rolling there on re-render is harmless/expected for a debug view). Han wants TRUE randomness per
// actual level start — `startLevel` (App.jsx) calls `applyLevelVariant` fresh at that exact moment, so a
// `Math.random()` pick here already lands correctly: whatever the preview last showed, the real level gets
// its own fresh roll the instant Start is pressed.
//
// Bug fix (same UAT, "Zorg bij G meteen dat er niet naar de diatonic 'parent' van de toonladder wordt
// gemoduleerd - In -> Phrygisch is triviaal, dus dan heeft level G kiezen geen zin"): a scale's `diatonic`
// field (scaleHandler.js, see that file's own top-of-file doc) names the heptatonic mode its notes are an
// EXACT zero-offset subset of (#1158) — modulating to that exact mode changes no pitch at all (every note
// is already a valid member), a silent no-op that defeats the point of picking "Modulated". Excluded here
// by looking the scale's OWN `diatonic` key back up in `scaleDefinitions.Diatonic` to find which entry
// owns it, then excluding that entry's `.name` (the value `DIATONIC_MODE_NAMES` — and this function's
// return value — actually use; `diatonic` and `.name` diverge for 3 of the 7 Diatonic entries, e.g.
// Major's own `diatonic` is 'Ionian' but its `.name` is 'Major' — see scaleHandler.js). `originalMode` is
// ALSO excluded directly (defensive: covers a procedural level whose `key.mode` already equals its own
// `.name`, and guards against a future entry with no `diatonic` field). §6c: reuses `scaleDefinitions`
// (already imported) rather than a new hardcoded parent-mode table.
const pickModulatedMode = (lvl) => {
    const originalMode = lvl.key?.mode ?? DEFAULT_SCALE_MODE;
    const originalFamily = lvl.key?.family ?? 'Diatonic';
    const ownDef = scaleDefinitions[originalFamily]?.find((m) => m.name === originalMode);
    const diatonicParentName = ownDef?.diatonic
        ? scaleDefinitions.Diatonic.find((m) => m.diatonic === ownDef.diatonic)?.name
        : null;
    const excluded = new Set([originalMode, diatonicParentName].filter(Boolean));
    const pool = DIATONIC_MODE_NAMES.filter((name) => !excluded.has(name));
    const candidates = pool.length ? pool : DIATONIC_MODE_NAMES;
    return candidates[Math.floor(Math.random() * candidates.length)];
};
//
// `iconKey` (Han 2026-08-24, "gebruik de nieuwe status_effect_icons"): a lookup key into
// LevelStartSplash.jsx's own `ICON_BY_KEY` map (the actual PNG imports + UI concern live there, not
// here — levels.js stays asset/UI-import-free, same reasoning as not importing generationFields.js's
// lucide-react constants here, see availableVariantLetters' own comment). NOT the raw asset filename —
// keeps this table readable and the image swap-out localized to one file if the assets ever move/rename.
// `notYetImplemented: true` (g/h/i below): the icon/slot is reserved and shown in the picker so Han can
// see the full planned set, but the letter is NOT selectable yet — picking a variant that changes
// nothing would be a silent no-op, worse than a visibly disabled button (LevelStartSplash.jsx greys it
// out). Remove the flag the moment that letter's actual generation logic is built.
export const LEVEL_MODE_VARIANTS = {
    a: { label: 'Rubato', gatedScroll: true, colorScheme: 'chroma', colorScope: 'scale', iconKey: 'rubato' },
    b: { label: 'Langzaam', speedMultiplier: 0.5, colorScheme: 'chroma', colorScope: 'scale', iconKey: 'slow' },
    c: { label: 'Middel', speedMultiplier: 0.75, colorScheme: 'subtle-chroma', colorScope: 'scale', iconKey: 'halfTempo' },
    d: {
        label: 'Call-response (1 maat)', enemyType: 'Wizard', gatedScroll: false, callResponseMeasures: 1,
        numRepeats: 2, speedMultiplier: 0.75, colorScheme: 'subtle-chroma', colorScope: 'scale',
        iconKey: 'listenRepeat1',
    },
    e: {
        label: 'Call-response (2 maten)', enemyType: 'Wizard', gatedScroll: false, callResponseMeasures: 2,
        numRepeats: 2, speedMultiplier: 1, colorScheme: 'none', colorScope: 'all',
        iconKey: 'listenRepeat2',
    },
    f: { label: 'Vol tempo', speedMultiplier: 1, colorScheme: 'none', colorScope: 'all', iconKey: 'fullTempo' },
    // #1153: `modulated: true` — see `pickModulatedMode`'s own comment above for the deterministic-pick
    // rationale and `applyLevelVariant`'s `modulatedOverrides` for how it's applied (procedural: the
    // EXISTING `lvl.key`-driven scale-application path in useLevel.js's applyConfig just picks it up for
    // free; songs: App.jsx's `handleLoadSong` gets an explicit `modulateToMode` override).
    g: { label: 'Modulated', iconKey: 'modulated', modulated: true },
    // #1154: `randomizedNotes: true` — ONLY offered for songId levels (availableVariantLetters below;
    // Han: "de al reeds random nummers hebben geen variant H" — a procedural level is already fresh
    // content every playthrough, this variant exists specifically to give a FIXED song that same
    // "familiar chords, new melody" treatment). See `applyLevelVariant`'s `randomizeSongOverrides`.
    h: { label: 'Randomized Notes', iconKey: 'randomizedNotes', randomizedNotes: true },
    // #1102 (Han 2026-08-23 chat interview, resumed 2026-08-28): `adaptive: true` — the level's bpm
    // STARTS at the player's own ANPM-derived baseline (`baselineAdaptiveBpm`, adaptiveTempo.js) and then
    // tracks their live performance ±5% per block, clamped to [authoredBpm/2, authoredBpm], over a level
    // that plays through its own content ADAPTIVE_LEVEL_REPEATS times. See `applyLevelVariant`'s
    // `adaptiveOverrides` below and docs/architecture.md §354 (which supersedes §346/§298; an earlier
    // version of this comment pointed at §344, which is a different feature entirely).
    i: { label: 'Adaptive speed', iconKey: 'adaptiveSpeed', adaptive: true },
};

// Applies a chosen LEVEL_MODE_VARIANTS letter on top of an already-normalized level object, returning a
// NEW object — never mutates `lvl` (the shared, module-level LEVELS[id] object other call sites also
// read). `letter == null` returns `lvl` UNCHANGED — "as authored" is itself the default choice, not mapped
// to any one letter, since most levels' own bpm/colorScheme/colorScope don't exactly match any single variant (CLAUDE.md
// §7b: no behaviour change for any EXISTING call site that doesn't opt into a letter).
// Only meaningful for `sideScroll` levels — every variant concerns scrolling-gameplay pacing/coloring;
// LevelStartSplash.jsx only renders the picker when `lvl.sideScroll`, so a non-sideScroll level never
// reaches this with a letter set. 'a' (rubato) is offered regardless of `songId` — gatedScroll+songId
// TOGETHER already exists and is heavily exercised today (Levels 1/2 are both songId+gatedScroll, and are
// the two most fixed/tested levels this cycle, §285-289) — the gating mechanism is content-source-
// agnostic, so there is no extra risk in letting a PREVIOUSLY non-gated song-backed level opt into it.
//
// #1102: `anpm` (the player's profile-level "accurate notes per minute" skill number, ProfileContext) is
// the OPTIONAL third param — the only variant that needs profile state. Passing it is harmless for every
// other letter (ignored), and omitting it for the adaptive letter simply falls back to the level's own
// authored bpm (`baselineAdaptiveBpm`'s own null-ANPM branch), so no call site is obliged to thread it.
export const applyLevelVariant = (lvl, letter, anpm = null) => {
    const variant = letter != null ? LEVEL_MODE_VARIANTS[letter] : null;
    if (!variant) return lvl;
    // #1102: the adaptive letter derives its STARTING bpm from the player's own ANPM instead of a fixed
    // multiplier of the level's authored tempo — but it lands in the SAME `bpm` variable the
    // speedMultiplier letters use, so the span recompute below (and every downstream consumer of
    // `lvl.bpm`) needs no adaptive-specific branch at all (§6c).
    const bpm = variant.adaptive
        ? baselineAdaptiveBpm(lvl, anpm)
        : (variant.speedMultiplier ? Math.round(lvl.bpm * variant.speedMultiplier) : lvl.bpm);
    // #994's span bundle (beatsOnScreen/visibleMeasures/leadInBars/metronomeBars, see normalizeLevel
    // above) is BPM-derived — a variant that changes bpm must recompute it, or the on-screen scroll pace
    // goes stale vs the new tempo. An author's own explicit `beatsOnScreen` was tuned for the ORIGINAL
    // bpm, so it is deliberately NOT preserved here (unlike normalizeLevel's own "explicit wins" rule) —
    // at a different tempo it no longer means what the author intended.
    const span = (bpm !== lvl.bpm && lvl.sideScroll)
        ? deriveLevelSpan({ bpm, timeSignature: lvl.timeSignature ?? DEFAULT_TIME_SIG })
        : null;
    // #1101: d/e's `callResponseMeasures` also forces `enemyType`/`numMeasures`/`numRepeats` — the level's
    // OWN authored values are irrelevant once call-response is selected, since the whole point is "any
    // level can become a call-response level regardless of its own default enemy/wave shape". `numMeasures`
    // becomes the call/response GROUP size (what `useLevelTrebleStream`'s Wizard-branch `blockMeasures`
    // derives from) and feeds `wavesForLevel`'s discrete `totalMeasures / (numMeasures*numRepeats)` model
    // (levels.js below) so wave-counting stays correct for WHATEVER level this was applied to.
    // Bug fix (Han 2026-08-24 UAT, variant 'e': "de tijd tussen de call en response is nu nog steeds 1
    // maat; daardoor overlapt wat ik moet spelen met het luisteren naar de tovenaar"): the wizard cast's
    // audio is scheduled `wizardSpawnLeadMeasures * barSec` EARLIER than the block's own start
    // (useLevelTrebleStream.js's `leadOffsetSeconds`) specifically so the cast finishes exactly when the
    // call's own measures end and the response begins. That only works when the lead time equals the
    // CALL's own length (`callResponseMeasures`) — `wizardSpawnLeadMeasures` was never set here, so it
    // defaulted to 1 regardless of variant, correct for 'd' (1-measure call) by coincidence but too
    // short for 'e' (2-measure call): the cast kept playing for a second measure that had already become
    // the response's own gameplay window. Native Wizard levels (13/108/114/118) keep their own authored
    // `wizardSpawnLeadMeasures` untouched — this override only applies when call-response ITSELF sets
    // the block shape via `callResponseMeasures`.
    // Bug fix (Han 2026-08-25 UAT, Sakura d/e: "de lengte van het nummer is ook niet verdubbeld, dus
    // opeens, precies halverwege het nummer, zijn de akkoorden 'op'... en verschijnt de 'end of song'
    // maatstreep"): for a SONG, call-response ALWAYS doubles the level's true total length (every real
    // song measure becomes a call+response PAIR) — but `lvl.totalMeasures` was computed once at
    // `normalizeLevel` time from the song's own `numMeasures`, BEFORE this variant could ever apply, so
    // it stayed at the un-doubled length. `lvl.numMeasures` here is still that ORIGINAL song length (this
    // override hasn't replaced it yet in this same object-spread), so doubling it directly is correct —
    // App.jsx's `handleLoadSong` doubles the chord progression to match (see
    // `sliceSongCallResponseBlock.js`'s `doubleMelodyForCallResponse`), and `useLevelBackingStream.js`'s
    // bass/cello generation already reads `lvl.totalMeasures` as its own content-length source of truth
    // (§6c — one shared value, fixing it here fixes bass "for free", matching Han's own "de akkoorden (en
    // dus de bas)"). Scoped to songs only — a procedural level's `totalMeasures` semantics (already
    // folding in its own `numRepeats`/`numBlocks`) aren't touched here; no report of them being wrong.
    const callResponseOverrides = variant.callResponseMeasures != null ? {
        enemyType: variant.enemyType,
        callResponseMeasures: variant.callResponseMeasures,
        numMeasures: variant.callResponseMeasures,
        numRepeats: variant.numRepeats,
        wizardSpawnLeadMeasures: variant.callResponseMeasures,
        ...(lvl.songId != null ? { totalMeasures: lvl.numMeasures * 2 } : {}),
    } : {};
    // #1153: overrides `key` to the deterministically-picked "different diatonic mode" — for a
    // PROCEDURAL level this is the ENTIRE fix (useLevel.js's applyConfig already applies `lvl.key`
    // unconditionally via setSelectedMode/setTonic). `modulateToMode` additionally tells App.jsx's
    // handleLoadSong to actively re-pitch a SONG's fixed melody/bass/chords into that mode (procedural
    // generation needs no such step — it generates fresh content in whatever scale is active).
    // Bug fix (Han 2026-08-25 UAT, "G heeft opeens geen akkoorden / baslijn meer"): `pickModulatedMode`
    // is now `Math.random()`-based (see its own comment) — calling it TWICE here used to be harmless
    // when it was a deterministic function of `lvl` alone, but now gives `key.mode` and `modulateToMode`
    // two DIFFERENT random modes. App.jsx's `handleLoadSong` uses `modulateToMode` to build `activeScale`
    // (the scale it actually re-pitches treble/bass/chordMelody INTO) while `useLevel.js`'s `applyConfig`
    // separately applies `key` (tonic/mode/family) to the app's OWN scale state — with two different
    // modes in play, the chord/bass modulation target and the app's displayed scale disagreed, and
    // downstream chord-progression lookups keyed on the app's scale silently found nothing. One roll,
    // reused for both fields.
    const modulatedOverrides = variant.modulated ? (() => {
        const targetMode = pickModulatedMode(lvl);
        return {
            key: { tonic: lvl.key?.tonic ?? DEFAULT_SCALE_TONIC, mode: targetMode, family: 'Diatonic' },
            modulateToMode: targetMode,
        };
    })() : {};
    // #1154: only meaningful for a songId level (availableVariantLetters excludes 'h' otherwise, but
    // guard here too since applyLevelVariant has no other caller-side enforcement). `forceTrebleSettings`
    // reaches App.jsx's handleLoadSong via useLevel.js's begin() — see that file's own comment.
    // #1102: `adaptive` marks the level for the live tempo controller (useAdaptiveTempo.js) and
    // `adaptiveBaseBpm` preserves the level's OWN AUTHORED tempo — `bpm` above has already been replaced
    // by the ANPM-derived baseline, but the clamp Han locked is `[authoredBpm/2, authoredBpm]`, so the
    // authored value must survive somewhere. Kept as its own field rather than re-reading `LEVELS[id].bpm`
    // downstream, which would be wrong for a Level-0 draft object or a song-backed level (whose `bpm` is
    // itself back-filled from the song definition, not written in levels.json).
    // #1102 (Han 2026-08-28, "niet oninteressant om het level te blijven herhalen. Bijvoorbeeld 3x"): an
    // adaptive level plays through its own content ADAPTIVE_LEVEL_REPEATS times, so the ±5% controller
    // gets ~3x as many block boundaries to converge on the player's real ability (the "no visible
    // acceleration" UAT bounce: an 8-measure level in 2-measure blocks offers only 3 real adjustments,
    // the first boundary always being a no-op). Expressed by multiplying the level's OWN `totalMeasures`
    // — the single length field EVERY consumer already reads (`blockCountFor`, `wavesForLevel`,
    // `totalNotesForLevel`, App.jsx's timpani span, SheetMusic's `levelFullTotalMeasures` → SheetRpgLayer's
    // `trebleFinalBarTick`, which also clips slime/critter spawning) — so a 3x adaptive level is
    // structurally an ordinary longer level and ENDS through exactly the paths that already exist (§6c).
    // `callResponseOverrides` above already does this same scoped-`totalMeasures` trick for songs.
    //
    // SCOPED to PROCEDURAL side-scroll levels (`songId == null`), and this exclusion is load-bearing, not
    // caution: a song-backed level's per-block treble slice is deliberately UNWRAPPED (see
    // `useLevelContentStream`'s `songSlice` — past the song's last measure the slice is empty, so a song
    // never silently repeats), while `wavesForLevel` would demand 3x the wave clears. Its slimes would run
    // out one third of the way in and `pendingSongEndRef` would never be set — the §289 "level never ends"
    // bug class, reintroduced. `!sideScroll` is excluded for a different reason: the stream only evaluates
    // the controller for a side-scroll level, so a longer static level would be pure padding.
    // `totalNotesForLevel` scales with it, which is CORRECT: the player really does play 3x the notes over
    // ~3x the time, so #1099's post-completion ANPM (notes / elapsed minutes) is unchanged by the repeat.
    // `baselineAdaptiveBpm` is computed above from the UN-multiplied level and is invariant anyway —
    // `totalMeasures` appears in both its numerator (beats) and its denominator (notes) and cancels out.
    // `lvl.totalMeasures > 0` also guards the Level-0 draft object this function can be handed before
    // `normalizeLevel` has derived a length for it.
    const adaptiveRepeats = (lvl.sideScroll && lvl.songId == null && lvl.totalMeasures > 0)
        ? ADAPTIVE_LEVEL_REPEATS : 1;
    const adaptiveOverrides = variant.adaptive ? {
        adaptive: true,
        adaptiveBaseBpm: lvl.bpm,
        ...(adaptiveRepeats > 1 ? { totalMeasures: lvl.totalMeasures * adaptiveRepeats } : {}),
    } : {};
    const randomizeSongOverrides = (variant.randomizedNotes && lvl.songId != null) ? {
        randomizeSongMelody: true,
        forceTrebleSettings: {
            notesPerMeasure: lvl.randomizedNotesPerMeasure,
            variability: 30,
            randomizationRule: 'arp_group',
        },
    } : {};
    return {
        ...lvl,
        bpm,
        ...(span || {}),
        gatedScroll: variant.gatedScroll ?? lvl.gatedScroll,
        // #1102 bug fix (found while prototyping the 'x' variant, kept regardless of that pause — a
        // future color-less variant must fall back to the level's OWN color, not silently overwrite it
        // with `undefined`): every current variant (a-f) DOES specify a color, so this fallback is
        // defensive-only today, not yet exercised by any real selection.
        colorScheme: variant.colorScheme ?? lvl.colorScheme,
        colorScope: variant.colorScope ?? lvl.colorScope,
        ...callResponseOverrides,
        ...modulatedOverrides,
        ...randomizeSongOverrides,
        ...adaptiveOverrides,
    };
};

// Audit fix (Han 2026-08-24, "ga kritisch door de level modi heen en los inconsistenties op"): two
// letter x level-shape combinations were offered by LevelStartSplash.jsx's static VARIANT_LETTERS list
// without ever being checked against what the underlying mechanism actually supports — found by tracing
// every consumer of the fields a variant touches (the SAME method that caught §299's totalMeasures bug),
// not by guessing:
//
// 1. (RESOLVED, #1155, Han 2026-08-24 — was: call-response forces `enemyType: 'Wizard'`, which used to
//    flip on `useLevelTrebleStream`'s PROCEDURAL generation for a `songId` level too, silently replacing
//    the actual composed song with generated notes.) Fixed properly instead of excluded: when
//    `lvl.songId` is set, `useLevelTrebleStream` now SLICES the song's own measures into call/response
//    pairs (`sliceSongCallResponseBlock.js`) instead of generating anything — see that file's own
//    comment. d/e are therefore available for every level, songs included.
// 2. rubato (`variant.gatedScroll`) freezes the visual scroll indefinitely at any note the player hasn't
//    hit yet (SheetRpgLayer's `gatedFrozenRef`) — but a native Wizard/Mixed level's wizard "cast" preview
//    audio (`useLevelTrebleStream.js`/`useLevelMixedStream.js`, both `blockStartTime = contentStartTime +
//    blockIndex * blockMeasures * barSec`) is scheduled on a FIXED AudioContext-time schedule, same as
//    bass/metronome USED to be before #1096 built a gate-aware trigger for those specifically
//    (`useLevelGatedRubatoAudio.js`). No equivalent gate-aware mechanism exists for the wizard cast — if
//    the gate freezes, the next block's cast can still fire on schedule while the visual stays frozen on
//    an earlier note, an audio/visual desync never previously reachable (no NATIVE level combines
//    `gatedScroll` with `enemyType: 'Wizard'`/`'Mixed'`) until 'a' was offered unconditionally for every
//    `sideScroll` level, native Wizard ones (13/108/114/118) and Mixed (14) included.
//
// Building gate-aware wizard-cast timing (mirroring #1096) is a real feature, not a one-line fix — until
// that exists, both combinations are simply excluded here rather than shipped broken. Single source of
// truth for the picker (LevelStartSplash.jsx calls this instead of hand-filtering VARIANT_LETTERS itself).
export const availableVariantLetters = (lvl, letters) => letters.filter((letter) => {
    const variant = LEVEL_MODE_VARIANTS[letter];
    // #300/§304 (2026-08-24): a `decorativeWizard` level used to be EXCLUDED from d/e here — its
    // key-modulation stream and call-response's own JIT stream both tried to own the same treble state.
    // Han, on that fix: "why exclude d/e? why not have the wizard cast a modulation spell before each
    // call-response block?" — so instead of excluding the combination, `useLevelTrebleStream.js`'s block
    // generation now DOES the modulating itself when `decorativeWizard` is set (one stream, two jobs) —
    // no exclusion needed here any more. See that hook's `blockScale` for the merged mechanism.
    if (variant.gatedScroll && (lvl.enemyType === 'Wizard' || lvl.enemyType === 'Mixed')) return false;
    // #1154 (Han: "de al reeds random nummers hebben geen variant H"): only a FIXED song benefits from
    // "keep the chords, generate a new melody" — a procedural level is already fresh content every
    // playthrough, offering 'h' there would be a visible no-op choice.
    if (variant.randomizedNotes && lvl.songId == null) return false;
    // #1102 (Han 2026-08-28, "alle drie de architecturen in één ticket"): 'i' (adaptive speed) is
    // deliberately NOT gated per level shape — the tempo controller hooks into the two JIT streams AND
    // the classic per-wave path, so every one of the three content architectures a `sideScroll` level can
    // have is covered. No exclusion clause needed here; this comment exists so a future audit doesn't
    // read the absence as an oversight.
    return true;
});

// waves to clear = total measures / measures-per-wave. Each wave shows ONE generated melody
// (numMeasures) for `numRepeats` measure-slots (§686, Level 9's call-response: numMeasures=1,
// numRepeats=2 → the 1 generated measure is shown twice — once as the wizard's call, once as the
// player's repeat-measure — so a wave spans 2 measures of the level's timeline, not 1). Every
// pre-#686 level has numRepeats=1 (the field already existed, unused for this purpose), so this
// generalization changes no existing level's wave count (§6c: extend the formula, don't special-case).
//
// #1101 (Han 2026-08-22, "level eindigt nog steeds niet — level 3 (rubato)"): a `gatedScroll` level's
// treble is grown via `useLevelTrebleStream.js`'s JIT one-block-ahead streaming, which runs on its OWN
// real-time schedule INDEPENDENT of the gate/combat pace (`loopForever` — content never stops
// generating while the level is active, so the player waiting at note 1 does not slow it down). This
// means the level's full content (capped at its true end, `trebleFinalBarTick`) reliably finishes
// streaming in well before the player has cleared even the first of the "N discrete waves" this
// division used to assume — `killedCount`/`total` (SheetRpgLayer.jsx) are BOTH whole-song-cumulative
// for this kind of level (never wave-scoped), so there is really only ONE clear event possible: kill
// count catches up to the level's true total. Live-reproduced: Level 3 fired `onSlimesCleared` exactly
// once at killedCount===total===20 (all 20 notes), incrementing `wave` 0→1 — but `wavesForLevel`'s old
// division said `tw=5`, so `next(1) >= tw` was never true, `pendingSongEndRef` never got set, and the
// level was stuck forever with a blank staff (confirmed live via Playwright + temporary debug logging;
// removed after diagnosis). Fixed at the source: this SAME shape (`isJitTrebleLevel`) already existed
// independently in TWO other files (`useLevel.js`'s `isJitTrebleDriven`, `App.jsx`'s
// `isJitGatedSlimeLevel`) — consolidated here as the one shared predicate (§6c) so this fix, and any
// future one, can't drift out of sync between the 3 call sites again.
export const isJitTrebleLevel = (lvl) => !!(lvl?.sideScroll && lvl?.gatedScroll && !lvl?.songId
    && lvl?.enemyType !== 'Wizard' && lvl?.enemyType !== 'Mixed' && !lvl?.decorativeWizard);

// ── HISTORY: `usesTrebleJitStream` (REMOVED by #1165, Han 2026-08-29) ────────────────────────────
// The predicate below is kept as a comment because the BUG it documents is the exact class #1165's
// merge makes structurally impossible, and the trace is worth keeping. It answered "does this level's
// treble come from the JIT stream (rather than `regenerate()`)?" — a question with only one possible
// answer now: EVERY level's content comes from `useLevelContentStream`, and `onWaveCleared` no longer
// calls `regenerate()` for any level at all, so nothing can race the stream any more. The function
// itself is deleted (CLAUDE.md §7 — delete unused code, don't comment it out); this note is the
// audit trail its own comment asked future readers to follow.
//
// Bug fix (Han 2026-08-24 UAT, call-response levels: "enemies vanquished" underreported + a burst of
// extra "missed" judgments at level end). `isJitTrebleLevel` above deliberately EXCLUDES `enemyType ===
// 'Wizard'` — that's correct for ITS OWN job (picking the discrete numRepeats-based wave-count model,
// since call-response's wave counting is intentionally NOT the JIT one-wave model). But App.jsx's
// `levelTrebleStream` (useLevelTrebleStream.js) activates on `enemyType === 'Wizard' ||
// isJitTrebleLevel(lvl)` — i.e. call-response (Wizard-forced by #1101's d/e) DOES stream its treble via
// the SAME JIT one-block-ahead mechanism gated levels use, it just ALSO uses the discrete wave model for
// combat pacing. `useLevel.js`'s `onWaveCleared` only knew about the wave-model exclusion
// (`isJitTrebleLevel`), not the treble-stream one — so for a multi-wave call-response level it kept
// calling `regenerate()` on every wave clear (§867 round 3's own comment already identifies this
// class of bug for gated levels, but never widened the guard to cover Wizard/call-response, since no
// multi-wave Wizard variant existed until #1101). `regenerate()` resets `levelMelodyReady` and rebuilds
// the AMBIENT (non-JIT) treble/bass state that the JIT stream's own content isn't even reading from —
// racing it, and (via the `levelMelodyReady` flip `useLevelBackingStream`/`useLevelTrebleStream` both
// gate on) intermittently tearing down and restarting their own effects mid-level, which is what
// desynced the slime/kill bookkeeping (`slimeData` derives from `trebleMelody`, which the JIT stream
// keeps re-publishing right after `regenerate()` just wiped App.jsx's copy of it).
// Single shared predicate (§6c) — App.jsx's 3 inline `enemyType === 'Wizard' || isJitGatedSlimeLevel`
// call sites should eventually consume this too, not re-derive it a 4th time.
//     export const usesTrebleJitStream = (lvl) => !!(lvl?.enemyType === 'Wizard' || isJitTrebleLevel(lvl));
// ── END HISTORY ─────────────────────────────────────────────────────────────────────────────────

export const wavesForLevel = (lvl) => (isJitTrebleLevel(lvl)
    ? 1
    : Math.max(1, Math.round(lvl.totalMeasures / (lvl.numMeasures * (lvl.numRepeats || 1)))));

// #1099 (Han 2026-08-22, ANPM stat) + #1102 (Han 2026-08-23, adaptive tempo): "maten per minuut x noten
// per maat" (Han) — the level's own total note count, shared by BOTH the post-completion ANPM update
// (App.jsx) and the pre-start adaptive-tempo baseline (applyLevelVariant below), so the two formulas can
// never drift apart (CLAUDE.md §6c: one source of truth, not two independent copies). Bass only counts
// when `twoHanded` (Han: bass counts ONLY "als die in input staat" — the player is actually playing it,
// not just hearing an accompaniment track). Bass's own notesPerMeasure isn't always exposed as a flat
// field (song-backed levels nest it in the song definition), so this falls back to 1/measure — the value
// BOTH `LEVEL_BASS_SIMPLE` and `LEVEL_BASS_DEFAULT` above already use when a level doesn't set
// `tracks.bass.notesPerMeasure` explicitly.
export const totalNotesForLevel = (lvl) => {
    const trebleNotesPerMeasure = lvl?.notesPerMeasure || 0;
    const bassNotesPerMeasure = lvl?.twoHanded ? (lvl?.tracks?.bass?.notesPerMeasure ?? 1) : 0;
    return (lvl?.totalMeasures || 0) * (trebleNotesPerMeasure + bassNotesPerMeasure);
};

// treble-only staff visibility, in the playbackConfig `eyes` shape the app already uses (see PresetPicker).
// #663 (Han 2026-08-03, "laat [de akkoordenprogressie] in debug ook maar zien"): `showChords` follows the
// SAME debugOnlyLines gate as bass/percussion (useLevel.applyConfig picks the arg) — default false so
// existing non-level callers of these helpers are unaffected.
export const trebleOnlyEyes = (rounds, showChords = false) => ({
    ...rounds, trebleEye: true, bassEye: false, percussionEye: false, chordsEye: showChords,
});

// #661 (Han 2026-08-02, "de 3 lijnen zichtbaar maken"): side-scroll levels show treble + bass + percussion
// (all 3 scroll — SheetRpgLayer §661). #663: chords are a 4th debug-only line (Han: "laat de
// akkoordenprogressie in debug ook maar zien") — a level has no chord-track UI, but the tonic progression
// backing the cello's roots is now visible for verification while debugging.
export const threeLineEyes = (rounds, showChords = false) => ({
    ...rounds, trebleEye: true, bassEye: true, percussionEye: true, chordsEye: showChords,
});
