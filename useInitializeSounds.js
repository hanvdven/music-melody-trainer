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

  const [notesFiles, setNotesFiles] = useState({});

  const goodNotesFiles = useMemo(() => ({
    'C3': require('./assets/notes/c3.mp3'),
    'C♯3': require('./assets/notes/c-3.mp3'),
    'D3': require('./assets/notes/d3.mp3'),
    'E♭3': require('./assets/notes/d-3.mp3'),
    'E3': require('./assets/notes/e3.mp3'),
    'F3': require('./assets/notes/f3.mp3'),
    'F♯3': require('./assets/notes/f-3.mp3'),
    'G3': require('./assets/notes/g3.mp3'),
    'A♭3': require('./assets/notes/g-3.mp3'),
    'A3': require('./assets/notes/a4.mp3'),
    'B♭3': require('./assets/notes/a-4.mp3'),
    'B3': require('./assets/notes/b4.mp3'),
    'C4': require('./assets/notes/c4.mp3'),
    'C♯4': require('./assets/notes/c-4.mp3'),
    'D4': require('./assets/notes/d4.mp3'),
    'E♭4': require('./assets/notes/d-4.mp3'),
    'E4': require('./assets/notes/e4.mp3'),
    'F4': require('./assets/notes/f4.mp3'),
    'F♯4': require('./assets/notes/f-4.mp3'),
    'G4': require('./assets/notes/g4.mp3'),
    'A♭4': require('./assets/notes/g-4.mp3'),
    'A4': require('./assets/notes/a5.mp3'),
    'B♭4': require('./assets/notes/a-5.mp3'),
    'B4': require('./assets/notes/b5.mp3'),
    'C5': require('./assets/notes/c5.mp3'),
    'C♯5': require('./assets/notes/c-5.mp3'),
    'D5': require('./assets/notes/d5.mp3'),
    'E♭5': require('./assets/notes/d-5.mp3'),
    'E5': require('./assets/notes/e5.mp3'),
    'F5': require('./assets/notes/f5.mp3'),
    'F♯5': require('./assets/notes/f-5.mp3'),
    'G5': require('./assets/notes/g5.mp3'),
    'A♭5': require('./assets/notes/g-5.mp3'),
    // 'A5': require('./assets/notes/a5.mp3'),
    // 'B♭5': require('./assets/notes/a-5.mp3'),
    // 'B5': require('./assets/notes/b5.mp3'),
    // 'C6': require('./assets/notes/c6.mp3')
  }), []);
  
  const metronomeFiles = useMemo(() => ({
    'k' : require('./assets/Perc_MetronomeQuartz_hi.wav'),
    'c' : require('./assets/Perc_MetronomeQuartz_lo.wav'),  
  }), []);

  const additionalNotesFiles = useMemo(() => ({
    'A0': require('./assets/notes/additional/A0.mp3'),
    'B♭0': require('./assets/notes/additional/Bb0.mp3'),
    'B0': require('./assets/notes/additional/B0.mp3'),
    'C1': require('./assets/notes/additional/C1.mp3'),
    'C♯1': require('./assets/notes/additional/Db1.mp3'),
    'D1': require('./assets/notes/additional/D1.mp3'),
    'E♭1': require('./assets/notes/additional/Eb1.mp3'),
    'E1': require('./assets/notes/additional/E1.mp3'),
    'F1': require('./assets/notes/additional/F1.mp3'),
    'F♯1': require('./assets/notes/additional/Gb1.mp3'),
    'G1':require('./assets/notes/additional/G1.mp3'),
    'A♭1': require('./assets/notes/additional/Ab1.mp3'),
    'A1': require('./assets/notes/additional/A1.mp3'),
    'B♭1': require('./assets/notes/additional/Bb1.mp3'),
    'B1': require('./assets/notes/additional/B1.mp3'),
    'C2': require('./assets/notes/additional/C2.mp3'),
    'C♯2': require('./assets/notes/additional/Db2.mp3'),
    'D2': require('./assets/notes/additional/D2.mp3'),
    'E♭2': require('./assets/notes/additional/Eb2.mp3'),
    'E2': require('./assets/notes/additional/E2.mp3'),
    'F2': require('./assets/notes/additional/F2.mp3'),
    'F♯2': require('./assets/notes/additional/Gb2.mp3'),
    'G2':require('./assets/notes/additional/G2.mp3'),
    'A♭2': require('./assets/notes/additional/Ab2.mp3'),
    'A2': require('./assets/notes/additional/A2.mp3'),
    'B♭2': require('./assets/notes/additional/Bb2.mp3'),
    'B2': require('./assets/notes/additional/B2.mp3'),
    //
    'A5': require('./assets/notes/additional/A5.mp3'),
    'B♭5': require('./assets/notes/additional/Bb5.mp3'),
    'B5': require('./assets/notes/additional/B5.mp3'),
    'C6': require('./assets/notes/additional/C6.mp3'),
    'C♯6': require('./assets/notes/additional/Db6.mp3'),
    'D6': require('./assets/notes/additional/D6.mp3'),
    'E♭6': require('./assets/notes/additional/Eb6.mp3'),
    'E6': require('./assets/notes/additional/E6.mp3'),
    'F6': require('./assets/notes/additional/F6.mp3'),
    'F♯6': require('./assets/notes/additional/Gb6.mp3'),
    'G6':require('./assets/notes/additional/G6.mp3'),
    'A♭6': require('./assets/notes/additional/Ab6.mp3'),
    'A6': require('./assets/notes/additional/A6.mp3'),
    'B♭6': require('./assets/notes/additional/Bb6.mp3'),
    'B6': require('./assets/notes/additional/B6.mp3'),
    'C7': require('./assets/notes/additional/C7.mp3'),
    'C♯7': require('./assets/notes/additional/Db7.mp3'),
    'D7': require('./assets/notes/additional/D7.mp3'),
    'E♭7': require('./assets/notes/additional/Eb7.mp3'),
    'E7': require('./assets/notes/additional/E7.mp3'),
    'F7': require('./assets/notes/additional/F7.mp3'),
    'F♯7': require('./assets/notes/additional/Gb7.mp3'),
    'G7':require('./assets/notes/additional/G7.mp3'),
    'A♭7': require('./assets/notes/additional/Ab7.mp3'),
    'A7': require('./assets/notes/additional/A7.mp3'),
    'B♭7': require('./assets/notes/additional/Bb7.mp3'),
    'B7': require('./assets/notes/additional/B7.mp3'),
    'C8': require('./assets/notes/additional/C8.mp3'),
  }), []);

  useEffect(() => {
    const preloadSounds = async () => {
      const loadedSounds = {};
      for (const note in notesFiles) {
        const { sound } = await Audio.Sound.createAsync(notesFiles[note]);
        loadedSounds[note] = sound;
      }
      setSounds(loadedSounds);
    };
    preloadSounds();

    return () => {
      for (const sound of Object.values(sounds)) {
        sound.unloadAsync();
      }
    };
  }, [notesFiles]);

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

  useEffect(() => {
    // Wait for goodNotesFiles to be populated before proceeding
    if (Object.keys(goodNotesFiles).length > 0) {
      const updatedNotesFiles = {
        ...metronomeFiles,
        ...additionalNotesFiles,
        ...goodNotesFiles,
      };
      setNotesFiles(updatedNotesFiles);
      console.log('updatedNotesFiles',updatedNotesFiles)
    }
  }, [goodNotesFiles, metronomeFiles, additionalNotesFiles]);
  
  return {modes, scaleTypes, notesFiles, notes, sounds, intervalNamesMap, intervalNames };
};

export default useInitializeSounds;