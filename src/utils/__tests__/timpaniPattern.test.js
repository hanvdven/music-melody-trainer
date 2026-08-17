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

    // #994 (Han 2026-08-14/17, "flexible on screen notes"): a level's lead-in is now as long as its
    // on-screen span (up to 4 measures for Kalinka's 2/4), but only the LAST `countInBars` of those are
    // an audible count-in — the earlier ones are scenery (visible notation, no sound). The silence is
    // baked into the PATTERN rather than gated at the scheduling site, because §108 requires the moving
    // percussion staff to be built from the exact same pattern the audio is scheduled from.
    describe('silentLeadMeasures (#994 silent lead-in)', () => {
        // Kalinka's own meter. NOTE: in 2/4 there are only 2 quarter-beats per measure, so the
        // per-measure re-indexing (#871) only ever reaches PATTERN[0] and PATTERN[1] — both 'C2'. The
        // C3 and the rest are simply unreachable in this meter. That is pre-existing #871 behaviour, not
        // something #994 changed, but it IS newly visible now that a 2/4 level shows 4 lead-in measures.
        it('rests out the first N measures while keeping the tick timeline dense', () => {
            const p = buildTimpaniPattern(4, [2, 4], 2);
            expect(p.notes).toEqual([
                'r', 'r',            // measure -3 — silent scenery
                'r', 'r',            // measure -2 — silent scenery
                'C2', 'C2',          // measure -1 — audible count-in resumes on the pattern's downbeat
                'C2', 'C2',          // measure 0
            ]);
            // Offsets/durations are untouched by the silencing — same grid as without it.
            expect(p.offsets).toEqual([0, 12, 24, 36, 48, 60, 72, 84]);
            expect(p.durations).toEqual(new Array(8).fill(12));
            expect(p.ties).toEqual(new Array(8).fill(null));
        });

        it('defaults to 0 so every pre-#994 caller is byte-identical', () => {
            expect(buildTimpaniPattern(3, [3, 4]).notes)
                .toEqual(buildTimpaniPattern(3, [3, 4], 0).notes);
            expect(buildTimpaniPattern(2, [4, 4]).notes)
                .toEqual(['C2', 'C2', 'C3', 'r', 'C2', 'C2', 'C3', 'r']);
        });

        it('keeps the audible remainder phase-aligned to the barline in an odd meter', () => {
            // 7/8 = 42 ticks = 3.5 quarters, which quartersPerMeasure rounds to 4. So one silent
            // lead-in measure covers indices 0-3, and the first audible measure must still begin on the
            // pattern's own downbeat (C2) — the silencing must not shift the pattern's phase.
            const p = buildTimpaniPattern(3, [7, 8], 1);
            expect(p.notes.slice(0, 4)).toEqual(['r', 'r', 'r', 'r']);
            expect(p.notes[4]).toBe('C2');
            expect(p.notes.slice(4, 8)).toEqual(['C2', 'C2', 'C3', 'r']);
        });

        it('can silence the whole pattern if asked (degenerate, must not throw)', () => {
            const p = buildTimpaniPattern(2, [4, 4], 2);
            expect(p.notes.every((n) => n === 'r')).toBe(true);
            expect(p.offsets).toHaveLength(8);
        });
    });
});
