# Profiel & Skill-tracking — Gedetailleerd Schema

**Status:** Concept / ter review
**Datum:** 2026-04-30

---

## Kernidee: rollend venster per dimensie

Elke vaardigheid wordt bijgehouden als **"X van de laatste 20 melodieën foutloos"**.

```
Ionisch:           17/20  ██████████████████░░  85%
Dorisch:            5/8   ██████░░░░░░░░░░░░░░  63%  (< 20 pogingen)
Lydisch:            3/20  ███░░░░░░░░░░░░░░░░░  15%  (zwak punt)
Pentatonisch Mj:    0/0   ░░░░░░░░░░░░░░░░░░░░  —    (nog nooit)
```

- **Venster:** laatste 20 pogingen, oudste valt eraf zodra de 21e binnenkomt
- **Weergave:** geheel getal (17/20), nooit decimalen
- **Drempel onvolledig venster:** < 20 pogingen tonen als "5/8" (niet opschalen naar /20)

---

## Opslagformaat (localStorage)

Sleutel: `mmt_profile` → JSON-object.

### Toplevel structuur

```json
{
  "version": 1,
  "meta": {
    "createdAt": "2026-04-30",
    "lastActiveAt": "2026-04-30",
    "totalMelodiesPlayed": 347,
    "streakDays": 9,
    "freezeTokens": 1,
    "lastStreakDate": "2026-04-30"
  },
  "xp": {
    "total": 4820,
    "level": 14
  },
  "lessons": {
    "completed": ["w1_m1_l1", "w1_m1_l2", "w1_m1_l3"],
    "examsPassed": ["exam_1", "exam_2"],
    "placementLevel": 2
  },
  "unlocks": {
    "scales":      ["Ionian", "Dorian", "Aeolian", "Harmonic Minor"],
    "timeSignatures": ["4/4", "3/4"],
    "tempoMax":    110,
    "features":    ["passing_chords", "bass_clef"],
    "themes":      ["default"]
  },
  "badges": ["first_note", "on_fire", "all_twelve"],
  "skills": { ... }
}
```

---

## `skills` — het granulaire gedeelte

Elke dimensie is een array van 0 en 1, maximaal 20 items, **nieuwste eerst**.

```
1 = melodie foutloos gespeeld
0 = melodie met minstens één fout
```

### Compacte weergave

```json
"skills": {
  "scales": {
    "Ionian":                [1,1,0,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1],
    "Dorian":                [1,0,1,1,1],
    "Phrygian":              [],
    "Lydian":                [0,0,1,0,1,1,0,0,1,0,1,0,0,0,1,0,0,0,1,0],
    "Mixolydian":            [1,1,1,0,1,1,1,1],
    "Aeolian":               [1,1,1,1,0,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1],
    "Locrian":               [],
    "Harmonic Minor":        [1,0,1,1,0,1,1,1,0,1,1,1],
    "Melodic Minor ↑":       [1,1,0,1],
    "Melodic Minor ↓":       [],
    "Harmonic Major":        [],
    "Double Harmonic Major": [],
    "Pentatonic Major":      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,1],
    "Pentatonic Minor":      [1,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    "Blues":                 [1,0,1,1,0,1],
    "Whole Tone":            [],
    "Diminished":            [],
    "Chromatic":             []
  },
  "tempos": {
    "slow":      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    "medium":    [1,1,0,1,1,1,1,1,0,1,1,1,1,1,0,1,1,1,1,1],
    "fast":      [0,1,0,1,1,0,1,0,1,1,0,1],
    "very_fast": []
  },
  "timeSignatures": {
    "2/4": [],
    "3/4": [1,0,1,1,1,0,1,1,1,1,1,1],
    "4/4": [1,1,0,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1],
    "5/4": [],
    "6/8": [0,1,0,1],
    "7/8": []
  },
  "rhythmDensity": {
    "sparse":    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    "medium":    [1,1,0,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1],
    "dense":     [1,0,1,0,1,1,0,1,1,0,1,1],
    "very_dense": []
  },
  "smallestNote": {
    "whole_half": [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    "quarter":    [1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    "eighth":     [1,0,1,1,1,0,1,1,0,1,1,1,1,1,1,0,1,1,1,1],
    "sixteenth":  [0,1,0,0,1,0,0,1],
    "triplet":    [1,0,0,1,0]
  },
  "clef": {
    "treble": [1,1,0,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1],
    "bass":   [1,0,1,1,0,1,1,0,1,1],
    "both":   [0,1,0,0,1]
  },
  "numMeasures": {
    "2":  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    "4":  [1,1,0,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1,0,1],
    "8":  [0,1,0,1,0,1],
    "16": []
  },
  "chords": {
    "none":    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    "simple":  [1,1,0,1,1,1,1,1,1,0,1,1,1,1,1,1,1,0,1,1],
    "modal":   [0,1,0,1,1,0,1],
    "jazz":    [0,0,1,0,0,1,0,0],
    "passing": []
  }
}
```

---

## Lees-API (afgeleid, niet opgeslagen)

Hulpfuncties berekenen altijd live uit de array — nooit cached:

```js
// Aantal correcte pogingen in het venster
const correct = (arr) => arr.reduce((s, v) => s + v, 0);

// Venstergrootte (max 20)
const total = (arr) => arr.length;

// Weergave: "17/20" of "5/8" of "—"
const display = (arr) =>
  arr.length === 0 ? '—' : `${correct(arr)}/${total(arr)}`;

// Ratio 0.0–1.0 (null als nog geen data)
const ratio = (arr) =>
  arr.length === 0 ? null : correct(arr) / arr.length;

// Is de speler "vaardig"? (≥ 80% bij ≥ 10 pogingen)
const isProficient = (arr) =>
  arr.length >= 10 && ratio(arr) >= 0.8;
```

---

## Schrijf-API: `recordAttempt`

Na elke voltooide melodie (in exercise mode of lesson mode) wordt één poging geregistreerd in **alle relevante dimensies tegelijk**:

```js
recordAttempt({
  scale:         'Ionian',       // modeName
  tempoBand:     'medium',       // 'slow'|'medium'|'fast'|'very_fast'
  timeSignature: '4/4',          // '3/4'|'4/4'|'5/4'|'6/8'|'7/8'|...
  rhythmDensity: 'medium',       // 'sparse'|'medium'|'dense'|'very_dense'
  smallestNote:  'eighth',       // 'whole_half'|'quarter'|'eighth'|'sixteenth'|'triplet'
  clef:          'treble',       // 'treble'|'bass'|'both'
  numMeasures:   4,              // als string-sleutel: '2'|'4'|'8'|'16'
  chords:        'simple',       // 'none'|'simple'|'modal'|'jazz'|'passing'
  faultless:     true,           // true als geen enkele fout gemaakt
})
```

Implementatie per dimensie:

```js
const push = (arr, value, maxWindow = 20) => {
  const next = [value ? 1 : 0, ...arr];  // nieuwste eerst
  return next.slice(0, maxWindow);        // venster begrenzen
};
```

---

## Tempo-bandindeling

| Band | BPM-bereik | Sleutel |
|---|---|---|
| Langzaam | ≤ 79 | `slow` |
| Medium | 80–109 | `medium` |
| Snel | 110–139 | `fast` |
| Zeer snel | ≥ 140 | `very_fast` |

---

## Ritmedichtheid-indeling

| Dichtheid | Noten/maat | Sleutel |
|---|---|---|
| Dun | 1–2 | `sparse` |
| Gemiddeld | 3–4 | `medium` |
| Dicht | 5–8 | `dense` |
| Zeer dicht | 9+ | `very_dense` |

---

## Gebruik in de adaptive engine

De adaptive engine leest skills om het startpunt van een sessie te bepalen:

```js
// Welke toonladders zijn "zwak"? (< 70% bij ≥ 5 pogingen)
const weakScales = Object.entries(profile.skills.scales)
  .filter(([_, arr]) => arr.length >= 5 && ratio(arr) < 0.7)
  .map(([name]) => name);

// Welk tempobereik is de grens?
const highestProficientTempo = ['slow','medium','fast','very_fast']
  .filter(band => isProficient(profile.skills.tempos[band]))
  .at(-1) ?? 'slow';
```

---

## Debug mode — skills handmatig aanpassen

In debug mode kan de gebruiker per dimensie de array direct overschrijven:

```js
// Reset één dimensie
profile.skills.scales['Ionian'] = [];

// Simuleer "goed in Ionisch"
profile.skills.scales['Ionian'] = Array(20).fill(1);

// Simuleer "slecht in Lydisch"
profile.skills.scales['Lydian'] = Array(20).fill(0);
```

De debug UI toont elke dimensie als een rij van 20 vakjes (groen/grijs/leeg), klikbaar om te togglen.

---

## Opslaggrootte schatting

| Onderdeel | Dimensies | Max items | Bytes (JSON) |
|---|---|---|---|
| Scales | ~18 | 20 elk | ~800 B |
| Tempos | 4 | 20 elk | ~200 B |
| Time signatures | 7 | 20 elk | ~350 B |
| Ritmedichtheid | 4 | 20 elk | ~200 B |
| Kleinste noot | 5 | 20 elk | ~250 B |
| Clef | 3 | 20 elk | ~150 B |
| Num maten | 4 | 20 elk | ~200 B |
| Akkoorden | 5 | 20 elk | ~250 B |
| Meta + XP + unlocks | — | — | ~500 B |
| **Totaal** | | | **~2,9 KB** |

Ruim binnen localStorage-limieten (typisch 5–10 MB per origin).
