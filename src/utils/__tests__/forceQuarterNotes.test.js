import { describe, it, expect } from 'vitest';
import forceQuarterNotes from '../forceQuarterNotes';

describe('forceQuarterNotes (#661 Level 2)', () => {
    it('splits notes longer than a quarter into a quarter + QUARTER rests for the remainder', () => {
        // C4 half (24) → quarter(12) + rest(12); E4 quarter(12) stays; G4 whole(48) → quarter + 3 quarter-rests
        // (Han 2026-08-02: every beat shows a quarter note OR a quarter rest — no long combined rests).
        const mel = { notes: ['C4', 'E4', 'G4'], offsets: [0, 24, 36], durations: [24, 12, 48], ties: ['tie', null, null] };
        const q = forceQuarterNotes(mel);
        expect(q.notes).toEqual(['C4', 'r', 'E4', 'G4', 'r', 'r', 'r']);
        expect(q.durations).toEqual([12, 12, 12, 12, 12, 12, 12]);
        expect(q.offsets).toEqual([0, 12, 24, 36, 48, 60, 72]);
        // ties are dropped — every kept note is a standalone quarter
        expect(q.ties).toEqual([null, null, null, null, null, null, null]);
    });

    it('splits long RESTS into quarter-rest chunks too', () => {
        // dotted-half rest (36) → 3 quarter rests; a whole EMPTY measure reads as 4 quarter rests.
        const mel = { notes: ['C4', 'r', 'D4'], offsets: [0, 12, 48], durations: [12, 36, 12], ties: [null, null, null] };
        const q = forceQuarterNotes(mel);
        expect(q.notes).toEqual(['C4', 'r', 'r', 'r', 'D4']);
        expect(q.durations).toEqual([12, 12, 12, 12, 12]);
        expect(q.offsets).toEqual([0, 12, 24, 36, 48]);
    });

    it('leaves quarters and quarter rests untouched', () => {
        const mel = { notes: ['C4', 'r', 'D4'], offsets: [0, 12, 24], durations: [12, 12, 12], ties: [null, null, null] };
        const q = forceQuarterNotes(mel);
        expect(q.notes).toEqual(['C4', 'r', 'D4']);
        expect(q.durations).toEqual([12, 12, 12]);
    });
});
