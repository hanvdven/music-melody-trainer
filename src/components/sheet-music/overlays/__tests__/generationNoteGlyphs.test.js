import { describe, it, expect } from 'vitest';
import { rhythmPatternDurations, chordLabelsFor } from '../generationNoteGlyphs';

// #431 (Han): literal chords/measure labels — C (≤1) · C G · C F G · C F G C, trailing partial
// chord of a fractional count lowlit.
describe('chordLabelsFor (#431, Han literal labels)', () => {
    const labels = (n) => chordLabelsFor(n).map(c => c.label);
    const dims = (n) => chordLabelsFor(n).map(c => c.dim);
    it('integer counts render the exact label sequences', () => {
        expect(labels(1)).toEqual(['C']);
        expect(labels(2)).toEqual(['C', 'G']);
        expect(labels(3)).toEqual(['C', 'F', 'G']);
        expect(labels(4)).toEqual(['C', 'F', 'G', 'C']);
        expect(dims(4)).toEqual([false, false, false, false]);   // all full
    });
    it('n ≤ 1 is a single C', () => {
        expect(labels(0.25)).toEqual(['C']);
        expect(labels(0.5)).toEqual(['C']);
    });
    it('a fractional count lowlights the trailing partial chord (2.5 → C F (G))', () => {
        expect(labels(2.5)).toEqual(['C', 'F', 'G']);
        expect(dims(2.5)).toEqual([false, false, true]);         // G dimmed
        expect(dims(1.5)).toEqual([false, true]);                // C (G)
    });
});

// #295 (Han): notes-per-measure patterns are DERIVED, not tabulated (§6c).
// Han's worked examples from the ticket are the fixture.
describe('rhythmPatternDurations (4/4, 48 ticks)', () => {
    it("matches Han's examples 1..6", () => {
        expect(rhythmPatternDurations(1)).toEqual([48]);                    // whole
        expect(rhythmPatternDurations(2)).toEqual([24, 24]);                // two halves
        expect(rhythmPatternDurations(3)).toEqual([12, 12, 24]);            // q q h
        expect(rhythmPatternDurations(4)).toEqual([12, 12, 12, 12]);        // 4 quarters
        expect(rhythmPatternDurations(5)).toEqual([12, 6, 6, 12, 12]);      // q 88 q q
        expect(rhythmPatternDurations(6)).toEqual([12, 6, 6, 6, 6, 12]);    // q 88 88 q
    });

    it('every n in 1..16 sums to the measure and has exactly n notes', () => {
        for (let n = 1; n <= 16; n++) {
            const d = rhythmPatternDurations(n);
            expect(d.length).toBe(n);
            expect(d.reduce((a, b) => a + b, 0)).toBe(48);
            // Only renderable visual durations (durationNoteMap keys).
            for (const v of d) expect([3, 6, 12, 24, 48]).toContain(v);
        }
    });

    it('n=8 is all eighths, n=16 all sixteenths, n=0 empty', () => {
        expect(rhythmPatternDurations(8)).toEqual(Array(8).fill(6));
        expect(rhythmPatternDurations(16)).toEqual(Array(16).fill(3));
        expect(rhythmPatternDurations(0)).toEqual([]);
    });

    it('generalises to other measure lengths (3/4 = 36 ticks)', () => {
        expect(rhythmPatternDurations(3, 36)).toEqual([12, 12, 12]);
        expect(rhythmPatternDurations(4, 36)).toEqual([12, 6, 6, 12]);
        const d6 = rhythmPatternDurations(6, 36);
        expect(d6.length).toBe(6);
        expect(d6.reduce((a, b) => a + b, 0)).toBe(36);
    });
});
