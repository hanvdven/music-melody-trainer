import { useState, useEffect, useMemo } from 'react';
import { Audio } from 'expo-av';

const generateAllPossibleNotes = () => {
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

const useInitializeSounds = () => {
  console.log('initializing sounds')
  const [sounds, setSounds] = useState({});

  const notes = useMemo(() => generateAllPossibleNotes(),[]);

  const modes = useMemo(() => ({
    'Diatonic': {
      'I. Ionian (Major)': [2, 2, 1, 2, 2, 2, 1],
      'II. Dorian': [2, 1, 2, 2, 2, 1, 2],
      'III. Phrygian': [1, 2, 2, 2, 1, 2, 2],
      'IV. Lydian': [2, 2, 2, 1, 2, 2, 1],
      'V. Mixolydian (Melodic Minor ↓)': [2, 2, 1, 2, 2, 1, 2],
      'VI. Aeolian (Natural Minor)': [2, 1, 2, 2, 1, 2, 2],
      'VII. Locrian': [1, 2, 2, 1, 2, 2, 2],
    },
    'Melodic': {
      'I. Melodic Minor (↑)': [2, 1, 2, 2, 2, 2, 1],
      'II. Dorian ♭2': [1, 2, 2, 2, 2, 1, 2],
      'III. Lydian Augmented': [2, 2, 2, 2, 1, 2, 1],
      'IV. Lydian Dominant (Acoustic)': [2, 2, 2, 1, 2, 1, 2],
      'V. Aeolian Dominant': [2, 2, 1, 2, 1, 2, 2],
      'VI. Half Diminished': [2, 1, 2, 1, 2, 2, 2],
      'VII. Super Locrian "Altered" (Diminished Whole Tone)': [1, 2, 1, 2, 2, 2, 2],
    },
    'Harmonic Major': {
      'I. Harmonic Major': [2, 2, 1, 2, 1, 3, 1],
      'II. Dorian ♭5': [2, 1, 2, 1, 3, 1, 2],
      'III. Phrygian ♭4': [1, 2, 1, 3, 1, 2, 2],
      'IV. Lydian ♭3': [2, 1, 3, 1, 2, 2, 1],
      'V. Mixolydian ♭2': [1, 3, 1, 2, 2, 1, 2],
      'VI. Lydian Augmented ♯2': [3, 1, 2, 2, 1, 2, 1],
      'VII. Locrian ♭7': [1, 2, 2, 1, 2, 1, 3],
    },
    'Harmonic Minor': {
      'I. Harmonic Minor': [2, 1, 2, 2, 1, 3, 1],
      'II. Locrian ♯6': [1, 2, 2, 1, 3, 1, 2],
      'III. Ionian ♯5': [2, 2, 1, 3, 1, 2, 1],
      'IV. Dorian ♯4 (Ukrainian Dorian)': [2, 1, 3, 1, 2, 1, 2],
      'V. Phrygian ♯2 (Phrygian Dominant)': [1, 3, 1, 2, 1, 2, 2],
      'VI. Lydian ♯2': [3, 1, 2, 1, 2, 2, 1],
      'VII. Mixolydian ♯1': [1, 2, 1, 2, 2, 1, 3],
    },
    'Double Harmonic': {
      'I. Double Harmonic Major (Gypsy Maj/Arabic/Byzantine Echoi/Flamenco)': [1, 3, 1, 2, 1, 3, 1],
      'II. Lydian ♯2 ♯6': [3, 1, 2, 1, 3, 1,1],
      'III. Ultraphrygian': [1, 2, 1, 3, 1, 3, 1],
      'IV. Hungarian minor / Gypsy min': [2, 1, 3, 1, 1, 3, 1],
      'V. Oriental': [1, 3, 1, 1, 3, 1, 2],
      'VI. Ionian ♯2 ♯5': [3, 1, 1, 3, 1, 2, 1],
      'VII. Locrian bb3 bb7': [1, 1, 3, 1, 2, 1, 3],
    },
    'Other Heptatonic': {
      'Neapolitan major': [1, 2, 2, 2, 2, 2, 1],
      'Neapolitan minor': [1, 2, 2, 2, 1, 3, 1],
      'Hungarian major': [3, 1, 2, 1, 2, 1, 2],
      'Locrian major': [2, 2, 1, 1, 2, 2, 2],
      'Lydian diminished': [2, 1, 3, 1, 1, 2, 1],
      'Gypsy major': [2, 1, 3, 1, 1, 2, 2],
      'Enigmatic': [1, 3, 2, 2, 2, 1, 1],
      'Persian': [1, 3, 1, 1, 2, 3, 1],
    },
    'Pentatonic': {
      'Pentatonic Major': [2, 2, 3, 2, 3],
      'Pentatonic Minor (Yo)': [3, 2, 2, 3, 2],
      'Iwato': [1, 4, 1, 4, 2],
      'In': [1, 4, 2, 1, 4],
      'Insen': [1, 4, 2, 3, 2],
      'Hirajoshi scale': [4, 2, 1, 4, 1],
    },
    'Hexatonic': {
      'Blues scale': [3, 2, 1, 1, 3, 2],
      'Whole Tone': [2, 2, 2, 2, 2, 2],
      'Two-semitone tritone scale': [1, 1, 4, 1, 1, 4],
      'Istrian scale': [1, 2, 1, 2, 1, 5],
      'Tritone scale': [1, 3, 2, 1, 3, 2],
      'Prometheus scale': [2, 2, 2, 3, 1, 2],
      'Scale of harmonics': [3, 1, 1, 2, 2, 3],
      'Augmented scale': [3, 1, 3, 1, 3, 1],
    },
    'Supertonic': {
      'Major Bebop': [2, 2, 1, 2, 1, 1, 2, 1],
      'Bebop Dominant': [2, 2, 1, 2, 2, 1, 1, 1],
      'Algerian': [2, 1, 3, 1, 1, 3, 1, 2, 1, 2],
      'Diminished': [2, 1, 2, 1, 2, 1, 2, 1],
      'Dominant Diminished': [1, 2, 1, 2, 1, 2, 1, 2],
      'Chromatic': [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    }
  }), []);

  const scaleTypes = useMemo(() => Object.keys(modes), [modes]);

  const intervalNamesMap = useMemo(() => ({
    'Unison': 0,
    '2nd': 2,
    '3rd': 4,
    '4th': 5,
    '5th': 7,
    '6th': 9,
    '7th': 11,
    'Octave': 12,
    '9th': 14,
    '10th': 16,
    '11th': 17,
    '12th': 19,
    '13th': 21,
    '14th': 23,
    'Double Octave': 24,
  }), []);

  const intervalNames  = useMemo(() => Object.keys(intervalNamesMap), [intervalNamesMap]);  
  return {modes, scaleTypes, notes, sounds, intervalNamesMap, intervalNames };
};

export default useInitializeSounds;