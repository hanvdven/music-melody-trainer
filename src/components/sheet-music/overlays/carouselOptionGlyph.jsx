import React from 'react';
import { BadgeCheck } from 'lucide-react';

// Shared option-card renderers for setting carousels (#266/#298, Han 2026-07).
// SINGLE SOURCE OF TRUTH (§6d) for how carousel cards look. Han 2026-07-03:
// the all-caps rule and the icon+text-below convention live HERE, in the shared
// layer — per-consumer renderItem code caused exactly the drift he flagged
// (colour setter labels not caps while the exercise setter's were).
//
// Two card shapes:
//  - renderCarouselOptionGlyph — COMPACT: caps text, or BadgeCheck for isUntil
//    items. Used where the carousel integrates into existing header chrome
//    (TEMPO at the BPM position, REPEAT at the repeat-sign position, PLAYBACK
//    repeats).
//  - renderStaffCardGlyph — STAFF-HEIGHT: a lucide icon as tall as the staff
//    with the ALL-CAPS label below it (Han: colour-setter height is the
//    reference, "plaatje + tekst eronder"). Used by the preset carousel and
//    the MELODY/INPUT axis carousels.
//
// Active cards are bright + glow; inactive lowlit (the app-wide setter
// highlight convention). All output is SVG-native (no foreignObject — it
// doesn't composite with the morph group opacity).

// Enforced here so no consumer can render a lowercase carousel label again.
const caps = (label) => (label == null ? '' : String(label).toUpperCase());

// Active-card glow — SINGLE SOURCE OF TRUTH (#163 rework, Han 2026-07-02:
// "highlight glow is more subtle (50%)", flagged as GLOBAL). One soft
// drop-shadow at half strength via color-mix (the app already relies on
// color-mix support — see chromatoneMix). Every carousel consumer imports
// this instead of composing its own drop-shadow chain.
export const activeGlowFilter = (color) =>
    `drop-shadow(0 0 3px color-mix(in srgb, ${color} 50%, transparent))`;

/**
 * Repeat-count option card (#298 rework, Han 2026-07-05: "herstel de originele
 * Maestro-weergave"). Repeats render EXACTLY like the sheet-music header's
 * RepeatsControls and the BPM display: Maestro font, `N À` (À = the Maestro
 * repeat glyph), ∞ = the bare À glyph, 'until correct' = BadgeCheck. Used by
 * EVERY surface that shows numRepeats as a carousel (PLAYBACK repeats + the
 * exercise REPEAT axis) so the notation font never drifts per consumer.
 */
export const renderRepeatGlyph = (item, active, baselineY) => {
    const color = active ? 'var(--text-primary)' : 'var(--text-lowlight)';
    return (
        <g style={{
            pointerEvents: 'none',
            color,
            filter: active ? activeGlowFilter(color) : 'none',
        }}>
            {item.isUntil ? (
                <BadgeCheck size={12} x={-6} y={baselineY - 10} />
            ) : (
                <text x={0} y={baselineY} textAnchor="middle" fontFamily="Maestro"
                    fontWeight={active ? 'bold' : 'normal'} fill={color}>
                    {/* #361 (Han): same Maestro size as the BPM display (.bpm-value = 32). */}
                    {item.value === Infinity ? (
                        <tspan fontSize={26}>À</tspan>
                    ) : (
                        <>
                            <tspan fontSize={32}>{item.value}</tspan>
                            <tspan fontSize={26}> À</tspan>
                        </>
                    )}
                </text>
            )}
        </g>
    );
};

export const renderCarouselOptionGlyph = (item, active, baselineY) => {
    const color = active ? 'var(--text-primary)' : 'var(--text-lowlight)';
    return (
        <g style={{
            pointerEvents: 'none',
            color, // lucide strokes use currentColor
            filter: active ? activeGlowFilter(color) : 'none',
        }}>
            {item.isUntil ? (
                <BadgeCheck size={12} x={-6} y={baselineY - 10} />
            ) : item.maestroGlyph ? (
                /* #361 (Han: tempo "moet zonder tekst kunnen") — a Maestro glyph
                   IS the option (♩ = fixed, T = rubato, matching BpmControls). */
                <text x={0} y={baselineY + 4} textAnchor="middle" fontSize={22}
                    fontFamily="Maestro" fill={color}>{item.maestroGlyph}</text>
            ) : (
                <text x={0} y={baselineY} textAnchor="middle" fontSize={8}
                    fontFamily="sans-serif" fontWeight={active ? 'bold' : 'normal'}
                    fill={color} letterSpacing={0.5}>
                    {caps(item.label)}
                </text>
            )}
        </g>
    );
};

/**
 * Staff-height card: icon spanning the five staff lines, ALL-CAPS label below.
 * `staffStart` = the host staff's top line; the icon fills the 40-unit staff
 * body (Han 2026-07-03: "maak de iconen zo hoog als een bladmuziekbalk,
 * tekst eronder" — the colour setter's card height is the reference).
 */
export const STAFF_CARD_ICON = 38;   // icon edge ≈ the 40-unit staff height
export const STAFF_CARD_LABEL_DY = 52; // label baseline below the staff body

export const renderStaffCardGlyph = (item, active, staffStart, { iconSize = STAFF_CARD_ICON } = {}) => {
    const color = active ? 'var(--text-primary)' : 'var(--text-lowlight)';
    const Icon = item.Icon;
    return (
        <g style={{
            pointerEvents: 'none',
            color,
            filter: active ? activeGlowFilter(color) : 'none',
        }}>
            {Icon && (
                <Icon size={iconSize} x={-iconSize / 2} y={staffStart + (40 - iconSize) / 2} />
            )}
            <text
                x={0} y={staffStart + STAFF_CARD_LABEL_DY} textAnchor="middle" fontSize={9}
                fontFamily="sans-serif" fontWeight={active ? 'bold' : 'normal'} fill={color}
                letterSpacing={0.5}>
                {caps(item.title ?? item.label)}
            </text>
        </g>
    );
};
