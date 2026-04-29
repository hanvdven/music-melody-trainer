import { generateDeterministicRhythm } from './rhythmicPriorities';

export const generateRankedRhythm = (
    numMeasures,
    timeSignature,
    notesPerMeasure,
    smallestNoteDenom,
    rhythmVariability,
    enableTriplets,
    randomizationRules,
    deterministicTemplate = null // New optional argument
) => {


    const smallestNoteDenomValue = timeSignature[1];
    const measureNoteResolution = Math.max(smallestNoteDenomValue, smallestNoteDenom);
    const numberOfSlotsPerMeasure = (measureNoteResolution * timeSignature[0]) / timeSignature[1];

    if (!timeSignature || timeSignature.length < 2 || !Number.isFinite(numberOfSlotsPerMeasure) || numberOfSlotsPerMeasure <= 0) {
        console.error('[generateRankedRhythm] Invalid slots:', {
            measureNoteResolution,
            timeSignature,
            smallestNoteDenom,
            numberOfSlotsPerMeasure
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
    const piecewiseSum = flattened.map((value, index) => {
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

    // Triplets
    let tripletsArray = piecewiseSum;
    if (enableTriplets) {
        const triplets = [];
        for (let val of piecewiseSum) {
            triplets.push(val, null, null);
        }
        let numTriplets = 1 + Math.floor((Math.random() * numMeasures * rhythmVariability) / 100);
        for (let i = 0; i < numTriplets; i++) {
            const randomIndex = Math.floor(Math.random() * (piecewiseSum.length - 1)) * 3;
            if (triplets[randomIndex] !== null) {
                triplets[randomIndex * 1 + 2] = triplets[randomIndex];
                triplets[(randomIndex + 1) % triplets.length] = null;
            }
        }
        tripletsArray = triplets;
    }

    // Ranking pass
    const nonNullValues = tripletsArray
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

    const finalRanked = tripletsArray.map(() => null);
    nonNullValues.forEach((item) => {
        finalRanked[item.index] = item.rank;
    });

    return finalRanked;
};
