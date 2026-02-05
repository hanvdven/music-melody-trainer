import Melody from '../../model/Melody.js';
import convertRankedArrayToMelody from './convertRankedArrayToMelody.js';

class MelodyGenerator {
  constructor(Scale, numMeasures, timeSignature, InstrumentSettings) {
    this.scale = Scale.scale;
    this.displayScale = Scale.displayScale;
    this.numAccidentals = Scale.numAccidentals;
    this.tonic = Scale.tonic;
    this.numMeasures = numMeasures;
    this.timeSignature = timeSignature;
    this.InstrumentSettings = InstrumentSettings;
  }

  static getDivisors(timeSignature, denom) {
    let divisors = [];
    let n = timeSignature[0]; // Use the numerator from the timeSignature
    for (let i = 2; i <= n; i++) {
      if (n % i === 0) {
        divisors.unshift((i * denom) / timeSignature[1]);
      }
    }
    return divisors;
  }

  static getNearDivisors(timeSignature, denom) {
    let nearDivisors = [];
    let n = timeSignature[0]; // Use the numerator from the timeSignature
    for (let i = 2; i <= n; i++) {
      if (n % i === 1 || n % i === n - 1) { // Adjusted to cover both +1 and -1 cases
        nearDivisors.unshift((i * denom) / timeSignature[1]);
      }
    }
    return nearDivisors;
  }

  generateMelody() {
    let scale = this.scale;
    let tonic = this.tonic;
    let displayScale = this.displayScale;
    let notesPerMeasure = this.InstrumentSettings.notesPerMeasure;
    let numMeasures = this.numMeasures;
    let timeSignature = this.timeSignature;
    let smallestNoteDenom = this.InstrumentSettings.smallestNoteDenom;
    let rhythmVariability = this.InstrumentSettings.rhythmVariability;
    let enableTriplets = this.InstrumentSettings.enableTriplets;
    let randomizationRules = this.InstrumentSettings.randomizationRules;
    let instrumentType = this.InstrumentSettings.type;

    // Step 1: Initialize melodyArray and clickTrack
    let melodyArray = Array(numMeasures).fill([]);

    // Step 2: Calculate the smallest note value
    let smallestNoteDenomValue = timeSignature[1];
    // let division = timeSignature[0];
    // while (division % 2 === 0) {
    //   division /= 2;
    //   smallestNoteDenomValue /= 2;
    // }

    // Step 3: Determine the number of slots
    let measureNoteResolution = Math.max(
      smallestNoteDenomValue,
      smallestNoteDenom
    ); // Highest divisor : (e.g., 8 for 1/8 measure with quarter notes)
    let numberOfSlotsPerMeasure =
      (measureNoteResolution * timeSignature[0]) / timeSignature[1];
    // Calculate norm for looping array at right tempo (using quarter note as standard reference for now..)
    // Step 4: Populate melodyArray with placeholders based on divisors ...

    // Start filling the measureslots with rankings
    // Start filling the measureslots with rankings
    if (randomizationRules === 'quarters') {
      // FORCE QUARTERS
      for (let i = 0; i < numMeasures; i++) {
        let measureSlots = Array(numberOfSlotsPerMeasure).fill(null);
        const measureInQuarters = (timeSignature[0] / timeSignature[1]) * 4;
        const slotsPerQuarter = numberOfSlotsPerMeasure / measureInQuarters;

        for (let q = 0; q < measureInQuarters; q++) {
          const idx = Math.round(q * slotsPerQuarter);
          if (idx < measureSlots.length) measureSlots[idx] = 1;
        }
        melodyArray[i] = measureSlots;
      }
    } else {
      for (let i = 0; i < numMeasures; i++) {
        let measureSlots = Array(numberOfSlotsPerMeasure).fill(null);
        let divisors = MelodyGenerator.getDivisors(timeSignature, smallestNoteDenom);
        let nearDivisors = MelodyGenerator.getNearDivisors(timeSignature, smallestNoteDenom);
        // Loop through the divisors to place the ranking number in appropriate slots
        for (let div of divisors) {
          // Calculate the ranking number (number of non-empty array slots)
          let rank = 1 + measureSlots.filter((slot) => slot !== null).length;
          // check if slot matches the next divisor
          for (let j = 0; j < numberOfSlotsPerMeasure; j++) {
            if (
              measureSlots[j] === null &&
              ((j % div) * timeSignature[1]) / measureNoteResolution === 0
            ) {
              measureSlots[j] = rank;
              rank += 0.2; // slightly increase rank, to ensure equal spacing over measure (at low variability)
            }
          }
        }
        for (let div of nearDivisors) {
          // Calculate the ranking number (number of non-empty array slots)
          let rank = 1 + measureSlots.filter((slot) => slot !== null).length;
          // check if slot matches the next near divisor
          for (let j = 0; j < numberOfSlotsPerMeasure; j++) {
            if (
              measureSlots[j] === null &&
              ((j % div) * timeSignature[1]) / measureNoteResolution === 0
            ) {
              measureSlots[j] = rank;
              rank += 0.2; // slightly increase rank, to ensure equal spacing over measure (at low variability)
            }
          }
        }
        // Fill remaining slots with equal rank
        for (let div of [8, 4, 2, 1]) {
          // Calculate the ranking number
          let rank = numberOfSlotsPerMeasure / div;
          // check if slot matches the next near divisor
          for (let j = 0; j < numberOfSlotsPerMeasure; j++) {
            if (
              measureSlots[j] === null &&
              ((j % div) * timeSignature[1]) / measureNoteResolution === 0
            ) {
              measureSlots[j] = rank;
            }
          }
        }
        melodyArray[i] = measureSlots;
      }
    }

    // Step 5: Flatten and melodyArray, using rhythmVariability
    const generatedMelodyTemp = melodyArray.flatMap((slot) => slot);

    const generatedMelodyRandomizer = Array.from(
      { length: generatedMelodyTemp.length },
      () => Math.random()
    );
    const piecewiseSum = generatedMelodyTemp.map((value, index) => {
      return (
        (rhythmVariability / 100) *
        numberOfSlotsPerMeasure *
        numMeasures *
        generatedMelodyRandomizer[index] *
        1.1 +
        ((100 - rhythmVariability) / 100) * value
      );
    });

    // Step 6: Insert Triples
    const insertTriplets = (notes) => {
      console.log('insertTriplets:');
      if (notes.length < 2) return { array: notes, tripletsInserted: false }; // Ensure there's at least two elements to compare

      // Step 1: Stretch the array to fit in triplets
      const tripletsArray = [];
      for (let i = 0; i < notes.length; i++) {
        tripletsArray.push(notes[i], null, null);
      }

      let numTriplets =
        1 + Math.floor((Math.random() * numMeasures * rhythmVariability) / 100);
      for (let i = 0; i < numTriplets; i++) {
        // Step 2: Pick a random index (with steps of three), excluding the last index
        const randomIndex = Math.floor(Math.random() * (notes.length - 1)) * 3;

        // Step 3: Check if the priority value at i is less than the value at i+1
        let tripletHasPriority = true;
        for (let i = 1; i === 3; i++) {
          if (tripletsArray[randomIndex] > tripletsArray[randomIndex + i]) {
            tripletHasPriority = false;
          }
        }
        if (tripletHasPriority) {
          // Step 4: Fill in the triplet values
          tripletsArray[randomIndex * 1] = tripletsArray[randomIndex];
          tripletsArray[randomIndex * 1 + 2] = tripletsArray[randomIndex];
          tripletsArray[randomIndex * 1 + 3] = null;
          tripletsArray[randomIndex * 1 + 4] = tripletsArray[randomIndex];

          console.log('Triplet inserted:', tripletsArray);
        }
      }

      return { array: tripletsArray, tripletsInserted: true };
    };

    let tripletsInserted = false;
    let tripletsArray = piecewiseSum;
    if (this.enableTriplets) {
      const result = insertTriplets(piecewiseSum);
      tripletsArray = result.array;
      tripletsInserted = result.tripletsInserted;
    }

    // fill in the triplet

    // Step 7: Straighten
    const rankArray = (notesArray) => {
      // Step 1: Map non-null values with their indices
      const nonNullValues = notesArray
        .map((value, index) => (value !== null ? { value, index } : null))
        .filter((item) => item !== null);

      // Step 2: Sort the non-null values by their values
      nonNullValues.sort((a, b) => a.value - b.value);

      // Step 3: Assign ranks to the sorted values, ensuring equal ranks for equal values
      let rank = 0;
      let lastValue = nonNullValues[0]?.value;
      nonNullValues.forEach((item, i) => {
        if (i === 0 || item.value !== lastValue) {
          rank = i;
        }
        item.rank = rank;
        lastValue = item.value;
      });

      // Step 4: Create the ranked array with nulls in their original positions
      const rankedArray = tripletsArray.map((value) => null);
      nonNullValues.forEach((item) => {
        rankedArray[item.index] = item.rank;
      });

      return rankedArray;
    };

    const rankedArray = rankArray(tripletsArray);

    const generatedMelody = convertRankedArrayToMelody(
      rankedArray,
      tonic,
      scale,
      notesPerMeasure,
      numMeasures,
      randomizationRules
    );

    const insertRestsAtBeats = (melodyArray, numMeasures, timeSignature) => {
      const numMeasureSlots = melodyArray.length / numMeasures;
      const numBeatSlots =
        (numMeasureSlots / timeSignature[0]) * (timeSignature[1] / 4);

      const generatedMelodyWithRests = melodyArray.map((note, index) => {
        const isBeat = (index % numMeasureSlots) % numBeatSlots === 0;
        if (isBeat && note === null) {
          return 'r';
        }
        return note;
      });

      return generatedMelodyWithRests;
    };

    let generatedMelodyWithRests;
    if (instrumentType === 'percussion') {
      generatedMelodyWithRests = insertRestsAtBeats(
        generatedMelody,
        numMeasures,
        timeSignature
      );
    } else {
      generatedMelodyWithRests = generatedMelody;
    }

    const createDisplayMelody = (melodyArray, scale, displayScale) => {
      return melodyArray.map((note) => {
        if (note === null) {
          return note;
        }
        const index = scale.indexOf(note);
        return index !== -1 ? displayScale[index] : note;
      });
    };

    const displayMelody = createDisplayMelody(
      generatedMelodyWithRests,
      scale,
      displayScale
    );

    // Step 10: Return melodyArray, clickTrack, and generatedMelody
    return Melody.fromFlattenedNotes(
      generatedMelodyWithRests,
      timeSignature,
      numMeasures,
      displayMelody
    );
  }
}

export default MelodyGenerator;
