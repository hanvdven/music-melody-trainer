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
    const GAP = 42;                 // spacing between the 3 sample chords (Han: further apart)
    const x0 = cx - GAP;            // 3 chords centred on cx
    return (
        <g style={{ pointerEvents: 'none' }} fill={color}
            fontFamily="Georgia, 'Times New Roman', serif">
            {items.map((it, i) => {
                const x = x0 + i * GAP;
                return (
                    <text key={i} x={x} y={cy} fontSize={ROOT_FS} textAnchor="middle">
                        {it.root}
                        {it.sup && <tspan fontSize={SUP_FS} dy={-SUP_DY} dx="1">{it.sup}</tspan>}
                    </text>
                );
            })}
        </g>
    );
};
// Width spanned by the 3-chord sample (2 gaps + a root glyph on each end) — used to size
// the hit box so it brackets the chords (Han: clickzone too narrow).
const SAMPLE_W = 2 * 42 + 36;

const ChordStyleOverlay = ({
    startX, endX, trebleStart,
    chordDisplayMode = 'letters',
    onSetChordDisplayMode,
    debugMode = false,
}) => {
    if (startX == null || trebleStart == null) return null;
    // Match the SHEET chord-label baseline (ChordLabelsLayer CHORD_ROOT_Y = trebleStart−58)
    // so the setter row sits at the SAME height as the real chord labels (Han Batch C).
    const labelBase = trebleStart - 58;
    const visCentre = labelBase - 9;               // ~centre of the 26px text, for the off-cross
    const span = (endX ?? startX) - startX;
    const cx33 = startX + span * 0.33;
    const cx66 = startX + span * 0.66;
    const isLetters = chordDisplayMode !== 'off' && chordDisplayMode !== 'roman';

    // Active = normal colour (NOT yellow); passive = lowlight, opacity 1 (Han #14).
    const offColor = chordDisplayMode === 'off' ? 'var(--text-primary)' : 'var(--text-lowlight)';
    const lettersColor = isLetters ? 'var(--text-primary)' : 'var(--text-lowlight)';
    const romanColor = chordDisplayMode === 'roman' ? 'var(--text-primary)' : 'var(--text-lowlight)';

    const hit = (key, node, hitX, hitW, onTap) => (
        <g key={key} data-fly="" style={{ cursor: 'pointer' }} onClick={onTap}>
            <rect x={hitX} y={visCentre - 22} width={hitW} height={44} fill="transparent" />
            {node}
            {debugMode && (
                <rect x={hitX} y={visCentre - 22} width={hitW} height={44}
                    fill="orange" fillOpacity={0.15} stroke="orange" strokeWidth={0.5}
                    style={{ pointerEvents: 'none' }} />
            )}
        </g>
    );

    return (
        <g className="chord-style-overlay" onClick={(e) => e.stopPropagation()}>
            {hit('off', (
                <g stroke={offColor} strokeWidth={2.4} strokeLinecap="round" style={{ pointerEvents: 'none' }}>
                    <path d={`M ${startX - 8} ${visCentre - 12} L ${startX + 8} ${visCentre + 12}`} />
                    <path d={`M ${startX + 8} ${visCentre - 12} L ${startX - 8} ${visCentre + 12}`} />
                </g>
            ), startX - 14, 28, () => onSetChordDisplayMode?.('off'))}
            {hit('letters',
                <ProgressionSample cx={cx33} cy={labelBase} kind="letters" color={lettersColor} />,
                cx33 - SAMPLE_W / 2, SAMPLE_W, () => onSetChordDisplayMode?.('letters'))}
            {hit('roman',
                <ProgressionSample cx={cx66} cy={labelBase} kind="roman" color={romanColor} />,
                cx66 - SAMPLE_W / 2, SAMPLE_W, () => onSetChordDisplayMode?.('roman'))}
        </g>
    );
};

export default ChordStyleOverlay;
