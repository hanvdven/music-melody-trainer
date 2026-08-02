import React from 'react';
import './LevelSplash.css';

// #659 Level-complete splash: "Well done!" + stats (Han). Timing precision is intentionally omitted for
// levels without a metronome (Han) — `timed` (side-scroll levels) adds the graded timing rows (Han
// 2026-08-02): points + per-category counts from gradeHit, incl. wrong notes and second-attempt saves.
export default function LevelSplash({ levelName, stats, timed = false, onReplay, onClose }) {
    const attempts = stats.defeated + stats.misses;
    const accuracy = attempts > 0 ? Math.round((stats.defeated / attempts) * 100) : 100;
    const rows = [
        { label: 'Slimes verslagen', value: stats.defeated },
        { label: 'Accuraatheid', value: `${accuracy}%` },
        ...(timed ? [
            { label: 'Punten', value: stats.points },
            { label: 'Perfect', value: stats.perfect },
            { label: 'Too fast', value: stats.tooFast },
            { label: 'Too slow', value: stats.tooSlow },
            { label: 'Much too fast', value: stats.muchTooFast },
            { label: 'Much too slow', value: stats.muchTooSlow },
            { label: 'Wrong notes', value: stats.wrongNotes },
            { label: 'Op 2e poging', value: stats.secondAttempt },
        ] : []),
        { label: 'Missers', value: stats.misses },
        { label: 'Langste streak', value: stats.longestStreak },
    ];
    return (
        <div className="ls-overlay" onClick={onClose}>
            <div className="ls-card" onClick={(e) => e.stopPropagation()}>
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
                <div className="ls-actions">
                    <button className="ls-btn ls-replay" onClick={onReplay}>↻ Opnieuw</button>
                    <button className="ls-btn" onClick={onClose}>Sluiten</button>
                </div>
            </div>
        </div>
    );
}
