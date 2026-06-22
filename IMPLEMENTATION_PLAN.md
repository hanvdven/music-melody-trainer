# Implementation Plan — live log

> Standing rule (Han 2026-05-31): log **every** plan, CR (change request), FR
> (feature request) and bug here **immediately**, as a short implementation plan,
> before/while implementing. This file is the running scratch-plan; BACKLOG.md
> stays the user's source of truth for feature text.

Status keys: ✅ done · 🔨 in progress · ⏳ backlog/next phase · 🐞 bug

## 2026-06-22 — 🔴 P0 Kanban-board (cyanluna.skills) — ⏳ backlog (tooling, NOT app feature)
Setup runs on Han's LOCAL machine (remote container is ephemeral/unreachable). Needs Neon PostgreSQL,
Node+pnpm, third-party skills repo (7 autonomous agents). Steps: clone → cp kanban* to ~/.claude/skills
→ cd ~/.claude/kanban-board, cp .env.example .env, pnpm install, set DATABASE_URL → /kanban-init in
project → ./kanban-board/start.sh (localhost:5173). 7-col pipeline Req→Plan→ReviewPlan→Impl→ReviewImpl→
Test→Done. ❓ awaiting Han: local vs remote. See BACKLOG.md P0 entry.

## 2026-06-22 (cont.2) — Carousel batch: setters→carousel, instrument re-cat/re-icon, perc-kit carousel (Han)
Interview answers: setters in carousel-style = FULL 5-wide carousel per field (lucide icons for now,
icon + label below + category bracket above; maestro glyphs were unreadable); percussion-kit carousel =
CATEGORIZED, ALL kits; instrument-carousel icons +15%. Icon-asset reality: only 22 icons8 PNGs exist in
src/assets; accordion/contrabass/harmonica/synth/stage are NOT in the repo → placeholder existing icons
now + flag for Han to drop icons8-{accordion,contrabass,harmonica,stage,synthesizer}-100.png.
- 🔨 (A) GENERATION + GENERATION ADVANCED setters rebuilt in carousel style: each field = a 5-wide
  NonLinearCarousel, lucide icon + text label below + category/field bracket above. Replaces the
  SvgSetter+maestro-glyph cells. Per balk (treble/bass/perc + chords). Wiring unchanged (same fields).
- 🔨 (B) Subtle per-category CSS colouring in the instrument carousel (item text + bracket), theme-aware
  vars in App.css keyed on the new top categories.
- 🔨 (C) instruments.jsx re-categorise + re-icon. New top categories: keys / guitars / bass guitars /
  strings / wind / percussion tuned / voice / synth (NEW). Adds: accordion, distorted electric guitar
  (distortion_guitar), contrabass, harmonica, xylophone, synth square/lead/pad. Re-icons: steel=guitar
  (nylon), acoustic bass=guitar, electric/distorted=rock-music, vibraphone=xylophone, voice oohs=choir.
  Placeholders for the 5 missing assets, flagged.
- 🔨 (D) Percussion KIT carousel (instrument setter, percussion balk): categorized —
  · "Sampled" → [FreePats Percussion], icon8 basename drum-set
  · "Drum machines" → [TR-808, Casio RZ-1, LM-2, MFB-512, Roland CR-8000], icon8 basename drums
  · "Acoustic MIDI" → [standard, jazz, electronic] (GM Soundfont; ADD jazz per Han), icon8 basename synthesizer
  Writes percussionSettings.instrument; exposes the dormant GM-acoustic kits. Icon assets drum-set/
  drums/synthesizer don't exist yet → placeholder + TODO(icons8) until Han drops icons8-{drum-set,
  drums,synthesizer}-100.png (Han 2026-06-22: "Drum Set=samples, Drums=tr808/machines, Synthesizer=midis").
- 🔨 (E) Instrument-carousel icons +15%.
- ⚠ §6d note: setter category-brackets reuse the NonLinearCarousel primitive; bracket-DRAW may briefly
  duplicate InstrumentStaffOverlay.bracketGeom — flag for later consolidation into a shared helper.

## 2026-06-22 (cont.) — Han batch: corrections, new FR, instrument feedback, parked items, research
- ⚠ Generator setters: "balk" includes CHORDS (see corrected entry below).
- ⏳ NEW FR "REPEAT AFTER ME" (call-and-response practice): chop a long song into chunks for repeat
  blocks — e.g. HBD by ear: play 2 bars (teacher), player plays them back, advance to next 2 bars.
  Captured in BACKLOG; NOT built yet (focus = the 3 setters). Touches Sequencer repeat/segmentation +
  a new practice mode; needs §4b interview (chunk size fixed/selectable? listen-detection vs timed?).
- ⏳ INSTRUMENT CAROUSEL feedback (rename/re-icon + new categories/instruments) — captured in BACKLOG
  under the instrument selector; edits src/constants/instruments.jsx. NOT built this round.
- 🐞 BUG (Han 2026-06-22): after changing the instrument MANY times, no sound. Likely smplr instrument
  re-creation leak / AudioContext or instrument-cache issue in useInstruments.js. Captured; serious;
  next-after-setters candidate.
- 🅿️ PARKED at Han's request ("vink af" 2026-06-22) — removed from the active open-items list, NOT
  implemented: (a) transposition non-linear 'tangens' curve (blocked on Han's drawing); (b) two-octave
  range C2→C6 with octave clefs; (c) carousel preset-click tween-to-value; (d) range-setter polish
  (lyrics/label space, 8va/8vb extent, percussion notePool→randomizationRule move).

### Research answers (Han's two questions, 2026-06-22)
- Q: "Where is the phase that generates a NEW melody from SONG-STRUCTURE / parameters?" → DOES NOT
  EXIST in code; it's the DEFERRED backlog item "1B" (generate missing staves on load from chords/
  melody) + "apply 3 (generation settings) upon loading". Song-load path (handleLoadSong →
  resolveLoadedSong.js → loadSong.js) only PARSES fixed JSON staves + transposes; the generator
  (src/generation/) runs only in random/continuous mode, NOT constrained by a loaded song's chords/
  form/difficulty. Infrastructure exists (parsed defs + generator pipeline); the "constrain generator
  to song structure" WIRING does not. Would live in handleLoadSong/resolveLoadedSong post-parse +
  a constraint interface into melodyGenerator/generateBackbeat/chordGenerator. Status: ⏳ DEFERRED.
- Q: "Where are the open tech-debt / refactor blocks?" → Per THIS plan log, Architecture-audit
  Phases 0, 1, 2 are ✅ DONE (2026-06-19 entry); docs/ARCHITECTURE_AUDIT.md is the ORIGINAL roadmap,
  not current state. Genuinely-OPEN tech-debt residue:
  · ⏳ Phase-2-adjacent (left entangled): series-boundary regen + JIT inside Sequencer.start();
    deeper randomizeScaleAndGenerate orchestration (display-note map still duplicated ~3×).
  · 🐞 Tuplet slot/length mismatch ([3:2]q w → phantom rest) — needs "refactor to events" or targeted fix.
  · ⏳ Percussion STYLE on notePool → move to randomizationRule (partial: coarse chooser sets enabledPads).
  · ⏳ Anacrusis Phase 2 STEP 2 (notation/numbering sync) + Phase 3 partial (first-pass pickup/fermata rebase).
  · 🐞 Indefinite-repeat encoding split (Infinity vs -1) — normalization pending.
  · 🐞 Metronome stale on song load (wrong meter, ignores fermata) — root of HBD "extra count".
  · ⏳ Range R1–R4 (per-note cascade, keyboard-trigger, bound-flash 🐞, yellow→white boundaries).
  · ⏳ Legacy 'settings' overlay redundant once PLAYBACK setter lands — deprecate later.
  · ⏳ icons8 image assets blocked (in PR #31, not on this branch).
  · ⏳ Test gaps: Sequencer.js (0 direct tests beyond the Phase-2 harness), useSheetMusicHighlight pure helpers.

## 2026-06-22 — In-sheet GENERATOR setters: PLAYBACK / GENERATION / GENERATION ADVANCED (Han)
Interview done: "balk" = per STAFF (treble/bass/perc), NOT per measure (no per-measure model exists —
confirmed); THREE separate setters/overlay-kinds; FULLY WIRED to InstrumentSettings now; field
mappings taken verbatim from the bottom-view (InstrumentRow).
- 🔨 PLAYBACK setter = REUSE SettingsOverlay (numMeasures, numRepeats, per odd/even-round
  visibility+volume per staff) under a new overlay-kind via a groupClassName prop — NOT a code copy
  (§6c). Legacy 'settings' overlay kept for now (now redundant; deprecate later — flag to Han).
- 🔨 GENERATION setter (per staff): melody notes=notePool, melody type=randomizationRule/play-style,
  notes per measure=notesPerMeasure.
- 🔨 GENERATION ADVANCED setter (per staff): variability=rhythmVariability, span=maxLeap,
  tuplets=polyMultiplier, smallest note=smallestNoteDenom.
- ⚠ CORRECTION (Han 2026-06-22): "balk" INCLUDES the CHORDS row → chords are a 4th balk in the
  generator setters. PLAYBACK already covers chords (SettingsOverlay renders a chords row).
  GENERATION chords-row = complexity / strategy / chordCount; GENERATION ADVANCED chords-row =
  passingChordTypes (other advanced melodic columns N/A for chords). Wired via chordSettings/
  setChordSettings. Mapping flagged for Han to confirm.
- Plumbing: 3 new overlayKinds (useRangeMorph.groupsForKind + SheetMusic overlayKind ternary +
  mountedFor + render blocks); 3 edit-modes + mutual-exclusion toggles in useEditMode; App threading;
  3 SubHeader buttons (lucide + active-glow). Reuse SvgSetter + Maestro glyphs (§6d); RuleSelector/
  PlayStyleSelector can't render in-SVG (return null) so steppers rebuilt with SvgSetter. Wired via
  useInstrumentSettings. Debug hitboxes §3a; Unicode accidentals §5b.

## 2026-06-19 — Transposition setter + flash + staff-spacing batch (Han)
Interview answers: flash at setter OPEN/CLOSE + BETWEEN setters; transpose layout = abstract 20u
grid (C4 centred, C↔B♭ & F↔E♭ aligned); keyboard colour follows transposed note.
- ✅ Flash at setter open/close + between setters FIXED: morph armed DURING render (prevKindRef +
  activeMorphRef) instead of a stale useLayoutEffect setState, so the gate is correct on the same
  render + tween initial styles land pre-paint (§6). +open/close/rapid tests. (`3b5ac50`)
- ✅ Transposition: keyboard chromatone colour follows transposition (getKeyStyle uses tn(note)). (`42a5129`)
- ✅ Transposition setter layout: abstract 20u grid, C4 at midY, C↔B♭/F↔E♭ aligned, carousels
  toward '=' (+25/−10), presets between, LABEL_SIZE 18→22 — consts at top for live tuning. (`c9e3004`)
- ✅ Transposition setter keyboard: C-key glow (canonical box-shadow) + "tap a key to…" text removed
  (glow on literal C, not transpose-target C — flagged). (`42a5129`)
- ✅ Staff vertical MIN gap +10u (minGap 29.5→39.5); baseGap=70 unchanged so tall screens (≥400px)
  are unaffected — only squeezed layouts widen. ⚠ if Han wants the gap bigger on big screens too,
  bump baseGap. (`3b5ac50`)

## 2026-06-19 — Setter-carousel + range-setter feedback batch (Han) — interview done, SHIPPED
Interview answers: fly-in = each CAROUSEL ELEMENT one-by-one (both carousels, shared module);
shrink |interval| = note ORDINAL count (below 8 = no shrink); 5→7 = same card size, wider;
chord names = yes, discreet. All behavior-correct + tested; needs Han LIVE tuning (magnitudes).
- ✅ Colour carousel: NOTE_SPACING 13 → 11 (between example noteheads). (`f374682`)
- ✅ Instrument carousel 5 → 7: visibleHalf now a prop, instrument passes 3, same card size. (`f374682`)
- ✅ Per-element fly-in cascade (BOTH carousels, shared NonLinearCarousel): each item wraps in an
  outer <g data-fly> (cascade) + inner <g ref> (carousel transform) so they compose; parent-group
  data-fly removed. ⚠ stagger uses getBBox().x — LIVE-verify it reads as a cascade. (`f374682`)
- ✅ Chord setter alt/ext columns closer: EXT_ACC_DX 16→12, EXT_COL_DX 22→16. (`0254839`)
- ✅ Chord setter type labels under each: root/power/triad/seventh/altered-extended, discreet
  (fontSize 10, --text-secondary); 2026-05-31 removal reversal documented. (`0254839`)
- ✅ Range setter middle shrink span-aware: rangeMiddleMinScale(oSpan) — <8→1.0, 8→0.9, ≥12→0.5,
  interp; bow generalised to minScale+(1-minScale)*easeInOut(uMid). (`c9d11f0`)

## 2026-06-19 — Architecture audit + refactor Phases 0 & 1 (Han: "doe fase 0 en 1")
Audit report: `docs/ARCHITECTURE_AUDIT.md`. All work behavior-preserving (§4b pure-refactor
exception); 386 tests green, build + lint (0 errors) clean.
- ✅ **Phase 0** — doc-drift fixes (`pregenResult`, `E010-PLAY-MELODY`, `calculateAllOffsets`);
  lint made a required gate (§7b); dead code removed (`appConfig.js`, `PlaybackStateContext`,
  ~truly-dead exports; audit-flagged internal helpers only de-exported, not deleted); SSOT helpers
  `stripOctave` + `chromatoneMix` (noteUtils, byte-identical); `Song` test + 2 invariant grep-guards.
- ✅ **Phase 1** — tempo helpers `secondsPerTick/ticksPerSecond/secondsPerBeat` (timing.js) replacing
  scattered `5/bpm`; note-colour consolidated to canonical `melodicNoteColor`/`chordNoteColor`
  (tonic_scale_keys + percussion branches left per byte-identical analysis); `clefResolution.js`,
  `useEditMode.js`, `LyricsLayer.jsx`+`FermataLayer.jsx`, `useRubato.js`, `resolveLoadedSong.js`
  extracted from the god-files; generation-pipeline golden test (§6b guard).
- ✅ **§6b parser pass** (Han: "doel de 6b pass") — consolidated name→MIDI to `noteToMidi()`;
  generation's off-by-12 confirmed RELATIVE-only (range bounds parsed by the same parser, cancels)
  and preserved via `base:-12`; audit's "4 parsers" corrected to 2 (musicUtils.getNoteIndex returns
  an array index; usePitchDetector is Hz→MIDI/MIDI→name, not a parser). Proof-test pins old numbers.
- ✅ **Phase 2** (Han: "dan fase 2") — built characterization HARNESS first (18 tests pinning
  armPaginationSequence schedule, sessionAbort, randomizeScaleAndGenerate shape, beamGroups), then
  the splits behind it: `computeBeamGroups.js` (grouping math; beam-line geometry stayed),
  `generateNextSeries.js`+`transposeDisplayNotes.js` (Sequencer −187 lines, restores §8 boundary),
  `Sequencer.start()` → `scheduleBlock`/`scheduleTransitions` (990→517 lines; series-regen+setup
  stayed inline; sessionController capture + batching + scheduling byte-identical). 427 tests green.
- ⏳ **Still Phase-2-adjacent, NOT done** (entangled, left per conservative mandate): the
  series-boundary regen + JIT inside `start()`; deeper `randomizeScaleAndGenerate` orchestration.
- ⚠ Refactors are behavior-identical by construction + guarded by the harness, but a quick LIVE
  sanity pass is still wise (playback/page-turns/transitions, lyrics, rubato, song-load, colours).


## 2026-06-18 — Carousel/range/transition feedback batch (Han)
- ✅ Carousels FULLY FLAT (both): NonLinearCarousel scaleForDist→1 (no shrink) + linear x; edge
  opacity fade is the only "more" cue. Colour-carousel label lowered (LABEL_DY=78). (`be34da4`)
- ✅ Instrument labels = "family (subgroup)" bracket + short "variant" card name (e.g. group
  'strings (guitar)' + name 'nylon'); bracket groups by new `group` field; instrumentFullLabel()
  keeps RangeControls unambiguous. Slugs/icons unchanged. (`be34da4`)
- ✅ Range jitter killed: runRangeCascade self-raced (sync frame(t0) + its own rAF = 2 loops). Now
  one rAF, easeOutCubic/280ms (shared curve w/ TranspositionSetter §6d), stagger kept. (`b2c92bc`)
- ✅ Active boundary noteheads light up: reuse #note-glow-subtle (the .note-active look). (`b2c92bc`)
- ✅ 1-frame melody flash on overlay→overlay switch fixed: pure melodyHiddenDuringOverlay() gate,
  stale melody-leave morph no longer force-shows the melody (kind===morphTo guard). (`dcc14dd`)
- 320 tests green, build clean. ⚠ ALL need Han's LIVE view (flatness/spacing, label split,
  cascade smoothness, lit heads, no-flash) — none verifiable headlessly.

## 2026-06-18 — FRESH STATUS LIST (Han asked for a new list; old list was all done)
Everything from the prior outstanding list is implemented + pushed (310 tests green). What
genuinely remains is (A) Han's LIVE verification and (B) decisions/bugs needing Han's input.

**A. Needs Han's live test (implemented, not verifiable headlessly):**
- 👀 Carousel feel — horizontal shrink amount + spacing, category-header edge-pin (jitter gone?),
  cyclical wrap (`528b46a`,`195bc96`,`9620753`).
- 👀 icons8 — nearest-match picks readable at size + correct (`b048ef1`).
- 👀 Range R1/R2 cascade timing (220/140ms), R3 flash gone, R4 white boundaries on LIGHT themes,
  hold-extend grace (`13f8066`).
- 👀 Difficulty → song reloads at new difficulty, only for selected songs (`da86de9`).
- 👀 HBD: first-pass pickup bar shows pass 1 / gone on repeats + highlight aligned; fermata on right
  note; even-repeat anacrusis present; numbering 1.1/1.2…; ∞ suffix climbs unbounded; per-round
  visibility honoured (`7df8ac0`,`ab08ee1`,`b271765`,`3119a72`).

**B. Needs Han's decision / open bug:**
- 🐞 INDEFINITE-repeat encoding split: SettingsOverlay stepper sets `repsPerMelody=Infinity`, but
  Sequencer loop + NumberPicker use `-1`. ∞-numbering + the loop's iteration reset key on `-1`, so the
  Infinity path is broken for indefinite. Needs normalization (pick one encoding). Interview pending.
- ❓ Carousel "horizontal, not a dial" — Han to confirm the exact intended behaviour (still open per his
  own note) before any further carousel change.

## 2026-06-18 (cont.) — UNBOUNDED repeat-numbering for INDEFINITE repeats (Han)
- ✅ #3b INDEFINITE repeat suffix now GROWS UNBOUNDED (maat 1 pass 7 = "1.7", pass 1000 = "1.1000";
  no cap, no reset). Removes the "known limitation" flagged in §40b / the 2026-06-18 entry below.
  ROOT: planner resolves repsPerMelody=-1 to 1 → _armPaginationSequence re-arms EVERY pass; the finite
  path refreshes blockPlayStart=sequenceStartGlobalMeasure each pass → suffix pinned at 1.
  FIX (Sequencer.js): new per-session field `repeatNumberingOrigin` (null until first indefinite arm
  captures sequenceStartGlobalMeasure); in the arm callback, when `isRepeatMode && repsPerMelody===-1`
  PIN blockPlayStart to that frozen origin (never refresh) → computeRepeatPass climbs unbounded.
  FINITE keeps refreshing (cycles 1..N — not regressed). blockMeasureStart refreshed in BOTH modes so
  the BASE measure number N stays 1..numMeasures (only .repeatNum grows). Re-arm/scheduling untouched
  (Song append-only, indices monotonic §6).
- SCOPE = BOTH loaded songs AND generated melodies: both reach indefinite repeat via handlePlayRepeat →
  start(...,repeatForever=true) looping the SAME melodies (no regen — isRepeatMode short-circuits), so
  one signal (repsPerMelody===-1) covers both, no per-source branching.
- ⚠ OPEN INCONSISTENCY (flagged, NOT changed): SettingsOverlay repeats stepper sets repsPerMelody=
  Infinity ("À"), but Sequencer loop + NumberPicker use -1. Unbounded numbering keys on -1 (matches the
  loop's `repsPerMelody !== -1`). The Infinity path also never resets iteration → needs separate
  normalization. Raised for Han.
- ⚠ UNVERIFIED w/o live repro (Han to test): the running suffix climbing on screen across a long
  indefinite session.
- Tests: replaced the stale "monotonic (deferred)" test with an UNBOUNDED-origin test (pass 7→7,
  23→23, 998, 1000 + strict-monotone 1200-pass loop) and a FINITE-cycling guard (1..N). 309→310 green.
  Build clean. Docs: §40b "Known limitation" replaced with #3b unbounded behaviour + the Infinity/-1
  note. computeRepeatPass header comment updated.

## 2026-06-18 — HBD anacrusis Phase 3 (leading pickup bar) + repeat-numbering parity (Han)
- ✅ #2A LEADING PICKUP BAR on the FIRST pass (arch §40b). New pure helpers in anacrusisRepeat.js:
  `mergedBodyPassIndex` (SESSION-global pass index — pickup bar shows only on pass 0, because the
  audio lead-in plays once per session, not per block), `showsLeadingPickupBar`,
  `buildFirstPassMergedMelodies` (prepends original m0 pickup to the merged body shifted +1 bar; same
  buildAnacrusisRepeatParts core, fermatas at ORIGINAL ticks). App.jsx mergedRenderMelodies memo now
  pass-aware: pass 0 → first-pass melody rendered through the ORIGINAL anacrusis path
  (mergedBodyMeasures=null + anacrusisMeasureIndex=0 → existing pickup-suppression + 1..N numbering,
  §6d no new barline code); pass ≥2 → plain merged body. §40a highlight invariant preserved via
  `renderStartMeasureIndex = startMeasureIndex − 1` on pass 0 (pickup bar → unhighlighted index, body
  realigns to schedule's globalMeasureIndex 0..N).
- ✅ #3 REPEAT NUMBERING replicates the generated path (Han's directive: "replicate the existing
  melody repeat logic", no new infinity mechanism). ROOT CAUSE: isRepeatMode short-circuits before
  the series-flip so blockMeasureStart/blockPlayStart were stranded while startMeasureIndex advanced
  → suffix overflowed ("11" instead of "1.x"). FIX: `_armPaginationSequence` initial callback now
  refreshes both counters for isRepeatMode using applyResultToSetters' EXACT formula (§6c). Suffix
  math extracted to pure `computeRepeatPass` (src/utils/repeatNumbering.js); BarlinesLayer uses it.
  Result: suffix CYCLES 1..repsPerMelody per block (finite case Han reported).
- ⚠ LIMITATION (flagged): if repsPerMelody === -1 the planner resolves it to 1 → re-arms every pass →
  suffix pins at 1 (not growing). True indefinite-growth needs the planner to stop re-arming — the
  directive deferred that. Finite case (the reported bug) is fixed.
- ⚠ UNVERIFIED w/o live repro (Han to test): exact frame the pickup bar appears/disappears at the
  pass-0→pass-1 boundary; highlight alignment on pass 1; the even-repeat anacrusis sub-report.
- Tests +15 (294→309 green): mergedBodyPassIndex/showsLeadingPickupBar/buildFirstPassMergedMelodies
  in anacrusisRepeat.test.js; computeRepeatPass cycling/overflow/monotonic in repeatNumbering.test.js.
  Build clean. The two just-landed fixes (fermata rebase, #4 per-round) left intact.

## 2026-06-17 (cont.) — Carousel feedback ROUND 2 (Han) + honest outstanding list
- ✅ Colour notes: RESTORED C4→C5 ascending (the "flatten the wheel" was MY MISREAD — Han wanted
  the CAROUSEL horizontal, not the notes). getNoteAbsoluteY + ledgers + clefTreble back.
- ✅ Carousel "horizontal not a dial" = MUCH MILDER shrink (Han chose): scaleForDist 1.0→0.45 → 1.0→
  0.82, both setters (shared primitive).
- ✅ icons8 credit centred DIRECTLY BELOW the carousel (was left-aligned below the staff).
- ✅ Category-header EDGE-PIN (anti-jitter): when a run's outer item is the outermost-visible item,
  pin that bracket end to the fixed carousel edge (centerX±EDGE_X) instead of the shrinking item x.
- ⚠ I OVERSTATED progress ("queue is clearing"). OUTSTANDING (honest): range R1–R4 (per-note
  cascade, trigger-on-keys, bound-flash 🐞, yellow→white boundaries); difficulty→reload-loaded-song;
  HBD #2/#3/#4 (DIAGNOSED — see HBD diagnosis below — pending Han's §4b answers).
- HBD DIAGNOSIS DONE (read-only): #2 = Phase-3 first-pass pickup gap + fermata rebased for audio
  not render (anacrusisRepeat.js toRenderBody / SheetMusic.jsx:1560 indexOf(f.tick)); #3 = repeat
  numbering desync past numRepeats (BarlinesLayer.jsx:120-136 + skipped series-flip in isRepeatMode;
  fix = repsPerMelody→∞/no-series-flip); #4 = App.jsx:1375 viewMode ternary keys on
  isPlayingContinuously, but songs play via handlePlayRepeat (isPlayingMelody) → static oddRounds
  branch. Interview questions pending (esp. #2 first-pass layout).

## 2026-06-17 (cont.) — Carousel feedback + range-selector batch (Han)
CAROUSEL / coloration:
- ✅ Restore colour example notes to full C4–C5 run (had dropped to 5). NoteColoringStaffOverlay NOTES.
- ✅ Widen both carousels +40% (instrument BASE 40→56, colour BASE 96→134).
- ✅ Lower the category label (instrument HEADER_DY -16→-10).
- ✅ Instrument names → "strings (guitar nylon)" etc (Han: "we agreed strings (guitar)").
- ✅ Carousel CYCLICAL (wrap-around / infinite). NonLinearCarousel: posRef free + wrapPos[0,N),
  signedDist nearest-wrap render, no clamp on drag/glide, shortest-path animatePosTo, commit maps
  back to real index. visibleRange now returns an ORDERED wrap-aware ARRAY. (2026-06-17)
- ✅ Category label LIVE-MOVING with the carousel during drag (Han: worth the cost). New optional
  onPosChange(pos) on the primitive → InstrumentStaffOverlay.updateHeaders drives a fixed pool of
  MAX_HEADERS bracket <g> slots imperatively each frame (§6, no per-frame React state; morph-safe).
- ✅ "Flatten the wheel" (clarified): COLOUR example notes now on ONE horizontal baseline
  (middle staff line, FLAT_DY=20) — horizontal colour swatch, getNoteAbsoluteY + ledgers removed.
  Instrument setter already flat (left as-is). Tests +5 (291 green), build clean, docs §38 updated.
- ⏳ icons8 IMAGE wiring: assets are in PR #31 (50/100px PNGs) on its branch — bring them onto this
  branch, then getInstrumentIcon returns <image> + flip ICON_ATTRIBUTION. ("didn't use icons8 yet").
  Han 2026-06-17: use the 'Rock Music' icon8 icon for ELECTRIC GUITAR + ELECTRIC BASS; KEEP the
  mandatory 'Icons by Icons8' credit visible while the setter is open.
- ⏭️ NEXT after carousel-v2 + icons8 (Han 2026-06-17): continue with HAPPY BIRTHDAY song bugs
  (#2 first-pass anacrusis/fermata + even-repeat anacrusis, #3 repeat numbering / indefinite=∞,
  #4 song per-round visibility/audibility) — the unfinished anacrusis phases (§40).
RANGE SELECTOR batch (separate subsystem — next focused effort):
- ⏳ R1 After-selection animation feels cumbersome → animate/slide PER NOTE in quick succession
  (staggered cascade) instead of all-at-once. (reuse flyInCascade-style stagger in RangeStaffOverlay.)
- ⏳ R2 Trigger the SAME animation when range changed via the KEYS (keyboard range setter).
- 🐞 R3 Keyboard range setter: the range bound FLASHES briefly when the keyboard adjusts.
- ⏳ R4 Boundary highlight YELLOW→WHITE (chromatone visibility): keys, notes, preset brackets, the
  selected bracket, and the boundary setter on the keys — all white.

## 2026-06-17 (cont.) — UI redesign: NonLinearCarousel primitive + setters
- ✅ NEW shared `NonLinearCarousel.jsx` primitive: ~5 visible items, middle = active, sides
  fade+shrink (eased symmetric falloff); BOTH tap (glide-to-centre) and drag (settle-snap)
  select; CTM px→user + tap-vs-drag borrowed from ClefCardCarousel; opacity/scale/x via
  element.style in rAF (§6); §3a debug hit box. Smoke test added.
- ✅ InstrumentStaffOverlay rebuilt on primitive, per staff; icon 22→33 on staff, name below,
  dynamic CATEGORY bracket (8va "blokhaken" look) above — shown when 2+ of a category visible,
  centred over its run; SVG-native + data-fly (morph kept).
- ✅ NoteColoringStaffOverlay rebuilt on primitive; reorder+rename none→chord→scale→chromatone→
  subtle chromatone ('tonic_scale_keys' value kept, label→Scale). COLOR_MODES order+labels
  updated in SubHeader / RangeControls / SettingsPanel.
- ✅ Clef now always shows in colour menu (removed colorEditMode guard in SheetMusic ~L1951);
  F-major g-clef "missing" was just that guard — clef char is key-independent.
- ✅ docs/architecture.md §38 added. Tests 276→286 green, build clean.

## 2026-06-17 (cont.) — Han bug batch (HBD playback) + instrument transition + difficulty/icons
- ✅ #1 Transition INSTRUMENT→COLOUR fixed. ROOT CAUSE: InstrumentStaffOverlay cards were the only
  overlay using `<foreignObject>`; foreignObject HTML does NOT composite/fade with SVG group opacity
  during the morph. The instrument overlay paints AFTER (on top of) the colour overlay, so the
  exiting foreignObject stayed visible over the colour noteheads sliding in → they "just appeared"
  when it finally unmounted. FIX: render cards SVG-native (lucide <svg> nested in a translated <g>
  with currentColor + a <text> name), no foreignObject — fades cleanly like every other overlay.
  Also pre-aligns the eventual icons8 <image> swap. 276 tests green (updated the overlay test),
  build clean. File: InstrumentStaffOverlay.jsx.
- ✅ icons8 files FOUND in PR #31 (full 50/100px PNG set: accordion, banjo, cello, bassoon, …) on
  its own branch. To wire: bring those assets onto this branch, then getInstrumentIcon returns an
  <image> + ICON_ATTRIBUTION → "Icons by Icons8". Queued (separate from the glitch fix).
- ⏳ FR (Han 2026-06-17): enable 'original key' (original tonic) by DEFAULT on song load.
  handleLoadSong already takes useOriginalTonic — flip the default / the SongsTab call. §4b: confirm
  scope (all songs? the toggle's default state?).
- ⏳ FR (Han 2026-06-17): MOVE the difficulty setting OUT of the song selector → make it a GENERAL
  setting. Future: each song + variant carries a 'difficulty score'. Ties into the difficulty→reload
  work above. §4b: where should the general difficulty control live (header? settings?).
- 🐞 #1 Transition INSTRUMENT→COLOUR (now ✅ above).
- ✅ FR original-key DEFAULT ON (Han 2026-06-17): SongsTab useOriginalKey useState(false→true).
- Difficulty CLARIFICATION (Han 2026-06-17, supersedes "move out"): KEEP difficulty IN the song
  selector, next to 'original key'; it should only affect SELECTED songs. (≈ no move; it's already
  per-song in SongsTab.) Difficulty→reload-loaded-song still applies for the difficulty rework.
- 🔨 BIG REDESIGN — instrument setter as a tight ~200px CAROUSEL (Han 2026-06-17), + same for the
  colour setter. Spec (needs §4b interview — ambiguous): icons ~50% larger; NAME below the staff;
  CATEGORY header above (8va-bracket style |---- GUITAR & BASS ----|), shown only when 2+ of that
  category are visible, centered over the active selection, moving dynamically; 5 instruments
  visible, MIDDLE = active/selected, sides fade + shrink. Re-categorise: harp → strings(other) (not
  keys); violin/viola/cello/bass → "strings (viola)" etc; guitar → "strings (guitar)". Whole thing
  ~200px so it can be juxtaposed. INTERVIEW before rebuilding (I just built this overlay).
- 🔨 Colour setter: same carousel treatment + REORDER/RENAME schemes → none, chord, scale (rename of
  tonic/scale), chromatone, subtle chromatone. (Label/order change is clear; carousel = part of the
  redesign interview.)
- 🐞 F-major g-clef not shown in colour settings menu (Han "suspicious of hard-coding"). FINDING:
  SheetMusic.jsx:1950 `!clefEditMode && !colorEditMode` INTENTIONALLY hides the static clef in colour
  mode — so no clef shows in colour mode for ANY key by design. Contradicts "shows except F major";
  clarify whether the clef should show in the colour menu at all, vs a real F-major-specific glitch.
- 🐞 #2 HBD anacrusis edge (anacrusis itself ✅ works!): on the VERY FIRST playthrough BOTH measure 0
  AND the anacrusis (0.2) should show; removing measure 0 puts the fermata on the wrong note. Also:
  the EVEN repeat has no anacrusis on its last measure. → maps to anacrusis Phase 3 (leading-pickup
  bar on first pass) — left ⏳ in §40 work.
- 🐞 #3 Repeat numbering bug: after exceeding numRepeats on "repeat one indefinitely", numbering is
  wrong (sees "measure 11" → should be "1.5" etc), recurs at each multiple of numRepeats. DECISION
  (Han): for indefinite repeats, numRepeats should be silently set to INFINITE. → maps to anacrusis
  Phase 2 wiring STEP 2 (NOTATION sync: App melody/numbering vs Sequencer body divergence) — left ⏳.
- 🐞 #4 Song visibility/audibility per-round not applied: in Settings the per-round visibility +
  audibility of the melody works for NORMAL melodies but NOT for SONGS (all notes show regardless).
  Find where the song path diverges from the exercise path.
- ❓ #5 (Han): I omitted the outstanding SONG phases when asked for next steps. OWNED: my review swept
  BACKLOG.md status markers and missed the in-flight phases here in the PLAN (§40 anacrusis: Phase 2
  STEP 2 notation, Phase 3 first-pass pickup bar, open Qs). Need to clarify if "generate in same
  style" is a separate future phase (generate fresh exercises in a loaded song's style) or = these.
- ⏳ Difficulty change → RELOAD THE LOADED SONG (Han 2026-06-17): store the loaded songDef; on
  difficultyLevel change, if a named song is loaded re-run handleLoadSong(storedDef, newDifficulty)
  (fires transition); else regenerate fresh exercise. Replaces the current re-fly-current-notes.
- ⛔ icons8 files: Han says they're in src/assets, but src/assets has only fonts/maestro.ttf on the
  pushed branch + the tree is clean — they were NOT committed/pushed. Blocked until they land in the repo.

## 2026-06-16 — New backlog (Han) + quick wins
- ✅ Range setter defaults: β mid-bow 0.3→0.6, drag px 6→10 (RangeStaffOverlay.jsx 144/149).
- ✅ Note-click animation smoother (range setter): tap-to-set now SLIDES the boundary
  notes continuously (eased rAF tween of a FRACTIONAL ordinal feeding the x(t) layout),
  instead of the per-natural stepper that re-rendered per natural (choppy jumps). Commit
  to app state ONCE at tween end. Drag + hold-extend preserved. `beginSlide`/`slideFrame`
  + `slideRef` in RangeStaffOverlay.jsx; old stepper retained as dead-for-taps. Docs:
  architecture.md "Continuous tap-slide". 253 tests green, build clean.
- 🔨 Universal 1.5s transition (fade-out 0.25s → staggered notes fly in from right → others
  slide/fade). Interview done; decisions: difficulty=fires (distinct from manual regen),
  always plays even during playback. Reuses the EXISTING cascade primitive.
  - ✅ Phase 0: extract shared `flyInCascade` runner from useRangeMorph (one source of truth;
    dropped a latent double-rAF). +smoke test. (`src/utils/flyInCascade.js`)
  - ✅ Phase 1: `useUniversalTransition` (clone-overlay + flyInCascade) + `UniversalTransitionContext`
    (prop key bus); wired SONG LOAD (fireTransition at end of handleLoadSong). Sheet mounts it.
  - ✅ Phase 2a: DIFFICULTY change fires it (mount-guarded effect). Note: difficulty feeds the
    NEXT generation, so this re-flies current notes (acknowledgement) — flag to Han if he wants
    difficulty to also regenerate so the cascade shows NEW content.
  - ✅ Phase 2b: TAB/screen change — "sheet only" (Han): fire when landing on the sheet-music tab
    (sheet toggles via display:none, not unmount). Setter-overlay trigger (#3) already handled by
    useRangeMorph. NOTE: song-TIER difficulty (SongsTab) already loads-a-new-song → already fires
    via Phase 1; the global difficultyLevel slider (Phase 2a) re-flies current notes.
  - ✅ Phase 3: tagged lyrics (solfège/text/rhythmic rows — all inside `.notes-transition`) +
    TranspositionSetter "=" / "concert C₄ =" labels + fixed C4 anchor head with data-fly. Dynamic
    carousel heads left to fade (own scale transform + selection tween — avoid fly conflict).
  - ✅ Phase 4: OttavaMarker NEW marker SLIDES in from right (SLIDE_IN px, easeInOut) during its
    fade-in; OLD fades in place; fade fallback on removal. style.transform via rAF (§6), cleared.
  - ✅ CR (Han 2026-06-16): more elements must SLIDE not fade + fix fade timing. Decisions: GLOBAL
    "wait 1s → fade 0.5s" for non-sliding elements; "slide notes, fade labels". Redesigned
    flyInCascade: group no longer fades (would hide sliding notes); fly elements slide visible;
    non-fly subtrees (collectFadeEls) do the delayed fade. Tagged data-fly: transposition notehead
    carousel (outer-wrap to keep scale) + name carousel, range preset brackets + 8va group. Untagged
    the "=" / "concert C₄ =" labels (→ delayed fade). Colour heads already slide; labels delayed-fade.
  Docs: architecture.md "Universal 1.5s transition" + Ottava entry. 261 tests green, build clean.
  - ✅ CR2 (Han 2026-06-16): transposition menu presets + "concert C₄" label followed OLD logic
    (the clef-variant-enter CSS slide-from-left+fade), inconsistent with the sliding carousels.
    Root cause: the whole setter was one `clef-variant-cards clef-variant-enter data-fly` block, so
    collectFadeEls skipped its children + the nested data-fly conflicted. Fix: made the setter
    wrapper a PLAIN container (drop clef-variant-enter + block data-fly) ONLY for the transposition
    branch — now carousels/heads slide, presets + "=" / "concert C₄ =" labels delayed-fade.
    Family-switch entrance covered by useClefRefly. Also removed the redundant top-right "(X inst)"
    label (covered by the clef-left transposition label). ClefStaffOverlay.jsx + TranspositionSetter.jsx.
- ✅ Coloring: 'scale' mode (in-scale = scale-degree colour, out-of-scale "blue notes" greyish)
  everywhere incl keyboard — routed via melodicNoteColor (§6c). [commit "Add 'scale' note-colouring mode"]
- ✅ Range setter — VERTICAL (up/down) drag (Han 2026-06-16, "both axes move it"): boundary drag
  now sums horizontal + vertical into a unified raise (UP = raise pitch); diagonal combines.
  svgY() + downRef.y + radial DRAG_THRESHOLD. RangeStaffOverlay.jsx onMove.
- ✅ Range setter — in-range notes SHRINK toward the middle (Han "symmetric, eased", in-range only):
  100% at boundaries → ~50% at exact middle, eased, by natural ordinal; scales head+stem+ledgers.
  Docs: architecture.md "Both-axes drag + middle-shrink". 261 tests green, build clean.
- ✅ Instrument selector IN SHEET MUSIC (Han 2026-06-16) — built + reviewed. 271 tests green (10
  new), build clean. New in-staff setter (sibling of clef/range/colour), PER-STAFF. Icons = lucide
  placeholders + name (can't fetch icons8), structured for icons8 drop-in (getInstrumentIcon +
  ICON_ATTRIBUTION, TODO(icons8) markers); attribution line shown while open. Reuse: setTreble/
  setBassSettings instrument slug; ClefCardCarousel (scroll/center/off-screen); shared
  src/constants/instruments.jsx (grouped, +10 instruments; RangeControls imports it too). Plumbing
  mirrors colorEditMode (App/SubHeader/SheetMusic/useRangeMorph groupsForKind 'instrument'). Review
  tweak: strip slides from the RIGHT (plain data-fly, not data-fly-from=startX which barely moved a
  full-width strip). Docs: architecture.md §41. ⚠ visual: confirm foreignObject card placement
  (STRIP_TOP_OFFSET) + the right-slide in dev.
- ✅ BACKLOG hygiene (Han 2026-06-17): marked the seven June-16 NIEUWE FEATURE REQUESTS ✅ with
  dated completion notes (I'd left them as "Logged" — Han: "you are relisting items i told you to
  close"). Then did a full-file open-items review.
- ✅ BUG: malformed sheet on TIME-SIGNATURE change while stopped (BACKLOG line 1587, open since May)
  — FIXED + reviewed (280 tests, +9; build clean). Final fix in the dated entry at the bottom.
  Diagnosed (read-only Plan agent + my code reads): melody is meter-independent absolute ticks, so
  re-barring = re-slicing; the processor already splits/ties across barlines. ROOT CAUSE = SheetMusic
  melodyMeasureCount uses Math.round(totalDuration/measureLengthSlots) → when old melody doesn't
  divide evenly into the NEW meter, rounds DOWN and the slicer DROPS the partial final measure's
  notes (persists until regen). Han's §4b decisions: RE-BAR (don't regenerate), eliminate at state
  level. Fix = ceil (with epsilon) so the partial measure shows with trailing-rest + cross-barline
  ties; add rebarMelody only if the per-measure path drops tied continuations. No regen on stopped
  TS change (state already single-commit). Implements the "graceful partial-measure display" the
  useAppHandlers.js:114 comment promised. Delegated to impl agent; review pending. §6b re-read req'd.
(All recorded verbatim in BACKLOG.md per §1b.)

## 2026-06-15 (night) — Small CRs (Han, parallel to core anacrusis refactor)
- 🔨 EASY percussion: replace hi-hat `hh` (beats 2&3) with snare RIM CLICK `sr`. (happyBirthday.json)
- 🔨 HBD EASY: add a C chord in measure 5. (happyBirthday.json easy chords)
- 🔨 Chord slash: lower by 2 units (CHORD_ROOT_Y−10 → −8). (ChordLabelsLayer.jsx)

## 2026-06-15 (eve) — Item 2: playback & repeat behaviour (Han, interview done)
Mostly VISUAL bugs + metronome/fermata sync. Han directive: STOP any HBD/repeat-specific
hardcoding; analyse the NORMAL-melody render/repeat logic and REUSE it (consistency, §6c).
- ✅ V1 + V4 (SAME root cause). processMelodyAndCalculateSlots.js trailing-rest padding measured
  the gap from Σdurations — which UNDERCOUNTS a SPARSE track with note gaps (e.g. HBD's root-on-1
  bass) → padded a giant rest pushing the bass to ~measure 13 (phantom measures, rests bass-only).
  FIX: measure from the track's TRUE end (lastTimestamp). Instrument-agnostic; contiguous tracks
  unchanged. Removed the old 2026-05-29 reduce + its comment (flagged to Han).
- 🔁 V2 + V3 likely DOWNSTREAM of V1/V4 (agent: the 14-vs-9 measure mismatch misplaced the
  repeat-preview / even-round overlay via `mw = displayNumMeasures*measureWidth`). Re-test after
  V1/V4. CAVEAT: loopMerged (the audio merged-pickup) is audio-ONLY and never reaches the sheet,
  so if V2 ("anacrusis notes not shown in last bar of the repeat block during playback") persists,
  it needs separate work to RENDER the merged pickup there. ⏳ awaiting Han re-test.

## 2026-06-15 (night) — Item 2 deep root-cause (2 agents). Han: audio incl. repeats now CORRECT.
ROOT CAUSE shared by highlight-lag + V2: **DUAL REPRESENTATION**. Sequencer loops the BODY-MERGED
melody (pickup lifted, body rebased to 0, 8 bars) for audio + highlight, but SheetMusic renders the
ORIGINAL PADDED melody (pickup at m0, 9 bars). Sequencer even builds an abstract Song via setSong()
— but SheetMusic NEVER consumes it (dead path). No HBD string-literal special-casing exists; the
problems are representation divergence + mode-gating.
- 🐞 HIGHLIGHT off-by-one: render measure-index (padded, pickup=m0) lags the schedule (merged,
  body=0) by exactly the pickup bar. Fix = renderer consumes the SAME merged body the Sequencer
  loops (Option A: push loopMerged melodies to the melody state the sheet reads). Song-agnostic.
- 🐞 V2: loopMerged places the next loop's pickup at the END of the last bar — audio-only today.
  Same Option-A fix surfaces it on the sheet. (anacrusisRepeat.js:49 is pure + handles overlap.)
- 🐞 V3: NOT a layout bug. evenRounds DEFAULT config (App.jsx:114-121) sets trebleEye/bassEye/
  percussionEye=false → even round intentionally hides note staves (round eye-toggle feature). To
  show notes = flip the evenRounds eye defaults. PRODUCT DECISION (ask Han).
- 🐞 NUMBERING (BarlinesLayer.jsx:109-123): measureLabel = `${N} . ${repeatNum}`; repeatNum =
  floor((startIdx-bps)/numMeasures)+1 = the loop-PASS count (the "·5" = 5th pass) appended to EVERY
  measure. Two defects: (i) suffix leaks onto per-measure numbers; (ii) `repeatNum>1 ? … : N`
  SUPPRESSES pass 1 → first repeat shows "1" not "1.1", second "1.1" not "1.2" (off-by-one); (iii)
  divisor numMeasures=9 includes the pickup while the body loops over 8 → drift. Grammar = ASK Han.
- 🧹 REDUNDANCY catalogue (agent): dead setSong-for-render; anacrusis handled only in repeatForever
  mode (continuous replays a dead m0); anacrusis detected twice (App.jsx:1235 + Sequencer.js:82);
  numRepeats==repsPerMelody (two names, App.jsx:1258). All to unify — scope = ASK Han.
- ✅ M1 Metronome now follows the song's meter + holds through fermatas (Sequencer.js).
  Regenerate currentMetronome for currentTS/currentNumMeasures + attach treble.fermatas.
- ✅ CHORD-ROW-Y [Han 19:51]: moved the whole chord row up 15 (trebleStart−58 → −73) via a
  shared `chordRootY(trebleStart)` constant (ChordLabelsLayer, imported by ChordStyleOverlay,
  §6d) so it applies in ALL places; empty-count slashes aligned to the label baseline.

## 2026-06-15 (pm) — HBD song restructure (Han item 1A) + B2 root cause found
- ✅ 1A HBD difficulty restructure (data only, src/songs/data/happyBirthday.json):
  - EASY: added bass (chord ROOT on beat 1 only, dur 12, m1–m8, rests through m0 pickup)
    + percussion (waltz: kick `k` on beat 1, closed hi-hat `hh` on beats 2 & 3, m1–m8).
    Treble + chords unchanged. (Han answers: root-on-1 bass; kick(1)+hihat(2,3); keep
    chords; backing from m1.)
  - MEDIUM (new): treble + bass copied verbatim from the former HARD chorale. No chords/
    percussion (path B will generate chords on load later). Carries the [name] fermata.
  - HARD: now treble + chords only; its bass moved to MEDIUM.
  - SongsTab derives available diffs from the data → medium auto-surfaces, no UI wiring.
- ⏳ 1B (generate missing staves on load from chords/melody) — DEFERRED until item 3 is set
  (Han: "B means apply 3 upon loading for missing staffs").
- 🐞 B2 (item 2 — playback) root cause FOUND (agent), DEFERRED per Han "song first":
  HBD fermata {tick:216,hold:18}=1.5 beats shifts melody/chords but NOT the metronome
  (which is also STALE/wrong-meter on every song load — never regenerated, App.jsx:443-499).
  → perceived "extra count" at the end, in BOTH once + repeat. NOT the anacrusis-repeat path.
  Fix (later): make the song's metronome honor the fermata (+ regenerate metronome on load).

## 2026-06-15 — bug batch (Han) — interview done; B1/B3/B4 implemented
- ✅ 🐞 B1 Colour setter spurious melody fly-in. FIX: registered 'color' as its own
  morph surface (`overlayKind`), added `colorMounted` (mountedFor) so it survives the exit
  morph, `groupsForKind('color')→.note-coloring-overlay`, and `data-fly` on each scheme
  notehead. Now the scheme rows fly in like range/clef; the melody no longer flies in.
  Files: SheetMusic.jsx, hooks/useRangeMorph.js, overlays/NoteColoringStaffOverlay.jsx.
  (Han B1 answer: own fly-in like range/clef.)
- 🐞 B2 Happy Birthday end: a single extra count at the end — Han: BOTH single + repeat.
  Single play does NOT hit the anacrusis-repeat path → root cause is in the BASE
  playback/metronome/song-length path. Background agent tracing root cause. ⏳
- ✅ 🐞 B3 Range setter notes now fly in (from the RIGHT, match others — Han B3 answer).
  FIX: wrapped each melodic note in an outer `<g data-fly>` (inner `<g>` keeps the
  scale/opacity transform so the fly translate doesn't clobber it).
  File: overlays/RangeStaffOverlay.jsx.
- ✅ 🐞 B4 Range setter in-range 8va. Han confirmed REVERSING the 2026-06-14 #2 rule:
  fold EVERY note (in-range included) so a wide selection's high/low in-range runs get an
  8va/8vb bracket instead of ledger sprawl. FIX: `folded` now always calls
  `foldNoteToStaff`. File: overlays/RangeStaffOverlay.jsx.
  NOTE: supersedes the 2026-06-14 (pm) entries "fold ONLY out-of-range context notes".

## 2026-06-14 (pm) — range tuning + keyboard/transpose + chord names (Han, post-merge of #29)
- ✅ 🐞 TabView bass-tab keyboard showed range setter in clefEditMode → KeyboardTransposeSetter.
- ✅ 🐞 Octave index labels suppressed on ALL transposed keyboards → only suppress in the
  transpose setter.
- ✅ Transpose-setter keyboard now follows note-colouring (noteColoringMode/activeChord/theme).
- 🔨 Range setter spacing (Han "help me tune"): densest near (Xl+Xr)/2, ~linear (~(Xr−Xl)/8),
  first out-of-range note at (Xr−Xl)/8. Preset: τ=3, Xl=0.2, Xr=0.8, context=10, drag=6.
  Use dense-middle bow g(u)=u+(β/2π)·sin(2πu) on the ordinal map.
- 🔨 Range setter 8va/8vb triggers too eagerly → fold ONLY out-of-range context notes
  (in-range notes stay true pitch); the 8va rules consider in-range notes only.
- ⏳ Range setter 8va/8vb GLYPH style must match the melody's ottava (consistency).
- ✅ Transposed keyboard: displayed RANGE still uses concert min/max. With Concert C=E +
  range c4–e5 it shows A♭3–c5; should show c4–f5 (keys keep physical positions; e5→f5 since
  the transposed boundary lands on a black key). Range labels must follow the transposition.
- 🔨 Chord NAME labels not coloured → colour each chord label by its ROOT (chromatone/tonic).
- ⏳ BACKLOG (song bugs) — see BACKLOG.md.

## 2026-06-13 (pm) — setter polish batch (Han)
- ✅ R1 CHECK: does the RANGE setter apply note-GROUPING? NO. Melodic range notes are drawn
  by `winNotes.map` → `StaffQuarterNote` at `rxFor(midi)` = pure PITCH spacing (the cosine
  x(t)); the percussion row uses MelodyNotesLayer with STATIC_LAYER_PROPS
  (noteGroupSize:1, measureLengthSlots:9999, rhythmicGrouping:null) → grouping disabled.
  Nothing to fix — the uneven spacing Han sees is the intended cosine pitch-spacing.
- ✅ R2 DONE: keyboard setters MIRROR the sheet-music setter modes — RANGE mode → keyboard
  range setter; NOTATION mode → keyboard notation/transposition setter (NOT both at once;
  today KeyboardRangeSetter shows for both + my −/+ stepper → both visible). Remove the
  −/+ stepper; reuse the staff's transposition setter style; unify with the per-staff
  transposition value (settings.transpositionKey / trebleTransSemitones). ⚠ sound semantics
  fork — interview.
- ✅ 3a DONE: setter-menu buttons (SubHeader RANGE/TRANSPOSITION/SETTINGS/…): all same highlight
  colour, lowlight when inactive, GLOW when active — reuse the current-note highlight glow
  (the note-active box-shadow). Reuse code.
- ✅ 3b DONE: NEW "note colouring" settings menu. Staff-rendered, staff-independent (no clefs).
  One row of 8 notes C4–C5 per colour scheme (COLOR_MODES = none, tonic_scale_keys, chords,
  chromatone, subtle-chroma), click a row to select. ⚠ interview entry-point/scope.


## 2026-06-13 — Range setter spacing + debug tuner + keyboard transposition
- ✅ Range x(t): sigmoid → **cosine-integral** ramp (uniform spacing near the range
  edges, compressing toward the middle). Tunable `compress` param.
- ✅ Debug-mode **live tuner** in the range setter (sliders: compress, tanh τ,
  Xl/Xr frac, context, drag px + reset).
- ✅ Rename NOTATION button → **TRANSPOSITION**; staff setter label → "concert C =".
- ✅ **Keyboard transposition** (pitch-class 0-11, no octave; −1≡+11): `tn()` in
  PianoView shifts label/sound/highlight; "concert C =" stepper in
  KeyboardRangeSetter (clefMode) + reset. State in App, drilled via TabView. See
  docs/architecture.md §38.
- ⏳ Verify in-app: keyboard sound/highlight/label shift + the stepper UI (couldn't
  test interactively here).

---

## CONSISTENCY BATCH (Han 2026-06-09) — notation settings menu

Root cause: setter hand-rolled notation instead of reusing the staff renderer → drift.
Process fix: new CLAUDE.md §6d (reuse canonical renderers; single source of truth).

- ✅ A Shared `staffNoteGlyph.jsx` (`StaffQuarterNote` + geometry constants). Setter heads,
     fixed C4 note, accidentals now use it (head fs36 at positionY, stem +11/+0.5 len27,
     accidental fs36 anchor=end). renderMelodyNotes imports the same constants → single source.
     Fixes: head 6px-off, tiny accidentals, hand-drawn stems, wrong stem dir, font size.
- ✅ B Frame lines: removed startX vertical line in ALL overlay menus; endX line thinned to
     0.5 (staff-line weight) — was 1.0. (#8 all menus, #9 incl. range setter.)
- ✅ C Left setter: removed "C4" text → just [rendered C4 note] "=" [carousel] (#7). Carousel +
     quick-pick names use subscript octave (C₄) via NoteLabel (#3); active name = label size 16 (#4).
- ⏳ D #5 Two-octave range (C2→C6): wire octave clefs (8va/15ma/8vb/15vb) + transpositionOctave;
     decompose total trans → key+octave; auto-switch clef so far heads return near staff. BIG.
- ⏳ E #6 Carousel animation: clicking a preset/quick-pick TWEENS the carousels to the value
     (not instant); highlight only the active preset.

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
  · ✅ #14 vocal C-G-C NOTES: each voice now a ClefCard (real renderer) with a C-G-C
    triad derived from the voice's range (Han: "from each voice's range"). vocalRefTriad()
    picks the octave with least range-spill, tie-broken to centre — no per-voice table
    (§6c). Ranges added to VOCAL_VARIANTS (mirror VOCAL_RANGES/CLEF_VOCAL_RANGES; flagged
    for future consolidation). Result: Bass/Bari/Tenor C3-G3-C4, Alto/Mezzo C4-G4-C5,
    Soprano C5-G5-C6.
  · BATCH 2 COMPLETE pending Han's visual verification.

- 🔨 CR (Han 2026-06-03, supersedes fixed C-G-C): clef-setter reference notes should be
  TONIC + FIFTH + OCTAVE, RESPONSIVE to the tonic setter (not fixed C-G-C). Implies:
  (a) pass `tonic` into ClefStaffOverlay (currently not passed; SheetMusic has it).
  (b) transposing-instrument cards may need per-note accidentals (♯/♭) on the shifted
      notes — Han expects this logic doesn't exist yet for the setter. REUSE the real
      staff's transposition/spelling path (§6c), don't reinvent.
  (c) write all voortekens at NOTE level (accidental before each note), NOT as a key
      signature on the staff — to avoid clutter.
  ✅ DONE. Interview answers: both melodic+vocal · ACTUAL 5th scale degree (not always
     P5) · reuse real-staff transpose/spelling · centred octave.
  Impl: refTriadNotes(tonicName,tonicSemi,fifthName,fifthSemi,lo,hi) — octave-centred,
  scale-spelled names; tonicAndFifth() reads tonic + scaleNotes[4] (fallback P5).
  tonic+scaleNotes threaded SheetMusic→ClefStaffOverlay. Accidentals: free via existing
  numAccidentals:0 + generateAccidentalMap (naturals in-key, ♯/♭ drawn per note,
  octave-distinct); transposition via existing transposeMelodyBySemitones. REF_NOTES
  const removed. 207 tests + build green. Verified triads: C→C4-G4-C5, E♭→E♭4-B♭4-E♭5,
  F♯→F♯3-C♯4-F♯4, etc. ⏳ needs Han visual verification.
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
- ✅ 🐞 ext/add chord: the 3 columns (accidentals · middle notes · right notes) are too
  cramped → widen column spacing. [Han verified fixed 2026-06-10]
- 🔨 Remove the C4 ledger ("streepje"): transpose REF_NOTES up so they start at D4.
- 🐞 Drag is confusing. Desired: clicking/dragging to the RIGHT of the range (outside)
  → drag-left = "pull notes from the right" = RAISE range. On the range setter itself
  → drag-left = LOWER range. (Need to map this to carousel vs note-range surfaces.)
- 🔨 Make lowlight colour for ALL non-selections a bit darker grey (dark mode).

NOTATION (sheet music rendering):
- ✅ 🐞 Percussion beam is yellow (should match note colour, not yellow). [Han verified 2026-06-10]
- ✅ 🐞 Clefs sit too far right — don't match real sheet-music clef x-position. [Han verified 2026-06-10]
- 🔨 Notes too close to clef & each other → make blocks roomier.
- 🐞 Clipping at the bottom of notes/clefs around the C-ledger height.
- 🐞 8va treble clef doesn't render (ALT+0160 = nbsp → wrong/missing ottava glyph char).
- ✅ 🐞 Instrument name: wrong position rel. to clef vs sheet music + different font size +
  italic. MUST be consistent. [Han verified 2026-06-10 — "(X inst)" now top-right]
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

- Batch 2 round 4 (Han 2026-06-03 screenshot in B♭ = notes/accidentals CORRECT):
  · ✅ tonic+5th+octave + per-note accidentals confirmed correct in B♭.
  · ✅ #9 cards DOUBLED width (CARD_W 92→184, VOC_CARD_W 72→144) — roomier note spacing.
  · ✅ CR: staff-level key signature BLOCKED in clef-edit mode (gated renderAccidentals +
    enharmonic toggle on !clefEditMode, both staves) — accidentals only per-note now.
  · ✅ #10 left clipping = family carousel LEFT FADE dimmed the active clef at
    CLEF_GLYPH_X; removed left fade (right fade kept for scroll).
  · ⏳ #8 clef position + 8/15/(inst) label alignment — ASKING Han (ambiguous 3×).

- Batch 2 round 5 (Han: #8 + labels "exact als echte balk"):
  · ✅ #8: ClefCard now uses EXACT real-staff geometry — clef at CLEF_GLYPH_X (13) via
    the same ClefGlyph (so 8/15 ottava lands identically), inst label at clef+25 / y−8
    (= sheet's accidentalStartX−10), notes at x+48 (just past clef, no key-sig gap).
  · ✅ vocal row converted to the SAME swipe carousel as melodic (double-width 184 cards
    overflow → scroll instead of overlap).

- Batch 2 round 6 (Han 2026-06-03 — CONSISTENCY focus + frustration):
  · ✅ COLOR spec fix: selected clef+notes = var(--text-primary) (NORMAL, not yellow);
    cards were wrongly accent-yellow. Now matches the family column.
  · ✅ lowlight UNIFIED: family column was --text-lowlight, cards --setter-lowlight →
    both now --setter-lowlight (one token). Darkened --setter-lowlight in all 4 themes.
  · ✅ #9 nudges: first note +8 (NOTES_X x+48→x+56), noteW 33→26 (third ~8 left),
    CARD_W/VOC_CARD_W 184→158 (right margin ~40% smaller).
  · ✅ #10 family-clef bottom clipping: ClefCarousel now clips horizontal-only.
  · ⏳ STILL OPEN (see reply): #8 position mismatch (asked precisely), transitions
    (fade-out/slide-in on clef select; 8va & the 15-above-treble not animated/coloured;
    melody flashes between overlay transitions), add/ext chord 3-column spacing (range
    selector). Grouped as a TRANSITIONS/ANIMATION batch next.

============================================================
## MASTER PLAN (Han 2026-06-03 "maak een plan") — clef setter first, finish it 100%
============================================================
Working method now: render harness (npm run render:overlay) → I self-verify geometry
before sending. Per CLAUDE.md: finish the clef setter fully before chord line / range.

BATCH A — CLEF SETTER polish (all self-verifiable via render):
  A1 ✅/🔨 #8: family-carousel ACTIVE clef must sit at EXACT real-staff position.
     Fix: renderFamily ClefGlyph anchor 'middle'→'start' at CLEF_GLYPH_X (matches sheet).
  A2 🔨 #11 redo: 8va treble must use the real MAESTRO ottava glyph, not '&' + drawn
     serif '8' (Han: ALT+0160 was wrong; use the font glyph).
  A3 🔨 reference notes must COLOUR per the note-colour scheme (tonic/scale), not one
     flat colour — wire noteColoringMode + tonic + scaleNotes into the card layer.
  A4 ✅/🔨 non-selection lowlight a touch darker still (dark mode).
  A5 🔨 carousel clip → 5%/95% of [startX,endX]; edge fade = 10% of width (0–10%,90–100%).
  A6 🔨 responsive: on narrow screens render ONLY the selected clef's notes (space).
  A7 ❓ "akkoorden iets verder uit elkaar in notation setter" — clarify (chords in clef
     setter?) — likely chord LINE (Batch C).

BATCH B — TRANSITIONS/ANIMATION (clef setter):
  B1 fade-out / slide-in (from the left) of the new clefs when a clef is selected.
  B2 8va + 15 markers animate WITH the morph (currently left behind).
  B3 #1 ottava glyphs + brackets ("blokhaken") slide in with the morph.
  B4 melody FLASHES through during transitions between two settings overlays → hide it.

BATCH C — CHORD LINE (akkoordlijn): #2 chords not neatly in block, #3 3-col spacing,
  #4 transpose up to kill C4 ledger, #13 chord height, chords a bit further apart,
  chord clickzone too narrow.

BATCH D — RANGE SETTER: #5 two-zone drag, #16 transpose for G-(F inst), add/ext chord
  3-column spacing too tight, chord-type clickzones misaligned.

BATCH E — CLICKZONES sweep: percussion (too small), chords (too narrow), range chord
  types (misaligned). (Fold into C/D where they live.)

BATCH F — REAL STAFF: #7 percussion beam is yellow → should follow note colour.

============================================================
## OPEN ITEMS (Han 2026-06-03, order: feedback → #5 → Batch C)
============================================================
A. AWAITING LIVE VERIFICATION (implemented this session, may need tweaks):
   - #13 family-cycle flash fix (swap highlight, then slide)
   - #2 glide selected card to centre (0.5s) when picked past the middle
   - #4 after a scroll, 3s → glide selection back to centre
   - #12b vocal range preset activates the matching vocal clef
   - #7-clef transposed-note COLOUR (should be colour of the transposed note)

B. RANGE-SETTER:
   - #5 two-zone drag (outside-right drag-left = raise; on setter drag-left = lower)  <-- NEXT
   - #16 range notes not transposed for transposing instruments (RangeStaffOverlay
     applies no transposition anywhere — broad change)

C. CHORD LINE (Batch C):
   - chords not neatly inside the block
   - chord height not matching the real sheet music
   - transpose chord-line notes up to kill the C4 ledger
   - chords a bit further apart
   - "chords too narrow" — chord-line label clickzones

D. SMALLER / TRANSITIONS:
   - #1 ottava glyphs + brackets don't slide in with the morph

E. BACKLOG (separate feature, needs interview): instrument selector (icons8).

- ✅ #5 two-zone range drag DONE (one boundary per zone, relative 1:1; needs live test).
- ✅ Batch C DONE: chord-style row matches sheet height (trebleStart-58), GAP 34→42,
  wider/centred clickzones; complexity chords shifted to D4 (no C4 ledger).
- STILL OPEN: #16 range transpose (broad), #1 ottava/brackets slide in morph (transition),
  + live-verify backlog (#13/#2/#4/#5/#12b/#7-clef), instrument selector (backlog).

- ✅ #16 DONE: range-setter chromatone/scale colour now follows the WRITTEN
  (transposed) note like the sheet. Positions stay concert (height correct, Han
  2026-06-07). RangeStaffOverlay gets trebleTrans/bassTrans; in-band notes coloured via
  concert→written map (transposeMelodyBySemitones). Boundary/out-of-band unchanged.
  Sanity: concert C4 -> written D4(+2) -> chromatone-2 (matches sheet). 207 tests+build.

============================================================
## NIGHTLY REVIEW 2026-06-08 (auto /loop run) — PLAN FOR APPROVAL
============================================================
Bookkeeping done this run: architecture now documents #5 two-zone drag, Batch C
chord-row + D4, #7 beam colour, #16 colour; §12 ghost refs fixed (TabView, drumKits).
Per §4b every item below needs an interview before implementing — this is a menu.

P0 — CORRECTNESS (silent-bug risk, §6 invariant):
  ✅ DEBT-1 DONE Routed both sites through getNoteSemitone() instead of getNoteSemitone():
     - melodyGenerator.js:166-191 (ALL_PCS_CALC + .replace chain — single-accidental only)
     - melodyDifficultyTable.js:112-125 (_PC_ORDER/_ENHARMONICS, contains WRONG map 'Db'→'E♭')
     Fix: route both through getNoteSemitone(); delete the local tables. Add a test.

P1 — PERFORMANCE (real wins, respect §6/§10 opacity+timing invariants):
  ✅ PERF-1 DONE Deleted dead processMelodyAndCalculateFlags call (SheetMusic.jsx:9,897) —
     computed every render in the hottest component, never read. Low-risk.
  ✅ PERF-2 INVESTIGATED → NO ACTION (Han asked "kun jij dat doen?", 2026-06-13). Did the
     full static identity analysis the "needs profiling" note was guarding. Finding: EVERY
     object/array/fn prop to the main MelodyNotesLayers is ALREADY referentially stable
     (melody/allOffsets/scaleNotes/processedChords/clefs/transSemitones = useMemo;
     inputTestState = useState; timeSignature = stable prop; previewMode = literal;
     previewColorFn never passed). So the main memo already hits. The framed win doesn't
     exist because (a) nothing to stabilise, and (b) the line-2452 "K-1 cache hits" comment
     is a React.memo misconception — memo compares an element to ITS OWN previous render at
     the same tree position, it does NOT dedupe K sibling panels. SheetMusic also doesn't
     re-render per frame (currentMeasureIndex not read in render; highlight is pure-DOM rAF;
     re-renders only at transition boundaries), so cost is bounded. SVG <use> dedup is ruled
     out — incompatible with the data-attr highlight queries. ⚠ Misleading comment at
     SheetMusic.jsx:2452-2453 flagged (§4) — correct or delete it on Han's OK.
  ✅ PERF-3 DONE Replaced the per-frame [...set].sort().join(',') string alloc (note + chord
     blocks) with a tiny size+membership setsDiffer(). Highlight behaviour unchanged.
  ⏳ PERF-4 SKIPPED (low value, real risk) — the array rebuild at Sequencer.js:471-475 runs
     ONCE PER MEASURE (not per frame), so it's not a hot path; mutating scheduledNotes in
     place would jeopardise the append-only + lookahead-window invariant (§6) for ~nothing.

P1 — TEST DEBT (§7b):
  ✅ DEBT-2 DONE Added rhythmicPriorities.test.js (decompose/chooseGrouping/DNA, odd meters). Add rhythmicPriorities.test.js for
     odd meters (5/4,7/8,11/8,15/8): decomposeNumeratorToBeatGroups offsets +
     generateRhythmicDNA integer-rank/slot invariants. De-risks DEBT-3/4.

P2 — TECH DEBT (§6c/§7):
  ✅ DEBT-3 DONE Derive the [8,4,2,1] final-fallback rank divisions from
     numberOfSlotsPerMeasure (right-shift halving). Byte-identical for 16 slots; generalises
     (§6c). 240 tests green.
  ✅ DEBT-4 DONE Extracted shared decomposeToGroupSizes(n); decomposeNumeratorToBeatGroups
     + chooseGrouping now call it. Pure refactor, zero behaviour change.
  ⏳ DEBT-5 DEFERRED — needs Han confirm: 'lang' overshoot removal is flagged a "deliberate
     Han call", and CLAUDE.md §4 forbids removing comments (the tombstones) without asking.

P2 — ARCHITECTURE / CONVENTIONS:
  ✅ ARCH-1 DONE Named 4 ErrorBoundaries (App.jsx:1330 → "sheet-music";
     TabView.jsx:126/329/356 → tab-specific) per §7a.
  ⏳ ARCH-2 Add debugMode hit-boxes (§3a) to DrumPad, ChordGrid, ScaleSelectorWheel,
     PianoView. CONFIRM §3a scope (SVG-overlap components vs all) with Han.
     [Claude 2026-06-08] DEFERRED — investigated: all four are "hit == visible element"
     (DrumPad SVG pads, ScaleSelectorWheel segments, PianoView HTML keys, ChordGrid HTML
     buttons); none use the transparent OFFSET hit-rect pattern §3a's debug box exists to
     expose, so the value is low and the nightly's scope question is real. Needs Han's call
     on whether §3a applies to self-evident button/key components before doing it.

P3 — DOC HYGIENE:
  ⏳ DOC-1 CLAUDE.md §7a example uses non-existent E010-PLAYBACK-START; real code is
     E010-PLAY-MELODY. (Touches CLAUDE.md → needs Han's OK.)
  ✅ DOC-2 DONE §12: replaced the ghost `src/components/playback/PlaybackControls.jsx`
     entry (dir doesn't exist) with the real play/stop UI (AppHeader + BpmControls +
     RepeatsControls); added a "non-exhaustive" note covering omitted contexts/hooks/overlays.

============================================================
## CR/BUG BATCH (Han 2026-06-08) — range/clef setter polish
============================================================
ALL ⏳ pending §4b interview before implementing. Source = Han chat.

ANIMATION / TRANSITION:
  ✅ CR-A1 DONE (cap-only) Range slide anim too long for far clicks. Speed up with distance, cap TOTAL at 1s.
  ✅ CR-A2 DONE (single-staff refly) Clef changed WHILE range/notation settings open → trigger transition for THAT
     staff only: fade out its notes + wipe in from right (single-staff version of range-open).
  ✅ CR-A3 DONE (value-driven 0.5/0.5/0.5) 8va/15ma don't fly in (ok). On ANY notes transition AND on range-update anim,
     fade out (0.5s) → wait (0.5s) → fade in (0.5s) any CHANGED 8va/8vb/15ma. (Existing
     fade-in is too quick.)

NOTATION MENU (percussion / clef carousel):
  ⏳ BUG-N1 Percussion X-clef not perfectly aligned with the X on treble/bass staff.
  ⏳ BUG-N2 Percussion clef carousel: partial copy of active clef bleeds past the right mask
     ([X(active), perc clef, X partially behind mask]).
  ⏳ BUG-N3 Percussion note click area doesn't match note height (screenshot).
  ⏳ BUG-N4 Percussion clef setter has no debugMode hit-box (§3a).
  ⏳ BUG-N5 Clef-select anim: clicked clef correctly becomes active, but its GLYPH morphs
     mid-animation (click V on [G F V X] → shows G* during anim). Keep the CLICKED glyph the
     whole time; only the active STATE should move, not the glyph identity.

VISUAL CONSISTENCY:
  ⏳ BUG-V1 The X that disables the chords row ≠ the X on the staffs. Make consistent.
  ⏳ BUG-V2 Range setter: complex-chord columns vertically misaligned. Want columns:
     [accidentals , 4 notes (D F A C) , 3 notes (E G B)].
  ⏳ BUG-V3 End-of-staff barline looks thicker/brighter than the left one (notation + range
     settings). Make them visually consistent.

NEW (Han 2026-06-08, second batch):
  ⏳ BUG-N6 Chromatone transposition bug STILL NOT solved (despite #16). Re-investigate —
     the range-setter colour does not (correctly) account for transposition per Han.
  ⏳ BUG-N7 Vocal-clef selector doesn't use available space maximally — expect the SAME
     distribution as violin/bass clef when space allows.
  ⏳ BUG-N8 Selecting a vocal 'sub'-clef wrongly activates the BASS clef.

  ↳ CR-A2 refinement (Han 2026-06-08): refly fires ONLY on left-carousel FAMILY change
    (clefFamilyKey). Sub-clef changes — octave, transposition, vocal voice — no longer
    animate. clefFamilyKey treats all vocal voices (incl. Bass) as 'vocal'. Tests added.

============================================================
## GROUP B/C/N (Han 2026-06-08 "Do B, C, N") — interview answers locked
============================================================
Interview (§4b) done. Answers: N6=BOTH position+colour (match sheet, overrides 06-07
"concert position"); V2=keep current bright/lowlight intent in [acc · DFAC · EGB] cols;
N7=spread full-width like melodic, compact to C-G-C-on-active when tight.

B — NOTATION MENU (percussion / clef carousel):
  ✅ N1 perc disable-X aligned with treble/bass staff X via shared DisableCross at the
     −5 (CLEF_GLYPH_X−PERC_CLEF_X) offset → identical 13…31 span.
  ✅ N2 perc carousel even-spread stepX (FAMILY_RIGHT_FRAC·startX) like melodic → wrap
     copy lands at 2·step (past startX), no longer bleeds past the right fade mask.
  ✅ N3 perc together/split clickzone → y−30, h84 covers the split hi-hat beam (above)
     and the together stems+beam (below). Verified via debug render.
  ✅ N4 perc clef carousel slot now draws its debugMode hit-box (§3a).
  ✅ N5 ClefCarousel/renderFamily: active glyph = variant only when fam.id===famId, so a
     picked slot keeps its OWN family glyph through the slide (no mid-anim morph).
  ✅ N8 staffBlock famId = clefFamilyKey(settings) (rangeMode-aware) → vocal Bass now
     activates the VOCAL family, not instrumental bass. Verified via render.
  ✅ N7 vocal carousel rewritten to the melodic full-width swipe strip (VAR_X0/viewWidth,
     scroll on overflow); narrow → only active card shows C-G-C notes. Verified.

C — VISUAL CONSISTENCY:
  ✅ V1 new shared DisableCross component (overlays/DisableCross.jsx) — staff-off,
     perc-off and chord-off crosses now identical (start-aligned, 18×36, 2× taller, 2.4).
  ✅ V2 ChordStaffOverlay extended chord → 3 columns [accidentals · DFAC · EGB]; D+A
     bright, F+C+EGB lowlit; accidentals (♭/♯) hand-drawn in their own left column (the
     auto-renderer can't isolate them). Verified via render-chord.
  ✅ V3 SheetMusic overlay frame now draws MATCHING left+end barlines (both strokeWidth 1)
     in any overlayEditMode; removed the redundant rangeEditMode-only end barline.

TRANSITIONS batch (Han 2026-06-08 "yes!!", interview locked: slide attached to note ·
all morphs · hide melody whole transition):
  ✅ #1/B2/B3 ottava marker + bracket ("blokhaken") now stream in WITH the notes:
     added data-fly="" to the `octave-${groupIdx}` group in renderMelodyNotes so
     useRangeMorph/useClefRefly treat it as a flyEl (bbox.x = its leftmost note → same
     x-staggered delay → slides in attached to that note). Applies to ALL morphs
     (melody↔setter + overlay→overlay) since data-fly is unconditional. ⏳ live-verify.
  ✅ B4 melody flash — ALREADY fixed: notes-transition is display:none in overlayEditMode
     except during a melody-involving morph (SheetMusic.jsx:2047). Confirmed, no change.
  ✅ B1 clef-select slide — covered by CR-A2 single-staff family refly (sub-clef changes
     intentionally don't animate). No further change.

FR LOGGED (Han 2026-06-08) — NOT started, needs interview + Han's drawings (§4b):
  ✅ Transposition-setter revision — WIRED LIVE (2026-06-08). Semantics: concert C4 is
     WRITTEN as the chosen note (trans = writtenMidi − 60 → transpositionKey via keyForTrans,
     §6c). Per staff TWO coupled half-step carousels: LEFT concert note-NAMES, RIGHT diagonal
     NOTEHEADS (active pinned at fixed x + correct staff position). Replaces the horizontal
     ClefCardCarousel in ClefStaffOverlay's melodic (G/F) branch. Tap-to-select interaction;
     debug hit boxes (§3a). Build/lint/tests green; smoke test added.
     ✅ TANGENS CURVE (Han 2026-06-08): RIGHT noteheads placed at origin + f(t),
        x=−3·tanh(t/3)·25, y=(t³/20)·10 (Han chose +t³, the S-wave). X_SPACING→25.
     ✅ STAGE 2a (Han 2026-06-08 "go!"): X_SPACING→25. Heads = QUARTER notes (Maestro 'Ï') with
        ledger lines for near-active off-staff heads. DRAG on BOTH carousels (fractional
        dragDelta, PX_PER_STEP) → snap to nearest half-step on release; tap still jumps.
        Vertical clip mask (taller while dragging = more notes). Quick-pick concert-note rects
        left of the name carousel (C5,E♭4,C4,B♭3,F3,E♭3,C3,B♭2). Clamp [−5,11]. Build/tests green.
        Answers: octave→octave-clef (toonklasse + 8va/15ma/8vb/15vb, fade); quick-picks=concert
        sounds, beside LEFT carousel (mirror intervals on right).
     ⏳ STAGE 2b (STAGED — needs clef-octave system expanded): octave-clef-on-release fade
        (OCTAVE_VARIANTS lacks treble8vb/15vb + bass15va/15vb → add them first) and the
        octave quick-picks (C3/C5/B♭2, now dim+inert). Drag interactivity needs LIVE test.

N — NEW:
  ✅ N6 RangeStaffOverlay body+edge layers now pass transpositionSemitones={trans} → notes
     render at WRITTEN position AND colour (concert→written map + concertMidiByWritten for
     boundary/in-band; writtenName() for band+ellipsis Y). Verified via render-range-trans
     (trans=+2 moves notes up + recolours, boundaries stay yellow). Supersedes #16.

STAGE 2c BATCH (Han 2026-06-09) — transposition setter polish + transposed key sig:
  ✅ 1 curveY flipped to −t³ (higher written notes fan up). TranspositionSetter.jsx.
  ✅ 2 Heads now drawn WITH stems ('Ï' is notehead-only → stem path added, std direction).
  ✅ 3 Active = head CLOSEST to centre (m===writtenActive), always one lit. Both carousels.
  ✅ 4 Inactive heads/names use var(--text-lowlight) (was undefined --setter-lowlight → black).
  ✅ 5 Maestro #/b accidental drawn in front of head when name carries one (was ASCII '#'
       includes() check vs Unicode spelling → never rendered). Distinguishes C from C♯/D♭.
  ✅ 6 BUG FIXED (per-staff, interview-confirmed): WRITTEN key signature per staff =
       numAccidentals + getTranspositionFifths(key) (circle-of-fifths shift, formula not table).
       Notes respelled to written key via respellToKeySignature so in-key notes drop inline
       accidentals. SheetMusic header + renderMelodyNotes per-staff. Tests + build green.
  ⏳ NEW (Han 2026-06-09, mid-task): left setter — render a fixed C4 note (C-inst) and SWAP so
       it reads [C4 note] = [name carousel]. Layout ambiguous → confirm before building.

## TRANSPOSITION "PROPER IMPL" BATCH (Han 2026-06-09) — INTERVIEW PENDING
Main sheet music:
  ✅(verify) #1 accidentals: numAccidentals + getTranspositionFifths already wired (F→1,Bb→2),
      shown in NORMAL view, hidden in clef-edit by design. Confirm with Han it's actually wrong.
  ❓ #2 coloring reference: getMelodicColor already colours by WRITTEN note name PC. Han wants
      "tied to note name" — need: concert (sounding) vs written PC? tonic/scale/chord refs are
      concert → under transposition written notes mismatch concert tonic/chord. DECISION NEEDED.
  ⏳ chord active-colour when paused: tonic chord if it's the LAST melody chord, else FIRST melody
      chord; in Notation+Range setters use C major triad as active chord.
Notation setter:
  ⏳ both repeated clefs get "(X inst)" label (even C → "(C inst)").
  ⏳ active/highlighted head always coloured as C4 (green chromatone / tonic|chord colour);
      lowlights stay lowlight; fixed concert-C4 head uses (transposed) colouring.
  ⏳ percussion notes + chord letters in setter not coloured → use existing colour fns. SCOPE?
  ⏳ quick-picks: move to RIGHT of carousel; highlight only active, others lowlight.
  ⏳ spacing: left elements too far apart, right setter overlaps; left "=" at same height as C-note.
Then: D (octave clefs / 2-oct) + E (animation).

## TRANSPOSITION MODEL + TOGGLES (Han 2026-06-09)
Interview outcome:
  - Notes SHIFT to written display (current display is correct), BUT identity/colour/melody/
    playback stay concert (C4 stays C4). VERIFIED: transposition is display-only (no audio/gen
    leak); colour now concert (last batch). => "bug" already satisfied, no code change needed.
  ⏳ Toggle 1 LINK: keep same transposition on both staves (set one → other follows).
  ⏳ Toggle 2 INSTRUMENT→TONIC: selecting inst sets tonic to sounding key
     (newTonic = oldTonic − getTranspositionSemitones(key); Bb→ C→Bb, G→F). SEMANTICS to confirm:
     does it REPLACE the display-shift with a tonic change (reset transKey→C), or stack with it?
  Then: D (octave clefs / 2-oct) + E (animation).

## GLOBAL TRANSPOSITION (item 5, Han 2026-06-09) — model locked, build next
Trigger: AUTO — when BOTH staves carry the SAME transposition (key+octave) → global mode.
In global mode the WHOLE display moves to the WRITTEN domain (concert Bb denoted as C):
  - Header KEY shows the WRITTEN key (concert C major + Bb inst → "D Major") + a
    "(Bb instrument)" line right below the "Random Melody in <key>" header.
  - Chord labels → transposed to written (ChordLabelsLayer).
  - Note-name lyrics / solfège → transposed to written.
  - Tonic/key in header → written.
Notes positions + key signature already render written per-staff (done). Audio stays concert.
Touch points: header (App/SheetMusic title), ChordLabelsLayer, lyrics/solfège renderer,
a global-mode detector (treble.trans === bass.trans && !== 0).

## STILL OPEN after items 1/2/D (this turn):
  ⏳ Stage I: render perc-pattern + chord letters in the notation setter as NORMAL melodies
     (Han: "why don't you just render them as normal melodies?") so colour fns apply.
  ⏳ Item 5 global transposition (model above).
  ⏳ Stage E: carousel animation (tween on preset click instead of jump).

## DONE (Han 2026-06-09 session): items 1,2, D, 5(a/b/c), I, E
  ✅ 1 (X inst) top-right · 2 fixed C4 coloured by sounding pitch
  ✅ D 2-octave range via auto octave-clefs (transpositionOctave + decompose + written-note clef)
  ✅ 5 GLOBAL transposition: header written key + (X instrument) line; chord LETTER labels
       transposed; absolute solfège transposed (relative invariant). Auto when both staves match.
  ✅ I percussion pattern in notation setter coloured via real colour mode (active option)
  ✅ E carousel tween on tap (easeOutCubic, 280ms); drag-release skips the tween

## ANACRUSIS REPEAT (Han 2026-06-14) — pickup flows out of the last bar on repeats
Design agreed: SHORTEN the final note if possible; CLIP on overlap (notes starting inside the
pickup region of the last bar are disregarded). GENERAL runtime mechanism — detect the anacrusis
and build the pieces at runtime; works for any pickup song, not just HBD.
  🔨 Phase 1 (DONE): pure transform `src/utils/anacrusisRepeat.js`
       buildAnacrusisRepeatParts(melody, measureLen) → { hasAnacrusis, intro, loopClean, loopMerged }.
       intro = pickup notes alone (play ONCE). loopClean = body rebased to 0 (FINAL repeat, full last
       note). loopMerged = body with pickup merged into the last bar, overlapping note clipped to the
       pickup start (repeats 1..N-1). Unit-tested.
       Now also preserves lyrics + chord displayNotes through the merge (HBD words stay bound).
  🔍 WIRING DISCOVERY (2026-06-15): loaded songs play via handlePlayRepeat → repeatForever=true =
       isRepeatMode, no regen, numMeasures constant (9). "Keep 9 bars, empty m0 on repeats" is
       BROKEN (a full empty bar between pickup and downbeat). Repeat unit MUST be the body
       (bodyMeasures=8). Chosen shape: REPEAT mode = play intro ONCE (1-beat lead-in) then loop
       loopMerged forever (loopClean unused, no last pass). ONCE mode = original melody unchanged.
       repsPerMelody==numRepeats (one value, two names — config field vs render prop; arch §0). See §40.
  🔨 Phase 2 wiring STEP 1 (AUDIO) — DONE in Sequencer.start(), gated on repeatForever + anacrusis:
       builds merged body for all tracks (chords straddling m0 clipped), rebases fermatas (-ml),
       sets currentNumMeasures=bodyMeasures, regenerates metronome, plays the pickup ONCE as a lead-in
       (playMelodies tickRange=[pickupStart,ml]) then advances nextStartTime to the downbeat.
       ⚠ NEEDS HAN LIVE-CHECK: play HBD in REPEAT mode — pickup should flow out of the last bar with
       no dead bar; chords/bass aligned. Visual measure NUMBERING may be off (React state still holds
       the 9-bar original) — that's wiring step 2.
  ⏳ Phase 2 wiring STEP 2 (NOTATION): sync the displayed melody/numbering to the body so sheet
       matches audio (App trebleMelody vs Sequencer body divergence).
  ❓ OPEN for Han: (a) OK that on repeats the pickup shows at END of each block (not a leading bar),
       refined in phase 3? (b) Confirm once-mode plays unchanged + repeat-mode is always-merged.
  ⏳ Phase 3: pagination polish — leading-pickup bar on the first pass.
<<<<<<< HEAD

### Note-colouring 'scale' mode (Han 2026-06-16) — ADDED then REMOVED (Han 2026-06-17)
🗑️ Removed at Han's request: redundant — already covered by the existing tonic/scale colouring
   ("my bad"). Reverted commit 20309ee (the 'scale' branch in melodicNoteColor + the two sheet
   renderers + PianoView + the colour-menu/palette cycles + --note-blue var + tests/docs).

### Instrument selector in the sheet music (Han 2026-06-16)
✅ New in-staff INSTRUMENT setter (sibling of clef/range/colour) — 271 tests green, build clean.
   See architecture.md §41. Per-staff (treble row → treble instrument, bass row → bass).
   Horizontally-scrollable strip of instrument cards (lucide icon + name) grouped by family,
   active centered, via reused ClefCardCarousel.
   - NEW src/constants/instruments.jsx: grouped GM-slug list (extended +10), getInstrumentIcon,
     flat INSTRUMENTS map (RangeControls imports it — single source of truth), ICON_ATTRIBUTION.
   - NEW src/components/sheet-music/overlays/InstrumentStaffOverlay.jsx (data-fly cascade wrapper,
     group-label separator cards, attribution line; placeholder lucide icons → icons8 swap TODO).
   - PLUMB instrumentEditMode mirroring colorEditMode: App.jsx, SubHeader.jsx, SheetMusic.jsx,
     useRangeMorph.js groupsForKind('instrument').
   - onSelect → setTrebleSettings/setBassSettings({...,instrument}).

## TS-change-while-stopped malformed sheet (BACKLOG 1596) — 2026-06-17
✅ Fixed. melodyMeasureCount used Math.round → dropped partial final measure after a
   TS change (192 ticks in 3/4 = 5.33 → 5, not 6). Switched to ceil via new pure helper
   melodyMeasureSpan(total, measureLen, fallback) in melodySlice.js (Math.ceil(x - 1e-6),
   max 1, empty fallback). SheetMusic.jsx calls it. Processor already ties across new
   barlines + pads partial bar, so no rebarMelody needed. Eliminated at state level:
   stopped branch mutates only timeSignature. Tests +9 (280 green), build clean.
   Docs: architecture.md §13 bug log. Files: melodySlice.js, SheetMusic.jsx,
   melodySlice.test.js, architecture.md, BACKLOG.md.

## RANGE setter refinements R1–R4 (Han 2026-06-17)
✅ R1 Per-note staggered re-layout cascade. After a range commits, notes glide to
   new x in QUICK left→right succession (runRangeCascade, ~360ms, element.style
   translateX per §6, single-commit preserved). Tap now commits immediately;
   slideRef survives only for hold-extend (holdExtending gates cascade off).
✅ R2 Keyboard commit drives the SAME cascade (committed-key useLayoutEffect reads
   trebleRange/bassRange ← settings.range that KeyboardRangeSetter writes).
✅ R3 (bug) Keyboard band flash on open fixed: bandTransition flag + .kbd-range-band
   --instant gate the CSS x/width transition off until first real width rendered
   (root cause: width 0→real ResizeObserver jump animated by the transition).
✅ R4 Boundary highlight yellow→white: new theme-safe --range-boundary-highlight
   (#fff dark themes, #2b3a42 light) on boundary notes, selected melodic+percussion
   brackets, keyboard active bracket + band/handles. Unrelated --accent-yellow left.
   Files: RangeStaffOverlay.jsx, KeyboardRangeSetter.jsx (+css), App.css, scripts/
   render-range*.jsx, docs/architecture.md, RangeStaffOverlay.test.jsx (+2 tests).
   Tests 293 green, build clean. NOT committed (Han verifies feel live).

✅ Three generator setters PLAYBACK / GENERATION / GEN. ADVANCED (Han 2026-06-22).
   In-sheet-music overlays, siblings of range/clef/colour/instrument/legacy. Per-balk
   (row/staff: treble/bass/perc + CHORDS as 4th balk). PLAYBACK reuses SettingsOverlay
   via new groupClassName prop ('playback-overlay'); GENERATION + GEN.ADVANCED are new
   SvgSetter-based overlays. Field option arrays extracted to src/constants/
   generationFields.js (shared with InstrumentRow per §6d). 3 new edit-mode states +
   toggles in useEditMode (full mutual exclusion, tested). overlayKind +
   groupsForKind + mountedFor + render blocks in SheetMusic. App threads flags/handlers.
   SubHeader: 3 buttons (SlidersHorizontal / Sparkles / FlaskConical). Smoke tests for
   both new overlays + useEditMode mutual-exclusion tests. docs §42. Tests 455 green,
   build clean, lint 0 errors. NOT committed.
   🐞 PROVISIONAL: CHORDS-balk mapping (esp. GEN.ADVANCED passing-chords cycler in the
      tuplets column) needs Han confirmation. Layout/spacing UNVERIFIED on a live staff.
