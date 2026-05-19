import { TICKS_PER_WHOLE } from '../../constants/timing.js';
import { decomposeNumeratorToBeatGroups } from '../../generation/rhythmicPriorities.js';

// rhythmicGrouping: beat-group array from the melody (e.g. [2,2] for 4/4 played as 2+2,
//   [3,2] for 5/4 played as 3+2). When provided, 'g' markers are inserted only at the
//   internal beat-group boundaries instead of at every noteGroupSize step.
//   Falls back to decomposeNumeratorToBeatGroups when null/undefined.
const calculateAllOffsets = (timeSignature, noteGroupSize, numRepeats, numMeasures, partialMeasureStart, rhythmicGrouping, ...offsetsArrays) => {
  // Collect accidental and dot flags per offset value
  const accidentalSet = new Set();
  const dotSet = new Set();

  // Combine all offsets into one array, normalizing tagged items { offset, a, d }
  const offsetsWithDividers = [];
  for (const arr of offsetsArrays) {
    if (!arr) continue;
    for (const item of arr) {
      if (item === null) {
        offsetsWithDividers.push(null);
      } else if (typeof item === 'object') {
        offsetsWithDividers.push(item.offset);
        if (item.a) accidentalSet.add(item.offset);
        if (item.d) dotSet.add(item.offset);
      } else {
        offsetsWithDividers.push(item);
      }
    }
  }
  const measureLength = TICKS_PER_WHOLE * (timeSignature[0] / timeSignature[1]);

  // Compute group-boundary ticks (relative to measure start, excluding 0).
  // Mirrors the same derivation in processMelodyAndCalculateSlots so 'g' markers align
  // exactly with the group boundaries used during splitting.
  const beatUnit = TICKS_PER_WHOLE / timeSignature[1];
  let groupBoundaryTicks;
  if (rhythmicGrouping && rhythmicGrouping.length > 1) {
    let acc = 0;
    groupBoundaryTicks = [];
    for (let gi = 0; gi < rhythmicGrouping.length - 1; gi++) {
      acc += rhythmicGrouping[gi];
      groupBoundaryTicks.push(acc * beatUnit);
    }
  } else {
    groupBoundaryTicks = decomposeNumeratorToBeatGroups(timeSignature[0])
      .slice(1)
      .map(s => s * beatUnit);
  }

  // Remove null values and duplicates
  const filteredOffsets = offsetsWithDividers.filter((offset) => offset !== null);
  const uniqueOffsets = [...new Set(filteredOffsets)];

  // Sort the array from smallest to largest
  uniqueOffsets.sort((a, b) => a - b);

  // Insert 'g' (group-boundary spacer) or 'm' (measure line) as required, then push the current offset.
  // 'g' appears before the first note that crosses into a new beat group, creating a visual gap
  // at musically meaningful group divisions rather than at every quarter-note step.
  const finalOffsets = [];

  // If repeating, ensure we start with space (x, m)
  if (numRepeats > 1) {
    finalOffsets.push('x');
  }

  let nextEmptySpace = 0;
  let nextFactorOfMeasure = 0;

  for (let i = 0; i < uniqueOffsets.length; i++) {
    const current = uniqueOffsets[i];

    // Check if the current offset passes the next measure length factor
    while (current >= nextFactorOfMeasure) {
      if (nextFactorOfMeasure > 0) {
        finalOffsets.push('g');
      }
      finalOffsets.push('m');

      // Insert Time Signature change if this measure start matches partialMeasureStart
      if (partialMeasureStart !== null && nextFactorOfMeasure === partialMeasureStart) {
        finalOffsets.push('ts');
      }

      // Set nextEmptySpace to the first group boundary after this measure start.
      // Infinity means no internal boundaries → no 'g' will be inserted within the measure.
      nextEmptySpace = groupBoundaryTicks.length > 0
        ? nextFactorOfMeasure + groupBoundaryTicks[0]
        : Infinity;
      nextFactorOfMeasure += measureLength;
    }

    if (current >= nextEmptySpace && nextEmptySpace !== Infinity) {
      finalOffsets.push('g');
      // Advance nextEmptySpace to the next group boundary strictly after current.
      const measureStart = Math.floor(current / measureLength) * measureLength;
      const inMeasure = current - measureStart;
      const nextBoundary = groupBoundaryTicks.find(b => b > inMeasure);
      nextEmptySpace = nextBoundary != null ? measureStart + nextBoundary : Infinity;
    }
    if (accidentalSet.has(current)) finalOffsets.push('a');
    finalOffsets.push(current);
    if (dotSet.has(current)) finalOffsets.push('d');
    finalOffsets.push('x');
  }

  // Ensure we reach the full numMeasures even if the melody is shorter
  const totalSlotsExpected = measureLength * numMeasures;
  while (nextFactorOfMeasure <= totalSlotsExpected) {
    if (nextFactorOfMeasure > 0) {
      finalOffsets.push('g');
    }
    finalOffsets.push('m');

    // Insert Time Signature change if requested for a measure start that was empty
    if (partialMeasureStart !== null && nextFactorOfMeasure === partialMeasureStart) {
      finalOffsets.push('ts');
    }

    nextFactorOfMeasure += measureLength;
  }

  // Post-processing: reduce 'g', 'm' to 'm'
  for (let i = 0; i < finalOffsets.length - 1; i++) {
    if (finalOffsets[i] === 'g' && finalOffsets[i + 1] === 'm') {
      finalOffsets.splice(i, 1); // Remove extra 'g'
      i--; // Adjust index to check closely again if needed
    }
  }

  // Ensure at least one spacing slot between the opening and closing barlines.
  // With numMeasures=1 and no note content the loop above collapses ['m','g','m']
  // to ['m','m'] (length 2), which makes noteWidth=0 in SheetMusic and leaves the
  // closing barline stuck at startX instead of endX.
  if (finalOffsets.length < 3) {
    finalOffsets.splice(finalOffsets.length - 1, 0, 'g');
  }

  return finalOffsets;
};

export { calculateAllOffsets };
