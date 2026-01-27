function convertRankedArrayToMelody(rankedArray, tonic, scale, notesPerMeasure, numMeasures, randomizationRules) {
  const generatedMelody = rankedArray;
  const melodyNotes = [];
  const melodyLength = notesPerMeasure * numMeasures;
  const numberOfSlotsPerMeasure = rankedArray.length / numMeasures;
  let melodyIndex = 0;
  let rank = 0;

  while (melodyIndex < melodyLength && rank <= generatedMelody.length) {
    for (let i = 0; i < generatedMelody.length; i++) {
      const slot = generatedMelody[i];
      if (slot === rank) {
        let index;
        if (randomizationRules === 'tonicOnOnes' && (i % numberOfSlotsPerMeasure === 0)) {
          generatedMelody[i] = tonic; // Assume the bass note is the first note in the scale for simplicity
        } else {
          index = Math.floor(Math.random() * scale.length);
          generatedMelody[i] = scale[index];
        }
        melodyNotes.push(scale[index]);
        melodyIndex++;
        if (melodyIndex >= melodyLength) {
          break; // Stop if melody length is reached
        }
      }
    }
    rank++;
  }

  // Fill remaining slots with null
  for (let i = 0; i < generatedMelody.length; i++) {
    if (typeof generatedMelody[i] === 'number') {
      generatedMelody[i] = null;
    }
  }

  return generatedMelody;
}

export default convertRankedArrayToMelody;