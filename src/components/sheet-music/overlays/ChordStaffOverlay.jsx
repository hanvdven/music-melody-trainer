import React from 'react';

/**
 * ChordStaffOverlay — in-SVG CHORD selector (Han 2026-06-01), sibling of the clef
 * selector. Rendered in the chord row (above the treble staff) when `chordEditMode`
 * is on. Offers three chord VISUALISATIONS, reusing the existing chord notation:
 *   X        → chords OFF (no labels, no audio, no generation) — `chordDisplayMode='off'`
 *   letters  → letter chords (e.g. D−, G7, C)
 *   roman    → roman numerals (e.g. ii, V7, I)
 *
 * The active option is highlighted. Picking one writes `chordDisplayMode`. Pure
 * presentation; option labels reuse the same look as ChordNotationIcon / the sheet.
 */

const CHIP_W = 56, CHIP_H = 26, CHIP_GAP = 10;

// Each option's mini sample, drawn to match the sheet chord notation.
const OPTIONS = [
    { mode: 'off', render: (cx, cy, color) => (
        <g stroke={color} strokeWidth={2.2} strokeLinecap="round">
            <path d={`M ${cx - 7} ${cy - 7} L ${cx + 7} ${cy + 7}`} />
            <path d={`M ${cx + 7} ${cy - 7} L ${cx - 7} ${cy + 7}`} />
        </g>
    ) },
    { mode: 'letters', render: (cx, cy, color) => (
        <>
            <text x={cx - 2} y={cy + 5} fontSize={14} fontFamily="serif" textAnchor="middle" fill={color}>D−</text>
            <text x={cx + 11} y={cy - 3} fontSize={9} fontFamily="serif" textAnchor="middle" fill={color}>7</text>
        </>
    ) },
    { mode: 'roman', render: (cx, cy, color) => (
        <>
            <text x={cx - 2} y={cy + 5} fontSize={14} fontFamily="serif" textAnchor="middle" fill={color}>ii</text>
            <text x={cx + 11} y={cy - 3} fontSize={9} fontFamily="serif" textAnchor="middle" fill={color}>7</text>
        </>
    ) },
];

const ChordStaffOverlay = ({
    startX, trebleStart,
    chordDisplayMode = 'letters',
    onSetChordDisplayMode,
    debugMode = false,
}) => {
    if (startX == null || trebleStart == null) return null;
    // Chord row sits above the treble staff (ChordLabelsLayer uses trebleStart-58).
    const rowY = trebleStart - 58;
    const x0 = startX + CHIP_GAP;

    return (
        <g className="chord-overlay" onClick={(e) => e.stopPropagation()}>
            {OPTIONS.map((opt, i) => {
                const x = x0 + i * (CHIP_W + CHIP_GAP);
                const active = chordDisplayMode === opt.mode
                    || (opt.mode === 'letters' && chordDisplayMode !== 'off' && chordDisplayMode !== 'roman');
                const color = active ? 'var(--accent-yellow)' : 'var(--text-primary)';
                return (
                    <g key={opt.mode} data-fly=""
                        style={{ cursor: onSetChordDisplayMode ? 'pointer' : 'default' }}
                        onClick={() => onSetChordDisplayMode?.(opt.mode)}>
                        <rect x={x} y={rowY - CHIP_H / 2} width={CHIP_W} height={CHIP_H} rx={4}
                            fill="transparent" stroke={color} strokeWidth={active ? 1.8 : 0.8}
                            vectorEffect="non-scaling-stroke" />
                        {opt.render(x + CHIP_W / 2, rowY, color)}
                        {debugMode && (
                            <rect x={x} y={rowY - CHIP_H / 2} width={CHIP_W} height={CHIP_H}
                                fill="orange" fillOpacity={0.15} stroke="orange" strokeWidth={0.5}
                                style={{ pointerEvents: 'none' }} />
                        )}
                    </g>
                );
            })}
        </g>
    );
};

export default ChordStaffOverlay;
