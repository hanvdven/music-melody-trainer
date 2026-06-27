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
// renders its own example notes ASCENDING C4→C5 at their real staff positions, coloured by THAT
// scheme. Tap a side scheme → it glides to centre + becomes selected; drag → the centred scheme
// is selected. (Han 2026-06-17: keep the C4–C5 pitch ramp — an earlier "flatten the wheel" pass
// wrongly flattened the NOTES; only the CAROUSEL itself should read horizontal, not the notes.)
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
// Per-item slot stride (user units) — narrower carousel per Han 2026-06-27 feedback.
// Reduced from 134 → 115 (about 15%) to make carousel more compact.
// Further reduced to 100 (Han 2026-06-27): to show exactly 3 color schemes (left peek + center + right peek),
// we pass visibleHalf={1} to NonLinearCarousel (3 total). The 100px stride keeps items well-spaced
// within the typical 350px window while maintaining compact layout.
const BASE = 100;
// x-gap between the example noteheads within one scheme item. Increased 11 → 16 (Han 2026-06-27):
// add more horizontal space between notes for clarity while keeping carousel narrower overall.
const NOTE_SPACING = 16;
// Scheme-label vertical drop below the staff top line. LOWERED (Han 2026-06-18): the colour
// carousel's notes ASCEND C4→C5, so the lowest example notes (C4 + its ledger lines) sit well
// below the staff and the old +58 label crowded them. Pushed down to clear the run and to sit
// roughly where the instrument carousel's NAME_DY (58, below the bottom staff line) reads — Han
// will fine-tune the exact value live.
const LABEL_DY = 78;

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
    // Notes ASCEND C4→C5 at their true staff positions (Han 2026-06-17: keep the C4–C5 idea — the
    // "flat" was a misread; only the CAROUSEL should read horizontal, not the notes).
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
                <text x={0} y={trebleStart + LABEL_DY} textAnchor="middle" fontSize={11}
                    fontFamily="sans-serif" fontWeight={active ? 'bold' : 'normal'}
                    fill={active ? 'var(--accent-yellow)' : 'var(--text-primary)'}>
                    {s.label}
                </text>
            </g>
        );
    };

    return (
        // PER-ELEMENT FLY-IN (Han 2026-06-19): the `data-fly` moved DOWN onto each scheme card
        // inside NonLinearCarousel, so the scheme cards cascade in one-by-one from the right
        // (leftmost lands first) instead of the whole carousel flying as one unit. The old wrapping
        // `<g data-fly>` is gone — keeping it would double-translate every card. (The scheme labels
        // ride inside each card's fly subtree, so they slide WITH their card now rather than doing
        // the cascade's delayed fade.)
        <g className="note-coloring-overlay">
            <NonLinearCarousel
                items={SCHEMES} activeIndex={activeIndex} renderItem={renderItem}
                centerX={centerX} y={trebleStart - 22} baseWidth={BASE} height={104}
                visibleHalf={1}
                onSelect={(s) => setNoteColoringMode(s.mode)}
                debugMode={debugMode} />
        </g>
    );
};

export default NoteColoringStaffOverlay;
