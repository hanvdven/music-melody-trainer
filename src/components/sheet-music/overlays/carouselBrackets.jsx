import React from 'react';

// ── Shared carousel "blokhaken" bracket geometry (#432 consolidation, Han 2026-07-14) ─────────────
//
// The dashed category/field bracket ( |———— LABEL ————| ) above a carousel was drawn by TWO copies
// of the SAME path formula — `CarouselFieldItem.buildBracket` (generation setters) and
// `InstrumentStaffOverlay.bracketGeom` (instrument/kit setters). They were byte-identical, so the
// geometry now lives here as ONE source of truth (§6c/§6d — the standing TODO in CarouselFieldItem).
// Consumers add their own colour + pin-to-edge logic on top of these paths.

// Path strings for a bracket spanning [x1, x2] at vertical `y`, with a gap in the middle for the
// UPPERCASE label. Returns the two <path> `d` strings + the label mid-x (pure geometry, no colour).
export const bracketPaths = (x1, x2, y, rawLabel) => {
    const label = String(rawLabel).toUpperCase();
    const mid = (x1 + x2) / 2;
    // Label half-width heuristic → leaves the centre gap so the line frames the text.
    const halfText = Math.min((x2 - x1) / 2 - 6, label.length * 3.4 + 4);
    return {
        label, mid,
        leftPath: `M ${x1} ${y + 6} V ${y} H ${mid - halfText}`,
        rightPath: `M ${mid + halfText} ${y} H ${x2} V ${y + 6}`,
    };
};

// Render one dashed bracket <g> (two paths + centred bold label). Style matches the instrument
// carousel brackets exactly: strokeWidth 1, dashed 4,3, bold 10px label. `geom` = { leftPath,
// rightPath, mid, y, label, color? }; colour defaults to --text-primary (category tints override).
export const BracketSvg = ({ geom }) => (
    <g style={{ pointerEvents: 'none' }}>
        <path d={geom.leftPath} stroke={geom.color || 'var(--text-primary)'} strokeWidth="1"
            fill="none" strokeDasharray="4,3" />
        <path d={geom.rightPath} stroke={geom.color || 'var(--text-primary)'} strokeWidth="1"
            fill="none" strokeDasharray="4,3" />
        <text x={geom.mid} y={geom.y} textAnchor="middle" dominantBaseline="middle"
            fontSize={10} fontFamily="sans-serif" fontWeight="bold" letterSpacing={1}
            fill={geom.color || 'var(--text-primary)'}>{geom.label}</text>
    </g>
);
