import React, { useEffect } from 'react';
import { Flame, TrendingUp, TrendingDown } from 'lucide-react';
import { SKILL_BRANCHES } from '../../utils/gamification';
import './SessionSummaryCard.css';

// Display labels — kept in sync with ProfileTab's SKILL_LABELS by sharing the
// branch order from SKILL_BRANCHES (the label strings are trivial).
const SKILL_LABELS = {
    ear: 'Ear',
    sightReading: 'Sight Reading',
    rhythm: 'Rhythm',
    harmony: 'Harmony',
    consistency: 'Consistency',
};

const AUTO_DISMISS_MS = 8000;

/**
 * Post-session summary card (#131, docs/gamification.md §5.2).
 * Shown by App when a session ends with ≥1 completed melody or ≥1 fully
 * listened series (the gate lives in ProfileContext.endSession). Dismiss by
 * tapping anywhere on the card, or it auto-fades. It never blocks starting the
 * next session — starting new activity clears it from App state.
 *
 * With gamification opted out the stats rows still show (useful feedback,
 * always available); only the XP and skill rows are hidden.
 */
export default function SessionSummaryCard({ summary, onDismiss, debugMode = false }) {
    useEffect(() => {
        const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
        return () => clearTimeout(t);
    }, [onDismiss]);

    if (!summary) return null;

    // Ratings can DROP since the #129 ELO rework — show both directions.
    const changedSkills = SKILL_BRANCHES.filter(b => (summary.skillDeltas?.[b] ?? 0) !== 0);

    return (
        <div
            className="session-summary-card"
            onClick={onDismiss}
            role="status"
            // §3a: the whole card is the dismiss hit region; the debug outline
            // visualises exactly that.
            style={debugMode ? { outline: '2px solid orange', outlineOffset: '-2px' } : undefined}
        >
            <div className="session-summary-title">Session complete</div>

            {summary.notesTotal > 0 && (
                <div className="session-summary-row">
                    <span className="session-summary-label">Notes correct</span>
                    <span className="session-summary-value">
                        {summary.notesCorrect} / {summary.notesTotal}
                        {summary.accuracy != null && <span className="session-summary-dim"> · {summary.accuracy}%</span>}
                    </span>
                </div>
            )}

            {summary.longestNoteStreak > 1 && (
                <div className="session-summary-row">
                    <span className="session-summary-label">Longest streak</span>
                    <span className="session-summary-value">{summary.longestNoteStreak} notes</span>
                </div>
            )}

            {summary.melodiesCompleted > 0 && (
                <div className="session-summary-row">
                    <span className="session-summary-label">Melodies</span>
                    <span className="session-summary-value">{summary.melodiesCompleted}</span>
                </div>
            )}

            {summary.seriesListened > 0 && (
                <div className="session-summary-row">
                    <span className="session-summary-label">Series listened</span>
                    <span className="session-summary-value">{summary.seriesListened}</span>
                </div>
            )}

            {summary.gamificationEnabled && (
                <div className="session-summary-row">
                    <span className="session-summary-label">XP earned</span>
                    <span className="session-summary-value session-summary-xp">+{summary.xpEarned}</span>
                </div>
            )}

            {summary.gamificationEnabled && changedSkills.map(b => {
                const delta = summary.skillDeltas[b];
                return (
                    <div className="session-summary-row" key={b}>
                        <span className="session-summary-label">{SKILL_LABELS[b]}</span>
                        <span className={`session-summary-value ${delta > 0 ? 'session-summary-skill' : 'session-summary-skill-down'}`}>
                            {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {delta > 0 ? `+${delta}` : delta}
                        </span>
                    </div>
                );
            })}

            {summary.gamificationEnabled && summary.streakDays > 0 && (
                <div className="session-summary-streak">
                    <Flame size={14} /> {summary.streakDays}-day streak
                </div>
            )}
        </div>
    );
}
