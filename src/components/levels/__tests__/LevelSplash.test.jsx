import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LevelSplash from '../LevelSplash';

const baseStats = {
    defeated: 5, misses: 3, longestStreak: 4, points: 4.5,
    perfect: 2, tooFast: 1, tooSlow: 1, muchTooFast: 0, muchTooSlow: 1,
    secondAttemptCorrected: 1, wrongUncorrected: 1, missed: 1, extraNote: 1,
};

describe('LevelSplash (#659, well-done breakdown #661)', () => {
    it('renders the plain stat rows for an untimed level (Level 1) without charts', () => {
        const { container, queryByText } = render(
            <LevelSplash levelName="Level 1" stats={baseStats} timed={false} onReplay={() => {}} onClose={() => {}} />,
        );
        expect(queryByText('Gemiste noten')).toBeTruthy();
        expect(queryByText('Punten')).toBeFalsy();          // points row is timed-only
        expect(queryByText('Fout (binnen tijd)')).toBeFalsy();
        expect(container.querySelector('.ls-charts')).toBeNull();
    });

    it('renders the 4-way breakdown rows + both charts for a timed level (Level 2/3)', () => {
        const { container, getByText } = render(
            <LevelSplash levelName="Level 2" stats={baseStats} timed onReplay={() => {}} onClose={() => {}} />,
        );
        expect(getByText('Punten')).toBeTruthy();
        expect(getByText('Gemiste noten')).toBeTruthy();
        expect(getByText('Fout (binnen tijd)')).toBeTruthy();
        expect(getByText('Fout, hersteld')).toBeTruthy();
        expect(getByText('Noot zonder doel')).toBeTruthy();
        expect(container.querySelector('.ls-charts')).toBeTruthy();
        // TimingBarChart + NoteCorrectnessGauge each render an <svg role="img">
        expect(container.querySelectorAll('svg[role="img"]').length).toBe(2);
    });
});
