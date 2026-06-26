import React from 'react';
import MelodyNotesLayer from '../MelodyNotesLayer';
import { getNoteAbsoluteY } from '../renderMelodyNotes';
import { TICKS_PER_WHOLE } from '../../../constants/timing';
import { NOTE_FONT_SIZE, ACC_DY } from '../staffNoteGlyph';

/**
 * ChordStaffOverlay — in-SVG CHORD selector, shown in the chord row (above the treble
 * staff) inside the RANGE setter (Han #11). Two sub-rows:
 *
 *  VISUALISATION (chordDisplayMode): X (disable) at startX, then a short PROGRESSION
 *    sample at ~33% (letters: D⁻ G⁷ C) and ~66% (roman: ii V⁷ I), rendered as real
 *    chord-LABEL text (the sheet's chord-label style).
 *  COMPLEXITY (chordSettings.complexity): 5 clickable chords drawn as REAL stacked
 *    whole-notes via MelodyNotesLayer (§6c reuse — not hand-rolled glyphs). Shifted to
 *    start at D4 so the lowest note has no C4 ledger (Han 2026-06-03):
 *    tonic [D4] · power [D4,A4] · triad [D4,F4,A4] · seventh [D4,F4,A4,C5] ·
 *    extended = [D4,A4] bright + [F4,C5] lowlit (same span) + right-offset [E♭4,G4,B4]
 *    lowlit with ♭ to their left (lowlit).
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
// `ties` is required by renderMelodyNotes (it reads melody.ties[index] unguarded).
const chordMelody = (notes) => ({
    notes: [notes], offsets: [0], durations: [WHOLE], displayNotes: [notes],
    ties: [null], triplets: null, rhythmicGrouping: null,
});

// Note stacks per complexity option. Shifted up a step to start at D4 (was C4) so the
// lowest note hangs just below the staff with NO ledger line (Han 2026-06-03 "D4
// onderaan"). These are illustrative complexity shapes, so the exact root doesn't matter.
const CHORD_NOTES = {
    tonic: ['D4'],
    power: ['D4', 'A4'],
    triad: ['D4', 'F4', 'A4'],
    seventh: ['D4', 'F4', 'A4', 'C5'],
    // extended is rendered specially (see below).
};

// The 5 chord-row options. `value` is the canonical complexity stored in
// chordSettings (tonic→root, extended→ninth) so the existing PlaybackSettings
// complexity stepper + the generator stay in agreement.
// `label` is the discreet caption shown UNDER each chord shape (Han 2026-06-19 —
// see CPLX_LABEL_* constants below). Exact wording chosen by Han.
const COMPLEXITY_OPTS = [
    { id: 'tonic', value: 'root', label: 'root' },
    { id: 'power', value: 'power', label: 'power' },
    { id: 'triad', value: 'triad', label: 'triad' },
    { id: 'seventh', value: 'seventh', label: 'seventh' },
    { id: 'extended', value: 'ninth', label: 'altered/extended' },
];

// Discreet caption styling for the chord-type labels (Han 2026-06-19). Re-uses the
// overlay's smallest existing caption convention — the icons8-attribution text in
// InstrumentStaffOverlay (sans-serif, fontSize 9, var(--text-dim)). Kept small + dim
// on purpose: the previous labels (removed 2026-05-31) clashed with the UI-overhaul
// style by being too prominent; this revival is deliberately understated.
const CPLX_LABEL_FS = 10;                       // a touch above the 9px attribution caption, still discreet
const CPLX_LABEL_FILL = 'var(--text-secondary)'; // theme text var, low-emphasis
const CPLX_LABEL_DY = 16;                       // px below the chord glyphs / hit-rect bottom edge

const LOWLIGHT = 'var(--range-lowlight)';
// Extended-chord column offsets (Han BUG-V2): the accidentals column sits EXT_ACC_DX
// left of the D-F-A-C core, the E-G-B tension column EXT_COL_DX to its right.
// Tightened so the three columns read as one compact chord cluster rather than three
// spread-out stacks (Han 2026-06-19: "3 columns closer together"). The MelodyNotesLayer
// column startX values below still derive from these constants, so the noteheads move
// with the offsets and keep their relative spacing — no collision after tightening.
const EXT_ACC_DX = 12;
const EXT_COL_DX = 16;

// A complexity chord rendered as real whole-notes at the chord-row staff position.
// `baseY` is the staff top fed to MelodyNotesLayer; `cx` is the chord centre.
const ChordNotes = ({ id, cx, baseY, active }) => {
    // Active = normal colour (NOT yellow); passive = lowlight, opacity 1 (Han #14).
    const color = active ? 'var(--text-primary)' : 'var(--text-lowlight)';
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
    // extended: THREE clean columns, left→right (Han BUG-V2, 2026-06-08):
    //   1. ACCIDENTALS — the altered-tension ♭/♯ pulled into their OWN leftmost column.
    //      The auto-renderer can only draw an accidental hugging its own notehead, so it
    //      could never sit in a separate column; these two glyphs are therefore drawn by
    //      hand (the noteheads themselves stay on the real renderer). Aligned to the E
    //      (♭9) and B (13) rows so they read as a tidy vertical pair.
    //   2. D F A C — the seventh-chord core: D + A bright (tonic + fifth, "current
    //      bright/lowlight intent"), F + C lowlit.
    //   3. E G B — the 9 / 11 / 13 tensions, lowlit, offset to the right.
    const flatY = getNoteAbsoluteY('E4', baseY, 'treble', 'treble');
    const sharpY = getNoteAbsoluteY('B4', baseY, 'treble', 'treble');
    const tensionCol = { ...common, startX: cx + EXT_COL_DX };
    return (
        <g style={{ pointerEvents: 'none' }}>
            {/* col 1 — accidentals (canonical Maestro from staffNoteGlyph). Unicode per §5b. */}
            <text x={cx - EXT_ACC_DX} y={flatY + ACC_DY} fontSize={NOTE_FONT_SIZE} fontFamily="Maestro"
                fill={LOWLIGHT} textAnchor="end">♭</text>
            <text x={cx - EXT_ACC_DX} y={sharpY + ACC_DY} fontSize={NOTE_FONT_SIZE} fontFamily="Maestro"
                fill={LOWLIGHT} textAnchor="end">♯</text>
            {/* col 2 — D F A C (start at D4, no C4 ledger; D+A bright, F+C lowlit). */}
            <MelodyNotesLayer {...common} melody={chordMelody(['D4', 'A4'])} previewMode={color} />
            <MelodyNotesLayer {...common} melody={chordMelody(['F4', 'C5'])} previewMode={LOWLIGHT} />
            {/* col 3 — E G B tensions, offset right into their own column. */}
            <MelodyNotesLayer {...tensionCol} melody={chordMelody(['E4', 'G4', 'B4'])} previewMode={LOWLIGHT} />
        </g>
    );
};

// ChordStaffOverlay — the chord-COMPLEXITY selector (range setter). 5 chords drawn
// as real whole-notes at 10/30/50/70/90% of the width (Han #12 — avoids the clipping
// the old 0/25/…/100% layout caused). The chord STYLE (off/letters/roman) moved to
// the CLEF setter (see ChordStyleOverlay).
// Text labels under each chord were REMOVED 2026-05-31 (clashed with the UI-overhaul
// style), but Han REVERSED that 2026-06-19 — they're back as DISCREET captions
// (root / power / triad / seventh / altered/extended). See CPLX_LABEL_* constants and
// the <text> render below; non-interactive (pointerEvents:none).
const ChordStaffOverlay = ({
    startX, endX, trebleStart,
    chordComplexity = 'triad',
    onSetChordComplexity,
    debugMode = false,
}) => {
    if (startX == null || trebleStart == null) return null;
    // Raised (was −86) so the chord row clears the range-setter notes/handles drawn
    // on the treble staff below (Han #14 — chords were overlapping the setter).
    const cplxStaffY = trebleStart - 108;   // staff top fed to MelodyNotesLayer
    const span = (endX ?? startX) - startX;
    const cplxRowY = cplxStaffY + 20;       // approx visual centre for the hit box

    const activeCplx = ({ root: 'tonic', tonic: 'tonic', power: 'power', triad: 'triad',
        seventh: 'seventh', ninth: 'extended', eleventh: 'extended', thirteenth: 'extended',
        extended: 'extended' })[chordComplexity] || 'triad';

    // Centres at 10/30/50/70/90% of the row width (Han #12).
    const PCTS = [0.10, 0.30, 0.50, 0.70, 0.90];
    // Hit box wider (was a fixed 30) so chords aren't fiddly to tap and the box covers
    // the chord's noteheads, incl. the extended chord's 3 columns (Han 2026-06-03). Sized
    // to ~80% of the inter-chord slot; shifted right a touch so it brackets the notes
    // (which extend right of cx) rather than sitting left of them.
    // Wide enough to bracket the extended chord's three columns incl. the leftmost
    // accidentals column (which extends EXT_ACC_DX left of cx) — Han BUG-V2.
    const HIT_W = Math.max(52, span * 0.20 * 0.85);

    return (
        <g className="chord-overlay" onClick={(e) => e.stopPropagation()}>
            {onSetChordComplexity && COMPLEXITY_OPTS.map((opt, i) => {
                const cx = startX + span * PCTS[i];
                const hitX = cx - 20;            // covers the extended chord's accidentals column
                return (
                    <g key={`cplx-${opt.id}`} data-fly=""
                        style={{ cursor: 'pointer' }}
                        onClick={() => onSetChordComplexity(opt.value)}>
                        <rect x={hitX} y={cplxRowY - 24} width={HIT_W} height={48} fill="transparent" />
                        <ChordNotes id={opt.id} cx={cx} baseY={cplxStaffY} active={activeCplx === opt.id} />
                        {/* Discreet chord-type caption centred under the glyph, just below the
                            hit-rect's bottom edge (cplxRowY+24). Non-interactive so it can't
                            steal taps from the rect above it (Han 2026-06-19). */}
                        <text x={cx} y={cplxRowY + 24 + CPLX_LABEL_DY} textAnchor="middle"
                            fontFamily="sans-serif" fontSize={CPLX_LABEL_FS} fill={CPLX_LABEL_FILL}
                            style={{ pointerEvents: 'none' }}>
                            {opt.label}
                        </text>
                        {debugMode && (
                            <rect x={hitX} y={cplxRowY - 24} width={HIT_W} height={48}
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
