import React from 'react';
import './LevelSplash.css';

// #693 (Han 2026-08-04, round 7): the header Pause button opens this instead of the old floating
// "■ Stop" button — reuses LevelSplash.css's overlay/card/button classes (§6d — no new visual
// language for what is functionally the same kind of modal). `onResume` rewinds to the start of the
// measure the player was in (count-in, then continue); `onQuit` ends the level immediately (same as
// the old Stop button — stats/backing all torn down via App.jsx's existing `level.close()` path).
export default function LevelPausePopup({ levelName, onResume, onQuit }) {
    return (
        <div className="ls-overlay" onClick={onResume}>
            <div className="ls-card" onClick={(e) => e.stopPropagation()}>
                <div className="ls-badge">⏸</div>
                <h2 className="ls-title">Gepauzeerd</h2>
                <div className="ls-sub">{levelName}</div>
                <div className="ls-actions">
                    <button className="ls-btn ls-replay" onClick={onResume}>▶ Resume</button>
                    <button className="ls-btn" onClick={onQuit}>Quit</button>
                </div>
            </div>
        </div>
    );
}
