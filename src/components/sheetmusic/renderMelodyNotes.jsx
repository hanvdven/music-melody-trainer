import React from 'react';
import { generateAccidentalMap } from './generateAccidentalMap';

// Melody Notes
const noteYMap = {
  C2: 131,
  D2: 126,
  E2: 121,
  F2: 116,
  G2: 111,
  A2: 106,
  B2: 101,
  C3: 96,
  D3: 91,
  E3: 86,
  F3: 81,
  G3: 76,
  A3: 71,
  B3: 66,
  C4: 61,
  D4: 56,
  E4: 51,
  F4: 46,
  G4: 41,
  A4: 36,
  B4: 31,
  C5: 26,
  D5: 21,
  E5: 16,
  F5: 11,
  G5: 6,
  A5: 1,
  B5: -4,
  C6: -9,
  cc: 161, // Crash Cymbal
  hh: 166, // Hi-hat
  ho: 166, //
  cr: 171, // Ride Cymbal
  th: 176, // High Tom
  tm: 181, // Med Tom
  s: 186, // Snare drum
  tl: 196, // Floor Tom
  b: 206, // Bass drum
  hp: 211, // Hi-hat pedal
  k: 181, // High Woodblock / metronome click
  c: 186, // Low Woodblock / metronome click
};

const durationNoteMap = {
  3: 'Ï',
  6: 'Ï',
  9: 'Ï',
  12: 'Ï',
  18: 'Ï',
  21: 'Ï',
  24: 'ú',
  36: 'ú',
  42: 'ú',
  48: 'w',
  72: 'w',
};

const percussionNoteHeads = {
  cc: 'À', // Crash Cymbal
  hh: 'À', // Hi-hat
  ho: 'á', // Hi-hat (open)
  cr: 'À', // Ride Cymbal
  th: 'Ï', // High Tom
  tm: 'Ï', // Med Tom
  s: 'Ï', // Snare drum
  tl: 'Ï', // Floor Tom
  b: 'Ï', // Bass drum
  hp: 'À', // Hi-hat pedal
  k: 'Ñ', // High metronome click
  c: 'Ñ', // Low metronome click
};

const durationDotMap = {
  72: 'k',
  42: 'kk',
  36: 'k',
  21: 'kk',
  18: 'k',
  9: 'k',
};

const durationFlagMapDown = {
  9: 'J', // Eighth flag
  6: 'J', // Eighth flag
  3: 'R', // Sixteenth flag
};

const durationFlagMapUp = {
  9: 'j', // Eighth flag
  6: 'j', // Eighth flag
  3: 'r', // Sixteenth flag
};

// Rests
const restMap = {
  72: '·k',
  48: '·',
  42: 'îkk',
  36: 'îk',
  24: 'î',
  21: 'Îkk',
  18: 'Îk',
  12: 'Î',
  9: 'äk',
  6: 'ä',
  3: 'Å',
};

const ledgerLinesMapTreble = {
  F3: [61, 71, 81],
  G3: [61, 71],
  A3: [61, 71],
  B3: [61],
  C4: [61],
  A5: [1],
  B5: [1],
  C6: [1, -9],
};

const ledgerLinesMapBass = {
  // 'F3': [61,71,81],
  // 'G3': [61,71],
  // 'A3': [61,71],
  // 'B3': [61],
  C4: [81],
  D4: [81],
  E4: [81, 71],
  F4: [81, 71],
  G4: [81, 71, 61],
};

const renderMelodyNotes = (
  melody,
  numAccidentals,
  startX,
  noteWidth,
  allTimeStamps,
  staff = 'treble'
) => {
  const melodyNotes = melody.notes;
  const melodyDurations = melody.durations;
  const melodyTimeStamps = melody.timeStamps;
  const melodyTies = melody.ties;

  const accidentals = generateAccidentalMap(melodyNotes, numAccidentals);

  return melodyNotes.map((noteWithAccidental, index) => {
    const positionX = startX + allTimeStamps.indexOf(melodyTimeStamps[index]) * noteWidth;
    const duration = melodyDurations[index];
    const note = noteWithAccidental ? noteWithAccidental.replace(/[♭º♯Ü]/g, '') : null;

    const noteSymbol = staff === 'percussion' ? percussionNoteHeads[note] : durationNoteMap[duration];
    const dot = durationDotMap[duration];
    const articulation = melodyTies[index];
    const restY = note ? (staff === 'bass' ? 115 : staff === 'percussion' ? 195 : 35) : null;

    if (note === 'r') {
      return (
        <text
          key={index}
          x={positionX}
          y={restY}
          fontSize="32"
          fill="var(--text-primary)"
          fontFamily="Maestro"
        >
          {restMap[duration]}
        </text>
      );
    } else if (note) {
      const positionY = noteYMap[note] + (staff === 'bass' ? 20 : 0);
      const flagsUp = (positionY > 31 && staff === 'treble') || (positionY > 115 && staff === 'bass');
      const lineX = flagsUp ? positionX + 10 : positionX + 0.5;
      const lineYstart = flagsUp ? positionY - 1 : positionY + 1;
      const lineYend = flagsUp ? positionY - 25 : positionY + 25;
      const ledgerLines = staff === 'bass' ? ledgerLinesMapBass[note] || [] : ledgerLinesMapTreble[note] || [];
      const flagSymbol = flagsUp ? durationFlagMapUp[duration] : durationFlagMapDown[duration];
      const flagX = flagsUp ? positionX + 8.5 : positionX - 1;
      const flagY = flagsUp ? positionY - 20 : positionY + 18;

      let nextNoteIndex = -1;
      for (let i = index + 1; i < melodyTimeStamps.length; i++) {
        if (melodyTimeStamps[i] !== null) {
          nextNoteIndex = i;
          break;
        }
      }
      const nextPositionX = nextNoteIndex !== -1 ? startX + allTimeStamps.indexOf(melodyTimeStamps[nextNoteIndex]) * noteWidth : null;

      return (
        <React.Fragment key={index}>
          {ledgerLines.map((y, idx) => (
            <path key={`ledger-${index}-${idx}`} d={`M ${positionX - 6} ${y} H ${positionX + 18}`} stroke="var(--text-primary)" strokeWidth="0.5" />
          ))}
          <text x={positionX} y={positionY} fontSize="32" fill="var(--text-primary)" fontFamily="Maestro">{noteSymbol}</text>
          <text x={positionX + 13} y={positionY - 0.5 + (positionY % 10)} fontSize="32" fill="var(--text-primary)" fontFamily="Maestro">{dot}</text>
          {duration < 48 && <path d={`M ${lineX} ${lineYstart} V ${lineYend}`} stroke="var(--text-primary)" strokeWidth="1" />}
          <text x={flagX} y={flagY} fontSize="32" fill="var(--text-primary)" fontFamily="Maestro">{flagSymbol}</text>
          <text x={positionX - 4} y={positionY - 3} fontSize="32" fill="var(--text-primary)" fontFamily="Maestro" textAnchor="end">
            {staff === 'percussion' ? null : accidentals[index]}
          </text>
          {articulation === 'tie' && nextPositionX !== null && (
            <path
              d={`M ${positionX + 4} ${flagsUp ? positionY + 7 : positionY - 6} 
                 C ${positionX + 4 + noteWidth / 3} ${flagsUp ? positionY + 14 : positionY - 13}, 
                   ${nextPositionX - noteWidth / 3} ${flagsUp ? positionY + 14 : positionY - 13}, 
                   ${nextPositionX} ${flagsUp ? positionY + 7 : positionY - 6}`}
              stroke="var(--text-primary)"
              strokeWidth="1"
              fill="none"
            />
          )}
        </React.Fragment>
      );
    }

    return null;
  });
};

export { renderMelodyNotes };