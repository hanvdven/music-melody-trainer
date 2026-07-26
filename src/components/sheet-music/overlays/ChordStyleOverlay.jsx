import React from 'react';
import DisableCross from './DisableCross';
import { chordRootY } from '../ChordLabelsLayer';
import { CarouselField } from '../CarouselFieldItem';

/**
 * ChordStyleOverlay — the chord NOTATION selector (Han #12 / #529): X (disable) / letters /
 * roman, shown in the chord row inside the NOTATION (clef) setter. Writes `chordDisplayMode`
 * ('off' | 'letters' | 'roman').
 *
 * #529 (Han 2026-07-25: "maak van de X D G C ii V7 I akkoordnotatie een carousel"): the three
 * options used to be three separate click-to-select hit boxes laid out across the chord row. They
 * are now ONE hidden `CarouselField` — the SAME shared carousel primitive every other setter uses
 * (§6d): at rest it shows only the active option; a press reveals + drags through the three; the
 * localized veil (§60) keeps it readable where it overlaps the chord row; the serif-italic header
 * (§59) names the field. The option CONTENT is unchanged — the letters/roman samples still reuse the
 * exact sheet-chord-label font/metrics (`ProgressionSample`) and the shared `DisableCross` for X.
 */

// Sheet chord-label metrics (mirror ChordLabelsLayer's non-passing chord).
const ROOT_FS = 26;
const SUP_FS = 16;
const SUP_DY = 12;

// A short chord-label progression sample matching the SHEET chord labels EXACTLY
// (ChordLabelsLayer): plain serif (NOT italic), root letter + the suffix — incl. the
// minor "−" — as a raised superscript tspan (Han #13). Drawn around a local origin `cx`
// (the carousel wrapper translates the whole item into place, so cx is 0 here).
const ProgressionSample = ({ cx, cy, kind, color }) => {
    const items = kind === 'roman'
        ? [{ root: 'ii', sup: '' }, { root: 'V', sup: '7' }, { root: 'I', sup: '' }]
        : [{ root: 'D', sup: '−' }, { root: 'G', sup: '7' }, { root: 'C', sup: '' }];
    const GAP = 42;                 // spacing between the 3 sample chords (Han: further apart)
    const x0 = cx - GAP;            // 3 chords centred on cx
    return (
        <g style={{ pointerEvents: 'none' }} fill={color}
            fontFamily="Georgia, 'Times New Roman', serif">
            {items.map((it, i) => {
                const x = x0 + i * GAP;
                return (
                    <text key={i} x={x} y={cy} fontSize={ROOT_FS} textAnchor="middle">
                        {it.root}
                        {it.sup && <tspan fontSize={SUP_FS} dy={-SUP_DY} dx="1">{it.sup}</tspan>}
                    </text>
                );
            })}
        </g>
    );
};

// #529: carousel option order (Han: "X / D G C / ii V7 I").
const CHORD_STYLE_ITEMS = [
    { value: 'off' },
    { value: 'letters' },
    { value: 'roman' },
];

// Sizing consts (named per Han's overlay convention). The letters/roman sample spans
// 2×GAP + a root glyph each side ≈ 120u, so the carousel stride is wide enough that the three
// options don't overlap when the field is open. visibleHalf=1 → all three show when revealed.
const BASE = 138;
const HIT_TOP = -24, HIT_H = 48, HEADER_DY = -31, LABEL_DY = 16;

const ChordStyleOverlay = ({
    startX, endX, trebleStart,
    chordDisplayMode = 'letters',
    onSetChordDisplayMode,
    debugMode = false,
}) => {
    // #529: single-open coordination is local (this overlay owns one field). Lifting it to share
    // with the clef/percussion carousels happens when #530/#529-B convert those too.
    const [activeFieldId, setActiveFieldId] = React.useState(null);
    if (startX == null || trebleStart == null) return null;

    // Match the SHEET chord-label baseline so the setter row sits at the SAME height as the real
    // chord labels (Han Batch C). Imported from ChordLabelsLayer (§6d single source of truth) so a
    // move of the chord row applies here too — no duplicated magic number.
    const labelBase = chordRootY(trebleStart);
    const rowCenterY = labelBase - 9;              // ~centre of the 26px text
    const centerX = (startX + (endX ?? startX)) / 2;

    const activeIndex = Math.max(0, CHORD_STYLE_ITEMS.findIndex(o => o.value === chordDisplayMode));

    // renderContent draws each option around the carousel item's LOCAL x-origin (0); the carousel
    // wrapper translates it into place. `color` comes from the field (active = primary, passive =
    // lowlight) so active/passive colouring matches the old hit-box behaviour.
    const renderContent = (item, _active, color) => {
        if (item.value === 'off') {
            // Shared DisableCross so the chord-row OFF reads identically to the staff + percussion
            // OFF crosses (Han BUG-V1). 18 wide → centre it on the local origin.
            return <DisableCross x={-9} topY={labelBase - 9 - 18} color={color} />;
        }
        return <ProgressionSample cx={0} cy={labelBase} kind={item.value === 'roman' ? 'roman' : 'letters'} color={color} />;
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
