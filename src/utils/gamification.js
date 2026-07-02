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

// Asymptotic curve constant: ~50 pts at ~1400 branch-XP, 90 pts at ~4600.
// Chosen so 90+ in a branch is a months-long achievement (Han 2026-07-02).
export const SKILL_CURVE_K = 2000;

// Branch XP → displayed 0–100 score. Monotone, fast early, asymptotic to 100.
export function skillScore(branchXP) {
    return Math.round(100 * (1 - Math.exp(-Math.max(0, branchXP) / SKILL_CURVE_K)));
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
