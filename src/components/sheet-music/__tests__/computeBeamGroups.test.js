import { describe, it, expect } from 'vitest';
import { computeBeamGroups } from '../computeBeamGroups';
import { noteYMap } from '../renderMelodyNotes.jsx';

/**
 * PURE UNIT TEST — computeBeamGroups (Han 2026-06-19).
 *
 * WHY THIS EXISTS: computeBeamGroups was extracted from renderMelodyNotes.jsx (Phase-2,
 * ARCHITECTURE_AUDIT §4) as the pure rhythmic beam-grouping decision. The committed
 * beamGroups.characterization.test.jsx pins the SAME grouping facts via the rendered DOM
 * (the end-to-end guard). This test pins them at the pure-function level — covering the
 * identical cases (4/4 eighths → 2 groups; 4/4 sixteenths → secondary beams; 6/8 [3,3] →
 * 2 groups; quarters → 0 groups) so a regression in the math is caught directly, without
 * going through jsdom rendering.
 *
 * The grouping decides the master stem direction from each note's positionY, so we pass the
 * SAME geometry helpers the renderer uses (noteYMap + the tiny strip/percussion helpers
 * reproduced here to match the module's own definitions). combinedShift is set to the treble
 * value the characterization test exercises (staffYStart 11 + treble clef offset -11 = 0).
 */

// Match renderMelodyNotes' module-private stripAccidentals (only natural names live in noteYMap).
const stripAccidentals = n => (n ? n.replace(/[♭º♯Ü#b𝄫𝄪]/gu, '') : n);
// percussionStemUp is irrelevant for melodic (non-percussion) cases here; a stub suffices.
const percussionStemUp = () => true;

const SCALE = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];

function run(melody, timeSignature, measureLengthSlots) {
  return computeBeamGroups({
    melodyNotes: melody.notes,
    melodyDurations: melody.durations,
    melodyOffsets: melody.offsets,
    melodyTies: melody.ties,
    melodyTriplets: melody.triplets ?? null,
    displayNotes: melody.notes, // notes are already in-range (no octave shift) for these cases
    measureLengthSlots,
    timeSignature,
    rhythmicGrouping: melody.rhythmicGrouping,
    noteGroupSize: 12,
    staffYStart: 11,
    combinedShift: 0, // treble: staffYStart(11) + clefOffsets.treble(-11)
    staff: 'treble',
    percussionVoiceSplit: false,
    noteYMap,
    stripAccidentals,
    percussionStemUp,
  }).beamGroups;
}

// Identity of a beam group = its LAST note's offset (and actualDuration), matching how the
// characterization test reads the rendered <g data-offset data-duration> wrapper.
const lastOffset = (group) => group[group.length - 1].offset;
const lastActualDur = (group) => group[group.length - 1].actualDuration;

describe('computeBeamGroups — pure rhythmic grouping', () => {
  it('4/4 eight eighth-notes → TWO beam groups split at the half (24)', () => {
    const melody = {
      notes: SCALE,
      durations: [6, 6, 6, 6, 6, 6, 6, 6],
      offsets: [0, 6, 12, 18, 24, 30, 36, 42],
      ties: [],
    };
    const groups = run(melody, [4, 4], 48);
    expect(groups).toHaveLength(2);
    expect(lastOffset(groups[0])).toBe(18); // first group ends at offset 18 (beats 1-2)
    expect(lastOffset(groups[1])).toBe(42); // second group ends at offset 42 (beats 3-4)
    expect(lastActualDur(groups[0])).toBe(6);
    expect(lastActualDur(groups[1])).toBe(6);
  });

  it('4/4 eight sixteenth-notes in beat 1 → ONE group with sixteenths (actualDuration 3)', () => {
    const melody = {
      notes: SCALE,
      durations: [3, 3, 3, 3, 3, 3, 3, 3],
      offsets: [0, 3, 6, 9, 12, 15, 18, 21],
      ties: [],
    };
    const groups = run(melody, [4, 4], 48);
    // All within the first half-measure span → a single beam group.
    expect(groups).toHaveLength(1);
    expect(lastOffset(groups[0])).toBe(21);
    // Every note is a sixteenth (actualDuration 3 < 6) → secondary beams will be drawn.
    const nonRests = groups[0].filter(n => !n.isRest);
    expect(nonRests.every(n => n.actualDuration < 6)).toBe(true);
    expect(nonRests.length).toBe(8);
  });

  it('6/8 with rhythmicGrouping [3,3] → TWO beam groups, one per dotted-quarter group', () => {
    const notes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4'];
    const melody = {
      notes,
      durations: [8, 8, 8, 8, 8, 8],
      offsets: [0, 8, 16, 24, 32, 40],
      ties: [],
      rhythmicGrouping: [3, 3],
    };
    const groups = run(melody, [6, 8], 48);
    expect(groups).toHaveLength(2);
    expect(groups.map(lastOffset)).toEqual([16, 40]);
  });

  it('two quarter notes do not beam (no beam groups emitted)', () => {
    const melody = {
      notes: ['C4', 'E4'],
      durations: [24, 24],
      offsets: [0, 24],
      ties: [],
    };
    const groups = run(melody, [4, 4], 48);
    expect(groups).toHaveLength(0);
  });

  it('grouping is deterministic across repeated calls (no RNG)', () => {
    const melody = {
      notes: SCALE,
      durations: [6, 6, 6, 6, 6, 6, 6, 6],
      offsets: [0, 6, 12, 18, 24, 30, 36, 42],
      ties: [],
    };
    const a = run(melody, [4, 4], 48).map(g => g.map(n => n.offset));
    const b = run(melody, [4, 4], 48).map(g => g.map(n => n.offset));
    expect(a).toEqual(b);
  });
});
