const replacementsMap = {
  'A♯': { 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯', F: 'E♯', C: 'B♯', G: 'F𝄪', D :'C𝄪' , A :'G𝄪' , E :'D𝄪'  },
  'D♯': { 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯', F: 'E♯', C: 'B♯', G: 'F𝄪', D :'C𝄪' , A :'G𝄪' },
  'G♯': { 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯', F: 'E♯', C: 'B♯', G: 'F𝄪', D :'C𝄪' },
  'C♯': { 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯', F: 'E♯', C: 'B♯', G: 'F𝄪' },
  'F♯': { 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯', F: 'E♯', C: 'B♯' },
  B: { 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯', F: 'E♯' },
  E: { 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯' },
  A: { 'A♭': 'G♯', 'E♭': 'D♯' },
  D: { 'A♭': 'G♯' },
  G: {},
  C: { 'C♯': 'D♭' },
  F: { 'C♯': 'D♭', 'F♯': 'G♭' },
  'B♭': { 'C♯': 'D♭', 'F♯': 'G♭', B: 'C♭' },
  'E♭': { 'C♯': 'D♭', 'F♯': 'G♭', B: 'C♭', E: 'F♭' },
  'A♭': { 'C♯': 'D♭', 'F♯': 'G♭', B: 'C♭', E: 'F♭', A: 'B𝄫' },
  'D♭': { 'C♯': 'D♭', 'F♯': 'G♭', B: 'C♭', E: 'F♭', A: 'B𝄫', D: 'E𝄫' },
  'G♭': { 'C♯': 'D♭', 'F♯': 'G♭', B: 'C♭', E: 'F♭', A: 'B𝄫', D: 'E𝄫', G: 'A𝄫' },
  'C♭': { 'C♯': 'D♭', 'F♯': 'G♭', B: 'C♭', E: 'F♭', A: 'B𝄫', D: 'E𝄫', G: 'A𝄫', C: 'D𝄫'},
};

const standardizeTonic = (anyTonic) => {
  const mapEnharmonicEquivalent = (note) => {
    switch (note) {
      case 'D♭':
        return 'C♯';
      case 'G♭':
        return 'F♯';
      case 'C♭':
        return 'B';
      default:
        return note;
    }
  };

  const parsedTonic = anyTonic.replace(/[0-9]/g, '');
  const tonic = mapEnharmonicEquivalent(parsedTonic) + anyTonic.match(/[0-9]+/);

  return tonic;
};

const getRelativeNoteName = (note, anyTonic) => {
  const noteWithoutOctave = note.replace(/[0-9]/g, '');
  let noteOctave = note.match(/[0-9]+/) ? parseInt(note.match(/[0-9]+/)[0]) : null;
  const replacements = replacementsMap[anyTonic.replace(/[0-9]/g, '')] || {};
  
  let replacedNote = replacements[noteWithoutOctave] || noteWithoutOctave;

  if (
    ['A♯', 'D♯', 'G♯', 'C♯', 'F♯'].includes(anyTonic.replace(/[0-9]/g, '')) &&
    noteWithoutOctave === 'C'
  ) {
    replacedNote = 'B♯';
    if (noteOctave !== null) {
      noteOctave -= 1;
    }
  }

  if (
    ['B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭'].includes(anyTonic.replace(/[0-9]/g, '')) &&
    noteWithoutOctave === 'B'
  ) {
    replacedNote = 'C♭';
    if (noteOctave !== null) {
      noteOctave += 1;
    }
  }

  return replacedNote + (noteOctave !== null ? noteOctave.toString() : '');
};


export { replacementsMap, standardizeTonic, getRelativeNoteName };
