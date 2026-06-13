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
// Decompose a meter numerator into group SIZES of 2 and 3 (prefer 3s first):
//   n%3 === 0 → all 3s            (6→[3,3], 9→[3,3,3])
//   n%3 === 2 → (n-2)/3 threes + one 2   (5→[3,2], 8→[3,3,2])
//   n%3 === 1 → (n-4)/3 threes + two 2s  (7→[3,2,2], 10→[3,3,2,2]; needs n ≥ 4)
// Shared by decomposeNumeratorToBeatGroups (→ beat offsets) and chooseGrouping (→ shuffled order).
// Callers guard their own small-n edge cases (n<2, and rem===1 with n<4) before calling.
const decomposeToGroupSizes = (n) => {
    const rem = n % 3;
    let threes, twos;
    if (rem === 0) { threes = n / 3; twos = 0; }
    else if (rem === 2) { threes = (n - 2) / 3; twos = 1; }
    else { threes = (n - 4) / 3; twos = 2; }   // rem === 1 (caller guarantees n ≥ 4)
    return [...Array(threes).fill(3), ...Array(twos).fill(2)];
};

export const decomposeNumeratorToBeatGroups = (n) => {
    if (n < 2) return [];
    if (n % 3 === 1 && n < 4) return [];   // rem === 1 needs n ≥ 4 to form the two extra 2s
    const groups = decomposeToGroupSizes(n);
    const starts = [];
    let offset = 0;
    for (const g of groups) {
        starts.push(offset);
        offset += g;
    }
    return starts;
};

/**
 * Randomly arranges the 3-groups and 2-groups for a meter numerator.
 * The count of 3s and 2s is fixed by the numerator (prefer 3s); only the ORDER is random.
 *   4 → [2,2]
 *   5 → [3,2] or [2,3] with equal probability
 *   8 → one of [3,3,2], [3,2,3], [2,3,3]
 */
export const chooseGrouping = (numerator) => {
    if (numerator < 2) return [numerator];
    if (numerator % 3 === 1 && numerator < 4) return [numerator];
    const groups = decomposeToGroupSizes(numerator);
    // Fisher-Yates shuffle — equal probability for every permutation.
    for (let i = groups.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [groups[i], groups[j]] = [groups[j], groups[i]];
    }
    return groups;
};

// Rank a set of beat positions by proximity to the measure reference points.
// initial: 'left' (leftmost first) or 'right' (rightmost first).
// tie: tiebreak direction for "closest to reference" steps.
const _rankPositions = (positions, n, initial, tie, startRank) => {
    if (positions.length === 0) return [];
    const rem = [...positions];
    const out = [];
    let rank = startRank;

    // Step 1: leftmost or rightmost
    let initIdx = 0;
    for (let i = 1; i < rem.length; i++) {
        if (initial === 'left' ? rem[i] < rem[initIdx] : rem[i] > rem[initIdx]) initIdx = i;
    }
    out.push({ pos: rem[initIdx], rank: rank++ });
    rem.splice(initIdx, 1);

    // Reference sequence: [n/2, n/4, 3n/4, n/4, 3n/4, ...]
    const refs = [n / 2];
    const quarters = [n / 4, (3 * n) / 4];
    for (let t = 0; refs.length < positions.length - 1; t++) refs.push(quarters[t % 2]);

    for (const ref of refs) {
        if (rem.length === 0) break;
        let best = 0;
        for (let i = 1; i < rem.length; i++) {
            const di = Math.abs(rem[i] - ref), db = Math.abs(rem[best] - ref);
            if (di < db || (di === db && (tie === 'right' ? rem[i] > rem[best] : rem[i] < rem[best])))
                best = i;
        }
        out.push({ pos: rem[best], rank: rank++ });
        rem.splice(best, 1);
    }
    for (const p of rem) out.push({ pos: p, rank: rank++ });
    return out;
};

/**
 * Generates a ranked slot array for one measure from a beat grouping (e.g. [3,2,3] for 8/8).
 * Returns an array of length (numerator × slotsPerBeat). Lower rank number = higher priority.
 *
 * Three-phase ranking:
 *   Phase 1 — first note of each group (leftmost first, then closest to n/2, n/4, 3n/4 …)
 *   Phase 2 — third note of 3-groups, rightmost first (or 2-group second notes if no 3-groups)
 *   Phase 3 — second note of all groups if 3-groups exist (leftmost first, rightmost tiebreak)
 *
 * Subdivision slots between beats are filled at increasing rank levels:
 *   rank = (slots_at_previous_level) + 1 for each subdivision doubling.
 */
export const generateRhythmicDNA = (grouping, timeSignature, smallestNoteDenom) => {
    const [numerator, denominator] = timeSignature;
    // Guard: slotsPerBeat must be >= 1. If smallestNoteDenom < denominator
    // (e.g. bass with half-note resolution in 4/4), treat the beat unit as the
    // minimum grid resolution. The caller's smallestNoteDenom still expresses the
    // desired minimum note duration; this guard only affects slot count.
    const effectiveDenom = Math.max(smallestNoteDenom, denominator);
    const slotsPerBeat = effectiveDenom / denominator; // always an integer >= 1

    const groupStarts = [];
    let off = 0;
    for (const size of grouping) { groupStarts.push(off); off += size; }

    const beatRanks = new Array(numerator).fill(null);
    let nextRank = 1;

    // Phase 1: group downbeats (leftmost first, leftmost tiebreak)
    for (const { pos, rank } of _rankPositions(groupStarts, numerator, 'left', 'left', nextRank))
        beatRanks[pos] = rank;
    nextRank += groupStarts.length;

    // Phase 2: 3-group third beats (rightmost first); fallback to 2-group second beats
    const has3 = grouping.some(s => s === 3);
    const p2 = has3
        ? grouping.flatMap((size, i) => size === 3 ? [groupStarts[i] + 2] : [])
        : groupStarts.map(s => s + 1);
    for (const { pos, rank } of _rankPositions(p2, numerator, 'right', 'right', nextRank))
        beatRanks[pos] = rank;
    nextRank += p2.length;

    // Phase 3: second beat of all groups (leftmost first, rightmost tiebreak)
    // Only when 3-groups exist; otherwise Phase 2 already consumed the second beats.
    if (has3) {
        const p3 = groupStarts.map(s => s + 1);
        for (const { pos, rank } of _rankPositions(p3, numerator, 'left', 'right', nextRank))
            beatRanks[pos] = rank;
    }

    // Expand to slot level: beat positions map to slot b*slotsPerBeat; in-between slots
    // receive subdivision ranks (level l: rank = slotCount_at_previous_level + 1).
    const totalSlots = numerator * slotsPerBeat;
    const slotRanks = new Array(totalSlots).fill(null);
    for (let b = 0; b < numerator; b++) slotRanks[b * slotsPerBeat] = beatRanks[b];

    let levelSize = numerator;
    let step = slotsPerBeat;
    while (step > 1) {
        step = Math.floor(step / 2);
        const subRank = levelSize + 1;
        for (let s = step; s < totalSlots; s += step * 2) slotRanks[s] = subRank;
        levelSize *= 2;
    }

    return slotRanks;
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
        // Use measureNoteResolution (already Math.max-guarded at line 215) so that
        // slotsPerBeat >= 1 when smallestNoteDenom < denominator (e.g. bass in 4/4).
        const slotsPerBeat = measureNoteResolution / timeSignature[1];

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
            // Final fallback: rank any still-null slots by power-of-two coarseness. Halve the
            // division from numberOfSlotsPerMeasure/2 down to 1 (8,4,2,1 for the common 16-slot
            // measure) — derived from the slot count so it generalises instead of a hardcoded table
            // that silently assumes 16 (§6c). Higher-coarseness passes land on structural slots
            // already ranked above, so they no-op; the meaningful fills are the fine div=2,1 passes.
            for (let div = numberOfSlotsPerMeasure >> 1; div >= 1; div >>= 1) {
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
