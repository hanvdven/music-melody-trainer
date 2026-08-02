import { describe, it, expect } from 'vitest';
import withMetronomeLeadIn from '../metronomeLeadIn';

describe('withMetronomeLeadIn (#661 "metronoom begint op maat 0")', () => {
    it('duplicates the first bar (offsets < measureTicks) as a lead-in, then keeps the original shifted by one bar', () => {
        const metronome = {
            notes: ['wh', 'wl', 'wl', 'wl', 'wh', 'wl', 'wl', 'wl'],
            offsets: [0, 12, 24, 36, 48, 60, 72, 84],
            durations: new Array(8).fill(12),
        };
        const result = withMetronomeLeadIn(metronome, 48);
        // 4 lead-in clicks (bar 1 duplicated) + original 8 clicks, all shifted +48.
        expect(result.notes).toEqual(['wh', 'wl', 'wl', 'wl', 'wh', 'wl', 'wl', 'wl', 'wh', 'wl', 'wl', 'wl']);
        expect(result.offsets).toEqual([0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 132]);
        expect(result.durations).toEqual(new Array(12).fill(12));
    });

    it('preserves null entries (continuation slots) as null, unshifted', () => {
        const metronome = { notes: ['wh', null], offsets: [0, null], durations: [48, null] };
        const result = withMetronomeLeadIn(metronome, 48);
        // lead-in: the one real note (offset 0) duplicated; original kept + shifted +48; the null stays null.
        expect(result.notes).toEqual(['wh', 'wh', null]);
        expect(result.offsets).toEqual([0, 48, null]);
    });
});
