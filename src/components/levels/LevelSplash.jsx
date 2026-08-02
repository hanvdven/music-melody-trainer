import React from 'react';
import './LevelSplash.css';
import { TimingBarChart, NoteCorrectnessGauge } from './LevelStatsCharts';

// #659 Level-complete splash: "Well done!" + stats (Han). Timing precision is intentionally omitted for
// levels without a metronome (Han) — `timed` (side-scroll levels) adds the graded timing rows + charts
// (Han 2026-08-02): points, the 5 gradeHit timing tiers, and a 4-outcome well-done breakdown that
// distinguishes missed notes / wrong-but-corrected / wrong-within-time (uncorrected) / notes played when
// none was due — each a MUTUALLY EXCLUSIVE final verdict (see useLevel.js emptyStats + SheetRpgLayer's
// combat effect), not overlapping tallies. Two charts (Han: "maken we meteen onderscheid tussen timing
// precision en note accuracy"): a timing bar chart (WHEN) and a note-correctness gauge (WHETHER the pitch
// was right at all) — see LevelStatsCharts.jsx.
export default function LevelSplash({ levelName, stats, timed = false, onReplay, onClose }) {
    const attempts = stats.defeated + stats.misses;
    const accuracy = attempts > 0 ? Math.round((stats.defeated / attempts) * 100) : 100;
    const rows = [
        { label: 'Slimes verslagen', value: stats.defeated },
        { label: 'Accuraatheid', value: `${accuracy}%` },
        ...(timed ? [
            { label: 'Punten', value: stats.points },
        ] : []),
        // Han 2026-08-02: 4 distinct breakdown rows — missed / wrong-within-time (uncorrected) /
        // wrong-but-corrected / note-when-none-due — replacing the old flat "misses" + "wrong notes".
        { label: 'Gemiste noten', value: stats.missed },
        ...(timed ? [
            { label: 'Fout (binnen tijd)', value: stats.wrongUncorrected },
            { label: 'Fout, hersteld', value: stats.secondAttemptCorrected },
            { label: 'Noot zonder doel', value: stats.extraNote },
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
                            <NoteCorrectnessGauge stats={stats} />
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
