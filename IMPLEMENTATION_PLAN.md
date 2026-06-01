# Implementation Plan — live log

> Standing rule (Han 2026-05-31): log **every** plan, CR (change request), FR
> (feature request) and bug here **immediately**, as a short implementation plan,
> before/while implementing. This file is the running scratch-plan; BACKLOG.md
> stays the user's source of truth for feature text.

Status keys: ✅ done · 🔨 in progress · ⏳ backlog/next phase · 🐞 bug

---

## Clef selector — CR batch (Han 2026-06-01 #2)
Decisions: new `preferredClef:'off'` field · clef-click = open selector (replace old)
· perc toggler = mini-rhythm · last pad not removable.
- ✅ clicking the clef glyph opens the CLEF selector (old tap-cycle + popup removed).
- ✅ ≥1 enabled pad enforced (togglePad refuses to remove the last).
- ✅ 4th family = large CROSS (`CLEF_OFF`); patch/clef-calc/visibility plumbed safe.
- ✅ vocal voices fixed: added Baritone, each shows its real clef GLYPH, Bass≠
  instrumental bass (matched on rangeMode). Pure helpers + tests updated (10 cases).
- 🔨 NEXT WAVE (visual polish, see §37.2 "next polish wave"):
  - carousel fully left of startX; hide time-sig in clef mode; real-size clefs;
    true carousel slide+fade (old off-left, new in-right).
  - octave variants as full ottava clef GLYPHS (8va/8vb/15ma/15vb), minimal text.
  - disabled ('off') staff: greyed-out-but-visible in other modes; crossed clef
    clickable → opens selector.
  - percussion clef block: perc/off left + `[[k,c],hh,[s,hh],hh]`×2 toggler for
    `percussionVoiceSplit` (localize from SettingsPanel).
  - range setter sheet: distribute notes across full width when few selected.
  - range setter keys: bass-on-top-keyboard bracket highlight/layer; nicer behind
    bracket; fix overlapping brackets/ellipses → `⌜- - - ... ⌜- - - - ⌝`.

## Clef selector (in-staff, CLEF mode) — Han 2026-06-01
✅ Built. `ClefStaffOverlay` + pure `clefSelector.js` (+ test, 8 cases). CLEF button
in SubHeader → `clefEditMode` (mutually exclusive with range/settings, stops
playback). Left 20% = G/F/Vocal carousel (current bright leftmost, others lowlit,
CSS-transition slide L→R). Right 80% = octave chips + transposition chips + "…"
(opens existing transPicker). Reuses the morph (now `range||clef`). preferredClef +
transpositionKey kept separate. 197 tests green; build + lint clean.
⏳ Parked: exact selected-variant glyph leftmost (now generic family glyph + the
highlighted right chip conveys the variant).

### (orig) Clef selector — Han 2026-06-01
New in-SVG clef selector, parallel to the range selector. Decisions (interview):
own mode + CLEF subheader button · left 20% = G/F/Vocal family carousel (current
left, other two lowlit; pick → carousel slide L→R) · right 80% = variants of the
family: octave (8va/8vb/15ma) AND transposition chips (G^B♭, G^E♭, …, G^x → full
list) · keep `preferredClef` + `transpositionKey` as separate fields (selector
writes both). Selected variant shows leftmost; cycling reverts to default variant.
Reuse morph transition. Pure logic in `clefSelector.js` (+ test).
- ✅ Removed "◆ RANGE SELECTOR" text indicator.

## Range Selector (in-SVG, RANGE mode)

### ✅ Anim batch (Han 2026-06-01 #2)
- ✅ CR: LARGE preset widened — treble C4–A5, bass E2–C4.
- ✅ Keyboard slide-stepper: reuses `rangeSlide.js` (tap-burst / hold-extend / drag);
  window freezes during the gesture, band/handles glide via CSS transition
  (`.kbd-range-band`, x/width 0.25s linear).
- ✅ Enter/exit MORPH (1.5s, `useRangeMorph.js`): RANGE fades melody OUT, range rows
  FLY IN from the right; closing reverses. Old fades, new flies. Both groups kept
  mounted+visible via `morphing`. opacity/transform via element.style in rAF (§6),
  cleared at end. 190 tests green; build + lint clean.


### ✅ Feedback batch (Han 2026-06-01) — done this round
A ✅ Slide tween now LINEAR (constant velocity) → a burst glides instead of pulsing.
B ✅ Hold-extend fixed: advance `target` with `live` while extending so it keeps
   going outward instead of wobbling back.
C ✅ 8va bug: row now renders as ONE MelodyNotesLayer with a per-note color
   override (`previewColorFn`) → ottava computed once (§6b). New renderer prop
   threaded through MelodyNotesLayer.
D ✅ Keyboard responsive again: window key count is width-adaptive (ResizeObserver)
   instead of a fixed half-span.
E ✅ Window centres on the SELECTION again (Han corrected his earlier note) → clef
   switch slides the window so selected notes stay central.
F ✅ Bass-clef bracket highlights identically (active = yellow regardless of clef).
G ✅ Brackets compressed to 3 shared rows (FULL/LARGE/STANDARD); current clef front
   (bright), other clef behind (dim) + interrupted with "…" at the overlap; clef
   select swaps front/behind. `buildPresetBracketRows` reworked + test (7 cases).
H ✅ Percussion deselect via lowlight COLOUR (var(--text-lowlight)) not opacity, so
   ghost/rim/open-hihat glyphs stay crisp. DrumPad board left as-is (visual only).
- ✅ CR: open hi-hat (ho) added to STANDARD percussion preset.
- ✅ CR: cowbell notehead → triangle (Ñ).
- ✅ CR: snare-rim notehead → snare head + diagonal slash overlay.
- Also fixed a latent rules-of-hooks bug (useLayoutEffect after early return).
- 190 tests green; build + lint clean.

### (orig request) Feedback batch (Han 2026-06-01)
A. **Animation smoothness**: 1 click on an extreme note reads as a chain of
   discrete shifts. Make it flow (continuous, no per-step start/stop pause).
B. **Hold on extreme**: currently notes wobble back-and-forth instead of keep
   extending the range outward (new notes sliding in). Fix the hold-extend.
C. **8va still per-group** (see screenshot): the colored layers each compute their
   own ottava bracket → multiple 8vb. Bug §6b — render ottava once over the row.
D. **Keyboard not responsive**: widening the panel should add keys (regressed when
   I centred on a fixed half-span). Restore ResizeObserver-driven key count.
E. **Clef switch → window should slide so the SELECTED notes are centred** (Han
   corrects his earlier "centre on clef" — centre on selection).
F. **Top-keyboard bass-clef preset not yellow** when selected: bass brackets must
   highlight/behave identically to treble brackets.
G. **Bracket height compression**: align FULL/LARGE/STANDARD on shared heights
   (3 rows, not 6). When treble active, just before the overlap (~A4,C5,C5)
   interrupt the bass bracket with "…". Off-clef dimmed; on selecting bass clef,
   SWAP highlight: bass brackets highlighted, treble brackets drawn "behind".
H. **Percussion deselect = colour, not opacity**: ghost/rim/open-hihat unclear if
   selected because opacity dims the glyph. Use lowlight COLOUR (grey), not opacity.
- CR: add **hi-hat open (ho)** to LARGE percussion preset.
- CR: **cowbell (cb)** notehead = triangle (not cross).
- CR: **snare rim (sr)** notehead = snare head with a diagonal slash through it.

### ✅ Keyboard preset brackets = 6 clef+range presets (Han 2026-05-31)
Six brackets (G-clef STD/LARGE/FULL + F-clef STD/LARGE/FULL), clef-grouped
(treble band on top), x-aligned to real key positions (larges overlap). Tap sets
BOTH `preferredClef` + `range` on the CURRENT staff (fixes the bug where F-brackets
wrote to the middle staff). Separate `onSwitchClef` row removed. Window centres on
the active clef's home note (B4/D3) so brackets sit at stable positions; off-clef
brackets dimmed & may fall off-screen. Applies to BOTH tabs (each edits its own
staff; a staff may carry either clef). `buildPresetBracketRows` reworked + test
(5 cases). 188 tests green; build + lint clean. Decisions from interview:
clef-centred window (off-screen OK) · remove clef row · apply to both tabs.

### 🔨→✅ Boundary SLIDE animation (sheet overlay) — Han 2026-05-31
Decisions (interview): sheet overlay only · all behaviours at once · all 4
directions mirrored · 0.25 s/note constant (chained, no pause).
- ✅ `rangeSlide.js` pure helpers (`nextNaturalToward`, `nextNaturalInDir`,
  `classifyStep`, `STEP_MS`, `easeOutCubic`) + test (11 cases).
- ✅ Stepper in `RangeStaffOverlay`: tap = burst to target (finishes after
  release); hold = extend outward at 250 ms/note until release; >8u move = live
  drag (old behaviour). Shared `setMelodicBoundary`/`clampRange` write path.
- ✅ Slide tween: body `<g>` scales about the anchored edge; one context note
  swipes+fades in/out at the far edge; 8va rides along. rAF sets transform/opacity
  (never JSX, §6). Presets / drag-jumps / ellipsis layouts snap instantly.
- ✅ Docs (architecture §37.1), 187 tests green, build + lint clean.
- ⏳ Parked: keyboard-setter equivalent; enter/exit morph (separate phase).

### Done
- ✅ Tech-debt: percussion coarse style → presets. BASIC/STANDARD/FULL set
  `enabledPads` (single source for "which drums"). `RangeStaffOverlay` +
  `applyPercussionPreset`.
- ✅ CR1 — Range edit ⇄ settings overlay mutually exclusive. Opening one closes
  the other; clicking empty sheet in range mode closes range edit.
  (`App.handleToggleRangeEdit`, close-on-settings effect, `handleSheetMusicClick`.)
- ✅ CR2 — Clef ↔ range coupled. `SheetMusic.computeRangeFrame(clef)` →
  `{rowLow,rowHigh,presets[]}` follows the CLEF SHOWN, not the staff slot. Bass
  clef on top staff ⇒ bass notes/presets; vocal clefs ⇒ vocal voices.
- ✅ Debug hit boxes for all interactive overlay regions (CLAUDE.md §3a).

### Current CR batch
- ✅ CR3 — Restored the "original" (wider) note set: melodic extent = FULL ±1
  octave again (room exists on ≥800px; narrow-screen scaling is ⏳).
- ✅ CR4 — Diagonal hit band: replaced the full-height rect per staff with a
  parallelogram `<polygon>` following the note row (treble/bass no longer
  overlap). Percussion → per-pad boxes centred on each pad's Y (`PERC_HIT_H`).
- ✅ CR5 — Removed text by the range setter: melodic + percussion presets are now
  bracket-only. *(Mode indicator "◆ RANGE SELECTOR" kept — confirm if it should
  go too.)*
- ✅ CR6 — Vocal centring: `computeRangeFrame` centres the clef's default voice
  (pad ±voice-span). **Verify visually with Han.**

### Backlog / next phase
- 🔨 FR — **Klavier (keyboard) range setter** (building, answers 2026-05-31).
  Context-bound & per-keyboard (treble-setter at treble kbd, bass at bass).
  Decisions: (1) range-edit shows a boundary-relative WINDOW with context keys
  beyond min/max; band = selection, drag-handles + tap-to-set-nearest, release
  re-anchors → extend up to A0–C8; (2) drag-handles AND tap (mirror bladmuziek);
  (3) REPLACE the RangeControls steppers with the graphical setter + preset
  BUTTONS; (4) scope = treble + bass (shared PianoView); percussion later.
  Reuse the boundary-relative window logic + clampRange write path.
- ✅ FR — **Boundary-relative window + balance + diagonal ellipsis (sheet music).**
  `buildRangeRow` now shows a WINDOW with 3 naturals beyond each boundary (capped
  A0–C8) → symmetric by construction (fixes 5-1-2 imbalance) AND lets you drag a
  boundary past the old ±8va limit (release re-anchors, reveals fresh context;
  subsumes the "extreme range" FR). When still cramped, collapses the in-band
  middle into a diagonal "…" keeping 3 inside each boundary. Whole layout freezes
  during drag. `MAX_NOTE_WIDTH` caps sparse spacing. **Verify visually.**
- 🔨 FR — **Keyboard range setter v2 — SPLIT layout (Han 2026-05-31).** Redesign:
  (top→bottom) preset BLOKHAKEN (brackets, no text, consistent w/ sheet) → COMPACT
  windowed SELECTOR keyboard (width-adaptive: ~20px/white key, e.g. 300px→15 keys,
  symmetric around the selection like the sheet) → REAL playable keyboard limited
  to the selection (shows the impact). Selector: band + handles + tap, freeze
  during drag, re-anchor on release. Shares windowNaturals + applyRangeBoundary.
  v1 started; preset-bracket alignment to selector keys is approximate.
- ⏳ FR — **Extreme range** up to 15mb–15ma (capped A0–C8); interaction idea:
  after releasing the drag, 3 more notes appear left & right (progressive reveal).
  Likely pairs with the ellipsis windowing.
- ✅ FR (range-selector polish v2, Han 2026-05-31) — **Verify visually.**
  1. In-band (selected) notes follow note-coloring (previewMode off + live
     coloring props); boundary notes stay YELLOW handles; out-of-band dimmed.
  2. Treble/bass hit zones: taller, cover 8va/8vb, outer edge follows note row
     −BAND_COVER, inner edge = shared divider (midpoint of the two note rows) so
     they meet EXACTLY; solo staff → symmetric BAND_SOLO_H.
  3. Percussion hit boxes taller (PERC_HIT_H) + biased UPWARD over the stems.
- 🐞/⏳ Backlog — **Drum-notation stems**: adjust stem direction/length.

### Broader app-IA redesign (mockup 2026-05-31) — LOGGED, not scheduled
Full navigation/settings vision from the wireframe. Captured for later; recommend
finishing the range-setter feature (sheet + keyboard) before opening this. Items:
clef picker (clefs slide from left, per-bar clef select incl. disable; percussion
chord vs two-melody notation); "Exercise" settings (difficulty/level-up);
"Visualisation" (note coloring, animation, multi-line, theme); Instrument setting;
"Advanced song generation" (#measures, #repeats, playback, odd/even volume); Scale
selector (bottom view); Header (melody type/key/scale, playback, scoring, settings
nav); NAV (icon main-cat ↔ sub-cat: Input|instrument, Settings|profiel,
Muziek|Toonladder).

---

## Conventions added this session
- CLAUDE.md §3a — every interactive component must draw its hit box in
  `debugMode` (orange rect, `pointerEvents:'none'`).
- CLAUDE.md §1a addendum — log all plans/CRs/FRs/bugs into this file immediately.
