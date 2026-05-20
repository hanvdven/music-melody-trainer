/**
 * Tuplet injection into the pre-ranking priority array.
 *
 * This step runs AFTER rhythmic variability is applied but BEFORE integer-rank
 * assignment. Tuplets therefore form part of the rhythmic skeleton that
 * note-selection rules (arp_var, arp_group, uniform, etc.) see — they are NOT
 * added as an afterthought on top of the generated melody.
 *
 * === ALGORITHM ===
 *
 * For each measure the beat-group structure is computed from the time-signature
 * numerator using decomposeNumeratorToBeatGroups (deterministic, no random order).
 * Beat-group sizes in slots:  groupSlotSize = beatCount × slotsPerBeat.
 *
 * SUPER-GROUP CANDIDATES (1, 2, or 3 consecutive beat-groups within one measure):
 *   single  → d = groupSlotSize
 *   pair    → d = groupSlotSize₀ + groupSlotSize₁
 *   triple  → d = groupSlotSize₀ + groupSlotSize₁ + groupSlotSize₂
 *   (quads and larger are not tried — too large for any standard tuplet.)
 *
 * SUB-GROUP CANDIDATES (one halving level applied to each super-group):
 *   For a super-group of d slots, also try d/2 if even:
 *     d=4  → sub d=2   (the most common case: triplet on two 16th-note slots)
 *     d=6  → sub d=3   (4:3 quadruplet on compound-meter sub-group)
 *     d=8  → sub d=4   (quintuplet/sextuplet on one beat at 16th resolution)
 *     d=12 → sub d=6
 *     d=16 → sub d=8
 *     d=24 → sub d=12
 *   Only ONE halving level ("hooguit 1x") to stay close to smallestNoteDenom.
 *   Sub-candidates are tried INDEPENDENTLY, not after a failed super-group roll.
 *
 * Duplicate (start, size) pairs (from overlapping candidate sets) are deduplicated.
 * Candidates are SHUFFLED so the selection is unbiased across sizes.
 *
 * MUTUAL EXCLUSION: once a set of slots is claimed by a winning tuplet, all
 * candidates that overlap with any claimed slot are skipped.
 *
 * DENSITY GUARD: a tuplet with n > notesPerMeasure would produce far more notes
 * than the rhythmic budget — skip it.
 *
 * WINNING TUPLET: the first successful dice roll among the valid tuplet defs for
 * that slot count wins (list is ordered by ascending weight so the most common
 * tuple types get priority within a single candidate).
 *
 * PRIORITY ASSIGNMENT: the winning tuplet receives the MINIMUM priority value
 * (= most important) among all non-null slots in the replaced range. The d-1
 * continuation slots are set to null so that Melody.fromFlattenedNotes extends
 * the first note's duration to cover the full range. MelodyGenerator's expansion
 * step then splits this into n sub-notes with float offsets/durations.
 *
 * === EXAMPLES (4/4, 16th-note resolution → groups [2,2] beats = [8,8] slots) ===
 *
 *   Ranked array (per measure): [(1 7 9 13)(4 10 6 14)||(2 8 11 15)(3 9 12 5 16)]
 *   (parentheses = one beat, || = measure bar)
 *
 *   SUPER d=8 (whole beat-group): tupletsForSlotCount(8) → {7:8, 9:8}
 *     e.g. 9:8 wins on first group → prio = min(1,7,9,13) = 1
 *     result: [(9:8 prio 1)(4 10 6 14)]
 *
 *   SUB d=4 (half of one beat-group): tupletsForSlotCount(4) → {5:4, 6:4, 7:4}
 *     e.g. 5:4 wins on first sub-half → prio = min(1,7,9,13) = 1
 *     result: [(5:4 prio 1)(4 10 6 14)]
 *
 *   SUB d=2 (quarter of one beat-group): tupletsForSlotCount(2) → {3:2}
 *     e.g. 3:2 wins on slots 0-1 → prio = min(1,7) = 1
 *     result: [(3:2 prio 1)(9 13)(4 10 6 14)]
 *
 * === EXAMPLES (6/8, 8th-note resolution → groups [3,3] beats = [3,3] slots) ===
 *
 *   SUB d=? (3 is odd, no halving) → only d=3 or d=6 (pair) candidates.
 *   tupletsForSlotCount(3) → {4:3, 5:3}: 4:3 wins → quadruplet on one group.
 *
 * @module injectTuplets
 */

import { decomposeNumeratorToBeatGroups } from './rhythmicPriorities.js';
import { tupletsForSlotCount, TRIPLET_WEIGHT } from '../constants/tuplets.js';
import logger from '../utils/logger';

/**
 * Inject tuplets into the pre-ranking priority array.
 *
 * @param {(number|null)[]} piecewiseSum   Flat float-priority array, length = slotsPerMeasure × numMeasures.
 * @param {number}  slotsPerMeasure
 * @param {number}  numMeasures
 * @param {number[]} timeSignature          [numerator, denominator]
 * @param {number}  smallestNoteDenom
 * @param {number}  tripletProb             0..1 base probability for a 3:2 triplet.
 * @param {boolean} tripletOnly             When true, only allow {3:2}; when false allow all TUPLET_DEFS.
 * @param {number}  notesPerMeasure         Density guard: skip any tuplet with n > this.
 * @returns {{ modified: (number|null)[], tupletGroups: TupletGroup[] }}
 *
 * @typedef {{ slotStart: number, slotCount: number, n: number, priority: number, measureIndex: number }} TupletGroup
 */
export const injectTuplets = (
    piecewiseSum,
    slotsPerMeasure,
    numMeasures,
    timeSignature,
    smallestNoteDenom,
    tripletProb,
    tripletOnly,
    notesPerMeasure,
) => {
    if (tripletProb <= 0) return { modified: piecewiseSum, tupletGroups: [] };

    const modified     = [...piecewiseSum];
    const tupletGroups = [];

    logger.debug('injectTuplets', 'start', {
        slotsPerMeasure, numMeasures, tripletProb: tripletProb.toFixed(3), tripletOnly,
        notesPerMeasure, totalSlots: piecewiseSum.length,
    });

    const [numerator, denominator] = timeSignature;
    const measureNoteResolution = Math.max(smallestNoteDenom, denominator);
    const slotsPerBeat           = measureNoteResolution / denominator;

    // Beat-group sizes in beats (deterministic decomposition — no random order).
    const groupStartsInBeats = decomposeNumeratorToBeatGroups(numerator);
    if (groupStartsInBeats.length === 0) return { modified, tupletGroups };

    const beatGroupSizesInBeats = groupStartsInBeats.map((s, i) =>
        i < groupStartsInBeats.length - 1
            ? groupStartsInBeats[i + 1] - s
            : numerator - s
    );
    const beatGroupSizes = beatGroupSizesInBeats.map(b => b * slotsPerBeat);

    for (let m = 0; m < numMeasures; m++) {
        const measureBase = m * slotsPerMeasure;

        // Compute slot ranges for each beat-group in this measure.
        const groupRanges = [];
        let off = 0;
        for (const size of beatGroupSizes) {
            groupRanges.push({ start: measureBase + off, size });
            off += size;
        }

        // Build candidate (start, size) set, deduplicating via Map.
        const seen       = new Map();
        const candidates = [];

        const addCandidate = (start, size) => {
            if (size < 2) return;
            const key = `${start}-${size}`;
            if (!seen.has(key)) {
                seen.set(key, true);
                candidates.push({ start, size });
            }
        };

        // Super-groups: 1, 2, 3 consecutive beat-groups (all within one measure).
        for (let count = 1; count <= Math.min(3, groupRanges.length); count++) {
            for (let i = 0; i <= groupRanges.length - count; i++) {
                const start     = groupRanges[i].start;
                const totalSize = groupRanges
                    .slice(i, i + count)
                    .reduce((s, g) => s + g.size, 0);

                addCandidate(start, totalSize);

                // One-level halving: generates sub-group candidates (d/2 each).
                // Examples: 8→4, 6→3, 12→6, 16→8, 24→12.
                // Only even sizes halve cleanly; odd sizes (e.g. 3) have no sub-candidate.
                if (totalSize % 2 === 0) {
                    const half = totalSize / 2;
                    addCandidate(start, half);
                    addCandidate(start + half, half);
                }
            }
        }

        logger.debug('injectTuplets', `m${m} candidates`, {
            count: candidates.length,
            list: candidates.map(c => `[${c.start},+${c.size}]`),
        });

        // Shuffle for unbiased candidate order.
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        // Claimed-slot set — mutual exclusion between winning tuplets.
        const claimed = new Set();

        for (const { start, size } of candidates) {
            // Skip if any slot in the range is already claimed.
            let overlaps = false;
            for (let s = start; s < start + size; s++) {
                if (claimed.has(s)) { overlaps = true; break; }
            }
            if (overlaps) continue;

            // Valid tuplet defs for this slot count.
            let defs = tupletsForSlotCount(size);
            if (tripletOnly) defs = defs.filter(t => t.n === 3 && t.d === 2);
            if (defs.length === 0) continue;

            // Collect non-null priorities in the range to compute min-priority and skip all-rest ranges.
            const slotVals = [];
            for (let s = start; s < start + size; s++) {
                if (modified[s] !== null) slotVals.push(modified[s]);
            }
            if (slotVals.length === 0) continue; // all-rest range — nothing to replace

            // Density guard: skip if the tuplet would produce more notes than the measure budget.
            defs = defs.filter(t => t.n <= notesPerMeasure);
            if (defs.length === 0) continue;

            // First successful dice roll wins (list already sorted by ascending weight).
            let winner = null;
            for (const def of defs) {
                const prob = Math.min(1, tripletProb * TRIPLET_WEIGHT / def.weight);
                if (Math.random() < prob) { winner = def; break; }
            }
            if (!winner) continue;

            // Half-full guard: the tuplet is always filled completely (n notes, no rests inside).
            // Only place it when the original slot density is high enough that n notes make sense.
            // Rule: slotVals.length (non-null original slots) must be > winner.n / 2.
            // A 7-tuplet placed over 2 active slots would be musically implausible → skip.
            if (slotVals.length <= winner.n / 2) {
                logger.debug('injectTuplets', `m${m} half-full skip`, {
                    slot: start, size, winner: `${winner.n}:${winner.d}`, activeSlots: slotVals.length,
                });
                continue;
            }

            // Apply: set start slot to min-priority, null out continuation slots.
            const minPriority = Math.min(...slotVals);
            modified[start] = minPriority;
            for (let s = start + 1; s < start + size; s++) modified[s] = null;

            logger.debug('injectTuplets', `m${m} placed ${winner.n}:${winner.d}`, {
                slot: start, size, priority: minPriority.toFixed(2), activeSlots: slotVals.length,
            });

            tupletGroups.push({
                slotStart:    start,
                slotCount:    size,
                n:            winner.n,
                priority:     minPriority,
                measureIndex: m,
            });

            for (let s = start; s < start + size; s++) claimed.add(s);
        }
    }

    logger.debug('injectTuplets', 'done', {
        placed: tupletGroups.length,
        groups: tupletGroups.map(g => `m${g.measureIndex} s${g.slotStart} ${g.n}:${g.slotCount}`),
    });

    return { modified, tupletGroups };
};
