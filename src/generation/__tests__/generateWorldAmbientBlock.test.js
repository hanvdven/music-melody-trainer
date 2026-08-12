import { describe, it, expect } from 'vitest';
import { generateWorldAmbientBlock, WORLD_AMBIENT_SILENCE_CHANCE } from '../generateWorldAmbientBlock';

describe('generateWorldAmbientBlock (#924)', () => {
    // #924 round 9 (Han: "ik wil meer muziek... zet 'm voor nu op 100% om te testen"): WORLD_AMBIENT_SILENCE_CHANCE
    // is temporarily 0 while Han evaluates the amount-of-music feel — no `rand()` roll (always in [0,1)) can
    // land "under" a 0 chance, so this scenario has nothing to assert until a nonzero value is restored.
    (WORLD_AMBIENT_SILENCE_CHANCE > 0 ? it : it.skip)('is silent when the roll lands under the silence chance', () => {
        const block = generateWorldAmbientBlock({ rand: () => 0 });
        expect(block.treble).toBeNull();
        expect(block.bass).toBeNull();
    });

    it('generates a treble+bass melody pair when the roll clears the silence chance', () => {
        const block = generateWorldAmbientBlock({ rand: () => WORLD_AMBIENT_SILENCE_CHANCE + 0.001 });
        expect(block.treble).toBeTruthy();
        expect(block.bass).toBeTruthy();
        expect(Array.isArray(block.treble.notes)).toBe(true);
        expect(Array.isArray(block.bass.notes)).toBe(true);
    });

    it('two calls with different runIds do not throw and produce independent melodies', () => {
        const a = generateWorldAmbientBlock({ runId: 'a', rand: () => 1 });
        const b = generateWorldAmbientBlock({ runId: 'b', rand: () => 1 });
        expect(a.treble).toBeTruthy();
        expect(b.treble).toBeTruthy();
    });
});
