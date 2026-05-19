const scaleAccidentalNotes = {
  '-14': ['F𝄫', 'C𝄫', 'G𝄫', 'D𝄫', 'A𝄫', 'E𝄫', 'B𝄫'],
  '-13': ['F♭', 'C𝄫', 'G𝄫', 'D𝄫', 'A𝄫', 'E𝄫', 'B𝄫'],
  '-12': ['F♭', 'C♭', 'G𝄫', 'D𝄫', 'A𝄫', 'E𝄫', 'B𝄫'],
  '-11': ['F♭', 'C♭', 'G♭', 'D𝄫', 'A𝄫', 'E𝄫', 'B𝄫'],
  '-10': ['F♭', 'C♭', 'G♭', 'D♭', 'A𝄫', 'E𝄫', 'B𝄫'],
  '-9': ['F♭', 'C♭', 'G♭', 'D♭', 'A♭', 'E𝄫', 'B𝄫'],
  '-8': ['F♭', 'C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B𝄫'],
  '-7': ['F♭', 'C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭'],
  '-6': ['F', 'C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭'],
  '-5': ['F', 'C', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭'],
  '-4': ['F', 'C', 'G', 'D♭', 'A♭', 'E♭', 'B♭'],
  '-3': ['F', 'C', 'G', 'D', 'A♭', 'E♭', 'B♭'],
  '-2': ['F', 'C', 'G', 'D', 'A', 'E♭', 'B♭'],
  '-1': ['F', 'C', 'G', 'D', 'A', 'E', 'B♭'],
  0: ['C', 'G', 'D', 'A', 'E', 'B', 'F'],
  1: ['C', 'G', 'D', 'A', 'E', 'B', 'F♯'],
  2: ['G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'],
  3: ['D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯'],
  4: ['A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯'],
  5: ['E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯'],
  6: ['B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯'],
  7: ['F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯', 'B♯'],
  8: ['F𝄪', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯', 'B♯'],
  9: ['F𝄪', 'C𝄪', 'G♯', 'D♯', 'A♯', 'E♯', 'B♯'],
  10: ['F𝄪', 'C𝄪', 'G𝄪', 'D♯', 'A♯', 'E♯', 'B♯'],
  11: ['F𝄪', 'C𝄪', 'G𝄪', 'D𝄪', 'A♯', 'E♯', 'B♯'],
  12: ['F𝄪', 'C𝄪', 'G𝄪', 'D𝄪', 'A𝄪', 'E♯', 'B♯'],
  13: ['F𝄪', 'C𝄪', 'G𝄪', 'D𝄪', 'A𝄪', 'E𝄪', 'B♯'],
  14: ['F𝄪', 'C𝄪', 'G𝄪', 'D𝄪', 'A𝄪', 'E𝄪', 'B𝄪'],
};

const computeAccidental = (n, scaleAccidentals) => {
  if (!n) return null;
  const note = n.replace(/[0-9]/g, '');
  if (note.includes('♯♯') || note.includes('𝄪')) return scaleAccidentals.includes(note) ? null : 'Ü';
  if (note.includes('♭♭') || note.includes('𝄫')) return scaleAccidentals.includes(note) ? null : 'º';
  if (note.includes('♯'))                          return scaleAccidentals.includes(note) ? null : '#';
  if (note.includes('♭'))                          return scaleAccidentals.includes(note) ? null : 'b';
  return scaleAccidentals.includes(note) ? null : 'n';
};

// The accidental character the note itself carries, regardless of key signature.
// Used to determine what symbol to show when reverting to a key-sig pitch.
const noteOwnAccidental = (noteStr) => {
  const note = noteStr.replace(/[0-9]/g, '');
  if (note.includes('𝄪') || note.includes('♯♯')) return 'Ü';
  if (note.includes('𝄫') || note.includes('♭♭')) return 'º';
  if (note.includes('♯')) return '#';
  if (note.includes('♭')) return 'b';
  return 'n';
};

// Maestro font characters for small courtesy accidentals.
const SMALL_COURTESY = {
  '#': '[',   // small courtesy sharp   (Maestro: [)
  'b': '{',   // small courtesy flat    (Maestro: SHIFT+[)
  'n': 'N',   // courtesy natural       (Maestro: SHIFT+n)
  'Ü': ']',   // small courtesy double-sharp
  'º': 'Î',   // small courtesy double-flat (Maestro: SHIFT+i on some fonts; approximate)
};

// Characters that represent a chromatic modification (as opposed to naturals/reminders).
const CHROMATIC = new Set(['#', 'b', 'Ü', 'º']);

// Sentinel stored in seenInMeasure after a revert symbol is shown for a base letter.
// Signals "this note has returned to its key-sig pitch; don't show a second reminder".
const REVERTED = Symbol('REVERTED');

// Apply within-measure and cross-measure accidental state for one note.
// seenInMeasure  — current measure: (letter+octave) → last-set state (string or REVERTED)
// prevMeasure    — snapshot of previous measure's seenInMeasure at barline
// showCourtesy   — when false, repeats are suppressed (null) and no cross-measure reminders
// Mutates seenInMeasure; returns the display character (or null).
const applyMeasureState = (noteStr, raw, seenInMeasure, prevMeasure, showCourtesy) => {
  // Track by letter+octave (e.g. 'F4') so F♯4 and F♯5 are independent — standard notation.
  const base = noteStr.replace(/[^A-G0-9]/g, '') || null;
  if (!base) return raw;

  const prev  = seenInMeasure.get(base);                  // undefined when not yet seen
  const prevM = prevMeasure?.get(base);
  // Cross-measure reminder is owed only when previous measure ended on a chromatic accidental.
  const crossDue = prevM !== undefined && CHROMATIC.has(prevM);

  if (raw !== null) {
    // ── Note requires an accidental ────────────────────────────────────────────
    if (prev === undefined) {
      seenInMeasure.set(base, raw);
      if (showCourtesy && crossDue && prevM === raw) {
        // Same chromatic continues from previous measure → small courtesy.
        return SMALL_COURTESY[raw] ?? raw;
      }
      return raw;
    }
    if (prev === raw) {
      // Repeated same accidental within measure.
      return showCourtesy ? (SMALL_COURTESY[raw] ?? raw) : null;
    }
    seenInMeasure.set(base, raw);
    return raw; // changed accidental → always show full new symbol
  }

  // ── Note is at its key-signature pitch (raw === null) ───────────────────────
  const revert = noteOwnAccidental(noteStr); // symbol that represents this note's pitch

  if (prev === undefined) {
    if (showCourtesy && crossDue) {
      // Previous measure had a chromatic alteration; remind player of key-sig pitch.
      seenInMeasure.set(base, REVERTED);
      return SMALL_COURTESY[revert] ?? revert;
    }
    return null; // no prior modification to remind about (or courtesy disabled)
  }

  if (prev === REVERTED || !CHROMATIC.has(prev)) {
    // Revert already shown this measure, or note is in a passive state → nothing.
    return null;
  }

  // Within-measure revert: active chromatic accidental → key-sig pitch.
  // Always shown regardless of courtesy setting — it's required, not optional.
  seenInMeasure.set(base, REVERTED);
  return revert;
};

// offsets and measureLengthSlots are optional. When provided, reverts get the correct
// accidental and within-measure repeats are tracked. showCourtesy (default true) controls
// whether small courtesy symbols and cross-measure reminders are shown; when false, repeats
// are suppressed and cross-measure reminders omitted. Without offsets/measureLengthSlots
// the function behaves identically to the original (backward-compatible).
const generateAccidentalMap = (melody, numAccidentals, offsets = null, measureLengthSlots = null, showCourtesy = true) => {
  const accidentals = [];
  const scaleAccidentals = scaleAccidentalNotes[numAccidentals] || [];

  const useTracking = offsets !== null && measureLengthSlots !== null && measureLengthSlots > 0;
  const seenInMeasure = new Map();
  let prevMeasure = new Map(); // snapshot at last barline
  let currentMeasure = -1;

  for (let i = 0; i < melody.length; i++) {
    const noteWithAcc = melody[i];

    if (useTracking) {
      const measure = Math.floor((offsets[i] ?? 0) / measureLengthSlots);
      if (measure !== currentMeasure) {
        prevMeasure = new Map(seenInMeasure); // snapshot before clearing
        seenInMeasure.clear();
        currentMeasure = measure;
      }
    }

    if (Array.isArray(noteWithAcc)) {
      // Per-note accidentals for melodic chord arrays.
      accidentals.push(noteWithAcc.map(n => {
        const raw = computeAccidental(n, scaleAccidentals);
        return useTracking ? applyMeasureState(n, raw, seenInMeasure, prevMeasure, showCourtesy) : raw;
      }));
      continue;
    }

    if (!noteWithAcc || noteWithAcc === 'r') {
      accidentals.push(null);
      continue;
    }

    const raw = computeAccidental(noteWithAcc, scaleAccidentals);
    accidentals.push(useTracking ? applyMeasureState(noteWithAcc, raw, seenInMeasure, prevMeasure, showCourtesy) : raw);
  }

  return accidentals;
};

export { generateAccidentalMap };
