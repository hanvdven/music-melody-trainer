// Happy Birthday to You — static song definition.
// Key: F major | Time: 3/4 | TICKS_PER_WHOLE=48, measure=36 ticks
//
// Tick map (12 measures including pickup):
//   m0 (pickup): 0–35,  notes at beats 3a/3b → offsets 24, 30
//   m1: 36–71    m2: 72–107   m3: 108–143 (pickup beats at 132,138)
//   m4: 144–179  m5: 180–215  m6: 216–251 (pickup beats at 240,246)
//   m7: 252–287  m8: 288–323  m9: 324–359 (pickup beats at 348,354)
//   m10: 360–395 m11: 396–431

const F  = ['F3', 'A3', 'C4'];  // F major (I)
const C7 = ['C3', 'E3', 'G3', 'Bb3']; // C7 (V7) — voiced without 5th for readability
const Bb = ['Bb3', 'D4', 'F4']; // Bb major (IV)

// Each chord entry: { offset, notes, root, type, name, duration }
// duration = ticks until next chord (or end of song at tick 432)
const EASY_CHORDS = [
  { offset: 0,   notes: F,  root: 'F3',  type: 'major',   name: 'F',  duration: 72  },
  { offset: 72,  notes: C7, root: 'C3',  type: 'dominant', name: 'C7', duration: 36  },
  { offset: 108, notes: F,  root: 'F3',  type: 'major',   name: 'F',  duration: 72  },
  { offset: 180, notes: C7, root: 'C3',  type: 'dominant', name: 'C7', duration: 36  },
  { offset: 216, notes: Bb, root: 'Bb3', type: 'major',   name: 'B♭', duration: 72  },
  { offset: 288, notes: F,  root: 'F3',  type: 'major',   name: 'F',  duration: 72  },
  { offset: 360, notes: C7, root: 'C3',  type: 'dominant', name: 'C7', duration: 36  },
  { offset: 396, notes: F,  root: 'F3',  type: 'major',   name: 'F',  duration: 36  },
];

export default {
  id: 'happy-birthday',
  title: 'Happy Birthday to You',
  subtitle: 'Traditional',
  category: 'beginner',
  timeSignature: [3, 4],
  defaultTempo: 90,
  // defaultTonic is the pitch class the notes are written in.
  // loadSong() transposes everything when the user picks a different tonic.
  defaultTonic: 'F',
  numMeasures: 12,

  // ── Generator config — applied to app/instrument state on song load ──────
  //
  // Shape: each `*Settings` block is shallow-merged onto the corresponding
  // default `InstrumentSettings` so the song can override only the fields it
  // cares about. `randomizationRule: 'fixed'` on a track means the loaded
  // melody is pinned: regenerations (e.g. clicking "generate") preserve it,
  // transposing it to the current scale via `resolveVoice`.
  //
  // A track that the difficulty data leaves empty (e.g. no `bass`) will be
  // freshly generated on regen using these settings. Happy Birthday uses
  // walking-bass over the loaded chord progression.
  //
  // `scaleMode` is the Scale.modeName the song was composed in; loadSong
  // applies it to the app scale together with `defaultTonic`.
  generator: {
    scaleFamily: 'Diatonic',
    scaleMode: 'Major',
    chordSettings: {
      strategy: 'classical-1-4-5-1',
      chordCount: 1,
      passingChordTypes: [],
    },
    trebleSettings: {
      randomizationRule: 'fixed',
      notesPerMeasure: 2,
    },
    bassSettings: {
      randomizationRule: 'walking_bass',
      notePool: 'chord',
      notesPerMeasure: 2,
      smallestNoteDenom: 4,
      rhythmVariability: 30,
    },
    percussionSettings: null,
  },

  difficulties: {
    easy: {
      treble: {
        // Line 1: "Happy Birthday to you"     (m0 pickup → m2)  ends 3rd (E)
        // Line 2: "Happy Birthday to you"     (m3 pickup → m5)  ends tonic (F)
        // Line 3: "Happy Birthday dear [name]" (m6 pickup → m8) jumps to C5
        // Line 4: "Happy Birthday to you"     (m9 pickup → m11) classic Bb anacrusis
        notes: [
          'C4','C4', 'D4','C4','F4', 'E4',
          'C4','C4', 'D4','C4','G4', 'F4',
          'C4','C4', 'C5','A4','F4', 'E4',
          'Bb4','Bb4', 'A4','F4','G4', 'F4',
        ],
        durations: [
           6,  6,  12, 12, 12, 36,
           6,  6,  12, 12, 12, 36,
           6,  6,  12, 12, 12, 36,
           6,  6,  12, 12, 12, 36,
        ],
        offsets: [
          24, 30,  36, 48, 60,  72,
         132,138, 144,156,168, 180,
         240,246, 252,264,276, 288,
         348,354, 360,372,384, 396,
        ],
        lyrics: [
          'Hap-', 'py', 'Birth-', 'day', 'to', 'you,',
          'Hap-', 'py', 'Birth-', 'day', 'to', 'you,',
          'Hap-', 'py', 'Birth-', 'day', 'dear', '[name]!',
          'Hap-', 'py', 'Birth-', 'day', 'to', 'you!',
        ],
      },
      chords: EASY_CHORDS,
      // null = song does not provide this track. The generator config above
      // determines what (if anything) happens for it on song load and regen.
      bass: null,
      percussion: null,
    },
  },
};
