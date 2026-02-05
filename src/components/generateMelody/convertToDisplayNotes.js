const replacementsMap = {
  'A♯': { 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯', F: 'E♯', C: 'B♯', G: 'F𝄪', D: 'C𝄪', A: 'G𝄪', E: 'D𝄪' },
  'D♯': { 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯', F: 'E♯', C: 'B♯', G: 'F𝄪', D: 'C𝄪', A: 'G𝄪' },
  'G♯': { 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯', F: 'E♯', C: 'B♯', G: 'F𝄪', D: 'C𝄪' },
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
  'C♭': { 'C♯': 'D♭', 'F♯': 'G♭', B: 'C♭', E: 'F♭', A: 'B𝄫', D: 'E𝄫', G: 'A𝄫', C: 'D𝄫' },
};

const standardizeTonic = (anyTonic) => {
  if (!anyTonic) return 'C4';

  // 1. Normalize character encoding (# -> ♯, b -> ♭)
  let normalized = anyTonic.replace('#', '♯').replace('b', '♭');

  // 2. Perform enharmonic remapping to preferred variants
  const pitchMatch = normalized.match(/[A-G][♭♯]?/);
  const pitch = pitchMatch ? pitchMatch[0] : null;
  const octaveMatch = normalized.match(/\d+/);
  const octave = octaveMatch ? octaveMatch[0] : '4';

  if (!pitch) return normalized;

  let preferredPitch = pitch;
  switch (pitch) {
    case 'C♯': preferredPitch = 'D♭'; break;
    case 'D♯': preferredPitch = 'E♭'; break;
    case 'G♭': preferredPitch = 'F♯'; break;
    case 'G♯': preferredPitch = 'A♭'; break;
    case 'A♯': preferredPitch = 'B♭'; break;
    case 'C♭': preferredPitch = 'B'; break;
    case 'E♯': preferredPitch = 'F'; break;
    case 'B♯': preferredPitch = 'C'; break;
    default: break;
  }

  return preferredPitch + octave;
};

const getRelativeNoteName = (note, anyTonic) => {
  const noteWithoutOctave = note.replace(/[0-9]/g, '');
  let noteOctave = note.match(/[0-9]+/) ? parseInt(note.match(/[0-9]+/)[0]) : null;
  const preferredTonic = standardizeTonic(anyTonic).replace(/[0-9]/g, '');
  const replacements = replacementsMap[preferredTonic] || {};

  let replacedNote = replacements[noteWithoutOctave] || noteWithoutOctave;

  if (
    ['A♯', 'D♯', 'G♯', 'C♯', 'F♯'].includes(preferredTonic) &&
    noteWithoutOctave === 'C'
  ) {
    replacedNote = 'B♯';
    if (noteOctave !== null) {
      noteOctave -= 1;
    }
  }

  if (
    ['B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭'].includes(preferredTonic) &&
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
