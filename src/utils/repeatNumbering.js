// utils/repeatNumbering.js
//
// Pure helper for the sheet-music repeat-pass suffix (the "R" in "N . R" measure labels).
//
// BarlinesLayer renders each measure number as `N` on the first pass and `N . R` on pass R≥2, where
// R is how many times the current repeat BLOCK has been played so far. R is derived from how far the
// global measure index (startMeasureIndex) has advanced past the block's start (blockPlayStart),
// divided by the length of the looped unit (passSpan):
//
//     R = floor((startMeasureIndex - blockPlayStart) / passSpan) + 1
//
// WHY this is a separate pure function (Han 2026-06-17, Fix #3): the loaded-song REPEAT path
// (isRepeatMode) used to STRAND blockPlayStart — it never refreshed it the way the generated
// continuous path does in applyResultToSetters — so (startMeasureIndex - blockPlayStart) grew without
// bound and R overflowed past repsPerMelody at every re-arm (Han saw "11" instead of "1.5"). The fix
// refreshes blockPlayStart at each repeat-block re-arm (Sequencer._armPaginationSequence) using the
// SAME bookkeeping the generated path uses, so this formula then cycles R = 1..repsPerMelody per block
// for the FINITE repsPerMelody case Han reported. (As a pure formula, holding blockPlayStart fixed
// makes R grow monotonically — see the -1 test — but in the live planner repsPerMelody=-1 resolves to
// 1, so the block re-arms every pass and R pins at 1; true indefinite-growth is deferred, arch §40b.)
// Extracting the math here lets us unit-test the numbering against stable counters without rendering
// BarlinesLayer in jsdom.
//
// passSpan = the looped unit's measure count: bodyMeasures when the merged anacrusis body is on
// screen (the Sequencer advances globalMeasureIndex by bodyMeasures per pass), else numMeasures.

/**
 * @param {object} args
 * @param {number} args.startMeasureIndex  global index of the first rendered measure (advances per pass)
 * @param {number} args.blockPlayStart     global index at which the current repeat block started
 * @param {number} args.passSpan           measures in one looped unit (bodyMeasures or numMeasures)
 * @param {boolean} args.isPlaying         R is only meaningful during active playback; else always 1
 * @returns {number} 1-based repeat-pass number (≥ 1)
 */
export const computeRepeatPass = ({ startMeasureIndex, blockPlayStart, passSpan, isPlaying }) => {
    if (!isPlaying) return 1;
    if (!passSpan || passSpan <= 0) return 1;
    return Math.max(1, Math.floor(((startMeasureIndex ?? 0) - (blockPlayStart ?? 0)) / passSpan) + 1);
};
