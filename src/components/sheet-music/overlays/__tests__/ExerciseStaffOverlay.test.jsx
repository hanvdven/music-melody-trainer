import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ExerciseStaffOverlay from '../ExerciseStaffOverlay';
import { AXIS_ORDER } from '../../../../exercises/exerciseIndex';
import { ProfileProvider } from '../../../../contexts/ProfileContext';

const baseAxes = { melodyType: 'scales', input: 'read', tempo: 'fixed', evaluation: 1 };

const renderOverlay = (props = {}) => render(
    // ProfileProvider: the overlay reads exerciseProgress (#268) from the profile.
    <ProfileProvider>
        <svg>
            <ExerciseStaffOverlay
                startX={100} endX={700} systemEndX={700}
                trebleStart={100} bassStart={170} percussionStart={240}
                isTrebleVisible isBassVisible isPercussionVisible
                activeExerciseId="scale-runs"
                axes={baseAxes}
                onSelectExercise={() => {}}
                onAxisChange={() => {}}
                {...props}
            />
        </svg>
    </ProfileProvider>,
);

describe('ExerciseStaffOverlay', () => {
    it('renders under the .exercise-overlay morph group, SVG-native (no foreignObject)', () => {
        const { container } = renderOverlay();
        expect(container.querySelector('.exercise-overlay')).not.toBeNull();
        expect(container.querySelectorAll('foreignObject').length).toBe(0);
    });

    it('#560: three stacked per-staff carousels (preset/melody/input) + tempo/repeat fans, no START', () => {
        const { container } = renderOverlay();
        const labels = [...container.querySelectorAll('text')].map(t => t.textContent);
        // The three row headers + the two chords-band fan headers (serif-italic, non-caps, §59).
        expect(labels).toEqual(expect.arrayContaining(['preset', 'melody type', 'input type', 'tempo', 'repeat']));
        // The active preset value shows at rest (hidden carousels mount only the active item).
        expect(labels).toContain('SCALE RUNS');
        // START is gone — it lives in the header now (Han 2026-07-25).
        expect(labels).not.toContain('START');
        // Four settable axes still exist in the registry.
        expect(AXIS_ORDER.length).toBe(4);
    });

    it('renders repeat counts in the Maestro notation font with the À glyph (#298; Maestro reverted #494)', () => {
        const { container } = renderOverlay({ axes: { ...baseAxes, evaluation: 2 } });
        const maestro = [...container.querySelectorAll('text, tspan')]
            .filter(t => t.getAttribute('font-family') === 'Maestro');
        expect(maestro.some(t => (t.textContent || '').includes('À'))).toBe(true);
        expect(maestro.some(t => (t.textContent || '').includes('2'))).toBe(true);
    });

    it("shows a cursive x + À for 'until correct' (unknown repeat count, #494)", () => {
        const { container } = renderOverlay({ axes: { ...baseAxes, evaluation: 'until' } });
        const italicX = [...container.querySelectorAll('tspan')]
            .find(t => t.textContent === 'x' && t.getAttribute('font-style') === 'italic'
                && t.getAttribute('font-family') === 'Academico');
        expect(italicX).toBeTruthy();
        const maestroMark = [...container.querySelectorAll('tspan')]
            .find(t => t.textContent === 'À' && t.getAttribute('font-family') === 'Maestro');
        expect(maestroMark).toBeTruthy();
    });
});
