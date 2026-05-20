import { generateDeterministicRhythm } from './rhythmicPriorities';
import { injectTuplets } from './injectTuplets.js';
import logger from '../utils/logger';

export const generateRankedRhythm = (
    numMeasures,
    timeSignature,
    notesPerMeasure,
    smallestNoteDenom,
    rhythmVariability,
    enableTriplets,
    randomizationRules,
    deterministicTemplate = null,
    polyMultiplier = 1        // boosts tuplet probability; mirrors InstrumentSettings.polyMultiplier
) => {


    const smallestNoteDenomValue = timeSignature[1];
    const measureNoteResolution = Math.max(smallestNoteDenomValue, smallestNoteDenom);
    const numberOfSlotsPerMeasure = (measureNoteResolution * timeSignature[0]) / timeSignature[1];

    if (!timeSignature || timeSignature.length < 2 || !Number.isFinite(numberOfSlotsPerMeasure) || numberOfSlotsPerMeasure <= 0) {
        logger.error('generateRankedRhythm', 'E018-INVALID-SLOTS', null, {
            measureNoteResolution, timeSignature, smallestNoteDenom, numberOfSlotsPerMeasure,
        });
        const fallbackLen = (numMeasures && numMeasures > 0) ? numMeasures * 4 : 4;
        return new Array(fallbackLen).fill(null);
    }

    let melodyArray;

    if (deterministicTemplate) {
        // Use the provided template directly
        // Ensure deep copy if we're going to mutate it (we flatten it later, so flat array is new)
        melodyArray = deterministicTemplate;
    } else {
        melodyArray = generateDeterministicRhythm(
            numMeasures,
            timeSignature,
            numberOfSlotsPerMeasure,
            randomizationRules,
            smallestNoteDenom
        );
    }

    const flattened = melodyArray.flat();

    // Apply variability
    const piecewiseSum = flattened.map((value) => {
        if (value === null) return null;

        // User requested minimum 1% variability internally even if 0 is passed
        // This avoids 'equal rank' issues where sorting is unstable or degenerate
        const effectiveVariability = Math.max(rhythmVariability, 1);

        const randomShift = Math.random();
        return (
            (effectiveVariability / 100) * (numberOfSlotsPerMeasure * numMeasures) * randomShift * 1.1 +
            ((100 - effectiveVariability) / 100) * value
        );
    });

    // Tuplet injection: done BEFORE the ranking pass so that note-selection rules
    // (arp_var, arp_group, etc.) see the full rhythmic skeleton including tuplets.
    // tripletProb scales with variability so tuplets become more frequent as the
    // rhythm gets more complex; polyMultiplier amplifies the global Polyrhythm setting.
    // Tuplets are only attempted when variability >= 30 (below that the rhythm is
    // too simple to benefit from tuplets).
    let injectedArray  = piecewiseSum;
    let tupletGroups   = [];
    if (enableTriplets && rhythmVariability >= 30) {
        const tripletProb = Math.min(1, (rhythmVariability / 100) * 0.15 * polyMultiplier);
        const result = injectTuplets(
            piecewiseSum,
            numberOfSlotsPerMeasure,
            numMeasures,
            timeSignature,
            smallestNoteDenom,
            tripletProb,
            false,          // tripletOnly=false → enable all TUPLET_DEFS (weight-scaled)
            notesPerMeasure,
        );
        injectedArray = result.modified;
        tupletGroups  = result.tupletGroups;
    }

    // Ranking pass: sort non-null float values and assign integer ranks 0, 1, 2 …
    // Tuplet start slots (set to their min-priority float in injectTuplets) are
    // ranked alongside regular slots — their integer rank determines when the tuplet
    // fires based on notesPerMeasure budget in convertRankedArrayToMelody.
    const nonNullValues = injectedArray
        .map((value, index) => (value !== null ? { value, index } : null))
        .filter((item) => item !== null);

    nonNullValues.sort((a, b) => a.value - b.value);

    let rank = 0;
    let lastValue = nonNullValues[0]?.value;
    nonNullValues.forEach((item, i) => {
        if (i === 0 || item.value !== lastValue) {
            rank = i;
        }
        item.rank = rank;
        lastValue = item.value;
    });

    const finalRanked = injectedArray.map(() => null);
    nonNullValues.forEach((item) => {
        finalRanked[item.index] = item.rank;
    });

    return { rankedArray: finalRanked, tupletGroups };
};
