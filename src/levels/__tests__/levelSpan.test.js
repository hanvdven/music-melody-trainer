import { describe, it, expect } from 'vitest';
import { LEVELS, deriveLevelSpan } from '../levels';
import { TICKS_PER_WHOLE, TICKS_PER_BEAT } from '../../constants/timing';

// #994 (Han 2026-08-14/17, "flexible on screen notes"): a side-scroll level's on-screen span is derived
// from its OWN tempo and meter instead of the former fixed `LEVEL_LEAD_IN_BARS = 2`, targeting a roughly
// constant on-screen TIME (~6s) rather than a constant measure count. These tests guard the formula, the
// §108 tick/beat equality it must satisfy, Han's count-in ORDERING rule (decision B), and the promise
// that the bulk of the existing 4/4 catalogue is left byte-identical.
//
// Formula (see levels.js deriveLevelSpan):
//   targetBeats     = round(bpm/10)
//   visibleMeasures = max(1, roundHalfDown(targetBeats / beatsPerMeasure))   [roundHalfDown = ceil(x-0.5)]
//   countInBars     = min(visibleMeasures, max(2, ceil(visibleMeasures/2)))
//   metronomeBars   = max(1, countInBars - 1)
//   beatsOnScreen   = visibleMeasures * beatsPerMeasure   (NOT rounded — see the §108 test below)

describe('deriveLevelSpan — the #994 span formula', () => {
    // Han's own worked examples from the ticket + interview are the primary contract here.
    it('matches Han\'s worked examples: Kalinka 2/4 @90 -> 4 measures / 2 count-in; 3/4 @84 -> 3 / 2', () => {
        // "kalinka is 2/4, so a measure is really short. I would like to have 4 measures headstart
        // (so start at measure -3) and have 4 measures on screen, and a 2 measures count-in."
        const kalinka = deriveLevelSpan({ bpm: 90, timeSignature: [2, 4] });
        expect(kalinka.visibleMeasures).toBe(4);
        expect(kalinka.leadInBars).toBe(4);
        expect(kalinka.countInBars).toBe(2);
        expect(kalinka.silentLeadInBars).toBe(2);
        expect(kalinka.beatsOnScreen).toBe(8);

        // "Maybe 3/4 should have 3 measures on screen; -2,0; and 2 measure count in."
        const threeFour = deriveLevelSpan({ bpm: 84, timeSignature: [3, 4] });
        expect(threeFour.visibleMeasures).toBe(3);
        expect(threeFour.countInBars).toBe(2);
        expect(threeFour.silentLeadInBars).toBe(1);
        expect(threeFour.beatsOnScreen).toBe(9);
    });

    // The tie-break is load-bearing, not cosmetic: Kalinka's quotient is exactly 4.5 (targetBeats 9 /
    // 2 beats per measure). Math.round (half-UP) would give 5 measures and a 3-measure count-in,
    // contradicting Han's "4 measures on screen, 2 measures count-in"; Math.floor would fix Kalinka but
    // give 3/4 @84 only 2 measures, contradicting "3/4 should have 3 measures on screen". Half-DOWN is
    // the only tie-break satisfying both (Han decision A, 2026-08-17).
    it('rounds exact .5 quotients DOWN (Kalinka is exactly 4.5 — half-up would break Han\'s example)', () => {
        expect(deriveLevelSpan({ bpm: 90, timeSignature: [2, 4] }).visibleMeasures).toBe(4);
        expect(Math.round(4.5)).toBe(5);   // documents WHY a plain Math.round is wrong here
        // A non-.5 quotient must still round normally (2.67 -> 3, i.e. up).
        expect(deriveLevelSpan({ bpm: 84, timeSignature: [3, 4] }).visibleMeasures).toBe(3);
    });

    // §6c: the formula must generalise to ANY meter, compound or odd — no per-time-signature table.
    it.each([
        // bpm,  ts,      visible, countIn, metronome, silent, beatsOnScreen
        [90, [4, 4], 2, 2, 1, 0, 8],
        [80, [4, 4], 2, 2, 1, 0, 8],
        [120, [4, 4], 3, 2, 1, 1, 12],
        [150, [4, 4], 4, 2, 1, 2, 16],
        [90, [3, 4], 3, 2, 1, 1, 9],
        [90, [2, 4], 4, 2, 1, 2, 8],
        [96, [6, 8], 3, 2, 1, 1, 9],     // compound: 6/8 is 3 quarter-beats of TIME, not 6
        [92, [7, 8], 3, 2, 1, 1, 10.5],  // odd + FRACTIONAL beatsOnScreen (see the §108 test)
        [128, [5, 4], 3, 2, 1, 1, 15],
        [100, [11, 8], 2, 2, 1, 0, 11],  // never tested by any shipped level — must still be derived
    ])('derives %i bpm %j correctly across simple, compound and odd meters', (bpm, ts, visible, countIn, metronome, silent, bos) => {
        const span = deriveLevelSpan({ bpm, timeSignature: ts });
        expect(span.visibleMeasures).toBe(visible);
        expect(span.countInBars).toBe(countIn);
        expect(span.metronomeBars).toBe(metronome);
        expect(span.silentLeadInBars).toBe(silent);
        expect(span.beatsOnScreen).toBeCloseTo(bos, 10);
    });

    // THE §108 INVARIANT. SheetRpgLayer positions the barline row at `viewRight - leadInTicks·scrollPPT`
    // with `scrollPPT = dist / (beatsOnScreen·TICKS_PER_BEAT)`; measure "-1" only lands on the hero at
    // level start when those two agree exactly. This is why deriveLevelSpan does NOT round beatsOnScreen
    // (#889's outer Math.round was a no-op for the meters shipped then, but 7/8 at 3 visible measures is
    // 10.5 — rounding would drift barlines ~half a beat away from their own notes).
    it('satisfies the §108 equality beatsOnScreen·TICKS_PER_BEAT === leadInBars·measureLengthTicks exactly', () => {
        const meters = [[4, 4], [3, 4], [2, 4], [6, 8], [7, 8], [5, 4], [11, 8], [12, 8], [9, 8]];
        const tempos = [40, 60, 66, 72, 80, 90, 100, 110, 128, 150, 200];
        meters.forEach((ts) => tempos.forEach((bpm) => {
            const { beatsOnScreen, leadInBars } = deriveLevelSpan({ bpm, timeSignature: ts });
            const measureLengthTicks = TICKS_PER_WHOLE * (ts[0] / ts[1]);
            expect(beatsOnScreen * TICKS_PER_BEAT).toBeCloseTo(leadInBars * measureLengthTicks, 10);
        }));
    });

    // Han decision B (2026-08-17): the count-in guarantees an ORDERING — at least one measure of
    // cello+timpani ALONE, then at least one measure with the metronome added. That is why countInBars
    // carries a max(2,…) floor rather than the metronome carrying one.
    it('always yields >=1 cello-only measure followed by >=1 metronome measure (Han decision B)', () => {
        for (let visible = 2; visible <= 8; visible++) {
            // Reach each visibleMeasures via a bpm/meter that produces it, rather than calling internals.
            const span = deriveLevelSpan({ bpm: visible * 10 * 4, timeSignature: [4, 4] });
            expect(span.visibleMeasures).toBeGreaterThanOrEqual(2);
            expect(span.countInBars).toBeGreaterThanOrEqual(2);
            expect(span.countInBars).toBeLessThanOrEqual(span.visibleMeasures);
            expect(span.metronomeBars).toBeGreaterThanOrEqual(1);
            expect(span.celloOnlyBars).toBeGreaterThanOrEqual(1);
            expect(span.celloOnlyBars + span.metronomeBars).toBe(span.countInBars);
        }
    });

    // The degenerate edge: a single visible measure cannot hold a cello-only bar AND a metronome bar,
    // so all three necessarily overlap there (Han: "unavoidable, no separate cello-only measure fits").
    it('clamps to at least 1 visible measure, and overlaps all tracks when visibleMeasures === 1', () => {
        // Very slow tempo with a long measure: targetBeats is tiny relative to beatsPerMeasure.
        const span = deriveLevelSpan({ bpm: 30, timeSignature: [7, 4] });
        expect(span.visibleMeasures).toBe(1);
        expect(span.countInBars).toBe(1);
        expect(span.metronomeBars).toBe(1);
        expect(span.celloOnlyBars).toBe(0);
        expect(span.silentLeadInBars).toBe(0);
        // Absolute floor: never 0 or negative for any plausible tempo/meter.
        [1, 10, 20, 30].forEach((bpm) => {
            expect(deriveLevelSpan({ bpm, timeSignature: [12, 8] }).visibleMeasures).toBeGreaterThanOrEqual(1);
        });
    });

    it('falls back to 80 bpm when bpm is missing rather than producing NaN', () => {
        const span = deriveLevelSpan({ bpm: undefined, timeSignature: [4, 4] });
        expect(span).toEqual(deriveLevelSpan({ bpm: 80, timeSignature: [4, 4] }));
    });
});

describe('normalizeLevel — span applied to the real level catalogue (#994)', () => {
    const sideScrollLevels = Object.values(LEVELS).filter((lvl) => lvl.sideScroll);

    it('gives every side-scroll level a complete, self-consistent span', () => {
        expect(sideScrollLevels.length).toBeGreaterThan(20);
        sideScrollLevels.forEach((lvl) => {
            expect(lvl.visibleMeasures, `level ${lvl.id}`).toBeGreaterThanOrEqual(1);
            expect(lvl.leadInBars, `level ${lvl.id}`).toBe(lvl.visibleMeasures);
            expect(lvl.countInBars, `level ${lvl.id}`).toBeLessThanOrEqual(lvl.visibleMeasures);
            expect(lvl.silentLeadInBars, `level ${lvl.id}`).toBe(lvl.visibleMeasures - lvl.countInBars);
            expect(lvl.celloOnlyBars + lvl.metronomeBars, `level ${lvl.id}`).toBe(lvl.countInBars);
            // The ordering rule holds for every real level with room for it.
            if (lvl.visibleMeasures >= 2) {
                expect(lvl.countInBars, `level ${lvl.id}`).toBeGreaterThanOrEqual(2);
                expect(lvl.celloOnlyBars, `level ${lvl.id}`).toBeGreaterThanOrEqual(1);
            }
        });
    });

    // #994 deliberately removed every hand-written beatsOnScreen literal from levels.json so the
    // derivation is authoritative (AC1). Guards against one creeping back in.
    it('no side-scroll level relies on a hand-written beatsOnScreen literal', () => {
        sideScrollLevels.forEach((lvl) => {
            const ts = lvl.timeSignature ?? [4, 4];
            const expected = deriveLevelSpan({ bpm: lvl.bpm, timeSignature: ts });
            expect(lvl.beatsOnScreen, `level ${lvl.id}`).toBeCloseTo(expected.beatsOnScreen, 10);
            expect(lvl.leadInBars, `level ${lvl.id}`).toBe(expected.leadInBars);
        });
    });

    // The "no catalogue disruption" claim from the plan, asserted rather than assumed: every 4/4 level
    // in the 72-100 bpm band must come out exactly as it behaved before #994 (2 measures on screen,
    // 8 quarter-beats, a 2-measure count-in with the metronome in the second, no silent bars).
    it('leaves every 4/4 level at 72-100 bpm byte-identical to pre-#994 behaviour', () => {
        const unchanged = sideScrollLevels.filter((lvl) => {
            const ts = lvl.timeSignature ?? [4, 4];
            return ts[0] === 4 && ts[1] === 4 && lvl.bpm >= 72 && lvl.bpm <= 100;
        });
        expect(unchanged.length).toBeGreaterThanOrEqual(15);
        unchanged.forEach((lvl) => {
            expect(lvl.beatsOnScreen, `level ${lvl.id}`).toBe(8);
            expect(lvl.leadInBars, `level ${lvl.id}`).toBe(2);
            expect(lvl.countInBars, `level ${lvl.id}`).toBe(2);
            expect(lvl.metronomeBars, `level ${lvl.id}`).toBe(1);
            expect(lvl.silentLeadInBars, `level ${lvl.id}`).toBe(0);
        });
    });

    it('does not add span fields to non-side-scroll levels', () => {
        Object.values(LEVELS).filter((lvl) => !lvl.sideScroll).forEach((lvl) => {
            expect(lvl.visibleMeasures, `level ${lvl.id}`).toBeUndefined();
            expect(lvl.leadInBars, `level ${lvl.id}`).toBeUndefined();
        });
    });
});
