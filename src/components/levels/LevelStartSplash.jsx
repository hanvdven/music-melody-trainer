import React, { useState } from 'react';
import { Swords } from 'lucide-react';
import './LevelSplash.css';
import { LeftFanCarousel } from '../sheet-music/overlays/fanCarousels';
import { LEVELS } from '../../levels/levels';

const LEVEL_NUMBERS = [1, 2, 3];

// #661 (Han 2026-08-02): "maak een splash screen voor het level start, met daarin een tanh carousel dat
// het level nummer kiest." Reuses the SAME CSS chrome as the "Well done!" splash (LevelSplash.css, §6d —
// one card look for both level-flow modals) and the SAME tangens/tanh fan carousel every other in-sheet
// setter uses (`LeftFanCarousel`, src/components/sheet-music/overlays/fanCarousels.jsx — no second
// carousel engine). Replaces the header's old 3 separate per-level buttons (AppHeader.jsx): ONE "Start
// Level" button opens this splash; dragging the carousel picks 1/2/3; a separate Start button confirms
// (Han: avoid accidentally starting mid-drag).
export default function LevelStartSplash({ onStart, onClose }) {
    const [activeIndex, setActiveIndex] = useState(0);
    const chosen = LEVEL_NUMBERS[activeIndex];
    const levelName = LEVELS[chosen]?.name || `Level ${chosen}`;

    return (
        <div className="ls-overlay" onClick={onClose}>
            <div className="ls-card" onClick={(e) => e.stopPropagation()}>
                <div className="ls-badge"><Swords size={40} style={{ color: 'var(--accent-yellow)' }} /></div>
                <h2 className="ls-title">Start Level</h2>
                <div className="ls-sub">{levelName}</div>
                <svg viewBox="0 0 200 140" width="100%" height="140" style={{ overflow: 'visible' }}>
                    <LeftFanCarousel
                        cx={100}
                        centerY={70}
                        items={LEVEL_NUMBERS}
                        activeIndex={activeIndex}
                        onCommit={setActiveIndex}
                        renderLabel={(v) => String(v)}
                        activeLabelSize={36}
                        bandW={60}
                    />
                </svg>
                <div className="ls-actions">
                    <button className="ls-btn ls-replay" onClick={() => onStart(chosen)}>▶ Start</button>
                    <button className="ls-btn" onClick={onClose}>Sluiten</button>
                </div>
            </div>
        </div>
    );
}
