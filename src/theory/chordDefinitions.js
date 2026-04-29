// theory/chordDefinitions.js
// Moved from utils/chordDefinitions.js

/**
 * Comprehensive chord definition model
 * Each definition includes:
 * - name: Human-readable chord name
 * - intervals: Array of semitone intervals from root (always starts with 0)
 * - structure: Array of scale-degree offsets (0=root,1=2nd,2=3rd,3=4th,4=5th,5=6th,6=7th)
 * - notation: Suffix notation for chord symbol (e.g., "", "min", "°", "maj7")
 * - quality: Basic quality classification (major, minor, diminished, augmented, suspended, dominant)
 * - romanNotation: Function to format roman numeral based on quality
 *
 * structure and intervals are parallel-ish arrays but may differ in order;
 * both are normalized (sorted ascending) for matching purposes.
 */

const chordDefinitions = [
    {
        name: 'Root',
        intervals: [0],
        structure: [0],
        notation: '1',
        quality: 'major',
        romanNotation: (base) => base.toUpperCase(),
    },
    // ============================================================================
    // POWER
    // ============================================================================
    {
        name: 'Double Diminished',
        intervals: [0, 5],
        structure: [0, 4],
        notation: '𝄫5',
        quality: 'minor',
        romanNotation: (base) => base.toLowerCase(),
    },
    {
        name: 'Power',
        intervals: [0, 7],
        structure: [0, 4],
        notation: '5',
        quality: 'major',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Diminished Power',
        intervals: [0, 6],
        structure: [0, 4],
        notation: '°5',
        quality: 'diminished',
        romanNotation: (base) => base.toLowerCase(),
    },
    {
        name: 'Augmented Power',
        intervals: [0, 8],
        structure: [0, 4],
        notation: '+',
        quality: 'augmented',
        romanNotation: (base) => base.toUpperCase(),
    },

    // ============================================================================
    // TRIADS
    // ============================================================================
    {
        name: 'Major Triad',
        intervals: [0, 4, 7],
        structure: [0, 2, 4],
        notation: '',
        quality: 'major',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Minor Triad',
        intervals: [0, 3, 7],
        structure: [0, 2, 4],
        notation: '−',
        quality: 'minor',
        romanNotation: (base) => base.toLowerCase(),
    },
    {
        name: 'Diminished Triad',
        intervals: [0, 3, 6],
        structure: [0, 2, 4],
        notation: '°',
        quality: 'diminished',
        romanNotation: (base) => base.toLowerCase(),
    },
    {
        name: 'Augmented Triad',
        intervals: [0, 4, 8],
        structure: [0, 2, 4],
        notation: '+',
        quality: 'augmented',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Double Diminished',
        notation: '𝄫5',
        quality: 'minor',
        intervals: [0, 3, 5],
        structure: [0, 2, 3],
        romanNotation: (base) => base.toLowerCase(),
    },
    {
        name: 'Suspended 4th flat 6',
        intervals: [0, 5, 8],
        structure: [0, 3, 5],
        notation: 'sus4(♭6)',
        quality: 'suspended',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Suspended 4th add 6',
        intervals: [0, 5, 9],
        structure: [0, 3, 5],
        notation: 'sus4,6',
        quality: 'suspended',
        romanNotation: (base) => base.toUpperCase(),
    },

    // ============================================================================
    // SUSPENDED CHORDS
    // ============================================================================
    {
        name: 'Suspended 2nd',
        intervals: [0, 2, 7],
        structure: [0, 1, 4],
        notation: 'sus2',
        quality: 'suspended',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Suspended 4th',
        intervals: [0, 5, 7],
        structure: [0, 3, 4],
        notation: 'sus4',
        quality: 'suspended',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Suspended 2nd Reduced',
        notation: '𝄫5sus2',   // missing fifth
        quality: 'suspended',
        intervals: [0, 2, 5],
        structure: [0, 1, 3],
        romanNotation: (base) => base.toLowerCase(),
    },

    // ============================================================================
    // SIXTH CHORDS
    // ============================================================================
    {
        name: 'Major Sixth',
        intervals: [0, 4, 7, 9],
        structure: [0, 2, 4, 5],
        notation: '6',
        quality: 'major',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Minor Sixth',
        intervals: [0, 3, 7, 9],
        structure: [0, 2, 4, 5],
        notation: '−6',
        quality: 'minor',
        romanNotation: (base) => base.toLowerCase(),
    },
    {
        name: 'Six Nine',
        intervals: [0, 4, 7, 9, 14],
        structure: [0, 1, 2, 4, 5],
        notation: '6/9',
        quality: 'major',
        romanNotation: (base) => base.toUpperCase(),
    },


    // ============================================================================
    // SEVENTH CHORDS
    // ============================================================================
    {
        name: 'Major Seventh',
        intervals: [0, 4, 7, 11],
        structure: [0, 2, 4, 6],
        notation: 'maj7',
        quality: 'major',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Dominant Seventh',
        intervals: [0, 4, 7, 10],
        structure: [0, 2, 4, 6],
        notation: '7',
        quality: 'dominant',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Minor Seventh',
        intervals: [0, 3, 7, 10],
        structure: [0, 2, 4, 6],
        notation: '−7',
        quality: 'minor',
        romanNotation: (base) => base.toLowerCase(),
    },
    {
        name: 'Minor Major Seventh',
        intervals: [0, 3, 7, 11],
        structure: [0, 2, 4, 6],
        notation: 'min(maj7)',
        quality: 'minor',
        romanNotation: (base) => base.toLowerCase(),
    },
    {
        name: 'Half Diminished Seventh',
        intervals: [0, 3, 6, 10],
        structure: [0, 2, 4, 6],
        notation: 'ø7',
        quality: 'diminished',
        romanNotation: (base) => base.toLowerCase(),
    },
    {
        name: 'Diminished Seventh',
        intervals: [0, 3, 6, 9],
        structure: [0, 2, 4, 6],
        notation: 'o7',
        quality: 'diminished',
        romanNotation: (base) => base.toLowerCase(),
    },
    {
        name: 'Augmented Seventh',
        intervals: [0, 4, 8, 10],
        structure: [0, 2, 4, 6],
        notation: '7♯5',
        quality: 'augmented',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Augmented Major Seventh',
        intervals: [0, 4, 8, 11],
        structure: [0, 2, 4, 6],
        notation: 'maj7♯5',
        quality: 'augmented',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Dominant Seventh Sus4',
        intervals: [0, 5, 7, 10],
        structure: [0, 3, 4, 6],
        notation: '7sus4',
        quality: 'dominant',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Major Seventh Sus4',
        intervals: [0, 5, 7, 11],
        structure: [0, 3, 4, 6],
        notation: 'maj7sus4',
        quality: 'major',
        romanNotation: (base) => base.toUpperCase(),
    },


    // ============================================================================
    // NINTH CHORDS (with seventh)
    // ============================================================================
    {
        name: 'Major Ninth',
        intervals: [0, 4, 7, 11, 14],
        structure: [0, 1, 2, 4, 6],
        notation: 'maj9',
        quality: 'major',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Dominant Ninth',
        intervals: [0, 4, 7, 10, 14],
        structure: [0, 1, 2, 4, 6],
        notation: '9',
        quality: 'dominant',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Minor Ninth',
        intervals: [0, 3, 7, 10, 14],
        structure: [0, 1, 2, 4, 6],
        notation: '−9',
        quality: 'minor',
        romanNotation: (base) => base.toLowerCase(),
    },

    // ============================================================================
    // ALTERED / OTHER CHORDS
    // ============================================================================
    {
        name: 'Dominant Seventh Flat Five',
        intervals: [0, 4, 6, 10],
        structure: [0, 2, 4, 6],
        notation: '7♭5',
        quality: 'dominant',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Dominant 7th Sus2 Flat 5',
        intervals: [0, 2, 6, 10],
        structure: [0, 1, 4, 6],
        notation: '7(♭5)sus2',
        quality: 'dominant',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Diminished 6th (Sus2)',
        intervals: [0, 2, 6, 9],
        structure: [0, 1, 4, 5],
        notation: '°6(sus2)',
        quality: 'diminished',
        romanNotation: (base) => base.toLowerCase(),
    },
    {
        name: 'Major Flat Five',
        intervals: [0, 4, 6],
        structure: [0, 2, 4],
        notation: 'maj(♭5)',
        quality: 'major',
        romanNotation: (base) => base.toUpperCase(),
    },
    {
        name: 'Sus2 Flat Five',
        intervals: [0, 2, 6],
        structure: [0, 1, 4],
        notation: '(♭5)sus2',
        quality: 'diminished',
        romanNotation: (base) => base.toLowerCase(),
    },
];

/**
 * Normalize intervals to start from 0 and reduce to within one octave
 */
const normalizeIntervals = (intervals) => {
    if (!intervals || intervals.length === 0) return [];
    const sorted = [...intervals].sort((a, b) => a - b);
    const root = sorted[0];
    const normalized = sorted.map((i) => (i - root) % 12);
    const unique = [...new Set(normalized)].sort((a, b) => a - b);
    return unique;
};

const arraysEqual = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};

/**
 * Find a chord definition matching the given intervals (and optionally structure).
 *
 * Matching priority:
 *   1. If structure is provided: find a definition where BOTH normalized intervals
 *      AND normalized structure match (disambiguates e.g. sus2 vs. bb-3 triad).
 *   2. Interval-only fallback: find first definition whose intervals match.
 *
 * @param {number[]} intervals - semitone intervals from root
 * @param {number[]|null} [structure] - scale-degree offsets (optional)
 */
const findChordDefinition = (intervals, structure = null) => {
    const normalizedIntervals = normalizeIntervals(intervals);
    const normalizedStructure = structure ? [...structure].sort((a, b) => a - b) : null;

    // Pass 1: structure + interval match (only when structure is provided)
    if (normalizedStructure) {
        for (const def of chordDefinitions) {
            const defNormalizedIntervals = normalizeIntervals(def.intervals);
            const defNormalizedStructure = [...def.structure].sort((a, b) => a - b);
            if (
                arraysEqual(normalizedIntervals, defNormalizedIntervals) &&
                arraysEqual(normalizedStructure, defNormalizedStructure)
            ) {
                return def;
            }
        }
    }

    // Pass 2: interval-only fallback
    for (const def of chordDefinitions) {
        const defNormalized = normalizeIntervals(def.intervals);
        if (arraysEqual(normalizedIntervals, defNormalized)) {
            return def;
        }
    }

    return null;
};

export { chordDefinitions, findChordDefinition, normalizeIntervals };
