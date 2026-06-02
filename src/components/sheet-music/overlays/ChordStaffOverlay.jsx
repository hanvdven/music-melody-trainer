import React from 'react';
import MelodyNotesLayer from '../MelodyNotesLayer';
import { TICKS_PER_WHOLE } from '../../../constants/timing';

/**
 * ChordStaffOverlay — in-SVG CHORD selector, shown in the chord row (above the treble
 * staff) inside the RANGE setter (Han #11). Two sub-rows:
 *
 *  VISUALISATION (chordDisplayMode): X (disable) at startX, then a short PROGRESSION
 *    sample at ~33% (letters: D⁻ G⁷ C) and ~66% (roman: ii V⁷ I), rendered as real
 *    chord-LABEL text (the sheet's chord-label style).
 *  COMPLEXITY (chordSettings.complexity): 5 clickable chords drawn as REAL stacked
 *    whole-notes via MelodyNotesLayer (§6c reuse — not hand-rolled glyphs):
 *    tonic [C4] · power [C4,G4] · triad [C4,E4,G4] · seventh [C4,E4,G4,B4] ·
 *    extended = [C4,G4] bright + [E4,B4] lowlit (same span) + right-offset [D4,F4,A4]
 *    lowlit with ♭/♯ to their left at D4/A4 (lowlit).
 *
 * The active option in each row is highlighted. Picks write chordDisplayMode /
 * chordSettings.complexity.
 */

const WHOLE = TICKS_PER_WHOLE;
const LAYER_PROPS = {
    numAccidentals: 0, noteGroupSize: WHOLE, measureLengthSlots: WHOLE, scaleNotes: [],
    tonic: '', processedChords: [], inputTestState: null, pixelsPerTick: null,
    startMeasureIndex: 0, transpositionSemitones: 0, debugMode: false, interactive: false,
    courtesyAccidentals: false, percussionVoiceSplit: false, noteColoringMode: 'none',
};
// One whole-note chord (array of note names) as a MelodyNotesLayer melody.
const chordMelody = (notes) => ({
    notes: [notes], offsets: [0], durations: [WHOLE], displayNotes: [notes],
});

// Note stacks per complexity option (real pitches, like the generator setter).
const CHORD_NOTES = {
    tonic: ['C4'],
    power: ['C4', 'G4'],
    triad: ['C4', 'E4', 'G4'],
    seventh: ['C4', 'E4', 'G4', 'B4'],
    // extended is rendered specially (see ExtendedChord).
};

// The 5 chord-row options. `value` is the canonical complexity stored in
// chordSettings (tonic→root, extended→ninth) so the existing PlaybackSettings
// complexity stepper + the generator stay in agreement.
const COMPLEXITY_OPTS = [
    { id: 'tonic', value: 'root' },
    { id: 'power', value: 'power' },
    { id: 'triad', value: 'triad' },
    { id: 'seventh', value: 'seventh' },
    { id: 'extended', value: 'ninth' },
];

const LOWLIGHT = 'var(--range-lowlight)';

// A complexity chord rendered as real whole-notes at the chord-row staff position.
// `baseY` is the staff top fed to MelodyNotesLayer; `cx` is the chord centre.
const ChordNotes = ({ id, cx, baseY, active }) => {
    const color = active ? 'var(--accent-yellow)' : 'var(--text-primary)';
    const common = {
        ...LAYER_PROPS, staff: 'treble', clef: 'treble', staffYStart: baseY,
        startX: cx, noteWidth: 0, allOffsets: [0, 1], timeSignature: [4, 4],
    };
    if (id !== 'extended') {
        return (
            <g style={{ pointerEvents: 'none' }}>
                <MelodyNotesLayer {...common} melody={chordMelody(CHORD_NOTES[id])} previewMode={color} />
            </g>
        );
    }
    // extended: bright [C4,G4] + lowlit [E4,B4] in the same column, then a lowlit
    // right-offset [D4,F4,A4] with ♭/♯ to their left (lowlit) — Han's spec.
    return (
        <g style={{ pointerEvents: 'none' }}>
            <MelodyNotesLayer {...common} melody={chordMelody(['C4', 'G4'])} previewMode={color} />
            <MelodyNotesLayer {...common} melody={chordMelody(['E4', 'B4'])} previewMode={LOWLIGHT} />
            <g transform="translate(8 0)">
                <MelodyNotesLayer {...common} melody={chordMelody(['D4', 'F4', 'A4'])} previewMode={LOWLIGHT} />
            </g>
        </g>
    );
};

// A short chord-label progression sample (letters or roman), real chord-label style.
const ProgressionSample = ({ cx, cy, kind, color }) => {
    const items = kind === 'roman'
        ? [{ r: 'ii' }, { r: 'V', sup: '7' }, { r: 'I' }]
        : [{ r: 'D−' }, { r: 'G', sup: '7' }, { r: 'C' }];
    const GAP = 15;   // ~15 units apart (Han)
    const x0 = cx - GAP;
    return (
        <g style={{ pointerEvents: 'none' }} fill={color} fontFamily="Georgia, serif">
            {items.map((it, i) => (
                <g key={i}>
                    <text x={x0 + i * GAP} y={cy + 5} fontSize={15} textAnchor="middle">{it.r}</text>
                    {it.sup && <text x={x0 + i * GAP + 8} y={cy - 3} fontSize={9} textAnchor="start">{it.sup}</text>}
                </g>
            ))}
        </g>
    );
};

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
    const vizY = trebleStart - 44;
    const cplxStaffY = trebleStart - 120;   // staff top fed to MelodyNotesLayer
    const span = (endX ?? startX) - startX;
    const cx33 = startX + span * 0.33;
    const cx66 = startX + span * 0.66;

    const isLetters = chordDisplayMode !== 'off' && chordDisplayMode !== 'roman';
    const hit = (key, rowY, node, hitX, hitW, onTap) => (
        <g key={key} data-fly=""
            style={{ cursor: onTap ? 'pointer' : 'default' }}
            onClick={onTap}>
            <rect x={hitX} y={rowY - 24} width={hitW} height={48} fill="transparent" />
            {node}
            {debugMode && (
                <rect x={hitX} y={rowY - 24} width={hitW} height={48}
                    fill="orange" fillOpacity={0.15} stroke="orange" strokeWidth={0.5}
                    style={{ pointerEvents: 'none' }} />
            )}
        </g>
    );

    const offColor = chordDisplayMode === 'off' ? 'var(--accent-yellow)' : 'var(--text-primary)';
    const lettersColor = isLetters ? 'var(--accent-yellow)' : 'var(--text-primary)';
    const romanColor = chordDisplayMode === 'roman' ? 'var(--accent-yellow)' : 'var(--text-primary)';

    const cplxStep = (span - 36) / (COMPLEXITY_OPTS.length - 1);
    const cplxX0 = startX + 24;
    const cplxRowY = cplxStaffY + 20;   // approx visual centre for the hit box
    const activeCplx = ({ root: 'tonic', tonic: 'tonic', power: 'power', triad: 'triad',
        seventh: 'seventh', ninth: 'extended', eleventh: 'extended', thirteenth: 'extended',
        extended: 'extended' })[chordComplexity] || 'triad';

    return (
        <g className="chord-overlay" onClick={(e) => e.stopPropagation()}>
            {/* ── Complexity row: 5 real whole-note chords ── */}
            {onSetChordComplexity && COMPLEXITY_OPTS.map((opt, i) => {
                const cx = cplxX0 + i * cplxStep;
                return hit(`cplx-${opt.id}`, cplxRowY,
                    <ChordNotes id={opt.id} cx={cx} baseY={cplxStaffY} active={activeCplx === opt.id} />,
                    cx - 14, 30, () => onSetChordComplexity(opt.value));
            })}

            {/* ── Visualisation row: X at startX, letters@33%, roman@66% ── */}
            {hit('off', vizY, (
                <g stroke={offColor} strokeWidth={2.4} strokeLinecap="round" style={{ pointerEvents: 'none' }}>
                    <path d={`M ${startX - 8} ${vizY - 16} L ${startX + 8} ${vizY + 16}`} />
                    <path d={`M ${startX + 8} ${vizY - 16} L ${startX - 8} ${vizY + 16}`} />
                </g>
            ), startX - 12, 24, () => onSetChordDisplayMode?.('off'))}
            {hit('letters', vizY,
                <ProgressionSample cx={cx33} cy={vizY} kind="letters" color={lettersColor} />,
                cx33 - 28, 56, () => onSetChordDisplayMode?.('letters'))}
            {hit('roman', vizY,
                <ProgressionSample cx={cx66} cy={vizY} kind="roman" color={romanColor} />,
                cx66 - 28, 56, () => onSetChordDisplayMode?.('roman'))}
        </g>
    );
};

export default ChordStaffOverlay;
