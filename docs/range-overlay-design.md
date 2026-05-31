# Range Overlay — Design (bladmuziek variant)

> Status: **design draft, in interview**. Scope of this document is the
> **sheet-music (bladmuziek) range selector only**. The keyboard (input)
> variant and the dual-surface live sync are out of scope here and will get
> their own design once this slice is agreed. This is the first vertical slice
> of the visual settings re-haul (see `architecture.md` §37).

---

## 1. Purpose

Let the user set the pitch range used for melody generation **directly on the
staff**, by interacting with a row of selectable noteheads that sit exactly
where real notes sit. No steppers, minimal text. Treble and bass use a
continuous low–high band; percussion uses a free per-note pool.

This replaces — for the sheet surface — the stepper-based `RangeControls`.

---

## 2. Scope & surfaces

| Staff | What you edit | Interaction |
|---|---|---|
| **Treble** | continuous band `{min, max}` (note names) | drag a handle **or** tap a note to move the nearest boundary |
| **Bass** | continuous band `{min, max}` | same as treble |
| **Percussion** | free note pool (set of percussion IDs) | tap individual noteheads to toggle in/out |

All visible staves are shown **stacked at once** (treble + bass + percussion as
currently rendered). You edit each on its own staff; no clef switching needed.

---

## 3. The selectable note row

### 3.1 Pitch axis = horizontal, low→high, left→right

The selectable noteheads are laid out horizontally across the staff width
(`startX … endX`), ordered **lowest pitch on the left, highest on the right**.
Because higher pitch = higher on the staff (lower Y in `noteYMap`), the row
**ascends diagonally** from bottom-left to top-right, with ledger lines above
and below the 5 staff lines — matching the concept sketch.

### 3.2 Positions and snapping are diatonic (RESOLVED — D1)

`noteYMap` only contains natural notes (C D E F G A B), 5 units per staff step;
accidentals share their natural's Y (`stripAccidentals`). So each visible
notehead sits on a diatonic line/space.

- **Decided (D1):** the row shows **only natural notes** (7 per octave) and the
  band boundary **snaps diatonically** to those naturals. No accidentals are
  drawn on the row. This is consistent with every entry in `PRESET_RANGES`
  (all naturals) and keeps the row visually clean.
- Consequence: `{min,max}` written from this overlay are always natural note
  names. The chromatic in-between pitches are still *generated* normally; we
  only constrain the *boundary picker* to naturals.

### 3.3 Extent: full range + one octave either side

The row spans the instrument's **FULL preset range extended by one octave on
each side**:

```
row_low  = FULL.min − 1 octave   (the "8vb" extension zone, left)
row_high = FULL.max + 1 octave   (the "8va" extension zone, right)
```

clamped to the global MIDI bounds already enforced in `RangeControls`
(21 … 108). The extension zones are visually marked **8vb** (left) and **8va**
(right) so it's clear you're going beyond the normal full range. Example for
treble (`FULL = A3 … C6`): the row runs from A2 to C7.

### 3.4 Selected band

The chosen `{min, max}` is shown as a highlighted segment of the diagonal row:
noteheads inside the band are drawn at full opacity / accent colour; noteheads
outside are dimmed (ghosted). Two **handles** sit on the low and high boundary
noteheads.

---

## 4. Interaction spec

### 4.1 Treble / bass (continuous band)

- **Drag a handle** along the row → moves that boundary continuously; the band
  re-highlights live.
- **Tap any notehead** → moves the **nearest** boundary (min or max) to that
  note.
- **Constraints (reuse existing logic in `RangeControls.handleRangeChange`):**
  minimum span of 12 semitones (one octave); clamp to 21…108; if a boundary
  would cross the other, push the other to keep the 12-semitone minimum.
- Editing snaps the matched preset chip on if the result equals a preset
  (same `nextMode` detection already in `handleRangeChange`).

### 4.2 Percussion (free note pool)

- The percussion staff shows a notehead for **each percussion ID available in
  the current kit** at its fixed `noteYMap` position, using the existing
  `percussionNoteHeads` glyphs (filled / x / triangle).
- **Tap a notehead** → toggles it in/out of the pool; out = dimmed.
- **Decided (D3):** show a notehead for **every percussion ID in the current
  kit**, so the user can switch on sounds that aren't currently playing.

### 4.3 Preset chips ("blokhaken")

- Rendered as bracket glyphs `[ ]` **to the right of the row** (near `endX`),
  one per preset (`STANDARD`, `LARGE`, `FULL`, plus relative/vocal later).
- **Tap a chip** → immediately sets that preset's `{min,max}` for the staff
  (reuse `PRESET_RANGES`). The matching chip is highlighted when the current
  band equals it.

---

## 5. Geometry & reuse (implementation grounding)

Everything renders as a single `<g class="range-overlay">` inside the SheetMusic
SVG, added the same way `SettingsOverlay` is (it already receives `startX`,
`endX`, `trebleStart`, `bassStart`, `percussionStart`, visibility flags).

- **Pitch → Y:** reuse `noteYMap[strippedNote] + combinedShift`, where
  `combinedShift` uses the same `clefOffsets` table as `renderMelodyNotes`
  (treble `−11`, bass `−71`, percussion `staffStart − 171`). **Do not re-derive
  pitch→Y math** (§6c).
- **Note name ↔ MIDI:** reuse `getNoteValue` / `getNoteFromValue` and
  `ALL_NOTES` / `getNoteSemitone` from `RangeControls` / `noteUtils` — extract
  them to a shared helper rather than copy-paste.
- **Noteheads:** reuse Maestro glyphs at font size 34–36, varying
  opacity/colour for selected vs ghost.
- **X layout:** evenly space the row's noteheads from `startX` to (just left of
  the preset chips) by pitch index.

---

## 6. Open / close & animation

- **Decided (D4):** the **RANGE button** toggles a `rangeEditMode` flag passed
  into SheetMusic (it no longer opens the HTML scaffold). The HTML `RangeOverlay`
  is **retired for the sheet variant**; it may later be reused as chrome for
  abstract settings.
- On enter: real melody noteheads **fade out** and the selectable row **fades
  in**, in the same SVG space (opacity via `element.style.opacity` in rAF per
  §6 — never JSX opacity props). Staff lines and clefs stay put.
- On exit: reverse the morph. Must not interfere with the
  pagination/wipe/scroll transition system (§7 invariants).
- **Decided (D5):** auto-close follows the existing settings-overlay pattern —
  **click-outside / inactivity** (reuse the `useSettingsOverlay` keep-alive +
  timer approach, §35). No explicit close button.

---

## 7. Data model

- Treble/bass: keep the existing `{min, max}` note-name model on the active
  treble/bass `InstrumentSettings`. **No model change.**
- Percussion: a pool is a **set of percussion IDs**. The percussion
  `InstrumentSettings` currently has `range: null`; we need a new field (e.g.
  `notePool: string[]`) — *(D6: confirm field name + how generation consumes
  it; this touches §3 generation, so re-read `architecture.md` §3 before
  implementing the percussion half)*.
- Doc note: `architecture.md` §2 lists `range` as `{low, high}` but the code
  uses `{min, max}` everywhere. Code is authoritative here; the architecture
  table should be corrected to `{min, max}` in a follow-up.

---

## 8. Acceptance criteria

**Treble / bass band**
1. Entering range-edit shows a diagonal row of selectable noteheads on the
   treble and bass staves, ascending left→right, with ledger lines, spanning
   FULL ± 1 octave, clamped to 21…108.
2. Noteheads inside `{min,max}` are highlighted; outside are dimmed; two handles
   sit on the boundaries.
3. Dragging a handle updates the boundary live and re-highlights the band.
4. Tapping a notehead moves the nearest boundary to it.
5. The 12-semitone minimum span and 21…108 clamp are always enforced (identical
   to current `RangeControls` behaviour).
6. The result is written to the correct staff's `InstrumentSettings.range` and
   regenerates the melody exactly as the old control did.
7. The row shows only natural notes; boundaries always snap to naturals (no
   accidentals drawn).

**Percussion pool**
8. The percussion staff shows a togglable notehead per available kit ID at the
   correct Y, using the existing percussion glyphs.
9. Tapping toggles in/out (dimmed = out); the pool persists and is consumed by
   generation.

**Presets**
10. Bracket chips appear right of the row; tapping one applies the preset; the
    matching chip highlights when the band equals it.

**Visual / integration**
11. Enter/exit morphs via `element.style.opacity` in rAF; no JSX opacity on
    animated elements; staff lines/clefs stay fixed.
12. Range-edit does not break pagination/wipe/scroll or playback scheduling.
13. `npm run test:run` and `npm run build` stay green; the old stepper
    `RangeControls` is **not** removed in this slice.

---

## 9. Decisions

**Resolved with Han:**
- **D1 — Snapping:** **diatonic (naturals only)**, no accidentals on the row.
- **D2 — Extent:** **FULL ± 1 octave**, marked with 8vb (left) / 8va (right).
- **D3 — Percussion notes shown:** **all current-kit IDs**.
- **D4 — RANGE button target:** **retire the HTML scaffold**, drive an in-SVG
  `rangeEditMode`.
- **D5 — Close affordance:** **click-outside / inactivity** (reuse §35 pattern).

**Still open (Phase 5, percussion):**
- **D6 — Percussion data field:** add `notePool: string[]` to percussion
  settings; confirm exact name and how generation reads it (touches §3). To be
  interviewed when we reach the percussion phase.

---

## 10. Implementation plan (phased)

> Each phase is independently shippable and keeps the old `RangeControls`
> working. No phase removes existing functionality.

- **Phase 0 (done):** temporary RANGE button + HTML scaffold (PR #29). Scaffold
  later retired in Phase 2 (D4).
- **Phase 1 (done):** `src/utils/rangeUtils.js` (`getNoteValue`,
  `getNoteFromValue`, `clampRange`) + test; `RangeControls` now reuses it.
- **Phase 2 (done):** `RangeStaffOverlay` `<g>` rendered by SheetMusic when
  `rangeEditMode` is on. The selectable pitches are built as a **synthetic
  rhythm-less melody and rendered THROUGH `MelodyNotesLayer`/`renderMelodyNotes`**
  (CLAUDE.md §6c) — so ledger lines, ottava (8va/8vb/15ma/15vb) vertical
  shifting and notehead glyphs all come from the real renderer; no hand-rolled
  pitch→Y. Rows are laid out horizontally via a private slot grid
  (`pixelsPerTick=null`). Treble, bass **and percussion** all show selectable
  rows (D3: every kit pad with a staff position, from `PADS`). Colours come from
  the renderer's `previewMode` override, split into three sub-melodies:
  boundary notes `--accent-yellow`, in-band `--text-primary`, out-of-band
  `--text-dim`. Boundary note **names** are labelled under each melodic staff.
  RANGE button toggles `rangeEditMode`; HTML scaffold retired. **In rangeEditMode
  all real melody notes/chords/lyrics are hidden (`notes-transition` →
  `display:none`) and playback is mutually exclusive**: opening stops playback,
  starting playback closes the overlay (Han 2026-05-30). Overlays live in
  `src/components/sheet-music/overlays/`. Smoke test renders the full path
  (`overlays/__tests__/RangeStaffOverlay.test.jsx`).
  - **Refinements (Han 2026-05-30):** notes render as quarter notes; a right
    margin is reserved for preset chips (and makes the row compact); out-of-band
    notes are dimmed further; in rangeEditMode repeat signs + the "4×" are hidden
    and barlines are plain, ending in a normal vertical barline.
- **Phase 3 (done, Han 2026-05-30):** interaction.
  - Melodic: press/drag anywhere on a staff row moves the nearest `{min,max}`
    boundary to the column under the pointer and keeps following it (tap = a
    zero-distance drag). Pointer capture + SVG `getScreenCTM` mapping → works for
    mouse and touch. Writes reuse `RangeControls` semantics exactly (`clampRange`
    12-semitone min span + 21…108 bounds, preset-match → `rangeMode`).
  - Percussion: tap a pad to toggle it in/out of the pool; disabled pads dimmed.
  - Presets clickable: melodic right-brackets apply `PRESET_RANGES`; percussion
    `BASIC/STANDARD/FULL` labels apply `PERCUSSION_PRESETS`; active highlighted.
  - **Percussion order (Han 2026-05-31):** kick → snare → hi-hat → hi-hat-pedal →
    crash → ride → toms(high→low) → rest(high→low), variants behind their base
    (`PERCUSSION_DISPLAY_FAMILIES` in `drumKits.js`). The ride bell (`cr_bell`)
    now has a staff position + a Maestro filled-diamond notehead (`â`, glyph
    U+F0E2) so it appears on the staff and in the selector; audio already mapped
    (`RideBell_*`). Disabled percussion contrast strengthened: 0.12 dim in the
    selector, 0.15 on the DrumPad board.
  - Handlers live in `SheetMusic` (already holds the settings setters via
    context) and pass to the overlay as optional callbacks.
  - **Percussion pool model + generation (done):** `enabledPads: string[]` on
    percussion `InstrumentSettings` (default `PERCUSSION_PRESETS.STANDARD`). The
    `MelodyGenerator` post-filters every percussion pattern via
    `filterPercussionByEnabledPads` (drops disabled pads, emptied slot → rest, so
    rhythm stays intact). `enabledPads=null` = all pads (back-compat).
  - **Disabled pads lowlighted in the bottom DrumPad board too** (not just the
    overlay), visual-only — pads stay playable.
  - **Phase-5 TECHNICAL DEBT (Han 2026-05-30):** the percussion drum *style*
    (swing / backbeat / kick&snare / claves) currently lives on `notePool`. It
    should move onto `randomizationRule`, freeing `notePool` and removing the
    awkward `notePool`(style) vs `enabledPads`(pool) split.
- **Phase 4 (done, Han 2026-05-30):** bottom-view (re)integration.
  - The bottom-view `RangeControls` (piano + keys-bottom tabs) now also opens when
    `rangeEditMode` is on, not only on the settings overlay. Threaded App →
    `TabView` as `rangeEditMode`.
  - A `rangeOnly` prop on `RangeControls` produces the stripped variant: the
    note-coloring (palette) and instrument columns are hidden, leaving
    min / clef / range-mode / max. CSS `.range-controls-range-only` switches the
    grid to 4 columns. The full control is unchanged everywhere else.
  - **Bug #7 fixed:** the settings-overlay click-outside-to-close
    (`useSettingsOverlay` capture-phase pointerdown) closed the overlay when a
    bottom-view range stepper was tapped. The bottom `RangeControls` wrappers now
    carry `data-settings-keepalive=""`, the existing escape hatch that the close
    handler already checks (`closest('[data-settings-keepalive]')`).
- **Phase 5 (in progress, Han 2026-05-31):**
  - **Mutual exclusivity:** range edit IS a settings overlay, so it never stacks
    with the general settings overlay. Opening one closes the other; clicking
    empty sheet in range mode closes range edit (not opens settings). See
    `App.handleToggleRangeEdit` + the close-on-settings effect, and
    `SheetMusic.handleSheetMusicClick` step 3a (`onCloseRangeEdit`).
  - **Clef-aware presets (points 2/3):** `SheetMusic.computeRangeFrame(clef)`
    returns `{rowLow, rowHigh, presets:[{label,min,max}]}` per staff, following the
    CLEF SHOWN (not the staff slot). Bass clef on the top staff offers bass
    notes/presets; vocal clefs centre the clef's default voice (pad ±voice-span)
    with the individual voices (Bass…Soprano) as presets. Boundary/preset
    write-backs take the clef-aware preset list so `rangeMode` matching works for
    any clef incl. vocal. (`rowLow/rowHigh` is now superseded by the
    boundary-relative window — see below — and kept only for the preset list.)
  - **Hit zones meet on a shared divider (Han 2026-05-31):** each melodic staff's
    drag zone is a tall `<polygon>` whose OUTER edge follows the note row offset by
    `BAND_COVER` (up for treble, down for bass — covers the 8va/8vb markers) and
    whose INNER edge is a shared `divider` = the midpoint of the two note rows at
    the row's left/right ends. Both zones use the SAME divider + common left/right
    x, so their edges touch exactly and neither overlaps. Solo staff → symmetric
    band (`BAND_SOLO_H`). `colAt` only uses x, so the taller shape only enlarges
    the clickable area. Percussion pads get per-pad boxes centred on each notehead,
    biased UPWARD (`PERC_HIT_UP_BIAS`) and tall (`PERC_HIT_H`) so they cover stems.
  - **Selected notes follow note coloring (Han 2026-05-31):** the in-band layer
    renders with `previewMode:false` + the live `noteColoringMode`/`scaleNotes`/
    `tonic`/`transpositionSemitones` (threaded from SheetMusic), so selected notes
    match the sheet-music coloring. Boundary notes stay yellow (drag handles);
    out-of-band stays dimmed.
  - **Bracket-only presets:** no text labels (UI-overhaul NFRs). Melodic AND
    percussion presets render as nested right-brackets; active one highlighted.
  - **Boundary-relative window + balance (Han 2026-05-31):** the row is a
    two-thumb range slider. `buildRangeRow` shows a WINDOW that always includes
    `CONTEXT_NOTES` (3) naturals beyond each boundary, capped to the piano
    (A0–C8). This makes the row symmetric by construction (3 below min · min · …
    · max · 3 above max) — fixing the old imbalance (5-1-2-…-2-1-5) caused by the
    fixed ±octave extent — and lets the user drag a boundary OUTWARD past the old
    ±octave limit: on release the window re-anchors and reveals fresh context
    (replaces a separate "extreme range" feature). `clampRange` (min span 12,
    bounds 21–108) is the only hard limit. Window naturals come from the shared
    `windowNaturals` in `rangeUtils.js`.
  - **Diagonal ellipsis (narrow screens):** when the window is still too cramped
    to fit (`avail/W < MIN_NOTE_WIDTH`), `buildRangeRow` COLLAPSES the in-band
    middle — the notes deep between the boundaries, never the drag target —
    keeping `KEEP_IN` (3) naturals beside each boundary and drawing a diagonal
    "…" (3 dots along the slant). The gap is dummy slots in `allOffsets`, so the
    index-based renderer (`x = startX + (idx-1)*noteWidth`) draws it for free;
    `colMidi` maps x→pitch across the gap. The whole layout is frozen during a
    drag (`dragRef.layout`) so notes don't jump under the finger; only colouring
    updates live. `MAX_NOTE_WIDTH` caps spacing so a small window isn't sparse.
  - **Debug hit boxes:** every interactive region draws its hit box in `debugMode`
    (CLAUDE.md §3a).
  - **Percussion-style→`enabledPads`** tech-debt resolved: BASIC/STANDARD/FULL.
- **Phase 6 — Keyboard range setter (Han 2026-05-31):** context-bound, per
  keyboard. `KeyboardRangeSetter.jsx` is the range-edit variant of the keyboard
  (TabView swaps it in for the playable `PianoView` when `rangeEditMode`, on the
  treble/active piano tab AND the bass `keys-bottom` tab — one component reused
  per keyboard). It renders a windowed `PianoView` (via the shared
  `windowNaturals`, so the keyboard shows the SAME context-beyond-boundary window
  as the staff), a translucent band over the selected range with drag handles at
  the edges, and preset BUTTONS (STANDARD/LARGE/FULL per clef) above. Geometry:
  white keys are uniform width, so the overlay SVG uses `viewBox="0 0 nWhite 100"`
  (1 unit/white key) and maps pointer x→white-key index via its bounding rect.
  Tap or drag sets the nearest boundary through the SHARED `applyRangeBoundary`
  write path (one clamp/preset-match rule for staff, keyboard, and steppers,
  §6c); the window freezes during a drag and re-anchors on release. Boundaries
  snap to naturals (white keys), matching the staff. Settings-only mode keeps the
  playable piano + full `RangeControls`.
- **Still parked:** keyboard ellipsis for very narrow screens (the staff has it;
  the keyboard caps spacing instead); black-key boundary precision on the
  keyboard (currently snaps to white keys); percussion keyboard setter (DrumPad —
  separate slice); lyrics/label spacing; mode-indicator text TBD.
- **Phase 5 — polish:** lyrics/label spacing so boundary names can return without
  overlapping noteheads; 8vb/8va extent tuning.
- **Phase 6 — morph animation:** fade real notes ↔ selectable row on enter/exit;
  retire the HTML scaffold for the sheet variant (D4).
- **Phase 7 — polish + coach-tour hook** (later, shared with other settings).

Keyboard variant + dual-surface live sync: separate design, after this slice.

---

## 11. Files (anticipated)

- `src/components/sheet-music/RangeStaffOverlay.jsx` (new `<g>` overlay)
- `src/components/sheet-music/SheetMusic.jsx` (render the overlay; `rangeEditMode`)
- `src/utils/rangeUtils.js` (new shared note↔value + clamp helpers) + test
- `src/model/InstrumentSettings.js` (percussion `notePool`, Phase 5)
- `src/App.jsx` (drive `rangeEditMode` from the RANGE button)
- `src/components/controls/RangeOverlay.jsx` (retired or demoted to chrome, D4)
- `docs/architecture.md` (§37 update + `{min,max}` correction)
