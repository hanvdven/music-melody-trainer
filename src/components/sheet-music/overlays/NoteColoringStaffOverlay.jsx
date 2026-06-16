import React from 'react';
import { getNoteAbsoluteY } from '../renderMelodyNotes';
import { StaffQuarterNote } from '../staffNoteGlyph';
import { melodicNoteColor } from '../../../theory/noteUtils';

// ── Note-colouring menu (Han 2026-06-13, redesigned 2026-06-14 #2) ──────────
// COLOUR-mode menu of every note-colour scheme, rendered the visual-redesign way
// (docs §37 principle 2): IN the SheetMusic SVG, directly on the EXISTING top staff
// — no HTML cards, no extra mini-staves, no clef. The 5 sets sit side by side along
// the real staff; each set is 8 notes C4–C5 coloured by THAT scheme, placed with the
// same getNoteAbsoluteY/StaffQuarterNote the real notes use, so they land exactly on
// the staff lines. Tap a set to select it; the active set is highlighted.
const SCHEMES = [
    { mode: 'none', label: 'None' },
    { mode: 'tonic_scale_keys', label: 'Tonic / Scale' },
    { mode: 'chords', label: 'Chords' },
    // 'scale' (Han 2026-06-16): in-scale notes coloured like Tonic/Scale, chromatic blue notes
    // get --note-blue. Positioned next to 'chords' per Han's request.
    { mode: 'scale', label: 'Scale' },
    { mode: 'chromatone', label: 'Chromatone' },
    { mode: 'subtle-chroma', label: 'Subtle chroma' },
];
const NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];

// Ledger lines (every 10) between the 5-line staff [staffStart..staffStart+40] and a notehead.
const ledgerYs = (y, staffStart) => {
    const out = [];
    for (let g = staffStart - 10; y <= g; g -= 10) out.push(g);
    for (let g = staffStart + 50; y >= g; g += 10) out.push(g);
    return out;
};

const NoteColoringStaffOverlay = ({
    startX, endX, trebleStart, clefTreble = 'treble',
    noteColoringMode, setNoteColoringMode, tonic, scaleNotes, activeChord = null, theme, debugMode = false,
}) => {
    const W = endX - startX;
    const setW = W / SCHEMES.length;
    // activeChord drives the 'chords' set's colouring (no playback → the representative chord).
    const ctx = { tonic, scaleNotes, theme, activeChord };
    return (
        <g className="note-coloring-overlay">
            {SCHEMES.map((s, si) => {
                const setLeft = startX + si * setW;
                const pad = setW * 0.12;
                const x0 = setLeft + pad, x1 = setLeft + setW - pad;
                const spacing = (x1 - x0) / (NOTES.length - 1);
                const active = noteColoringMode === s.mode;
                return (
                    <g key={s.mode} style={{ cursor: 'pointer' }}
                        onClick={() => setNoteColoringMode(s.mode)}>
                        {/* Clickable band over the whole set (label strip + staff); active = wash. */}
                        <rect x={setLeft} y={trebleStart - 26} width={setW} height={104}
                            fill="var(--accent-yellow)" fillOpacity={active ? 0.1 : 0} />
                        {/* Dashed divider between sets. */}
                        {si > 0 && (
                            <line x1={setLeft} y1={trebleStart - 6} x2={setLeft} y2={trebleStart + 46}
                                stroke="var(--text-dim, #555)" strokeWidth={0.5} strokeDasharray="2 3"
                                style={{ pointerEvents: 'none' }} />
                        )}
                        {/* Label above the staff. */}
                        <text x={setLeft + setW / 2} y={trebleStart - 14} textAnchor="middle"
                            fontSize={11} fontFamily="sans-serif" fontWeight={active ? 'bold' : 'normal'}
                            fill={active ? 'var(--accent-yellow)' : 'var(--text-primary)'}
                            style={{ pointerEvents: 'none' }}>{s.label}</text>
                        {/* 8 notes C4–C5 on the EXISTING staff, coloured by this scheme. */}
                        <g style={{ pointerEvents: 'none' }}>
                            {NOTES.map((n, i) => {
                                const x = x0 + i * spacing;
                                const y = getNoteAbsoluteY(n, trebleStart, clefTreble, 'treble');
                                if (y == null) return null;
                                const color = melodicNoteColor(n, { noteColoringMode: s.mode, ...ctx })
                                    || 'var(--text-primary)';
                                // data-fly = the overlay's flyable note tag (useRangeMorph): each
                                // notehead streams in from the right, staggered by x, when the
                                // colour surface morphs in — same as range/clef (Han 2026-06-15 B1).
                                return (
                                    <g key={n} data-fly="">
                                        <StaffQuarterNote x={x} positionY={y} staffYStart={trebleStart}
                                            ledgerYs={ledgerYs(y, trebleStart)} color={color} />
                                    </g>
                                );
                            })}
                        </g>
                        {debugMode && (
                            <rect x={setLeft} y={trebleStart - 26} width={setW} height={104}
                                fill="orange" fillOpacity={0.1} stroke="orange" strokeWidth={0.5}
                                style={{ pointerEvents: 'none' }} />
                        )}
                    </g>
                );
            })}
        </g>
    );
};

export default NoteColoringStaffOverlay;
