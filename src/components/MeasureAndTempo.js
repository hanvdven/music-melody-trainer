// MeasureAndTempo.js

import React, { useState } from 'react';
import { View, Text, Switch, TouchableOpacity } from 'react-native';
import { styles, colors } from './styles';
import PickerButton from './PickerButton';

import { tempoTerms, getTempoTerm } from '../utils/tempo';

const MeasureAndTempo = ({ timeSignature, setTimeSignature, bpm, updateBpm, numMeasures, setNumMeasures }) => {

  const increaseBpm = () => {
    const newBpm = bpm + 5;
    updateBpm(newBpm);
  };

  const decreaseBpm = () => {
    const newBpm = bpm > 10 ? bpm - 5 : 10;
    updateBpm(newBpm);
  };

  const incrementNumMeasures = () => {
    const newNM = numMeasures < 10 ? numMeasures + 1 : 10;
    setNumMeasures(newNM);
  };

  const decrementNumMeasures = () => {
    const newNM = numMeasures > 1 ? numMeasures - 1 : 1;
    setNumMeasures(newNM);
  };

  const incrementTop = () => {
    setTimeSignature([timeSignature[0] + 1, timeSignature[1]]);
  };

  const decrementTop = () => {
    setTimeSignature([timeSignature[0] > 1 ? timeSignature[0] - 1 : 1, timeSignature[1]]);
  };

  const incrementBottom = () => {
    const newMeasureNorm = timeSignature[1] === 4 ? 8 : 16;
    setTimeSignature([timeSignature[0], newMeasureNorm]);
  };

  const decrementBottom = () => {
    const newMeasureNorm = timeSignature[1] === 16 ? 8 : 4;
    setTimeSignature([timeSignature[0], newMeasureNorm]);
  };

  return (
    <View style={[styles.settings, { backgroundColor: colors.measureAndScaleActive }]}>
      <Text style={styles.tabTitle}>Measure and Tempo</Text>

      <View style={styles.pickerRow}>
        <Text style={styles.label}>Tempo</Text>
        <PickerButton onPress={decreaseBpm} label="-" />
        <View style={styles.metronomeContainer}>
          <Text style={styles.noteText}>q</Text>
          <Text style={styles.label}> =</Text>
          <Text style={styles.bpmText}>{bpm}</Text>
        </View>
        <PickerButton onPress={increaseBpm} label="+" />
        <Text style={styles.tempoTerm}>{getTempoTerm(bpm)}</Text>
      </View>

      <View style={styles.pickerRow}>
        <Text style={styles.label}>Measure</Text>
        <View style={styles.measureContainer}>
          <View style={styles.measureRow}>
            <PickerButton onPress={decrementTop} label="-" />
            <Text style={styles.measureText}>{timeSignature[0]}</Text>
            <PickerButton onPress={incrementTop} label="+" />
          </View>
          <View style={styles.measureRow}>
            <PickerButton onPress={decrementBottom} label="-" />
            <Text style={styles.measureText}>{timeSignature[1]}</Text>
            <PickerButton onPress={incrementBottom} label="+" />
          </View>
        </View>
      </View>

      <View style={styles.pickerRow}>
        <PickerButton onPress={decrementNumMeasures} label="-" />
        <Text style={styles.label}> Number of Measure {numMeasures}</Text>
        <PickerButton onPress={incrementNumMeasures} label="+" />
      </View>
    </View>
  );
};

export default MeasureAndTempo;