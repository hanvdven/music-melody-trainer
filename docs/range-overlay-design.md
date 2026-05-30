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

### 3.2 Positions are diatonic, snapping is chromatic (proposed)

`noteYMap` only contains natural notes (C D E F G A B), 5 units per staff step;
accidentals share their natural's Y (`stripAccidentals`). So each visible
notehead sits on a diatonic line/space.

- **Proposed:** the band boundary snaps **chromatically** (every semitone), and
  when a boundary lands on a sharp/flat we draw the accidental glyph to the left
  of the notehead (same Maestro glyph the renderer uses). Rationale: the data
  model (`{min,max}` via `getNoteFromValue`) and the future keyboard variant are
  both chromatic; snapping diatonically would make some MIDI bounds unreachable.
- *(Open decision D1 — see §9.)*

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
- *(Open decision D3: show all kit IDs, or only the ones currently in the
  generated pattern? — §9.)*

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

- The **RANGE button** (currently opens the HTML scaffold) instead toggles a
  `rangeEditMode` flag passed into SheetMusic. *(Open decision D4: retire the
  HTML `RangeOverlay` for the sheet variant, keep it only as future chrome for
  abstract settings — §9.)*
- On enter: real melody noteheads **fade out** and the selectable row **fades
  in**, in the same SVG space (opacity via `element.style.opacity` in rAF per
  §6 — never JSX opacity props). Staff lines and clefs stay put.
- On exit: reverse the morph. Must not interfere with the
  pagination/wipe/scroll transition system (§7 invariants).
- Auto-close behaviour: follow the existing settings-overlay pattern
  (click-outside / inactivity) or an explicit close affordance — *(D5)*.

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
7. Boundary noteheads on sharps/flats render the correct accidental glyph.

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

## 9. Open decisions (need Han)

- **D1 — Snapping:** chromatic (every semitone, accidentals shown) *(proposed)*
  vs diatonic (naturals only).
- **D2 — Extent:** FULL ± 1 octave *(proposed)* vs some other span.
- **D3 — Percussion notes shown:** all current-kit IDs *(proposed)* vs only IDs
  in the current pattern.
- **D4 — RANGE button target:** retire the HTML scaffold and drive an in-SVG
  `rangeEditMode` *(proposed)* vs keep the HTML shell as a wrapper.
- **D5 — Close affordance:** click-outside/inactivity (match existing overlay)
  vs explicit close button vs both.
- **D6 — Percussion data field:** add `notePool: string[]` to percussion
  settings; confirm name and how generation reads it (touches §3).

---

## 10. Implementation plan (phased)

> Each phase is independently shippable and keeps the old `RangeControls`
> working. No phase removes existing functionality.

- **Phase 0 (done):** temporary RANGE button + HTML scaffold (PR #29).
- **Phase 1 — shared helpers:** extract `getNoteValue/getNoteFromValue` and the
  range-clamp logic from `RangeControls` into a shared util with a smoke test
  (§7b). No UI change.
- **Phase 2 — static row render:** add `RangeStaffOverlay` `<g>` rendered by
  SheetMusic when `rangeEditMode` is on; draw the ghost row + band + handles for
  treble/bass using `noteYMap`. Read-only (no interaction yet).
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
