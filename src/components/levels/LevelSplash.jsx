import React from 'react';
import './LevelSplash.css';
import { TimingBarChart, NoteCorrectnessBar } from './LevelStatsCharts';

// #659 Level-complete splash: "Well done!" + stats (Han). Timing precision is intentionally omitted for
// levels without a metronome (Han) — `timed` (side-scroll levels) adds a Punten row + two full-width
// charts (Han: "maken we meteen onderscheid tussen timing precision en note accuracy"): a timing bar
// chart (WHEN a note was played — 5 gradeHit tiers + missed) and a note-correctness bar (WHETHER the
// pitch was right at all — 4 outcomes, MUTUALLY EXCLUSIVE final verdicts, see useLevel.js emptyStats +
// SheetRpgLayer's combat effect) — see LevelStatsCharts.jsx. The old plain-text KPI rows for these same
// 4 outcomes (missed / wrong-within-time / wrong-corrected / note-when-none-due) were removed (Han
// 2026-08-02, "haal de dubbele info weg... mogen weg") — the charts ARE the breakdown now, so showing
// both was redundant and left no room for the charts to use the splash's full width.
export default function LevelSplash({ levelName, stats, timed = false, totalEnemies = 0, totalCritters = 0, onReplay, onClose }) {
    const attempts = stats.defeated + stats.misses;
    const accuracy = attempts > 0 ? Math.round((stats.defeated / attempts) * 100) : 100;
    // Han 2026-08-02 ("haal de dubbele info weg... de 'kpi' stijl info: gemist, fout (binnen tijd),
    // fout (hersteld), noot zonder doel, mogen weg"): those 4 rows duplicated what the timing/
    // correctness charts below already show (the charts' bars/segments ARE the breakdown now), so
    // they're removed here — freeing up width for the charts (see .ls-charts / LevelStatsCharts).
    // #693 round 8 (Han: "maak ervan: enemies vanquished x/n... en critters saved y/m"): both now show
    // a fraction against their level TOTAL (reported up from SheetRpgLayer as the melody's slime/critter
    // counts become known) — "critters saved" is deliberately the POSITIVE framing (total minus the
    // running `critterKilled` count), not a running kill-count, so a higher number always reads as good.
    const rows = [
        { label: 'Enemies vanquished', value: `${stats.defeated}/${totalEnemies}` },
        { label: 'Accuraatheid', value: `${accuracy}%` },
        ...(timed && totalCritters > 0 ? [
            { label: 'Critters saved', value: `${totalCritters - stats.critterKilled}/${totalCritters}` },
        ] : []),
        ...(timed ? [
            { label: 'Punten', value: stats.points },
        ] : []),
        { label: 'Langste streak', value: stats.longestStreak },
    ];
    return (
        <div className="ls-overlay" onClick={onClose}>
            <div className={`ls-card${timed ? ' ls-card-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
                <div className="ls-badge">🏆</div>
                <h2 className="ls-title">Well done!</h2>
                <div className="ls-sub">{levelName} voltooid</div>
                <div className="ls-stats">
                    {rows.map((r) => (
                        <div key={r.label} className="ls-stat">
                            <span className="ls-stat-value">{r.value}</span>
                            <span className="ls-stat-label">{r.label}</span>
                        </div>
                    ))}
                </div>
                {timed && (
                    <div className="ls-charts">
                        <div className="ls-chart-block">
                            <div className="ls-chart-title">Timing accuracy</div>
                            <TimingBarChart stats={stats} />
                        </div>
                        <div className="ls-chart-block">
                            <div className="ls-chart-title">Note correctness</div>
                            <NoteCorrectnessBar stats={stats} />
                        </div>
                    </div>
                )}
                <div className="ls-actions">
                    <button className="ls-btn ls-replay" onClick={onReplay}>↻ Opnieuw</button>
                    <button className="ls-btn" onClick={onClose}>Sluiten</button>
                </div>
            </div>
        </div>
    );
}
