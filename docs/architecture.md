# Architecture

This document is the **authoritative specification** for the entire application: data models, generation pipeline, rendering, scrolling, and transition system. Implement against this spec. If code disagrees with this document, the document wins.

---

## 0. Jargon / Glossary

| Term | Definition |
|---|---|
| **visual block** | The measures currently visible on screen at one time. In pagination: one "page" = `musicalBlocks[b]` measures (may be < `numMeasures` if note slots would be too narrow). In scroll/wipe: always `visibleMeasures` (= 3) measures. |
| **repeat block** | One full pass through all `numMeasures` measures of a melody. The Sequencer plays one repeat block per outer `for m = 0..numMeasures-1` iteration. A sequence block contains `repsPerMelody` repeat blocks. |
| **sequence block** | All measures in one complete series = `numMeasures × repsPerMelody`. A new melody is generated (via `randomizeScaleAndGenerate`) after every sequence block. The `melodyCount` counter increments once per sequence block. |
| **visual block count** | Number of visual blocks per repeat block = `musicalBlocks.length` (always ≥ 1). `musicalBlocks` is computed by `calculateMusicalBlocks` from `numMeasures` and note slot width. |
| **block boundary** | The audio moment when one visual block ends and the next begins. Triggers a page-turn event. |
| **block end** | The audio moment when the last measure of a repeat block finishes = start of the next repeat block or series. |
| **series boundary** | The audio moment when the last repeat block of a sequence block finishes and a new melody is applied. |
| **yellow overlay** | The semi-transparent preview rendered over the current content showing the same melody in *next-round* note visibility. Used at repeat boundaries (within a sequence block). |
| **red overlay** | The semi-transparent preview rendered showing the *new* (pre-generated) melody. Used at series boundaries. |
| **`startMeasureIndex`** | The global measure index of the first measure currently rendered. SheetMusic uses this to assign `data-measure-index` attributes and visible measure numbers. |

---

## 1. Core Data Model

### Song
`Song` is a flat, append-only array of `MeasureSlice` objects.
- Every `MeasureSlice` has a unique, monotonically-increasing `measureIndex` (= `globalMeasureIndex` at the time it was created).
- `Song.getWindow(start, count)` returns `count` slices starting at absolute index `start`. Indices not yet in Song return `null`.
- Song is NEVER reset mid-playback. It accumulates across all iterations and series boundaries.

### MeasureSlice shape
```
{
  measureIndex:       number,          // global, 0-based
  timeSignature:      [n, d],
  measureLengthTicks: number,
  treble:             SlicedMelody | null,
  bass:               SlicedMelody | null,
  percussion:         SlicedMelody | null,
  metronome:          SlicedMelody | null,
  chordMelody:        SlicedMelody | null,
  chords:             Array<{chord, absoluteOffset, isSlash}>,
  tonic:              object | null,
  numAccidentals:     number,
  display:            'notes' | 'hidden',
  metadata:           { cycle, repeatBlock, iteration, isOddRound }
}
```

---

## 2. Data Concepts & Settings

The app separates concerns into distinct value objects. Each object is immutable after creation; mutation happens only by creating new instances.

### Theory
Scales, chords, and chord progressions — pure music-theory data. No playback or UI state.

### Scale
| Field | Description |
|---|---|
| `tonic` | Root note of the scale (e.g. `"C"`, `"F♯"`) |
| `mode` | Scale mode (e.g. `'major'`, `'dorian'`) |
| `family` | Scale family grouping (e.g. `'diatonic'`, `'pentatonic'`) |
| `notes` | Computed note array for this tonic + mode combination |

### InstrumentSettings
| Field | Description |
|---|---|
| `instrument` | Instrument name / Soundfont slug |
| `range` | `{ low, high }` MIDI note bounds |
| `notesPerMeasure` | Target note density |
| `playbackSettings` | Per-round visibility rules (`round1` / `round2`) |
| `variability` | How much the generated melody deviates from chord tones |
| `randomizationType` | Note selection strategy: `'roots'`, `'chord'`, `'scale'`, `'balanced'` |

### GeneratorSettings
| Field | Description |
|---|---|
| `bpm` | Tempo in beats per minute |
| `timeSignature` | `[numerator, denominator]` |
| `numMeasures` | How many measures per melody |

### Melody
An ordered array of notes with timing information: `{ note, duration, timestamp, rest }`.

Optional parallel arrays on the `Melody` object:

- **`triplets`** — `Array<TupletEntry | null>`, same length as `notes`. `null` for non-tuplet notes. Present only when the melody contains at least one tuplet (see §22).

```ts
type TupletEntry = {
  id:             number;   // unique group id per melody; ties all notes in one group together
  noteCount:      number;   // how many notes are in the group (3, 4, or 5)
  denominator:    number;   // the normal note count that the group replaces (2, 3, or 4)
  groupTicks:     number;   // total tick span of the group (= raw tick duration of the replaced note)
  visualDuration: number;   // standard tick duration to use for notehead/flag lookup = groupTicks / denominator
};
```

- **`fermatas`** — `Array<{ tick: number, hold: number }>`. Song-level events shared identically across treble + bass + percussion + chordMelody (see §25). `tick` = absolute tick of the held note; `hold` = extra tick count the note sustains beyond its natural duration, and the amount every subsequent note in every track gets delayed. Loaded from per-difficulty `fermatas` field in song JSON; for generated melodies the array stays absent.

- **`lyrics`** — `Array<string | null>`, same length as `notes`. Loaded from song JSON (e.g. HBD's lyric syllables). Absent for generated melodies.

### SystemSettings
Application-level UI preferences (theme, etc.) — not music-theory state.

---

## 3. Generation Pipeline

A new melody is generated at the start of each sequence block (or on demand). Generation is a linear pipeline: trigger → chords → melody → slices.

### Chord Authorship & State Management

Two writers, strictly separated to prevent race conditions:

- **Manual Author (UI):** When the user changes scale, tonic, number of measures, or chord complexity via the UI, `manualChordTriggerRef` is set to `true`. This triggers a one-time chord regeneration in `App.jsx`.
- **Continuous Author (Sequencer):** During continuous playback the `Sequencer` is the authorised writer of new chords at the end of each cycle. UI reactions to these changes are blocked by `manualChordTriggerRef` (stays `false`).

### Step 1 — Trigger & Context (`Sequencer.js`)
The `Sequencer` is the conductor:
- **Continuous play:** `start()` or `randomizeScaleAndGenerate()` orchestrates the full pipeline.
- **Scale management:** resolves the active `Scale` first (including random tonic/mode/family changes if enabled).
- **Race condition guard:** `shouldRegenerateChordsRef` flag prevents `App.jsx` from overwriting the Sequencer's chords.

### Step 2 — Chord Generation (`chordGenerator.js`)
1. **Strategy selection:** `generateProgression` is called with a strategy (e.g. `'ii-v-i'`, `'random'`, `'modal-random'`).
2. **Degree selection:** the strategy determines which scale degrees (1–7) are used.
3. **Chord instantiation:** `generateChordOnDegree` per degree — computes root, builds chord structure, creates a `Chord` instance (`model/Chord.js`) with fully resolved metadata.

### Step 3 — Propagation (`Sequencer.js` → `melodyGenerator.js`)
The `Sequencer` passes the generated `chordProgression` (array of `Chord` objects) to the `MelodyGenerator` constructor for each track (treble, bass, percussion).

### Step 4 — Melody Construction (`melodyGenerator.js`)

**Overview:** six sub-steps, identical for ALL instrument tracks (treble, bass, chords, percussion). No instrument-specific special-casing is allowed in the generation pipeline. `InstrumentSettings` (notePool, randomizationRule, smallestNoteDenom, rhythmVariability, …) carry all per-instrument variation.

#### 4a — RhythmicDNA (`rhythmicPriorities.js` → `generateRhythmicDNA`)
Produces a flat array of integer ranks for **one measure** — one rank per slot.

- **Beat grouping** (`chooseGrouping`): decomposes the meter numerator into groups of 2 and 3 (e.g. 5 → [3,2] or [2,3], randomly ordered). Groups are chosen once and shared by all measures in the block.
- **Phase 1:** rank group downbeats (leftmost first, then closest to n/2, n/4, 3n/4…).
- **Phase 2:** rank 3-group third beats (rightmost first); fall back to 2-group second beats when no 3-groups.
- **Phase 3:** rank second beats of all groups (only when 3-groups exist; otherwise Phase 2 already covered these).
- **Subdivision expansion:** after beat-level ranks are assigned, the loop `while step > 1` fills in-between slots at increasing rank levels — each doubling of resolution gets a higher (lower-priority) rank.
- **slotsPerBeat guard:** `effectiveDenom = Math.max(smallestNoteDenom, denominator)` ensures `slotsPerBeat = effectiveDenom / denominator ≥ 1` always — even when the instrument's `smallestNoteDenom` is coarser than a beat (e.g. bass with `smallestNoteDenom=2` in 4/4). Callers pass the raw `smallestNoteDenom`; the guard is internal to this function.
- **Result:** `number[]` of length `numerator × slotsPerBeat`. Lower rank = higher rhythmic priority.
- **Attached to melody** as `melody.rhythmicDNA` for debug display in SheetMusic.

#### 4b — Measure replication (`melodyGenerator.js`)
`deterministicTemplate = new Array(numMeasures).fill(null).map(() => [...dnaMeasure])`

The single-measure DNA array is deep-copied once per measure. All measures share the same grouping and rank structure — variability is added in the next step.

**Exception path:** when `globalRhythmArray` is set (cross-instrument rhythm sync), the template is downsampled from the global 16th-note grid instead. In this case `melody.rhythmicDNA` is null.

#### 4c — Variability & ranking (`generateRankedRhythm.js`)
Takes the `deterministicTemplate` and applies stochastic shuffling:

- **Variability blend:** each slot value is perturbed by `(v/100) × totalSlots × random × 1.1 + ((1-v/100) × deterministicValue)` where `v = rhythmVariability`. At `v=0` the DNA order is fully preserved; at `v=100` it is nearly random.
- **Sorting → rank assignment:** non-null values are sorted ascending; their array indices receive monotonically increasing rank integers. Equal values share the same rank.
- **Result:** `number[]` of length `numMeasures × slotsPerMeasure`. Rank 0 = highest priority slot for note placement.
- **`measureNoteResolution = Math.max(timeSignature[1], smallestNoteDenom)`** is applied here too, matching the slot count produced by `generateRhythmicDNA`.

#### 4d — Range preparation (`melodyGenerator.js`)
Filters the scale to only notes within the instrument's configured range (`InstrumentSettings.range`). For chromatic-range instruments the full chromatic set within the range is used. This produces `effectiveScale`.

#### 4e — Note assignment (`convertRankedArrayToMelody.js`)
Walks the ranked array and assigns notes to active slots:

- **Active slot detection:** a slot is active when its rank places it within the top `notesPerMeasure` ranks per measure.
- **Chord lookup:** for each slot, `getActiveChord(offset)` returns the current chord from `chordProgression`.
- **Note pool filtering:** depending on `notePool` ('scale' | 'chord' | 'all' | 'metronome'), the candidate list is filtered.
- **Randomization rule:** one of `'uniform'`, `'emphasize_roots'`, `'weighted'`, `'arp'`, `'fixed'` — determines how a note is chosen from the candidate pool.
- **Null slots:** inactive slots remain `null`; they become continuation ticks in `Melody.fromFlattenedNotes` (see 4f).

**Early-exit special cases** (before convertRankedArrayToMelody):
- `backbeat` / `backbeat_2` / `swing`: percussion-specific generators, return a `Melody` directly.
- `fullchord` / `pairedchord`: chord-voicing modes that replace note strings with `string[]` arrays.

#### 4f — Rest insertion & melody construction (`melodyGenerator.js` → `Melody.fromFlattenedNotes`)
- **Percussion rest insertion:** `insertRestsAtBeats` ensures every beat-aligned null slot becomes an explicit rest `'r'` (so the sheet renderer never shows a beat-length empty gap).
- **`Melody.fromFlattenedNotes`:** converts the flat slot array into `(notes, durations, offsets)` triplets. Consecutive null slots after an active note extend that note's duration (`timeScale × count`). The `timeScale` is derived from `notes.length` and `numMeasures`, so it matches the actual slot resolution.
- **Metadata attachment:** `melody.rhythmicGrouping = rhythmicGrouping`, `melody.rhythmicDNA = dnaMeasureForDebug` — used by the renderer for beaming and debug display.

#### 4g — Tuplet post-processing (`melodyGenerator.js`)
After `fromFlattenedNotes`, when `rhythmVariability > 0`, each active note has independent probabilistic chances of becoming a tuplet group (triplet, quintuplet, etc.). See §22 for the full tuplet specification.

**Beat-group boundary penalty:** tuplets that span a rhythmic group boundary (e.g. crossing the 3|2 division in 5/4) receive a 10× probability reduction (`CROSS_BOUNDARY_FACTOR = 0.1`).

### Step 5 — Note Assignment (`convertRankedArrayToMelody.js`)
*(Detailed in §4e above.)*

### Step 6 — Slicing (`melodySlice.js`)
The multi-measure `Melody` is sliced into per-measure `SlicedMelody` objects for sheet-music rendering. `rhythmicGrouping` and `rhythmicDNA` are passed through all slice/resize operations unchanged.

---

## 4. Layout Constants

```
startX            = (header width based on key signature)
endX              = logicalScreenWidth − 10
visibleMeasures   = 3   (hardcoded, App.jsx prop to SheetMusic)
measureWidth      = (endX − startX) / visibleMeasures
measurePpt        = measureWidth / measureLengthSlots    (pixels per tick)
fixedPlayheadX    = startX + 60
pageWidth         = endX − startX
```

`measureWidth` and `measurePpt` are the same in ALL three modes. One measure always fills exactly `1/visibleMeasures` of the available staff width.

---

## 5. Playback Modes

### 5.1 Pagination (Hard-Cut)

**What the user sees:** The screen shows exactly `visibleMeasures` measures, all static. When the last measure of a page finishes, the screen cuts to the next page instantly.

| Property | Value |
|---|---|
| Render source | `Song.getWindow(windowStart, visibleMeasures)` |
| Scroll transform | None — `.scroll-group-transform` stays at `translate(0,0)` |
| Layer B | Never used |
| Window advance | When `currentMeasureIndex >= windowStart + visibleMeasures` → jump to `currentMeasureIndex - (currentMeasureIndex % visibleMeasures)` |
| Transition | Hard cut — no animation |

---

### 5.2 Stream (Continuous Scroll)

**What the user sees:** A continuous tape of notes scrolls right-to-left past a fixed vertical playhead line. As measures scroll off the left side, new measures appear from the right side. Multiple melody iterations (and even multiple series) are visible simultaneously. There is no page cut.

| Property | Value |
|---|---|
| Render source | `Song.getWindow(windowStart, visibleMeasures × 2)` |
| Scroll transform | Continuous left-shift of `.scroll-group-transform` via rAF |
| Layer B | Never used |
| Window advance | When `currentMeasureIndex >= windowStart + visibleMeasures` → advance by `visibleMeasures` |
| Fixed playhead | A vertical line rendered **outside** `.scroll-group-transform` at `fixedPlayheadX` |

#### rAF transform formula
```
windowStartTick    = windowStartMeasure × measureLengthSlots
globalElapsedTicks = (audioContext.currentTime − epochStart) / timeFactor
translateX         = fixedPlayheadX − startX − (globalElapsedTicks − windowStartTick) × pixelsPerTick
```

`epochStart` is set once when playback starts (`context.currentTime + 0.1`) and never changes mid-session.

#### Song pre-population (why it matters)
With a double-buffer of `visibleMeasures × 2 = 6` slots, slots 0–2 are visible on screen and slots 3–5 are just off-screen to the right. As the scroll advances, slots 3–5 become visible. They MUST contain Song data before they scroll into view.

**Rule:** At the start of every iteration (`m === 0`), Song must already contain slices for the CURRENT iteration AND the NEXT iteration. This requires the next iteration's slices to be built **synchronously** at `m === 0` (not in a setTimeout), so that the very first React render includes them.

**How:**
- Same-series next iteration (not the last rep): build with same `treble/bass/percussion`, incremented `iteration` counter.
- Last rep of a series (new melody needed): generate the next melody synchronously, store in `_pregeneratedNextSeries`, build its slices.
- When the actual next iteration's `m === 0` fires: `Song._byIndex` already has those entries → skip the build (check `!song._byIndex.has(globalMeasureIndex)` before appending).

#### Timing guarantee
With `visibleMeasures = 3` and 2-measure melody:
- At `windowStart = 0`: slots 0–5 = measures 0–5. Slots 0–1 = current iteration, slots 2–3 = next iteration, slots 4–5 = iteration after that.
- All slots must be populated BEFORE the first frame paints. This means the pre-build must happen synchronously at `m === 0`, not deferred.

---

### 5.3 Wipe (Page Transition)

**What the user sees:** The score shows exactly `visibleMeasures` static measures (like pagination). When the page turn is due, the OLD page **fades out** (opacity 0) while the NEW page **fades in** (opacity 1). Notes do not move. The page turn takes about 0.5 measures.

| Property | Value |
|---|---|
| Render source (Layer A) | `Song.getWindow(pageStart, visibleMeasures)` |
| Render source (Layer B) | `Song.getWindow(pageStart + visibleMeasures, visibleMeasures)` — present during transition only |
| Scroll transform | **None.** `.scroll-group-transform` is always `translate(0,0)`. Notes never move. |
| Layer B | Used during transition: positioned at `translate(0,0)` (same screen position as Layer A) |
| Transition type | Opacity crossfade: Layer A fades out, Layer B fades in |
| Transition duration | ~0.5 measures |

#### Wipe transition lifecycle
1. **~0.5 measures before page end:** `setNextLayer(...)` called → SheetMusic renders Layer B (next page) with `opacity: 0`.
2. **rAF drives crossfade:** `overlayStartTimeRef` and `overlayEndTimeRef` set. rAF sets `layerA.style.opacity = 1 - frac` and `layerB.style.opacity = frac` where `frac` eases 0→1.
3. **At page boundary:** `applyResult()` fires, `setNextLayer(null)` clears Layer B, Layer A now shows the new page at `opacity: 1`. Reset Layer A opacity.

#### Key constraint
`.scroll-group-transform` is NEVER translated in wipe mode. The page is static. Only opacity changes.

---

## 6. Song Population Invariant

**At all times during stream playback, Song must contain slices for at least `windowStart + visibleMeasures × 2` measures.**

To maintain this:
- At `m === 0` of each iteration, build slices for the current AND next iteration synchronously.
- For series boundaries: generate the next series' melody synchronously at the preload point (same as existing wipe-mode pre-generation).

The `Song.appendMeasures()` method is idempotent for duplicate indices: if a `measureIndex` already exists in `_byIndex`, the new slice is silently skipped (no duplicate in `measures[]`).

---

## 7. Highlight / Scheduling Invariants

- All modes use `data-measure-index = globalMeasureIndex` on note DOM elements.
- `scheduledNotes` entries use `measureIndex = globalMeasureIndex`.
- `scheduledMeasures` entries use `globalMeasureIndex` and `audioTime` for rAF-driven `setCurrentMeasureIndex`.
- Layer B note elements carry `data-layer="b"` and are EXCLUDED from highlight queries.

---

## 8. Component Responsibilities

| Component | Responsibility |
|---|---|
| `Sequencer.js` | Builds Song slices; drives `epochStartRef`; pre-generates next series for stream/wipe |
| `SheetMusic.jsx` | Renders Song window; manages `windowStart` state; exposes layout to `layoutRef` |
| `useSheetMusicHighlight.js` | rAF loop: note highlighting + scroll transform (stream) + opacity crossfade (wipe) |
| `App.jsx` | Holds `songRef`, `epochStartRef`, `overlayStartTimeRef`, `overlayEndTimeRef`; passes to all above |

---

## 9. Implementation Checklist

Steps to implement, in order:

### Step 1 — `Song.appendMeasures` idempotency
Make `Song.appendMeasures` skip entries whose `measureIndex` already exists in `_byIndex`. This is a prerequisite for safe duplicate-free pre-building.

### Step 2 — Stream: synchronous double pre-build at `m === 0`
At `m === 0` in Sequencer's loop:
- If `!song._byIndex.has(globalMeasureIndex)`: build current iteration slices and append.
- Immediately after (still synchronously): if `!song._byIndex.has(globalMeasureIndex + numMeasures)`: build next iteration slices and append.
- For next-iteration build: same melody (intra-series) or `_pregeneratedNextSeries` (cross-series).
- Remove all `_preAppendedAt` / `preloadMeasures` complexity for stream mode.
- `setSong` called once after both builds.

### Step 3 — Stream: generate next series at series boundary
At the point where `isLastRepNow && m === 0` (or equivalent), synchronously call `randomizeScaleAndGenerate` and store in `_pregeneratedNextSeries`. This ensures the next series is available for the `m === 0` double pre-build of the last rep.

### Step 4 — Wipe: opacity crossfade (no scroll)
In `useSheetMusicHighlight.js` wipe branch:
- Remove the `translate(−pageWidth × eased, 0)` transform entirely.
- Instead: set `layerAEl.style.opacity = (1 - frac).toFixed(3)` and `layerBEl.style.opacity = frac.toFixed(3)`.
- After transition: reset both layers to `opacity: 1` / `opacity: 0`.
In `SheetMusic.jsx` wipe mode:
- Layer B is positioned at `translate(0, 0)` (same position as Layer A), not offset to the right.

### Step 5 — Clean up old stream preload code
Remove `_preAppendedAt`, `preloadMeasures` for stream mode, and the stream-specific blocks in the preload `setTimeout`.

### Step 6 — Verify pagination unchanged
Run pagination mode and confirm no regressions.

---

## 10. Animation Step Sequences (As-Implemented)

All timings are relative to `nextStartTime` — the audio start time of the **current** measure being processed in the Sequencer loop. `measureDuration = measureLengthTicks × timeFactor`.

---

### 10.1 Pagination Mode

> **Redesigned 2026-05-22** (PR #26). Pagination is now driven by the pure
> `src/audio/transitionPlanner.js` planner and `Sequencer._armPaginationSequence`.
> All three boundary kinds use the same crossfade mechanism — the legacy two-phase
> block-flip and the separate yellow/red ad-hoc branches below are no longer hit
> in pagination mode. They are preserved in the doc for historical reference and
> still describe wipe/scroll behaviour (which are not yet migrated).

#### Redesigned flow (current)

At the start of each sequence block (`iteration === 0`, before the inner for-m
loop) the Sequencer calls `_armPaginationSequence`. This:

1. Builds a flat list of boundaries via `computeSequenceBoundaries(plan)`:
   - one `visual-flip` per non-last visual block within a repeat
   - one `repeat-flip` per non-last repeat
   - one `series-flip` at the end of the last repeat
2. Per boundary, computes a fade window via `planPaginationFade({ boundary, variant })`:

   | Variant | gen lead | fade duration | overshoot |
   |---|---|---|---|
   | `snel` | 0.5m | 0.25m | 0 |
   | `mid`  | 1.0m | 0.5m  | 0 |
   | `lang` | 2.0m | 2.0m  | 0.25m (fade ends 0.25m AFTER boundary so old notes linger briefly) |

   `fadeEndTick = boundary.atTick + overshoot × measureLengthTicks`
   `fadeStartTick = fadeEndTick − fadeDuration × measureLengthTicks`
   `generationDeadlineTick = boundary.atTick − genLead × measureLengthTicks`

3. For every event schedules 3-4 `setTimeout`s converted from ticks to AudioContext seconds:
   - (series-flip only) JIT generation at `generationDeadlineTick`. Result stored in `this.pregenResult`.
   - Fade arm at `fadeStartTick − 50 ms`: sets `transitionRef.current = { kind: 'crossfade', startTime, endTime }`, `setNextLayer('crossfade')`, `setPreviewMelody(slice)` (sliced via `_buildPaginationPreview`).
   - Audio swap at `boundary.atTick`: `setStartMeasureIndex(newGlobalStart)`. For series-flip the outer loop additionally fires `applyResult` at this same time but with `skipFadeCleanup: true` so the overlay survives the overshoot.
   - Cleanup at `fadeEndTick`: clears `transitionRef`, `setNextLayer(null)`, `setPreviewMelody(null)`.

4. `useSheetMusicHighlight.runStageTransition` reads `transitionRef` every rAF tick
   and writes eased opacity to `[data-pagination-old]` (1→0) and
   `[data-pagination-new]` (0→1). Single phase, no React batching surprises.

5. Inner-loop `setStartMeasureIndex` + `setNextLayer(null)` at `m === 0` are
   **skipped** when `iterMode === 'pagination'` — the scheduler owns both across
   the whole block (matters for `lang` overshoot: setting nextLayer→null at the
   boundary would clear the overlay 0.25m too early).

#### Invariants

- `currentMelodies` is captured at arm-time (start of the sequence block). Visual-flip / repeat-flip preview uses the snapshot. Series-flip preview uses `this.pregenResult` (set by JIT timeout).
- `transitionRef.current` always has `endTime > startTime`. Cleared at `fadeEndTick` cleanup.
- Outer-loop `applyResult` is the **only writer** of melody refs at series boundary. The scheduler's audio-swap callback only sets `startMeasureIndex`.
- Boundary ticks are integer multiples of `measureLengthTicks`. `newGlobalStart = sequenceStartGlobalMeasure + Math.round(boundary.atTick / measureLengthTicks)`.

#### Legacy cases (no longer fire in pagination mode)

The three cases below remain in the codebase but are gated by `iterMode === 'pagination'` checks that now resolve to `false` for those branches. They are preserved (a) as a reference for the wipe/scroll migration that will follow, (b) so reviewers can compare the redesign against what it replaced.

#### Case A — Inner visual block flip (mid-repeat-block, non-last visual block)

Fires when the current measure `m` is the **last measure of a visual block** that is not the last block of the repeat block.

**Condition:** `m + 1 === cumulative block start of block b` AND `that start < currentNumMeasures`

Two-phase rAF animation. Both phases use the same ease-in-out curve and the same duration (`0.25 × measureDuration`), making the flip symmetric.

| Time | Event | Visibility |
|---|---|---|
| `nextStartTime + 0 s` | Sequencer detects block boundary. `paginationFadeRef = { startTime: T+0.25m, totalEnd: T+0.5m, fadeOutOnly: true }` set immediately. | Current visual block fully visible, opacity 1. |
| `T + 0.25m − 50 ms` | `setNextLayer('block-flip')` fires. React renders — no overlay rendered. `useLayoutEffect`: sets `data-block-flip-pending` attribute on `[data-pagination-old]`. | Old block: opacity 1. |
| `T + 0.25m` | **Phase 1 begins.** rAF: eased fade-out 1→0 on `[data-pagination-old]`. No overlay to animate (`fadeOutOnly: true`). | Old block fading out. |
| `T + 0.5m` | **Phase 1 ends.** rAF: locks old at opacity 0, sets `fadeT.phaseComplete = true` (keeps ref alive for duration read). Clears cached DOM refs. rAF returns early on all subsequent frames (phaseComplete guard). | Old block at opacity 0. |
| `T + 0.5m` (same JS callback) | `setStartMeasureIndex(globalMeasureIndex + 1)` + `setNextLayer(null)` fire — React 18 batches into one render. | (React committing.) |
| Same React commit | React commits new slice in `[data-pagination-old]`, `nextLayer = null`. `useLayoutEffect` (nextLayer→null) fires: detects `data-block-flip-pending` → forces `style.opacity = '0'` → reads `paginationFadeRef.current.totalEnd - startTime` for duration → **replaces ref** with `{ fadeInOnly: true, startTime: context.currentTime, totalEnd: context.currentTime + fadeOutDuration }`. | New block content at opacity 0. Phase 2 armed. |
| `T + 0.5m` onward | **Phase 2 begins.** rAF: sees `fadeInOnly: true` → eased fade-in 0→1 on `[data-pagination-old]`. Same ease-in-out curve as phase 1. | New block fading in. |
| `T + 0.75m` (approx.) | **Phase 2 ends.** rAF: clears `style.opacity = ''` (CSS class `.pagination-old-visible` takes over at 1). Clears `paginationFadeRef`. | New visual block fully visible at opacity 1. |

**New melody loaded:** No — same melody, different `localMeasureStart` window into it.
**Trigger:** Sequencer `musicalBlocksRef` check at every measure.
**Exchange mechanism:** Two-phase rAF animation. Phase 1 fades old out; React swaps content during the gap; Phase 2 fades new in. No CSS animation — entirely driven by `paginationFadeRef` + rAF for timing precision and symmetric easing.

---

#### Case B — End of non-last repeat block (yellow crossfade)

Fires at the **last measure of a repeat block** when more repeats remain.

**Condition:** `!isLastRepNow && isLastMeasureNow`

| Time | Event | Visibility |
|---|---|---|
| `nextStartTime + 0 s` | `paginationFadeRef.current` set: `{ startTime: T+0.75m, totalEnd: T+1.0m }`. | Current content fully visible. |
| `T + 0.75m − 50 ms` | `setNextLayer('yellow')` fires. React renders `[data-pagination-new]` with class `pagination-new-hidden` (CSS opacity: 0). | Old content: opacity 1. New (yellow) overlay: opacity 0 (hidden). |
| `T + 0.75m` | rAF crossfade begins. Eased 0→1 over `0.25 × measureDuration`. | Old fades 1→0. Yellow fades 0→1. |
| `T + 1.0m` (= block end) | Crossfade complete. rAF locks old at opacity 0, new at opacity 1. `paginationFadeRef` cleared by rAF. | Yellow overlay fully visible. |
| `T + 1.0m` (= next iteration `m=0`) | Sequencer builds new Song slices for this rep. `setSong()` called. `setStartMeasureIndex(startIdx)` and `setNextLayer(null)` scheduled for `wipeStateClearTime = nextStartTime`. | Yellow still visible (React not yet committed). |
| `wipeStateClearTime` | `setStartMeasureIndex` + `setNextLayer(null)` setTimeout fires. React commits: removes `[data-pagination-new]`, keeps `[data-pagination-old]` with new same-melody content. | 1-frame risk: old at opacity 0, new removed, old content not yet restored. |
| Same React commit | `useLayoutEffect` fires synchronously (before paint): clears `[data-pagination-old].style.opacity` → CSS class `.pagination-old-visible` restores opacity: 1. | Old content fully visible at new repeat's note visibility. |

**New melody loaded:** No — same melody, next round's note visibility (hidden vs visible toggle).
**Trigger:** `isLastMeasureNow` in Sequencer inner loop.
**Exchange mechanism:** Opacity crossfade via `paginationFadeRef` + rAF. Content stays the same; only the visibility (notes shown/hidden) changes after the swap.

---

#### Case C — Series boundary (red crossfade → new melody)

Fires after the **last repeat block** of a sequence block. The outer Sequencer loop generates a new melody and sets up both the preview and the apply.

| Time | Event | Visibility |
|---|---|---|
| (outer loop, after last rep) | `randomizeScaleAndGenerate()` called synchronously. Result stored. `paginationFadeRef.current` set: `{ startTime: nextStartTime − 0.25m, totalEnd: nextStartTime }`. | Current melody fully visible. |
| `nextStartTime − 0.25m − 50 ms` | `setNextLayer('red')` + `setPreviewMelody(result)` fire. React renders red overlay `[data-pagination-new]` with class `pagination-new-hidden` (opacity: 0). Red overlay contains the **new** melody's notes. | Old (current) content: opacity 1. Red overlay: opacity 0 (hidden). |
| `nextStartTime − 0.25m` | rAF crossfade begins. Duration: `0.25 × lastMeasureDuration`. | Old fades 1→0. Red fades 0→1. |
| `nextStartTime` (= series boundary = `applyTime`) | `applyResult()` fires: `hideOldGroup()` (imperatively sets old opacity to 0 before React commit), then React state setters: new `trebleMelody`, `bassMelody`, etc., new `startMeasureIndex`, `setNextLayer(null)`, `setPreviewMelody(null)`. `setShowNotes(nextFirstRoundVisible)` fires. | React commit: new melody in `[data-pagination-old]`; red overlay (`[data-pagination-new]`) removed. |
| Same React commit | `useLayoutEffect` fires: clears `[data-pagination-old].style.opacity` → CSS class restores opacity: 1. Clears `paginationFadeRef`. | New melody fully visible at opacity 1. |

**New melody loaded:** Yes — at `applyTime = nextStartTime` (series boundary). Loaded at opacity 0 (old group), then opacity cleared to let CSS class restore it to 1.
**Trigger:** `!isLastRepNow` check in outer Sequencer loop, after `iteration >= repsPerMelody`.
**Exchange mechanism:** Opacity crossfade of old→red overlay, then `applyResult()` swaps content in `[data-pagination-old]` and `useLayoutEffect` restores its opacity.

---

### 10.2 Wipe Mode

Wipe always shows exactly `visibleMeasures` (3) measures. Visual block = repeat block in standard configuration. Transitions use a left-to-right mask sweep rather than opacity.

#### Case A — End of non-last repeat (yellow wipe)

**Condition:** `!isLastRepNow && isLastMeasureNow`

| Time | Event | Visibility |
|---|---|---|
| `nextStartTime + 0 s` | `wipeTransitionRef.current` set: `{ startTime: T+0.5m, endTime: T+1.0m }`. | Current content fully visible. |
| `T + 0.5m − 100 ms` | `setNextLayer('yellow')` fires. React renders `[data-wipe-role="new"]` with class `wipe-new-hidden` (opacity: 0). | Old: fully visible. Yellow: opacity 0. |
| Same React commit | `useLayoutEffect`: applies HIDDEN mask to `[data-wipe-role="new"]`, sets `style.opacity = '1'`. Mask (not opacity) now controls visibility. | Yellow: opacity 1 but fully masked (hidden). |
| `T + 0.5m` | rAF mask sweep begins. Eased over `0.5 × measureDuration`. Old mask: `transparent` sweeps left→right. New mask: `black` reveals left→right. | Old content disappears L→R. Yellow reveals L→R. |
| `T + 1.0m` (= block end) | Sweep complete. rAF-driven wipe ends when `wipeTransitionRef` is cleared. | Yellow fully visible. |
| `wipeStateClearTime` (= `nextStartTime` of next iteration) | `setNextLayer(null)` + `setStartMeasureIndex` fire. `useLayoutEffect`: clears masks, clears `wipeTransitionRef`. | Old content at full opacity with new rep's content. Yellow removed. |

**New melody loaded:** No — same melody, next round visibility.

---

#### Case B — Series boundary (red wipe)

| Time | Event | Visibility |
|---|---|---|
| (outer loop) | `randomizeScaleAndGenerate()` called. `wipeTransitionRef.current` set: `{ startTime: nextStartTime − 0.5m, endTime: nextStartTime }`. `setPreviewMelody({ ...result, startMeasureIndex })` set immediately. | Current melody fully visible. |
| `nextStartTime − 0.5m − 200 ms` | `setNextLayer('red')` fires. React renders red overlay with new melody. `useLayoutEffect`: HIDDEN mask applied. | Red: opacity 1 but fully masked. |
| `nextStartTime − 0.5m` | rAF mask sweep begins over `0.5m`. | Old disappears L→R. New melody reveals L→R. |
| `nextStartTime` (= `applyTime`) | `applyResult()`: `hideOldGroup()`, React state setters with new melody, `setNextLayer(null)`, `setPreviewMelody(null)`. `useLayoutEffect`: clears masks. | New melody in old group, fully visible. |

**New melody loaded:** At `applyTime = nextStartTime` (series boundary). Loaded into `[data-wipe-role="old"]` group, visible immediately after mask cleanup.

---

### 10.3 Scroll Mode (continuous, May 2026 rewrite)

Scroll is a single continuous left-shift of `.scroll-group-transform`. The currently-playing
audio note always sits at the 25% playhead — audio and visual share one time anchor with
no offset. Rep boundaries and series boundaries are visually invisible page-shifts.

#### State shape

```
scrollTransitionRef.current = { startTime, startPageFraction, secondsPerPage }
```

rAF formula (in `useSheetMusicHighlight.js`):
```
pageFraction(now) = startPageFraction + (now − startTime) / secondsPerPage
tx(now)           = 0.25 × pageWidth − pageFraction × melodyWidth
```

`pageWidth` = visible viewport width. `melodyWidth` = `displayNumMeasures × measureWidth`
= one melody iteration's pixel width. `0.25 × pageWidth` is the playhead pixel offset
(25% from screen-left). `pageFraction × melodyWidth` is the DOM-pixel position of the
audio's current location within the active iteration. `secondsPerPage = currentNumMeasures
× measureDuration` for the current BPM.

`pageWidth` and `melodyWidth` differ when `displayNumMeasures < visibleMeasures`. The May
2026 iter 2a rewrite uses both so the scroll speed matches the audio progression rate
(`measureWidth / measureDuration`) independent of how the melody/viewport sizes relate.

#### Continuity invariants

The Sequencer keeps the formula continuous across boundaries via three operations:

1. **Cold start.** First scroll-eligible measure boundary: write
   `{ startTime: T, startPageFraction: 0, secondsPerPage: N×md }`. First note plays at `T`
   and sits at the playhead.

2. **BPM change at measure boundary `T`.** When `bpmRef.current` is read at a new measure
   and yields a different `secondsPerPage`, snap rate while keeping `tx(T)` unchanged:
   ```
   fractionAtT = startPageFraction + (T − startTime) / oldSecondsPerPage
   { startTime: T, startPageFraction: fractionAtT, secondsPerPage: newSecondsPerPage }
   ```
   Audio also picks up the new BPM on the next measure (see line 231 of `Sequencer.js`), so
   audio and visual snap together. **No ramp** — a ramped scroll would be mid-ramp out of
   sync with the un-ramped audio.

3. **Page boundary (end of an iteration).** In the same setTimeout that swaps melody state:
   `startPageFraction -= 1`. The just-swapped content's first note (DOM x moves from
   `+pageWidth` to `0` across the swap) lands at the same visual position — invisible swap.

#### Overlay tiling for full-viewport coverage (iter 2b, May 2026)

The scroll ribbon must cover the full visible viewport at every moment. Iter 2b renders
the overlay layer as K side-by-side panels, where K depends on the ratio between visible
viewport width and melody width:

```
K_left  = max(1, ceil(0.25 × visibleMeasures / displayNumMeasures))
K_right = max(1, ceil(0.75 × visibleMeasures / displayNumMeasures))
```

(Coefficient 0.25 corresponds to the visible area left of the playhead; 0.75 to the area
right of the playhead.)

Each panel renders the same content (yellow = current-melody copy, red = pregen new-melody)
at `transform="translate(i × melodyWidth, 0)"` for `i ∈ [-K_left, -1] ∪ [1, K_right]`.
`i = 0` is the main melody — rendered by the regular sheet-music path, not the overlay.

Examples:
- `numMeasures = 4`, `visibleMeasures = 4` (typical case): `K_left = 1`, `K_right = 1` →
  3 total panels (1 history + 1 main + 1 future). The post-swap empty-left-25% transient
  is gone.
- `numMeasures = 1`, `visibleMeasures = 2` (1-measure sequences): `K_left = 1`,
  `K_right = 2` → 4 total panels (1 history + 1 main + 2 future). User sees
  ~"half-whole-half" pattern Han specified.

`setNextLayer` still toggles between `'yellow'` (all K panels = current-melody copies) and
`'red'` (all K panels = pregen next-melody) per the existing per-measure logic:

- At `m = 0` of every iteration (in scroll mode): `setNextLayer('yellow')`.
- At penultimate measure (`m = N − 2`) of the last rep: pregen runs, then
  `setNextLayer('red')` + `setPreviewMelody(pregenResult)`.
- Single-measure scroll (`N = 1`): penultimate never fires; the outer loop's
  series-handler schedules `setNextLayer('red')` 0.25m before the series boundary.

**Visual quirk (accepted as iter 2 limitation):** During the last rep of a series, all
`K_left` history panels also show the pregen NEW melody (since the overlay state is
shared). This means visually the left history briefly shows future content. After the
swap, history becomes correct (= the just-applied melody). Brief inconsistency at series
transitions only.

#### `visibleMeasures` clamp differs per mode (iter 2a)

- Pagination/wipe: `idealVisibleMeasures = max(2, min(numMeasures, screenCapacity))` —
  capacity-capped, screen-size-aware (unchanged).
- Scroll: `effectiveVisibleMeasures = max(2, numMeasures)` — drops the capacity cap.
  For `numMeasures > 1` this guarantees `melodyWidth = pageWidth` so the rAF formula
  reduces to the simpler `(0.25 − pageFraction) × pageWidth`. For `numMeasures = 1`
  it floors at 2 so the user sees ~3 measure-copies across the viewport.

#### Swap mechanics

For **mid-series repeat boundaries** (non-last rep → next rep): no React state change is
needed (same melody). The Sequencer schedules `startPageFraction -= 1` at the end of each
non-last iteration. Visually identical content cycles past the playhead.

For **series boundaries** (last rep end → new melody start): the existing `applyResult`
setTimeout fires at exactly `nextStartTime` (no +0.75m offset). In one batched callback:
`applyResult()` swaps main to the pregen melody, `startPageFraction -= 1` shifts the
formula by one page, `setNextLayer('yellow')` + `setPreviewMelody(null)` resets the
overlay for the next series.

**Removed in May 2026 rewrite:**
- `pendingScrollTransitionRef` — no longer needed. The continuous anchor never needs to
  be queued; per-measure updates maintain it in place.
- `+0.75m linger offset` at scroll-start and applyTime — audio/visual now sync exactly.
- Discrete `scrollTransitionRef = {startTime, endTime}` writes per rep — replaced by
  the single continuous `{ startTime, startPageFraction, secondsPerPage }` anchor.

#### Rubato override (§31)

When `rubatoScrollAnchorRef.current.isActive` is true, the scroll rAF in `useSheetMusicHighlight`
bypasses the time-based `pageFraction = startPageFraction + elapsed / secondsPerPage` formula
and reads `pageFraction` directly from the rubato anchor. Each correct-note advance writes the
NEXT expected note's `offset / totalIterationTicks` to the ref's `pageFraction`; the rAF eases
the displayed `currentFraction` toward it at 12 % / frame (~170 ms critically-damped glide).

Flipping out of rubato clears `isActive` and the natural `scrollTransitionRef` anchor resumes.
If the anchor hasn't been updated since playback began, the rAF holds the scroll at its last
position rather than jumping back to the time-based value.

---

### 10.4 Common Sequence for All Modes

```
TRIGGER (audio-timed setTimeout)
  → setNextLayer('yellow'|'red')                       [React render: overlay in DOM, hidden]
  → useLayoutEffect (wipe: apply HIDDEN mask; pagination: no-op)
  → rAF loop begins animation (mask sweep or opacity crossfade)
  → [content exchange at applyTime]
  → applyResult() → hideOldGroup() → React state setters → setNextLayer(null)
  → useLayoutEffect (nextLayer→null): clear masks, clear inline opacities, clear refs
```

Key invariant: **React never sets `style.opacity` on `[data-pagination-old]` or `[data-wipe-role]` elements via JSX props.** Only the rAF loop and `useLayoutEffect` write inline opacity. This prevents React re-renders from overwriting in-progress animations.

---

## 11. Pagination Jitter Bug Log

### Bug 1 — Inner block flip was a hard cut (fixed)

**Symptom:** When a melody had more measures than fit on one visual block (e.g. 4 measures with `musicalBlocks = [2, 2]`), mid-repeat page turns appeared as an instant jump mid-measure.

**Root cause:** `setStartMeasureIndex` was the only action — no opacity fade, no overlay. Content changed instantly in DOM.

**Fix:** Two-phase rAF animation with symmetric easing. Phase 1: rAF fades old out `[T+0.25m, T+0.5m]` (`fadeOutOnly: true`). At completion: `phaseComplete: true` is set on the ref (keeps it alive for duration read) instead of clearing it. `setStartMeasureIndex + setNextLayer(null)` fire in one React batch. `useLayoutEffect` on `nextLayer→null` reads the phase 1 duration, forces `style.opacity = '0'` on the element, then replaces `paginationFadeRef` with `{ fadeInOnly: true, startTime: now, totalEnd: now + phase1Duration }`. Phase 2: rAF animates 0→1 with the same ease-in-out curve over the same duration, then clears inline opacity. CSS class `.pagination-old-visible` takes over at 1. No CSS animation involved — entirely rAF-driven for precise AudioContext timing and symmetric appearance.

**Files changed:** `Sequencer.js`, `useSheetMusicHighlight.js`, `SheetMusic.jsx`, `App.css`

---

### Bug 2 — Double React render at iteration start (fixed)

**Symptom:** At the start of every repeat block (`m = 0`), `setStartMeasureIndex` and `setNextLayer(null)` were scheduled as two separate `setTimeout` calls with identical delays. In React 18, separate `setTimeout` callbacks are separate macrotasks and produce two renders.

**Root cause:** Two `setTimeout(fn, iterStateMs)` calls instead of one combined callback.

**Fix:** Combined into a single `setTimeout` callback. React 18 automatic batching merges both `setState` calls into one render.

**Files changed:** `Sequencer.js`

---

### Bug 3 — Asymmetric fade: old faded out before new was in DOM (fixed)

**Symptom:** On slow devices or busy main threads, if React took > 50ms to commit `[data-pagination-new]` after `setNextLayer('yellow'/'red')` fired, the rAF would start fading old before new was in the DOM. Old faded to partial opacity; new stayed invisible. Brief "dimming" flash.

**Root cause:** `runPaginationFade` queried `paginationNewCached` lazily but still animated old even when new was null. The 50ms early React trigger was sufficient on fast devices but not guaranteed.

**Fix:** For non-`fadeOutOnly` fades: if `paginationNewCached` is not yet in the DOM, return early and retry next frame. Old stays at full opacity until new appears, then both animate together. Adds one frame of delay at worst; eliminates the asymmetric flash.

**Files changed:** `useSheetMusicHighlight.js`

---

## 12. Component & File Reference

Purpose of every significant file in the codebase. One-sentence description + responsibility boundary.

### `src/App.jsx`
**Main application orchestrator.** Owns all top-level state (melody, playback config, instrument settings, UI mode), instantiates all hooks, wires refs between the Sequencer and the UI, and renders the full layout tree.

---

### Hooks (`src/hooks/`)

| File | Purpose |
|---|---|
| `useMelodyState.js` | Holds the active `Melody`, `Scale`, `Song`, and `ChordProgression`; exposes `randomizeScaleAndGenerate` (generates a new melody + song), `applyResult` (swaps in the pre-generated next melody at a series boundary), and the current/next melody state. |
| `useInstruments.js` | Loads smplr `Soundfont` and `DrumMachine` instances, tracks which instruments are currently loaded, exposes named instrument handles used by `Sequencer` and `playMelodies`. |
| `usePlayback.js` | Creates and owns the `Sequencer` instance; wires its `setters` and `refs`; exposes `play`, `stop`, `togglePlay`, and loop/BPM controls to the rest of the app. |
| `useSheetMusicHighlight.js` | rAF loop that drives note highlighting (`.note-active`), current-measure tracking, and pagination crossfade animations using the AudioContext clock — no `setTimeout` involved. |
| `usePitchDetector.js` | Microphone pitch detection via the Web Audio API; emits detected note events used by `ToneRecognizer`. |
| `useInputTest.js` | Tracks user input correctness during a melody round (key presses or pitch detector hits vs. expected notes); used to update per-note difficulty data. |
| `useWindowSize.js` | Debounced `window.resize` listener; returns `{ width, height }` for responsive layout decisions. |
| `useLongPress.js` | Unified pointer/touch long-press handler; returns event props to attach to a DOM element. |
| `useLongPressTimer.js` | Variant of `useLongPress` that exposes a progress value (0–1) over the press duration — used to drive hold-to-confirm affordances. |

---

### Sheet Music (`src/components/sheet-music/`)

| File | Purpose |
|---|---|
| `SheetMusic.jsx` | The SVG sheet music renderer. Accepts `melody`, `nextLayer`, `startMeasureIndex`, pagination props; renders treble, bass, percussion staves; manages `[data-pagination-old/new]` groups and the `useLayoutEffect` that coordinates block-flip transitions. |
| `MelodyNotesLayer.jsx` | `React.memo`-wrapped wrapper around `renderMelodyNotes`. Called 11× per render from `SheetMusic` (OLD / yellow / red layers × 3 staves + metronome). The memo skips the entire `renderMelodyNotes` call (O(N²) beaming + stem-direction forcing + accidental maps) when its props are referentially equal. See §29. |
| `ChordLabelsLayer.jsx` | `React.memo`-wrapped chord-label renderer. Contains the per-chord builder (`renderSingleChordLabel`) as a pure function so the JSX is deterministic from props. Replaces 3 inline calls in `SheetMusic`. See §29. |
| `BarlinesLayer.jsx` | `React.memo`-wrapped barline + measure-number renderer. Holds the pure `iterMeasureLines` iterator (the iterator depends on ~20 layout/visibility values that were previously closure-captured in `SheetMusic`). `mode="regular"` for thin inner barlines, `mode="repeat"` for thick start/end repeat lines. See §29. |
| `PreviewOverlay.jsx` | `React.memo`-wrapped RED/crossfade overlay (the "incoming melody" preview during a pagination transition). Lazy-mounted from `SheetMusic` only when `showWipePreview === 'red'` or `'crossfade'`, so absent from the DOM ~90% of the session. See §29. |
| `renderMelodyNotes.jsx` | Pure rendering function — given a `SlicedMelody` and layout parameters, returns SVG note heads, stems, beams, flags, accidentals, and chord labels. |
| `renderOneMeasureRepeatSymbols.jsx` | Pure helper that renders the Maestro "Ô" one-measure-repeat glyph centred between barlines. Shared between `SheetMusic` (existing closure delegates here) and `PreviewOverlay` (calls it directly). |
| `renderAccidentals.jsx` | Renders key-signature accidentals (sharps/flats) at the start of each staff. |
| `processMelodyAndCalculateSlots.js` | Lays out note horizontal positions ("slots") across a measure, handling beaming groups and spacing. |
| `processMelodyAndCalculateFlags.js` | Determines stem direction, beam/flag rendering flags for each note based on pitch and context. |
| `calculateAllOffsets.js` | Computes the pixel x-offset of every note slot across all measures for a given visual block. |
| `generateAccidentalMap.js` | Builds a per-measure accidental state map to decide when courtesy/cautionary accidentals are needed. |
| `SettingsOverlay.jsx` | The modal settings panel (gear icon). Contains all configuration UI sections. |
| `SvgSetter.jsx` | Tiny utility component that exposes the SheetMusic SVG ref upward to App.jsx via a callback. |

---

### Controls (`src/components/controls/`)

| File | Purpose |
|---|---|
| `PlaybackSettings.jsx` | Playback configuration panel: BPM, time signature, number of measures, repeats, view mode selector. |
| `RangeControls.jsx` | Pitch range selectors (treble/bass low-high note pickers). |
| `InstrumentRow.jsx` | Single instrument row in the instrument grid: instrument type picker, volume slider, enable toggle. |
| `PianoView.jsx` | SVG piano keyboard showing which notes belong to the current scale/chord. |
| `PianoContainer.jsx` | Wraps `PianoView` with scroll and zoom handling; positions it relative to the sheet music. |
| `ChordGrid.jsx` | Displays the active chord progression as a clickable grid; highlights the current chord during playback. |
| `DrumPad.jsx` | 4×4 pad grid for previewing/remapping percussion samples interactively. |
| `ToneRecognizer.jsx` | Visual feedback component for microphone pitch detection — shows detected note vs. expected note. |
| `PlaybackSubComponents.jsx` | Small shared sub-components used within the playback settings panel (labeled toggle rows, etc.). |
| `PresetPicker.jsx` | Dropdown/list for loading saved instrument/playback presets. |
| `TrebleSettings.jsx` | Treble-clef-specific settings: clef type, octave offset. |
| `instrumentOptions.js` | Static data: available instrument names, families, and default volumes. |

---

### Scale (`src/components/scale/`)

| File | Purpose |
|---|---|
| `ScaleSelector.jsx` | Root note + mode selector panel; dispatches scale changes to `useMelodyState`. |
| `ScaleSelectorWheel.jsx` | Circular "circle of fifths"-style wheel UI for picking the tonic. |

---

### Playback (`src/components/playback/`)

| File | Purpose |
|---|---|
| `PlaybackControls.jsx` | Play/stop button bar; shows BPM, current measure, tempo tap. |

---

### Layout (`src/components/layout/`)

| File | Purpose |
|---|---|
| `AppHeader.jsx` | Top header bar: app title, theme toggle, settings/help buttons. |

---

### Common (`src/components/common/`)

| File | Purpose |
|---|---|
| `GenericStepper.jsx` | +/− stepper for integer values with optional long-press acceleration. |
| `DoubleStepper.jsx` | Paired steppers sharing a label — used for range (min/max) controls. |
| `NumberControl.jsx` | Numeric input field with validation; falls back to stepper on mobile. |
| `GenericTypeSelector.jsx` | Horizontal pill/tab selector for a fixed set of string options. |
| `TabNavigation.jsx` | Bottom tab bar navigating between major app sections. |
| `CustomIcons.jsx` | SVG icon definitions used throughout the UI. |
| `ThemeToggle.jsx` | Dark/light mode toggle button. |

---

### Error (`src/components/error/`)

| File | Purpose |
|---|---|
| `ErrorBoundary.jsx` | React error boundary; catches render errors, shows fallback UI, and logs to console. |

---

### Audio (`src/audio/`)

| File | Purpose |
|---|---|
| `Sequencer.js` | The playback engine. Runs an async loop over melody measures; schedules notes via `playMelodies`; fires timing callbacks (`setters`) to synchronize UI state with the AudioContext clock; owns `scheduledNotes` and `scheduledMeasures` for rAF-driven highlighting. |
| `playMelodies.js` | Schedules all notes of a single `MeasureSlice` window into the Web Audio graph at a given audio start time. Accepts named smplr instrument handles and a custom percussion mapping. |
| `playSound.js` | Plays a single note on a given instrument. Handles Soundfont vs. DrumMachine dispatch, resolves percussion note names via `resolveNotePitch`. |
| `drumKits.js` | Single source of truth for all drum kit definitions: `ALL_SAMPLES`, `CATEGORIES`, `PADS`, `DRUM_KITS`, `DEFAULT_NOTE_MAPPING`, `KIT_NOTE_MAPPINGS`. |

---

### Model (`src/model/`)

| File | Purpose |
|---|---|
| `Melody.js` | Immutable melody value object: holds note array, time signature, tempo, and metadata. |
| `Scale.js` | Scale value object: tonic + mode. Provides helpers for generating the note set and display names. |
| `Chord.js` | Single chord value object: root, quality, optional bass (slash chord). |
| `ChordProgression.js` | Ordered sequence of `Chord` objects for one melody; computes slash-chord display and provides `getChordsWithSlashes()`. |
| `InstrumentSettings.js` | Per-instrument configuration snapshot (type, volume, enabled). |
| `Song.js` | Flat append-only log of `MeasureSlice` objects; provides O(1) window lookup by `measureIndex`. |

---

### Theory (`src/theory/`)

| File | Purpose |
|---|---|
| `noteUtils.js` | Zero-dependency note primitives: `CANONICAL_MAP`, `ENHARMONIC_PAIRS`, `replacementsMap`, `getCanonicalNote`, `normalizeNoteChars`, `collapseAccidentals`, `getNoteSemitone`. Single source of truth for all note name logic. |
| `musicUtils.js` | Transposition and modulation helpers; imports from `noteUtils`. |
| `convertToDisplayNotes.js` | Converts internal note names to display-friendly enharmonic spellings; `standardizeTonic`, `getRelativeNoteName`. |
| `scaleHandler.js` | Scale generation and enharmonic tonic selection (`getBestEnharmonicTonic`). |
| `chordGenerator.js` | Generates chord progressions for a given scale and complexity setting. |
| `chordRecognition.js` | Identifies chord names from a set of pitch classes. |
| `chordDefinitions.js` | Static chord quality definitions (intervals, names, symbols). |
| `allNotesArray.js` | Canonical ordered array of all 128 MIDI note names (C0–G9). |
| `generateDisplayScale.js` | Produces the display-ready scale array (note names in the correct enharmonic spelling) for the active tonic/mode. |
| `chordLabelHandler.js` | Formats chord objects into display label strings (e.g. `"Dm7"`, `"G/B"`). |
| `rhythmicSolfege.js` | Maps rhythmic values to solfège syllables for ear-training display. |

---

### Generation (`src/generation/`)

| File | Purpose |
|---|---|
| `melodyGenerator.js` | Top-level melody generation entry point; wires together rhythm generation, note selection, and difficulty filtering. |
| `generateRankedRhythm.js` | Generates a weighted-random rhythmic pattern for a melody based on time signature and difficulty. |
| `generateBackbeat.js` | Generates a percussion backbeat pattern aligned to the melody's rhythm. |
| `rhythmicPriorities.js` | Weighted tables of rhythmic values used by `generateRankedRhythm`. |
| `convertRankedArrayToMelody.js` | Converts ranked rhythmic/pitch arrays into a `Melody` object. |
| `proximityUtils.js` | Pitch proximity scoring — penalises large melodic leaps when selecting next notes. |

---

### Utils (`src/utils/`)

| File | Purpose |
|---|---|
| `difficultyCalculator.js` | Scores a melody's difficulty based on pitch range, rhythm complexity, and accidentals. |
| `melodyDifficultyTable.js` | Static lookup table mapping difficulty scores to user-facing difficulty labels. |
| `harmonyTable.js` | Precomputed harmonic consonance table used during chord-aware note selection. |
| `melodySlice.js` | Splits a `Melody` into `MeasureSlice` objects aligned to bar boundaries. |
| `pagination.js` | `calculateMusicalBlocks` — splits `numMeasures` into visual blocks that fit within `visibleMeasures`. |
| `labelUtils.js` | Helpers for formatting note/chord labels for display. |
| `chordLog.js` | Debug utility: logs chord progression details to the console. |
| `appConfig.js` | Runtime app configuration constants (feature flags, default values). |
| `tempo.js` | BPM ↔ ms/tick conversion helpers. |

---

### Constants (`src/constants/`)

| File | Purpose |
|---|---|
| `timing.js` | `TICKS_PER_WHOLE = 48` and derived tick constants (quarter = 12, eighth = 6, sixteenth = 3). |
| `percussionNotes.js` | MIDI note number ↔ percussion instrument name mapping for the metronome Soundfont. |

---

## 13. Bug Log

### numMeasures Change During Playback

**Symptom:** Changing the number-of-measures setting while a melody was playing would immediately add or remove measures from the sheet music view, and empty (rest-filled) measures would appear where they shouldn't.

**Root cause:** Three places in `SheetMusic.jsx` used `numMeasures` (the generator setting) instead of the active melody's actual measure span:
1. `getDisplayNumMeasures()` fell back to `numMeasures` when the pagination block wasn't found, and in its non-pagination path.
2. `localMeasureStart = startMeasureIndex % (numMeasures || 1)` used `numMeasures`, so page-position arithmetic broke when `numMeasures` differed from the active melody length.
3. `getChordsWithSlashes(chordProgression, numMeasures, ...)` generated chord slots for the new count, causing chord labels to appear or disappear mid-playback.

**Fix:**
- Introduced `melodyMeasureCount` in `SheetMusic.jsx` derived purely from `totalMelodyDuration` (the actual note content), with `numMeasures` as the fallback only for the initial empty state.
- `getDisplayNumMeasures()` and `localMeasureStart` now use `melodyMeasureCount` instead of `numMeasures`.
- `getChordsWithSlashes` for rendering uses `displayNumMeasures` (melody-derived) rather than `numMeasures`.
- Added a `resizeMelody` utility in `melodySlice.js` that truncates or pads a melody to a target measure count.
- Added an effect in `App.jsx` that calls `resizeMelody` on all active tracks when `numMeasures` changes and the app is NOT playing, so the display immediately shows the correct new length (with whole-rest padding for extensions).

**Invariants after fix:**
- `numMeasures` in `SheetMusic` is used only for: the Settings overlay stepper UI, the `calculateMusicalBlocks` effect (block layout planning), and `App.jsx` skip-back/forward arithmetic.
- The Sequencer continues to use `numMeasuresRef.current` to determine the measure count for the next generated series — this is unchanged.
- Changing `numMeasures` during playback has no effect on the current melody display; it takes effect at the next series boundary.

**Files:** `src/components/sheet-music/SheetMusic.jsx`, `src/utils/melodySlice.js`, `src/App.jsx`

---

### Drum / Metronome Continues Playing After Stop

**Symptom:** After pressing Stop, the drum and metronome tracks continue playing out their already-scheduled audio buffers.

**Root cause:** `Sequencer.stop()` called `.stop()` on `treble`, `bass`, and `chords` instruments but not on `percussion` or `metronome`, even though both are valid smplr instrument instances stored on `this.instruments`.

**Fix:** Added `this.instruments.percussion?.stop()` and `this.instruments.metronome?.stop()` in `stop()`.

**Files:** `src/audio/Sequencer.js`

---

### Chord / Note Highlight Stuck After Melody Transition

**Symptom:** After a melody block transitions (continuous playback or wipe/pagination), a chord label or note highlight remains visually active — it never loses its `chord-label-active` / `note-active` CSS class.

**Root cause:** Two gaps in `useSheetMusicHighlight.js`:
1. The `useLayoutEffect` that scrubs stale highlights after each melody commit (`melodies` dependency) cleared `.note-active` but not `.chord-label-active`.
2. The rAF's `clearHighlightStateRef.current` reset block cleared `lastActiveKeys` / `lastActiveKey` to force a full note re-scan, but did not reset the parallel chord tracking variables (`lastChordActiveKeys`, `lastChordActiveKey`). After a melody transition, the stale chord keys in `lastChordActiveKeys` could fail to find their DOM elements (elements replaced or renumbered), silently skipping the `.remove('chord-label-active')` call.

**Fix:** Both gaps fixed in `useSheetMusicHighlight.js`:
- `useLayoutEffect`: added `svg.querySelectorAll('.chord-label-active').forEach(el => el.classList.remove('chord-label-active'))` alongside the existing note scrub.
- `tick()` reset block: added `lastChordActiveKeys = new Set(); lastChordActiveKey = ''` when `clearHighlightStateRef.current` is truthy.

**Files:** `src/hooks/useSheetMusicHighlight.js`

---

### Tuplet Labels Invisible — `processMelodyAndCalculateSlots` Drops `triplets`

**Symptom:** Tuplet bracket numbers ("3 : 2", "4 : 3") never appeared in the sheet music, even though `melodyGenerator.js` and `melodySlice.js` correctly attached `melody.triplets`.

**Root cause:** `processMelodyAndCalculateSlots` builds a fresh output object and explicitly lists only the fields it returns: `notes`, `durations`, `offsets`, `ties`, `originalIndices`. The `triplets` parallel array was not included, so `adjustedTrebleMelody.triplets` was always `undefined` when `renderMelodyNotes` read it. `melodyTriplets` fell back to `null` for all notes, so `tupletGroupData` was never populated and no labels were rendered.

**Fix:** Compute `outTriplets` from `outOriginalIndices` (which maps each output note back to its source index) and include it in the return value:

```js
triplets: melody.triplets
  ? outOriginalIndices.map(i => (i !== null ? (melody.triplets[i] ?? null) : null))
  : null,
```

Spacers (`'c'`) and inserted rests have `outOriginalIndices[i] === null` → `triplets[i] = null`. Tie-split notes share the same original index → both halves carry the same `TupletEntry` (same `id`), so `tupletGroupData` groups them correctly.

**Files:** `src/components/sheet-music/processMelodyAndCalculateSlots.js`

---

### Triplet Eighth Notes Rendered with Double Beam (Sixteenth Appearance)

**Symptom:** Groups of 3 beamed eighth-note triplets showed a secondary (sixteenth-note) beam above/below the primary beam, making them look like sixteenth notes.

**Root cause:** The secondary-beam loop in the beam renderer checked `n.actualDuration < 6` to decide whether to draw a secondary beam. For triplet eighth notes, `actualDuration = 4 ticks` (raw tick count: `groupTicks/noteCount = 12/3`), which is below the 6-tick threshold. This caused secondary beams to be drawn even though the visual note value is an eighth (6 ticks).

**Fix:** Replaced `n.actualDuration` with an `effectiveDur(n)` helper that returns `melodyTriplets?.[n.index]?.visualDuration ?? n.actualDuration`. Tuplet notes use their correct visual duration for the secondary-beam decision; non-tuplet notes are unchanged.

**Files:** `src/components/sheet-music/renderMelodyNotes.jsx`

---

### App Freeze — Tuplet Note Crossing Measure Boundary Causes Infinite Loop

**Symptom:** App completely freezes (main thread blocked) during continuous playback at seemingly random measure numbers (observed: maat 69 and maat 93). Only a page reload recovers.

**Root cause:** `processMelodyAndCalculateSlots.js` contains an inner `while (!allowedDurations.includes(splitDuration))` loop (line 166) with no exit guard. When a tuplet note (e.g. triplet-small noteTicks=4) crosses a measure boundary, the remaining fragment at the boundary can be 1 or 2 ticks. Since 1 and 2 are not in `allowedDurations`, and no `splittableDurations[j]` is ≤ 2 (minimum is 3), the inner for-loop finds no match and exits without `break`. `splitDuration` stays at its prior value, the while condition remains true, and the loop spins forever.

**Concrete trigger:** triplet-small starting at offset 42 in a 4/4 measure (the last 8th-note beat). Its second note falls at offset 46, 2 ticks before the measure boundary at 48. The split fragment is 2 ticks → infinite loop.

**Fix:** Added a `found` flag to the inner for-loop. If the for-loop completes without finding a valid split, `found` remains `false`, the remainder is dropped (`remainingDuration -= splitDuration; splitDuration = 0; break`), and the subsequent push is guarded by `if (splitDuration > 0)`. The 1–2 dropped ticks are inaudible and unrenderable.

**Files:** `src/components/sheet-music/processMelodyAndCalculateSlots.js`

### Bass Beaming in 3/4 — `q q q` split as `q + (e tied to e) + q` (2026-05-29)

**Symptom:** in 3/4 time, three consecutive quarters in the bass (e.g. HBD m1: B3 G2 B2 at offsets 36, 48, 60) rendered with the middle quarter split into two tied eighths.

**Root cause:** `noteGroupSize` in `SheetMusic.jsx` was derived from
```js
measureLengthSlots % 18 === 0 ? 18 : 12
```
3/4's measure is 36 ticks, divisible by 18, so the heuristic picked 18 (= compound dotted-quarter beat, correct for 6/8 only). The middle quarter at offset 48 crossed the false 18-tick beat boundary at offset 54, forcing `processMelodyAndCalculateSlots` to split.

**Fix:** derive the beat size from the time signature directly. Compound = denominator 8/16 AND numerator > 3 AND numerator % 3 === 0; in that case beat = 3 × denominator-unit (dotted-quarter for /8). Otherwise beat = one denominator-unit. See architecture §32.

**Files:** `src/components/sheet-music/SheetMusic.jsx`

### `totalDuration` Miscount Blocking Trailing-Rest Pad (2026-05-29)

**Symptom:** percussion or bass tracks shorter than the song's `globalMaxDuration` were not padded with a trailing rest — so the track ended early instead of staying aligned with the song's end.

**Root cause:** `processMelodyAndCalculateSlots` computed `totalDuration` via a reduce that added `startRestDuration` inside the loop, so it was counted N times (= once per note) instead of once. For a melody with a 24-tick leading rest and 19 notes, `totalDuration` came out as 24 × 19 + Σdurations (= 456 + content) instead of 24 + Σdurations. With the inflated value, `totalDuration < globalMaxDuration` was always false, so the adaptive padding never ran.

**Fix:** pull `startRestDuration` out of the reduce — it's the leading rest, counted exactly once.

**Files:** `src/components/sheet-music/processMelodyAndCalculateSlots.js`

---

## 14. Scale Selection Wheel

### Purpose
A 12-segment donut-shaped SVG wheel for selecting the mode (degree) within a scale family. The wheel always shows all 12 chromatic semitones; segments belonging to the selected family's scale are highlighted (selectable), inactive semitones are dimmed. Clicking an active segment rotates the wheel so that segment lands at the top — this gives an intuitive visual analogy to the circle of modes.

### How it Works
1. **Chromatic layout**: always 12 segments, one per semitone. Active positions are derived from the first mode's intervals (`calculateActiveIndices`), so the same chromatic positions are active for every mode of the family (the wheel rotates, it does not reshape).
2. **Rotation**: `currentRotation` is a continuous degree value (not clamped to 0–360). On selection, the shortest angular delta is applied to avoid unspooling the wheel backwards. Initial rotation is set so the active mode is at the top (`-(activeIndices[modeIndex] + 0.5) * 30`).
3. **Mode lookup** (`findActiveIndex`): handles clean names (`Ionian`), prefixed keys (`I. Ionian`), `wheelName`, `preferredName`, and aliases via `scaleDefinitions` — needed because `scale.name` may not match the raw key in `modes[family]`.
4. **Labels**: Roman numeral in the segment centre, counter-rotated via `transform: rotate(-currentRotation)` so numerals always face up. Edge labels (mode name text) appear along the radial edges when the wheel is large enough (≥150 px, arc length sufficient).
5. **Rounded corners**: `getPathForSlice` uses cubic bezier curves at the two outer corners of each donut segment to produce slightly rounded outer edges.

### Invariants
- Segment count is always 12 (chromatic), never `modes.length`.
- `currentRotation` is never wrapped — it accumulates across clicks to ensure smooth animation.
- CSS variable colours (`var(--wheel-color-tonic)` etc.) are referenced directly in JSX, not captured at module load time, so theme changes apply immediately.
- `import React from 'react'` is required (classic JSX transform).

### Files
| File | Role |
|---|---|
| `src/components/scale/ScaleSelectorWheel.jsx` | SVG wheel rendering, rotation state, mode lookup |
| `src/components/scale/styles/ScaleSelectorWheel.css` | Hover/active slice styles |
| `src/components/scale/ScaleSelector.jsx` | Mounts wheel; passes `family`, `size` (from ResizeObserver), `activeMode={scale.name}`, `onSelect` |
| `src/theory/scaleHandler.js` | `getModeIndex`, `getModeDisplayName`, `scaleDefinitions`, `modes` |

---

## 15. Transposing Instruments

### Purpose
Allows a musician practicing on a transposing instrument (Bb clarinet, French Horn, alto saxophone, etc.) to read written pitch on the sheet music while the app generates and plays concert pitch audio. The transposition is **display-only** — no part of the generation or audio pipeline changes.

### How It Works
1. `InstrumentSettings.transpositionKey` (string, default `'C'`) stores the instrument key per staff (treble and bass independently).
2. `getTranspositionSemitones(key)` in `src/constants/transposingInstruments.js` converts the key to a semitone offset: positive = sounds below written (Bb=+2, F=+7, Eb=+9), negative = sounds above written (D↑=−2, Eb↑=−3).
3. `renderMelodyNotes` receives `transpositionSemitones` as its last parameter. Before building the accidental map or placing note heads, it calls `transposeMelodyBySemitones(melody.notes, semitones)` to shift the display pitches. The original `melody.notes` (concert pitch) is never mutated.
4. `SheetMusic.jsx` computes `trebleTransSemitones` / `bassTransSemitones` from settings and passes them to every `renderMelodyNotes` call. Percussion and metronome always receive 0.
5. A small `(B♭ inst)` label is rendered just above the staff top line, to the left of `accidentalStartX`. It is always visible when transposition is active; in settings mode (`showSettings`) it also shows `(C inst)` for untransposed staves. Clicking the label opens a `gs-popup` list of all `TRANSPOSING_INSTRUMENTS` entries showing the pitch label and full instrument names.
6. Clicking the clef glyph in settings mode opens a `gs-popup` picker with all clef+range presets (TREBLE 8VA, TREBLE STANDARD, BASS STANDARD, etc.), matching the options available in `RangeControls`.
7. Both pickers use the `gs-popup` / `gs-popup-option` CSS classes from `GenericStepper` for visual consistency.
8. The transposition label is rendered **after** `renderStaffMeasureTexts` in the SVG group so it sits on top of the time-signature hitbox rects in z-order, preventing accidental time-sig activation when the label is clicked.

### Invariants
- Audio always plays concert pitch — `transpositionKey` never touches `Melody`, `Sequencer`, or generation code.
- `transposeMelodyBySemitones` passes percussion note strings (`'k'`, `'s'`, etc.) through unchanged.
- Accidental map is generated from the **transposed** display notes, so the key signature context is correct for the written key.
- All `renderMelodyNotes` call sites (main, next-layer, preview overlays) receive the same transposition value so notes look identical across animation transitions.

### Files
| File | Role |
|---|---|
| `src/constants/transposingInstruments.js` | `TRANSPOSING_INSTRUMENTS` array (with `label`, `display`, `instruments` fields), `getTranspositionSemitones`, `getTranspositionDisplay` |
| `src/model/InstrumentSettings.js` | `transpositionKey = 'C'` field (last constructor param) |
| `src/components/sheet-music/renderMelodyNotes.jsx` | `transpositionSemitones = 0` param; applies `transposeMelodyBySemitones` before accidental map |
| `src/components/sheet-music/SheetMusic.jsx` | Computes semitones from settings; renders transposition label and pickers; passes semitones to all renderMelodyNotes calls |

---

## 16. Passing Chords

> Full specification: **`docs/feature-passing-chords.md`** · Theory: **`docs/passing-chords-theory.md`**

### Purpose
Passing chords are transient chords inserted at rhythmically weak positions between structural chord changes to create smooth harmonic voice-leading. They appear smaller in the sheet music with a right-arrow indicator.

### How it Works
1. Structural chord generation runs first (`structuralCount = 1` when passing mode is on). MelodyGenerator places this one chord at the highest-ranked slot per measure (beat 1) using the `rank + 2×distance` proximity formula from `proximityUtils.findBestSlot`.
2. `insertPassingChords()` fills the remaining `chordCount − 1` slots per measure with passing chords (`passingProbability = chordCount − 1`). Positions snap to the `TICKS_PER_WHOLE / ts[1]` grid.
3. Passing chords are selected from five types (weighted): secondary dominant, secondary diminished, tritone sub, diatonic step, or sus4. Multi-chord chains use diatonic (40%), chromatic (30%), or secondary ii-V (30%) style.
4. The resulting `chordMelody` contains both structural and passing chords at their correct tick offsets; all downstream consumers pick them up automatically.

### Invariants
- `chord.meta.isPassing === true` is the single flag for all rendering decisions.
- Arrow rendered at fixed Y (`CHORD_ROOT_Y - CHORD_SUPER_DY - 10`) — never displaced by superscript `dy`.
- Structural chords are never moved or replaced — only preceding durations are shortened.
- Melody generator note selection uses offset-based chord lookup (not index-ratio) so passing chords correctly influence note tonality within their duration.
- `rhythmVariability` modulates insertion stochasticity: 0 = deterministic (`Math.round(prob)`), 100 = fully random (Bernoulli flip).

### Files
| File | Role |
|---|---|
| `src/generation/passingChords.js` | `insertPassingChords()` — insertion pass |
| `src/theory/chordGenerator.js` | `generatePassingChord(scale, nextChord, type, complexity)` |
| `src/generation/convertRankedArrayToMelody.js` | Offset-based `getActiveChord` using `chordProgression.offsets` |
| `src/hooks/useMelodyState.js` | Call `insertPassingChords` when `chordSettings.passingChords` |
| `src/components/controls/rows/InstrumentRow.jsx` | Extended stepper + `passingChords` toggle |
| `src/components/sheet-music/SheetMusic.jsx` | `renderSingleChordLabel` — smaller font, arrow, separate subscript text |
| `src/model/InstrumentSettings.js` | Default `passingChords = false` |

---

## 17. Display Notation — Unicode Accidentals

### Rule
**Never use plain ASCII `b` or `#` in any visible music notation.** This applies to:
- Labels on the sheet music SVG (transposition labels, chord labels, note names)
- List pickers, steppers, and UI controls that show note names
- Any string that is rendered to the user and contains a pitch class

### Required substitutions
| ASCII | Unicode | When |
|---|---|---|
| `b` (flat) | `♭` U+266D | Single flat |
| `#` (sharp) | `♯` U+266F | Single sharp |
| `bb` (double flat) | `𝄫` U+1D12B | Double flat |
| `##` (double sharp) | `𝄪` U+1D12A | Double sharp |

### Where this applies
- `TRANSPOSING_INSTRUMENTS[*].label` and `.display` — use `B♭`, `E♭`, `F♯`, etc.
- `TRANSPOSING_INSTRUMENTS[*].instruments` — use `B♭ Clarinet`, `E♭ Horn`, etc.
- Chord label strings passed to `renderSingleChordLabel` — use `normalizeNoteChars` from `noteUtils.js`
- Any hardcoded string constant that is shown to the user

### What is allowed in code
Internal key strings (e.g. `'Bb'`, `'F#'` as object keys or state values) may remain ASCII for stable identity comparisons. Only the *display* layer must use Unicode.

---

## 18. Settings Overlay — Interactive Elements & Timers

### Scale name in header
**Purpose:** The scale name (e.g. "C Major") in the app header is always clickable — tapping it plays the scale ascending. It also reflects two overlay states:
- **Settings overlay active:** turns yellow (`var(--accent-yellow)`).
- **Scale playing:** white drop-shadow glow (`drop-shadow(0 0 6px white) drop-shadow(0 0 3px white)`), driven by `isScalePlaying` state in `App.jsx` cleared by `setTimeout` after `notes.length × spacing` ms.
- **Otherwise:** `inherit` (white in dark themes).

**Files:** `src/App.jsx` (`handleScaleClick`, `isScalePlaying`, `scalePlayTimerRef`), `src/components/layout/AppHeader.jsx`.

### Chord progression name in title
**Purpose:** When chord labels are active (`showChordsOddRounds || showChordsEvenRounds`), the header title changes from "Melody in {scale}" to "{progressionLabel} in {scale}" (e.g. "Pachelbel in C Major"). Uses `getProgressionLabel(chordProgression.type)` from `progressionDefinitions.js`.

**Files:** `src/App.jsx` (passes `progressionLabel` prop), `src/components/layout/AppHeader.jsx`.

### Auto-close timer

The settings overlay closes after 5 s of inactivity. Every interaction (BPM click, time-sig click, repeats click, clef tap) resets the timer via `onSettingsInteraction()`. Picker opens (tempo/clef/transposition) use `onSettingsInteraction(10000)` for a 10 s window.

### Opening the overlay by clicking sheet music elements
All interactive sheet-music elements (clef, time-sig, BPM controls, tempo term, transposition label) call `e.stopPropagation()`, so they never reach `handleSheetMusicClick` → `onToggleSettings`. Without extra logic, clicking these elements while the overlay is closed would silently perform the action but never open the overlay.

**Fix:** `openSettingsIfClosed()` helper in `SheetMusic.jsx`. Calls `onToggleSettings()` when `!showSettings`, then `onSettingsInteraction?.()`. Called from every interactive element's handler: `handleClefTap`, `wrapHandler` (time-sig), `resetNumericTimer` (C/c click), `handleBpmChangeWrapper`, `handleTap` (TAP), tempo-term click, both transposition labels. Does nothing when settings is already open, so it cannot accidentally close the overlay.

---

## 19. BPM Controls — Four-Button Layout

### Layout
The BPM controls area (`renderBpmControls` in `SheetMusic.jsx`) has four hitbox zones relative to anchor `x=25`:

| Zone | x range | Action |
|---|---|---|
| `--` | x−22 … x+3 | Jump to nearest lower multiple of 5 |
| `-` | x+3 … x+45 | Jump to nearest lower integer (long-press = prompt) |
| `+` | x+45 … x+87 | Jump to nearest higher integer (long-press = prompt) |
| `++` | x+87 … x+112 | Jump to nearest higher multiple of 5 |

### Rounding
- `-`: `Math.floor(bpm − 0.001)` — always moves down by at least 1 from an integer
- `+`: `Math.ceil(bpm + 0.001)` — always moves up by at least 1 from an integer
- `--`: `Math.floor((bpm − 0.001) / 5) × 5`
- `++`: `Math.ceil((bpm + 0.001) / 5) × 5`

### Bounds
`BPM_MIN = 12`, `BPM_MAX = 360`. All changes go through `clampBpm()`. Long-press prompt validates the same range and accepts decimals (`parseFloat`).

**Files:** `src/components/sheet-music/SheetMusic.jsx` (`renderBpmControls`, `bpmDecrement`, `bpmIncrement`, `bpmDecrementFive`, `bpmIncrementFive`, `clampBpm`).

---

## 20. Click-Through Bug — Invisible Repeat View Group

### Symptom
Clicking on percussion notes (e.g. kick at staff y=206) opened the settings overlay instead of playing the note.

### Root cause
The "repeat view" `<g>` group (`data-wipe-role="old"`) was rendered **after** the note groups in SVG order. It had `opacity: notesVisible ? 0 : 1` but **no `pointerEvents: none`**. When `notesVisible=true` (notes shown, not repeat symbols), this group was invisible but still intercepted pointer events. Its metronome melody notes (rendered with `interactive=false`, no `data-notes`) consumed clicks without matching `findAncestorWithAttr`, causing them to fall through to the settings toggle.

### Fix
Added `pointerEvents: notesVisible ? 'none' : 'auto'` to the repeat view group.

**Files:** `src/components/sheet-music/SheetMusic.jsx` (repeat view `<g>` around line 2371).

---

## 21. Note-Active Playback Highlight — Subtle Variant

### Purpose
During playback with highlights enabled, active notes show a visual glow. The original `note-glow` filter (stdDeviation 2.5, two blur merge nodes) was too intense. A subtler `note-glow-subtle` filter was added.

### Filters
- **`note-glow`** — stdDeviation 2.5, two blur merge nodes. Used for click-flash (`note-click-flash` animation) and success/error feedback.
- **`note-glow-subtle`** — stdDeviation 1.5, one blur merge node. Used for `.note-active` (playback highlight) and `.chord-label-active` (chord highlight during playback).

**Files:** `src/components/sheet-music/SheetMusic.jsx` (SVG `<defs>`), `src/styles/App.css` (`.note-active`, `[data-mel="chord"].chord-label-active`).

---

## 22. Tuplets

### 22.1 Purpose

Tuplets are rhythmic groups where `noteCount` notes fill the time normally occupied by `denominator` notes of the same written value. The four supported types are:

| Type | Notation | Replaces | Probability |
| --- | --- | --- | --- |
| Triplet (small) | 3 : 2 | 1 note of `2 × slotTicks` | `rhythmVariability / 500` |
| Triplet (large) | 3 : 2 | 1 note of `4 × slotTicks` | `rhythmVariability / 750` |
| Quadruplet | 4 : 3 | 1 note of `3 × slotTicks` | `rhythmVariability / 1000` |
| Quintuplet | 5 : 4 | 1 note of `4 × slotTicks` | `rhythmVariability / 2000` |

Where `slotTicks = TICKS_PER_WHOLE / smallestNoteDenom` (e.g. 6 ticks for 8th-note grid).

**Example (smallestNoteDenom = 8, slotTicks = 6):**

| Type | groupTicks | noteTicks | visualDuration | Written as |
| --- | --- | --- | --- | --- |
| Triplet small | 12 | 4 | 6 | 3 eighth notes in the time of 2 |
| Triplet large | 24 | 8 | 12 | 3 quarter notes in the time of 2 |
| Quadruplet | 18 | 4 | 6 | 4 eighth notes in the time of 3 |
| Quintuplet | 24 | 4 | 6 | 5 eighth notes in the time of 4 |

### 22.2 Probability & Selection

Each note in the melody is tested independently. Candidates are sorted rarest-first; the first type whose `groupTicks` matches the note's raw duration and whose random roll passes wins. At most one tuplet type is applied per note. Chord sequences are excluded.

### 22.3 `TupletEntry` data shape

Stored in `melody.triplets[i]` for every note in a tuplet group (same `id` for all notes in the group, `null` for non-tuplet notes):

```js
{
  id:             number,  // unique per melody; groups all notes in the same tuplet
  noteCount:      number,  // 3, 4, or 5
  denominator:    number,  // 2, 3, or 4
  groupTicks:     number,  // total tick span (raw duration of the replaced note)
  visualDuration: number,  // groupTicks / denominator — standard tick value used for notehead lookup
}
```

### 22.4 Tail-drop rule

Each tuplet of `noteCount` notes adds `noteCount − 1` extra entries to the arrays. To keep total notes-per-measure consistent, `(noteCount − 1) × numWinners` entries are dropped from the tail. This is applied right-to-left across all winners so earlier indices remain stable.

### 22.5 Data propagation

`melody.triplets` is a parallel array (same length as `melody.notes`). It is propagated through:

- `sliceMelodyByMeasure` — in `src/utils/melodySlice.js`
- `sliceMelodyByRange` — in `src/utils/melodySlice.js`
- `sliceToMelodyLike` — in `src/utils/melodySlice.js` (passed as `triplets` field on the returned object)
- `resizeMelody` — in `src/utils/melodySlice.js`

The field is omitted (set to `null`) when no tuplet was generated, so callers can use `melody.triplets?.[i]` safely.

### 22.6 Rendering

**Notehead, flag, stem** (single-note path in `renderMelodyNotes`): raw tuplet tick durations (e.g. 4 ticks for an 8th-note triplet) have no entry in `durationNoteMap` / `durationFlagMapUp/Down`. The renderer reads `visualDuration` from `melodyTriplets[index]` and substitutes it for the raw duration in all notehead/flag/dot/stem-presence lookups.

**Beaming**: the beam-grouping logic also uses `visualDuration` (not raw duration) to decide whether to beam notes together. Triplet 8ths (`visualDuration = 6`) are beamed; triplet quarters (`visualDuration = 12`) are not.

**Bracket and label**: after all note elements are rendered, `tupletGroupData` (built during the note pass) drives a second SVG pass:

- **Beamed groups** (`visualDuration < 12`, e.g. 8th-note triplets): number label only — `"3"` + `" : 2"` (dimmed). No bracket; the beam already connects the notes.
- **Unbeamed groups** (`visualDuration ≥ 12`, e.g. quarter-note triplets): SVG bracket (two L-shaped hook lines with a gap in the middle for the number) + number label.

The number is placed above or below the stem tips depending on stem direction (`stemIsAbove`). The denominator (`: 2`, `: 3`, `: 4`) is rendered in a dimmer colour (`var(--text-secondary, #888)`) per standard engraving convention (reference: [Wikipedia — Tuplet](https://en.wikipedia.org/wiki/Tuplet)).

### 22.7 Invariants

- Tuplets are **display-only post-processing** — audio uses the raw tick durations, not `visualDuration`.
- Only single-note melodies get tuplets (`isChordSequence` bypasses the post-processor).
- `melody.triplets` is always either `null` (no tuplets) or an array of exactly `melody.notes.length` entries.
- `id` values are unique within a melody but reset to 0 on each call to `generateMelody`.

### 22.8 Files

| File | Role |
| --- | --- |
| `src/generation/melodyGenerator.js` | Tuplet post-processing; builds `melody.triplets` |
| `src/utils/melodySlice.js` | Propagates `triplets` through all slice/resize helpers |
| `src/components/sheet-music/renderMelodyNotes.jsx` | Reads `melodyTriplets`; uses `visualDuration` for note shape; accumulates `tupletGroupData`; renders bracket + label SVG |

### 22.9 Interaction with fermatas (§30)

A tuplet note CAN carry a fermata — both fields live on the parallel-array Melody structure. The fermata events are tick-based (`{ tick, hold }`), so they don't care about tuplet slot accounting. `playMelodies` and `Sequencer.schedNotes` apply the shift uniformly to ALL notes whose offset is past the fermata tick, including subsequent tuplet notes.

What still needs care if you author a song with a fermata mid-tuplet (rare):
- The tuplet's `noteTicks` for sub-notes uses `groupTicks / noteCount`; the fermata extension is added on top in audio scheduling. The audio sustains the held note for `noteTicks + hold` and pushes the remaining tuplet sub-notes by `hold`.
- The visual still renders the tuplet bracket + label over the natural-tick positions — the fermata glyph sits above the held note like a normal fermata.

No song in the repo currently uses this combination; it's tested implicitly by the song-level fermata propagation (which doesn't care whether the underlying note is a tuplet or not).

---

## 23. Context Architecture — Prop Drilling Elimination (2026-05)

### Purpose
SheetMusic.jsx previously received ~60 props from App.jsx, including melody objects, playback
flags, animation refs, and AudioContext callbacks. Three React contexts replace the most
repetitive groups, reducing the SheetMusic prop surface to ~38 and making dual-view rendering
(two `<SheetMusic>` instances) free — both consumers read from the same context.

### Contexts

| Context | File | What it carries |
|---|---|---|
| `MelodyContext` | `src/contexts/MelodyContext.jsx` | `treble`, `bass`, `percussion`, `metronome`, `chordProgression` Melody objects |
| `PlaybackTransportContext` | `src/contexts/PlaybackTransportContext.jsx` | `isPlaying`, `isPlayingContinuously` — flips at start/stop only |
| `RoundStateContext` | `src/contexts/RoundStateContext.jsx` | `isOddRound`, `showNotes`, `inputTestState`, `inputTestSubMode` / setter — flips ~1× per measure |
| `TransitionOverlayContext` | `src/contexts/TransitionOverlayContext.jsx` | `nextLayer`, `previewMelody` — non-null only during transitions |
| `AnimationRefsContext` | `src/contexts/AnimationRefsContext.jsx` | All animation refs/callbacks: `wipeTransitionRef`, `scrollTransitionRef`, `paginationFadeRef`, `clearHighlightStateRef`, `showNoteHighlightRef`, `setCurrentMeasureIndex`, `sequencerRef`, `context` (AudioContext) |

The original monolithic `PlaybackStateContext` was split into three providers in May 2026 because its value object invalidated on every measure tick (isOddRound flip), re-rendering every consumer — including the SheetMusic subtree whose layer caches (`MelodyNotesLayer`, `ChordLabelsLayer`, `BarlinesLayer`, `PreviewOverlay`) we'd just built around the heavy renderers. Splitting by update frequency keeps those memos hot. See §29.

The legacy `usePlaybackState()` hook is retained as a backwards-compat aggregator in `src/contexts/PlaybackStateContext.jsx` — it merges the three new contexts so any caller can still pull the old shape, but new consumers should subscribe to only what they need.

### Invariants
- All providers are mounted in `App.jsx` above both `<SheetMusic>` instances.
- `AnimationRefsContext` carries refs (not state), so consuming it never triggers re-renders.
- `svgRef` is **not** in context — SheetMusic receives it as a prop because the component
  has an internal fallback: `const svgRef = svgRefProp ?? svgRefInternal`.

### Files
- `src/contexts/MelodyContext.jsx`
- `src/contexts/PlaybackTransportContext.jsx`
- `src/contexts/RoundStateContext.jsx`
- `src/contexts/TransitionOverlayContext.jsx`
- `src/contexts/PlaybackStateContext.jsx` — now a backwards-compat aggregator hook
- `src/contexts/AnimationRefsContext.jsx`
- `src/App.jsx` — nests the four providers around the layout tree

---

## 24. Extracted Hooks (2026-05 Refactoring)

### 24.1 `useAppLayout`

**Purpose:** Derives all viewport-dependent layout values from `windowSize` and `numMeasures`.
Pure computation — no side effects. Called once per render in App.jsx.

**Returns:** `{ isDualView, sheetHeight, btmPanelHeight, tabBtnScale, sheetWidth, idealVisibleMeasures }`

**File:** `src/hooks/useAppLayout.js`

### 24.2 `useSheetMusicTransitions`

**Purpose:** Manages synchronous DOM cleanup for wipe/pagination/scroll transitions.
Extracted from a 95-line `useLayoutEffect` that previously lived inline in SheetMusic.jsx.
Uses `useLayoutEffect` internally so DOM mutations happen before the browser paints.

**How it works:** Reacts to `nextLayer` and `animationMode` changes:
- `nextLayer → non-null + wipe`: applies fully-opaque mask to `[data-wipe-role="new"]`
- `nextLayer === 'block-flip'`: sets `data-block-flip-pending` on `[data-pagination-old]`
- `nextLayer → null`: clears wipe masks, restores pagination opacity, resets scroll transform

Reads `svgRef`, `wipeTransitionRef`, `paginationFadeRef`, `context`, and `animationMode`
directly from `AnimationRefsContext` and `DisplaySettingsContext`.

**Parameters:** `(nextLayer, layoutRef)` — only two, everything else from context.

**File:** `src/hooks/useSheetMusicTransitions.js`

---

## 25. Sequencer — Method Extractions (2026-05 Refactoring)

### 25.1 `applyResultToSetters(result, { initialLoad, seriesStartMeasureIndex })`

**Purpose:** Centralises the "push generation result to React setters" logic that previously
existed in two near-identical forms (startup path and loop path).

- `initialLoad=true`: always updates reference melodies (called once at session start).
- `initialLoad=false`: respects the `'fixed'` randomization rule; also calls `hideOldGroup`
  to prevent a wipe-mode flash when new content arrives.

**File:** `src/audio/Sequencer.js`

### 25.2 `buildScheduledChords(chordProgression, m, measureLengthTicks, nextStartTime, measureDuration, timeFactor, schedMeasureIndex)`

**Purpose:** Extracts the per-measure chord timestamp computation from the scheduling loop
into a testable method. Builds `schedChords` entries with AudioContext timestamps, then
extends each chord's highlight window to fill until the next chord starts (prevents flicker
when durations don't perfectly tile the measure).

**Returns:** `Array<{ audioTime, duration, measureIndex, localSlot, degree }>`

**File:** `src/audio/Sequencer.js`

### 25.3 `scheduleTimeout(fn, delayMs)`

**Purpose:** Wraps `setTimeout` to auto-remove the ID from `this.timeouts` when the callback
fires. Prevents `this.timeouts` from accumulating thousands of already-fired IDs during long
playback sessions. `stop()` still cancels all pending IDs on teardown.

**Invariant:** All `setTimeout` calls inside the scheduling loop must go through
`scheduleTimeout` — never `this.timeouts.push(setTimeout(...))` directly.

**File:** `src/audio/Sequencer.js`

---

## 26. Quarter Note Span — Melodic Leap Constraint (`maxLeap`)

**Purpose:** Prevents large melodic jumps within a short time window, making generated melodies more singable and instrumentally idiomatic. Also constrains chord voicing width for fullchord/pairedchord modes.

**How it works:**
- `InstrumentSettings.maxLeap` (number | null): maximum allowed semitone distance. `null` = unlimited (default). Stored per-instrument on treble/bass settings.
- For each note slot, all notes placed within the previous quarter-note window (= `smallestNoteDenom / 4` slots back) are collected as reference notes.
- A candidate note passes if its semitone distance from **every** reference note is ≤ `maxLeap`.
- Implementation uses **intersection** (not retries): filter `effectiveScale` to candidates satisfying the constraint, then pick randomly. O(pool × window) — always terminates.
- **Fallback** (empty intersection): pick the note in `effectiveScale` with minimum distance to any reference note — deterministic and always musical.
- **Chord voicing span** (fullchord): after range-filtering chord tones, find the largest consecutive pitch window where `max_idx − min_idx ≤ maxLeap`.
- **Paired-chord span** (pairedchord): partner note is limited to `min(12, maxLeap)` semitones from the melody note.

**UI:** `GenericStepper` in Col 8 of `InstrumentRow`, shown only for treble/bass rows. Options: 3rd (4), 4th (5), 6th (9), 7th (11), 8ve (12), 9th (14), 10th (16), 11th (17), 12th (19), 15th (24), ∞ (null).

**Invariants:**
- Applied as post-processing in `MelodyGenerator.generateMelody()` after `convertRankedArrayToMelody` returns — does not change the function signature.
- Not applied to fullchord slots (chord span is handled separately in the fullchord block).
- Percussion IDs (`getNoteIndex` returns -1) are skipped by the leap filter.

**Files:** `src/model/InstrumentSettings.js`, `src/generation/melodyGenerator.js`, `src/components/controls/rows/InstrumentRow.jsx`, `src/constants/musicLayout.js`, `src/components/controls/PlaybackInstrumentSection.jsx`, `src/components/controls/PlaybackSettings.jsx`.

---

## 27. Arpeggio Randomization — `arp_var` and `arp_group`

### 27.1 Purpose

The `'arp'` randomization rule (`randomizationType` / `randomizationRule`) generates melodic lines where notes travel sequentially toward a **landing note** — creating broken-chord and scale-run patterns. Two subtypes are planned:

- **`arp_var`** — rhythm-aware; inherits the ranked array from `generateRankedRhythm` and varies line length with `rhythmVariability`.
- **`arp_group`** — beat-group-aware; pre-determines line structure from `rhythmicGrouping` and fills groups backwards from landing notes with predictable, even runs.

The combination of note pool and arpeggio subtype determines the musical exercise:
- `chord` pool + arp → broken chords
- `scale` pool + arp → scale runs
- Both subtypes reuse the existing pipeline (4a–4g). Per-instrument variation is expressed through `InstrumentSettings` only. No instrument-specific special-casing is allowed inside the generation functions.

---

### 27.2 Core Concepts

#### Landing note (L)
**L is always the last note of a line.** Every note in a line travels toward L. The concept of "notes starting from L" does not exist — L is exclusively an endpoint.

#### Line
A contiguous sequence of active note slots that ends at L. A melody contains 1 to `numMeasures × beatsPerMeasure` lines depending on density and rhythm.

#### Direction
Set once per line, not per landing note. Two options:
- **omhoog (up):** notes ascend in pitch over time, arriving at L from below.
- **omlaag (down):** notes descend in pitch over time, arriving at L from above.

Direction is chosen randomly per line (50/50). It does not change mid-line.

#### Backwards planning
The algorithm fills approach notes by working **backward from L**, walking in the direction **opposite to the line direction**:
- Line direction up → backwards planning walks **down** from L.
- Line direction down → backwards planning walks **up** from L.

After filling, the approach-note list is reversed to get time order (earliest note first, L last).

#### Span
A configurable semitone window that defines the working pitch range for one line. L sits at the top of the span (direction=up) or at the bottom (direction=down). Size is set by `InstrumentSettings.maxLeap` (default 12 = 1 octave; null = full pool range, no boundary triggers). `maxLeap` therefore serves double duty: melodic leap constraint for other rules, and arp span for `arp_var`/`arp_group`. When the backwards-planning walk exhausts notes in the current span, a boundary mode applies.

#### Boundary modes

Each line independently receives a randomly chosen boundary mode (kaats OR spring, 50/50). The mode is fixed for the entire line.

**Kaats (bounce):** reverse the backwards-planning walk direction at the span boundary, creating a wave pattern within the span.

**Spring (jump):** shift the span by one octave in the planning direction and continue walking. Creates a cyclic pattern across octaves.

---

### 27.3 Note Pools and Landing Notes

| Note pool | L (landing note) |
|---|---|
| `chord` | Root of the active chord |
| `scale` | Random chord tone (not necessarily root) |
| `chromatic` | Random note in range |

Approach notes are drawn from the same pool (scale/chord tones within the span).

---

### 27.4 `arp_var` — Rhythm-Variability Subtype

Uses the output of `generateRankedRhythm` directly. Top N slots per measure (determined by `notesPerMeasure`) are filled.

**Line determination:**
- Active slots that are separated by at least one rest slot form distinct lines.
- The last active slot before each rest (or before the measure end) is L.
- On tie (two candidate boundaries have equal surrounding rests): choose the one preceded by the **longest empty stretch**; stop searching when found. This yields 1 to `numMeasures × beatsPerMeasure` lines.

**Note selection within a line:**
- For a line of length N, generate approach notes by backwards planning from L (see §27.2).
- Pick approach notes from the scale/chord pool within the span, respecting `maxLeap` between consecutive notes.
- Assign in time order (approach notes first, L last).

**`rhythmVariability` effect:** higher variability produces more varied rhythm patterns via `generateRankedRhythm`, resulting in lines of more varied lengths.

---

### 27.5 `arp_group` — Beat-Group Subtype

Uses `rhythmicGrouping` (the beat-group decomposition from `generateRhythmicDNA`) to pre-determine line boundaries. Each beat group maps to one line.

`arp_group` runs in **two stages**:
  1. **Line decomposition** — walk through the priority ranks, assigning each slot to either L (line-ending landing note) or n (approach note), without yet picking pitches. The rhythm grid resolution comes from `smallestNoteDenom` (set by the rhythm engine when building the ranked array); the L/n algorithm operates on whatever slot count the array contains. Inactive slots (no rank from the rhythm engine) get a placeholder rank so the walk treats every slot uniformly.
  2. **Note filling** — for each L, plan its approach notes backwards within a span (the existing §27.2 backwards-planning algorithm). The span is `maxLeap` semitones wide, positioned **randomly** within the instrument range so L falls inside (Han 2026-05-26).

> **Implementation status (2026-05-26)**: Spec-compliant — see `src/generation/convertRankedArrayToMelody.js`, the `else` branch of the `arp_group` block. Previously the code grouped by `rhythmVariability` and did per-beat-group lines; now it walks ranks, tags L/n, and decomposes into lines that can span groups.

#### 27.5a Stage 1 — Line decomposition (Han 2026-05-22 spec)

Walk the priority ranks (1 = highest priority) from the ranked rhythm array:

```
[(1 7 5)(3 10)|(2 8 5)(4 9)]     ← ranks from generateRankedRhythm
```

1. **Pick the lowest unused rank** (= highest priority slot).
2. **Assign L** to that slot — unless the slot is already tagged `n` (because a previous step's "fill" overwrote it). If already `n`, leave it and proceed to step 3 anyway.
3. **Fill the group BEFORE** (the previous beat group in time) with `n`. **Overwrite L's** in that fill — those L's become approach notes of a longer line. Skip if no group-before exists.
4. **Repeat** with next-lowest unused rank.
5. **Stop conditions**:
   - All slots are tagged (`L` or `n`).
   - Tie on lowest-rank → pick the slot whose "group-before" fill would create the longest empty stretch. After this tie-breaker stop searching (no more line creations).

Resulting number of lines: between `1` and `numMeasures × numGroupsPerMeasure`.

**Worked example** (Han 2026-05-22) — `[(1 7 5)(3 10)|(2 8 5)(4 9)]`:

```
Initial:  [(1 7 5)(3 10) | (2 8 5)(4 9) ]

Rank 1 → slot becomes L:
          [(L 7 5)(3 10) | (2 8 5)(4 9) ]
          Fill group-before: doesn't exist (first group). Skip.

Rank 2 → slot becomes L:
          [(L 7 5)(3 10) | (L 8 5)(4 9) ]
          Fill group-before: previous group = (3 10) → (n n).
          [(L 7 5)(n n)  | (L 8 5)(4 9) ]

Rank 3 → slot already n; leave it.
          Fill group-before: previous group = (L 7 5). Overwrite L → (n n n).
          [(n n n)(n n)  | (L 8 5)(4 9) ]

Stop: all m1 slots filled. (Subsequent ranks 4,5,…,10 would fill m2's
remaining slots one cluster at a time by the same rule.)
```

Each cluster `(n ... n L)` is one line. All notes in a line approach the same L; there is no "starting FROM an L" — every note in the cluster moves *toward* the L.

#### 27.5b Stage 2 — Note filling (per-line backwards planning)

For each line (cluster ending in L), pick fresh parameters and back-plan from L:
1. Choose **type**: `kaats` (bounce) or `spring` (octave jump) at span boundaries (§27.2).
2. Choose **span** (12 semitones around L by default; see `maxLeap`).
3. Choose **direction** (up / down) — `richting omhoog` = the line ascends in TIME toward L.
4. Backwards plan from L within span; on boundary apply chosen type.
5. Reverse collected list and assign to the cluster's slots in time order; place L at the last slot.

**Worked example** (Han 2026-05-22) — C major, range [c4, e5], two lines:

```
Line 1: cluster of 5 slots ending in L₁ = G4.
        type=spring, span=[c4,c5], direction=down.
        Backwards step  1: ___ ___ ___ A5  G4   ← wait — A5 outside span [c4,c5];
                                                  this trace shows pitches AFTER spring
                                                  ('direction down' walks UP in pitch
                                                  going back in time, so picks > G4).
        Backwards step  2: ___ ___ B5  A5  G4
        Backwards step  3: ___ C5  A5  G5        ← (intermediate trace)
        Spring! (octave jump at boundary)
        Final:             C4  C5  A5  G5        ← time order; spring resolved
                                                   one of the inner pitches via the
                                                   spring rule.

Line 2: cluster of 3 slots ending in L₂ = E4.
        type=kaats, span=[d4,d5], direction=up.
        Backwards step 1:           ___ E4
        Backwards step 2:       D4  E4   ← walks down ('up' direction)
        Kaats! (reverse at boundary)
        Final:           E4  D4  E4
```

> The exact pitches shown above are illustrative — Han noted the trace
> step-by-step including the boundary triggers. Re-confirm during
> implementation that the trace direction labels match the algorithm
> (since "direction down" can be read as "down in time" or "down in
> pitch").

#### 27.5c Edge cases (Han 2026-05-22 additions)

- **Tie on lowest rank** → pick the slot whose "group-before" fill creates the longest empty stretch (= most contiguous unfilled slots). After this tie-breaker stop searching.
- **Span has no valid pool notes** AND **the chord is just its root** (so the pool is tiny): exceptionally allow the **fifth** of the chord into the line. If still no candidate, repeat the previous approach note.

> See also §27.7 for the earlier edge-case table (rest blocking L, narrow range etc.).

---

### 27.6 Concrete Examples

All examples: C major, 4/4, grouping [2,2] (two groups of 2 beats), scale pool, `arp_group`.

#### Example A — direction omhoog (ascending), kaats boundary mode
L for each group is a random chord tone. Suppose L₁=c5, L₂=a4.

```
Group 1 — 4 notes, direction up, L=c5, span=c4–c5
  Backwards planning (walking down from c5): c5 → b4 → a4 → g4
  Time order: g4  a4  b4  c5L

Group 2 — 4 notes, direction up, L=a4, span=a3–a4
  Backwards planning (walking down from a4): a4 → g4 → f4 → e4
  Time order: e4  f4  g4  a4L

Measure result: | g4 a4 b4 c5 | e4 f4 g4 a4 |
```

#### Example B — direction omlaag (descending), spring boundary mode
L₁=e3 (low), need 6 approach notes, span=e3–e4.

```
Group 1 — 6 notes, direction down, L=e3, span=e3–e4
  Backwards planning (walking up from e3): e3 → f3 → g3 → a3 → b3 → [boundary e4]
  Spring: jump to e4–e5 span, continue up: f4
  Backwards list (reverse order of collection): f4  b3  a3  g3  f3  e3L
  Time order: f4  b3  a3  g3  f3  e3L
```

The spring creates a jump across an octave boundary, then resolves downward to L — idiomatic for scale-run patterns that span a wide range.

#### Example C — kaats (bounce) at boundary
L=c4, 7 approach notes, span=c4–c5, direction omhoog.

```
Backwards planning (walking down from c4): c4 → b3 → a3 → g3 → f3 → e3 → [boundary c3]
Kaats: reverse, now walking up: d3
Backwards list: d3  e3  f3  g3  a3  b3  c4L
Time order: d3  e3  f3  g3  a3  b3  c4L   ← wave approaching L from below
```

---

### 27.7 Edge Cases

| Situation | Handling |
|---|---|
| Note pool too narrow for span (e.g. chord pool has 3 notes, span needs 5) | Wrap cyclically within pool; allow repetition |
| Only root in chord pool (diminished/augmented chord with 1 unique tone) | Use root as L and sole approach note; pad with rests |
| Narrow range: span wider than `InstrumentSettings.range` | Clip span to range; if clipped span has < 2 distinct pool notes, allow repetition |
| Rest blocking L (rest forced at group end by percussion rules) | Shift L one slot earlier within the group; if no slot available, group produces a rest |
| Line length 1 | Single note = L only; no approach notes |

---

### 27.8 Invariants

- **L is always the last note of a line.** No note follows L within the same line.
- **Direction is fixed for a line.** It may differ between lines.
- **Backwards planning is always the inverse of line direction.** Never plan forward.
- **The pipeline is identical for all instrument types** (treble, bass, percussion). Variation is in `InstrumentSettings` only.
- **Do not hardcode per-group or per-numerator tables.** Derive group structure from `decomposeNumeratorToBeatGroups` and the existing rhythmic DNA functions. See §6c.
- **`arp_group` uses `rhythmicGrouping` from `generateRhythmicDNA`**, not a freshly computed decomposition — both must stay in sync.

---

### 27.9 Files

- `src/generation/convertRankedArrayToMelody.js` — existing `'arp'` rule lives here; `arp_var` and `arp_group` extend this block.
- `src/generation/melodyGenerator.js` — entry point; passes grouping info and `arpSpan` to converter.
- `src/generation/rhythmicPriorities.js` — `generateRhythmicDNA`, `decomposeNumeratorToBeatGroups` — reuse for group structure.
- `src/generation/generateRankedRhythm.js` — ranked array; `arp_var` reads this directly.
- `src/model/InstrumentSettings.js` — `randomizationRule` and `maxLeap` fields (`maxLeap` doubles as arp span).
- `src/components/controls/rows/InstrumentRow.jsx` — Col 8 Max Leap stepper also controls arp span.
- `src/constants/instrumentRules.js` — `RULE_FAMILIES.arp` includes `'arp_var'`, `'arp_group'`.
- `src/utils/labelUtils.js` — display labels for `'arp_var'` and `'arp_group'`.

---

## Section 28 — Tuplet Injection Architecture

### 28.1 Motivation

Before this refactor, tuplets were added as a post-processing step AFTER note selection. This meant that randomization rules (arp_var, arp_group, beat-backbeat) had no awareness of tuplet groups: an arp line could be cut in half by a tuplet boundary, and the tuplet's notes were chosen from a uniform random pick rather than the arp algorithm.

The fix: inject tuplets into the **ranked array** (between variability application and integer-rank assignment), so that note-selection rules see the full rhythmic skeleton including tuplets.

### 28.2 Pipeline

```
generateDeterministicRhythm   → nested measure arrays (float ranks)
   ↓ flatten + apply variability
piecewiseSum                   → flat float-priority array
   ↓ injectTuplets()           ← NEW: place tuplets here, before ranking
injectedArray + tupletGroups
   ↓ ranking pass (sort → integer ranks 0,1,2…)
rankedArray + tupletGroups     ← returned by generateRankedRhythm
   ↓ convertRankedArrayToMelody
melody[]                       — tuplet start slots have notes; continuation slots = null
   ↓ Melody.fromFlattenedNotes
Melody object                  — tuplet start note has duration = slotCount × timeScale
   ↓ tuplet expansion (melodyGenerator.js)
final Melody                   — n sub-notes per tuplet, float offsets/durations
```

### 28.3 Data Structures

**TupletGroup** (produced by `injectTuplets`, threaded through to `melodyGenerator.js`):
```
{
  slotStart:    number   // absolute index in flat rankedArray
  slotCount:    number   // d — number of original slots replaced (= group width)
  n:            number   // number of sub-notes to produce
  priority:     number   // min float-priority of replaced slots (before ranking pass)
  measureIndex: number   // 0-based measure
}
```

**triplets entry** (attached to Melody, used by sheet-music renderer):
```
{ id, noteCount, denominator, groupTicks, visualDuration }
```
All n sub-notes within one tuplet share the same entry; `denominator = slotCount`.

### 28.4 Candidate Generation

For each measure, candidates are (start, size) pairs in slots:

**Super-groups** — 1, 2, or 3 consecutive beat-groups (no quads: too large):
```
single  d = groupSlotSize
pair    d = groupSlotSize₀ + groupSlotSize₁
triple  d = groupSlotSize₀ + groupSlotSize₁ + groupSlotSize₂
```

**Sub-groups** — one halving of each super-group (even sizes only):
```
d=4  → d=2  (most common: 3:2 triplet on two 16th-note slots)
d=6  → d=3  (4:3 quadruplet on compound-meter group)
d=8  → d=4  (5:4 / 6:4 / 7:4 on one beat at 16th resolution)
d=12 → d=6
d=16 → d=8
d=24 → d=12
```
Maximum ONE halving level ("hooguit 1x") to stay close to `smallestNoteDenom`.
Odd group sizes (e.g. 3) have no sub-candidate.

Duplicates are deduplicated by `(start, size)` key.
Candidates are **shuffled** before processing for unbiased selection.

### 28.5 Mutual Exclusion

A claimed-slot set tracks which slots are already taken by a placed tuplet.
Any candidate that overlaps a claimed slot is skipped.
This allows multiple non-overlapping tuplets per measure.

### 28.6 Priority Assignment

Winning tuplet: `priority = min(all non-null float-priority values in [start, start+size))`.
Continuation slots `[start+1 … start+size-1]` are set to `null`.
After injectTuplets, the integer ranking pass re-numbers all non-null values 0,1,2… —
the tuplet start slot's rank is determined by its min-priority, which controls when
the tuplet fires relative to other notes based on `notesPerMeasure` budget.

### 28.7 Probability Formula

Base probability for 3:2 triplet:
```
tripletProb = min(1, (rhythmVariability / 100) × 0.15 × polyMultiplier)
```
At variability=30, polyMult=1: tripletProb ≈ 4.5% (near Han's 5% default).

Any tuplet with weight W:
```
prob = min(1, tripletProb × TRIPLET_WEIGHT / W)
     = min(1, tripletProb × 6 / W)
```
`TRIPLET_WEIGHT = 6 = lcm(3,2) × |3-2|`.

### 28.8 Density Guard

A tuplet with n > `notesPerMeasure` is skipped — it would produce far more notes
than the rhythmic budget, making it musically implausible.

### 28.9 Tuplet Definitions

File: `src/constants/tuplets.js`. Weight = `lcm(n,d) × |n-d|`.

| Ratio | Name | Weight | Notes |
|---|---|---|---|
| 3:2 | triplet | 6 | reference |
| 4:3 | quadruplet | 12 | |
| 5:4 | quintuplet | 20 | |
| 6:4 | sextuplet | 24 | |
| 5:3 | 5 in 3 | 30 | |
| 5:6 | 5 in 6 | 30 | |
| 6:5 | 6 in 5 | 30 | |
| 7:6 | 7 in 6 | 42 | |
| 6:7 | 6 in 7 | 42 | stretch |
| 6:8 | 6 in 8 | 48 | stretch |
| 7:8 | 7 in 8 | 56 | stretch |
| 7:5 | 7 in 5 | 70 | |
| 5:7 | 5 in 7 | 70 | stretch, very rare |
| 9:8 | nonuplet | 72 | Chopin/Brahms |
| 7:4 | septuplet | 84 | |
| 5:8 | 5 in 8 | 120 | extremely rare |
| 7:9 | 7 in 9 | 126 | extremely rare |

Removed: {2:3} and {4:6} — duplet forms uncommon in simple-meter melody notation.

### 28.10 Tick Arithmetic

Tuplet sub-note durations are **float ticks**: `noteTicks = floor(groupTicks / n)`.
Last sub-note absorbs rounding remainder: `lastNoteTicks = groupTicks - (n-1) × noteTicks`.
Float ticks are fine: the Sequencer converts `duration_ticks × timeFactor` to seconds
(AudioContext time), which is inherently float. No change to `TICKS_PER_WHOLE`.

### 28.11 Files

- `src/constants/tuplets.js` — TUPLET_DEFS, weight formula, TRIPLET_WEIGHT, tupletsForSlotCount
- `src/generation/injectTuplets.js` — candidate generation, dice rolls, priority assignment
- `src/generation/generateRankedRhythm.js` — calls injectTuplets; returns `{ rankedArray, tupletGroups }`
- `src/generation/melodyGenerator.js` — destructures tupletGroups; deterministic expansion into n sub-notes
- `src/model/Melody.js` — updateMetronome caller updated to destructure `{ rankedArray }`
- `src/generation/generateBackbeat.js` — two callers updated to destructure `{ rankedArray }`

---

## 29. SheetMusic Render-Cost Refactor (2026-05)

### 29.1 Purpose

DevTools traces during continuous playback showed React renders at 230–304 ms (36× in a 16 s sample). The rAF loop itself was clean (0 ticks > 16 ms after an earlier round of cache + memo work), but every SheetMusic re-render — fired ~38×/minute on isOddRound flips, showNotes toggles, transition arms, and tab switches — still re-executed:

- `renderMelodyNotes(...)` inline **11×** (OLD / yellow / red layers × 3 staves + metronome variants)
- `renderChordLabels(...)` inline **3×** (OLD, yellow overlay, red/crossfade preview)
- `renderRegularBarlines(...)` inline **2–3×** (OLD, yellow preview, crossfade preview)
- the full ~220 LOC RED/crossfade preview IIFE, even when no transition was active

Inline function calls do not memoise: JSX evaluates the function body every render, even when its arguments are referentially equal. Each `renderMelodyNotes` call performs O(N²) beaming-cluster work, stem-direction forcing, accidental-map generation, and tuplet-bracket layout — the dominant cost in those 230–304 ms renders.

The refactor wraps each heavy render in a `React.memo` sub-component so React skips the entire JS pass when props are shallow-equal, and splits the context provider that was invalidating those memo caches once per measure.

### 29.2 Architecture

Memoised layer components (all under `src/components/sheet-music/`):

| Component | Wraps | Call sites in SheetMusic |
|---|---|---|
| `MelodyNotesLayer` | `renderMelodyNotes` | 11 (treble/bass/percussion × OLD/yellow/red + metronome) |
| `ChordLabelsLayer` | inline chord-label renderer + per-chord builder | 3 (OLD, yellow, red) |
| `BarlinesLayer` | `_iterMeasureLines` (now `iterMeasureLines`, pure) | 4 (3× `mode="regular"`, 1× `mode="repeat"`) |
| `PreviewOverlay` | the RED/crossfade IIFE | 1, lazy-mounted only when `showWipePreview === 'red'` or `'crossfade'` |

The per-chord builder (`renderSingleChordLabel`), the measure-line iterator (`iterMeasureLines`), and the one-measure-repeat renderer (`renderOneMeasureRepeatSymbols`) are now pure functions with explicit args — no closure capture. This is what makes the memo deterministic from props.

`PreviewOverlay` is lazy-mounted, not just memoised. With `previewMelody` null (stopped state), the old IIFE still computed visibility config + previewLayout destructure + fallback "NEXT BLOCK" text. Now the parent passes `null` and the component is absent from the DOM entirely.

### 29.3 Context split

The `PlaybackStateContext` provider was split into three (see §23):

| New context | Update frequency | Consumers |
|---|---|---|
| `PlaybackTransportContext` | start/stop only | TabView, SheetMusic |
| `RoundStateContext` | ~1× per measure (isOddRound flip) | SheetMusic, TabView |
| `TransitionOverlayContext` | only during transitions | SheetMusic |

Why this matters: without the split, the monolithic context's value object invalidated on every measure tick because isOddRound flipped. Every consumer re-rendered. The layer memos still cache-hit on prop equality, BUT React still has to do the shallow compare on each layer at each tick. Worse, anything inside SheetMusic that DID consume isOddRound (the visibility derivations for OLD layer) re-rendered the SheetMusic body — invalidating the JSX tree React diffs against and forcing the layer memos to re-evaluate their props.

With the split, SheetMusic still re-renders when isOddRound flips (it consumes RoundStateContext for `actualTreble` / `actualBass` / `actualPercussion`), but `PlaybackTransportContext` consumers don't, and `TransitionOverlayContext` consumers (only `PreviewOverlay` paths) don't either.

### 29.4 Invariants — must hold

- `MelodyNotesLayer`, `ChordLabelsLayer`, `BarlinesLayer`, `PreviewOverlay` produce **identical DOM** to the inline calls they replaced. `useSheetMusicHighlight` reads `data-measure-index` / `data-mel` / `data-local-slot` / `data-pagination-new` / `data-wipe-role` attributes via `querySelectorAll` and ancestor walks. Any layer-component refactor must preserve those attrs.
- `PreviewOverlay` mounts and unmounts based on `showWipePreview`. `useSheetMusicHighlight` caches `[data-pagination-new]` and re-resolves via `isConnected` check, so the mount/unmount transition is safe.
- The pure builders (`renderSingleChordLabel`, `iterMeasureLines`, `renderOneMeasureRepeatSymbols`) must remain free of closure capture. Adding a hidden dependency on a parent value would make the memo stale.
- The legacy `usePlaybackState()` aggregator hook in `PlaybackStateContext.jsx` must keep merging all three new contexts so any old caller (or test) sees the same shape.

### 29.5 Files

**New:**
- `src/components/sheet-music/MelodyNotesLayer.jsx`
- `src/components/sheet-music/ChordLabelsLayer.jsx`
- `src/components/sheet-music/BarlinesLayer.jsx`
- `src/components/sheet-music/PreviewOverlay.jsx`
- `src/components/sheet-music/renderOneMeasureRepeatSymbols.jsx`
- `src/contexts/PlaybackTransportContext.jsx`
- `src/contexts/RoundStateContext.jsx`
- `src/contexts/TransitionOverlayContext.jsx`

**Modified:**
- `src/components/sheet-music/SheetMusic.jsx` — inline calls replaced; `_iterMeasureLines` / `renderChordLabels` / `renderSingleChordLabel` / preview IIFE removed; `renderRepeatSymbols` delegates to the pure helper
- `src/contexts/PlaybackStateContext.jsx` — now a backwards-compat aggregator hook (Provider removed)
- `src/App.jsx` — three nested providers replace the single `PlaybackStateProvider`
- `src/components/layout/TabView.jsx` — `usePlaybackState()` → specific hooks

### 29.6 Rejected alternatives

- **SVG → Canvas/WebGL.** Not the bottleneck. The cost is JS-side layout/JSX (beaming, stem direction, accidental maps), not pixel rasterisation. ~20 h effort, loses free hit-testing (note-click via `data-notes`), CSS-class animations, and accessibility. **No.**
- **`noteWidth` as a percentage.** One division per render; the derived note-x positions are the cost. Marginal. **Not the fix.**
- **Total redesign of SheetMusic.** Scope explosion without a targeted change. **No.**

---

## 30. Fermata — Song-level events, audio shift, visual sync (2026-05)

**Purpose:** held notes (fermata) extend their playback duration AND delay every subsequent note in every track. Visual rendering keeps natural offsets + a glyph on top, so the static page reads as a normal note with a fermata symbol while audio and the moving cursor honour the hold.

**Data model.** Per-difficulty in song JSON:

```json
"fermatas": [{ "tick": 216, "hold": 18 }]
```

`loadSong.js` copies this array onto every track's Melody (`treble.fermatas`, `bass.fermatas`, `percussion.fermatas`, `chordMelody.fermatas`) so each track's `playMelodies` call sees the same events. The format is **tick-based**: events fire at the absolute tick of the fermata-ed note, independent of track or note indexing.

**Audio shift logic (`playMelodies.js`).** Per note:
- `shift` = sum of `f.hold` where `f.tick < note.offset` (cumulative delay).
- `extraHold` = sum of `f.hold` where `f.tick === note.offset` (this note IS the fermata-ed one).
- Audio time = `adjustedStart + (relativeTick + shift) * timeFactor`.
- Audio duration = `(natural duration + extraHold) * timeFactor`.

Subsequent notes (offset > fermata tick) all shift uniformly — no "ring through" overlap with the next phrase.

**Visual cursor sync (`Sequencer.js` `schedNotes` + `buildScheduledChords`).** Both apply the same per-note shift + duration extension so `scheduledNotes` (= source-of-truth for `useSheetMusicHighlight`'s note-active highlight) lines up with audio. Without this the cursor raced ahead on natural time during the held note. **Invariant:** `audioTime` and `duration` written to `scheduledNotes` MUST equal what `playMelodies` actually schedules. If you add a new audio shift mechanism, mirror it in `schedNotes`.

**Iteration extension (`Sequencer.js`).** After the inner measure loop, `nextStartTime += totalIterationFermataHold * timeFactor`. Without this the next iteration's m=0 starts at the natural end of iteration N while the fermata-extended audio is still ringing into the future — repeats had an inter-iteration gap. Now iteration N+1 starts exactly when N's audio actually ends.

**Visual glyph.** `SheetMusic.jsx` `renderFermataGlyphs` draws Maestro `U` (SHIFT+u, arc-down) above the staff at the fermata note's x-position. Future: detect stem direction and swap to lowercase `u` (placed below) for stem-up notes — Han's stated convention.

**Files:**
- `src/songs/loadSong.js` — parses + propagates the array.
- `src/audio/playMelodies.js` — audio shift + duration extension.
- `src/audio/Sequencer.js` — `schedNotes` shift + `buildScheduledChords` shift + iteration boundary extension.
- `src/utils/melodySlice.js` — slices carry the song-level fermatas array unchanged (tick-based events are global).
- `src/components/sheet-music/SheetMusic.jsx` — `renderFermataGlyphs`.

**Cross-references:**
- §22.9 — fermata + tuplet interaction.
- §31 — in rubato mode the fermata's hold is ignored (Han 2026-05-29 decision: rubato is user-driven; the held note is just another note advance). The audio shift logic still applies in time-driven playback.

---

## 31. Rubato Mode — User-driven tempo (2026-05)

**Purpose:** turn off BPM-driven playback and let the user advance the melody note-by-note via bottom-pane input. Background tracks fill the time between advances using an EWMA-estimated BPM.

**State.** `useAppUIState.isRubato` (with `isRubatoRef` for non-React reads). Toggled via the tempo-picker dropdown (`SheetMusic.jsx` tempo picker) which appends "rubato" with the Maestro `T` glyph. Enabling rubato also activates `inputTestSubMode='note'` on the next Play press so the bottom-pane keyboard drives advances.

**Play interception (`App.jsx`).** When `isRubato=true`, the Play This / Repeat / Continuously buttons skip `sequencer.start` and instead call `rubatoEngageRef.current` which toggles input-test mode + sets sub-mode 'note'. The user then taps notes via piano / percussion / chord tab.

**Correct-note flow (existing `useInputTest`).** `handleInputTestNote` already matches input against `melodiesRef.current[activeStaff].notes[activeIndex]`; correct → advance index + flash green; wrong → red `inputTestState.status='error'`. Audio plays via `onNoteCorrect(note, dur)` → `instruments.treble.start({note})` then scheduled stop after `dur * 5000/bpm` ms.

**Predictive accompaniment (PR-D, `App.jsx`).** When the correct note advances treble in rubato:
- `rubatoEventHistoryRef` stores `{ wallTime, offset }` for the last 8 advances.
- `estimateRubatoTps()` returns an EWMA over `(Δticks / Δseconds)` across consecutive pairs (`alpha=0.6`, recent-weighted). First two advances fall back to `bpmRef.current / 5`.
- `scheduleRubatoAccompaniment(currentOffset, nextOffset)` calls `playMelodies` with bass + percussion + chord tracks and a `tickRange = [currentOffset, nextOffset)` so only the notes belonging in that rubato-window get scheduled, at the estimated BPM.

**Scroll-mode cursor (PR-E, `useSheetMusicHighlight.js`).** When `rubatoScrollAnchorRef.current.isActive`, `runScrollAnimation` bypasses its time-based formula and reads `pageFraction` directly. Each correct advance sets `pageFraction = nextOffset / (numMeasures * measureLengthTicks)` — cursor eases toward the next expected note at 12%/frame (~170ms critically-damped glide). Flip-off clears `isActive` + `rubatoEventHistoryRef` so the next session starts fresh.

**Cycle-break ref.** `onNoteCorrect` is defined in the useInputTest config object whose destructure happens AFTER the callback's useCallback (= `inputTestStateRef` is in TDZ at that point). `rubatoInputStateRefForwarderRef` is a small App-owned ref populated by a useEffect after useInputTest mounts; the callback reads through it at call time.

**Hidden-notes rubato.** Covered by existing `playbackConfig.oddRounds.notes` toggle — the user can turn note glyphs off and still get green/red feedback via `inputTestState`. No separate code path.

**Long-list (deferred):** microphone input (reuse `usePitchDetector`), MIDI keyboard via Web MIDI API. Both feed into the same `handleInputTestNote` once wired.

**Files:**
- `src/hooks/useAppUIState.js` — `isRubato` + setter + ref.
- `src/components/sheet-music/BpmControls.jsx` — `q = T` display when rubato.
- `src/components/sheet-music/SheetMusic.jsx` — tempo-picker "rubato" entry.
- `src/App.jsx` — rubato engage interceptor, accompaniment EWMA, scroll anchor.
- `src/hooks/useSheetMusicHighlight.js` — rubato scroll branch in `runScrollAnimation`.
- `src/contexts/AnimationRefsContext.jsx` — propagates `rubatoScrollAnchorRef`.

---

## 32. Beat-size derivation — `noteGroupSize` (2026-05)

**Purpose:** `processMelodyAndCalculateSlots` splits notes that cross beat boundaries. The beat size (= `noteGroupSize`, ticks per count) needs to match the meter's natural beat.

**Rule (Han 2026-05-29 fix).** In `SheetMusic.jsx`:
```js
const isCompound = (tsDen === 8 || tsDen === 16) && tsNum > 3 && tsNum % 3 === 0;
const noteGroupSize = isCompound ? 3 * denomTicks : denomTicks;
```

Compound time (6/8, 9/8, 12/8) → beat = dotted-quarter (3 × denomTicks). Everything else (simple time including 3/4, 3/8) → beat = one denominator unit.

The previous heuristic `measureLengthSlots % 18 === 0 ? 18 : 12` mis-classified 3/4 as compound because 3/4's 36-tick measure is divisible by 18. The result: three quarters in 3/4 m1 rendered as `q + (e tied to e) + q` because the middle quarter crossed the false 18-tick boundary at offset 54. Han reported this on the HBD hard bass.

**Files:** `src/components/sheet-music/SheetMusic.jsx`.

---

## 33. N.C. (No Chord) Support (2026-05)

**Purpose:** songs can include "no chord" passages — typically anacruses or fermatas where the harmony is implied/silent.

**Data model.** Chord entry in song JSON:
```json
{ "offset": 0, "duration": 36, "notes": [], "root": "", "type": "nc", "name": "N.C." }
```

`loadSong.js` recognises `type === 'nc'` and constructs a placeholder Chord with empty root/notes. Audio happens to skip these for free because the empty `notes` array trips `playMelodies`' existing `items.length > 0` gate.

**Display.** `ChordLabelsLayer` renders literal "N.C." in italic serif when `chord.type === 'nc'`, instead of the root + suffix layout.

**Open (deferred):** generator fallback for melody pitch-pool during N.C. — Han's spec is "previous chord → next chord → tonic 1-3-5 triad". Not yet implemented because no generated song uses N.C.; for loaded songs the chord progression is given.

**Files:** `src/songs/loadSong.js`, `src/components/sheet-music/ChordLabelsLayer.jsx`.

---

## 34. Anacrusis (Pickup Measure) Detection (2026-05)

**Purpose:** songs starting with a pickup (= rest before first note in m0) should suppress the m0 measure number AND number subsequent measures as if the pickup were "m0".

**Detection (App.jsx).** `anacrusisMeasureIndex = useMemo(() => trebleMelody?.offsets?.[0] > 0 ? 0 : null, [trebleMelody])`. Re-runs on any trebleMelody identity change.

**Display (BarlinesLayer.jsx).** When `(bms - 1) === anacrusisMeasureIndex` (= the leftmost displayed measure IS the song's pickup):
- The number label is omitted while the start barline / repeat marker stays.
- `measureLabel(localIndex)` subtracts 1 from the displayed N for ALL labels in the block — so m1 reads "1" not "2", m2 reads "2" not "3", etc.

The `(bms - 1)` adjustment handles the 1-indexed bms versus 0-indexed anacrusisMeasureIndex mismatch.

**Files:** `src/App.jsx`, `src/components/sheet-music/SheetMusic.jsx`, `src/components/sheet-music/BarlinesLayer.jsx`.

---

## 35. Settings Overlay — Keep-alive Zones (2026-05)

**Purpose:** clicking interactive controls (subheader buttons, BPM controls, repeat controls) should NOT close the settings overlay. Only clicks on neutral sheet-music space close it.

**Mechanism (`useSettingsOverlay.js`).** A document-level `pointerdown` capture-phase listener closes the overlay unless the target's `closest('.settings-overlay')` OR `closest('[data-settings-keepalive]')` returns non-null.

**Keep-alive zones:**
- `SubHeader.jsx` outer `<div data-settings-keepalive="">`.
- `BpmControls.jsx` outer `<g data-settings-keepalive="">`.
- `RepeatsControls.jsx` outer `<g data-settings-keepalive="">`.

Without these, clicking a sheet-music button caused the overlay to flash closed (pointerdown) then re-open (button onClick re-toggle), making the action feel like a dismiss instead of a toggle.

**Note clicks on the staff** stay outside the keep-alive — clicking a note WILL close the overlay (intended).

**Files:** `src/hooks/useSettingsOverlay.js`, `src/components/layout/SubHeader.jsx`, `src/components/sheet-music/BpmControls.jsx`, `src/components/sheet-music/RepeatsControls.jsx`.

---

## 36. Sequencer Stop — Soft Mute (2026-05)

**Purpose:** when playback ends or user presses Stop, the release-tail of the last note should ring naturally and subsequent click-to-play interactions should still produce audio.

**Mechanism.** `Sequencer.stop()` calls `instrument.stop()` (= releases playing voices with their soundfont's `ampRelease`, ~0.3–1.0s tail) and aborts pending scheduling. It does **NOT** hard-mute the instrument's output channel.

Previously a `setVolume(0)` was applied BEFORE `.stop()` so the release tail played silently, but the channels stayed muted afterwards — Han's "geen audio na het klikken op een noot/akkoord na 1x afspelen" symptom. Removing the hard-mute restored click-to-play and made stops feel less brutal.

The `abortController` + `instrument.stop()` combination still honours the "no new notes" intent — no new audio is scheduled, and any already-scheduled-but-not-yet-started notes won't sound. Only the currently-sounding voices' release tails ring through.

**Files:** `src/audio/Sequencer.js`.

---

## 37. Visual Settings Re-haul — Context Overlays (2026-05, in progress)

**Purpose.** Han is migrating the app away from a central settings panel toward
**context overlays**: every setting is adjusted in-place by interacting with the
element it affects (tap a clef → clef overlay, tap the staff → range overlay,
tap a key → keyboard-side overlay), with minimal text. GSM-portrait is the first
(and currently only) target layout: three stacked panels — header (title + nav +
exercise score), top half = sheet music, bottom half = input/keyboard.

**Decided principles (validated with Han, treat as invariants for this work):**

1. **Two UIs per setting where meaningful.** Each setting gets a *bladmuziek*
   (sheet) variant and an *input* (keyboard) variant. Intrinsically abstract
   settings (theme, BPM, generation, animation mode) have no natural sheet/key
   representation and live in a neutral HTML chrome panel instead — do not force
   a fake "note version" for those.
2. **Spatially-anchored selectors render in their native coordinate space, not
   in a floating HTML layer.** The range/clef/scale selectors must align exactly
   with staff lines / piano keys, so:
   - the **sheet variant renders inside the SheetMusic SVG** (same pattern as the
     existing `SettingsOverlay` `<g>`, reusing the functions that place real
     noteheads), and
   - the **input variant renders inside the keyboard component** (reusing key
     positions).
   A thin HTML overlay is used **only for chrome** (title, preset chips, close,
   coach-tour) that floats above and needs no pixel alignment.
3. **Dual-surface live sync.** On GSM-portrait the staff (top) and keyboard
   (bottom) are both on screen. While editing a spatial setting, *both* surfaces
   are in edit mode simultaneously and stay synchronised: dragging the range on
   the staff lights up the matching keys, and vice-versa. This is what makes the
   transition seamless — the staff and keyboard *become* the selector and return
   to normal afterwards, rather than being covered by a panel.
4. **Animation respects existing invariants.** Morphs between "real notes" and
   "selectable notes" happen in the same SVG coordinate space via
   `element.style.opacity` in rAF (per §6), never via JSX opacity props, and must
   not interfere with the pagination/wipe/scroll transition system.
5. **Discoverability via a one-time coach-tour** (Han's choice) plus subtle
   affordances, given the minimal-text goal. The old central settings panel is
   removed **last**, only after each setting's new variant(s) are proven — no
   feature is lost mid-migration.

**Build order.** Range is the first vertical slice (clearest spatial example) and
serves as the blueprint pattern for all later settings (clef/instrument → scale →
exercise/song → advanced generation → visualization).

**Range-edit ↔ playback are mutually exclusive (Han 2026-05-30).** While
`rangeEditMode` is on, the staves are blank canvases: the entire
`notes-transition` group is hidden via `display:none` (kept mounted so transition
refs stay valid), so NO melody notes / chords / lyrics render. Opening the
overlay (`handleToggleRangeEdit` in App.jsx) calls `handleStopAllPlayback`;
starting any playback closes the overlay via a `useEffect` on `isPlaying`. There
is no feedback loop because closing range-edit never starts playback.

**File organisation.** All sheet-music context overlays live under
`src/components/sheet-music/overlays/`. New context overlays go there too.

### 37.1 Range selector — current implementation (first proven slice)

The range selector is the first fully-built vertical slice and the blueprint for
later settings. It has **two surfaces** (per principle 1), both driven by the same
range state and the same shared write path. Full detail (with rationale and known
rough edges) lives in `docs/range-overlay-design.md`; this is the authoritative
high-level summary.

**Shared model (`src/utils/rangeUtils.js`).** One source of truth for every range
surface (sheet, keyboard, steppers), §6c:
- `naturalsInRange(lo,hi)` — white-key naturals in a MIDI span.
- `windowNaturals(selMin,selMax,context)` — a **boundary-relative window**: every
  natural between the boundaries plus `context` naturals beyond each side, capped
  to the piano (A0–C8). This is what makes both surfaces symmetric (N below min …
  N above max) and lets a boundary be dragged *outward past the old ±octave
  limit* — on release the window re-anchors and reveals fresh context.
- `applyRangeBoundary(prevRange,midi,bound,presets)` — clamp (`clampRange`: min
  span 12, bounds 21–108) + preset-mode match. The ONE boundary write path.

**Sheet variant — `RangeStaffOverlay.jsx`** (a `<g>` in the SheetMusic SVG). The
selectable pitches are a synthetic rhythm-less melody rendered through the real
`MelodyNotesLayer`/`renderMelodyNotes` (reuses ledger lines, ottava, notehead
glyphs — §6c; no hand-rolled pitch→Y). Key behaviours:
- **`buildRangeRow`** (pure, tested) lays out the row from `windowNaturals`. When
  the window is too cramped (`avail/W < MIN_NOTE_WIDTH`) it COLLAPSES the in-band
  middle (the notes deep between the boundaries, never the drag target) into a
  diagonal "…", keeping `KEEP_IN` naturals beside each boundary. The gap is
  expressed as dummy slots in `allOffsets` so the index-based renderer
  (`x = startX + (idx-1)*noteWidth`) draws it for free; `colMidi` maps x→pitch
  across the gap. `MAX_NOTE_WIDTH` caps spacing so a small window isn't sparse.
- **Interaction:** the whole hit band is a `<polygon>` with pointer-capture; a tap
  or drag sets the nearest boundary (white-key snap) via `setMelodicBoundary` →
  `applyRangeBoundary`. The layout is frozen in `dragRef` during a drag so notes
  don't jump; `onUp` calls `forceReanchor()` (a `useReducer` bump) so the window
  re-anchors and 3 fresh context notes reappear each side.
- **Hit zones meet exactly:** each staff's zone has a HORIZONTAL outer edge at the
  topmost/bottommost note ± `BAND_COVER` (covers the 8va/8vb markers) and a shared
  diagonal `divider` (midpoint of the two note rows) as the inner edge, so the
  treble and bass zones touch without overlapping.
- **Coloring (single layer, one ottava — Han 2026-06-01):** the whole row renders
  as ONE `MelodyNotesLayer` with a per-note color override (`previewColorFn` prop on
  `renderMelodyNotes`): boundary → `--accent-yellow`, in-band → live
  `noteUtils.melodicNoteColor`, out-of-band → `--text-dim`. Rendering one layer (not
  one per color) means the ottava (8va/8vb) is computed ONCE over the row — fixes the
  earlier multi-ottava bug (§6b) where per-color layers each drew their own bracket.
- **Presets:** bracket-only (no text), nested `]` shapes in the reserved right
  margin (`PRESET_AREA_WIDTH`); active one highlighted. Percussion shows every kit
  pad as its own per-pad hit box (biased toward the stem so it covers it) and
  BASIC/STANDARD/FULL preset brackets that toggle `enabledPads`.
- In rangeEditMode the repeat barlines + `RepeatsControls` are suppressed and a
  plain `mode="regular"`, `numRepeats=1` `BarlinesLayer` is rendered. The earlier
  HTML scaffold (`RangeOverlay.jsx`) was retired (D4).

**Keyboard variant — `KeyboardRangeSetter.jsx`** (TabView swaps it in for the
playable `PianoView` in rangeEditMode, on the treble/active piano tab AND the bass
`keys-bottom` tab — one component per keyboard). A **split layout**, top→bottom:
1. **Six preset brackets on three shared rows** (`⊓`, no text) —
   `buildPresetBracketRows` (pure + tested). All six presets are shown: G-clef
   STD/LARGE/FULL and F-clef STD/LARGE/FULL. To save vertical space (Han 2026-06-01)
   the two clefs SHARE three rows by SIZE (FULL on top, then LARGE, then STANDARD).
   On each row the CURRENT clef's bracket is "front" (highlighted: active=yellow,
   else `--text-primary`), the other clef's is "behind" (dimmed `--text-dim`,
   opacity 0.5, drawn first); where the behind bracket would overlap the front one
   it is truncated and an "…" drawn at the cut. Selecting the other clef swaps
   front/behind. Horizontal extent is ALIGNED to the selector white-key grid at the
   preset's real pitch range (larges overlap). **Tapping a bracket sets BOTH
   `preferredClef` and `range`** on THIS staff — so the bracket IS the clef switcher
   (replaces the old separate `onSwitchClef` row). Presets fully outside the window
   are dropped; partial ones clamp to the edge. Selector PianoView uses `hideLabels`.
2. A COMPACT windowed **selector** keyboard (a small `PianoView` over
   `windowNaturals`) CENTRED ON THE SELECTION, sized so each white key is ≈ `KEY_PX`
   (20px) — the key count is width-adaptive via a `ResizeObserver` (wider panel =
   more keys; Han 2026-06-01). Centring on the selection means a clef switch (via a
   bracket) slides the window so the newly-selected notes stay central; off-clef
   brackets may then fall partly/fully off-screen. A band + edge handles mark the
   selection; an SVG overlay (`viewBox="0 0 nWhite 100"`, 1 unit/white key) owns the
   pointer interaction (x → white-key index via its bounding rect). Same
   freeze-during-drag + re-anchor-on-release as the sheet. Boundary drags match the
   CURRENT clef's presets for the `rangeMode` label.
3. The REAL playable keyboard limited to the selected min–max (shows & plays the
   actual keys).

**Invariants.** Both surfaces bind to the same range state and write via
`applyRangeBoundary` only — never re-implement the clamp/preset rules. The window
is the only thing that defines "how far you can drag in one grab"; never re-add a
fixed ±octave extent. Boundaries snap to naturals (white keys) on both surfaces.

**Boundary slide animation (sheet, Han 2026-05-31).** Moving a melodic boundary
no longer jumps — it *slides*. The yellow boundary note stays roughly in place
while the row rebalances and a fresh context note swipes in/out at the far edge;
8va/8vb ride along (they live inside the animated body group). Pure step logic in
`overlays/rangeSlide.js` (+ test); driven from `RangeStaffOverlay.jsx`.
- **Stepper** (replaces the instant `forceReanchor` snap): a press starts a
  cadence of one natural per `STEP_MS` (250 ms) toward the pressed column
  (`nextNaturalToward`). A **tap** fires a burst that finishes even after release;
  **press-and-hold** keeps extending the boundary OUTWARD (`nextNaturalInDir`)
  until release (release = stop now). While holding, the stepper advances its
  `target` together with `live` so it keeps moving outward instead of wobbling back
  toward the original pressed note (Han 2026-06-01 fix). Moving past `DRAG_THRESHOLD`
  (8 SVG units) promotes to the existing live **drag** (layout freezes, follows the
  finger, re-anchors on release). All writes still go through the shared
  `setMelodicBoundary` → `clampRange` path (§6c). 250 ms cadence + 250 ms tween =
  back-to-back chain, no pause ("faster when further" = the chain, not a shorter
  per-note duration).
- **Slide** (`classifyStep` + a `useLayoutEffect` rAF tween): each render compares
  the window extent `{loIdx,hiIdx}` to the remembered one. A clean ±1 change →
  `enter` (one context note revealed) or `leave` (one hidden), opposite side
  `anchor`ed; anything else (presets, drag-release jumps, collapsed-ellipsis
  layouts) → instant snap. On a step the body `<g>` scales `prevWidth/newWidth → 1`
  about the anchored edge while the single edge note translates ±`noteWidth` and
  fades. The tween is **linear** (constant velocity) so a multi-step burst reads as
  one continuous glide rather than a pulsing chain of ease-out steps (Han 2026-06-01).
  **All transform/opacity is set via `element.setAttribute`/`element.style` in the
  rAF callback, never JSX props (§6).** The effect runs in a `useLayoutEffect` placed
  BEFORE the component's early `return null` (rules-of-hooks). Timers + rAF cancel on
  unmount; the committed `{min,max}` is identical to the old instant path at every step.

**Keyboard slide-stepper (Han 2026-06-01).** The keyboard setter's selection band
now animates like the sheet: it reuses `rangeSlide.js` (`nextNaturalToward`,
`nextNaturalInDir`, `STEP_MS`). A tap bursts one white key per 250 ms toward the
pressed column; a hold keeps extending outward (target advances with live so it
doesn't wobble); moving > `KBD_DRAG_PX` (10 px) promotes to a live drag. The window
freezes for the whole gesture and re-anchors when the burst finishes / on release.
The yellow band + handle rects carry a CSS `transition: x/width 0.25s linear`
(`.kbd-range-band`) so each step GLIDES between key positions instead of snapping.

**Enter/exit morph (Han 2026-06-01) — `useRangeMorph.js`.** Toggling RANGE or CLEF
plays a 1.5 s (`MORPH_MS`) morph between the sheet melody (`.notes-transition`) and
the active overlay (`.range-overlay` / `.clef-overlay`): the OLD group just fades
(opacity 1→0); the NEW group FLIES IN from the right. **Staggered per-element fly-in
(Han 2026-06-01 #3):** instead of sliding the new group as one block, the hook
collects each note-like element (`[data-mel]` on the real melody; `[data-fly]` on
overlay elements), orders them by `getBBox().x`, and gives each a start delay from
its x (leftmost at 0, rightmost at `STAGGER_MS`=500 ms); each element slides
`ELEM_MS`=1000 ms (translateX `endX`→0). The group itself fades in over
`GROUP_FADE_MS` so non-note elements (clefs/lines/barlines) just fade. Total =
`STAGGER_MS + ELEM_MS` = 1.5 s. Every fade + slide runs through a subtle
ease-in-out (`smoothstep`) for a soft start/stop (Han 2026-06-01 #4). The real
melody note groups AND the overlay note groups carry `data-fly` (added
unconditionally in `renderMelodyNotes`), so the range overlay's notes stagger too
(previously they slid as one block). If no per-element markers are found it falls
back to the old whole-group slide. The hook detects the mode flip in a `useLayoutEffect`,
returns `morphing` so SheetMusic keeps BOTH groups mounted+visible during the morph,
then runs a single rAF tween. **opacity/transform via `element.style` only (§6)**,
cleared at the end so the scroll/wipe systems own those properties again. Safe
because opening an overlay stops playback.

**Disabled staff (`preferredClef:'off'`, Han 2026-06-01 #3).** A staff whose clef
is the `off` sentinel: (a) generates NOTHING — `useMelodyState` returns an empty
`Melody` for that voice (skips `resolveVoice`); (b) shows NO elements — SheetMusic
feeds an EMPTY melody to its notes layer (`currentTreble/Bass` → `EMPTY_MELODY` when
off) so the staff renders normally (lines + clef) but with no notes, in every mode;
(c) is HIDDEN entirely in melody mode (`isTrebleVisible/isBassVisible` exclude an
off staff unless settings/clef/range mode keeps it visible so it can be re-enabled).

**Transposing-instrument colouring (Han 2026-06-07, #16):** the range-setter note
POSITIONS stay at concert pitch (height is correct as-is), but the chromatone/scale
COLOUR must follow the WRITTEN (transposed) note — exactly as the sheet, which
transposes note names (`renderMelodyNotes` → `transposeMelodyBySemitones`) and then
colours by `getNoteSemitone` of the transposed name. `RangeStaffOverlay` therefore
receives `trebleTrans`/`bassTrans` (the same `getTranspositionSemitones` value the
sheet's `MelodyNotesLayer` gets) and, for in-band notes only, colours via the
concert→written name map (`transposeMelodyBySemitones`). The yellow boundary handles
and grey out-of-band notes are NOT transposed (they're handles/context, not pitches
the learner reads). `trans=0` → no shift (unchanged behaviour).

**Still open / parked:** dual-surface live sync (the two surfaces share state but
don't live-mirror); keyboard ellipsis for very narrow windows; black-key boundary
precision; percussion keyboard setter; preset-bracket alignment on the keyboard is
approximate (clamps/hides presets outside the window). The legacy stepper
`RangeControls` is still used in settings-only mode (not range-edit).

**Files:** `overlays/RangeStaffOverlay.jsx` (+ smoke test), `overlays/
SettingsOverlay.jsx`, `controls/KeyboardRangeSetter.jsx` (+ `styles/
KeyboardRangeSetter.css`), `renderMelodyNotes.jsx` (exports `noteYMap`,
`getNoteAbsoluteY`, `percussionStemUp`, …), `SheetMusic.jsx` (`rangeEditMode` +
overlay render + staff keep-alive + coloring props), `theory/noteUtils.js`
(`melodicNoteColor`), `utils/rangeUtils.js` (`naturalsInRange`, `windowNaturals`,
`applyRangeBoundary`, `clampRange` — with tests), `controls/RangeControls.jsx`
(reuses `rangeUtils`), `layout/TabView.jsx` (swaps in `KeyboardRangeSetter`),
`App.jsx` (`rangeEditMode` state + playback wiring).

### 37.2 Clef selector — in-staff CLEF mode (Han 2026-06-01)

A second in-staff selector, sibling of the range selector, for choosing the clef
and transposing instrument **directly on the staff**. Opened by the `CLEF` button in
`SubHeader` (`onOpenClef`) OR by **clicking a clef glyph in the sheet**
(`onOpenClefEdit` → `App.handleOpenClefEdit`; this replaced the old tap-cycle +
long-press popup, which was deleted — Han 2026-06-01). Drives `clefEditMode`.
Mutually exclusive with range-edit and the settings overlay (each toggle clears the
others); opening stops playback. Reuses the **enter/exit morph** (`useRangeMorph`,
now triggered by `rangeEditMode || clefEditMode`) — the melody fades out and the
overlay flies in (and back on close). `SheetMusic` tracks `lastOverlayKind` so the
correct overlay stays mounted during an exit morph.

**Per visible melodic staff** (`ClefStaffOverlay.jsx`):
- **Left ~20% — family carousel.** FOUR clef FAMILIES (G / F / Vocal / Off) as
  glyphs: the current family leftmost + bright (`--accent-yellow`), the others lowlit
  (`--text-lowlight`). Each glyph is keyed by family id and positioned by a
  CSS-transitioned `transform: translateX` (`.clef-family-glyph`, 0.3s), so picking
  another family SLIDES the carousel L→R rather than jumping. Tapping a family writes
  `patchForFamily`. **Off** (a large drawn cross, `CLEF_OFF` sentinel) DISABLES the
  staff — `patchForFamily('off')` sets `preferredClef:'off'`; `calculateOptimalClef`
  short-circuits to `'off'` and `bassActiveClef` lets the sentinel through.
- **Right 80% — variants of the current family.** Melodic (G/F): octave chips
  (8 / 8va / 8vb / 15ma → `patchForOctave`, mapping to the existing
  `relative`/`relative_15a`/`relative_low` rangeModes) + transposition chips
  (B♭, E♭, F → `patchForTransposition`) and a final `…` chip opening the full
  transposing-instrument list (reuses the existing `transPicker` popup). Vocal:
  the six VOICES Bass / Baritone / Tenor / Alto / Mezzo / Soprano, each drawn as its
  real clef GLYPH (F-clef for Bass+Baritone, C-clef for the rest — Han: show clefs,
  not names). Bass and Baritone share the F-clef glyph but are distinct voices
  (different range), matched on `rangeMode` so the right one highlights;
  `patchForVocal(voice)` writes both `preferredClef` and the voice `rangeMode`. The
  vocal Bass voice is NOT the same as the instrumental bass clef family.

**Invariants.** Clef and transposing instrument stay **separate per-staff fields**
(`preferredClef`, `transpositionKey`) — the selector only writes patches onto them
via pure helpers in `overlays/clefSelector.js` (no hardcoded option tables in the
view; §6c). All option logic is pure + tested
(`overlays/__tests__/clefSelector.test.js`).

**Polish wave 4 (Han 2026-06-01 #14) — done:**
- **NOTATION** is the new name of the CLEF setter (SubHeader button label).
- **Active/passive colours unified across all setters.** ACTIVE option = NORMAL colour
  (`--text-primary`), PASSIVE = `--text-lowlight` at opacity 1 (greyed but solid) —
  replacing the old `--accent-yellow` active highlight. Applies to the clef
  families/variants/percussion options, `ChordStaffOverlay`, `ChordStyleOverlay`, and
  the `RangeStaffOverlay` preset brackets. The range boundary DRAG HANDLES stay
  `--accent-yellow` (they are handles, not a selectable option).
- **Clef CARDS in a SWIPE carousel** replace the plain variant chips for melodic G/F
  families (`ClefCardCarousel.jsx`). Each card = the family clef (`<ClefGlyph>`) + the
  3-note reference melody (`REF_NOTES`: C4 G4 C5 in G, C3 G3 C4 in F) rendered via
  `MelodyNotesLayer`; transposing cards TRANSPOSE the notes by `transpositionSemitones`
  (so the transposition reads instantly) and add a small `(B♭ inst.)` superscript. The
  strip order is octave cards (normal · 8va · 15ma) then every transposing instrument
  except concert C; cards past the window sit off-screen and SLIDE in on a horizontal
  drag. **Tap = select; drag = scroll** — disambiguated by movement (< `TAP_SLOP` user
  units = tap, routed to the card under the pointer). Offset is clamped (no loop);
  client px → SVG units via the owning `<svg>`'s screen CTM so drag tracks the finger
  1:1. Octave (`rangeMode`) and transposition (`transpositionKey`) stay ORTHOGONAL
  fields, so up to two cards read active at once; tapping an already-active transposing
  card toggles it back to concert C (the only strip path to reset transposition, since
  there is no dedicated C card). The old `…` full-list popup is superseded by the strip
  (the `onOpenInstrumentList` prop is now unused — `transPicker` removal is a follow-up).
  Vocal family keeps its evenly-spread voice-clef chips. **Files:** `ClefCardCarousel.jsx`
  (new), `ClefStaffOverlay.jsx` (card build + `ClefCard` + renderCard), `clefSelector.js`
  (`instrumentClefCards` now unused).
- **Clef carousel** shows EXACTLY N glyphs at rest (no resting lookahead — wrap copies
  for the slide live OUTSIDE the clip), spread evenly from `CLEF_GLYPH_X` (the active
  clef aligns with the sheet) to 90% of `startX`; a gentle 5%/95% edge fade replaces
  the old ~68% fade that dimmed the rightmost glyph.
- **Percussion preview** is centred (a leading sentinel offset in `allOffsets` puts the
  first note at the layer `startX`), the box around the notes is removed, and the
  SPLIT option is now true parallel-voice notation: hi-hats = 4 beamed eighths (RH/up)
  + kick+snare = QUARTER notes (LH/down), rendered as TWO `MelodyNotesLayer` voices on
  a shared x-grid with `percussionVoiceSplit` (the single-note RH/LH classifier forces
  each voice's stem direction).
- **Subtypes slide from the LEFT.** Variant chips carry `data-fly-from={startX}`;
  `useRangeMorph` emerges those elements from that x (a negative initial offset that
  slides them right into their slots) so the subtypes appear from UNDER the just-
  selected clef, instead of the default right-side fly-in.
- **Range extended chord** now shows ♭/♯ on its altered tensions (`D♭`/`A♯` — the
  renderer draws the accidental to the left of the notehead) and the chord row was
  raised (−86 → −108) so it clears the range-setter notes/handles below.

**Polish wave 3 (Han 2026-06-01 #5) — done:**
- The family carousel is now a true LOOP carousel (`overlays/ClefCarousel.jsx`):
  picking slot k slides the whole strip k steps left over an rAF tween; the strip
  renders the window + a lookahead copy so glyphs re-enter from the right, revealed
  under a right-edge linear-gradient **fade mask**; on completion `onPick` re-roots
  the order (picked item becomes active) and the strip resets. Carousel step widened
  to 36 units (clefs were too close) and the gutter clip/glyph hit rects are taller
  so bass clef descenders aren't clipped.
- Percussion clef block: the clef is now a 2-item carousel (percussion `/` ↔ X
  disable) at the SAME x as the sheet/melodic clef (`CLEF_GLYPH_X`); the X writes
  `percussionSettings.preferredClef='off'`, which hides the percussion staff in
  melody mode, feeds it an empty melody (no notes), and skips its generation
  (mirrors the melodic 'off'). The together/split toggler now renders the
  `[[k,c],hh,[s,hh],hh]×2` pattern with the REAL `MelodyNotesLayer` (proper
  notehead assets), not a tiny-font sketch.
- The morph OLD-group fade-out is now very short (`FADE_OUT_MS`=250 ms) while the
  staggered fly-in keeps its 1.5 s timing.

**Polish wave 2 (Han 2026-06-01 #4) — done:**
- Carousel glyphs are now the EXACT sheet clefs via the shared `<ClefGlyph>`
  (`sheet-music/clefGlyphs.jsx`, which also owns `clefSymbols` as the single source
  of truth — SheetMusic imports it). The current slot draws the concrete current
  clef (incl. ottava / `treble15va` etc.) at the real sheet position
  (`CLEF_GLYPH_X`, `baseY = staffStart+30`, fontSize 36); neighbours draw their
  family default clef. The static sheet clef is hidden in clef mode (no doubling).
  Glyphs entering on a family change SLIDE in from the right (transform transition),
  clipped to the gutter `[0, startX]` so they don't spill over the variant chips.

**Polish wave (Han 2026-06-01) — done:**
- The family carousel now lives in the **clef gutter, fully LEFT of `startX`**: the
  current family glyph sits at `GUTTER_X` (≈ the real clef position) and neighbours
  step right by `FAMILY_SLOT_W` up to `startX`, fading out as they approach it.
  Picking another family slides + fades (transform+opacity transition) for a true
  carousel feel (old glyph slides off-left & fades, new fades in from the right).
- Clef glyphs render at **true staff size** (`FAMILY_GLYPH_SIZE` 36). The static
  staff clef glyph AND the time signature are **hidden in clef-edit mode** (the
  carousel draws the clef in the gutter; `renderStaffMeasureTexts` is gated on
  `!clefEditMode` for all three staves).
- Octave variants render as the **full ottava CLEF GLYPHS** (clef + an italic 8/15
  marker above/below), not text chips (`OCTAVE_VARIANTS[*].glyph/ott`).
- **Percussion clef block**: the percussion clef glyph in the gutter (left) + a
  `[[k,c],hh,[s,hh],hh]`×2 mini-rhythm sketch rendered TWICE as a **together↔split
  toggler** (dots + stems; together = all stems up, split = RH↑/LH↓), driving
  `percussionVoiceSplit` via `onToggleVoiceSplit` (`setPercussionVoiceSplit` from
  `useDisplaySettings`). The SettingsPanel toggle still exists and shares the state.

**Disabled-staff rendering (resolved Han 2026-06-01 #3):** an 'off' staff now
renders normally but with no elements (empty melody), is hidden in melody mode, and
its generation is skipped — see the "Disabled staff" paragraph above.

**Files:** `overlays/ClefStaffOverlay.jsx`, `overlays/clefSelector.js` (+ test),
`SheetMusic.jsx` (`clefEditMode`, clef-click → `onOpenClefEdit`, overlay render,
`lastOverlayKind`, `'off'` in `calculateOptimalClef`/`bassActiveClef`; the old
in-popup clef list + `CLEF_RANGE_OPTIONS`/`applyRangeOption`/`getCurrentRangeValue`
were removed; clef glyph + time-sig hidden in clef mode; percussion clef block
wiring + `setPercussionVoiceSplit`), `hooks/useRangeMorph.js` (queries
`.range-overlay, .clef-overlay`), `layout/SubHeader.jsx` (CLEF button), `App.jsx`
(`clefEditMode` + toggle/open), `styles/App.css` (`.clef-family-glyph`
transform+opacity transition).

### 37.3 Chord selector — split across RANGE + CLEF (Han #6→#12)

The chord controls split into two pieces, each in the chord row above the treble
staff but in different setters (Han #12):
- **Complexity** → the RANGE setter (`ChordStaffOverlay`, rendered on `rangeMounted`;
  `.chord-overlay` is part of the 'range' morph surface). 5 chords drawn as REAL
  stacked whole-notes via `MelodyNotesLayer` (§6c reuse — NOT hand-rolled glyphs):
  tonic `[C4]`, power `[C4,G4]`, triad `[C4,E4,G4]`, seventh `[C4,E4,G4,B4]`, and
  "extended" = bright `[C4,G4]` + lowlit `[E4,B4]` (same column) + right-offset lowlit
  `[D4,F4,A4]`. Stored canonically (tonic→`root`, extended→`ninth`). Positioned at
  10/30/50/70/90% of the row width (avoids clipping).
- **Style/visualisation** → the CLEF setter (`ChordStyleOverlay`, on `clefMounted`;
  `.chord-style-overlay` is part of the 'clef' morph surface). X disable at startX,
  then real progression samples — letters `D− G7 C` @33%, roman `ii V7 I` @66% — in
  the SHEET chord-label font (root 26 / super 16 Georgia italic).
Reuse: `chordDisplayMode='off'` (X) options below:
- **X** → `chordDisplayMode='off'`: hides the labels (`chordsHidden` gates
  `actualChords`) AND mutes the audio (a `chordsDisabledRef` mirrors the mode into
  the Sequencer, which sets `chordVolume=0`). Chords are **still generated** (they
  inform the melody pitch pools) — Han confirmed: hide + don't play, but keep
  generating.
- **letters** → letter chords (D−, G7, C); **roman** → roman numerals (ii, V7, I).
The active option is highlighted; picking one writes `chordDisplayMode`. The
time-signature is hidden in any overlay mode (`!overlayEditMode`).

**Files:** `overlays/ChordStaffOverlay.jsx`, `SheetMusic.jsx` (renders the chord
overlay in `clefEditMode`; `chordsHidden`), `App.jsx` (`chordsDisabledRef`),
`audio/Sequencer.js` (chord-audio gate). `chordEditMode` + the CHORDS button were
removed.

### 37.4 Custom 22ma / 22mb clef marker (Han 2026-06-01 #6)

Maestro's font has pre-composited ottava glyphs only up to 15 (`Û`=15ma etc.) — no
22. So `clefGlyphs.jsx` adds `treble22va/22vb` + `bass22va/22vb` to `clefSymbols`
(`ottava:'22'`) and a CUSTOM `<Ottava22>` composite: an italic-bold serif "22" + a
small superscript "ma"/"mb". IMPORTANT: it must NOT use `fontFamily="Maestro"` —
Maestro maps ASCII digits/letters to MUSIC glyphs (PUA), so "22ma" in Maestro
rendered unreadable symbols (the 22mb-invisible bug, Han #8); a normal text font is
required. `ClefGlyph` renders `ottava:'22'` via `Ottava22` (other ottavas keep the
baked-in font glyph). The 22 clefs aren't wired as a selectable option yet
(generation maxes at 15ma) — this provides the renderable ASSET for when ±22 is added.

### 37.6 Selector layout polish (Han 2026-06-01 #8)

- **ClefCarousel** now fades at BOTH edges (a left+right linear-gradient mask) so
  glyphs ease in from the right without hard-clipping at the sheet's left start, and
  it caps the number of shown glyphs to the gutter's capacity (fixes "4 percussion
  clefs shown for a 2-option toggle"). The morph hook (`useRangeMorph`) resets inline
  styles on interrupt so rapid re-toggling never leaves a group stuck (re-arm bug).
- **Variant clefs** (octave/vocal options) render as TRUE-SIZE `ClefGlyph`s
  distributed evenly across `startX…endX`, not small boxed chips.
- **Chord row**: an X disable cross at `startX`, then letters@33% / roman@66%
  rendered like real chord labels (no boxes).
- **Percussion block**: the clef is a 2-item carousel (`/` ↔ X) aligned to the sheet
  percussion clef x (18) and clickable (transparent hit rect); the together/split
  toggler renders the `[[k,hh],hh,[s,hh],hh]` EIGHTH-note pattern as two compact
  bundles centred at ~33%/66%.
- The disable **cross** is 2× taller than wide (spans the staff) everywhere
  (clef gutter, percussion, chord row).

### 37.7 Chord complexity row + range divider fix (Han 2026-06-01 #9)

- **Chord complexity row** (`ChordStaffOverlay`): a second sub-row above the
  visualisation row offers 5 chords drawn as stacked Maestro noteheads —
  **tonic / power / triad / seventh / extended** — spread across `startX…endX`.
  Picking one writes `chordSettings.complexity` using CANONICAL values
  (tonic→`root`, extended→`ninth`) so the existing PlaybackSettings complexity
  stepper and the generator agree; `generateChordOnDegree` also aliases
  `'tonic'`→root and `'extended'`→ninth defensively.
- **Range hit-zone divider fix**: the treble/bass drag zones previously met at the
  midpoint of the two NOTE ROWS, which move with the selection — a high bass range
  pulled the divider (and the bass zone's top edge) up INTO the treble staff
  (overlap, Han #9). The divider is now anchored to the fixed gap between the staves
  (`(trebleStart + STAFF_H + bassStart) / 2`), so the zones always meet between the
  staves regardless of the selection.

### 37.8 Real-notehead chords + sliding 'legacy' settings (Han 2026-06-01 #10/#11)

- **§6c reuse**: the chord complexity row now renders via `MelodyNotesLayer`
  whole-note chords (see §37.3) instead of hand-rolled glyphs; the clef-view
  percussion mini-melody runs through `processMelodyAndCalculateSlots` +
  `MelodyNotesLayer` so its 4 eighths BEAM into one group.
- **Morph re-arm on surface switch**: `useRangeMorph` is keyed on the current
  SURFACE kind (`'range' | 'clef' | 'legacy' | 'melody'`), so switching directly
  between overlays re-animates each time. `groupsForKind` maps each kind to its
  group(s) — range = `.range-overlay` + `.chord-overlay`; legacy = `.settings-overlay`.
- **Legacy settings surface**: the old settings overlay is no longer a floating
  overlay — it's the sliding **'legacy'** surface. `overlayKind` becomes `'legacy'`
  when `showSettings`; it's gated on `legacyMounted` and animates exactly like
  clef/range (the melody flies out, the settings rows fly in). It shares the
  `overlayEditMode` treatment (melody hidden, time-sig hidden, end barline at endX).
  **It opens ONLY via its own SubHeader `SETTINGS` button** (`onOpenSettings` →
  `App.handleToggleSettings`, mutually exclusive with clef/range). Clicking the sheet
  no longer opens it (`openSettingsIfClosed` is now a timer-only no-op;
  `handleSheetMusicClick` only CLOSES it) — Han #13, goal: deprecate later.
- **Chord-style sample** matches the sheet chord label exactly (`ChordStyleOverlay`):
  plain serif (NOT italic), with the minor "−"/"7" as a raised superscript tspan
  (root + super), mirroring `ChordLabelsLayer`.
- **Percussion clef bundle beaming**: rendered through `processMelodyAndCalculate
  Slots` + `MelodyNotesLayer` with a `[1,2]` (odd-numerator) measure so the beam-span
  logic keeps all 4 eighths in ONE beam instead of splitting an even measure 2+2.

### 37.4a Dual-surface + ghost staff (Han 2026-06-01 #7)

- **Clef-on-sheet ⇄ range-on-keyboard.** When the SHEET clef selector is active
  (`clefEditMode`), the bottom keyboard tabs show the `KeyboardRangeSetter` (TabView
  swaps it in for `rangeEditMode || clefEditMode`), so editing the clef on the sheet
  pairs with editing the range on the keyboard.
- **Ghost staff.** In any settings/edit view (`showSettings || rangeEditMode ||
  clefEditMode`) a DISABLED staff (`preferredClef==='off'`) is STILL shown, but its
  notes + clef glyph render at `GHOST_OPACITY` (0.4) while the staff lines + barlines
  stay at full opacity. Interacting with the staff's options (the clef carousel / the
  percussion X) re-enables it. Outside settings views a disabled staff stays hidden,
  so ghosting only applies while a setter is open. (Restoring the EXACT prior clef on
  re-enable is a refinement; re-enable currently sets a sensible default clef.)

### 37.5 Playback / Exercise setters — DESIGN (Han 2026-06-01 #7, not yet built)

Two further in-staff setter modes, mirroring clef/range and ghost-aware. They
surface the existing `playbackConfig` (App `configRef`) which holds: global
`repsPerMelody`, `totalMelodies`; and PER-ROUND (`oddRounds`/`evenRounds`)
per-voice **volume** (`treble`/`bass`/`percussion`/`chords`/`metronome`, 0–1) +
**visibility** (`trebleEye`/`bassEye`/`percussionEye`/`chordsEye`) + a `notes` flag.
`numMeasures` + `musicalBlocks` are App-level.

**EXERCISE setter (global / song-level)** — values that aren't per-staff, drawn
above the system (or in a header strip), not in a staff gutter:
- **#measures** (`numMeasures`) — a stepper / number picker.
- **#repeats** (`repsPerMelody`) — stepper.
- **total melodies** (`totalMelodies`, −1 = endless) — stepper / ∞ toggle.
- (later) difficulty level / progression already live in their own tab.

**PLAYBACK setter (per-staff × per-round)** — each staff (treble, bass, percussion,
+ chords & metronome as pseudo-rows) gets, in its gutter / right margin:
- an **eye** toggle (visibility = `*Eye`),
- a **volume** control (audibility = the 0–1 number) — a small vertical slider or a
  stepped speaker (mute / soft / mid / loud), reusing the existing volume-picker.
- A **round switch** (odd ↔ even, i.e. "round 1 / round 2") picks which round's
  values you're editing — the in-staff equivalent of the two columns in the current
  `PlaybackSettings` grid.
- Ghost-aware: a disabled staff shows its eye/volume at 0.4; toggling re-enables.

**Why this split:** measures/repeats/total are GLOBAL (one value for the whole
exercise) so they don't belong in a per-staff gutter; visibility/volume are
inherently PER-STAFF and PER-ROUND, so they map onto the staff rows exactly like the
clef/range setters. This keeps every in-staff setter "one concern per staff row".

**Open questions for Han before building:** (a) one combined PLAYBACK+EXERCISE
button or two? (b) round switch UI: a single odd/even toggle, or a per-round column
like today? (c) volume control style: vertical mini-slider vs stepped speaker icon?
