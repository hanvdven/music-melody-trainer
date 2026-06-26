import { describe, it, expect } from 'vitest';
import { insertPassingChords } from '../passingChords';

describe('passingChords', () => {
  it('inserts passing chords without crashing', () => {
    const chordMelody = {
      notes: [
        ['C4', 'E4', 'G4'],  // I chord
        null,
        ['G4', 'B4', 'D5'],  // V chord
        null,
      ],
      offsets: [0, 1, 2, 3],
      durations: [1, 1, 1, 1],
    };

    const scale = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];

    const result = insertPassingChords(
      chordMelody,
      scale,
      [4, 4],        // timeSignature
      'triad',       // complexity
      ['triad'],     // enabledTypes
      3,             // chordCount
      null,          // firstChord
      50             // rhythmVariability
    );

    expect(result).toBeDefined();
    expect(result.notes).toBeDefined();
    expect(Array.isArray(result.notes)).toBe(true);
  });

  it('handles empty/null chord progression', () => {
    const chordMelody = {
      notes: [null, null, null, null],
      offsets: [0, 1, 2, 3],
      durations: [1, 1, 1, 1],
    };

    const scale = ['C4', 'D4', 'E4', 'F4', 'G4'];

    const result = insertPassingChords(
      chordMelody,
      scale,
      [4, 4],
      'triad',
      ['triad'],
      2,
      null,
      50
    );

    expect(result).toBeDefined();
  });

  it('handles complex chord types', () => {
    const chordMelody = {
      notes: [
        ['C4', 'E4', 'G4'],
        null,
        null,
        ['F4', 'A4', 'C5'],
      ],
      offsets: [0, 1, 2, 3],
      durations: [1, 1, 1, 1],
    };

    const scale = Array.from({ length: 16 }, (_, i) => `${String.fromCharCode(67 + (i % 7))}${4 + Math.floor(i / 7)}`);

    const result = insertPassingChords(
      chordMelody,
      scale,
      [4, 4],
      'seventh',      // more complex
      ['triad', 'seventh'],
      4,
      null,
      0               // no variability
    );

    expect(result).toBeDefined();
    expect(result.notes).toBeDefined();
  });
});
