# Lesson Engine — Technisch Ontwerp

**Status:** Concept / ter review
**Datum:** 2026-04-30

---

## Kernprincipe: geen rebuild, wel orkestratie

De app bevat al alles wat een les nodig heeft:
- Melodiegenerator + bladmuziek → de "oefenomgeving"
- Input test mode → de toetsvorm
- Playback + audio → luisteroefeningen
- Schaal/akkoord/BPM instellingen → de muzikale context

**Een les is een preset + instructies + succesbepaling + beloningen.**

De lesson engine is een dunne orkestratielaag die:
1. De app configureert (zoals `PresetPicker` dat nu doet)
2. Een instructie-overlay toont
3. Bewaakt wanneer het doel bereikt is
4. XP, skills en unlocks toekent

```
┌───────────────────────────────────────────────────┐
│                  Bestaande app                    │
│  SheetMusic · InputTest · Playback · Piano · ...  │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │           LessonOverlay (nieuw)             │  │
│  │  titel · instructie · voortgangsbalk · XP  │  │
│  └─────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
         ▲ configureert via bestaande contexts
         │
   useLessonEngine (nieuw)
         │
   lessonData/*.js (nieuw)
```

---

## 1. Lesson Config schema

Een les is een plain JS-object. Het heeft dezelfde "taal" als de bestaande PresetPicker.

```js
// Voorbeeld: les 3 van mijlpaal 1
{
  id: 'w1_m1_l3',
  world: 1,
  milestone: 1,
  lessonNumber: 3,

  title: 'Kwartnoot — de basisbeat',
  description: `
    De kwartnoot duurt precies één tel in 4/4.
    Luister naar het patroon en voel de beat.
  `,
  tip: 'Tik zachtjes mee met je voet op elke tel.',
  durationMin: [8, 12],

  // Wat de app instelt — zelfde shape als PresetPicker
  appConfig: {
    scale:         { tonic: 'C4', mode: 'Major' },
    timeSignature: [4, 4],
    bpm:           70,
    numMeasures:   2,
    treble: {
      notePool:          'scale',
      notesPerMeasure:   4,
      smallestNoteDenom: 4,
      rhythmVariability: 0,
    },
    playbackConfig: {
      repsPerMelody: 3,
      oddRounds:  { treble: 1, trebleEye: true,  notes: true },
      evenRounds: { treble: 1, trebleEye: true,  notes: true },
    },
  },

  // Welke instellingen de gebruiker NIET mag aanpassen tijdens de les
  locked: ['scale', 'bpm', 'timeSignature', 'numMeasures'],

  // Primaire app-modus
  mode: 'listen',          // 'listen' | 'input-test' | 'ear-training' | 'free-play'

  // Wanneer is de les klaar?
  successCondition: {
    type:      'listen_reps',   // zie §2
    threshold: 3,               // 3 keer volledig beluisterd
  },

  // Beloningen bij voltooiing
  xpReward: 15,
  skillDeltas: { sightReading: 1, rhythm: 2 },
  unlocks: [],                  // content-IDs die vrijkomen
}
```

---

## 2. Succes-condities

| Type | Trigger | Threshold-betekenis |
|---|---|---|
| `listen_reps` | `repsPerMelody` cycli doorlopen | aantal herhalingen |
| `input_test_score` | input-test voltooid | score % (0–100) |
| `ear_correct` | ear-training vragen beantwoord | correct beantwoorde vragen |
| `free_play_duration` | vrij spelen | minuten actief gespeeld |
| `exam_pass` | examen afgenomen | gewogen score over meerdere onderdelen |

De lesson engine luistert naar events die al in de bestaande hooks bestaan:
- `listen_reps` → `isOddRound` + herhaalcyclus in `usePlayback`
- `input_test_score` → `inputTestState.score / inputTestState.totalNotes` in `useInputTest`
- `free_play_duration` → timer in `useLessonEngine` zelf

---

## 3. Bestandsstructuur

```
src/
  lessons/
    lessonData/
      world1.js       ← 30 les-objecten
      world2.js
      world3.js
      world4.js
      world5.js
      world6.js
      examens.js      ← 6 examen-configs
      index.js        ← exporteert getLessonById(), getWorld(), etc.
    
    useLessonEngine.js   ← configureert app + bewaakt succes
    LessonOverlay.jsx    ← instructie-UI bovenop de app
    LessonContext.jsx    ← context: activeLesson, progress, complete()

  profile/
    useProfile.js        ← localStorage lees/schrijf
    profileSchema.js     ← standaard leeg profiel

  onboarding/
    OnboardingQuiz.jsx   ← de placement-quiz (zie gamification.md §12)
    placementExams.js    ← de 6 placement-examenconfigs
```

---

## 4. `useLessonEngine` — kernhook

```js
// src/lessons/useLessonEngine.js
const useLessonEngine = ({ lesson, onComplete }) => {
  // 1. Haal app-setters op uit bestaande contexts
  const { setPlaybackConfig } = usePlaybackConfig();
  const { setTrebleSettings, ... } = useInstrumentSettings();
  // scale, bpm, numMeasures komen uit App.jsx via een nieuw LessonContext

  // 2. Pas de config toe zodra de les start (als een preset)
  useEffect(() => {
    if (!lesson) return;
    applyLessonConfig(lesson.appConfig, { setPlaybackConfig, setTrebleSettings, ... });
  }, [lesson?.id]);

  // 3. Bewaak de succes-conditie
  const { inputTestState } = useContext(LessonContext);
  useEffect(() => {
    if (!lesson) return;
    if (isConditionMet(lesson.successCondition, inputTestState, repsCompleted)) {
      onComplete(lesson);
    }
  }, [inputTestState, repsCompleted]);

  // 4. Geef locked-instellingen terug zodat de UI ze kan grijzen
  return { lockedSettings: lesson?.locked ?? [] };
};
```

`applyLessonConfig` is een pure functie die hetzelfde doet als `PresetPicker.applyPreset` — alleen gestructureerder en volledig gedekt door de config.

---

## 5. `useProfile` — profielopslag

```js
// src/profile/useProfile.js
// Leest/schrijft naar localStorage onder de sleutel 'mmt_profile'

const useProfile = () => {
  const [profile, setProfile] = useState(() => loadProfile());

  const completeLesson = (lesson) => {
    setProfile(prev => ({
      ...prev,
      totalXP:          prev.totalXP + lesson.xpReward,
      completedLessons: [...prev.completedLessons, lesson.id],
      skills:           applySkillDeltas(prev.skills, lesson.skillDeltas),
      unlockedContent:  [...new Set([...prev.unlockedContent, ...lesson.unlocks])],
    }));
  };

  const passExam = (examId, level) => {
    // Unlock alle content t/m dit examen (zie unlock-tabel in curriculum-doc)
    setProfile(prev => ({
      ...prev,
      completedExams:  [...prev.completedExams, examId],
      unlockedContent: [...new Set([...prev.unlockedContent, ...getUnlocksUpTo(level)])],
      skills:          setSkillsForLevel(prev.skills, level),
    }));
  };

  return { profile, completeLesson, passExam };
};
```

---

## 6. Exercise Mode — gefilterde app

Exercise Mode is de bestaande app, maar met een filter op beschikbare opties:

```js
// src/exercise/useExerciseMode.js
const useExerciseMode = () => {
  const { profile } = useProfile();

  // Geeft de subset van toonladders terug die de gebruiker heeft unlocked
  const availableScales  = ALL_SCALES.filter(s => profile.unlockedContent.includes(s.id));
  const availableModes   = ALL_MODES.filter(m  => profile.unlockedContent.includes(m.id));
  // etc.

  return { availableScales, availableModes, ... };
};
```

De ScaleSelector, PlaybackSettings en andere componenten gebruiken straks `availableScales` i.p.v. `ALL_SCALES` — behalve in **Advanced Settings Mode**, waar de volledige lijst altijd beschikbaar is.

---

## 7. LessonOverlay — UI-schets

```
┌──────────────────────────────────────────┐
│ Les 3 · Wereld 1 · Mijlpaal 1            │  ← kleine header
│ Kwartnoot — de basisbeat          [✕ ]   │  ← sluit les (vraagt bevestiging)
├──────────────────────────────────────────┤
│ De kwartnoot duurt precies één tel.      │  ← instructie (max 2 zinnen)
│ 💡 Tik zachtjes mee met je voet.        │  ← tip
├──────────────────────────────────────────┤
│ Doel: luister 3× naar de melodie        │  ← succes-conditie in gewone taal
│ ████████░░  2 / 3                        │  ← voortgangsbalk
└──────────────────────────────────────────┘
```

Bij voltooiing:
```
┌──────────────────────────────────────────┐
│  ✓ Les voltooid!                         │
│  +15 XP · Ritme ↑2 · Bladmuziek ↑1      │
│                                          │
│  [Volgende les →]   [Blijf oefenen]      │
└──────────────────────────────────────────┘
```

---

## 8. Wat niet gebouwd hoeft te worden

| Wat | Waarom niet nodig |
|---|---|
| Nieuwe melodiegenerator | Bestaande `melodyGenerator.js` + instellingen volstaan |
| Nieuwe input-test UI | `useInputTest` + bestaande bladmuziek-weergave |
| Nieuwe audio-engine | Bestaande `Sequencer` + `playSound` |
| Aparte "les-view" | `LessonOverlay` bovenop de bestaande app |
| Server/database | `localStorage` voor alles — geen account nodig |

---

## 9. Bouwvolgorde (voorstel)

| Fase | Wat | Levert op |
|---|---|---|
| **1** | `profileSchema.js` + `useProfile.js` | Profiel lees/schrijf werkt |
| **2** | `lessonData/world1.js` (30 configs) | Eerste wereld heeft data |
| **3** | `useLessonEngine.js` | Config-applicatie + succes-bewaking |
| **4** | `LessonOverlay.jsx` | Gebruiker ziet instructies + voortgang |
| **5** | `useExerciseMode.js` + filter in ScaleSelector | Exercise Mode respecteert unlocks |
| **6** | `OnboardingQuiz.jsx` + placement flow | Eerste-keer ervaring compleet |
| **7** | Werelden 2–6 lesdata | Volledige 180-lessen curriculum |

---

## Open vragen voor review

1. **Locked settings UI:** grijze slotjes op instellingen die tijdens een les niet mogen, of helemaal verborgen?
2. **Les onderbreken:** mag je midden in een les de app verlaten? Progress autosaven of resetten?
3. **Meerdere apparaten:** profiel in `localStorage` is per apparaat. Wil je later cloud-sync (vereist backend), of is lokaal goed genoeg?
4. **Fase 1 prioriteit:** zal ik beginnen met `useProfile` + `lessonData/world1.js` als eerste concrete stap?
