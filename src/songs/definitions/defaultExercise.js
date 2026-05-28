// Default Exercise — empty song that snapshots the app's default settings.
// Selecting it resets the active scale, time signature, measure count, BPM,
// and per-instrument settings to the same values a fresh app session would
// have. No melodies are stored; everything is freshly generated.
//
// Future "fixed songs, exercises, jazz standards" can follow the same schema:
// a `generator` block for the regen-time settings, plus optional pinned
// melodies under `difficulties[level]`.
//
// Implementation note: handleLoadSong shallow-merges each `*Settings` block
// onto the *current* instrument settings, so explicit fields here are needed
// to clear any pin/walking-bass state a previously-loaded song might have
// left behind. The values mirror the defaults in `InstrumentSettings.js`.

import {
  DEFAULT_BPM,
  DEFAULT_TIME_SIG,
  DEFAULT_NUM_MEASURES,
  DEFAULT_SCALE_MODE,
} from '../../constants/generatorDefaults.js';

export default {
  id: 'default-exercise',
  title: 'Default Exercise',
  subtitle: 'App defaults — generate freely',
  category: 'beginner',
  // Tonic without octave — loadSong adds the octave when setting the app scale.
  defaultTonic: 'C',
  numMeasures: DEFAULT_NUM_MEASURES,
  timeSignature: DEFAULT_TIME_SIG,
  defaultTempo: DEFAULT_BPM,

  // Explicit overrides so loading this song after a "pinned" song (e.g.
  // Happy Birthday with `randomizationRule: 'fixed'` on treble) properly
  // restores the default randomize-from-scratch behaviour.
  generator: {
    scaleFamily: 'Diatonic',
    scaleMode: DEFAULT_SCALE_MODE,
    trebleSettings: { randomizationRule: 'uniform' },
    bassSettings: { randomizationRule: 'emphasize_roots', notePool: 'chord' },
    percussionSettings: { randomizationRule: 'uniform' },
    chordSettings: { strategy: 'classical-1-4-5-1', chordCount: 2, passingChordTypes: [] },
  },

  difficulties: {
    easy: {
      treble: null,
      chords: null,
      bass: null,
      percussion: null,
    },
  },
};
