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
// for the FINITE repsPerMelody case Han reported.
//
// INDEFINITE repeats (repsPerMelody === -1, "repeat one indefinitely", Han 2026-06-18): R must instead
// GROW UNBOUNDED — maat 1 on pass 7 = "1.7", pass 1000 = "1.1000"; no cap, no reset. The formula
// already does this when blockPlayStart is held fixed; the live fix is in
// Sequencer._armPaginationSequence, which PINS blockPlayStart to the session's first body play-start
// (a stable origin captured on the first arm) and stops refreshing it for indefinite mode. The block
// still re-arms every pass to schedule more measures — only the numbering ORIGIN is frozen — so
// (startMeasureIndex - origin)/passSpan climbs without bound. Finite mode keeps refreshing (cycles).
// Extracting the math here lets us unit-test BOTH behaviours (cycle vs unbounded) against stable
// counters without rendering BarlinesLayer in jsdom.
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

// #1155 (Han 2026-08-24, "pas de labelconventie toe op alle call-response levels"): call-response needs
// the SAME "N" / "N . 2" convention as `computeRepeatPass` above, but the mechanism can't be reused
// as-is — `computeRepeatPass` computes ONE pass number per RENDER (correct for a repeat block that
// cycles as a whole over TIME, so every currently-visible measure genuinely shares one pass at any
// moment). Call-response is the opposite: the call measure(s) and response measure(s) are BOTH on
// screen SIMULTANEOUSLY (a scrolling/growing melody, not a time-based repeat), so each barline needs
// its OWN independent pass based on its own ordinal position, not one shared value.
//
// `barlineOrdinal` — the 0-based ordinal position of this barline among ALL 'm' markers rendered so far
// (BarlinesLayer's own `measureNumForLabel`/`barlineCount`) — i.e. "the Nth measure generated since the
// level started," NOT tied to combat/wave progress (deliberately independent of `levelWaveIndex` —
// content generation and combat wave-clearing run at different paces for call-response, §304's own
// `usesTrebleJitStream` fix already established this exact distinction for a different bug).
// `groupMeasures` — the call's own length (1 for letter d, 2 for letter e) — `lvl.callResponseMeasures`.
//
// Each call-response CYCLE spans `2 * groupMeasures` real barlines: the first `groupMeasures` are the
// call (pass 1), the next `groupMeasures` repeat the SAME song-measure numbers as the response (pass 2).
//
// Bug fix (Han 2026-08-25 UAT, Level 11/letter e: "de eerste noten van de tovenaar zijn maten 3 en 4...
// maten 5 en 6 worden niet herhaald"): `barlineOrdinal` is `BarlinesLayer`'s raw `measureNumForLabel`,
// which counts EVERY 'm' marker rendered — including the level's own synthetic lead-in bars
// (`SheetMusic.jsx` prepends `leadInBars` extra 'm' entries ahead of the real content for wave 0, the
// SAME mechanism the non-call-response path already accounts for via `blockMeasureStart = (1 -
// leadInBars) + ...`). Without an equivalent offset here, the lead-in bars were fed straight into the
// call/response cycle math as if they were real call/response measures — shifting the WHOLE cycle by
// `leadInBars` barlines, so real call measures got mislabeled with "response" (.2) suffixes and vice
// versa. `leadInBars` (default 0 — every other call-response level has none) is subtracted before the
// cycle math runs; ordinals still inside the lead-in get the SAME plain, un-suffixed negative/zero
// numbering the non-call-response path already uses (no call/response pass exists before content
// starts).
export const computeCallResponseLabel = ({ barlineOrdinal, groupMeasures, leadInBars = 0 }) => {
    if (barlineOrdinal < leadInBars) {
        return { measureNumber: (1 - leadInBars) + barlineOrdinal, pass: 1 };
    }
    const contentOrdinal = barlineOrdinal - leadInBars;
    const span = groupMeasures > 0 ? groupMeasures : 1;
    const cycleIndex = Math.floor(contentOrdinal / (2 * span));
    const posInCycle = contentOrdinal % (2 * span);
    const isResponse = posInCycle >= span;
    const measureInGroup = isResponse ? posInCycle - span : posInCycle;
    return {
        measureNumber: cycleIndex * span + measureInGroup + 1,   // 1-based, shared by a call/response pair
        pass: isResponse ? 2 : 1,
    };
};
