/**
 * Canonical chromatic note names — one preferred spelling per semitone (C=0 … B=11).
 * Import this instead of redeclaring locally in every file.
 */
export const PC_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/**
 * Flat-leaning chromatic note names used by allNotesArray and range calculations.
 * Identical ordering to PC_NAMES but uses D♭ instead of C♯, etc.
 */
export const ALL_NOTES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/**
 * Normalizes ASCII accidentals to Unicode symbols, including double accidentals.
 * '##' → '𝄪', 'bb' → '𝄫', '#' → '♯', 'b' → '♭'
 * Must process doubles first to prevent partial replacement.
 */
export const normalizeNoteChars = (note) => {
    if (!note || typeof note !== 'string') return note;
    return note
        .replace(/##/g, '𝄪')
        .replace(/bb/g, '𝄫')
        .replace(/#/g, '♯')
        .replace(/b/g, '♭');
};

/**
 * Maps non-standard enharmonic spellings to the canonical form used by allNotesArray.
 * allNotesArray uses: D♭ E♭ F♯ A♭ B♭ for black keys (mixed flat/sharp, historical).
 */
export const CANONICAL_MAP = {
    'C♯': 'D♭',
    'D♯': 'E♭',
    'G♭': 'F♯',
    'G♯': 'A♭',
    'A♯': 'B♭',
    'E♯': 'F',
    'B♯': 'C',
    'C♭': 'B',
    'F♭': 'E',
};

/**
 * Converts a note name (with octave) to the canonical spelling used by allNotesArray.
 * e.g. 'C♯4' → 'D♭4', 'G♭4' → 'F♯4'
 */
export const getCanonicalNote = (note) => {
    const match = note.match(/^(.+?)(-?\d+)$/);
    if (!match) return note;
    const [, pitch, octave] = match;
    return (CANONICAL_MAP[pitch] || pitch) + octave;
};

/**
 * Bidirectional enharmonic equivalents for all common pitch-class pairs.
 * Used for tonic spelling selection and piano key labelling.
 */
export const ENHARMONIC_PAIRS = {
    'C♯': 'D♭', 'D♭': 'C♯',
    'D♯': 'E♭', 'E♭': 'D♯',
    'F♯': 'G♭', 'G♭': 'F♯',
    'G♯': 'A♭', 'A♭': 'G♯',
    'A♯': 'B♭', 'B♭': 'A♯',
    'B': 'C♭', 'C♭': 'B',
    'E': 'F♭', 'F♭': 'E',
    'C': 'B♯', 'B♯': 'C',
    'F': 'E♯', 'E♯': 'F'
};

/**
 * Tonic-specific enharmonic spelling table.
 * Maps canonical note names to the preferred display spelling for each tonic key.
 */
export const replacementsMap = {
    'B♯': {
        'D♭': 'C♯',
        'A♭': 'G♯',
        'E♭': 'D♯',
        'B♭': 'A♯',
        F: 'E♯',
        C: 'B♯',
        G: 'F𝄪',
        D: 'C𝄪',
        A: 'G𝄪',
        E: 'D𝄪',
        B: 'A𝄪',
        'F♯': 'E𝄪',
    },
    'E♯': {
        'D♭': 'C♯',
        'E♭': 'D♯',
        'B♭': 'A♯',
        F: 'E♯',
        C: 'B♯',
        G: 'F𝄪',
        D: 'C𝄪',
        A: 'G𝄪',
        E: 'D𝄪',
        B: 'A𝄪',
    },
    'A♯': {
        'D♭': 'C♯',
        'A♭': 'G♯',
        'E♭': 'D♯',
        'B♭': 'A♯',
        F: 'E♯',
        C: 'B♯',
        G: 'F𝄪',
        D: 'C𝄪',
        A: 'G𝄪',
        E: 'D𝄪',
    },
    'D♯': { 'D♭': 'C♯', 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯', F: 'E♯', C: 'B♯', G: 'F𝄪', D: 'C𝄪', A: 'G𝄪' },
    'G♯': { 'D♭': 'C♯', 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯', F: 'E♯', C: 'B♯', G: 'F𝄪', D: 'C𝄪' },
    'C♯': { 'D♭': 'C♯', 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯', F: 'E♯', C: 'B♯', 'G♭': 'F♯' },
    'F♯': { 'D♭': 'C♯', 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯', F: 'E♯', C: 'B♯', 'G♭': 'F♯' },
    B: { 'D♭': 'C♯', 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯', F: 'E♯', 'G♭': 'F♯' },
    E: { 'D♭': 'C♯', 'A♭': 'G♯', 'E♭': 'D♯', 'B♭': 'A♯', 'G♭': 'F♯' },
    A: { 'D♭': 'C♯', 'A♭': 'G♯', 'E♭': 'D♯', 'G♭': 'F♯' },
    D: { 'D♭': 'C♯', 'A♭': 'G♯', 'G♭': 'F♯' },
    G: { 'G♭': 'F♯' },
    C: { 'C♯': 'D♭', 'A♯': 'B♭' },
    F: { 'C♯': 'D♭', 'F♯': 'G♭' },
    'B♭': { 'C♯': 'D♭', 'F♯': 'G♭', B: 'C♭' },
    'E♭': { 'C♯': 'D♭', 'F♯': 'G♭', B: 'C♭', E: 'F♭' },
    'A♭': { 'C♯': 'D♭', 'F♯': 'G♭', B: 'C♭', E: 'F♭', A: 'B𝄫' },
    'D♭': { 'C♯': 'D♭', 'F♯': 'G♭', B: 'C♭', E: 'F♭', A: 'B𝄫', D: 'E𝄫' },
    'G♭': { 'C♯': 'D♭', 'F♯': 'G♭', B: 'C♭', E: 'F♭', A: 'B𝄫', D: 'E𝄫', G: 'A𝄫' },
    'C♭': { 'C♯': 'D♭', 'F♯': 'G♭', B: 'C♭', E: 'F♭', A: 'B𝄫', D: 'E𝄫', G: 'A𝄫', C: 'D𝄫' },
    'F♭': { 'C♯': 'D♭', 'F♯': 'G♭', B: 'C♭', E: 'F♭', A: 'B𝄫', D: 'E𝄫', G: 'A𝄫', C: 'D𝄫', F: 'G𝄫' },
};

/**
 * Collapses stacked Unicode accidentals produced by display-note generation.
 * Cancellations (♯♭, ♭♯) are removed; doubles (♯♯, ♭♭) are compressed to 𝄪/𝄫.
 * Operates on already-Unicode pitch strings (no octave), distinct from normalizeNoteChars
 * which handles ASCII input.
 */
export const collapseAccidentals = (pitch) =>
    pitch
        .replace('♯♭', '')
        .replace('♭♯', '')
        .replace('♯♯', '𝄪')
        .replace('♭♭', '𝄫');

/**
 * Converts a note name to its pitch class (0–11).
 * Handles all enharmonic spellings including double accidentals.
 */
export const getNoteSemitone = (note) => {
    if (!note) return 0;
    const pc = normalizeNoteChars(note.replace(/\d+$/, ''));
    const map = {
        'C': 0, 'B♯': 0, 'D𝄫': 0,
        'C♯': 1, 'D♭': 1,
        'D': 2, 'C𝄪': 2, 'E𝄫': 2,
        'D♯': 3, 'E♭': 3, 'F𝄫': 3,
        'E': 4, 'D𝄪': 4, 'F♭': 4,
        'F': 5, 'E♯': 5, 'G𝄫': 5,
        'F♯': 6, 'G♭': 6,
        'G': 7, 'F𝄪': 7, 'A𝄫': 7,
        'G♯': 8, 'A♭': 8,
        'A': 9, 'G𝄪': 9, 'B𝄫': 9,
        'A♯': 10, 'B♭': 10, 'C𝄫': 10,
        'B': 11, 'A𝄪': 11, 'C♭': 11
    };
    return map[pc] ?? 0;
};

// ── Solfège utilities ────────────────────────────────────────────────────

// Traditional do-re-mi: { base, acc } for each semitone from tonic.
// Chromatic notes use nearest diatonic syllable + ♯/♭ accidental.
const TRADITIONAL_SOLFEGE = [
    { base: 'do',  acc: ''  }, // 0
    { base: 'do',  acc: '♯' }, // 1
    { base: 're',  acc: ''  }, // 2
    { base: 'mi',  acc: '♭' }, // 3 — minor third
    { base: 'mi',  acc: ''  }, // 4
    { base: 'fa',  acc: ''  }, // 5
    { base: 'fa',  acc: '♯' }, // 6
    { base: 'sol', acc: ''  }, // 7
    { base: 'la',  acc: '♭' }, // 8
    { base: 'la',  acc: ''  }, // 9
    { base: 'si',  acc: '♭' }, // 10
    { base: 'si',  acc: ''  }, // 11
];

// Kodály chromatic solfège — each semitone has a dedicated syllable.
const KODALY_SOLFEGE = [
    'Do', 'Di', 'Re', 'Me', 'Mi', 'Fa', 'Fi', 'Sol', 'Le', 'La', 'Te', 'Ti',
];

export const getTraditionalSolfege = (note, tonic) => {
    const interval = ((getNoteSemitone(note) - getNoteSemitone(tonic)) + 12) % 12;
    return TRADITIONAL_SOLFEGE[interval] || { base: '?', acc: '' };
};

export const getKodalySolfege = (note, tonic) => {
    const interval = ((getNoteSemitone(note) - getNoteSemitone(tonic)) + 12) % 12;
    return { base: KODALY_SOLFEGE[interval] || '?', acc: '' };
};
