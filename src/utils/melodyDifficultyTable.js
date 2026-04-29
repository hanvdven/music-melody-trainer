/**
 * melodyDifficultyTable.js
 *
 * Range score formula: (semitones - 12) / 2
 *
 * Pre-computed table of all treble melody setting combinations and their
 * difficulty scores. Analogous to harmonyTable.js for the harmonic slider.
 *
 * Score components (integer points, sum = total treble difficulty):
 *   notesPerMeasure  : 1→1, 2→2, 4→3, 6→5, 8→6
 *   smallestNoteDenom: quarter(4)→1, eighth(8)→5, sixteenth(16)→8
 *   rhythmVariability: 0%→1, 10%→2, 20%→3, 30%→4, 40%→5, 50%→6, 60%→7, 70%→8
 *   pool + rule      : root/roots→1, chord/roots→2, chord/weighted→3,
 *                      chord/arp→4, chord/uniform→5, scale/weighted→6,
 *                      scale/arp→7, scale/uniform→8, chromatic/weighted→9
 *   range            : STANDARD (C4–E5, 16 semi) →2, LARGE (C4–G5, 19 semi) →3.5,
 *                      FULL (A3–C6, 27 semi) →7.5  [formula: (semitones-12)/2]
 *
 *   Total range: 6 (easiest) – 38.5 (hardest)
 */

const NOTES_PER_MEASURE_ENTRIES = [
    { value: 1, score: 1 },
    { value: 2, score: 2 },
    { value: 4, score: 3 },
    { value: 6, score: 5 },
    { value: 8, score: 6 },
];

const SMALLEST_NOTE_ENTRIES = [
    { value: 4,  score: 1 },   // quarter
    { value: 8,  score: 5 },   // eighth
    { value: 16, score: 8 },   // sixteenth
];

const VARIABILITY_ENTRIES = [
    { value: 0,  score: 1 },
    { value: 10, score: 2 },
    { value: 20, score: 3 },
    { value: 30, score: 4 },
    { value: 40, score: 5 },
    { value: 50, score: 6 },
    { value: 60, score: 7 },
    { value: 70, score: 8 },
];

// Each entry: { notePool, randomizationRule, score }
const POOL_RULE_ENTRIES = [
    { notePool: 'root',      randomizationRule: 'emphasize_roots', score: 1 },
    { notePool: 'chord',     randomizationRule: 'emphasize_roots', score: 2 },
    { notePool: 'chord',     randomizationRule: 'weighted',        score: 3 },
    { notePool: 'chord',     randomizationRule: 'arp',             score: 4 },
    { notePool: 'chord',     randomizationRule: 'uniform',         score: 5 },
    { notePool: 'scale',     randomizationRule: 'weighted',        score: 6 },
    { notePool: 'scale',     randomizationRule: 'arp',             score: 7 },
    { notePool: 'scale',     randomizationRule: 'uniform',         score: 8 },
    { notePool: 'chromatic', randomizationRule: 'weighted',        score: 9 },
];

/**
 * Range difficulty — scores derived from formula (semitones - 12) / 2.
 *   STANDARD treble C4–E5  = 16 semitones → 2
 *   LARGE    treble C4–G5  = 19 semitones → 3.5
 *   FULL     treble A3–C6  = 27 semitones → 7.5
 * Vocal, relative, and custom ranges are treated as "fixed" (not randomized).
 * Only STANDARD / LARGE / FULL are included as table dimensions.
 */
const RANGE_ENTRIES = [
    { rangeMode: 'STANDARD', score: 2   },
    { rangeMode: 'LARGE',    score: 3.5 },
    { rangeMode: 'FULL',     score: 7.5 },
];

// Build full combination table (5 × 3 × 8 × 9 × 3 = 3 240 entries)
const MELODY_TABLE = (() => {
    const table = [];
    for (const npm of NOTES_PER_MEASURE_ENTRIES) {
        for (const sn of SMALLEST_NOTE_ENTRIES) {
            for (const vr of VARIABILITY_ENTRIES) {
                for (const pr of POOL_RULE_ENTRIES) {
                    for (const rng of RANGE_ENTRIES) {
                        table.push({
                            notesPerMeasure:    npm.value,
                            smallestNoteDenom:  sn.value,
                            rhythmVariability:  vr.value,
                            notePool:           pr.notePool,
                            randomizationRule:  pr.randomizationRule,
                            rangeMode:          rng.rangeMode,
                            score: npm.score + sn.score + vr.score + pr.score + rng.score,
                        });
                    }
                }
            }
        }
    }
    return table;
})();

/** Slider bounds — use as min/max for the treble difficulty slider. */
export const MELODY_DIFFICULTY_RANGE = {
    min: Math.min(...MELODY_TABLE.map(e => e.score)), // 4
    max: Math.max(...MELODY_TABLE.map(e => e.score)), // 31
};

/**
 * Computes the treble difficulty score for current settings.
 * Looks up each dimension by nearest valid option.
 *
 * @param {object} settings - treble InstrumentSettings
 * @returns {number} integer difficulty score
 */
// ALL_NOTES pitch classes in order (C, C#/Db, D, ...)
const _PC_ORDER = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const _ENHARMONICS = { 'C#': 'C♯', 'Db': 'E♭', 'D#': 'E♭', 'Eb': 'E♭', 'F#': 'F♯',
    'Gb': 'F♯', 'G#': 'A♭', 'Ab': 'A♭', 'A#': 'B♭', 'Bb': 'B♭' };

function _noteToSemitone(note) {
    const m = note?.match(/^([A-G][#b♯♭]?)(-?\d+)$/);
    if (!m) return null;
    let pc = m[1].replace('#', '♯').replace('b', '♭');
    if (_ENHARMONICS[m[1]]) pc = _ENHARMONICS[m[1]];
    const pcIdx = _PC_ORDER.indexOf(pc);
    if (pcIdx === -1) return null;
    return (parseInt(m[2], 10) + 1) * 12 + pcIdx;
}

/**
 * Returns the range difficulty score for the given settings.
 * STANDARD→2, LARGE→3.5, FULL→7.5 (via formula (semitones-12)/2).
 * Vocal, relative, and custom modes: score computed from actual range if available,
 * otherwise defaults to 2 (STANDARD equivalent).
 */
export function getRangeScore(settings) {
    const mode = settings?.rangeMode;
    const entry = RANGE_ENTRIES.find(e => e.rangeMode === mode);
    if (entry) return entry.score;
    // For custom/vocal/relative, compute from actual range if available
    const range = settings?.range;
    if (range?.min && range?.max) {
        const minS = _noteToSemitone(range.min);
        const maxS = _noteToSemitone(range.max);
        if (minS != null && maxS != null) return Math.max(0, (maxS - minS - 12) / 2);
    }
    return 2; // default: STANDARD equivalent
}

export function calcTrebleDifficulty(settings) {
    if (!settings) return MELODY_DIFFICULTY_RANGE.min;

    const npmScore = NOTES_PER_MEASURE_ENTRIES.reduce((best, e) =>
        Math.abs(e.value - (settings.notesPerMeasure ?? 2)) < Math.abs(best.value - (settings.notesPerMeasure ?? 2)) ? e : best
    ).score;

    const snScore = SMALLEST_NOTE_ENTRIES.reduce((best, e) =>
        Math.abs(e.value - (settings.smallestNoteDenom ?? 8)) < Math.abs(best.value - (settings.smallestNoteDenom ?? 8)) ? e : best
    ).score;

    const vrScore = VARIABILITY_ENTRIES.reduce((best, e) =>
        Math.abs(e.value - (settings.rhythmVariability ?? 30)) < Math.abs(best.value - (settings.rhythmVariability ?? 30)) ? e : best
    ).score;

    const prEntry = POOL_RULE_ENTRIES.find(
        e => e.notePool === (settings.notePool ?? 'scale') &&
             e.randomizationRule === (settings.randomizationRule ?? 'uniform')
    );
    const prScore = prEntry ? prEntry.score : 8; // default scale/uniform

    const rngScore = getRangeScore(settings);

    return npmScore + snScore + vrScore + prScore + rngScore;
}

// Per-dimension min/max for balancing
const DIM_RANGES = {
    notesPerMeasure:   { min: 1, max: 6 },
    smallestNoteDenom: { min: 1, max: 8 },
    rhythmVariability: { min: 1, max: 8 },
    poolRule:          { min: 1, max: 9 },
    range:             { min: 2, max: 7.5 },
};

/**
 * Computes the normalized score (0–1) for each dimension of a table entry.
 * Returns true if all dimensions are within `slack` of the normalized target fraction.
 */
function isBalanced(entry, targetFraction, slack = 0.45) {
    const prEntry = POOL_RULE_ENTRIES.find(
        e => e.notePool === entry.notePool && e.randomizationRule === entry.randomizationRule
    );
    const rngEntry = RANGE_ENTRIES.find(e => e.rangeMode === entry.rangeMode);
    const dims = [
        { score: NOTES_PER_MEASURE_ENTRIES.find(e => e.value === entry.notesPerMeasure)?.score ?? 1, ...DIM_RANGES.notesPerMeasure },
        { score: SMALLEST_NOTE_ENTRIES.find(e => e.value === entry.smallestNoteDenom)?.score ?? 1, ...DIM_RANGES.smallestNoteDenom },
        { score: VARIABILITY_ENTRIES.find(e => e.value === entry.rhythmVariability)?.score ?? 1, ...DIM_RANGES.rhythmVariability },
        { score: prEntry?.score ?? 1, ...DIM_RANGES.poolRule },
        { score: rngEntry?.score ?? 2, ...DIM_RANGES.range },
    ];
    return dims.every(d => {
        const f = (d.score - d.min) / (d.max - d.min);
        return Math.abs(f - targetFraction) <= slack;
    });
}

/**
 * Returns a random melody settings combination whose score is within
 * `tolerance` of `target`, with dimension scores balanced around the target fraction.
 * Falls back progressively if no balanced candidates are found.
 *
 * @param {number} target    - desired difficulty score
 * @param {number} tolerance - allowed deviation (default 0.5 = exact integer match)
 * @returns {{ notesPerMeasure, smallestNoteDenom, rhythmVariability, notePool, randomizationRule, rangeMode, score }}
 */
export function getMelodyAtDifficulty(target, tolerance = 0.5) {
    const T_MIN = MELODY_DIFFICULTY_RANGE.min;
    const T_MAX = MELODY_DIFFICULTY_RANGE.max;
    const targetFraction = (target - T_MIN) / (T_MAX - T_MIN);

    const scored = MELODY_TABLE.filter(e => Math.abs(e.score - target) <= tolerance);
    // Try balanced first, fall back to unbalanced if insufficient
    const balanced = scored.filter(e => isBalanced(e, targetFraction));
    const candidates = balanced.length > 0 ? balanced : scored;
    if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
    // Fallback: pick from closest available score that is ≤ target
    const best = MELODY_TABLE.reduce((b, e) => {
        if (e.score > target) return b;
        return e.score > b ? e.score : b;
    }, MELODY_TABLE[0].score);
    const fallback = MELODY_TABLE.filter(e => e.score === best && isBalanced(e, targetFraction));
    const pool = fallback.length > 0 ? fallback : MELODY_TABLE.filter(e => e.score === best);
    return pool[Math.floor(Math.random() * pool.length)];
}
