import Melody from './Melody';

class Scale {
  constructor(
    notes,
    displayNotes,
    numAccidentals,
    name = 'Major', // mode
    family = 'Diatonic', // actual scale family (Diatonic, Melodic, Harmonic, etc.)
    tonic = null, // tonic note
    rangeUp = 12, // optional range above tonic
    rangeDown = 0, // optional range below tonic
    isSimple = false, // whether this scale appears in the Simple UI group
    displayName = null, // display name for UI (defaults to name if not provided)
    heptaRefIntervals = null, // reference intervals for heptatonic modulation
    intervals = null, // actual intervals of the scale
    diatonic = null // name of the diatonic parent scale (e.g. 'Ionian', 'Aeolian')
  ) {
    this.notes = notes;
    this.displayNotes = displayNotes;
    this.tonic = tonic || notes[0];
    this.numAccidentals = numAccidentals ?? 0;
    this.displayTonic = displayNotes[0];
    this.family = family;
    this.name = name;
    this.rangeUp = rangeUp;
    this.rangeDown = rangeDown;
    this.isSimple = isSimple;
    this.displayName = displayName || name;
    this.heptaRefIntervals = heptaRefIntervals;
    this.intervals = intervals;
    this.diatonic = diatonic;
  }

  length() {
    return this.notes.length;
  }

  /**
   * Creates a Melody from the scale notes with uniform quarter-note durations.
   * Used by the Play Scale button — keeps Scale as pure theory data.
   */
  toMelody() {
    const n = this.notes.length;
    const duration = 12; // quarter note in 48th-note units
    return new Melody(
      this.notes,
      new Array(n).fill(duration),
      Array.from({ length: n }, (_, i) => i * duration),
      this.displayNotes
    );
  }

  generateBassScale() {
    function lowerOctave(note) {
      const noteParts = note.match(/([^0-9]+)(\d+)/);
      if (!noteParts) return note;
      const pitch = noteParts[1];
      const octave = parseInt(noteParts[2], 10) - 1;
      return pitch + octave;
    }

    const bassNotes = this.notes.map(lowerOctave);
    const bassDisplayScale = this.displayNotes.map(lowerOctave);
    return new Scale(
      bassNotes,
      bassDisplayScale,
      this.numAccidentals,
      this.name,
      this.family,
      lowerOctave(this.tonic),
      this.rangeUp,
      this.rangeDown,
      this.isSimple,
      this.displayName,
      this.heptaRefIntervals,
      this.intervals,
      this.diatonic
    );
  }

  // STATIC METHODS

  /**
   * Returns a hardcoded C Major Scale, suitable for use as an initial/default value.
   * For any other tonic or mode, use `updateScaleWithMode` from scaleHandler instead.
   *
   * NOTE: Scale does NOT import scaleHandler to avoid a circular dependency.
   * (scaleHandler imports Scale to construct Scale instances.)
   */
  static defaultScale() {
    // Hardcoded C Major — correct for the default case and avoids circular imports.
    return new Scale(
      ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
      ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
      0,
      'Major',
      'Diatonic',
      'C4',
      12,
      0,
      true,
      'Major',
      null,
      [2, 2, 1, 2, 2, 2, 1],
      'Ionian'
    );
  }

  static defaultPercussionScale() {
    return new Scale(
      ['k', 's', 'hh', 'ho', 'th', 'tm', 'tl', 'hp', 'cr', 'cc', 'wh', 'wl'],
      ['k', 's', 'hh', 'ho', 'th', 'tm', 'tl', 'hp', 'cr', 'cc', 'wh', 'wl'],
      0
    );
  }

  static defaultCymbalScale() {
    return new Scale(['hh', 'ho', 'hp', 'cr', 'cc'], ['hh', 'ho', 'hp', 'cr', 'cc'], 0);
  }

  static defaultBeatScale() {
    return new Scale(['k', 's'], ['k', 's'], 0, 'Beat', 'Percussion');
  }
}

export default Scale;
