// Piano.js
import React, { useMemo } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

const Piano = ({ scaleRange, tonic, currentScale, playSound, currentDisplayScale, notes }) => {

  const findNoteIndex = (note) => notes.findIndex(n => n === note);
  const tonicIndex = findNoteIndex(tonic);
  const noteDisplayName = (note) => {
    if (note === 'placeholder') {
      return '';
    } else if (currentScale.includes(note)) {
      return currentDisplayScale[currentScale.indexOf(note)];
    }
    return note;
  }

  const generateWhiteKeys = (tonicIndex, range) => {
    let keys = [];
    let startIndex = tonicIndex;
    let lastIndex = startIndex + range;

    // Adjust startIndex to ensure first and last white key are correct
    console.log('notes[tonicIndex]',notes[tonicIndex])
    if (notes[tonicIndex].includes('♯') || notes[tonicIndex].includes('♭')) {
      startIndex -= 1;
    }
    console.log('notes[tonicIndex + range]',notes[tonicIndex + range])
    if (notes[tonicIndex + range].includes('♯') || notes[tonicIndex + range].includes('♭')) {
      lastIndex += 1;
    }

    
    for (let i = startIndex; i <= lastIndex; i++) {
      if (!notes[i].includes('♯') && !notes[i].includes('♭')) {
        keys.push(notes[i]);
      }
    }
    return keys;
  };

  const generateBlackKeys = (whiteKeys) => {
    let blackKeys = ['halfKey'];
       for (let i = 0; i < whiteKeys.length - 1; i++) {
      const currentNote = whiteKeys[i];
      const currentNoteIndex = findNoteIndex(currentNote);
    
      if (currentNote.startsWith('E') || currentNote.startsWith('B')) {
        blackKeys.push('placeholder');
      } else {
        blackKeys.push(notes[currentNoteIndex + 1]);
      }
    }
    blackKeys.push('halfKey')
    return blackKeys;
  };

  const pianoWhiteKeys = generateWhiteKeys(tonicIndex, scaleRange);
  const pianoBlackKeys = generateBlackKeys(pianoWhiteKeys);

  return (
    <View style={styles.pianoContainer}>
      <View style={styles.pianoWhite}>
        {pianoWhiteKeys.map((note, index) => {
          const isInCurrentScale = currentScale.includes(note);
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.whiteKey,
                isInCurrentScale && styles.highlightedWhiteKey,
              ]}
              onPress={() => playSound(note)}
            >
              <Text style={styles.whiteKeyText}>{noteDisplayName(note)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.pianoBlack}>
        {pianoBlackKeys.map((note, index) => {
          const isInCurrentScale = currentScale.includes(note);
          if (note === 'halfKey') {
            return (
              <View
                key={index}
                style={styles.halfKey}
              />
            );
          }
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.blackKey,
                note === 'placeholder' && {backgroundColor:'transparent'},
                isInCurrentScale && styles.highlightedBlackKey,
              ]}
              onPress={() => playSound(note)}
            >
              <Text style={styles.blackKeyText}>{noteDisplayName(note)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  pianoContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start', // Align keys at the top
    width: '90%',
    position: 'relative', // Ensure positioning context
    height: 190,
  },
  pianoWhite: {
    position: 'absolute',
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    zIndex: 1, // Ensure white keys are above black keys
  },
  pianoBlack: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    width: '100%',
    zIndex: 2, // Black keys behind white keys
  },
  whiteKey: {
    flex: 1,
    height: 180,
    margin: 1,
    backgroundColor: '#bbd',
    borderWidth: 2,
    borderColor: '#000',
    justifyContent: 'flex-end', // Align text at the bottom
    alignItems: 'center',
    paddingBottom: 5, // Add padding to the bottom for spacing
  },
  blackKey: {
    flex: 1,
    backgroundColor: '#000',
    marginHorizontal: 6,
    width: 30, // Adjusted width for slimmer appearance
    height: 130,
    justifyContent: 'flex-end', // Align text at the bottom
    alignItems: 'center',
    paddingBottom: 5, // Add padding to the bottom for spacing
  },
  halfKey: {
    flex: 0.5,
    backgroundColor: 'transparent', // Invisible placeholder key
    marginHorizontal: 3, // Half the margin of a normal black key
    width: 30, // Half the width of a normal black key
    height: 100,
    justifyContent: 'flex-end', // Align text at the bottom
    alignItems: 'center',
    paddingBottom: 5, // Add padding to the bottom for spacing
  },
  highlightedWhiteKey: {
    backgroundColor: '#69C',
  },
  highlightedBlackKey: {
    backgroundColor: '#036',    
    borderWidth: 2,
    borderColor: '#000',
  },
  whiteKeyText: {
    fontSize: 14,
    color: '#000',
  },
  blackKeyText: {
    fontSize: 14,
    color: '#fff',
  },
});

export default Piano;