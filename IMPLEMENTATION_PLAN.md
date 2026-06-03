# Implementation Plan — live log

> Standing rule (Han 2026-05-31): log **every** plan, CR (change request), FR
> (feature request) and bug here **immediately**, as a short implementation plan,
> before/while implementing. This file is the running scratch-plan; BACKLOG.md
> stays the user's source of truth for feature text.

Status keys: ✅ done · 🔨 in progress · ⏳ backlog/next phase · 🐞 bug

---

## Feedback batch (Han 2026-06-03 #15) — INTERVIEW PENDING, no code yet

BATCH 1 done (clef setter, isolated/safe):
- ✅ #11 treble8va blank glyph fixed — was `char:' '`; now plain treble + serif '8'
  ottava marker (clefGlyphs.jsx; new numeric-ottava render path, '15' path untouched).
- ✅ #12 instrument-name now matches the real staff label (fontSize 12, plain serif,
  non-italic) instead of italic size-9 Georgia.
- ✅ #6/#17 active option = `--accent-yellow`, non-selected = new darker
  `--setter-lowlight` token (added to all 4 themes in App.css).
Surfaces clarified (Han 2026-06-03): "range setter" = RangeStaffOverlay (SEPARATE from
clef setter); C4-ledger #4 = chords in the akkoordlijn (chord line), not clef-setter notes.

REMAINING — staged batches:
- BATCH 2 (clef-setter GEOMETRY refactor, approved "reuse real staff geometry"):
  · ✅ #14 distribute variant clefs across 12%→86% of [startX,endX] (carousel + vocal).
  · ✅ #10 bottom clipping: decoupled carousel clipHeight(108) from tap height(74) so
    the C4 ledger shows without the gesture rect bleeding into the row below.
  · ✅ #15 baritone = full 'baritone-f' clef (Han: setter + sheet). New clef in
    clefSymbols (char '?', yOffset -10), renderMelodyNotes clefOffsets (-61 = bass+10),
    renderAccidentals (10, ≈bass — FLAGGED for visual key-sig check), VOCAL_VARIANTS
    baritone → 'baritone-f'. Flows through calculateOptimalClef (Baritone rangeMode).
  · ✅ #10 v2 "clip gewoon NIET": carousel clips HORIZONTALLY only (huge vertical span)
    so no top/bottom cut; fades pulled to the very edges (0.015/0.985) so right no longer
    looks clipped early; clef inset (+8) so leftmost clef isn't cut.
  · ✅ #8: clef inset +8 (CLEF_X) sits closer to its melody / off the card edge.
  · ✅ #9: roomier note spacing (noteW 0.14→0.18, min 16).
  · ✅ label "(B♭ inst.)" moved to UPPER-RIGHT of clef (CLEF_X+14) not directly above.
  · ✅ CR: subheader button hit-zone now covers the label text too (hit-extender div).
  · ⏳ #14 vocal C-G-C NOTES: still TODO — need octave rule confirmed (centre triad on
    each voice clef, derive octave from clefOffsets/voice range; no hardcoded table §6c).
  · ⏳ #13 chord height → belongs with Batch 3 (chord line).
- BATCH 3 (chord line / ext-add chord editor): #2 chords not neatly in block, #3 3-column
  spacing too tight, #4 transpose chord-line notes up to start at D4 (kill C4 ledger).
- BATCH 4 (RangeStaffOverlay): #5 two-zone drag (outside-right drag-left = raise; on
  setter drag-left = lower), #16 range notes not transposed for G-(F inst).
- SMALL: #7 percussion beam is yellow (real notation), #1 transition: ottava glyphs +
  brackets don't slide in with morph.

RANGE / clef-card carousel:
- 🐞 Transition: 8vb-etc ottava glyphs + the brackets ("blokhaken") don't slide in
  with the morph (left behind / not animated).
- 🐞 Chords don't sit neatly inside the card block (see screenshot).
- 🐞 ext/add chord: the 3 columns (accidentals · middle notes · right notes) are too
  cramped → widen column spacing.
- 🔨 Remove the C4 ledger ("streepje"): transpose REF_NOTES up so they start at D4.
- 🐞 Drag is confusing. Desired: clicking/dragging to the RIGHT of the range (outside)
  → drag-left = "pull notes from the right" = RAISE range. On the range setter itself
  → drag-left = LOWER range. (Need to map this to carousel vs note-range surfaces.)
- 🔨 Make lowlight colour for ALL non-selections a bit darker grey (dark mode).

NOTATION (sheet music rendering):
- 🐞 Percussion beam is yellow (should match note colour, not yellow).
- 🐞 Clefs sit too far right — don't match real sheet-music clef x-position.
- 🔨 Notes too close to clef & each other → make blocks roomier.
- 🐞 Clipping at the bottom of notes/clefs around the C-ledger height.
- 🐞 8va treble clef doesn't render (ALT+0160 = nbsp → wrong/missing ottava glyph char).
- 🐞 Instrument name: wrong position rel. to clef vs sheet music + different font size +
  italic. MUST be consistent (Han frustrated — prioritise).
- 🐞 Chords too close together + not at same height as in sheet music.

CLEFS distribution / vocal:
- 🔨 Add C-G-C reference notes to the vocal (zang) clefs too.
- 🔨 Distribute ALL clefs (incl. vocal) across startX→endX from 12%→86% so they don't
  overlap the edge or the left clef-setter.
- 🐞 Baritone clef = F-clef with the F on the MIDDLE line → render 10 units lower; fix
  note transposition accordingly.
- ❓ Selecting G-(F inst): range-setter notes are NOT transposed. Are these rendered or
  hardcoded? → ANSWER: REF_NOTES are a fixed array, transposed via the card's `trans`
  (semitones) prop in ClefCard. Octave cards pass trans=0; transposition cards pass the
  instrument semitones. If a card shows untransposed, the card's trans wiring is wrong
  → BUG to fix (likely octave vs transposition orthogonality on that card).

SETTINGS:
- 🔨 settings / notation / range: make ACTIVE settings clearly yellow, rest lowlight.

ROOT-CAUSE HYPOTHESIS (to validate): the ClefCard renders its own bespoke clef/note/
label layout instead of reusing the real SheetMusic clef-glyph + note-layer + instrument-
label primitives → explains clef x-pos, spacing, clipping, ottava glyph, instrument-name
font/position, chord height all being inconsistent. §6c: prefer reusing existing
rendering logic over a parallel implementation.


- ✅ Dead code removed (verified zero refs, tests+build green):
  · clefSelector: `instrumentClefCards`/`INLINE_CLEF_CARDS`/`transpositionChips`/
    `INLINE_TRANSPOSITIONS` + now-unused import (superseded by the swipe carousel).
  · SheetMusic: dead `onOpenInstrumentList` wiring (transPicker still reachable via
    the staff label — kept).
  · progressionDefinitions: `getProgressionDegrees`, `RANDOM_STRATEGIES`.
  · TrebleSettings: duplicate `instrumentOptions` export (canonical in
    controls/instrumentOptions.js).
  · drumKits: `CATEGORIES`/`DEFAULT_DRUM_KIT`/`KIT_SAMPLES`/`PADS` (superseded by
    DRUM_KITS + KIT_NOTE_MAPPINGS; imported nowhere).
  · Kept (NOT dead): `getTraditionalSolfege`, `computeSequenceBoundaries`,
    `planPaginationFade`, `PAGINATION_CLAMP_FALLBACK_MEASURES` (test-covered);
    `ALL_SAMPLES`, `PERCUSSION_DISPLAY_*`, `PREDETERMINED_STRATEGIES` (used).
- 🔎 Performance review — ran a hot-path sweep; findings VETTED and mostly rejected:
  · pagination effect `.map()` is in the body, not deps → no spurious re-runs.
  · dry-run `calculateAllOffsets` (full melody) ≠ windowed useMemo → not redundant;
    effect is debounced during playback, not per-frame.
  · highlight rAF already caches DOM lookups (Map) + uses `style.opacity` per §6
    invariant; "CSS-class opacity" suggestion would VIOLATE §6 → rejected.
  Conclusion: hot paths already optimized; no safe high-value change found. Any future
  perf work in Sequencer/highlight/pagination needs an interview (§4b, §6).

## Feedback batch (Han 2026-06-01 #14)
🔨
- ✅ Rename "CLEF" settings → "NOTATION" settings (button label).
- ✅ Percussion notation: (1) centred (first note now lands at startX via a leading
  sentinel offset, bundles centred on 30%/70%) (2) box removed (only an invisible hit
  rect remains) (3) SPLIT now real parallel-voice notation — hi-hats = 4 beamed
  eighths (RH, up), kick+snare = QUARTER notes (LH, down), via two MelodyNotesLayer
  voices on a shared x-grid + percussionVoiceSplit. (#2 "stems wrong side" addressed
  by the proper split classifier — verify visually.)
- ✅ ALL setters: ACTIVE = normal colour (`--text-primary`); PASSIVE = `--text-lowlight`
  at opacity 1. Applied to Clef families/variants/perc, ChordStaff, ChordStyle, and
  Range preset brackets. (Range boundary DRAG HANDLES kept yellow — they're handles,
  not a passive/active option; legacy SettingsOverlay left as-is, slated to deprecate.)
- ✅ Range: extended-chord tensions carry ♭/♯ (D♭ 9th, A♯ 13th) so the renderer draws
  the accidental to their left; chord row raised (−86 → −108) to clear the setter.
- ✅ Notation carousel: shows EXACTLY N glyphs (no resting lookahead — wrap copies fall
  outside the clip), spread evenly from CLEF_GLYPH_X (active aligns with sheet) → 90%
  of startX; gentle 5%/95% edge fade so the rightmost glyph isn't dimmed.
- ✅ Notation: each clickable clef is now an "instrument clef CARD" — the family clef
  + the 3 reference notes (C4 G4 C5 in G / C3 G3 C4 in F) rendered via MelodyNotesLayer
  and TRANSPOSED by the instrument, so the transposition reads instantly; transposing
  cards add a "(B♭ inst.)" superscript. Per "3 options + a …" the inline set is
  Concert / B♭ / E♭ + a "…" card (clefSelector.instrumentClefCards).
  ⚠ DESIGN DECISION (Han's msg was cut off at "the 3 options + a…"): inline OCTAVE
  variants (8va/15ma) were REMOVED to make room for the cards — they should move into
  the "…" full list. Confirm w/ Han: is Concert/B♭/E♭ the right inline trio, and is
  losing inline octave access OK? Vocal family kept as voice-clef chips (spec only
  addressed G/F).
  [Han 2026-06-02 answers] (a) inline trio → Concert / B♭ / E♭ / **F** + … (add F).
  (b) octaves come BACK — the variant row should be a horizontal **SWIPE carousel** of
  clef cards (same feel as the family carousel). g-clef order: Concert, 8va, 15ma, B♭,
  E♭, F, … then the more obscure transposing instruments OFF-SCREEN (swipe left to
  reveal); wider screens show more cards at rest.
- ✅ FR — **Notation variant-card SWIPE carousel (Han 2026-06-02).** `ClefCardCarousel.jsx`
  — free horizontal drag (tap=select, drag=scroll, disambiguated by movement; px→SVG via
  screen CTM; clamped, no loop, right-edge fade). Strip = octave cards (normal/8va/15ma)
  + all transposing instruments except C. Octave & transposition stay orthogonal fields;
  tapping an active transposing card toggles back to concert C. Vocal kept as evenly-
  spread chips. Tests + build green; documented in architecture.md wave 4.
  ⏳ Follow-up: remove the now-dead `transPicker`/`onOpenInstrumentList` popup wiring in
  SheetMusic; confirm CARD_W (92) / visible count looks right on real device widths.
- ✅ CR: clef SUBTYPES (variant chips) slide out FROM THE CLEF ON THE LEFT — each chip
  carries `data-fly-from={startX}`; useRangeMorph emerges those elements from that x
  (negative offset → slide right into slot) instead of the default right-side fly-in.

## Feedback batch (Han 2026-06-01 #13)
✅ done:
- Chord-style sample now matches the SHEET label exactly: plain serif (NOT italic),
  minor "−" + "7" as a raised superscript tspan (root + super, like ChordLabelsLayer).
- Percussion clef bundle beams as ONE group: rendered via processMelodyAndCalculate
  Slots + MelodyNotesLayer with a [1,2] (odd-numerator) measure so the beam-span
  logic doesn't split it 2+2. Added a ClefStaffOverlay smoke test.
- SETTINGS trigger moved to its OWN SubHeader button (Settings2 icon, next to CLEF).
  Clicking the sheet no longer opens settings (openSettingsIfClosed no longer opens;
  handleSheetMusicClick only CLOSES the legacy surface). handleToggleSettings is
  mutually exclusive with clef/range. Goal: deprecate the legacy surface later.

## Feedback batch (Han 2026-06-01 #12)
✅ done:
- Chord STYLE (off/letters/roman) → CLEF setter (new ChordStyleOverlay), rendered in
  the sheet chord-label font (root 26 / super 16 Georgia italic). Chord COMPLEXITY
  stays in the RANGE setter (ChordStaffOverlay).
- Complexity chords repositioned to 10/30/50/70/90% of the row width (no clipping).
- Clef-setter percussion: two 4-note bundles filling 20–40% and 60–80% of the span
  (NOTE_W = 20%-span / 4), beamed via the real pipeline.

## Feedback batch (Han 2026-06-01 #11)
✅ done:
- Chord row moved to the RANGE setter; complexity chords render as REAL whole-notes
  via MelodyNotesLayer (tonic/power/triad/seventh + the layered "extended"); letters/
  roman show a real progression sample (D⁻ G⁷ C / ii V⁷ I, ~15u apart).
- SETTINGS overlay is now the sliding 'legacy' surface: a 4th morph kind ('legacy'),
  overlayKind/overlayEditMode include it, gated on legacyMounted, animates like
  clef/range (melody flies out, settings flies in). ♭/♯ on extended still TODO-fine.

## Feedback batch (Han 2026-06-01 #10) — REUSE rendering (§6c violation to fix)
✅ done so far: morph re-arms on overlay switch (kind-keyed); percussion beams via
real processMelodyAndCalculateSlots+MelodyNotesLayer; clef glyphs centered
(anchor=middle); diagonal treble/bass divider; full-height percussion hitboxes;
endX measure line.
🔨 still open: chord row → RANGE setter + render via real stacked whole-notes; G-clef
bottom clipping; G-ottava options missing; vocal clef spacing/margin-before-endX;
exact clef alignment with sheet.
🔨 Core issue: overlays re-invent note/chord rendering instead of reusing
MelodyNotesLayer/renderMelodyNotes + ChordLabelsLayer. Fix by reuse.
- CHORD selector belongs in the RANGE setter (not clef). Render the progression with
  REAL sheet rendering: D^- G^7 C  /  ii V^7 I — compact block, ~15u apart, SAME font
  size as the melody.
- Complexity chords: render real whole-notes at chord-rule height like the GENERATOR
  chord-complexity setter: [C4,E4,G4,B4] etc. The "extended" = [C4,G4] + lowlit
  [E4,B4] same span, right-offset [D4,F4,A4] lowlit, with ♭ and ♯ left at D4/A4 lowlit.
- Percussion notes in clef view: use MelodyNotesLayer with proper noteGroupSize/
  measureLengthSlots so the 4 eighths BEAM into a group (not separate flags); tighter.
- Animation: clef→range→clef→range later transitions don't animate. Switching overlay
  must treat the previous as CLOSED so re-clicking re-opens + re-animates.
- Clefs not visually centered in their click area → ugly spacing.
- Still clipping at bottom of G-clef.
- G-ottava (8va/15ma) options missing.
- Vocal clefs: too much spacing, not balanced; need margin before endX.
- Render a vertical measure line at endX.
- percussion + bass clef in clef view not EXACTLY aligned with sheet clefs.
- range setter: line between bass & treble slightly DIAGONAL.
- range setter: percussion click boxes FULL height (just below staff → bottom of
  treble click area).
- clef/range: why are chords not flying in from the right? (stagger/data-fly)
✅ done:
- range overlap fixed: the treble/bass hit-zone divider is now anchored to the GAP
  between the staves (fixed midpoint), not the moving note rows — a high bass range
  no longer pulls the bass zone up into the treble staff.
- chord row: added a CHORD COMPLEXITY sub-row — 5 stacked-notehead chords (tonic,
  power, triad, seventh, extended) spread across startX→endX; writes
  chordSettings.complexity (tonic→root, extended→ninth, canonical so the existing
  complexity stepper + generator agree). Generator aliases 'tonic'/'extended' too.

## Feedback batch (Han 2026-06-01 #8)
✅ done:
- 22ma/22mb: was rendered in Maestro (→ music glyphs, unreadable). Now `Ottava22`
  uses an italic-bold serif "22" + superscript ma/mb → legible.
- 🐞 morph re-arm: cleanup now resetStyles() on interrupt, so a rapid re-toggle
  never leaves a group stuck (the "doesn't trigger after repeated clicking" bug).
- rim-shot slash → TOP-LEFT→BOTTOM-RIGHT ("\", Han corrected mid-round).
- percussion mini-melody → [[k,hh],hh,[s,hh],hh] EIGHTHS, compact bundles at 33/66%.
- chord row: X (tall cross) at startX; letters@33% / roman@66% as real chords (no box).
- variant clefs → true-size ClefGlyph, distributed across startX→endX (no boxes).
- carousel: soft fade at BOTH edges (no hard left clip).
- disable cross 2× taller (same width) — clef gutter, percussion, chord.
- ClefCarousel caps shown glyphs to gutter capacity (fixes "4 perc clefs, 2 options").
- percussion clef aligned to sheet x=18 + clickable (added hit rect).

## Feedback batch (Han 2026-06-01 #7)
1. ✅ Clef setter active on SHEET → keyboard shows the RANGE setter (TabView swaps
   KeyboardRangeSetter when rangeEditMode || clefEditMode; clefEditMode threaded).
3. ✅ GHOST STAFF generalised: disabled staff shown in any settings view, notes +
   clef glyph at opacity 0.4 (GHOST_OPACITY), staff lines/barlines normal;
   interacting (clef carousel / X toggle) re-enables. (Restore-exact-prior-clef is a
   refinement; re-enable currently sets a sensible default clef.)
2+4. DESIGN proposed below — see docs §37.5 (PLAYBACK / EXERCISE setters design).

### Design (items 2+4): playback/exercise in-staff setters
Two new in-staff overlay modes, both ghost-aware, mirroring clef/range:
- EXERCISE setter (global, song-level): #measures, #repeats (`repsPerMelody`),
  total-melodies. Rendered above the system (not per-staff) since they're global.
- PLAYBACK setter (per-staff × per-round): visibility (eye), audibility (volume
  0–1), per round (odd/even). Each staff gets an eye + a volume control in its
  gutter; a round toggle (odd/even, or "round 1 / round 2…") switches which round
  you're editing. Chords + metronome are pseudo-staves with the same controls.
See §37.5 for the full option→overlay mapping.

1. When clef setter active on the SHEET → show the RANGE setter on the keyboard
   (dual-surface: clef-on-sheet pairs with range-on-keyboard).
2. DESIGN the next setters: migrate playback / exercise settings — #measures,
   #repeats, per-repeat visibility + audibility, volume — into in-staff overlays.
3. GHOST STAFF (generalise): in every settings view show ALL staves, grey out
   options for disabled staves; interacting re-enables the staff (restoring most
   recent settings). Barlines render normally; notes + other "settings" at
   opacity 0.4.
4. Propose which options logically suit the repeat vs playback overlays.

## Feedback batch (Han 2026-06-01 #6)
✅ done:
- CHORD X already = hide + mute + KEEP generation (confirmed; no change needed).
- Chord selector moved INTO clef-edit mode; removed standalone CHORDS button +
  all chordEditMode plumbing (App/SheetMusic/SubHeader). §37.3.
- 22ma/22mb: Maestro = a custom TrueType music font (ASCII→PUA F0xx), pre-composited
  ottava glyphs only to 15 (no 22). Added `Ottava22` composite (font digits "22" +
  superscript ma/mb at 15ma style) + treble/bass22va/vb in clefSymbols. Renderable
  asset ready; not yet a selectable option (gen maxes at 15ma). §37.4.

## Feedback batch (Han 2026-06-01 #5)
✅ done: fade-out 0.25s (FADE_OUT_MS); clef clip taller (no bottom clipping) +
   step 36u (more space); loop carousel (ClefCarousel: slide-left + re-enter from
   right under a fade mask); percussion notes use real MelodyNotesLayer; percussion
   X disable (2-item carousel) → preferredClef 'off' hides/empties/skips-gen; perc
   clef aligned to CLEF_GLYPH_X.
⏳ BACKLOG (small): custom 22mb/22ma combined clef glyph — needs a Maestro asset
   (no font glyph exists); logged in BACKLOG.
- ANIM: make the FADE-OUT very short — 0.25s for all transitions.
- CLEF: clipping at the BOTTOM of the clefs (clip rect too short) → fix.
- CLEF: clefs too close together → more space (~10 units between).
- CAROUSEL rework: label clefs 1-2-3-4, 1 active. Click 3 → slide ALL glyphs 2 steps
  left; 1 & 2 leave the screen; meanwhile fresh 1 & 2 slide in from the right with a
  fade-in (masking fade where they emerge). True loop carousel.
- CLEF PERCUSSION: the drum notes + clefs in the clef selector use TINY font, not the
  real assets → render them like the melody (real MelodyNotesLayer noteheads/glyphs).
- CLEF PERCUSSION: add an X (disable) for percussion too — a carousel of 2 (perc / off).
- CLEF PERCUSSION: the percussion clef is NOT at the exact same x as in the carousel
  / sheet → align it.

## Feedback batch (Han 2026-06-01 #4)
✅ done this round:
- range notes now stagger (data-fly on all note groups); morph has ease-in/out.
- clef glyphs reused from sheet (`clefGlyphs.jsx` ClefGlyph + clefSymbols single
  source); carousel current clef at exact sheet pos, slides (clipped to gutter).
- range sheet lowlight → `--range-lowlight` (match percussion + slightly lighter).
- keyboard bracket: passive=solid, dotted line bridges the gap (no stretched "…").
- bass-too-high: capped window growth (MAX_CONTEXT) + uncapped spacing.
✅ chord selector: in-staff CHORD mode (CHORDS button → chordEditMode), X/letters/
   roman over the chord row. X = chordDisplayMode 'off' → hides labels + mutes audio
   (chordsDisabledRef → Sequencer chordVolume=0). Generation-disable parked. Time-sig
   now hidden in any overlay mode. §37.3.
🔨 original list:
- ANIM: range-overlay notes still fly as one block (no per-note markers) → thread
  data-fly through the range overlay note layer so they stagger like the melody.
- ANIM: give all morph animations a subtle ease-in/ease-out (start/stop).
- CLEF SELECTOR: reuse the EXACT sheet-music clef glyphs incl. baseline/height
  offset + font size + the custom combined glyphs (clef+15 etc.); height carries
  meaning — reuse the already-defined `clefSymbols` rather than my own glyphs.
- CLEF SELECTOR: remove the (now doubled) sheet clef; place the selectable current
  clef at the EXACT sheet clef position (check the left offset, ~x=13, content
  margin ~10). New carousel clefs SLIDE IN FROM THE RIGHT (not fade). Use space all
  the way up to startX.
- CLEF/RANGE: remove the measure-type (4/4 or C) when either selector is active
  (already done for clef; ensure for range too).
- RANGE KEYBOARD: passive (behind) clef bracket = SOLID line, not dotted. The "…"
  is stretched into 3 long lines → instead draw a DOTTED HORIZONTAL line between
  where one bracket hook ends and the next begins; remove the stretched ellipsis.
- RANGE SHEET: lowlighted treble/bass notes too light → match percussion-note color,
  and make all of them slightly lighter still.
- RANGE SHEET BUG: bass range selector goes way too high — the hit box stretched to
  include the chords row, overlapping the treble staff. Fix the box extent.
- CHORD SELECTOR: still missing — implement the chord type selector (as described).
- CHORDS: add a 3rd visualisation option = X (disabled).

✅ done:
- Staggered per-element fly-in in `useRangeMorph` (notes stream in by x, rightmost
  starts at 0.5s, each slides 1s → total 1.5s; group fades for non-note elements;
  falls back to block-slide if no `[data-mel]`/`[data-fly]` markers). Clef chips get
  `data-fly`; real melody already has `data-mel`.
- 'off' staff: empty generation (`useMelodyState`), no elements rendered
  (`EMPTY_MELODY`), hidden in melody mode (visibility excludes off staves).
- NOTE: sheet overlays being migrated → not extending them for new CRs.
🔨 (original notes below)
- Staggered fly-in: rework `useRangeMorph` so EACH element between startX..endX flies
  in individually with a slight per-element delay (notes look like they fly in, not a
  block). Other elements fade. Total 1.5s (anim ~1s, rightmost starts ~0.5s).
  Applies to melody, range setter, clef setter.
- Disabled staff (`preferredClef:'off'`): render the staff normally but with NO
  elements on it.
- Melody mode: HIDE a staff whose clef is disabled; also SKIP its melody generation.
- NOTE: sheet-music range/clef overlays are being migrated to separate overlays —
  do NOT keep updating them for new CRs (Han).

Decisions: new `preferredClef:'off'` field · clef-click = open selector (replace old)
· perc toggler = mini-rhythm · last pad not removable.
- ✅ clicking the clef glyph opens the CLEF selector (old tap-cycle + popup removed).
- ✅ ≥1 enabled pad enforced (togglePad refuses to remove the last).
- ✅ 4th family = large CROSS (`CLEF_OFF`); patch/clef-calc/visibility plumbed safe.
- ✅ vocal voices fixed: added Baritone, each shows its real clef GLYPH, Bass≠
  instrumental bass (matched on rangeMode). Pure helpers + tests updated (10 cases).
- ✅ Polish wave done: carousel left of startX + real-size + slide/fade; time-sig &
  static clef hidden in clef mode; octave variants as full ottava clef GLYPHS;
  percussion clef block with together↔split mini-rhythm toggler.
- ✅ range setter sheet: notes distribute across full width when few selected.
- ✅ range setter keys: bracket highlight follows staff clef; behind bracket dashed
  + left-corner-only (`⌜- - - … ⌜- - - ⌝`).
- ⏳ Still open: disabled ('off') staff greyed-out-but-visible in other modes with
  clickable cross (now 'off' only short-circuits clef calc).

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
