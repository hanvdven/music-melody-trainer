# Refactoring Plan — Music Melody Trainer

**Status:** In uitvoering  
**Datum:** 2026-05-04  
**Scope:** Technische schuld wegwerken zonder features te verliezen

### Voortgang

| Fase | Beschrijving | Status |
|------|-------------|--------|
| 1 | Constanten centraliseren (musicLayout, generatorDefaults, instrumentRules) | ✅ Gereed |
| 2 | useRefState hook + App.jsx duplicate setters elimineren | ✅ Gereed |
| 3 | Context uitbreiden (MelodyContext, PlaybackStateContext, AnimationRefsContext) | ✅ Gereed |
| 4 | App.jsx opsplitsen — useAppLayout geëxtraheerd; useAppCoreState/useAppHandlers/TabView nog open | 🔄 Deels |
| 5 | SheetMusic.jsx opsplitsen (transitions hook, header component) | ⏳ Gepland |
| 6 | Sequencer.js — applyResultToSetters ✅ + buildScheduledChords ✅ | ✅ Gereed |
| 7 | useMelodyState — resolveVoice factory (elimineer 3× dubbele generatielogica) | ✅ Gereed |
| 8 | getNoteValue consolideren → getNoteIndex uit musicUtils | ✅ Gereed |
| 9 | InstrumentRow subcomponenten extraheren + GRID-constanten centraliseren | ✅ Gereed |
| 10 | Dode code opruimen (repCount, ongebruikte imports) | ✅ Gereed |

---

## Uitgangspunten

1. **Geen features verliezen.** Elke fase is een pure refactoring — gedrag ongewijzigd.
2. **Elke fase is zelfstandig shipbaar.** App moet na elke fase draaien zonder regressies.
3. **Dependency-volgorde.** Latere fasen bouwen op eerdere. Niet overslaan.
4. **Tests first waar al tests bestaan.** `src/utils/__tests__/` uitbreiden bij elke verplaatste functie.

---

## Gevonden problemen (samenvatting analyse)

| Bestand | Regels | Kernprobleem |
|---|---|---|
| `SheetMusic.jsx` | 2890 | God-component: rendering + animatie + UI-state + settings + layout |
| `App.jsx` | 1625 | God-component: 67 state vars, 60 props aan SheetMusic, 4× duplicaat setter-patroon |
| `Sequencer.js` | 1405 | Klasse met gemengde verantwoordelijkheden: audio + animatie + melodiegeneratie + UI-callbacks |
| `InstrumentRow.jsx` | 660 | Hardgecodeerde constanten, 3 inline subcomponenten, duplicaat selectors |
| `useMelodyState.js` | 463 | Treble/bas/percussie generatielogica 3× gedupliceerd, dood history-systeem |
| `PlaybackSettings.jsx` | 602 | Duplicaat progressie-opties, mixed layout + logica |
| `melodyGenerator.js` | 441 | `getNoteValue` gedupliceerd vanuit SheetMusic, chord-mode 2× identiek |

### Cross-bestand duplicaten (kritiek)

| Patroon | Locaties |
|---|---|
| `PRESET_RANGES` constante | `Sequencer.js:27`, `SheetMusic.jsx:38` |
| `globalResolution = 16` | `melodyGenerator.js:72`, `useMelodyState.js:140`, `Sequencer.js:143` |
| `getNoteValue()` functie | `SheetMusic.jsx:115`, `melodyGenerator.js:115` |
| Ref-syncing setter wrapper | `App.jsx:138–191` (4×, identiek) |
| "Apply generation result" | `Sequencer.js:79–112`, `Sequencer.js:654–693` |
| Melodie modulatie + resize | `App.jsx`, `useMelodyState.js`, `usePlaybackNavigation.js` (5×) |
| `RULE_FAMILIES` / progressie-opties | `InstrumentRow.jsx:29–49`, `PlaybackSettings.jsx` |

---

## Fase 1 — Constanten centraliseren

**Risico:** Laag. Puur importwijzigingen, geen logicawijziging.  
**Winst:** Elimineert 3 cross-bestand duplicaten, maakt andere fasen mogelijk.

### 1a. `src/constants/musicLayout.js` (nieuw)

Verplaats vanuit `Sequencer.js:27` en `SheetMusic.jsx:38`:

```js
export const PRESET_RANGES = {
  STANDARD: { treble: { min: 'C4', max: 'E5' }, bass: { min: 'A2', max: 'C4' } },
  LARGE:    { treble: { min: 'C4', max: 'G5' }, bass: { min: 'G2', max: 'C4' } },
  FULL:     { treble: { min: 'A3', max: 'C6' }, bass: { min: 'C2', max: 'E4' } },
};

export const APPROX_HEADER_WIDTH  = 70;   // px, voor idealVisibleMeasures berekening
export const APPROX_PX_PER_MEASURE = 120; // px, idem
```

**Verwijder:** hardcoded kopieën in `Sequencer.js:27–31` en `SheetMusic.jsx:38–42`.

### 1b. `src/constants/generatorDefaults.js` (nieuw)

Verplaats vanuit `melodyGenerator.js`, `useMelodyState.js`, `Sequencer.js`:

```js
export const GLOBAL_RESOLUTION = 16; // standaard noemer voor gridberekeningen

// Standaard app-configuratie (ook gebruikt door tests en presets)
export const DEFAULT_BPM         = 120;
export const DEFAULT_TIME_SIG    = [4, 4];
export const DEFAULT_NUM_MEASURES = 2;
export const DEFAULT_SCALE_TONIC = 'C4';
export const DEFAULT_SCALE_MODE  = 'Major';

export const VOLUME_LEVELS = [1.0, 0.8, 0.6, 0.4, 0.2, 0.0];
```

**Verwijder:** `VOLUME_LEVELS` uit `App.jsx:77`, `globalResolution = 16` op drie locaties.

### 1c. `src/constants/instrumentRules.js` (nieuw)

Verplaats vanuit `InstrumentRow.jsx:29–49`:

```js
export const RULE_FAMILIES = {
  random:  ['uniform', 'emphasize_roots', 'weighted'],
  arp:     ['arp_up', 'arp_down', 'arp'],
  chords:  ['pairedchord', 'fullchord'],
  fixed:   ['fixed'],
};

export const PERC_FAMILIES = {
  random:   ['uniform'],
  stylized: ['backbeat', 'swing'],
  fixed:    ['fixed'],
};
```

### 1d. Update imports

In elk bestand dat een van de bovenstaande waarden hardcodeert: vervang de literal door de import. Geen andere wijzigingen.

---

## Fase 2 — Elimineer duplicaat setter-patroon in App.jsx

**Risico:** Laag. Puur interne App.jsx refactoring.  
**Winst:** 48 regels → 12 regels in App.jsx; patroon wordt expliciet en testbaar.

### Probleem

`App.jsx:138–191` bevat 4 identieke wrappers die state én een ref synchroon houden:

```js
// Identiek patroon, 4× herhaald voor bpm / timeSignature / numMeasures / scale
const [bpm, _setBpm] = useState(120);
const setBpm = useCallback((val) => {
  if (typeof val === 'function') {
    _setBpm((p) => { const next = val(p); bpmRef.current = next; return next; });
  } else {
    bpmRef.current = val;
    _setBpm(val);
  }
}, []);
```

### Oplossing: `useRefState` hook

Nieuw bestand: `src/hooks/useRefState.js`

```js
import { useState, useCallback, useRef } from 'react';

/**
 * useState die een ref synchroon meehoudt.
 * Ref is direct leesbaar door AudioContext-callbacks zonder stale-closure risico.
 * State triggert React re-renders zoals normaal.
 */
export const useRefState = (initialValue) => {
  const ref = useRef(initialValue);
  const [state, _setState] = useState(initialValue);

  const setState = useCallback((val) => {
    if (typeof val === 'function') {
      _setState((prev) => {
        const next = val(prev);
        ref.current = next;
        return next;
      });
    } else {
      ref.current = val;
      _setState(val);
    }
  }, []);

  return [state, setState, ref];
};
```

### Gebruik in App.jsx

```js
// Vóór: 48 regels
// Na: 4 regels
const [bpm,           setBpm,           bpmRef]  = useRefState(DEFAULT_BPM);
const [timeSignature, setTimeSignature, tsRef]   = useRefState(DEFAULT_TIME_SIG);
const [numMeasures,   setNumMeasures,   nmRef]   = useRefState(DEFAULT_NUM_MEASURES);
const [scale,         setScale,         scaleRef] = useRefState(Scale.defaultScale(DEFAULT_SCALE_TONIC, DEFAULT_SCALE_MODE));
```

**Verwijder:** `bpmRef`, `tsRef`, `nmRef`, `scaleRef` als aparte `useRef` — ze komen nu uit `useRefState`.

---

## Fase 3 — Context uitbreiden (prop drilling reduceren)

**Risico:** Middel. Raakt veel componenten, maar alleen om props te vervangen door context.  
**Winst:** SheetMusic.jsx-props van ~60 → ~35; App.jsx slanker.

### 3a. `src/contexts/MelodyContext.jsx` (nieuw)

Huidige situatie: `trebleMelody`, `bassMelody`, `percussionMelody`, `metronomeMelody`, `chordMelody`, `displayChordProgression` worden als losse props doorgegeven aan SheetMusic (en bij dual-view 2×!).

```jsx
export const MelodyContext = React.createContext(null);

export const MelodyProvider = ({ treble, bass, percussion, metronome, chords, displayChordProgression, children }) => (
  <MelodyContext.Provider value={{ treble, bass, percussion, metronome, chords, displayChordProgression }}>
    {children}
  </MelodyContext.Provider>
);

export const useMelodies = () => useContext(MelodyContext);
```

SheetMusic, renderMelodyNotes, en andere consumers lezen via `useMelodies()` in plaats van props.

### 3b. `src/contexts/PlaybackStateContext.jsx` (nieuw)

Huidige situatie: `isPlaying`, `isOddRound`, `currentMeasureIndex`, `song`, `songVersion`, `inputTestState`, `inputTestSubMode` worden als props doorgegeven.

```jsx
export const PlaybackStateContext = React.createContext(null);

export const PlaybackStateProvider = ({ isPlaying, isOddRound, currentMeasureIndex,
  song, songVersion, inputTestState, inputTestSubMode, setInputTestSubMode, children }) => (
  <PlaybackStateContext.Provider value={{ ... }}>
    {children}
  </PlaybackStateContext.Provider>
);
```

### 3c. `src/contexts/AnimationRefsContext.jsx` (nieuw)

Huidige situatie: `wipeTransitionRef`, `scrollTransitionRef`, `pendingScrollTransitionRef`, `paginationFadeRef`, `clearHighlightStateRef`, `showNoteHighlightRef` worden als props doorgegeven aan SheetMusic.

Deze refs hebben geen renderwaarde — ze zijn puur voor de Sequencer/animatielogica. Verplaats ze naar context zodat Sequencer ze kan bereiken zonder via App.jsx te gaan.

```jsx
export const AnimationRefsContext = React.createContext(null);
// Exposeert de refs direct — geen state, dus geen re-renders
```

---

## Fase 4 — App.jsx opsplitsen

**Risico:** Middel-hoog. Grootste bestand, maar na fasen 1–3 is het fundament gelegd.  
**Winst:** App.jsx van 1625 → ~300 regels; hooks zijn zelfstandig testbaar.

### Extractieplan

```
App.jsx (1625 regels) ──► na refactoring:
  src/hooks/useAppCoreState.js     (~150 regels)
  src/hooks/useAppHandlers.js      (~200 regels)
  src/hooks/useAppLayout.js        (~80 regels)
  src/components/layout/TabView.jsx (~100 regels)
  App.jsx                          (~300 regels — puur orchestratie)
```

### `useAppCoreState.js`

Bevat: alle `useRefState`-aanroepen (bpm, ts, numMeasures, scale), instrument settings state, configRef initialisatie, `makeInstrumentSetter` factory, de 5 instrument-setters.

```js
export const useAppCoreState = () => {
  const [bpm, setBpm, bpmRef]                   = useRefState(DEFAULT_BPM);
  const [timeSignature, setTimeSignature, tsRef] = useRefState(DEFAULT_TIME_SIG);
  const [numMeasures, setNumMeasures, nmRef]     = useRefState(DEFAULT_NUM_MEASURES);
  const [scale, setScale, scaleRef]              = useRefState(...);
  // ... instrument settings
  return { bpm, setBpm, bpmRef, timeSignature, setTimeSignature, tsRef, ... };
};
```

### `useAppHandlers.js`

Bevat: `handleScaleChange`, `handleTonicChange`, `handleModeChange`, `handleTimeSignatureChange`, `handleRandomize`, `handleNoteEnharmonicToggle`, etc.

Ontvangt de state uit `useAppCoreState` als parameter — geen directe state.

### `useAppLayout.js`

Bevat: `idealVisibleMeasures` berekening, responsief maat-snijden, `containerHeight`.

```js
export const useAppLayout = ({ screenWidth, numMeasures }) => {
  const idealVisibleMeasures = useMemo(() =>
    Math.max(2, Math.min(numMeasures,
      Math.round((screenWidth - APPROX_HEADER_WIDTH) / APPROX_PX_PER_MEASURE)
    )), [screenWidth, numMeasures]);
  return { idealVisibleMeasures };
};
```

### `TabView.jsx`

Bevat: de `switch(activeTab)` renderlogica (regels ~900–1400 in App.jsx). App.jsx roept `<TabView activeTab={activeTab} />` aan.

---

## Fase 5 — SheetMusic.jsx opsplitsen

**Risico:** Hoog. Grootste bestand (2890 regels), veel interne state en animatielogica.  
**Aanpak:** Stap voor stap, niet alles tegelijk.

### 5a. `useSheetMusicTransitions.js` (nieuw hook)

Verplaats vanuit `SheetMusic.jsx:255–350` — de `useLayoutEffect` die wipe-maskers, pagination-fades en scroll-resets beheert.

```js
export const useSheetMusicTransitions = ({ viewMode, wipeTransitionRef,
  scrollTransitionRef, pendingScrollTransitionRef, paginationFadeRef,
  currentMeasureIndex, song, songVersion }) => {
  // De gehele 95-regelige useLayoutEffect
};
```

### 5b. `SheetMusicHeader.jsx` (nieuw component)

Verplaats vanuit `SheetMusic.jsx` — het gedeelte dat clef-symbool, transpositielabel, BPM, maatsoort en tempoterm toont met settings-overlay interactiviteit.

Props van `SheetMusicHeader`:
- `timeSignature`, `onTimeSignatureChange`
- `bpm`, `onBpmChange`
- `clef`, `onClefChange`
- `transposingInstrument`, `onTransposingChange`
- `showSettings`, `onToggleSettings`, `onSettingsInteraction`

Dit elimineert ~400 regels uit SheetMusic.jsx.

### 5c. Derived state vervangen

SheetMusic.jsx heeft:
```js
const [trebleActiveClef, setTrebleActiveClef] = React.useState('treble');
useEffect(() => { if (trebleSettings?.preferredClef) setTrebleActiveClef(trebleSettings.preferredClef); }, [...]);
```

Dit is derived state. Vervang door:
```js
const trebleActiveClef = trebleSettings?.preferredClef ?? 'treble';
const bassActiveClef   = ACTIVE_CLEF_TYPES.includes(bassSettings?.preferredClef)
  ? bassSettings.preferredClef : 'bass';
```

### 5d. `RandomizeIcon` uit SheetMusic.jsx halen

Inline gedefinieerd component (SheetMusic.jsx:362–372) verplaatsen naar `src/components/common/RandomizeIcon.jsx`.

---

## Fase 6 — Sequencer.js — duplicaten elimineren

**Risico:** Middel. Klasse-refactoring, maar gedrag moet bit-identiek blijven.

### 6a. `applyGenerationResult()` methode

Verplaats de dubbele "pas generatieresultaat toe op state" logica (regels 79–112 en 654–693) naar één methode:

```js
applyGenerationResult(result, { applyToDisplay = true } = {}) {
  if (result.tonic) this.setters.setTonic(result.tonic);
  if (result.scale) this.setters.setScale(result.scale);
  if (result.treble) {
    this.setters.setTrebleMelody(result.treble);
    this.refs.instrumentSettingsRef.current.treble = result.trebleSettings ?? ...;
  }
  if (result.bass) { ... }
  if (result.percussion) { ... }
  if (result.chordProgression) { ... }
  if (applyToDisplay && this.setters.hideOldGroup) this.setters.hideOldGroup();
}
```

### 6b. `buildScheduledChords()` methode

Verplaats regels 444–476 naar:

```js
buildScheduledChords(chordProgression, measureStart, measureLength) {
  // Chord extractie + duration-vulling
  // Returns: Array<{ chord, startTime, duration }>
}
```

### 6c. Dead code verwijderen

- `let repCount = 0` (regel 170) — gedeclareerd maar nooit gebruikt. Verwijder.
- `this.timeouts = []` — array groeit onbeperkt. Vervang door cleanup bij `stop()`.

### 6d. Animatiemodus als strategie

De drie animatiemodi (wipe / pagination / scroll) hebben elk bijna-identieke branches (regels 501–587). Maak een strategie-object:

```js
const ANIMATION_STRATEGY = {
  wipe:       { buildTransitionArgs: ..., scheduleFlip: ... },
  pagination: { buildTransitionArgs: ..., scheduleFlip: ... },
  scroll:     { buildTransitionArgs: ..., scheduleFlip: ... },
};
```

Zodat de hoofdlus wordt:
```js
const strategy = ANIMATION_STRATEGY[viewMode] ?? ANIMATION_STRATEGY.pagination;
strategy.scheduleFlip(flipTime, nextLayer, ...);
```

---

## Fase 7 — useMelodyState.js: generatielogica DRY maken

**Risico:** Middel. Kernlogica voor melodiegeneratie.

### 7a. `generateOrModulateVoice()` factory

De treble/bas/percussie generatielogica is 3× bijna-identiek (regels 209–316):

```js
// src/hooks/useMelodyState.js — nieuwe helper
const generateOrModulateVoice = ({
  isFixed, canRandomize, existingMelody,
  referenceMelody, referenceScale, targetScale,
  settings, numMeasures, timeSignature, runId,
  getScale,    // () => Scale voor dit voice-type (bijv. generateBassScale)
  generateFn,  // () => MelodyGenerator.generateMelody()
}) => {
  if (isFixed && referenceMelody) {
    const sc = getScale();
    const refSc = getScale(referenceScale);
    const modulated = modulateMelody(referenceMelody, refSc, sc);
    return new Melody(modulated, ...);
  }
  if (!canRandomize && existingMelody) return existingMelody;
  return generateFn();
};
```

Roep dan aan voor treble, bas, percussie met de juiste parameters — geen duplicatie meer.

### 7b. Dead history-systeem verwijderen

`useMelodyState.js:37–40` declareert `history`, `historyIndex`, `globalMeasureOffset` — nooit volledig gebruikt, `history` nooit gevuld. Verwijder deze drie state-variabelen en eventuele verwijzingen.

---

## Fase 8 — getNoteValue consolideren in noteUtils.js

**Risico:** Laag. Pure functie, goed testbaar.

### Probleem

`getNoteValue` staat op twee plaatsen met identieke logica:
- `SheetMusic.jsx:115–121`
- `melodyGenerator.js:115–125`

### Oplossing

Voeg toe aan `src/theory/noteUtils.js` (die al het centrale punt is voor note-primitieven per `CLAUDE.md`):

```js
/**
 * Geeft de MIDI-waarde van een nootnaam terug (bijv. "C4" → 60).
 * Returns -1 voor ongeldige invoer.
 */
export const getNoteValue = (note) => { ... };
```

Update de twee import-locaties. Voeg test toe aan `src/utils/__tests__/`.

---

## Fase 9 — InstrumentRow.jsx opschonen

**Risico:** Laag. UI-component, geen audio-logica.

### 9a. Subcomponenten extraheren

`ChordComplexityIcon` (68 regels, inline in InstrumentRow) → `src/components/controls/ChordComplexityIcon.jsx`  
`PlayStyleSelector` (48 regels, inline) → `src/components/controls/PlayStyleSelector.jsx`  
`RuleSelector` (32 regels, inline) → `src/components/controls/RuleSelector.jsx`

### 9b. Volume-kleurmap naar constants

```js
// src/constants/volumeColors.js
export const VOLUME_COLOR_MAP = [
  { min: 1.0, color: 'var(--accent-yellow)' },
  { min: 0.8, color: '#d4aa44' },
  { min: 0.6, color: '#a0c060' },
  { min: 0.4, color: '#80b0c0' },
  { min: 0.0, color: '#6090e0' },
];
export const volColor = (vol) =>
  vol === 0 ? 'rgba(255,255,255,0.35)'
  : VOLUME_COLOR_MAP.find(e => vol >= e.min)?.color ?? 'rgba(255,255,255,0.35)';
```

### 9c. Grid-breedte naar constants

`GRID_GENERATOR` en `GRID_VISIBILITY` strings zijn ook gebruikt in PlaybackSettings — verplaats naar `src/constants/layoutConstants.js`.

---

## Fase 10 — Utils opruimen

**Risico:** Laag.

### 10a. Dode bestanden verwijderen

Backlog noemt: `playContinuously.js`, `usePlaybackState.js` als verouderd.  
Verifieer dat ze niet meer geïmporteerd worden, dan verwijder.

### 10b. `melodySlice.js` + `pagination.js` — comments toevoegen

Beide zijn klein maar hun werking is niet triviaal. Voeg één zin toe aan elke exportfunctie die uitlegt *waarom* ze bestaat.

---

## Implementatievolgorde (aanbevolen)

| Fase | Afhankelijk van | Geschatte tijdsduur | Risico |
|---|---|---|---|
| 1 — Constanten | — | Klein | Laag |
| 2 — useRefState | Fase 1 | Klein | Laag |
| 8 — getNoteValue | — | Klein | Laag |
| 10 — Utils opruimen | — | Klein | Laag |
| 9 — InstrumentRow | Fase 1 | Middel | Laag |
| 3 — Context uitbreiden | Fase 1, 2 | Middel | Middel |
| 7 — useMelodyState | Fase 1 | Middel | Middel |
| 6 — Sequencer | Fase 1, 2 | Groot | Middel |
| 4 — App.jsx splitsen | Fase 1, 2, 3 | Groot | Middel-hoog |
| 5 — SheetMusic splitsen | Fase 3, 4 | Groot | Hoog |

**Start altijd met laagrisicowerk.** Fasen 1, 2, 8, 10 kunnen parallel of in één sessie.

---

## Verificatie per fase

Na elke fase:
1. `npm run dev` — app start zonder errors
2. Speel een melodie af in elke animatiemodus (pagination, wipe, scroll)
3. Input test uitvoeren (correct + fout)
4. Instellingen overlay openen en sluiten
5. Toonladder wisselen tijdens playback
6. `npm test` — bestaande tests groen

---

## Wat bewust NIET wordt gerefactored

| Wat | Reden |
|---|---|
| `processMelodyAndCalculateSlots.js` | Complex, goed geïsoleerd, niet gedupliceerd |
| `renderMelodyNotes.jsx` | Veel gevestigde notatie-logica, risico op regressie zonder visuele tests |
| `scaleHandler.js` | Grote datastructuren, correct werkend, geen pressing issues |
| Animatie-timing (Sequencer rAF-lus) | Architectuurinvariant per CLAUDE.md §6 — nooit setTimeout voor timing |
| Drum routing | Correct werkend, goed gedocumenteerd in architecture.md |
