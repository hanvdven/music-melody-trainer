import React from 'react';
import { getNoteFromValue } from '../../../utils/rangeUtils';
import { normalizeNoteChars } from '../../../theory/noteUtils';
import { getNoteAbsoluteY } from '../renderMelodyNotes';
import { ClefGlyph, variantToSymbolKey } from '../clefGlyphs';

/**
 * TranspositionSetter — compact in-staff transposition control (Han 2026-06-08).
 *
 * ⚠ VISUAL v1 MOCKUP — LINEAR placeholder, not yet wired into the live app. It exists to
 * agree the layout with Han before it REPLACES the horizontal transposition cards in the
 * notation setter. The final carousels are NON-LINEAR (a "tangens" curve Han will draw).
 *
 * Semantics (Han's interview): the setter expresses **concert C4 is WRITTEN as the chosen
 * note** → transpositionSemitones = writtenMidi − 60 (maps to a transpositionKey via
 * TRANSPOSING_INSTRUMENTS; all 0..11 offsets + the negative ones have keys).
 *
 * Layout (Han 2026-06-08): per staff TWO coupled controls side by side ("4 in totaal" =
 * ×treble+bass):
 *   LEFT  — note-NAME carousel: a vertical list of CONCERT note names ("… = C4"). Centred
 *           on C4 − trans (the concert pitch that is written at C4). Runs in the OPPOSITE
 *           order to the right carousel (the coupled inverse).
 *   RIGHT — sheet-music NOTEHEAD carousel: [clef] "C4 =" [noteheads on a DIAGONAL]. Each
 *           half-step right also moves up the staff (noteYMap = 5 units per diatonic step),
 *           so the notes trace the staff's pitch gradient. The SELECTED note sits at a
 *           FIXED x (anchorX) and its CORRECT staff position; scrolling slides the whole
 *           diagonal so notes travel left↔right AND up↕down together.
 * Spelling follows the keyboard (sharps: C, C♯, D, D♯…); names use Unicode ♯ (§5b),
 * noteheads draw a Maestro ♯ accidental.
 *
 * INTERACTION (v1): tapping any visible note (right) or name (left) makes it the new
 * selection — the carousels re-centre on it. `onSelectTrans(newTrans)` reports the new
 * concert→written offset; the parent maps it to a transpositionKey and clamps to the
 * available range. Tapping a RIGHT notehead at +d ⇒ newTrans = trans + d (written moves);
 * tapping a LEFT name at +d ⇒ newTrans = trans − d (concert moves the other way — the
 * inverse coupling). Per §3a every tap target shows its hit box in debugMode.
 */

const C4_MIDI = 60;
const STEPS = 5;     // ± half-steps shown around the selection
const DX = 30;       // horizontal spacing per half-step on the diagonal (its run)
const ROW_H = 15;    // vertical spacing between name-carousel rows
const nameOf = (midi) => normalizeNoteChars(getNoteFromValue(midi));

// LEFT control — vertical half-step carousel of note NAMES centred on `centerMidi`. Rows
// shrink and fade toward the edges (perspective; LINEAR placeholder for the tangens curve).
// `order = -1` reverses it relative to the right carousel (the coupled inverse Han wants).
// Tapping a name at +d ⇒ onPick(-d): the LEFT shows CONCERT pitch, so picking it moves
// trans the opposite way to the written (right) carousel.
const NameCarousel = ({ cx, cy, centerMidi, color, lowColor, order = -1, onPick, debugMode }) => {
    const rows = [];
    for (let d = -STEPS; d <= STEPS; d++) {
        const dist = Math.abs(d);
        const size = Math.max(8, 20 - dist * 2.2);
        const op = d === 0 ? 1 : Math.max(0.2, 0.8 - dist * 0.12);
        const ry = cy - order * d * ROW_H;
        rows.push(
            <g key={d}>
                <text x={cx} y={ry} fontSize={size}
                    fontFamily="Georgia, 'Times New Roman', serif" textAnchor="middle"
                    fill={d === 0 ? color : lowColor} opacity={op}
                    style={{ pointerEvents: 'none' }}>
                    {nameOf(centerMidi + d)}
                </text>
                {d !== 0 && (
                    <rect x={cx - 22} y={ry - ROW_H / 2 - 2} width={44} height={ROW_H}
                        fill="transparent" style={{ cursor: 'pointer' }}
                        onClick={() => onPick?.(-d)} />
                )}
                {debugMode && (
                    <rect x={cx - 22} y={ry - ROW_H / 2 - 2} width={44} height={ROW_H}
                        fill="cyan" fillOpacity={0.18} stroke="cyan" strokeWidth={0.5}
                        style={{ pointerEvents: 'none' }} />
                )}
            </g>,
        );
    }
    return <g>{rows}</g>;
};

// RIGHT control — DIAGONAL half-step carousel of real noteheads centred on `centerMidi`.
// Active note (d=0) at `anchorX` and its true staff Y; neighbours fan out and fade.
// Tapping a notehead at +d ⇒ onPick(+d): the RIGHT shows the WRITTEN note, so picking it
// moves trans directly.
const DiagonalNotes = ({ anchorX, centerMidi, staffStart, clef, staff, color, lowColor, onPick, debugMode }) => {
    const notes = [];
    const hits = [];
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
                    <text x={x - 12} y={y + 4} fontSize={20} fontFamily="Maestro"
                        textAnchor="middle" fill={fill}>#</text>
                )}
                {/* Whole-note head (Maestro 'w'); +9 centres the glyph on the staff Y. */}
                <text x={x} y={y + 9} fontSize={28} fontFamily="Maestro"
                    textAnchor="middle" fill={fill}>w</text>
            </g>,
        );
        if (d !== 0) {
            hits.push(
                <rect key={`h${d}`} x={x - DX / 2} y={y - 9} width={DX} height={18}
                    fill="transparent" style={{ cursor: 'pointer' }} onClick={() => onPick?.(d)} />,
            );
        }
        if (debugMode) {
            hits.push(
                <rect key={`d${d}`} x={x - DX / 2} y={y - 9} width={DX} height={18}
                    fill="lime" fillOpacity={0.16} stroke="lime" strokeWidth={0.5}
                    style={{ pointerEvents: 'none' }} />,
            );
        }
    }
    return (
        <g>
            <polyline points={linePts.join(' ')} fill="none" stroke={lowColor}
                strokeWidth={0.75} strokeDasharray="3 3" opacity={0.45}
                style={{ pointerEvents: 'none' }} />
            {notes}
            {hits}
        </g>
    );
};

const TranspositionSetter = ({
    staff, clef, staffStart, startX, endX,
    transSemitones = 0,           // current concert→written offset
    onSelectTrans,                // (newTrans) => void — parent maps to key + clamps
    debugMode = false,
}) => {
    if (startX == null || endX == null) return null;

    const writtenCenter = C4_MIDI + transSemitones;   // concert C4 → written note (RIGHT)
    const concertCenter = C4_MIDI - transSemitones;   // concert pitch written at C4 (LEFT)
    const color = 'var(--text-primary)';
    const low = 'var(--setter-lowlight)';
    const midY = staffStart + 20;                     // ≈ middle staff line
    const W = endX - startX;

    // LEFT name carousel + "= C4" anchor.
    const nameX = startX + 70;
    const leftLabelX = startX + 120;
    // RIGHT notehead diagonal: clef, "C4 =", then the fixed anchor.
    const clefX = startX + W * 0.42;
    const rightLabelX = clefX + 40;
    const anchorX = clefX + 110;

    // A tap on either carousel reports the resulting concert→written offset; the parent
    // maps it to a transpositionKey and clamps to the available range.
    const pick = (deltaTrans) => onSelectTrans?.(transSemitones + deltaTrans);

    return (
        <g className={`transposition-setter transposition-setter-${staff}`}>
            {/* LEFT — concert note-name carousel */}
            <NameCarousel cx={nameX} cy={midY + 6} centerMidi={concertCenter}
                color={color} lowColor={low} order={-1} onPick={pick} debugMode={debugMode} />
            <text x={leftLabelX} y={midY + 6} fontSize={17} fontFamily="Georgia, serif"
                textAnchor="middle" fill={color} style={{ pointerEvents: 'none' }}>
                = C4
            </text>

            {/* RIGHT — sheet-music notehead diagonal */}
            <ClefGlyph symbolKey={variantToSymbolKey(clef)} x={clefX} baseY={staffStart + 30}
                fill={color} anchor="start" />
            <text x={rightLabelX} y={midY + 6} fontSize={17} fontFamily="Georgia, serif"
                textAnchor="middle" fill={color} style={{ pointerEvents: 'none' }}>
                C4 =
            </text>
            <DiagonalNotes anchorX={anchorX} centerMidi={writtenCenter} staffStart={staffStart}
                clef={clef} staff={staff} color={color} lowColor={low}
                onPick={pick} debugMode={debugMode} />

            {debugMode && (
                <>
                    <line x1={anchorX} y1={staffStart - 30} x2={anchorX} y2={staffStart + 70}
                        stroke="orange" strokeWidth={0.75} strokeDasharray="2 2"
                        style={{ pointerEvents: 'none' }} />
                    <rect x={startX} y={staffStart - 40} width={W} height={110}
                        fill="orange" fillOpacity={0.06} stroke="orange" strokeWidth={0.5}
                        style={{ pointerEvents: 'none' }} />
                </>
            )}
        </g>
    );
};

export default TranspositionSetter;
