import React from 'react';

// #667 (Han 2026-08-03, "stats (welk level verslagen, welke accuracy etc) — niet nu implementeren"):
// placeholder only — a real design/interview is needed before building actual stat tracking. Text uses the
// app's text font explicitly (never inherits Maestro — see CLAUDE.md §1a / architecture.md §17).
const placeholderStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%',
    color: 'var(--text-secondary)', fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '14px',
};

export function StatsTopPanel() {
    return <div style={placeholderStyle}>Stats — coming soon</div>;
}

export function StatsBottomPanel() {
    return <div style={placeholderStyle} />;
}
