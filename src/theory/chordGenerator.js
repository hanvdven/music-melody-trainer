// theory/chordGenerator.js
// Moved from utils/chordGenerator.js

import generateAllNotesArray from './allNotesArray.js';
import generateDisplayScale from './generateDisplayScale.js';
import { getChordInfo } from './chordRecognition.js';
import Chord from '../model/Chord.js';
import { PREDETERMINED_STRATEGIES } from './progressionDefinitions.js';
import { getNoteIndex, generateHeptaScaleNotes } from './musicUtils.js';
import { getNoteSemitone } from './noteUtils.js';

const ALL_NOTES = generateAllNotesArray();

// Semitone-from-root interval pairs used by the chord modulator for non-hepta scales.
// Root [0], perfect fifth [7], and octave [12] are unpaired — they never change.
// Each pair contains the two "same harmonic function" alternatives (e.g. m3 ↔ M3).
const CHORD_INTERVAL_PAIRS = [
    [1,  2 ],  // ♭2  / M2
    [3,  4 ],  // m3  / M3
    [5,  6 ],  // P4  / ♯4 (tritone)
    [8,  9 ],  // ♭6  / M6
    [10, 11],  // m7  / M7
];

// Chord structure rules (degrees counted within a heptatonic scale, zero-based)
const CHORD_STRUCTURES = {
    triad: [0, 2, 4],
    seventh: [0, 2, 4, 6],
    sixth: [0, 2, 4, 5],
    add6: [0, 2, 4, 5],
    sus2: [0, 1, 4],
    sus4: [0, 3, 4],
    ninth: [0, 2, 4, 6, 1],
    eleventh: [0, 2, 4, 6, 1, 3],
    thirteenth: [0, 2, 4, 6, 1, 3, 5],
    power: [0, 4],
    root: [0],
    exotic: null, // sentinel — structure is generated at runtime
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const FUNCTION_CATEGORY = {
    I: 'Tonic',
    II: 'Pre-dominant',
    III: 'Modal / Color',
    IV: 'Pre-dominant',
    V: 'Dominant',
    VI: 'Ambiguous',
    VII: 'Dominant',
};

const stripOctave = (note) => {
    const m = String(note).match(/([^0-9]+)(\d+)/);
    return m ? m[1] : note;
};

// Build 7-note hepta scale from tonic note + interval array — delegates to musicUtils
const buildNotesFromIntervals = (tonicNote, intervals) => {
    const notes = generateHeptaScaleNotes(tonicNote, intervals);
    return notes.length === 7 ? notes : null;
};


/**
 * Generate an exotic chord structure: starts from a major triad base [0, 2, 4]
 * and adds 1–3 random extra scale-degree positions from the remaining pool.
 * This produces altered/extended chords like add9, sus2 6, 7♯5, etc.
 */
const generateExoticStructure = () => {
    const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const struct = [0, 4]; // 1) start with [0, 4] (root and 5th)

    // 2) add one element from [1, 2, 2, 2, 3] (extra 2's increase chance for a triad)
    struct.push(pickRandom([1, 2, 2, 2, 3]));

    // 3) add two elements from [null, 1, 2, 3, 5, 6, 6] (extra 6 for increased chance for 7th chord)
    const extPool = [null, 1, 2, 3, 5, 6, 6];
    struct.push(pickRandom(extPool));
    struct.push(pickRandom(extPool));

    // 4) remove nulls and duplicates, sort
    const unique = Array.from(new Set(struct.filter(x => x !== null)));
    unique.sort((a, b) => a - b);

    return unique;
};

/**
 * Build a chord from a heptatonic Scale instance for a given degree (1..7).
 *
 * @param {object}       scaleObj       - Scale instance with .notes and .displayNotes
 * @param {number}       degreeOneBased - Scale degree 1–7
 * @param {string}       chordType      - Key from CHORD_STRUCTURES, or 'sus' / 'exotic'
 * @param {number[]|null} customStructure - Override structure (scale-degree offsets). Used when
 *                                          regenerating a chord with a known structure.
 */
const generateChordOnDegree = (
    scaleObj,
    degreeOneBased,
    chordType = 'triad',
    customStructure = null,
    overrideQuality = null // 'dominant'
) => {
    let selectedType = chordType;
    if (chordType === 'sus') {
        selectedType = 'exotic';
    }

    let structure;
    if (customStructure) {
        structure = customStructure;
    } else if (selectedType === 'exotic') {
        structure = generateExoticStructure();
    } else {
        structure = CHORD_STRUCTURES[selectedType];
        if (!structure) throw new Error(`Unknown chord type: ${selectedType}`);
    }
    // Save original scale pitch classes before heptaRef override (used for chromatic modulation)
    const originalScaleNotes = scaleObj.notes || [];
    let usedHeptaRef = false;

    let rawScale = scaleObj.notes || [];
    let rawDisplay = scaleObj.displayNotes || rawScale;
    // For non-heptatonic scales (< 7 or > 7 notes), fall back to the heptaRefIntervals reference
    if (rawScale.length !== 7 && scaleObj.heptaRefIntervals?.length === 7) {
        // Use scaleObj.tonic as authoritative starting note — rawScale[0] may be below tonic
        // when rangeDown > 0 (e.g., rawScale[0] = G3 when tonic is C4)
        const tonic = scaleObj.tonic || rawScale[0]?.replace(/\d+$/, '');
        // Find the first occurrence of the tonic pitch class in rawScale to get a note with octave
        const tonicPC = tonic ? tonic.replace(/\d+$/, '') : null;
        const tonicNoteWithOctave = tonicPC
            ? (rawScale.find(n => n.replace(/\d+$/, '') === tonicPC) || `${tonicPC}4`)
            : rawScale[0];
        const built = tonicNoteWithOctave ? buildNotesFromIntervals(tonicNoteWithOctave, scaleObj.heptaRefIntervals) : null;
        if (built) {
            rawScale = built;
            const builtDisplay = tonic
                ? generateDisplayScale(tonic, scaleObj.heptaRefIntervals, 12)
                : built;
            rawDisplay = builtDisplay.length >= 7 ? builtDisplay : built;
            usedHeptaRef = true;
        }
    }
    if (!rawScale || rawScale.length < 7) throw new Error('Scale must be a heptatonic collection.');

    const degreeScale = [];
    const degreeDisplay = [];
    for (let i = 0; i < rawScale.length && degreeScale.length < 7; i++) {
        const n = rawScale[i];
        const pc = stripOctave(n);
        if (!degreeScale.map(stripOctave).includes(pc)) {
            degreeScale.push(n);
            degreeDisplay.push(rawDisplay[i] || n);
        }
    }
    if (degreeScale.length < 7) throw new Error('Scale must contain 7 unique degrees.');

    const scale = degreeScale;
    const display = degreeDisplay;

    const rootIndex = (((degreeOneBased - 1) % scale.length) + scale.length) % scale.length;
    const root = scale[rootIndex];
    const rootDisplay = stripOctave(display[rootIndex] || root);

    // For non-hepta scales: chord-relative interval modulator.
    // For each note in the chord, checks whether the paired alternative semitone
    // (e.g. m3↔M3, P4↔♯4, m7↔M7) exists in the original scale relative to the
    // chord root — and if so, picks randomly between the two.
    // Pairs never overlap, so no two chord notes can collide after modulation.
    const chordModulator = (() => {
        if (!usedHeptaRef) return null;
        const origPCs = new Set(originalScaleNotes.map(n => getNoteSemitone(n)));
        const rootPC = getNoteSemitone(root);
        return (semitoneFromRoot) => {
            const norm = ((semitoneFromRoot % 12) + 12) % 12;
            const pair = CHORD_INTERVAL_PAIRS.find(p => p.includes(norm));
            if (!pair) return norm; // root (0), P5 (7), octave — no alternative
            const partner = pair.find(i => i !== norm);
            if (origPCs.has((rootPC + partner) % 12)) {
                return Math.random() < 0.5 ? norm : partner;
            }
            return norm;
        };
    })();

    const isSus = String(selectedType).startsWith('sus');

    const chordNotes = structure.map((offset) => {
        const idx = (rootIndex + offset) % scale.length;
        let note = scale[idx];

        // Bump extensions to the next octave if they are 9, 11, or 13, and not a 'sus' chord base.
        // The structure offsets corresponding to extensions are >= 1 AND appear after the 5th (offset 4).
        // Since customStructure can be unordered, we check if offset === 1 (9th), 3 (11th), or 5 (13th)
        // Wait, offset 1 is 9th, 3 is 11th, 5 is 13th. 
        if (!isSus && [1, 3, 5].includes(offset) && structure.indexOf(offset) > structure.indexOf(4)) {
            const m = note.match(/([^0-9]+)(\d+)/);
            if (m) {
                note = `${m[1]}${parseInt(m[2]) + 1}`;
            }
        }

        // Apply dominant overrides:
        if (overrideQuality === 'dominant') {
            const rootIdx = getNoteIndex(root);
            const noteIdx = getNoteIndex(note);
            if (rootIdx !== -1 && noteIdx !== -1) {
                // Determine semitone distance relative to root. Normalize octave.
                const semiDist = ((noteIdx - rootIdx) % 12 + 12) % 12;

                // If it's the 3rd (offset 2) and it's a minor 3rd (3 semitones), raise it 1 semitone
                if (offset === 2 && semiDist === 3) {
                    note = ALL_NOTES[(noteIdx + 1) % ALL_NOTES.length];
                }
                // If it's the 7th (offset 6) and it's a major 7th (11 semitones), lower it 1 semitone
                else if (offset === 6 && semiDist === 11) {
                    note = ALL_NOTES[(noteIdx - 1 + ALL_NOTES.length) % ALL_NOTES.length];
                }
            }
        }

        // Chord-relative modulation for non-hepta scales (e.g. Chromatic, Diminished, Bebop):
        // for each interval from the chord root, randomly swap to its paired alternative
        // (e.g. M3↔m3, M7↔m7) when that alternative exists in the original scale.
        // Pairs [1,2] [3,4] [5,6] [8,9] [10,11] never overlap — no duplicate notes possible.
        if (chordModulator && offset !== 0 && !overrideQuality) {
            const rootIdx = getNoteIndex(root);
            const noteIdx = getNoteIndex(note);
            if (rootIdx !== -1 && noteIdx !== -1) {
                const semDist = ((noteIdx - rootIdx) % 12 + 12) % 12;
                const newSemi = chordModulator(semDist);
                if (newSemi !== semDist) {
                    const newIdx = noteIdx + (newSemi - semDist);
                    if (newIdx >= 0 && newIdx < ALL_NOTES.length) {
                        note = ALL_NOTES[newIdx];
                    }
                }
            }
        }

        return note;
    });

    const chordDisplayNotes = structure.map((offset, i) => {
        const idx = (rootIndex + offset) % display.length;
        let dNote = stripOctave(display[idx] || scale[idx]);

        // If the actual note was altered (dominant override or chromatic modulation), sync display.
        // Use stripOctave directly — sameLetterMap variants are already correctly spelled.
        const actualNote = chordNotes[i];
        const heptaNote  = scale[(rootIndex + offset) % scale.length];
        if (actualNote && getNoteSemitone(actualNote) !== getNoteSemitone(heptaNote)) {
            dNote = stripOctave(actualNote);
        }
        return dNote;
    });

    const intervals = chordNotes.map((n) => ((getNoteSemitone(n) - getNoteSemitone(root)) + 12) % 12);

    const romanBaseRaw = ROMAN[rootIndex] || '?';
    const scaleInfoStr = scaleObj ? `${scaleObj.tonic || ''} ${scaleObj.name || ''} (${scaleObj.family || ''})` : 'Unknown Scale';
    const chordInfo = getChordInfo(intervals, rootDisplay, romanBaseRaw, scaleInfoStr, structure);

    const quality = chordInfo.quality;
    const finalInternalSuffix = chordInfo.internalSuffix;
    let romanSuffix = chordInfo.romanSuffix || '';
    // Strip leading '−' from romanSuffix for minor chords: lowercase base already signals minor.
    // e.g. '−' → '' (minor triad → 'ii' not 'ii−'), '−7' → '7' (minor 7th → 'ii7' not 'ii−7').
    // Diminished chords keep their '°' — that is not covered by case alone.
    if (quality === 'minor' && romanSuffix.startsWith('−')) {
        romanSuffix = romanSuffix.slice(1);
    }

    const romanBaseDisplay =
        chordInfo.romanBaseDisplay ||
        (quality === 'minor' || quality === 'diminished' ? romanBaseRaw.toLowerCase() : romanBaseRaw);

    const roman = `${romanBaseDisplay}${romanSuffix}`;
    const category = FUNCTION_CATEGORY[romanBaseRaw] || 'Ambiguous';

    const chordInstance = new Chord(
        root,
        quality,
        chordNotes,
        roman,
        rootDisplay,  // key-spelled (e.g. G♭ in C Locrian, not F♯)
        finalInternalSuffix || '',
        roman,
        intervals,
        structure, // Store the scale-degree structure!
        {
            romanBaseRaw,
            romanBaseDisplay,
            romanSuffix,
            category,
            displayNotes: chordDisplayNotes
        }
    );

    return chordInstance;
};

/**
 * Convenience: generate a random exotic chord on the given scale degree.
 * Starts from a major triad + 1–3 random extensions; classified by buildExoticNotation.
 */
const generateExoticChord = (scaleObj, degreeOneBased) =>
    generateChordOnDegree(scaleObj, degreeOneBased, 'exotic');

const generateAllScaleChords = (scaleObj, chordType = 'triad') => {
    const out = [];
    for (let d = 1; d <= 7; d++) {
        out.push(generateChordOnDegree(scaleObj, d, chordType));
    }
    return out;
};

const generateRandomProgression = (
    scaleObj,
    length = 4,
    chordTypes = ['triad', 'seventh'],
    weighted = false
) => {
    return generateProgression(scaleObj, length, 'random');
};


const generateProgression = (
    scaleObj,
    length = 4,
    strategy = 'random',
    complexity = 'triad'
) => {
    if (strategy === 'tonic-tonic-tonic') {
        const progression = [];
        for (let i = 0; i < length; i++) {
            progression.push(generateChordOnDegree(scaleObj, 1, complexity));
        }
        return progression;
    }


    // Modal Random, random, inter-modal, extra-modal all use the same pool logic
    if (['modal-random', 'random', 'inter-modal-random', 'extra-modal-random'].includes(strategy)) {
        const pool = [];
        for (let d = 1; d <= 7; d++) {
            pool.push({ degree: d, type: complexity });
        }
        const progression = [];
        for (let i = 0; i < length; i++) {
            const p = pool[Math.floor(Math.random() * pool.length)];
            progression.push(generateChordOnDegree(scaleObj, p.degree, p.type));
        }
        return progression;
    }

    // Jazz Random: chain of random ii–V–I cadences targeting common jazz resolution points
    if (strategy === 'jazz-random') {
        // Typical resolution targets in jazz: I, ii, IV, vi
        const targets = [1, 2, 4, 6];
        const progression = [];
        for (let i = 0; i < length; ) {
            const target = targets[Math.floor(Math.random() * targets.length)];
            // ii of target = target % 7 + 1 (diatonic, 1-indexed)
            // V of target = (target + 3) % 7 + 1 (a perfect 5th below target)
            const iiDeg = target % 7 + 1;
            const vDeg  = (target + 3) % 7 + 1;
            if (i < length) { progression.push(generateChordOnDegree(scaleObj, iiDeg, complexity)); i++; }
            if (i < length) { progression.push(generateChordOnDegree(scaleObj, vDeg, complexity, null, 'dominant')); i++; }
            if (i < length) { progression.push(generateChordOnDegree(scaleObj, target, complexity)); i++; }
        }
        return progression;
    }

    // Specific Progressions — derived from progressionDefinitions (single source of truth)
    const specificProgressions = Object.fromEntries(
        PREDETERMINED_STRATEGIES.map((s) => [s.key, s.degrees])
    );

    if (specificProgressions[strategy]) {
        const sequence = specificProgressions[strategy];
        const progression = [];
        // End-anchor: always end on the last element of the sequence.
        // startOffset = seqLen - (length % seqLen), so the last chord picked is always sequence[seqLen-1].
        const seqLen = sequence.length;
        const startOffset = (seqLen - (length % seqLen)) % seqLen;
        for (let i = 0; i < length; i++) {
            const pidx = (startOffset + i) % seqLen;
            const el = sequence[pidx];
            let deg = el;
            let oQuality = null;

            if (typeof el === 'string' && el.endsWith('d')) {
                deg = parseInt(el.replace('d', ''), 10);
                oQuality = 'dominant';
            }

            progression.push(generateChordOnDegree(scaleObj, deg, complexity, null, oQuality));
        }
        return progression;
    }

    // Fallback
    return generateProgression(scaleObj, length, 'modal-random', complexity);
};

// Interval patterns (semitones from root) for chromatic passing chord types.
// These are used when the passing chord root falls outside the diatonic scale.
const PASSING_CHORD_INTERVALS = {
    'dominant7':   [0, 4, 7, 10],  // major triad + minor 7th
    'diminished7': [0, 3, 6, 9],   // fully-diminished 7th
    'diminished':  [0, 3, 6],      // diminished triad
    'suspended4':  [0, 5, 7],      // root + perfect 4th + perfect 5th (no 3rd)
    'minor7':      [0, 3, 7, 10],  // minor 7th (for ii/x in secondary ii-V chains)
    'major':       [0, 4, 7],      // plain major triad (for VI/x in secondary ii-V chains)
};

/**
 * Build a chord from a root note (with octave) and a semitone-interval array.
 * Used for chromatic passing chord types whose root is outside the diatonic scale.
 *
 * @param {string} rootNote  - Note with octave, e.g. "A4"
 * @param {number[]} intervals - Semitone offsets from root, e.g. [0, 4, 7, 10]
 * @param {string} quality   - Chord quality string, e.g. "dominant", "diminished"
 * @param {string} suffix    - Display suffix, e.g. "7", "°7"
 * @param {object} [romanMeta] - Optional Roman numeral fields to include in meta.
 *                               Should contain: romanBaseRaw, romanSuffix.
 *                               romanBaseDisplay is derived by the renderer from quality,
 *                               so it does NOT need to be included here.
 * @returns {Chord}
 */
const buildChordFromIntervals = (rootNote, intervals, quality, suffix, romanMeta = {}) => {
    const rootIdx = getNoteIndex(rootNote);
    if (rootIdx === -1) return null;
    const notes = intervals.map(i => ALL_NOTES[rootIdx + i]).filter(Boolean);
    if (notes.length < 2) return null;
    const rootDisplay = rootNote.replace(/-?\d+$/, '');
    return new Chord(
        rootNote,
        quality,
        notes,
        `${rootDisplay}${suffix}`,
        rootDisplay,
        suffix,
        romanMeta.romanBaseRaw || '?',  // used as .roman for backwards compat
        intervals,
        [],
        { isPassing: true, ...romanMeta }
    );
};

/**
 * Find a note in ALL_NOTES with the given pitch class closest to the reference note's octave.
 *
 * @param {number} targetPC  - Target pitch class 0–11
 * @param {string} refNote   - Reference note with octave (to pick nearest octave)
 * @returns {string|null} Note with octave, or null if not found
 */
const findNoteNearRef = (targetPC, refNote) => {
    const refIdx = getNoteIndex(refNote);
    if (refIdx === -1) return null;
    // Search within ±12 semitones from refIdx for the target pitch class
    for (let delta = 0; delta <= 12; delta++) {
        for (const sign of [1, -1]) {
            const idx = refIdx + delta * sign;
            if (idx >= 0 && idx < ALL_NOTES.length) {
                if (getNoteSemitone(ALL_NOTES[idx]) === targetPC) return ALL_NOTES[idx];
            }
        }
    }
    return null;
};

/**
 * Compute the Roman numeral meta for a chromatic passing chord.
 *
 * The slash notation (V7/vi, vii°7/ii, ♭II7/vi) shows which chord this passing chord
 * is targeting. When the target is the tonic (I), the slash is omitted (just V7, vii°7,
 * ♭II7) because tonic-target is the primary function — no secondary label needed.
 *
 * @param {string} type        - Passing chord type
 * @param {Chord}  nextChord   - The structural chord being approached
 * @returns {{ romanBaseRaw: string, romanSuffix: string }}
 */
const computePassingRomanMeta = (type, nextChord) => {
    // Target's Roman base (e.g. 'VI', 'II', 'I'). Upper-case from meta.
    const targetBase = nextChord.romanBaseRaw || '';
    // Slash part: omit for tonic target (I) — V7/I would be V7, the primary dominant.
    // Use lowercase for the slash label (standard convention: V7/vi, not V7/VI).
    const slashPart = (targetBase === 'I' || targetBase === '' )
        ? ''
        : `/${targetBase.toLowerCase()}`;

    if (type === 'secondary-dominant') {
        // V7/x — dominant quality, uppercase base
        return { romanBaseRaw: 'V', romanSuffix: `7${slashPart}` };
    }
    if (type === 'secondary-dim') {
        // vii°7/x — diminished quality; renderer lowercases because quality=diminished
        return { romanBaseRaw: 'VII', romanSuffix: `°7${slashPart}` };
    }
    if (type === 'tritone-sub') {
        // ♭II7/x — a semitone above target; dominant quality, uppercase base
        return { romanBaseRaw: '♭II', romanSuffix: `7${slashPart}` };
    }
    if (type === 'sus4') {
        // Xsus4 — same Roman base as target (same root), suffix 'sus4'
        const targetBaseDisplay = nextChord.romanBaseRaw || 'I';
        return { romanBaseRaw: targetBaseDisplay, romanSuffix: 'sus4' };
    }
    // iiv-secondary types: callers pass their own romanMeta
    return { romanBaseRaw: '?', romanSuffix: '' };
};

/**
 * Generate a passing chord that leads into `nextChord` using a specific approach type.
 *
 * Supported types:
 *   'secondary-dominant' — V7/x (perfect fifth above target)
 *   'secondary-dim'      — vii°7/x (half step below target, leading tone)
 *   'tritone-sub'        — ♭II7/x (half step above target, tritone sub of V7/x)
 *   'diatonic'           — adjacent diatonic degree above or below target
 *   'sus4'               — Xsus4 (same root as target, 4th instead of 3rd)
 *
 * @param {object} scaleObj   - Scale instance (used for diatonic and sus4 types)
 * @param {Chord}  nextChord  - The structural chord this passing chord leads into
 * @param {string} type       - See above
 * @param {string} complexity - Chord complexity key (e.g. 'triad', 'seventh')
 * @returns {Chord|null} A Chord with meta.isPassing = true, or null on failure
 */
const generatePassingChord = (scaleObj, nextChord, type, complexity = 'triad') => {
    const nextRootPC = getNoteSemitone(nextChord.root);
    // Reference octave: use next chord's root to stay in a sensible register
    const refNote = nextChord.root;

    if (type === 'diatonic') {
        // Find which scale degree nextChord's root belongs to (0-based index in scale.notes)
        const scaleNotes = scaleObj.notes || [];
        const degreeIdx = scaleNotes.findIndex(n => getNoteSemitone(n) === nextRootPC);
        if (degreeIdx === -1) return null;
        // Pick adjacent degree above or below (50/50), wrapping around 7 degrees
        const adjacentDegree = Math.random() < 0.5
            ? ((degreeIdx - 1 + 7) % 7) + 1   // degree below (1-based)
            : ((degreeIdx + 1) % 7) + 1;        // degree above (1-based)
        try {
            const chord = generateChordOnDegree(scaleObj, adjacentDegree, complexity);
            // Mark as passing — clone meta to avoid mutating the original
            chord.meta = { ...chord.meta, isPassing: true };
            return chord;
        } catch {
            return null;
        }
    }

    if (type === 'sus4') {
        // Suspended 4th on the target's own root — hover then resolve.
        // Uses target root (same PC), so always diatonic in feel even though the 4th
        // replaces the 3rd. Simple triad-equivalent resolution Xsus4 → X.
        const rootNote = findNoteNearRef(nextRootPC, refNote);
        if (!rootNote) return null;
        return buildChordFromIntervals(
            rootNote,
            PASSING_CHORD_INTERVALS['suspended4'],
            'suspended',
            'sus4',
            computePassingRomanMeta('sus4', nextChord)
        );
    }

    if (type === 'iiv-ii') {
        // ii of the target's secondary key: root a major 2nd above target.
        // Part of the secondary ii-V chain (ii/x → V7/x → x).
        // Quality: minor (parallel major context — minor ii chord).
        const targetBase = nextChord.romanBaseRaw || '';
        const slashPart = (targetBase === 'I' || targetBase === '') ? '' : `/${targetBase.toLowerCase()}`;
        const rootNote = findNoteNearRef((nextRootPC + 2) % 12, refNote);
        if (!rootNote) return null;
        return buildChordFromIntervals(
            rootNote,
            PASSING_CHORD_INTERVALS['minor7'],
            'minor',
            'm7',
            { romanBaseRaw: 'II', romanSuffix: `m7${slashPart}` }
        );
    }

    if (type === 'iiv-VI') {
        // VI of the target's secondary key: root a major 6th above target.
        // Extends the secondary ii-V chain: VI/x → ii/x → V7/x → x.
        // Quality: major (borrowed from parallel major).
        const targetBase = nextChord.romanBaseRaw || '';
        const slashPart = (targetBase === 'I' || targetBase === '') ? '' : `/${targetBase.toLowerCase()}`;
        const rootNote = findNoteNearRef((nextRootPC + 9) % 12, refNote);
        if (!rootNote) return null;
        return buildChordFromIntervals(
            rootNote,
            PASSING_CHORD_INTERVALS['major'],
            'major',
            '',
            { romanBaseRaw: 'VI', romanSuffix: slashPart ? slashPart : '' }
        );
    }

    // Chromatic types: determine root pitch class, build from interval pattern
    let rootPC;
    let intervals;
    let quality;
    let suffix;

    if (type === 'secondary-dominant') {
        // V7 of next: a perfect fifth above next chord's root
        rootPC = (nextRootPC + 7) % 12;
        intervals = PASSING_CHORD_INTERVALS['dominant7'];
        quality = 'dominant';
        suffix = '7';
    } else if (type === 'secondary-dim') {
        // vii°7 of next: a half step below next chord's root (leading tone)
        rootPC = (nextRootPC - 1 + 12) % 12;
        intervals = PASSING_CHORD_INTERVALS['diminished7'];
        quality = 'diminished';
        suffix = '°7';
    } else if (type === 'tritone-sub') {
        // Tritone sub of secondary dominant: a half step above next chord's root
        rootPC = (nextRootPC + 1) % 12;
        intervals = PASSING_CHORD_INTERVALS['dominant7'];
        quality = 'dominant';
        suffix = '7';
    } else {
        return null;
    }

    const rootNote = findNoteNearRef(rootPC, refNote);
    if (!rootNote) return null;
    return buildChordFromIntervals(
        rootNote, intervals, quality, suffix,
        computePassingRomanMeta(type, nextChord)
    );
};

export {
    CHORD_STRUCTURES,
    generateChordOnDegree,
    generateExoticChord,
    generateAllScaleChords,
    generateRandomProgression,
    generateProgression,
    generatePassingChord,
};
