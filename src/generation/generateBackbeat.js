/**
 * generateBackbeat.js
 *
 * Generates percussion patterns driven by the ranked-array DNA pipeline
 * (generateRankedRhythm). The existing DNA naturally encodes beat hierarchy:
 *
 *   beatClass = Math.floor(rank / numMeasures)
 *
 * Two pattern modes, both variable and DNA-driven:
 *
 *   BACKBEAT  — hh+k on downbeats, hh+s on backbeats, hh fill
 *   SWING     — cr/hp/k/s with jazz ride-pattern prefill
 *
 * DNA encodes beat hierarchy. RankedArray shuffles the DNA, proximity search 
 * places primary k/s, and applyVariability adds note-level mutations.
 */

import Melody from '../model/Melody.js';
import { generateRankedRhythm } from './generateRankedRhythm.js';
import { findBestSlot } from './proximityUtils.js';

// ─── Beat-count helpers ─────────────────────────────────────────────────────

/** Tick duration of one slot at the given resolution. 48 ticks = whole note. */
const slotTicks = ([, bottom], smallestNoteDenom) =>
    48 / Math.max(bottom, smallestNoteDenom);

// ─── Note-level variability mutations ────────────────────────────────────────

const RANDOM_POOL = ['k', 's', 'sg', 'hh', 'ho', 'r'];

const applyVariability = (notes, v) => {
    if (v <= 0) return notes;

    return notes.map(slot => {
        if (slot === 'r') return 'r';

        // Full randomisation at extreme variability
        if (v >= 0.95 && Math.random() < (v - 0.95) * 20) {
            return RANDOM_POOL[Math.floor(Math.random() * RANDOM_POOL.length)];
        }

        if (Array.isArray(slot)) {
            let result = [...slot];
            const hasBeat = result.includes('k') || result.includes('s');

            if (result.includes('hh') && Math.random() < v * 0.45)
                result = result.map(n => (n === 'hh' ? 'ho' : n));

            if (hasBeat && result.includes('hh') && !result.includes('sg') && Math.random() < v * 0.25)
                result.push('sg');

            if (!hasBeat && Math.random() < v * 0.30)
                result.push(Math.random() < 0.5 ? 'k' : 'sg');

            return result.length === 1 ? result[0] : result;
        }

        if (typeof slot === 'string') {
            if (slot === 'hh') {
                if (Math.random() < v * 0.45) return 'ho';
                if (Math.random() < v * 0.55) return ['hh', 'sg'];
            }
            if ((slot === 'k' || slot === 's') && Math.random() < v * 0.20)
                return [slot, 'sg'];
        }

        return slot;
    });
};

const PERC_POOLS = {
    'kick_snare': ['k', 's', 'sg', 'hh', 'ho'],
    'claves': ['wh', 'wm', 'wl'],
    'all': ['k', 's', 'sg', 'sr', 'hh', 'ho', 'hp', 'th', 'tm', 'tl', 'cr', 'cc', 'wh', 'wm', 'wl', 'cb']
};

const SWING_PREFILL = ['cr', null, ['cr', 'hp'], 'cr'];

/**
 * General percussion hierarchy rules to clean overlapping notes.
 * Applied to ALL percussion melodies.
 */
function cleanPercussionChord(chord) {
    if (!Array.isArray(chord)) return chord;

    // Deduplicate
    let notes = [...new Set(chord)];

    // 1. Primary Hierarchy: s > sg > wh > wm > wl > cb
    if (notes.includes('s')) {
        notes = notes.filter(n => !['sg', 'wh', 'wm', 'wl', 'cb'].includes(n));
    } else if (notes.includes('sg')) {
        notes = notes.filter(n => !['wh', 'wm', 'wl', 'cb'].includes(n));
    } else if (notes.includes('wh')) {
        notes = notes.filter(n => !['wm', 'wl', 'cb'].includes(n));
    } else if (notes.includes('wm')) {
        notes = notes.filter(n => !['wl', 'cb'].includes(n));
    } else if (notes.includes('wl')) {
        notes = notes.filter(n => n !== 'cb');
    }

    // 2. Cymbal Hierarchy: cc > cr > hp > ho > hh (special coexist rules)
    const hasCC = notes.includes('cc');
    const hasCR = notes.includes('cr');

    if (hasCC) {
        // cc kills cr, ho, hh
        notes = notes.filter(n => !['cr', 'ho', 'hh'].includes(n));
    } else if (hasCR) {
        // cr kills ho, hh
        notes = notes.filter(n => !['ho', 'hh'].includes(n));
    }

    // ho kills hh
    if (notes.includes('ho') && notes.includes('hh')) {
        notes = notes.filter(n => n !== 'hh');
    }

    // 3. Tom Hierarchy: tl > tm > th
    const hasTL = notes.includes('tl');
    const hasTM = notes.includes('tm');
    const hasTH = notes.includes('th');

    if (hasTL) {
        if (hasTM) notes = notes.filter(n => n !== 'tm');
        if (hasTH) notes = notes.filter(n => n !== 'th');
    } else if (hasTM) {
        if (hasTH) notes = notes.filter(n => n !== 'th');
    }

    return notes.length === 1 ? notes[0] : notes;
}

// ─── Core ranked-array-driven percussion generator ──────────────────────────

function generatePercussionFromDNA(
    patternName, timeSignature, numMeasures, smallestNoteDenom,
    dnaVariability, noteVariability, notesPerMeasure = 4, notePool = 'all'
) {
    const v = Math.max(0, Math.min(100, noteVariability)) / 100;

    // Always fill every slot — density is fixed for percussion patterns
    const measureNoteResolution = Math.max(timeSignature[1], smallestNoteDenom);
    const slotsPerMeasure = (measureNoteResolution * timeSignature[0]) / timeSignature[1];

    // dnaVariability controls ranked-array shuffling (0 = deterministic, >0 = shuffled)
    const rankedArray = generateRankedRhythm(
        numMeasures,
        timeSignature,
        notesPerMeasure,
        smallestNoteDenom,
        dnaVariability,      // ← rhythm-level variability (shuffles ranks)
        false,
        'default',
    );

    let rawNotes = [];
    const totalNotesThreshold = notesPerMeasure * numMeasures;

    if (patternName !== 'backbeat' && patternName !== 'swing') {
        throw new Error(`[generatePercussionFromDNA] Unknown pattern: "${patternName}"`);
    }

    const pool = PERC_POOLS[notePool] || PERC_POOLS.all;

    for (let m = 0; m < numMeasures; m++) {
        const measureStart = m * slotsPerMeasure;
        const midPoint = Math.floor(slotsPerMeasure / 2);

        const window = { start: measureStart, end: measureStart + slotsPerMeasure - 1 };

        let bestK = -1;
        if (notesPerMeasure >= 1) {
            const resultK = findBestSlot(rankedArray, measureStart, window, totalNotesThreshold);
            bestK = resultK.index;
        }

        let bestS = -1;
        if (notesPerMeasure >= 2) {
            const targetS = measureStart + midPoint;
            const resultS = findBestSlot(rankedArray, targetS, window, totalNotesThreshold);
            bestS = resultS.index;
        }

        // Tie-break: if S stole K's spot, K wins the primary spot
        if (bestK === bestS && bestS !== -1) {
            bestS = -1;
        }

        // 2) Assign notes
        for (let i = 0; i < slotsPerMeasure; i++) {
            const globalIdx = measureStart + i;
            const rank = rankedArray[globalIdx];

            // Define base slot sound (HH for backbeat, Ride/Pedal sequence for Swing)
            let baseNotes = [];
            if (patternName === 'swing') {
                const prefill = SWING_PREFILL[i % SWING_PREFILL.length];
                if (prefill) {
                    if (Array.isArray(prefill)) baseNotes.push(...prefill);
                    else baseNotes.push(prefill);
                }
            } else {
                baseNotes.push('hh');
            }

            if (rank === null || rank >= totalNotesThreshold) {
                rawNotes[globalIdx] = baseNotes.length === 1 ? baseNotes[0] : (baseNotes.length === 0 ? 'r' : baseNotes);
                continue;
            }

            let slotNotes = [...baseNotes];

            if (i === bestK) {
                slotNotes.push('k');
            } else if (i === bestS) {
                slotNotes.push('s');
            } else if (notesPerMeasure > 2) {
                // Extra notes from pool if density > 2
                const randNote = pool[Math.floor(Math.random() * pool.length)];
                if (!slotNotes.includes(randNote) && randNote !== 'hh' && randNote !== 'cr') {
                    slotNotes.push(randNote);
                }
            }

            rawNotes[globalIdx] = slotNotes.length === 0 ? 'r' : (slotNotes.length === 1 ? slotNotes[0] : slotNotes);
        }
    }

    // Apply Variability (mutations like hh->ho, ghost snares)
    const mutatedNotes = v > 0 ? applyVariability(rawNotes, v) : rawNotes;

    // Apply General Percussion Hierarchy Cleaning to ALL notes
    const finalNotes = mutatedNotes.map(slot => cleanPercussionChord(slot));

    // Build Melody
    const tickDur = slotTicks(timeSignature, smallestNoteDenom);
    const durations = finalNotes.map(() => tickDur);
    const offsets = finalNotes.map((_, i) => i * tickDur);

    return new Melody(finalNotes, durations, offsets, finalNotes);
}

// ─── Public exports ─────────────────────────────────────────────────────────

/**
 * Generate a variable backbeat pattern (hh/k/s + fills).
 * Variability shuffles the DNA (proximity algorithm) AND mutates notes.
 */
export function generateBackbeat(
    timeSignature, numMeasures,
    smallestNoteDenom = 4, variability = 0,
    notesPerMeasure = 4,
    notePool = 'all'
) {
    return generatePercussionFromDNA('backbeat', timeSignature, numMeasures, smallestNoteDenom, variability, variability, notesPerMeasure, notePool);
}

/**
 * Generate a variable swing pattern (cr/hp/k/s + fills).
 */
export function generateSwing(
    timeSignature, numMeasures,
    smallestNoteDenom = 8, variability = 0,
    notesPerMeasure = 4,
    notePool = 'all'
) {
    return generatePercussionFromDNA('swing', timeSignature, numMeasures, smallestNoteDenom, variability, variability, notesPerMeasure, notePool);
}

/**
 * Registry of all available deterministic pattern names.
 */
export const GROOVE_PATTERNS = ['backbeat', 'swing'];


