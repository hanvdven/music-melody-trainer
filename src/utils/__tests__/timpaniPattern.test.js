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

    // Bug fix (Han 2026-08-11, #871 UAT: "Scarborough Fair is in 3/4, maar de timpanen spelen in 4/4"):
    // the pattern index used to be a single free-running counter across the WHOLE piece, never reset at
    // a barline — for 3/4 (quartersPerMeasure=3) each subsequent measure started on a different pattern
    // index than the last (measure 2 would start on 'rest', not 'C2'), drifting the downbeat out of phase
    // with the actual barlines. Now re-indexed per measure, so every measure's first beat is always the
    // pattern's own downbeat (C2), regardless of time signature or measure count.
    it('restarts the pattern at every barline (no drift) across MULTIPLE 3/4 measures', () => {
        const p = buildTimpaniPattern(3, [3, 4]);
        expect(p.notes).toEqual([
            'C2', 'C2', 'C3',   // measure 1
            'C2', 'C2', 'C3',   // measure 2 — still starts on C2, not 'r' (the old bug)
            'C2', 'C2', 'C3',   // measure 3
        ]);
    });

    it('4/4 is unaffected by the per-measure re-indexing (quartersPerMeasure === PATTERN.length already)', () => {
        const p = buildTimpaniPattern(3, [4, 4]);
        expect(p.notes).toEqual([
            'C2', 'C2', 'C3', 'r',
            'C2', 'C2', 'C3', 'r',
            'C2', 'C2', 'C3', 'r',
        ]);
    });
});
