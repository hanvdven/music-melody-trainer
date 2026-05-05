// theory/scaleHandler.js
import Scale from '../model/Scale';
import logger from '../utils/logger';

import generateDisplayScale from './generateDisplayScale';
import { standardizeTonic } from './convertToDisplayNotes';
import { CANONICAL_MAP, getCanonicalNote, ENHARMONIC_PAIRS } from './noteUtils';

import generateAllNotesArray from './allNotesArray';
const notes = generateAllNotesArray();

// ============================================================================
// CONSTANTS
// ============================================================================

const tonicOptions = [
    'C4',
    'C♯4', 'D♭4',
    'D4',
    'D♯4', 'E♭4',
    'E4', // E# / Fb? rarely used as tonic center in this context
    'F4',
    'F♯4', 'G♭4',
    'G4',
    'G♯4', 'A♭4',
    'A4',
    'A♯4', 'B♭4',
    'B4', // Cb?
    'C5',
];

export { ENHARMONIC_PAIRS };

export const getBestEnharmonicTonic = (anyTonic, modeName) => {
    if (!anyTonic) return anyTonic;
    const tonic = standardizeTonic(anyTonic);
    const notePC = tonic.replace(/\d+$/, '');
    const octave = tonic.match(/\d+$/)?.[0] || '4';

    const currentAcc = generateNumAccidentals(tonic, modeName);
    const enharmonicPC = ENHARMONIC_PAIRS[notePC];

    if (!enharmonicPC) return anyTonic;

    let enharmonicOctave = parseInt(octave, 10);
    if (notePC === 'C' && enharmonicPC === 'B♯') enharmonicOctave--;
    else if (notePC === 'B♯' && enharmonicPC === 'C') enharmonicOctave++;
    else if (notePC === 'B' && enharmonicPC === 'C♭') enharmonicOctave++;
    else if (notePC === 'C♭' && enharmonicPC === 'B') enharmonicOctave--;

    const enharmonicTonic = enharmonicPC + enharmonicOctave;
    const enharmonicAcc = generateNumAccidentals(enharmonicTonic, modeName);

    const absCurrent = Math.abs(currentAcc);
    const absEnharmonic = Math.abs(enharmonicAcc);

    // If current > 7, definitely swap if enharmonic is <= 7
    if (absCurrent > 7 && absEnharmonic <= 7) return enharmonicTonic;
    // Favor the one with fewer accidentals; on a tie prefer flat spelling (negative = fewer ledger lines)
    if (absEnharmonic < absCurrent) return enharmonicTonic;
    if (absEnharmonic === absCurrent && enharmonicAcc < currentAcc) return enharmonicTonic;

    return anyTonic;
};

const intervalNamesMap = {
    Unison: 0,
    '2nd': 2,
    '3rd': 4,
    '4th': 5,
    '5th': 7,
    '6th': 9,
    '7th': 11,
    Octave: 12,
    '9th': 14,
    '10th': 16,
    '11th': 17,
    '12th': 19,
    '13th': 21,
    '14th': 23,
    'Double Octave': 24,
};

const reverseIntervalNamesMap = {};
for (const [key, value] of Object.entries(intervalNamesMap)) {
    reverseIntervalNamesMap[value] = key;
}

const intervalNames = Object.keys(intervalNamesMap);

const modeAdjustments = {
    Ionian: 0,
    Dorian: -2,
    Phrygian: -4,
    Lydian: 1,
    Mixolydian: -1,
    Aeolian: -3,
    Locrian: -5,
};

// ============================================================================
// SCALE DEFINITIONS (Clean Structure)
// ============================================================================

/**
 * Scale mode definition structure:
 * - index: Roman numeral (I, II, III, etc.) or null for non-indexed modes
 * - name: Clean mode name without index prefix
 * - wheelName: Full display name (may include parenthetical notes)
 * - intervals: Array of semitone intervals
 * - aliases: Optional array of alternative names for searchability
 */
const scaleDefinitions = {
    Diatonic: [
        {
            index: 'I',
            name: 'Major',
            wheelName: 'Ionian',
            intervals: [2, 2, 1, 2, 2, 2, 1],
            isSimple: true,
            diatonic: 'Ionian',
        },
        { index: 'II', name: 'Dorian', intervals: [2, 1, 2, 2, 2, 1, 2], diatonic: 'Dorian' },
        { index: 'III', name: 'Phrygian', intervals: [1, 2, 2, 2, 1, 2, 2], diatonic: 'Phrygian' },
        { index: 'IV', name: 'Lydian', intervals: [2, 2, 2, 1, 2, 2, 1], diatonic: 'Lydian' },
        {
            index: 'V',
            name: 'Melodic Minor ↓',
            wheelName: 'Mixolydian',
            intervals: [2, 2, 1, 2, 2, 1, 2],
            diatonic: 'Mixolydian',
        },
        {
            index: 'VI',
            name: 'Minor',
            wheelName: 'Aeolian',
            intervals: [2, 1, 2, 2, 1, 2, 2],
            isSimple: true,
            diatonic: 'Aeolian',
        },
        { index: 'VII', name: 'Locrian', intervals: [1, 2, 2, 1, 2, 2, 2], diatonic: 'Locrian' },
    ],
    Melodic: [
        {
            index: 'I',
            name: 'Melodic Minor ↑',
            intervals: [2, 1, 2, 2, 2, 2, 1],
            isSimple: true,
            diatonic: 'Aeolian',
        },
        { index: 'II', name: 'Dorian ♭2', intervals: [1, 2, 2, 2, 2, 1, 2], diatonic: 'Dorian' },
        {
            index: 'III',
            name: 'Lydian Augmented',
            intervals: [2, 2, 2, 2, 1, 2, 1],
            diatonic: 'Lydian',
        },
        {
            index: 'IV',
            name: 'Acoustic',
            wheelName: 'Lydian Dominant',
            intervals: [2, 2, 2, 1, 2, 1, 2],
            diatonic: 'Lydian',
        },
        { index: 'V', name: 'Aeolian Dominant', intervals: [2, 2, 1, 2, 1, 2, 2], diatonic: 'Aeolian' },
        { index: 'VI', name: 'Half Diminished', intervals: [2, 1, 2, 1, 2, 2, 2], diatonic: 'Aeolian' },
        {
            index: 'VII',
            name: 'Altered',
            wheelName: 'Super Locrian',
            intervals: [1, 2, 1, 2, 2, 2, 2],
            aliases: ['Diminished Whole Tone'],
            diatonic: 'Locrian',
        },
    ],
    'Harmonic Major': [
        { index: 'I', name: 'Harmonic Major', intervals: [2, 2, 1, 2, 1, 3, 1], diatonic: 'Ionian' },
        { index: 'II', name: 'Dorian ♭5', intervals: [2, 1, 2, 1, 3, 1, 2], diatonic: 'Dorian' },
        { index: 'III', name: 'Phrygian ♭4', intervals: [1, 2, 1, 3, 1, 2, 2], diatonic: 'Phrygian' },
        { index: 'IV', name: 'Lydian ♭3', intervals: [2, 1, 3, 1, 2, 2, 1], diatonic: 'Lydian' },
        { index: 'V', name: 'Mixolydian ♭2', intervals: [1, 3, 1, 2, 2, 1, 2], diatonic: 'Mixolydian' },
        {
            index: 'VI',
            name: 'Lydian Augmented ♯2',
            intervals: [3, 1, 2, 2, 1, 2, 1],
            diatonic: 'Lydian',
        },
        { index: 'VII', name: 'Locrian ♭7', intervals: [1, 2, 2, 1, 2, 1, 3], diatonic: 'Locrian' },
    ],
    'Harmonic Minor': [
        {
            index: 'I',
            name: 'Harmonic Minor',
            preferredName: 'Harmonic Minor',
            intervals: [2, 1, 2, 2, 1, 3, 1],
            isSimple: true,
            diatonic: 'Aeolian',
        },
        { index: 'II', name: 'Locrian ♯6', intervals: [1, 2, 2, 1, 3, 1, 2], diatonic: 'Locrian' },
        { index: 'III', name: 'Ionian ♯5', intervals: [2, 2, 1, 3, 1, 2, 1], diatonic: 'Ionian' },
        {
            index: 'IV',
            name: 'Ukrainian Dorian',
            wheelName: 'Dorian ♯4',
            intervals: [2, 1, 3, 1, 2, 1, 2],
            aliases: ['Romanian Minor'],
            diatonic: 'Dorian',
        },
        {
            index: 'V',
            name: 'Phrygian Dominant',
            wheelName: 'Phrygian ♯2',
            intervals: [1, 3, 1, 2, 1, 2, 2],
            aliases: ['Spanish Gypsy'],
            diatonic: 'Phrygian',
        },
        { index: 'VI', name: 'Lydian ♯2', intervals: [3, 1, 2, 1, 2, 2, 1], diatonic: 'Lydian' },
        { index: 'VII', name: 'Mixolydian ♯1', intervals: [1, 2, 1, 2, 2, 1, 3], diatonic: 'Locrian' },
    ],
    'Double Harmonic': [
        {
            index: 'I',
            name: 'Double Harmonic Major',
            intervals: [1, 3, 1, 2, 1, 3, 1],
            aliases: ['Gypsy Major', 'Arabic', 'Byzantine Echoi', 'Flamenco'],
            diatonic: 'Ionian',
        },
        { index: 'II', name: 'Lydian ♯2 ♯6', intervals: [3, 1, 2, 1, 3, 1, 1], diatonic: 'Lydian' },
        { index: 'III', name: 'Ultraphrygian', intervals: [1, 2, 1, 3, 1, 3, 1], diatonic: 'Phrygian' },
        {
            index: 'IV',
            name: 'Hungarian minor',
            aliases: ['Gypsy minor'],
            intervals: [2, 1, 3, 1, 1, 3, 1],
            diatonic: 'Lydian',
        },
        { index: 'V', name: 'Oriental', intervals: [1, 3, 1, 1, 3, 1, 2], diatonic: 'Mixolydian' },
        { index: 'VI', name: 'Ionian ♯2 ♯5', intervals: [3, 1, 1, 3, 1, 2, 1], diatonic: 'Ionian' },
        { index: 'VII', name: 'Locrian ♭3 ♭7', intervals: [1, 1, 3, 1, 2, 1, 3], diatonic: 'Locrian' },
    ],
    'Other Heptatonic': [
        { name: 'Neapolitan major', intervals: [1, 2, 2, 2, 2, 2, 1], diatonic: 'Ionian' },
        { name: 'Neapolitan minor', intervals: [1, 2, 2, 2, 1, 3, 1], diatonic: 'Aeolian' },
        { name: 'Hungarian major', intervals: [3, 1, 2, 1, 2, 1, 2], diatonic: 'Ionian' },
        { name: 'Locrian major', intervals: [2, 2, 1, 1, 2, 2, 2], diatonic: 'Locrian' },
        { name: 'Lydian diminished', intervals: [2, 1, 3, 1, 2, 2, 1], diatonic: 'Lydian' },
        { name: 'Gypsy major', intervals: [2, 1, 3, 1, 1, 2, 2], diatonic: 'Locrian' },
        { name: 'Enigmatic', intervals: [1, 3, 2, 2, 2, 1, 1], diatonic: 'Ionian' },
        { name: 'Persian', intervals: [1, 3, 1, 1, 2, 3, 1], diatonic: 'Locrian' },
    ],
    Pentatonic: [
        {
            name: 'Pentatonic Major',
            intervals: [2, 2, 3, 2, 3],
            isSimple: true,
            diatonic: 'Ionian',
            heptaRefIntervals: [2, 2, 1, 2, 2, 2, 1],
        },
        {
            name: 'Pentatonic Minor',
            aliases: ['Yo'],
            intervals: [3, 2, 2, 3, 2],
            isSimple: true,
            diatonic: 'Aeolian',
            heptaRefIntervals: [2, 1, 2, 2, 1, 2, 2],
        },
        { name: 'Iwato', intervals: [1, 4, 1, 4, 2], diatonic: 'Phrygian', heptaRefIntervals: [1, 2, 2, 2, 1, 2, 2] },
        { name: 'In', intervals: [1, 4, 2, 1, 4], diatonic: 'Lydian', heptaRefIntervals: [2, 2, 2, 1, 2, 2, 1] },
        { name: 'Insen', intervals: [1, 4, 2, 3, 2], diatonic: 'Mixolydian', heptaRefIntervals: [2, 2, 1, 2, 2, 1, 2] },
        { name: 'Hirajoshi scale', intervals: [4, 2, 1, 4, 1], diatonic: 'Aeolian', heptaRefIntervals: [2, 1, 2, 2, 1, 2, 2] },
        { name: 'Egyptian pentatonic', intervals: [2, 3, 2, 3, 2], diatonic: 'Ionian', heptaRefIntervals: [2, 2, 1, 2, 2, 2, 1] },
        { name: 'Kumoi', intervals: [2, 1, 4, 1, 4], diatonic: 'Aeolian', heptaRefIntervals: [2, 1, 2, 2, 1, 2, 2] },
        { name: 'Minor six pentatonic', intervals: [3, 2, 1, 4, 2], diatonic: 'Aeolian', heptaRefIntervals: [2, 1, 2, 1, 2, 2, 2] },
    ],
    Hexatonic: [
        { name: 'Minor Blues scale', intervals: [3, 2, 1, 1, 3, 2], diatonic: 'Aeolian', heptaRefIntervals: [2, 1, 2, 2, 1, 2, 2] },
        { name: 'Major blues scale', intervals: [2, 1, 1, 3, 2, 3], diatonic: 'Ionian', heptaRefIntervals: [2, 2, 1, 2, 2, 2, 1] },
        { name: 'Whole Tone', intervals: [2, 2, 2, 2, 2, 2], diatonic: 'Lydian', heptaRefIntervals: [2, 2, 1, 1, 2, 2, 2] },
        { name: 'Two-semitone tritone scale', diatonic: 'Phrygian', intervals: [1, 1, 4, 1, 1, 4], heptaRefIntervals: [1, 1, 2, 2, 1, 1, 4] },
        { name: 'Istrian scale', intervals: [1, 2, 1, 2, 1, 5], diatonic: 'Phrygian', heptaRefIntervals: [1, 2, 2, 2, 1, 2, 2] },
        { name: 'Tritone scale', intervals: [1, 3, 2, 1, 3, 2], diatonic: 'Locrian', heptaRefIntervals: [1, 2, 2, 1, 2, 2, 2] },
        { name: 'Prometheus scale', intervals: [2, 2, 2, 3, 1, 2], diatonic: 'Lydian', heptaRefIntervals: [2, 2, 2, 1, 2, 1, 2] },
        { name: 'Scale of harmonics', intervals: [3, 1, 1, 2, 2, 3], diatonic: 'Mixolydian', heptaRefIntervals: [2, 2, 1, 2, 2, 1, 2] },
        { name: 'Augmented scale', intervals: [3, 1, 3, 1, 3, 1], diatonic: 'Ionian', heptaRefIntervals: [3, 1, 2, 2, 1, 2, 1] },
    ],
    Supertonic: [
        {
            name: 'Major Bebop', intervals: [2, 2, 1, 2, 1, 1, 2, 1],
            diatonic: 'Ionian',
            heptaRefIntervals: [2, 2, 1, 2, 2, 2, 1],
        },
        {
            name: 'Bebop Dominant', intervals: [2, 2, 1, 2, 2, 1, 1, 1],
            diatonic: 'Ionian',
            heptaRefIntervals: [2, 2, 1, 2, 2, 2, 1],
        },
        { name: 'Diminished', intervals: [2, 1, 2, 1, 2, 1, 2, 1], diatonic: 'Locrian', heptaRefIntervals: [2, 1, 2, 1, 3, 2, 1], aliases: ['Whole-half diminished'] },
        { name: 'Dominant Diminished', intervals: [1, 2, 1, 2, 1, 2, 1, 2], diatonic: 'Mixolydian', heptaRefIntervals: [1, 3, 2, 1, 2, 1, 2], aliases: ['Half-whole diminished'] },
        {
            name: 'Spanish octatonic',
            intervals: [1, 3, 1, 2, 1, 1, 2, 1],
            diatonic: 'Phrygian',
            heptaRefIntervals: [1, 3, 1, 2, 1, 1, 3]
        },
        {
            name: 'Chromatic',
            intervals: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            isSimple: true,
            diatonic: 'Ionian',
            heptaRefIntervals: [2, 2, 1, 2, 2, 2, 1],
        },
    ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Look up scale definition from scaleDefinitions
 */
const getScaleDefinition = (requestedFamily, modeName) => {
    const cleanModeName = modeName.replace(/^[IVX]+\.\s*/, '');

    if (requestedFamily === 'Simple') {
        for (const [actualFamily, modeDefs] of Object.entries(scaleDefinitions)) {
            for (const modeDef of modeDefs) {
                if (modeDef.isSimple) {
                    const defName = modeDef.preferredName || modeDef.name;
                    const wheelName = modeDef.wheelName || '';

                    if (defName === cleanModeName ||
                        modeDef.name === cleanModeName ||
                        wheelName === cleanModeName ||
                        defName === modeName ||
                        modeDef.name === modeName ||
                        wheelName === modeName) {
                        const legacyModeKey = modeDef.index
                            ? `${modeDef.index}. ${modeDef.wheelName || modeDef.name}`
                            : modeDef.wheelName || modeDef.name;

                        return {
                            family: actualFamily,
                            isSimple: true,
                            displayName: modeDef.preferredName || modeDef.name, // single assignment
                            intervals: modeDef.intervals,
                            name: modeDef.name,
                            heptaRefIntervals: modeDef.heptaRefIntervals || null,
                            legacyModeKey
                        };
                    }
                }
            }
        }
        return null;
    }

    const familyDefs = scaleDefinitions[requestedFamily];
    if (!familyDefs) return null;

    for (const modeDef of familyDefs) {
        const defName = modeDef.preferredName || modeDef.name;
        const wheelName = modeDef.wheelName || '';

        if (defName === cleanModeName ||
            modeDef.name === cleanModeName ||
            wheelName === cleanModeName ||
            defName === modeName ||
            modeDef.name === modeName ||
            wheelName === modeName) {
            const legacyModeKey = modeDef.index
                ? `${modeDef.index}. ${modeDef.wheelName || modeDef.name}`
                : modeDef.wheelName || modeDef.name;

            return {
                family: requestedFamily,
                isSimple: modeDef.isSimple || false,
                displayName: modeDef.preferredName || modeDef.name, // single assignment
                intervals: modeDef.intervals,
                name: modeDef.name,
                heptaRefIntervals: modeDef.heptaRefIntervals || null,
                legacyModeKey
            };
        }
    }

    return null;
};

/**
 * Generate legacy modes object for backward compatibility
 */
const generateLegacyModes = () => {
    const legacy = {};

    legacy['Simple'] = {};
    for (const [family, modeDefs] of Object.entries(scaleDefinitions)) {
        for (const modeDef of modeDefs) {
            if (modeDef.isSimple) {
                const key = modeDef.index
                    ? `${modeDef.index}. ${modeDef.wheelName || modeDef.name}`
                    : modeDef.wheelName || modeDef.name;
                legacy['Simple'][key] = modeDef.intervals;
            }
        }
    }

    for (const [family, modeDefs] of Object.entries(scaleDefinitions)) {
        legacy[family] = {};
        for (const modeDef of modeDefs) {
            const key = modeDef.index
                ? `${modeDef.index}. ${modeDef.wheelName || modeDef.name}`
                : modeDef.wheelName || modeDef.name;
            legacy[family][key] = modeDef.intervals;
        }
    }
    return legacy;
};

const getModeDefinition = (family, modeName) => {
    if (family === 'Simple') {
        for (const [fam, familyDefs] of Object.entries(scaleDefinitions)) {
            const found = findInFamily(familyDefs, modeName);
            if (found) return found;
        }
        return null;
    }

    const familyDefs = scaleDefinitions[family];
    if (!familyDefs) return null;
    return findInFamily(familyDefs, modeName);
};

const findInFamily = (familyDefs, modeName) => {
    for (const modeDef of familyDefs) {
        const legacyKey = modeDef.index
            ? `${modeDef.index}. ${modeDef.wheelName || modeDef.name}`
            : modeDef.wheelName || modeDef.name;
        if (legacyKey === modeName) {
            return modeDef;
        }
    }

    for (const modeDef of familyDefs) {
        if (
            modeDef.name === modeName ||
            modeDef.wheelName === modeName ||
            modeDef.preferredName === modeName
        ) {
            return modeDef;
        }
    }
    return null;
};

const getCleanModeName = (family, modeName) => {
    const modeDef = getModeDefinition(family, modeName);
    return modeDef ? modeDef.name : modeName;
};

const getModeIndex = (family, modeName) => {
    const modeDef = getModeDefinition(family, modeName);
    return modeDef ? modeDef.index : null;
};

const getModeDisplayName = (family, modeName) => {
    const modeDef = getModeDefinition(family, modeName);
    if (!modeDef) return modeName;
    return modeDef.wheelName || modeDef.name;
};

const formatScaleName = (tonic, modeName, family, customLabel = null) => {
    const tonicWithoutOctave = tonic.replace(/\d+$/, '');

    if (customLabel) {
        return `${tonicWithoutOctave} ${customLabel}`;
    }

    const modeDef = getModeDefinition(family, modeName);
    const cleanModeName = modeDef ? modeDef.name : modeName.replace(/^[IVX]+\.\s*/, '');

    if (family === 'Simple' || family === 'Triad scales') {
        return `${tonicWithoutOctave} ${cleanModeName}`;
    }

    const technicalName = modeDef?.wheelName || modeDef?.name;

    if (technicalName && technicalName !== cleanModeName) {
        return `${tonicWithoutOctave} ${cleanModeName} (${technicalName})`;
    }

    return `${tonicWithoutOctave} ${cleanModeName}`;
};

// ============================================================================
// SCALE GENERATION FUNCTIONS
// ============================================================================

const generateScale = (anyTonic, intervals, scaleRange) => {
    const tonic = standardizeTonic(anyTonic);
    const scale = [];
    const canonicalTonic = getCanonicalNote(tonic);
    let noteIndex = notes.indexOf(canonicalTonic);

    if (noteIndex === -1) {
        // Double check standard lookup just in case
        noteIndex = notes.indexOf(tonic);

        if (noteIndex === -1) {
            logger.warn('scaleHandler', `Standardized tonic "${tonic}" (canonical: ${canonicalTonic}) not found in notes array. Fallback to C4.`);
            noteIndex = 0; // Fallback to safe default
        }
    }

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

    const tonic = standardizeTonic(anyTonic);
    const tonicNote = tonic.match(/[A-G][♭♯]?/)?.[0];
    if (!tonicNote) return 0;

    const circleOfFifths = {
        C: 0,
        G: 1,
        D: 2,
        A: 3,
        E: 4,
        B: 5,
        'F♯': 6,
        'C♯': 7,
        'G♯': 8,
        'D♯': 9,
        'A♯': 10,
        'E♯': 11,
        'B♯': 12,
        F: -1,
        'B♭': -2,
        'E♭': -3,
        'A♭': -4,
        'D♭': -5,
        'G♭': -6,
        'C♭': -7,
        'F♭': -8,
    };

    let accidentals = circleOfFifths[tonicNote] !== undefined ? circleOfFifths[tonicNote] : 0;

    const cleanName = modeName.split('.').pop().trim().split('(')[0].trim();

    const findDiatonicForMode = (name) => {
        for (const [family, modeDefs] of Object.entries(scaleDefinitions)) {
            if (!Array.isArray(modeDefs)) continue;
            for (const modeDef of modeDefs) {
                const legacyKey = modeDef.index
                    ? `${modeDef.index}. ${modeDef.wheelName || modeDef.name}`
                    : modeDef.wheelName || modeDef.name;
                if (legacyKey === name || modeDef.name === name || modeDef.wheelName === name) {
                    return modeDef.diatonic || null;
                }
            }
        }
        return null;
    };

    const modeType = findDiatonicForMode(modeName) || findDiatonicForMode(cleanName);

    if (modeType && modeAdjustments[modeType] !== undefined) {
        accidentals += modeAdjustments[modeType];
    }

    return accidentals;
};

/**
 * Resolves the parent family for scales that use 'Simple' as their family.
 */
const getParentFamily = (family, mode) => {
    if (family !== 'Simple') return family;

    if (mode === 'Major' || mode === 'Minor' || mode === 'Natural Minor') return 'Diatonic';
    if (mode === 'Major Triad' || mode === 'Minor Triad' || mode === 'Diminished Triad' || mode === 'Augmented Triad') return 'Triad';
    if (mode === 'Chromatic') return 'Chromatic';
    if (mode === 'Whole Tone') return 'Hexatonic';
    if (mode === 'Pentatonic Major' || mode === 'Pentatonic Minor') return 'Pentatonic';

    return family;
};

const generateSelectedScale = (tonic, selectedScaleType, mode, scaleRange) => {
    const legacyModes = generateLegacyModes();
    const resolvedScaleType = getParentFamily(selectedScaleType, mode);

    if (!legacyModes || !legacyModes.hasOwnProperty(resolvedScaleType)) {
        return { scale: [], displayScale: [], numAccidentals: 0 };
    }

    const scaleType = legacyModes[resolvedScaleType];

    if (!scaleType.hasOwnProperty(mode)) {
        return { scale: [], displayScale: [], numAccidentals: 0 };
    }

    const intervals = scaleType[mode];

    if (!Array.isArray(intervals)) {
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
        logger.error('scaleHandler', 'E016-SCALE-TYPE-NOT-FOUND', null, { selectedScaleType });
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

    const scaleDef = getScaleDefinition(family, mode);
    if (!scaleDef) {
        logger.error('scaleHandler', 'E017-SCALE-DEF-NOT-FOUND', null, { family, mode });
        return currentScale;
    }

    const newScaleData = generateSelectedScale(newTonic, scaleDef.family, scaleDef.legacyModeKey, rangeUp);

    return new Scale(
        newScaleData.scale,
        newScaleData.displayScale,
        newScaleData.numAccidentals,
        scaleDef.name,
        scaleDef.family,
        newTonic,
        rangeUp,
        rangeDown,
        scaleDef.isSimple,
        scaleDef.displayName,
        scaleDef.heptaRefIntervals,
        scaleDef.intervals,
        scaleDef.diatonic
    );
};

export const updateScaleWithMode = ({
    currentScale,
    newFamily,
    newMode,
    rangeUp = 12,
    rangeDown = 0,
    displayName = null,
}) => {
    if (!currentScale) return Scale.defaultScale();

    const tonic = currentScale.tonic;

    const scaleDef = getScaleDefinition(newFamily, newMode);
    if (!scaleDef) {
        logger.error('scaleHandler', 'E017-SCALE-DEF-NOT-FOUND', null, { family: newFamily, mode: newMode });
        return currentScale;
    }

    const newScaleData = generateSelectedScale(tonic, scaleDef.family, scaleDef.legacyModeKey, rangeUp);

    return new Scale(
        newScaleData.scale,
        newScaleData.displayScale,
        newScaleData.numAccidentals,
        scaleDef.name,
        scaleDef.family,
        tonic,
        rangeUp,
        rangeDown,
        scaleDef.isSimple,
        displayName || scaleDef.displayName,
        scaleDef.heptaRefIntervals,
        scaleDef.intervals,
        scaleDef.diatonic
    );
};

// ============================================================================
// EXPORTS
// ============================================================================

const getDiatonicIntervals = (diatonicName) => {
    if (!diatonicName) return null;

    const diatonicModes = scaleDefinitions['Diatonic'];
    if (diatonicModes) {
        const def = diatonicModes.find(d => d.name === diatonicName || d.wheelName === diatonicName);
        if (def) return def.intervals;
    }

    for (const family in scaleDefinitions) {
        if (family === 'Diatonic') continue;
        const def = scaleDefinitions[family].find(d => d.name === diatonicName || d.wheelName === diatonicName);
        if (def) return def.intervals;
    }
    return null;
};

const modes = generateLegacyModes();

export {
    generateSelectedScale,
    generateScale,
    randomScale,
    randomMode,
    randomTonic,
    tonicOptions,
    modes,
    intervalNames,
    intervalNamesMap,
    generateNumAccidentals,
    getCleanModeName,
    getModeIndex,
    getModeDisplayName,
    getModeDefinition,
    formatScaleName,
    scaleDefinitions,
    getDiatonicIntervals,
};

