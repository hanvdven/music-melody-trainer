import generateAllNotesArray from '../theory/allNotesArray';
import { DEFAULT_NOTE_MAPPING } from './drumKits';

const allNotesArray = generateAllNotesArray();



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
  const match = note.match(/^([A-G])([♭º♯Ü#b𝄫𝄪]*)([0-9])$/u);

  if (match) {
    const [, letter, accidentals, octave] = match;
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
