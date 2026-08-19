import { generateRankedRhythm } from '../generation/generateRankedRhythm.js';
import { TICKS_PER_WHOLE } from '../constants/timing.js';
import convertRankedArrayToMelody from '../generation/convertRankedArrayToMelody.js';
import { getRelativeNoteName } from '../theory/convertToDisplayNotes.js';

class Melody {
  constructor(
    notes,
    durations,
    offsets,
    displayNotes = notes,
    volumes = new Array(notes.length).fill(1),
    // #1091 (Han 2026-08-19, "playSound heeft dan nu twee variabelen: velocity en volume"): a NEW,
    // additive per-note MIDI velocity (0-127, real-MIDI scale — matches smplr's own default of 100,
    // see NoteEvent.velocity in smplr's types), separate from `volumes` (the existing pp/p/mp/mf/f
    // dynamics-level gain). Defaults to 100 ("neutral") everywhere it isn't explicitly set, so every
    // pre-existing caller that never passes this — bird/water layers, ambient piano, main practice
    // melodies, level backing — is byte-identical to before (playMelodies.js multiplies by
    // velocity/100, which is 1 at the default). The hh percussion generator (generateBackbeat.js) is
    // the first real user, accenting on-beat vs. off-beat hi-hat hits.
    velocities = new Array(notes.length).fill(100)
  ) {
    this.notes = notes;
    this.durations = durations; // duration = how many 48th notes (smallest); e.g.q = 12
    this.offsets = offsets;
    this.displayNotes = displayNotes;
    this.volumes = volumes;
    this.velocities = velocities;
  }

  static defaultTrebleMelody() {
    const m = new Melody(
      [
        'C4',
        null,
        'D4',
        null,
        null,
        'E4',
        'F4',
        'G4',
        'A4',
        null,
        'B4',
        null,
        'C5',
        null,
        null,
        null,
      ],
      [12, null, 18, null, null, 6, 6, 6, 12, null, 12, null, 24, null, null, null],
      [0, null, 12, null, null, 30, 36, 42, 48, null, 60, null, 72, null, null, null]
    );
    m.rhythmicGrouping = [2, 2];
    return m;
  }

  static defaultBassMelody() {
    const m = new Melody(['C3', 'G3'], [48, 48], [0, 48]);
    m.rhythmicGrouping = [2, 2];
    return m;
  }

  static defaultPercussionMelody() {
    const m = new Melody(['k', 'hh', 's', 'hh', 'k'], [12, 12, 12, 12, 12], [0, 12, 24, 36, 48]);
    m.rhythmicGrouping = [2, 2];
    return m;
  }

  static defaultMetronomeMelody() {
    const m = new Melody(
      ['wh', 'wl', 'wl', 'wl', 'wh', 'wl', 'wl', 'wl'],
      [12, 12, 12, 12, 12, 12, 12, 12],
      [0, 12, 24, 36, 48, 60, 72, 84]
    );
    m.rhythmicGrouping = [2, 2];
    return m;
  }

  static fromFlattenedNotes(notes, timeSignature, numMeasures, displayMelody = notes, volumes = null, scaleContext = null) {
    let durations = [];
    let offsets = [];
    let expandedVolumes = [];
    let timeScale = ((TICKS_PER_WHOLE * numMeasures) / notes.length) * (timeSignature[0] / timeSignature[1]);

    let noteIndex = 0;

    for (let index = 0; index < notes.length; index++) {
      const note = notes[index];
      if (note == null) {
        durations.push(null);
        offsets.push(null);
        expandedVolumes.push(null);
        durations[noteIndex]++;
      } else {
        durations.push(1);
        noteIndex = index;
        offsets.push(index * timeScale);
        expandedVolumes.push(volumes ? volumes[index] : 1);
      }
    }

    for (let index = 0; index < notes.length; index++) {
      const dur = durations[index];
      if (dur > 0) {
        durations[index] = timeScale * dur;
      }
    }

    let finalDisplayMelody = displayMelody || notes;

    // Automatically resolve display notes if a scale context is passed and displayMelody was not explicitly decoupled (e.g., passing chords)
    if (scaleContext && (!displayMelody || displayMelody === notes)) {
      const { notes: scaleNotes, displayNotes: scaleDisplayNotes, tonic: scaleTonic } = scaleContext;
      if (scaleNotes && scaleDisplayNotes && scaleTonic) {
        finalDisplayMelody = notes.map(note => {
          if (note === null) return null;
          // Skip mapping for percussion or rests
          if (!note.match(/^[A-G]/i)) return note;

          const index = scaleNotes.indexOf(note);
          if (index !== -1) return scaleDisplayNotes[index];
          // Fallback to spelling it relative to the key if it's an out-of-scale chromatic note
          return getRelativeNoteName(note, scaleTonic);
        });
      }
    }

    return new Melody(notes, durations, offsets, finalDisplayMelody, expandedVolumes);
  }

  static updateMetronome(timeSignature, numMeasures, smallestNoteDenom = 4) {
    // Formula: notes per measure = ceiling ( measure top / measure bottom * smallest note value )
    const notesPerMeasure = Math.ceil((timeSignature[0] / timeSignature[1]) * smallestNoteDenom);

    // 1. Generate rhythmic ranks
    const { rankedArray } = generateRankedRhythm(
      numMeasures,
      timeSignature,
      notesPerMeasure,
      smallestNoteDenom,
      0,        // variability
      'uniform' // randomizationRule
    );

    // 2. Convert ranks to woodblock pitches using standardized logic
    const { melody: flattenedNotes } = convertRankedArrayToMelody(
      rankedArray,
      null,        // tonic
      null,        // scale
      notesPerMeasure,
      numMeasures,
      'metronome', // randomizationNotes
      null,        // chordProgression
      null,        // range
      'uniform',   // randomizationRule
      null         // timeSignature (no chord-offset lookup needed for metronome)
    );

    // 3. Create Melody object
    const metronomeMelody = Melody.fromFlattenedNotes(
      flattenedNotes,
      timeSignature,
      numMeasures,
      flattenedNotes
    );

    return metronomeMelody;
  }
}

export default Melody;
