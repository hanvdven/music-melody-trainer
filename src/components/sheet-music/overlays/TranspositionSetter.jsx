import React from 'react';
import { getNoteFromValue } from '../../../utils/rangeUtils';
import { normalizeNoteChars } from '../../../theory/noteUtils';
import { getNoteAbsoluteY } from '../renderMelodyNotes';

/**
 * TranspositionSetter — compact in-staff transposition control (Han 2026-06-08).
 *
 * ⚠ VISUAL v1 MOCKUP — LINEAR placeholder, not yet wired into the live app. It exists to
 * agree the layout with Han before it REPLACES the horizontal transposition cards in the
 * notation setter. The final carousel is NON-LINEAR (a "tangens" curve Han will draw) and
 * is also intended to be the range-setter's selection primitive.
 *
 * Semantics (Han's interview): the carousel sets **concert C4 is WRITTEN as the chosen
 * note** → transpositionSemitones = writtenMidi − 60 (maps to a transpositionKey via
 * TRANSPOSING_INSTRUMENTS; all 0..11 offsets + the negative ones have keys).
 *
 * Per staff there are TWO coupled, inverse controls side by side ("4 in totaal" = ×2 staves):
 *   A) "C4 ="  + a vertical half-step carousel of the WRITTEN note (concert C4 → written X).
 *   B) a vertical half-step carousel of the CONCERT note + "= C4"  (written C4 ← concert Y).
 * They are inverses: B's centre = C4 − trans, so its letters run in the opposite order (the
 * "verbonden / omgekeerde volgorde" Han described). The selected written note is also shown
 * as a notehead on the staff.
 */

const C4_MIDI = 60;
const STEPS = 6;                 // ± half-steps shown around the selection
const ROW_H = 15;                // vertical spacing between carousel rows
const noteName = (midi) => normalizeNoteChars(getNoteFromValue(midi));

// One vertical half-step carousel of note NAMES centred on `centerMidi`. Rows shrink and
// fade toward the edges (perspective) — the LINEAR placeholder for the future tangens curve.
// `order` = +1 normal (low at bottom), −1 reversed (the inverse control).
const NameCarousel = ({ cx, cy, centerMidi, color, lowColor, order = 1 }) => {
    const rows = [];
    for (let d = -STEPS; d <= STEPS; d++) {
        const midi = centerMidi + d;
        const dist = Math.abs(d);
        const size = Math.max(8, 21 - dist * 2.3);
        const op = Math.max(0.22, 1 - dist * 0.13);
        rows.push(
            <text key={d} x={cx} y={cy - order * d * ROW_H} fontSize={size}
                fontFamily="Georgia, 'Times New Roman', serif" textAnchor="middle"
                fill={d === 0 ? color : lowColor} opacity={op}
                style={{ pointerEvents: 'none' }}>
                {noteName(midi)}
            </text>,
        );
    }
    return <g>{rows}</g>;
};

const TranspositionSetter = ({
    staff, clef, staffStart, startX, endX,
    transSemitones = 0,           // current concert→written offset
    theme,                        // reserved (note colouring later)
    debugMode = false,
}) => {
    if (startX == null || endX == null) return null;

    const writtenCenter = C4_MIDI + transSemitones;   // concert C4 → written
    const concertCenter = C4_MIDI - transSemitones;   // written C4 ← concert
    const color = 'var(--text-primary)';
    const low = 'var(--setter-lowlight)';

    const W = endX - startX;
    // Two controls side by side across the staff body.
    const aLabelX = startX + W * 0.06;     // "C4 ="
    const aCarX = startX + W * 0.20;     // written-name carousel
    const bCarX = startX + W * 0.62;     // concert-name carousel
    const bLabelX = startX + W * 0.78;     // "= C4"
    const midY = staffStart + 20;          // vertical centre ≈ middle staff line

    // The selected WRITTEN note shown as a notehead on the real staff (Han: "noot op
    // notenbalk"). Whole-note glyph via Maestro 'w'.
    const writtenName = noteName(writtenCenter);
    const headY = getNoteAbsoluteY(writtenName, staffStart, clef, staff) ?? midY;
    const headX = startX + W * 0.42;

    return (
        <g className={`transposition-setter transposition-setter-${staff}`}>
            {/* Control A: C4 = [written carousel] */}
            <text x={aLabelX} y={midY + 6} fontSize={18} fontFamily="Georgia, serif"
                textAnchor="middle" fill={color} style={{ pointerEvents: 'none' }}>
                C4 =
            </text>
            <NameCarousel cx={aCarX} cy={midY + 6} centerMidi={writtenCenter}
                color={color} lowColor={low} order={1} />

            {/* Selected written note on the staff */}
            <text x={headX} y={headY + 11} fontSize={34} fontFamily="Maestro"
                textAnchor="middle" fill={color} style={{ pointerEvents: 'none' }}>
                w
            </text>

            {/* Control B (inverse): [concert carousel] = C4 — reversed order (coupled). */}
            <NameCarousel cx={bCarX} cy={midY + 6} centerMidi={concertCenter}
                color={color} lowColor={low} order={-1} />
            <text x={bLabelX} y={midY + 6} fontSize={18} fontFamily="Georgia, serif"
                textAnchor="middle" fill={color} style={{ pointerEvents: 'none' }}>
                = C4
            </text>

            {debugMode && (
                <rect x={startX} y={staffStart - 40} width={W} height={100}
                    fill="orange" fillOpacity={0.08} stroke="orange" strokeWidth={0.5}
                    style={{ pointerEvents: 'none' }} />
            )}
        </g>
    );
};

export default TranspositionSetter;
