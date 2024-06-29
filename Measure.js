// Measure.js

import React, { useState } from 'react';
import { View, Text, Switch, TouchableOpacity } from 'react-native';
import styles from './styles';

const tempoTerms = [
  { bpm: 0, term: 'Larghissimo' },
  { bpm: 35, term: 'Larghissimo (Grave)' },
  { bpm: 40, term: 'Largo (Grave)' },
  { bpm: 45, term: 'Largo (Lento)' },
  { bpm: 60, term: 'Larghetto' },
  { bpm: 66, term: 'Adagio' },
  { bpm: 72, term: 'Adagietto' },
  { bpm: 76, term: 'Andante' },
  { bpm: 80, term: 'Andante (Andantino)' },
  { bpm: 92, term: 'Andante Moderato' },
  { bpm: 108, term: 'Moderato' },
  { bpm: 112, term: 'Allegretto (Moderato)' },
  { bpm: 116, term: 'Allegro Moderato' },
  { bpm: 120, term: 'Allegro' },
  { bpm: 140, term: 'Allegro (Vivace)' },
  { bpm: 168, term: 'Presto' },
  { bpm: 172, term: 'Allegrissimo (Vivacissimo)' },
  { bpm: 176, term: 'Presto' },
  { bpm: 200, term: 'Prestissimo' },
];

const getTempoTerm = (bpm) => {
  const reversedTerms = [...tempoTerms].reverse();
  const term = reversedTerms.find((term) => bpm >= term.bpm);
  return term ? term.term : 'Unknown';
};

const Measure = ({ currentMeasure, setCurrentMeasure, onTempoChange, allowTriplets, setAllowTriplets }) => {
  const [bpm, setBpm] = useState(120);
  const [millisecondsPerNote, setMillisecondsPerNote] = useState(500);

  const increaseBpm = () => {
    const newBpm = bpm + 5;
    setBpm(newBpm);
    updateMillisecondsPerNote(newBpm);
  };

  const decreaseBpm = () => {
    const newBpm = bpm > 10 ? bpm - 5 : 10;
    setBpm(newBpm);
    updateMillisecondsPerNote(newBpm);
  };

  const updateMillisecondsPerNote = (newBpm) => {
    const newMillisecondsPerNote = 60000 / newBpm;
    setMillisecondsPerNote(newMillisecondsPerNote);
    onTempoChange(newMillisecondsPerNote);

    // Force stop/restart playback with a new key to ensure immediate effect of tempo change
    setPlaybackKey(prevKey => prevKey + 1);
  };
  const incrementTop = () => {
    setCurrentMeasure([currentMeasure[0] + 1, currentMeasure[1]]);
  };

  const decrementTop = () => {
    setCurrentMeasure([currentMeasure[0] > 1 ? currentMeasure[0] - 1 : 1, currentMeasure[1]]);
  };

  const incrementBottom = () => {
    const newMeasureNorm = currentMeasure[1] === 4 ? 8 : 16;
    setCurrentMeasure([currentMeasure[0], newMeasureNorm]);
  };

  const decrementBottom = () => {
    const newMeasureNorm = currentMeasure[1] === 16 ? 8 : 4;
    setCurrentMeasure([currentMeasure[0], newMeasureNorm]);
  };

  return (
    <View style={[styles.buttonContainer, style={alignItems:'flex-start'}]}>
      <View style={styles.metronomeContainer}>
        <Text style={styles.label}>Tempo</Text>
        <View style={styles.row}>
          <TouchableOpacity onPress={decreaseBpm}>
            <Text style={styles.button}>-</Text>
          </TouchableOpacity>
          <Text style={styles.noteText}>q</Text>
          <Text style={styles.label}> =</Text>
          <Text style={styles.bpmText}>{bpm}</Text>
          <TouchableOpacity onPress={increaseBpm}>
            <Text style={styles.button}>+</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.tempoTerm}>{getTempoTerm(bpm)}</Text>
      </View>
      <View style={[styles.container,style={zIndex: 1}]}>
        <Text style={styles.label}>Measure</Text>
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
            <Text style={styles.button}>-</Text>
          </TouchableOpacity>
          <Text style={styles.measureText}>{currentMeasure[1]}</Text>
          <TouchableOpacity onPress={incrementBottom}>
            <Text style={styles.button}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.container}>
          <Text style={styles.label}>Triplets</Text>
          <br/>
          <Switch
            value={allowTriplets}
            onValueChange={(value) => setAllowTriplets(value)}
          />
      </View>
    </View> 
  );
};

export default Measure;