/**
 * Gamification math — pure functions only, no React, no storage.
 *
 * Single source of truth for XP amounts, the level curve, the skill-branch
 * curve, difficulty→XP multiplier mapping, event→branch attribution, and the
 * daily-streak evaluator. All scoring math lives HERE so ProfileContext (the
 * only writer) and tests share one implementation. See docs/architecture.md
 * §Gamification and kanban tickets #128/#129/#130/#142.
 *
 * Design decisions (Han, chat interview 2026-07-02):
 * - Skill curve constant K = 2000 (≈50 pts after ~1400 branch-XP, 90+ takes months).
 * - Passive listening XP has NO daily cap.
 * - v1 ships ONLY the difficulty multiplier; tempo/blind/note-streak multipliers deferred.
 */

// #1122: nextAnpm() shares the SAME "clean run" / "genuinely struggling" accuracy gates as the
// in-level adaptive-tempo controller, so the app has ONE definition of each rather than a second
// literal here (Han 2026-09-01, locked answer). adaptiveTempo.js is a pure module; it does pull in
// LevelStatsCharts + levels transitively, but none of those import this file, so there is no cycle.
import { SPEED_UP_ACCURACY, SLOW_DOWN_ACCURACY } from '../levels/adaptiveTempo';

// Base XP per event type (docs/gamification.md §3.1).
// Active events (input test) are scaled by xpMultiplier(); passive events
// (melodyListened, seriesComplete) and novelty bonuses are flat.
export const XP_TABLE = {
    noteCorrect: 2,
    cleanMeasure: 10,
    melodyComplete: 25,
    melodyListened: 3,
    seriesComplete: 5,
    newKey: 15,
    newScale: 20,
};

// Events whose XP is scaled by the difficulty multiplier (the user is actively
// performing, so harder settings deserve more XP). Passive listening is flat.
export const MULTIPLIED_EVENTS = new Set(['noteCorrect', 'cleanMeasure', 'melodyComplete']);

// ─── Levels ────────────────────────────────────────────────────────────────

// XP needed to advance FROM `level` to `level + 1` (docs/gamification.md §3.3:
// XP_needed(level) = 100 × level^1.4 — fast early levels, gradual later).
export function xpNeededForLevel(level) {
    return Math.round(100 * Math.pow(level, 1.4));
}

/**
 * Resolves total XP into { level, intoLevel, needed }.
 * `intoLevel` = XP accumulated inside the current level,
 * `needed`    = XP required to reach the next level.
 * Levels start at 1. The loop is bounded (level 100 needs ~63k XP per step).
 */
export function levelFromXP(totalXP) {
    let level = 1;
    let remaining = Math.max(0, totalXP);
    while (remaining >= xpNeededForLevel(level)) {
        remaining -= xpNeededForLevel(level);
        level++;
    }
    return { level, intoLevel: remaining, needed: xpNeededForLevel(level) };
}

// Tier names per level band (docs/gamification.md §3.3, English per Han 2026-07-02).
const TIERS = [
    [50, 'Maestro'],
    [35, 'Master'],
    [20, 'Virtuoso'],
    [10, 'Musician'],
    [5, 'Student'],
    [1, 'Beginner'],
];

export function tierName(level) {
    for (const [min, name] of TIERS) {
        if (level >= min) return name;
    }
    return 'Beginner';
}

// ─── Skill branches ────────────────────────────────────────────────────────

export const SKILL_BRANCHES = ['ear', 'sightReading', 'rhythm', 'harmony', 'consistency'];
// The four PERFORMANCE branches carry an ELO-style rating (see below).
// Consistency is not a win/loss skill — it stays XP-curve based.
export const RATING_BRANCHES = ['ear', 'sightReading', 'rhythm', 'harmony'];

// Asymptotic curve constant for the CONSISTENCY branch only (#129 rework kept
// it XP-based): ~50 pts at ~1400 XP, 90 at ~4600.
export const SKILL_CURVE_K = 2000;

// Consistency XP → displayed 0–100 score. Monotone, fast early, asymptotic to 100.
export function skillScore(branchXP) {
    return Math.round(100 * (1 - Math.exp(-Math.max(0, branchXP) / SKILL_CURVE_K)));
}

// ─── Adaptive skill ratings — ELO-style (#129 rework, Han 2026-07-02) ──────
//
// Han: "100 means the player is able to play the hardest difficulty flawlessly,
// like chess ELO / win-loss MMR." Each completed input-test melody is a rated
// MATCH against the difficulty of the current settings. Ratings can DROP
// (Han confirmed). Listening never moves ratings — it is not evidence of
// ability. XP is untouched by this system.

// How many rating points of gap halve/double the expected outcome. 15 means a
// player rated 15 above the difficulty is expected to score ~0.76.
export const RATING_SPREAD = 15;
// Max rating movement per melody (scaled by outcome−expected and length weight).
export const RATING_K = 6;
// Melodies with fewer scored notes than this are ignored — a 2-note melody
// proves nothing and would let ratings be farmed or tanked trivially.
export const RATING_MIN_NOTES = 4;

// actualDifficulty.multiplier (harmNorm + trebleNorm, 0–2) → difficulty rating
// 0–100. 100 = both harmonic and melodic difficulty at their table maxima,
// i.e. "the hardest difficulty" on Han's scale.
export function difficultyToRating(difficultyMultiplier) {
    return Math.min(100, Math.max(0, 50 * (difficultyMultiplier ?? 0)));
}

/**
 * Graded match outcome from accuracy (Han chose graded over binary):
 * 100% → 1.0, 95% → 0.5, ≤90% → 0. Returns null when there is nothing to
 * grade (no scored notes).
 */
export function gradedOutcome(correct, total) {
    if (!total || total <= 0) return null;
    // Integer arithmetic: (acc − 0.90) / 0.10 = (10·correct − 9·total) / total,
    // exact for whole note counts (avoids 0.999… float artifacts at 100%).
    return Math.min(1, Math.max(0, (10 * correct - 9 * total) / total));
}

// Expected outcome for a player at `rating` facing `difficulty` — standard
// logistic (chess ELO with divisor RATING_SPREAD instead of 400).
export function expectedOutcome(rating, difficulty) {
    return 1 / (1 + Math.pow(10, (difficulty - rating) / RATING_SPREAD));
}

/**
 * One rating update after a completed melody.
 * `scoredNotes` weights the K-factor: short melodies move the rating less
 * (full weight from 8 notes), and below RATING_MIN_NOTES nothing happens.
 * Clamped to 0–100; stored unrounded so slow progress is not lost to rounding.
 */
export function updateRating(rating, difficulty, outcome, scoredNotes) {
    if (outcome == null || scoredNotes < RATING_MIN_NOTES) return rating;
    const lengthWeight = Math.min(1, scoredNotes / 8);
    const next = rating + RATING_K * lengthWeight * (outcome - expectedOutcome(rating, difficulty));
    return Math.min(100, Math.max(0, next));
}

// ─── ANPM smoothing (#1122) ────────────────────────────────────────────────

// #1122 (Han 2026-09-01): asymmetric, gated blend factors for the profile's ANPM (Adjusted Notes Per
// Minute) — "ANPM verandert maar traag". Both are roughly half / one-sixth of the old single
// symmetric EWMA alpha (0.30) that ANPM_EWMA_ALPHA used to carry in ProfileContext.
export const ANPM_ALPHA_UP = 0.15;   // a clean fast run raises ANPM by 15% of the gap
export const ANPM_ALPHA_DOWN = 0.05; // "en ook niet zo hard" — a bad slow run lowers it by only 5%

/**
 * One ANPM update after a completed level. ANPM is the player's *current sustainable reading speed*
 * (notes/min they can handle AT accuracy — see #1099); it can rise OR fall, but only slowly, and it
 * must NOT fall just because a piece was slow. The law is deliberately asymmetric and gated:
 *
 *   - no measurement (notesPerMinute not finite / ≤ 0)  → unchanged
 *   - first ever reading (anpm == null)                 → seed, but only from a clean run (≥ 90%)
 *   - FAST sample (notesPerMinute ≥ anpm):
 *       clean (≥ SPEED_UP_ACCURACY)  → blend up by ANPM_ALPHA_UP
 *       sloppy                       → HOLD (fast-but-sloppy is evidence of overreach, not speed)
 *   - SLOW sample (notesPerMinute < anpm):
 *       accuracy ≥ SLOW_DOWN_ACCURACY → HOLD  ← the whole point: a slow accurate run (a Langzaam
 *                                               variant, a new range/scale) must not look like
 *                                               skill regression. Covers Han's ">80% never lowers"
 *                                               and the 70–80% deadband in one predicate.
 *       genuinely struggling (< 70%)  → blend down GENTLY by ANPM_ALPHA_DOWN
 *
 * #1102's in-level adaptive bpm is intentionally NOT smoothed this way — Han wants it to keep
 * fluctuating faster than the lifetime stat.
 */
export function nextAnpm({ anpm, notesPerMinute, accuracyPercent }) {
    // No usable measurement this run — leave the stat exactly where it was.
    if (!Number.isFinite(notesPerMinute) || notesPerMinute <= 0) return anpm;
    // First ever reading: a first sloppy run must not become the anchor everything else smooths against.
    if (anpm == null) return accuracyPercent >= SPEED_UP_ACCURACY ? notesPerMinute : null;
    if (notesPerMinute >= anpm) {
        // FAST sample: only a clean run is evidence the player got faster.
        return accuracyPercent >= SPEED_UP_ACCURACY
            ? anpm + ANPM_ALPHA_UP * (notesPerMinute - anpm)
            : anpm;
    }
    // SLOW sample: hold unless the player was genuinely struggling at that slower tempo.
    return accuracyPercent >= SLOW_DOWN_ACCURACY
        ? anpm
        : anpm + ANPM_ALPHA_DOWN * (notesPerMinute - anpm);
}

/**
 * Event → skill-branch attribution (docs/gamification.md §4).
 * `payload`: { subMode, staff, isChordTarget, meterNumerator }.
 * Returns { branch: weight } — weights multiply the event's XP into branchXP.
 * Consistency is NOT attributed here; it is fed by streak days and session
 * length at session end (see ProfileContext.endSession).
 */
export function attributeBranches(payload = {}) {
    const { subMode, staff, isChordTarget, meterNumerator } = payload;
    const weights = {};
    if (subMode === 'live') weights.ear = 1;
    else if (subMode === 'note') weights.sightReading = 1;
    // Odd/compound meters (anything but 2/4/3/4/4/4-style numerators) train rhythm,
    // as does the percussion staff itself.
    if (staff === 'percussion' || (meterNumerator != null && ![2, 3, 4].includes(meterNumerator))) {
        weights.rhythm = 1;
    }
    if (staff === 'chords' || isChordTarget) weights.harmony = 1;
    return weights;
}

// ─── Difficulty multiplier ─────────────────────────────────────────────────

/**
 * Maps `actualDifficulty.multiplier` from useDifficultySettings (harmNorm +
 * trebleNorm, range 0–2) onto the XP multiplier band 0.5×–2.0×
 * (docs/gamification.md §3.2). Linear: 0 → 0.5×, 1 → 1.25×, 2 → 2.0×.
 */
export function xpMultiplier(difficultyMultiplier) {
    const m = 0.5 + 0.75 * (difficultyMultiplier ?? 0);
    return Math.min(2.0, Math.max(0.5, m));
}

// ─── Daily streak ──────────────────────────────────────────────────────────

// Local calendar date as 'YYYY-MM-DD' (streaks use local days, not 24h windows).
export function localDateISO(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Whole-day difference between two 'YYYY-MM-DD' strings (b − a).
// Date.UTC on the parsed parts avoids DST off-by-one from local-time parsing.
function dayDiff(aISO, bISO) {
    const [ay, am, ad] = aISO.split('-').map(Number);
    const [by, bm, bd] = bISO.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/**
 * Evaluates the streak when activity happens on `todayISO`
 * (docs/gamification.md §5.1). Pure: returns a NEW streak object.
 *
 * Rules:
 * - Same day as lastActiveDate → unchanged.
 * - Gap of exactly 1 day → streak continues (+1).
 * - Larger gap → each missed day consumes one freeze token; if tokens cover
 *   ALL missed days the streak continues, otherwise it resets to 1 (today).
 *   Tokens are earned, so an uncovered break does not also wipe them.
 * - Earn: +1 freeze token per 7 consecutive days (days % 7 === 0), max 2 held.
 */
export function evaluateStreak(streak, todayISO) {
    const { days = 0, lastActiveDate = null, freezeTokens = 0 } = streak || {};
    if (lastActiveDate === todayISO) return { days, lastActiveDate, freezeTokens };

    let nextDays;
    let nextTokens = freezeTokens;

    if (!lastActiveDate) {
        nextDays = 1;
    } else {
        const gap = dayDiff(lastActiveDate, todayISO);
        const missed = gap - 1;
        if (missed <= 0) {
            nextDays = days + 1;
        } else if (missed <= freezeTokens) {
            nextTokens = freezeTokens - missed;
            nextDays = days + 1;
        } else {
            nextDays = 1;
        }
    }

    if (nextDays > 0 && nextDays % 7 === 0) {
        nextTokens = Math.min(2, nextTokens + 1);
    }
    return { days: nextDays, lastActiveDate: todayISO, freezeTokens: nextTokens };
}

/**
 * Streak value to DISPLAY without recording activity (app mount, ProfileTab).
 * Returns 0 if the streak is already irrecoverably broken (missed days exceed
 * held freeze tokens), else the stored count. Never mutates.
 */
export function effectiveStreakDays(streak, todayISO) {
    const { days = 0, lastActiveDate = null, freezeTokens = 0 } = streak || {};
    if (!lastActiveDate || days === 0) return 0;
    const gap = dayDiff(lastActiveDate, todayISO);
    // gap ≤ 1: today or yesterday — still alive. Beyond that, tokens must cover
    // every FULLY missed day (today itself is still playable, so gap−1 misses).
    if (gap <= 1) return days;
    return gap - 1 <= freezeTokens ? days : 0;
}
