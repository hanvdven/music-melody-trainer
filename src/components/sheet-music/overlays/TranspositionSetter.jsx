import React from 'react';
import { getNoteFromValue } from '../../../utils/rangeUtils';
import { normalizeNoteChars } from '../../../theory/noteUtils';
import { getNoteAbsoluteY } from '../renderMelodyNotes';
import { ClefGlyph, variantToSymbolKey } from '../clefGlyphs';

/**
 * TranspositionSetter — compact in-staff transposition control (Han 2026-06-08).
 *
 * Wired into ClefStaffOverlay's melodic (G/F) branch, REPLACING the old horizontal clef
 * cards. The RIGHT carousel uses the non-linear 'tangens' curve (see below); the LEFT name
 * carousel is a linear vertical perspective list. TODO: smooth drag-to-slide (fractional t).
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
 *   RIGHT — sheet-music NOTEHEAD carousel: [clef] "C4 =" [noteheads on the 'tangens' curve].
 *           Each head sits at its true staff ORIGIN + f(t) (see curve block below). The
 *           SELECTED note (t=0) is pinned at a FIXED x (anchorX) and its CORRECT staff
 *           position; heads fan gently near the centre and the cubic-in-t vertical term
 *           curls the ends into an S ('tangens'). tanh keeps the fan from running off sideways.
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
const STEPS = 5;     // ± half-steps shown around the selection (visible cap; fades at edges)
const ROW_H = 15;    // vertical spacing between name-carousel rows
const nameOf = (midi) => normalizeNoteChars(getNoteFromValue(midi));

// ── The 'tangens' curve (Han 2026-06-08) ────────────────────────────────────────────────
// Every notehead is placed at its true staff ORIGIN (same x for all = anchorX, y = its
// staff position) PLUS an offset f(t), where t = half-steps from the active selection:
//     f(t) = ( −3·tanh(t/3)·X_SPACING , (t³ / 20)·Y_SPACING )
// The active note (t=0) → f(0)=(0,0), so it sits exactly on its target. The horizontal term
// SATURATES (tanh, ±3·X_SPACING) so the fan can't run off sideways; the VERTICAL term is a
// pure cubic in t (Han 2026-06-08 fix: t³, not the saturated x³) → it steepens fast toward
// the edges, giving the dramatic 'tangens' shoot-off (so capping the window matters — t=5 is
// already 62 units). ~11 heads, Math.tanh is cheap → animates smoothly.
const X_SPACING = 30;   // horizontal scale of the tanh fan (≈ px between adjacent heads near t=0)
const Y_SPACING = 10;   // vertical scale of the cubic term (Han's "ik denk 10 units")
const curveX = (t) => -3 * Math.tanh(t / 3) * X_SPACING;        // horizontal offset (px), saturating
const curveY = (t) => (Math.pow(t, 3) / 20) * Y_SPACING;       // vertical offset (px), cubic in t

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
        const originY = getNoteAbsoluteY(name, staffStart, clef, staff);   // note's true staff position
        if (originY == null) continue;
        // Place at origin + f(t): the curve fans the heads out; t = d (half-steps from active).
        const x = anchorX + curveX(d);
        const y = originY + curveY(d);
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
        // Hit box centred on the head. Fixed size (the curve spacing varies; a constant box
        // keeps every head comfortably tappable — §3a draws the same rect in debugMode).
        const HW = 22, HH = 18;
        if (d !== 0) {
            hits.push(
                <rect key={`h${d}`} x={x - HW / 2} y={y - HH / 2} width={HW} height={HH}
                    fill="transparent" style={{ cursor: 'pointer' }} onClick={() => onPick?.(d)} />,
            );
        }
        if (debugMode) {
            hits.push(
                <rect key={`d${d}`} x={x - HW / 2} y={y - HH / 2} width={HW} height={HH}
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
    // anchorX sits well right of the "C4 =" label: the curve fans high notes up-LEFT (toward
    // the label), so it needs ≈ 3·X_SPACING (=90) of clearance on the left before the heads.
    const anchorX = clefX + 160;

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
