const processMelodyAndCalculateFlags = (melody, timeSignature, noteGroupSize) => {
  const notes = melody.notes;
  const durations = melody.durations;
  const timeStamps = melody.timeStamps;

  const measureLength = 48 * (timeSignature[0] / timeSignature[1]);

  // Initialize the result array for flags
  let resultFlags = Array(notes.length).fill(null);

  let currentGroupStart = null;
  let currentGroupEnd = null;
  let isFirstInGroup = true;

  for (let i = 0; i < timeStamps.length; i++) {
    if (timeStamps[i] === null || durations[i] === null) continue;

    const currentTimeStamp = timeStamps[i];
    const nextCountAlignment = Math.floor(currentTimeStamp / measureLength) * measureLength + Math.ceil((currentTimeStamp % measureLength) / noteGroupSize) * noteGroupSize;

    // Start a new group if needed
    if (currentGroupStart === null || currentTimeStamp >= nextCountAlignment) {
      currentGroupStart = currentTimeStamp;
      currentGroupEnd = currentGroupStart + noteGroupSize;
      isFirstInGroup = true;
    }

    // Flagging eighth notes (duration 6)
    if (durations[i] === 6) {
      if (isFirstInGroup) {
        resultFlags[i] = 'fs';
        isFirstInGroup = false;
      } else {
        resultFlags[i] = 'fm';
      }
    }

    // Check for group end and alignment reset
    if (currentTimeStamp + durations[i] > nextCountAlignment) {
      currentGroupStart = nextCountAlignment;
      currentGroupEnd = currentGroupStart + noteGroupSize;
      isFirstInGroup = true;
      // Ensure the flag is set correctly for notes at the start of a new group
      if (durations[i] === 6) {
        resultFlags[i] = 'fs';
        isFirstInGroup = false;
      }
    }
  }

  // Cleanup flags
  for (let i = 0; i < resultFlags.length; i++) {
    if (resultFlags[i] === 'fs') {
      // Check if the next non-null flag is not 'fm'
      let nextFlagIndex = i + 1;
      while (nextFlagIndex < resultFlags.length && resultFlags[nextFlagIndex] === null) {
        nextFlagIndex++;
      }
      if (nextFlagIndex >= resultFlags.length || resultFlags[nextFlagIndex] !== 'fm') {
        resultFlags[i] = null;
      }
    } else if (resultFlags[i] === 'fm') {
      // Check if the next non-null flag is 'fs'
      let nextFlagIndex = i + 1;
      while (nextFlagIndex < resultFlags.length && resultFlags[nextFlagIndex] === null) {
        nextFlagIndex++;
      }
      if (nextFlagIndex < resultFlags.length && resultFlags[nextFlagIndex] === 'fs') {
        resultFlags[i] = 'fe';
      }
    }
  }

  // Ensure the last non-null 'fm' is set to 'fe'
  for (let i = resultFlags.length - 1; i >= 0; i--) {
    if (resultFlags[i] === 'fm') {
      resultFlags[i] = 'fe';
      break;
    }
  }

  return { resultFlags };
};

export { processMelodyAndCalculateFlags };
