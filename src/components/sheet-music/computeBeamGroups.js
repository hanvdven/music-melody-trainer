// computeBeamGroups — pure rhythmic beam-grouping math extracted from
// renderMelodyNotes.jsx (Han 2026-06-19, Phase-2 split per docs/ARCHITECTURE_AUDIT.md §4).
//
// WHY THIS MODULE EXISTS: renderMelodyNotes.jsx was a ~1500-line function that mixed the
// DECISION of "which consecutive notes share a beam, and how the measure splits into beam
// spans" together with all the SVG drawing. That grouping decision is the part most likely
// to regress, so it is pulled out here as a pure function with explicit inputs (no closure
// over component/React state) and a single return value (the beamGroups structure).
//
// WHAT STAYED in renderMelodyNotes (intentionally NOT moved):
//   • beamData — the per-group beam-LINE geometry (slope, firstYend, clearance, slope-cap).
//     That is pixel geometry (getTickX, chord clearance), not a grouping decision.
//   • beamedNoteIndices, forcedTupletStemDir, and all notehead/stem/flag/tuplet/ledger JSX.
//
// WHAT IS GEOMETRY-DEPENDENT BUT MOVED ANYWAY: the master stem direction inside a beam group
// is decided from each note's positionY (= noteYMap[name] + combinedShift) relative to the
// staff middle line (staffYStart + 20). positionY is a vertical staff coordinate the grouping
// fundamentally needs (the beam can't pick a stem side without knowing where the notes sit),
// so it is computed here from the SAME inputs the renderer uses. The horizontal pixel geometry
// (X positions, slopes) is what was left behind. The geometry helpers (noteYMap lookup,
// stripAccidentals, percussionStemUp) are passed in as parameters so renderMelodyNotes stays
// the single source of truth for those definitions (CLAUDE.md §6d — no duplicated constants).

/**
 * Compute beam groups for a melody.
 *
 * @param {Object}   params
 * @param {Array}    params.melodyNotes        Display note names (string | string[] chord | 'r').
 * @param {number[]} params.melodyDurations    Raw tick durations, parallel to melodyNotes.
 * @param {Array}    params.melodyOffsets      Absolute tick offset per note (null = skip).
 * @param {Array}    params.melodyTies         Tie markers ('tie' on the note BEFORE a tie destination).
 * @param {Array|null} params.melodyTriplets   TupletEntry | null per note (or null when absent).
 * @param {Array}    params.displayNotes       Octave-resolved note names used for Y lookup.
 * @param {number}   params.measureLengthSlots Ticks per measure.
 * @param {number[]} params.timeSignature      [numerator, denominator].
 * @param {Array|undefined} params.rhythmicGrouping  e.g. [3,3] for 6/8 (from melody.rhythmicGrouping).
 * @param {number}   params.noteGroupSize      Ticks per primary beat group (default beat width).
 * @param {number}   params.staffYStart        Staff top Y (middle line = staffYStart + 20).
 * @param {number}   params.combinedShift      Vertical shift added to noteYMap lookups.
 * @param {string}   params.staff              'treble' | 'bass' | 'percussion'.
 * @param {boolean}  params.percussionVoiceSplit  Split RH/LH percussion voices into separate beams.
 * @param {Object}   params.noteYMap           Note-name → base Y map (renderMelodyNotes owns it).
 * @param {Function} params.stripAccidentals   (name) => name with accidentals removed.
 * @param {Function} params.percussionStemUp   (noteOrChord) => boolean (RH = stem up).
 * @returns {{ beamGroups: Array<Array<Object>> }} beamGroups: array of groups; each group is an
 *   array of note-entry objects { index, beatIndexWithinMeasure, isRest, stemIsAbove, voiceSplit,
 *   positionY, chordSpan, duration, actualDuration, offset, tupletId } — the exact shape the
 *   renderer's beamData / notehead passes consume.
 */
export function computeBeamGroups({
  melodyNotes,
  melodyDurations,
  melodyOffsets,
  melodyTies,
  melodyTriplets,
  displayNotes,
  measureLengthSlots,
  timeSignature,
  rhythmicGrouping,
  noteGroupSize,
  staffYStart,
  combinedShift,
  staff,
  percussionVoiceSplit,
  noteYMap,
  stripAccidentals,
  percussionStemUp,
}) {
  const timeSigTop = timeSignature[0];
  const beamGroups = [];

  const measures = {};
  let nextIsTieDest = false;

  for (let index = 0; index < melodyNotes.length; index++) {
    const isTieDest = nextIsTieDest;
    nextIsTieDest = melodyTies[index] === 'tie';

    const offset = melodyOffsets[index];
    if (offset === null) continue;
    const measureIdx = Math.floor(offset / measureLengthSlots);
    if (!measures[measureIdx]) measures[measureIdx] = [];
    // Use visualDuration for beaming so triplet quarters (visualDuration=12) aren't beamed,
    // while triplet 8ths (visualDuration=6) are correctly beamed together.
    // tupletId is stored so the beam-group loop can isolate each tuplet from adjacent notes.
    const tupletInfo = melodyTriplets?.[index] ?? null;
    const tupletVis = tupletInfo?.visualDuration ?? null;
    measures[measureIdx].push({
      index,
      noteWithAccidental: melodyNotes[index],
      duration: isTieDest ? 99 : (tupletVis ?? melodyDurations[index]),
      actualDuration: melodyDurations[index],
      offset: offset,
      // null for non-tuplet notes; unique id per tuplet group for isolation in beaming.
      tupletId: tupletInfo?.id ?? null,
    });
  }

  // Helper to determine allowed beam spans within a measure based on the RhythmicDNA grouping.
  // When the melody carries a rhythmicGrouping (e.g. [3,2] for 5/8), each group becomes its
  // own beam span so notes never beam across group boundaries.
  // Falls back to the old even-split logic for melodies without a grouping (chords, metronome).
  const getAllowedSpans = (elementsInMeasure, top) => {
    const shortDurations = elementsInMeasure.filter(e => e.duration < 12).map(e => e.duration);
    if (shortDurations.length === 0) return [];

    const grouping = rhythmicGrouping;
    if (grouping && grouping.length > 1) {
      const beatTicks = measureLengthSlots / top;
      const spans = [];
      let start = 0;
      for (const groupSize of grouping) {
        const end = start + groupSize * beatTicks;
        spans.push({ start, end });
        start = end;
      }
      return spans;
    }

    // Fallback: split at midpoint for even numerators, single span for odd/compound
    const spans = [];
    const secondaryBeatSlots = (top % 2 === 0) ? measureLengthSlots / 2 : measureLengthSlots;
    for (let i = 0; i < measureLengthSlots; i += secondaryBeatSlots) {
      spans.push({ start: i, end: i + secondaryBeatSlots });
    }
    return spans;
  };

  Object.values(measures).forEach(elements => {
    const spans = getAllowedSpans(elements, timeSigTop);

    spans.forEach(span => {
      // Elements that fall into this span
      const spanElements = elements.filter(e => {
        const relativeOffset = e.offset % measureLengthSlots;
        return relativeOffset >= span.start && relativeOffset < span.end;
      });

      let currentSubGroup = [];
      const flushSubGroup = () => {
        // Trim rests from start and end
        while (currentSubGroup.length > 0 && currentSubGroup[0].isRest) currentSubGroup.shift();
        while (currentSubGroup.length > 0 && currentSubGroup[currentSubGroup.length - 1].isRest) currentSubGroup.pop();

        if (currentSubGroup.length >= 2) {
          // Do not connect across primary groups if each primary group only has 1 note
          const primaryBeatSlots = (timeSigTop % 3 === 0 && timeSigTop > 3) ? 18 : noteGroupSize;
          const notesOnly = currentSubGroup.filter(n => !n.isRest);
          const notesByBeat = {};
          notesOnly.forEach(n => {
            const b = Math.floor((n.offset % measureLengthSlots) / primaryBeatSlots);
            notesByBeat[b] = (notesByBeat[b] || 0) + 1;
          });

          if (Object.keys(notesByBeat).length >= 2) {
            const allOne = Object.values(notesByBeat).every(count => count === 1);
            if (allOne) {
              currentSubGroup = [];
              return;
            }
          }

          // Calculate master stem direction based on note furthest from middle line
          let maxDist = -1;
          let masterStemIsAbove = true;
          currentSubGroup.forEach(item => {
            if (item.isRest) return;
            const dist = Math.abs(item.positionY - (staffYStart + 20)); // Middle line is staffYStart + 20
            if (dist > maxDist) {
              maxDist = dist;
              masterStemIsAbove = item.positionY > staffYStart + 20; // Natural stem direction
            }
          });

          // Apply master direction to all notes in subgroup.
          // For chord entries, re-derive positionY using the master direction so that
          // beam-clearance calculations use the correct stem-base (topY when stem is DOWN,
          // bottomY when stem is UP).  The chord-local stemIsAbove may have been set
          // differently (e.g. equidistant tiebreak) and would otherwise produce a wrong
          // minYend in beamData, pushing the beam far off the staff.
          currentSubGroup.forEach(item => {
            if (!item.isRest && !item.voiceSplit) {
              item.stemIsAbove = masterStemIsAbove;
              const noteEntry = displayNotes[item.index];
              if (Array.isArray(noteEntry)) {
                const ys = noteEntry
                  .map(n => { const nat = stripAccidentals(n); return noteYMap[nat] !== undefined ? noteYMap[nat] + combinedShift : null; })
                  .filter(y => y !== null);
                if (ys.length > 0) {
                  const cTopY = Math.min(...ys);
                  const cBottomY = Math.max(...ys);
                  item.positionY = masterStemIsAbove ? cBottomY : cTopY;
                }
              }
            }
          });

          beamGroups.push([...currentSubGroup]);
        }
        currentSubGroup = [];
      };

      for (let i = 0; i < spanElements.length; i++) {
        const e = spanElements[i];
        if (e.duration >= 12) {
          flushSubGroup();
          continue;
        }

        // Tuplet isolation: flush when crossing a tuplet-group boundary.
        // A non-tuplet (tupletId=null) must never beam with a tuplet, and two notes
        // from different tuplet groups (different ids) must never share a beam.
        const lastInGroup = currentSubGroup[currentSubGroup.length - 1];
        if (lastInGroup && lastInGroup.tupletId !== e.tupletId) {
          flushSubGroup();
        }

        // Parallel voices isolation: RH (stem up) and LH (stem down) notes belong to
        // separate voices and must never share a beam even when their durations match.
        if (percussionVoiceSplit && currentSubGroup.length > 0) {
          const curNote = displayNotes[e.index];
          const lastNote = displayNotes[currentSubGroup[currentSubGroup.length - 1].index];
          if (!Array.isArray(curNote) && !Array.isArray(lastNote)) {
            if (percussionStemUp(curNote) !== percussionStemUp(lastNote)) {
              flushSubGroup();
            }
          }
        }

        const note = displayNotes[e.index];
        if (!note) continue;

        const isRest = !Array.isArray(note) && note === 'r';
        let positionY = null;
        let stemIsAbove = true;

        if (Array.isArray(note)) {
          // Chord: gather all valid y-positions and pick the stem-base note
          const staffMiddleY = staffYStart + 20;
          const yPositions = note
            .map(n => { const nat = stripAccidentals(n); return noteYMap[nat] !== undefined ? noteYMap[nat] + combinedShift : null; })
            .filter(y => y !== null);
          if (yPositions.length === 0) { flushSubGroup(); continue; }

          const topY = Math.min(...yPositions);
          const bottomY = Math.max(...yPositions);
          // Direction: furthest note from staff centre drives the stem away
          const furthestY = yPositions.reduce((prev, cur) =>
            Math.abs(cur - staffMiddleY) >= Math.abs(prev - staffMiddleY) ? cur : prev
          );
          stemIsAbove = furthestY > staffMiddleY;
          // positionY = stem-base (opposite end from where stem will go)
          positionY = stemIsAbove ? bottomY : topY;
        } else if (!isRest) {
          positionY = noteYMap[note] + combinedShift;
          if (Number.isNaN(positionY)) continue;
          stemIsAbove = positionY > staffYStart + 20;
        }

        // Voice split: for single percussion notes, fix stem direction by RH/LH classification
        // so it survives the masterStemIsAbove pass (guarded by voiceSplit flag below).
        // Chord arrays are split into separate stems during the rendering pass — not here.
        if (staff === 'percussion' && percussionVoiceSplit && !isRest && !Array.isArray(note)) {
          stemIsAbove = percussionStemUp(note);
        }

        currentSubGroup.push({
          index: e.index,
          beatIndexWithinMeasure: Math.floor((e.offset % measureLengthSlots) / noteGroupSize),
          isRest,
          stemIsAbove,
          // Protect RH/LH classified entries from being reset by masterStemIsAbove.
          voiceSplit: staff === 'percussion' && percussionVoiceSplit && !Array.isArray(note),
          positionY,
          chordSpan: Array.isArray(note) ? (() => {
            const ys = note.map(n => { const nat = stripAccidentals(n); return noteYMap[nat] !== undefined ? noteYMap[nat] + combinedShift : null; }).filter(y => y !== null);
            return ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
          })() : 0,
          duration: e.duration,
          actualDuration: e.actualDuration,
          offset: e.offset,
          // Must carry tupletId so the isolation check (lastInGroup.tupletId !== e.tupletId)
          // compares null===null correctly for non-tuplet notes.
          tupletId: e.tupletId,
        });
      }
      flushSubGroup();
    });
  });

  return { beamGroups };
}
