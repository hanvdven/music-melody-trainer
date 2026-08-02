import { describe, it, expect } from 'vitest';
import buildCelloWholeNotePattern from '../celloWholeNotePattern';

describe('buildCelloWholeNotePattern (#661 Level 2 exception — Han-authorized hardcoded pattern)', () => {
    it('produces one C2 whole note per measure in 4/4', () => {
        const p = buildCelloWholeNotePattern(3, [4, 4]);
        expect(p.notes).toEqual(['C2', 'C2', 'C2']);
        expect(p.offsets).toEqual([0, 48, 96]);
        expect(p.durations).toEqual([48, 48, 48]);
        expect(p.ties).toEqual([null, null, null]);
    });

    it('scales the whole-note duration to a non-4/4 measure length', () => {
        const p = buildCelloWholeNotePattern(1, [3, 4]);
        expect(p.notes).toEqual(['C2']);
        expect(p.durations).toEqual([36]);
    });
});
