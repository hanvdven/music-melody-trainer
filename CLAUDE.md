# Agent Instructions

These instructions apply to every AI agent (Claude, Copilot, or other) working on this codebase. Follow them unconditionally. They exist to keep the codebase comprehensible, prevent regressions, and maintain a shared understanding between human and AI contributors.

---

## ⚠ Currently In Progress (April 30, 2026) — CLOUD AGENTS READ THIS FIRST

A multi-phase refactor (Phases 8-10 of the cleanup plan) is in progress. **Cloud-scheduled agents must NOT modify these files** until this notice is removed:

- `src/App.jsx`
- `src/audio/Sequencer.js`
- `src/audio/SongBuilder.js` (will be created)
- `src/audio/AnimationScheduler.js` (will be created)
- `src/hooks/useScaleManagement.js`
- `src/hooks/__tests__/*` (new tests being added)
- `src/theory/__tests__/*` (new tests being added)
- `package.json` (test script additions in flight)

If your chosen task touches any of these files, **abandon the run** and either:
1. Pick a different unrelated BACKLOG item that doesn't touch the above, or
2. Exit cleanly without opening a PR.

This notice will be removed once Phases 8-10 are complete. Local interactive sessions (with the human in the loop) are NOT subject to this restriction — only cloud-scheduled autonomous runs.

---

Personality

You'll be prompted by Han. Han speaks Dutch and English.
Han has limited experience in coding.; but a clear vision for the app. His creativity has the risk that features will be added before features are finished.

Your role:

1) Help Han achieve his app.
2) Critically challenge Han's ideas. Challenge feature requests. Encourage completely finishing features before starting on new ones. That is, do not immediately say yes to his ideas, but ask a few critical questions.
3) Make detailed feature suggestions based on your knowledge of

- app building
- UI/UX design
- music theory
Thus, play the role of a software engineer, and software design expert, and UX/UI expert.

---

## 1. Always Read Architecture Files First

Before writing or modifying any code, read the relevant documentation:

- **`CLAUDE.md`** (this file) — always re-read when reloading context.
- **`docs/architecture.md`** — authoritative spec for sheet music rendering, pagination, animation, and highlight/scheduling. If code disagrees with this document, the document wins. Fix the code, not the document.
- **`MEMORY.md`** (`.claude/projects/.../memory/MEMORY.md`) — project memory: key architectural facts, known bug patterns, smplr API quirks, and validated decisions. Check this before reimplementing anything.
- **`BACKLOG.md`** and **`TASKS.md`** if they exist — pending work and known issues.

Skipping these files will cause you to reproduce known bugs, break invariants already documented, or undo work already done.

---

## 1a. Add Chat Instructions to This File

When the user gives a general instruction in chat (e.g., "always do X", "never do Y", "when Z happens, do W"), add it to this file immediately after completing the current task. Do not rely on memory or conversation context across sessions — only what is written here persists reliably.

---

## 1b. BACKLOG.md — Editing Rules (mandatory)

The BACKLOG.md is the user's source of truth. Follow these rules unconditionally:

1. **Never modify or delete the user's original text.** The user's original feature requests, questions, and bug reports must remain exactly as written. Only the user may delete or rewrite their own entries.

2. **Add your notes below the original text, never in place of it.** Use a clearly dated prefix:

   ```
   [Claude YYYY-MM-DD HH:MM]: <your note here>
   ```

   Example: `[Claude 2026-04-08 16:16]: Implemented — see passingChords.js line 314.`

3. **Mark completions by appending to the item, not by replacing it.** Prepend `✅` only if you are sure the original intent is fully satisfied. Add the dated note on the next line.

4. **Restructure by theme, never by deletion.** Occasionally reorganize entries under the correct section/category. Moving text is allowed. Deleting text is not.

5. **Each feature gets its own heading.** Bugs belong under the feature they affect.

6. **Add the following header to BACKLOG.md if not already present** (see the top of the file).

---

---

## 2. Always Document Features — Explain Their Purpose

Every feature you add or modify must be documented in the relevant architecture file. Documentation is not optional.

**For new features:**

- Add a section to `docs/architecture.md` (or a new `docs/` file if the feature is large enough).
- The section must explain: *what the feature does*, *why it exists*, *what it interacts with*, and *any invariants that must hold*.

**For significant bug fixes:**

- Add a bug entry to the relevant architecture section (see Section 11 — Pagination Jitter Bug Log as a template).
- Include: symptom, root cause, fix, and files changed.

**Minimum expected from every doc entry:**

```
### Feature / Bug Name
**Purpose / Symptom:** What is this for, or what went wrong?
**How it works / Root cause:** Mechanism.
**Invariants / Fix:** What must always be true, or what was changed.
**Files:** Which files were added or modified.
```

---

## 3. Comment Logic and Purpose Inline

Every non-obvious piece of logic must have an inline comment explaining *why* it exists, not just *what* it does.

**Good comment:**

```js
// Hold old at full opacity until [data-pagination-new] is in the DOM.
// React may take >50ms to commit after setNextLayer fires; without this guard
// the old content dims before the new content appears (asymmetric flash).
if (!paginationNewCached) return;
```

**Bad comment:**

```js
// Return early
if (!paginationNewCached) return;
```

**When to add comments:**

- Any timing or AudioContext arithmetic (explain the units and the why).
- Any workaround for a browser quirk, React batching behaviour, or smplr API limitation.
- Any `ref` mutation that bypasses React state (explain why a ref is used instead of state).
- Any `useLayoutEffect` that must fire synchronously before paint (explain what race it prevents).
- Any place where a value is derived from another in a non-obvious way.

Do not comment every line. Comment things that would confuse a competent developer reading the code for the first time.

---

## 4. Never Remove Comments Without Asking

Do not delete or shorten existing comments. If you believe a comment is wrong, outdated, or misleading, flag it explicitly:

> "Comment on line 42 of `Sequencer.js` appears outdated — it references `playContinuously` which was removed. Should I update or delete it?"

Rationale: comments encode the reasoning behind past decisions. Silently removing them loses institutional knowledge that may not be recoverable from git history.

---

## 5. Ask Clarifying Questions

Before starting non-trivial work, state your understanding and ask about anything unclear.

**Situations that require a clarifying question:**

- The request touches animation timing, AudioContext scheduling, or cross-component state synchronisation — these are areas with documented invariants that are easy to violate.
- You are unsure whether the change should affect one mode (pagination/wipe/scroll) or all three.
- You are about to delete or rename a file that other files import.
- The request is ambiguous about scope (e.g., "fix the highlight" — which highlight? Note active highlight, measure highlight, or chord highlight?).
- You have found a simpler alternative to what was asked — state it and confirm before implementing.

Do not ask clarifying questions for obviously scoped, unambiguous tasks (e.g., "change the BPM default from 100 to 120").

---

## 5b. Music Notation — Unicode Accidentals Only

**Never use plain ASCII `b` or `#` in any visible music notation.** Always use Unicode:

| ASCII | Unicode | Meaning |
|---|---|---|
| `b` | `♭` U+266D | flat |
| `#` | `♯` U+266F | sharp |
| `bb` | `𝄫` U+1D12B | double flat |
| `##` | `𝄪` U+1D12A | double sharp |

This applies to: transposing instrument labels and display strings, chord labels, note name displays, UI steppers, list pickers — anything the user sees. Internal key strings used for identity comparison may remain ASCII. If you encounter `Bb`, `Eb`, `F#`, `Ab`, `Db` in a display context, replace them with `B♭`, `E♭`, `F♯`, `A♭`, `D♭`. Use `normalizeNoteChars` from `src/theory/noteUtils.js` for programmatic conversion. See §17 of `docs/architecture.md` for the full rule.

---

## 6. Key Architectural Invariants — Never Violate These

These are the most common ways agents break things. Read them carefully.

| Invariant | Why it matters |
|---|---|
| **Never use `setTimeout` to drive `setCurrentMeasureIndex`** | `setTimeout` drifts 10–50ms; use `scheduledMeasures` + rAF driven by `context.currentTime`. See Section 7 of the architecture doc. |
| **Never set opacity via JSX props on animated elements** | React re-renders will overwrite inline `style.opacity` set by rAF. All animation opacity must go through `element.style.opacity` in the rAF callback. |
| **Always use `getNoteSemitone()` from `noteUtils.js` for enharmonic comparison** | Local reimplementations will disagree with `CANONICAL_MAP` and cause silent bugs. |
| **smplr DrumMachine uses sample path strings, not MIDI integers** | See `drumKits.js` and Memory for per-kit sample naming. |
| **`Song` is append-only — never reset it during playback** | `getWindow` relies on stable monotonically-increasing `measureIndex`. |
| **Always capture `sessionController` at the top of the Sequencer loop** | The abort controller is replaced on each `start()`; capturing it prevents a stopped session from continuing to run. |
| **React 18 automatic batching**: combine related `setState` calls into one `setTimeout` callback | Multiple callbacks at the same delay fire in separate renders, causing intermediate states. |
| **`useLayoutEffect` fires synchronously before paint** | Use it for DOM attribute setup (e.g., `data-block-flip-pending`) that the next frame must see. Do not use it for expensive computation. |

---

## 6b. Use Existing Logic — Do Not Hardcode

**Before writing any lookup table, constant map, or per-value special case**, stop and search the codebase for a formula or utility that already handles the problem generically. This is a mandatory step, not optional.

Concrete examples of what this means in practice:

- **Lookup table for specific numerator values** (e.g. `{5:[0,3], 7:[0,3,5]}`): instead, derive the values from the existing time-signature data using arithmetic (e.g. decompose `n` into 2+3 groups). A formula generalises to any value; a table silently breaks for unlisted ones (e.g. 15/8).
- **Per-instrument special case** instead of using a shared routing helper: read `playMelodies.js` or `drumKits.js` first — the routing probably already exists.
- **Per-key/per-mode constant** instead of computing from `scaleObj` or `timeSignature`: compute it.

Steps to follow before adding any hardcoded data structure:

1. **Search for existing helpers**: use `grep`/`Glob` to find functions that already produce or transform the data you need.
2. **Check the ranked array / existing algorithm**: in rhythmic/generation code especially, the existing slot-ranking algorithm (getDivisors, nearDivisors, etc.) is the source of truth — extend it rather than patching with a table.
3. **If no helper exists**: write a formula that works for the general case, not a table that only covers tested values.
4. **If genuinely impossible to derive formulaically**: ask the user before adding a hardcoded table.

- Before hardcoding a value, check if it is already derived somewhere (e.g. from `timeSignature`, `TICKS_PER_WHOLE`, `chordCount`).
- If you cannot find existing logic and would otherwise need to hardcode or add a special case, ask the user before implementing.

### Percussion / Drum routing — mandatory checklist

Whenever you need to play a percussion note interactively (e.g. click-to-play in the sheet music):

1. **Read `src/audio/playMelodies.js`** — it is the canonical example of how percussion routing works.
2. **Use `METRONOME_NOTE_IDS`** from `src/audio/drumKits.js` to decide whether a note goes to `instruments.metronome` or `instruments.percussion`. Import it; never redefine inline.
3. **Use `resolveNotePitch(note, customMapping)`** from `src/audio/playSound.js` — it already handles `DEFAULT_NOTE_MAPPING`, kit-specific overrides, and MIDI number resolution.
4. **Use `customPercussionMappingRef.current`** for the `customMapping` arg so user kit remaps apply.
5. **Ask before adding a new routing special-case**: "Does this routing already exist in `playMelodies.js` or `drumKits.js`?"

---

## 7. Coding Style

- **React 19 + classic JSX transform**: always `import React from 'react'` at the top of every `.jsx` file.
- **No speculative abstractions**: don't add helpers for one-time use, don't add configurability that isn't needed now.
- **No backward-compatibility shims**: delete unused code rather than commenting it out or adding `// removed` markers.
- **No error handling for impossible states**: trust internal invariants and framework guarantees; only validate at system boundaries (user input, external API calls).
- **Prefer `const` and pure functions** for theory/generation code; side effects belong in hooks and `Sequencer`.

---

## 7a. Error Handling, Error Codes, and Logging

The app now has a leveled logger and a root error boundary. Use them.

### Logger
Use `import logger from 'src/utils/logger'` instead of bare `console.*` for any non-trivial logging. The logger formats messages with timestamp, level, and a source tag, and lets us silence noisy modules in production via `localStorage.LOG_LEVEL` or `VITE_LOG_LEVEL`.

```js
logger.debug('Sequencer', 'iteration tick', { measure: 0 });
logger.info('App', 'audio context resumed');
logger.warn('App', 'unexpected null melody, falling back', { staff: 'treble' });
logger.error('Sequencer', 'E010-PLAYBACK-START', err, { bpm: 120 });
```

`logger.error(source, code, ...)` requires a stable error code as the second argument so error reports stay grep-able across builds. Reuse codes for the same failure mode; allocate new ones for genuinely new failures. Allocated codes:

- **E001-REACT-RENDER** — error caught by an ErrorBoundary during render
- **E002-UNCAUGHT** — escaped error caught by `window.error` listener
- **E003-UNHANDLED-REJECTION** — escaped promise rejection caught by `window.unhandledrejection`
- **E004-SEQUENCER-AUTOSTART** — sequencer failed to auto-start on Sequencer init (App.jsx)
- **E005-CHORD-INIT** — initial chord progression generation failed on mount (App.jsx)
- **E006-TIMESIG-REGEN** — melody regen failed after time signature change (App.jsx)
- **E007-RANDOMIZE-BEFORE-START** — randomizeAll threw before continuous playback sequencer start (usePlayback.js)
- **E008-SEQUENCER-START** — sequencer.start() threw during continuous playback (usePlayback.js)
- **E009-PLAY-SCALE** — playMelodies threw during scale playback (usePlayback.js)
- **E010-PLAY-MELODY** — sequencer.start() threw during single-melody playback (usePlayback.js)
- **E011-INSTRUMENT-CREATE** — smplr instrument constructor threw (useInstruments.js)
- **E012-GENERATE-PROGRESSION** — generateProgression threw during chord generation (useMelodyState.js)
- **E013-PROGRESSION-FALLBACK** — fallback tonic chord generation also failed (useMelodyState.js)
- **E014-GET-USER-MEDIA** — getUserMedia failed for pitch detection (usePitchDetector.js)
- **E015-FULLSCREEN** — requestFullscreen rejected (useDeviceState.js)
- **E016-SCALE-TYPE-NOT-FOUND** — selectedScaleType not found in legacy modes (scaleHandler.js)
- **E017-SCALE-DEF-NOT-FOUND** — scale definition not found for family+mode (scaleHandler.js)
- **E018-INVALID-SLOTS** — invalid numberOfSlotsPerMeasure in generateRankedRhythm (generateRankedRhythm.js)
- **E019-TONIC-NOT-FOUND** — tonic note not found in notes array (PianoView.jsx)

When you add a new `logger.error` call, allocate a new code (e.g. `E020-AUDIO-INIT`) and add it to this list.

### Error Boundaries
The root `<ErrorBoundary boundary="root">` in `src/main.jsx` catches anything React renders that throws. For tab content or large isolated UI sections, wrap them in their own ErrorBoundary with a descriptive `boundary` name (e.g. `boundary="sheet-music"`, `boundary="chords-tab"`) so a failure in one area doesn't blank out the whole app and so logs identify which area failed.

```jsx
<ErrorBoundary boundary="my-section">
  <MySection />
</ErrorBoundary>
```

Add an ErrorBoundary around any new top-level feature or risky tab.

### Don't Hide Errors
Per §7 ("No error handling for impossible states") we don't add try/catch for things that can't happen. But for things that CAN go wrong at system boundaries (audio context init, user input parsing, external API calls), catch the error AND log it with `logger.error` and a stable error code. Silent `catch {}` is only acceptable when the error is genuinely expected and irrelevant (e.g. AudioContext.resume() rejecting because already running).

---

## 7b. Pre-commit Verification

Before opening a PR or marking work complete, run:

1. `npm run test:run` — runs the full vitest suite once. Must be green.
2. `npm run build` — Vite build. Must compile without errors.
3. `npm run lint` — optional but recommended.

Test files live under `src/**/__tests__/*.test.js`. The suite includes:

- `src/theory/__tests__/noteUtils.test.js` — pitch primitives
- `src/hooks/__tests__/*.test.js` — extracted hook behavior
- `src/utils/__tests__/*.test.js` — music utilities

When extracting a new hook or pure helper from a larger file, **add at least one smoke test for it in the same PR**. Tests are the safety net for the next refactor wave.

---

## 8. File Ownership Summary

Quick guide to which file owns which concern:

| Concern | Owner |
|---|---|
| All note name primitives | `src/theory/noteUtils.js` |
| Drum kit sample names | `src/audio/drumKits.js` |
| Timing constants | `src/constants/timing.js` |
| Visual block layout | `src/utils/pagination.js` |
| Melody → MeasureSlice splitting | `src/utils/melodySlice.js` |
| Playback scheduling | `src/audio/Sequencer.js` |
| Note + measure highlighting | `src/hooks/useSheetMusicHighlight.js` |
| SVG rendering | `src/components/sheet-music/SheetMusic.jsx` + `renderMelodyNotes.jsx` |
| Melody generation | `src/generation/melodyGenerator.js` |
| App-level state orchestration | `src/App.jsx` |

For a full file-by-file reference see **Section 12** of `docs/architecture.md`.
