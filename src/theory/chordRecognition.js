import { findChordDefinition, normalizeIntervals } from './chordDefinitions.js';
import { logChord } from '../utils/chordLog.js';

/**
 * Recognize a chord, including add9/add11/add13 and altered extensions.
 *
 * @param {number[]} intervals   - semitone intervals from root
 * @param {string}  root         - root note name (display)
 * @param {string}  romanBase    - roman numeral base string (e.g. "I", "ii")
 * @param {string}  [scaleInfo]  - human-readable scale description for logging
 * @param {number[]|null} [structure] - scale-degree offsets parallel to intervals
 */
const getChordInfo = (intervals, root, romanBase, scaleInfo = 'Unknown', structure = null) => {
    // --- Step 1: Exact match (structure-aware when available) ---
    let chord = findChordDefinition(intervals, structure);
    if (chord) {
        if (chord.notation === 'TBD') {
            logChord('TBD', { root, intervals, structure, romanBase, scaleInfo, notation: 'TBD' });
        }
        return formatRecognizedChord(chord, root, romanBase);
    }

    // --- Step 2: Separate core vs extensions ---
    const normalized = normalizeIntervals(intervals);

    // Core = intervals within one octave (0..11); extensions = intervals > 11
    const coreIntervals = normalized.filter(i => i <= 11);
    const extensions = normalized.filter(i => i > 11);

    // Derive a parallel core structure (degrees whose interval is ≤ 11)
    let coreStructure = null;
    if (structure) {
        const sorted = [...intervals].sort((a, b) => a - b);
        coreStructure = structure.filter((_, idx) => {
            // Keep degrees whose corresponding semitone value is ≤ 11 in normalised form
            const semi = (((intervals[idx] % 12) + 12) % 12);
            return semi <= 11;
        });
    }

    // --- Step 3: Attempt to find core chord ---
    const coreChord = findChordDefinition(coreIntervals, coreStructure);
    let result;
    if (coreChord) {
        if (coreChord.notation === 'TBD') {
            logChord('TBD', { root, intervals, structure, romanBase, scaleInfo, notation: 'TBD' });
        }
        result = formatRecognizedChord(coreChord, root, romanBase);
    } else if (structure) {
        // Structure available but no definition found — build from first principles
        result = buildExoticNotation(structure, intervals, root, romanBase);
    } else {
        // No structure, no core match — log as unrecognized
        result = formatUnrecognizedChord(root, intervals, romanBase, scaleInfo);
    }

    // --- Step 4: Append add/altered suffixes for extended tones ---
    if (extensions.length > 0) {
        const addSuffixes = extensions.map(i => mapIntervalToAddOrAlter(i));
        result.notation += addSuffixes.join('');
        result.romanSuffix += addSuffixes.join('');
    }

    return result;
};

/**
 * Map interval above octave to addX or b#/X notation.
 */
const mapIntervalToAddOrAlter = (interval) => {
    const intervalMod = interval % 12;
    switch (intervalMod) {
        case 1: return '♭9';
        case 2: return 'add9';
        case 3: return '♯9';
        case 5: return 'add11';
        case 6: return '♯11';
        case 8: return 'add13';
        case 9: return '♭13';
        case 10: return '♯13';
        default: return '';
    }
};

/**
 * Build chord notation from first principles using structure + intervals.
 *
 * Disambiguation rules (user-specified):
 *   - has degree 1 (2nd) AND has degree 2 (3rd) → add9   (9th when third present)
 *   - has degree 1 (2nd) AND no degree 2 (3rd)  → sus2
 *   - has degree 3 (4th) AND has degree 2 (3rd) → add11  (11th when third present)
 *   - has degree 3 (4th) AND no degree 2 (3rd)  → sus4
 *   - has degree 5 (6th) AND has degree 6 (7th) → add13  (13th when seventh present)
 *   - has degree 5 (6th) AND no degree 6 (7th)  → 6th chord
 *
 * @param {number[]} structure  - scale-degree offsets (0-6)
 * @param {number[]} intervals  - parallel semitone intervals from root
 * @param {string}  root        - root note display name
 * @param {string}  romanBase   - roman numeral base
 */
const buildExoticNotation = (structure, intervals, root, romanBase) => {
    // Helper: is scale degree present?
    const has = (deg) => structure.includes(deg);

    // Helper: semitone value for a given scale degree (null if absent)
    const semi = (deg) => {
        const i = structure.indexOf(deg);
        return i !== -1 ? ((intervals[i] % 12) + 12) % 12 : null;
    };

    const hasThird = has(2);
    const hasSeventh = has(6);

    // ---- Base quality / suspension ----
    let quality = 'major';
    let base = '';
    let sus = '';

    if (!has(1) && !hasThird && !has(3)) {
        // Power chord / root only
        quality = 'major';
        base = '5';
    } else if (has(3) && !hasThird) {
        // 4th present, no 3rd → sus4
        quality = 'suspended';
        sus = 'sus4';
    } else if (has(1) && !hasThird) {
        // 2nd present, no 3rd → sus2
        quality = 'suspended';
        sus = 'sus2';
    } else if (hasThird) {
        const thirdSemitone = semi(2);
        switch (thirdSemitone) {
            case 3: quality = 'minor'; base = '−'; break;
            case 4: quality = 'major'; base = ''; break;
            case 2: quality = 'major'; base = '(𝄫3)'; break; // double-flat 3rd
            case 5: quality = 'major'; base = '(♯3)'; break; // sharp 3rd (very rare)
            default: quality = 'major'; base = ''; break;
        }
    }

    // ---- Fifth alteration ----
    let fifth = '';
    if (has(4)) {
        const fifthSemitone = semi(4);
        fifth = { 5: '(𝄫5)', 6: '(♭5)', 8: '(♯5)' }[fifthSemitone] ?? '';
        // Perfect 5th (7) is silent
    }

    // ---- Seventh ----
    let seventh = '';
    if (hasSeventh) {
        const seventhSemitone = semi(6);
        seventh = { 9: '°7', 10: '7', 11: 'maj7' }[seventhSemitone] ?? '';
    }

    // ---- 6th vs add13 (depends on seventh presence) ----
    let sixthOrThirteenth = '';
    if (has(5)) {
        const sixthSemitone = semi(5);
        if (hasSeventh) {
            // Seventh present → 6th reads as add13
            sixthOrThirteenth = { 9: 'add13', 8: '(♭13)' }[sixthSemitone] ?? '';
        } else {
            // No seventh → 6th chord (unless it's an exotic flat/sharp which normally implies an add)
            sixthOrThirteenth = { 9: '6', 8: 'add♭13' }[sixthSemitone] ?? '';
        }
    }

    // ---- 2nd / add9 vs sus2 (already handled above for base; here we add annotation when 3rd present) ----
    let add9 = '';
    if (has(1) && hasThird) {
        // Third is present → this 2nd is a 9th
        const nineSemitone = semi(1);
        add9 = { 1: 'add♭9', 2: 'add9', 3: 'add♯9' }[nineSemitone] ?? '';
    }

    // ---- 4th / add11 vs sus4 (already handled above for base; add annotation when 3rd present) ----
    let add11 = '';
    if (has(3) && hasThird) {
        // Third is present → this 4th is an 11th
        const elevenSemitone = semi(3);
        add11 = { 5: 'add11', 6: 'add♯11' }[elevenSemitone] ?? '';
    }

    // ---- Adjust Notation for High Extensions ----
    const hasExtensions = !!(add9 || add11 || (hasSeventh && sixthOrThirteenth));

    if (hasSeventh && hasExtensions) {
        // 1. Drop '7' and 'maj' from seventh (e.g., maj7 -> '', 7 -> '', °7 -> °)
        if (seventh === 'maj7' || seventh === '7') {
            seventh = '';
        } else if (seventh === '°7') {
            seventh = '°';
        }

        // 2. Remove 'add' from extensions and collect them
        let exts = [];
        if (add9) exts.push(add9.replace('add', ''));
        if (add11) exts.push(add11.replace('add', ''));
        if (hasSeventh && sixthOrThirteenth) exts.push(sixthOrThirteenth.replace('add', ''));

        // 3. Clear original extensions
        add9 = '';
        add11 = '';
        sixthOrThirteenth = '';

        // 4. Join with '/' separators (e.g., b9/11) and assign back to one variable for concat
        add9 = exts.join('/');
    }

    const notation = base + seventh + fifth + sixthOrThirteenth + add9 + add11 + sus || '?';
    const romanBaseDisplay = (quality === 'minor' || quality === 'diminished')
        ? romanBase.toLowerCase()
        : romanBase.toUpperCase();

    return {
        name: 'Exotic Chord',
        notation,
        quality,
        internalRoot: root,
        internalSuffix: notation,
        romanBaseDisplay,
        romanSuffix: notation,
        intervals,
        structure,
    };
};

/**
 * Format a recognized chord for internal representation.
 */
const formatRecognizedChord = (chord, root, romanBase) => {
    return {
        ...chord,
        internalRoot: root,
        internalSuffix: chord.notation,
        romanBaseDisplay: chord.romanNotation ? chord.romanNotation(romanBase) : romanBase,
        romanSuffix: chord.notation,
    };
};

/**
 * Fallback for unrecognized chord — logs to the persistent chord log.
 */
const formatUnrecognizedChord = (root, intervals, romanBase, scaleInfo = 'Unknown') => {
    logChord('unrecognized', { root, intervals, structure: null, romanBase, scaleInfo, notation: '^?' });

    return {
        name: 'Unrecognized Chord',
        notation: '^?',
        quality: 'unknown',
        internalRoot: root,
        internalSuffix: '^?',
        romanBaseDisplay: romanBase,
        romanSuffix: '^?',
        intervals,
        scaleInfo,
    };
};

export { getChordInfo, buildExoticNotation };
