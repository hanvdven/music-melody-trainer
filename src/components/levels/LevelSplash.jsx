import React from 'react';
import './LevelSplash.css';
import { TimingBarChart, TimingLegend, computeAccuracyPercent, extractHandStats } from './LevelStatsCharts';

// #659/#863 Level-complete panel: "Well done!" + stats (Han). Timing precision is intentionally omitted
// for levels without a metronome (Han) — `timed` (side-scroll levels) adds a Punten row + the timing
// chart (Han: "maken we meteen onderscheid tussen timing precision en note accuracy").
//
// #863 (Han 2026-08-10, "zet het splash screen in zijn volledigheid in de top view... KPI's kunnen dan
// in 2 regels, en de timing accuracy kan veel meer plaats innemen... de note correctness mag weg"):
// this used to be a floating `.ls-overlay` modal; it now renders INLINE in App.jsx's top-view slot
// (characterScreen === 'levelResult', alongside the avatar/stats/bestiary panels) — no backdrop, no
// fixed positioning, full width of that slot. The separate note-correctness bar is gone entirely (its
// info is now fully covered by the timing chart's note-when-none-due/corrected/missed segments, see
// LevelStatsCharts.jsx) — freeing the width and height the timing chart now uses instead.
export default function LevelSplash({
    levelName, stats, timed = false, totalEnemies = 0, totalCritters = 0,
    twoHanded = false, onReplay, onClose,
}) {
    // Han 2026-08-10: replaced the old `defeated/(defeated+misses)` formula with a weighted score —
    // see computeAccuracyPercent's own comment in LevelStatsCharts.jsx for the exact formula.
    const accuracy = computeAccuracyPercent(stats);
    // #862 (Han 2026-08-10, "ik wil dat elke balk in twee gesplitst wordt (two-hand levels only)"): only
    // twoHanded levels have a meaningful bass/treble split (every other level's bass line is auto-played,
    // not player-graded) — `undefined` (not computed) otherwise, so TimingBarChart stays in its normal
    // single-bar mode.
    const splitStats = twoHanded ? { bass: extractHandStats(stats, 'bass'), treble: extractHandStats(stats, 'treble') } : undefined;
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
        <div className="ls-panel">
            <div className="ls-badge">🏆</div>
            <h2 className="ls-title">Well done!</h2>
            <div className="ls-sub">{levelName} voltooid</div>
            {/* #863 "KPI's kunnen dan in 2 regels" — 3 columns × up to 5 rows fits every current row count
                (4 or 5) in exactly 2 lines, now that the panel has the full top-view width to work with
                instead of a narrow modal card. */}
            <div className="ls-stats">
                {rows.map((r) => (
                    <div key={r.label} className="ls-stat">
                        <span className="ls-stat-value">{r.value}</span>
                        <span className="ls-stat-label">{r.label}</span>
                    </div>
                ))}
            </div>
            {timed && (
                <div className="ls-chart-block">
                    <div className="ls-chart-title">Timing accuracy</div>
                    <TimingBarChart stats={stats} splitStats={splitStats} />
                    <TimingLegend />
                </div>
            )}
            <div className="ls-actions">
                <button className="ls-btn ls-replay" onClick={onReplay}>↻ Opnieuw</button>
                <button className="ls-btn" onClick={onClose}>Sluiten</button>
            </div>
        </div>
    );
}
