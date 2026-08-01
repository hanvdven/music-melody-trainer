import { describe, it, expect } from 'vitest';
import forceQuarterNotes from '../forceQuarterNotes';

describe('forceQuarterNotes (#661 Level 2)', () => {
    it('splits notes longer than a quarter into a quarter + a rest for the remainder', () => {
        // C4 half (24) → quarter(12) + rest(12); E4 quarter(12) stays; G4 whole(48) → quarter + rest(36).
        const mel = { notes: ['C4', 'E4', 'G4'], offsets: [0, 24, 36], durations: [24, 12, 48], ties: ['tie', null, null] };
        const q = forceQuarterNotes(mel);
        expect(q.notes).toEqual(['C4', 'r', 'E4', 'G4', 'r']);
        expect(q.durations).toEqual([12, 12, 12, 12, 36]);
        expect(q.offsets).toEqual([0, 12, 24, 36, 48]);
        // ties are dropped — every kept note is a standalone quarter
        expect(q.ties).toEqual([null, null, null, null, null]);
    });

    it('leaves quarters and rests untouched', () => {
        const mel = { notes: ['C4', 'r', 'D4'], offsets: [0, 12, 24], durations: [12, 12, 12], ties: [null, null, null] };
        const q = forceQuarterNotes(mel);
        expect(q.notes).toEqual(['C4', 'r', 'D4']);
        expect(q.durations).toEqual([12, 12, 12]);
    });
});
