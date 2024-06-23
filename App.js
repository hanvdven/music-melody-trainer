import React, { useState, useEffect, useCallback } from 'react';
import {
  Text,
  View,
  Button,
  Switch,
  Slider,
  Picker,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { Audio } from 'expo-av';
// import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import * as Font from 'expo-font';

import useInitializeSounds from './useInitializeSounds';
import Measure from './Measure';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '90%',
    marginBottom: 20,
    position: 'relative',
  },
  pickerButton: {
    backgroundColor: '#00AA00',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerButtonText: {
    color: '#fff', // Default button text color for iOS
    fontSize: 15,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  label: {
    fontSize: 18,
    marginBottom: 10,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '90%',
    marginBottom: 20,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    width: '80%',
    maxHeight: '80%',
  },
  option: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  noteText: {
    // alignItems: 'center',
    fontFamily: 'Maestro',
    marginVertical: 5,
    fontSize: 30,
    height: 35, // Adjust height as needed
    lineHeight: 45,
    // width: 60,
    marginTop: 0, // Move text up to clip from the top
    paddingTop: -40, // Adjust padding to fine-tune the clipping
    overflow: 'hidden',
    textAlign: 'center',
    // backgroundColor: '#ccc'
  },
});

const App = () => {
  const [isInitialized, setIsInitialized] = useState(false); // State to track initialization
  const [fontsLoaded] = useFonts({
    Maestro: require('./assets/fonts/Maestro.ttf'),
  });

  const { modes, scaleTypes, notesFiles, notes, sounds } =
    useInitializeSounds();

  useEffect(() => {
    if (Object.keys(sounds).length > 0) {
      setIsInitialized(true);
    }
  }, [sounds]);

  const [tonic, setTonic] = useState('C4'); // Default to C
  const [selectedScaleType, setSelectedScaleType] = useState('Diatonic'); // Default to Diatonic
  const [selectedMode, setSelectedMode] = useState('I. Ionian (Major)'); // Default to Ionian (Major)
  const [melodyLength, setMelodyLength] = useState(8); // Default melody length
  const [melodyRange, setMelodyRange] = useState(8); // Default melody range (one octave)
  const [currentScale, setCurrentScale] = useState([]);
  const [currentMeasure, setCurrentMeasure] = useState([4, 4]);
  //
  const [generatedMelody, setGeneratedMelody] = useState([
    'C4',
    'E4',
    'G4',
    'C5',
  ]); // State for storing the generated melody
  const [generatedBassLine, setGeneratedBassLine] = useState([
    'C4',
    null,
    null,
    null,
  ]); // State for storing the generated bass line
  const [generatedClickTrack, setGeneratedClickTrack] = useState([
    'k',
    'k',
    'k',
    'k',
  ]);
  // const [melodyArray, setMelodyArray] = useState([[], []]); // State for storing the generated melody
  // Define quarterNoteSlots globally

  // Modal Views
  const [isTonicModalVisible, setTonicModalVisible] = useState(false);
  const [isScaleTypeModalVisible, setScaleTypeModalVisible] = useState(false);
  const [isModeModalVisible, setModeModalVisible] = useState(false);
  // set rhythm parameters
  const [allowTriplets, setAllowTriplets] = useState(false); // default triplet allowance
  // inherit Meausure state
  const [millisecondsPerNote, setMillisecondsPerNote] = useState(500); // State for milliseconds per beat
  const [noteDivisions, setNoteDivisions] = useState(1);
  // Function to handle tempo change
  const handleTempoChange = (newMillisecondsPerNote) => {
    setMillisecondsPerNote(newMillisecondsPerNote); // Update milliseconds per beat in App.js state
    // You can perform any additional logic related to tempo change here
  };

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
  const increaseMelodyLength = () => {
    setMelodyLength((prev) => prev + 1);
  };
  const decreaseMelodyLength = () => {
    setMelodyLength((prev) => (prev > 1 ? prev - 1 : 1));
  };

  const increaseMelodyRange = () => {
    setMelodyRange((prev) => prev + 1);
  };
  const decreaseMelodyRange = () => {
    setMelodyRange((prev) => (prev > 1 ? prev - 1 : 1));
  };

  const [numMeasures, setNumMeasures] = useState(2); // default number of measures
  const increaseNumMeasures = () => {
    setNumMeasures((prev) => prev + 1);
  };
  const decreaseNumMeasures = () => {
    setNumMeasures((prev) => (prev > 1 ? prev - 1 : 1));
  };

  const [rhythmVariability, setRhythmVariability] = useState(20); // default variability (0 to 1)
  const increaseRhythmVariability = () => {
    setRhythmVariability((prev) => (prev < 100 ? prev + 10 : 100));
  };
  const decreaseRhythmVariability = () => {
    setRhythmVariability((prev) => (prev > 0 ? prev - 10 : 0));
  };

  const noteDurations = ['x', 'e', 'q', 'h', 'w'];
  const noteFrac = [16, 8, 4, 2, 1];
  const [currentNoteIndex, setCurrentNoteIndex] = useState(2); // Start with 'quarter' (index 2)
  const [smallestNote, setSmallestNote] = useState(
    noteDurations[currentNoteIndex]
  );
  const increaseSmallestNote = () => {
    setCurrentNoteIndex((prevIndex) =>
      prevIndex === noteDurations.length - 1
        ? noteDurations.length - 1
        : prevIndex + 1
    );
    setSmallestNote(
      noteDurations[
        currentNoteIndex === noteDurations.length - 1
          ? noteDurations.length - 1
          : currentNoteIndex + 1
      ]
    );
  };

  const decreaseSmallestNote = () => {
    setCurrentNoteIndex((prevIndex) => (prevIndex === 0 ? 0 : prevIndex - 1));
    setSmallestNote(
      noteDurations[currentNoteIndex === 0 ? 0 : currentNoteIndex - 1]
    );
  };

  {
    /* Setting Scale */
  }
  const generateScale = useCallback(
    (tonic, mode) => {
      if (!modes.hasOwnProperty(selectedScaleType)) {
        console.error(`Scale type '${selectedScaleType}' not found in modes.`);
        return [];
      }

      const scaleType = modes[selectedScaleType];

      if (!scaleType.hasOwnProperty(mode)) {
        console.error(
          `Mode '${mode}' not found for scale type '${selectedScaleType}'.`
        );
        return [];
      }

      const intervals = scaleType[mode];

      if (!Array.isArray(intervals)) {
        console.error(
          `Intervals for mode '${mode}' in scale type '${selectedScaleType}' are invalid.`
        );
        return [];
      }

      const scale = [];
      let noteIndex = notes.indexOf(tonic);

      for (let i = 0; i < melodyRange; i++) {
        const interval = intervals[i % intervals.length]; // Use modulus to loop through intervals
        const note = notes[noteIndex % notes.length]; // Use modulus to loop through notes
        scale.push(note);
        noteIndex += interval;
      }

      return scale;
    },
    [selectedScaleType, modes, notes, melodyRange]
  );

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

  {
    /* Play Sound */
  }
  const playSound = async (note) => {
    try {
      await sounds[note].replayAsync();
    } catch (error) {
      console.error('Failed to play sound', error);
    }
  };

  //
  //
  //

  const generateMelody = useCallback(
    (
      scale,
      melodyLength,
      currentNoteIndex,
      currentMeasure,
      numMeasures,
      noteFrac
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
      const measureLength = currentMeasure[1];
      let smallestNoteValue = measureLength;
      let division = currentMeasure[0];

      while (division % 2 === 0) {
        division /= 2;
        smallestNoteValue /= 2;
      }

      // Step 3: Determine the number of slots
      const noteLength = noteFrac[currentNoteIndex];
      const slotLength = Math.max(smallestNoteValue, noteLength); // Highest divisor : (e.g., 8 for 1/8 measure with quarter notes)
      const numberOfSlots =
        (slotLength * currentMeasure[0]) / currentMeasure[1];
      // Determine the length of a quarter note
      const quarterNoteSlots = slotLength / 4;
      // Calculate norm for looping array at right tempo (using quarter note as standard reference for now..)
      const noteDivisions = quarterNoteSlots;
      // Step 4: Populate melodyArray with placeholders based on divisors
      function getDivisors(n) {
        let divisors = [];
        for (let i = 2; i <= n; i++) {
          if (n % i === 0) {
            divisors.unshift(i*noteLength/currentMeasure[1]);
          }
        }
        console.log('Divisors:', n, divisors, noteLength, currentMeasure[1]);
        return divisors;
      }

      function getNearDivisors(n) {
        let nearDivisors = [];
        for (let i = 2; i <= n; i++) {
          if (n % i === 1) {
            nearDivisors.unshift(i);
          } else if (n % i === -1) {
            nearDivisors.unshift(i*noteLength/currentMeasure[1]);
          }
        }
        console.log('near Divisors:', nearDivisors);
        return nearDivisors;
      }

      for (let i = 0; i < numMeasures; i++) {
        let measureSlots = Array(numberOfSlots).fill(null);
        let divisors = getDivisors(currentMeasure[0]);
        let nearDivisors = getNearDivisors(currentMeasure[0]);
        // Loop through the divisors to place the ranking number in appropriate slots
        for (let div of divisors) {
          // Calculate the ranking number (1 + number of non-empty array slots)
          let rank = 1 + measureSlots.filter((slot) => slot !== null).length;
          for (let j = 0; j < numberOfSlots; j++) {
            if (
              measureSlots[j] === null &&
              ((j % div) * currentMeasure[1]) / slotLength === 0
            ) {
              measureSlots[j] = rank;
            }
          }
        }
        for (let div of nearDivisors) {
          // Calculate the ranking number (1 + number of non-empty array slots)
          let rank = 1 + measureSlots.filter((slot) => slot !== null).length;
          for (let j = 0; j < numberOfSlots; j++) {
            if (
              measureSlots[j] === null &&
              ((j % div) * currentMeasure[1]) / slotLength === 0
            ) {
              measureSlots[j] = rank;
            }
          }
        }

        // Fill remaining slots in ranking order
        let rank = 1 + measureSlots.filter((slot) => slot !== null).length;
        for (let j = 0; j < numberOfSlots; j++) {
          if (measureSlots[j] === null) {
            measureSlots[j] = rank;
            rank++;
          }
        }

        melodyArray[i] = measureSlots;
      }

      console.log('Generated Melody Array:', melodyArray);

      // Step 5: Generate the melody
      const melodyNotes = [];
      for (let i = 0; i < melodyLength; i++) {
        const index = Math.floor(Math.random() * scale.length);
        melodyNotes.push(scale[index]);
      }

      // Step 6: Flatten melodyArray
      const generatedMelody = melodyArray.flatMap((slot) => slot);

      // Step 7: Replace slots in generatedMelody with generated melody notes
      let melodyIndex = 0;
      let rank = 1;

      while (
        melodyIndex < melodyNotes.length &&
        rank <= numMeasures * numberOfSlots
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
        for (let j = 0; j < numberOfSlots; j++) {
          if (j % noteDivisions === 0) {
            // Insert 'k' every noteDivision (counting note)
            clickTrack[i].push('k');
          } else {
            clickTrack[i].push(null);
          }
        }
      }

      // Populate bassLineArray
      for (let i = 0; i < numMeasures; i++) {
        for (let j = 0; j < numberOfSlots; j++) {
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
      const scale = generateScale(tonic, selectedMode);
      if (!scale || scale.length === 0) {
        console.error('Scale is empty or undefined');
        return;
      }

      const {
        generatedMelody,
        generatedBassLine,
        generatedClickTrack,
        noteDivisions,
      } = generateMelody(
        scale,
        melodyLength,
        currentNoteIndex,
        currentMeasure,
        numMeasures,
        noteFrac
      );

      setGeneratedMelody(generatedMelody);
      setGeneratedBassLine(generatedBassLine);
      setGeneratedClickTrack(generatedClickTrack);
      setNoteDivisions(noteDivisions);

      console.log('generated click track:', generatedClickTrack);
      console.log('Generated Bass Line:', generatedBassLine);
      console.log('Generated Melody', generatedMelody);

      // useEffect will start playback.
    } catch (error) {
      console.error('Error playing random melody', error);
    }
  };

  useEffect(() => {
    if (generatedMelody && generatedBassLine && generatedClickTrack) {
      playAllTracks(); // Trigger playback when all tracks are generated
    }
  }, [generatedMelody, generatedBassLine, generatedClickTrack]);

  const playAllTracks = async () => {
    try {
      // Assuming generatedMelody, generatedBassLine, and clickTrack are already populated
      const maxLength = Math.max(
        generatedMelody.length,
        generatedBassLine.length,
        generatedClickTrack.length
      );

      for (let i = 0; i < maxLength; i++) {
        const melodyNote = generatedMelody[i] || null;
        const bassNote = generatedBassLine[i] || null;
        const click = generatedClickTrack[i] || null;

        // Play all notes simultaneously
        await Promise.all([
          playSoundIfNotNull(melodyNote),
          playSoundIfNotNull(bassNote),
          playClickIfNotNull(click),
        ]);

        // Wait for the specified delay between each note
        await new Promise((resolve) =>
          setTimeout(resolve, millisecondsPerNote / noteDivisions)
        );
      }
    } catch (error) {
      console.error('Error playing all tracks', error);
    }
  };

  const playSoundIfNotNull = async (note) => {
    if (note !== null) {
      await playSound(note);
    }
  };

  const playClickIfNotNull = async (click) => {
    if (click !== null) {
      await playSound(click);
    }
  };
  //
  const repeatMelody = async () => {
    try {
      if (
        !generatedMelody ||
        generatedMelody.length === 0 ||
        !generatedBassLine ||
        generatedBassLine.length === 0 ||
        !generatedClickTrack ||
        generatedClickTrack.length === 0
      ) {
        console.error(
          'Generated melody, bass line, or click track is empty or undefined'
        );
        return;
      }

      await playAllTracks();
    } catch (error) {
      console.error('Error playing repeated melody', error);
    }
  };

  const playScale = async () => {
    for (let note of currentScale) {
      await playSound(note);
      await new Promise((resolve) => setTimeout(resolve, millisecondsPerNote));
    }
  };

  useEffect(() => {
    const updateCurrentScale = () => {
      try {
        const scale = generateScale(tonic, selectedMode);
        setCurrentScale(scale);
      } catch (error) {
        console.error('Error updating current scale', error);
        setCurrentScale([]);
      }
    };

    updateCurrentScale();
  }, [tonic, selectedMode, melodyRange, generateScale]);

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
                style={styles.option}
                onPress={() => {
                  onValueChange(item);
                  setVisible(false);
                }}>
                <Text>{item}</Text>
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
    <View style={styles.container}>
      {/* Conditionally render based on initialization state */}
      {true ? (
        <>
          {/* Select Tonic */}
          <View style={styles.pickerRow}>
            <Text style={[styles.label, { fontSize: 14 }]}>Tonic</Text>
            <TouchableOpacity
              style={[styles.pickerButton, { backgroundColor: '#036' }]}
              onPress={() => setTonicModalVisible(true)}>
              <Text style={styles.pickerButtonText}>{tonic}</Text>
            </TouchableOpacity>
          </View>
          {renderPickerModal(
            notes,
            tonic,
            setTonic,
            isTonicModalVisible,
            setTonicModalVisible
          )}

          {/* Select Scale Type */}
          <View style={styles.pickerRow}>
            <Text style={[styles.label, { fontSize: 14 }]}>Scale Family</Text>
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
            setSelectedScaleType,
            isScaleTypeModalVisible,
            setScaleTypeModalVisible
          )}

          {/* Select Mode */}
          <View style={styles.pickerRow}>
            <Text style={[styles.label, { fontSize: 14 }]}>Mode</Text>
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

          {/* Current Scale */}
          <Text style={styles.label}>
            Scale:{' '}
            {currentScale.length > 0 ? currentScale.join(', ') : 'Loading...'}
          </Text>
          {/* Current Melody */}
          <Text style={styles.label}>
            Melody:{' '}
            {generatedMelody.length > 0
              ? generatedMelody.join(', ')
              : 'Loading...'}
          </Text>

          {/* Melody Range */}
          <View style={styles.buttonContainer}>
            <Button title="-" onPress={decreaseMelodyRange} />
            <Text style={styles.label}>Range: {melodyRange}</Text>
            <Button title="+" onPress={increaseMelodyRange} />
          </View>

          {/* Play buttons */}
          <View style={styles.buttonContainer}>
            <Button title="⏵random melody" onPress={playRandomMelody} />
            <Button title="↪ again!" onPress={repeatMelody} />
            <Button title="⏵ Scale" color="#066" onPress={playScale} />
          </View>

          {/* Melody Length */}
          <View style={styles.buttonContainer}>
            <Button title="-" color="#05f" onPress={decreaseMelodyLength} />
            <Text style={styles.label}>Melody Length: {melodyLength}</Text>
            <Button title="+" onPress={increaseMelodyLength} />
          </View>
          {/* Rhythm Settings */}
          <View style={styles.buttonContainer}>
            <Button title="-" color="#05f" onPress={decreaseSmallestNote} />
            <Text style={styles.label}>smallestNote: </Text>
            <Text style={styles.noteText}> {smallestNote} </Text>
            <Button title="+" onPress={increaseSmallestNote} />
          </View>
          <View style={styles.buttonContainer}>
            <Button title="-" color="#05f" onPress={decreaseNumMeasures} />
            <Text style={styles.label}>#Measures: {numMeasures}</Text>
            <Button title="+" onPress={increaseNumMeasures} />
          </View>
          <View style={styles.buttonContainer}>
            <Button
              title="-"
              color="#05f"
              onPress={decreaseRhythmVariability}
            />
            <Text style={styles.label}>
              Rhythm Variability: {rhythmVariability} %
            </Text>
            <Button title="+" onPress={increaseRhythmVariability} />
          </View>
          <Text style={styles.label}>Allow Triplets:</Text>
          <Switch
            value={allowTriplets}
            onValueChange={(value) => setAllowTriplets(value)}
          />

          {/* Measure */}
          <View style={styles.container}>
            <Measure
              onTempoChange={handleTempoChange}
              currentMeasure={currentMeasure}
              setCurrentMeasure={setCurrentMeasure}
            />
          </View>
        </>
      ) : (
        <Text>Loading...</Text>
      )}
    </View>
  );
};

export default App;
