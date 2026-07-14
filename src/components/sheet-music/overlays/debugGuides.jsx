import React from 'react';

// ── Alignment debug guides (#436, Han 2026-07-14) ─────────────────────────────────────────────────
//
// Han wants headers / glyphs / labels aligned CONSISTENTLY across every setter, and asked for
// horizontal debug lines (blue/red) to align against while iterating live. This shared component
// draws a full-width horizontal line per guide (with a tiny label) in the sheet SVG. Each setter
// renders it in debugMode at the Y positions it uses for its header / icon-top / icon-baseline /
// label so the lines can be compared across setters (open each setter and check the lines match).
//
// Convention: blue = the reference heights (from the colour setter for labels/notes, the instrument
// setter for the glyph); red = a setter's own actual heights when they are expected to match.
export const AlignmentGuides = ({ startX, endX, guides = [] }) => (
    <g style={{ pointerEvents: 'none' }} className="alignment-guides">
        {guides.map((g, i) => (g == null ? null : (
            <g key={i}>
                <line x1={startX} y1={g.y} x2={endX} y2={g.y}
                    stroke={g.color || 'var(--debug-align, #3b82f6)'} strokeWidth={0.5}
                    strokeDasharray="5,4" />
                {g.label && (
                    <text x={startX + 3} y={g.y - 1.5} fontSize={7} fontFamily="sans-serif"
                        fill={g.color || 'var(--debug-align, #3b82f6)'}>{g.label}</text>
                )}
            </g>
        )))}
    </g>
);

export default AlignmentGuides;
