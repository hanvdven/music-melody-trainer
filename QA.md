# QA — Manual Test Checklist

Test these items after each build. Each section corresponds to a completed backlog item.
Open the app at http://localhost:5173 (or the running dev server).

---

## 1. Title: Progression Name in Header

**Feature:** When chords are active, the header title shows the progression name: e.g. "Pop Song in D Minor", "Pachelbel in G Major", "Jazz Song in C Major".

**Test steps:**
1. Open generator settings → Chords tab → set progression to **Pop Song (I V vi IV)**.
2. Press Play (continuous). Observe the header title.
3. Expected: title reads **"Pop Song in C Major"** (or current key).
4. Change to **Pachelbel**. Expected: **"Pachelbel in C Major"**.
5. Change to **Jazz Song (... ii V I)**. Expected: **"Jazz Song in C Major"**.
6. Change to **Modal Random**. Expected: **"Melody in C Major"** (no progression prefix — Modal Random and Tonic-only are excluded).
7. Turn chords OFF. Expected: **"Melody in C Major"** regardless of progression setting.

---

## 2. Progression Names in Chord Type Picker

**Feature:** The chord type picker in generator settings (Chords tab) now shows the full name with chord notation, e.g. "Pop Song (I V vi IV)", "Jazz Song (... ii V I)".

**Test steps:**
1. Open Generator Settings → Chords tab → tap the chord TYPE selector.
2. Verify the list shows full descriptive labels (not just short names like "Pop 4").
3. Expected labels visible:
   - `Tonic (I)`
   - `Modal Random`
   - `Modal Song (random)`
   - `Chromatic Song (random)`
   - `Jazz Random (ii V I)`
   - `Pachelbel (I V vi III IV I IV V)`
   - `Pop Song (I V vi IV)`
   - `Pop Ballad (vi IV I V)`
   - `Doo-Wop (I vi IV V)`
   - `Cadential (I IV V V)`
   - `Jazz Song (... ii V I)`
   - `Andalusian Cadence (i VII VI V)`
   - `Classical Cadence (I IV V I)`
4. Select "Jazz Random (ii V I)". Verify chord labels in sheet music change each measure to ii–V–I patterns.

---

## 3. Jazz Random Progression

**Feature:** New "Jazz Random" strategy generates random ii–V–I cadences targeting different resolution points (I, ii, IV, vi).

**Test steps:**
1. Chords tab → type = **Jazz Random (ii V I)**.
2. Play continuously for several rounds.
3. Observe the chord grid or sheet music chord labels.
4. Expected: chord sequences are always 3-chord groups ending on I, ii, IV, or vi. Not random isolated chords.
5. Title shows "Jazz Random in [Key]".

---

## 4. ChordNotationIcon — D-7 / ii7 style

**Feature:** The Letters/Roman icon (in chord controls) now shows "D-" + superscript "7" for letters mode, and "ii" + superscript "7" for roman mode. Size 20% larger.

**Test steps:**
1. Find the chord notation toggle button (cycles letters ↔ roman numerals).
2. In **letters mode**: icon should show "D-" with a small "7" raised top-right. NOT "Dm7".
3. In **roman mode**: icon should show "ii" with a small "7" raised top-right.
4. Icon should appear visibly larger than before (~26px vs 22px).

---

## 5. Repeat/Once Button — 20% Smaller

**Feature:** The slim repeat/once toggle in the header (top-right) is 20% smaller (26px × 26px, icon 11px vs old 32px × 32px / 14px).

**Test steps:**
1. Look at the top-right row of buttons (SkipBack, SkipForward, Play/Stop, Repeat-toggle).
2. The rightmost button (showing loop icon or "1" icon) should be noticeably smaller than the others.
3. Tap it to toggle between once (1 icon) and continuous (loop icon). Both states should be smaller.

---

## 6. Bug Fix: Manual Time Signature Input

**Feature:** Long-pressing the top number (+) of the time signature now triggers a prompt dialog where you can type a number (1–32).

**Test steps:**
1. Open Settings (gear icon in sheet music).
2. Long-press the **right half** of the numerator (top number) in the time signature display.
3. A browser `prompt()` dialog should appear: "Enter time signature top (1-32):".
4. Type `7` and press OK.
5. Expected: time signature top changes to **7**. Sheet music re-renders with 7/4 (or 7/8 etc.).
6. Type `0` → clamped to **1**.
7. Type `33` → clamped to **32**.
8. Press Cancel → no change.

---

## 7. Animation: Ideal Visible Measures (No Hardcoded 3)

**Feature:** In scroll/wipe/playhead animation modes, the number of visible measures is now computed from the screen width (~120px per measure), minimum 2, instead of always being 3.

**Test steps:**
1. Set animation mode to **Scroll** or **Wipe** (in playback settings).
2. Play continuously.
3. On a narrow screen (phone, ~375px wide): expect **2 measures** visible in the animation window.
4. On a tablet (768px wide): expect approximately **5–6 measures** visible.
5. Resize the browser window from narrow to wide — the visible measure count should update.
6. Verify the animation still scrolls/wipes correctly with the new measure count.

---

## 8. Progression Labels — Full Names in Title

**Feature:** Progression short labels updated for the header title:

| Strategy | Title shows |
|---|---|
| Pop I–V–vi–IV | Pop Song in … |
| Pop vi–IV–I–V | Pop Ballad in … |
| Doo-Wop | Doo-Wop in … |
| I–IV–V–V | Cadential in … |
| Jazz ii–V–I | Jazz Song in … |
| Andalusian | Andalusian Cadence in … |
| I–IV–V–I | Classical Cadence in … |
| Pachelbel | Pachelbel in … |
| Jazz Random | Jazz Random in … |

**Test steps:**
1. For each progression in the table, set it in the chord picker and play.
2. Verify the title in the header matches the table above.

---

---

## 9. Bug Fix: 5/8 Chord Distribution (formula-based, not hardcoded)

**Feature:** Chord distribution in irregular meters (5/8, 7/8, 15/8 etc.) now follows beat-group structure derived by formula (3+2 grouping). 5/8 → C//C/ instead of C///C.

**Test steps:**
1. Open generator settings → set time signature to **5/8**.
2. Enable Chords. Set chordCount to **2** (2 chords per measure).
3. Play continuously. Look at chord labels in sheet music.
4. Expected: chords fall on beat 1 (slot 0) and beat 4 (slot 6 = the start of the 2-group). Pattern: **C//C/** not C///C.
5. Switch to **7/8**. With 2 chords per measure, expect beat 1 and beat 4 (3+2+2 grouping).
6. Switch to **15/8**. With 3 chords, expect approximate 3+3+3+3+3 grouping across the measure.
7. Switch back to **4/4**. Verify no regression — chord distribution still correct for regular meters.

---

## 10. Konnakol Removed

**Feature:** The Konnakol lyrics mode is fully removed. Only Takadimi remains as the rhythmic syllable mode.

**Test steps:**
1. Open generator settings → Lyrics tab (pencil icon).
2. Cycle through lyrics modes. Verify modes available: **None**, **Do Re Mi (relative)**, **Do Re Mi (absolute)**, **Kodály**, **Takadimi**.
3. Konnakol should NOT appear as an option.
4. With Takadimi active and percussion visible: verify syllables still appear below the percussion staff (ta, di, ka, mi, etc.).

---

## 11. Solfège for Chord Notes (All Notes Shown)

**Feature:** When a chord is shown in the treble staff (multiple stacked note heads), solfège displays a syllable for each note, stacked from lowest (bottom) to highest (top).

**Test steps:**
1. Set melody generation to **Chord** or **Full Chord** mode (so multiple notes per slot appear).
2. Enable solfège: **Do Re Mi (relative)** or **Kodály**.
3. Verify that chord notes in the treble staff show **stacked syllables** below the note group, from lowest note (at bottom) to highest (above).
4. Single notes should still show **one syllable** at the normal position.
5. Clicking a chord's solfège group should play **all notes** in the chord simultaneously.
6. Font size for chord syllables (~13px) should be slightly smaller than single-note syllables (16px) for readability.

---

## 12. Measure Number Labels — Interactive

**Feature:** Clicking a measure number label in the sheet music jumps playback start to that measure and stops playback.

**Test steps:**
1. Open the app with several measures visible.
2. Play continuously. While playing, click on **measure number 3** (or any number that is not measure 1).
3. Expected: playback stops, and the next play starts from measure 3.
4. In settings mode (gear open): measure number labels should turn **yellow** (clickable indicator).
5. In debug mode: measure number hitboxes should show magenta overlay.

---

---

## 13. Passing Chords — New Balance Logic (1 Structural Per Measure)

**Feature:** When Passing Chords is enabled, each measure always gets exactly ONE chord from the progression (placed at beat 1), and all remaining chord slots become passing chords. Old behaviour: structural chords were `ceil(chordCount/2)` per measure.

**Test steps:**
1. Chords tab → set progression to **Pop Song (I V vi IV)**, chordCount = **2**, Passing Chords = **on**.
2. Play continuously. Observe chord labels in sheet music.
3. Expected: **beat 1** of each measure always shows a progression chord (I, V, vi, or IV in order). The second chord position (beat 3 or similar) shows a smaller passing chord with a `→` arrow.
4. Set chordCount = **4**. Expected: 1 progression chord + 3 passing chords per measure.
5. Set chordCount = **1**. Expected: no passing chords at all (1 structural, 0 passing).
6. Set progression to **Jazz Song (... ii V I)**. Verify the structural chords still advance through ii–V–I, one per measure.
7. Turn Passing Chords **off**. Verify all chords revert to structural progression chords only.

---

## 14. Accidental Click — Enharmonic Spelling Toggle

**Feature:** Clicking a ♯ or ♭ accidental symbol in front of a note in the sheet music toggles that note's enharmonic spelling (e.g. F♯ ↔ G♭). Only the visual display changes — audio pitch is unchanged.

**Test steps:**

1. Generate a melody that contains accidentals (e.g. key of D major: C♯, F♯).
2. Click the ♯ symbol in front of a C♯ note.
3. Expected: note changes to D♭ (enharmonic equivalent). Audio pitch is the same when played.
4. Click the ♭ symbol again to toggle back.
5. Expected: note returns to C♯.
6. Click the note head itself (not the accidental). Expected: note plays as normal — no enharmonic change.
7. Click an accidental in the bass staff. Expected: same toggle behaviour.
8. Natural notes (no accidental symbol) — no change expected when clicked.

---

## 15. Scroll Animation Timing — Active Note at 25%

**Feature:** In scroll mode, the animation starts 0.5 measures later (and ends 0.5 measures later), so the active note sits at the 25% playhead position for most of the first measure before the scroll begins.

**Test steps:**

1. Set animation mode to **Scroll** (in playback settings).
2. Play continuously.
3. Observe the first measure of each repeat: the first note should appear near the **25% left position** and stay there for most of the measure before the scroll starts moving.
4. Verify the scroll still ends cleanly — the last note of the old content scrolls past the 25% position before the new melody appears.
5. Test with **1 measure**: single-measure scroll should also behave correctly (animation starts 0.25m before the measure ends, active note at 25%).
6. Test with **4+ measures**: multi-measure scroll should feel smoother, with the first note not immediately starting to scroll.

---

## 16. Tuplets — Generation & Notation

**Feature:** Tuplet groups (triplets, quadruplets, quintuplets) replace a qualifying note with multiple shorter notes. Probability is driven by the instrument's rhythmVariability setting. Each group is annotated in the sheet music with a number label ("3 : 2", "4 : 3", "5 : 4") and — for unbeamed groups — a bracket. The ": x" denominator part is dimmed. Beamed groups (8th-note triplets) show the label only; unbeamed groups (quarter-note triplets, etc.) show both bracket and label.

**Test steps:**

1. Open generator settings → Treble → raise **variability** to ~50.
2. Set smallestNoteDenom to **8** (eighth-note grid). Generate several melodies (skip forward).
3. **Triplet (small, 3:2):** expect some groups of 3 eighth notes where a quarter note was. Label "3 : 2" above/below the beam. No bracket (notes are beamed).
4. Set smallestNoteDenom to **8** and notesPerMeasure to **2–3** (fewer notes → longer durations → more half/quarter candidates). Generate.
5. **Triplet (large, 3:2):** expect groups of 3 quarter notes where a half note was. Label "3 : 2" with a bracket (notes are not beamed).
6. Raise variability to ~80. Generate many times. Observe **quadruplets (4:3)** and occasionally **quintuplets (5:4)** — labels show "4 : 3" and "5 : 4" respectively.
7. Set variability to **0**. Generate. Expected: no tuplets at all.
8. Verify notehead shapes: triplet 8ths should look like eighth notes, triplet quarters should look like quarter notes — not sixteenth notes.
9. Check stem direction: bracket/label should appear on the stem-tip side (above for stems-up, below for stems-down).

---

## OPEN QUESTIONS / ITEMS NOT IMPLEMENTED

- **Tonic range clamping (C4–B5)**: Awaiting confirmation — does "C4–B5" mean the tonic must stay within a 2-octave range, or exactly 1 octave (C4–B4)?
- **Hardcoded px-per-measure value**: `APPROX_PX_PER_MEASURE = 120` in App.jsx. Tune if measure widths vary significantly (e.g. 7/8 vs 4/4).
