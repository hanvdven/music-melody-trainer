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

// Maestro font characters for small courtesy accidentals (shown when the same
// accidental repeats within a measure to avoid redundant full symbols).
const SMALL_COURTESY = {
  '#': '[',   // small courtesy sharp   (Maestro: [)
  'b': '{',   // small courtesy flat    (Maestro: SHIFT+[)
  'n': 'N',   // courtesy natural       (Maestro: SHIFT+n)
  'Ü': ']',   // small courtesy double-sharp
  'º': 'º',   // no distinct small double-flat in Maestro; keep full symbol
};

// Apply within-measure accidental state for one note.
// seenInMeasure maps base pitch letter (A–G) → last shown accidental character.
// Mutates seenInMeasure in place; returns the character to display (or null).
const applyMeasureState = (noteStr, raw, seenInMeasure) => {
  const base = noteStr.match(/[A-G]/)?.[0];
  if (!base) return raw; // unparseable (shouldn't happen for melodic notes)

  const prev = seenInMeasure.get(base); // undefined = not seen this measure

  if (raw !== null) {
    if (prev === undefined) {
      // First time this letter gets an accidental this measure.
      seenInMeasure.set(base, raw);
      return raw;
    }
    if (prev === raw) {
      // Same accidental already shown → small courtesy reminder.
      return SMALL_COURTESY[raw] ?? raw;
    }
    // Different accidental (e.g. shown ♯ now needs ♭) → show full new one.
    seenInMeasure.set(base, raw);
    return raw;
  }

  // raw === null: note is natural.
  if (prev === undefined || prev === 'n') {
    // No prior accidental shown for this letter, or natural was already shown as
    // a reminder — nothing more to add.
    return null;
  }
  // An accidental was shown earlier this measure; show a natural reminder.
  seenInMeasure.set(base, 'n');
  return 'n';
};

// offsets and measureLengthSlots are optional. When provided, repeated accidentals
// within the same measure are replaced with small courtesy symbols and a natural
// reminder is shown when a previously-accidentalled note reverts to natural.
// Without them the function behaves identically to the original version.
const generateAccidentalMap = (melody, numAccidentals, offsets = null, measureLengthSlots = null) => {
  const accidentals = [];
  const scaleAccidentals = scaleAccidentalNotes[numAccidentals] || [];

  const useTracking = offsets !== null && measureLengthSlots !== null && measureLengthSlots > 0;
  const seenInMeasure = new Map(); // base letter → last shown accidental char
  let currentMeasure = -1;

  for (let i = 0; i < melody.length; i++) {
    const noteWithAcc = melody[i];

    if (useTracking) {
      const measure = Math.floor((offsets[i] ?? 0) / measureLengthSlots);
      if (measure !== currentMeasure) {
        seenInMeasure.clear();
        currentMeasure = measure;
      }
    }

    if (Array.isArray(noteWithAcc)) {
      // Per-note accidentals for melodic chord arrays.
      accidentals.push(noteWithAcc.map(n => {
        const raw = computeAccidental(n, scaleAccidentals);
        return useTracking ? applyMeasureState(n, raw, seenInMeasure) : raw;
      }));
      continue;
    }

    if (!noteWithAcc || noteWithAcc === 'r') {
      accidentals.push(null);
      continue;
    }

    const raw = computeAccidental(noteWithAcc, scaleAccidentals);
    accidentals.push(useTracking ? applyMeasureState(noteWithAcc, raw, seenInMeasure) : raw);
  }

  return accidentals;
};

export { generateAccidentalMap };
