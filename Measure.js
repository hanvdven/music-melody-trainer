import React, { useState } from 'react';
import { View, Text, Button, StyleSheet, TouchableOpacity } from 'react-native';

// Italian tempo terms
const tempoTerms = [
  { bpm: 0, term: 'Larghissimo' }, //<25
  { bpm: 35, term: 'Larghissimo (Grave)' }, //<25
  { bpm: 40, term: 'Largo (Grave)' },
  { bpm: 45, term: 'Largo (Lento)' },
  { bpm: 60, term: 'Larghetto' },
  { bpm: 66, term: 'Adagio' },
  { bpm: 72, term: 'Adagietto' },
  { bpm: 76, term: 'Andante' },//76-108
  { bpm: 80, term: 'Andante (Andantino)' },
  { bpm: 92, term: 'Andante Moderato' },
  { bpm: 108, term: 'Moderato' },
  { bpm: 112, term: 'Allegretto (Moderato)' },
  { bpm: 116, term: 'Allegro Moderato' },
  { bpm: 120, term: 'Allegro' },
  { bpm: 140, term: 'Allegro (Vivace)' },
  { bpm: 168, term: 'Presto' },
  { bpm: 172, term: 'Allegrissimo (Vivacissimo)' }, // Overlapping between Vivacissimo and Allegrissimo
  { bpm: 176, term: 'Presto' },
  { bpm: 200, term: 'Prestissimo' },
];

const getTempoTerm = (bpm) => {
  const reversedTerms = [...tempoTerms].reverse(); // Reverse tempoTerms array to start from highest bpm
  const term = reversedTerms.find(term => bpm >= term.bpm); // Find the first term where bpm is greater than or equal to term's bpm
  return term ? term.term : 'Unknown'; // Return the term if found, otherwise return 'Unknown'
};

const Measure = ({ currentMeasure, setCurrentMeasure, onTempoChange }) => {
  const [bpm, setBpm] = useState(120);
  const [millisecondsPerNote, setMillisecondsPerNote] = useState(500); // Default milliseconds per beat

  // Function to increase BPM
  const increaseBpm = () => {
    const newBpm = bpm + 5; // Increment BPM by 10 (adjust as needed)
    setBpm(newBpm);
    updateMillisecondsPerNote(newBpm,currentMeasure[1]); // Update milliseconds per beat based on new BPM
  };

  // Function to decrease BPM
  const decreaseBpm = () => {
    const newBpm = bpm > 10 ? bpm - 5 : 10; // Ensure BPM doesn't go below 10
    setBpm(newBpm);
    updateMillisecondsPerNote(newBpm,currentMeasure[1]); // Update milliseconds per beat based on new BPM
  };

  // Function to update milliseconds per beat based on BPM and Measure Norm
  const updateMillisecondsPerNote = (newBpm, newMeasureNorm) => {
    const newMillisecondsPerNote = 60000 / newBpm // Calculate milliseconds per beat from BPM
    setMillisecondsPerNote(newMillisecondsPerNote);
    onTempoChange(newMillisecondsPerNote); // Notify parent component of the new milliseconds per beat
  };

  const incrementTop = () => {
    setCurrentMeasure([currentMeasure[0] + 1, currentMeasure[1]]);
  };

  const decrementTop = () => {
    setCurrentMeasure([currentMeasure[0] > 1 ? currentMeasure[0] - 1 : 1, currentMeasure[1]]);
  };

  // Increment the bottom value of the measure
  const incrementBottom = () => {
    let newMeasureNorm = currentMeasure[1] === 4 ? 8 : currentMeasure[1] === 8 ? 16 : 16;
      setCurrentMeasure([
          currentMeasure[0],
          newMeasureNorm
      ]);
      updateMillisecondsPerNote(bpm, newMeasureNorm); // Update milliseconds per note when measure changes
  };

  // Decrement the bottom value of the measure
  const decrementBottom = () => {
      let newMeasureNorm = currentMeasure[1] === 16 ? 8 : currentMeasure[1] === 8 ? 4 : 4;
      setCurrentMeasure([
          currentMeasure[0],
          newMeasureNorm,
      ]);
      updateMillisecondsPerNote(bpm, newMeasureNorm); // Update milliseconds per note when measure changes
  };

  return (
    <View style={styles.parentContainer}>
      {/* Tempo */}
      <View style={styles.metronomeContainer}>
        <Text> Tempo</Text>
        <View style={styles.row}>
          <TouchableOpacity onPress={decreaseBpm}>
            <Text style={styles.button}>-</Text>
          </TouchableOpacity>
          <View style={styles.metronomeText}>
            <Text style={styles.noteText}>q</Text><Text>=</Text><Text style={styles.bpmText}>{bpm}</Text>
          </View>
          <TouchableOpacity onPress={increaseBpm}>
            <Text style={styles.button}>+</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.tempoTerm}>{getTempoTerm(bpm)}</Text>
      </View>
      {/* Measure */}
      <View style={styles.measureContainer}>
        <Text> Measure </Text>
        <View style={styles.row}>
          <TouchableOpacity onPress={decrementTop}>
            <Text style={styles.button}>-</Text>
          </TouchableOpacity>
          <Text style={styles.measureText}>{currentMeasure[0]}</Text>
          <TouchableOpacity onPress={incrementTop}>
            <Text style={styles.button}>+</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.row}>
          <TouchableOpacity onPress={decrementBottom}>
            <Text style={[styles.button,{backgroundColor: '#0CC',}]}>-</Text>
          </TouchableOpacity>
          <Text style={styles.measureText}>{currentMeasure[1]}</Text>
          <TouchableOpacity onPress={incrementBottom}>
            <Text style={[styles.button,{backgroundColor: '#0CC',}]}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  parentContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start', // Align children containers at the top
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  measureText: {
    alignItems: 'center',
    fontFamily: 'Maestro',
    marginVertical: 5,
    fontSize: 50,
    height: 88, // Adjust height as needed
    width: 50,
    lineHeight: 125,
    marginTop: -55, // Move text up to clip from the top
    paddingTop: 0,  // Adjust padding to fine-tune the clipping
    overflow: 'hidden',
    textAlign: 'center',
  },
  button: {
    fontSize: 24,
    marginHorizontal: 5,
    width: 30,
    textAlign: 'center',
    backgroundColor: '#09C',
    color: 'white',
  },
  measureContainer: {
    alignItems: 'center',
    width: 100,
  },
  metronomeContainer: {
    alignItems: 'center',
    width: 240,
  },
  metronomeText: {
    // alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 10,
    width: 90, // Adjust width as needed
    alignItems: 'center'
  },
  bpmText: {
    // alignItems: 'center',
    fontFamily: 'Maestro',
    marginVertical: 5,
    fontSize: 50,
    height: 88, // Adjust height as needed
    lineHeight: 125,
    width: 60,
    marginTop: -55, // Move text up to clip from the top
    paddingTop: 0,  // Adjust padding to fine-tune the clipping
    overflow: 'hidden',
    textAlign: 'center',
  },
  noteText: {
    // alignItems: 'center',
    fontFamily: 'Maestro',
    marginVertical: 5,
    fontSize: 30,
    height: 35, // Adjust height as needed
    lineHeight: 50,
    // width: 60,
    marginTop: 0, // Move text up to clip from the top
    paddingTop: -40,  // Adjust padding to fine-tune the clipping
    overflow: 'hidden',
    textAlign: 'center',
    // backgroundColor: '#ccc'
  },
  tempoTerm: {
    fontFamily: 'Merriweather', // Use the chosen font
    fontStyle: 'bold',
    fontSize: 18,
    textAlign: 'center',
  },
});

export default Measure;