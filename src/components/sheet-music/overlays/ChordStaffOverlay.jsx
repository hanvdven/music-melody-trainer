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
// `ties` is required by renderMelodyNotes (it reads melody.ties[index] unguarded).
const chordMelody = (notes) => ({
    notes: [notes], offsets: [0], durations: [WHOLE], displayNotes: [notes],
    ties: [null], triplets: null, rhythmicGrouping: null,
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
    // extended: bright [C4,G4] + lowlit [E4,B4] in the same column, then a lowlit
    // right-offset [D4,F4,A4] with ♭/♯ to their left (lowlit) — Han's spec.
    // The right-offset tension stack carries its OWN accidentals (♭ on the 9th, ♯ on
    // the 13th) so the renderer draws ♭/♯ to the LEFT of those noteheads — signalling
    // the altered extensions (Han #14). 'D♭4'/'A♯4' position on the D4/A4 line (the
    // accidental is stripped for placement) with a flat/sharp glyph in front; 'F4'
    // stays natural (no accidental in C). §6c: real renderer draws the accidentals.
    return (
        <g style={{ pointerEvents: 'none' }}>
            <MelodyNotesLayer {...common} melody={chordMelody(['C4', 'G4'])} previewMode={color} />
            <MelodyNotesLayer {...common} melody={chordMelody(['E4', 'B4'])} previewMode={LOWLIGHT} />
            <g transform="translate(8 0)">
                <MelodyNotesLayer {...common} melody={chordMelody(['D♭4', 'F4', 'A♯4'])} previewMode={LOWLIGHT} />
            </g>
        </g>
    );
};

// ChordStaffOverlay — the chord-COMPLEXITY selector (range setter). 5 chords drawn
// as real whole-notes at 10/30/50/70/90% of the width (Han #12 — avoids the clipping
// the old 0/25/…/100% layout caused). The chord STYLE (off/letters/roman) moved to
// the CLEF setter (see ChordStyleOverlay).
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

    return (
        <g className="chord-overlay" onClick={(e) => e.stopPropagation()}>
            {onSetChordComplexity && COMPLEXITY_OPTS.map((opt, i) => {
                const cx = startX + span * PCTS[i];
                return (
                    <g key={`cplx-${opt.id}`} data-fly=""
                        style={{ cursor: 'pointer' }}
                        onClick={() => onSetChordComplexity(opt.value)}>
                        <rect x={cx - 14} y={cplxRowY - 24} width={30} height={48} fill="transparent" />
                        <ChordNotes id={opt.id} cx={cx} baseY={cplxStaffY} active={activeCplx === opt.id} />
                        {debugMode && (
                            <rect x={cx - 14} y={cplxRowY - 24} width={30} height={48}
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
