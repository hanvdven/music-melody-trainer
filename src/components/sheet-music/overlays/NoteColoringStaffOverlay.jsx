import React from 'react';
import NonLinearCarousel from './NonLinearCarousel';
import { StaffQuarterNote } from '../staffNoteGlyph';
import { melodicNoteColor } from '../../../theory/noteUtils';

// ── Note-colouring menu (Han 2026-06-13, redesigned on the NonLinearCarousel primitive
// 2026-06-17) ───────────────────────────────────────────────────────────────────────────
// COLOUR-mode menu of every note-colour scheme, rendered the visual-redesign way (docs §37
// principle 2): IN the SheetMusic SVG, on the EXISTING top staff. The 5 schemes are now
// CAROUSEL ITEMS (same NonLinearCarousel primitive as the instrument setter): the MIDDLE
// scheme is the active/selected one, side schemes fade + shrink toward the edges. Each scheme
// renders its own example notes (C4–C5) coloured by THAT scheme. Tap a side scheme → it glides
// to centre + becomes selected; drag → the centred scheme is selected.
//
// FLAT BASELINE (Han 2026-06-17, "flatten the wheel"): the example noteheads no longer ASCEND
// the staff by pitch — each scheme reads as a horizontal COLOUR SWATCH (the colour, not the
// pitch, is the point), so every notehead sits on ONE horizontal baseline (the middle staff
// line). Still drawn with the canonical StaffQuarterNote glyph (§6d) and per-note
// melodicNoteColor; only the y is held constant. No ledger lines needed when flat.
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
// The full diatonic run C4–C5 so each scheme's colouring reads clearly (Han 2026-06-17:
// the shortened 5-note run dropped too many in-between notes).
const NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
// Per-item slot stride (user units) — wider than the instrument items because each scheme item
// holds a run of example noteheads. Widened +40% (Han 2026-06-17).
const BASE = 134;
const NOTE_SPACING = 13;   // x-gap between the example noteheads within one scheme item
// The single horizontal baseline every example notehead sits on: the MIDDLE staff line. The staff
// body spans [staffStart .. staffStart+40]; the middle line is 20 below the top (matches
// staffNoteGlyph.stemIsUp's threshold). Holding y here is the whole "flatten the wheel" change.
const FLAT_DY = 20;

const NoteColoringStaffOverlay = ({
    startX, endX, trebleStart,
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
    // FLAT: every notehead sits on the single middle-line baseline (FLAT_DY) — the scheme reads as
    // a horizontal colour swatch, not a pitch ramp (Han 2026-06-17). No ledger lines when flat.
    const y = trebleStart + FLAT_DY;
    const renderItem = (s, i) => {
        const active = i === activeIndex;
        const runW = (NOTES.length - 1) * NOTE_SPACING;
        const x0 = -runW / 2;   // centre the example run on the item origin
        return (
            <g style={{ pointerEvents: 'none' }}>
                {NOTES.map((n, k) => {
                    const x = x0 + k * NOTE_SPACING;
                    const color = melodicNoteColor(n, { noteColoringMode: s.mode, ...ctx })
                        || 'var(--text-primary)';
                    return (
                        <StaffQuarterNote key={n} x={x} positionY={y} staffYStart={trebleStart}
                            color={color} />
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
