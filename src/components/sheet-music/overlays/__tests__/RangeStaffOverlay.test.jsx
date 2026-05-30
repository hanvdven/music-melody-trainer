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

    it('labels the current min and max boundary notes', () => {
        const { container } = renderOverlay();
        expect(container.textContent).toContain('C4'); // treble min (and bass max)
        expect(container.textContent).toContain('E5'); // treble max
        expect(container.textContent).toContain('A2'); // bass min
    });

    it('renders nothing when geometry is missing', () => {
        const { container } = renderOverlay({ startX: null });
        expect(container.querySelector('.range-overlay')).toBeNull();
    });
});
