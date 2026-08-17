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
    // on-screen span (4 measures for Kalinka's 2/4) instead of a fixed 2 — and TIMPANI SOUNDS THROUGH
    // ALL OF IT. An earlier #994 draft added a `silentLeadMeasures` third parameter that rested out the
    // first N measures so the earliest lead-in measures were visible-but-silent scenery; Han live-tested
    // that on Kalinka and rejected it ("alle opmaten cello+timpanen"). The parameter is GONE — these
    // tests exist so nobody reintroduces leading silence here.
    describe('#994 lead-in coverage — never any leading silence', () => {
        // Kalinka's own meter. NOTE: in 2/4 there are only 2 quarter-beats per measure, so the
        // per-measure re-indexing (#871) only ever reaches PATTERN[0] and PATTERN[1] — both 'C2'. The
        // C3 and the rest are simply unreachable in this meter. Pre-existing #871 behaviour, not
        // something #994 changed, but newly visible now that a 2/4 level shows 4 lead-in measures.
        it('scores every measure of a 4-measure 2/4 lead-in, starting on the very first downbeat', () => {
            const p = buildTimpaniPattern(4, [2, 4]);
            expect(p.notes).toEqual(['C2', 'C2', 'C2', 'C2', 'C2', 'C2', 'C2', 'C2']);
            expect(p.notes[0]).not.toBe('r');            // the FIRST lead-in measure must sound
            expect(p.offsets).toEqual([0, 12, 24, 36, 48, 60, 72, 84]);
            expect(p.durations).toEqual(new Array(8).fill(12));
            expect(p.ties).toEqual(new Array(8).fill(null));
        });

        it('has no silentLeadMeasures parameter, and ignores a stray third argument', () => {
            // Direct guard against reintroducing the rejected leading-silence concept.
            expect(String(buildTimpaniPattern)).not.toContain('silentLeadMeasures');
            // A stray third argument from an un-migrated caller must be IGNORED, never silence anything.
            expect(buildTimpaniPattern(2, [4, 4], 2).notes)
                .toEqual(['C2', 'C2', 'C3', 'r', 'C2', 'C2', 'C3', 'r']);
        });

        it('never rests a measure DOWNBEAT for any meter or lead-in length', () => {
            [[4, 4], [3, 4], [2, 4], [6, 8], [7, 8], [5, 4]].forEach((ts) => {
                [1, 2, 3, 4, 5].forEach((numMeasures) => {
                    const p = buildTimpaniPattern(numMeasures, ts);
                    const measureTicks = 48 * (ts[0] / ts[1]);
                    for (let m = 0; m < numMeasures; m++) {
                        // The hit at (or first hit after) each measure boundary is that measure's downbeat.
                        const i = p.offsets.findIndex((o) => o >= m * measureTicks);
                        expect(p.notes[i], `${ts.join('/')} x${numMeasures}, measure ${m}`).toBe('C2');
                    }
                });
            });
        });
    });

    // #1044 (Han 2026-08-17, "levels met bijv 7/8 maten werken nog niet goed - veel glitches"): the old
    // implementation rounded 7/8's 3.5 quarters-per-measure to 4 and then laid hits out on a UNIFORM
    // 4-quarters-per-measure grid — 6 ticks longer than the real 42-tick measure, EVERY measure, so the
    // pattern drifted further from the true barlines as the piece went on. This is the regression guard:
    // every measure's downbeat (first hit at/after its own true tick boundary) must be the pattern's own
    // downbeat (C2), however many measures accumulate — never drifting onto C3/rest as #1044's bug did.
    it('never drifts off the barline in an odd meter, however many measures accumulate (#1044)', () => {
        const numMeasures = 8;
        const measureTicks = 42; // 7/8
        const p = buildTimpaniPattern(numMeasures, [7, 8]);
        for (let m = 0; m < numMeasures; m++) {
            const firstIdxInMeasure = p.offsets.findIndex((off) => off >= m * measureTicks);
            expect(p.notes[firstIdxInMeasure]).toBe('C2');
        }
    });
});
