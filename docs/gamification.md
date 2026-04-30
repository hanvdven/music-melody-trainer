# Gamification Design — Music Melody Trainer

**Status:** Concept / ter review  
**Datum:** 2026-04-30  
**Auteur:** Claude (aanzet voor review door Han)

---

## 1. Visie

De app is al een serieuze oefentool. Gamification voegt daar een *motivatielaag* aan toe die de gebruiker beloont voor consistentie, uitdaging, en groei — zonder de muzikale diepgang te verdunnen.

**Kernprincipe:** de muziek staat centraal. Punten, badges en levels zijn een *reflectie* van echte muzikale vooruitgang, niet een vervanging.

**Doelgroep:** muzikanten van beginner tot gevorderd die thuis willen oefenen (piano, gitaar, theorie).

---

## 2. Drie pijlers

| Pijler | Vraag die het beantwoordt | Mechanic |
|---|---|---|
| **Voortgang** | "Word ik beter?" | XP · Levels · Skill-boom |
| **Consistentie** | "Oefen ik genoeg?" | Dagelijkse streak · Sessie-timer |
| **Uitdaging** | "Wat moet ik als volgende doen?" | Dagelijkse challenge · Boss-maat |

---

## 3. XP & Levels

### 3.1 XP verdienen

XP wordt toegekend per voltooide sessie (niet per noot), zodat de focus op muziek blijft en niet op "snel klikken".

| Actie | Basis-XP | Toelichting |
|---|---|---|
| Input-test: noot correct | 2 | Basis |
| Input-test: maat 100% correct | +10 bonus | Maat zonder fouten |
| Input-test: melodie voltooid | +25 | Alle maten van één melodie |
| Play Once (luisteren) | 3 per melodie | Bewust luisteren is ook oefenen |
| Continuous play: serie afgerond | 5 | `repsPerMelody` cyclus doorlopen |
| Nieuwe toonsoort gespeeld | 15 | Eerste keer een specifieke sleutel |
| Nieuwe toonladder/modus gespeeld | 20 | Eerste keer, bijv. Lydisch of Dorisch |

### 3.2 Multipliers

| Multiplier | Trigger | Factor |
|---|---|---|
| Difficulty | `difficultyLevel` 1–10 → 0.5×–2.0× | Hogere moeilijkheid = meer XP |
| Streak | 3+ correcte maten op rij | 1.5× |
| Tempo | BPM ≥ 140 | 1.25× |
| Odd/Even round "blind" | Noten onzichtbaar (eye uit) | 1.75× |

### 3.3 Levels

Levels zijn grotendeels cosmetisch maar markeren mijlpalen. Elke 5 levels een niveau-naam.

| Levels | Naam |
|---|---|
| 1–4 | Beginner |
| 5–9 | Student |
| 10–19 | Musicus |
| 20–34 | Virtuoos |
| 35–49 | Meester |
| 50+ | Maestro |

XP-curve: `XP_needed(level) = 100 × level^1.4` — snel stijgen in het begin, daarna geleidelijker.

---

## 4. Skill-boom

In plaats van één groot level volgt de gebruiker vijf **vaardigheidstakken**. Elke tak heeft een score 0–100 die afzonderlijk stijgt op basis van geoefende stijl.

```
               🎵 Totaal-niveau
              /    |    |    \
         Gehoor Sight- Ritme Harmonie
         lezen  Reading
```

### 4.1 Gehoor (Ear Training)
Stijgt bij: input-test in *live*-submodus, toonladder afspelen en terugspelen.

### 4.2 Bladmuziek (Sight Reading)
Stijgt bij: input-test in *note*-submodus (noten lezen + spelen), hogere BPM, noten zichtbaar.

### 4.3 Ritme
Stijgt bij: percussie input-test, onregelmatige maatsoorten (5/4, 7/8 etc.), tuplets.

### 4.4 Harmonie
Stijgt bij: akkoord-submodus input-test, passing chords actief, complexere progressies (jazz, modal).

### 4.5 Uithouding (Consistency)
Stijgt bij: dagelijkse streak (zie §5), lange sessies (> 20 min), herhalingen per melodie ≥ 4.

---

## 5. Streak & Sessie-tracking

### 5.1 Dagelijkse streak
- Een dag telt mee als er ≥ 1 melodie volledig gespeeld is.
- Streak breekt bij een gemiste dag.
- **Freeze-token**: 1 vrije dag per 7-daagse streak (auto-earned). Max 2 tegelijk.

### 5.2 Sessie-kwaliteit
Na elke sessie (als de gebruiker stopt) verschijnt een korte *session summary*:

```
┌─────────────────────────────────┐
│  Sessie klaar!                  │
│  ──────────────────────────────  │
│  Noten correct:   47 / 52  90% │
│  Langste streak:  12 noten      │
│  XP verdiend:     +184          │
│  Gehoor:          ↑ +3          │
│  Bladmuziek:      ↑ +5          │
│                                 │
│  🔥 Streak: 8 dagen             │
└─────────────────────────────────┘
```

---

## 6. Dagelijkse & Wekelijkse Challenges

### 6.1 Dagelijkse challenge
Elke dag automatisch gegenereerd op basis van het huidige niveau van de gebruiker. Voorbeelden:

- *"Speel een melodie in F♯ Mineur op ≥ 120 BPM"*
- *"Voltooi een input-test zonder fouten (2 maten, kwartnoten)"*
- *"Speel een jazzy ii–V–I progressie in C Groot"*

Beloning: 3× normale XP + een willekeurige badge-kans.

### 6.2 Wekelijkse Boss-maat
Eén specifieke, moeilijkere melodie die de hele week beschikbaar is. Hoge BPM, onregelmatige maatsoort, blindmodus. Beloning: exclusieve badge + grote XP-bonus.

---

## 7. Achievements & Badges

Badges zijn permanent. Ze werken als "ontdekkingskaart" — ze stimuleren de gebruiker om functies te verkennen die ze anders misschien nooit proberen.

### 7.1 Milestones
| Badge | Trigger |
|---|---|
| 🎹 Eerste noot | Eerste input-test gespeeld |
| 🔥 Op dreef | 7-daagse streak |
| 🌍 Alle twaalf | In alle 12 toonsoorten gespeeld |
| 🌙 Nachtmuziek | Speelde na 23:00 |
| ⚡ Sneltrein | Input-test op ≥ 160 BPM |
| 🤫 Blinde vlek | Melodie correct gespeeld zonder noten (blind mode) |
| 🎷 Jazzer | Jazz ii–V–I progressie voltooid |
| 🌀 Modaal avonturier | Alle 7 modi van de diatonische ladder gespeeld |
| 👁 Derde oor | 10 live-modus melodieën correct |
| 🥁 Ritmekoning | Percussie input-test op 5/4 of 7/8 |
| ♾ Onverslaanbaar | 20 noten op rij correct zonder fout |

### 7.2 Geheime badges
Een paar badges zijn verborgen — ze verschijnen pas als je ze verdient, zonder hint vooraf. Dit stimuleert organisch ontdekken.

---

## 8. Progressie-unlocks (optioneel / fase 2)

> ⚠️ Dit onderdeel is omstreden: het kunstmatig "locken" van features die al in de app zitten voelt nep aan. Alternatief: unlocks zijn puur cosmetisch of extra content, nooit bestaande functionaliteit.

**Voorstel:** unlocks zijn altijd *additioneel*, nooit beperkend.

| Unlock | Voorwaarde | Wat je krijgt |
|---|---|---|
| Thema "Nacht" | Level 10 | Donker UI-thema met sterrenanimatie |
| Thema "Goud" | Maestro-level | Goudkleurig notenschrift |
| Extra preset: "Blindspot" | Badge 🤫 | Preset met noten altijd uit |
| Extra preset: "Marathon" | 30-daagse streak | 8 maten, hoge BPM |
| Bonus: unlockt alle badge-namen | Level 20 | Hint-teksten voor verborgen badges |

---

## 9. UX-principes voor de implementatie

1. **Nooit blokkeren.** Gamification-elementen zitten in een apart paneel / overlay. De oefentool werkt altijd zonder gamification-context.
2. **Opt-in.** Gebruiker kan gamification uitschakelen in Settings. Dan verdwijnt alles behalve de sessie-summary (die is nuttige feedback, altijd zichtbaar).
3. **Lokale opslag eerst.** Alle voortgang opgeslagen in `localStorage`. Geen account vereist. Eventueel later cloud-sync.
4. **Geen dark patterns.** Geen "je streak breekt over 2 uur"-meldingen. Geen pushmeldingen. De app wacht rustig tot je terugkomt.
5. **Transparant systeem.** XP-formules zijn inzichtelijk. Gebruiker begrijpt waarom iets XP oplevert.

---

## 10. Technische aanzet (kort)

### Data-model (localStorage)
```json
{
  "profile": {
    "totalXP": 3420,
    "level": 12,
    "streakDays": 8,
    "freezeTokens": 1,
    "lastSessionDate": "2026-04-30",
    "skills": {
      "ear": 42,
      "sightReading": 67,
      "rhythm": 28,
      "harmony": 55,
      "consistency": 71
    },
    "badges": ["first_note", "on_fire", "all_twelve"],
    "unlockedThemes": ["default", "night"]
  },
  "dailyChallenge": {
    "date": "2026-04-30",
    "config": { ... },
    "completed": false
  }
}
```

### Integratiepunten in de bestaande code
| Gamification-event | Bestaande hook / plek |
|---|---|
| Noot correct | `useInputTest.js` → `addedScore` |
| Melodie voltooid | `useInputTest.js` → `advanceToNext` + einde melodie |
| Sessie gestart/gestopt | `usePlayback.js` → `handleStopAllPlayback` |
| Nieuwe toonsoort | `useScaleManagement.js` → `handleScaleClick` |
| Dagelijkse challenge check | App mount + `localStorage` |

---

## 11. Open vragen voor review

1. **Skill-boom ja/nee?** Vijf aparte skill-scores zijn leuk maar complex. Alternatief: één enkele voortgangsbalk.
2. **Session summary timing:** tonen na Stop-knop, of pas na een volledige melodie?
3. **Progressie-unlocks:** wil je dit überhaupt, of alleen badges + XP?
4. **Wekelijkse boss:** vereist server-side synchronisatie als meerdere apparaten. Lokaal werkt ook maar is dan per-apparaat.
5. **Visuele stijl:** pixelart-retro (past bij de muziek-game sfeer) of clean/minimalistisch (past bij de huidige app-stijl)?
