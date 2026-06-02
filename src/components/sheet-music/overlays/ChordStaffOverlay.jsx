import React from 'react';

/**
 * ChordStaffOverlay — in-SVG CHORD selector (Han 2026-06-01), shown in the chord row
 * (above the treble staff) inside clef-edit mode. Three chord VISUALISATIONS, drawn
 * like REAL sheet chords (no boxes, Han #8):
 *   X (at startX, a tall disable cross) → chords OFF (`chordDisplayMode='off'`)
 *   letters (group at ~33%) → letter chords (e.g. D−7)
 *   roman   (group at ~66%) → roman numerals (e.g. ii7)
 * The active option is highlighted. Picking one writes `chordDisplayMode`.
 */

// A small chord "group" sample rendered like a real chord label (serif, super-7).
const ChordSample = ({ cx, cy, root, color }) => (
    <g style={{ pointerEvents: 'none' }} fill={color} fontFamily="Georgia, serif">
        <text x={cx} y={cy + 5} fontSize={17} textAnchor="middle">{root}</text>
        <text x={cx + 13} y={cy - 4} fontSize={10} textAnchor="start">7</text>
    </g>
);

const ChordStaffOverlay = ({
    startX, endX, trebleStart,
    chordDisplayMode = 'letters',
    onSetChordDisplayMode,
    debugMode = false,
}) => {
    if (startX == null || trebleStart == null) return null;
    // Chord row sits above the treble staff (ChordLabelsLayer uses trebleStart-58).
    const rowY = trebleStart - 50;
    const span = (endX ?? startX) - startX;
    const cx33 = startX + span * 0.33;
    const cx66 = startX + span * 0.66;

    const isLetters = chordDisplayMode !== 'off' && chordDisplayMode !== 'roman';
    const opt = (mode, node, hitX, hitW) => (
        <g key={mode} data-fly=""
            style={{ cursor: onSetChordDisplayMode ? 'pointer' : 'default' }}
            onClick={() => onSetChordDisplayMode?.(mode)}>
            <rect x={hitX} y={rowY - 18} width={hitW} height={40} fill="transparent" />
            {node}
            {debugMode && (
                <rect x={hitX} y={rowY - 18} width={hitW} height={40}
                    fill="orange" fillOpacity={0.15} stroke="orange" strokeWidth={0.5}
                    style={{ pointerEvents: 'none' }} />
            )}
        </g>
    );

    const offColor = chordDisplayMode === 'off' ? 'var(--accent-yellow)' : 'var(--text-primary)';
    const lettersColor = isLetters ? 'var(--accent-yellow)' : 'var(--text-primary)';
    const romanColor = chordDisplayMode === 'roman' ? 'var(--accent-yellow)' : 'var(--text-primary)';

    return (
        <g className="chord-overlay" onClick={(e) => e.stopPropagation()}>
            {/* X disable at startX — a tall cross (2× taller than wide, Han #8). */}
            {opt('off', (
                <g stroke={offColor} strokeWidth={2.4} strokeLinecap="round" style={{ pointerEvents: 'none' }}>
                    <path d={`M ${startX - 8} ${rowY - 16} L ${startX + 8} ${rowY + 16}`} />
                    <path d={`M ${startX + 8} ${rowY - 16} L ${startX - 8} ${rowY + 16}`} />
                </g>
            ), startX - 12, 24)}

            {/* letters group at ~33%, roman at ~66% — rendered like real chords. */}
            {opt('letters',
                <ChordSample cx={cx33} cy={rowY} root="D−" color={lettersColor} />,
                cx33 - 16, 36)}
            {opt('roman',
                <ChordSample cx={cx66} cy={rowY} root="ii" color={romanColor} />,
                cx66 - 16, 36)}
        </g>
    );
};

export default ChordStaffOverlay;
