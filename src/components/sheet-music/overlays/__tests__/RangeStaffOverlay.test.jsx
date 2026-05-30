import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import RangeStaffOverlay from '../RangeStaffOverlay';

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

    it('draws preset brackets (STANDARD/LARGE/FULL) for the melodic staves', () => {
        const { container } = renderOverlay();
        expect(container.querySelectorAll('.range-presets').length).toBe(2); // treble + bass
        expect(container.textContent).toContain('STANDARD');
        expect(container.textContent).toContain('LARGE');
        expect(container.textContent).toContain('FULL');
    });

    it('shows the range-selector mode indicator', () => {
        const { container } = renderOverlay();
        expect(container.querySelector('.range-mode-indicator')).not.toBeNull();
        expect(container.textContent).toContain('RANGE SELECTOR');
    });

    it('renders nothing when geometry is missing', () => {
        const { container } = renderOverlay({ startX: null });
        expect(container.querySelector('.range-overlay')).toBeNull();
    });
});
