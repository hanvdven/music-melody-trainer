import generateAllNotesArray from '../theory/allNotesArray';
import { DEFAULT_NOTE_MAPPING } from './drumKits';

const allNotesArray = generateAllNotesArray();

// ['clap/cp', 'clave/cl', 'conga-hi/hc00', 'conga-hi/hc10', 'conga-hi/hc25', 'conga-hi/hc50', 'conga-hi/hc75', 'conga-low/lc00', 'conga-low/lc10', 'conga-low/lc25', 'conga-low/lc50', 'conga-low/lc75', 'conga-mid/mc00', 'conga-mid/mc10', 'conga-mid/mc25', 'conga-mid/mc50', 'conga-mid/mc75', 'cowbell/cb', 'cymbal/cy0000', 'cymbal/cy0010', 'cymbal/cy0025', 'cymbal/cy0050', 'cymbal/cy0075', 'cymbal/cy1000', 'cymbal/cy1010', 'cymbal/cy1025', 'cymbal/cy1050', 'cymbal/cy1075', 'cymbal/cy2500', 'cymbal/cy2510', 'cymbal/cy2525', 'cymbal/cy2550', 'cymbal/cy2575', 'cymbal/cy5000', 'cymbal/cy5010', 'cymbal/cy5025', 'cymbal/cy5050', 'cymbal/cy5075', 'cymbal/cy7500', 'cymbal/cy7510', 'cymbal/cy7525', 'cymbal/cy7550', 'cymbal/cy7575', 'hihat-close/ch', 'hihat-open/oh00', 'hihat-open/oh10', 'hihat-open/oh25', 'hihat-open/oh50', 'hihat-open/oh75', 'kick/bd0000', 'kick/bd0010', 'kick/bd0025', 'kick/bd0050', 'kick/bd0075', 'kick/bd1000', 'kick/bd1010', 'kick/bd1025', 'kick/bd1050', 'kick/bd1075', 'kick/bd2500', 'kick/bd2510', 'kick/bd2525', 'kick/bd2550', 'kick/bd2575', 'kick/bd5000', 'kick/bd5010', 'kick/bd5025', 'kick/bd5050', 'kick/bd5075', 'kick/bd7500', 'kick/bd7510', 'kick/bd7525', 'kick/bd7550', 'kick/bd7575', 'maraca/ma', 'mid-tom/mt00', 'mid-tom/mt10', 'mid-tom/mt25', 'mid-tom/mt50', 'mid-tom/mt75', 'rimshot/rs', 'snare/sd0000', 'snare/sd0010', 'snare/sd0025', 'snare/sd0050', 'snare/sd0075', 'snare/sd1000', 'snare/sd1010', 'snare/sd1025', 'snare/sd1050', 'snare/sd1075', 'snare/sd2500', 'snare/sd2510', 'snare/sd2525', 'snare/sd2550', 'snare/sd2575', 'snare/sd5000', 'snare/sd5010', 'snare/sd5025', 'snare/sd5050', …]


// Create a lookup map for faster pitch resolution
const pitchLookup = new Map();
allNotesArray.forEach((note, index) => {
  pitchLookup.set(note, index + 21);
});

/**
 * Resolves a note name (e.g., 'C4', 's') to its smplr-compatible pitch value.
 * @param {string} note
 * @returns {number|string|null}
 */
const resolveNotePitch = (note, customMapping = null) => {
  if (note == null || note === 'r') return null;

  // Check custom mapping first
  if (customMapping && note in customMapping) {
    const val = customMapping[note];
    return Array.isArray(val) ? val[Math.floor(Math.random() * val.length)] : val;
  }

  // Check default mapping (Percussion)
  if (note in DEFAULT_NOTE_MAPPING) {
    const val = DEFAULT_NOTE_MAPPING[note];
    return Array.isArray(val) ? val[Math.floor(Math.random() * val.length)] : val;
  }

  // Piano Note Normalization
  // Handles variations like B𝄫4, C##4, etc.
  let normalizedNote = note;
  const match = note.match(/^([A-G])([♭º♯Ü#b𝄫𝄪]*)([0-9])$/);

  if (match) {
    const [_, letter, accidentals, octave] = match;
    const baseSemitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let semitone = baseSemitones[letter] + parseInt(octave) * 12;

    // Apply accidental offsets character by character
    for (const char of accidentals) {
      if (char === '♯' || char === '#') semitone += 1;
      else if (char === '♭' || char === 'b') semitone -= 1;
      else if (char === '𝄪' || char === 'Ü') semitone += 2;
      else if (char === '𝄫' || char === 'º') semitone -= 2;
    }

    // Map back to a note in allNotesArray
    // allNotesArray contains: C, D♭, D, E♭, E, F, F♯, G, A♭, A, B♭, B
    const octaveAdjusted = Math.floor(semitone / 12);
    const noteInOctave = (semitone % 12 + 12) % 12; // Handle negative semitones correctly
    const noteNames = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
    normalizedNote = `${noteNames[noteInOctave]}${octaveAdjusted}`;
  }

  // Check pitch lookup (Piano)
  const pitch = pitchLookup.get(normalizedNote);
  if (pitch !== undefined) return pitch;

  return null;
};

/**
 * Highly optimized, synchronous playSound function.
 * Avoids repeated lookups and async overhead during critical playback.
 */
const playSound = (
  note,
  instrument,
  context,
  time = context.currentTime,
  duration = 0.25,
  _volume = 1,
  customMapping = null
) => {
  if (!instrument) return;

  const resolvedPitch = resolveNotePitch(note, customMapping);
  if (resolvedPitch !== null) {
    const startOpts = {
      note: resolvedPitch,
      time: time,
      duration: duration,
    };
    if (_volume !== undefined) {
      // Use both velocity (0-127) and gain (0-1) for maximum compatibility with smplr
      startOpts.velocity = Math.floor(_volume * 127);
      startOpts.gain = _volume;
    }
    return instrument.start(startOpts);
  }
  return null;
};

export { playSound, resolveNotePitch };
export default playSound;
