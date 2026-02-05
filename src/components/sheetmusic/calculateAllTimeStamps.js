const calculateAllTimeStamps = (timeSignature, noteGroupSize, ...timeStampsArrays) => {
  // Combine all timeStamps into one array
  const timeStampsWithDividers = [].concat(...timeStampsArrays);
  const measureLength = 48 * (timeSignature[0] / timeSignature[1]);

  // Remove null values and duplicates
  const filteredTimeStamps = timeStampsWithDividers.filter(
    (timeStamp) => timeStamp !== null
  );
  const uniqueTimeStamps = [...new Set(filteredTimeStamps)];

  // Sort the array from smallest to largest
  uniqueTimeStamps.sort((a, b) => a - b);

  // Insert 'q' or 'm' as required, then push the current timeStamp
  const finalTimeStamps = [];
  let nextEmptySpace = 0;
  let nextFactorOfMeasure = 0;

  for (let i = 0; i < uniqueTimeStamps.length; i++) {
    const current = uniqueTimeStamps[i];


    // Check if the current timeStamp passes the next measure length factor
    if (current >= nextFactorOfMeasure) {
      if (nextFactorOfMeasure > 0) {
        finalTimeStamps.push('q');
      }
      finalTimeStamps.push('m');
      nextEmptySpace = nextFactorOfMeasure + noteGroupSize; // Align the next factor of 12 with the measure
      nextFactorOfMeasure += measureLength;
    } else if (current >= nextEmptySpace) {
      finalTimeStamps.push('q');
      while (current >= nextEmptySpace) {
        nextEmptySpace += noteGroupSize;
      }
    }
    finalTimeStamps.push(current);
    finalTimeStamps.push('x');
  }
  finalTimeStamps.push('q');
  finalTimeStamps.push('m');

  const allTimeStamps = finalTimeStamps;
  return allTimeStamps;
};

export default calculateAllTimeStamps;