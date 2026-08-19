import { describe, it, expect } from 'vitest';
import { generateHh } from '../generateBackbeat';

// #1091 (Han 2026-08-19): "hh: elke tel heeft een hh (net als backbeat, maar dan zonder de kick en
// snare)... randomize dan met note pool: ho/hp/r/rb... Zet hh op tellen 2,4,6,8 op velocity 80.
// Als er een ho/hp/r/rb wordt getrokken, gebruik dan gewoon weer velocity 100."
describe('generateHh (#1091)', () => {
    it('fills every on-beat slot with hh at velocity 100', () => {
        // 4/4 @ smallestNoteDenom=8 -> 8 slots/measure; on-beat = the 4 quarter-note starts (0,2,4,6).
        const melody = generateHh([4, 4], 1, 8, 0);
        [0, 2, 4, 6].forEach((i) => {
            expect(melody.notes[i]).toBe('hh');
            expect(melody.velocities[i]).toBe(100);
        });
    });

    it('off-beat slots stay hh at velocity 80 when variability is 0', () => {
        const melody = generateHh([4, 4], 1, 8, 0);
        [1, 3, 5, 7].forEach((i) => {
            expect(melody.notes[i]).toBe('hh');
            expect(melody.velocities[i]).toBe(80);
        });
    });

    it('off-beat slots are always substituted from the pool at velocity 100 when variability is 100', () => {
        const melody = generateHh([4, 4], 1, 8, 100);
        const pool = ['ho', 'hp', 'r', 'cr_bell'];
        [1, 3, 5, 7].forEach((i) => {
            expect(pool).toContain(melody.notes[i]);
            expect(melody.velocities[i]).toBe(100);
        });
    });

    it('generalises to a non-4/4 time signature via slotsPerBeat, not a hardcoded table (CLAUDE.md §6c)', () => {
        // 5/4 @ eighth resolution -> 10 slots; on-beat = 0,2,4,6,8 (every 2nd slot).
        const melody = generateHh([5, 4], 1, 8, 0);
        expect(melody.notes).toHaveLength(10);
        expect(melody.velocities).toHaveLength(10);
        [0, 2, 4, 6, 8].forEach((i) => expect(melody.velocities[i]).toBe(100));
        [1, 3, 5, 7, 9].forEach((i) => expect(melody.velocities[i]).toBe(80));
    });
});
