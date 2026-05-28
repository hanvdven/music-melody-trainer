import { describe, it, expect } from 'vitest';
import {
    PAGINATION_VARIANTS,
    PAGINATION_CLAMP_FALLBACK_MEASURES,
    computeSequenceBoundaries,
    planPaginationFade,
    planPaginationSequence,
} from '../transitionPlanner';

// 4/4: whole = 48 ticks per measure.
const TPM = 48;

describe('computeSequenceBoundaries', () => {
    it('single measure × single repeat: one series-flip at end', () => {
        const out = computeSequenceBoundaries({
            numMeasures: 1, repsPerMelody: 1, measureLengthTicks: TPM, musicalBlocks: [1],
        });
        expect(out).toHaveLength(1);
        expect(out[0].kind).toBe('series-flip');
        expect(out[0].atTick).toBe(TPM);
    });

    it('once-mode (reps=1) with 4 measures, 1 visual block → only series-flip', () => {
        const out = computeSequenceBoundaries({
            numMeasures: 4, repsPerMelody: 1, measureLengthTicks: TPM, musicalBlocks: [4],
        });
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({
            kind: 'series-flip',
            atTick: 4 * TPM,
            repeatIndex: 0,
            visualBlockIndex: 0,
        });
    });

    it('Han\'s 5 measures × 3 reps × musicalBlocks=[3,2] example', () => {
        const out = computeSequenceBoundaries({
            numMeasures: 5, repsPerMelody: 3, measureLengthTicks: TPM, musicalBlocks: [3, 2],
        });
        // Boundaries (in ticks):  3m, 5m, 8m, 10m, 13m, 15m
        // Kinds:                  visual, repeat, visual, repeat, visual, series
        const expected = [
            { kind: 'visual-flip', atTick: 3 * TPM, repeatIndex: 0 },
            { kind: 'repeat-flip', atTick: 5 * TPM, repeatIndex: 0 },
            { kind: 'visual-flip', atTick: 8 * TPM, repeatIndex: 1 },
            { kind: 'repeat-flip', atTick: 10 * TPM, repeatIndex: 1 },
            { kind: 'visual-flip', atTick: 13 * TPM, repeatIndex: 2 },
            { kind: 'series-flip', atTick: 15 * TPM, repeatIndex: 2 },
        ];
        expect(out.map(b => ({ kind: b.kind, atTick: b.atTick, repeatIndex: b.repeatIndex })))
            .toEqual(expected);
    });

    it('1-measure sequence block, 4 reps → 4 boundaries, last is series-flip', () => {
        const out = computeSequenceBoundaries({
            numMeasures: 1, repsPerMelody: 4, measureLengthTicks: TPM, musicalBlocks: [1],
        });
        expect(out).toHaveLength(4);
        expect(out.slice(0, 3).every(b => b.kind === 'repeat-flip')).toBe(true);
        expect(out[3].kind).toBe('series-flip');
        expect(out.map(b => b.atTick)).toEqual([TPM, 2 * TPM, 3 * TPM, 4 * TPM]);
    });

    it('newWindowStartLocal tracks position within the new repeat', () => {
        const out = computeSequenceBoundaries({
            numMeasures: 5, repsPerMelody: 2, measureLengthTicks: TPM, musicalBlocks: [3, 2],
        });
        // visual-flip after first 3 measures → enters block starting at local tick 3m
        expect(out[0]).toMatchObject({ kind: 'visual-flip', newWindowStartLocal: 3 * TPM });
        // repeat-flip after measure 5 → enters new repeat at local tick 0
        expect(out[1]).toMatchObject({ kind: 'repeat-flip', newWindowStartLocal: 0 });
    });

    it('returns empty array for invalid plans', () => {
        expect(computeSequenceBoundaries({ numMeasures: 0, repsPerMelody: 1, measureLengthTicks: TPM, musicalBlocks: [] })).toEqual([]);
        expect(computeSequenceBoundaries({ numMeasures: 4, repsPerMelody: 0, measureLengthTicks: TPM, musicalBlocks: [4] })).toEqual([]);
        expect(computeSequenceBoundaries({ numMeasures: 4, repsPerMelody: 1, measureLengthTicks: TPM, musicalBlocks: [] })).toEqual([]);
    });

    it('window-size fields reflect the blocks being left and entered', () => {
        const out = computeSequenceBoundaries({
            numMeasures: 7, repsPerMelody: 1, measureLengthTicks: TPM, musicalBlocks: [3, 2, 2],
        });
        // visual-flip after block of size 3, entering block of size 2
        expect(out[0]).toMatchObject({
            kind: 'visual-flip',
            oldWindowSizeMeasures: 3,
            newWindowSizeMeasures: 2,
        });
        // visual-flip after block of size 2, entering block of size 2
        expect(out[1]).toMatchObject({
            kind: 'visual-flip',
            oldWindowSizeMeasures: 2,
            newWindowSizeMeasures: 2,
        });
        // series-flip after final block of size 2
        expect(out[2]).toMatchObject({
            kind: 'series-flip',
            oldWindowSizeMeasures: 2,
        });
    });
});

describe('planPaginationFade — variant timings', () => {
    const makeBoundary = (oldSize = 4) => ({
        kind: 'series-flip',
        atTick: 10 * TPM,
        repeatIndex: 0,
        visualBlockIndex: 0,
        newWindowStartLocal: 0,
        oldWindowSizeMeasures: oldSize,
        newWindowSizeMeasures: oldSize,
    });

    it('snel: 0.5m generation lead, 0.25m fade, ends at boundary', () => {
        const fade = planPaginationFade({
            boundary: makeBoundary(), variant: 'snel', measureLengthTicks: TPM,
        });
        expect(fade.fadeEndTick).toBe(10 * TPM);
        expect(fade.fadeStartTick).toBe(10 * TPM - 0.25 * TPM);
        expect(fade.generationDeadlineTick).toBe(10 * TPM - 0.5 * TPM);
        expect(fade.fadeDurationMeasures).toBe(0.25);
        expect(fade.isClamped).toBe(false);
    });

    it('mid: 1m generation lead, 0.5m fade, ends at boundary', () => {
        const fade = planPaginationFade({
            boundary: makeBoundary(), variant: 'mid', measureLengthTicks: TPM,
        });
        expect(fade.fadeEndTick).toBe(10 * TPM);
        expect(fade.fadeStartTick).toBe(10 * TPM - 0.5 * TPM);
        expect(fade.generationDeadlineTick).toBe(10 * TPM - 1.0 * TPM);
        expect(fade.fadeDurationMeasures).toBe(0.5);
    });

    // 'lang' variant removed 2026-05-28 (Han: no use case) — its dedicated
    // test for 2m fade + 0.25m overshoot was deleted alongside the variant.
    // The fallback-to-mid test below now also covers the case where 'lang' is
    // passed in by legacy localStorage.

    it('unknown variant falls back to mid', () => {
        const fade = planPaginationFade({
            boundary: makeBoundary(), variant: 'banana', measureLengthTicks: TPM,
        });
        expect(fade.fadeDurationMeasures).toBe(PAGINATION_VARIANTS.mid.fadeDurationMeasures);
    });
});

describe('planPaginationFade — clamping', () => {
    // The lang-variant clamping test was deleted with the variant on
    // 2026-05-28. mid + snel never reach the 1-measure clamp boundary on
    // their own — see the mid 0.25m-block test below for the live clamp case.

    it('mid variant on a 0.5-measure block: fade exactly fills the block (no clamp)', () => {
        const boundary = {
            kind: 'visual-flip',
            atTick: 0.5 * TPM,
            oldWindowSizeMeasures: 0.5,
            newWindowSizeMeasures: 1,
            repeatIndex: 0, visualBlockIndex: 0, newWindowStartLocal: 0,
        };
        const fade = planPaginationFade({ boundary, variant: 'mid', measureLengthTicks: TPM });
        // mid has 0 overshoot, fade duration = 0.5m, block = 0.5m → fits exactly.
        expect(fade.isClamped).toBe(false);
        expect(fade.fadeDurationMeasures).toBe(0.5);
        expect(fade.fadeStartTick).toBe(0); // start of old block
    });

    it('mid variant on a 0.25-measure block clamps to fallback', () => {
        const boundary = {
            kind: 'visual-flip',
            atTick: 0.25 * TPM,
            oldWindowSizeMeasures: 0.25,
            newWindowSizeMeasures: 1,
            repeatIndex: 0, visualBlockIndex: 0, newWindowStartLocal: 0,
        };
        const fade = planPaginationFade({ boundary, variant: 'mid', measureLengthTicks: TPM });
        // Requested 0.5m > block 0.25m → clamp.
        expect(fade.isClamped).toBe(true);
        // min(fallback=0.5, oldSize=0.25) = 0.25
        expect(fade.fadeDurationMeasures).toBe(0.25);
    });

    it('snel variant on a 2-measure block: no clamping', () => {
        const boundary = {
            kind: 'visual-flip',
            atTick: 2 * TPM,
            oldWindowSizeMeasures: 2,
            newWindowSizeMeasures: 2,
            repeatIndex: 0, visualBlockIndex: 0, newWindowStartLocal: 0,
        };
        const fade = planPaginationFade({ boundary, variant: 'snel', measureLengthTicks: TPM });
        expect(fade.isClamped).toBe(false);
        expect(fade.fadeDurationMeasures).toBe(0.25);
    });
});

describe('planPaginationSequence — integration', () => {
    // Han's lang-variant integration test removed 2026-05-28 with the variant.
    // The series-flip generation-deadline behaviour is now exercised by the
    // snel/mid integration tests below.

    it('snel/mid variants: fade ends exactly at boundary (no overshoot)', () => {
        const plan = {
            numMeasures: 4, repsPerMelody: 1, measureLengthTicks: TPM, musicalBlocks: [4],
        };
        for (const variant of ['snel', 'mid']) {
            const out = planPaginationSequence({ plan, variant });
            expect(out[0].fade.fadeEndTick).toBe(out[0].boundary.atTick);
        }
    });

    it('snel variant: generation deadline gives breathing room before fade start', () => {
        const plan = {
            numMeasures: 4, repsPerMelody: 1, measureLengthTicks: TPM, musicalBlocks: [4],
        };
        const out = planPaginationSequence({ plan, variant: 'snel' });
        const series = out[0];
        expect(series.fade.generationDeadlineTick).toBe(4 * TPM - 0.5 * TPM);
        expect(series.fade.fadeStartTick).toBe(4 * TPM - 0.25 * TPM);
        // Generation deadline is BEFORE fade start (0.25m of buffer).
        expect(series.fade.generationDeadlineTick).toBeLessThan(series.fade.fadeStartTick);
    });
});
