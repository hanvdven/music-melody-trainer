import { describe, it, expect } from 'vitest';
import { gradeHit, PERFECT_BEATS, TOO_BEATS, MUCH_TOO_BEATS } from '../gradeHit';

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
