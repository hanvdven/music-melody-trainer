/**
 * Rhythmic solfège — TAKADIMI (Hoffman / Pelto / White, 1996).
 *
 * Beat hierarchy (three levels):
 *   Level 1 – Beat:        ta                        (always beat onset)
 *   Level 2 – Division:    ta  di      (simple ÷2)
 *                          ta  ki  da  (compound ÷3)
 *   Level 3 – Subdivision: ta  ka  di  mi             (simple ÷4)
 *                          ta  va  ki  di  da  ma     (compound ÷6)
 *
 * The beat = denominator note value of the time signature.
 * Exception: when the smallest percussion note is a 16th, the beat is forced
 * to a quarter note (simple) or dotted quarter (compound) at most.
 * No 32nd notes exist in this app, so subdivision never goes below 16th level.
 *
 * Irregular subdivisions (tuplets in simple meter use compound syllables):
 *   2: ta di   3: ta ki da   4: ta ka di mi   5: ta ka di mi ti
 *   6: ta va ki di da ma     7: ta va ki di da ma ti
 *   Larger: split near halfway (8 = 4+4, 11 = 6+5, …)
 */

import { TICKS_PER_WHOLE } from '../constants/timing.js';

// ── Meter helpers ──────────────────────────────────────────────────────────

/** True for compound meters: 6/8, 9/8, 12/8, 6/4, 9/4, 12/4, … */
export const isCompoundMeter = ([num]) => num % 3 === 0 && num > 3;

/** Basic beat duration (ticks), ignoring the "force quarter" constraint. */
export const getBeatDurationTicks = (timeSignature) => {
    const [, den] = timeSignature;
    const ticksPerUnit = TICKS_PER_WHOLE / den;
    return isCompoundMeter(timeSignature) ? ticksPerUnit * 3 : ticksPerUnit;
};

/**
 * Effective beat duration used for Takadimi annotation.
 *
 * Beat level is derived from the shortest note in the melody:
 *   shortest note = subdivision level → beat = 4 × shortest note
 *
 * Examples (simple meter):
 *   shortest = 16th (3 ticks)  → beat = 12 (quarter)
 *   shortest = 8th  (6 ticks)  → beat = 24 (half)
 *   shortest = quarter (12)    → beat = 48 (whole) capped to measure length
 *
 * Compound meter: always use the natural beat (dotted note value of denominator).
 *
 * @param {[number,number]} timeSignature
 * @param {number[]|null}   melodyDurations   — durations array from the melody (fallback)
 * @param {number|null}     smallestNoteDenom — explicit grid resolution (e.g. 16 for 16th notes);
 *                          when provided, beat is derived from this setting rather than from the
 *                          actual minimum note duration. More reliable: avoids wrong beat level
 *                          when the generated melody happens to contain no short notes.
 */
export function getEffectiveBeatDuration(timeSignature, melodyDurations, smallestNoteDenom = null) {
    const compound = isCompoundMeter(timeSignature);
    const naturalBeat = getBeatDurationTicks(timeSignature);

    // Compound meter: natural beat (dotted note) is always correct
    if (compound) return naturalBeat;

    const [num, den] = timeSignature;
    const measureLength = (TICKS_PER_WHOLE * num) / den;

    // Prefer the explicit grid resolution from percussion settings over deriving from durations.
    // e.g. smallestNoteDenom=16 → subdivision=3 ticks (TICKS_PER_WHOLE/16) → beat=12 (quarter note).
    // This avoids showing "ta ta ta ta" when all notes happen to be quarter notes in a 16th-grid piece.
    if (smallestNoteDenom != null && smallestNoteDenom > 0) {
        const subdivTicks = TICKS_PER_WHOLE / smallestNoteDenom;
        return Math.min(4 * subdivTicks, measureLength);
    }

    // Fallback: derive from the shortest actual note in the melody
    const minDur = (melodyDurations ?? []).reduce(
        (min, d) => (d != null && d > 0 ? Math.min(min, d) : min),
        Infinity
    );
    if (minDur === Infinity || minDur <= 0) return naturalBeat;

    // Beat = 4 × smallest note, capped to measure length
    return Math.min(4 * minDur, measureLength);
}

// ── TAKADIMI ───────────────────────────────────────────────────────────────

/**
 * Returns the Takadimi syllable for a note at `absoluteOffset` ticks,
 * given the effective beat duration and whether the meter is compound.
 *
 * Simple meter positions (beat = B):
 *   0       → ta   (beat)
 *   B/2     → di   (division)
 *   B/4     → ka   (subdivision)
 *   3B/4    → mi   (subdivision)
 *   B/3     → ki   (irregular: triplet in simple meter uses compound syllables)
 *   2B/3    → da   (irregular: triplet)
 *   B/5     → ka   (quintuplet — position 1/5, same as "ka" in ta ka di mi ti)
 *   2B/5    → di   (quintuplet 2/5)
 *   3B/5    → mi   (quintuplet 3/5)
 *   4B/5    → ti   (quintuplet 4/5)
 *
 * Compound meter positions (beat = B = 3×unit):
 *   0       → ta
 *   B/3     → ki   (division)
 *   2B/3    → da   (division)
 *   B/6     → va   (subdivision)
 *   B/2     → di   (subdivision — halfway = 3/6)
 *   5B/6    → ma   (subdivision)
 */
export function getTakadimiSyllable(absoluteOffset, beatDuration, compound) {
    const pos = absoluteOffset % beatDuration;
    if (pos === 0) return 'ta';

    if (compound) {
        // Division (÷3)
        if (pos * 3 === beatDuration)     return 'ki';
        if (pos * 3 === beatDuration * 2) return 'da';
        // Subdivision (÷6): positions va(1), di(3), ma(5) in sixths
        if (pos * 6 === beatDuration)     return 'va';
        if (pos * 2 === beatDuration)     return 'di';  // 3/6 = ½
        if (pos * 6 === beatDuration * 5) return 'ma';
        return '·';
    } else {
        // Division (÷2)
        if (pos * 2 === beatDuration)     return 'di';
        // Subdivision (÷4)
        if (pos * 4 === beatDuration)     return 'ka';
        if (pos * 4 === beatDuration * 3) return 'mi';
        // Irregular ÷3 (triplet in simple meter — use compound syllables by convention)
        if (pos * 3 === beatDuration)     return 'ki';
        if (pos * 3 === beatDuration * 2) return 'da';
        // Irregular ÷5 (quintuplet: ta ka di mi ti)
        if (pos * 5 === beatDuration)     return 'ka';
        if (pos * 5 === beatDuration * 2) return 'di';
        if (pos * 5 === beatDuration * 3) return 'mi';
        if (pos * 5 === beatDuration * 4) return 'ti';
        return '·';
    }
}

// ── Rest detection ─────────────────────────────────────────────────────────

/** True for rests: null, undefined, 'r', or empty array. Arrays and non-empty strings are notes. */
export function isRest(note) {
    if (note == null) return true;
    if (note === 'r') return true;
    if (Array.isArray(note) && note.length === 0) return true;
    return false;
}

