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
        return { rankedArray: new Array(fallbackLen).fill(null), tupletGroups: [] };
    }

    logger.debug('RhythmGen', '1/4 DNA', {
        timeSignature, numMeasures, notesPerMeasure,
        smallestNoteDenom, slotsPerMeasure: numberOfSlotsPerMeasure,
        usingTemplate: !!deterministicTemplate,
    });

    let melodyArray;
    if (deterministicTemplate) {
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
        // Minimum 1% variability internally to avoid 'equal rank' sorting instability.
        const effectiveVariability = Math.max(rhythmVariability, 1);
        const randomShift = Math.random();
        return (
            (effectiveVariability / 100) * (numberOfSlotsPerMeasure * numMeasures) * randomShift * 1.1 +
            ((100 - effectiveVariability) / 100) * value
        );
    });

    const activeAfterVariability = piecewiseSum.filter(v => v !== null).length;
    logger.debug('RhythmGen', '2/4 variability', {
        rhythmVariability, activeSlots: activeAfterVariability, totalSlots: piecewiseSum.length,
    });

    // Tuplet injection: done BEFORE the ranking pass so that note-selection rules
    // (arp_var, arp_group, etc.) see the full rhythmic skeleton including tuplets.
    // tripletProb scales with variability; polyMultiplier amplifies the Polyrhythm setting.
    // Tuplets are only attempted when variability >= 30.
    let injectedArray = piecewiseSum;
    let tupletGroups  = [];
    // polyMultiplier > 1 means the user has engaged the Polyrhythm setting (low/med/high/xtreme).
    // enableTriplets is kept as a secondary override; either condition gates the injection.
    if ((enableTriplets || polyMultiplier > 1) && rhythmVariability >= 30) {
        const tripletProb = Math.min(1, (rhythmVariability / 100) * 0.15 * polyMultiplier);
        logger.debug('RhythmGen', '3/4 tuplets — attempting injection', {
            tripletProb: tripletProb.toFixed(3), polyMultiplier, enableTriplets,
        });
        const result = injectTuplets(
            piecewiseSum,
            numberOfSlotsPerMeasure,
            numMeasures,
            timeSignature,
            smallestNoteDenom,
            tripletProb,
            false,          // tripletOnly=false → all TUPLET_DEFS (weight-scaled)
            notesPerMeasure,
        );
        injectedArray = result.modified;
        tupletGroups  = result.tupletGroups;
        logger.debug('RhythmGen', '3/4 tuplets — result', {
            placed: tupletGroups.length,
            groups: tupletGroups.map(g => `m${g.measureIndex} slot${g.slotStart} ${g.n}:${g.slotCount}`),
        });
    } else {
        logger.debug('RhythmGen', '3/4 tuplets — skipped', {
            reason: rhythmVariability < 30
                ? `variability ${rhythmVariability} < 30`
                : `enableTriplets=${enableTriplets}, polyMultiplier=${polyMultiplier}`,
        });
    }

    // Ranking pass: sort non-null float values → integer ranks 0, 1, 2 …
    const nonNullValues = injectedArray
        .map((value, index) => (value !== null ? { value, index } : null))
        .filter((item) => item !== null);

    nonNullValues.sort((a, b) => a.value - b.value);

    let rank = 0;
    let lastValue = nonNullValues[0]?.value;
    nonNullValues.forEach((item, i) => {
        if (i === 0 || item.value !== lastValue) rank = i;
        item.rank = rank;
        lastValue = item.value;
    });

    const finalRanked = injectedArray.map(() => null);
    nonNullValues.forEach((item) => { finalRanked[item.index] = item.rank; });

    logger.debug('RhythmGen', '4/4 ranked', {
        rankedSlots: nonNullValues.length,
        top5ranks: nonNullValues.slice(0, 5).map(i => `[${i.index}]=${i.rank}`),
    });

    return { rankedArray: finalRanked, tupletGroups };
};
