import React from 'react';
import DisableCross from './DisableCross';
import { chordRootY } from '../ChordLabelsLayer';
import { CarouselField } from '../CarouselFieldItem';
import { melodicNoteColor, normalizeNoteChars, stripOctave } from '../../../theory/noteUtils';
import { generateChordOnDegree } from '../../../theory/chordGenerator';

/**
 * ChordStyleOverlay — the chord NOTATION selector (Han #12 / #529): X (disable) / letters /
 * roman, shown in the chord row inside the NOTATION (clef) setter. Writes `chordDisplayMode`
 * ('off' | 'letters' | 'roman').
 *
 * #529 (Han 2026-07-25): the three options are ONE hidden `CarouselField` — the SAME shared carousel
 * primitive every other setter uses (§6d): at rest only the active option shows; a press reveals +
 * drags through the three; the localized veil (§60) keeps it readable; the serif-italic header (§59)
 * names the field; each option carries an ALL-CAPS label (INVISIBLE / LETTERS / ROMAN).
 *
 * #529 rework (Han 2026-07-26): the letters/roman sample is the CURRENT key's diatonic ii–V7–I, built
 * with the CANONICAL chord engine — `generateChordOnDegree` (the exact function the real progression
 * uses, §6d — "de logica bestaat al, niet hercoderen"): degree 2 (ii) + degree 1 (I) as triads, and
 * degree 5 (V) as a FORCED dominant seventh (`overrideQuality='dominant'`, Han: "forceer een dominant
 * V7"). So in a MAJOR key it reads D− G7 C / ii V7 I; in a MINOR key the ii and i adapt (ii° … i) while
 * V stays a dominant seventh. Each chord's letter/roman/quality and its COLOUR come straight from the
 * generated Chord, coloured by `melodicNoteColor` exactly like the sheet chord labels.
 */

// Sheet chord-label metrics (mirror ChordLabelsLayer's non-passing chord).
const ROOT_FS = 26;
const SUP_FS = 16;
const SUP_DY = 12;
const GAP = 42;   // spacing between the 3 sample chords (Han: further apart)

// A short chord-label progression sample matching the SHEET chord labels EXACTLY (ChordLabelsLayer):
// plain serif (NOT italic), root + a raised superscript suffix. `chords` = [{ root, sup, color }].
// Drawn around a local origin `cx` (the carousel wrapper translates the whole item into place).
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

// Sizing consts. The letters/roman sample spans ≈ 2×GAP + a glyph each side, so the stride is wide
// enough that the three options don't overlap when open. visibleHalf=1 → all three show revealed.
const BASE = 138;
const HIT_TOP = -24, HIT_H = 48, HEADER_DY = -31, LABEL_DY = 26;

// Fixed C-major illustration used only when no usable scale is available (defensive — the app always
// has a Scale, but exotic/non-heptatonic scales can make the engine throw).
const FALLBACK = {
    letters: [{ root: 'D', sup: '−' }, { root: 'G', sup: '7' }, { root: 'C', sup: '' }],
    roman: [{ root: 'ii', sup: '' }, { root: 'V', sup: '7' }, { root: 'I', sup: '' }],
};

const ChordStyleOverlay = ({
    startX, endX, trebleStart,
    chordDisplayMode = 'letters',
    onSetChordDisplayMode,
    // #529 rework: the colouring/derivation context — the authoritative Scale + the SAME inputs
    // ChordLabelsLayer feeds melodicNoteColor.
    scale = null,
    noteColoringMode = 'none',
    tonic = 'C',
    theme = 'dark',
    debugMode = false,
}) => {
    // #529: single-open coordination is local (this overlay owns one field). Lifting it to share with
    // the clef/percussion carousels happens when #530 converts those too.
    const [activeFieldId, setActiveFieldId] = React.useState(null);

    // The CURRENT key's diatonic ii / V(7, forced dominant) / I via the canonical engine, memoised on
    // the scale so we don't regenerate chords every frame. try/catch: the engine requires a heptatonic
    // collection and throws otherwise — fall back to the fixed C-major illustration.
    const diatonic = React.useMemo(() => {
        if (!scale?.notes?.length) return null;
        try {
            return {
                ii: generateChordOnDegree(scale, 2, 'triad'),
                V: generateChordOnDegree(scale, 5, 'seventh', null, 'dominant'),
                I: generateChordOnDegree(scale, 1, 'triad'),
            };
        } catch { return null; }
    }, [scale]);

    if (startX == null || trebleStart == null) return null;

    // Match the SHEET chord-label baseline so the setter row sits at the SAME height as the real
    // chord labels (Han Batch C). Imported from ChordLabelsLayer (§6d single source of truth).
    const labelBase = chordRootY(trebleStart);
    const rowCenterY = labelBase - 9;              // ~centre of the 26px text
    const centerX = (startX + (endX ?? startX)) / 2;

    const activeIndex = Math.max(0, CHORD_STYLE_ITEMS.findIndex(o => o.value === chordDisplayMode));

    // Per-chord colour — the EXACT call ChordLabelsLayer makes (§6d), on the concert root.
    const colorOfChord = (c) => {
        const iroot = stripOctave(c.root || '');
        return melodicNoteColor(iroot, {
            noteColoringMode, tonic, scaleNotes: scale?.notes || [], theme,
            activeChord: noteColoringMode === 'chords' ? { root: iroot, notes: [iroot] } : null,
        }) || 'var(--text-primary)';
    };

    // Pull the display parts from a generated Chord: letters = key-spelled root (Unicode §5b) +
    // internalSuffix; roman = romanBaseDisplay + romanSuffix (adapts ii°/i in minor).
    const partOf = (c, kind) => (kind === 'roman'
        ? { root: c.meta?.romanBaseDisplay || c.roman || '', sup: c.meta?.romanSuffix || '' }
        : { root: normalizeNoteChars(stripOctave(c._displayRoot || c.root || '')), sup: c.internalSuffix || '' });

    // Build the 3-chord sample [ii, V, I] for a display kind, with per-chord colour.
    const buildSample = (kind) => {
        if (!diatonic) return FALLBACK[kind].map(x => ({ ...x, color: 'var(--text-primary)' }));
        return [diatonic.ii, diatonic.V, diatonic.I].map((c) => ({
            ...partOf(c, kind),
            color: colorOfChord(c),
        }));
    };

    // renderContent draws each option around the carousel item's LOCAL x-origin (0). The active/centre
    // option shows the real chord colours; passive (side) options dim to the field's `color` (lowlight).
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
