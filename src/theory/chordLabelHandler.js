import { TICKS_PER_WHOLE } from '../constants/timing.js';

/**
 * Utility to calculate greatest common divisor
 */
function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
        a %= b;
        [a, b] = [b, a];
    }
    return a;
}

function getMultipleGcd(numbers) {
    if (numbers.length === 0) return 0;
    let result = numbers[0];
    for (let i = 1; i < numbers.length; i++) {
        result = gcd(result, numbers[i]);
    }
    return result;
}

/**
 * Processes a chord progression to include repeat slashes (ALT+0203)
 * based on harmonic granularity. 
 * 
 * @param {Object} chordMelody - Melody object with .displayNotes and .offsets
 * @param {number} numMeasures - Total measures
 * @param {Array} timeSignature - [top, bottom]
 * @returns {Array} List of { chord, offset, isSlash }
 */
export function getChordsWithSlashes(chordMelody, numMeasures, timeSignature) {
    if (!chordMelody || !chordMelody.displayNotes) return [];

    const measureLength = (TICKS_PER_WHOLE * timeSignature[0]) / timeSignature[1];
    const totalDuration = measureLength * numMeasures;

    // 1. Group existing chords by measure
    const measureMap = Array.from({ length: numMeasures }, () => []);
    chordMelody.displayNotes.forEach((chord, idx) => {
        if (!chord) return;
        const offset = chordMelody.offsets[idx];
        const measureIdx = Math.floor(offset / measureLength);
        if (measureIdx >= 0 && measureIdx < numMeasures) {
            measureMap[measureIdx].push({
                chord,
                offset: offset % measureLength,
                absoluteOffset: offset
            });
        }
    });

    const result = [];

    // 2. Process each measure
    measureMap.forEach((measureChords, mIdx) => {
        if (measureChords.length === 0) {
            // Optional: If a whole measure is empty, should we put a big slash or nothing?
            // User examples suggest we only add slashes if there's granularity.
            // "c,x,x,x -> geen tekens nodig"
            // So empty measures stay empty until a chord appears.
            return;
        }

        const relativeOffsets = measureChords.map(c => c.offset);

        // Find GCD of all offsets in this measure and the measure length
        // We include 0 explicitly if there are chords later in the measure
        const grain = getMultipleGcd([...relativeOffsets, measureLength]);

        // If the grain is the whole measure (e.g. only one chord at start), no slashes needed.
        if (grain === measureLength) {
            result.push({
                ...measureChords[0],
                absoluteOffset: measureChords[0].absoluteOffset,
                isSlash: false
            });
            return;
        }

        // If grain is 0 (shouldn't happen with measureLength > 0), skip
        if (grain <= 0) return;

        // Generate slots based on granularity
        const numSlots = measureLength / grain;
        for (let i = 0; i < numSlots; i++) {
            const slotOffset = i * grain;
            const absoluteSlotOffset = mIdx * measureLength + slotOffset;

            // Is there a chord at this exact offset?
            const existing = measureChords.find(c => Math.abs(c.offset - slotOffset) < 0.1);

            if (existing) {
                result.push({
                    ...existing,
                    absoluteOffset: absoluteSlotOffset,
                    isSlash: false
                });
            } else {
                // Add a slash
                result.push({
                    chord: { label: '/', type: 'slash' },
                    absoluteOffset: absoluteSlotOffset,
                    isSlash: true
                });
            }
        }
    });

    return result;
}
