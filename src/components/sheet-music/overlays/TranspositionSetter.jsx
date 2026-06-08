import React, { useRef, useState } from 'react';
import { getNoteFromValue } from '../../../utils/rangeUtils';
import { normalizeNoteChars } from '../../../theory/noteUtils';
import { getNoteAbsoluteY } from '../renderMelodyNotes';
import { ClefGlyph, variantToSymbolKey } from '../clefGlyphs';

/**
 * TranspositionSetter — compact in-staff transposition control (Han 2026-06-08).
 *
 * Wired into ClefStaffOverlay's melodic (G/F) branch, REPLACING the old horizontal clef
 * cards. Two coupled half-step carousels per staff:
 *   LEFT  — note-NAME carousel: CONCERT note names ("… = C4"), centred on C4 − trans (the
 *           concert pitch written at C4). Beside it sit quick-pick concert-note rects for the
 *           common instruments. Reversed order vs the right (the coupled inverse).
 *   RIGHT — sheet-music NOTEHEAD carousel: [clef] "C4 =" [quarter-note heads on the 'tangens'
 *           curve]. Each head sits at its true staff ORIGIN + f(t) (curve block below). The
 *           SELECTED note (t=0) is pinned at a FIXED x (anchorX) and its CORRECT staff
 *           position; ledger lines extend for heads off the staff.
 *
 * Semantics: "concert C4 is WRITTEN as the chosen note" → transpositionSemitones =
 * writtenMidi − 60 (mapped to a transpositionKey by the parent via keyForTrans).
 *
 * INTERACTION: tap a head/name to jump to it; or DRAG either carousel — a fractional active
 * `t` is tracked while dragging so the heads slide smoothly along f, snapping to the nearest
 * half-step on release (onSelectTrans reports the absolute new offset). Per §3a every tap
 * target shows its hit box in debugMode.
 *
 * STAGED (needs the clef-octave system expanded — TODO): when a drag runs >~octave off the
 * staff, on release switch to an 8va/15ma/8vb/15vb clef (fade) so the head returns near the
 * staff; and the octave-shifted quick-picks (C3, C5, B♭2). Those quick-picks are drawn dim
 * here until the octave clef is wired.
 */

const C4_MIDI = 60;
const QUARTER = 'Ï';   // Maestro quarter-note glyph (durationNoteMap[12]) — stemmed head
const ROW_H = 15;      // vertical spacing between name-carousel rows
const PX_PER_STEP = 14;   // drag sensitivity: screen px per half-step (tuned live)
// Available transposition offsets without an octave clef (TRANSPOSING_INSTRUMENTS span).
const MIN_TRANS = -5, MAX_TRANS = 11;
const nameOf = (midi) => normalizeNoteChars(getNoteFromValue(midi));
const clampTrans = (t) => Math.max(MIN_TRANS, Math.min(MAX_TRANS, t));

// ── The 'tangens' curve (Han 2026-06-08) ────────────────────────────────────────────────
// Each notehead = its true staff ORIGIN (same x = anchorX; y = staff position) + f(t), where
// t = half-steps from the active selection (fractional while dragging):
//     f(t) = ( −3·tanh(t/3)·X_SPACING , (t³/20)·Y_SPACING )
// Active note (t=0) → f(0)=(0,0) → sits exactly on target. Horizontal SATURATES (tanh) so the
// fan can't run off sideways; vertical is a pure cubic in t (Han chose +t³, the S-wave) that
// steepens fast toward the edges → the 'tangens' feel. ~17 heads, Math.tanh is cheap.
const X_SPACING = 25;   // horizontal scale of the tanh fan (Han 2026-06-08: 30 → 25)
const Y_SPACING = 10;   // vertical scale of the cubic term
const curveX = (t) => -3 * Math.tanh(t / 3) * X_SPACING;
const curveY = (t) => (Math.pow(t, 3) / 20) * Y_SPACING;

// Grid Ys (staff lines, every 10 units from staffStart) between the staff and a notehead at
// drawn `y`, so heads off the staff get ledger lines (Han 2026-06-08 "ver buiten de balk").
const ledgerYs = (y, staffStart) => {
    const out = [];
    for (let g = staffStart - 10; y <= g; g -= 10) out.push(g);          // above the staff
    for (let g = staffStart + 50; y >= g; g += 10) out.push(g);          // below the staff
    return out;
};

// Quick-pick CONCERT notes (Han 2026-06-08): the concert sound of written C4 per common
// instrument. `oct:true` ones need the octave clef (staged) → drawn dim + inert for now.
const QUICK_PICKS = [
    { midi: 72, label: 'C5', oct: true },   // C inst 8va
    { midi: 63, label: 'E♭4' },             // E♭ clarinet (−3)
    { midi: 60, label: 'C4' },              // C instrument (0)
    { midi: 58, label: 'B♭3' },             // B♭ clarinet/trumpet (+2)
    { midi: 53, label: 'F3' },              // F horn (+7)
    { midi: 51, label: 'E♭3' },             // E♭ alto/bari sax (+9)
    { midi: 48, label: 'C3', oct: true },   // C inst 8vb
    { midi: 46, label: 'B♭2', oct: true },  // bass B♭ (8vb)
];

const TranspositionSetter = ({
    staff, clef, staffStart, startX, endX,
    transSemitones = 0,           // current concert→written offset
    onSelectTrans,                // (newTrans) => void — parent maps to key + clamps
    debugMode = false,
    debugDragDelta = 0,           // dev-only: render a fractional drag state in the harness
}) => {
    // Drag state: a fractional change to trans while the pointer is down (null = not dragging).
    const [dragDelta, setDragDelta] = useState(null);
    const dragRef = useRef(null);   // { side, startClientY }

    if (startX == null || endX == null) return null;

    const dragging = dragDelta != null || debugDragDelta !== 0;
    const liveDelta = dragDelta != null ? dragDelta : debugDragDelta;
    // Effective (possibly fractional) offset that drives BOTH carousels so they slide together.
    const effTrans = clampTrans(transSemitones + liveDelta);
    const color = 'var(--text-primary)';
    const low = 'var(--setter-lowlight)';
    const W = endX - startX;
    const midY = staffStart + 20;

    // ── Drag plumbing (both carousels) ──────────────────────────────────────────────────
    // RIGHT (written): drag up → higher written → trans UP. LEFT (concert): drag up → higher
    // concert → trans DOWN (the inverse coupling). On release: snap to nearest half-step.
    const onPointerDown = (side) => (e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        dragRef.current = { side, startClientY: e.clientY };
        setDragDelta(0);
    };
    const onPointerMove = (e) => {
        const d = dragRef.current;
        if (!d) return;
        const dyUp = (d.startClientY - e.clientY) / PX_PER_STEP;   // up = positive
        setDragDelta(d.side === 'right' ? dyUp : -dyUp);
    };
    const endDrag = (e) => {
        const d = dragRef.current;
        if (!d) return;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        const snapped = clampTrans(Math.round(transSemitones + (dragDelta || 0)));
        dragRef.current = null;
        setDragDelta(null);
        if (snapped !== transSemitones) onSelectTrans?.(snapped);
    };

    // ── LEFT: concert note-name carousel ────────────────────────────────────────────────
    const concertFloat = C4_MIDI - effTrans;       // concert pitch written at C4 (fractional)
    const nameX = startX + W * 0.20;
    const leftLabelX = startX + W * 0.30;
    const nameRows = [];
    for (let c = Math.round(concertFloat) - 6; c <= Math.round(concertFloat) + 6; c++) {
        const off = c - concertFloat;              // rows>0 are higher concert pitches
        const ry = midY + 6 + off * ROW_H;         // higher pitch sits HIGHER on screen
        const dist = Math.abs(off);
        const isActive = c === Math.round(concertFloat) && Math.abs(c - concertFloat) < 0.001;
        const size = Math.max(8, 19 - dist * 2.0);
        const op = Math.max(0.18, (isActive ? 1 : 0.8) - dist * 0.12);
        nameRows.push(
            <g key={c}>
                <text x={nameX} y={ry} fontSize={size} fontFamily="Georgia, 'Times New Roman', serif"
                    textAnchor="middle" fill={isActive ? color : low} opacity={op}
                    style={{ pointerEvents: 'none' }}>
                    {nameOf(c)}
                </text>
                {!isActive && (
                    <rect x={nameX - 22} y={ry - ROW_H / 2 - 1} width={44} height={ROW_H}
                        fill="transparent" style={{ cursor: 'pointer' }}
                        onClick={() => onSelectTrans?.(clampTrans(C4_MIDI - c))} />
                )}
                {debugMode && (
                    <rect x={nameX - 22} y={ry - ROW_H / 2 - 1} width={44} height={ROW_H}
                        fill="cyan" fillOpacity={0.16} stroke="cyan" strokeWidth={0.5}
                        style={{ pointerEvents: 'none' }} />
                )}
            </g>,
        );
    }

    // ── RIGHT: notehead carousel on the tangens curve ──────────────────────────────────
    const clefX = startX + W * 0.48;
    const rightLabelX = clefX + 40;
    const anchorX = clefX + 160;     // fixed x of the active head (room for the left-fanning curve)
    const writtenFloat = C4_MIDI + effTrans;
    const writtenActive = Math.round(writtenFloat);
    const notes = [];
    const hits = [];
    const linePts = [];
    for (let m = writtenActive - 8; m <= writtenActive + 8; m++) {
        if (C4_MIDI + clampTrans(m - C4_MIDI) !== m) continue;   // outside the available range
        const t = m - writtenFloat;
        const name = getNoteFromValue(m);                 // keyboard/sharp spelling
        const originY = getNoteAbsoluteY(name, staffStart, clef, staff);
        if (originY == null) continue;
        const x = anchorX + curveX(t);
        const y = originY + curveY(t);
        const dist = Math.abs(t);
        const isActive = m === writtenActive && Math.abs(t) < 0.001;
        const op = Math.max(0.15, (isActive ? 1 : 0.7) - dist * 0.1);
        const fill = isActive ? color : low;
        linePts.push(`${x},${y}`);
        // Ledger lines only for near-active heads (|t|<1.5): those sit close to their TRUE
        // pitch position, so ledgers read correctly as the selection scrolls off-staff. The
        // far fanned heads are visual context only — drawing ledgers to their curve-displaced
        // positions would be noisy and not real notation (Han 2026-06-08).
        const showLedgers = dist < 1.5;
        notes.push(
            <g key={m} opacity={op} style={{ pointerEvents: 'none' }}>
                {showLedgers && ledgerYs(y, staffStart).map((ly, i) => (
                    <line key={i} x1={x - 8} y1={ly} x2={x + 8} y2={ly} stroke={fill} strokeWidth={0.6} />
                ))}
                {name.includes('#') && (
                    <text x={x - 13} y={y + 1} fontSize={20} fontFamily="Maestro"
                        textAnchor="middle" fill={fill}>#</text>
                )}
                {/* Quarter-note head ('Ï'); offsets align the notehead on (x, staff Y). */}
                <text x={x - 5} y={y + 6} fontSize={34} fontFamily="Maestro" fill={fill}>{QUARTER}</text>
            </g>,
        );
        if (!isActive) {
            hits.push(<rect key={`h${m}`} x={x - 11} y={y - 9} width={22} height={18}
                fill="transparent" style={{ cursor: 'pointer' }}
                onClick={() => onSelectTrans?.(clampTrans(m - C4_MIDI))} />);
        }
        if (debugMode) {
            hits.push(<rect key={`d${m}`} x={x - 11} y={y - 9} width={22} height={18}
                fill="lime" fillOpacity={0.16} stroke="lime" strokeWidth={0.5}
                style={{ pointerEvents: 'none' }} />);
        }
    }

    // Vertical clip mask: a band around the staff, TALLER while dragging so more heads show
    // (Han 2026-06-08 "meer noten + verticale zone masken"). Heads beyond it fade out.
    const clipId = `transp-clip-${staff}-${staffStart}`;
    const bandTop = staffStart - (dragging ? 80 : 46);
    const bandH = (dragging ? 80 : 46) + 40 + (dragging ? 80 : 46);

    return (
        <g className={`transposition-setter transposition-setter-${staff}`}>
            <defs>
                <clipPath id={clipId}>
                    <rect x={startX} y={bandTop} width={W} height={bandH} />
                </clipPath>
            </defs>

            {/* Quick-pick concert notes (left of the name carousel). Octave-needing ones are
                drawn dim + inert until the octave clef is wired (staged). */}
            {QUICK_PICKS.map((q, i) => {
                const qy = staffStart - 14 + i * 13;
                const inert = q.oct;
                return (
                    <g key={q.label}>
                        <text x={startX + 4} y={qy} fontSize={11} fontFamily="Georgia, serif"
                            textAnchor="start" fill={inert ? low : color} opacity={inert ? 0.5 : 1}
                            style={{ pointerEvents: 'none' }}>
                            {q.label}
                        </text>
                        {!inert && (
                            <rect x={startX} y={qy - 10} width={W * 0.12} height={13}
                                fill="transparent" style={{ cursor: 'pointer' }}
                                onClick={() => onSelectTrans?.(clampTrans(C4_MIDI - q.midi))} />
                        )}
                        {debugMode && !inert && (
                            <rect x={startX} y={qy - 10} width={W * 0.12} height={13}
                                fill="magenta" fillOpacity={0.16} stroke="magenta" strokeWidth={0.5}
                                style={{ pointerEvents: 'none' }} />
                        )}
                    </g>
                );
            })}

            <g clipPath={`url(#${clipId})`}>
                {/* LEFT name carousel — drag surface + rows */}
                <rect x={startX + W * 0.14} y={bandTop} width={W * 0.16} height={bandH}
                    fill="transparent" style={{ cursor: 'ns-resize', touchAction: 'none' }}
                    onPointerDown={onPointerDown('left')} onPointerMove={onPointerMove}
                    onPointerUp={endDrag} onPointerCancel={endDrag} />
                {nameRows}
                <text x={leftLabelX} y={midY + 6} fontSize={16} fontFamily="Georgia, serif"
                    textAnchor="middle" fill={color} style={{ pointerEvents: 'none' }}>
                    = C4
                </text>

                {/* RIGHT notehead carousel — clef, label, drag surface, curve + heads */}
                <ClefGlyph symbolKey={variantToSymbolKey(clef)} x={clefX} baseY={staffStart + 30}
                    fill={color} anchor="start" />
                <text x={rightLabelX} y={midY + 6} fontSize={16} fontFamily="Georgia, serif"
                    textAnchor="middle" fill={color} style={{ pointerEvents: 'none' }}>
                    C4 =
                </text>
                <rect x={anchorX - 3 * X_SPACING - 12} y={bandTop} width={6 * X_SPACING + 24} height={bandH}
                    fill="transparent" style={{ cursor: 'ns-resize', touchAction: 'none' }}
                    onPointerDown={onPointerDown('right')} onPointerMove={onPointerMove}
                    onPointerUp={endDrag} onPointerCancel={endDrag} />
                <polyline points={linePts.join(' ')} fill="none" stroke={low}
                    strokeWidth={0.75} strokeDasharray="3 3" opacity={0.4}
                    style={{ pointerEvents: 'none' }} />
                {notes}
                {hits}
            </g>

            {debugMode && (
                <rect x={startX} y={bandTop} width={W} height={bandH}
                    fill="orange" fillOpacity={0.05} stroke="orange" strokeWidth={0.5}
                    style={{ pointerEvents: 'none' }} />
            )}
        </g>
    );
};

export default TranspositionSetter;
