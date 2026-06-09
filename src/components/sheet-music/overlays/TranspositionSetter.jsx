import React, { useRef, useState } from 'react';
import { getNoteFromValue } from '../../../utils/rangeUtils';
import { normalizeNoteChars, melodicNoteColor, getNoteSemitone } from '../../../theory/noteUtils';
import { getNoteAbsoluteY } from '../renderMelodyNotes';
import { StaffQuarterNote } from '../staffNoteGlyph';
import { ClefGlyph, variantToSymbolKey } from '../clefGlyphs';

/**
 * TranspositionSetter — compact in-staff transposition control (Han 2026-06-08).
 *
 * Wired into ClefStaffOverlay's melodic (G/F) branch, REPLACING the old horizontal clef
 * cards. Two coupled half-step carousels per staff:
 *   LEFT  — fixed reference + concert note-NAME carousel: [clef] [fixed WRITTEN-C4 head]
 *           "C4 =" [CONCERT note names], centred on C4 − trans (the concert pitch sounding at
 *           written C4). The head is the C-instrument/concert reference — it never moves; the
 *           names scroll. Quick-pick concert-note rects sit far left. Reversed order vs the
 *           right (the coupled inverse). Han 2026-06-09: head added + order swapped to mirror
 *           the right setter.
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
// Heads are drawn with the shared <StaffQuarterNote> (src/components/sheet-music/staffNoteGlyph)
// so the setter matches the real staff pixel-for-pixel — head size/position, stem direction &
// length, and accidental placement all come from the canonical constants, never hand-rolled.
// Maestro accidental glyphs (same font codepoints renderAccidentals / generateAccidentalMap use):
// '#'→sharp, 'b'→flat. getNoteFromValue spells black keys with Unicode ♯/♭ (ALL_NOTES), so we
// map those to the glyphs and hand the result to StaffQuarterNote.
const accidentalGlyph = (name) => (name.includes('♯') ? '#' : name.includes('♭') ? 'b' : null);

const LABEL_FONT = "Georgia, 'Times New Roman', serif";
const LABEL_SIZE = 16;   // shared size for the "=" label AND the active carousel name (Han #4)

// "(X inst)" label at the TOP-RIGHT of the staff (Han 2026-06-09 — was under each clef, wrong
// position). Even for C it reads "(C inst)" so the staves stay consistent.
const InstLabel = ({ label, endX, staffStart, color }) => (
    <text x={endX - 4} y={staffStart - 5} fontSize={11} fontFamily={LABEL_FONT}
        textAnchor="end" fill={color} style={{ pointerEvents: 'none' }}>
        ({label})
    </text>
);

// Scientific-pitch note label with the octave digit as a SUBSCRIPT (Han 2026-06-09 #3),
// e.g. C₄ / D♭₅. Used by both the name carousel and the quick-picks so they read consistently.
const NoteLabel = ({ name, x, y, size = LABEL_SIZE, fill, opacity = 1, anchor = 'middle' }) => {
    const m = name.match(/^(.*?)(-?\d+)$/);
    const letter = m ? m[1] : name;
    const oct = m ? m[2] : '';
    return (
        <text x={x} y={y} fontSize={size} fontFamily={LABEL_FONT} textAnchor={anchor}
            fill={fill} opacity={opacity} style={{ pointerEvents: 'none' }}>
            {letter}{oct && <tspan fontSize={Math.round(size * 0.7)} dy={size * 0.22}>{oct}</tspan>}
        </text>
    );
};
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
// fan can't run off sideways; vertical is a pure cubic in t (Han 2026-06-09 reverted to −t³, the
// original S-wave: higher written notes — t>0 — must fan UPWARD, i.e. toward smaller screen-y,
// hence the minus) that steepens fast toward the edges → the 'tangens' feel. Math.tanh is cheap.
const X_SPACING = 30;   // horizontal scale of the tanh fan (Han 2026-06-09: 25 → 30, heads are now
                        // full staff size so they need more spread to stop overlapping)
const Y_SPACING = 10;   // vertical scale of the cubic term
const curveX = (t) => -3 * Math.tanh(t / 3) * X_SPACING;
const curveY = (t) => -(Math.pow(t, 3) / 20) * Y_SPACING;

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
    instLabel = 'C inst',         // transposing-instrument display label (getTranspositionDisplay)
    noteColoringMode = 'off',     // colouring context — active/reference heads colour as concert C4
    tonic = 'C', scaleNotes = [], theme = 'dark',
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
    // --text-lowlight is the app's dimmed-but-readable text colour (App.css). The old
    // --setter-lowlight was never defined, so inactive heads/names fell back to black
    // (Han 2026-06-09 "lowlighted notes are now black, use lowlight color").
    const low = 'var(--text-lowlight)';
    // Notes are coloured by their SOUNDING (concert) pitch (Han 2026-06-09). colorForConcert maps
    // a concert note name → its colour in the current mode (chromatone/subtle/tonic-scale via the
    // shared helper; chords mode uses the setter's fixed "active chord" = C major triad, pc 0/4/7).
    const colorForConcert = (note) => {
        const base = melodicNoteColor(note, { noteColoringMode, tonic, scaleNotes, theme });
        if (base) return base;
        if (noteColoringMode === 'chords') {
            // Setter active chord = C major triad; root C → root colour for any chord tone.
            if ([0, 4, 7].includes(getNoteSemitone(note))) {
                const mix = theme === 'light' ? 'black' : 'white';
                return `color-mix(in srgb, var(--chromatone-0), ${mix} 30%)`;
            }
        }
        return color;
    };
    // The RIGHT active head represents concert C4 (it sounds C4) → coloured as C4.
    const c4Color = colorForConcert('C4');
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

    // ── LEFT: fixed written-C4 note + concert note-NAME carousel ────────────────────────
    // Mirrors the RIGHT setter (Han 2026-06-09 "switch around the carousel and the C4 note"):
    //   [clef] [fixed C4 head]  "="  [concert-sound names]
    // The fixed head is WRITTEN C4 (always on the staff's C4 line, in this staff's clef — the
    // C-instrument/concert reference); the carousel shows the CONCERT pitch that sounds when
    // C4 is written, so it reads "[written C4] = [concert sound]". The rendered note replaces the
    // old "C4 =" text (Han 2026-06-09 #7). The head never moves; dragging the names transposes.
    // Tighter left spacing (Han 2026-06-09: "elements left are very far apart"): clef, fixed C4
    // head, "=" and the names sit closer together.
    const concertFloat = C4_MIDI - effTrans;       // concert pitch written at C4 (fractional)
    const leftClefX = startX + W * 0.12;
    const fixedNoteX = startX + W * 0.185;
    const leftLabelX = startX + W * 0.245;         // "=" sits between the note and the names
    const nameX = startX + W * 0.32;
    const fixedC4Y = getNoteAbsoluteY('C4', staffStart, clef, staff);
    // The fixed written-C4 head SOUNDS the concert pitch (C4 − trans), so it is coloured by that
    // sounding pitch (Han 2026-06-09: "C4 on a B♭ inst should be orange, the B♭ colour").
    const fixedSoundingNote = nameOf(C4_MIDI - Math.round(effTrans));
    const fixedColor = colorForConcert(fixedSoundingNote);
    const nameRows = [];
    for (let c = Math.round(concertFloat) - 6; c <= Math.round(concertFloat) + 6; c++) {
        const off = c - concertFloat;              // rows>0 are higher concert pitches
        const ry = midY + 6 + off * ROW_H;         // higher pitch sits HIGHER on screen
        const dist = Math.abs(off);
        // Highlight the row CLOSEST to centre at all times — even mid-drag when no row is exactly
        // centred — so there is always exactly one active note (Han 2026-06-09).
        const isActive = c === Math.round(concertFloat);
        // Active row matches the "=" label size (LABEL_SIZE, Han #4); neighbours shrink slightly.
        const size = Math.max(8, LABEL_SIZE - dist * 2.0);
        const op = Math.max(0.18, (isActive ? 1 : 0.8) - dist * 0.12);
        nameRows.push(
            <g key={c}>
                <NoteLabel name={nameOf(c)} x={nameX} y={ry} size={size}
                    fill={isActive ? color : low} opacity={op} />
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
    const anchorX = clefX + 180;     // fixed x of the active head (room for the left-fanning curve)
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
        // Highlight the head CLOSEST to centre at all times (nearest rounded half-step), so one
        // head is always active — even mid-drag when none is exactly centred (Han 2026-06-09).
        const isActive = m === writtenActive;
        const op = Math.max(0.15, (isActive ? 1 : 0.7) - dist * 0.1);
        // Active head = concert-C4 colour; the fanned context heads stay lowlight.
        const fill = isActive ? c4Color : low;
        linePts.push(`${x},${y}`);
        // Ledger lines only for near-active heads (|t|<1.5): those sit close to their TRUE
        // pitch position, so ledgers read correctly as the selection scrolls off-staff. The
        // far fanned heads are visual context only — drawing ledgers to their curve-displaced
        // positions would be noisy and not real notation (Han 2026-06-08).
        const showLedgers = dist < 1.5;
        const acc = accidentalGlyph(name);   // ♯/♭ glyph in front of the head, or null (req 5)
        // Canonical staff notehead — same head/stem/accidental geometry as the real staff.
        notes.push(
            <StaffQuarterNote key={m} x={x} positionY={y} staffYStart={staffStart}
                accidental={acc} ledgerYs={showLedgers ? ledgerYs(y, staffStart) : []}
                color={fill} opacity={op} />,
        );
        // Hit box centred on the notehead body (head origin x … x+12).
        if (!isActive) {
            hits.push(<rect key={`h${m}`} x={x - 5} y={y - 11} width={22} height={20}
                fill="transparent" style={{ cursor: 'pointer' }}
                onClick={() => onSelectTrans?.(clampTrans(m - C4_MIDI))} />);
        }
        if (debugMode) {
            hits.push(<rect key={`d${m}`} x={x - 5} y={y - 11} width={22} height={20}
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

            {/* Quick-pick concert notes — a column to the RIGHT of the notehead carousel
                (Han 2026-06-09). Only the ACTIVE pick (its concert pitch == the current
                selection) is highlighted; the rest are lowlight. Octave-needing ones stay dim +
                inert until the octave clef is wired (Stage D). */}
            {QUICK_PICKS.map((q, i) => {
                const qy = staffStart - 14 + i * 13;
                const inert = q.oct;
                const qpActive = q.midi === Math.round(concertFloat);
                const qpX = startX + W * 0.90;
                return (
                    <g key={q.label}>
                        <NoteLabel name={q.label} x={qpX} y={qy} size={11} anchor="start"
                            fill={qpActive ? color : low} opacity={inert ? 0.5 : (qpActive ? 1 : 0.85)} />
                        {!inert && (
                            <rect x={qpX - 2} y={qy - 10} width={W * 0.10} height={13}
                                fill="transparent" style={{ cursor: 'pointer' }}
                                onClick={() => onSelectTrans?.(clampTrans(C4_MIDI - q.midi))} />
                        )}
                        {debugMode && !inert && (
                            <rect x={qpX - 2} y={qy - 10} width={W * 0.10} height={13}
                                fill="magenta" fillOpacity={0.16} stroke="magenta" strokeWidth={0.5}
                                style={{ pointerEvents: 'none' }} />
                        )}
                    </g>
                );
            })}

            <g clipPath={`url(#${clipId})`}>
                {/* LEFT — fixed clef + WRITTEN-C4 reference head, then "=", then the name carousel
                    (drag surface over the names). The head is concert C-instrument: it never
                    transposes, so it sits permanently on the C4 line; the rendered note replaces
                    the old "C4" text (Han #7). */}
                <ClefGlyph symbolKey={variantToSymbolKey(clef)} x={leftClefX} baseY={staffStart + 30}
                    fill={color} anchor="start" />
                {fixedC4Y != null && (
                    <StaffQuarterNote x={fixedNoteX} positionY={fixedC4Y} staffYStart={staffStart}
                        ledgerYs={ledgerYs(fixedC4Y, staffStart)} color={fixedColor} />
                )}
                {/* "=" sits at the same height as the fixed C4 note (Han 2026-06-09). */}
                <text x={leftLabelX} y={(fixedC4Y ?? midY) + 5} fontSize={LABEL_SIZE} fontFamily={LABEL_FONT}
                    textAnchor="middle" fill={color} style={{ pointerEvents: 'none' }}>
                    =
                </text>
                <rect x={nameX - W * 0.06} y={bandTop} width={W * 0.12} height={bandH}
                    fill="transparent" style={{ cursor: 'ns-resize', touchAction: 'none' }}
                    onPointerDown={onPointerDown('left')} onPointerMove={onPointerMove}
                    onPointerUp={endDrag} onPointerCancel={endDrag} />
                {nameRows}

                {/* RIGHT notehead carousel — clef, label, drag surface, curve + heads */}
                <ClefGlyph symbolKey={variantToSymbolKey(clef)} x={clefX} baseY={staffStart + 30}
                    fill={color} anchor="start" />
                <text x={rightLabelX} y={midY + 6} fontSize={LABEL_SIZE} fontFamily={LABEL_FONT}
                    textAnchor="middle" fill={color} style={{ pointerEvents: 'none' }}>
                    C<tspan fontSize={Math.round(LABEL_SIZE * 0.7)} dy={LABEL_SIZE * 0.22}>4</tspan>
                    <tspan dy={-LABEL_SIZE * 0.22}> =</tspan>
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

            {/* "(X inst)" at the staff's top-right corner (outside the clip so it always shows). */}
            <InstLabel label={instLabel} endX={endX} staffStart={staffStart} color={low} />

            {debugMode && (
                <rect x={startX} y={bandTop} width={W} height={bandH}
                    fill="orange" fillOpacity={0.05} stroke="orange" strokeWidth={0.5}
                    style={{ pointerEvents: 'none' }} />
            )}
        </g>
    );
};

export default TranspositionSetter;
