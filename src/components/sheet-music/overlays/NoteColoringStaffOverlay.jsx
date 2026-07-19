import React from 'react';
import NonLinearCarousel from './NonLinearCarousel';
import { MiniMelody, MINI_QUARTER } from './MiniMelody';
import { useRevealOnInteraction } from '../../../hooks/useRevealOnInteraction';

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
    // #361 (Han): order = none, SCALE, CHORD, chroma, subtle chroma.
    { mode: 'none', label: 'None' },
    { mode: 'tonic_scale_keys', label: 'Scale' },
    { mode: 'chords', label: 'Chord' },
    { mode: 'chromatone', label: 'Chromatone' },
    { mode: 'subtle-chroma', label: 'Subtle chromatone' },
];
// The full diatonic run C4–C5 so each scheme's colouring reads clearly (Han 2026-06-17:
// the shortened 5-note run dropped too many in-between notes).
const NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
// Per-item slot stride (user units) — narrower carousel per Han 2026-06-27 feedback.
// Reduced from 134 → 115 (about 15%) to make carousel more compact.
// Further reduced to 100 (Han 2026-06-27): to show exactly 3 color schemes (left peek + center + right peek),
// we pass visibleHalf={1} to NonLinearCarousel (3 total).
// Bumped back to 115 (Han 2026-06-27 UAT: "maak de overlap wat kleiner"): each scheme's example
// run is (8-1)*NOTE_SPACING = 112px wide, so a 100px stride OVERLAPPED adjacent items by ~12px.
// A 115px stride spaces the item centres just past the run width → visible separation while still
// peeking the two neighbours (3 schemes on screen).
const BASE = 115;
// Horizontal room for the C4–C5 example run inside one scheme item (≈ the old 7×16 run width).
const RUN_WIDTH = 112;
// #435 (Han 2026-07-19): value-label drop matches the other setters (staffStart+58, = generation
// CONTENT_LABEL_DY relative to its rowCenterY) for cross-setter consistency.
const LABEL_DY = 58;
// Field header drop — the shared setter header height (staffStart−11 = generation rowCenterY−31).
const HEADER_DY = -11;

const NoteColoringStaffOverlay = ({
    startX, endX, trebleStart, clefTreble = 'treble',
    noteColoringMode, setNoteColoringMode, tonic, scaleNotes, activeChord = null, theme,
    // #427 rework (Han: "COLOUR: maak een hidden carousel hiervan") — hidden reveal-on-interaction
    // like the other setters (§6d shared hook). Default on; a caller can pass false to force-expand.
    hidden = true,
    debugMode = false,
}) => {
    const { collapsed, mountAllItems, reveal, resetHideTimer } = useRevealOnInteraction(hidden);
    if (startX == null || endX == null) return null;
    const centerX = startX + (endX - startX) / 2;
    const activeIndex = Math.max(0, SCHEMES.findIndex(s => s.mode === noteColoringMode));
    // The 'chords' scheme colours notes by the representative chord (no playback). Feed it to the
    // pipeline as a single-slot processedChords entry so renderMelodyNotes derives the activeChord.
    const previewChords = activeChord
        ? [{ absoluteOffset: 0, isSlash: false, chord: { root: activeChord.root, notes: activeChord.notes } }]
        : [];

    // Render ONE scheme item: its C4→C5 example run coloured by THAT scheme, via the shared
    // MiniMelody pipeline (§6d — the SAME renderMelodyNotes path as the staff + the note pool; no
    // hand-rolled noteheads), plus the scheme label below. The carousel wraps this in
    // translate+scale+opacity.
    const renderItem = (s, i) => {
        const active = i === activeIndex;
        return (
            <g style={{ pointerEvents: 'none' }}>
                <MiniMelody
                    slots={NOTES}
                    durations={NOTES.map(() => MINI_QUARTER)}
                    width={RUN_WIDTH}
                    staffStart={trebleStart}
                    clef={clefTreble}
                    noteColoringMode={s.mode}
                    tonic={tonic}
                    scaleNotes={scaleNotes}
                    theme={theme}
                    processedChords={s.mode === 'chords' ? previewChords : []}
                    groupBeats={8}
                />
                {/* Active-state colour convention (Han 2026-07-14): bright active (no category here →
                    --text-primary), dim inactive; item VALUE label sans-serif ALL CAPS. */}
                <text x={0} y={trebleStart + LABEL_DY} textAnchor="middle" fontSize={11}
                    fontFamily="sans-serif" fontWeight={active ? 'bold' : 'normal'}
                    fill={active ? 'var(--text-primary)' : 'var(--text-lowlight)'}>
                    {s.label.toUpperCase()}
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
            {/* #435 (Han 2026-07-19: "colour heeft nu geen header"): field header, same style + height
                as every other setter header (serif italic, non-caps, --text-secondary, staffStart−11). */}
            <text x={centerX} y={trebleStart + HEADER_DY} textAnchor="middle" fontSize={14}
                fontFamily="serif" fontStyle="italic" fill="var(--text-secondary)"
                style={{ userSelect: 'none', pointerEvents: 'none' }}>colour</text>
            <NonLinearCarousel
                items={SCHEMES} activeIndex={activeIndex} renderItem={renderItem}
                centerX={centerX} y={trebleStart - 22} baseWidth={BASE} height={104}
                visibleHalf={1}
                onSelect={(s) => { setNoteColoringMode(s.mode); if (hidden) resetHideTimer(); }}
                onPosChange={hidden ? (() => resetHideTimer()) : undefined}
                collapsed={collapsed}
                mountAllItems={mountAllItems}
                onReveal={hidden ? reveal : undefined}
                debugMode={debugMode} />
        </g>
    );
};

export default NoteColoringStaffOverlay;
