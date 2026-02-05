import { generateNumAccidentals } from '../utils/scaleHandler';

class Scale {
  constructor(
    scale,
    displayScale,
    numAccidentals,
    name = 'Major',       // mode
    family = 'Simple',    // scale type
    tonic = null,         // tonic note
    rangeUp = 12,         // optionele range boven tonic
    rangeDown = 0         // optionele range onder tonic
  ) {
    this.scale = scale;
    this.displayScale = displayScale;
    this.tonic = tonic || scale[0];
    this.numAccidentals = numAccidentals ?? generateNumAccidentals(this.tonic || scale[0], name);
    this.displayTonic = displayScale[0];
    this.notes = scale;
    this.durations = new Array(scale.length).fill(12);
    this.timeStamps = Array.from({ length: scale.length }, (_, i) => i * 12);
    this.volumes = new Array(scale.length).fill(1);
    this.family = family;
    this.name = name;
    this.rangeUp = rangeUp;
    this.rangeDown = rangeDown;
  }

  length() {
    return this.scale.length;
  }

  generateBassScale() {
    function lowerOctave(note) {
      const noteParts = note.match(/([^0-9]+)(\d+)/);
      if (!noteParts) return note;
      const pitch = noteParts[1];
      const octave = parseInt(noteParts[2], 10) - 1;
      return pitch + octave;
    }

    const bassScale = this.scale.map(lowerOctave);
    const bassDisplayScale = this.displayScale.map(lowerOctave);
    return new Scale(
      bassScale,
      bassDisplayScale,
      this.numAccidentals,
      this.name,
      this.family,
      lowerOctave(this.tonic),
      this.rangeUp,
      this.rangeDown
    );

    console.log('generateBassScale:', bassScale, this.tonic);
  }

  // STATIC METHODS
  static defaultScale(tonic = 'C4', name = 'Major', family = 'Simple') {
    return new Scale(
      ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
      ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
      0,
      name,
      family,
      tonic
    );
  }

  static defaultPercussionScale() {
    return new Scale(
      ['b', 's', 'hh', 'ho', 'th', 'tm', 'tl', 'hp', 'cr', 'cc'],
      ['b', 's', 'hh', 'ho', 'th', 'tm', 'tl', 'hp', 'cr', 'cc'],
      0
    );
  }

  static defaultCymbalScale() {
    return new Scale(
      ['hh', 'ho', 'hp', 'cr', 'cc'],
      ['hh', 'ho', 'hp', 'cr', 'cc'],
      0
    );
  }

  static defaultBeatScale() {
    return new Scale(
      ['b', 's'],
      ['b', 's'],
      0,
      'Beat',
      'Percussion'
    );
  }
}

export default Scale;
