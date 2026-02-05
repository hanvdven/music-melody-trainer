class InstrumentSettings {
  constructor(
    instrument,
    type,
    notesPerMeasure,
    smallestNoteDenom,
    rhythmVariability,
    enableTriplets,
    randomizationRules
  ) {
    (this.instrument = instrument),
      (this.type = type),
      (this.notesPerMeasure = notesPerMeasure),
      (this.smallestNoteDenom = smallestNoteDenom),
      (this.rhythmVariability = rhythmVariability),
      (this.enableTriplets = enableTriplets),
      (this.randomizationRules = randomizationRules);
  }

  static defaultTrebleInstrumentSettings() {
    return new InstrumentSettings(
      'acoustic_grand_piano', // instrument
      'treble', // type
      2, // notesPerMeasure
      4, // smallestNoteDenom
      30, // rhythmVariability
      false, // enableTriplets
      'uniform' // randomizationRules
    );
  }

  static defaultBassInstrumentSettings() {
    return new InstrumentSettings(
      'electric_bass_pick', // instrument
      'bass', // type
      2, // notesPerMeasure
      2, // smallestNoteDenom
      0, // rhythmVariability
      false, // enableTriplets
      'tonicOnOnes' // randomizationRules
    );
  }

  static defaultPercussionInstrumentSettings() {
    return new InstrumentSettings(
      'TR-808', // instrument
      'percussion', // type
      // NOTE TO SELF: ADD THE LM-2!!!
      4, // notesPerMeasure
      8, // smallestNoteDenom
      30, // rhythmVariability
      false, // enableTriplets
      'percussion' // randomizationRules
    );
  }

  static defaultMetronomeInstrumentSettings() {
    return new InstrumentSettings(
      'woodblock', // instrument
      'percussion', // type
      4, // notesPerMeasure
      4, // smallestNote
      0, // rhythmVariability
      false, // enableTriplets
      'metronome' // randomizationRules
    );
  }
}

export default InstrumentSettings;
