import React from 'react';

/**
 * ChordStyleOverlay — the chord STYLE selector (Han #12): X (disable) / letters /
 * roman, shown in the chord row inside the CLEF setter. The letters/roman samples
 * use the SAME font size & style as the sheet chord labels (ChordLabelsLayer: root
 * ~26 serif, superscript ~16) — they were too small before.
 *
 * Writes `chordDisplayMode` ('off' | 'letters' | 'roman').
 */

// Sheet chord-label metrics (mirror ChordLabelsLayer's non-passing chord).
const ROOT_FS = 26;
const SUP_FS = 16;
const SUP_DY = 12;

// A short chord-label progression sample matching the SHEET chord labels EXACTLY
// (ChordLabelsLayer): plain serif (NOT italic), root letter + the suffix — incl. the
// minor "−" — as a raised superscript tspan (Han #13).
const ProgressionSample = ({ cx, cy, kind, color }) => {
    const items = kind === 'roman'
        ? [{ root: 'ii', sup: '' }, { root: 'V', sup: '7' }, { root: 'I', sup: '' }]
        : [{ root: 'D', sup: '−' }, { root: 'G', sup: '7' }, { root: 'C', sup: '' }];
    const GAP = 34;                 // spacing between chords (room for the 26px roots)
    const x0 = cx - GAP;            // 3 chords centred on cx
    return (
        <g style={{ pointerEvents: 'none' }} fill={color}
            fontFamily="Georgia, 'Times New Roman', serif">
            {items.map((it, i) => {
                const x = x0 + i * GAP;
                return (
                    <text key={i} x={x} y={cy + 8} fontSize={ROOT_FS} textAnchor="middle">
                        {it.root}
                        {it.sup && <tspan fontSize={SUP_FS} dy={-SUP_DY} dx="1">{it.sup}</tspan>}
                    </text>
                );
            })}
        </g>
    );
};

const ChordStyleOverlay = ({
    startX, endX, trebleStart,
    chordDisplayMode = 'letters',
    onSetChordDisplayMode,
    debugMode = false,
}) => {
    if (startX == null || trebleStart == null) return null;
    const rowY = trebleStart - 50;                 // chord row, above the treble staff
    const span = (endX ?? startX) - startX;
    const cx33 = startX + span * 0.33;
    const cx66 = startX + span * 0.66;
    const isLetters = chordDisplayMode !== 'off' && chordDisplayMode !== 'roman';

    const offColor = chordDisplayMode === 'off' ? 'var(--accent-yellow)' : 'var(--text-primary)';
    const lettersColor = isLetters ? 'var(--accent-yellow)' : 'var(--text-primary)';
    const romanColor = chordDisplayMode === 'roman' ? 'var(--accent-yellow)' : 'var(--text-primary)';

    const hit = (key, node, hitX, hitW, onTap) => (
        <g key={key} data-fly="" style={{ cursor: 'pointer' }} onClick={onTap}>
            <rect x={hitX} y={rowY - 24} width={hitW} height={48} fill="transparent" />
            {node}
            {debugMode && (
                <rect x={hitX} y={rowY - 24} width={hitW} height={48}
                    fill="orange" fillOpacity={0.15} stroke="orange" strokeWidth={0.5}
                    style={{ pointerEvents: 'none' }} />
            )}
        </g>
    );

    return (
        <g className="chord-style-overlay" onClick={(e) => e.stopPropagation()}>
            {hit('off', (
                <g stroke={offColor} strokeWidth={2.4} strokeLinecap="round" style={{ pointerEvents: 'none' }}>
                    <path d={`M ${startX - 8} ${rowY - 16} L ${startX + 8} ${rowY + 16}`} />
                    <path d={`M ${startX + 8} ${rowY - 16} L ${startX - 8} ${rowY + 16}`} />
                </g>
            ), startX - 12, 24, () => onSetChordDisplayMode?.('off'))}
            {hit('letters',
                <ProgressionSample cx={cx33} cy={rowY} kind="letters" color={lettersColor} />,
                cx33 - 44, 88, () => onSetChordDisplayMode?.('letters'))}
            {hit('roman',
                <ProgressionSample cx={cx66} cy={rowY} kind="roman" color={romanColor} />,
                cx66 - 44, 88, () => onSetChordDisplayMode?.('roman'))}
        </g>
    );
};

export default ChordStyleOverlay;
