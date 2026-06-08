import React from 'react';
import { getNoteFromValue } from '../../../utils/rangeUtils';
import { getNoteAbsoluteY } from '../renderMelodyNotes';
import { ClefGlyph, variantToSymbolKey } from '../clefGlyphs';

/**
 * TranspositionSetter — compact in-staff transposition control (Han 2026-06-08).
 *
 * ⚠ VISUAL v1 MOCKUP — LINEAR placeholder, not yet wired into the live app. It exists to
 * agree the layout with Han before it REPLACES the horizontal transposition cards in the
 * notation setter. The final carousel is NON-LINEAR (a "tangens" curve Han will draw).
 *
 * Semantics (Han's interview): the carousel sets **concert C4 is WRITTEN as the chosen
 * note** → transpositionSemitones = writtenMidi − 60 (maps to a transpositionKey via
 * TRANSPOSING_INSTRUMENTS; all 0..11 offsets + the negative ones have keys).
 *
 * Layout (Han 2026-06-08 revision): per staff a single control —
 *     [clef]  "C4 ="  [diagonal carousel of NOTEHEADS]
 * The noteheads are REAL sheet-music notes (not names), arranged on a DIAGONAL: each
 * half-step right also moves up the staff (noteYMap = 5 units per diatonic step), so the
 * notes trace the staff's own pitch gradient. The SELECTED note sits at a FIXED x (anchorX)
 * and its CORRECT staff position. Scrolling slides the whole diagonal — notes travel left↔
 * right AND up↕down together — bringing the next half-step onto the anchor. Note spelling
 * follows the keyboard (sharps: C, C♯, D, D♯…), drawn as notehead + ♯ accidental.
 */

const C4_MIDI = 60;
const STEPS = 6;     // ± half-steps shown on the diagonal around the selection
const DX = 34;       // horizontal spacing per half-step (the diagonal's run)

// One DIAGONAL half-step carousel of real noteheads centred on `centerMidi`. The active
// note (d=0) is at `anchorX` and its true staff Y; neighbours fan out along the diagonal
// and fade toward the edges (the LINEAR placeholder for the future tangens curve).
const DiagonalNotes = ({ anchorX, centerMidi, staffStart, clef, staff, color, lowColor }) => {
    const notes = [];
    const linePts = [];
    for (let d = -STEPS; d <= STEPS; d++) {
        const name = getNoteFromValue(centerMidi + d);   // keyboard/sharp spelling, e.g. 'C#4'
        const y = getNoteAbsoluteY(name, staffStart, clef, staff);
        if (y == null) continue;
        const x = anchorX + d * DX;
        const dist = Math.abs(d);
        const op = d === 0 ? 1 : Math.max(0.18, 0.75 - dist * 0.12);
        const fill = d === 0 ? color : lowColor;
        linePts.push(`${x},${y}`);
        notes.push(
            <g key={d} opacity={op} style={{ pointerEvents: 'none' }}>
                {name.includes('#') && (
                    // ♯ accidental drawn just left of the notehead (Maestro '#').
                    <text x={x - 12} y={y + 4} fontSize={20} fontFamily="Maestro"
                        textAnchor="middle" fill={fill}>#</text>
                )}
                {/* Whole-note head (Maestro 'w'); +9 lifts the glyph baseline so the head
                    centres on the staff Y. */}
                <text x={x} y={y + 9} fontSize={28} fontFamily="Maestro"
                    textAnchor="middle" fill={fill}>w</text>
            </g>,
        );
    }
    return (
        <g>
            {/* Faint guide showing the diagonal the notes ride on. */}
            <polyline points={linePts.join(' ')} fill="none" stroke={lowColor}
                strokeWidth={0.75} strokeDasharray="3 3" opacity={0.45}
                style={{ pointerEvents: 'none' }} />
            {notes}
        </g>
    );
};

const TranspositionSetter = ({
    staff, clef, staffStart, startX, endX,
    transSemitones = 0,           // current concert→written offset
    debugMode = false,
}) => {
    if (startX == null || endX == null) return null;

    const writtenCenter = C4_MIDI + transSemitones;   // concert C4 → written note
    const color = 'var(--text-primary)';
    const low = 'var(--setter-lowlight)';
    const midY = staffStart + 20;                     // ≈ middle staff line

    const clefX = startX + 6;
    const labelX = startX + 46;                       // "C4 ="
    const anchorX = startX + 120;                     // fixed x of the active notehead

    return (
        <g className={`transposition-setter transposition-setter-${staff}`}>
            <ClefGlyph symbolKey={variantToSymbolKey(clef)} x={clefX} baseY={staffStart + 30}
                fill={color} anchor="start" />

            <text x={labelX} y={midY + 6} fontSize={17} fontFamily="Georgia, serif"
                textAnchor="middle" fill={color} style={{ pointerEvents: 'none' }}>
                C4 =
            </text>

            <DiagonalNotes anchorX={anchorX} centerMidi={writtenCenter} staffStart={staffStart}
                clef={clef} staff={staff} color={color} lowColor={low} />

            {debugMode && (
                <>
                    {/* Anchor: where the active note is pinned (fixed x). */}
                    <line x1={anchorX} y1={staffStart - 30} x2={anchorX} y2={staffStart + 70}
                        stroke="orange" strokeWidth={0.75} strokeDasharray="2 2"
                        style={{ pointerEvents: 'none' }} />
                    <rect x={startX} y={staffStart - 40} width={endX - startX} height={110}
                        fill="orange" fillOpacity={0.06} stroke="orange" strokeWidth={0.5}
                        style={{ pointerEvents: 'none' }} />
                </>
            )}
        </g>
    );
};

export default TranspositionSetter;
