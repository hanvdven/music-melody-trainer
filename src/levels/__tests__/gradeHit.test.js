import { describe, it, expect } from 'vitest';
import { gradeHit, hiddenTimingGrade, PERFECT_BEATS, TOO_BEATS, MUCH_TOO_BEATS } from '../gradeHit';

// beatMs = 800 keeps the tier edges integral: perfect ±100, too ±200, much too ±400.
const B = 800;

describe('gradeHit (Han 2026-08-02 timing-coulantie)', () => {
    it('≤1/32 note off = perfect, 1 point (either side, inclusive edge)', () => {
        expect(gradeHit(0, B)).toEqual({ category: 'perfect', points: 1 });
        expect(gradeHit(-100, B)).toEqual({ category: 'perfect', points: 1 });
        expect(gradeHit(100, B)).toEqual({ category: 'perfect', points: 1 });
    });

    it('1/32–1/16 note off = too fast (early) / too slow (late), ½ point', () => {
        expect(gradeHit(-101, B)).toEqual({ category: 'tooFast', points: 0.5 });
        expect(gradeHit(200, B)).toEqual({ category: 'tooSlow', points: 0.5 });
    });

    it('1/16–1/8 note off = much too fast / much too slow, ½ point', () => {
        expect(gradeHit(-201, B)).toEqual({ category: 'muchTooFast', points: 0.5 });
        expect(gradeHit(400, B)).toEqual({ category: 'muchTooSlow', points: 0.5 });
    });

    it('beyond 1/8 note = outside the hit window (null)', () => {
        expect(gradeHit(-401, B)).toBeNull();
        expect(gradeHit(9999, B)).toBeNull();
    });

    it('tier constants are 1/32, 1/16, 1/8 note as beat fractions', () => {
        expect(PERFECT_BEATS).toBe(1 / 8);
        expect(TOO_BEATS).toBe(1 / 4);
        expect(MUCH_TOO_BEATS).toBe(1 / 2);
    });
});

// ── #1120: the HIDDEN true grade (the adaptive ladder's gated-exit signal) ────────────────────────
// The rule this pins down is the one the plan_review bounce settled: on a GATED level the gate does
// not relabel the grade, it FREEZES THE CLOCK — so `deltaMs` alone is ~0 for every gated hit however
// long the player sat there, and a naive re-grade would say 'perfect' 100% of the time. Adding back
// the real frozen time reconstructs the delta the player WOULD have been graded on.
describe('hiddenTimingGrade (#1120 — the gated-exit signal)', () => {
    // A FLOOR tempo: adaptive clamps at baseBpm/2, so 40 bpm off an authored 80. beatMs = 1500,
    // perfect window = ±187.5 ms — deliberately generous, which is exactly why the naive grade is
    // useless and the frozen time has to be added back.
    const FLOOR_BEAT_MS = 60000 / 40;

    it('a hit the gate never had to wait for grades perfect (frozenExtraMs 0)', () => {
        expect(hiddenTimingGrade({ deltaMs: 0, frozenExtraMs: 0, beatMs: FLOOR_BEAT_MS })).toBe('perfect');
    });

    it('the SAME ~0 delta after a 400 ms freeze is NOT perfect — the gate waited for the player', () => {
        // This is the whole point: `deltaMs` is ~0 both times because the clock was frozen.
        expect(hiddenTimingGrade({ deltaMs: 0, frozenExtraMs: 400, beatMs: FLOOR_BEAT_MS })).not.toBe('perfect');
        // 400 ms is 0.267 of a 1500 ms beat — past TOO_BEATS (0.25), so it lands one tier further out.
        expect(hiddenTimingGrade({ deltaMs: 0, frozenExtraMs: 400, beatMs: FLOOR_BEAT_MS })).toBe('muchTooSlow');
        // …and a shorter one still registers as late rather than perfect.
        expect(hiddenTimingGrade({ deltaMs: 0, frozenExtraMs: 300, beatMs: FLOOR_BEAT_MS })).toBe('tooSlow');
    });

    it('a freeze past the whole hit window grades null — outside every tier, never perfect', () => {
        expect(hiddenTimingGrade({ deltaMs: 0, frozenExtraMs: 5000, beatMs: FLOOR_BEAT_MS })).toBeNull();
    });

    it('is exactly gradeHit\'s own category on a TIMED level (nothing frozen to add back)', () => {
        for (const d of [0, -100, 150, -260, 380, 9999]) {
            expect(hiddenTimingGrade({ deltaMs: d, beatMs: B }))
                .toBe(gradeHit(d, B)?.category ?? null);
        }
    });

    it('a corrected SECOND ATTEMPT is never perfect, however well the correction was timed', () => {
        // Design edge case d — the ONE place the hidden and the recorded grade differ in KIND rather
        // than in strictness: the player needed two tries. (The recorded grade still reports
        // `secondAttemptCorrected` to stats, exactly as before this ticket.)
        expect(hiddenTimingGrade({
            deltaMs: 0, frozenExtraMs: 0, beatMs: FLOOR_BEAT_MS, secondAttempt: true,
        })).toBe('secondAttempt');
        expect(hiddenTimingGrade({ deltaMs: 0, beatMs: B, secondAttempt: true })).not.toBe('perfect');
    });
});
