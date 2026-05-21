import { TICKS_PER_WHOLE } from '../../constants/timing.js';
import { decomposeNumeratorToBeatGroups } from '../../generation/rhythmicPriorities.js';

const allowedDurations = [3, 6, 9, 12, 18, 21, 24, 36, 42, 48, 72];

// Diatonic staff position for a note name (C=0, D=1 … B=6, octave*7).
// Accidentals are stripped — only the letter+octave matters for staff line position.
const getDiatonicPos = (n) => {
  if (!n || typeof n !== 'string') return 28;
  const clean = n.replace(/[♭º♯Ü#b𝄫𝄪]/gu, '');
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

const processMelodyAndCalculateSlots = (melody, timeSignature, noteGroupSize, globalMaxDuration) => {
  const firstNonNull = melody.displayNotes ? melody.displayNotes.find(n => n !== null && n !== 'r') : null;
  const useDisplayNotes = melody.displayNotes && firstNonNull && (typeof firstNonNull === 'string' || Array.isArray(firstNonNull));
  const notes = useDisplayNotes ? melody.displayNotes : (melody.notes || []);
  const durations = melody.durations;
  const offsets = melody.offsets;
  const measureLength = TICKS_PER_WHOLE * (timeSignature[0] / timeSignature[1]);

  const timeSigTop = timeSignature[0];

  // Beat-group boundary ticks (relative to measure start, excluding 0 = downbeat).
  // When melody.rhythmicGrouping is present (e.g. [3,2] for 5/4 played as 3+2),
  // use it directly so boundaries match the DNA that drove generation. This fixes
  // cases where the generated grouping differs from decomposeNumeratorToBeatGroups'
  // default (e.g. 5/4 generated as [2,3] has its boundary at beat 2, not beat 3).
  // Fall back to decomposeNumeratorToBeatGroups for melodies without explicit grouping.
  // Examples: [3,2]×12 → internal boundary at 36 (beat 4 of 5/4).
  //           [2,3]×12 → internal boundary at 24 (beat 3 of 5/4).
  //           [3,3]×6  → internal boundary at 18 (compound beat 2 of 6/8).
  const beatUnit = TICKS_PER_WHOLE / timeSignature[1];
  let beatGroupBoundaryTicks;
  if (melody.rhythmicGrouping && melody.rhythmicGrouping.length > 1) {
    // Convert group sizes to cumulative beat-starts, skip the first (measure start = 0).
    const groupStarts = [];
    let groupAcc = 0;
    for (let gi = 0; gi < melody.rhythmicGrouping.length; gi++) {
      groupStarts.push(groupAcc);
      groupAcc += melody.rhythmicGrouping[gi];
    }
    beatGroupBoundaryTicks = groupStarts.slice(1).map(s => s * beatUnit);
  } else {
    beatGroupBoundaryTicks = decomposeNumeratorToBeatGroups(timeSigTop)
        .slice(1)
        .map(s => s * beatUnit);
  }
  // All group start ticks within one measure: [0, internal boundaries…, measureLength].
  // A note "fills the last group" when its end tick (relative to the measure start) equals
  // the next entry in this array — i.e. it ends exactly at a group boundary.
  const allGroupStarts = [0, ...beatGroupBoundaryTicks, measureLength];

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

    // Tuplet notes have non-standard tick counts by design (e.g. 16 ticks for a half-note
    // triplet, 4 ticks for an 8th-note triplet). Splitting them into allowedDurations
    // produces multiple tied noteheads instead of one correct notehead. Skip all splitting —
    // renderMelodyNotes reads display info from melody.triplets, not from the duration here.
    const origIdx = paddedOriginalIndices[i];
    if (origIdx !== null && melody.triplets?.[origIdx]) {
      resultNotes.push(paddedNotes[i]);
      resultDurations.push(paddedDurations[i]);
      resultOffsets.push(paddedOffsets[i]);
      resultOriginalIndices.push(origIdx);
      resultTies.push(null);
      continue;
    }

    let remainingDuration = paddedDurations[i];
    let currentOffset = paddedOffsets[i];
    let isFirstSplit = true;
    // Set to true once a Step 3 group-boundary split has occurred for this note.
    // Subsequent Step 3 chunks become rests instead of tied note continuations.
    let inGroupBoundaryCont = false;

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

    // Step 2: Split at measure boundaries.
    while (remainingDuration > 0) {
      let currentMeasureEnd = Math.ceil((currentOffset + 0.5) / measureLength) * measureLength;

      // Split across one or more measure boundaries.
      while (currentOffset + remainingDuration > currentMeasureEnd) {
        let splitDuration = currentMeasureEnd - currentOffset;

        // If the piece at the measure boundary is not a standard notation value, subdivide it.
        // Guard: drop any remainder < 3 ticks (sub-32nd, unrenderable) to prevent infinite loop.
        while (!allowedDurations.includes(splitDuration)) {
          let found = false;
          for (let j = 0; j < splittableDurations.length; j++) {
            if (splittableDurations[j] <= splitDuration) {
              const firstPart = splittableDurations[j];
              resultNotes.push(paddedNotes[i]);
              resultDurations.push(firstPart);
              resultOffsets.push(currentOffset);
              resultOriginalIndices.push(paddedOriginalIndices[i]);
              resultTies.push(isFirstSplit ? null : 'tie');
              isFirstSplit = false;
              currentOffset += firstPart;
              splitDuration -= firstPart;
              remainingDuration -= firstPart;
              found = true;
              break;
            }
          }
          if (!found) { remainingDuration -= splitDuration; splitDuration = 0; break; }
        }

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

      // Step 3: Group-boundary split.
      // Rule 1 — fills last group: if the note ends exactly at a group boundary it is
      //   metrically complete and stays whole.
      // Rule 2 — doesn't fill last group: split at the first group boundary after the note
      //   start so the group boundary remains visible. Iterate until rule 1 or rule 3 applies.
      // Rule 3 — within one group: note starts and ends inside the same group; stay whole
      //   if the duration is a standard notation value, otherwise use greedy fallback.
      const startInMeasure = currentOffset % measureLength;
      const endInMeasure   = startInMeasure + remainingDuration; // ≤ measureLength after step 2

      // Find the boundary that closes the last group the note touches.
      let lastGroupEnd = measureLength;
      for (const g of allGroupStarts) {
        if (g >= endInMeasure) { lastGroupEnd = g; break; }
      }

      if (endInMeasure === lastGroupEnd && allowedDurations.includes(remainingDuration)) {
        // Rule 1: note fills its last group exactly AND is a renderable duration — stay whole.
        // When the full-measure duration isn't representable (e.g. 60 ticks in 5/4) fall through
        // to Rule 2, which splits at the first group boundary (e.g. half + dotted-half for [2,3]).
        resultNotes.push(inGroupBoundaryCont ? 'r' : paddedNotes[i]);
        resultDurations.push(remainingDuration);
        resultOffsets.push(currentOffset);
        resultOriginalIndices.push(paddedOriginalIndices[i]);
        resultTies.push(inGroupBoundaryCont ? null : (isFirstSplit ? null : 'tie'));
        break;
      }

      // Rule 2: find the first group boundary strictly after the note's start.
      const firstBoundaryAfterStart = allGroupStarts.find(g => g > startInMeasure);
      if (firstBoundaryAfterStart != null && firstBoundaryAfterStart < endInMeasure) {
        // Split there; the loop re-evaluates the remainder on the next iteration.
        const splitDuration = firstBoundaryAfterStart - startInMeasure;
        resultNotes.push(inGroupBoundaryCont ? 'r' : paddedNotes[i]);
        resultDurations.push(splitDuration);
        resultOffsets.push(currentOffset);
        resultOriginalIndices.push(paddedOriginalIndices[i]);
        resultTies.push(inGroupBoundaryCont ? null : (isFirstSplit ? null : 'tie'));
        inGroupBoundaryCont = true; // remainder goes to rest on next iteration
        isFirstSplit = false;
        currentOffset += splitDuration;
        remainingDuration -= splitDuration;
        continue;
      }

      // Rule 3: note is entirely within one group.
      if (allowedDurations.includes(remainingDuration)) {
        resultNotes.push(inGroupBoundaryCont ? 'r' : paddedNotes[i]);
        resultDurations.push(remainingDuration);
        resultOffsets.push(currentOffset);
        resultOriginalIndices.push(paddedOriginalIndices[i]);
        resultTies.push(inGroupBoundaryCont ? null : (isFirstSplit ? null : 'tie'));
        break;
      }

      // Greedy fallback for non-standard durations (e.g. padding rests with irregular length).
      // Take the largest standard notation value that fits.
      let splitDuration = 0;
      for (let j = 0; j < splittableDurations.length; j++) {
        if (splittableDurations[j] <= remainingDuration) { splitDuration = splittableDurations[j]; break; }
      }
      if (splitDuration === 0) break; // guard against infinite loop

      resultNotes.push(inGroupBoundaryCont ? 'r' : paddedNotes[i]);
      resultDurations.push(splitDuration);
      resultOffsets.push(currentOffset);
      resultOriginalIndices.push(paddedOriginalIndices[i]);
      resultTies.push(inGroupBoundaryCont ? null : (isFirstSplit ? null : 'tie'));
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
    // Pass through so calculateAllOffsets can insert 'g' markers at the correct beat-group
    // boundaries for the actual generated grouping (e.g. [2,3] vs [3,2] for 5/4).
    rhythmicGrouping: melody.rhythmicGrouping ?? null,
  };
};

export { processMelodyAndCalculateSlots };
