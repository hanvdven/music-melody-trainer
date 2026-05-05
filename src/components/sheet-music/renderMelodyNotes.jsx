import React from 'react';
import logger from '../../utils/logger';
import { generateAccidentalMap } from './generateAccidentalMap';
import { getNoteSemitone, getCanonicalNote } from '../../theory/noteUtils';
import { transposeMelodyBySemitones } from '../../theory/musicUtils';

const normalizePC = (note) => {
  if (!note) return '';
  return note.replace(/\d+$/, '')
    .replace('#', '♯')
    .replace('b', '♭')
    .replace('Ü', '♭')
    .replace('º', '♯');
};

// Strip accidentals for noteYMap lookup — map only has natural note names (C, D, E…)
const stripAccidentals = n => n ? n.replace(/[♭º♯Ü#b𝄫𝄪]/g, '') : n;

// Melody Notes
const noteYMap = {
  // Octave 0
  A0: 176,
  B0: 171,
  // Octave 1
  C1: 166,
  D1: 161,
  E1: 156,
  F1: 151,
  G1: 146,
  A1: 141,
  B1: 136,
  // Octave 2
  C2: 131,
  D2: 126,
  E2: 121,
  F2: 116,
  G2: 111,
  A2: 106,
  B2: 101,
  // Octave 3
  C3: 96,
  D3: 91,
  E3: 86,
  F3: 81,
  G3: 76,
  A3: 71,
  B3: 66,
  // Octave 4
  C4: 61,
  D4: 56,
  E4: 51,
  F4: 46,
  G4: 41,
  A4: 36,
  B4: 31,
  // Octave 5
  C5: 26,
  D5: 21,
  E5: 16,
  F5: 11,
  G5: 6,
  A5: 1,
  B5: -4,
  // Octave 6
  C6: -9,
  D6: -14,
  E6: -19,
  F6: -24,
  G6: -29,
  A6: -34,
  B6: -39,
  // Octave 7
  C7: -44,
  D7: -49,
  E7: -54,
  F7: -59,
  G7: -64,
  A7: -69,
  B7: -74,
  // Octave 8
  C8: -79,
  // Percussion
  cc: 161, // Crash Cymbal
  hh: 166, // Hi-hat
  ho: 166, // Hi-hat (open)
  cr: 171, // Ride Cymbal
  th: 176, // High Tom
  tm: 181, // Med Tom
  s: 186,  // Snare drum
  sg: 186, // Ghost snare (same position as snare)
  sr: 176, // Rim click (cross notehead 10 units above snare)
  tl: 196, // Floor Tom
  k: 206, // Bass drum
  hp: 211, // Hi-hat pedal
  wh: 181, // High Woodblock / metronome click
  wm: 186, // Mid Woodblock
  wl: 191, // Low Woodblock / metronome click
  cb: 176, // Cowbell
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
  ho: 'À', // Hi-hat (open)
  cr: 'À', // Ride Cymbal
  th: 'Ï', // High Tom
  tm: 'Ï', // Med Tom
  s: 'Ï', // Snare drum
  sg: 'Ï', // Ghost snare (rendered with parentheses)
  sr: 'À', // Rim click — cross notehead
  tl: 'Ï', // Floor Tom
  k: 'Ï', // Bass drum
  hp: 'À', // Hi-hat pedal
  wh: 'Ñ', // High Woodblock
  wm: 'Ñ', // Mid Woodblock
  wl: 'Ñ', // Low Woodblock
  cb: 'À', // Cowbell
  c: 'Ñ', // Legacy
};

// Sync with Drum Kit Colors from App.css
const percussionChromatoneColors = {
  cc: 'var(--chromatone-percussion-crash)',
  cct: 'var(--chromatone-percussion-crash-tip)',
  cr: 'var(--chromatone-percussion-ride)',
  crt: 'var(--chromatone-percussion-ride-tip)',
  hh: 'var(--chromatone-percussion-hihat-closed)',
  ho: 'var(--chromatone-percussion-hihat-open)',
  hp: 'var(--chromatone-percussion-hihat-pedal)',
  s: 'var(--chromatone-percussion-snare)',
  sg: 'var(--chromatone-percussion-snare-ghost)',
  sr: 'var(--chromatone-percussion-snare-rim)',
  th: 'var(--chromatone-percussion-tom-high)',
  tm: 'var(--chromatone-percussion-tom-mid)',
  tl: 'var(--chromatone-percussion-tom-floor)',
  k: 'var(--chromatone-percussion-kick)',
  cb: 'var(--drum-cowbell)',
  wh: 'var(--drum-woodblock)',
  wm: 'var(--drum-woodblock)',
  wl: 'var(--drum-woodblock)',
  other: '#4CAF50',
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
  18: 'Îk', // Dotted quarter rest
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

const ledgerLinesMapPercussion = {
  cc: [161],
};

// Helper: Shorten stem for specific percussion notes
const shortStemNotes = ['ho', 'wh', 'wl'];

const renderMelodyNotes = (
  melody,
  numAccidentals,
  startX,
  noteWidth,
  allOffsets,
  staff = 'treble',
  staffYStart = 11,
  noteGroupSize = 12,
  measureLengthSlots = 48,
  timeSignature = [4, 4],
  clef = staff,
  noteColoringMode = 'none',
  tonic = 'C4',
  scaleNotes = [],
  processedChords = [],
  theme = 'default',
  inputTestState = null,
  previewMode = false,
  pixelsPerTick = null,
  startMeasureIndex = 0,
  transpositionSemitones = 0,
  debugMode = false,
  interactive = true,  // set false for non-playable layers (metronome, previews)
  onAccidentalClick = null  // (absoluteOffset: number) => void — called when user clicks an accidental symbol; caller computes the absolute offset
) => {
  // previewMode can be: false (normal), true (yellow, for input test), or a CSS color string (e.g. 'rgba(220,30,30,0.85)' for wipe preview)
  const previewColor = typeof previewMode === 'string' ? previewMode : (previewMode ? 'var(--accent-yellow)' : null);

  // Apply display-only transposition (audio always plays concert pitch).
  // transpositionSemitones > 0 → instrument sounds below written (e.g. Bb clarinet: +2).
  // transpositionSemitones < 0 → instrument sounds above written (e.g. D trumpet: -2).
  const melodyNotes = transpositionSemitones !== 0
    ? transposeMelodyBySemitones(melody.notes, transpositionSemitones)
    : melody.notes;
  const melodyDurations = melody.durations;
  const melodyOffsets = melody.offsets;
  const melodyTies = melody.ties;
  const melodyTriplets = melody.triplets ?? null;

  // Accidental map is generated from the (possibly transposed) display notes so that
  // accidentals reflect the written key, not the sounding key.
  const accidentals = generateAccidentalMap(melodyNotes, numAccidentals);

  // --- UNIFIED Y-SHIFT CALCULATION ---
  const clefOffsets = {
    treble: -11,
    bass: -71,
    alto: -41,
    tenor: -51,
    soprano: -21,
    'mezzo-soprano': -31,
    treble8va: 24,
    treble8vb: -46,
    treble15va: 59,
    treble15vb: -81,
    bass8va: -36,
    bass8vb: -106,
    bass15va: -1,
    bass15vb: -141,
    alto8va: -6,
    alto8vb: -76
  };

  const dynamicClefOffset = clefOffsets[clef] !== undefined ? clefOffsets[clef] : -11;
  const combinedShift = staff === 'percussion' ? (staffYStart - 171) : (staffYStart + dynamicClefOffset);

  // Position helper: tick-based when pixelsPerTick is provided (scroll/animation modes),
  // otherwise falls back to slot-index lookup for elastic pagination spacing.
  const getTickX = pixelsPerTick !== null
    ? (offset) => startX + offset * pixelsPerTick
    : (offset) => {
      const idx = allOffsets.indexOf(offset);
      return idx >= 0 ? startX + (idx - 1) * noteWidth : startX;
    };


  const getTargetBounds = () => {
    if (staff === 'percussion') return { minY: -50, maxY: 150 };
    // Maintain visual bounds
    let customMinY = -30 - dynamicClefOffset;
    let customMaxY = 70 - dynamicClefOffset;

    return {
      minY: customMinY,
      maxY: customMaxY
    };
  };
  const activeBounds = getTargetBounds();

  const displayNotes = [];
  const octaveShifts = [];

  melodyNotes.forEach((noteWithAccidental) => {
    // Chord arrays (simultaneous percussion notes) pass through unchanged
    if (Array.isArray(noteWithAccidental)) {
      displayNotes.push(noteWithAccidental);
      octaveShifts.push(0);
      return;
    }

    let note = noteWithAccidental ? noteWithAccidental.replace(/[♭º♯Ü#b𝄫𝄪]/g, '') : null;
    let shift = 0;

    if (note && note !== 'r' && staff !== 'percussion') {
      let pureY = noteYMap[note];

      while (pureY !== undefined && pureY < activeBounds.minY) {
        const pc = note.slice(0, -1);
        const oct = parseInt(note.slice(-1), 10);
        note = `${pc}${oct - 1}`;
        pureY = noteYMap[note];
        shift -= 1;
      }

      while (pureY !== undefined && pureY > activeBounds.maxY) {
        const pc = note.slice(0, -1);
        const oct = parseInt(note.slice(-1), 10);
        note = `${pc}${oct + 1}`;
        pureY = noteYMap[note];
        shift += 1;
      }
    }

    displayNotes.push(note);
    octaveShifts.push(shift);
  });

  // --- OCTAVE SHIFT SMOOTHING (GRACE) ---
  const smoothedShifts = [...octaveShifts];
  const shiftLevels = [-2, -1, 2, 1]; // Order: 15va, 8va, 15vb, 8vb

  shiftLevels.forEach(targetShift => {
    let firstIdx = -1;
    for (let i = 0; i < smoothedShifts.length; i++) {
      if (smoothedShifts[i] === targetShift) {
        if (firstIdx === -1) {
          firstIdx = i;
        } else {
          // Check if notes between firstIdx and i can be included
          const midNotesInRange = [];
          let allMidGraceful = true;
          for (let j = firstIdx + 1; j < i; j++) {
            const midNote = melodyNotes[j];
            if (!midNote || midNote === 'r') continue;

            const pureY = noteYMap[midNote.replace(/[♭º♯Ü#b𝄫𝄪]/g, '')];
            const bounds = activeBounds;

            // Grace: if between two shifted notes and not "too far" from staff boundary
            const graceThreshold = (targetShift < 0 && (staff === 'bass' || clef === 'bass')) ? 8 : 40; // Further reduce "pull-in" error for bass 8va
            let isGraceful = false;
            if (targetShift < 0) { // va/ma
              isGraceful = pureY < bounds.minY + graceThreshold;
            } else { // vb/mb
              isGraceful = pureY > bounds.maxY - graceThreshold;
            }

            if (!isGraceful) allMidGraceful = false;
          }

          if (allMidGraceful) {
            for (let j = firstIdx + 1; j < i; j++) {
              smoothedShifts[j] = targetShift;
            }
          }
          firstIdx = i;
        }
      } else if (smoothedShifts[i] !== 0 && smoothedShifts[i] !== targetShift) {
        // Break group if another octave shift is already strictly required
        firstIdx = -1;
      }
    }
  });

  // Calculate octave marker groups
  const octaveGroups = [];
  let currentGroup = null;

  smoothedShifts.forEach((shift, index) => {
    if (shift !== 0) {
      if (currentGroup && currentGroup.shift === shift) {
        currentGroup.end = index;
      } else {
        if (currentGroup) octaveGroups.push(currentGroup);
        currentGroup = { shift, start: index, end: index };
      }
    } else {
      if (currentGroup) octaveGroups.push(currentGroup);
      currentGroup = null;
    }
  });
  if (currentGroup) octaveGroups.push(currentGroup);

  // Shifts and bounds logic moved up into UNIFIED Y-SHIFT CALCULATION

  // --- BEAM GROUP CALCULATION ---
  const timeSigTop = timeSignature[0];
  const beamGroups = [];

  const measures = {};
  let nextIsTieDest = false;

  for (let index = 0; index < melodyNotes.length; index++) {
    const isTieDest = nextIsTieDest;
    nextIsTieDest = melodyTies[index] === 'tie';

    const offset = melodyOffsets[index];
    if (offset === null) continue;
    const measureIdx = Math.floor(offset / measureLengthSlots);
    if (!measures[measureIdx]) measures[measureIdx] = [];
    // Use visualDuration for beaming so triplet quarters (visualDuration=12) aren't beamed,
    // while triplet 8ths (visualDuration=6) are correctly beamed together.
    // tupletId is stored so the beam-group loop can isolate each tuplet from adjacent notes.
    const tupletInfo = melodyTriplets?.[index] ?? null;
    const tupletVis = tupletInfo?.visualDuration ?? null;
    measures[measureIdx].push({
      index,
      noteWithAccidental: melodyNotes[index],
      duration: isTieDest ? 99 : (tupletVis ?? melodyDurations[index]),
      actualDuration: melodyDurations[index],
      offset: offset,
      // null for non-tuplet notes; unique id per tuplet group for isolation in beaming.
      tupletId: tupletInfo?.id ?? null,
    });
  }

  // Helper to determine allowed beam spans within a measure based on music theory rules
  const getAllowedSpans = (elementsInMeasure, top) => {
    // Collect durations of all short notes/rests (duration < 12)
    const shortDurations = elementsInMeasure.filter(e => e.duration < 12).map(e => e.duration);
    if (shortDurations.length === 0) return [];

    const spans = [];
    const secondaryBeatSlots = (top % 2 === 0) ? measureLengthSlots / 2 : measureLengthSlots;

    for (let i = 0; i < measureLengthSlots; i += secondaryBeatSlots) {
      spans.push({ start: i, end: i + secondaryBeatSlots });
    }
    return spans;
  };

  Object.values(measures).forEach(elements => {
    const spans = getAllowedSpans(elements, timeSigTop);

    spans.forEach(span => {
      // Elements that fall into this span
      const spanElements = elements.filter(e => {
        const relativeOffset = e.offset % measureLengthSlots;
        return relativeOffset >= span.start && relativeOffset < span.end;
      });

      let currentSubGroup = [];
      const flushSubGroup = () => {
        // Trim rests from start and end
        while (currentSubGroup.length > 0 && currentSubGroup[0].isRest) currentSubGroup.shift();
        while (currentSubGroup.length > 0 && currentSubGroup[currentSubGroup.length - 1].isRest) currentSubGroup.pop();

        if (currentSubGroup.length >= 2) {
          // Do not connect across primary groups if each primary group only has 1 note
          const primaryBeatSlots = (timeSigTop % 3 === 0 && timeSigTop > 3) ? 18 : noteGroupSize;
          const notesOnly = currentSubGroup.filter(n => !n.isRest);
          const notesByBeat = {};
          notesOnly.forEach(n => {
            const b = Math.floor((n.offset % measureLengthSlots) / primaryBeatSlots);
            notesByBeat[b] = (notesByBeat[b] || 0) + 1;
          });

          if (Object.keys(notesByBeat).length >= 2) {
            const allOne = Object.values(notesByBeat).every(count => count === 1);
            if (allOne) {
              currentSubGroup = [];
              return;
            }
          }

          // Calculate master stem direction based on note furthest from middle line
          let maxDist = -1;
          let masterStemIsAbove = true;
          currentSubGroup.forEach(item => {
            if (item.isRest) return;
            const dist = Math.abs(item.positionY - (staffYStart + 20)); // Middle line is staffYStart + 20
            if (dist > maxDist) {
              maxDist = dist;
              masterStemIsAbove = item.positionY > staffYStart + 20; // Natural stem direction
            }
          });

          // Apply master direction to all notes in subgroup.
          // For chord entries, re-derive positionY using the master direction so that
          // beam-clearance calculations use the correct stem-base (topY when stem is DOWN,
          // bottomY when stem is UP).  The chord-local stemIsAbove may have been set
          // differently (e.g. equidistant tiebreak) and would otherwise produce a wrong
          // minYend in beamData, pushing the beam far off the staff.
          currentSubGroup.forEach(item => {
            if (!item.isRest) {
              item.stemIsAbove = masterStemIsAbove;
              const noteEntry = displayNotes[item.index];
              if (Array.isArray(noteEntry)) {
                const ys = noteEntry
                  .map(n => { const nat = stripAccidentals(n); return noteYMap[nat] !== undefined ? noteYMap[nat] + combinedShift : null; })
                  .filter(y => y !== null);
                if (ys.length > 0) {
                  const cTopY = Math.min(...ys);
                  const cBottomY = Math.max(...ys);
                  item.positionY = masterStemIsAbove ? cBottomY : cTopY;
                }
              }
            }
          });

          beamGroups.push([...currentSubGroup]);
        }
        currentSubGroup = [];
      };

      for (let i = 0; i < spanElements.length; i++) {
        const e = spanElements[i];
        if (e.duration >= 12) {
          flushSubGroup();
          continue;
        }

        // Tuplet isolation: flush when crossing a tuplet-group boundary.
        // A non-tuplet (tupletId=null) must never beam with a tuplet, and two notes
        // from different tuplet groups (different ids) must never share a beam.
        const lastInGroup = currentSubGroup[currentSubGroup.length - 1];
        if (lastInGroup && lastInGroup.tupletId !== e.tupletId) {
          flushSubGroup();
        }

        const note = displayNotes[e.index];
        if (!note) continue;

        const isRest = !Array.isArray(note) && note === 'r';
        let positionY = null;
        let stemIsAbove = true;

        if (Array.isArray(note)) {
          // Chord: gather all valid y-positions and pick the stem-base note
          const staffMiddleY = staffYStart + 20;
          const yPositions = note
            .map(n => { const nat = stripAccidentals(n); return noteYMap[nat] !== undefined ? noteYMap[nat] + combinedShift : null; })
            .filter(y => y !== null);
          if (yPositions.length === 0) { flushSubGroup(); continue; }

          const topY = Math.min(...yPositions);
          const bottomY = Math.max(...yPositions);
          // Direction: furthest note from staff centre drives the stem away
          const furthestY = yPositions.reduce((prev, cur) =>
            Math.abs(cur - staffMiddleY) >= Math.abs(prev - staffMiddleY) ? cur : prev
          );
          stemIsAbove = furthestY > staffMiddleY;
          // positionY = stem-base (opposite end from where stem will go)
          positionY = stemIsAbove ? bottomY : topY;
        } else if (!isRest) {
          positionY = noteYMap[note] + combinedShift;
          if (Number.isNaN(positionY)) continue;
          stemIsAbove = positionY > staffYStart + 20;
        }

        currentSubGroup.push({
          index: e.index,
          beatIndexWithinMeasure: Math.floor((e.offset % measureLengthSlots) / noteGroupSize),
          isRest,
          stemIsAbove,
          positionY,
          chordSpan: Array.isArray(note) ? (() => {
            const ys = note.map(n => { const nat = stripAccidentals(n); return noteYMap[nat] !== undefined ? noteYMap[nat] + combinedShift : null; }).filter(y => y !== null);
            return ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
          })() : 0,
          duration: e.duration,
          actualDuration: e.actualDuration,
          offset: e.offset,
          // Must carry tupletId so the isolation check (lastInGroup.tupletId !== e.tupletId)
          // compares null===null correctly for non-tuplet notes.
          tupletId: e.tupletId,
        });
      }
      flushSubGroup();
    });
  });

  // Create lookup for notes that are beamed
  const beamedNoteIndices = new Map();
  beamGroups.forEach((group, groupIndex) => {
    group.forEach(n => {
      if (!n.isRest) beamedNoteIndices.set(n.index, groupIndex);
    });
  });

  // Pre-calculate beam line equations for all groups to enforce minimum stem distances
  const beamData = new Map();
  beamGroups.forEach((group, groupIndex) => {
    const nonRests = group.filter(n => !n.isRest);
    if (nonRests.length < 2) return;

    const first = nonRests[0];
    const last = nonRests[nonRests.length - 1];
    const stemIsAbove = first.stemIsAbove;

    const firstX = getTickX(melodyOffsets[first.index]) + (stemIsAbove ? 11 : 0.5);
    const lastX = getTickX(melodyOffsets[last.index]) + (stemIsAbove ? 11 : 0.5);

    // 27px clearance (down from 30) + chord span so the beam clears ALL noteheads in a chord
    const chordClear = (n) => {
      const note = displayNotes[n.index];
      const isWoodblock = Array.isArray(note)
        ? note.some(nn => percussionNoteHeads[nn] === 'Ñ')
        : (staff === 'percussion' && percussionNoteHeads[note] === 'Ñ');
      if (isWoodblock) return (stemIsAbove ? 32 : 28) + (n.chordSpan || 0);
      return 27 + (n.chordSpan || 0);
    };
    let firstYend = stemIsAbove ? first.positionY - chordClear(first) : first.positionY + chordClear(first);
    let lastYend = stemIsAbove ? last.positionY - chordClear(last) : last.positionY + chordClear(last);

    let slope = 0;
    if (lastX !== firstX) {
      slope = (lastYend - firstYend) / (lastX - firstX);
      const maxSlope = Math.tan(15 * Math.PI / 180);

      if (Math.abs(slope) > maxSlope) {
        slope = Math.sign(slope) * maxSlope;
        const newLastYend = firstYend + slope * (lastX - firstX);
        const lastMinYend = stemIsAbove ? last.positionY - chordClear(last) : last.positionY + chordClear(last);
        const isLastTooShort = stemIsAbove ? (newLastYend > lastMinYend) : (newLastYend < lastMinYend);

        if (isLastTooShort) {
          lastYend = lastMinYend;
          firstYend = lastYend - slope * (lastX - firstX);
        } else {
          lastYend = newLastYend;
        }
      }
    }

    // Shift beam to guarantee minimum stem length for ALL notes in the group
    let maxShiftRequired = 0;
    nonRests.forEach(n => {
      const nx = getTickX(melodyOffsets[n.index]) + (stemIsAbove ? 10 : 0.5);
      const expectedYend = firstYend + slope * (nx - firstX);
      const minYend = stemIsAbove ? n.positionY - chordClear(n) : n.positionY + chordClear(n);

      if (stemIsAbove) {
        if (expectedYend > minYend) { // Inner stem is too short, beam needs to go HIGHER (more negative)
          const shift = expectedYend - minYend;
          if (shift > maxShiftRequired) maxShiftRequired = shift;
        }
      } else {
        if (expectedYend < minYend) { // Inner stem is too short, beam needs to go LOWER (more positive)
          const shift = minYend - expectedYend;
          if (shift > maxShiftRequired) maxShiftRequired = shift;
        }
      }
    });

    // Also shift beam to avoid crossing interior rests (treated as virtual note heads at middle line)
    const middleY = staffYStart + 20;
    group.forEach(item => {
      if (!item.isRest) return;
      const nx = getTickX(melodyOffsets[item.index]) + (stemIsAbove ? 11 : 0.5);
      const expectedYend = firstYend + slope * (nx - firstX);
      const minYend = stemIsAbove ? middleY - 30 : middleY + 30;

      if (stemIsAbove) {
        if (expectedYend > minYend) {
          maxShiftRequired = Math.max(maxShiftRequired, expectedYend - minYend);
        }
      } else {
        if (expectedYend < minYend) {
          maxShiftRequired = Math.max(maxShiftRequired, minYend - expectedYend);
        }
      }
    });

    if (stemIsAbove) {
      firstYend -= maxShiftRequired;
      lastYend -= maxShiftRequired;
    } else {
      firstYend += maxShiftRequired;
      lastYend += maxShiftRequired;
    }

    beamData.set(groupIndex, { firstX, lastX, firstYend, lastYend, slope, nonRests });
  });

  // Accumulate tuplet bracket data during note rendering.
  // Map from group id → { noteCount, denominator, visualDuration, points: [{x, stemTipY, stemIsAbove, isBeamed}] }
  const tupletGroupData = new Map();

  // Render individual notes
  const noteElements = melodyNotes.map((noteWithAccidental, index) => {
    const positionX = getTickX(melodyOffsets[index]);
    const duration = melodyDurations[index];
    const absoluteOffset = melodyOffsets[index];
    const measureIndex = startMeasureIndex + Math.floor(absoluteOffset / measureLengthSlots);
    const localSlot = absoluteOffset % measureLengthSlots;
    const note = displayNotes[index];
    const shift = smoothedShifts[index];

    let inputTestClass = '';
    const originalIndex = melody.originalIndices ? melody.originalIndices[index] : index;
    let activeHits = [];
    if (!previewMode && inputTestState && inputTestState.activeStaff === staff && originalIndex !== null) {
      if (inputTestState.activeIndex === originalIndex) {
        inputTestClass = ` input-test-${inputTestState.status}`;
        if (Array.isArray(note)) {
          activeHits = inputTestState.chordHits || [];
        }
      } else if (inputTestState.successes?.includes(originalIndex)) {
        inputTestClass = ' input-test-success';
      }
    }

    // Color helper for melodic (non-percussion) notes — shared by both chord and single-note paths.
    const getMelodicColor = (n) => {
      if (noteColoringMode === 'chromatone') return `var(--chromatone-${getNoteSemitone(n)})`;
      if (noteColoringMode === 'subtle-chroma') {
        const mixTarget = theme === 'light' ? 'black' : 'white';
        return `color-mix(in srgb, var(--chromatone-${getNoteSemitone(n)}), ${mixTarget} 60%)`;
      }
      if (noteColoringMode === 'chords') {
        const offset = melodyOffsets[index];
        const activeItem = processedChords.filter(c => !c.isSlash && c.absoluteOffset <= offset).at(-1);
        if (activeItem?.chord?.notes && Array.isArray(activeItem.chord.notes) && activeItem.chord.notes.length > 0) {
          const isInChord = activeItem.chord.notes.some(cn => getNoteSemitone(cn) === getNoteSemitone(n));
          if (isInChord) {
            const mixTarget = theme === 'light' ? 'black' : 'white';
            return `color-mix(in srgb, var(--chromatone-${getNoteSemitone(activeItem.chord.root)}), ${mixTarget} 30%)`;
          }
        }
        return 'var(--text-primary)';
      }
      if (noteColoringMode === 'tonic_scale_keys') {
        const nPC = normalizePC(n);
        if (nPC === normalizePC(tonic)) return 'var(--note-tonic)';
        if (scaleNotes.some(s => normalizePC(s) === nPC)) return 'var(--note-scale)';
      }
      return 'var(--text-primary)';
    };

    // ---------------------------------------------------------------
    // CHORD (simultaneous) note rendering — used by percussion backbeat
    // ---------------------------------------------------------------
    if (Array.isArray(note)) {
      const staffMiddleY = staffYStart + 20;

      // 4a. Symbol: percussion uses per-note heads; melodic staves share the duration-based notehead
      const chordSymbol = staff !== 'percussion' ? durationNoteMap[duration] : null;

      // Collect valid notes with their y positions, noteheads, and colors
      const chordNotes = note
        .map((n, hi) => {
          const nat = stripAccidentals(n);
          return {
            n,
            y: noteYMap[nat] !== undefined ? noteYMap[nat] + combinedShift : null,
            symbol: staff === 'percussion' ? percussionNoteHeads[n] : chordSymbol,
            color: previewMode ? 'var(--accent-yellow)' : (staff !== 'percussion' ? getMelodicColor(n) : null),
            noteIndex: hi,
          };
        })
        .filter(p => p.y !== null && p.symbol);

      if (chordNotes.length === 0) return null;

      // Determine stem direction: furthest note from staff centre
      const furthest = chordNotes.reduce((prev, curr) =>
        Math.abs(curr.y - staffMiddleY) >= Math.abs(prev.y - staffMiddleY) ? curr : prev
      );
      // Stem UP when the furthest note is BELOW centre (large y), DOWN when ABOVE centre (small y)
      let stemIsAbove = furthest.y > staffMiddleY;

      // --- Beaming: does this chord participate in a beam group? ---
      const chordGroupIndex = beamedNoteIndices.get(index);
      const isBeamed = chordGroupIndex !== undefined;
      let bData = null;
      if (isBeamed) {
        bData = beamData.get(chordGroupIndex);
        const beamGroup = beamGroups[chordGroupIndex];
        const memberIdx = beamGroup.findIndex(n => n.index === index);
        if (memberIdx !== -1) stemIsAbove = beamGroup[memberIdx].stemIsAbove;
      }

      // Note flipping: adjacent notes a 2nd apart are offset horizontally to avoid overlap.
      // Stem UP:   upper note of 2nd → RIGHT (+FLIP_OFFSET) beside/behind the stem
      // Stem DOWN: lower note of 2nd → LEFT  (-FLIP_OFFSET) opposite side from stem
      // Scan ascending pitch (sortedForFlip[0] = lowest = largest y); detect consecutive 2nds.
      const FLIP_OFFSET = 12; // approximate notehead width in px at fontSize=36
      if (staff !== 'percussion' && chordNotes.length > 1) {
        const sortedForFlip = [...chordNotes].sort((a, b) => b.y - a.y); // ascending pitch
        const flipped = new Array(sortedForFlip.length).fill(false);
        for (let fi = 1; fi < sortedForFlip.length; fi++) {
          const isSecond = Math.abs(sortedForFlip[fi].y - sortedForFlip[fi - 1].y) <= 5; // 5px = 1 staff step
          if (isSecond) {
            if (stemIsAbove) {
              // Stem up: upper note (fi) goes RIGHT
              if (!flipped[fi - 1]) flipped[fi] = true;
            } else {
              // Stem down: lower note (fi-1) goes LEFT
              if (!flipped[fi]) flipped[fi - 1] = true;
            }
          }
        }
        sortedForFlip.forEach((pos, fi) => {
          pos.xOffset = flipped[fi] ? (stemIsAbove ? FLIP_OFFSET : -FLIP_OFFSET) : 0;
        });
      } else {
        chordNotes.forEach(p => { p.xOffset = 0; });
      }

      // Extremal y values in SVG space
      const topY = Math.min(...chordNotes.map(p => p.y)); // highest on screen (smallest y)
      const bottomY = Math.max(...chordNotes.map(p => p.y)); // lowest on screen (largest y)

      // Stem geometry
      const stemX = stemIsAbove ? positionX + 11 : positionX + 0.5;
      // x-head (À) and triangle-head (Ñ): shorten at notehead attachment (not the tip)
      const hasSpecialHead = chordNotes.some(p => p.symbol === 'À' || p.symbol === 'Ñ');
      const hasTriangleHead = chordNotes.some(p => p.symbol === 'Ñ');

      let stemStartY = stemIsAbove
        ? bottomY - (hasTriangleHead ? 0 : (hasSpecialHead ? 5 : 1))
        : topY + (hasTriangleHead ? 8 : (hasSpecialHead ? 5 : 1));  // triangle: 8 (2 units higher than default 10)

      // Woodblock upward stem: 3 units longer at the bottom
      if (stemIsAbove && hasTriangleHead) {
        stemStartY = bottomY + 3;
      }

      let stemEndY = stemIsAbove ? topY - 27 : bottomY + 27;
      if (hasTriangleHead) {
        stemEndY = stemIsAbove ? topY - 32.4 : bottomY + 34.2;
      }

      if (isBeamed && bData) {
        stemEndY = bData.firstYend + bData.slope * (stemX - bData.firstX);
      }

      const flagSymbol = stemIsAbove ? durationFlagMapUp[duration] : durationFlagMapDown[duration];
      const flagX = stemIsAbove ? positionX + 11 : positionX + 0.5;
      const flagY = stemIsAbove ? topY - 27 : bottomY + 27;



      // 4b. Ledger lines — percussion uses fixed map; melodic uses dynamic algorithm
      const chordLedgerSet = new Set();
      if (staff === 'percussion') {
        chordNotes.forEach(p => {
          // Use per-note percussion ledger map (key = original note id, before shift)
          const noteLedgers = ledgerLinesMapPercussion[p.n] || [];
          noteLedgers.forEach(ly => chordLedgerSet.add(ly + (combinedShift)));
        });
      } else {
        // Same dynamic ledger algorithm as single melodic notes
        chordNotes.forEach(p => {
          let lY = staffYStart + 50;
          while (p.y >= lY) { chordLedgerSet.add(lY); lY += 10; }
          lY = staffYStart - 10;
          while (p.y <= lY) { chordLedgerSet.add(lY); lY -= 10; }
        });
      }

      // Per-note colors (percussion chromatone coloring)
      const drumColors = staff === 'percussion' && (noteColoringMode === 'chromatone' || noteColoringMode === 'subtle-chroma')
        ? percussionChromatoneColors
        : null;

      const stemColor = previewColor ?? 'var(--text-primary)';

      const finalFlagX = stemIsAbove
        ? (staff === 'percussion' ? flagX - 1 : flagX - 2)
        : (flagX - 1);
      const finalFlagY = stemIsAbove ? flagY + 3 : flagY - 4;

      return (
        <g key={index} {...(!previewMode && interactive ? { 'data-measure-index': measureIndex, 'data-local-slot': localSlot, 'data-mel': staff, 'data-duration': duration, 'data-notes': JSON.stringify(chordNotes.map(p => p.n)) } : {})} className={inputTestClass.trim() || undefined} style={!previewMode && interactive ? { cursor: 'pointer' } : undefined}>
          {/* Ledger lines — extend left/right to cover any displaced noteheads */}
          {Array.from(chordLedgerSet).map((ly, li) => {
            const maxXOff = Math.max(0, ...chordNotes.map(p => p.xOffset || 0));
            const minXOff = Math.min(0, ...chordNotes.map(p => p.xOffset || 0));
            return (
              <path
                key={`cl-${index}-${li}`}
                d={`M ${positionX - 7} ${ly} H ${positionX + 19 + maxXOff}`}
                stroke={stemColor}
                strokeWidth="0.5"
              />
            );
          })}
          {/* Single stem (whole notes have no stem) */}
          {duration < 48 && (
            <path
              d={`M ${stemX} ${stemStartY} V ${stemEndY}`}
              stroke={stemColor}
              strokeWidth="1.5"
            />
          )}
          {/* Flag at stem tip — suppressed when beamed */}
          {!isBeamed && duration < 12 && flagSymbol && (
            <text x={staff === 'percussion' && !stemIsAbove && duration < 6 ? finalFlagX + 1 : finalFlagX} y={finalFlagY} fontSize="36" fill={stemColor} fontFamily="Maestro">
              {flagSymbol}
            </text>
          )}
          {/* Noteheads — rendered last to sit on top */}
          {chordNotes.map((pos, hi) => {
            const drumColorBase = drumColors ? (drumColors[pos.n] || 'var(--text-primary)') : null;
            const finalDrumColor = drumColorBase && noteColoringMode === 'subtle-chroma'
              ? `color-mix(in srgb, ${drumColorBase}, ${theme === 'light' ? 'black' : 'white'} 60%)`
              : drumColorBase;

            const noteColor = previewColor
              ?? (finalDrumColor
                ? finalDrumColor
                : (pos.color || 'var(--text-primary)'));
            // 4d. Per-note accidental for melodic staves
            const chordAcc = staff !== 'percussion' && Array.isArray(accidentals[index])
              ? accidentals[index][pos.noteIndex]
              : null;

            const isHit = activeHits.includes(getCanonicalNote(pos.n));
            const headClass = isHit ? 'chord-note-hit' : '';

            return (
              <g key={hi} className={headClass || undefined}>
                {/* Accidental */}
                {chordAcc && (
                  <text x={positionX + (pos.xOffset || 0) - 4} y={pos.y - 3} fontSize="36"
                    fill={noteColor} fontFamily="Maestro" textAnchor="end">
                    {chordAcc}
                  </text>
                )}
                <text
                  x={positionX + (pos.xOffset || 0)}
                  y={pos.y}
                  fontSize="34"
                  fill={noteColor}
                  fontFamily="Maestro"
                >
                  {pos.symbol}
                </text>
                {/* Ghost snare parentheses */}
                {pos.n === 'sg' && (
                  <>
                    <text
                      x={positionX - 2}
                      y={pos.y + 4}
                      fontSize="12"
                      fill={noteColor}
                      fontFamily="Arial, sans-serif"
                      textAnchor="end"
                      style={{ userSelect: 'none' }}
                    >
                      (
                    </text>
                    <text
                      x={positionX + 13}
                      y={pos.y + 4}
                      fontSize="12"
                      fill={noteColor}
                      fontFamily="Arial, sans-serif"
                      textAnchor="start"
                      style={{ userSelect: 'none' }}
                    >
                      )
                    </text>
                  </>
                )}
              </g>
            );
          })}
          {/* Hit area covering the notehead cluster — coloured in debugMode */}
          {!previewMode && interactive && chordNotes.length > 0 && (() => {
            const ys = chordNotes.map(p => p.y).filter(y => y != null);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            return (
              <rect
                x={positionX - 8}
                y={minY - 14}
                width={24}
                height={maxY - minY + 24}
                fill={debugMode ? 'purple' : 'transparent'}
                opacity={debugMode ? 0.15 : 1}
              />
            );
          })()}
        </g>
      );
    }
    // ---------------------------------------------------------------
    // END chord rendering
    // ---------------------------------------------------------------

    const tripletInfo = melodyTriplets?.[index] ?? null;
    // For tuplet notes, use the visual duration (standard note value) for notehead/flag/dot lookup.
    // The raw tick duration (4, 5, 8 ticks) is non-standard and has no entry in the maps.
    const visualDuration = tripletInfo ? tripletInfo.visualDuration : duration;
    const noteSymbol =
      staff === 'percussion' ? percussionNoteHeads[note] : durationNoteMap[visualDuration];
    const dot = durationDotMap[visualDuration];
    const articulation = melodyTies[index];

    // Rests are centered in the staff
    const restY = staffYStart + 24;

    if (note === 'r') {
      return (
        <g key={index} {...(!previewMode ? { 'data-measure-index': measureIndex, 'data-local-slot': localSlot, 'data-mel': staff, 'data-duration': duration } : {})}>
          <text
            x={positionX}
            y={restY}
            fontSize="36"
            fill={previewColor ?? 'var(--text-primary)'}
            fontFamily="Maestro"
          >
            {restMap[duration]}
          </text>
        </g>
      );
    } else if (note) {
      // 'c' is an invisible spacer inserted by processMelodyAndCalculateSlots — skip silently
      if (note === 'c') return null;

      const positionY = noteYMap[note] + combinedShift;

      // Safety check for invalid notes
      if (Number.isNaN(positionY)) {
        if (index === 0 || index % 4 === 0) { // Limit log spam
          logger.warn('renderMelodyNotes', `Invalid note position for ${note} (Original: ${noteWithAccidental}) on ${staff}`, { positionY });
        }
        return null;
      }

      let stemIsAbove = positionY > staffYStart + 20;

      const groupIndex = beamedNoteIndices.get(index);
      const isBeamed = groupIndex !== undefined;

      let bData = null;
      if (isBeamed) {
        const beamGroup = beamGroups[groupIndex];
        bData = beamData.get(groupIndex);
        const noteIndexInGroup = beamGroup.findIndex(n => n.index === index);
        if (noteIndexInGroup !== -1) {
          stemIsAbove = beamGroup[noteIndexInGroup].stemIsAbove;
        }
      }

      const lineX = stemIsAbove ? positionX + 11 : positionX + 0.5;
      const lineYstart = stemIsAbove ? positionY - 1 : positionY + 1;
      let lineYend = stemIsAbove ? positionY - 27 : positionY + 27; // -10% length

      let lineYstartAdj = lineYstart;
      const percHead = staff === 'percussion' ? percussionNoteHeads[note] : null;
      // Notehead anchor adjustments — triangle/x sit at a different vertical anchor than round noteheads
      if (percHead === 'Ñ') {
        lineYstartAdj = stemIsAbove ? positionY - 2 : positionY + 6;  // down-stem: 6 (2 units higher than default 8)
      } else if (percHead === 'À') {
        lineYstartAdj = stemIsAbove ? positionY - 5 : positionY + 5;
      }
      // Stem end: beam slope takes priority; fall back to per-notehead or shortStem lengths
      if (isBeamed && bData) {
        lineYend = bData.firstYend + bData.slope * (lineX - bData.firstX);
      } else if (percHead === 'Ñ') {
        lineYend = stemIsAbove ? positionY - 28 : positionY + 28;
      } else if (percHead === 'À') {
        lineYend = stemIsAbove ? positionY - 22.5 : positionY + 27;
      } else if (staff === 'percussion' && shortStemNotes.includes(note)) {
        lineYend = stemIsAbove ? positionY - 25.2 : positionY + 25.2;
      }
      let ledgerLines = [];
      if (staff === 'percussion') {
        // Apply combinedShift so ledger lines track the percussion staff position
        ledgerLines = (ledgerLinesMapPercussion[note] || []).map(ly => ly + combinedShift);
      } else {
        // Dynamic ledger lines based on physical position relative to staff
        let lY = staffYStart + 50;
        while (positionY >= lY) {
          ledgerLines.push(lY);
          lY += 10;
        }
        lY = staffYStart - 10;
        while (positionY <= lY) {
          ledgerLines.push(lY);
          lY -= 10;
        }
      }
      const flagSymbol = stemIsAbove ? durationFlagMapUp[visualDuration] : durationFlagMapDown[visualDuration];
      const flagX = stemIsAbove ? positionX + 11 : positionX + 0.5;
      const flagY = stemIsAbove ? positionY - 27 : positionY + 27;

      // Collect data for tuplet bracket rendering (after note rendering pass).
      if (tripletInfo) {
        const groupKey = tripletInfo.id;
        if (!tupletGroupData.has(groupKey)) {
          tupletGroupData.set(groupKey, {
            noteCount: tripletInfo.noteCount,
            denominator: tripletInfo.denominator,
            visualDuration: tripletInfo.visualDuration,
            points: [],
          });
        }
        tupletGroupData.get(groupKey).points.push({
          x: positionX,
          stemTipY: lineYend,
          stemIsAbove,
          isBeamed,
        });
      }



      let nextNoteIndex = -1;
      for (let i = index + 1; i < melodyOffsets.length; i++) {
        if (melodyOffsets[i] !== null) {
          nextNoteIndex = i;
          break;
        }
      }
      const nextPositionX = nextNoteIndex !== -1
        ? getTickX(melodyOffsets[nextNoteIndex])
        : null;

      // Reset counting every measure
      // e.g. beat index = floor((offset % measureLengthSlots) / noteGroupSize)
      const relativeOffset = melodyOffsets[index] % measureLengthSlots;
      const beatIndexWithinMeasure = Math.floor(relativeOffset / noteGroupSize);

      // Head color: percussion uses the chromatone map directly; melodic staves use getMelodicColor.
      let headColor = staff === 'percussion'
        ? ((noteColoringMode === 'chromatone' || noteColoringMode === 'subtle-chroma')
          ? (noteColoringMode === 'subtle-chroma'
            ? `color-mix(in srgb, ${percussionChromatoneColors[normalizePC(noteWithAccidental)] || 'var(--text-primary)'}, ${theme === 'light' ? 'black' : 'white'} 60%)`
            : (percussionChromatoneColors[normalizePC(noteWithAccidental)] || 'var(--text-primary)'))
          : 'var(--text-primary)')
        : getMelodicColor(noteWithAccidental);
      // Stem/flag/ledger color: follows head in preview mode, otherwise default.
      const noteColor = previewColor ?? 'var(--text-primary)';
      if (previewColor) headColor = previewColor;
      const finalFlagX = stemIsAbove
        ? (staff === 'percussion' ? flagX - 1 : flagX - 2) // Green: pos+11, Yellow: pos+10
        : (flagX - 1); // Blue/Red identical: pos-0.5
      const finalFlagY = stemIsAbove ? flagY + 3 : flagY - 4; // Up: -24, Down: +23

      const isOttavaAbove = shift < 0;

      return (
        <g
          key={index}
          {...(!previewMode && interactive ? { 'data-measure-index': measureIndex, 'data-local-slot': localSlot, 'data-mel': staff, 'data-duration': duration, 'data-notes': JSON.stringify([noteWithAccidental || note]) } : {})}
          className={inputTestClass.trim() || undefined}
          style={!previewMode && interactive ? { cursor: 'pointer' } : undefined}
        >
          {ledgerLines.map((y, idx) => (
            <path
              key={`ledger-${index}-${idx}`}
              d={`M ${positionX - 7} ${y} H ${positionX + 19}`}
              stroke={noteColor}
              strokeWidth="0.5"
            />
          ))}
          {visualDuration < 48 && (
            <path
              d={`M ${lineX} ${lineYstartAdj} V ${lineYend}`}
              stroke={noteColor}
              strokeWidth="1.5"
            />
          )}
          {!isBeamed && visualDuration < 12 && (
            <text x={staff === 'percussion' && !stemIsAbove && visualDuration < 6 ? finalFlagX + 1 : finalFlagX} y={finalFlagY} fontSize="34" fill={noteColor} fontFamily="Maestro">
              {flagSymbol}
            </text>
          )}
          {/* Noteheads rendered last to be on top layer */}
          <text
            x={noteSymbol === 'w' ? positionX - 1 : positionX}
            y={noteSymbol === 'w' ? positionY : positionY}
            fontSize="36"
            fill={headColor}
            fontFamily="Maestro"
          >
            {noteSymbol}
          </text>
          {staff === 'percussion' && note === 'ho' && (
            <text
              x={positionX + 5}
              y={positionY - 12}
              fontSize="24"
              fill={noteColor}
              fontFamily="Maestro"
              textAnchor="middle"
            >
              o
            </text>
          )}
          {staff === 'percussion' && note === 'sg' && (
            <>
              <text
                x={positionX - 2}
                y={positionY + 4}
                fontSize="12"
                fill={headColor}
                fontFamily="Arial, sans-serif"
                textAnchor="end"
                style={{ fontStyle: 'normal', userSelect: 'none' }}
              >
                (
              </text>
              <text
                x={positionX + 13}
                y={positionY + 4}
                fontSize="12"
                fill={headColor}
                fontFamily="Arial, sans-serif"
                textAnchor="start"
                style={{ fontStyle: 'normal', userSelect: 'none' }}
              >
                )
              </text>
            </>
          )}
          <text
            x={positionX + 13}
            y={(Math.round(positionY) - 1) % 10 === 0 ? positionY + 1 : positionY + 6}
            fontSize="36"
            fill={headColor}
            fontFamily="Maestro"
          >
            {dot}
          </text>
          <text
            x={positionX - 4}
            y={positionY - 3}
            fontSize="36"
            fill={headColor}
            fontFamily="Maestro"
            textAnchor="end"
            // Make the accidental symbol clickable to toggle enharmonic spelling.
            // Only interactive when there is an actual accidental character AND the caller
            // provides a handler. stopPropagation prevents the parent <g data-notes> from
            // also firing and playing the note.
            style={onAccidentalClick && accidentals[index] ? { cursor: 'pointer' } : undefined}
            onClick={onAccidentalClick && accidentals[index] ? (e) => {
              e.stopPropagation();
              onAccidentalClick(melody.offsets[index]);
            } : undefined}
          >
            {staff === 'percussion' ? null : accidentals[index]}
          </text>
          {articulation === 'tie' && nextPositionX !== null && (
            <path
              d={`M ${positionX + 4} ${stemIsAbove ? positionY + 7 : positionY - 6}
                 C ${positionX + 4 + (nextPositionX - positionX) / 3} ${stemIsAbove ? positionY + 14 : positionY - 13},
                   ${nextPositionX - (nextPositionX - positionX) / 3} ${stemIsAbove ? positionY + 14 : positionY - 13},
                   ${nextPositionX} ${stemIsAbove ? positionY + 7 : positionY - 6}`}
              stroke={noteColor}
              strokeWidth="1"
              fill="none"
            />
          )}
          {/* Wrong note: red ghost quarter note showing what was played */}
          {!previewMode && inputTestState && inputTestState.status === 'error'
            && inputTestState.activeStaff === staff
            && inputTestState.wrongNote
            && (originalIndex === (melody.originalIndices ? melody.originalIndices[index] : index))
            && inputTestState.activeIndex === (melody.originalIndices ? melody.originalIndices[index] : index)
            && (() => {
              // Parse wrongNote (e.g. "E4", "A♭3") to look up its Y position
              const wn = inputTestState.wrongNote;
              const wnNat = wn ? wn.replace(/[♭º♯Ü#b𝄫𝄪]/g, '') : null;
              const wnBaseY = wnNat ? noteYMap[wnNat] : null;
              if (wnBaseY == null) return null;
              const wnY = wnBaseY + combinedShift;
              const wnX = positionX + 16; // offset slightly right of target note
              // Stem: up when note is below staff centre
              const wnStemUp = wnY > staffYStart + 20;
              const wnLineX = wnStemUp ? wnX + 11 : wnX + 0.5;
              const wnLineYstart = wnStemUp ? wnY - 1 : wnY + 1;
              const wnLineYend = wnStemUp ? wnY - 27 : wnY + 27;
              return (
                <g opacity="0.85">
                  {/* Stem */}
                  <path d={`M ${wnLineX} ${wnLineYstart} V ${wnLineYend}`} stroke="#e74c3c" strokeWidth="1.5" />
                  {/* Quarter notehead: Maestro 'Ï' */}
                  <text x={wnX} y={wnY} fontSize="36" fill="#e74c3c" fontFamily="Maestro">Ï</text>
                  {/* Small label showing what note was played */}
                  <text
                    x={wnX + 6}
                    y={wnStemUp ? wnY + 18 : wnY - 10}
                    fontSize="8"
                    fill="#e74c3c"
                    fontFamily="Arial, sans-serif"
                    textAnchor="middle"
                    style={{ fontStyle: 'italic' }}
                  >
                    {wn.replace(/\d+$/, '')}
                  </text>
                </g>
              );
            })()
          }
          {/* Hit area — extends to cover stem so clicking anywhere on note+stem plays it */}
          {!previewMode && interactive && (() => {
            const hasStem = visualDuration < 48;
            const hitTop    = hasStem ? Math.min(positionY - 14, lineYend - 3) : positionY - 14;
            const hitBottom = hasStem ? Math.max(positionY + 10, lineYend + 3) : positionY + 10;
            return (
              <rect
                x={positionX - 8}
                y={hitTop}
                width={24}
                height={hitBottom - hitTop}
                fill={debugMode ? 'purple' : 'transparent'}
                fillOpacity={debugMode ? 0.4 : 1}
                stroke={debugMode ? 'purple' : 'none'}
                strokeWidth={debugMode ? 1 : 0}
              />
            );
          })()}
        </g>

      );
    }

    return null;
  });

  // Render the Beams
  const beamElements = beamGroups.map((group, groupIndex) => {
    const bData = beamData.get(groupIndex);
    if (!bData) return null;

    const { firstX, lastX, firstYend, lastYend, slope, nonRests } = bData;
    const first = nonRests[0];
    const last = nonRests[nonRests.length - 1];
    const stemIsAbove = first.stemIsAbove;
    const beamThickness = 4.5;
    const beamYDir = stemIsAbove ? 1 : -1;

    const beamColor = previewMode ? 'var(--accent-yellow)' : 'var(--text-primary)';

    const renderTrapezoid = (x1, y1, x2, y2, keyPrefix) => {
      const y1b = y1 + beamYDir * beamThickness;
      const y2b = y2 + beamYDir * beamThickness;
      return (
        <polygon
          key={`${keyPrefix}-${groupIndex}`}
          points={`${x1},${y1} ${x2},${y2} ${x2},${y2b} ${x1},${y1b}`}
          fill={beamColor}
        />
      );
    };

    const beams = [renderTrapezoid(firstX, firstYend, lastX, lastYend, 'master')];

    // Secondary Beams for 16th notes.
    // Use visualDuration for tuplet notes — raw actualDuration (e.g. 4 ticks for triplet 8ths)
    // is below the 6-tick threshold and would falsely render a secondary beam, making triplet
    // 8ths look like 16ths. For tuplets, visualDuration encodes the correct notehead value.
    const effectiveDur = (n) =>
      melodyTriplets?.[n.index]?.visualDuration ?? n.actualDuration;
    const secondaryYOffset = beamYDir * (beamThickness + 2.5);

    for (let i = 0; i < nonRests.length; i++) {
      const n = nonRests[i];
      if (effectiveDur(n) >= 6) continue;

      const nx = getTickX(melodyOffsets[n.index]) + (stemIsAbove ? 12 : 0.5);
      const ny = firstYend + slope * (nx - firstX) + secondaryYOffset;

      const next = nonRests[i + 1];
      if (next && effectiveDur(next) < 6) {
        const nextX = getTickX(melodyOffsets[next.index]) + (stemIsAbove ? 12 : 0.5);
        const nextY = firstYend + slope * (nextX - firstX) + secondaryYOffset;
        beams.push(renderTrapezoid(nx, ny, nextX, nextY, `sec-${i}`));
      } else if (i === 0 || effectiveDur(nonRests[i - 1]) >= 6) {
        const isIsolated = (!next || effectiveDur(next) >= 6) && (i === 0 || effectiveDur(nonRests[i - 1]) >= 6);
        if (isIsolated) {
          let pointRight = true;
          if (i === 0) {
            pointRight = true;
          } else if (i === nonRests.length - 1) {
            pointRight = false;
          } else {
            pointRight = (n.offset % 12 === 0);
          }

          const stubLen = pixelsPerTick !== null ? pixelsPerTick * noteGroupSize * 0.6 : noteWidth * 0.6;
          const endX = pointRight ? nx + stubLen : nx - stubLen;
          const endY = firstYend + slope * (endX - firstX) + secondaryYOffset;

          beams.push(renderTrapezoid(nx, ny, endX, endY, `stub-${i}`));
        }
      }
    }

    return <g key={`beam-group-${groupIndex}`} {...(!previewMode ? { 'data-offset': last.offset, 'data-mel': staff, 'data-duration': last.actualDuration } : {})}>{beams}</g>;
  });

  // Render Octave Markers
  const octaveMarkerElements = octaveGroups.map((group, groupIdx) => {
    const { shift, start, end } = group;

    const startXPos = getTickX(melodyOffsets[start]);
    const endXPos = getTickX(melodyOffsets[end]) + 12;

    const isAbove = shift < 0; // 8va/15ma draw above staff

    // Dynamic vertical positioning based on notes in the group
    const notesInGroup = displayNotes.slice(start, end + 1);
    let extremeY = staffYStart + 20; // Middle line default

    notesInGroup.forEach((note, idx) => {
      if (note && note !== 'r') {
        const y = noteYMap[note] + combinedShift;
        if (isAbove) {
          if (y < extremeY) extremeY = y;
        } else {
          if (y > extremeY) extremeY = y;
        }
      }
    });

    // Positioning: at least 18px away from extremes to avoid collision with notes/ledger lines
    // But also at least staffYStart - 18 or staffYStart + 58 to stay "outside" the staff
    let markerY;
    if (isAbove) {
      markerY = Math.min(staffYStart - 18, extremeY - 18);
    } else {
      markerY = Math.max(staffYStart + 58, extremeY + 18);
    }

    const labelX = startXPos;

    const getOttavaChar = (s) => {
      if (s === -1) return 'Ã'; // 8va
      if (s === -2) return 'Û'; // 15ma
      if (s === 1) return '×';  // 8vb
      if (s === 2) return '`';  // 15mb
      return '';
    };

    const dashedLineXStart = startXPos + 22;
    const dashedLineXEnd = endXPos;

    const hookLen = 8;
    const hookYEnd = isAbove ? markerY + hookLen : markerY - hookLen;

    return (
      <g key={`octave-${groupIdx}`}>
        <text
          x={labelX}
          y={markerY}
          fontSize="30"
          fill="var(--text-primary)"
          fontFamily="Maestro"
        >
          {getOttavaChar(shift)}
        </text>
        {start < end && (
          <>
            <line
              x1={dashedLineXStart}
              y1={markerY - 8}
              x2={dashedLineXEnd}
              y2={markerY - 8}
              stroke="var(--text-primary)"
              strokeWidth="1"
              strokeDasharray="4,3"
            />
            <line
              x1={dashedLineXEnd}
              y1={markerY - 8}
              x2={dashedLineXEnd}
              y2={hookYEnd - 8}
              stroke="var(--text-primary)"
              strokeWidth="1"
            />
          </>
        )}
      </g>
    );
  });

  // Render tuplet brackets + number labels.
  // Rules:
  //   • beamed groups (visualDuration < 12): number only, no bracket (beam provides the connection)
  //   • unbeamed groups (visualDuration ≥ 12, e.g. quarter-note triplets): bracket + number
  // Number format: "3 : 2" where ": 2" (the denominator part) is dimmed.
  const tupletBracketElements = Array.from(tupletGroupData.entries()).map(([id, info]) => {
    const { noteCount, denominator, visualDuration: vd, points } = info;
    if (points.length === 0) return null;

    const first = points[0];
    const last  = points[points.length - 1];
    const stemIsAbove = first.stemIsAbove;
    const isBeamed    = first.isBeamed && vd < 12; // beamed when short visual duration

    const x1   = first.x + 5;  // near notehead centre
    const x2   = last.x  + 5;
    const midX = (x1 + x2) / 2;

    // Bracket y: just outside stem tips (above for stems-up, below for stems-down).
    let bracketY;
    if (stemIsAbove) {
      bracketY = Math.min(...points.map(p => p.stemTipY)) - 5;
    } else {
      bracketY = Math.max(...points.map(p => p.stemTipY)) + 5;
    }

    const color    = previewColor ?? 'var(--text-primary)';
    // Dimmed ratio suffix: more contrast than text-secondary (20% opacity vs ~50%).
    const dimColor = previewColor
      ? `color-mix(in srgb, ${previewColor}, transparent 75%)`
      : 'color-mix(in srgb, var(--text-primary), transparent 72%)';

    const hookLen  = 5;
    // Number is above bracket line (stems-up) or below (stems-down).
    // Larger font (14px, ~60% bigger than original 9px) needs more vertical clearance.
    const numY     = stemIsAbove ? bracketY - 3 : bracketY + 12;
    // Format: "3 : 2" — use explicit pixel gap (labelGap) between the two text anchors
    // so that "3" and ": 2" are visually separated regardless of font whitespace behaviour.
    const labelGap = 4; // px half-gap: numLabel ends at midX-labelGap, dimLabel starts at midX+labelGap
    const numLabel = `${noteCount}`;
    const dimLabel = `: ${denominator}`;

    return (
      <g key={`tuplet-${id}`}>
        {/* Bracket (only for unbeamed notes: quarter-note triplets etc.) */}
        {!isBeamed && (
          <>
            <path
              d={stemIsAbove
                ? `M ${x1} ${bracketY + hookLen} V ${bracketY} H ${midX - 12}`
                : `M ${x1} ${bracketY - hookLen} V ${bracketY} H ${midX - 12}`}
              stroke={color} strokeWidth="0.8" fill="none"
            />
            <path
              d={stemIsAbove
                ? `M ${midX + 12} ${bracketY} H ${x2} V ${bracketY + hookLen}`
                : `M ${midX + 12} ${bracketY} H ${x2} V ${bracketY - hookLen}`}
              stroke={color} strokeWidth="0.8" fill="none"
            />
          </>
        )}
        {/* Numerator (e.g. "3") — serif bold, 14px */}
        <text
          x={midX - labelGap}
          y={numY}
          fontSize="14"
          fontWeight="bold"
          textAnchor="end"
          fill={color}
          fontFamily="Georgia, 'Times New Roman', serif"
          style={{ userSelect: 'none' }}
        >
          {numLabel}
        </text>
        {/* Ratio suffix (e.g. ": 2") — same font, heavily dimmed */}
        <text
          x={midX + labelGap}
          y={numY}
          fontSize="14"
          fontWeight="bold"
          textAnchor="start"
          fill={dimColor}
          fontFamily="Georgia, 'Times New Roman', serif"
          style={{ userSelect: 'none' }}
        >
          {dimLabel}
        </text>
      </g>
    );
  });

  return (
    <g>
      {beamElements}
      {noteElements}
      {tupletBracketElements}
      {octaveMarkerElements}
    </g>
  );
};

export { renderMelodyNotes };
