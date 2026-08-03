import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LevelSplash from '../LevelSplash';

const baseStats = {
    defeated: 5, misses: 3, longestStreak: 4, points: 4.5,
    perfect: 2, tooFast: 1, tooSlow: 1, muchTooFast: 0, muchTooSlow: 1,
    secondAttemptCorrected: 1, wrongUncorrected: 1, missed: 1, extraNote: 1,
};

// #662 (Han 2026-08-02, "haal de dubbele info weg... mogen weg"): the 4 KPI-style breakdown rows
// (missed / wrong-within-time / wrong-corrected / note-when-none-due) were removed from the plain stat
// grid — the charts below are now the sole source of that breakdown.
describe('LevelSplash (#659, well-done breakdown #661, KPI-row removal #662)', () => {
    it('renders only the slim stat rows for an untimed level (Level 1) without charts', () => {
        const { container, queryByText, getByText } = render(
            <LevelSplash levelName="Level 1" stats={baseStats} timed={false} onReplay={() => {}} onClose={() => {}} />,
        );
        expect(getByText('Slimes verslagen')).toBeTruthy();
        expect(getByText('Accuraatheid')).toBeTruthy();
        expect(getByText('Langste streak')).toBeTruthy();
        expect(queryByText('Punten')).toBeFalsy();          // points row is timed-only
        expect(queryByText('Gemiste noten')).toBeFalsy();
        expect(queryByText('Fout (binnen tijd)')).toBeFalsy();
        expect(queryByText('Fout, hersteld')).toBeFalsy();
        expect(queryByText('Noot zonder doel')).toBeFalsy();
        expect(container.querySelector('.ls-charts')).toBeNull();
    });

    it('renders the Punten row + both full-width charts for a timed level (Level 2/3), no KPI rows', () => {
        const { container, getByText, queryByText } = render(
            <LevelSplash levelName="Level 2" stats={baseStats} timed onReplay={() => {}} onClose={() => {}} />,
        );
        expect(getByText('Punten')).toBeTruthy();
        expect(queryByText('Gemiste noten')).toBeFalsy();
        expect(queryByText('Fout (binnen tijd)')).toBeFalsy();
        expect(queryByText('Fout, hersteld')).toBeFalsy();
        expect(queryByText('Noot zonder doel')).toBeFalsy();
        expect(container.querySelector('.ls-charts')).toBeTruthy();
        // TimingBarChart + NoteCorrectnessBar each render an <svg role="img">
        expect(container.querySelectorAll('svg[role="img"]').length).toBe(2);
    });
});
