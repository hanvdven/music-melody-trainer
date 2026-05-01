# Exercise Mode — UX Ontwerp

**Status:** Concept / ter review
**Datum:** 2026-04-30

---

## Ontwerpprincipes

1. **Nul keuzes bij de start.** De app weet wat de gebruiker nodig heeft. Default = direct spelen.
2. **Flow-staat bewaken.** Geen interrupties tijdens het spelen. Feedback is zacht en non-blokkerend.
3. **Niveau volgt de speler.** Moeilijkheid past zich stiekem aan — de speler merkt het pas als het al is gebeurd.
4. **Eén aanraakzone voor alles.** Instellingen zijn beschikbaar maar nooit opdringerig.
5. **Kinderen van 8 én volwassenen.** Visuele taal is kleurrijk maar niet kinderachtig. Tekst is kort en helder.

---

## 1. De Practice Hub — startscherm

Het startscherm van Exercise Mode. De gebruiker hoeft hier niets in te vullen.

```
┌─────────────────────────────────────────────────────┐
│  🎵 Oefenmodus                     Profiel  🏅 Lv12 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  🎯  Aanbevolen voor jou                     │  │
│  │                                               │  │
│  │  D Dorisch · 4/4 · 100 BPM · 4 maten        │  │
│  │  "Je scoorde vorige keer 72% — een beetje    │  │
│  │   moeilijker nu"                             │  │
│  │                                               │  │
│  │              ▶  Start direct                 │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  Of kies een onderwerp:                            │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │  🎼      │  │  🥁      │  │  🎹      │         │
│  │ Toon-    │  │  Ritme   │  │ Akkoorden│         │
│  │ ladders  │  │          │  │          │         │
│  └──────────┘  └──────────┘  └──────────┘         │
│  ┌──────────┐  ┌──────────┐                        │
│  │  👂      │  │  ✨      │                        │
│  │  Gehoor  │  │ Verrassing│                        │
│  └──────────┘  └──────────┘                        │
│                                                     │
│  Recent gespeeld:  C Groot · A Mineur · G Groot    │
│                                                     │
│                                          ⚙ Meer ›  │
└─────────────────────────────────────────────────────┘
```

### Logica achter "Aanbevolen"

Het systeem kiest op basis van het profiel:

1. **Zwakste skill-tak** van de afgelopen 7 dagen → focust op die tak
2. **Laatste score in die tak** → start iets boven of onder dat niveau
3. **Nieuw unlocked content** → als er recent iets geopend is, wordt dat voorgesteld
4. **Afwisseling** → hetzelfde onderwerp nooit 3 sessies achter elkaar

Toon aan de gebruiker: korte zin die uitlegt waarom dit aanbevolen is.
Nooit: technische variabelen of cijfers in de suggestietekst.

### Onderwerp-knoppen

Elke knop past de aanbeveling aan maar start niet direct.
Na klikken op "Toonladders":

```
┌───────────────────────────────────────────────────┐
│  🎼 Toonladders                                   │
│                                                   │
│  Jouw unlocks:                                    │
│  ● C Groot    ● G Groot    ● F Groot              │
│  ● A Mineur   ● D Dorisch  ○ (5 meer…)           │
│                                                   │
│  Alle toonladders tegelijk (shuffle) ← default   │
│                                                   │
│           ▶ Start met toonladders                 │
└───────────────────────────────────────────────────┘
```

Niet meer dan 6 opties zichtbaar, rest achter "meer…".
Selectie is optioneel — de shuffle-default werkt altijd.

---

## 2. De Oefensessie — tijdens het spelen

Zodra de sessie start, verdwijnt alle UI-complexiteit.
De speler ziet alleen: bladmuziek + een minimale HUD.

```
┌─────────────────────────────────────────────────────┐
│  D Dorisch · 100 BPM             maat 4/10  🔥×3   │
│─────────────────────────────────────────────────────│
│                                                     │
│         [ bladmuziek + input test ]                 │
│                                                     │
│                                                     │
│─────────────────────────────────────────────────────│
│  ████████████░░░░  78%                    [  ⏸  ]  │
└─────────────────────────────────────────────────────┘
```

### HUD-elementen (minimaal)

| Element | Positie | Wat het toont |
|---|---|---|
| Toonsoort · BPM | Links boven | Context — verdwijnt na 3 sec |
| Maat X / 10 | Rechts boven | Voortgang in de huidige set |
| 🔥×N | Naast maat | Streak: N opeenvolgende correcte noten |
| Accuraatheid | Onderbalk | Rolling % van de huidige set |
| Pauze-knop | Rechts onder | Enige interactieve knop tijdens spelen |

De HUD is bewust kaal. Geen score in grote letters, geen teleurstelling bij een fout.

---

## 3. Per-noot feedback

Feedback is **non-blokkerend** — het spel gaat door.

### Correcte noot ✓
- Notenkop kleurt **groen** met een korte pulse-animatie (0,2 sec)
- Subtiele positieve klik/toon (optioneel, uitschakelbaar)
- Streak-teller stijgt: `🔥×4 → 🔥×5`

### Foute noot ✗
- Notenkop kleurt **rood**, de juiste noot krijgt een **zachte groene gloed**
- Geen geluid, geen trillen — rust
- Streak reset naar 0 (zonder grote visuele nadruk)
- Na 1,5 seconde: beide kleuren faden weg, sessie gaat door

### Perfecte maat 🌟
- Na een volledige maat zonder fouten: korte **goudkleurige flash** over de maat
- Enkel bij perfect (100%) — zeldzaam genoeg om speciaal te voelen
- Geen tekst, geen popup — puur visueel

### Principe: geen straf-UI
Fouten zijn informatie, geen straf. De speler ziet wat de juiste noot was, maar de sessie gaat direct door. Geen "fout!" in rode letters, geen blokkering.

---

## 4. Checkpoint na 10 maten

Na elke 10 maten verschijnt een **niet-blokkerend kaartje** van onderaf:

```
┌─────────────────────────────────────────────────────┐
│  Set klaar!                                         │
│                                                     │
│  Accuraatheid:    84%  ↑ +6% vs vorige set          │
│  Langste streak:  11 noten                          │
│  Bladmuziek:      ↑ +2                              │
│                                                     │
│  [Doorgaan ▶]   [Wissel onderwerp]   [Pauze]        │
└─────────────────────────────────────────────────────┘
```

- Kaartje schuift in van onderaf (0,3 sec animatie)
- Muziek pauzeert — gebruiker kiest zelf wanneer door
- Maximaal 3 secties tekst — nooit meer
- "Doorgaan" is de prominente actie (grote knop)

### Wat er achter de schermen gebeurt bij Doorgaan

De **adaptive engine** heeft al besloten wat de volgende set wordt:

| Situatie | Aanpassing |
|---|---|
| Accuraatheid ≥ 85% (3e keer op rij) | BPM +5, of notesPerMeasure +1, of nieuwe toonsoort |
| Accuraatheid 70–84% | Geen wijziging |
| Accuraatheid 55–69% | BPM -5 |
| Accuraatheid < 55% (2e keer op rij) | Terug naar eenvoudigere toonsoort of minder noten |

De gebruiker ziet de aanpassing **niet als instelling** maar als een vriendelijke notitie:
- "Iets uitdagender nu 🎵" (bij omhoog)
- "We maken het even iets rustiger" (bij omlaag)
- Niets (bij stabiel)

Nooit: "Moeilijkheid aangepast naar 7.3".

---

## 5. Adaptive difficulty — algoritme

```
Profiel → startpunt bepalen
    │
    ▼
Set van 10 maten
    │
    ▼
Score berekenen (rolling accuracy)
    │
    ├─ score ≥ 85% (3× op rij) ──► difficulty_up()
    ├─ score 55–84%             ──► geen wijziging
    └─ score < 55% (2× op rij) ──► difficulty_down()
                │
                ▼
        Volgende set instellen
```

### `difficulty_up()` — stapsgewijs, nooit schokkend

Volgorde van verhoging (één stap per keer):
1. BPM + 5
2. `notesPerMeasure` + 1
3. Kleinste nootwaarde: kwartnoot → achtste → zestiende
4. Nieuwe toonsoort (iets complexer qua voortekens)
5. 3/4 of andere maatsoort introduceren
6. Triolen inschakelen

### `difficulty_down()` — altijd zacht landen

1. BPM − 5 (minimaal 60)
2. `notesPerMeasure` − 1 (minimaal 2)
3. Terug naar vertrouwde toonsoort (laatste toonsoort met ≥ 80%)
4. Nooit: moeilijkheidsgraad lager dan de speler ooit heeft gehaald

### Profielgeheugen per onderwerp

Het systeem onthoudt de **laatste succesvolle configuratie** per combinatie:

```js
profile.exerciseHistory = {
  'D_Dorisch': { lastAccuracy: 84, lastBpm: 100, lastNotes: 4 },
  'C_Groot':   { lastAccuracy: 91, lastBpm: 110, lastNotes: 5 },
  // ...
}
```

Zo start de speler bij een bekende toonsoort altijd op het juiste niveau, niet opnieuw op beginner.

---

## 6. Instellingen — drie lagen

De speler hoeft nooit door instellingen te waden. Maar wie wil, kan alles aanpassen.

### Laag 1 — Automatisch (default)

Geen instellingen. App bepaalt alles. Toegang via grote "Start direct" knop.

### Laag 2 — Snelfilter (één tik)

De onderwerp-knoppen op de Practice Hub (Toonladders / Ritme / Akkoorden / Gehoor).
Na selectie start de sessie direct — geen verdere keuzes.

### Laag 3 — Geavanceerd (bewuste keuze)

Via de `⚙ Meer ›` knop op de Practice Hub. Opent een gefilterde versie van de bestaande PlaybackSettings — maar **alleen met de content die de speler heeft unlocked**.

```
┌──────────────────────────────────────────────────────┐
│  Geavanceerde instellingen                    [✕]    │
│                                                      │
│  Toonsoort:  [D Dorisch ▾]  (jouw unlocks)          │
│  Tempo:      [◄ 100 BPM ►]                          │
│  Maatsoort:  [4/4 ▾]                                │
│  Noten/maat: [◄  4  ►]                              │
│  Modus:      ● Input test  ○ Luisteren  ○ Gehoor    │
│                                                      │
│  [Herstel naar aanbeveling]      [Start met dit ▶]  │
└──────────────────────────────────────────────────────┘
```

### Laag 4 — Advanced Settings Mode (power users)

Aparte toggle in profiel: "Expert modus". Schakelt unlock-filter uit — alle 100+ toonsoorten beschikbaar.

---

## 7. Sessie beëindigen

Wanneer de speler op ⏸ tikt of de app sluit:

```
┌─────────────────────────────────────┐
│  Sessie klaar!                      │
│                                     │
│  Gespeeld:      23 maten            │
│  Accuraatheid:  81%                 │
│  Beste streak:  14 noten 🔥         │
│                                     │
│  XP verdiend:   +74                 │
│  Bladmuziek:    ↑ +3                │
│  Gehoor:        ↑ +1                │
│                                     │
│  🔥 Streak: 9 dagen                 │
│                                     │
│  [Opnieuw]   [Andere les]   [Klaar] │
└─────────────────────────────────────┘
```

Altijd positief geframed. Geen "Je scoorde maar 67%".
Bij lage score: "Morgen weer — consistentie wint van perfectie."

---

## 8. Gehoor-modus (speciale variant)

Bij "Gehoor" als onderwerp wijzigt de interface:
- Bladmuziek verborgen — speler hoort een melodie en speelt het na
- Eerste 2 herhalingen: melodie te horen, geen noten zichtbaar
- Daarna: noten verdwijnen, speler speelt uit geheugen
- Feedback: zelfde groen/rood systeem, maar na elke poging

Geen aparte UI nodig — de bestaande "blind mode" (notes eye uit) plus
de live input test dekken dit. De lesson engine schakelt dit in via de les-config.

---

## 9. Open vragen voor review

1. **Checkpoint-kaartje:** schuift in van onderaf (niet-blokkerend) of als modal (blokkerend)? Non-blokkerend voelt vlotter maar is moeilijker te implementeren op mobiel.
2. **Streak-teller:** fire-emoji 🔥 past bij kinderen maar mogelijk te speels voor volwassenen. Alternatief: simpele teller zonder emoji. Wat is je voorkeur?
3. **Adaptive engine timing:** na 10 maten aanpassen, of na elke maat een kleine stap? 10-maatse checkpoints zijn voorspelbaarder; per-maat is vloeiender.
4. **Gehoor-modus:** eerste 2 herhalingen horen, dan spelen — of direct spelen zonder te horen? Het eerste is vriendelijker voor beginners.
5. **Sessielengte:** wil je een instelbare sessieduur (bijv. "10 minuten" als doel), of gewoon stoppen wanneer je wil?
