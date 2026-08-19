import { describe, it, expect } from 'vitest';
import { generateHh, HH_NOTES_PER_MEASURE_BY_DENOM } from '../generateBackbeat';

// #1091 round 1 (Han 2026-08-19): "hh: elke tel heeft een hh... randomize dan met note pool:
// ho/hp/r/rb... Zet hh op tellen 2,4,6,8 op velocity 80. Als er een ho/hp/r/rb wordt getrokken,
// gebruik dan gewoon weer velocity 100."
// #1091 round 2 (Han: "I LOF the percussion. every 2 measures randomize percussion, randomly select
// 1,2,4,8,16 as the smallest note denum... randomize the 2 measures according to the same rules (hh +
// uniform random cymbals). Set notes per measure to 1,1,2,3,4 respectively. for 16: the off-off beats
// should have velocity 60."): reworked generateHh to use the LITERAL smallestNoteDenom (so 1/2 can be
// coarser than the 4/4 beat) and an exact per-measure substitution COUNT instead of a probability.
describe('generateHh (#1091)', () => {
    it('smallestNoteDenom=4: every quarter-note slot is on-beat (velocity 100), one slot per beat', () => {
        const melody = generateHh([4, 4], 1, 4, 0);
        expect(melody.notes).toHaveLength(4);
        melody.velocities.forEach((v) => expect(v).toBe(100));
    });

    it('smallestNoteDenom=8: on-beat (0,2,4,6) velocity 100, off-beat (1,3,5,7) velocity 80 when unsubstituted', () => {
        const melody = generateHh([4, 4], 1, 8, 0);
        expect(melody.notes).toHaveLength(8);
        [0, 2, 4, 6].forEach((i) => expect(melody.velocities[i]).toBe(100));
        [1, 3, 5, 7].forEach((i) => {
            expect(melody.notes[i]).toBe('hh');
            expect(melody.velocities[i]).toBe(80);
        });
    });

    it('smallestNoteDenom=16: on-beat/off-beat/off-off-beat three-tier hierarchy (velocity 100/80/60)', () => {
        const melody = generateHh([4, 4], 1, 16, 0);
        expect(melody.notes).toHaveLength(16);
        // Within each 4-slot beat group: slot 0 = on, slot 2 = off, slots 1 & 3 = off-off.
        for (let beat = 0; beat < 4; beat++) {
            const base = beat * 4;
            expect(melody.velocities[base]).toBe(100);
            expect(melody.velocities[base + 2]).toBe(80);
            expect(melody.velocities[base + 1]).toBe(60);
            expect(melody.velocities[base + 3]).toBe(60);
        }
    });

    it('smallestNoteDenom=1/2 (coarser than the beat): one/two slots per measure, all velocity 100', () => {
        const whole = generateHh([4, 4], 1, 1, 0);
        expect(whole.notes).toHaveLength(1);
        expect(whole.velocities[0]).toBe(100);

        const half = generateHh([4, 4], 1, 2, 0);
        expect(half.notes).toHaveLength(2);
        half.velocities.forEach((v) => expect(v).toBe(100));
    });

    it('substitutes exactly notesPerMeasure distinct slots per measure from the pool, always at velocity 100', () => {
        const pool = ['ho', 'hp', 'r', 'cr_bell'];
        const melody = generateHh([4, 4], 2, 8, 3);   // 2 measures, 8 slots each, 3 substitutions/measure
        for (let m = 0; m < 2; m++) {
            const measureNotes = melody.notes.slice(m * 8, m * 8 + 8);
            const measureVel = melody.velocities.slice(m * 8, m * 8 + 8);
            const substituted = measureNotes.filter((n) => n !== 'hh');
            expect(substituted).toHaveLength(3);
            substituted.forEach((n) => expect(pool).toContain(n));
            measureNotes.forEach((n, i) => { if (n !== 'hh') expect(measureVel[i]).toBe(100); });
        }
    });

    it('clamps notesPerMeasure to the available slot count instead of throwing', () => {
        expect(() => generateHh([4, 4], 1, 1, HH_NOTES_PER_MEASURE_BY_DENOM[16])).not.toThrow();
    });

    it("Han's own density table has one entry per denom choice", () => {
        expect(HH_NOTES_PER_MEASURE_BY_DENOM).toEqual({ 1: 1, 2: 1, 4: 2, 8: 3, 16: 4 });
    });

    it('generalises to a non-4/4 time signature (5/4 @ eighth notes -> 10 slots)', () => {
        const melody = generateHh([5, 4], 1, 8, 0);
        expect(melody.notes).toHaveLength(10);
        expect(melody.velocities).toHaveLength(10);
    });
});
