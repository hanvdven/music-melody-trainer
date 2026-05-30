import React, { useState, useRef } from 'react';
import useLongPressTimer from '../../hooks/useLongPressTimer';
import { getTempoTerm } from '../../utils/tempo';

const BPM_MIN = 12;
const BPM_MAX = 360;

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

    const handleBpmChangeWrapper = (val) => {
        onResetBpmTimer();
        openSettingsIfClosed();
        onBpmChange(clampBpm(val));
    };

    // Inner -/+: jump to nearest integer (always moves by at least 1)
    const bpmDecrement = () => handleBpmChangeWrapper(Math.floor(bpm - 0.001));
    const bpmIncrement = () => handleBpmChangeWrapper(Math.ceil(bpm + 0.001));
    // Outer --/++: jump to nearest multiple of 5
    const bpmDecrementFive = () => handleBpmChangeWrapper(Math.floor((bpm - 0.001) / 5) * 5);
    const bpmIncrementFive = () => handleBpmChangeWrapper(Math.ceil((bpm + 0.001) / 5) * 5);

    const bpmLongPress = useLongPressTimer();

    const handleBpmLongPress = () => {
        onResetBpmTimer();
        setTimeout(() => {
            const input = window.prompt('Enter BPM:', bpm);
            if (input !== null) {
                const val = parseFloat(input);
                if (!isNaN(val) && val >= BPM_MIN && val <= BPM_MAX) {
                    onBpmChange(clampBpm(val));
                }
            }
        }, 10);
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

    // Button zones (relative to x=25, total span from x-22 to x+112):
    // --  : x-22 .. x+3   (25px)
    // -   : x+3  .. x+45  (42px)
    // +   : x+45 .. x+87  (42px)
    // ++  : x+87 .. x+112 (25px)
    const zL2 = x - 22, zL2w = 25;
    const zL1 = x + 3,  zL1w = 42;
    const zR1 = x + 45, zR1w = 42;
    const zR2 = x + 87, zR2w = 25;
    const zH  = valueY - 30;
    const zHh = 45;
    const dc  = debugMode ? 'orange' : 'transparent';
    const dop = debugMode ? 0.4 : 1;
    const ds  = debugMode ? 1 : 0;

    const mkRect = (rx, rw, onUp, longPressOpts) => (
        <rect
            x={rx} y={zH} width={rw} height={zHh}
            fill={dc} fillOpacity={dop} stroke={dc} strokeWidth={ds}
            style={{ cursor: 'pointer' }}
            onMouseDown={() => longPressOpts && bpmLongPress.start(handleBpmLongPress)}
            onMouseUp={(e) => { e.stopPropagation(); longPressOpts ? bpmLongPress.end(e, onUp) : onUp(); }}
            onClick={(e) => e.stopPropagation()}
            onMouseLeave={() => longPressOpts && bpmLongPress.cancel()}
            onTouchStart={() => longPressOpts && bpmLongPress.start(handleBpmLongPress)}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); longPressOpts ? bpmLongPress.end(e, onUp) : onUp(); }}
        />
    );

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
                <text x={x + 30} y={valueY - 8} className="bpm-value" fontFamily="Maestro" fill={showSettings ? 'var(--accent-yellow)' : undefined}>{bpm}</text>
            )}

            {/* -- / - / + / ++ indicators */}
            {(showBpmControls || showSettings) && (
                <>
                    <text x={x - 12} y={valueY - 5} className="measure-indicator" fontSize="10">--</text>
                    <text x={x + 17} y={valueY - 5} className="measure-indicator">-</text>
                    <text x={x + 70} y={valueY - 4} className="measure-indicator">+</text>
                    <text x={x + 91} y={valueY - 4} className="measure-indicator" fontSize="10">++</text>
                </>
            )}

            {/* -- (outer left): jump to next lower multiple of 5 */}
            {mkRect(zL2, zL2w, bpmDecrementFive, false)}
            {/* -  (inner left): jump to next lower integer, long-press = prompt */}
            {mkRect(zL1, zL1w, bpmDecrement, true)}
            {/* +  (inner right): jump to next higher integer, long-press = prompt */}
            {mkRect(zR1, zR1w, bpmIncrement, true)}
            {/* ++ (outer right): jump to next higher multiple of 5 */}
            {mkRect(zR2, zR2w, bpmIncrementFive, false)}

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
