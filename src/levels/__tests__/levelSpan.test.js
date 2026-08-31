import { describe, it, expect } from 'vitest';
import { LEVELS, deriveLevelSpan } from '../levels';
import { TICKS_PER_WHOLE, TICKS_PER_BEAT } from '../../constants/timing';

// #994 (Han 2026-08-14/17, "flexible on screen notes"): a side-scroll level's on-screen span is derived
// from its OWN tempo and meter instead of the former fixed `LEVEL_LEAD_IN_BARS = 2`, targeting a roughly
// constant on-screen TIME (~6s). These tests guard the formula, the §108 tick/beat equality it must
// satisfy, the metronome stagger, and the promise that the bulk of the existing 4/4 catalogue is left
// byte-identical.
//
// Formula (see levels.js deriveLevelSpan):
//   targetBeats     = round(bpm/10)
//   visibleMeasures = max(1, roundHalfDown(targetBeats / beatsPerMeasure))   [roundHalfDown = ceil(x-0.5)]
//   leadInBars      = visibleMeasures
//   metronomeBars   = ceil(leadInBars / 2)
//   beatsOnScreen   = visibleMeasures * beatsPerMeasure   (NOT rounded — see the §108 test below)
//
// REJECTED DESIGN — DO NOT REINTRODUCE. An earlier #994 pass split the lead-in into `silentLeadInBars`
// + `celloOnlyBars` + `metronomeBars` via `countInBars = min(visibleMeasures, max(2,
// ceil(visibleMeasures/2)))`, leaving the earliest lead-in measures COMPLETELY silent. Han live-tested
// it on Kalinka and rejected it: *"alle opmaten cello+timpanen. de tweede helft (round up) + metronoom
// erbij"* — cello+timpani sound through the ENTIRE lead-in from its first measure, and only the
// metronome is staggered. The `noSilentLeadIn` assertions below exist to keep it that way.

describe('deriveLevelSpan — the #994 span formula', () => {
    // Han's own worked examples from the ticket + interview are the primary contract here.
    it('matches Han\'s worked examples: Kalinka 2/4 @90 -> 4 measures on screen; 3/4 @84 -> 3', () => {
        // "kalinka is 2/4, so a measure is really short. I would like to have 4 measures headstart
        // (so start at measure -3) and have 4 measures on screen, and a 2 measures count-in."
        const kalinka = deriveLevelSpan({ bpm: 90, timeSignature: [2, 4] });
        expect(kalinka.visibleMeasures).toBe(4);
        expect(kalinka.leadInBars).toBe(4);
        expect(kalinka.beatsOnScreen).toBe(8);
        // "een 2 maten count-in" -> the metronome joins for the second half of the 4-bar lead-in,
        // i.e. measures -1 and 0. Cello+timpani still cover all four.
        expect(kalinka.metronomeBars).toBe(2);

        // "Maybe 3/4 should have 3 measures on screen; -2,0; and 2 measure count in."
        const threeFour = deriveLevelSpan({ bpm: 84, timeSignature: [3, 4] });
        expect(threeFour.visibleMeasures).toBe(3);
        expect(threeFour.beatsOnScreen).toBe(9);
        expect(threeFour.metronomeBars).toBe(2);   // ceil(3/2)
    });

    // The tie-break is load-bearing, not cosmetic: Kalinka's quotient is exactly 4.5 (targetBeats 9 /
    // 2 beats per measure). Math.round (half-UP) would give 5 measures, contradicting Han's "4 measures
    // on screen"; Math.floor would fix Kalinka but give 3/4 @84 only 2 measures, contradicting "3/4
    // should have 3 measures on screen". Half-DOWN is the only tie-break satisfying both (decision A).
    it('rounds exact .5 quotients DOWN (Kalinka is exactly 4.5 — half-up would break Han\'s example)', () => {
        expect(deriveLevelSpan({ bpm: 90, timeSignature: [2, 4] }).visibleMeasures).toBe(4);
        expect(Math.round(4.5)).toBe(5);   // documents WHY a plain Math.round is wrong here
        // A non-.5 quotient must still round normally (2.67 -> 3, i.e. up).
        expect(deriveLevelSpan({ bpm: 84, timeSignature: [3, 4] }).visibleMeasures).toBe(3);
    });

    // §6c: the formula must generalise to ANY meter, compound or odd — no per-time-signature table.
    it.each([
        // bpm,  ts,       visible, metronomeBars, beatsOnScreen
        [90, [4, 4], 2, 1, 8],
        [80, [4, 4], 2, 1, 8],
        [120, [4, 4], 3, 2, 12],
        [150, [4, 4], 4, 2, 16],
        [90, [3, 4], 3, 2, 9],
        [90, [2, 4], 4, 2, 8],
        [96, [6, 8], 3, 2, 9],      // compound: 6/8 is 3 quarter-beats of TIME, not 6
        [92, [7, 8], 3, 2, 10.5],   // odd + FRACTIONAL beatsOnScreen (see the §108 test)
        [128, [5, 4], 3, 2, 15],
        [100, [11, 8], 2, 1, 11],   // never used by any shipped level — must still be derived
    ])('derives %i bpm %j correctly across simple, compound and odd meters', (bpm, ts, visible, metronomeBars, bos) => {
        const span = deriveLevelSpan({ bpm, timeSignature: ts });
        expect(span.visibleMeasures).toBe(visible);
        expect(span.leadInBars).toBe(visible);
        expect(span.metronomeBars).toBe(metronomeBars);
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

    // Han's corrected lead-in rule (live Kalinka UAT 2026-08-17). The metronome joins for the second
    // half of the lead-in, rounded up; cello+timpani cover ALL of it, so there is no silent-measure
    // concept and no count-in "window" field at all.
    it('staggers ONLY the metronome: metronomeBars = ceil(leadInBars/2), always within [1, leadInBars]', () => {
        const meters = [[4, 4], [3, 4], [2, 4], [6, 8], [7, 8], [5, 4]];
        const tempos = [30, 60, 80, 90, 110, 128, 150, 200];
        meters.forEach((ts) => tempos.forEach((bpm) => {
            const span = deriveLevelSpan({ bpm, timeSignature: ts });
            expect(span.metronomeBars).toBe(Math.ceil(span.leadInBars / 2));
            expect(span.metronomeBars).toBeGreaterThanOrEqual(1);
            expect(span.metronomeBars).toBeLessThanOrEqual(span.leadInBars);
        }));
    });

    it('exposes no silent-lead-in / count-in fields at all (the rejected design is gone)', () => {
        const span = deriveLevelSpan({ bpm: 90, timeSignature: [2, 4] });
        expect(span.silentLeadInBars).toBeUndefined();
        expect(span.countInBars).toBeUndefined();
        expect(span.celloOnlyBars).toBeUndefined();
        // Exactly the four fields consumers rely on — a stray extra field means someone re-added a concept.
        expect(Object.keys(span).sort()).toEqual(['beatsOnScreen', 'leadInBars', 'metronomeBars', 'visibleMeasures']);
    });

    // Readability floor (Han 2026-08-29 UAT of #1102): the very slow / wide-meter edge clamps to 2
    // visible measures, not 1 — a single measure is too little to read ahead even though it is still
    // ~6 s of music. `ceil(2/2) === 1`, so the metronome still joins for the last measure only.
    it('clamps to at least 2 visible measures (readability floor, #1102)', () => {
        const span = deriveLevelSpan({ bpm: 30, timeSignature: [7, 4] });
        expect(span.visibleMeasures).toBe(2);
        expect(span.leadInBars).toBe(2);
        expect(span.metronomeBars).toBe(1);
        // Absolute floor: never below 2 for any plausible tempo/meter.
        [1, 10, 20, 30].forEach((bpm) => {
            expect(deriveLevelSpan({ bpm, timeSignature: [12, 8] }).visibleMeasures).toBeGreaterThanOrEqual(2);
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
            expect(lvl.metronomeBars, `level ${lvl.id}`).toBe(Math.ceil(lvl.leadInBars / 2));
            expect(lvl.metronomeBars, `level ${lvl.id}`).toBeGreaterThanOrEqual(1);
            expect(lvl.metronomeBars, `level ${lvl.id}`).toBeLessThanOrEqual(lvl.leadInBars);
        });
    });

    // Guards Han's correction at the catalogue level: no level may carry a silent-lead-in concept.
    it('no level has any silent lead-in — cello/timpani cover the whole lead-in everywhere', () => {
        sideScrollLevels.forEach((lvl) => {
            expect(lvl.silentLeadInBars, `level ${lvl.id}`).toBeUndefined();
            expect(lvl.countInBars, `level ${lvl.id}`).toBeUndefined();
            expect(lvl.celloOnlyBars, `level ${lvl.id}`).toBeUndefined();
        });
    });

    // #994 deliberately removed every hand-written beatsOnScreen literal from levels.json so the
    // derivation is authoritative. Guards against one creeping back in.
    it('no side-scroll level relies on a hand-written beatsOnScreen literal', () => {
        sideScrollLevels.forEach((lvl) => {
            const ts = lvl.timeSignature ?? [4, 4];
            const expected = deriveLevelSpan({ bpm: lvl.bpm, timeSignature: ts });
            expect(lvl.beatsOnScreen, `level ${lvl.id}`).toBeCloseTo(expected.beatsOnScreen, 10);
            expect(lvl.leadInBars, `level ${lvl.id}`).toBe(expected.leadInBars);
        });
    });

    // The "no catalogue disruption" claim, asserted rather than assumed: every 4/4 level in the 72-100
    // bpm band must behave exactly as it did before #994 — 2 measures on screen, 8 quarter-beats, and
    // the metronome joining for the second of the two lead-in bars (the original #663 behaviour).
    it('leaves every 4/4 level at 72-100 bpm byte-identical to pre-#994 behaviour', () => {
        const unchanged = sideScrollLevels.filter((lvl) => {
            const ts = lvl.timeSignature ?? [4, 4];
            return ts[0] === 4 && ts[1] === 4 && lvl.bpm >= 72 && lvl.bpm <= 100;
        });
        expect(unchanged.length).toBeGreaterThanOrEqual(15);
        unchanged.forEach((lvl) => {
            expect(lvl.beatsOnScreen, `level ${lvl.id}`).toBe(8);
            expect(lvl.leadInBars, `level ${lvl.id}`).toBe(2);
            expect(lvl.metronomeBars, `level ${lvl.id}`).toBe(1);
        });
    });

    it('does not add span fields to non-side-scroll levels', () => {
        Object.values(LEVELS).filter((lvl) => !lvl.sideScroll).forEach((lvl) => {
            expect(lvl.visibleMeasures, `level ${lvl.id}`).toBeUndefined();
            expect(lvl.leadInBars, `level ${lvl.id}`).toBeUndefined();
        });
    });
});
