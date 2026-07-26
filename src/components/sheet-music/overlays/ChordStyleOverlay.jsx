import React from 'react';
import DisableCross from './DisableCross';
import { chordRootY } from '../ChordLabelsLayer';
import { CarouselField } from '../CarouselFieldItem';
import { melodicNoteColor, normalizeNoteChars, stripOctave } from '../../../theory/noteUtils';

/**
 * ChordStyleOverlay — the chord NOTATION selector (Han #12 / #529): X (disable) / letters /
 * roman, shown in the chord row inside the NOTATION (clef) setter. Writes `chordDisplayMode`
 * ('off' | 'letters' | 'roman').
 *
 * #529 (Han 2026-07-25: "maak van de X D G C ii V7 I akkoordnotatie een carousel"): the three
 * options are ONE hidden `CarouselField` — the SAME shared carousel primitive every other setter
 * uses (§6d): at rest it shows only the active option; a press reveals + drags through the three; the
 * localized veil (§60) keeps it readable; the serif-italic header (§59) names the field; each option
 * carries an ALL-CAPS label (INVISIBLE / LETTERS / ROMAN, Han 2026-07-26).
 *
 * #529 rework (Han 2026-07-26): the letters/roman sample now COLOURS by the standard chord-label
 * rules — NOT a re-implementation: it reuses `melodicNoteColor` (the exact function ChordLabelsLayer
 * colours the real sheet chord names with, §6d) on each chord ROOT. The sample is KEY-RELATIVE (like
 * every other adaptive setter preview, #433): it renders the CURRENT key's ii–V7–I, so the tonic (the
 * "I" / its letter) always takes the tonic colour in scale mode, and every chord takes its chroma in
 * chromatone / chord mode.
 */

// Sheet chord-label metrics (mirror ChordLabelsLayer's non-passing chord).
const ROOT_FS = 26;
const SUP_FS = 16;
const SUP_DY = 12;
const GAP = 42;   // spacing between the 3 sample chords (Han: further apart)

// A short chord-label progression sample matching the SHEET chord labels EXACTLY (ChordLabelsLayer):
// plain serif (NOT italic), root letter + the suffix (incl. the minor "−") as a raised superscript.
// `chords` = [{ root, sup, color }] (per-chord colour from the caller). Drawn around a local origin
// `cx` (the carousel wrapper translates the whole item into place, so cx is 0 here).
const ProgressionSample = ({ cx, cy, chords }) => {
    const x0 = cx - GAP;            // 3 chords centred on cx
    return (
        <g style={{ pointerEvents: 'none' }} fontFamily="Georgia, 'Times New Roman', serif">
            {chords.map((it, i) => (
                <text key={i} x={x0 + i * GAP} y={cy} fontSize={ROOT_FS} textAnchor="middle" fill={it.color}>
                    {it.root}
                    {it.sup && <tspan fontSize={SUP_FS} dy={-SUP_DY} dx="1">{it.sup}</tspan>}
                </text>
            ))}
        </g>
    );
};

// #529: carousel option order + labels (Han 2026-07-26: "INVISIBLE / LETTERS / ROMAN").
const CHORD_STYLE_ITEMS = [
    { value: 'off', label: 'invisible' },
    { value: 'letters', label: 'letters' },
    { value: 'roman', label: 'roman' },
];

// Sizing consts. The letters/roman sample spans 2×GAP + a root glyph each side ≈ 120u, so the stride
// is wide enough that the three options don't overlap when the field is open. visibleHalf=1 → all
// three show when revealed.
const BASE = 138;
const HIT_TOP = -24, HIT_H = 48, HEADER_DY = -31, LABEL_DY = 26;

const ChordStyleOverlay = ({
    startX, endX, trebleStart,
    chordDisplayMode = 'letters',
    onSetChordDisplayMode,
    // #529 rework: the colouring context — SAME inputs ChordLabelsLayer feeds melodicNoteColor.
    noteColoringMode = 'none',
    tonic = 'C',
    scaleNotes = [],
    theme = 'dark',
    debugMode = false,
}) => {
    // #529: single-open coordination is local (this overlay owns one field). Lifting it to share with
    // the clef/percussion carousels happens when #530 converts those too.
    const [activeFieldId, setActiveFieldId] = React.useState(null);
    if (startX == null || trebleStart == null) return null;

    // Match the SHEET chord-label baseline so the setter row sits at the SAME height as the real
    // chord labels (Han Batch C). Imported from ChordLabelsLayer (§6d single source of truth).
    const labelBase = chordRootY(trebleStart);
    const rowCenterY = labelBase - 9;              // ~centre of the 26px text
    const centerX = (startX + (endX ?? startX)) / 2;

    const activeIndex = Math.max(0, CHORD_STYLE_ITEMS.findIndex(o => o.value === chordDisplayMode));

    // KEY-RELATIVE ii–V7–I roots — taken straight from the CURRENT SCALE (Han 2026-07-26: "die moeten
    // relatief zijn aan de akkoorden van de toonladder"). scaleNotes are the diatonic degrees already
    // respelled to the key, so degree 1 = I (tonic), degree 2 = ii (supertonic), degree 5 = V
    // (dominant) — the actual chords of the scale, not a fixed C–G–C. #433: the sample follows the key.
    const deg = (i) => (scaleNotes && scaleNotes[i]) ? scaleNotes[i] : tonic;
    const IRoot = deg(0);
    const iiRoot = deg(1);
    const VRoot = deg(4);

    // Colour a chord root by the ACTIVE scheme — the EXACT call ChordLabelsLayer makes (§6d): tonic/
    // scale → tonic/scale colour, chromatone → the root's chroma, chords → the root's chord tint.
    const colorOfRoot = (root) => melodicNoteColor(root, {
        noteColoringMode, tonic, scaleNotes, theme,
        // EXACTLY ChordLabelsLayer's call (§6d): a synthetic single-note chord in 'chords' mode,
        // null otherwise (melodicNoteColor ignores activeChord in the other modes).
        activeChord: noteColoringMode === 'chords' ? { root, notes: [root] } : null,
    }) || 'var(--text-primary)';

    // letters = the key's actual chord letters (respelled, Unicode accidentals §5b); roman = fixed
    // ii/V/I text. Both colour their roots identically.
    const disp = (n) => normalizeNoteChars(stripOctave(n));
    const buildSample = (kind) => {
        const roots = [iiRoot, VRoot, IRoot];
        const romanRoots = ['ii', 'V', 'I'];
        // Letters spell the minor ii as "−"; roman already encodes it in the lower-case numeral, so
        // only V keeps its "7" there (matches the original ChordStyleOverlay sample).
        const sups = kind === 'roman' ? ['', '7', ''] : ['−', '7', ''];
        return roots.map((r, i) => ({
            root: kind === 'roman' ? romanRoots[i] : disp(r),
            sup: sups[i],
            color: colorOfRoot(r),
        }));
    };

    // renderContent draws each option around the carousel item's LOCAL x-origin (0); the carousel
    // wrapper translates it into place. When the item is the ACTIVE/centre one it shows the real
    // chord colours; passive (side) items dim to the field's `color` (lowlight).
    const renderContent = (item, active, color) => {
        if (item.value === 'off') {
            return <DisableCross x={-9} topY={labelBase - 9 - 18} color={color} />;
        }
        const chords = buildSample(item.value);
        const shown = active ? chords : chords.map(c => ({ ...c, color }));
        return <ProgressionSample cx={0} cy={labelBase} chords={shown} />;
    };

    return (
        <g className="chord-style-overlay" onClick={(e) => e.stopPropagation()}>
            <CarouselField
                items={CHORD_STYLE_ITEMS}
                activeIndex={activeIndex}
                onSelect={(item) => onSetChordDisplayMode?.(item.value)}
                centerX={centerX}
                rowCenterY={rowCenterY}
                baseWidth={BASE}
                hitTop={HIT_TOP}
                hitHeight={HIT_H}
                iconSize={0}
                iconDy={0}
                labelDy={LABEL_DY}
                labelFontSize={11}
                bracketDy={HEADER_DY}
                headerDy={HEADER_DY}
                labelAbove="chord notation"
                renderContent={renderContent}
                // Chords band → no staff lines to redraw through the veil (§60).
                staffLineYs={[]}
                staffX0={startX}
                staffX1={endX}
                visibleHalf={1}
                fieldId="chord-notation"
                activeFieldId={activeFieldId}
                onActivate={setActiveFieldId}
                hidden
                debugMode={debugMode}
            />
        </g>
    );
};

export default ChordStyleOverlay;
