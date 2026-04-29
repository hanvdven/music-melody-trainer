/**
 * Generates the deterministic rhythmic pattern (weights/ranks) for a given time signature.
 * This forms the "base layer" before any randomization or variability is applied.
 *
 * @param {number} numMeasures - Number of measures to generate
 * @param {number[]} timeSignature - [numerator, denominator] e.g., [4, 4]
 * @param {number} numberOfSlotsPerMeasure - Total slots per measure (typically 16 for 4/4)
 * @param {string} randomizationRules - 'quarters' or 'default'
 * @param {number} smallestNoteDenom - Smallest note denominator (e.g., 16)
 * @returns {Array<Array<number|null>>} Array of measures, each containing slot weights/ranks (or null)
 */

/**
 * Decomposes a meter numerator into groups of 2 and 3 (preferring 3s first),
 * and returns the starting beat offsets of each group.
 *
 * This generalises to any numerator — no lookup table needed:
 *   n=5  → 3+2    → [0, 3]
 *   n=7  → 3+2+2  → [0, 3, 5]
 *   n=11 → 3+3+3+2 → [0, 3, 6, 9]
 *   n=15 → 3+3+3+3+3 → [0, 3, 6, 9, 12]
 *
 * For regular meters (4, 6, 8, 9, 12 …) the returned slots are already covered
 * by getDivisors, so the null-check in the ranking pass makes this a no-op for them.
 *
 * @param {number} n - Meter numerator
 * @returns {number[]} Beat offsets (in denominator-unit beats) of each group's first beat
 */
const decomposeNumeratorToBeatGroups = (n) => {
    if (n < 2) return [];
    // Prefer 3s; handle the remainder:
    //   n%3 === 0 → all 3s
    //   n%3 === 2 → (n-2)/3 threes + one 2
    //   n%3 === 1 → replace one hypothetical 3 with two 2s: (n-4)/3 threes + two 2s
    const rem = n % 3;
    let threes, twos;
    if (rem === 0) {
        threes = n / 3;
        twos = 0;
    } else if (rem === 2) {
        threes = (n - 2) / 3;
        twos = 1;
    } else {
        // rem === 1 — need n ≥ 4 to form the two extra 2s
        if (n < 4) return [];
        threes = (n - 4) / 3;
        twos = 2;
    }
    const groups = [...Array(threes).fill(3), ...Array(twos).fill(2)];
    const starts = [];
    let offset = 0;
    for (const g of groups) {
        starts.push(offset);
        offset += g;
    }
    return starts;
};

export const generateDeterministicRhythm = (
    numMeasures,
    timeSignature,
    numberOfSlotsPerMeasure,
    randomizationRules,
    smallestNoteDenom
) => {
    const getDivisors = (timeSignature, denom) => {
        let divisors = [];
        let n = timeSignature[0];
        for (let i = 2; i <= n; i++) {
            if (n % i === 0) {
                divisors.unshift((i * denom) / timeSignature[1]);
            }
        }
        return divisors;
    };

    const getNearDivisors = (timeSignature, denom) => {
        let nearDivisors = [];
        let n = timeSignature[0];
        for (let i = 2; i <= n; i++) {
            if (n % i === 1 || n % i === n - 1) {
                nearDivisors.unshift((i * denom) / timeSignature[1]);
            }
        }
        return nearDivisors;
    };

    let melodyArray = [];
    const measureNoteResolution = Math.max(timeSignature[1], smallestNoteDenom);

    if (randomizationRules === 'quarters') {
        for (let i = 0; i < numMeasures; i++) {
            let measureSlots = Array(numberOfSlotsPerMeasure).fill(null);
            const measureInQuarters = (timeSignature[0] / timeSignature[1]) * 4;
            const slotsPerQuarter = numberOfSlotsPerMeasure / measureInQuarters;
            for (let q = 0; q < measureInQuarters; q++) {
                const idx = Math.round(q * slotsPerQuarter);
                if (idx < measureSlots.length) measureSlots[idx] = 1;
            }
            melodyArray.push(measureSlots);
        }
    } else {
        // Pre-compute beat-group slots once per time signature (same for all measures).
        // beatGroupStarts[i] is the start beat (in denominator-unit beats) of group i.
        // Converted to slot indices via slotsPerBeat = smallestNoteDenom / denominator.
        // These slots are ranked BEFORE the nearDivisors pass so that irregular-meter
        // downbeats (e.g. slot 6 = beat 4 in 5/8) outrank near-divisor artefacts
        // (e.g. slots 4 and 8 in 5/8 that nearDivisors would otherwise prefer).
        // For regular meters the slots are already filled by getDivisors, so the
        // null-check makes this pass a no-op — no separate "isIrregular" guard needed.
        const beatGroupStarts = decomposeNumeratorToBeatGroups(timeSignature[0]);
        const slotsPerBeat = smallestNoteDenom / timeSignature[1];

        for (let i = 0; i < numMeasures; i++) {
            let measureSlots = Array(numberOfSlotsPerMeasure).fill(null);
            let divisors = getDivisors(timeSignature, smallestNoteDenom);
            let nearDivisors = getNearDivisors(timeSignature, smallestNoteDenom);

            for (let div of divisors) {
                let rank = 1 + measureSlots.filter((slot) => slot !== null).length;
                for (let j = 0; j < numberOfSlotsPerMeasure; j++) {
                    if (measureSlots[j] === null && ((j * timeSignature[1]) % (div * timeSignature[1] / (measureNoteResolution * (timeSignature[1] / timeSignature[1])))) === 0) {
                        if (((j % div) * timeSignature[1]) / measureNoteResolution === 0) {
                            measureSlots[j] = rank;
                            rank += 0.2;
                        }
                    }
                }
            }

            // Rank beat-group downbeats derived from the numerator decomposition.
            // Applied after exact divisors but before nearDivisors so that these
            // structurally important beats receive higher priority than the
            // near-divisor approximations used for irregular meters.
            for (const beatOffset of beatGroupStarts) {
                const slot = Math.round(beatOffset * slotsPerBeat);
                if (slot < numberOfSlotsPerMeasure && measureSlots[slot] === null) {
                    const rank = 1 + measureSlots.filter((s) => s !== null).length;
                    measureSlots[slot] = rank;
                }
            }

            for (let div of nearDivisors) {
                let rank = 1 + measureSlots.filter((slot) => slot !== null).length;
                for (let j = 0; j < numberOfSlotsPerMeasure; j++) {
                    if (measureSlots[j] === null && ((j % div) * timeSignature[1]) / measureNoteResolution === 0) {
                        measureSlots[j] = rank;
                        rank += 0.2;
                    }
                }
            }
            for (let div of [8, 4, 2, 1]) {
                let rank = numberOfSlotsPerMeasure / div;
                for (let j = 0; j < numberOfSlotsPerMeasure; j++) {
                    if (measureSlots[j] === null && ((j % div) * timeSignature[1]) / measureNoteResolution === 0) {
                        measureSlots[j] = rank;
                    }
                }
            }
            melodyArray.push(measureSlots);
        }
    }
    return melodyArray;
};
