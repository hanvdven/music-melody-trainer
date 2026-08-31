import React from 'react';
import { useProfile } from '../../contexts/ProfileContext';
import { LEVELS } from '../../levels/levels';
import SONGS from '../../songs/songIndex.js';

// #667 (Han 2026-08-03, "stats (welk level verslagen, welke accuracy etc) — niet nu implementeren"):
// this used to be a placeholder only. #1054 (Han 2026-08-20, level-based stats/progression, design
// interview) replaces it with a real display of `ProfileContext`'s `levelMastery` — see
// `recordLevelCompletion`'s own comment for how/when that data is written. Text uses the app's text font
// explicitly throughout (never inherits Maestro — CLAUDE.md §1a / architecture.md §17).
const TEXT_FONT = "Georgia, 'Times New Roman', serif";

const panelStyle = {
    display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
    color: 'var(--text-primary)', fontFamily: TEXT_FONT, padding: '12px 16px', gap: 10,
    overflowY: 'auto', boxSizing: 'border-box',
};
const headingStyle = { fontSize: '13px', color: 'var(--text-secondary)', letterSpacing: '0.4px' };
const bigValueStyle = { fontSize: '22px', fontWeight: 700, color: 'var(--accent-yellow)' };
const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' };
const emptyStyle = { fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' };

// A numbered/procedural level's own display name, or a scripted level's song title — the SAME two id
// spaces `recordLevelCompletion` already keeps apart (§6c, one lookup, not duplicated per caller).
function levelOrSongLabel(key) {
    const song = SONGS.find((s) => s.id === key);
    if (song) return song.title;
    const lvl = LEVELS[key];
    return lvl ? lvl.name : `Level ${key}`;
}

// "C4:Major" -> "C4 Major" — the stored key is a plain colon-joined identity (ProfileContext.jsx), this
// is DISPLAY-only formatting, same convention as BestiaryPanels.jsx's `formatTagLabel`.
function scaleLabel(scaleKey) {
    return scaleKey.replace(':', ' ');
}

export function StatsTopPanel() {
    const { levelMastery, anpm } = useProfile();
    const { highestLevelAt80, knownScales, knownSongs } = levelMastery;
    const suggestedNext = highestLevelAt80 == null ? 1 : highestLevelAt80 + 1;

    return (
        <div style={panelStyle}>
            <div>
                <div style={headingStyle}>HOOGSTE LEVEL (≥80%)</div>
                <div style={bigValueStyle}>
                    {highestLevelAt80 == null ? '—' : (LEVELS[highestLevelAt80]?.name ?? `Level ${highestLevelAt80}`)}
                </div>
            </div>
            <div style={rowStyle}>
                <span style={headingStyle}>Volgende voorstel</span>
                <span>{LEVELS[suggestedNext]?.name ?? `Level ${suggestedNext}`}</span>
            </div>
            <div style={rowStyle}>
                <span style={headingStyle}>Bekende toonladders</span>
                <span>{knownScales.length}</span>
            </div>
            <div style={rowStyle}>
                <span style={headingStyle}>Bekende liedjes</span>
                <span>{knownSongs.length}</span>
            </div>
            {/* #1099: ANPM (accurate notes per minute) — an EWMA of reading speed at >=90% accuracy, so it
                can rise OR fall, unlike every other stat on this panel (all ratchets). '—' until the first
                qualifying completion, same convention as `highestLevelAt80` above. */}
            <div style={rowStyle}>
                <span style={headingStyle}>ANPM</span>
                <span>{anpm == null ? '—' : Math.round(anpm)}</span>
            </div>
        </div>
    );
}

export function StatsBottomPanel() {
    const { levelMastery } = useProfile();
    const { knownScales, knownSongs, playCounts, perfectCounts } = levelMastery;
    const playedKeys = Object.keys(playCounts);

    return (
        <div style={panelStyle}>
            <div>
                <div style={headingStyle}>TOONLADDERS (≥80%)</div>
                {knownScales.length === 0
                    ? <div style={emptyStyle}>Nog geen enkele</div>
                    : knownScales.map((k) => <div key={k}>{scaleLabel(k)}</div>)}
            </div>
            <div>
                <div style={headingStyle}>LIEDJES (≥80%)</div>
                {knownSongs.length === 0
                    ? <div style={emptyStyle}>Nog geen enkele</div>
                    : knownSongs.map((k) => <div key={k}>{levelOrSongLabel(k)}</div>)}
            </div>
            {playedKeys.length > 0 && (
                <div>
                    <div style={headingStyle}>KEER GESPEELD</div>
                    {playedKeys.map((k) => (
                        <div key={k} style={rowStyle}>
                            <span>{levelOrSongLabel(k)}</span>
                            <span>{playCounts[k]}× {perfectCounts[k] ? `(${perfectCounts[k]}× 100%)` : ''}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
