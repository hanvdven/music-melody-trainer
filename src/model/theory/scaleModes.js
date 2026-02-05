// src/model/scalemodes.js

/**
 * SCALE MODE REGISTRY
 * -------------------
 * Pure music theory definitions.
 * Uses STEP INTERVALS everywhere.
 */

/**
 * Rotate step pattern (mode change)
 */
export function rotateSteps(steps, rotation) {
    return steps
        .slice(rotation)
        .concat(steps.slice(0, rotation));
}

/**
 * Convert steps → pitch classes (if needed elsewhere)
 */
export function stepsToIntervals(steps) {
    let acc = 0;
    return [0, ...steps.slice(0, -1).map(s => (acc += s))];
}

/**
 * SCALE FAMILIES
 */
export const SCALE_FAMILIES = {
    DIATONIC: 'diatonic',
    MELODIC_MINOR: 'melodic_minor',
    HARMONIC_MINOR: 'harmonic_minor',
    HARMONIC_MAJOR: 'harmonic_major',
    DOUBLE_HARMONIC: 'double_harmonic',

    PENTATONIC: 'pentatonic',
    BLUES: 'blues',
    WHOLE_TONE: 'whole_tone',
};

/**
 * SCALE DEFINITIONS
 */
export const SCALE_DEFINITIONS = {
    [SCALE_FAMILIES.DIATONIC]: {
        toneCount: 7,
        rotatable: true,
        ui: 'wheel',
        steps: [2, 2, 1, 2, 2, 2, 1],
        modeNames: [
            'Ionian',
            'Dorian',
            'Phrygian',
            'Lydian',
            'Mixolydian',
            'Aeolian',
            'Locrian',
        ],
    },

    [SCALE_FAMILIES.MELODIC_MINOR]: {
        toneCount: 7,
        rotatable: true,
        ui: 'wheel',
        steps: [2, 1, 2, 2, 2, 2, 1],
        modeNames: [
            'Melodic Minor',
            'Dorian ♭2',
            'Lydian Augmented',
            'Lydian Dominant',
            'Mixolydian ♭6',
            'Locrian ♮2',
            'Altered',
        ],
    },

    [SCALE_FAMILIES.HARMONIC_MINOR]: {
        toneCount: 7,
        rotatable: true,
        ui: 'wheel',
        steps: [2, 1, 2, 2, 1, 3, 1],
        modeNames: [
            'Harmonic Minor',
            'Locrian ♮6',
            'Ionian ♯5',
            'Dorian ♯4',
            'Phrygian Dominant',
            'Lydian ♯2',
            'Superlocrian',
        ],
    },

    [SCALE_FAMILIES.PENTATONIC]: {
        toneCount: 5,
        rotatable: false,
        ui: 'buttons',
        scales: [
            {
                name: 'Major Pentatonic',
                steps: [2, 2, 3, 2, 3],
            },
            {
                name: 'Minor Pentatonic',
                steps: [3, 2, 2, 3, 2],
            },
        ],
    },

    [SCALE_FAMILIES.WHOLE_TONE]: {
        toneCount: 6,
        rotatable: false,
        ui: 'buttons',
        scales: [
            {
                name: 'Whole Tone',
                steps: [2, 2, 2, 2, 2, 2],
            },
        ],
    },
};
