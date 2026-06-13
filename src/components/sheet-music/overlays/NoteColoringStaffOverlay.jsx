import React from 'react';
import { getNoteAbsoluteY } from '../renderMelodyNotes';
import { StaffQuarterNote } from '../staffNoteGlyph';
import { melodicNoteColor } from '../../../theory/noteUtils';

// ── Note-colouring menu (Han 2026-06-13) ────────────────────────────────────
// A staff overlay shown in COLOUR mode. It is STAFF-INDEPENDENT: every note-colour
// scheme is rendered as its own self-contained row of 8 notes C4–C5, so you can
// compare the schemes side by side and tap one to select it. No clefs are drawn.
//
// Reuses the canonical glyph + colour helpers (CLAUDE.md §6d): noteheads via
// StaffQuarterNote, pitch→Y via getNoteAbsoluteY, colours via melodicNoteColor —
// the exact same code the real staff and the range setter use, so the preview is
// faithful.
const SCHEMES = [
    { mode: 'none', label: 'None' },
    { mode: 'tonic_scale_keys', label: 'Tonic / Scale' },
    { mode: 'chords', label: 'Chords' },
    { mode: 'chromatone', label: 'Chromatone' },
    { mode: 'subtle-chroma', label: 'Subtle chroma' },
];
const NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];

// Ledger lines (every 10 units) between the 5-line staff [staffStart..staffStart+40]
// and a notehead drawn at `y` — same convention as the range overlay.
const ledgerYs = (y, staffStart) => {
    const out = [];
    for (let g = staffStart - 10; y <= g; g -= 10) out.push(g);   // above the staff
    for (let g = staffStart + 50; y >= g; g += 10) out.push(g);   // below the staff (C4 etc.)
    return out;
};

const NoteColoringStaffOverlay = ({
    startX, endX, trebleStart, bottomY,
    noteColoringMode, setNoteColoringMode, tonic, scaleNotes, theme, debugMode = false,
}) => {
    const rowH = (bottomY - trebleStart) / SCHEMES.length;
    const noteX0 = startX + 96;          // leave room for the row label on the left
    const noteX1 = endX - 16;
    const noteSpacing = (noteX1 - noteX0) / NOTES.length;
    return (
        <g className="note-coloring-overlay">
            {SCHEMES.map((scheme, ri) => {
                const rowTop = trebleStart + ri * rowH;
                // Staff sits in the upper-middle of the row band, leaving room below for C4's ledger.
                const staffStart = rowTop + rowH * 0.28;
                const isActive = noteColoringMode === scheme.mode;
                return (
                    <g key={scheme.mode} style={{ cursor: 'pointer' }}
                        onClick={() => setNoteColoringMode(scheme.mode)}>
                        {/* Full-width clickable band; active scheme gets a faint highlight wash. */}
                        <rect x={startX} y={rowTop} width={endX - startX} height={rowH}
                            fill="var(--accent-yellow)" fillOpacity={isActive ? 0.1 : 0} />
                        <text x={startX + 6} y={staffStart + 26} fontSize={13} fontFamily="sans-serif"
                            fontWeight={isActive ? 'bold' : 'normal'}
                            fill={isActive ? 'var(--accent-yellow)' : 'var(--text-primary)'}
                            style={{ pointerEvents: 'none' }}>{scheme.label}</text>
                        {/* 5-line staff segment (no clef). */}
                        {[0, 10, 20, 30, 40].map(dy => (
                            <line key={dy} x1={noteX0 - 12} y1={staffStart + dy} x2={noteX1} y2={staffStart + dy}
                                stroke="var(--text-primary)" strokeWidth={0.5} style={{ pointerEvents: 'none' }} />
                        ))}
                        {/* 8 notes C4–C5, coloured by THIS scheme. */}
                        <g style={{ pointerEvents: 'none' }}>
                            {NOTES.map((n, i) => {
                                const x = noteX0 + (i + 0.5) * noteSpacing;
                                const y = getNoteAbsoluteY(n, staffStart, 'treble', 'treble');
                                if (y == null) return null;
                                const color = melodicNoteColor(n, { noteColoringMode: scheme.mode, tonic, scaleNotes, theme })
                                    || 'var(--text-primary)';
                                return (
                                    <StaffQuarterNote key={n} x={x} positionY={y} staffYStart={staffStart}
                                        ledgerYs={ledgerYs(y, staffStart)} color={color} />
                                );
                            })}
                        </g>
                        {debugMode && (
                            <rect x={startX} y={rowTop} width={endX - startX} height={rowH}
                                fill="orange" fillOpacity={0.12} stroke="orange" strokeWidth={0.5}
                                style={{ pointerEvents: 'none' }} />
                        )}
                    </g>
                );
            })}
        </g>
    );
};

export default NoteColoringStaffOverlay;
