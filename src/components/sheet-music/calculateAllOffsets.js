import { TICKS_PER_WHOLE } from '../../constants/timing.js';

const calculateAllOffsets = (timeSignature, noteGroupSize, numRepeats, numMeasures, partialMeasureStart, ...offsetsArrays) => {
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

  // Remove null values and duplicates
  const filteredOffsets = offsetsWithDividers.filter((offset) => offset !== null);
  const uniqueOffsets = [...new Set(filteredOffsets)];

  // Sort the array from smallest to largest
  uniqueOffsets.sort((a, b) => a - b);

  // Insert 'q' or 'm' as required, then push the current offset
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
        finalOffsets.push('q');
      }
      finalOffsets.push('m');

      // Insert Time Signature change if this measure start matches partialMeasureStart
      if (partialMeasureStart !== null && nextFactorOfMeasure === partialMeasureStart) {
        finalOffsets.push('ts');
      }

      nextEmptySpace = nextFactorOfMeasure + noteGroupSize; // Align the next factor of 12 with the measure
      nextFactorOfMeasure += measureLength;
    }

    if (current >= nextEmptySpace) {
      finalOffsets.push('q');
      while (current >= nextEmptySpace) {
        nextEmptySpace += noteGroupSize;
      }
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
      finalOffsets.push('q');
    }
    finalOffsets.push('m');

    // Insert Time Signature change if requested for a measure start that was empty
    if (partialMeasureStart !== null && nextFactorOfMeasure === partialMeasureStart) {
      finalOffsets.push('ts');
    }

    nextFactorOfMeasure += measureLength;
  }

  // Post-processing: reduce 'q', 'm' to 'm'
  for (let i = 0; i < finalOffsets.length - 1; i++) {
    if (finalOffsets[i] === 'q' && finalOffsets[i + 1] === 'm') {
      finalOffsets.splice(i, 1); // Remove extra 'q'
      i--; // Adjust index to check closely again if needed
    }
  }

  // Ensure at least one spacing slot between the opening and closing barlines.
  // With numMeasures=1 and no note content the loop above collapses ['m','q','m']
  // to ['m','m'] (length 2), which makes noteWidth=0 in SheetMusic and leaves the
  // closing barline stuck at startX instead of endX.
  if (finalOffsets.length < 3) {
    finalOffsets.splice(finalOffsets.length - 1, 0, 'q');
  }

  return finalOffsets;
};

export { calculateAllOffsets };
