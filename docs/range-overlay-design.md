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
- **Phase 3 — interaction:** drag + tap to move boundaries, with constraints;
  write back to `InstrumentSettings.range`; preset-match highlight.
- **Phase 4 — preset chips:** bracket chips right of the row applying
  `PRESET_RANGES`.
- **Phase 5 — percussion pool:** model field (D6) + togglable percussion
  noteheads; wire into generation (re-read §3 first).
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
