import React, { useState, useEffect, useCallback, useMemo, useRef, } from 'react';
import {
  Text,
  View,
  Button,
  Modal,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import Piano from './Piano';
import { Audio } from 'expo-av';
// import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import * as Font from 'expo-font';

import useInitializeSounds from './useInitializeSounds';
import Measure from './Measure';
// import generateSoundArrays from './generateSoundArrays';
// import playingSounds from './playingSounds';
import styles from './styles';

const App = () => {
  const [isInitialized, setIsInitialized] = useState(false); // State to track initialization
  const [fontsLoaded] = useFonts({
    Maestro: require('./assets/fonts/Maestro.ttf'),
  });

  const { modes, scaleTypes, notesFiles, notes, sounds, intervalNamesMap, intervalNames } = useInitializeSounds() ; 
  const tonicOptions = ['C4','C♯4','D4','E♭4','E4','F4','F♯4','G4','A♭4','A4','B♭4','B4',];

  useEffect(() => {
    if (Object.keys(sounds).length > 0) {
      setIsInitialized(true);
    }
  }, [sounds]);

  const abortControllerRef = useRef(null);

  const [tonic, setTonic] = useState('C4'); // Default to C
  const [selectedScaleType, setSelectedScaleType] = useState('Diatonic'); // Default to Diatonic
  const [selectedMode, setSelectedMode] = useState('I. Ionian (Major)'); // Default to Ionian (Major)
  const [notesPerMeasure, setNotesPerMeasure] = useState(3); // Default melody length
  const [scaleRange, setScaleRange] = useState(12); // Default melody range (one octave)
  const [selectedInterval, setSelectedInterval] = useState('Octave');
  const updateSelectedInterval = (newInterval) => {
    setSelectedInterval(newInterval);
    console.log('intervalNamesMap[newInterval]', intervalNamesMap[newInterval])
    setScaleRange(intervalNamesMap[newInterval]); // Update scaleRange when interval is selected
  };

  const [currentScale, setCurrentScale] = useState([]);
  const [currentMeasure, setCurrentMeasure] = useState([4, 4]);
  const [currentDisplayScale, setCurrentDisplayScale] = useState([])
  const [allowTriplets, setAllowTriplets] = useState(false); // State for triplets;
  //
  const [generatedMelody, setGeneratedMelody] = useState(['C4','E4','G4','C5']); 
  const [generatedBassLine, setGeneratedBassLine] = useState(['C4',null,null,null]); 
  const [generatedClickTrack, setGeneratedClickTrack] = useState(['k','c','c','c']);
  const getGeneratedMelody = () => generatedMelody;
  const getGeneratedBassLine = () => generatedBassLine;
  const getGeneratedClickTrack = () => generatedClickTrack; 


  // Modal Views
  const [isTonicModalVisible, setTonicModalVisible] = useState(false);
  const [isScaleTypeModalVisible, setScaleTypeModalVisible] = useState(false);
  const [isModeModalVisible, setModeModalVisible] = useState(false);
  const [isIntervalModalVisible, setIntervalModalVisible] = useState(false); // Modal visibility state for interval picker
  // set rhythm parameters
  // inherit Meausure state
  const [millisecondsPerNote, setMillisecondsPerNote] = useState(500); // State for milliseconds per beat
  const millisecondsPerNoteRef = useRef(millisecondsPerNote);
  useEffect(() => {
    millisecondsPerNoteRef.current = millisecondsPerNote;
  }, [millisecondsPerNote]);
  const [noteDivisions, setNoteDivisions] = useState(1);
  // Function to handle tempo change

  {
    /* Load Sounds */
  }
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
  }, []);
  
  {
    /* Adjust Settings */
  }
  const increaseNotesPerMeasure = () => {
    setNotesPerMeasure((prev) => prev + 1);
  };
  const decreaseNotesPerMeasure = () => {
    setNotesPerMeasure((prev) => (prev > 1 ? prev - 1 : 1));
  };

  const increaseScaleRange = () => {
    let currentIndex = intervalNames.indexOf(selectedInterval);
    let nextIndex = Math.min(currentIndex + 1, intervalNames.length - 1);
    let newInterval = intervalNames[nextIndex];
    setScaleRange(intervalNamesMap[newInterval]);
    setSelectedInterval(newInterval);
  };
  const decreaseScaleRange = () => {
    let currentIndex = intervalNames.indexOf(selectedInterval);
    let nextIndex = Math.max(currentIndex - 1, 0);
    let newInterval = intervalNames[nextIndex];
    setScaleRange(intervalNamesMap[newInterval]);
    setSelectedInterval(newInterval);
  };

  const [numMeasures, setNumMeasures] = useState(2); // default number of measures
  const increaseNumMeasures = () => {
    setNumMeasures((prev) => prev + 1);
  };
  const decreaseNumMeasures = () => {
    setNumMeasures((prev) => (prev > 1 ? prev - 1 : 1));
  };

  const [rhythmVariability, setRhythmVariability] = useState(30); // default variability (0 to 1)
  const increaseRhythmVariability = () => {
    setRhythmVariability((prev) => (prev < 100 ? prev + 10 : 100));
  };
  const decreaseRhythmVariability = () => {
    setRhythmVariability((prev) => (prev > 0 ? prev - 10 : 0));
  };

  const noteDurations = ['x', 'e', 'q', 'h', 'w'];
  const noteFrac = [16, 8, 4, 2, 1];
  const [smallestNoteIndex, setsmallestNoteIndex] = useState(2); // Start with 'quarter' (index 2)
  const [smallestNote, setSmallestNote] = useState(
    noteDurations[smallestNoteIndex]
  );
  const increaseSmallestNote = () => {
    setsmallestNoteIndex((prevIndex) =>
      prevIndex === noteDurations.length - 1
        ? noteDurations.length - 1
        : prevIndex + 1
    );
    setSmallestNote(
      noteDurations[
        smallestNoteIndex === noteDurations.length - 1
          ? noteDurations.length - 1
          : smallestNoteIndex + 1
      ]
    );
  };

  const decreaseSmallestNote = () => {
    setsmallestNoteIndex((prevIndex) => (prevIndex === 0 ? 0 : prevIndex - 1));
    setSmallestNote(
      noteDurations[smallestNoteIndex === 0 ? 0 : smallestNoteIndex - 1]
    );
  };

  /* Setting Scale */
  const majorScaleIntervals = [2, 2, 1, 2, 2, 2, 1];

  const generateSelectedScale = useCallback((tonic, mode) => {
      if (!modes || !modes.hasOwnProperty(selectedScaleType)) {
        console.error(`Scale type '${selectedScaleType}' not found in modes.`);
        return { scale: [], displayScale: [] };
      }

      const scaleType = modes[selectedScaleType];

      if (!scaleType.hasOwnProperty(mode)) {
        console.error(`Mode '${mode}' not found for scale type '${selectedScaleType}'.`);
        return [];
      }

      const intervals = scaleType[mode];

      if (!Array.isArray(intervals)) {
        console.error(`Intervals for mode '${mode}' in scale type '${selectedScaleType}' are invalid.`);
        return [];
      }

      console.log('generating Scale')
      const scale = generateScale(tonic, intervals, scaleRange);
      const displayScale = generateDisplayScale(tonic, intervals, scaleRange);

      return { scale, displayScale };
    }, [modes, selectedScaleType, scaleRange]); // Ensure to include all necessary dependencies

  const computeScaleDelta = (intervals) => {
    const intervalsSum = intervals.reduce((acc, val) => {
      acc.push((acc.length > 0 ? acc[acc.length - 1] : 0) + val);
      return acc;
    }, []);

    const majorSum = majorScaleIntervals.reduce((acc, val) => {
      acc.push((acc.length > 0 ? acc[acc.length - 1] : 0) + val);
      return acc;
    }, []);

    const scaleDelta = [0].concat(intervalsSum.map((sum, index) => sum - majorSum[index]));
    return scaleDelta;
  };

  const generateDisplayScale = (tonic, intervals, scaleRange) => {
    // Adjust major notes based on tonic
    const adjustAccidentals = (notes, tonic) => {
      if (tonic.includes('♯')) {
        return notes.map(note => note.replace('E♭', 'D♯').replace('A♭', 'G♯').replace('B♭', 'A♯'));
      } else if (tonic.includes('♭')) {
        return notes.map(note => note.replace('C♯', 'D♭').replace('F♯', 'G♭'));
      }
      return notes;
    };

    if (intervals.length === majorScaleIntervals.length) {
      console.log('TRUE')
      const scaleDelta = computeScaleDelta(intervals);

      // Map of simplifications
      const simplifications = {
        'C♯♯': 'D', 'D♯♯': 'E', 'E♯': 'F', 'F♯♯': 'G', 'G♯♯': 'A', 'A♯♯': 'B',
        'B♯': 'C', 'C♭': 'B', 'D♭♭': 'C', 'E♭♭': 'D', 'F♭': 'E', 'G♭♭': 'F', 'A♭♭': 'G', 'B♭♭': 'A'
      };


      // Function to generate the major scale starting from any tonic
      const majorNotes = adjustAccidentals(generateScale(tonic,majorScaleIntervals,scaleRange), tonic);

      return majorNotes.map((note, index) => {
        const [pitch, octave] = note.match(/[A-G]♯?♭?|[0-9]/g);
        const delta = scaleDelta[index];

        let accidental = '';
        if (delta === -1) {
          accidental = '♭';
        } else if (delta === 1) {
          accidental = '♯';
        }

        // Adjust the note by adding the accidental directly to the pitch
        let adjustedPitch = pitch;
        if (delta === -1) {
          adjustedPitch = `${pitch}♭`;
        } else if (delta === 1) {
          adjustedPitch = `${pitch}♯`;
        }

        adjustedPitch = adjustedPitch.replace('♯♭','').replace('♭♯','');

        // Determine if a simplified note exists and format accordingly
        let displayNote = adjustedPitch;
        if (simplifications.hasOwnProperty(adjustedPitch)) {
          displayNote = `${simplifications[adjustedPitch]}(${adjustedPitch})`;
        }
        return `${displayNote}${octave}`;
      });
    } else {
      console.log('FALSE')
      return adjustAccidentals(generateScale(tonic,intervals,scaleRange),tonic);
    }
  };

  const generateScale = (tonic, intervals, scaleRange) => {
    const scale = [];
    let noteIndex = notes.indexOf(tonic);
    let sumOfIntervals = 0;
    let i = 0;

    while (sumOfIntervals <= scaleRange) {
      const note = notes[noteIndex % notes.length];
      scale.push(note);
      sumOfIntervals += intervals[i % intervals.length];
      noteIndex += intervals[i % intervals.length];
      i++;
    }
    return scale;
  }

{/* Randomize Scale */}

  const randomScale = () => {
    const randomScaleType =
      scaleTypes[Math.floor(Math.random() * scaleTypes.length)];
    const scaleTypeModes = modes[randomScaleType];
    const modesArray = Object.keys(scaleTypeModes);
    const randomMode =
      modesArray[Math.floor(Math.random() * modesArray.length)];

    setSelectedScaleType(randomScaleType);
    setSelectedMode(randomMode);
  };

  const chooseScaleType = (selectedScaleType) => {
    const scaleTypeModes = modes[selectedScaleType];
    const modesArray = Object.keys(scaleTypeModes);
    setSelectedScaleType(selectedScaleType);
    setSelectedMode(modesArray[0]);
  };

  const randomMode = () => {
    if (!modes.hasOwnProperty(selectedScaleType)) {
      console.error(`Scale type '${selectedScaleType}' not found in modes.`);
      return;
    }

    const scaleTypeModes = Object.keys(modes[selectedScaleType]);
    const randomMode =
      scaleTypeModes[Math.floor(Math.random() * scaleTypeModes.length)];

    setSelectedMode(randomMode);
  };

  const randomTonic = () => {
    const randomTonic =
      tonicOptions[Math.floor(Math.random() * tonicOptions.length)];
    setTonic(randomTonic);
  };

  {
    /* Play Sound */
  }
  const playSound = async (note, volume = 1.0) => {
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }
      if (note !== null) {
        try {
          if (sounds && sounds[note]) {
            await sounds[note].setVolumeAsync(volume); // Adjust volume before playing
            await sounds[note].replayAsync();
          } else {
            console.error(`playSound: Sound for note ${note} is not loaded.`);
          }
        } catch (error) {
          console.error('playSound: Failed to play sound', error);
        }
      }
      return;
    };

  const stopPlayback = () => {
    setContinuousMode(false);
    // Immediately abort the current playback
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Clean up after a short delay to ensure smooth transition
    setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null; // Reset the abort controller
      }
    }, millisecondsPerNote);
  };
  //
  //
  //

  const generateMelody = useCallback(
    (
      scale,
      notesPerMeasure,
      smallestNoteIndex,
      currentMeasure,
      numMeasures,
      noteFrac,
      rhythmVariability,
      allowTriplets,
    ) => {
      // Step 1: Initialize melodyArray and clickTrack
      let melodyArray = [];
      let bassLineArray = [];
      let clickTrack = [];

      for (let i = 0; i < numMeasures; i++) {
        melodyArray.push([]);
        clickTrack.push([]);
        bassLineArray.push([]);
      }

      // Step 2: Calculate the smallest note value
      let smallestNoteValue = currentMeasure[1];
      let division = currentMeasure[0];
      while (division % 2 === 0) {
        division /= 2;
        smallestNoteValue /= 2;
      }

      // Step 3: Determine the number of slots
      let noteLength = noteFrac[smallestNoteIndex];
      let measureNoteResolution = Math.max(smallestNoteValue, noteLength); // Highest divisor : (e.g., 8 for 1/8 measure with quarter notes)
      let numberOfSlotsPerMeasure = (measureNoteResolution * currentMeasure[0]) / currentMeasure[1];
      // Determine the length of a quarter note
      let quarterNoteSlots = measureNoteResolution / 4;
      // Calculate norm for looping array at right tempo (using quarter note as standard reference for now..)
      let noteDivisions = quarterNoteSlots;
      // Step 4: Populate melodyArray with placeholders based on divisors ...
      function getDivisors(n) {
        let divisors = [];
        for (let i = 2; i <= n; i++) {
          if (n % i === 0) {
            divisors.unshift(i*noteLength/currentMeasure[1]);
          }
        }
        return divisors;
      }
      // ... and near divisors
      function getNearDivisors(n) {
        let nearDivisors = [];
        for (let i = 2; i <= n; i++) {
          if (n % i === 1) {
            nearDivisors.unshift(i*noteLength/currentMeasure[1]);
          } else if (n % i === -1) {
            nearDivisors.unshift(i*noteLength/currentMeasure[1]);
          }
        }
        return nearDivisors;
      }
      // Start filling the measureslots with rankings
      for (let i = 0; i < numMeasures; i++) {
        let measureSlots = Array(numberOfSlotsPerMeasure).fill(null);
        let divisors = getDivisors(currentMeasure[0]);
        console.log('divisors',divisors)
        let nearDivisors = getNearDivisors(currentMeasure[0]);
        console.log('near divisors',nearDivisors)
        // Loop through the divisors to place the ranking number in appropriate slots
        for (let div of divisors) {
          // Calculate the ranking number (number of non-empty array slots)
          let rank = 1+ measureSlots.filter((slot) => slot !== null).length;
          // check if slot matches the next divisor
          for (let j = 0; j < numberOfSlotsPerMeasure; j++) {
            if (
              measureSlots[j] === null &&
              ((j % div) * currentMeasure[1]) / measureNoteResolution === 0
            ) {
              measureSlots[j] = rank;
              rank += 0.2; // slightly increase rank, to ensure equal spacing over measure (at low variability)
            }
          }
        }
        for (let div of nearDivisors) {
          // Calculate the ranking number (number of non-empty array slots)
          let rank = 1+ measureSlots.filter((slot) => slot !== null).length;
          // check if slot matches the next near divisor
          for (let j = 0; j < numberOfSlotsPerMeasure; j++) {
            if (
              measureSlots[j] === null &&
              ((j % div) * currentMeasure[1]) / measureNoteResolution === 0
            ) {
              measureSlots[j] = rank;
              rank += 0.2; // slightly increase rank, to ensure equal spacing over measure (at low variability)
            }
          }
        }
        // Fill remaining slots with equal rank
        for (let div of [8,4,2,1]) {
          // Calculate the ranking number
          let rank = numberOfSlotsPerMeasure/div;
          // check if slot matches the next near divisor
          for (let j = 0; j < numberOfSlotsPerMeasure; j++) {
            if (
              measureSlots[j] === null &&
              ((j % div) * currentMeasure[1]) / measureNoteResolution === 0
            ) {
              measureSlots[j] = rank;
            }
          }
        }
        melodyArray[i] = measureSlots;
      }
      console.log('melodyArray',melodyArray)
      
      // Step 5: Flatten and melodyArray, using rhythmVariability 
      const generatedMelodyTemp = melodyArray.flatMap((slot) => slot);
      const generatedMelodyRandomizer = Array.from({ length: generatedMelodyTemp.length }, () => Math.random());
      const piecewiseSum = generatedMelodyTemp.map((value, index) => {
        return rhythmVariability/100 * numberOfSlotsPerMeasure * numMeasures * generatedMelodyRandomizer[index] * 1.1 + (100 - rhythmVariability)/100 * value;
      });
      
      // Step 6: Insert Triples
      const insertTriplets = (notes) => {
        console.log('insertTriplets:')
        if (notes.length < 2) return { array: notes, tripletsInserted: false }; // Ensure there's at least two elements to compare
  
        // Step 1: Stretch the array to fit in triplets
        const tripletsArray = [];
        for (let i = 0; i < notes.length; i++) {
          tripletsArray.push(notes[i],null,null);
        }
        
        let numTriplets = 1 + Math.floor(Math.random() * numMeasures * rhythmVariability/ 100 );
        for (let i = 0; i < numTriplets; i++){
          // Step 2: Pick a random index (with steps of three), excluding the last index
          const randomIndex = Math.floor(Math.random() * (notes.length -1)) * 3;
          
          // Step 3: Check if the priority value at i is less than the value at i+1
          let tripletHasPriority = true;
          for (let i = 1; i === 3; i++){
            if (tripletsArray[randomIndex] > tripletsArray[randomIndex + i]) {tripletHasPriority = false;}
          }
          if (tripletHasPriority) {
            // Step 4: Fill in the triplet values
            tripletsArray[randomIndex * 1 ] = tripletsArray[randomIndex];
            tripletsArray[randomIndex * 1 + 2] = tripletsArray[randomIndex];
            tripletsArray[randomIndex * 1 + 3] = null;
            tripletsArray[randomIndex * 1 + 4] = tripletsArray[randomIndex];
            
            console.log('Triplet inserted:', tripletsArray);
          }
        }

        return { array: tripletsArray, tripletsInserted: true }; 
      };

      let tripletsInserted = false;
      let tripletsArray = piecewiseSum;
      if (allowTriplets) {
        const result =  insertTriplets(piecewiseSum);
        tripletsArray = result.array;
        tripletsInserted = result.tripletsInserted;
      };

      if (tripletsInserted) {noteDivisions = quarterNoteSlots * 3}; // adjust tempo accordingly
        // fill in the triplet
    
      // Step 7: Straighten
      const rankArray = (notesArray) => {
        // Step 1: Map non-null values with their indices
        const nonNullValues = notesArray
          .map((value, index) => (value !== null ? { value, index } : null))
          .filter(item => item !== null);
        
        // Step 2: Sort the non-null values by their values
        nonNullValues.sort((a, b) => a.value - b.value);
        
        // Step 3: Assign ranks to the sorted values, ensuring equal ranks for equal values
        let rank = 0;
        let lastValue = nonNullValues[0]?.value;
        nonNullValues.forEach((item, i) => {
          if (i === 0 || item.value !== lastValue) {
            rank = i;
          }
          item.rank = rank;
          lastValue = item.value;
        });

        // Step 4: Create the ranked array with nulls in their original positions
        const rankedArray = tripletsArray.map(value => null);
        nonNullValues.forEach(item => {
          rankedArray[item.index] = item.rank;
        });

        return rankedArray;
      };


      const generatedMelody = rankArray(tripletsArray);

      // const generatedMelody = Array(numberOfSlotsPerMeasure).fill(0);
      // sortedIndices.forEach((sortedIndex, rank) => {
      //   generatedMelody[sortedIndex] = rank;
      // });
      console.log("rhythmVariability:", rhythmVariability);
      console.log("generatedMelodyRandomizer:", generatedMelodyRandomizer);
      console.log("piecewiseSum:", piecewiseSum);
      console.log("generatedMelody:", generatedMelody);

      // Step 8: Generate the melody
      const melodyNotes = [];
      let melodyLength = notesPerMeasure * numMeasures;
      for (let i = 0; i < melodyLength; i++) {
        const index = Math.floor(Math.random() * scale.length);
        melodyNotes.push(scale[index]);
      }

      // Step 9: Replace slots in generatedMelody with generated melody notes
      let melodyIndex = 0;
      let rank = 0;

      while (
        melodyIndex < melodyNotes.length &&
        rank <= generatedMelody.length
      ) {
        for (let i = 0; i < generatedMelody.length; i++) {
          const slot = generatedMelody[i];
          if (slot === rank) {
            generatedMelody[i] = melodyNotes[melodyIndex];
            melodyIndex++;
            if (melodyIndex >= melodyNotes.length) {
              break; // Stop if melody length is reached
            }
          }
        }
        rank++;
      }

      // Fill remaining slots with null
      for (let i = 0; i < generatedMelody.length; i++) {
        if (typeof generatedMelody[i] === 'number') {
          generatedMelody[i] = null;
        }
      }

      // Generate Click track
      for (let i = 0; i < numMeasures; i++) {
        for (let j = 0; j < numberOfSlotsPerMeasure*(tripletsInserted ? 3 : 1); j++) {
          if (j === 0){
            clickTrack[i].push('k');
          } else if (j % noteDivisions === 0) {
            // Insert 'k' every noteDivision (counting note)
            clickTrack[i].push('c');
          } else {
            clickTrack[i].push(null);
          }
        }
      }

      // Populate bassLineArray
      for (let i = 0; i < numMeasures; i++) {
        for (let j = 0; j < numberOfSlotsPerMeasure*(tripletsInserted ? 3 : 1); j++) {
          if (j === 0) {
            const tonicIndex = notes.indexOf(tonic);
            const bassNoteIndex = tonicIndex - 12; // One octave lower
            const bassNote = bassNoteIndex >= 0 ? notes[bassNoteIndex] : null;
            bassLineArray[i].push(bassNote);
          } else {
            bassLineArray[i].push(null);
          }
        }
      }
      const generatedBassLine = bassLineArray.flatMap((slot) => slot);
      const generatedClickTrack = clickTrack.flatMap((slot) => slot);

      // Step 7: Return melodyArray, clickTrack, and generatedMelody
      return {
        generatedMelody,
        generatedBassLine,
        generatedClickTrack,
        noteDivisions,
      };
    },
    []
  );
  //
  //
  //
  const playRandomMelody = async () => {
    try {
      const {
        generatedMelody,
        generatedBassLine,
        generatedClickTrack,
        noteDivisions,
      } = generateMelody(
        currentScale,
        notesPerMeasure,
        smallestNoteIndex,
        currentMeasure,
        numMeasures,
        noteFrac,
        rhythmVariability,
        allowTriplets
      );

      setGeneratedMelody(generatedMelody);
      setGeneratedBassLine(generatedBassLine);
      setGeneratedClickTrack(generatedClickTrack);
      setNoteDivisions(noteDivisions);
      
      console.log('generated click track:', generatedClickTrack);
      console.log('Generated Bass Line:', generatedBassLine);
      console.log('Generated Melody', generatedMelody);

      const noteArrays = [
        generatedMelody,
        generatedBassLine,
        generatedClickTrack
        // Add more arrays as needed
      ];

      const volumes = [1,1,0.30];

      await playArrays(noteArrays, noteDivisions, volumes);

      // useEffect will start playback.
    } catch (error) {
      console.error('Error playing random melody', error);
    }
  };

  const repeatMelody = async () => {
    try {
      const melody = generatedMelodyRef.current;
      const bassLine = generatedBassLineRef.current;
      const clickTrack = generatedClickTrackRef.current;
      const noteDivisions = noteDivisionsRef.current;

      const noteArrays = [
        melody,
        bassLine,
        clickTrack
        // Add more arrays as needed
      ];

      const volumes = [1,1,0.30]; // Add more volumes as needed

      // Validate if any of the arrays are empty or undefined
      if (noteArrays.some((array) => !array || array.length === 0)) {
        console.error('Generated melody, bass line, or click track is empty or undefined');
        return;
      }

      await playArrays(noteArrays, noteDivisions, volumes);
    } catch (error) {
      console.error('Error playing repeated melody', error);
    }
  };

  const playClickTrack = async () => {
    const clickTrack = generatedClickTrackRef.current;
    const noteDivisions = noteDivisionsRef.current;
    if (!generatedClickTrack || generatedClickTrack.length === 0) {
      console.error('Generated click track is empty or undefined');
      return;
    }
    console.log('playClickTrack: playing click track')
    await playArrays([clickTrack], noteDivisions, [0.30]); // Using volume 0.30 for click track
  };


///
/// Logic for continuous mode
///
  const [continuousMode, setContinuousMode] = useState(false); // State for continuous mode
  const continuousModeRef = useRef(false); // useRef for continuousMode state
  const generatedMelodyRef = useRef(generatedMelody);
  const generatedBassLineRef = useRef(generatedBassLine);
  const generatedClickTrackRef = useRef(generatedClickTrack);
  const noteDivisionsRef = useRef(noteDivisions);
  
  useEffect(() => {
    generatedMelodyRef.current = generatedMelody;
  }, [generatedMelody]);

  useEffect(() => {
    generatedBassLineRef.current = generatedBassLine;
  }, [generatedBassLine]);

  useEffect(() => {
    generatedClickTrackRef.current = generatedClickTrack;
  }, [generatedClickTrack]);

  useEffect(() => {
    noteDivisionsRef.current = noteDivisions;
  }, [noteDivisions]);

  const toggleContinuousMode = () => {
    if (continuousMode) {
      // If continuous mode is currently active, stop it
      setContinuousMode(false);
      abortControllerRef.current.abort(); // Abort any ongoing playback
    } else {
      // If continuous mode is not active, start it
      setContinuousMode(true);
      playContinuous(); // Start continuous playback
    }
  };

  // Effect to start or stop continuous playback
  useEffect(() => {
    // Update the ref whenever continuousMode changes
    continuousModeRef.current = continuousMode;

    // Function to play continuous mode
    const playContinuous = async () => {
      while (continuousModeRef.current) {
        await playRandomMelody();
        if (!continuousModeRef.current) break;
        await playClickTrack();  
        if (!continuousModeRef.current) break;
        await repeatMelody();
        if (!continuousModeRef.current) break;
        await playClickTrack();   // Example function
      }
      // Clean up any ongoing playback if continuousMode is set to false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };

    // Start or stop continuous playback based on continuousMode state
    if (continuousMode) {
      abortControllerRef.current = new AbortController(); // Initialize AbortController
      playContinuous();
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort(); // Abort any ongoing playback
      }
    }

    // Cleanup function for when component unmounts or continuousMode changes to false
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort(); // Abort any ongoing playback
      }
    };
  }, [continuousMode]);


  const preciseDelay = async (ms) => {
    const start = performance.now();
    while (performance.now() - start < ms) {
      await new Promise(requestAnimationFrame);
    }
  };

  const playArrays = async (noteArrays, timingNorm, volumes = []) => {
    // Abort all previous instances immediately
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log('waiting for playArrays to complete');
      await preciseDelay(millisecondsPerNote / timingNorm);
    }
    abortControllerRef.current = new AbortController();

    const startTime = performance.now();
    const notePlayers = noteArrays.map(() => 0); // Track index of each note array
    let nextNoteTime = startTime;

    try {
      while (true) {
        // Check if playback was aborted externally
        if (abortControllerRef.current.signal.aborted) {
          break; // Exit the loop immediately if playback was aborted
        }
        
        let allArraysCompleted = true; // Flag to check if all note arrays are completed

        for (let i = 0; i < noteArrays.length; i++) {
          const noteArray = noteArrays[i];
          const currentIndex = notePlayers[i];

          if (currentIndex < noteArray.length) {
            allArraysCompleted = false;
            const note = noteArray[currentIndex];
            if (note !== null) {
              const volume = volumes[i] !== undefined ? volumes[i] : 1.0; // Default volume is 1.0
              await playSound(note, volume, abortControllerRef.current.signal);
            }
            notePlayers[i]++;
          } 
        }

        if (allArraysCompleted) {
          break; // Exit the loop if all note arrays are completed
        }

        // Calculate next note time based on timingNorm
        nextNoteTime += millisecondsPerNoteRef.current / timingNorm;

        const currentTime = performance.now();
        const waitTime = nextNoteTime - currentTime;

        if (waitTime > 0) {
          await preciseDelay(waitTime);
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Playback aborted.');
      } else {
        console.error('Error during playback:', error);
      }
    } finally {
      // Clean up: Reset abort controller only if playback was completed
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  };

  const playScale = async () => {
    playArrays([currentScale],1);
  };

  useEffect(() => {
    const updateCurrentScale = (tonic,selectedMode) => {
      try {
        const {scale, displayScale} = generateSelectedScale(tonic, selectedMode) ;
        setCurrentScale(scale);
        setCurrentDisplayScale(displayScale)
      } catch (error) {
        console.error('Error updating current scale', error);
        setCurrentScale([]);
        setCurrentDisplayScale([]);
      }
    };

    updateCurrentScale(tonic,selectedMode);
  }, [tonic, selectedMode, scaleRange, generateSelectedScale]);

  const renderPickerModal = (
    data,
    selectedValue,
    onValueChange,
    isVisible,
    setVisible
  ) => (
    <Modal visible={isVisible} transparent={true} animationType="slide">
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <FlatList
            data={data}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => {
                  onValueChange(item);
                  setVisible(false);
                }}>
                <Text style={[styles.label, style={color:'white'}]}>{item}</Text>
              </TouchableOpacity>
            )}
          />
          <Button title="Close" onPress={() => setVisible(false)} />
        </View>
      </View>
    </Modal>
  );

  if (!fontsLoaded) {
    return <Text>Loading...</Text>;
  }

  if (!isInitialized) {
    return <Text>Initializing...</Text>;
  }

  return (
    <View style={[styles.container]}>
      {/* Conditionally render based on initialization state */}
      {true ? (
        <>
        <View style={styles.parentContainer}>
          {/* Select Tonic */}
          <View style={styles.pickerRow}>
            <Text style={styles.label}>Tonic</Text>
             <TouchableOpacity
              style={[
                styles.pickerButton,
                { position: 'absolute', left: '18%', backgroundColor: '#036' },
              ]}
              onPress={randomTonic}>
              <Text style={styles.pickerButtonText}>↻</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pickerButton, { backgroundColor: '#036' }]}
              onPress={() => setTonicModalVisible(true)}>
              <
              Text style={styles.pickerButtonText}>{tonic}</Text>
            </TouchableOpacity>
          </View>
          {renderPickerModal(
            tonicOptions,
            tonic,
            setTonic,
            isTonicModalVisible,
            setTonicModalVisible
          )}

          {/* Select Scale Type */}
          <View style={styles.pickerRow}>
            <Text style={styles.label}>Scale Family</Text>
            <TouchableOpacity
              style={[
                styles.pickerButton,
                { position: 'absolute', left: '18%', backgroundColor: '#066' },
              ]}
              onPress={randomScale}>
              <Text style={styles.pickerButtonText}>↻</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pickerButton, { backgroundColor: '#066' }]}
              onPress={() => setScaleTypeModalVisible(true)}>
              <Text style={styles.pickerButtonText}>{selectedScaleType}</Text>
            </TouchableOpacity>
          </View>
          {renderPickerModal(
            scaleTypes,
            selectedScaleType,
            chooseScaleType,
            isScaleTypeModalVisible,
            setScaleTypeModalVisible
          )}

          {/* Select Mode */}
          <View style={styles.pickerRow}>
            <Text style={styles.label}>Mode</Text>
            <TouchableOpacity
              style={[
                styles.pickerButton,
                { position: 'absolute', left: '18%' },
              ]}
              onPress={randomMode}>
              <Text style={styles.pickerButtonText}>↻</Text>
            </TouchableOpacity>
            {selectedScaleType && modes[selectedScaleType] && (
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setModeModalVisible(true)}>
                <Text style={styles.pickerButtonText}>{selectedMode}</Text>
              </TouchableOpacity>
            )}
          </View>
          {renderPickerModal(
            Object.keys(modes[selectedScaleType] || {}),
            selectedMode,
            setSelectedMode,
            isModeModalVisible,
            setModeModalVisible
          )}

          {/* Select Scale Range */}
          <View style={styles.pickerRow}>
            <TouchableOpacity style={[styles.button, { backgroundColor: '#069' }]} onPress={decreaseScaleRange} > - </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pickerButton, { backgroundColor: '#069' }]}
              onPress={() => setIntervalModalVisible(true)}>
              <Text style={styles.pickerButtonText}>Range: {selectedInterval} ({intervalNamesMap[selectedInterval]}H) </Text>
            </TouchableOpacity>
              {renderPickerModal(
                intervalNames,
                selectedInterval,
                updateSelectedInterval,
                isIntervalModalVisible,
                setIntervalModalVisible
              )}
              <TouchableOpacity style={[styles.button, { backgroundColor: '#069' }]} onPress={increaseScaleRange} > + </TouchableOpacity>
            </View>
        </View>
        <View style={styles.parentContainer}>
          <Piano
            scaleRange={scaleRange}
            tonic={tonic}
            currentScale={currentScale}
            playSound={playSound}
            currentDisplayScale={currentDisplayScale}
            notes={notes}
          />
        </View>
        <View style={styles.parentContainer}>
          {/* Play buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity style={styles.button} onPress={playRandomMelody}> 
                <Text style={styles.pickerButtonText}> ⏵random melody </Text>
                 </TouchableOpacity>
              <TouchableOpacity style={styles.button} onPress={repeatMelody}>
                <Text style={styles.pickerButtonText}> ↪ again! </Text> 
              </TouchableOpacity>
              <TouchableOpacity style={styles.button} onPress={playScale}> 
                <Text style={styles.pickerButtonText}> ⏵ Scale </Text> 
              </TouchableOpacity>
            </View>

              <View style={styles.buttonContainer}>
                {/* Continuous mode button */}
                <TouchableOpacity onPress={toggleContinuousMode} style={[styles.button, continuousMode ? styles.activeButton : null]} >
                  <Text style={styles.pickerButtonText}> {continuousMode ? 'Continuous Mode (Active)' : 'Continuous Mode'} </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.button} onPress={stopPlayback}>
                  <Text style={styles.pickerButtonText}> ⏹ Stop </Text> 
                </TouchableOpacity> {/* Add stop button */}
              </View>

          {/* Melody Length */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.button} onPress={decreaseNotesPerMeasure} > - </TouchableOpacity>
            <Text style={styles.label}>notes per measure ~ {notesPerMeasure}</Text>
            <TouchableOpacity style={styles.button} onPress={increaseNotesPerMeasure} > + </TouchableOpacity>
          </View>

          {/* Rhythm Settings */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.button} onPress={decreaseSmallestNote} > - </TouchableOpacity>
            <Text style={styles.label}>smallestNote: </Text>
            <Text style={styles.noteText}> {smallestNote} </Text>
            <TouchableOpacity style={styles.button} onPress={increaseSmallestNote}> + </TouchableOpacity>
          </View>
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.button} onPress={decreaseNumMeasures} > - </TouchableOpacity>
            <Text style={styles.label}>#Measures: {numMeasures}</Text>
            <TouchableOpacity style={styles.button} onPress={increaseNumMeasures} > + </TouchableOpacity>
          </View>
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.button} onPress={decreaseRhythmVariability} > - </TouchableOpacity>
            <Text style={styles.label}>
              Rhythm Variability: {rhythmVariability} %
            </Text>
            <TouchableOpacity style={styles.button} onPress={increaseRhythmVariability} > + </TouchableOpacity>
          </View>

        </View>
          {/* Measure */}
          <View style={styles.parentContainer}>
            <Measure
              onTempoChange={(newTempo) => setMillisecondsPerNote(newTempo)} // Add tempo change handler
              currentMeasure={currentMeasure}
              setCurrentMeasure={setCurrentMeasure}
              allowTriplets={allowTriplets}
              setAllowTriplets={setAllowTriplets}
            />
          </View>
                    {/* Current Melody */}
          <Text style={[styles.label,style={color:'#558'}]}>
            Melody:{' '}
            {generatedMelody.length > 0
              ? generatedMelody.join(', ')
              : 'Loading...'}
          </Text>
        </>
      ) : (
        <Text>Loading...</Text>
      )}
    </View>
  );
};

export default App;
