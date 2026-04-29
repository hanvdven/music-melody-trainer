# Passing Chords — Theory, Notation, and Planning Rules

This document is the authoritative reference for the **music-theory decisions** behind passing chord
generation. For the **architecture and data-flow** see `docs/feature-passing-chords.md`.

---

## 1. What Is a Passing Chord?

A passing chord is a transient chord that occupies a rhythmically weak position (non-beat slot) and
smoothly connects two structural chords. Its function is purely connective: it does not establish a
new key centre, but creates voice-leading momentum toward the next structural chord.

```
Structural A ─── passing ─── Structural B
(beat)          (off-beat)   (next beat)
```

The passing chord is generated *after* structural chord planning. It cannot break a fixed cadence
(Pachelbel, Andalusian, ii-V-I) because structural chords are frozen; passing chords only subdivide
the duration of the structural chord that precedes them.

---

## 2. Passing Chord Types

### 2.1 Secondary Dominant  `V7/x`

**Root:** `(targetRoot + 7) % 12` — a perfect fifth above the target.  
**Structure:** dominant 7th `[0, 4, 7, 10]`.  
**Resolution:** strong root-motion by descending fifth into target.

| Target x | Passing chord | Roman numeral |
|---|---|---|
| I  (C) | G7  | V7      |
| ii (Dm)| A7  | V7/ii   |
| iii(Em)| B7  | V7/iii  |
| IV (F) | C7  | V7/IV   |
| V  (G) | D7  | V7/V    |
| vi (Am)| E7  | V7/vi   |

**Note:** When target = I, the slash is omitted (just `V7`), because V7→I is the primary dominant.

**Same-root problem:** When the current structural chord A has the same root as the secondary
dominant (i.e., the motion A→B is a rising 4th / falling 5th), the secondary dominant becomes
A major with an added minor 7th — barely different from A itself.

Examples of this same-root situation:
- I → IV: V7/IV = C7 ≈ I7 (same root as I)
- ii → V:  V7/V  = D7 ≈ ii7 (same root as ii)
- iii → vi: V7/vi = E7 ≈ iii7 (same root as iii)
- V → I:   V7    = G7 ≈ V7  (already is the dominant — not a "passing" chord)
- vi → ii: V7/ii = A7 ≈ vi7 (same root as vi)

**Rule:** when V7/x has the same root as the current structural chord A, *prefer tritone-sub or
secondary-dim* instead (see Section 5 for probability weights).

---

### 2.2 Secondary Diminished  `vii°7/x`

**Root:** `(targetRoot − 1 + 12) % 12` — a chromatic half step below the target.  
**Structure:** fully-diminished 7th `[0, 3, 6, 9]`.  
**Resolution:** leading-tone upward resolution by semitone.

| Target x | Passing chord | Roman numeral  |
|---|---|---|
| I  (C) | B°7  | vii°7      |
| ii (Dm)| C♯°7 | vii°7/ii   |
| iii(Em)| D♯°7 | vii°7/iii  |
| IV (F) | E°7  | vii°7/IV   |
| V  (G) | F♯°7 | vii°7/V    |
| vi (Am)| G♯°7 | vii°7/vi   |

**Note:** The root is *always* one semitone below the target. This is never the same root as a
diatonic chord, so there is **no same-root problem** for this type.

---

### 2.3 Tritone Substitution  `♭II7/x`

**Root:** `(targetRoot + 1) % 12` — a chromatic half step *above* the target.  
**Structure:** dominant 7th `[0, 4, 7, 10]`.  
**Resolution:** descending semitone into target root (smooth bass motion).

The tritone sub is the tritone-related substitute for V7/x (their tritone intervals are shared).

| Target x | Passing chord | Roman numeral |
|---|---|---|
| I  (C) | D♭7  | ♭II7      |
| ii (Dm)| E♭7  | ♭II7/ii   |
| iii(Em)| F7   | ♭II7/iii  |
| IV (F) | G♭7  | ♭II7/IV   |
| V  (G) | A♭7  | ♭II7/V    |
| vi (Am)| B♭7  | ♭II7/vi   |

**Voice-leading note:** the bass always moves by semitone down into target. When used in a chain,
two consecutive tritone subs produce a chromatic bass descent (e.g., E♭7 → D♭7 → C = ♭II7/ii →
♭II7 → I, a jazz "side-slip" approach).

---

### 2.4 Diatonic Approach  `[iii] / [ii]` etc.

**Root:** the diatonic scale degree immediately above or below the target's degree (50/50).  
**Structure:** built by `generateChordOnDegree(scale, adjacentDegree, complexity)`.  
**Resolution:** stepwise root motion by a diatonic second.

The Roman numeral is fully computed by `generateChordOnDegree` — no special handling needed.

Examples (approaching I in C major):
- From above: ii → I (Dm → C)
- From below: VII → I (Bm7♭5 → C, or B°→C in simpler complexity)

---

### 2.5 Suspended Fourth  `Xsus4`  _(new)_

**Root:** same as target root.  
**Structure:** `[0, 5, 7]` — root + perfect 4th + perfect 5th (no 3rd).  
**Resolution:** the 4th resolves down by semitone to the 3rd of the target chord.

This is the "hover then resolve" motion: the chord sounds temporarily ambiguous (no 3rd), then
snaps into focus when the structural chord arrives.

| Target x | Passing chord | Roman numeral |
|---|---|---|
| I  (C) | Csus4 | Isus4   |
| ii (Dm)| Dsus4 | iisus4  |
| iii(Em)| Esus4 | iiisus4 |
| IV (F) | Fsus4 | IVsus4  |
| V  (G) | Gsus4 | Vsus4   |
| vi (Am)| Asus4 | visus4  |

**Tone:** warm, folk/gospel/pop; good as the sole passing chord in a 2-chord gap.

---

### 2.6 Sus2 Passing Chord  `Xsus2`  _(future)_

**Root:** adjacent diatonic degree below the target.  
**Structure:** `[0, 2, 7]` — root + major 2nd + perfect 5th (no 3rd).  
**Resolution:** open, spacious; less directed than sus4.

Not implemented in this version. Sus2 lacks the strong leading-tone pull of sus4 and is most
effective in specific tonal contexts (folk, ambient). Defer until a "colour" passing chord category
is added.

---

## 3. Roman Numeral Notation Rules

### 3.1 Slash Notation

For chromatic passing chords, the Roman numeral uses slash notation to show secondary function:

```
[Roman of passing chord][suffix]/[Roman of target, lowercase if minor]
```

- `V7/vi`   — dominant 7th resolving to vi
- `vii°7/ii` — diminished 7th resolving to ii
- `♭II7/IV` — tritone sub resolving to IV

**Special case — target is I:** omit the slash.
- Secondary dominant of I = `V7` (not `V7/I`)
- Secondary dim of I = `vii°7` (not `vii°7/I`)
- Tritone sub of I = `♭II7` (not `♭II7/I`)

**Casing rule:** Roman base follows quality (same rule as structural chords):
- Dominant quality: UPPERCASE (`V`, `♭II`)
- Diminished quality: lowercase (`vii`)
- The `/target` part always uses the target's own casing (vi for minor, IV for major)

### 3.2 Sus Chords

Sus chords use the same base Roman numeral as their target and append `sus4`:
- `Vsus4` — suspended 4th on the dominant
- `iisus4` — suspended 4th on the supertonic

### 3.3 Diatonic Chords

Diatonic passing chords are built with `generateChordOnDegree` and already carry correct Roman
numerals — no special treatment needed.

---

## 4. Diatonic Approach Chains (N ≥ 2 passing chords)

When multiple passing chords fill a single gap, they form a *chain* that approaches the target
stepwise through the diatonic scale.

### 4.1 Descending chain — approach from above

Walk *down* the scale from some degree above the target.

Target I (C major), 3 passing chords:
```
IV → iii → ii → I
F  → Em  → Dm → C
```

Target IV (F), 3 passing chords:
```
VII → vi → V → IV
(built on degrees 7, 6, 5, landing on degree 4)
```

### 4.2 Ascending chain — approach from below

Walk *up* the scale toward the target.

Target I (C major), 3 passing chords:
```
V → vi → vii° → I
G → Am → B°   → C
```

Target V (G), 3 passing chords:
```
ii → iii → IV → V
Dm → Em  → F  → G
```

### 4.3 Implementation — building chains backwards

Chains are always built **backwards** from the target so that voice-leading direction is preserved:

```
chain[N-1] = diatonicStep( target,        direction )
chain[N-2] = diatonicStep( chain[N-1],    direction )
...
chain[0]   = diatonicStep( chain[1],      direction )
```

`diatonicStep(chord, 'up')` returns the diatonic scale degree immediately above `chord`'s root.
`diatonicStep(chord, 'down')` returns the degree immediately below.

Direction is chosen 50/50 at chain build time (one consistent direction per chain).

---

## 5. Chromatic Approach Chains (secondary-dominant / tritone-sub)

### 5.1 Standard chromatic chain (existing)

Alternates secondary-dominant and tritone-sub, creating a cycle-of-fifths or tritone-sub descent:

```
N=2: vii°7/x → V7/x → x     (or)    ♭II7/x → V7/x → x
N=3: V7/V7/x → V7/x → x            (double secondary dominant descent)
```

Built backwards: `generatePassingChord(scale, target, 'secondary-dominant')` then
`generatePassingChord(scale, chord1, 'tritone-sub')` etc.

### 5.2 Secondary ii-V chain  _(new)_

A mini ii-V-I *relative to the target*, creating a brief tonicisation of x. The passing chords use
the diatonic context of x's key (which may include non-diatonic chords relative to the home key).

```
VI/x → ii/x → V7/x → x
```

Root intervals relative to target root (x = 0):
- `V7/x`:   root = x + 7 semitones (perfect fifth above x)
- `ii/x`:   root = x + 2 semitones (major second above x)
- `VI/x`:   root = x + 9 semitones (major sixth above x)

For a 2-chord chain: `ii/x → V7/x`  
For a 3-chord chain: `VI/x → ii/x → V7/x`

**Quality rules:**
- `V7/x` always dominant 7th `[0, 4, 7, 10]`
- `ii/x` uses minor 7th for minor targets `[0, 3, 7, 10]`, major 7th for major targets `[0, 4, 7, 11]`
  (or just minor/major triad if complexity = 'triad')
- `VI/x` is major (parallel major context, the borrowed VI)

**This chain produces non-diatonic chords in relation to the home key**, and that is intentional —
it creates momentary secondary tonicisation (jazz/pop modulation flavour). The Roman numeral
notation uses slash format: `ii/vi`, `V7/vi`, `VI/vi` etc.

---

## 6. Exclusion and Preference Rules

Type selection is weighted, not uniform. The weights below apply when `mode = 'all'`.
`mode = 'secondary-dominant'` forces type to always be `secondary-dominant`.

### 6.1 Default weights (no exclusion applies)

| Type | Weight |
|---|---|
| `secondary-dominant` | 30 |
| `secondary-dim` | 20 |
| `tritone-sub` | 25 |
| `diatonic` | 20 |
| `sus4` | 5 |

### 6.2 Same-root exclusion (motion by rising fourth)

Applies when: `currentChord.rootPC === (targetChord.rootPC + 7) % 12`
(i.e., the secondary dominant of the target has the same root as the current chord).

Examples: I→IV, ii→V, iii→vi, V→I, vi→ii.

The secondary dominant would barely change the current chord (just adds a minor 7th). Prefer
tritone-sub (strong half-step descent) or secondary-dim instead:

| Type | Weight (same-root) |
|---|---|
| `secondary-dominant` | 5  |
| `secondary-dim` | 35 |
| `tritone-sub` | 40 |
| `diatonic` | 15 |
| `sus4` | 5 |

### 6.3 Chromatic clash exclusion (secondary-dim clashes with current chord)

Applies when: `currentChord.rootPC === (targetChord.rootPC − 1 + 12) % 12`
(i.e., the secondary diminished's root equals the current chord's root — same-root problem for dim).

In this case, the secondary-dim produces the same root as the current chord, which is even more
redundant than the same-root secondary dominant case:

| Type | Weight (dim-clash) |
|---|---|
| `secondary-dominant` | 35 |
| `secondary-dim` | 5  |
| `tritone-sub` | 40 |
| `diatonic` | 15 |
| `sus4` | 5 |

### 6.4 Combined (both same-root AND dim-clash apply simultaneously)

This is unusual (would require current chord to be one semitone above target AND a fourth below
it — impossible), so at most one exclusion applies at a time.

### 6.5 Sus4 preference at low chordCount

When only a single passing chord is needed (chain length = 1), sus4 is slightly elevated because
the hover-then-resolve effect is most perceptible in isolation:

| Type | Weight (single-chord) |
|---|---|
| `secondary-dominant` | 28 |
| `secondary-dim` | 18 |
| `tritone-sub` | 23 |
| `diatonic` | 22 |
| `sus4` | 9 |

---

## 7. Chain Style Selection (N ≥ 2)

When two or more passing chords fill a gap, pick one of three chain styles:

| Style | Probability | Description |
|---|---|---|
| `diatonic`         | 40% | Stepwise walk through home scale (ascending or descending) |
| `chromatic`        | 30% | Secondary-dominant / tritone-sub alternation |
| `secondary-iiv`    | 30% | Mini ii-V (or VI-ii-V) relative to target x |

**In `secondary-dominant` mode:** only `diatonic` and `secondary-iiv` styles are used (50/50).
Chromatic style is suppressed because tritone-sub is excluded in that mode.

---

## 8. Summary Table: All Passing Chord Types

| Type key | Root formula (semitones above target) | Structure | Roman numeral pattern |
|---|---|---|---|
| `secondary-dominant` | +7 | [0,4,7,10] | `V7/x` |
| `secondary-dim`      | −1 | [0,3,6,9]  | `vii°7/x` |
| `tritone-sub`        | +1 | [0,4,7,10] | `♭II7/x` |
| `diatonic`           | ±1 scale degree | varies | `ii`, `iii`, etc. |
| `sus4`               |  0 (same root) | [0,5,7]   | `Xsus4` |
| `iiv-secondary`      | +2 (ii/x) or +9 (VI/x) | varies | `ii/x`, `VI/x` |

---

## 9. Files

| File | Concern |
|---|---|
| `src/theory/chordGenerator.js` | `generatePassingChord()`, `buildChordFromIntervals()`, `PASSING_CHORD_INTERVALS` |
| `src/generation/passingChords.js` | `insertPassingChords()`, `buildApproachChain()`, `selectPassingChordType()`, `buildSecondaryIIVChain()` |
| `src/components/sheet-music/SheetMusic.jsx` | Rendering: smaller font, → arrow for `isPassing` chords |
