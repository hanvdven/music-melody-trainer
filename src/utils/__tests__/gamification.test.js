import { describe, it, expect } from 'vitest';
import {
    XP_TABLE,
    MULTIPLIED_EVENTS,
    xpNeededForLevel,
    levelFromXP,
    tierName,
    skillScore,
    SKILL_CURVE_K,
    attributeBranches,
    xpMultiplier,
    evaluateStreak,
    effectiveStreakDays,
    localDateISO,
    difficultyToRating,
    gradedOutcome,
    expectedOutcome,
    updateRating,
    RATING_MIN_NOTES,
} from '../gamification';

describe('levels', () => {
    it('level 1 needs 100 XP, curve is 100 × level^1.4', () => {
        expect(xpNeededForLevel(1)).toBe(100);
        expect(xpNeededForLevel(10)).toBe(Math.round(100 * Math.pow(10, 1.4)));
    });

    it('levelFromXP resolves cumulative XP', () => {
        expect(levelFromXP(0)).toEqual({ level: 1, intoLevel: 0, needed: 100 });
        expect(levelFromXP(99).level).toBe(1);
        expect(levelFromXP(100).level).toBe(2);
        // 100 + 264 (level 2 step) = 364 → level 3
        expect(levelFromXP(100 + xpNeededForLevel(2)).level).toBe(3);
        expect(levelFromXP(150)).toEqual({ level: 2, intoLevel: 50, needed: xpNeededForLevel(2) });
    });

    it('negative XP clamps to level 1', () => {
        expect(levelFromXP(-50).level).toBe(1);
    });

    it('tier names match the level bands', () => {
        expect(tierName(1)).toBe('Beginner');
        expect(tierName(4)).toBe('Beginner');
        expect(tierName(5)).toBe('Student');
        expect(tierName(10)).toBe('Musician');
        expect(tierName(20)).toBe('Virtuoso');
        expect(tierName(35)).toBe('Master');
        expect(tierName(50)).toBe('Maestro');
        expect(tierName(99)).toBe('Maestro');
    });
});

describe('skill curve', () => {
    it('is 0 at 0 XP and asymptotic to 100', () => {
        expect(skillScore(0)).toBe(0);
        expect(skillScore(10 * SKILL_CURVE_K)).toBe(100);
    });

    it('is monotone and hits ~63 at K', () => {
        expect(skillScore(SKILL_CURVE_K)).toBe(63); // 1 − e^−1
        expect(skillScore(500)).toBeGreaterThan(skillScore(200));
    });

    it('clamps negative branch XP to 0', () => {
        expect(skillScore(-100)).toBe(0);
    });
});

describe('attribution', () => {
    it('live submode → ear, note submode → sightReading', () => {
        expect(attributeBranches({ subMode: 'live', staff: 'treble', meterNumerator: 4 })).toEqual({ ear: 1 });
        expect(attributeBranches({ subMode: 'note', staff: 'treble', meterNumerator: 4 })).toEqual({ sightReading: 1 });
    });

    it('percussion staff and odd meters → rhythm', () => {
        expect(attributeBranches({ subMode: 'note', staff: 'percussion', meterNumerator: 4 }))
            .toEqual({ sightReading: 1, rhythm: 1 });
        expect(attributeBranches({ subMode: 'live', staff: 'treble', meterNumerator: 7 }))
            .toEqual({ ear: 1, rhythm: 1 });
    });

    it('chords staff or chord targets → harmony', () => {
        expect(attributeBranches({ subMode: 'note', staff: 'chords', meterNumerator: 4 }))
            .toEqual({ sightReading: 1, harmony: 1 });
        expect(attributeBranches({ subMode: 'note', staff: 'treble', isChordTarget: true, meterNumerator: 4 }))
            .toEqual({ sightReading: 1, harmony: 1 });
    });

    it('no submode (pure listening) attributes nothing melodic', () => {
        expect(attributeBranches({ staff: 'treble', meterNumerator: 4 })).toEqual({});
    });
});

describe('xpMultiplier', () => {
    it('maps actualDifficulty.multiplier 0–2 onto 0.5×–2.0×', () => {
        expect(xpMultiplier(0)).toBe(0.5);
        expect(xpMultiplier(1)).toBe(1.25);
        expect(xpMultiplier(2)).toBe(2.0);
    });

    it('clamps out-of-range and null input', () => {
        expect(xpMultiplier(-1)).toBe(0.5);
        expect(xpMultiplier(5)).toBe(2.0);
        expect(xpMultiplier(null)).toBe(0.5);
    });
});

describe('XP table', () => {
    it('only active events are multiplied', () => {
        expect(MULTIPLIED_EVENTS.has('noteCorrect')).toBe(true);
        expect(MULTIPLIED_EVENTS.has('melodyListened')).toBe(false);
        expect(MULTIPLIED_EVENTS.has('seriesComplete')).toBe(false);
        expect(XP_TABLE.melodyComplete).toBe(25);
    });
});

describe('adaptive skill ratings (ELO)', () => {
    it('maps actualDifficulty.multiplier 0–2 onto difficulty rating 0–100', () => {
        expect(difficultyToRating(0)).toBe(0);
        expect(difficultyToRating(1)).toBe(50);
        expect(difficultyToRating(2)).toBe(100);
        expect(difficultyToRating(5)).toBe(100);
        expect(difficultyToRating(null)).toBe(0);
    });

    it('grades outcomes: 100%→1, 95%→0.5, ≤90%→0', () => {
        expect(gradedOutcome(20, 20)).toBe(1);
        expect(gradedOutcome(19, 20)).toBe(0.5); // 95%
        expect(gradedOutcome(18, 20)).toBe(0);   // 90%
        expect(gradedOutcome(10, 20)).toBe(0);
        expect(gradedOutcome(0, 0)).toBeNull();
    });

    it('expected outcome is 0.5 at equal rating and rises with the gap', () => {
        expect(expectedOutcome(50, 50)).toBeCloseTo(0.5);
        expect(expectedOutcome(65, 50)).toBeGreaterThan(0.7);
        expect(expectedOutcome(35, 50)).toBeLessThan(0.3);
    });

    it('flawless play above your rating raises it; failing below drops it', () => {
        const up = updateRating(30, 50, 1, 12);
        expect(up).toBeGreaterThan(30);
        const down = updateRating(50, 20, 0, 12); // failed an easy melody
        expect(down).toBeLessThan(50);
    });

    it('is roughly zero-sum at the expected outcome', () => {
        // Scoring exactly the expected value should barely move the rating.
        const e = expectedOutcome(40, 50);
        const next = updateRating(40, 50, e, 12);
        expect(next).toBeCloseTo(40, 5);
    });

    it('ignores melodies with too few scored notes and weights short ones down', () => {
        expect(updateRating(30, 50, 1, RATING_MIN_NOTES - 1)).toBe(30);
        const short = updateRating(30, 50, 1, 4);
        const long = updateRating(30, 50, 1, 16);
        expect(long - 30).toBeGreaterThan(short - 30);
    });

    it('clamps to 0–100', () => {
        expect(updateRating(99.9, 100, 1, 20)).toBeLessThanOrEqual(100);
        expect(updateRating(0.1, 0, 0, 20)).toBeGreaterThanOrEqual(0);
    });
});

describe('streak', () => {
    const s = (days, lastActiveDate, freezeTokens = 0) => ({ days, lastActiveDate, freezeTokens });

    it('starts at 1 with no history', () => {
        expect(evaluateStreak(null, '2026-07-02')).toEqual(s(1, '2026-07-02'));
    });

    it('same-day activity is idempotent', () => {
        expect(evaluateStreak(s(5, '2026-07-02', 1), '2026-07-02')).toEqual(s(5, '2026-07-02', 1));
    });

    it('consecutive day increments', () => {
        expect(evaluateStreak(s(5, '2026-07-01'), '2026-07-02')).toEqual(s(6, '2026-07-02'));
    });

    it('one missed day consumes a freeze token and continues', () => {
        expect(evaluateStreak(s(5, '2026-06-30', 1), '2026-07-02')).toEqual(s(6, '2026-07-02', 0));
    });

    it('missed days beyond tokens reset to 1 but keep tokens', () => {
        expect(evaluateStreak(s(5, '2026-06-28', 1), '2026-07-02')).toEqual(s(1, '2026-07-02', 1));
    });

    it('earns a token at each 7-day multiple, capped at 2', () => {
        expect(evaluateStreak(s(6, '2026-07-01', 0), '2026-07-02')).toEqual(s(7, '2026-07-02', 1));
        expect(evaluateStreak(s(13, '2026-07-01', 2), '2026-07-02')).toEqual(s(14, '2026-07-02', 2));
    });

    it('crosses month boundaries correctly', () => {
        expect(evaluateStreak(s(3, '2026-06-30'), '2026-07-01')).toEqual(s(4, '2026-07-01'));
    });
});

describe('effectiveStreakDays', () => {
    it('shows stored days while alive, 0 when broken', () => {
        expect(effectiveStreakDays({ days: 5, lastActiveDate: '2026-07-01', freezeTokens: 0 }, '2026-07-02')).toBe(5);
        expect(effectiveStreakDays({ days: 5, lastActiveDate: '2026-06-30', freezeTokens: 1 }, '2026-07-02')).toBe(5);
        expect(effectiveStreakDays({ days: 5, lastActiveDate: '2026-06-28', freezeTokens: 1 }, '2026-07-02')).toBe(0);
        expect(effectiveStreakDays(null, '2026-07-02')).toBe(0);
    });
});

describe('localDateISO', () => {
    it('formats a local date as YYYY-MM-DD', () => {
        expect(localDateISO(new Date(2026, 0, 5))).toBe('2026-01-05');
    });
});
