import React from 'react';
import NonLinearCarousel from './NonLinearCarousel';
import { getNoteAbsoluteY } from '../renderMelodyNotes';
import { StaffQuarterNote } from '../staffNoteGlyph';
import { melodicNoteColor } from '../../../theory/noteUtils';

// ── Note-colouring menu (Han 2026-06-13, redesigned on the NonLinearCarousel primitive
// 2026-06-17) ───────────────────────────────────────────────────────────────────────────
// COLOUR-mode menu of every note-colour scheme, rendered the visual-redesign way (docs §37
// principle 2): IN the SheetMusic SVG, on the EXISTING top staff. The 5 schemes are now
// CAROUSEL ITEMS (same NonLinearCarousel primitive as the instrument setter): the MIDDLE
// scheme is the active/selected one, side schemes fade + shrink toward the edges. Each scheme
// renders its own example notes (C4–C5) coloured by THAT scheme, placed with the same
// getNoteAbsoluteY/StaffQuarterNote the real notes use so they land on the staff lines. Tap a
// side scheme → it glides to centre + becomes selected; drag → the centred scheme is selected.
//
// REORDER + RENAME (Han 2026-06-17): none → chord → scale → chromatone → subtle chromatone.
// 'scale' is the RENAMED LABEL of the legacy 'tonic_scale_keys' mode — the mode VALUE stays
// 'tonic_scale_keys' (audio/selection wiring unchanged); only the visible label is 'Scale'.
const SCHEMES = [
    { mode: 'none', label: 'None' },
    { mode: 'chords', label: 'Chord' },
    { mode: 'tonic_scale_keys', label: 'Scale' },
    { mode: 'chromatone', label: 'Chromatone' },
    { mode: 'subtle-chroma', label: 'Subtle chromatone' },
];
// A compact span of example notes per scheme so a whole scheme item fits the carousel slot.
const NOTES = ['C4', 'E4', 'G4', 'B4', 'C5'];
// Per-item slot stride (user units) — wider than the instrument items because each scheme item
// holds a small run of example noteheads.
const BASE = 96;
const NOTE_SPACING = 13;   // x-gap between the example noteheads within one scheme item

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
    if (startX == null || endX == null) return null;
    const centerX = startX + (endX - startX) / 2;
    const activeIndex = Math.max(0, SCHEMES.findIndex(s => s.mode === noteColoringMode));
    // activeChord drives the 'chords' set's colouring (no playback → the representative chord).
    const ctx = { tonic, scaleNotes, theme, activeChord };

    // Render ONE scheme item around the carousel origin (0,0): its example notes coloured by
    // this scheme + the scheme label below. The carousel wrapper applies translate+scale+opacity.
    // SVG-NATIVE noteheads via the canonical StaffQuarterNote (§6d) so they match the real staff.
    const renderItem = (s, i) => {
        const active = i === activeIndex;
        const runW = (NOTES.length - 1) * NOTE_SPACING;
        const x0 = -runW / 2;   // centre the example run on the item origin
        return (
            <g style={{ pointerEvents: 'none' }}>
                {NOTES.map((n, k) => {
                    const x = x0 + k * NOTE_SPACING;
                    const y = getNoteAbsoluteY(n, trebleStart, clefTreble, 'treble');
                    if (y == null) return null;
                    const color = melodicNoteColor(n, { noteColoringMode: s.mode, ...ctx })
                        || 'var(--text-primary)';
                    return (
                        <StaffQuarterNote key={n} x={x} positionY={y} staffYStart={trebleStart}
                            ledgerYs={ledgerYs(y, trebleStart)} color={color} />
                    );
                })}
                <text x={0} y={trebleStart + 58} textAnchor="middle" fontSize={11}
                    fontFamily="sans-serif" fontWeight={active ? 'bold' : 'normal'}
                    fill={active ? 'var(--accent-yellow)' : 'var(--text-primary)'}>
                    {s.label}
                </text>
            </g>
        );
    };

    return (
        // data-fly so the WHOLE carousel slides in from the right as a unit when the colour
        // surface morphs in (same as the instrument setter; the scheme labels do the cascade's
        // delayed fade as non-fly children of the carousel wrappers).
        <g className="note-coloring-overlay">
            <g data-fly="">
                <NonLinearCarousel
                    items={SCHEMES} activeIndex={activeIndex} renderItem={renderItem}
                    centerX={centerX} y={trebleStart - 22} baseWidth={BASE} height={104}
                    onSelect={(s) => setNoteColoringMode(s.mode)}
                    debugMode={debugMode} />
            </g>
        </g>
    );
};

export default NoteColoringStaffOverlay;
