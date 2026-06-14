import React from 'react';

/**
 * DisableCross — the shared "disable / off" cross used by every in-staff setter:
 * the clef-family OFF option, the percussion OFF option, and the chord-row OFF
 * option. Previously each surface drew its own cross with slightly different size,
 * anchor and proportions, so they looked inconsistent (Han BUG-V1, 2026-06-08).
 * One source guarantees they read identically: START-aligned at `x`, 2× taller than
 * wide, strokeWidth 2.4, round caps.
 *
 * Props:
 *  - x:      left edge of the cross (SVG units).
 *  - topY:   top edge (the cross spans topY … topY + height).
 *  - width/height:  defaults 18 × 36 (the staff-clef OFF geometry); pass to override.
 *  - color:  stroke colour (active = --text-primary, passive = a lowlight token).
 */
export default function DisableCross({ x, topY, width = 18, height = 36, color }) {
    return (
        <g stroke={color} strokeWidth={2.4} strokeLinecap="round" style={{ pointerEvents: 'none' }}>
            <path d={`M ${x} ${topY} L ${x + width} ${topY + height}`} />
            <path d={`M ${x + width} ${topY} L ${x} ${topY + height}`} />
        </g>
    );
}
