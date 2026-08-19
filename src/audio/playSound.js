import generateAllNotesArray from '../theory/allNotesArray';
import { DEFAULT_NOTE_MAPPING, humanizePercussionSample } from './drumKits';

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
 * Like `resolveNotePitch`, but for percussion pads whose mapping is an ARRAY of sample variants:
 * applies velocity-window "humanization" (`drumKits.js` `humanizePercussionSample`) instead of a flat
 * uniform-random pick, and returns a compensating gain multiplier alongside the resolved pitch.
 *
 * #1091 round 3 (Han: "add 'humanization'... for percussion specifically"). Falls back to plain
 * `resolveNotePitch` (gainMultiplier 1) for every other case — non-array mappings, melodic piano
 * notes, or when no target velocity is available — so this is a safe drop-in wherever `resolveNotePitch`
 * was called for a note that MIGHT be a percussion pad (playMelodies.js, `playSound` below), not a
 * second parallel pitch-resolution system (CLAUDE.md §6c). Deliberately does NOT change
 * `resolveNotePitch`'s own signature/return shape — that function has several unrelated melodic-only
 * callers (PianoView.jsx, ChordGrid.jsx, App.jsx, useDebugMetronome.js) that never need humanization
 * and shouldn't have to change to accommodate it.
 * @returns {{ pitch: number|string|null, gainMultiplier: number }}
 */
const resolvePercussionPitch = (note, customMapping = null, velocity = null) => {
  if (note == null || note === 'r') return { pitch: null, gainMultiplier: 1 };
  const mapped = (customMapping && note in customMapping) ? customMapping[note]
    : (note in DEFAULT_NOTE_MAPPING) ? DEFAULT_NOTE_MAPPING[note] : undefined;
  if (Array.isArray(mapped)) {
    const { sample, gainMultiplier } = humanizePercussionSample(mapped, velocity);
    return { pitch: sample, gainMultiplier };
  }
  return { pitch: resolveNotePitch(note, customMapping), gainMultiplier: 1 };
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
  customMapping = null,
  // #1091 (Han: "playSound heeft dan nu twee variabelen: velocity en volume"): a new, independent
  // per-note MIDI velocity accent (0-127, default 100 = smplr's own neutral default) — see
  // Melody.js's `velocities` doc comment for the full rationale. Appended as a trailing optional
  // param so every existing call site (positional, none pass a 8th arg) is unaffected.
  velocity = 100
) => {
  if (!instrument) return;

  // #1091 round 3: the combined gain (volume x velocity accent) doubles as the TARGET velocity fed
  // into percussion sample-selection humanization below, same "one number drives both gain and
  // smplr velocity" convention playMelodies.js already uses.
  const combinedGain = _volume !== undefined ? _volume * (velocity / 100) : undefined;
  const targetVelocity = combinedGain !== undefined ? Math.floor(combinedGain * 127) : null;
  const { pitch: resolvedPitch, gainMultiplier } = resolvePercussionPitch(note, customMapping, targetVelocity);
  if (resolvedPitch !== null) {
    const startOpts = {
      note: resolvedPitch,
      time: time,
      duration: duration,
    };
    if (combinedGain !== undefined) {
      startOpts.velocity = Math.floor(combinedGain * gainMultiplier * 127);
    }
    return instrument.start(startOpts);
  }
  return null;
};

export { playSound, resolveNotePitch, resolvePercussionPitch };
export default playSound;
