import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ExerciseStaffOverlay from '../ExerciseStaffOverlay';
import { EXERCISES, AXIS_ORDER } from '../../../../exercises/exerciseIndex';
import { ProfileProvider } from '../../../../contexts/ProfileContext';

const baseAxes = { melodyType: 'scales', input: 'read', tempo: 'fixed', evaluation: 1 };

const renderOverlay = (props = {}) => render(
    // ProfileProvider: the overlay reads exerciseProgress (#268) from the profile.
    <ProfileProvider>
    <svg>
        <ExerciseStaffOverlay
            startX={100} endX={700} trebleStart={100} bassStart={170}
            isTrebleVisible
            activeExerciseId="scale-runs"
            axes={baseAxes}
            onSelectExercise={() => {}}
            onAxisChange={() => {}}
            onStartExercise={() => {}}
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

    it('renders all preset titles in ALL CAPS plus one carousel per axis (§6d — no flat option rows)', () => {
        const { container } = renderOverlay();
        const labels = [...container.querySelectorAll('text')].map(t => t.textContent);
        for (const e of EXERCISES) expect(labels).toContain(e.title);
        // Every visible axis-option label is uppercase (standing all-caps carousel CR).
        const optionTexts = labels.filter(l => /^[A-Z×∞]/.test(l));
        for (const l of optionTexts) expect(l).toBe(l.toUpperCase());
        // One NonLinearCarousel hit surface per axis + one for the presets. The
        // §3a hit boxes live INSIDE NonLinearCarousel; here we assert the axis
        // labels exist so all four carousels mounted.
        expect(labels).toEqual(expect.arrayContaining(['MELODY', 'INPUT', 'TEMPO', 'REPEAT']));
        expect(AXIS_ORDER.length).toBe(4);
    });

    it('renders the prominent START button and fires onStartExercise on click', () => {
        const onStartExercise = vi.fn();
        const { container } = renderOverlay({ onStartExercise });
        const startText = [...container.querySelectorAll('text')].find(t => t.textContent === 'START');
        expect(startText).toBeTruthy();
        fireEvent.click(startText.parentElement); // the button <g> owns the click handler
        expect(onStartExercise).toHaveBeenCalledTimes(1);
    });

    it('renders repeat counts in the Maestro notation font with the À glyph (#298 rework)', () => {
        // Han 2026-07-05: numRepeats must render EXACTLY like the sheet header's
        // RepeatsControls and the BPM — Maestro font, "N À" — everywhere.
        const { container } = renderOverlay({ axes: { ...baseAxes, evaluation: 2 } });
        const maestro = [...container.querySelectorAll('text')]
            .filter(t => t.getAttribute('font-family') === 'Maestro');
        expect(maestro.length).toBeGreaterThan(0);
        expect(maestro.some(t => t.textContent.includes('À'))).toBe(true);
    });

    it('shows the BadgeCheck until-correct icon when evaluation is leftmost', () => {
        const { container } = renderOverlay({ axes: { ...baseAxes, evaluation: 'until' } });
        // lucide renders an <svg class="lucide-badge-check"> nested in the group.
        expect(container.querySelector('.lucide-badge-check')).not.toBeNull();
    });

    it('draws the START debug hit box only in debug mode (§3a)', () => {
        const { container: off } = renderOverlay();
        const { container: on } = renderOverlay({ debugMode: true });
        const orangeRects = (c) => [...c.querySelectorAll('rect')].filter(r => r.getAttribute('fill') === 'orange');
        expect(orangeRects(on).length).toBeGreaterThan(orangeRects(off).length);
    });
});
