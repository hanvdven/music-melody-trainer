import React from 'react';
import { getNoteAbsoluteY } from '../renderMelodyNotes';
import { StaffQuarterNote } from '../staffNoteGlyph';
import { melodicNoteColor } from '../../../theory/noteUtils';

// ── Note-colouring menu (Han 2026-06-13, redesigned 2026-06-14) ─────────────
// A COLOUR-mode menu of every note-colour scheme. The 5 sets sit in ONE horizontal
// row at the top (NOT stacked, NOT drawn over the existing staves — Han), in an HTML
// scroll strip (foreignObject) so it side-scrolls when the screen is too narrow. Each
// set is a self-contained little card: a mini 5-line staff (its own coordinate space,
// so it never overlaps the real staff) with 8 notes C4–C5 coloured by THAT scheme.
// Tap a card to select it; the active card is highlighted.
//
// Reuses the canonical glyph + colour helpers (CLAUDE.md §6d): StaffQuarterNote,
// getNoteAbsoluteY, melodicNoteColor — the exact code the real staff uses.
const SCHEMES = [
    { mode: 'none', label: 'None' },
    { mode: 'tonic_scale_keys', label: 'Tonic / Scale' },
    { mode: 'chords', label: 'Chords' },
    { mode: 'chromatone', label: 'Chromatone' },
    { mode: 'subtle-chroma', label: 'Subtle chroma' },
];
const NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];

// Card mini-staff geometry (its own viewBox — independent of the page staff).
const CARD_W = 150, CARD_H = 92, STAFF_TOP = 26;

// Ledger lines (every 10) between the mini 5-line staff and a notehead at `y`.
const ledgerYs = (y, staffStart) => {
    const out = [];
    for (let g = staffStart - 10; y <= g; g -= 10) out.push(g);
    for (let g = staffStart + 50; y >= g; g += 10) out.push(g);
    return out;
};

const cardNotes = (mode, ctx) => NOTES.map((n, i) => {
    const x = 16 + i * ((CARD_W - 30) / (NOTES.length - 1));
    const y = getNoteAbsoluteY(n, STAFF_TOP, 'treble', 'treble');
    if (y == null) return null;
    const color = melodicNoteColor(n, { noteColoringMode: mode, ...ctx }) || 'var(--text-primary)';
    return (
        <StaffQuarterNote key={n} x={x} positionY={y} staffYStart={STAFF_TOP}
            ledgerYs={ledgerYs(y, STAFF_TOP)} color={color} />
    );
});

const NoteColoringStaffOverlay = ({
    startX, endX, trebleStart, bottomY,
    noteColoringMode, setNoteColoringMode, tonic, scaleNotes, theme, debugMode = false,
}) => {
    const width = endX - startX;
    const height = Math.min(150, bottomY - trebleStart);
    const ctx = { tonic, scaleNotes, theme };
    return (
        <foreignObject x={startX} y={trebleStart} width={width} height={height}>
            {/* HTML strip: horizontal, side-scrolling, opaque so it never shows the staves
                behind it. xmlns is required for HTML inside an SVG foreignObject. */}
            <div xmlns="http://www.w3.org/1999/xhtml" data-settings-keepalive="" style={{
                display: 'flex', gap: 10, overflowX: 'auto', overflowY: 'hidden',
                height: '100%', alignItems: 'flex-start', padding: '6px 4px', boxSizing: 'border-box',
                background: 'var(--panel-bg)',
            }}>
                {SCHEMES.map((s) => {
                    const active = noteColoringMode === s.mode;
                    return (
                        <div key={s.mode} onClick={() => setNoteColoringMode(s.mode)} style={{
                            flex: '0 0 auto', cursor: 'pointer', textAlign: 'center',
                            border: `1px solid ${active ? 'var(--accent-yellow)' : 'var(--text-dim, #555)'}`,
                            borderRadius: 6, padding: '4px 4px 2px',
                            background: active ? 'rgba(255,210,74,0.1)' : 'transparent',
                        }}>
                            <div style={{
                                fontSize: 11, fontFamily: 'sans-serif', marginBottom: 2,
                                fontWeight: active ? 'bold' : 'normal',
                                color: active ? 'var(--accent-yellow)' : 'var(--text-primary)',
                            }}>{s.label}</div>
                            <svg width={CARD_W} height={CARD_H} viewBox={`0 0 ${CARD_W} ${CARD_H}`}>
                                {[0, 10, 20, 30, 40].map(dy => (
                                    <line key={dy} x1={6} y1={STAFF_TOP + dy} x2={CARD_W - 6} y2={STAFF_TOP + dy}
                                        stroke="var(--text-primary)" strokeWidth={0.5} opacity={0.6} />
                                ))}
                                {cardNotes(s.mode, ctx)}
                                {debugMode && (
                                    <rect x={0} y={0} width={CARD_W} height={CARD_H}
                                        fill="orange" fillOpacity={0.12} stroke="orange" strokeWidth={0.5} />
                                )}
                            </svg>
                        </div>
                    );
                })}
            </div>
        </foreignObject>
    );
};

export default NoteColoringStaffOverlay;
