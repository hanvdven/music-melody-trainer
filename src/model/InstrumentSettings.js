import { PERCUSSION_PRESETS } from '../audio/drumKits.js';

class InstrumentSettings {
  /**
   * @param {string} instrument - Sound/instrument name (e.g. 'acoustic_grand_piano')
   * @param {string} type - Track type: 'treble' | 'bass' | 'percussion' | 'chords'
   * @param {number} notesPerMeasure - Target notes per measure
   * @param {number} smallestNoteDenom - Smallest note denomination (e.g. 4, 8, 16)
   * @param {number} rhythmVariability - 0–100 variability in rhythm generation
   * @param {string} notePool - Which notes to draw from: 'scale' | 'chord' | 'all' | 'metronome'
   * @param {string} randomizationRule - How to select notes: 'uniform' | 'emphasize_roots' | 'weighted' | 'arp' | 'arp_var' | 'arp_group' | 'fixed'. For arp_var/arp_group, maxLeap also controls the span window.
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
    notePool,
    randomizationRule = 'uniform',
    strategy = null,
    strummingEnabled = false,
    range = null,
    preferredClef = null,
    rangeMode = 'fixed',
    transpositionKey = 'C',
    maxLeap = null
  ) {
    this.instrument = instrument;
    this.type = type;
    this.notesPerMeasure = notesPerMeasure;
    this.smallestNoteDenom = smallestNoteDenom;
    this.rhythmVariability = rhythmVariability;
    this.notePool = notePool;
    this.randomizationRule = randomizationRule;
    this.strategy = strategy;
    this.strummingEnabled = strummingEnabled;
    this.range = range;
    this.preferredClef = preferredClef;
    this.rangeMode = rangeMode;
    this.transpositionKey = transpositionKey;
    // Max melodic leap between adjacent notes (semitones). null = unlimited.
    // For chord voicing (fullchord/pairedchord): max span between lowest and highest note.
    this.maxLeap = maxLeap;
    // Global polyrhythm multiplier applied to all tuplet probabilities.
    // 1 = normal (default); higher values make tuplets dramatically more frequent.
    // Set by the global Polyrhythm control in PlaybackSettings — same value on all instruments.
    this.polyMultiplier = 1;
    // Percussion only: the user's drum-pool selection — array of pad ids (e.g.
    // ['k','s','hh']) that are allowed to sound. Set via the in-staff range
    // selector. null = every pad allowed (back-compat). Distinct from notePool,
    // which selects the percussion STYLE. The generator post-filters output by
    // this list (see filterPercussionByEnabledPads). Defaulted for the
    // percussion instrument below.
    this.enabledPads = null;
  }

  static defaultTrebleInstrumentSettings() {
    return new InstrumentSettings(
      'acoustic_grand_piano', // instrument
      'treble',               // type
      2,                      // notesPerMeasure
      8,                      // smallestNoteDenom
      30,                     // rhythmVariability
      'scale',                // notePool
      'uniform',              // randomizationRule
      null,                   // strategy
      true,                   // strummingEnabled
      { min: 'C4', max: 'E5' }, // range
      'treble',               // preferredClef
      'STANDARD',             // rangeMode
      'C',                    // transpositionKey
      12                      // maxLeap — one octave default
    );
  }

  static defaultBassInstrumentSettings() {
    return new InstrumentSettings(
      'electric_bass_pick',   // instrument
      'bass',                 // type
      2,                      // notesPerMeasure
      2,                      // smallestNoteDenom — half-note resolution; generateRhythmicDNA clamps internally via Math.max(smallestNoteDenom, denominator)
      0,                      // rhythmVariability
      'chord',                // notePool
      'emphasize_roots',      // randomizationRule
      null,                   // strategy
      true,                   // strummingEnabled
      { min: 'A2', max: 'C4' }, // range
      'bass',                 // preferredClef
      'STANDARD',             // rangeMode
      'C',                    // transpositionKey
      12                      // maxLeap — one octave default
    );
  }

  static defaultPercussionInstrumentSettings() {
    const settings = new InstrumentSettings(
      'FreePats Percussion',        // instrument (default kit)
      'percussion',           // type
      4,                      // notesPerMeasure
      8,                      // smallestNoteDenom — 8th-note grid gives single-beam grouping in standard drum notation; 16th-note grid was producing double beams for all patterns
      50,                     // rhythmVariability
      'all',                  // notePool
      'uniform',              // randomizationRule
      null,                   // strategy
      false,                  // strummingEnabled
      null                    // range
    );
    // Default drum pool = STANDARD preset (kick, snare, hi-hat, crash, ride,
    // floor tom). Han 2026-05-30. Defined in drumKits.js so presets stay in one
    // place; imported lazily to avoid a model→audio import cycle.
    settings.enabledPads = [...PERCUSSION_PRESETS.STANDARD];
    return settings;
  }

  static defaultMetronomeInstrumentSettings() {
    return new InstrumentSettings(
      'woodblock',            // instrument
      'treble',               // type
      0,                      // notesPerMeasure (Calculated)
      0,                      // smallestNoteDenom (Calculated)
      0,                      // rhythmVariability
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
      'chord',                // notePool
      'uniform',              // randomizationRule
      'classical-1-4-5-1',    // strategy
      true,                   // strummingEnabled
      null                    // range
    );
    settings.chordCount = 2;
    // Array of enabled passing chord type keys. Empty array = no passing chords.
    // Possible values: 'secondary-dominant', 'secondary-dim', 'tritone-sub',
    //   'diatonic', 'sus4', 'subdominant-approach', 'borrowed-parallel'.
    settings.passingChordTypes = [];
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
