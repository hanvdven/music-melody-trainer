import React, { useState, useRef } from 'react';
import { getTempoTerm } from '../../utils/tempo';
import { BpmFan } from './overlays/fanCarousels';

// Exported: the exercise overlay's BpmFan shares the same range (§6c — one
// source of truth for the BPM domain).
export const BPM_MIN = 12;
export const BPM_MAX = 360;

/**
 * SVG <g> sub-component for the BPM display and controls in the sheet music header.
 * `showBpmControls` and `onResetBpmTimer` are lifted to SheetMusic so that
 * handleSheetMusicClick and renderRandomizeIcons can still read/trigger them.
 * This component encapsulates the render logic and tap-tempo state only.
 */
const BpmControls = ({
    bpm,
    onBpmChange,
    trebleStart,
    showSettings,
    showBpmControls,
    onResetBpmTimer,
    debugMode,
    openSettingsIfClosed,
    onSettingsInteraction,
    setTempoPicker,
    // Rubato mode (Han 2026-05-28 PR-B): when true the BPM number is replaced
    // by the Maestro rubato glyph (SHIFT+T → 'Å'? — Maestro mapping TBD)
    // and the tempo term becomes "rubato". Long-press on the value area
    // toggles between BPM and rubato.
    isRubato = false,
    onToggleRubato,
}) => {
    // TAP BPM — accumulate up to 4 tap timestamps; use the last 4 intervals to derive BPM.
    // Taps older than 3 s reset the sequence (stale tap).
    const tapTimesRef = useRef([]);
    const [tapFlash, setTapFlash] = useState(false);
    const tapFlashTimerRef = useRef(null);

    const clampBpm = (v) => Math.min(BPM_MAX, Math.max(BPM_MIN, v));

    // #362 (Han): the -/+/--/++ stepper zones (and the long-press numeric prompt)
    // are replaced by the HIDDEN VERTICAL FAN on the value itself — drag the
    // Maestro numeral to sweep tempi in 5-steps, exactly the volume-cell
    // interaction. TAP tempo stays for precise/free values.
    const handleBpmChangeWrapper = (val) => {
        onResetBpmTimer();
        openSettingsIfClosed();
        onBpmChange(clampBpm(val));
    };

    const handleTap = () => {
        onResetBpmTimer();
        openSettingsIfClosed();
        const now = performance.now();
        const times = tapTimesRef.current;
        const fresh = times.filter(t => now - t < 3000);
        fresh.push(now);
        if (fresh.length > 5) fresh.shift();
        tapTimesRef.current = fresh;

        if (fresh.length >= 2) {
            const intervals = [];
            for (let i = 1; i < fresh.length; i++) intervals.push(fresh[i] - fresh[i - 1]);
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const tappedBpm = Math.round(60000 / avgInterval);
            onBpmChange(clampBpm(tappedBpm));
        }

        setTapFlash(true);
        if (tapFlashTimerRef.current) clearTimeout(tapFlashTimerRef.current);
        tapFlashTimerRef.current = setTimeout(() => setTapFlash(false), 120);
    };

    const x = 25;
    // Tempo term: "rubato" in rubato mode (Han 2026-05-28), otherwise the
    // BPM-derived term ("Andante" etc.). The italic-text styling stays the
    // same so the visual position doesn't shift.
    const term = isRubato ? 'rubato' : getTempoTerm(bpm);
    const headerY = trebleStart - 89;
    const valueY = trebleStart - 59;

    return (
        <g data-settings-keepalive="">
            {/* Tempo term — clickable to open tempo word picker */}
            <text x={x + 10} y={headerY} className="tempo-term" fontSize="14"
                style={{ cursor: 'pointer', fill: showSettings ? 'var(--accent-yellow)' : undefined }}
            >
                {term}
            </text>
            {debugMode && <rect x={x + 6} y={headerY - 14} width={80} height={18} fill="green" fillOpacity={0.4} stroke="green" strokeWidth={1} />}
            <rect
                x={x + 6} y={headerY - 14} width={80} height={18}
                fill="transparent" style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); setTempoPicker(p => !p); openSettingsIfClosed(); onSettingsInteraction?.(10000); }}
            />

            {/* q = BPM, or in rubato mode: q = T (Maestro SHIFT+T glyph for free-time).
                Rubato glyph in Maestro: capital T = the tempo-libero symbol commonly
                used as q = T (Han 2026-05-28). The numeric BPM is hidden in rubato. */}
            <text x={x} y={valueY} className="bpm-note" fill={showSettings ? 'var(--accent-yellow)' : undefined}>q</text>
            <text x={x + 15} y={valueY} className="bpm-equals" fill={showSettings ? 'var(--accent-yellow)' : undefined}>=</text>
            {isRubato ? (
                <text
                    x={x + 30}
                    y={valueY - 8}
                    className="bpm-value"
                    fontFamily="Maestro"
                    fill={showSettings ? 'var(--accent-yellow)' : undefined}
                >
                    T
                </text>
            ) : (
                /* #362 (Han): the value IS the setter — a compact hidden fan
                   (BpmFan draws the at-rest numeral itself in Maestro 32, same
                   size as the old .bpm-value display). stopPropagation so a tap
                   on the band never reaches handleSheetMusicClick. */
                <g onClick={(e) => e.stopPropagation()}>
                    <BpmFan
                        cx={x + 55}
                        centerY={valueY - 14}
                        bpm={bpm}
                        min={BPM_MIN}
                        max={BPM_MAX}
                        onCommit={handleBpmChangeWrapper}
                        debugMode={debugMode}
                    />
                </g>
            )}

            {/* TAP button — always visible in settings, appears briefly after first BPM interaction */}
            {(showBpmControls || showSettings) && (
                <>
                    <rect
                        x={x + 3} y={valueY + 12} width={84} height={18} rx="3"
                        fill={tapFlash ? 'var(--accent-yellow)' : (showSettings ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)')}
                        stroke={showSettings ? 'var(--accent-yellow)' : 'var(--text-dim)'}
                        strokeWidth="0.5"
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); handleTap(); }}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleTap(); }}
                    />
                    <text
                        x={x + 45} y={valueY + 24}
                        fontSize="9" fontFamily="sans-serif" textAnchor="middle"
                        fill={tapFlash ? '#222' : (showSettings ? 'var(--accent-yellow)' : 'var(--text-dim)')}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                        TAP
                    </text>
                </>
            )}
        </g>
    );
};

export default BpmControls;
