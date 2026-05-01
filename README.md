# Music Melody Trainer

Een interactieve muziekoefentool voor de browser. Genereert bladmuziek, speelt meerstemmige melodieën af en test je gehoor en leesvaardigheid in real-time.

## Wat doet het

- **Bladmuziek** — genereert en toont treble- en baspartijen als SVG, inclusief maatsoort, voortekens, balken, triolen en akkoorden
- **Meerstemmig afspelen** — treble, bas, percussie, metronoom en akkoorden tegelijk via Web Audio API
- **Input test** — speel wat je ziet (noten lezen) of wat je hoort (gehoor), met noot-voor-noot feedback
- **100+ toonladders** — alle diatonische modi, harmonisch/melodisch mineur, Double Harmonic, pentatonisch, bluestoonladders en meer
- **Akkoordprogressies** — van I–IV–V tot jazzy ii–V–I, passing chords en modale progressies
- **Adaptive difficulty** — moeilijkheid past zich automatisch aan op je niveau
- **Gamification** (in ontwikkeling) — XP, skills, lessen, examens, wereldkaart

## Technisch

| Component | Technologie |
|---|---|
| UI | React 19 + Vite |
| Audio | Web Audio API + [smplr](https://github.com/danigb/smplr) |
| Samples | Vrije instrumentsamples (Piano, Guitar, Strings, Percussion, ...) |
| Bladmuziek | SVG — eigen renderer, geen externe lib |
| Opslag | localStorage (geen backend vereist) |
| Mobiel | Capacitor/Android build beschikbaar |

## Starten

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Projectstructuur

```
src/
  audio/          Sequencer, afspelen, drum routing
  components/     UI-componenten (bladmuziek, piano, controls)
  generation/     Melodie- en akkoordgenerator
  hooks/          React hooks (playback, input test, difficulty, ...)
  model/          Melody, Scale, ChordProgression
  theory/         Nootberekeningen, toonladders, maatsoort
  utils/          Paginering, notatie-slicing, moeilijkheidsberekening
docs/
  architecture.md        Volledige architectuur-referentie
  gamification.md        Gamification-ontwerp
  gamification-curriculum.md  6-maanden lesplan
  lesson-engine.md       Technisch ontwerp lesson engine
  exercise-mode-ux.md    UX-ontwerp oefenmodus
  profile-schema.md      Profielopslag en skill-tracking
```

## Samples

De instrumentsamples in `public/samples/` zijn vrij herbruikbare audio-samples.  
Zie de licenties van de respectievelijke bronnen per instrument.

## Status

Actief in ontwikkeling. Geen stabiele release.
