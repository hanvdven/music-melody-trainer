import { describe, it, expect } from 'vitest';
import { freshTempoAnchor, tempoNormalizedMs } from '../tempoScrollAnchor';

// #1102 (adaptive tempo, Han 2026-08-28). SheetRpgLayer's scroll position is
// `(tempoNormalizedMs / (beatsOnScreen · beatMs)) · dist`. The acceptance criterion these tests pin down
// is Han's: "the RPG scroll position does not visibly jump at the moment the tempo changes — only the
// forward scroll rate changes."
describe('tempoScrollAnchor (#1102)', () => {
    // The position factor SheetRpgLayer actually renders with: normalized-ms / beatMs = beats elapsed,
    // and beats × (dist/beatsOnScreen) is the pixel offset. So "no jump" == "beats elapsed is continuous
    // across the change", which is what this helper computes.
    const beatsAt = (anchor, rawMs, beatMs) => tempoNormalizedMs(anchor, rawMs, beatMs) / beatMs;

    it('is the identity for a level whose tempo never changes (every pre-#1102 level)', () => {
        const a = freshTempoAnchor();
        expect(tempoNormalizedMs(a, 0, 750)).toBe(0);
        expect(tempoNormalizedMs(a, 1500, 750)).toBe(1500);
        expect(tempoNormalizedMs(a, 9000, 750)).toBe(9000);
    });

    it('keeps the scroll position CONTINUOUS across a tempo change (no jump)', () => {
        const a = freshTempoAnchor();
        const slow = 750;   // 80 bpm
        const fast = 600;   // 100 bpm
        // 3000ms at 80bpm = exactly 4 beats.
        expect(beatsAt(a, 3000, slow)).toBeCloseTo(4, 10);
        // The tempo changes at that very instant: beats elapsed must still read 4, not 5 (which is what
        // the un-anchored `elapsed / beatMs` would have produced — a full beat of visible jump).
        expect(beatsAt(a, 3000, fast)).toBeCloseTo(4, 10);
        expect(3000 / fast).toBeCloseTo(5, 10);   // the jump this prevents, spelled out
    });

    it('advances at the NEW rate after the change', () => {
        const a = freshTempoAnchor();
        beatsAt(a, 3000, 750);            // 4 beats at 80 bpm
        beatsAt(a, 3000, 600);            // re-anchor at 100 bpm
        // 1200ms more at 600ms/beat = 2 further beats.
        expect(beatsAt(a, 4200, 600)).toBeCloseTo(6, 10);
    });

    it('survives repeated changes, accumulating beats at each rate in turn', () => {
        const a = freshTempoAnchor();
        beatsAt(a, 2000, 500);            // 4 beats at 120 bpm
        beatsAt(a, 2000, 1000);           // change to 60 bpm — still 4 beats
        expect(beatsAt(a, 4000, 1000)).toBeCloseTo(6, 10);   // +2000ms at 1000ms/beat = +2
        beatsAt(a, 4000, 250);            // change to 240 bpm — still 6 beats
        expect(beatsAt(a, 4000, 250)).toBeCloseTo(6, 10);
        expect(beatsAt(a, 4500, 250)).toBeCloseTo(8, 10);    // +500ms at 250ms/beat = +2
    });

    it('never divides by a zero/absent beatMs (pre-anchor first paint)', () => {
        const a = freshTempoAnchor();
        expect(tempoNormalizedMs(a, 1234, 0)).toBe(1234);
        expect(tempoNormalizedMs(a, 1234, undefined)).toBe(1234);
        expect(a.beatMs).toBeNull();   // an invalid tempo must not become the anchor
    });

    it('a fresh anchor (level restart) starts counting from zero again', () => {
        const a = freshTempoAnchor();
        beatsAt(a, 3000, 750);
        beatsAt(a, 3000, 600);
        const b = freshTempoAnchor();
        expect(tempoNormalizedMs(b, 0, 600)).toBe(0);
        expect(tempoNormalizedMs(b, 600, 600)).toBe(600);
    });
});
