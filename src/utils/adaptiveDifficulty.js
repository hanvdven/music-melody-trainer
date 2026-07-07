/**
 * Adaptive-difficulty engine (#144) — pure math, no React, no storage.
 *
 * Han's locked answers (ticket notes, 2026-07): (1) OVERRIDE — the engine
 * writes the SAME state the difficulty sliders write, so the sliders follow;
 * (2) it drives the EXISTING difficulty mechanism (the target harmonic /
 * treble / bass difficulties the Sequencer already reads at every series
 * boundary — no new generation knobs, §6c); (3) the feedback signal is the
 * skill-attempt outcome (the same graded outcome the ELO ratings consume);
 * (4) cadence = per round (every completed melody attempt).
 *
 * Controller: keep the player in the CHALLENGE ZONE. The ticket frames it as
 * "targets the 0.25–0.45 challenge zone" — i.e. the player should be
 * struggling on 25–45% of the material. In outcome terms that is a graded
 * outcome between 0.55 and 0.75: above it the round was too easy (step the
 * targets UP), below it too hard (step DOWN — faster than up, the standard
 * asymmetry so a struggling player gets relief quickly). Inside the band,
 * hold. Steps are a fixed fraction of each dimension's range, so the engine
 * behaves identically whatever the table ranges are.
 */

// Graded-outcome band that corresponds to the 0.25–0.45 struggle zone.
export const CHALLENGE_BAND = { low: 0.55, high: 0.75 };
// Step sizes as a fraction of the dimension's range per attempt.
export const STEP_UP_FRAC = 0.04;
export const STEP_DOWN_FRAC = 0.07; // drop faster than climb

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * One adaptation step for a single dimension.
 * `target` may be null (slider unset) — the engine seeds it from `seed`
 * (the CURRENT actual difficulty of that dimension) so switching adaptive on
 * never jumps the material.
 */
export function stepTarget(target, outcome, range, seed) {
    if (outcome == null) return target;
    const span = range.max - range.min;
    const current = target != null ? target : clamp(seed ?? range.min, range.min, range.max);
    if (outcome > CHALLENGE_BAND.high) {
        return clamp(current + span * STEP_UP_FRAC, range.min, range.max);
    }
    if (outcome < CHALLENGE_BAND.low) {
        return clamp(current - span * STEP_DOWN_FRAC, range.min, range.max);
    }
    return current; // in the zone — hold
}

/**
 * Full per-attempt step across the three slider dimensions.
 * `targets`/`seeds` = { harmonic, treble, bass }; `ranges` likewise.
 * Returns a NEW targets object (never mutates); unchanged dimensions keep
 * their identity so callers can diff cheaply.
 */
export function stepAdaptiveTargets({ outcome, targets, ranges, seeds }) {
    return {
        harmonic: stepTarget(targets.harmonic, outcome, ranges.harmonic, seeds.harmonic),
        treble: stepTarget(targets.treble, outcome, ranges.treble, seeds.treble),
        bass: stepTarget(targets.bass, outcome, ranges.bass, seeds.bass),
    };
}
