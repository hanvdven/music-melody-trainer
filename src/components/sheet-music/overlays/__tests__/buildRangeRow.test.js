import { describe, it, expect } from 'vitest';
import { buildRangeRow, CONTEXT_NOTES, rangeMiddleMinScale } from '../RangeStaffOverlay';
import { naturalsInRange, getNoteValue } from '../../../../utils/rangeUtils';

const NAT = naturalsInRange(21, 108);

describe('buildRangeRow — width distribution (Han 2026-06-01)', () => {
    it('spreads a narrow selection across (most of) the width — no left-bunching', () => {
        const avail = 800;
        const row = buildRangeRow(NAT, getNoteValue('C4'), getNoteValue('E4'), avail);
        // total slots × noteWidth ≈ avail (the notes fan out across the row).
        const span = row.entries.length * row.noteWidth;
        expect(span).toBeGreaterThan(avail * 0.7);
    });

    it('caps window growth so the diagonal row does not climb too far (MAX_CONTEXT)', () => {
        // Wide row but the window must NOT keep adding context indefinitely — at most
        // a handful of naturals beyond each boundary (bass-too-high fix).
        const row = buildRangeRow(NAT, getNoteValue('C4'), getNoteValue('E4'), 4000);
        const belowMin = row.entries.filter(e => e.midi < getNoteValue('C4')).length;
        const aboveMax = row.entries.filter(e => e.midi > getNoteValue('E4')).length;
        expect(belowMin).toBeLessThanOrEqual(5); // MAX_CONTEXT naturals
        expect(aboveMax).toBeLessThanOrEqual(5);
    });

    it('still keeps at least CONTEXT_NOTES beyond each boundary', () => {
        const row = buildRangeRow(NAT, getNoteValue('C4'), getNoteValue('E4'), 800);
        const midis = row.entries.map(e => e.midi);
        expect(midis.filter(m => m < getNoteValue('C4')).length).toBeGreaterThanOrEqual(CONTEXT_NOTES);
        expect(midis.filter(m => m > getNoteValue('E4')).length).toBeGreaterThanOrEqual(CONTEXT_NOTES);
        expect(row.collapsed).toBe(false);
    });
});

describe('rangeMiddleMinScale — span-dependent middle shrink (Han 2026-06-19)', () => {
    it('keeps small ranges full size (< 8 ordinal notes → 1.0)', () => {
        expect(rangeMiddleMinScale(4)).toBe(1.0);
        expect(rangeMiddleMinScale(7)).toBe(1.0);
    });

    it('shrinks to 0.90 at oSpan = 8', () => {
        expect(rangeMiddleMinScale(8)).toBeCloseTo(0.9, 10);
    });

    it('interpolates linearly between 8 and 12 (oSpan 10 → 0.70)', () => {
        expect(rangeMiddleMinScale(10)).toBeCloseTo(0.7, 10);
    });

    it('reaches 0.50 at oSpan = 12 and stays there for wider ranges', () => {
        expect(rangeMiddleMinScale(12)).toBeCloseTo(0.5, 10);
        expect(rangeMiddleMinScale(16)).toBe(0.5);
    });
});
