import React, { useState } from 'react';
import { Swords } from 'lucide-react';
import './LevelSplash.css';
import { LeftFanCarousel } from '../sheet-music/overlays/fanCarousels';
import { LEVELS } from '../../levels/levels';
import LevelZeroConfigForm from './LevelZeroConfigForm';

// #679 (Han 2026-08-03, Level 9): derived from LEVELS itself (§6c — no hardcoded list to fall out of sync
// with levels.json again) instead of a literal array that silently excludes any newly-added level.
const LEVEL_NUMBERS = Object.keys(LEVELS).map(Number).sort((a, b) => a - b);

// #661 (Han 2026-08-02): "maak een splash screen voor het level start, met daarin een tanh carousel dat
// het level nummer kiest." Reuses the SAME CSS chrome as the "Well done!" splash (LevelSplash.css, §6d —
// one card look for both level-flow modals) and the SAME tangens/tanh fan carousel every other in-sheet
// setter uses (`LeftFanCarousel`, src/components/sheet-music/overlays/fanCarousels.jsx — no second
// carousel engine). Replaces the header's old 3 separate per-level buttons (AppHeader.jsx): ONE "Start
// Level" button opens this splash; dragging the carousel picks 1/2/3; a separate Start button confirms
// (Han: avoid accidentally starting mid-drag).
//
// UAT (same day, Han: "maak hidden carousel van, en de scroll richting moet andersom") — both are EXISTING
// `LeftFanCarousel` props, reused verbatim (§6c/§6d), not new behaviour: `compact` shows only the active
// number at rest and fans the neighbours out while dragging (the same "reveal-on-interaction" convention
// the generation carousels use, §52); `invert` flips only the DRAG direction (layout is unchanged — high
// values still sit high), matching the BPM/measures/repeats fans elsewhere in the app.
//
// #661 (Han 2026-08-02, 8-level ramp): an info panel below the carousel shows each level's bpm, enemy type
// (Han: "gewoon slimes" — always Slime, no per-level bestiary swap) and what it newly introduces
// (`lvl.intro`, levels.js) — read straight off the chosen `LEVELS[n]` object, single source of truth.
// Level editor (Han 2026-08-06, Level 0 = the live-editable sandbox): defaults the carousel to LEVEL 1,
// not array-index 0 — id 0 now sorts first in LEVEL_NUMBERS, but a brand-new player should still land on
// the real first level, not the sandbox. Falls back to index 0 if id 1 is ever removed.
const DEFAULT_INDEX = Math.max(0, LEVEL_NUMBERS.indexOf(1));

export default function LevelStartSplash({ onStart, onClose, debugMode = false }) {
    const [activeIndex, setActiveIndex] = useState(DEFAULT_INDEX);
    const chosen = LEVEL_NUMBERS[activeIndex];
    const lvl = LEVELS[chosen];
    const levelName = lvl?.name || `Level ${chosen}`;
    // Level 0 (Han 2026-08-06, "dat wil ik in de 'config' voor het begin van het level doen, dus niet
    // via instelling overlay"): a pre-start editable draft, kept in THIS component (not written back to
    // LEVELS[0] — every fresh open of the splash starts from the JSON baseline again). Persists across
    // carousel moves within one open session (deliberately NOT reset when navigating away and back to id
    // 0) so a half-finished edit isn't lost by briefly checking another level.
    const [level0Draft, setLevel0Draft] = useState(() => LEVELS[0]);
    const isLevel0 = chosen === 0;

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
                        compact
                        invert
                    />
                </svg>
                {lvl && !isLevel0 && (
                    <div className="ls-stats" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
                        <div className="ls-stat">
                            <span className="ls-stat-value">{lvl.bpm}</span>
                            <span className="ls-stat-label">bpm</span>
                        </div>
                        <div className="ls-stat">
                            <span className="ls-stat-value">{lvl.enemyType}</span>
                            <span className="ls-stat-label">tegenstander</span>
                        </div>
                        <div className="ls-stat" style={{ gridColumn: '1 / -1' }}>
                            <span className="ls-stat-value" style={{ fontSize: 14 }}>{lvl.intro}</span>
                            <span className="ls-stat-label">nieuw in dit level</span>
                        </div>
                    </div>
                )}
                {/* Debug: full level params (Han 2026-08-06, "ik wil de level params zien tijdens het
                    'start level' splash screen, niet tijdens het level") — the stats grid above only ever
                    showed bpm/enemyType/intro; this dumps the WHOLE chosen level object (every field,
                    including normalizeLevel's derived numRepeats/totalMeasures) so debugMode users can
                    inspect every param BEFORE starting. Not shown for Level 0 — its own editable form
                    (below) already shows/edits every field, a read-only dump on top would be redundant. */}
                {debugMode && lvl && !isLevel0 && (
                    <pre style={{
                        textAlign: 'left', fontSize: 10, lineHeight: 1.3, maxHeight: 220, overflow: 'auto',
                        background: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: '6px 8px', marginBottom: 14,
                    }}>
                        {JSON.stringify(lvl, null, 1)}
                    </pre>
                )}
                {/* Level 0 (Han 2026-08-06, "hoe kan ik level 0 aanpassen? dat wil ik in de config voor
                    het begin van het level doen, niet via instelling overlay"): every schema field,
                    editable here, BEFORE Start — see LevelZeroConfigForm.jsx. */}
                {isLevel0 && <LevelZeroConfigForm draft={level0Draft} onChange={setLevel0Draft} />}
                <div className="ls-actions">
                    <button className="ls-btn ls-replay" onClick={() => onStart(isLevel0 ? level0Draft : chosen)}>▶ Start</button>
                    <button className="ls-btn" onClick={onClose}>Sluiten</button>
                </div>
            </div>
        </div>
    );
}
