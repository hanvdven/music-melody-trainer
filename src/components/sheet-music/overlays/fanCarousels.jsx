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
export const LeftFanCarousel = ({
    cx, centerY, items, activeIndex, onCommit, renderLabel, fieldLines, debugMode,
    labelFontFamily = FAN_LABEL_FONT,
    activeLabelSize = FAN_ACTIVE_LABEL_SIZE,
    compact = false,
    bandW = 44,
}) => {
    const { effIndex, dragging, bind } = useTangensDrag(activeIndex, items.length - 1, onCommit, FAN_PX_PER_STEP, 1);
    const rowsOut = [];
    for (let i = Math.floor(effIndex) - 4; i <= Math.ceil(effIndex) + 4; i++) {
        if (i < 0 || i > items.length - 1) continue;
        const off = i - effIndex;                 // off>0 = higher value
        const isActive = i === Math.round(effIndex);
        if (compact && !dragging && !isActive) continue; // rest state: active only
        const ry = centerY + 6 - off * FAN_ROW_H; // high value HIGH on screen
        const nx = cx + leftCurveX(off);
        const dist = Math.abs(off);
        const size = Math.max(8, activeLabelSize - dist * 2.0);
        const op = Math.max(0.18, (isActive ? 1 : 0.8) - dist * 0.12);
        rowsOut.push(
            // data-fly: SELECTOR carousel — slides in note-by-note like the TranspositionSetter (consistency).
            <text key={i} data-fly="" x={nx} y={ry} textAnchor="middle" fontFamily={labelFontFamily} fontSize={size}
                fill={isActive ? COLOR : LOW} opacity={op} style={{ pointerEvents: 'none' }}>
                {renderLabel(items[i])}
            </text>,
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
