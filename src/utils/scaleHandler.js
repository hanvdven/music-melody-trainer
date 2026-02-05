// utils/scaleHandler.js
import Scale from '../model/Scale';

import generateDisplayScale from '../components/generateMelody/generateDisplayScale';
import { standardizeTonic } from '../components/generateMelody/convertToDisplayNotes';

import generateAllNotesArray from './allNotesArray';
const notes = generateAllNotesArray();

// ============================================================================
// CONSTANTS
// ============================================================================

const tonicOptions = [
  'C4', 'D♭4', 'D4', 'E♭4', 'E4', 'F4', 'F♯4',
  'G4', 'A♭4', 'A4', 'B♭4', 'B4', 'C5',
];

const intervalNamesMap = {
  Unison: 0, '2nd': 2, '3rd': 4, '4th': 5, '5th': 7,
  '6th': 9, '7th': 11, Octave: 12, '9th': 14, '10th': 16,
  '11th': 17, '12th': 19, '13th': 21, '14th': 23, 'Double Octave': 24,
};

const reverseIntervalNamesMap = {};
for (const [key, value] of Object.entries(intervalNamesMap)) {
  reverseIntervalNamesMap[value] = key;
}

const intervalNames = Object.keys(intervalNamesMap);

const modeAdjustments = {
  Ionian: 0, Dorian: -2, Phrygian: -4, Lydian: 1,
  Mixolydian: -1, Aeolian: -3, Locrian: -5,
};

// ============================================================================
// SCALE DEFINITIONS (Clean Structure)
// ============================================================================

/**
 * Scale mode definition structure:
 * - index: Roman numeral (I, II, III, etc.) or null for non-indexed modes
 * - name: Clean mode name without index prefix
 * - displayName: Full display name (may include parenthetical notes)
 * - intervals: Array of semitone intervals
 * - aliases: Optional array of alternative names for searchability
 */
const scaleDefinitions = {
  Simple: [
    { name: 'Blues', intervals: [3, 2, 1, 1, 3, 2], aliases: ['Blues scale'] },
    { name: 'Major', intervals: [2, 2, 1, 2, 2, 2, 1], aliases: ['Ionian', 'Major scale'] },
    { name: 'Minor', intervals: [2, 1, 2, 2, 1, 2, 2], aliases: ['Aeolian', 'Natural Minor', 'Minor scale'] },
    { name: 'Chromatic', intervals: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  ],
  Diatonic: [
    { index: 'I', name: 'Ionian', displayName: 'Ionian (Major)', intervals: [2, 2, 1, 2, 2, 2, 1] },
    { index: 'II', name: 'Dorian', intervals: [2, 1, 2, 2, 2, 1, 2] },
    { index: 'III', name: 'Phrygian', intervals: [1, 2, 2, 2, 1, 2, 2] },
    { index: 'IV', name: 'Lydian', intervals: [2, 2, 2, 1, 2, 2, 1] },
    { index: 'V', name: 'Mixolydian', displayName: 'Mixolydian (Melodic Minor ↓)', intervals: [2, 2, 1, 2, 2, 1, 2] },
    { index: 'VI', name: 'Aeolian', displayName: 'Aeolian (Natural Minor)', intervals: [2, 1, 2, 2, 1, 2, 2] },
    { index: 'VII', name: 'Locrian', intervals: [1, 2, 2, 1, 2, 2, 2] },
  ],
  Melodic: [
    { index: 'I', name: 'Melodic Minor', displayName: 'Melodic Minor (↑)', intervals: [2, 1, 2, 2, 2, 2, 1] },
    { index: 'II', name: 'Dorian ♭2', intervals: [1, 2, 2, 2, 2, 1, 2] },
    { index: 'III', name: 'Lydian Augmented', intervals: [2, 2, 2, 2, 1, 2, 1] },
    { index: 'IV', name: 'Lydian Dominant', displayName: 'Lydian Dominant (Acoustic)', intervals: [2, 2, 2, 1, 2, 1, 2] },
    { index: 'V', name: 'Aeolian Dominant', intervals: [2, 2, 1, 2, 1, 2, 2] },
    { index: 'VI', name: 'Half Diminished', intervals: [2, 1, 2, 1, 2, 2, 2] },
    { index: 'VII', name: 'Super Locrian', displayName: 'Super Locrian "Altered" (Diminished Whole Tone)', intervals: [1, 2, 1, 2, 2, 2, 2] },
  ],
  'Harmonic Major': [
    { index: 'I', name: 'Harmonic Major', intervals: [2, 2, 1, 2, 1, 3, 1] },
    { index: 'II', name: 'Dorian ♭5', intervals: [2, 1, 2, 1, 3, 1, 2] },
    { index: 'III', name: 'Phrygian ♭4', intervals: [1, 2, 1, 3, 1, 2, 2] },
    { index: 'IV', name: 'Lydian ♭3', intervals: [2, 1, 3, 1, 2, 2, 1] },
    { index: 'V', name: 'Mixolydian ♭2', intervals: [1, 3, 1, 2, 2, 1, 2] },
    { index: 'VI', name: 'Lydian Augmented ♯2', intervals: [3, 1, 2, 2, 1, 2, 1] },
    { index: 'VII', name: 'Locrian ♭7', intervals: [1, 2, 2, 1, 2, 1, 3] },
  ],
  'Harmonic Minor': [
    { index: 'I', name: 'Harmonic Minor', intervals: [2, 1, 2, 2, 1, 3, 1] },
    { index: 'II', name: 'Locrian ♯6', intervals: [1, 2, 2, 1, 3, 1, 2] },
    { index: 'III', name: 'Ionian ♯5', intervals: [2, 2, 1, 3, 1, 2, 1] },
    { index: 'IV', name: 'Dorian ♯4', displayName: 'Dorian ♯4 (Ukrainian Dorian)', intervals: [2, 1, 3, 1, 2, 1, 2] },
    { index: 'V', name: 'Phrygian ♯2', displayName: 'Phrygian ♯2 (Phrygian Dominant)', intervals: [1, 3, 1, 2, 1, 2, 2] },
    { index: 'VI', name: 'Lydian ♯2', intervals: [3, 1, 2, 1, 2, 2, 1] },
    { index: 'VII', name: 'Mixolydian ♯1', intervals: [1, 2, 1, 2, 2, 1, 3] },
  ],
  'Double Harmonic': [
    { index: 'I', name: 'Double Harmonic Major', intervals: [1, 3, 1, 2, 1, 3, 1], aliases: ['Gypsy Major', 'Arabic', 'Byzantine Echoi', 'Flamenco'] },
    { index: 'II', name: 'Lydian ♯2 ♯6', intervals: [3, 1, 2, 1, 3, 1, 1] },
    { index: 'III', name: 'Ultraphrygian', intervals: [1, 2, 1, 3, 1, 3, 1] },
    { index: 'IV', name: 'Hungarian minor', displayName: 'Hungarian minor / Gypsy minor', intervals: [2, 1, 3, 1, 1, 3, 1] },
    { index: 'V', name: 'Oriental', intervals: [1, 3, 1, 1, 3, 1, 2] },
    { index: 'VI', name: 'Ionian ♯2 ♯5', intervals: [3, 1, 1, 3, 1, 2, 1] },
    { index: 'VII', name: 'Locrian bb3 bb7', intervals: [1, 1, 3, 1, 2, 1, 3] },
  ],
  'Other Heptatonic': [
    { name: 'Neapolitan major', intervals: [1, 2, 2, 2, 2, 2, 1] },
    { name: 'Neapolitan minor', intervals: [1, 2, 2, 2, 1, 3, 1] },
    { name: 'Hungarian major', intervals: [3, 1, 2, 1, 2, 1, 2] },
    { name: 'Locrian major', intervals: [2, 2, 1, 1, 2, 2, 2] },
    { name: 'Lydian diminished', intervals: [2, 1, 3, 1, 1, 2, 1] },
    { name: 'Gypsy major', intervals: [2, 1, 3, 1, 1, 2, 2] },
    { name: 'Enigmatic', intervals: [1, 3, 2, 2, 2, 1, 1] },
    { name: 'Persian', intervals: [1, 3, 1, 1, 2, 3, 1] },
  ],
  Pentatonic: [
    { name: 'Pentatonic Major', intervals: [2, 2, 3, 2, 3] },
    { name: 'Pentatonic Minor', displayName: 'Pentatonic Minor (Yo)', intervals: [3, 2, 2, 3, 2] },
    { name: 'Iwato', intervals: [1, 4, 1, 4, 2] },
    { name: 'In', intervals: [1, 4, 2, 1, 4] },
    { name: 'Insen', intervals: [1, 4, 2, 3, 2] },
    { name: 'Hirajoshi scale', intervals: [4, 2, 1, 4, 1] },
  ],
  Hexatonic: [
    { name: 'Blues scale', intervals: [3, 2, 1, 1, 3, 2] },
    { name: 'Whole Tone', intervals: [2, 2, 2, 2, 2, 2] },
    { name: 'Two-semitone tritone scale', intervals: [1, 1, 4, 1, 1, 4] },
    { name: 'Istrian scale', intervals: [1, 2, 1, 2, 1, 5] },
    { name: 'Tritone scale', intervals: [1, 3, 2, 1, 3, 2] },
    { name: 'Prometheus scale', intervals: [2, 2, 2, 3, 1, 2] },
    { name: 'Scale of harmonics', intervals: [3, 1, 1, 2, 2, 3] },
    { name: 'Augmented scale', intervals: [3, 1, 3, 1, 3, 1] },
  ],
  Supertonic: [
    { name: 'Major Bebop', intervals: [2, 2, 1, 2, 1, 1, 2, 1] },
    { name: 'Bebop Dominant', intervals: [2, 2, 1, 2, 2, 1, 1, 1] },
    { name: 'Algerian', intervals: [2, 1, 3, 1, 1, 3, 1, 2, 1, 2] },
    { name: 'Diminished', intervals: [2, 1, 2, 1, 2, 1, 2, 1] },
    { name: 'Dominant Diminished', intervals: [1, 2, 1, 2, 1, 2, 1, 2] },
    { name: 'Chromatic', intervals: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate legacy modes object for backward compatibility
 * Format: { family: { 'modeName': intervals } }
 */
const generateLegacyModes = () => {
  const legacy = {};
  for (const [family, modeDefs] of Object.entries(scaleDefinitions)) {
    legacy[family] = {};
    for (const modeDef of modeDefs) {
      // Use displayName if available, otherwise construct from index + name
      let key;
      if (modeDef.displayName) {
        key = modeDef.index ? `${modeDef.index}. ${modeDef.displayName}` : modeDef.displayName;
      } else if (modeDef.index) {
        key = `${modeDef.index}. ${modeDef.name}`;
      } else {
        key = modeDef.name;
      }
      legacy[family][key] = modeDef.intervals;
    }
  }
  return legacy;
};

/**
 * Get mode definition by family and mode name (legacy format)
 */
const getModeDefinition = (family, modeName) => {
  const familyDefs = scaleDefinitions[family];
  if (!familyDefs) return null;

  // Try to find by legacy format first
  for (const modeDef of familyDefs) {
    const legacyKey = modeDef.index
      ? `${modeDef.index}. ${modeDef.displayName || modeDef.name}`
      : (modeDef.displayName || modeDef.name);
    if (legacyKey === modeName) {
      return modeDef;
    }
  }

  // Try to find by clean name
  for (const modeDef of familyDefs) {
    if (modeDef.name === modeName || modeDef.displayName === modeName) {
      return modeDef;
    }
  }

  return null;
};

/**
 * Get clean mode name (without index prefix)
 */
const getCleanModeName = (family, modeName) => {
  const modeDef = getModeDefinition(family, modeName);
  return modeDef ? modeDef.name : modeName;
};

/**
 * Get mode index (Roman numeral)
 */
const getModeIndex = (family, modeName) => {
  const modeDef = getModeDefinition(family, modeName);
  return modeDef ? modeDef.index : null;
};

/**
 * Get display name for mode
 */
const getModeDisplayName = (family, modeName) => {
  const modeDef = getModeDefinition(family, modeName);
  if (!modeDef) return modeName;
  return modeDef.displayName || modeDef.name;
};

// ============================================================================
// MODE DIATONIC MAPPING (Updated to use clean names)
// ============================================================================

const modeDiatonicMapping = {
  // Simple modes
  'Major': 'Ionian',
  'Minor': 'Aeolian',
  'Blues': 'Aeolian',
  'Chromatic': 'Ionian',

  // Diatonic modes (clean names)
  'Ionian': 'Ionian',
  'Dorian': 'Dorian',
  'Phrygian': 'Phrygian',
  'Lydian': 'Lydian',
  'Mixolydian': 'Mixolydian',
  'Aeolian': 'Aeolian',
  'Locrian': 'Locrian',

  // Melodic modes
  'Melodic Minor': 'Aeolian',
  'Dorian ♭2': 'Dorian',
  'Lydian Augmented': 'Lydian',
  'Lydian Dominant': 'Lydian',
  'Aeolian Dominant': 'Aeolian',
  'Half Diminished': 'Aeolian',
  'Super Locrian': 'Locrian',

  // Harmonic Major
  'Harmonic Major': 'Ionian',
  'Dorian ♭5': 'Dorian',
  'Phrygian ♭4': 'Phrygian',
  'Lydian ♭3': 'Lydian',
  'Mixolydian ♭2': 'Mixolydian',
  'Lydian Augmented ♯2': 'Lydian',
  'Locrian ♭7': 'Locrian',

  // Harmonic Minor
  'Harmonic Minor': 'Ionian',
  'Locrian ♯6': 'Dorian',
  'Ionian ♯5': 'Phrygian',
  'Dorian ♯4': 'Lydian',
  'Phrygian ♯2': 'Mixolydian',
  'Lydian ♯2': 'Lydian',
  'Mixolydian ♯1': 'Locrian',

  // Double Harmonic
  'Double Harmonic Major': 'Ionian',
  'Lydian ♯2 ♯6': 'Lydian',
  'Ultraphrygian': 'Phrygian',
  'Hungarian minor': 'Lydian',
  'Oriental': 'Mixolydian',
  'Ionian ♯2 ♯5': 'Ionian',
  'Locrian bb3 bb7': 'Locrian',

  // Other Heptatonic
  'Neapolitan major': 'Ionian',
  'Neapolitan minor': 'Aeolian',
  'Locrian major': 'Lydian',
  'Lydian diminished': 'Mixolydian',
  'Gypsy major': 'Ionian',
  'Enigmatic': 'Aeolian',
  'Persian': 'Locrian',

  // Pentatonic
  'Pentatonic Major': 'Ionian',
  'Pentatonic Minor': 'Aeolian',
  'Iwato': 'Phrygian',
  'In': 'Lydian',
  'Insen': 'Mixolydian',
  'Hirajoshi scale': 'Aeolian',

  // Hexatonic
  'Blues scale': 'Aeolian',
};

// ============================================================================
// SCALE GENERATION FUNCTIONS
// ============================================================================

const generateScale = (anyTonic, intervals, scaleRange) => {
  const tonic = standardizeTonic(anyTonic);
  console.log('generating Scale for', { tonic }, { intervals }, { scaleRange });
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
};

const generateNumAccidentals = (anyTonic, modeName) => {
  if (!anyTonic) return 0;

  // Use standardized tonic for theory calculation (e.g. C# -> Db)
  const tonic = standardizeTonic(anyTonic);
  const tonicNote = tonic.match(/[A-G][♭♯]?/)?.[0];
  if (!tonicNote) return 0;

  // Determine the basic number of sharps or flats based on the circle of fifths
  const circleOfFifths = {
    'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F♯': 6, 'C♯': 7,
    'F': -1, 'B♭': -2, 'E♭': -3, 'A♭': -4, 'D♭': -5, 'G♭': -6, 'C♭': -7,
    'F♭': -8, 'B♯': 8
  };

  // Internal normalization for lookup consistency if we hit a non-preferred entry
  // (e.g. if C# is passed, we might want to know it's effectively Db for some logic, 
  // but here we just need the count, so 7 is technically correct for C#)
  let accidentals = circleOfFifths[tonicNote] !== undefined ? circleOfFifths[tonicNote] : 0;

  // Adjust based on mode using modeDiatonicMapping
  const cleanName = modeName.split('.').pop().trim().split('(')[0].trim();
  const modeType = modeDiatonicMapping[cleanName] || modeDiatonicMapping[modeName];

  if (modeType && modeAdjustments[modeType] !== undefined) {
    accidentals += modeAdjustments[modeType];
  }

  return accidentals;
};

const generateSelectedScale = (tonic, selectedScaleType, mode, scaleRange) => {
  const legacyModes = generateLegacyModes();

  if (!legacyModes || !legacyModes.hasOwnProperty(selectedScaleType)) {
    console.error(`Scale type '${selectedScaleType}' not found in modes.`);
    return { scale: [], displayScale: [], numAccidentals: 0 };
  }

  const scaleType = legacyModes[selectedScaleType];

  if (!scaleType.hasOwnProperty(mode)) {
    console.error(
      `Mode '${mode}' not found for scale type '${selectedScaleType}'.`
    );
    return { scale: [], displayScale: [], numAccidentals: 0 };
  }

  const intervals = scaleType[mode];

  if (!Array.isArray(intervals)) {
    console.error(
      `Intervals for mode '${mode}' in scale type '${selectedScaleType}' are invalid.`
    );
    return { scale: [], displayScale: [], numAccidentals: 0 };
  }

  const scale = generateScale(tonic, intervals, scaleRange);
  const displayScale = generateDisplayScale(tonic, intervals, scaleRange);
  const numAccidentals = generateNumAccidentals(tonic, mode);
  return { scale, displayScale, numAccidentals };
};

// ============================================================================
// RANDOM GENERATION FUNCTIONS
// ============================================================================

const randomScale = (scaleTypes, modes, setSelectedScaleType, setSelectedMode) => {
  const legacyModes = generateLegacyModes();
  const randomScaleType = scaleTypes[Math.floor(Math.random() * scaleTypes.length)];
  const scaleTypeModes = legacyModes[randomScaleType];
  const modesArray = Object.keys(scaleTypeModes);
  const randomMode = modesArray[Math.floor(Math.random() * modesArray.length)];

  setSelectedScaleType(randomScaleType);
  setSelectedMode(randomMode);
};

const randomMode = (selectedScaleType, modes, setSelectedMode) => {
  const legacyModes = generateLegacyModes();
  if (!legacyModes.hasOwnProperty(selectedScaleType)) {
    console.error(`Scale type '${selectedScaleType}' not found in modes.`);
    return;
  }

  const scaleTypeModes = Object.keys(legacyModes[selectedScaleType]);
  const randomMode = scaleTypeModes[Math.floor(Math.random() * scaleTypeModes.length)];

  setSelectedMode(randomMode);
};

const randomTonic = () => {
  return tonicOptions[Math.floor(Math.random() * tonicOptions.length)];
};

// ============================================================================
// SCALE UPDATE FUNCTIONS
// ============================================================================

export const updateScaleWithTonic = ({ currentScale, newTonic, rangeUp = 12, rangeDown = 0 }) => {
  if (!currentScale) return Scale.defaultScale(newTonic);

  const family = currentScale.family;
  const mode = currentScale.name;

  const newScaleData = generateSelectedScale(newTonic, family, mode, rangeUp);

  return new Scale(
    newScaleData.scale,
    newScaleData.displayScale,
    newScaleData.numAccidentals,
    mode,
    family,
    newTonic,
    rangeUp,
    rangeDown
  );
};

export const updateScaleWithMode = ({ currentScale, newFamily, newMode, rangeUp = 12, rangeDown = 0 }) => {
  if (!currentScale) return Scale.defaultScale();

  const tonic = currentScale.tonic;
  const newScaleData = generateSelectedScale(tonic, newFamily, newMode, rangeUp);

  return new Scale(
    newScaleData.scale,
    newScaleData.displayScale,
    newScaleData.numAccidentals,
    newMode,
    newFamily,
    tonic,
    rangeUp,
    rangeDown
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

// Legacy modes object for backward compatibility
const modes = generateLegacyModes();

export {
  generateSelectedScale,
  generateScale,
  randomScale,
  randomMode,
  randomTonic,
  tonicOptions,
  modes, // Legacy format for backward compatibility
  intervalNames,
  intervalNamesMap,
  generateNumAccidentals,
  // New helper functions
  getCleanModeName,
  getModeIndex,
  getModeDisplayName,
  getModeDefinition,
  scaleDefinitions, // New clean structure
};
