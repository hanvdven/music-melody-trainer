import React from 'react';
import MelodyNotesLayer from '../MelodyNotesLayer';
import { noteYMap, getNoteAbsoluteY } from '../renderMelodyNotes';
import { getNoteValue } from '../../../utils/rangeUtils';
import { PRESET_RANGES } from '../../../constants/ranges';
import { orderedPercussionPads } from '../../../audio/drumKits';
import { TICKS_PER_WHOLE } from '../../../constants/timing';

/**
 * RangeStaffOverlay — in-SVG range selector (sheet/bladmuziek variant).
 *
 * PHASE 2: STATIC render. Shows the selectable pitches as a synthetic "melody"
 * rendered THROUGH the real note renderer (MelodyNotesLayer / renderMelodyNotes)
 * so we reuse its ledger-line drawing, ottava (8va/8vb/15ma/15vb) vertical
 * shifting and notehead glyphs (CLAUDE.md §6c — do not reinvent rendering).
 *
 * Layout: each staff gets a horizontal row of selectable noteheads spread across
 * the staff width by giving them sequential offsets on a private slot grid (the
 * renderer's slot-index X mode, pixelsPerTick=null). Pitch still maps to the
 * correct staff line, so the row reads as an ascending diagonal. Percussion is
 * ordered per instrument family (orderedPercussionPads), variants behind base.
 *
 * Colouring (Han 2026-05-30, all via CSS theme vars):
 *   - boundary notes (current min & max)  → --accent-yellow (highlight)
 *   - notes inside the band                → --text-primary  (white/high)
 *   - notes outside the band               → --text-dim, dimmed (lowlight)
 * Achieved by splitting the row into three sub-melodies, each rendered with the
 * renderer's `previewMode` colour override.
 *
 * Preset brackets: in the reserved right margin each melodic preset
 * (STANDARD/LARGE/FULL) is drawn as a right bracket spanning that preset's range
 * (Han 2026-05-30: "alleen een rechter blokhaak, die de juiste span heeft"). The
 * bracket matching the staff's current range is highlighted.
 *
 * A mode indicator makes it obvious the sheet is in range-selector mode.
 *
 * No interaction yet (drag/tap, percussion pool on/off, preset tap-to-apply =
 * Phase 3).
 */

const QUARTER = TICKS_PER_WHOLE / 4;   // quarter-note duration → filled head + stem, no flag/beam
// Reserved right margin holding the preset brackets. Also makes the note row
// more compact, as Han requested.
const PRESET_AREA_WIDTH = 92;
// Out-of-band ("lowlight") notes are dimmed further via group opacity.
const LOWLIGHT_OPACITY = 0.3;
// Preset-bracket geometry (in the reserved right margin).
const BRACKET_TICK = 7;         // horizontal tick length of the right bracket
const BRACKET_GAP = 26;         // x-spacing between nested preset brackets
const BRACKET_LABEL_SIZE = 9;

// Natural pitch classes only — diatonic row (D1).
const PC_TO_LETTER = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

const naturalsInRange = (lowMidi, highMidi) => {
    const out = [];
    for (let m = lowMidi; m <= highMidi; m++) {
        const letter = PC_TO_LETTER[((m % 12) + 12) % 12];
        if (!letter) continue;
        out.push({ midi: m, name: `${letter}${Math.floor(m / 12) - 1}` });
    }
    return out;
};

// Constant MelodyNotesLayer props for our synthetic, rhythm-less selectable rows.
const STATIC_LAYER_PROPS = {
    numAccidentals: 0,
    noteGroupSize: 1,
    measureLengthSlots: 9999,   // single long "measure" → no barline/accidental resets
    scaleNotes: [],
    tonic: '',
    processedChords: [],
    inputTestState: null,
    pixelsPerTick: null,        // slot-index X layout
    startMeasureIndex: 0,
    transpositionSemitones: 0,
    debugMode: false,
    interactive: false,
    courtesyAccidentals: false,
    percussionVoiceSplit: false,
    noteColoringMode: 'none',
};

const mkMelody = (entries) => ({
    notes: entries.map(e => e.name),
    offsets: entries.map(e => e.offset),
    durations: entries.map(() => QUARTER),
    ties: entries.map(() => null),
    triplets: null,
    rhythmicGrouping: null,
});

// Build a right-bracket path "]" spanning [yTop, yBottom] at x.
const rightBracketPath = (x, yTop, yBottom, tick) =>
    `M ${x - tick} ${yTop} H ${x} V ${yBottom} H ${x - tick}`;

const RangeStaffOverlay = ({
    startX, endX,
    trebleStart, bassStart, percussionStart,
    isTrebleVisible, isBassVisible, isPercussionVisible,
    clefTreble, clefBass,
    trebleRange, bassRange,
    timeSignature, theme,
}) => {
    if (startX == null || endX == null) return null;

    // Render one melodic staff's selectable row (treble or bass).
    const melodicStaff = (staff, staffStart, clef, range) => {
        const preset = PRESET_RANGES.FULL[staff];
        // Extent = FULL ± 1 octave (D2), clamped to the app's hard bounds (21..108).
        const rowLow = Math.max(21, getNoteValue(preset.min) - 12);
        const rowHigh = Math.min(108, getNoteValue(preset.max) + 12);
        const notes = naturalsInRange(rowLow, rowHigh);
        const N = notes.length;
        if (!N) return null;

        const selMin = getNoteValue(range?.min);
        const selMax = getNoteValue(range?.max);

        // Private slot grid: offsets 1..N, with a leading 0 sentinel so the
        // renderer's getTickX (startX + (indexOf(offset)-1)*noteWidth) puts the
        // first note exactly at startX.
        const allOffsets = Array.from({ length: N + 1 }, (_, i) => i);
        const noteWidth = (endX - PRESET_AREA_WIDTH - startX) / N;

        const out = [], inBand = [], boundary = [];
        notes.forEach((n, i) => {
            const entry = { name: n.name, offset: i + 1, midi: n.midi };
            if (n.midi === selMin || n.midi === selMax) boundary.push(entry);
            else if (n.midi > selMin && n.midi < selMax) inBand.push(entry);
            else out.push(entry);
        });

        const colorLayers = [
            { key: 'out', color: 'var(--text-dim)', opacity: LOWLIGHT_OPACITY, entries: out },
            { key: 'in', color: 'var(--text-primary)', opacity: 1, entries: inBand },
            { key: 'bound', color: 'var(--accent-yellow)', opacity: 1, entries: boundary },
        ];

        return (
            <g className={`range-row range-row-${staff}`} key={staff}>
                {colorLayers.map(layer => layer.entries.length > 0 && (
                    <g key={layer.key} style={{ opacity: layer.opacity }}>
                        <MelodyNotesLayer
                            {...STATIC_LAYER_PROPS}
                            melody={mkMelody(layer.entries)}
                            staff={staff}
                            staffYStart={staffStart}
                            clef={clef}
                            startX={startX}
                            noteWidth={noteWidth}
                            allOffsets={allOffsets}
                            timeSignature={timeSignature}
                            theme={theme}
                            previewMode={layer.color}
                        />
                    </g>
                ))}
            </g>
        );
    };

    // Preset brackets for a melodic staff, nested in the reserved right margin.
    const melodicPresetBrackets = (staff, staffStart, clef, range) => {
        const selMin = getNoteValue(range?.min);
        const selMax = getNoteValue(range?.max);
        const presetX0 = endX - PRESET_AREA_WIDTH + BRACKET_TICK + 4;
        const modes = ['STANDARD', 'LARGE', 'FULL'];
        return (
            <g className={`range-presets range-presets-${staff}`}>
                {modes.map((mode, i) => {
                    const p = PRESET_RANGES[mode][staff];
                    const pMin = getNoteValue(p.min);
                    const pMax = getNoteValue(p.max);
                    const yTop = getNoteAbsoluteY(p.max, staffStart, clef, staff);
                    const yBottom = getNoteAbsoluteY(p.min, staffStart, clef, staff);
                    if (yTop == null || yBottom == null) return null;
                    const x = presetX0 + i * BRACKET_GAP;
                    // Highlight the bracket matching the staff's current range.
                    const isActive = pMin === selMin && pMax === selMax;
                    const color = isActive ? 'var(--accent-yellow)' : 'var(--text-dim)';
                    const midY = (yTop + yBottom) / 2;
                    return (
                        <g key={mode}>
                            <path d={rightBracketPath(x, yTop, yBottom, BRACKET_TICK)}
                                fill="none" stroke={color}
                                strokeWidth={isActive ? 1.6 : 1} />
                            <text x={x - BRACKET_TICK - 2} y={midY}
                                fill={color} fontSize={BRACKET_LABEL_SIZE}
                                fontFamily="Georgia, serif" textAnchor="end"
                                dominantBaseline="middle"
                                transform={`rotate(-90 ${x - BRACKET_TICK - 2} ${midY})`}>
                                {mode}
                            </text>
                        </g>
                    );
                })}
            </g>
        );
    };

    // Percussion selectable row — every kit pad with a staff position, ordered
    // per instrument family (orderedPercussionPads), variants behind base.
    const percussionStaffRow = () => {
        const ids = orderedPercussionPads().filter(id => noteYMap[id] != null);
        const M = ids.length;
        if (!M) return null;
        const allOffsets = Array.from({ length: M + 1 }, (_, i) => i);
        const noteWidth = (endX - PRESET_AREA_WIDTH - startX) / M;
        return (
            <g className="range-row range-row-percussion" key="percussion">
                <MelodyNotesLayer
                    {...STATIC_LAYER_PROPS}
                    melody={mkMelody(ids.map((id, i) => ({ name: id, offset: i + 1 })))}
                    staff="percussion"
                    staffYStart={percussionStart}
                    clef={null}
                    startX={startX}
                    noteWidth={noteWidth}
                    allOffsets={allOffsets}
                    timeSignature={timeSignature}
                    theme={theme}
                    previewMode={'var(--text-primary)'}
                />
            </g>
        );
    };

    // Clear "you are in range-selector mode" indicator (Han 2026-05-30).
    const modeIndicator = () => (
        <g className="range-mode-indicator" style={{ pointerEvents: 'none' }}>
            <text x={startX} y={trebleStart - 30}
                fill="var(--accent-yellow)" fontSize={12}
                fontFamily="Georgia, serif" fontWeight="bold"
                letterSpacing="1">
                ◆ RANGE SELECTOR
            </text>
        </g>
    );

    return (
        <g className="range-overlay" onClick={(e) => e.stopPropagation()}>
            {modeIndicator()}
            {isTrebleVisible && melodicStaff('treble', trebleStart, clefTreble, trebleRange)}
            {isBassVisible && melodicStaff('bass', bassStart, clefBass, bassRange)}
            {isTrebleVisible && melodicPresetBrackets('treble', trebleStart, clefTreble, trebleRange)}
            {isBassVisible && melodicPresetBrackets('bass', bassStart, clefBass, bassRange)}
            {isPercussionVisible && percussionStaffRow()}
        </g>
    );
};

export default RangeStaffOverlay;
