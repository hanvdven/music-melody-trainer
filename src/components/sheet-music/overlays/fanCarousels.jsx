import React from 'react';
import { leftCurveX, useTangensDrag } from './tangensCurve';

// ── Shared tangens fan carousels (#300/#302, extracted from
// GenerationAdvancedSetterOverlay per §6d) ───────────────────────────────────
//
// The LEFT-fan vertical carousel (mirrors TranspositionSetter's left name
// carousel: high values HIGH on screen, gentle tanh-x fan, active label
// biggest) previously lived inside GenerationAdvancedSetterOverlay. The
// PLAYBACK setter's volume + measures cells (#230a/c) need the exact same
// interaction, so the fan, its drag band, and its typography constants moved
// HERE — one source of truth; both overlays import them.
//
// New since the extraction:
//  - `labelFontFamily` — the volume fan renders Maestro dynamics glyphs.
//  - `compact` — render ONLY the active label at rest and fan the neighbours
//    out while dragging. The PLAYBACK grid has ten volume cells in adjacent
//    rows; ten permanent fans would overlap each other, so the fan appears
//    under the finger only (the §3a drag band stays permanent).

export const FAN_LABEL_FONT = "Georgia, 'Times New Roman', serif";
export const FAN_ACTIVE_LABEL_SIZE = 22;
export const FAN_ROW_H = 15;          // vertical spacing between fan rows
export const FAN_PX_PER_STEP = 16;    // drag sensitivity (px per index step)
const COLOR = 'var(--text-primary)';
const LOW = 'var(--text-lowlight)';
const SECONDARY = 'var(--text-secondary)';
const FIELD_LABEL_SIZE = 11;

// Field name below the staff (sans, --text-secondary, possibly multi-line).
export const FieldLabel = ({ cx, topY, lines }) => (
    (!lines || lines.length === 0) ? null : (
        <text x={cx} y={topY} textAnchor="middle" fontSize={FIELD_LABEL_SIZE} fontFamily="sans-serif"
            fill={SECONDARY} style={{ userSelect: 'none', pointerEvents: 'none' }}>
            {lines.map((ln, i) => (
                <tspan key={i} x={cx} dy={i === 0 ? 0 : FIELD_LABEL_SIZE + 1}>{ln}</tspan>
            ))}
        </text>
    )
);

// Shared invisible drag band + its §3a debug mirror.
export const DragBand = ({ x, y, w, h, bind, debugMode }) => (
    <>
        <rect x={x} y={y} width={w} height={h}
            fill="transparent" style={{ cursor: 'ns-resize', touchAction: 'none' }} {...bind} />
        {debugMode && (
            <rect x={x} y={y} width={w} height={h}
                fill="orange" fillOpacity={0.4} stroke="orange" strokeWidth={1}
                style={{ pointerEvents: 'none' }} />
        )}
    </>
);

// ── LEFT-fan carousel ────────────────────────────────────────────────────────
// High values sit HIGH on screen; drag UP increases the index (dirSign +1).
// `renderLabel(item)` → the text drawn per option.
//
// #430 (Han): two opt-in extensions.
//  - `invert` flips ONLY the drag/scroll DIRECTION (Han 2026-07-13 rework: "inverteer de scroll-
//    richting bij slepen" — NOT the visual layout). High values still sit HIGH on screen; dragging
//    DOWN now increases the value instead of decreasing it. Only the measures fan passes it.
//  - `renderNode(item, { active, size })` draws a custom SVG node per row (centred at the origin;
//    the fan applies the translate + opacity) instead of the default <text>. The repeats fan uses it
//    to render the canonical Maestro repeat glyphs (renderRepeatGlyph, §6d) rather than plain text.
export const LeftFanCarousel = ({
    cx, centerY, items, activeIndex, onCommit, renderLabel, fieldLines, debugMode,
    labelFontFamily = FAN_LABEL_FONT,
    activeLabelSize = FAN_ACTIVE_LABEL_SIZE,
    compact = false,
    bandW = 44,
    invert = false,
    renderNode = null,
}) => {
    const dir = invert ? -1 : 1;   // DRAG sign only (see #430 above) — layout is unchanged
    const { effIndex, dragging, bind } = useTangensDrag(activeIndex, items.length - 1, onCommit, FAN_PX_PER_STEP, dir);
    const rowsOut = [];
    for (let i = Math.floor(effIndex) - 4; i <= Math.ceil(effIndex) + 4; i++) {
        if (i < 0 || i > items.length - 1) continue;
        const off = i - effIndex;                 // off>0 = higher value
        const isActive = i === Math.round(effIndex);
        if (compact && !dragging && !isActive) continue; // rest state: active only
        const ry = centerY + 6 - off * FAN_ROW_H; // high value HIGH on screen (layout unchanged)
        const nx = cx + leftCurveX(off);
        const dist = Math.abs(off);
        const size = Math.max(8, activeLabelSize - dist * 2.0);
        const op = Math.max(0.18, (isActive ? 1 : 0.8) - dist * 0.12);
        rowsOut.push(
            renderNode ? (
                // data-fly: SELECTOR carousel — slides in note-by-note like the TranspositionSetter.
                <g key={i} data-fly="" transform={`translate(${nx} ${ry})`} opacity={op}
                    style={{ pointerEvents: 'none' }}>
                    {renderNode(items[i], { active: isActive, size })}
                </g>
            ) : (
                <text key={i} data-fly="" x={nx} y={ry} textAnchor="middle" fontFamily={labelFontFamily} fontSize={size}
                    fill={isActive ? COLOR : LOW} opacity={op} style={{ pointerEvents: 'none' }}>
                    {renderLabel(items[i])}
                </text>
            ),
        );
    }
    const bandH = dragging ? 150 : (compact ? 44 : 110);
    const bandTop = centerY + 6 - bandH / 2;
    return (
        <g>
            {rowsOut}
            <DragBand x={cx - bandW / 2} y={bandTop} w={bandW} h={bandH} bind={bind} debugMode={debugMode} />
            <FieldLabel cx={cx} topY={centerY + 50} lines={fieldLines} />
        </g>
    );
};

// ── BPM fan (#362, Han: "BPM als hidden vertical fan — ook in exercises") ────
// The BPM value becomes the same compact hidden fan as the volume cells: at
// rest only the Maestro numeral shows (visually identical to the old static
// .bpm-value display); dragging fans the neighbouring tempi out. Items are
// multiples of 5 across the range PLUS the exact current bpm — tap-tempo can
// land on any integer, and the at-rest label must always show the REAL value.
// Shared by BpmControls and the exercise TEMPO row so the two never drift (§6d).
export const BpmFan = ({ cx, centerY, bpm, min, max, onCommit, debugMode, activeLabelSize = 32 }) => {
    const cur = Math.round(bpm);
    const items = React.useMemo(() => {
        const vals = new Set([cur]);
        for (let v = Math.ceil(min / 5) * 5; v <= max; v += 5) vals.add(v);
        return [...vals].sort((a, b) => a - b);
    }, [cur, min, max]);
    return (
        <LeftFanCarousel
            cx={cx} centerY={centerY}
            items={items}
            activeIndex={items.indexOf(cur)}
            onCommit={(i) => onCommit(items[i])}
            renderLabel={(v) => String(v)}
            labelFontFamily="Maestro"
            activeLabelSize={activeLabelSize}
            compact
            bandW={56}
            debugMode={debugMode}
        />
    );
};
