import React from 'react';
import { BadgeCheck } from 'lucide-react';

// Shared option-card renderer for setting carousels (#266/#298, Han 2026-07-02).
// SINGLE SOURCE OF TRUTH (§6d) for how a carousel option looks: ALL-CAPS label,
// or the BadgeCheck 'until correct' icon for items flagged isUntil (Han asked
// for lucide star-check; it does not exist in the installed lucide version —
// BadgeCheck approved). Used by BOTH the exercise setter's axis carousels and
// the PLAYBACK repeats carousel, so the two can never drift.
//
// `baselineY` is the text baseline in the host's coordinate space; the icon is
// vertically centred on the same line. Active items are bright + glow (the
// app-wide setter highlight convention); inactive items are lowlit.
export const renderCarouselOptionGlyph = (item, active, baselineY) => {
    const color = active ? 'var(--text-primary)' : 'var(--text-lowlight)';
    return (
        <g style={{
            pointerEvents: 'none',
            color, // lucide strokes use currentColor
            filter: active ? `drop-shadow(0 0 3px ${color})` : 'none',
        }}>
            {item.isUntil ? (
                <BadgeCheck size={12} x={-6} y={baselineY - 10} />
            ) : (
                <text x={0} y={baselineY} textAnchor="middle" fontSize={8}
                    fontFamily="sans-serif" fontWeight={active ? 'bold' : 'normal'}
                    fill={color} letterSpacing={0.5}>
                    {item.label}
                </text>
            )}
        </g>
    );
};
