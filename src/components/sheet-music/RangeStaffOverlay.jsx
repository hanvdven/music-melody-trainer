import React from 'react';
import { getNoteAbsoluteY } from './renderMelodyNotes';
import { getNoteValue } from '../../utils/rangeUtils';
import { PRESET_RANGES } from '../../constants/ranges';

/**
 * RangeStaffOverlay — in-SVG range selector (sheet/bladmuziek variant).
 *
 * PHASE 2 (this commit): STATIC render only. Draws a diagonal row of selectable
 * NATURAL noteheads on the treble and bass staves (lowest pitch left → highest
 * right), using the exact same pitch→Y math as the real renderer
 * (`getNoteAbsoluteY`) so they sit precisely where real notes do. The current
 * {min,max} band is highlighted; out-of-band notes are ghosted; two handles mark
 * the boundaries. No interaction yet (drag/tap come in Phase 3).
 *
 * Decisions (see docs/range-overlay-design.md §9): diatonic positions/snapping
 * (naturals only, D1); extent = FULL preset ± 1 octave, marked 8vb/8va (D2).
 *
 * Rendered as a sibling of SettingsOverlay inside the SheetMusic SVG <g>.
 */

// Natural pitch classes only (C D E F G A B) — diatonic row, D1.
const PC_TO_LETTER = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

// Natural note names (with octave) for every natural MIDI in [lowMidi, highMidi].
const naturalsInRange = (lowMidi, highMidi) => {
    const out = [];
    for (let m = lowMidi; m <= highMidi; m++) {
        const letter = PC_TO_LETTER[((m % 12) + 12) % 12];
        if (!letter) continue; // skip black-key semitones
        const octave = Math.floor(m / 12) - 1;
        out.push({ midi: m, name: `${letter}${octave}` });
    }
    return out;
};

const NOTEHEAD = 'Ï';        // filled head — same Maestro glyph the renderer uses
const HEAD_SIZE = 22;
const ROW_RIGHT_GAP = 44;    // reserve space at the right for preset chips (Phase 4)

// One staff's worth of selectable noteheads + band + handles.
const StaffRow = ({ staff, staffStart, clef, range, startX, endX }) => {
    const preset = PRESET_RANGES.FULL[staff];               // FULL extent per staff
    // Extent = FULL ± 1 octave (D2), clamped to the app's hard bounds (21..108).
    const rowLow = Math.max(21, getNoteValue(preset.min) - 12);
    const rowHigh = Math.min(108, getNoteValue(preset.max) + 12);

    const notes = naturalsInRange(rowLow, rowHigh);
    if (notes.length === 0) return null;

    const rowStartX = startX + 8;
    const rowEndX = endX - ROW_RIGHT_GAP;
    const step = notes.length > 1 ? (rowEndX - rowStartX) / (notes.length - 1) : 0;

    const selMin = getNoteValue(range?.min);
    const selMax = getNoteValue(range?.max);

    return (
        <g className="range-staff-row">
            {notes.map((n, i) => {
                const x = rowStartX + i * step;
                const y = getNoteAbsoluteY(n.name, staffStart, clef, staff);
                if (y == null) return null;
                const inBand = n.midi >= selMin && n.midi <= selMax;
                const isBoundary = n.midi === selMin || n.midi === selMax;
                return (
                    <g key={n.name}>
                        <text
                            x={x} y={y}
                            textAnchor="middle"
                            fontFamily="Maestro"
                            fontSize={HEAD_SIZE}
                            fill={inBand ? 'var(--accent-yellow)' : 'var(--text-primary)'}
                            opacity={inBand ? 1 : 0.22}
                            className="svg-no-interact"
                        >
                            {NOTEHEAD}
                        </text>
                        {/* Boundary handle: a small ring around the min/max notehead. */}
                        {isBoundary && (
                            <circle
                                cx={x} cy={y - 5} r={11}
                                fill="none"
                                stroke="var(--accent-yellow)"
                                strokeWidth={1.5}
                                className="svg-no-interact"
                            />
                        )}
                    </g>
                );
            })}

            {/* 8vb / 8va extension labels at the row extremes (D2). */}
            <text x={rowStartX} y={staffStart - 6} textAnchor="middle"
                fontFamily="serif" fontStyle="italic" fontSize={11}
                fill="var(--text-dim)" className="svg-no-interact">8vb</text>
            <text x={rowEndX} y={staffStart - 6} textAnchor="middle"
                fontFamily="serif" fontStyle="italic" fontSize={11}
                fill="var(--text-dim)" className="svg-no-interact">8va</text>
        </g>
    );
};

const RangeStaffOverlay = ({
    startX, endX,
    trebleStart, bassStart,
    isTrebleVisible, isBassVisible,
    clefTreble, clefBass,
    trebleRange, bassRange,
}) => {
    if (startX == null || endX == null) return null;
    return (
        // stopPropagation so taps here don't fall through to the sheet click
        // handler (Phase 3 will add real interaction inside this group).
        <g className="range-overlay" onClick={(e) => e.stopPropagation()}>
            {isTrebleVisible && (
                <StaffRow
                    staff="treble" staffStart={trebleStart} clef={clefTreble}
                    range={trebleRange} startX={startX} endX={endX}
                />
            )}
            {isBassVisible && (
                <StaffRow
                    staff="bass" staffStart={bassStart} clef={clefBass}
                    range={bassRange} startX={startX} endX={endX}
                />
            )}
        </g>
    );
};

export default RangeStaffOverlay;
