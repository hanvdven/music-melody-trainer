const allowedDurations = [3, 6, 9, 12, 18, 21, 24, 36, 42, 48, 72];
const splittableDurations = [72, 48, 42, 36, 24, 21, 18, 12, 9, 6, 3]; // Allowed durations excluding dotted notes

const processMelodyAndCalculateSlots = (
  melody,
  timeSignature,
  noteGroupSize
) => {
  const notes = melody.displayNotes;
  const durations = melody.durations;
  const timeStamps = melody.timeStamps;
  const measureLength = 48 * (timeSignature[0] / timeSignature[1]);
  let startRestDuration = 0;

  // Helper function to determine if a timestamp is at a multiple of 12 (within a measure)
  const isAlignedWithCount = (timestamp, measureLength) =>
    (timestamp % measureLength) % noteGroupSize === 0;

  // Helper function to find the last non-null timestamp and duration
  const findLastNonNullIndex = (array) => {
    let lastNonNullIndex = array.length - 1;
    while (lastNonNullIndex >= 0 && array[lastNonNullIndex] === null) {
      lastNonNullIndex--;
    }
    return lastNonNullIndex;
  };

  // Initialize arrays to store the rest-padded notes, durations, and timestamps
  let paddedNotes = [...notes];
  let paddedDurations = [...durations];
  let paddedTimeStamps = [...timeStamps];

  // Add rests if needed at the beginning
  if (
    timeStamps[0] !== 0 &&
    timeStamps.some((timestamp) => timestamp !== null)
  ) {
    startRestDuration = timeStamps.find((timestamp) => timestamp !== null);
    if (startRestDuration !== undefined) {
      paddedNotes.unshift('r');
      paddedDurations.unshift(startRestDuration);
      paddedTimeStamps.unshift(0);
    }
  }

  // Add rests if needed at the end
  const lastNonNullIndex = findLastNonNullIndex(timeStamps);
  if (lastNonNullIndex >= 0) {
    const lastTimestamp =
      timeStamps[lastNonNullIndex] + durations[lastNonNullIndex];
    const totalDuration = timeStamps.reduce(
      (acc, timestamp, index) =>
        acc +
        startRestDuration +
        (durations[index] !== null ? durations[index] : 0),
      0
    );
    if (totalDuration % measureLength !== 0) {
      const restDuration = measureLength - (totalDuration % measureLength);
      paddedNotes.push('r');
      paddedDurations.push(restDuration);
      paddedTimeStamps.push(lastTimestamp);
    }
  }

  const resultNotes = [];
  const resultDurations = [];
  const resultTimeStamps = [];
  const resultTies = [];

  for (let i = 0; i < paddedDurations.length; i++) {
    if (paddedDurations[i] === null) {
      resultNotes.push(paddedNotes[i]);
      resultDurations.push(paddedDurations[i]);
      resultTimeStamps.push(paddedTimeStamps[i]);
      resultTies.push(null);
      continue;
    }

    let remainingDuration = paddedDurations[i];
    let currentTimeStamp = paddedTimeStamps[i];
    let isFirstSplit = true;

    // Step 1: If note does not start at a count alignment and crosses a count alignment, split it

    while (
      remainingDuration > 0 &&
      !isAlignedWithCount(currentTimeStamp, measureLength)
    ) {
      const nextCountAlignment =
        Math.floor(currentTimeStamp / measureLength) * measureLength +
        (Math.floor((currentTimeStamp % measureLength) / noteGroupSize) + 1) *
          noteGroupSize;
      const nextMeasureAlignment =
        (Math.floor(currentTimeStamp / measureLength) + 1) * measureLength;

      if (nextCountAlignment >= currentTimeStamp + remainingDuration) break; // notes that are within current note block are not further split
      if (nextMeasureAlignment < nextCountAlignment) break; // if the note block passes a measure boundary, stop.
      if (nextMeasureAlignment <= currentTimeStamp + remainingDuration) break; // notes that pass measure boundary are split using logic below.

      const splitDuration = nextCountAlignment - currentTimeStamp;

      resultNotes.push(paddedNotes[i]);
      resultDurations.push(splitDuration);
      resultTimeStamps.push(currentTimeStamp);
      resultTies.push(isFirstSplit ? null : 'tie');

      isFirstSplit = false;
      currentTimeStamp += splitDuration;
      remainingDuration -= splitDuration;
    }

    // Step 2: Check and split if the note crosses a measure boundary
    while (remainingDuration > 0) {
      let currentMeasureEnd =
        Math.ceil((currentTimeStamp + 0.5) / measureLength) * measureLength;

      // Split if the note crosses one or more measure boundaries
      while (currentTimeStamp + remainingDuration > currentMeasureEnd) {
        let splitDuration = currentMeasureEnd - currentTimeStamp;

        // Check if the split duration is allowed, if not, further split it
        while (!allowedDurations.includes(splitDuration)) {
          for (let j = 0; j < splittableDurations.length; j++) {
            if (splittableDurations[j] <= splitDuration) {
              const firstPart = splittableDurations[j];
              const secondPart = splitDuration - firstPart;

              resultNotes.push(paddedNotes[i]);
              resultDurations.push(firstPart);
              resultTimeStamps.push(currentTimeStamp);
              resultTies.push(isFirstSplit ? null : 'tie');

              isFirstSplit = false;
              currentTimeStamp += firstPart;
              splitDuration = secondPart;
              remainingDuration -= firstPart;
              break;
            }
          }
        }

        resultNotes.push(paddedNotes[i]);
        resultDurations.push(splitDuration);
        resultTimeStamps.push(currentTimeStamp);
        resultTies.push(isFirstSplit ? null : 'tie');

        isFirstSplit = false;
        currentTimeStamp += splitDuration;
        remainingDuration -= splitDuration;

        currentMeasureEnd += measureLength;
      }

      // Step 3: Continue splitting until the note aligns with allowed durations
      if (
        allowedDurations.includes(remainingDuration) &&
        (remainingDuration <= noteGroupSize ||
          ((currentTimeStamp + remainingDuration) % measureLength) %
            noteGroupSize ===
            0)
      ) {
        resultNotes.push(paddedNotes[i]);
        resultDurations.push(remainingDuration);
        resultTimeStamps.push(currentTimeStamp);
        resultTies.push(isFirstSplit ? null : 'tie');
        break;
      }

      // Split using the highest splittable duration
      let splitDuration = 0;
      for (let j = 0; j < splittableDurations.length; j++) {
        if (
          splittableDurations[j] <= remainingDuration &&
          (splittableDurations[j] === 3 ||
            ((currentTimeStamp + splittableDurations[j]) % measureLength) %
              noteGroupSize ===
              0)
        ) {
          splitDuration = splittableDurations[j];
          break;
        }
      }

      resultNotes.push(paddedNotes[i]);
      resultDurations.push(splitDuration);
      resultTimeStamps.push(currentTimeStamp);
      resultTies.push(isFirstSplit ? null : 'tie');

      isFirstSplit = false;
      remainingDuration -= splitDuration;
      currentTimeStamp += splitDuration;
    }
  }

  // Remove the first null and add a null at the end of resultTies
  if (resultTies.length > 0) {
    resultTies.shift(); // Remove the first null
    resultTies.push(null); // Add a null at the end
  }

  return {
    notes: resultNotes,
    durations: resultDurations,
    timeStamps: resultTimeStamps,
    ties: resultTies,
  };
};

export { processMelodyAndCalculateSlots };
