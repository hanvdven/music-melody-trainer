import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import RangeStaffOverlay from '../RangeStaffOverlay';
import { PERCUSSION_PRESETS } from '../../../../audio/drumKits';

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

    it('draws preset groups for melodic staves + percussion', () => {
        const { container } = renderOverlay();
        expect(container.querySelectorAll('.range-presets').length).toBe(3); // treble + bass + percussion
        expect(container.textContent).toContain('STANDARD');
        expect(container.textContent).toContain('LARGE');
        expect(container.textContent).toContain('BASIC'); // percussion preset
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
