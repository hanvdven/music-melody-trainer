//allNotesArray.js

const generateAllNotesArray = () => {
  const notes = [];
  const noteNames = ['C', 'C♯', 'D', 'E♭', 'E', 'F','F♯', 'G', 'A♭','A', 'B♭', 'B'];
  const octaves = Array.from({ length: 9 }, (_, i) => i); // Octaves 0 to 8

  octaves.forEach(octave => {
    noteNames.forEach(note => {
      if ( (note !== 'A' && note !== 'B♭' && note !== 'B' ) && octave === 0) {
        // skip C0 - G0
      } else if ( (note !== 'C') && octave === 8) {
        // stop at C8
      } else {
        notes.push(`${note}${octave}`);
      }
    });
  });

  return notes;
};

export default generateAllNotesArray;
