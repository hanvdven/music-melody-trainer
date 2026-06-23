# Architecture Audit — music-melody-trainer

**Date:** 2026-06-19 · **Scope:** whole `src/` tree · **Method:** read-only audit across four
dimensions (duplication/SSOT · module size & structure · dead code & consistency · tests &
doc-drift). **No code was changed.** Every fix below is a *finding*; per CLAUDE.md §4b each one
still needs an interview with Han before implementing.

Baseline at audit time: **320 tests / 33 files green**, `npm run build` clean (one non-fatal
warning: main chunk 829 kB > 500 kB, no code-splitting).

---

## 1. Executive summary

The codebase is in **good architectural health**. The intended single sources of truth mostly
exist and are mostly respected: transposition, drum routing, chord-interval tables,
`StaffQuarterNote` geometry, `getNoteAbsoluteY`, the logger + error-code discipline (E001–E020 all
used *and* documented), and Unicode-accidental hygiene (§5b) are all clean.

The debt is **concentrated and predictable**, in five themes:

1. **Note/pitch primitives aren't fully consolidated** — the same small operations
   (strip-octave, name→MIDI, note-colour, chromatone colour-mix) are re-implemented many times,
   sometimes *bypassing a canonical helper that already exists*. This is the single biggest
   single-source-of-truth gap and it is mostly **low-risk** to fix.
2. **One undocumented derived timing constant (`5/bpm`)** is scattered across ~7 sites.
3. **Four god-files** (`SheetMusic.jsx` 3192, `Sequencer.js` 2134, `renderMelodyNotes.jsx` 1814,
   `App.jsx` 1749) mix several cohesive responsibilities each.
4. **Dead code** — one fully-orphaned module, one empty migration shim, ~16 unused exports.
5. **The most fragile core is the least tested** — `Sequencer`, `Song`, the generation pipeline,
   and `useSheetMusicHighlight` have near-zero direct coverage, and several §6 invariants rely on
   developer discipline with no guard.

None of this is urgent. The recommended order (§7) front-loads the cheap, low-risk, high-leverage
work (SSOT helpers, dead-code deletion, doc fixes, guard tests) and defers the high-risk god-file
splits until a test harness protects them.

---

## 2. Top 10 priorities (cross-cut, ranked by value ÷ risk)

| # | Action | Theme | Effort | Risk |
|---|---|---|---|---|
| 1 | Export `stripOctave`/`pitchClassName` from `noteUtils.js`; replace ~15 inline `.replace(/-?\d+$/,'')` + 2 private copies + the inconsistent `/\d+/g` in `ChordLabelsLayer` | SSOT | S | L |
| 2 | Delete dead code: `appConfig.js` (whole file), `usePlaybackState` shim, ~16 unused exports | Dead code | S | L |
| 3 | Fix doc drift: `_pregeneratedNextSeries`→`pregenResult`, `E010-PLAYBACK-START`→`E010-PLAY-MELODY`, `calculateAllOffsets.js` location in §8 | Doc | S | L |
| 4 | Add `Song` unit test (`appendMeasures` idempotency + `getWindow` null-holes) | Tests | S | L |
| 5 | Export `chromatoneMix(pc, pct, theme)` from `noteUtils.js`; replace the 5 hand-written `color-mix(… 30%)` / 3× `60%` strings | SSOT | S | L |
| 6 | Add `secondsPerTick(bpm)`/`ticksPerSecond(bpm)` to `constants/timing.js` (derived from `TICKS_PER_WHOLE`); replace scattered `5/bpm`, `bpm/5`, `5000/bpm` | SSOT | M | M |
| 7 | Two grep/lint guard tests for the discipline-only §6 invariants (no `setTimeout`→`setCurrentMeasureIndex`; no `opacity` JSX prop on `[data-pagination-*]`/`[data-wipe-role]`) | Invariants | S | L |
| 8 | Consolidate note-colour: make `renderMelodyNotes.getMelodicColor` + `SheetMusic.jsx` inline switch call the existing `melodicNoteColor`/`chordNoteColor` | SSOT | M | M |
| 9 | Extract `useEditMode.js` (collapse 5 boolean edit-mode states + 5 toggles into one machine) | Structure | M | M |
| 10 | Generation-pipeline golden test (treble+bass+perc × 4/4, 5/4, 7/8) guarding the §6b "identical pipeline" invariant | Tests | M | M |

---

## 3. Duplication & Single-Source-of-Truth

Intended sources (§8/§12): pitch math → `noteUtils.js`/`musicUtils.js`; MIDI↔name →
`rangeUtils.js`; glyphs → `staffNoteGlyph.jsx`/`renderMelodyNotes.jsx`/`clefGlyphs.jsx`/
`renderAccidentals.jsx`; drum routing → `playMelodies.js`/`drumKits.js`; timing →
`constants/timing.js`; note colour → `melodicNoteColor`/`chordNoteColor`.

### HIGH — already diverged
- **Note-colour switch re-implemented 3×, bypassing the documented helper.**
  `renderMelodyNotes.jsx:872` (`getMelodicColor`) and `SheetMusic.jsx:1428-1439` each inline the
  full chromatone/subtle/chords/tonic switch, while the canonical `melodicNoteColor`/
  `chordNoteColor` (`noteUtils.js:221-244`) — whose own comment says "shared … so they all match"
  — is **not** called by the staff. Any colour tweak must be made in 3 places. → make both call the
  helper, pass `activeChord`. (M/M)
- **Chromatone colour-mix string hand-written in 5 sites.**
  `color-mix(in srgb, var(--chromatone-${root}), white/black 30%)` at `noteUtils.js:226`,
  `renderMelodyNotes.jsx:885`, `SheetMusic.jsx:1434`, `RangeStaffOverlay.jsx:666`,
  `TranspositionSetter.jsx:162` (the `60%` subtle variant likewise ×3). → export
  `chromatoneMix(pc, pct, theme)`. (S/L)
- **Four divergent name→MIDI parsers.** `rangeUtils.js:9` (`getNoteValue`, C4=60),
  `convertRankedArrayToMelody.js:87` (local `getNoteValue`, off-by-12, can't parse `𝄪`/`𝄫`/stacked
  accidentals), `usePitchDetector.js:29` (own octave math), `musicUtils.js:10` (`getNoteIndex`,
  full accidental support). → consolidate to one parser. (M/M)

### MEDIUM
- **Strip-octave duplicated ~15×** with two private `stripOctave` copies and one *different* regex.
  Sites: `App.jsx:433,484,1230`; `Chord.js:22,52,97,99`; `chordGenerator.js:73,496,683,684`;
  `noteUtils.js:153`; `loadSong.js:154`; `ClefStaffOverlay.jsx:18`; and `ChordLabelsLayer.jsx:62`
  uses `/\d+/g` (would strip mid-string digits too). → export `stripOctave`. (S/L)
- **`timeFactor = 5/bpm` re-derived everywhere; the "5" is undocumented** (it is `60/bpm/12`
  because quarter = 12 ticks, only valid while `TICKS_PER_WHOLE=48`). Sites: `playMelodies.js:29`,
  `Sequencer.js:359,1801`, plus `App.jsx:765` (`bpm/5`), `App.jsx:827` (`5000/bpm`),
  `App.jsx:233` (`2*60/bpm`), `ChordGrid.jsx:163` (`60/bpm`). → `secondsPerTick(bpm)`. (M/M)
- **`noteYMap` is a hardcoded 50-entry staff-Y table** (`renderMelodyNotes.jsx:60-121`, 5px/step).
  A formula generalises and removes ~60 hand-typed lines; low priority since it's the single
  source today. (M/M)

### LOW
- **`SettingsOverlay.jsx:234-240` hand-rolls noteheads/stems/beam** (`fontSize 36`, manual stem
  `line`, beam `path` offsets `±4.5/±25`) instead of `StaffQuarterNote` — exactly the §6d drift the
  shared glyph module exists to prevent (other overlays do use it). (M/L)
- **Pitch-detector reimplements MIDI→name octave/clamp** (`usePitchDetector.js:29-34`) vs
  `getNoteFromValue` (`rangeUtils.js:18`). Spelling differs intentionally (sharp-lean `PC_NAMES`);
  document or parameterise. (S/L)

---

## 4. Module size & structure

15 largest files (LOC): `SheetMusic.jsx` 3192 · `Sequencer.js` 2134 · `renderMelodyNotes.jsx` 1814
· `App.jsx` 1749 · `RangeStaffOverlay.jsx` 1108 · `convertRankedArrayToMelody.js` 933 ·
`chordGenerator.js` 778 · `scaleHandler.js` 777 · `PianoView.jsx` 644 ·
`useSheetMusicHighlight.js` 623 · `melodyGenerator.js` 602 · `ClefStaffOverlay.jsx` 598 ·
`ScaleSelector.jsx` 518 · `InstrumentRow.jsx` 517 · `generateBackbeat.js` 484.

### Highest raw value but HIGH risk — do only with a test harness first
- **`Sequencer.start()` is one ~1018-line method** (`Sequencer.js:54-1071`): session setup, outer
  measure loop, per-block note/chord/label scheduling, overlay (yellow/red) transitions, series
  regen — all inline. → extract `scheduleBlock()` + `scheduleTransitions()`, keep `start()` as the
  loop skeleton. (L/H)
- **`Sequencer.randomizeScaleAndGenerate()` ~547 lines** (`Sequencer.js:1072-1619`) mixes scale
  derivation, octave-shift, chord transposition, MeasureSlice assembly, and **duplicates the
  display-note map 3×** (`1384-1430`, `1526-1552`). → extract a pure `generateNextSeries.js` +
  `transposeDisplayNotes()`. Restores the §8 "Sequencer = scheduling only" boundary. (L/H)
- **`renderMelodyNotes.jsx:286-1814` is one ~1500-line function** (beam groups, stem direction,
  tuplet brackets, ledger lines, noteheads). → `computeBeamGroups.js` (pure) + per-note
  `renderNoteGlyph`. (L/H)

### Best benefit ÷ risk
- **`useEditMode.js`** — App.jsx has 5 parallel boolean edit modes (`196-214`) + 5 toggles
  (`658-722`); collapse into one state machine (one mode active at a time), killing a class of
  "two overlays open" bugs. (M/M)
- **`clefResolution.js`** — `getClefShiftValue`/`calculateOptimalClef`/`octaveAdjustedClef`/
  `clefForScreen` are pure fns defined *inside* `SheetMusic.jsx:565-1029`; move out → testable, no
  behaviour change. (S/L)
- **`LyricsLayer.jsx` + `FermataLayer.jsx`** — three near-identical lyric renderers + fermata glyphs
  inline (`SheetMusic.jsx:1483-1700`); collapse to one component (mode prop), ~250 lines, matches
  the existing `*Layer` convention. (M/M)
- **`noteColor.js`** — see §3; single `melodicNoteFill(note, {tonic, scaleNotes, activeChord})`,
  consolidating the 5-way colour drift. (M/M)
- **`useRubato.js`** — the rubato engine (refs, EWMA estimator, accompaniment scheduler, scroll
  anchor) lives inline in `App.jsx:743-918` (~175 lines); extract → testable subsystem. (M/M)
- Smaller: `handleLoadSong` parse logic → `loadSong` resolver (`App.jsx:432-540`); `midiOf`
  parse inlined twice in `SheetMusic.jsx:1404-1502` → use `noteUtils`; `useMelodyState.randomizeAll`
  (~250 lines) → extract `adaptChordsToMeasures()`/`generateChordMelody()`.

**Coupling:** layering is healthy (UI → theory/generation dominant; no UI reaching audio internals
except the `useInstruments` hook boundary, which is acceptable). No circular imports observed. The
one smell is `Sequencer.js` embedding ~1100 lines of generation, blurring its §8 ownership.

---

## 5. Dead code & consistency

All "unused" claims were verified with repo-wide ripgrep (excluding the defining file + tests).

### Safe to delete
- **`src/utils/appConfig.js`** — whole module orphaned (`saveConfig/loadConfig/clearConfig/
  downloadConfig`, 0 importers).
- **`usePlaybackState` in `src/contexts/PlaybackStateContext.jsx`** — its own doc says "kept for
  gradual migration"; migration is complete (0 consumers).
- **~16 unused exports**: `chordLog.js` (`getChordLog/clearChordLog/downloadChordLog`);
  `difficultyCalculator.js` (`calcMelodicDifficulty/calcRhythmicDifficulty/calcSongDifficulty`);
  `progressionDefinitions.getProgressionStrategy`; `generateBackbeat.GROOVE_PATTERNS` (§6b: re-read
  first); `tuplets.tupletWeight`; `renderMelodyNotes` (`stripAccidentals/percussionStemUp`);
  `noteUtils.CHROMATIC_ROMAN_DEGREES`; `clefGlyphs.Ottava22`; `SettingsOverlay.getVolStep`;
  `PlaybackSubComponents.StatusIcon`; `CustomIcons` (`ChordIcon/NotesIcon`);
  `KeyboardRangeSetter` (`PRESET_TICK/presetViewHeight`); `drumKits`
  (`PERCUSSION_DISPLAY_FAMILIES/PERCUSSION_DISPLAY_ORDER/ALL_SAMPLES`);
  `localInstruments.LOCAL_MY_INSTRUMENT_BUFFERS`; `clefSelector.OCTAVE_VARIANTS`.
  *(Verified NOT dead — keep: `getTranspositionDisplay`, all `staffNoteGlyph.jsx` geometry exports.)*

### Shims / commented-out (§7)
- `melodyGenerator.js:231-235` — `if (Array.isArray(rawResult))` "partial hot reload / mixed
  versions" defensive shim (verify §6b that `convertRankedArrayToMelody` always returns an object).
- `Sequencer.js:1181` — dead `// … // REMOVED` line.
- `convertRankedArrayToMelody.js:73,154,535` — "legacy fallback (pre-refactor objects)" dual paths
  (needs §6b investigation; lower confidence).
- `scaleHandler.js:394-420` — `generateLegacyModes`/`legacyModeKey` is **still actively called**
  (606/636/648) — flagged, **not** removable.

### Consistency (clean elsewhere)
- Logger + error codes: **clean** (24 `logger.error`, all coded; E001–E020 used and documented).
- Unicode accidentals (§5b): **clean** (all ASCII `b`/`#` are internal identity keys, not display).
- Naming drift: comments say `getInstrumentIcon` but the export is `getInstrumentIconUrl`
  (`instruments.jsx:11,22` vs `:156`); plus a stale "see TODO below" (`:23`). Comment-only fix.

---

## 6. Tests & doc drift

### Test gaps (the fragile core is the least covered)
Strong coverage exists on pure/leaf units (`noteUtils`, `musicUtils`, `chordRecognition`,
`rangeUtils`, `melodySlice`, `pagination`, `transitionPlanner`, `rhythmicPriorities` incl. the §6b
odd-meter regression guard) and on overlay UI. **But the highest-churn / highest-invariant files
have no direct test:** `Sequencer.js` (2134 LOC), `useSheetMusicHighlight.js` (623),
`melodyGenerator.js` + `convertRankedArrayToMelody.js` (1535), `Song.js`, `SheetMusic.jsx` (3192,
59 commits).
- `Song.appendMeasures` idempotency + `getWindow` null-holes — untested core invariant. (S)
- Generation pipeline — no end-to-end test; the §6b invariant can regress unnoticed (the May-2026
  bug). Golden test across 4/4 + odd meters. (M)
- `convertRankedArrayToMelody` note-pool/randomisation rules — untested (933 LOC). (M)
- `useSheetMusicHighlight` — extract pure helpers (`pageFraction`, `tx`, eased opacity) and test;
  rAF itself stays manual. (M)
- `Sequencer._armPaginationSequence` boundary→`setTimeout` mapping — fake timers + mock
  AudioContext. (L)

### Doc drift
- `_pregeneratedNextSeries` referenced in arch §5.2/§9 **does not exist**; code uses
  `this.pregenResult` (`Sequencer.js:45`). (S)
- CLAUDE.md §7a example says `E010-PLAYBACK-START`; actual code/list is `E010-PLAY-MELODY`
  (`usePlayback.js:180,205`). Breaks grep-ability — the whole point of stable codes. (S)
- §8 ownership table: "Visual block layout → pagination.js" but `calculateAllOffsets` lives in
  `src/components/sheet-music/calculateAllOffsets.js`. (S)
- Build emits an undocumented 829 kB chunk-size warning (no code-splitting). (S)
- *(~40 other doc-referenced symbols verified present — no other drift.)*

### Invariant guards (§6: discipline-only → candidates to enforce)
- No `setTimeout`→`setCurrentMeasureIndex` — discipline only (currently clean). Add grep guard. (S)
- No `opacity` JSX prop on `[data-pagination-*]`/`[data-wipe-role]` — discipline only. Add grep
  guard. (S)
- `Song` append-only / never reset — discipline only; covered by the Song test above.
- Capture `sessionController` at loop top — implemented (`Sequencer.js:66`) but untested;
  abort-after-stop test. (M)

### Tooling
- No coverage thresholds (`test:coverage` exists, no gate in `vitest.config.js`). (S)
- ESLint permissive: `no-unused-vars`/`react/prop-types` are `warn` not `error`; no §6 guard rules.
  Consider `no-restricted-syntax` for the two guards above. (S–M)
- `npm run lint` is "optional" in §7b — promote to a required pre-commit step. (S)

---

## 7. Suggested roadmap (phased)

**Phase 0 — cheap, low-risk, high-leverage (do first; mostly S, risk L):**
dead-code deletion (§5) · doc-drift fixes (§6) · SSOT helpers `stripOctave` + `chromatoneMix`
(§3) · `Song` unit test · the two invariant grep-guards · make `lint` a required gate.
*These are largely mechanical, independently testable, and shrink the surface before any deeper work.*

**Phase 1 — medium, contained (risk L–M):**
`secondsPerTick`/`ticksPerSecond` consolidation · note-colour consolidation → `noteColor.js`
(merges the §3 colour drift + the §4 god-file slice) · unify the name→MIDI parsers · extract
`clefResolution.js`, `useEditMode.js`, `LyricsLayer/FermataLayer`, `useRubato.js` · generation
golden test.

**Phase 2 — high value, HIGH risk (only after a Sequencer/generation test harness exists):**
split `Sequencer.start()` and `randomizeScaleAndGenerate()` · extract `computeBeamGroups.js` from
`renderMelodyNotes.jsx`. These touch documented timing/transition invariants (§6, arch §7) and must
be protected by tests before being moved.

---

## 8. How to use this document

This is an audit, not a work order. Pick an item, then run the §4b interview (functional + technical
questions) before writing any code. Phase 0 items are the safest starting points and several can be
batched. When an item is done, mark it here with a dated note (per §1b conventions) and add the
test/doc that the audit recommended in the same change (§7b).
