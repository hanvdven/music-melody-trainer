import generateAllNotesArray from './allNotesArray';

const allNotes = generateAllNotesArray();

export const getNoteIndex = (note) => {
    if (!note || typeof note !== 'string') return -1;
    const match = note.match(/^([A-G])([♯#♭b𝄪𝄫]*)(-?\d+)?$/);
    if (!match) return -1;

    const [_, base, accidentals, octaveStr] = match;
    const octave = octaveStr ? parseInt(octaveStr, 10) : 4;

    const baseMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let semitones = baseMap[base] + (octave * 12);

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

// Transposes a melody from one scale to another based on Scale Degrees
// oldScaleNotes: ["C4", "D4", ...]
// newScaleNotes: ["G4", "A4", ...]
// We map by finding the degree of the note in the old scale and 
// returning the corresponding degree in the new scale.
export const transposeMelodyToScale = (melodyNotes, oldScaleNotes, newScaleNotes) => {
    if (!melodyNotes || !oldScaleNotes || !newScaleNotes) return melodyNotes;

    // Helper to normalize notes for comparison (Unicode 166F/166D <-> ASCII #/b)
    const normalize = (n) => {
        if (typeof n !== 'string') return n;
        return n.replace(/##/g, '𝄪')
            .replace(/bb/g, '𝄫')
            .replace(/#/g, '♯')
            .replace(/b/g, '♭');
    };

    const normOldScale = oldScaleNotes.map(normalize);

    return melodyNotes.map(note => {
        if (!note) return null;
        if (['k', 'c', 'b', 'hh', 's', '/'].includes(note)) return note; // Percussion/Meta

        const normNote = normalize(note);

        // 1. Find index in old scale
        const indexInOldScale = normOldScale.indexOf(normNote);

        if (indexInOldScale !== -1) {
            // It's a scale note! Map to the same index in the new scale.
            if (indexInOldScale < newScaleNotes.length) {
                return newScaleNotes[indexInOldScale];
            }
        }

        // 2. If not exactly in the scale (chromatic), we try to find the nearest scale note 
        // below it and transpose that, then apply the same semitone offset.

        // Find nearest scale note below
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

            // Apply offset to new scale note
            const newIndex = getNoteIndex(nearestNew) + semitoneOffset;
            if (newIndex >= 0 && newIndex < allNotes.length) {
                return allNotes[newIndex];
            }
        }

        return note;
    });
};
