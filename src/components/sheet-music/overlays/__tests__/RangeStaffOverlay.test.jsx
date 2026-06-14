import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import RangeStaffOverlay, { buildRangeRow, MIN_NOTE_WIDTH, CONTEXT_NOTES } from '../RangeStaffOverlay';
import { PERCUSSION_PRESETS } from '../../../../audio/drumKits';

// Full piano naturals (A0..C8) for the layout helper.
const PIANO_NATURALS = (() => {
    const out = [];
    for (let m = 21; m <= 108; m++) {
        const letter = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' }[((m % 12) + 12) % 12];
        if (letter) out.push({ midi: m, name: `${letter}${Math.floor(m / 12) - 1}` });
    }
    return out;
})();
const countNaturals = (lo, hi) => PIANO_NATURALS.filter(n => n.midi >= lo && n.midi <= hi).length;

describe('buildRangeRow (boundary-relative window + diagonal ellipsis)', () => {
    it('windows to ≥CONTEXT_NOTES naturals beyond each boundary (balanced)', () => {
        // C4..C5 = 8 in-band naturals; size avail to exactly fit in-band + 2×CONTEXT
        // at MAX_NOTE_WIDTH so the width-fill growth (Han 2026-06-01) does NOT kick
        // in and we validate the minimum balanced window.
        const inBand = countNaturals(60, 72);           // 8
        const avail = (inBand + 2 * CONTEXT_NOTES) * 34; // 14 × MAX_NOTE_WIDTH
        const l = buildRangeRow(PIANO_NATURALS, 60, 72, avail);
        expect(l.collapsed).toBe(false);
        const midis = l.entries.map(e => e.midi);
        const belowMin = midis.filter(m => m < 60).length;
        const aboveMax = midis.filter(m => m > 72).length;
        expect(belowMin).toBe(CONTEXT_NOTES);
        expect(aboveMax).toBe(CONTEXT_NOTES);
    });

    it('GROWS the window so a narrow selection fills a wide row', () => {
        // Same selection on a much wider row: context grows symmetrically to fill
        // the width instead of bunching MAX_NOTE_WIDTH notes at the left.
        const l = buildRangeRow(PIANO_NATURALS, 60, 72, 9999);
        const midis = l.entries.map(e => e.midi);
        expect(midis.filter(m => m < 60).length).toBeGreaterThan(CONTEXT_NOTES);
        expect(midis.filter(m => m > 72).length).toBeGreaterThan(CONTEXT_NOTES);
    });

    it('collapses the in-band middle into a diagonal gap when cramped', () => {
        const tight = countNaturals(57, 84) * (MIN_NOTE_WIDTH - 7); // wide range, narrow row
        const l = buildRangeRow(PIANO_NATURALS, 60, 81, tight);
        expect(l.collapsed).toBe(true);
        expect(l.gap).not.toBeNull();
        const kept = l.entries.map(e => e.midi);
        expect(kept).toContain(60); // min survives
        expect(kept).toContain(81); // max survives
        // Symmetry: same count of kept naturals inside each boundary.
        const insideLow = kept.filter(m => m > 60 && m < 81).filter(m => m - 60 <= 6).length;
        const insideHigh = kept.filter(m => m > 60 && m < 81).filter(m => 81 - m <= 6).length;
        expect(insideLow).toBe(insideHigh);
    });

    it('does not collapse when the in-band middle is too small', () => {
        const tight = 8 * (MIN_NOTE_WIDTH - 7);
        const l = buildRangeRow(PIANO_NATURALS, 71, 72, tight); // tiny range
        expect(l.collapsed).toBe(false);
    });
});

// Smoke test for the in-SVG range selector. It renders the WHOLE path
// (RangeStaffOverlay → MelodyNotesLayer → renderMelodyNotes) so it catches
// runtime regressions in the synthetic-melody plumbing (e.g. unguarded
// melody.ties access, bad note shapes) that the build can't see.

const renderOverlay = (props = {}) => render(
    <svg>
        <RangeStaffOverlay
            startX={40}
            endX={600}
            trebleStart={100}
            bassStart={210}
            percussionStart={320}
            isTrebleVisible
            isBassVisible
            isPercussionVisible
            clefTreble="treble"
            clefBass="bass"
            trebleFrame={{ rowLow: 'A3', rowHigh: 'C6', presets: [
                { label: 'STANDARD', min: 'C4', max: 'E5' },
                { label: 'LARGE', min: 'C4', max: 'G5' },
                { label: 'FULL', min: 'A3', max: 'C6' },
            ] }}
            bassFrame={{ rowLow: 'C2', rowHigh: 'E4', presets: [
                { label: 'STANDARD', min: 'A2', max: 'C4' },
                { label: 'LARGE', min: 'G2', max: 'C4' },
                { label: 'FULL', min: 'C2', max: 'E4' },
            ] }}
            trebleRange={{ min: 'C4', max: 'E5' }}
            bassRange={{ min: 'A2', max: 'C4' }}
            timeSignature={{ numerator: 4, denominator: 4 }}
            theme="dark"
            {...props}
        />
    </svg>
);

describe('RangeStaffOverlay', () => {
    it('renders selectable noteheads across all three staves without throwing', () => {
        const { container } = renderOverlay();
        expect(container.querySelector('.range-overlay')).not.toBeNull();
        expect(container.querySelectorAll('.range-row').length).toBe(3);
        // Maestro noteheads are <text> glyphs — there should be many.
        expect(container.querySelectorAll('text').length).toBeGreaterThan(10);
    });

    it('draws preset brackets (no text) for melodic staves + percussion', () => {
        const { container } = renderOverlay();
        expect(container.querySelectorAll('.range-presets').length).toBe(3); // treble + bass + percussion
        // Presets render as bracket <path>s now, not text labels (Han 2026-05-31).
        expect(container.querySelectorAll('.range-presets-treble path').length).toBe(3);
        expect(container.querySelectorAll('.range-presets-percussion path').length).toBe(3);
    });

    it('toggles a percussion pad on tap', () => {
        const onTogglePad = vi.fn();
        const { container } = renderOverlay({
            enabledPads: [...PERCUSSION_PRESETS.STANDARD],
            onTogglePad,
        });
        // The per-pad hit rects carry the click handler; click the first one.
        const hitRects = container.querySelectorAll('.range-row-percussion rect');
        expect(hitRects.length).toBeGreaterThan(0);
        fireEvent.click(hitRects[0]);
        expect(onTogglePad).toHaveBeenCalledTimes(1);
        expect(typeof onTogglePad.mock.calls[0][0]).toBe('string');
    });

    it('applies a melodic preset on bracket tap', () => {
        const onApplyMelodicPreset = vi.fn();
        const { container } = renderOverlay({ onApplyMelodicPreset });
        const presetGroup = container.querySelector('.range-presets-treble g');
        fireEvent.click(presetGroup);
        // Callback now receives the clef-aware preset object {label,min,max}.
        expect(onApplyMelodicPreset).toHaveBeenCalledWith('treble', expect.objectContaining({
            label: expect.any(String), min: expect.any(String), max: expect.any(String),
        }));
    });

    it('renders nothing when geometry is missing', () => {
        const { container } = renderOverlay({ startX: null });
        expect(container.querySelector('.range-overlay')).toBeNull();
    });
});
