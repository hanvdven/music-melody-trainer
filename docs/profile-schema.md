# Granulaire Skill-tracking — Volledig Ontwerp

**Status:** Concept / ter review
**Datum:** 2026-04-30

---

## Het kernprobleem: attributie

Wanneer een speler faalt bij `{Lydisch, 130 BPM, zestienden, 5/4}`, weten we niet waardoor.
Was het de toonladder? Het tempo? De maatsoort? De combinatie?

**Oplossing: moeilijkheid is multiplicatief, credit/blame is proportioneel.**

```
moeilijkheid(config) = ∏ hardheid(dim_i)

hardheid(dim, waarde) = 1 − vaardigheid(dim, waarde)
```

Een combinatie is moeilijk als *meerdere* dimensies tegelijk onbekend zijn.
Een fout wordt toegeschreven aan de dimensies die het meest bijdroegen aan de moeilijkheid.

---

## Het model in drie regels

```
Bij SUCCES  → alle dimensies krijgen credit (+1 in venster)
Bij FALEN   → alleen dimensies die > gemiddeld moeilijk waren krijgen blame (0 in venster)
Bij MAKKELIJK-EN-TOCH-FALEN → alle dimensies krijgen blame (fundamenteel probleem)
```

### Formeel

Gegeven config `C` met dimensies `{d1:v1, d2:v2, ...}`:

```
w_i   = 1 − vaardigheid(d_i, v_i)       // moeilijkheidsgewicht per dimensie
                                          // prior = 0.5 als nog nooit gespeeld
μ     = gemiddelde(w_i)                   // gemiddeld gewicht over alle dims

Bij SUCCES:    push(d_i, 1)  voor alle i
Bij FALEN:
  als alle w_i < 0.2:                     // makkelijke combo, toch gefaald
    push(d_i, 0)  voor alle i
  anders:
    push(d_i, 0)  voor elke i waar w_i > μ   // zwakste schakels krijgen blame
    // sterke dimensies worden niet gestraft
```

### Voorbeeld

Speler speelt `{Lydisch: 20%, 100 BPM: 85%, kwartnoten: 95%, 4/4: 90%}`.

```
w = [0.80, 0.15, 0.05, 0.10]    μ = 0.275
w_Lydisch = 0.80 > 0.275        → Lydisch krijgt 0 bij falen
w_overige < 0.275               → worden niet gestraft
```

Bij succes krijgt ook Lydisch een 1 — zodat succes in moeilijke combos
de zwakste dimensie helpt groeien.

---

## Rollend venster

Per dimensie-waarde: array van maximaal 20 resultaten, nieuwste eerst.

```js
[1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
 ↑nieuw                                                  oud↑
```

- Weergave: `correct / total` — altijd geheel getal → `"17/20"`
- `total` = `Math.min(arr.length, 20)`, nooit opschalen naar /20 als er minder zijn
- Geen resultaat: `"—"`
- Prior (nog nooit gespeeld): `vaardigheid = 0.5`

---

## Volledig vocabulaire

### Dimensie 1 — Toonladder / modus (67 waarden)

```
Diatonisch (7):
  Major · Dorian · Phrygian · Lydian · Mixolydian (= Acoustic) ·
  Minor (= Aeolian) · Locrian

Melodisch Mineur (7):
  Melodic Minor ↑ · Dorian ♭2 · Lydian Augmented · Acoustic ·
  Aeolian Dominant · Half Diminished · Altered

Melodisch Mineur ↓ (1):
  Melodic Minor ↓

Harmonisch Majeur (7):
  Harmonic Major · Dorian ♭5 · Phrygian ♭4 · Lydian ♭3 ·
  Mixolydian ♭2 · Lydian Augmented ♯2 · Locrian ♭7

Harmonisch Mineur (7):
  Harmonic Minor · Locrian ♯6 · Ionian ♯5 · Ukrainian Dorian ·
  Phrygian Dominant · Lydian ♯2 · Mixolydian ♯1

Double Harmonic (7):
  Double Harmonic Major · Lydian ♯2 ♯6 · Ultraphrygian ·
  Hungarian minor · Oriental · Ionian ♯2 ♯5 · Locrian ♭3 ♭7

Neapolitaans / Exotisch (8):
  Neapolitan major · Neapolitan minor · Hungarian major ·
  Locrian major · Lydian diminished · Gypsy major ·
  Enigmatic · Persian

Pentatonisch (8):
  Pentatonic Major · Pentatonic Minor · Iwato · In · Insen ·
  Hirajoshi scale · Egyptian pentatonic · Kumoi ·
  Minor six pentatonic

Blues (2):
  Minor Blues scale · Major blues scale

Hexatonisch (6):
  Whole Tone · Two-semitone tritone scale · Istrian scale ·
  Tritone scale · Prometheus scale · Scale of harmonics ·
  Augmented scale

Bebop / Octatonisch (4):
  Major Bebop · Bebop Dominant · Diminished ·
  Dominant Diminished · Spanish octatonic

Chromatisch (1):
  Chromatic
```

### Dimensie 2 — Aantal voortekens (15 waarden)

```
0♯/♭  1♭  2♭  3♭  4♭  5♭  6♭  7♭
      1♯  2♯  3♯  4♯  5♯  6♯  7♯
```

Voortekens worden bijgehouden los van de toonladder.
Zo zien we: "speelt Ionisch goed in C (0♯) maar moeite in F♯ (6♯)".

### Dimensie 3 — Tempband (5 waarden)

| Waarde | BPM-bereik |
|---|---|
| `adagio`  | ≤ 69 |
| `andante` | 70–89 |
| `moderato`| 90–109 |
| `allegro` | 110–139 |
| `presto`  | ≥ 140 |

### Dimensie 4 — Maatsoort (8 waarden)

`2/4 · 3/4 · 4/4 · 5/4 · 6/8 · 7/8 · 9/8 · 12/8`

### Dimensie 5 — Ritmische variabiliteit (6 waarden)

Gebaseerd op de `rhythmVariability`-instelling (0–10) in de app:

| Waarde | Range | Karakter |
|---|---|---|
| `static`   | 0    | Strikt uniforme noten |
| `low`      | 1–2  | Lichte variatie |
| `medium`   | 3–5  | Gemengde nootwaarden |
| `high`     | 6–8  | Veel syncopatie en variatie |
| `extreme`  | 9–10 | Maximaal chaotisch ritme |
| `tuplets`  | nvt  | Triolen/kwintolen aanwezig |

### Dimensie 6 — Kleinste nootwaarde (5 waarden)

`whole_half · quarter · eighth · sixteenth · tuplet`

### Dimensie 7 — Nootdichtheid / noten per maat (5 waarden)

| Waarde | Noten/maat |
|---|---|
| `very_sparse` | 1 |
| `sparse`      | 2 |
| `medium`      | 3–4 |
| `dense`       | 5–7 |
| `very_dense`  | 8+ |

### Dimensie 8 — Aantal maten (4 waarden)

`2 · 4 · 8 · 16`

### Dimensie 9 — Sleutel (3 waarden)

`treble · bass · both`

### Dimensie 10 — Akkoordcomplexiteit (5 waarden)

`none · triads · sevenths · passing · jazz`

### Dimensie 11 — Intervalstructuur (4 waarden)

Wordt afgeleid uit de gegenereerde melodie:

| Waarde | Beschrijving |
|---|---|
| `stepwise`    | Alleen secunden (stappen) |
| `small_leaps` | Secunden + tertsen |
| `large_leaps` | Ook kwarten en groter |
| `wide`        | Sexten, septimen of meer |

---

## Opslagschema (localStorage)

```json
{
  "version": 2,
  "skills": {
    "scale": {
      "Major":              [1,1,0,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1],
      "Dorian":             [1,0,1,1,1,1,1,0,1,1],
      "Lydian":             [0,0,1,0,0,1,0,1,0,0,1,0,0,1,0,0,0,1,0,0],
      "Harmonic Minor":     [1,0,1,1,0,1,1,1],
      "Double Harmonic Major": [],
      "Chromatic":          []
    },
    "accidentals": {
      "0":  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      "1b": [1,1,0,1,1,1,1,1,0,1],
      "2b": [1,0,1,1,0,1,1],
      "6s": [],
      "7s": []
    },
    "tempo": {
      "adagio":   [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      "andante":  [1,1,0,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,0,1],
      "moderato": [1,0,1,1,0,1,1,0,1,1,1,1],
      "allegro":  [0,1,0,0,1,0,1],
      "presto":   []
    },
    "timeSignature": {
      "4/4": [1,1,0,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1],
      "3/4": [1,0,1,1,0,1,1,1,0,1,1],
      "5/4": [0,0,1,0,0],
      "6/8": [],
      "7/8": []
    },
    "rhythmVariability": {
      "static":  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      "low":     [1,1,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      "medium":  [1,0,1,1,0,1,1,1,0,1,1,1,1,1,0,1,1,1,1,1],
      "high":    [0,1,0,0,1,0,1,0],
      "extreme": [],
      "tuplets": [1,0,0,1,0,1]
    },
    "smallestNote": {
      "whole_half": [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      "quarter":    [1,1,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,1],
      "eighth":     [1,0,1,1,0,1,1,0,1,1,1,1,1,1,0,1,1,1,1,1],
      "sixteenth":  [0,0,1,0,1,0,0,1,0],
      "tuplet":     [1,0,0,1,0]
    },
    "noteDensity": {
      "very_sparse": [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      "sparse":      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,1,1,1],
      "medium":      [1,0,1,1,0,1,1,1,0,1,1,1,1,1,1,1,0,1,1,1],
      "dense":       [0,1,0,1,1,0,1,0,1],
      "very_dense":  []
    },
    "numMeasures": {
      "2":  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      "4":  [1,1,0,1,1,1,1,1,1,0,1,1,1,1,1,1,0,1,1,1],
      "8":  [0,1,0,0,1,0,0],
      "16": []
    },
    "clef": {
      "treble": [1,1,0,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1],
      "bass":   [1,0,1,1,0,1,1,0,1,1],
      "both":   [0,1,0,0,1]
    },
    "chords": {
      "none":    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      "triads":  [1,1,0,1,1,1,1,0,1,1,1,1,1,1,1,0,1,1,1,1],
      "sevenths":[0,1,0,1,1,0,1,0],
      "passing": [0,0,1,0,0,1,0,0],
      "jazz":    []
    },
    "intervals": {
      "stepwise":    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      "small_leaps": [1,1,0,1,1,1,1,1,0,1,1,1,1,0,1,1,1,1,1,1],
      "large_leaps": [0,1,0,1,1,0,1,0,1,1],
      "wide":        [0,0,1,0,0]
    }
  }
}
```

---

## Lees-API

```js
const mastery  = (arr)       => arr.length === 0
                                  ? 0.5                       // prior
                                  : arr.reduce((s,v)=>s+v,0) / arr.length;

const display  = (arr)       => arr.length === 0
                                  ? '—'
                                  : `${arr.reduce((s,v)=>s+v,0)}/${arr.length}`;

const hardness = (arr)       => 1 - mastery(arr);            // 0.0–1.0

const proficient = (arr)     => arr.length >= 10 && mastery(arr) >= 0.8;
```

---

## Schrijf-API: `recordAttempt`

```js
recordAttempt({
  scale:             'Lydian',
  accidentals:       '2s',         // b = flats, s = sharps, '0' = geen
  tempoBand:         'allegro',
  timeSignature:     '5/4',
  rhythmVariability: 'high',
  smallestNote:      'eighth',
  noteDensity:       'medium',
  numMeasures:       4,
  clef:              'treble',
  chords:            'triads',
  intervals:         'small_leaps',
  faultless:         false,
})
```

### Implementatie van de attributie

```js
function recordAttempt(attempt, profile) {
  const dims = getDimensionEntries(attempt);           // [{dim, val, arr}, ...]

  // Bereken moeilijkheidsgewicht per dimensie
  const weights = dims.map(d => ({ ...d, w: hardness(d.arr) }));
  const mu = weights.reduce((s, d) => s + d.w, 0) / weights.length;
  const allEasy = weights.every(d => d.w < 0.2);

  if (attempt.faultless) {
    // Succes: alle dimensies krijgen credit
    dims.forEach(d => push(d.arr, 1));

  } else if (allEasy) {
    // Makkelijke combo, toch gefaald → fundamenteel probleem
    dims.forEach(d => push(d.arr, 0));

  } else {
    // Gedeeltelijke attributie: enkel bovengemiddeld moeilijke dims
    weights
      .filter(d => d.w > mu)
      .forEach(d => push(d.arr, 0));
    // Sterke dimensies worden NIET gestraft
  }
}

// Circulaire buffer: max 20, nieuwste eerst
const push = (arr, val) => {
  arr.unshift(val ? 1 : 0);
  if (arr.length > 20) arr.pop();
};
```

---

## Gecombineerde moeilijkheidsscore

Wordt gebruikt door de adaptive engine om de volgende sessie te kiezen:

```js
// Gecombineerde moeilijkheid van een config (0.0–1.0)
const configDifficulty = (config, skills) => {
  const dims = getDimensionEntries(config, skills);
  // Geometrisch gemiddelde van de hardheid — zodat één makkelijke dim
  // niet de hele score omlaag trekt
  const product = dims.reduce((p, d) => p * (0.1 + 0.9 * hardness(d.arr)), 1);
  return Math.pow(product, 1 / dims.length);
};
```

**Doelzone voor de adaptive engine:** `configDifficulty` tussen 0.25 en 0.45.
- Te laag (< 0.25): speler speelt in de comfortzone → geen groei
- Te hoog (> 0.45): te moeilijk → frustratie
- In de zone: ~70–80% verwacht succespercentage = optimale leerzone

---

## Opslaggrootte schatting

| Dimensie | Waarden | Max bytes |
|---|---|---|
| Toonladder (67) | 20 per item | 1 340 B |
| Voortekens (15) | 20 per item | 300 B |
| Tempband (5) | 20 per item | 100 B |
| Maatsoort (8) | 20 per item | 160 B |
| Ritme-variabiliteit (6) | 20 per item | 120 B |
| Kleinste noot (5) | 20 per item | 100 B |
| Nootdichtheid (5) | 20 per item | 100 B |
| Aantal maten (4) | 20 per item | 80 B |
| Sleutel (3) | 20 per item | 60 B |
| Akkoorden (5) | 20 per item | 100 B |
| Intervallen (4) | 20 per item | 80 B |
| Meta + XP + unlocks | — | 500 B |
| **Totaal** | | **~3,1 KB** |

Ruim binnen de localStorage-limiet (5–10 MB).

---

## Debug UI — "Woordenlijst"

Toont alle dimensies als een doorzoekbare lijst:

```
🔍 [filter...]

TOONLADDERS
  Major            ████████████████████  20/20  ✓
  Dorian           █████████░░░░░░░░░░░  10/10
  Lydian           ███░░░░░░░░░░░░░░░░░   3/20  ⚠
  Phrygian         ░░░░░░░░░░░░░░░░░░░░   —     (nog nooit)
  Chromatic        ░░░░░░░░░░░░░░░░░░░░   —

TEMPO
  adagio           ████████████████████  20/20  ✓
  andante          █████████████████░░░  17/20
  moderato         ████████████░░░░░░░░  12/18
  allegro          ████░░░░░░░░░░░░░░░░   7/20  ⚠
  presto           ░░░░░░░░░░░░░░░░░░░░   —

...
```

Per rij klikbaar om de 20 slots te bewerken (debug-only).

---

## Open vragen voor review

1. **Attributie-drempel:** bovengemiddeld moeilijk (> μ) is een goede start, maar wil je dit later verfijnen tot bijv. > μ + 0.5σ?
2. **Prior 0.5:** voor een nog niet gespeelde toonladder nemen we aan 50% kans. Alternatief: intrinsieke moeilijkheid per schaal als prior (bijv. Chromatic = 0.1, Major = 0.7).
3. **Intervalstructuur:** wordt afgeleid uit de melodie, niet ingesteld. Wil je dat de app de gegenereerde intervallen automatisch categoriseert bij `recordAttempt`?
4. **Gecombineerde moeilijkheid weergeven?** De speler zou kunnen zien: "dit was een 0.38/1.0 sessie" — nuttig of afleidend?
