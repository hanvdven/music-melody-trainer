import React from 'react';

/**
 * ChordStaffOverlay — in-SVG CHORD selector (Han), shown in the chord row (above the
 * treble staff) inside clef-edit mode. Two sub-rows, drawn like REAL sheet notes:
 *
 *  VISUALISATION (chordDisplayMode): X (disable) at startX, letters@33%, roman@66%.
 *  COMPLEXITY (chordSettings.complexity, Han #9): 5 clickable chords drawn as stacked
 *    noteheads like sheet music — tonic, power, triad, seventh, extended — spread
 *    across startX→endX.
 *
 * The active option in each row is highlighted. Picks write chordDisplayMode /
 * chordSettings.complexity respectively.
 */

// A chord drawn as stacked Maestro whole-note heads (like sheet music). `steps` is
// the number of stacked thirds from the bottom; we draw 3rd-apart heads + the upper
// extensions for richer chords. cx = centre, baseY = bottom head baseline.
const HEAD = 'w';            // Maestro whole-note head
const STEP = 5;              // vertical gap between stacked heads (a staff step)

// stacked offsets (in STEP units, 0 = bottom) per complexity type.
const STACKS = {
    tonic: [0],
    power: [0, 3.5],            // root + fifth (wider gap)
    triad: [0, 2, 4],
    seventh: [0, 2, 4, 6],
    extended: [0, 2, 4, 6, 8],  // ninth-ish upper structure
};

const ChordStack = ({ cx, baseY, type, color }) => {
    const offs = STACKS[type] || STACKS.triad;
    return (
        <g style={{ pointerEvents: 'none' }} fill={color} fontFamily="Maestro" textAnchor="middle">
            {offs.map((o, i) => (
                <text key={i} x={cx} y={baseY - o * STEP} fontSize={18}>{HEAD}</text>
            ))}
        </g>
    );
};

const ChordSample = ({ cx, cy, root, color }) => (
    <g style={{ pointerEvents: 'none' }} fill={color} fontFamily="Georgia, serif">
        <text x={cx} y={cy + 5} fontSize={17} textAnchor="middle">{root}</text>
        <text x={cx + 13} y={cy - 4} fontSize={10} textAnchor="start">7</text>
    </g>
);

// The 5 chord-row options (Han #9). `id` is the row label; `value` is the canonical
// complexity stored in chordSettings (tonic→root, extended→ninth) so the existing
// PlaybackSettings complexity stepper + the generator stay in agreement.
const COMPLEXITY_OPTS = [
    { id: 'tonic', value: 'root' },
    { id: 'power', value: 'power' },
    { id: 'triad', value: 'triad' },
    { id: 'seventh', value: 'seventh' },
    { id: 'extended', value: 'ninth' },
];

const ChordStaffOverlay = ({
    startX, endX, trebleStart,
    chordDisplayMode = 'letters',
    chordComplexity = 'triad',
    onSetChordDisplayMode,
    onSetChordComplexity,
    debugMode = false,
}) => {
    if (startX == null || trebleStart == null) return null;
    // Two sub-rows above the treble staff: complexity (higher) + visualisation.
    const vizY = trebleStart - 42;
    const cplxY = trebleStart - 86;
    const span = (endX ?? startX) - startX;
    const cx33 = startX + span * 0.33;
    const cx66 = startX + span * 0.66;

    const isLetters = chordDisplayMode !== 'off' && chordDisplayMode !== 'roman';
    const hit = (key, rowY, node, hitX, hitW, onTap) => (
        <g key={key} data-fly=""
            style={{ cursor: onTap ? 'pointer' : 'default' }}
            onClick={onTap}>
            <rect x={hitX} y={rowY - 22} width={hitW} height={44} fill="transparent" />
            {node}
            {debugMode && (
                <rect x={hitX} y={rowY - 22} width={hitW} height={44}
                    fill="orange" fillOpacity={0.15} stroke="orange" strokeWidth={0.5}
                    style={{ pointerEvents: 'none' }} />
            )}
        </g>
    );

    const offColor = chordDisplayMode === 'off' ? 'var(--accent-yellow)' : 'var(--text-primary)';
    const lettersColor = isLetters ? 'var(--accent-yellow)' : 'var(--text-primary)';
    const romanColor = chordDisplayMode === 'roman' ? 'var(--accent-yellow)' : 'var(--text-primary)';

    // Complexity chords spread across [startX … endX], drawn as stacked noteheads.
    const cplxStep = (span - 30) / (COMPLEXITY_OPTS.length - 1);
    const cplxX0 = startX + 18;
    // map the stored complexity to one of the 5 row ids (root→tonic, ninth/…→extended)
    const activeCplx = ({ root: 'tonic', tonic: 'tonic', power: 'power', triad: 'triad',
        seventh: 'seventh', ninth: 'extended', eleventh: 'extended', thirteenth: 'extended',
        extended: 'extended' })[chordComplexity] || 'triad';

    return (
        <g className="chord-overlay" onClick={(e) => e.stopPropagation()}>
            {/* ── Complexity row (5 stacked-notehead chords) ── */}
            {onSetChordComplexity && COMPLEXITY_OPTS.map((opt, i) => {
                const cx = cplxX0 + i * cplxStep;
                const color = activeCplx === opt.id ? 'var(--accent-yellow)' : 'var(--text-primary)';
                return hit(`cplx-${opt.id}`, cplxY,
                    <ChordStack cx={cx} baseY={cplxY + 14} type={opt.id} color={color} />,
                    cx - 12, 24, () => onSetChordComplexity(opt.value));
            })}

            {/* ── Visualisation row: X disable at startX, letters@33%, roman@66% ── */}
            {hit('off', vizY, (
                <g stroke={offColor} strokeWidth={2.4} strokeLinecap="round" style={{ pointerEvents: 'none' }}>
                    <path d={`M ${startX - 8} ${vizY - 16} L ${startX + 8} ${vizY + 16}`} />
                    <path d={`M ${startX + 8} ${vizY - 16} L ${startX - 8} ${vizY + 16}`} />
                </g>
            ), startX - 12, 24, () => onSetChordDisplayMode?.('off'))}
            {hit('letters', vizY,
                <ChordSample cx={cx33} cy={vizY} root="D−" color={lettersColor} />,
                cx33 - 16, 36, () => onSetChordDisplayMode?.('letters'))}
            {hit('roman', vizY,
                <ChordSample cx={cx66} cy={vizY} root="ii" color={romanColor} />,
                cx66 - 16, 36, () => onSetChordDisplayMode?.('roman'))}
        </g>
    );
};

export default ChordStaffOverlay;
