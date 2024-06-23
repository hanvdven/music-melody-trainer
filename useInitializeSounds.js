import { useState, useEffect, useMemo } from 'react';
import { Audio } from 'expo-av';

const useInitializeSounds = () => {
  const [sounds, setSounds] = useState({});

  const notes = useMemo(() => [
      'A3', 'A#3', 'B3','C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3',
      'A4', 'A#4', 'B4','C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4',
      'A5', 'A#5', 'B5','C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5'
  ],[]);

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
      'VI. Lydian Augmented #2': [3, 1, 2, 2, 1, 2, 1],
      'VII. Locrian ♭7': [1, 2, 2, 1, 2, 1, 3],
    },
    'Harmonic Minor': {
      'I. Harmonic Minor': [2, 1, 2, 2, 1, 3, 1],
      'II. Locrian #6': [1, 2, 2, 1, 3, 1, 2],
      'III. Ionian #5': [2, 2, 1, 3, 1, 2, 1],
      'IV. Dorian #4 (Ukrainian Dorian)': [2, 1, 3, 1, 2, 1, 2],
      'V. Phrygian #2 (Phrygian Dominant)': [1, 3, 1, 2, 1, 2, 2],
      'VI. Lydian #2': [3, 1, 2, 1, 2, 2, 1],
      'VII. Mixolydian #1': [1, 2, 1, 2, 2, 1, 3],
    },
    'Double Harmonic': {
      'I. Double Harmonic Major (Gypsy Maj/Arabic/Byzantine Echoi/Flamenco)': [1, 3, 1, 2, 1, 3, 1],
      'II. Lydian #2 #6': [3, 1, 2, 1, 3, 1,1],
      'III. Ultraphrygian': [1, 2, 1, 3, 1, 3, 1],
      'IV. Hungarian minor / Gypsy min': [2, 1, 3, 1, 1, 3, 1],
      'V. Oriental': [1, 3, 1, 1, 3, 1, 2],
      'VI. Ionian #2 #5': [3, 1, 1, 3, 1, 2, 1],
      'VII. Locrian bb3 bb7': [1, 1, 3, 1, 2, 1, 3],
    },
    'Other Heptatonic': {
      'Neapolitan minor scale': [1, 2, 2, 2, 1, 3, 1],
      'Neapolitan major scale': [1, 2, 2, 2, 2, 2, 1],
      'Hungarian major scale': [3, 1, 2, 1, 2, 1, 2],
      'Major Locrian scale': [2, 2, 1, 1, 2, 2, 2],
      'Lydian diminished scale': [2, 1, 3, 1, 1, 2, 1],
      '"Gypsy" scale': [2, 1, 3, 1, 1, 2, 2],
      'Enigmatic scale': [1, 3, 2, 2, 2, 1, 1],
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

  const notesFiles = useMemo(() => ({
    'C3': require('./assets/notes/c3.mp3'),
    'C#3': require('./assets/notes/c-3.mp3'),
    'D3': require('./assets/notes/d3.mp3'),
    'D#3': require('./assets/notes/d-3.mp3'),
    'E3': require('./assets/notes/e3.mp3'),
    'F3': require('./assets/notes/f3.mp3'),
    'F#3': require('./assets/notes/f-3.mp3'),
    'G3': require('./assets/notes/g3.mp3'),
    'G#3': require('./assets/notes/g-3.mp3'),
    'A3': require('./assets/notes/a3.mp3'),
    'A#3': require('./assets/notes/a-3.mp3'),
    'B3': require('./assets/notes/b3.mp3'),
    'C4': require('./assets/notes/c4.mp3'),
    'C#4': require('./assets/notes/c-4.mp3'),
    'D4': require('./assets/notes/d4.mp3'),
    'D#4': require('./assets/notes/d-4.mp3'),
    'E4': require('./assets/notes/e4.mp3'),
    'F4': require('./assets/notes/f4.mp3'),
    'F#4': require('./assets/notes/f-4.mp3'),
    'G4': require('./assets/notes/g4.mp3'),
    'G#4': require('./assets/notes/g-4.mp3'),
    'A4': require('./assets/notes/a4.mp3'),
    'A#4': require('./assets/notes/a-4.mp3'),
    'B4': require('./assets/notes/b4.mp3'),
    'C5': require('./assets/notes/c5.mp3'),
    'C#5': require('./assets/notes/c-5.mp3'),
    'D5': require('./assets/notes/d5.mp3'),
    'D#5': require('./assets/notes/d-5.mp3'),
    'E5': require('./assets/notes/e5.mp3'),
    'F5': require('./assets/notes/f5.mp3'),
    'F#5': require('./assets/notes/f-5.mp3'),
    'G5': require('./assets/notes/g5.mp3'),
    'G#5': require('./assets/notes/g-5.mp3'),
    'A5': require('./assets/notes/a5.mp3'),
    'A#5': require('./assets/notes/a-5.mp3'),
    'B5': require('./assets/notes/b5.mp3'),
    'C6': require('./assets/notes/c6.mp3'),
    'k' : require('./assets/metronome-85688.mp3'),
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

  return {
    modes,
    scaleTypes,
    notesFiles,
    notes,
    sounds,
  };
};

export default useInitializeSounds;