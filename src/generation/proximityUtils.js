/**
 * proximityUtils.js
 * 
 * Shared logic for finding the "musically best" slot near a target time.
 * Used for both percussion (Kick/Snare placement) and melody (Root anticipation).
 */

/**
 * Finds the slot with the lowest (best) proximity score within a window.
 * 
 * Formula: Score = Rank + 2 * Math.abs(index - targetIndex)
 * 
 * @param {Array} rankedArray - The DNA array containing ranks (0 to N) and nulls.
 * @param {number} targetIndex - The mathematical "ideal" index (e.g. beat 1).
 * @param {Object} window - { start, end } Absolute indices to search within.
 * @param {number} threshold - The rank threshold (numMeasures * notesPerMeasure).
 * @returns {Object} { index: number, score: number } The winning slot. Returns {index: -1, score: Infinity} if none found.
 */
export function findBestSlot(rankedArray, targetIndex, { start, end }, threshold) {
    let bestIndex = -1;
    let minScore = Infinity;

    const actualStart = Math.max(0, start);
    const actualEnd = Math.min(rankedArray.length - 1, end);

    for (let i = actualStart; i <= actualEnd; i++) {
        const rank = rankedArray[i];
        if (rank === null || rank >= threshold) continue;

        // Proximity Formula
        const distance = Math.abs(i - targetIndex);
        const score = rank + 2 * distance;

        if (score < minScore) {
            minScore = score;
            bestIndex = i;
        }
    }

    return { index: bestIndex, score: minScore };
}
