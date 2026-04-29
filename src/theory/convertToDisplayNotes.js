import { normalizeNoteChars, replacementsMap } from './noteUtils';

const standardizeTonic = (anyTonic) => {
    if (!anyTonic) return 'C4';

    // 1. Normalize character encoding (# -> ♯, b -> ♭)
    let normalized = normalizeNoteChars(anyTonic);

    // 2. Perform enharmonic remapping to preferred variants
    const pitchMatch = normalized.match(/[A-G][♭♯]?/);
    const pitch = pitchMatch ? pitchMatch[0] : null;
    const octaveMatch = normalized.match(/\d+/);
    const octave = octaveMatch ? octaveMatch[0] : '4';

    if (!pitch) return normalized;

    // Enharmonic standardization intentionally removed: input layer handles preferred spelling.
    return pitch + octave;
};

const getRelativeNoteName = (note, anyTonic) => {
    if (!note || typeof note !== 'string') return '';
    const noteWithoutOctave = note.replace(/[0-9]/g, '');
    let noteOctave = note.match(/[0-9]+/) ? parseInt(note.match(/[0-9]+/)[0]) : null;
    const preferredTonic = standardizeTonic(anyTonic).replace(/[0-9]/g, '');
    const replacements = replacementsMap[preferredTonic] || {};

    let replacedNote = replacements[noteWithoutOctave] || noteWithoutOctave;

    const isSharpKey = preferredTonic.includes('♯');
    const isFlatKey = preferredTonic.includes('♭');

    if (isSharpKey && noteWithoutOctave === 'C') {
        replacedNote = 'B♯';
        if (noteOctave !== null) {
            noteOctave -= 1;
        }
    }

    if (isFlatKey && noteWithoutOctave === 'B') {
        replacedNote = 'C♭';
        if (noteOctave !== null) {
            noteOctave += 1;
        }
    }

    return (replacedNote + (noteOctave !== null ? noteOctave.toString() : ''))
        .replace(/([A-G])#/g, '$1♯')
        .replace(/([A-G])b/g, '$1♭');
};

export { replacementsMap, standardizeTonic, getRelativeNoteName };
