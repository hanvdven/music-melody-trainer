import { describe, it, expect } from 'vitest';
import buildTimpaniPattern from '../timpaniPattern';

describe('buildTimpaniPattern (#661 melodic percussion — Han-authorized hardcoded pattern)', () => {
    it('repeats C2,C2,C3,rest per measure in 4/4, tiling gaplessly', () => {
        const p = buildTimpaniPattern(2, [4, 4]);
        expect(p.notes).toEqual(['C2', 'C2', 'C3', 'r', 'C2', 'C2', 'C3', 'r']);
        expect(p.offsets).toEqual([0, 12, 24, 36, 48, 60, 72, 84]);
        expect(p.durations).toEqual(new Array(8).fill(12));
        expect(p.ties).toEqual(new Array(8).fill(null));
    });

    it('cycles gracefully for a non-4/4 time signature (e.g. 3/4)', () => {
        const p = buildTimpaniPattern(1, [3, 4]);
        expect(p.notes).toEqual(['C2', 'C2', 'C3']);
    });
});
