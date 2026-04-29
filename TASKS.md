# Tasks

- [x] Superimpose a small '1' onto the play button in the melody icon. Replace the text 'Melody' to 'Play Once'. Make the '1' look like 'lucide' style.
- [x] Make the index of the note subscripted (e.g., C4 -> C_4) in the PianoView (and potentially other views like Staff).

---

## Feature: Passing Chords

Full spec: `docs/feature-passing-chords.md`
Architecture: `docs/architecture.md` Section 14

### Task 1 ✅ — `src/theory/chordGenerator.js`
Add `generatePassingChord(scale, nextChord, type, complexity)`:
- `type`: `'secondary-dominant'` | `'secondary-dim'` | `'tritone-sub'` | `'diatonic'`
- For diatonic: use `generateChordOnDegree(scale, adjacentDegree, complexity)`
- For chromatic types (1-3): build chord directly from root pitch class + interval pattern using `ALL_NOTES`
- Set `chord.meta.isPassing = true` on the returned Chord
- Export `generatePassingChord` alongside existing exports

### Task 2 ✅ — `src/generation/passingChords.js` (new file)
Implement `insertPassingChords(chordMelody, scale, timeSignature, complexity)`:
- Inputs: the generated `chordMelody` Melody, `Scale`, `[n,d]`, chord complexity string
- Algorithm: for each gap between consecutive structural chords, find 8th-note off-beat positions, 50% chance insert a passing chord there (at most one per gap)
- Beat detection: `offset % (TICKS_PER_WHOLE / timeSignature[1]) !== 0`
- Returns a new Melody with structural + passing chords interleaved, sorted by offset
- Import `generatePassingChord` from chordGenerator.js
- Import `TICKS_PER_WHOLE` from constants/timing.js
- Import `Melody` from model/Melody.js

### Task 3 ✅ — `src/hooks/useMelodyState.js`
After normal chord generation (around line 145 where `chordMelody` is finalized):
- Import `insertPassingChords` from `../generation/passingChords`
- If `chordSettings?.passingChords`, call:
  ```js
  chordMelody = insertPassingChords(chordMelody, scale, activeTS, chordSettings?.complexity || 'triad');
  ```

### Task 4 ✅ — `src/components/controls/rows/InstrumentRow.jsx`
Two changes in the `isChords` stepper block (around line 554):

**4a. Extend chordCount allowedValues and options:**
```js
allowedValues={[0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4]}
options={[
  { label: '¼', value: 0.25 },
  { label: '½', value: 0.5 },
  { label: '1', value: 1 },
  { label: '1½', value: 1.5 },
  { label: '2', value: 2 },
  { label: '2½', value: 2.5 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
]}
```
Also update the label formatter to handle 2.5 → '2½'.

**4b. Add `passingChords` toggle** below the chordCount stepper (still in `isChords` branch):
- A simple checkbox or SmartToggle showing "Passing ↗"
- `checked={settings?.passingChords ?? false}`
- `onChange={(val) => setSettings(p => ({ ...p, passingChords: val }))}`

### Task 5 ✅ — `src/components/sheet-music/SheetMusic.jsx`
In `renderSingleChordLabel` (around line 1354):

**5a.** Detect passing chord: `const isPassing = chord.meta?.isPassing === true;`

**5b.** Use smaller font sizes when `isPassing`:
- Root fontSize: `isPassing ? 21 : 26`
- Superscript fontSize: `isPassing ? 13 : 16`

**5c.** When `isPassing`, render a `→` arrow element at fixed Y **above** the chord root:
```jsx
{isPassing && (
  <text
    x={xPos}
    y={CHORD_ROOT_Y - CHORD_SUPER_DY - 10}
    fontSize="10"
    fontFamily="sans-serif"
    fill={chordColor}
    style={{ userSelect: 'none', pointerEvents: 'none' }}
  >→</text>
)}
```
This Y coordinate (`CHORD_ROOT_Y - CHORD_SUPER_DY - 10`) is fixed and never altered by superscript `dy` shifts.

### Task 6 ✅ — `src/model/InstrumentSettings.js`
In `defaultChordInstrumentSettings()`, add default for new field:
```js
settings.passingChords = false;
```

### Task 7 ✅ — Documentation
- `docs/architecture.md` §16 reflects implementation accurately (already updated).
- `docs/feature-passing-chords.md` marked IMPLEMENTED; original spec diverges from final impl — architecture.md §16 is authoritative.
