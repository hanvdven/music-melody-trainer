import { getRelativeNoteName } from '../theory/convertToDisplayNotes';

// Percussion / drum tokens that are NOT pitched notes. They must pass through the
// display-note map VERBATIM — they have no scale-relative spelling. This list is the
// exact guard that lived inline at all 4 (treble/bass × tonic-only/fixed) call sites
// before extraction (Han 2026-06-19). Note: it intentionally does NOT include 'r'
// (rest) — that matches the historical inline behaviour and must not change.
const PERCUSSION_TOKENS = ['k', 'c', 'b', 'hh', 's', '/'];

/**
 * transposeDisplayNotes — map a list of (already pitch-transposed) AUDIO notes to their
 * scale-relative DISPLAY spellings.
 *
 * WHY THIS EXISTS (Han 2026-06-19, ARCHITECTURE_AUDIT §4): this exact map was duplicated
 * 4× inside `Sequencer.randomizeScaleAndGenerate` (treble tonic-only, bass tonic-only,
 * treble fixed, bass fixed). Four copies of the same enharmonic-spelling logic guarantee
 * silent drift. The §8 boundary says PURE generation/theory logic must not live inside the
 * audio class; this is the cleanest pure piece to pull out. The function is enharmonically
 * faithful: each display note SOUNDS the same pitch class as its audio note (the
 * characterization test pins `getNoteSemitone(disp) === getNoteSemitone(audio)`), while
 * being spelled correctly for the active scale.
 *
 * Resolution order per note (verbatim from the original inline code):
 *   1. Percussion token / falsy → pass through unchanged.
 *   2. Exact match in `scaleNotes` → use the parallel `scaleDisplayNotes[idx]` spelling.
 *   3. Otherwise → `getRelativeNoteName(note, scaleTonic)` enharmonic fallback.
 *
 * @param {Array<string|null>} audioNotes - the transposed audio notes (may contain
 *   percussion tokens, nulls, or note-name strings).
 * @param {string[]} scaleNotes - the active scale's audio note array (e.g.
 *   `activeScale.notes`, or the octave-lowered bass variant). Index-parallel to
 *   `scaleDisplayNotes`.
 * @param {string[]} scaleDisplayNotes - the active scale's display spellings,
 *   index-parallel to `scaleNotes`.
 * @param {string} scaleTonic - the active scale's tonic, used for the
 *   `getRelativeNoteName` enharmonic fallback when a note isn't an exact scale member.
 * @returns {Array<string|null>} display notes, same length as `audioNotes`.
 */
export function transposeDisplayNotes(audioNotes, scaleNotes, scaleDisplayNotes, scaleTonic) {
  return audioNotes.map((n) => {
    if (!n || PERCUSSION_TOKENS.includes(n)) return n;
    const idx = scaleNotes.indexOf(n);
    if (idx !== -1) return scaleDisplayNotes[idx];
    return getRelativeNoteName(n, scaleTonic);
  });
}

export { PERCUSSION_TOKENS };
