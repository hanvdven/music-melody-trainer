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
import { DEFAULT_TIME_SIG } from '../constants/generatorDefaults';

const SONG_BY_ID = Object.fromEntries(SONGS.map((s) => [s.id, s]));

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
        range: { min, max },
        key: { tonic: `${songDef.defaultTonic}4`, mode: songDef.generator.scaleMode },
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
    return { ...merged, numRepeats, totalMeasures, ...(span || {}) };
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

export const LEVEL1 = byId[1];
export const LEVEL2 = byId[2];
export const LEVEL3 = byId[3];
export const LEVEL4 = byId[4];
export const LEVEL5 = byId[5];
export const LEVEL6 = byId[6];
export const LEVEL7 = byId[7];
export const LEVEL8 = byId[8];
export const LEVEL9 = byId[9];

export const LEVELS = byId;

// waves to clear = total measures / measures-per-wave. Each wave shows ONE generated melody
// (numMeasures) for `numRepeats` measure-slots (§686, Level 9's call-response: numMeasures=1,
// numRepeats=2 → the 1 generated measure is shown twice — once as the wizard's call, once as the
// player's repeat-measure — so a wave spans 2 measures of the level's timeline, not 1). Every
// pre-#686 level has numRepeats=1 (the field already existed, unused for this purpose), so this
// generalization changes no existing level's wave count (§6c: extend the formula, don't special-case).
export const wavesForLevel = (lvl) => Math.max(1, Math.round(lvl.totalMeasures / (lvl.numMeasures * (lvl.numRepeats || 1))));

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
