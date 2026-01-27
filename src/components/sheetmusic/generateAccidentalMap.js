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


const generateAccidentalMap = (melody, numAccidentals) => {
  const accidentals = [];
  const scaleAccidentals = scaleAccidentalNotes[numAccidentals] || [];
  for (let i = 0; i < melody.length; i++) {
    if (melody[i]) {
      const note = melody[i].replace(/[0-9]/g, '');
      if (note && 
        (note.includes('♯♯') || note.includes('𝄪')) &&
        !scaleAccidentals.includes(note)) {
        accidentals.push('Ü');
      } else if (
        note &&
        (note.includes('♭♭') || note.includes('𝄫')) &&
        !scaleAccidentals.includes(note)
      ) {
        accidentals.push('º');
      } else if (
        note &&
        note.includes('♯') &&
        !scaleAccidentals.includes(note)
      ) {
        accidentals.push('#');
      } else if (
        note &&
        note.includes('♭') &&
        !scaleAccidentals.includes(note)
      ) {
        accidentals.push('b');
      } else if (note && !scaleAccidentals.includes(note)) {
        accidentals.push('n');
      } else {
        accidentals.push(null);
      }
    } else {
      accidentals.push(null);
    }
  }
  return accidentals;
};

export { generateAccidentalMap };
