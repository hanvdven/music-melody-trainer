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

const generateAccidentalMap = (melody, numAccidentals) => {
  const accidentals = [];
  const scaleAccidentals = scaleAccidentalNotes[numAccidentals] || [];
  for (let i = 0; i < melody.length; i++) {
    if (Array.isArray(melody[i])) {
      // For melodic chord arrays: per-note accidentals (percussion rendering ignores this array)
      accidentals.push(melody[i].map(n => computeAccidental(n, scaleAccidentals)));
      continue;
    }
    accidentals.push(melody[i] ? computeAccidental(melody[i], scaleAccidentals) : null);
  }
  return accidentals;
};

export { generateAccidentalMap };
