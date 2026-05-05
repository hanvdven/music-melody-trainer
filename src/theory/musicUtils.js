import generateAllNotesArray from './allNotesArray';
import { getDiatonicIntervals } from './scaleHandler';
import { normalizeNoteChars, CANONICAL_MAP, ALL_NOTES } from './noteUtils';

const allNotes = generateAllNotesArray();

/**
 * Calculates the index of a note in the global notes array.
 * Supports various accidental notations (♯, #, ♭, b, 𝄪, 𝄫).
 */
export const getNoteIndex = (note) => {
    if (!note || typeof note !== 'string') return -1;
    const match = note.match(/^([A-G])([♯#♭b𝄪𝄫]*)(-?\d+)?$/u);
    if (!match) return -1;

    const [_, base, accidentals, octaveStr] = match;
    const octave = octaveStr ? parseInt(octaveStr, 10) : 4;

    const baseMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let semitones = baseMap[base] + octave * 12;

    if (accidentals) {
        for (const char of accidentals) {
            if (char === '♯' || char === '#') semitones += 1;
            else if (char === '♭' || char === 'b') semitones -= 1;
            else if (char === '𝄪') semitones += 2;
            else if (char === '𝄫') semitones -= 2;
        }
    }

    // Double-check against allNotes to ensure exact match if possible
    const technicalMatchIdx = allNotes.indexOf(note);
    if (technicalMatchIdx !== -1) return technicalMatchIdx;

    // Return the index relative to allNotes starting point (A0)
    // A0 is 9 semitones from C0 (0).
    return semitones - 9;
};

/**
 * Transposes a single note by a given number of semitones.
 */
export const transposeNoteBySemitones = (note, semitones) => {
    if (!note || typeof note !== 'string') return note;
    if (['k', 'c', 'b', 'hh', 's', '/'].includes(note)) {
        return note; // Percussion notes are not transposed
    }

    const noteIndex = getNoteIndex(note);
    if (noteIndex === -1) return note;

    const newIndex = noteIndex + semitones;
    if (newIndex >= 0 && newIndex < allNotes.length) {
        return allNotes[newIndex];
    }

    return note; // Out of range
};

/**
 * Transposes an entire melody by a given number of semitones.
 */
export const transposeMelodyBySemitones = (melodyNotes, semitones) => {
    if (!melodyNotes || semitones === 0) return melodyNotes;
    return melodyNotes.map(note => transposeNoteBySemitones(note, semitones));
};

/**
 * Transposes a melody from one scale to another based on scale degrees.
 */
export const transposeMelodyToScale = (melodyNotes, oldScaleNotes, newScaleNotes) => {
    if (!melodyNotes || !oldScaleNotes || !newScaleNotes) return melodyNotes;

    const normOldScale = oldScaleNotes.map(normalizeNoteChars);

    return melodyNotes.map((note) => {
        if (!note) return null;
        if (['k', 'c', 'b', 'hh', 's', '/'].includes(note)) return note;

        const normNote = normalizeNoteChars(note);
        const indexInOldScale = normOldScale.indexOf(normNote);

        if (indexInOldScale !== -1) {
            if (indexInOldScale < newScaleNotes.length) {
                return newScaleNotes[indexInOldScale];
            }
        }

        let nearestIdx = -1;
        for (let i = 0; i < normOldScale.length; i++) {
            const scNoteIdx = getNoteIndex(normOldScale[i]);
            const noteIdx = getNoteIndex(normNote);
            if (scNoteIdx !== -1 && noteIdx !== -1 && scNoteIdx <= noteIdx) {
                nearestIdx = i;
            } else if (scNoteIdx > noteIdx) {
                break;
            }
        }

        if (nearestIdx !== -1) {
            const nearestOld = normOldScale[nearestIdx];
            const nearestNew = newScaleNotes[nearestIdx];
            const semitoneOffset = getNoteIndex(normNote) - getNoteIndex(nearestOld);

            const newIndex = getNoteIndex(nearestNew) + semitoneOffset;
            if (newIndex >= 0 && newIndex < allNotes.length) {
                return allNotes[newIndex];
            }
        }

        return note;
    });
};

/**
 * Computes a note range relative to the given tonic for relative range modes.
 * Returns { min, max } note strings, or null when mode is not a relative mode.
 *
 * Modes:
 *   'relative'     treble: tonic → tonic+12 (8va)   |  bass: tonic-24 → tonic-12
 *   'relative_15a' treble: tonic → tonic+24 (15ma)  |  (not used for bass)
 *   'relative_low' bass:   tonic-36 → tonic-24       |  (not used for treble)
 */
export const calculateRelativeRange = (type, mode, t) => {
    if (mode !== 'relative' && mode !== 'relative_15a' && mode !== 'relative_low') return null;
    const match = t.match(/^([A-G][#b♯♭]?)(-?\d+)$/);
    if (!match) return null;
    let pc = match[1].replace('#', '♯').replace('b', '♭');
    const oct = parseInt(match[2], 10);
    if (CANONICAL_MAP[pc]) pc = CANONICAL_MAP[pc];
    const pcIndex = ALL_NOTES.indexOf(pc);
    const tonicVal = oct * 12 + pcIndex;
    let minVal, maxVal;
    if (mode === 'relative_15a') {
        // Treble only: two octaves above tonic
        minVal = tonicVal; maxVal = tonicVal + 24;
    } else if (mode === 'relative_low') {
        // Bass only: one octave lower than standard bass relative
        minVal = tonicVal - 36; maxVal = tonicVal - 24;
    } else {
        // 'relative'
        if (type === 'treble') {
            minVal = tonicVal; maxVal = tonicVal + 12;
        } else if (type === 'bass') {
            minVal = tonicVal - 24; maxVal = tonicVal - 12;
        } else {
            minVal = tonicVal - 6; maxVal = tonicVal + 6;
        }
    }
    const noteAt = (v) => `${ALL_NOTES[v % 12]}${Math.floor(v / 12)}`;
    return { min: noteAt(minVal), max: noteAt(maxVal) };
};

// ============================================================================
// LOSSLESS MODULATION LOGIC
// ============================================================================

export const generateHeptaScaleNotes = (tonic, intervals) => {
    const scale = [];
    let noteIndex = getNoteIndex(tonic);
    if (noteIndex === -1) return [];

    for (let i = 0; i < 7; i++) {
        const note = allNotes[noteIndex % allNotes.length];
        scale.push(note);
        if (i < intervals.length) {
            noteIndex += intervals[i];
        }
    }
    return scale;
};

const getNoteHeptaDegree = (note, tonic) => {
    const noteIdx = getNoteIndex(note);
    const tonicIdx = getNoteIndex(tonic);

    if (noteIdx === -1 || tonicIdx === -1) return null;

    const diff = noteIdx - tonicIdx;
    const octaveOffset = Math.floor(diff / 12);
    const semitoneInterval = ((diff % 12) + 12) % 12;

    let degree;
    if (semitoneInterval === 0) degree = 0;
    else if (semitoneInterval <= 2) degree = 1;
    else if (semitoneInterval <= 4) degree = 2;
    else if (semitoneInterval <= 6) degree = 3;
    else if (semitoneInterval === 7) degree = 4;
    else if (semitoneInterval <= 9) degree = 5;
    else degree = 6;

    return { degree, octaveOffset };
};

const snapToScale = (note, targetScaleNotes) => {
    if (!note) return note;

    const noteIdx = getNoteIndex(note);
    if (noteIdx === -1) return note;

    const scalePCs = [...new Set(targetScaleNotes.map(n => getNoteIndex(n) % 12))].sort((a, b) => a - b);
    if (scalePCs.length === 0) return note;

    const notePC = noteIdx % 12;
    if (scalePCs.includes(notePC)) return note;

    let targetPC = scalePCs.find(pc => pc >= notePC);
    let delta = 0;

    if (targetPC !== undefined) {
        delta = targetPC - notePC;
    } else {
        targetPC = scalePCs[0];
        delta = (targetPC + 12) - notePC;
    }

    const newIndex = noteIdx + delta;
    if (newIndex >= 0 && newIndex < allNotes.length) {
        return allNotes[newIndex];
    }

    return note;
};

const getCumulativePositions = (intervals) => {
    const positions = [0];
    let current = 0;
    for (let i = 0; i < intervals.length - 1; i++) {
        current += intervals[i];
        positions.push(current);
    }
    return positions;
};

const getNoteDegreeIndex = (note, tonic, intervals) => {
    const noteIdx = getNoteIndex(note);
    const tonicIdx = getNoteIndex(tonic);
    if (noteIdx === -1 || tonicIdx === -1) return null;

    const semitoneDiff = noteIdx - tonicIdx;
    const octave = Math.floor(semitoneDiff / 12);
    const normalizedDiff = ((semitoneDiff % 12) + 12) % 12;

    const positions = getCumulativePositions(intervals);

    let bestIndex = -1;
    let minDist = Infinity;

    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        let dist = Math.abs(normalizedDiff - pos);
        if (dist > 6) dist = 12 - dist;

        if (dist < minDist) {
            minDist = dist;
            bestIndex = i;
        }
    }

    return (octave * intervals.length) + bestIndex;
};

/**
 * Modulates a melody from a Reference context to a Target context losslessly.
 */
export const modulateMelody = (referenceMelodyNotes, referenceScale, targetScale) => {
    if (!referenceMelodyNotes || !referenceScale || !targetScale) return referenceMelodyNotes;

    let srcIntervals;
    if (referenceScale.intervals && referenceScale.intervals.length === 7) {
        srcIntervals = referenceScale.intervals;
    } else if (referenceScale.heptaRefIntervals && referenceScale.heptaRefIntervals.length === 7) {
        srcIntervals = referenceScale.heptaRefIntervals;
    } else {
        srcIntervals = [2, 2, 1, 2, 2, 2, 1];
    }

    let tgtIntervals;
    if (targetScale.intervals && targetScale.intervals.length === 7) {
        tgtIntervals = targetScale.intervals;
    } else if (targetScale.heptaRefIntervals && targetScale.heptaRefIntervals.length === 7) {
        tgtIntervals = targetScale.heptaRefIntervals;
    } else {
        tgtIntervals = [2, 2, 1, 2, 2, 2, 1];
    }

    const isHeptaHepta = srcIntervals.length === 7 && tgtIntervals.length === 7;
    const tgtPositions = isHeptaHepta ? getCumulativePositions(tgtIntervals) : [];
    const targetHeptaNotes = generateHeptaScaleNotes(targetScale.tonic, tgtIntervals);

    return referenceMelodyNotes.map(note => {
        if (!note || ['k', 'c', 'b', 'hh', 's', '/', 'ho', 'th', 'tm', 'tl', 'hp', 'cr', 'cc', 'wh', 'wm', 'wl'].includes(note)) return note;

        if (isHeptaHepta) {
            const signedIndex = getNoteDegreeIndex(note, referenceScale.tonic, srcIntervals);

            if (signedIndex !== null) {
                const scaleLength = 7;
                const targetOctave = Math.floor(signedIndex / scaleLength);
                const targetDegree = ((signedIndex % scaleLength) + scaleLength) % scaleLength;
                const semitoneShift = tgtPositions[targetDegree];
                return transposeNoteBySemitones(targetScale.tonic, semitoneShift + (targetOctave * 12));
            }
        }

        const mapping = getNoteHeptaDegree(note, referenceScale.tonic);
        if (!mapping) return note;

        const baseTargetNote = targetHeptaNotes[mapping.degree];
        if (!baseTargetNote) return note;

        let targetNote = transposeNoteBySemitones(baseTargetNote, mapping.octaveOffset * 12);

        const isTargetHeptaStrict = targetScale.intervals && targetScale.intervals.length === 7;
        if (isTargetHeptaStrict) {
            return targetNote;
        }

        return snapToScale(targetNote, targetScale.notes);
    });
};
