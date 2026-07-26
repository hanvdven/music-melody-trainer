import React from 'react';
import DisableCross from './DisableCross';
import { chordRootY, renderSingleChordLabel } from '../ChordLabelsLayer';
import { CarouselField } from '../CarouselFieldItem';
import { stripOctave } from '../../../theory/noteUtils';
import { generateChordOnDegree } from '../../../theory/chordGenerator';
import Scale from '../../../model/Scale';

/**
 * ChordStyleOverlay — the chord NOTATION selector (Han #12 / #529): X (disable) / letters /
 * roman, shown in the chord row inside the NOTATION (clef) setter. Writes `chordDisplayMode`
 * ('off' | 'letters' | 'roman').
 *
 * #529 (Han 2026-07-25): the three options are ONE hidden `CarouselField` — the shared carousel
 * primitive every other setter uses (§6d): at rest only the active option shows; a press reveals +
 * drags through the three; the localized veil (§60) keeps it readable; the serif-italic header (§59)
 * names the field; each option carries an ALL-CAPS label (INVISIBLE / LETTERS / ROMAN).
 *
 * #529 rework (Han 2026-07-26): the letters/roman sample is the CURRENT key's diatonic ii–V7–I, and it
 * is rendered with the CANONICAL chord-label renderer `renderSingleChordLabel` (exported from
 * ChordLabelsLayer, §6d) — the EXACT glyphs, font (serif), size (26/16), weight (normal), superscript
 * layout and per-chord colour (`melodicNoteColor`) as the real sheet chord labels, so it can NEVER
 * drift from them (Han: "verschilt het lettertype/grootte/dikgedruktheid … hoe kan dat nou?"). The
 * chords come from the canonical engine `generateChordOnDegree` on the authoritative Scale: degree 2
 * (ii) + degree 1 (I) as triads, degree 5 (V) as a FORCED dominant seventh (`overrideQuality`), so a
 * major key reads D− G7 C / ii V7 I and a minor key adapts to ii° V7 i (Han: "forceer een dominant V7,
 * pas alleen ii en i aan"). Passive (off-centre) options dim via the renderer's `overrideColor`.
 */

// Sizing consts. The letters/roman sample spans ≈ 2×STEP + a glyph, so the carousel stride is wide
// enough that the three options don't overlap when open. visibleHalf=1 → all three show revealed.
const BASE = 138;
const HIT_TOP = -24, HIT_H = 48, HEADER_DY = -31, LABEL_DY = 26;
// 3-chord sample layout: start-anchored labels (like the sheet), centred on the item's local origin.
const STEP = 46, FIRST_X = -60;

// Flatten a generated Chord into the shape renderSingleChordLabel reads (its roman fields live in
// `.meta`; its quality is `.type`; its key-spelled root is `._displayRoot`). `notes` omitted so the
// renderer draws no clickable data-chord-notes hit rect inside the carousel.
const asLabel = (c) => ({
    romanBaseRaw: c.meta?.romanBaseRaw || c.roman || '',
    romanSuffix: c.meta?.romanSuffix || '',
    quality: c.type,
    internalRoot: stripOctave(c._displayRoot || c.root || ''),
    internalSuffix: c.internalSuffix || '',
    type: c.type,   // never 'slash'/'nc' → the renderer's normal chord branch
    meta: c.meta,
});

const CHORD_STYLE_ITEMS = [
    { value: 'off', label: 'invisible' },
    { value: 'letters', label: 'letters' },
    { value: 'roman', label: 'roman' },
];

const ChordStyleOverlay = ({
    startX, endX, trebleStart,
    chordDisplayMode = 'letters',
    onSetChordDisplayMode,
    scale = null,
    noteColoringMode = 'none',
    tonic = 'C',
    theme = 'dark',
    debugMode = false,
}) => {
    // #529: single-open coordination is local (this overlay owns one field). Lifting it to share with
    // the clef/percussion carousels happens when #530 converts those too.
    const [activeFieldId, setActiveFieldId] = React.useState(null);

    // The CURRENT key's diatonic ii / V(forced dominant 7) / I via the canonical engine, memoised on
    // the scale. The engine needs a heptatonic collection; on failure (exotic/non-heptatonic scale, or
    // no scale yet) fall back to C major so the sample always renders.
    const diatonic = React.useMemo(() => {
        const build = (s) => ({
            ii: generateChordOnDegree(s, 2, 'triad'),
            V: generateChordOnDegree(s, 5, 'seventh', null, 'dominant'),
            I: generateChordOnDegree(s, 1, 'triad'),
        });
        try { if (scale?.notes?.length) return build(scale); } catch { /* fall through */ }
        try { return build(Scale.defaultScale()); } catch { return null; }
    }, [scale]);

    if (startX == null || trebleStart == null) return null;

    const labelBase = chordRootY(trebleStart);     // the sheet chord-label baseline (§6d)
    const rowCenterY = labelBase - 9;              // ~centre of the 26px text
    const centerX = (startX + (endX ?? startX)) / 2;

    const activeIndex = Math.max(0, CHORD_STYLE_ITEMS.findIndex(o => o.value === chordDisplayMode));

    // renderContent draws each option around the carousel item's LOCAL x-origin (0); the wrapper
    // translates it into place. The letters/roman options reuse the canonical chord-label renderer so
    // they match the sheet exactly; the active/centre option shows real colours, passive dims via
    // overrideColor.
    const renderContent = (item, active, color) => {
        if (item.value === 'off') {
            return <DisableCross x={-9} topY={labelBase - 9 - 18} color={color} />;
        }
        if (!diatonic) return null;
        const chords = [diatonic.ii, diatonic.V, diatonic.I];
        return (
            <g style={{ pointerEvents: 'none' }}>
                {chords.map((c, i) => renderSingleChordLabel({
                    chord: asLabel(c),
                    xPos: FIRST_X + i * STEP,
                    absoluteOffset: i,
                    chordDuration: 0,
                    key: i,
                    idx: i,
                    overrideColor: active ? null : color,
                    trebleStart,
                    chordDisplayMode: item.value,
                    noteColoringMode,
                    theme,
                    tonic,
                    scaleNotes: scale?.notes || [],
                    inputTestState: null,
                    measureLengthSlots: 9999,
                    startMeasureIndex: 0,
                    debugMode: false,
                }))}
            </g>
        );
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
