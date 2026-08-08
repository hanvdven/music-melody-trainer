// Timing-coulantie grading for the side-scroll levels (Han 2026-08-02). A played note that MATCHES the
// target pitch is graded by how far (in ms) it landed from the moment the note is due at the strike line.
// The tiers are note-length fractions of the quarter-note beat (beatMs):
//   1/32 note = beatMs/8 · 1/16 note = beatMs/4 · 1/8 note = beatMs/2
// Any correct note within ±1/8 note kills the slime and keeps the streak alive (Han interview); only the
// POINTS differ. Outside ±1/8 note the note is not in the hit window at all (plain miss — return null).
//
// deltaMs = elapsedMs − targetMs: NEGATIVE = played early ("too fast"), POSITIVE = late ("too slow").

// The window half-widths, as fractions of a beat. Exported so the debug zone bands in SheetRpgLayer draw
// EXACTLY the windows the grading uses (single source of truth — §6c).
export const PERFECT_BEATS = 1 / 8;   // ±1/32 note
export const TOO_BEATS = 1 / 4;       // ±1/16 note
export const MUCH_TOO_BEATS = 1 / 2;  // ±1/8 note — the outer edge of the hit window

export function gradeHit(deltaMs, beatMs) {
    const d = Math.abs(deltaMs);
    if (d <= beatMs * PERFECT_BEATS) return { category: 'perfect', points: 1 };
    if (d <= beatMs * TOO_BEATS) return { category: deltaMs < 0 ? 'tooFast' : 'tooSlow', points: 0.5 };
    if (d <= beatMs * MUCH_TOO_BEATS) return { category: deltaMs < 0 ? 'muchTooFast' : 'muchTooSlow', points: 0.5 };
    return null;
}

// Display labels for the floating judgment text ("zeg dan 'wrong note'" — Han) + the stat rows.
// Han 2026-08-02 (well-done breakdown): 4 distinct final outcomes for a slime, plus 2 LIVE (in-the-moment)
// labels shown immediately on a keypress whose fate is still pending (see SheetRpgLayer's combat effect):
//   - 'wrongNote'          LIVE — a wrong pitch played while a slime was hittable; fate deferred.
//   - 'extraNote'          FINAL — a note played while NOTHING was due (no slime in any window).
//   - 'secondAttemptCorrected' FINAL — a wrong attempt that was later corrected in time.
//   - 'wrongUncorrected'   FINAL — a wrong attempt that was NEVER corrected before the slime expired.
//   - 'missed'             FINAL — a slime expired with NO attempt at all.
//
// Labels read as "early"/"late" (Han 2026-08-02: "maak de timing-as logisch") — the internal category
// KEYS stay tooFast/tooSlow/muchTooFast/muchTooSlow (deltaMs sign — negative = played early = "too fast"
// relative to the click) since those are referenced across stats/tests; only the DISPLAY text changed.
export const GRADE_LABELS = {
    perfect: 'perfect',
    tooFast: 'too early',
    tooSlow: 'too late',
    muchTooFast: 'much too early',
    muchTooSlow: 'much too late',
    secondAttemptCorrected: 'on second attempt',
    wrongNote: 'wrong note',
    wrongUncorrected: 'never fixed',
    extraNote: 'extra note',
    missed: 'missed',
    // #693 round 8 (Han: critters under rests — an accidental note during a rest kills the critter there).
    critterKilled: 'critter hit',
};

// Canonical LOGICAL timing-axis order (Han 2026-08-02: "much too early - too early - perfect - too late -
// much too late") — single source of truth so every timing display (the debug zone bands, the splash's
// timing bar chart) orders its 5 tiers identically instead of each inventing its own order (§6c).
export const TIMING_ORDER = ['muchTooFast', 'tooFast', 'perfect', 'tooSlow', 'muchTooSlow'];
