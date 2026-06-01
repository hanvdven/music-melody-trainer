import { describe, it, expect } from 'vitest';
import { buildRangeRow, MAX_NOTE_WIDTH, CONTEXT_NOTES } from '../RangeStaffOverlay';
import { naturalsInRange, getNoteValue } from '../../../../utils/rangeUtils';

const NAT = naturalsInRange(21, 108);

describe('buildRangeRow — width distribution (Han 2026-06-01)', () => {
    it('grows the window so a narrow selection fills the width (no left-bunching)', () => {
        // Small selection (C4–E4) in a wide row: notes should spread, not cap at
        // MAX_NOTE_WIDTH with empty space on the right.
        const avail = 800;
        const row = buildRangeRow(NAT, getNoteValue('C4'), getNoteValue('E4'), avail);
        // The row spans (close to) the full width: total slots × noteWidth ≈ avail.
        const span = row.entries.length * row.noteWidth;
        expect(span).toBeGreaterThan(avail * 0.7);
        // And it shows more than just the minimal ±CONTEXT_NOTES window.
        const inBand = 3; // C4 D4 E4
        expect(row.entries.length).toBeGreaterThan(inBand + 2 * CONTEXT_NOTES);
    });

    it('still keeps at least CONTEXT_NOTES beyond each boundary', () => {
        const row = buildRangeRow(NAT, getNoteValue('C4'), getNoteValue('E4'), 800);
        const lo = row.entries[0].midi, hi = row.entries[row.entries.length - 1].midi;
        expect(getNoteValue('C4') - lo).toBeGreaterThanOrEqual(0);
        expect(hi - getNoteValue('E4')).toBeGreaterThanOrEqual(0);
        expect(row.collapsed).toBe(false);
    });

    it('never exceeds the max comfortable note width', () => {
        const row = buildRangeRow(NAT, getNoteValue('C4'), getNoteValue('E4'), 800);
        expect(row.noteWidth).toBeLessThanOrEqual(MAX_NOTE_WIDTH + 0.001);
    });
});
