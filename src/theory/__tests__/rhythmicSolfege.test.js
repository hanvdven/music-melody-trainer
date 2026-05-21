import { describe, it, expect } from 'vitest';
import { getTakadimiSyllableGrouped, getTakadimiSyllable, getTupletSyllable } from '../rhythmicSolfege.js';

// Unit = 6 ticks (eighth note, TICKS_PER_WHOLE / 8)
const E = 6;

describe('getTakadimiSyllableGrouped — asymmetric meters', () => {
    it('5/8 [2,3]: simple group ta di, compound group ta ki da', () => {
        const g = [2, 3];
        // Group 1 (2 eighths = simple): offsets 0–11
        expect(getTakadimiSyllableGrouped(0, g, E)).toBe('ta');
        expect(getTakadimiSyllableGrouped(E, g, E)).toBe('di');
        // Group 2 (3 eighths = compound): offsets 12–29
        expect(getTakadimiSyllableGrouped(2 * E, g, E)).toBe('ta');
        expect(getTakadimiSyllableGrouped(3 * E, g, E)).toBe('ki');
        expect(getTakadimiSyllableGrouped(4 * E, g, E)).toBe('da');
    });

    it('5/8 [3,2]: compound group ta ki da, simple group ta di', () => {
        const g = [3, 2];
        expect(getTakadimiSyllableGrouped(0, g, E)).toBe('ta');
        expect(getTakadimiSyllableGrouped(E, g, E)).toBe('ki');
        expect(getTakadimiSyllableGrouped(2 * E, g, E)).toBe('da');
        expect(getTakadimiSyllableGrouped(3 * E, g, E)).toBe('ta');
        expect(getTakadimiSyllableGrouped(4 * E, g, E)).toBe('di');
    });

    it('7/8 [2,2,3]: two simple then one compound', () => {
        const g = [2, 2, 3];
        expect(getTakadimiSyllableGrouped(0, g, E)).toBe('ta');
        expect(getTakadimiSyllableGrouped(E, g, E)).toBe('di');
        expect(getTakadimiSyllableGrouped(2 * E, g, E)).toBe('ta');
        expect(getTakadimiSyllableGrouped(3 * E, g, E)).toBe('di');
        expect(getTakadimiSyllableGrouped(4 * E, g, E)).toBe('ta');
        expect(getTakadimiSyllableGrouped(5 * E, g, E)).toBe('ki');
        expect(getTakadimiSyllableGrouped(6 * E, g, E)).toBe('da');
    });

    it('5/8 subdivision: simple group ta ka di mi at 16th level', () => {
        const g = [2, 3];
        // Group 1 (2E = 12 ticks): 16ths at 3, 6, 9
        expect(getTakadimiSyllableGrouped(3, g, E)).toBe('ka');   // 1/4 of group
        expect(getTakadimiSyllableGrouped(E, g, E)).toBe('di');   // 2/4 = midpoint
        expect(getTakadimiSyllableGrouped(9, g, E)).toBe('mi');   // 3/4 of group
    });

    it('5/8 subdivision: compound group ta va ki di da ma at 16th level', () => {
        const g = [2, 3];
        const base = 2 * E; // group 2 starts at offset 12
        // Group 2 (3E = 18 ticks): subdivisions at 3, 6, 9, 12, 15 within group
        expect(getTakadimiSyllableGrouped(base + 3, g, E)).toBe('va');   // 1/6
        expect(getTakadimiSyllableGrouped(base + E, g, E)).toBe('ki');   // 2/6 = division
        expect(getTakadimiSyllableGrouped(base + 9, g, E)).toBe('di');   // 3/6 = midpoint
        expect(getTakadimiSyllableGrouped(base + 2 * E, g, E)).toBe('da'); // 4/6 = division
        expect(getTakadimiSyllableGrouped(base + 15, g, E)).toBe('ma');  // 5/6
    });

    it('6/8 [3,3]: both groups compound — same as existing compound path', () => {
        const g = [3, 3];
        // Group 1
        expect(getTakadimiSyllableGrouped(0, g, E)).toBe('ta');
        expect(getTakadimiSyllableGrouped(E, g, E)).toBe('ki');
        expect(getTakadimiSyllableGrouped(2 * E, g, E)).toBe('da');
        // Group 2
        expect(getTakadimiSyllableGrouped(3 * E, g, E)).toBe('ta');
        expect(getTakadimiSyllableGrouped(4 * E, g, E)).toBe('ki');
        expect(getTakadimiSyllableGrouped(5 * E, g, E)).toBe('da');
    });

    it('4/4 [2,2,2,2]: all simple groups — same as simple meter path', () => {
        const Q = 12; // quarter note unit for 4/4
        const g = [2, 2, 2, 2];
        expect(getTakadimiSyllableGrouped(0, g, Q)).toBe('ta');
        expect(getTakadimiSyllableGrouped(Q, g, Q)).toBe('di');
        expect(getTakadimiSyllableGrouped(2 * Q, g, Q)).toBe('ta');
        expect(getTakadimiSyllableGrouped(3 * Q, g, Q)).toBe('di');
    });
});

describe('getTupletSyllable — irregular divisions', () => {
    it('quintuplet: ta ka di mi ti', () => {
        expect(getTupletSyllable(0, 5)).toBe('ta');
        expect(getTupletSyllable(1, 5)).toBe('ka');
        expect(getTupletSyllable(2, 5)).toBe('di');
        expect(getTupletSyllable(3, 5)).toBe('mi');
        expect(getTupletSyllable(4, 5)).toBe('ti');
    });

    it('septuplet: ta va ki di da ma ti', () => {
        expect(getTupletSyllable(0, 7)).toBe('ta');
        expect(getTupletSyllable(1, 7)).toBe('va');
        expect(getTupletSyllable(2, 7)).toBe('ki');
        expect(getTupletSyllable(3, 7)).toBe('di');
        expect(getTupletSyllable(4, 7)).toBe('da');
        expect(getTupletSyllable(5, 7)).toBe('ma');
        expect(getTupletSyllable(6, 7)).toBe('ti');
    });

    it('triplet: ta ki da', () => {
        expect(getTupletSyllable(0, 3)).toBe('ta');
        expect(getTupletSyllable(1, 3)).toBe('ki');
        expect(getTupletSyllable(2, 3)).toBe('da');
    });
});
