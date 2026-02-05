// components/PianoView.jsx
import React from 'react';
import playSound from '../../audio/playSound';
import { getRelativeNoteName, standardizeTonic } from '../generateMelody/convertToDisplayNotes';
import generateAllNotesArray from '../../utils/allNotesArray';

const PianoView = ({
  scale,
  trebleInstrument = null,
  interactionMode = 'play',
  onTonicSelect = null,
  minNote = null,              // optioneel
  maxNote = null               // optioneel
}) => {
  const tonic = scale?.tonic ? standardizeTonic(scale.tonic) : 'C4';

  const notes = generateAllNotesArray();

  const findNoteIndex = (note) => notes.findIndex(n => n === note);
  const tonicIndex = findNoteIndex(tonic);

  if (tonicIndex === -1) {
    console.error('Tonic not found in notes:', tonic, notes);
    return <div style={{ color: 'red' }}>Error: tonic not found in notes</div>;
  }

  /* =========================
     NOTE DISPLAY
  ========================= */
  const noteDisplayName = (note) => {
    if (note === 'placeholder' || note === 'halfKey') return '';
    const idx = scale.scale.indexOf(note);
    if (idx !== -1) return scale.displayScale[idx];
    return getRelativeNoteName(note, scale.tonic);
  };

  /* =========================
     KEY GENERATION
     ========================= */
  const startNote = minNote || scale.displayScale[0];
  const endNote = maxNote || scale.displayScale[scale.displayScale.length - 1];

  // Vind indices in de volledige notes array
  let startIndex = findNoteIndex(startNote);
  let endIndex = findNoteIndex(endNote);

  // Safety check
  if (startIndex === -1) startIndex = 0;
  if (endIndex === -1) endIndex = notes.length - 1;

  // 🔹 Als startNote zwart is, ga één witte toets naar links
  const isBlackKey = (note) => note.includes('♯') || note.includes('♭');
  if (isBlackKey(notes[startIndex]) && startIndex > 0) {
    for (let i = startIndex - 1; i >= 0; i--) {
      if (!isBlackKey(notes[i])) {
        startIndex = i;
        break;
      }
    }
  }

  // 🔹 Als endNote zwart is, ga één witte toets naar rechts
  if (isBlackKey(notes[endIndex]) && endIndex < notes.length - 1) {
    for (let i = endIndex + 1; i < notes.length; i++) {
      if (!isBlackKey(notes[i])) {
        endIndex = i;
        break;
      }
    }
  }

  // Bouw witte toetsen
  const pianoWhiteKeys = [];
  for (let i = startIndex; i <= endIndex; i++) {
    if (!isBlackKey(notes[i])) pianoWhiteKeys.push(notes[i]);
  }

  // Bouw zwarte toetsen
  const pianoBlackKeys = ['halfKey'];
  for (let i = 0; i < pianoWhiteKeys.length - 1; i++) {
    const currentIndex = findNoteIndex(pianoWhiteKeys[i]);
    const nextNote = notes[currentIndex + 1];
    if (!nextNote || pianoWhiteKeys[i].startsWith('E') || pianoWhiteKeys[i].startsWith('B')) {
      pianoBlackKeys.push('placeholder');
    } else {
      pianoBlackKeys.push(nextNote);
    }
  }
  pianoBlackKeys.push('halfKey');


  /* =========================
     STYLING (CSS classes)
     ========================= */
  const getKeyClass = (note) => {
    const isTonic = note === scale.tonic; // ✅ Simple match
    const isInScale = scale.scale.includes(note); // ✅ gebruik scale.scale

    if (note === 'halfKey') return 'half-key';
    if (note === 'placeholder') return 'placeholder-key';
    if (note.includes('♯') || note.includes('♭')) {
      if (isTonic) return 'black-key tonic-black-key';
      if (isInScale) return 'black-key highlighted-black-key';
      return 'black-key';
    } else {
      if (isTonic) return 'white-key tonic-white-key';
      if (isInScale) return 'white-key highlighted-white-key';
      return 'white-key';
    }
  };

  /* =========================
     INTERACTION HANDLER
     ========================= */
  const handleKeyClick = (note) => {
    if (note === 'halfKey' || note === 'placeholder') return;

    playSound(note, trebleInstrument, trebleInstrument.context);

    if (interactionMode === 'select-tonic') {
      // 🔁 AANPASSING: tonic-selectie i.p.v. geluid
      if (onTonicSelect) {
        onTonicSelect(note);
      }
      return;
    }

  };

  /* =========================
     RENDER
     ========================= */


  return (
    <div className="piano-container">
      <div className="piano-white">
        {pianoWhiteKeys.map((note, i) => (
          <div
            key={i}
            className={getKeyClass(note)}
            onClick={() => handleKeyClick(note)}
          >
            {noteDisplayName(note)}
          </div>
        ))}
      </div>

      <div className="piano-black">
        {pianoBlackKeys.map((note, i) => (
          <div
            key={i}
            className={getKeyClass(note)}
            onClick={() => handleKeyClick(note)}
          >
            {noteDisplayName(note)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PianoView;
