import { standardizeTonic, getRelativeNoteName } from './convertToDisplayNotes';
import { CANONICAL_MAP, getCanonicalNote, collapseAccidentals } from './noteUtils';
import generateAllNotesArray from './allNotesArray';
const notes = generateAllNotesArray();

const majorScaleIntervals = [2, 2, 1, 2, 2, 2, 1];

const generateScale = (anyTonic, intervals, scaleRange) => {
    const tonic = standardizeTonic(anyTonic);
    const scale = [];
    const canonicalTonic = getCanonicalNote(tonic);
    let noteIndex = notes.indexOf(canonicalTonic);

    if (noteIndex === -1) {
        // Double check standard lookup just in case
        noteIndex = notes.indexOf(tonic);

        if (noteIndex === -1) {
            console.warn(`[generateDisplayScale] Tonic "${tonic}" (canonical: ${canonicalTonic}) not found. Falling back...`);
            const pitch = tonic.match(/[A-G][♭♯]?/)?.[0];
            if (pitch) {
                noteIndex = notes.findIndex((n) => n.startsWith(pitch));
            }
            if (noteIndex === -1) {
                noteIndex = 0;
            }
        }
    }

    let sumOfIntervals = 0;
    let i = 0;

    while (sumOfIntervals <= scaleRange) {
        const note = notes[noteIndex % notes.length];
        scale.push(note);
        sumOfIntervals += intervals[i % intervals.length];
        noteIndex += intervals[i % intervals.length];
        i++;
    }
    return scale;
};

const computeScaleDelta = (intervals) => {
    const intervalsSum = intervals.reduce((acc, val) => {
        acc.push((acc.length > 0 ? acc[acc.length - 1] : 0) + val);
        return acc;
    }, []);

    const majorSum = majorScaleIntervals.reduce((acc, val) => {
        acc.push((acc.length > 0 ? acc[acc.length - 1] : 0) + val);
        return acc;
    }, []);

    const scaleDelta = [0].concat(intervalsSum.map((sum, index) => sum - majorSum[index]));
    return scaleDelta;
};

const generateDisplayScale = (tonic, intervals, scaleRange) => {
    if (intervals.length === majorScaleIntervals.length) {
        const scaleDelta = computeScaleDelta(intervals);

        const standardMajorNotes = generateScale(tonic, majorScaleIntervals, scaleRange);
        const majorNotes = standardMajorNotes.map((note) => getRelativeNoteName(note, tonic));

        return majorNotes.map((note, index) => {
            const match = note.match(/^(.+?)(-?\d+)$/);
            if (!match) return note;
            const pitch = match[1];
            const octave = match[2];
            const delta = scaleDelta[index];

            let accidental = '';
            let adjustedPitch = pitch;

            if (delta < 0) {
                accidental = '♭'.repeat(Math.abs(delta));
                adjustedPitch = `${pitch}${accidental}`;
            } else if (delta > 0) {
                accidental = '♯'.repeat(delta);
                adjustedPitch = `${pitch}${accidental}`;
            }

            adjustedPitch = collapseAccidentals(adjustedPitch);

            let displayNote = adjustedPitch;
            return `${displayNote}${octave}`;
        });
    } else {
        const standardScale = generateScale(tonic, intervals, scaleRange);
        const displayNotes = standardScale.map((note) => getRelativeNoteName(note, tonic));
        return displayNotes;
    }
};

export default generateDisplayScale;
