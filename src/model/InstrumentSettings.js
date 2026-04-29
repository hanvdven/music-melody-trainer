class InstrumentSettings {
  /**
   * @param {string} instrument - Sound/instrument name (e.g. 'acoustic_grand_piano')
   * @param {string} type - Track type: 'treble' | 'bass' | 'percussion' | 'chords'
   * @param {number} notesPerMeasure - Target notes per measure
   * @param {number} smallestNoteDenom - Smallest note denomination (e.g. 4, 8, 16)
   * @param {number} rhythmVariability - 0–100 variability in rhythm generation
   * @param {boolean} enableTriplets - Whether triplets are allowed
   * @param {string} notePool - Which notes to draw from: 'scale' | 'chord' | 'all' | 'metronome'
   * @param {string} randomizationRule - How to select notes: 'uniform' | 'emphasize_roots' | 'weighted' | 'arp' | 'fixed'
   * @param {string} strategy - Chord/progression strategy (for chord track): 'pop-1-5-6-4' | 'modal-random' | etc.
   * @param {string} transpositionKey - Instrument transposition key: 'C' (concert, default), 'Bb', 'F', 'Eb', etc.
   *   Affects display only — audio always plays concert pitch. See src/constants/transposingInstruments.js.
   */
  constructor(
    instrument,
    type,
    notesPerMeasure,
    smallestNoteDenom,
    rhythmVariability,
    enableTriplets,
    notePool,
    randomizationRule = 'uniform',
    strategy = null,
    strummingEnabled = false,
    range = null,
    preferredClef = null,
    rangeMode = 'fixed',
    transpositionKey = 'C'
  ) {
    this.instrument = instrument;
    this.type = type;
    this.notesPerMeasure = notesPerMeasure;
    this.smallestNoteDenom = smallestNoteDenom;
    this.rhythmVariability = rhythmVariability;
    this.enableTriplets = enableTriplets;
    this.notePool = notePool;
    this.randomizationRule = randomizationRule;
    this.strategy = strategy;
    this.strummingEnabled = strummingEnabled;
    this.range = range;
    this.preferredClef = preferredClef;
    this.rangeMode = rangeMode;
    this.transpositionKey = transpositionKey;
  }

  static defaultTrebleInstrumentSettings() {
    return new InstrumentSettings(
      'acoustic_grand_piano', // instrument
      'treble',               // type
      2,                      // notesPerMeasure
      8,                      // smallestNoteDenom
      30,                     // rhythmVariability
      false,                  // enableTriplets
      'scale',                // notePool
      'uniform',              // randomizationRule
      null,                   // strategy
      true,                   // strummingEnabled
      { min: 'C4', max: 'E5' }, // range
      'treble',               // preferredClef
      'STANDARD'              // rangeMode
    );
  }

  static defaultBassInstrumentSettings() {
    return new InstrumentSettings(
      'electric_bass_pick',   // instrument
      'bass',                 // type
      2,                      // notesPerMeasure
      2,                      // smallestNoteDenom
      0,                      // rhythmVariability
      false,                  // enableTriplets
      'chord',                // notePool
      'emphasize_roots',      // randomizationRule
      null,                   // strategy
      true,                   // strummingEnabled
      { min: 'A2', max: 'C4' }, // range
      'bass',                 // preferredClef
      'STANDARD'              // rangeMode
    );
  }

  static defaultPercussionInstrumentSettings() {
    return new InstrumentSettings(
      'FreePats Percussion',        // instrument (default kit)
      'percussion',           // type
      4,                      // notesPerMeasure
      16,                     // smallestNoteDenom
      50,                     // rhythmVariability
      false,                  // enableTriplets
      'all',                  // notePool
      'uniform',              // randomizationRule
      null,                   // strategy
      false,                  // strummingEnabled
      null                    // range
    );
  }

  static defaultMetronomeInstrumentSettings() {
    return new InstrumentSettings(
      'woodblock',            // instrument
      'treble',               // type
      0,                      // notesPerMeasure (Calculated)
      0,                      // smallestNoteDenom (Calculated)
      0,                      // rhythmVariability
      false,                  // enableTriplets
      'metronome',            // notePool
      'uniform',              // randomizationRule
      null,                   // strategy
      false,                  // strummingEnabled
      null                    // range
    );
  }

  static defaultChordInstrumentSettings() {
    const settings = new InstrumentSettings(
      'acoustic_guitar_nylon',// instrument
      'chords',               // type
      2,                      // notesPerMeasure (half notes)
      1,                      // smallestNoteDenom
      0,                      // rhythmVariability
      false,                  // enableTriplets
      'chord',                // notePool
      'uniform',              // randomizationRule
      'classical-1-4-5-1',    // strategy
      true,                   // strummingEnabled
      null                    // range
    );
    settings.chordCount = 2;
    // 'none' | 'secondary-dominant' | 'all'
    settings.passingChords = 'none';
    return settings;
  }
  static defaultFullChordSettings(clef = 'treble') {
    const range = clef === 'bass'
      ? { min: 'A1', max: 'C4' }
      : { min: 'C4', max: 'C6' };
    return new InstrumentSettings(
      clef === 'bass' ? 'electric_bass_pick' : 'acoustic_grand_piano',
      'fullchord',        // type — triggers early-exit in MelodyGenerator
      1,                  // notesPerMeasure (ignored in fullchord branch)
      1,                  // smallestNoteDenom (ignored)
      0,                  // rhythmVariability
      false,              // enableTriplets
      'chord',            // notePool (ignored)
      'uniform',          // randomizationRule (ignored)
      null,               // strategy
      false,              // strummingEnabled
      range,              // range — filters chord notes to register
      clef,               // preferredClef
      'STANDARD'
    );
  }
}

export default InstrumentSettings;
