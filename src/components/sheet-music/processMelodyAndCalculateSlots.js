import { TICKS_PER_WHOLE } from '../../constants/timing.js';

const allowedDurations = [3, 6, 9, 12, 18, 21, 24, 36, 42, 48, 72];

// Diatonic staff position for a note name (C=0, D=1 … B=6, octave*7).
// Accidentals are stripped — only the letter+octave matters for staff line position.
const getDiatonicPos = (n) => {
  if (!n || typeof n !== 'string') return 28;
  const clean = n.replace(/[♭º♯Ü#b𝄫𝄪]/g, '');
  const match = clean.match(/^([A-G])(-?\d+)$/);
  if (!match) return 28;
  const lp = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  return (lp[match[1]] ?? 0) + parseInt(match[2], 10) * 7;
};

// Returns true when the note array contains at least one pair of adjacent-step (2nd) notes.
const hasDiatonicSecond = (noteArray) => {
  if (!Array.isArray(noteArray) || noteArray.length < 2) return false;
  const pos = noteArray.map(getDiatonicPos).sort((a, b) => a - b);
  for (let i = 1; i < pos.length; i++) {
    if (pos[i] - pos[i - 1] === 1) return true;
  }
  return false;
};

// Stem direction: furthest note from B4 (diatonic 34, middle of treble staff).
// Returns true when stem goes UP (furthest note is below the middle line).
const isStemUp = (noteArray) => {
  const MIDDLE = 34; // B4
  const positions = noteArray.map(getDiatonicPos);
  const furthest = positions.reduce(
    (prev, cur) => Math.abs(cur - MIDDLE) >= Math.abs(prev - MIDDLE) ? cur : prev,
    MIDDLE
  );
  return furthest < MIDDLE; // below staff middle → large y → stem up
};
// Largest-first for greedy splitting: try the longest fitting duration first.
const splittableDurations = [...allowedDurations].reverse();

const processMelodyAndCalculateSlots = (melody, timeSignature, noteGroupSize, globalMaxDuration, partialMeasureStart = null, partialTop = null) => {
  const firstNonNull = melody.displayNotes ? melody.displayNotes.find(n => n !== null && n !== 'r') : null;
  const useDisplayNotes = melody.displayNotes && firstNonNull && (typeof firstNonNull === 'string' || Array.isArray(firstNonNull));
  const notes = useDisplayNotes ? melody.displayNotes : (melody.notes || []);
  const durations = melody.durations;
  const offsets = melody.offsets;
  const measureLength = TICKS_PER_WHOLE * (timeSignature[0] / timeSignature[1]);
  let startRestDuration = 0;

  // Helper function to determine if a timestamp is at a multiple of 12 (within a measure)
  const isAlignedWithCount = (timestamp, measureLength) => {
    const mod = (timestamp % measureLength) % noteGroupSize;
    return Math.abs(mod) < 0.01 || Math.abs(mod - noteGroupSize) < 0.01;
  };

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
  let paddedOffsets = [...offsets];
  let paddedOriginalIndices = notes.map((_, idx) => idx);

  // Add rests if needed at the beginning
  if (offsets[0] !== 0 && offsets.some((timestamp) => timestamp !== null)) {
    startRestDuration = offsets.find((timestamp) => timestamp !== null);
    if (startRestDuration !== undefined) {
      paddedNotes.unshift('r');
      paddedDurations.unshift(startRestDuration);
      paddedOffsets.unshift(0);
      paddedOriginalIndices.unshift(null);
    }
  }

  // Add rests if needed at the end
  const lastNonNullIndex = findLastNonNullIndex(offsets);
  if (lastNonNullIndex >= 0) {
    const lastTimestamp = offsets[lastNonNullIndex] + durations[lastNonNullIndex];
    const totalDuration = offsets.reduce(
      (acc, timestamp, index) =>
        acc + startRestDuration + (durations[index] !== null ? durations[index] : 0),
      0
    );
    // ADAPTIVE PADDING: Pad to match the song's global end (fixing percussion alignment)
    // but RESPECT the adaptive end (don't force full measure if global end is partial).
    if (globalMaxDuration && totalDuration < globalMaxDuration) {
      const missingDuration = globalMaxDuration - totalDuration;
      if (missingDuration > 0.01) { // Filter tiny gaps
        paddedNotes.push('r');
        paddedDurations.push(missingDuration);
        paddedOffsets.push(lastTimestamp);
        paddedOriginalIndices.push(null);
      }
    }
  }

  const resultNotes = [];
  const resultDurations = [];
  const resultOffsets = [];
  const resultTies = [];
  const resultOriginalIndices = [];

  for (let i = 0; i < paddedDurations.length; i++) {
    if (paddedDurations[i] === null) {
      resultNotes.push(paddedNotes[i]);
      resultDurations.push(paddedDurations[i]);
      resultOffsets.push(paddedOffsets[i]);
      resultOriginalIndices.push(paddedOriginalIndices[i]);
      resultTies.push(null);
      continue;
    }

    let remainingDuration = paddedDurations[i];
    let currentOffset = paddedOffsets[i];
    let isFirstSplit = true;

    // Step 1: If note does not start at a count alignment and crosses a count alignment, split it

    while (remainingDuration > 0 && !isAlignedWithCount(currentOffset, measureLength)) {
      const nextCountAlignment =
        Math.floor(currentOffset / measureLength) * measureLength +
        (Math.floor((currentOffset % measureLength) / noteGroupSize) + 1) * noteGroupSize;
      const nextMeasureAlignment =
        (Math.floor(currentOffset / measureLength) + 1) * measureLength;

      if (nextCountAlignment >= currentOffset + remainingDuration) break; // notes that are within current note block are not further split
      if (nextMeasureAlignment < nextCountAlignment) break; // if the note block passes a measure boundary, stop.
      if (nextMeasureAlignment <= currentOffset + remainingDuration) break; // notes that pass measure boundary are split using logic below.

      const splitDuration = nextCountAlignment - currentOffset;

      resultNotes.push(paddedNotes[i]);
      resultDurations.push(splitDuration);
      resultOffsets.push(currentOffset);
      resultOriginalIndices.push(paddedOriginalIndices[i]);
      resultTies.push(isFirstSplit ? null : 'tie');

      isFirstSplit = false;
      currentOffset += splitDuration;
      remainingDuration -= splitDuration;
    }

    // Step 2: Check and split if the note crosses a measure boundary
    while (remainingDuration > 0) {
      // Calculate effective group size dynamically based on position
      let effectiveGroupSize = noteGroupSize;
      if (partialMeasureStart !== null && currentOffset >= partialMeasureStart) {
        if ([2, 3, 4].includes(partialTop)) {
          effectiveGroupSize = 12;
        }
      }

      let currentMeasureEnd = Math.ceil((currentOffset + 0.5) / measureLength) * measureLength;

      // Split if the note crosses one or more measure boundaries
      while (currentOffset + remainingDuration > currentMeasureEnd) {
        let splitDuration = currentMeasureEnd - currentOffset;

        // Check if the split duration is allowed, if not, further split it.
        // Guard: if splitDuration drops below the minimum splittable unit (3 ticks,
        // a 32nd note) and is not itself an allowedDuration, no further split is possible.
        // This can happen with tuplet notes (e.g. duration=4 for triplet-8ths) that cross
        // a measure boundary, leaving a sub-3-tick remainder. Without the guard the loop
        // spins forever, freezing the app. Drop the remainder — it is inaudible and
        // unrenderable, and the note effectively ends at the measure boundary.
        while (!allowedDurations.includes(splitDuration)) {
          let found = false;
          for (let j = 0; j < splittableDurations.length; j++) {
            if (splittableDurations[j] <= splitDuration) {
              const firstPart = splittableDurations[j];
              const secondPart = splitDuration - firstPart;

              resultNotes.push(paddedNotes[i]);
              resultDurations.push(firstPart);
              resultOffsets.push(currentOffset);
              resultOriginalIndices.push(paddedOriginalIndices[i]);
              resultTies.push(isFirstSplit ? null : 'tie');

              isFirstSplit = false;
              currentOffset += firstPart;
              splitDuration = secondPart;
              remainingDuration -= firstPart;
              found = true;
              break;
            }
          }
          if (!found) {
            // Remainder is too small to split further — drop it to prevent infinite loop.
            remainingDuration -= splitDuration;
            splitDuration = 0;
            break;
          }
        }

        // Skip the push when splitDuration was zeroed by the guard above.
        if (splitDuration > 0) {
          resultNotes.push(paddedNotes[i]);
          resultDurations.push(splitDuration);
          resultOffsets.push(currentOffset);
          resultOriginalIndices.push(paddedOriginalIndices[i]);
          resultTies.push(isFirstSplit ? null : 'tie');

          isFirstSplit = false;
          currentOffset += splitDuration;
          remainingDuration -= splitDuration;
        }

        currentMeasureEnd += measureLength;
      }

      // Step 3: Continue splitting until the note aligns with allowed durations
      if (
        allowedDurations.includes(remainingDuration) &&
        (remainingDuration <= effectiveGroupSize ||
          ((currentOffset + remainingDuration) % measureLength) % effectiveGroupSize === 0)
      ) {
        resultNotes.push(paddedNotes[i]);
        resultDurations.push(remainingDuration);
        resultOffsets.push(currentOffset);
        resultOriginalIndices.push(paddedOriginalIndices[i]);
        resultTies.push(isFirstSplit ? null : 'tie');
        break;
      }

      // Split using the highest splittable duration
      let splitDuration = 0;
      for (let j = 0; j < splittableDurations.length; j++) {
        if (
          splittableDurations[j] <= remainingDuration &&
          (splittableDurations[j] === 3 ||
            ((currentOffset + splittableDurations[j]) % measureLength) % effectiveGroupSize === 0)
        ) {
          splitDuration = splittableDurations[j];
          break;
        }
      }

      // Guard: if no valid split duration found, break to prevent infinite loop.
      // This can occur when remainingDuration < 3 (e.g. due to a non-multiple-of-3
      // padding rest added when melodies and time signature are temporarily mismatched).
      if (splitDuration === 0) break;

      resultNotes.push(paddedNotes[i]);
      resultDurations.push(splitDuration);
      resultOffsets.push(currentOffset);
      resultOriginalIndices.push(paddedOriginalIndices[i]);
      resultTies.push(isFirstSplit ? null : 'tie');

      isFirstSplit = false;
      remainingDuration -= splitDuration;
      currentOffset += splitDuration;
    }
  }

  // Remove the first null and add a null at the end of resultTies
  if (resultTies.length > 0) {
    resultTies.shift(); // Remove the first null
    resultTies.push(null); // Add a null at the end
  }

  // Post-process: insert invisible 'c' spacer entries adjacent to chord slots that contain
  // a 2nd interval (whose notehead is displaced left or right by the flip algorithm).
  //   Stem up  + 2nd → 'c' AFTER  the chord (displaced notehead sticks out to the right)
  //   Stem down + 2nd → 'c' BEFORE the chord (displaced notehead sticks out to the left)
  // The spacer offset is ±0.5 ticks (never a real note offset) so it creates its own
  // visual column in allOffsets without disturbing existing note positions.
  const outNotes = [];
  const outDurations = [];
  const outOffsets = [];
  const outTies = [];
  const outOriginalIndices = [];

  for (let i = 0; i < resultNotes.length; i++) {
    const n = resultNotes[i];
    if (Array.isArray(n) && hasDiatonicSecond(n)) {
      const stemUp = isStemUp(n);
      if (!stemUp && resultOffsets[i] > 0) {
        // Stem down: spacer BEFORE chord (skip at offset 0 — can't go negative)
        outNotes.push('c');
        outDurations.push(1);
        outOffsets.push(resultOffsets[i] - 0.5);
        outTies.push(null);
        outOriginalIndices.push(null);
      }
      outNotes.push(n);
      outDurations.push(resultDurations[i]);
      outOffsets.push(resultOffsets[i]);
      outTies.push(resultTies[i]);
      outOriginalIndices.push(resultOriginalIndices[i]);
      if (stemUp) {
        // Stem up: spacer AFTER chord
        outNotes.push('c');
        outDurations.push(1);
        outOffsets.push(resultOffsets[i] + 0.5);
        outTies.push(null);
        outOriginalIndices.push(null);
      }
    } else {
      outNotes.push(n);
      outDurations.push(resultDurations[i]);
      outOffsets.push(resultOffsets[i]);
      outTies.push(resultTies[i]);
      outOriginalIndices.push(resultOriginalIndices[i]);
    }
  }

  return {
    notes: outNotes,
    durations: outDurations,
    offsets: outOffsets,
    ties: outTies,
    originalIndices: outOriginalIndices,
    triplets: melody.triplets
      ? outOriginalIndices.map(i => (i !== null ? (melody.triplets[i] ?? null) : null))
      : null,
  };
};

export { processMelodyAndCalculateSlots };
