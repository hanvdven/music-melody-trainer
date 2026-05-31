import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import RangeStaffOverlay, { buildRangeRow, MIN_NOTE_WIDTH } from '../RangeStaffOverlay';
import { PERCUSSION_PRESETS } from '../../../../audio/drumKits';

// Naturals C4..C6 (15 notes) for the layout helper.
const mkNotes = () => {
    const out = [];
    for (let m = 60; m <= 84; m++) {
        const pc = ((m % 12) + 12) % 12;
        const letter = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' }[pc];
        if (letter) out.push({ midi: m, name: `${letter}${Math.floor(m / 12) - 1}` });
    }
    return out;
};

describe('buildRangeRow (diagonal-ellipsis layout)', () => {
    const notes = mkNotes(); // 15 naturals

    it('stays linear when there is room', () => {
        const wide = notes.length * (MIN_NOTE_WIDTH + 5);
        const l = buildRangeRow(notes, 60, 84, wide);
        expect(l.collapsed).toBe(false);
        expect(l.entries.length).toBe(notes.length);
        expect(l.gap).toBeNull();
    });

    it('collapses the in-band middle into a gap when cramped', () => {
        const tight = notes.length * (MIN_NOTE_WIDTH - 6); // forces collapse
        // Wide selection so the in-band middle is large enough to collapse.
        const l = buildRangeRow(notes, 62, 81, tight);
        expect(l.collapsed).toBe(true);
        expect(l.entries.length).toBeLessThan(notes.length);
        expect(l.gap).not.toBeNull();
        expect(l.colMidi.length).toBeGreaterThan(0);
        // Both boundary pitches survive (you can still drag them).
        const keptMidis = l.entries.map(e => e.midi);
        expect(keptMidis).toContain(62);
        expect(keptMidis).toContain(81);
    });

    it('does not collapse when the middle is too small', () => {
        const tight = notes.length * (MIN_NOTE_WIDTH - 6);
        const l = buildRangeRow(notes, 71, 72, tight); // narrow selection → tiny middle
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

    it('shows the range-selector mode indicator', () => {
        const { container } = renderOverlay();
        expect(container.querySelector('.range-mode-indicator')).not.toBeNull();
        expect(container.textContent).toContain('RANGE SELECTOR');
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
