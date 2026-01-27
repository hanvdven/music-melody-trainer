class Melody {
  constructor(
    notes,
    durations,
    timeStamps,
    displayNotes = notes,
    volumes = new Array(notes.length).fill(1)
  ) {
    this.notes = notes;
    this.durations = durations; // duration = how many 48th notes (smallest); e.g.q = 12
    this.timeStamps = timeStamps;
    this.displayNotes = displayNotes;
    this.volumes = volumes;
  }

  static defaultTrebleMelody() {
    return new Melody(
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
      [
        12,
        null,
        18,
        null,
        null,
        6,
        6,
        6,
        12,
        null,
        12,
        null,
        24,
        null,
        null,
        null,
      ],
      [
        0,
        null,
        12,
        null,
        null,
        30,
        36,
        42,
        48,
        null,
        60,
        null,
        72,
        null,
        null,
        null,
      ]
    );
  }

  static defaultBassMelody() {
    return new Melody(['C3', 'G3'], [48, 48], [0, 48]);
  }

  static defaultPercussionMelody() {
    return new Melody(
      ['b', 'hh', 's', 'hh', 'b'],
      [12, 12, 12, 12, 12],
      [0, 12, 24, 36, 48]
    );
  }

  static defaultMetronomeMelody() {
    return new Melody(
      ['k', 'c', 'c', 'c', 'k', 'c', 'c', 'c'],
      [12, 12, 12, 12, 12, 12, 12, 12],
      [0, 12, 24, 36, 48, 60, 72, 84]
    );
  }

  static fromFlattenedNotes(
    notes,
    timeSignature,
    numMeasures,
    displayMelody = notes
  ) {
    let durations = [];
    let timeStamps = [];
    let timeScale =
      ((48 * numMeasures) / notes.length) *
      (timeSignature[0] / timeSignature[1]);

    let noteIndex = 0;

    for (let index in notes) {
      const note = notes[index];
      if (note == null) {
        durations.push(null);
        timeStamps.push(null);
        durations[noteIndex]++;
      } else {
        durations.push(1);
        noteIndex = index;
        timeStamps.push(index * timeScale);
      }
    }

    for (let index in notes) {
      const dur = durations[index];
      if (dur > 0) {
        durations[index] = timeScale * dur;
      }
    }

    return new Melody(notes, durations, timeStamps, displayMelody);
  }

  static updateMetronome(timeSignature, numMeasures) {
    const measureCounts = (4 * timeSignature[0]) / timeSignature[1];
    const beatsPerMeasure = Math.ceil(measureCounts);
    const totalBeats = beatsPerMeasure * numMeasures;
    const reciprocalDuration = (1 + measureCounts - beatsPerMeasure) * 12;
    const notes = [];
    const timestamps = [];
    const durations = [];

    for (let i = 0; i < totalBeats; i++) {
      const isFirstBeat = i % beatsPerMeasure === 0;
      const isLastBeat = (i + 1) % beatsPerMeasure === 0;
      notes.push(isFirstBeat ? 'k' : 'c');
      let nextTimeStamp = durations.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
      timestamps.push(nextTimeStamp);
      durations.push(isLastBeat ? reciprocalDuration : 12);
    }

    return new Melody(notes, durations, timestamps, notes);
  }
}

export default Melody;
