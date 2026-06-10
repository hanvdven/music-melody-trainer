import React, { useRef, useState, useEffect } from 'react';
import { getNoteFromValue } from '../../../utils/rangeUtils';
import { normalizeNoteChars, melodicNoteColor, getNoteSemitone } from '../../../theory/noteUtils';
import { getNoteAbsoluteY } from '../renderMelodyNotes';
import { StaffQuarterNote } from '../staffNoteGlyph';

/**
 * TranspositionSetter — compact in-staff transposition control (Han 2026-06-08).
 *
 * NO clef glyph (Han 2026-06-09 "haal de sleutels weg, redundant"): the real staff shows the clef
 * (incl. any 8va/15ma the transposition forces, via the optimal-clef logic). Inside the setter the
 * notes are positioned on the BASE clef (octave variant stripped) so the C4 anchor and the right
 * carousel never SHIFT when an octave clef kicks in — only the real staff's clef adapts.
 *
 *   PRESETS — concert quick-picks in two columns to the LEFT (C+F | B♭+E♭), placed at a vertical
 *             position proportional to pitch.
 *   LEFT    — fixed WRITTEN-C4 reference head (always 1 ledger below the G-clef / above the F-clef,
 *             the notation anchor) + "=" + a CONCERT note-NAME carousel (high pitch = high on
 *             screen; the two carousels therefore scroll in OPPOSITE directions).
 *   RIGHT   — sheet-music NOTEHEAD carousel: "C4 =" + quarter-note heads on the 'tangens' curve;
 *             heads shrink with distance from the active selection.
 *
 * Semantics: "concert C4 is WRITTEN as the chosen note" → transpositionSemitones =
 * writtenMidi − 60 (decomposed into key + octave by the parent).
 *
 * INTERACTION: tap a head/name/preset to jump (the carousels TWEEN to it); or DRAG either carousel.
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
const LABEL_SIZE = 18;   // size for "=", "C4 =" and the active carousel name (Han 2026-06-09: 16→18)
const PRESET_FONT = 13;  // preset label size (Han 2026-06-09: 11→13, bigger)

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
// Settable transposition range: up to ±2 octaves (Han 2026-06-09, Stage D — "C4 → [C2..C6]").
// The pitch-class part maps to an instrument key; the whole-octave part becomes an 8va/15ma/
// 8vb/15vb clef (decomposed by the parent), so far heads return near the staff after release.
const MIN_TRANS = -24, MAX_TRANS = 24;
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
const LEFT_X_SPACING = 14;   // gentler tanh fan for the LEFT name carousel (Han 2026-06-09)
const curveX = (t) => -3 * Math.tanh(t / 3) * X_SPACING;
const curveY = (t) => -(Math.pow(t, 3) / 20) * Y_SPACING;
const leftCurveX = (t) => -3 * Math.tanh(t / 3) * LEFT_X_SPACING;   // tanh-x for the names

// Grid Ys (staff lines, every 10 units from staffStart) between the staff and a notehead at
// drawn `y`, so heads off the staff get ledger lines (Han 2026-06-08 "ver buiten de balk").
const ledgerYs = (y, staffStart) => {
    const out = [];
    for (let g = staffStart - 10; y <= g; g -= 10) out.push(g);          // above the staff
    for (let g = staffStart + 50; y >= g; g += 10) out.push(g);          // below the staff
    return out;
};

// Preset CONCERT notes (the concert sound of written C4 per common instrument), in two columns to
// keep same-ish pitches from overlapping (Han 2026-06-09): C+F on the left, B♭+E♭ on the right,
// each placed at a vertical position proportional to pitch (PRESET_SEMI px per semitone). F4 added.
const PRESETS_LEFT = [72, 65, 60, 53, 48];   // C5, F4, C4, F3, C3
const PRESETS_RIGHT = [63, 58, 51, 46];      // E♭4, B♭3, E♭3, B♭2
const PRESET_SEMI = 2.5;                      // vertical px per semitone (compacter, Han 2026-06-09)

const TranspositionSetter = ({
    staff, clef, staffStart, startX, endX,
    transSemitones = 0,           // current concert→written offset
    onSelectTrans,                // (newTrans) => void — parent maps to key + clamps
    instLabel = 'C inst',         // transposing-instrument display label (getTranspositionDisplay)
    noteColoringMode = 'off',     // colouring context — active/reference heads colour as concert C4
    tonic = 'C', scaleNotes = [], theme = 'dark',
    activeChord = null,           // paused active chord (last-if-tonic-else-first) for chord colour

    debugMode = false,
    debugDragDelta = 0,           // dev-only: render a fractional drag state in the harness
}) => {
    // Drag state: a fractional change to trans while the pointer is down (null = not dragging).
    const [dragDelta, setDragDelta] = useState(null);
    const dragRef = useRef(null);   // { side, startClientY }

    // Tween state (Han 2026-06-09, Stage E): when transSemitones changes via a TAP (preset/head/
    // name), the carousels scroll to the new value instead of jumping. animOffset starts at
    // (old−new) and eases to 0, so effTrans glides from old to new. A drag-release skips this
    // (the drag already moved the carousel) via skipAnimRef.
    const [animOffset, setAnimOffset] = useState(0);
    const prevTransRef = useRef(transSemitones);
    const animRef = useRef(0);
    const skipAnimRef = useRef(false);
    useEffect(() => {
        const prev = prevTransRef.current;
        prevTransRef.current = transSemitones;
        if (prev === transSemitones) return;
        if (skipAnimRef.current) { skipAnimRef.current = false; setAnimOffset(0); return; }
        const startOffset = prev - transSemitones;   // effTrans starts at `prev`, eases to new
        const DURATION = 280;
        const t0 = performance.now();
        cancelAnimationFrame(animRef.current);
        const tick = (now) => {
            const p = Math.min(1, (now - t0) / DURATION);
            const eased = 1 - Math.pow(1 - p, 3);    // easeOutCubic
            setAnimOffset(startOffset * (1 - eased));
            if (p < 1) animRef.current = requestAnimationFrame(tick);
            else setAnimOffset(0);
        };
        animRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animRef.current);
    }, [transSemitones]);

    if (startX == null || endX == null) return null;

    // Live delta = an in-progress drag (fractional) OR the tween offset; the two never overlap.
    const dragging = dragDelta != null || debugDragDelta !== 0;
    const liveDelta = (dragDelta != null ? dragDelta : debugDragDelta) + animOffset;
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
        // Chords mode: colour by the PAUSED active chord (last-if-tonic-else-first), same as the
        // main staff (Han 2026-06-10). A note in the active chord → the chord's root colour.
        if (noteColoringMode === 'chords' && activeChord?.notes?.length) {
            if (activeChord.notes.some(cn => getNoteSemitone(cn) === getNoteSemitone(note))) {
                const mix = theme === 'light' ? 'black' : 'white';
                return `color-mix(in srgb, var(--chromatone-${getNoteSemitone(activeChord.root)}), ${mix} 30%)`;
            }
        }
        return color;
    };
    // The RIGHT active head represents concert C4 (it sounds C4) → coloured as C4.
    const c4Color = colorForConcert('C4');
    const W = endX - startX;
    const midY = staffStart + 20;
    // BASE clef (octave variant stripped): note POSITIONS use this so the C4 anchor and the right
    // carousel stay put when the real staff's clef adapts to an 8va/15ma (Han 2026-06-09). The
    // setter draws no clef glyph itself — that lives on the real staff.
    const baseClef = typeof clef === 'string' ? clef.replace(/(8|15|22)v[ab]$/, '') : clef;

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
        // Don't tween after a drag — the carousel already followed the finger to `snapped`.
        if (snapped !== transSemitones) { skipAnimRef.current = true; onSelectTrans?.(snapped); }
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
    // Tight left layout (Han 2026-06-09: "zeer veel dichter bij elkaar"): presets, then the fixed
    // C4 note SNUG against "=", and "=" SNUG against the names carousel.
    const concertFloat = C4_MIDI - effTrans;       // concert pitch written at C4 (fractional)
    const presetColL = startX + W * 0.025;         // C+F column
    const presetColR = startX + W * 0.075;         // B♭+E♭ column
    const nameX = startX + W * 0.235;              // names carousel
    const leftLabelX = nameX - 24;                 // "=" snug to the left of the names
    const fixedNoteX = leftLabelX - 26;            // fixed C4 head snug to the left of "="
    const fixedC4Y = getNoteAbsoluteY('C4', staffStart, baseClef, staff);
    // The fixed written-C4 head SOUNDS the concert pitch (C4 − trans), so it is coloured by that
    // sounding pitch (Han 2026-06-09: "C4 on a B♭ inst should be orange, the B♭ colour").
    const fixedSoundingNote = nameOf(C4_MIDI - Math.round(effTrans));
    const fixedColor = colorForConcert(fixedSoundingNote);
    const nameRows = [];
    for (let c = Math.round(concertFloat) - 6; c <= Math.round(concertFloat) + 6; c++) {
        const off = c - concertFloat;              // off>0 = higher concert pitch
        // High pitch HIGH on screen (Han 2026-06-09 "hoog hoog, laag laag" — opposite of the right
        // carousel's coupling) + a gentle tanh-x fan (y stays linear in ROW_H).
        const ry = midY + 6 - off * ROW_H;
        const nx = nameX + leftCurveX(off);
        const dist = Math.abs(off);
        // Highlight the row CLOSEST to centre at all times — even mid-drag when no row is exactly
        // centred — so there is always exactly one active note (Han 2026-06-09).
        const isActive = c === Math.round(concertFloat);
        // Active row matches the "=" label size (LABEL_SIZE, Han #4); neighbours shrink slightly.
        const size = Math.max(8, LABEL_SIZE - dist * 2.0);
        const op = Math.max(0.18, (isActive ? 1 : 0.8) - dist * 0.12);
        nameRows.push(
            <g key={c}>
                <NoteLabel name={nameOf(c)} x={nx} y={ry} size={size}
                    fill={isActive ? color : low} opacity={op} />
                {!isActive && (
                    <rect x={nx - 22} y={ry - ROW_H / 2 - 1} width={44} height={ROW_H}
                        fill="transparent" style={{ cursor: 'pointer' }}
                        onClick={() => onSelectTrans?.(clampTrans(C4_MIDI - c))} />
                )}
                {debugMode && (
                    <rect x={nx - 22} y={ry - ROW_H / 2 - 1} width={44} height={ROW_H}
                        fill="cyan" fillOpacity={0.16} stroke="cyan" strokeWidth={0.5}
                        style={{ pointerEvents: 'none' }} />
                )}
            </g>,
        );
    }

    // ── RIGHT: notehead carousel on the tangens curve ──────────────────────────────────
    const rightLabelX = startX + W * 0.44;          // "C4 =" — closer to the carousel (Han +20)
    const anchorX = startX + W * 0.62;              // fixed x of the active head (room for the fan)
    const writtenFloat = C4_MIDI + effTrans;
    const writtenActive = Math.round(writtenFloat);
    const notes = [];
    const hits = [];
    const linePts = [];
    for (let m = writtenActive - 8; m <= writtenActive + 8; m++) {
        if (C4_MIDI + clampTrans(m - C4_MIDI) !== m) continue;   // outside the available range
        const t = m - writtenFloat;
        const name = getNoteFromValue(m);                 // keyboard/sharp spelling
        const originY = getNoteAbsoluteY(name, staffStart, baseClef, staff);
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
        // Canonical staff notehead — same head/stem/accidental geometry as the real staff. Heads
        // SHRINK with distance from the active selection (Han 2026-06-09: copy the left carousel's
        // effect), scaled about the head origin (x, y).
        const scale = Math.max(0.5, 1 - dist * 0.09);
        notes.push(
            <g key={m} opacity={op}
                transform={`translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`}>
                <StaffQuarterNote x={x} positionY={y} staffYStart={staffStart}
                    accidental={acc} ledgerYs={showLedgers ? ledgerYs(y, staffStart) : []}
                    color={fill} />
            </g>,
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

            {/* Preset concert notes — two columns to the LEFT of the setter (C+F | B♭+E♭), each
                pick at a vertical position proportional to its pitch (Han 2026-06-09). Only the
                ACTIVE pick (its concert pitch == the current selection) is highlighted. */}
            {[[PRESETS_LEFT, presetColL], [PRESETS_RIGHT, presetColR]].map(([col, cx]) =>
                col.map((midi) => {
                    const qy = midY - (midi - C4_MIDI) * PRESET_SEMI;
                    const qpActive = midi === Math.round(concertFloat);
                    return (
                        <g key={`qp${midi}`}>
                            <NoteLabel name={nameOf(midi)} x={cx} y={qy} size={PRESET_FONT} anchor="middle"
                                fill={qpActive ? color : low} opacity={qpActive ? 1 : 0.85} />
                            <rect x={cx - 15} y={qy - 9} width={30} height={14}
                                fill="transparent" style={{ cursor: 'pointer' }}
                                onClick={() => onSelectTrans?.(clampTrans(C4_MIDI - midi))} />
                            {debugMode && (
                                <rect x={cx - 15} y={qy - 9} width={30} height={14}
                                    fill="magenta" fillOpacity={0.16} stroke="magenta" strokeWidth={0.5}
                                    style={{ pointerEvents: 'none' }} />
                            )}
                        </g>
                    );
                }),
            )}

            <g clipPath={`url(#${clipId})`}>
                {/* LEFT — fixed WRITTEN-C4 reference head, then "=", then the name carousel (drag
                    surface over the names). The head is the concert C-instrument anchor: it never
                    transposes and ignores any octave clef, sitting permanently 1 ledger off the
                    BASE staff. No clef glyph (Han 2026-06-09 "haal de sleutels weg"). */}
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

                {/* RIGHT notehead carousel — "C4 =" label, drag surface, curve + heads (no clef) */}
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
