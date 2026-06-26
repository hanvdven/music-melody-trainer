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
 * Removes a trailing octave number from a note name, returning the pitch-class name.
 * e.g. 'C4' → 'C', 'A♭-1' → 'A♭', 'F♯12' → 'F♯'. Non-strings (null/undefined/objects)
 * pass through unchanged so callers can use it defensively on possibly-null input.
 *
 * Why a single canonical helper (Han 2026-06-19): the identical `.replace(/-?\d+$/, '')`
 * was hand-copied in ~15 sites (App, Chord, chordGenerator, loadSong, overlays). One
 * source of truth for the octave-stripping regex prevents subtle drift (e.g. a copy
 * that forgets the optional leading sign for negative octaves like 'A-1').
 */
export function stripOctave(note) {
    if (typeof note !== 'string') return note;
    return note.replace(/-?\d+$/, '');
}

/**
 * Pitch-class display name: octave stripped AND ASCII accidentals normalised to
 * Unicode (♯/♭/𝄪/𝄫). One step past stripOctave (Han 2026-06-19, AC1 of #152):
 * stripOctave leaves '#'/'b' intact for identity keys, but any pitch class shown
 * to the user must carry Unicode accidentals (§5b). Use this for display, not
 * stripOctave, whenever the result is rendered.
 *
 * @param {string} note  e.g. 'F#4' → 'F♯', 'Bb3' → 'B♭', 'C4' → 'C'.
 * @returns {string} normalised pitch-class name (non-strings returned unchanged).
 */
export function pitchClassName(note) {
    if (typeof note !== 'string') return note;
    return normalizeNoteChars(stripOctave(note));
}

/**
 * Converts a note name to its pitch class (0–11).
 * Handles all enharmonic spellings including double accidentals.
 */
export const getNoteSemitone = (note) => {
    if (!note) return 0;
    // Strip optional sign + trailing digits (e.g. 'A-1' → 'A', 'C4' → 'C').
    const pc = normalizeNoteChars(stripOctave(note));
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

/**
 * Canonical note-name → MIDI parser (C4 = 60), the single source of truth for
 * name→number conversion. Pitch-class math is delegated to getNoteSemitone, so
 * this handles EVERY accidental spelling it does — single (♯/♭/#/b), double
 * (𝄪/𝄫/##/bb) and stacked — which the old per-site single-accidental regexes
 * (`[#b♯♭]?`) could not.
 *
 * Why one parser (Han 2026-06-19): four divergent name→MIDI parsers had drifted
 * (rangeUtils C4=60, convertRankedArrayToMelody's local copy C4=48 i.e. off-by-12,
 * each with its own accidental support and fallback). They are consolidated here
 * STRICTLY behavior-preservingly: each call site still applies its OWN octave base
 * (via the `base` offset) and its OWN fallback, so the produced number is unchanged.
 * The generation site's −12 base is INTENTIONAL and preserved — it is only ever used
 * for RELATIVE pitch math inside generation (every comparison subtracts two values
 * from this same parser, so the base cancels) and the base never escapes to an
 * external C4=60 MIDI or to playback (generation emits note-name strings, not numbers).
 *
 * @param {string} note  e.g. 'C4', 'F♯3', 'A♭-1', 'C𝄪4', 'D𝄫5'.
 * @param {object} [opts]
 * @param {number} [opts.fallback=null]  returned when the string can't be parsed.
 * @param {number} [opts.base=0]  added to the result; pass -12 to reproduce the
 *   generation pipeline's historical C4=48 base, or leave 0 for canonical C4=60.
 * @returns {number} MIDI-ish number, or the fallback.
 */
export const noteToMidi = (note, { fallback = null, base = 0 } = {}) => {
    if (!note || typeof note !== 'string') return fallback;
    // Octave digits live at the end (optional leading minus for sub-MIDI octaves
    // like 'A-1'). The pitch class is everything before them.
    const octMatch = note.match(/(-?\d+)$/);
    if (!octMatch) return fallback;
    const pc = stripOctave(note);
    // Reject non-note garbage so unparseable input hits the fallback exactly as the
    // old per-site regexes did. After normalising ASCII accidentals, a valid pitch
    // class is a letter A–G followed by any run of Unicode accidentals.
    if (!/^[A-G][♯♭𝄪𝄫]*$/u.test(normalizeNoteChars(pc))) return fallback;
    const oct = parseInt(octMatch[1], 10);
    return (oct + 1) * 12 + getNoteSemitone(pc) + base;
};

// Circle-of-fifths LETTER order — the order accidentals are added to a key signature.
const SHARP_LETTER_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_LETTER_ORDER  = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
const LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Respell a note so its enharmonic spelling matches a key signature with `numAccidentals`
 * (signed: positive = sharps, negative = flats). Returns the diatonic spelling of the note's
 * pitch class in that key, preserving sounding pitch (octave is re-derived so MIDI is unchanged).
 * A note whose pitch class is NOT diatonic to the key keeps its incoming spelling.
 *
 * Why this exists: transposing a melody for a transposing instrument shifts notes CHROMATICALLY
 * with a fixed (mostly-flat) spelling. Against a sharp written key signature that clash makes
 * every in-key note pick up a redundant inline accidental (e.g. A♭ instr. in C major writes
 * E major but spells G♯ as A♭). Respelling to the written key removes them (Han 2026-06-09).
 */
export const respellToKeySignature = (note, numAccidentals) => {
    if (!note || typeof note !== 'string' || !/^[A-G]/.test(note)) return note;
    const octMatch = note.match(/(-?\d+)$/);
    if (!octMatch) return note;                       // no octave → leave untouched
    const pc = getNoteSemitone(note);

    const k = Math.max(-7, Math.min(7, numAccidentals));
    const sharps = k > 0 ? SHARP_LETTER_ORDER.slice(0, k) : [];
    const flats  = k < 0 ? FLAT_LETTER_ORDER.slice(0, -k) : [];

    // Walk the seven letters; the one whose key-signature pitch class equals `pc` is the
    // diatonic spelling. (At most one letter per pitch class within a single key signature.)
    for (const L of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) {
        const accVal = sharps.includes(L) ? 1 : flats.includes(L) ? -1 : 0;
        if ((((LETTER_SEMITONE[L] + accVal) % 12) + 12) % 12 !== pc) continue;
        const accChar = accVal === 1 ? '♯' : accVal === -1 ? '♭' : '';
        // Keep the original octave digit. The app labels octave by the digit independently of
        // pitch class (getNoteValue = (digit+1)*12 + pc), and respelling preserves pitch class,
        // so the same digit preserves the sounding pitch AND places the head on the right line.
        return `${L}${accChar}${octMatch[1]}`;
    }
    return note;   // chromatic to the key → keep the incoming spelling
};

// Note-coloring color for a melodic notehead, for the modes that color NOTES
// (not keyboard keys). Returns a CSS color string, or null when the active mode
// doesn't color noteheads (caller falls back to the default text color). Shared
// so the sheet-music range overlay colors selected notes the same way the staff
// does (CLAUDE.md §6c). `chords` mode needs chord context the caller has, so it
// is handled at the call site, not here.
// 'chords'-mode colour for a single note against ONE chord: notes that belong to the chord get
// the chord ROOT's chromatone colour (mixed 30% toward the page so it stays legible); others null.
// Shared by the staff renderer, the range/colour setters and the keyboard so they all match
// (CLAUDE.md §6c/§6d). `activeChord` = { root, notes:[...] }.
/**
 * Builds the chromatone colour-mix CSS string for a given pitch class, mixed `pct`%
 * toward the page colour (white on dark themes, black on light) so the chromatone
 * hue stays legible against the staff/keyboard background.
 *
 * Why a single helper (Han 2026-06-19): the exact string
 * `color-mix(in srgb, var(--chromatone-${pc}), white|black ${pct}%)` was hand-written
 * byte-for-byte in 8 sites (noteUtils chord/subtle, renderMelodyNotes, SheetMusic,
 * RangeStaffOverlay, TranspositionSetter). All 8 used the identical
 * `theme === 'light' ? 'black' : 'white'` choice, so unifying is behaviour-preserving.
 * `pc` is the numeric pitch class (0–11) or a percussion CSS-var suffix already resolved
 * by the caller — callers pass the same value they previously interpolated.
 */
export function chromatoneMix(pc, pct, theme = 'dark') {
    const mix = theme === 'light' ? 'black' : 'white';
    return `color-mix(in srgb, var(--chromatone-${pc}), ${mix} ${pct}%)`;
}

export const chordNoteColor = (note, activeChord, theme = 'dark') => {
    if (!activeChord?.notes?.length) return null;
    const pc = getNoteSemitone(note);
    if (activeChord.notes.some(cn => getNoteSemitone(cn) === pc)) {
        return chromatoneMix(getNoteSemitone(activeChord.root), 30, theme);
    }
    return null;
};

export const melodicNoteColor = (note, { noteColoringMode, tonic, scaleNotes = [], theme = 'dark', activeChord = null } = {}) => {
    if (noteColoringMode === 'chromatone') return `var(--chromatone-${getNoteSemitone(note)})`;
    if (noteColoringMode === 'subtle-chroma') {
        return chromatoneMix(getNoteSemitone(note), 60, theme);
    }
    if (noteColoringMode === 'chords') return chordNoteColor(note, activeChord, theme);
    if (noteColoringMode === 'tonic_scale_keys') {
        const pc = getNoteSemitone(note);
        if (pc === getNoteSemitone(tonic)) return 'var(--note-tonic)';
        if (scaleNotes.some(s => getNoteSemitone(s) === pc)) return 'var(--note-scale)';
    }
    return null;
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

/**
 * Chromatic Roman numerals for all 12 semitones above the tonic.
 * Uses ♭/♯ prefix (Unicode) relative to the major scale degrees.
 * Semitone 6 = ♯IV (Lydian augmented 4th convention in modern theory).
 * Not exported: only consumed by getChromaticRomanDegree below (Han 2026-06-19).
 */
const CHROMATIC_ROMAN_DEGREES = [
    'I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV',
    'V', '♭VI', 'VI', '♭VII', 'VII',
];

/**
 * Returns the Roman numeral with Unicode ♭/♯ prefix for a given semitone
 * distance from the tonic (0 = tonic → 'I', 10 = minor 7th → '♭VII', etc.).
 */
export const getChromaticRomanDegree = (semitone) =>
    CHROMATIC_ROMAN_DEGREES[((semitone % 12) + 12) % 12] ?? '?';

export const getTraditionalSolfege = (note, tonic) => {
    const interval = ((getNoteSemitone(note) - getNoteSemitone(tonic)) + 12) % 12;
    return TRADITIONAL_SOLFEGE[interval] || { base: '?', acc: '' };
};

export const getKodalySolfege = (note, tonic) => {
    const interval = ((getNoteSemitone(note) - getNoteSemitone(tonic)) + 12) % 12;
    return { base: KODALY_SOLFEGE[interval] || '?', acc: '' };
};
