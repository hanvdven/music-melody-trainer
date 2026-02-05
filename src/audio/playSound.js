
import generateAllNotesArray from '../utils/allNotesArray';

const allNotesArray = generateAllNotesArray();

const noteMapping = {
  cc: "cymbal/cy0010",
  hh: "hihat-close",
  ho: "hihat-open/oh10",
  cr: "cymbal/cy7575",
  th: "conga-hi",
  tm: "conga-mid",
  s: "snare/sd0010",
  tl: "conga-low",
  b: "mid-tom",
  cb: "cowbell",
  hp: "maraca",
  k: 100,
  c: 75,
};

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
const resolveNotePitch = (note) => {
  if (note === null || note === 'r') return null;

  // Check pitch lookup (Piano)
  const pitch = pitchLookup.get(note);
  if (pitch !== undefined) return pitch;

  // Check mapping (Percussion)
  if (note in noteMapping) return noteMapping[note];

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
  _volume = 1
) => {
  if (!instrument) return;

  const resolvedPitch = resolveNotePitch(note);
  if (resolvedPitch !== null) {
    instrument.start({
      note: resolvedPitch,
      time: time,
      duration: duration,
    });
  }
};

export { playSound, resolveNotePitch };
export default playSound;
