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
1. **Rhythm generation:** `generateRankedRhythm` builds a rhythmic grid of weighted "Ranks".
2. **Range preparation:** determines the valid note range per instrument; builds `chromaticScale` with only valid notes.
3. **Conversion:** calls `convertRankedArrayToMelody` with the rhythm, chords, and chromatic scale.
4. **Tuplet post-processing:** after `fromFlattenedNotes`, scans the melody for qualifying notes and probabilistically converts them into tuplet groups (see §22). Attaches `melody.triplets` with per-note `TupletEntry` metadata.

### Step 5 — Note Assignment (`convertRankedArrayToMelody.js`)
1. **Slot iteration:** walks through rhythmic slots.
2. **Chord lookup:** identifies the current chord by measure index.
3. **Note pool filtering:** filters `chromaticScale` to notes matching the current chord's pitches.
4. **Selection rule:** picks a note based on `randomizationType` (`'roots'`, `'chord'`, `'scale'`, `'balanced'`) and proximity weighting.

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

Pagination has three distinct transition cases depending on position within the sequence block.

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

### 10.3 Scroll Mode

Scroll is continuous — notes flow at constant speed past a fixed playhead. There are no hard page cuts. New content appears off-screen to the right and scrolls into view.

#### Intra-series (non-last repeat)

At `m = 0` of each non-last rep:
- `setNextLayer('yellow')` — yellow overlay rendered at `translate(endX − startX, 0)` (off-screen right), opacity 0.55.
- `scrollTransitionRef.current = { startTime: nextStartTime + 0.75m, endTime: nextStartTime + (numMeasures + 0.75)m }`.
- rAF drives scroll: `translateX = (0.25 − p) × pageWidth` where `p` goes 0→1 over `numMeasures` measures.
- The +0.75m offset keeps the first note frozen at the 25% playhead for ~3/4 of the first measure before scrolling begins.

#### Series boundary (multi-measure)

At `m = 0` of last rep: scroll animation queued (same formula, numMeasures-long).
At penultimate measure (`m = numMeasures - 2`) of last rep:
- `randomizeScaleAndGenerate()` called.
- `setNextLayer('red')` + `setPreviewMelody(result)` — new melody appears off-screen right with `scrollPreviewFadeIn` CSS animation.

At `applyTime = nextStartTime + 0.75m` after series boundary:
- `applyResult()` applies new melody. Content in old group updated. `setNextLayer(null)`.
- `useLayoutEffect`: resets scroll-group transform to `translate(0.25 × pageWidth, 0)` (= p=0 of new animation).

**New melody loaded:** At `applyTime = seriesBoundary + 0.75 × measureDuration`. The scroll animation ends at +0.75m, so content is replaced exactly when the animation completes and the old melody has fully scrolled past the playhead.

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
| `renderMelodyNotes.jsx` | Pure rendering function — given a `SlicedMelody` and layout parameters, returns SVG note heads, stems, beams, flags, accidentals, and chord labels. |
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
| `PlaybackStateContext` | `src/contexts/PlaybackStateContext.jsx` | `isPlaying`, `isOddRound`, `currentMeasureIndex`, `inputTestState`, `inputTestSubMode` / setter |
| `AnimationRefsContext` | `src/contexts/AnimationRefsContext.jsx` | All 9 animation refs/callbacks: `wipeTransitionRef`, `scrollTransitionRef`, `pendingScrollTransitionRef`, `paginationFadeRef`, `clearHighlightStateRef`, `showNoteHighlightRef`, `setCurrentMeasureIndex`, `sequencerRef`, `context` (AudioContext) |

### Invariants
- All three providers are mounted in `App.jsx` above both `<SheetMusic>` instances.
- `AnimationRefsContext` carries refs (not state), so consuming it never triggers re-renders.
- `svgRef` is **not** in context — SheetMusic receives it as a prop because the component
  has an internal fallback: `const svgRef = svgRefProp ?? svgRefInternal`.

### Files
- `src/contexts/MelodyContext.jsx` — new
- `src/contexts/PlaybackStateContext.jsx` — new
- `src/contexts/AnimationRefsContext.jsx` — new
- `src/App.jsx` — added providers; removed 22 props from both SheetMusic call sites

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
