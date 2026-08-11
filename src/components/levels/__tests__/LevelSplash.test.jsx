import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LevelSplash from '../LevelSplash';

const baseStats = {
    defeated: 5, misses: 3, longestStreak: 4, points: 4.5,
    perfect: 2, tooFast: 1, tooSlow: 1, muchTooFast: 0, muchTooSlow: 1,
    secondAttemptCorrected: 1, wrongUncorrected: 1, missed: 1, extraNote: 1,
    critterKilled: 0,
};

// #662 (Han 2026-08-02, "haal de dubbele info weg... mogen weg"): the 4 KPI-style breakdown rows
// (missed / wrong-within-time / wrong-corrected / note-when-none-due) were removed from the plain stat
// grid — the charts below are now the sole source of that breakdown.
describe('LevelSplash (#659, well-done breakdown #661, KPI-row removal #662)', () => {
    it('renders only the slim stat rows for an untimed level (Level 1) without charts', () => {
        const { container, queryByText, getByText } = render(
            <LevelSplash levelName="Level 1" stats={baseStats} timed={false} onReplay={() => {}} onClose={() => {}} />,
        );
        expect(getByText('Enemies vanquished')).toBeTruthy();
        expect(getByText('Accuraatheid')).toBeTruthy();
        expect(getByText('Langste streak')).toBeTruthy();
        expect(queryByText('Punten')).toBeFalsy();          // points row is timed-only
        expect(queryByText('Gemiste noten')).toBeFalsy();
        expect(queryByText('Fout (binnen tijd)')).toBeFalsy();
        expect(queryByText('Fout, hersteld')).toBeFalsy();
        expect(queryByText('Noot zonder doel')).toBeFalsy();
        expect(container.querySelector('.ls-chart-block')).toBeNull();
    });

    // #863 (Han 2026-08-10, "de note correctness mag weg, want alle info staat nu in timing accuracy"):
    // NoteCorrectnessBar is gone — the timing chart alone (now carrying note-when-none-due/corrected/
    // missed too) is the single chart block.
    it('renders the Punten row + the timing chart for a timed level (Level 2/3), no KPI rows', () => {
        const { container, getByText, queryByText } = render(
            <LevelSplash levelName="Level 2" stats={baseStats} timed onReplay={() => {}} onClose={() => {}} />,
        );
        expect(getByText('Punten')).toBeTruthy();
        expect(queryByText('Gemiste noten')).toBeFalsy();
        expect(queryByText('Fout (binnen tijd)')).toBeFalsy();
        expect(queryByText('Fout, hersteld')).toBeFalsy();
        expect(queryByText('Noot zonder doel')).toBeFalsy();
        expect(container.querySelector('.ls-chart-block')).toBeTruthy();
        expect(container.querySelectorAll('svg[role="img"]').length).toBe(1);
    });

    // #693 round 8 (Han: "maak ervan: enemies vanquished x/n... en critters saved y/m"): both figures show
    // a fraction against the level's TOTAL; critters is framed POSITIVELY (saved = total − killed), and is
    // only shown when the level actually had critters (totalCritters > 0 — Level 1/2 style levels with no
    // rests shouldn't show a meaningless "0/0" row).
    it('shows enemies/critters as fractions of their level totals', () => {
        const { getByText } = render(
            <LevelSplash levelName="Level 9" stats={{ ...baseStats, critterKilled: 2 }} timed
                totalEnemies={12} totalCritters={6} onReplay={() => {}} onClose={() => {}} />,
        );
        expect(getByText('5/12')).toBeTruthy();          // defeated/totalEnemies
        expect(getByText('Critters saved')).toBeTruthy();
        expect(getByText('4/6')).toBeTruthy();            // (totalCritters − critterKilled)/totalCritters
    });

    it('hides the critters-saved row when the level had no critters (totalCritters 0)', () => {
        const { queryByText } = render(
            <LevelSplash levelName="Level 2" stats={baseStats} timed
                totalEnemies={8} totalCritters={0} onReplay={() => {}} onClose={() => {}} />,
        );
        expect(queryByText('Critters saved')).toBeFalsy();
    });
});
