import React from 'react';
import NonLinearCarousel from './NonLinearCarousel';
import { MiniMelody, MINI_QUARTER } from './MiniMelody';
import { useRevealOnInteraction } from '../../../hooks/useRevealOnInteraction';
import { CarouselField } from '../CarouselFieldItem';
import { allThemes, getThemeIconUrl } from '../../common/ThemeToggle';
import { useDisplaySettings } from '../../../contexts/DisplaySettingsContext';
import { Music2, BookOpenCheck, ArrowRightFromLine, ArrowLeft, MicVocal, PencilOff } from 'lucide-react';

// #533 (Han 2026-07-29): the in-staff THEME carousel — one option per app theme, reusing the shared
// `allThemes` list (§6c). Each option renders a two-tone swatch (bg + accent) like the header
// ThemeToggle; picking one calls setTheme (the data-theme attribute + CSS do the rest). Placed on the
// PERCUSSION staff for now (additive); Han wants it on the bass staff eventually, with the existing
// highlights/animation/lyrics controls restacked — a follow-up restructure.
// #628-S2: items carry `family` (the theme CATEGORY) so the CarouselField groups them with the same
// dashed "blokhaken" brackets as the instrument setter (familyMode). `icon` (icons8 basename) is passed
// through for the #628-S3 swatch redesign.
const THEME_ITEMS = allThemes.map((t) => ({ value: t.id, label: t.name, colors: t.colors, family: t.category, icon: t.icon }));

// #532 (Han 2026-07-30): the app-text FONT carousel — AS IS / MAESTRO (Finale Maestro Text) /
// ACADEMICO. Each option shows an "Aa" sample IN that font. `sample` uses a font-family that the
// App.css switch rule leaves alone (default = no 'serif' term; the other two contain Maestro/Academico
// which the rule's :not() excludes), so a sample always shows its OWN font.
const FONT_ITEMS = [
    { value: 'default', label: 'as is', sample: 'Arial, Helvetica' },
    { value: 'maestro', label: 'maestro', sample: 'FinaleMaestroText' },
    { value: 'academico', label: 'academico', sample: 'Academico' },
];

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
// #502 (Han 2026-07-20): the legacy SubHeader "settings" surface was retired; three of its
// adjustment controls moved HERE, onto the BASS staff, as hidden tap-to-open carousels (same
// CarouselField + shared veil as the generation setter): HIGHLIGHTS, ANIMATION (pag/wipe/scroll)
// and LYRICS (solfège). The colour-scheme carousel keeps the treble staff.
const SCHEMES = [
    // #361 (Han): order = none, SCALE, CHORD, chroma, subtle chroma.
    { mode: 'none', label: 'None' },
    { mode: 'tonic_scale_keys', label: 'Scale' },
    { mode: 'chords', label: 'Chord' },
    { mode: 'chromatone', label: 'Chromatone' },
    { mode: 'subtle-chroma', label: 'Subtle chromatone' },
];
// The full diatonic run so each scheme's colouring reads clearly (Han 2026-06-17: the shortened
// 5-note run dropped too many in-between notes). #497 (Han 2026-07-19): on a BASS-clef top staff the
// C4–C5 run sits far ABOVE the staff ("de kleurensetter komt heel hoog uit") — drop an octave to
// C3–C4 so it reads inside the bass clef.
const NOTES_TREBLE = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
const NOTES_BASS = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4'];
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

// ── #502 bass-staff adjustment carousels (highlights / animation / lyrics) ───────────────────────
// Item shape {value, label, Icon} — CarouselField renders the lucide icon + ALL-CAPS label.
const HIGHLIGHT_ITEMS = [
    { value: false, label: 'No highlights', Icon: Music2 },
    { value: true, label: 'Highlights', Icon: Music2 },
];
// ANIMATION combines animationMode + paginationVariant into ONE carousel (the old SubHeader cycle:
// pag·snel → pag·mid → wipe → scroll). Each item carries the (mode, variant) pair it writes.
const ANIMATION_ITEMS = [
    { value: 'pag-snel', mode: 'pagination', variant: 'snel', label: 'Pag · snel', Icon: BookOpenCheck },
    { value: 'pag-mid', mode: 'pagination', variant: 'mid', label: 'Pag · mid', Icon: BookOpenCheck },
    { value: 'wipe', mode: 'wipe', variant: null, label: 'Wipe', Icon: ArrowRightFromLine },
    { value: 'scroll', mode: 'scroll', variant: null, label: 'Scroll', Icon: ArrowLeft },
];
const LYRICS_ITEMS = [
    { value: 'none', label: 'No lyrics', Icon: PencilOff },
    { value: 'doremi-rel', label: 'Do-re-mi (rel)', Icon: MicVocal },
    { value: 'doremi-abs', label: 'Do-re-mi (abs)', Icon: MicVocal },
    { value: 'kodaly', label: 'Do-re-mi (Kodály)', Icon: MicVocal },
    { value: 'takadimi', label: 'Takadimi', Icon: Music2 },
];
// #533 (Han 2026-07-30): the three adjustment controls now sit ONE PER STAFF (highlights=treble,
// animation=bass, lyrics=percussion), stacked vertically on the RIGHT of the scheme carousel — each a
// full CarouselField with a STAFF-HEIGHT icon like the other setters. Sizing mirrors the exercise /
// generation setters (icon ~30 at rowCenterY−19, label at +38, header at −31).
const CTRL_BASE = 70, CTRL_ICON = 30, CTRL_ICON_DY = -19, CTRL_LABEL_DY = 38;
const CTRL_HIT_TOP = -30, CTRL_HIT_H = 60, CTRL_HEADER_DY = -31;

const NoteColoringStaffOverlay = ({
    startX, endX, trebleStart, bassStart, percussionStart, clefTreble = 'treble',
    noteColoringMode, setNoteColoringMode, tonic, scaleNotes, activeChord = null, theme, setTheme,
    appFont = 'default', setAppFont,
    // #427 rework (Han: "COLOUR: maak een hidden carousel hiervan") — hidden reveal-on-interaction
    // like the other setters (§6d shared hook). Default on; a caller can pass false to force-expand.
    hidden = true,
    debugMode = false,
}) => {
    const { collapsed, mountAllItems, reveal, resetHideTimer } = useRevealOnInteraction(hidden);
    // #497: pick the example-run register from the top staff's CLEF FAMILY (bass clef → C3–C4).
    const isBassClef = String(clefTreble).replace(/(8|15|22)v[ab]$/, '') === 'bass';
    const NOTES = isBassClef ? NOTES_BASS : NOTES_TREBLE;
    // #502: the three moved adjustment controls come straight from DisplaySettings (they used to be
    // read by the SubHeader) — no extra prop threading through SheetMusic.
    const {
        showNoteHighlight, setShowNoteHighlight,
        animationMode, setAnimationMode,
        paginationVariant, setPaginationVariant,
        lyricsMode, setLyricsMode,
    } = useDisplaySettings();
    // Single-open coordination across the three bass carousels (mirrors the generation setter).
    const [activeFieldId, setActiveFieldId] = React.useState(null);
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

    // ── #533: highlights / animation / lyrics — ONE PER STAFF, stacked on the right ────────────────
    const animIndex = Math.max(0, ANIMATION_ITEMS.findIndex(a =>
        a.mode === animationMode && (a.variant == null || a.variant === (paginationVariant ?? 'mid'))));
    const controlCx = startX + 0.84 * (endX - startX);   // right of the scheme carousel
    const controlRows = [
        { id: 'highlights', label: 'highlights', items: HIGHLIGHT_ITEMS, rowCenterY: trebleStart + 20,
            activeIndex: showNoteHighlight ? 1 : 0, onSelect: (it) => setShowNoteHighlight(it.value) },
        bassStart != null && { id: 'animation', label: 'animation', items: ANIMATION_ITEMS, rowCenterY: bassStart + 20,
            activeIndex: animIndex,
            onSelect: (it) => { setAnimationMode(it.mode); if (it.variant) setPaginationVariant?.(it.variant); } },
        percussionStart != null && { id: 'lyrics', label: 'lyrics', items: LYRICS_ITEMS, rowCenterY: percussionStart + 20,
            activeIndex: Math.max(0, LYRICS_ITEMS.findIndex(l => l.value === lyricsMode)),
            onSelect: (it) => setLyricsMode(it.value) },
    ].filter(Boolean);

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

            {/* #533: HIGHLIGHTS (treble) / ANIMATION (bass) / LYRICS (percussion) — ONE PER STAFF,
                stacked vertically on the right of the scheme carousel, each a full CarouselField with a
                staff-height icon (§6d, §60). */}
            {controlRows.map((f) => (
                <CarouselField
                    key={f.id}
                    items={f.items}
                    activeIndex={f.activeIndex}
                    onSelect={f.onSelect}
                    centerX={controlCx}
                    rowCenterY={f.rowCenterY}
                    baseWidth={CTRL_BASE}
                    hitTop={CTRL_HIT_TOP}
                    hitHeight={CTRL_HIT_H}
                    iconSize={CTRL_ICON}
                    iconDy={CTRL_ICON_DY}
                    labelDy={CTRL_LABEL_DY}
                    labelFontSize={11}
                    bracketDy={CTRL_HEADER_DY}
                    headerDy={CTRL_HEADER_DY}
                    labelAbove={f.label}
                    staffLineYs={[-20, -10, 0, 10, 20].map(d => f.rowCenterY + d)}
                    staffX0={startX}
                    staffX1={endX}
                    fieldId={f.id}
                    activeFieldId={activeFieldId}
                    onActivate={setActiveFieldId}
                    visibleHalf={2}
                    hidden
                    debugMode={debugMode}
                />
            ))}

            {/* #533: THEME carousel — UNDER the scheme (nootkleuring), on the BASS staff. Brush-stroke
                colour swatch per theme + the theme name; picking one switches the app theme via setTheme. */}
            {bassStart != null && setTheme && (
                <CarouselField
                    items={THEME_ITEMS}
                    activeIndex={Math.max(0, allThemes.findIndex((t) => t.id === (theme || 'default')))}
                    onSelect={(item) => setTheme(item.value)}
                    centerX={centerX}
                    rowCenterY={bassStart + 20}
                    baseWidth={84}
                    hitTop={-24}
                    hitHeight={52}
                    iconSize={0}
                    iconDy={0}
                    labelDy={38}
                    labelFontSize={11}
                    bracketDy={-24}
                    headerDy={-31}
                    labelAbove="theme"
                    // #628-S2: group the ~20 themes by CATEGORY (Default/Light/Dark/Elemental/Special/
                    // Pets) with the shared dashed "blokhaken" brackets — same mechanism as the
                    // instrument setter (§6d). `family` is on each THEME_ITEM; brackets sit at
                    // bracketDy (−24) just below the "theme" header (−31), above the full-height swatch.
                    familyMode
                    familyName={(f) => f}
                    familyColor={() => 'var(--text-secondary)'}
                    renderContent={(item, active) => {
                        // #628-S3 swatch redesign (Han 2026-07-31): from a 4-colour band to a themed
                        // MINI-STAFF — a box in the theme's real background colour (panel-bg), the staff
                        // lines in the line colour, the theme's icons8 LOGO tinted to the accent colour,
                        // and "Aa" in the theme's text colour. Still clipped to the OPAQUE brush-stroke
                        // silhouette from #533 UAT (soft horizontal ends, tight top/bottom, no border).
                        const cy = bassStart + 20;   // staff centre; lines at cy−20 … cy+20
                        const cs = item.colors;      // [app-bg, accent, panel-bg, text]
                        const bg = cs[2] ?? cs[0];               // the real page background
                        const accent = cs[1] ?? 'var(--accent-yellow)';
                        const text = cs[3] ?? 'var(--text-primary)';
                        // #636 UAT (Han 2026-07-31): wider still (→78) and rectangular (no clip). The SIDES
                        // (left/right only, not top/bottom) get a ~6px soft fade — a horizontal mask — so
                        // the swatch has soft "verfstreek" edges WITHOUT the taper clip that cut the logo.
                        // Staff lines drawn LAST at the exact real-staff stroke (0.5, --text-primary) so
                        // they read continuous with the rest of the staff.
                        const W = 78, FADE = 6 / W;               // 6px soft edge each side
                        const x0 = -W / 2, x1 = W / 2, yT = cy - 20, yB = cy + 20;
                        const sid = String(item.value).replace(/[^a-z0-9]/gi, '');
                        const tintId = `theme-logo-tint-${sid}`;
                        const fadeId = `theme-swatch-fade-${sid}`;
                        const maskId = `theme-swatch-mask-${sid}`;
                        const iconUrl = getThemeIconUrl(item.icon);
                        const LOGO = 38;                          // logo near full staff height
                        return (
                            <g style={{ pointerEvents: 'none' }}>
                                <defs>
                                    {/* Flood the accent colour into the flat-black icons8 PNG's alpha
                                        (same #436 trick as the instrument setter) → an accent-coloured logo. */}
                                    <filter id={tintId} x="0" y="0" width="100%" height="100%">
                                        <feFlood floodColor={accent} result="flood" />
                                        <feComposite in="flood" in2="SourceAlpha" operator="in" />
                                    </filter>
                                    {/* 6px soft fade on the LEFT/RIGHT edges only (horizontal gradient mask). */}
                                    <linearGradient id={fadeId} x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0" stopColor="white" stopOpacity="0" />
                                        <stop offset={FADE} stopColor="white" stopOpacity="1" />
                                        <stop offset={1 - FADE} stopColor="white" stopOpacity="1" />
                                        <stop offset="1" stopColor="white" stopOpacity="0" />
                                    </linearGradient>
                                    <mask id={maskId}>
                                        <rect x={x0} y={yT} width={W} height={yB - yT} fill={`url(#${fadeId})`} />
                                    </mask>
                                </defs>
                                <g mask={`url(#${maskId})`}>
                                    {/* #628-S5 (Han): the ACTIVE swatch = the currently-applied theme, so its
                                        own bg box is dropped → the REAL themed page background shows through. */}
                                    {!active && <rect x={x0} y={yT} width={W} height={yB - yT} fill={bg} />}
                                    {/* LOGO + "Aa" counter-scaled in Y by the carousel's per-item scale
                                        (--nlc-s) about the staff centre, so with fixedItemHeight (X-only
                                        scale) they shrink UNIFORMLY instead of stretching tall (Han). */}
                                    <g style={{ transform: `translate(0px, ${cy}px) scaleY(var(--nlc-s, 1)) translate(0px, ${-cy}px)` }}>
                                        {iconUrl && (
                                            <image href={iconUrl} x={x0 + 4} y={cy - LOGO / 2}
                                                width={LOGO} height={LOGO} filter={`url(#${tintId})`}
                                                preserveAspectRatio="xMidYMid meet" />
                                        )}
                                        <text x={x1 - 14} y={cy + 6} textAnchor="middle" fontSize={18}
                                            fontFamily="serif" fill={text}>Aa</text>
                                    </g>
                                    {/* staff lines LAST, exact real-staff stroke → continuous, no seam */}
                                    {[-20, -10, 0, 10, 20].map((d2) => (
                                        <line key={d2} x1={x0} x2={x1} y1={cy + d2} y2={cy + d2}
                                            stroke="var(--text-primary)" strokeWidth="0.5" />
                                    ))}
                                </g>
                            </g>
                        );
                    }}
                    staffLineYs={[-20, -10, 0, 10, 20].map((d) => bassStart + 20 + d)}
                    staffX0={startX}
                    staffX1={endX}
                    fieldId="theme"
                    activeFieldId={activeFieldId}
                    onActivate={setActiveFieldId}
                    visibleHalf={2}
                    hidden
                    fixedItemHeight
                    showVeil={false}
                    debugMode={debugMode}
                />
            )}

            {/* #532: FONT carousel — under the theme, on the PERCUSSION staff. Each option shows an "Aa"
                sample in that font; picking one switches the app-wide text font via setAppFont. */}
            {percussionStart != null && setAppFont && (
                <CarouselField
                    items={FONT_ITEMS}
                    activeIndex={Math.max(0, FONT_ITEMS.findIndex((f) => f.value === appFont))}
                    onSelect={(item) => setAppFont(item.value)}
                    centerX={centerX}
                    rowCenterY={percussionStart + 20}
                    baseWidth={70}
                    hitTop={-24}
                    hitHeight={52}
                    iconSize={0}
                    iconDy={0}
                    labelDy={38}
                    labelFontSize={11}
                    bracketDy={-31}
                    headerDy={-31}
                    labelAbove="font"
                    renderContent={(item) => (
                        <text x={0} y={percussionStart + 29} textAnchor="middle" fontSize={26}
                            fontFamily={item.sample} fill="var(--text-primary)">Aa</text>
                    )}
                    staffLineYs={[-20, -10, 0, 10, 20].map((d) => percussionStart + 20 + d)}
                    staffX0={startX}
                    staffX1={endX}
                    fieldId="font"
                    activeFieldId={activeFieldId}
                    onActivate={setActiveFieldId}
                    visibleHalf={2}
                    hidden
                    debugMode={debugMode}
                />
            )}
        </g>
    );
};

export default NoteColoringStaffOverlay;
