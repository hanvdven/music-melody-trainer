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
          generatedMelody[i] = tonic;
        } else if (randomizationRules?.toLowerCase() === 'scale') {
          generatedMelody[i] = 'MARKER';
        } else {
          index = Math.floor(Math.random() * scale.length);
          generatedMelody[i] = scale[index];
        }

        melodyNotes.push('MARKER');

        melodyIndex++;
        if (melodyIndex >= melodyLength) {
          break; // Stop if melody length is reached
        }
      }
    }
    rank++;
  }

  // Post-process for Scale (Sequential)
  if (randomizationRules?.toLowerCase() === 'scale') {
    let scaleIdx = 0;
    for (let i = 0; i < generatedMelody.length; i++) {
      if (generatedMelody[i] === 'MARKER') {
        generatedMelody[i] = scale[scaleIdx % scale.length];
        scaleIdx++;
      }
    }
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