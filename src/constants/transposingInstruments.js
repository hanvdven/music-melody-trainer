/**
 * Transposing instrument definitions.
 *
 * `semitones` = how many semitones to ADD to concert pitch to obtain the written
 * (displayed) pitch on the staff.
 *
 *   Positive → instrument sounds BELOW written pitch (the common case: B♭, F, E♭).
 *              e.g. B♭ clarinet semitones=+2: concert A4 is notated as B4.
 *   Negative → instrument sounds ABOVE written pitch (rare: D/E trumpet, E♭ clarinet).
 *              e.g. D trumpet semitones=-2: concert E4 is notated as D4.
 *   Zero     → concert pitch (C-instrument, no transposition).
 *
 * `label`        Short pitch-class label using ♭/♯ Unicode (never b or #).
 * `display`      Short label shown near the clef. No dash. Unicode accidentals.
 * `instruments`  Max two strings shown in the list picker (line 1 + optional line 2).
 *
 * Ordering: concert pitch first, then most-common transpositions, then rare positive offsets,
 * then negative offsets (sounds above written) sorted by ascending absolute value.
 */
export const TRANSPOSING_INSTRUMENTS = [
    // ── Concert pitch ──────────────────────────────────────────────────────
    {
        key: 'C', semitones: 0,
        label: 'C',
        display: 'C inst',
        instruments: ['Piano, Guitar, Flute, Oboe', 'Violin, Cello, Trombone, …'],
    },

    // ── Common transposing instruments (sounds below written) ──────────────
    {
        key: 'Bb', semitones: 2,
        label: 'B♭',
        display: 'B♭ inst',
        instruments: ['Clarinet, Trumpet', 'Soprano & Tenor Saxophone'],
    },
    {
        key: 'Eb', semitones: 9,
        label: 'E♭',
        display: 'E♭ inst',
        instruments: ['Alto & Baritone Saxophone', 'E♭ Horn'],
    },
    {
        key: 'F', semitones: 7,
        label: 'F',
        display: 'F inst',
        instruments: ['French Horn', 'Cor Anglais'],
    },
    {
        key: 'A', semitones: 3,
        label: 'A',
        display: 'A inst',
        instruments: ['A Clarinet'],
    },
    {
        key: 'G', semitones: 5,
        label: 'G',
        display: 'G inst',
        instruments: ['Alto Flute'],
    },

    // ── Rare positive offsets ──────────────────────────────────────────────
    {
        key: 'B', semitones: 1,
        label: 'B',
        display: 'B inst',
        instruments: ['Horn in B (rare)'],
    },
    {
        key: 'Ab', semitones: 4,
        label: 'A♭',
        display: 'A♭ inst',
        instruments: ['Horn in A♭ (rare)'],
    },
    {
        key: 'F#', semitones: 6,
        label: 'F♯',
        display: 'F♯ inst',
        instruments: ['Horn in F♯ (rare)'],
    },
    {
        key: 'E', semitones: 8,
        label: 'E',
        display: 'E inst',
        instruments: ['Horn in E (rare)'],
    },
    {
        key: 'D', semitones: 10,
        label: 'D',
        display: 'D inst',
        instruments: ['Horn in D (rare)'],
    },
    {
        key: 'Db', semitones: 11,
        label: 'D♭',
        display: 'D♭ inst',
        instruments: ['Horn in D♭ (rare)'],
    },

    // ── Sounds above written (negative offset), ascending absolute value ───
    {
        key: 'D↑', semitones: -2,
        label: 'D↑',
        display: 'D↑ inst',
        instruments: ['D Trumpet'],
    },
    {
        key: 'Eb↑', semitones: -3,
        label: 'E♭↑',
        display: 'E♭↑ inst',
        instruments: ['E♭ Clarinet'],
    },
    {
        key: 'E↑', semitones: -4,
        label: 'E↑',
        display: 'E↑ inst',
        instruments: ['E Trumpet'],
    },
    {
        key: 'F↑', semitones: -5,
        label: 'F↑',
        display: 'F↑ inst',
        instruments: ['Piccolo'],
    },
];

/**
 * Returns the semitone offset for a given instrument key string.
 * Returns 0 (concert pitch) for unknown keys.
 */
export const getTranspositionSemitones = (key) => {
    if (!key) return 0;
    const entry = TRANSPOSING_INSTRUMENTS.find(i => i.key === key);
    return entry ? entry.semitones : 0;
};

/**
 * Returns the short display label for a given instrument key string, e.g. "B♭ inst"
 * Returns "C inst" for unknown / concert-pitch keys.
 */
export const getTranspositionDisplay = (key) => {
    if (!key || key === 'C') return 'C inst';
    const entry = TRANSPOSING_INSTRUMENTS.find(i => i.key === key);
    return entry ? entry.display : 'C inst';
};
