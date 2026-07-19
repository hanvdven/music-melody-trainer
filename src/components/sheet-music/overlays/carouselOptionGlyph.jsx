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

// #432 carousel-consistency (Han 2026-07-14): the active-card GLOW is removed everywhere — the
// bright colour (category tint / --text-primary) + bold weight mark the active item, matching the
// instrument cards (#361), the generation setter, and the repeats fan. No consumer draws a glow now.

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
        // #430 rework (Han: "haal de glow weg bij actieve setting"): NO active-glow on the repeat
        // glyph — the bright colour alone marks the active value (matches the instrument cards, #361).
        <g style={{
            pointerEvents: 'none',
            color,
        }}>
            {item.isUntil ? (
                // #494 rework (Han 2026-07-19: "revert … het enige dat ik vroeg is bij 'until correct'
                // een cursieve x … voeg toe 'x ×'"): 'until correct' = repeat an UNKNOWN number of
                // times → a cursive italic 'x' (the variable count, Academico Italic) followed by the
                // SAME Maestro 'À' repeat mark the numeric counts use. So it reads "x ×" in the sheet's
                // own repeat language, matching the Maestro numerals beside it.
                <text x={0} y={baselineY} textAnchor="middle" fontWeight="normal" fill={color}>
                    <tspan fontFamily="Academico" fontStyle="italic" fontSize={30}>x</tspan>
                    <tspan fontFamily="Maestro" fontSize={26} dx={5}>À</tspan>
                </text>
            ) : (
                <text x={0} y={baselineY} textAnchor="middle" fontFamily="Maestro"
                    /* #432 rework (Han 2026-07-14: "is repeats misschien bold face dat eruit ziet als
                       glow in maestro?") — YES: bold Maestro glyphs render as a heavier/glowing
                       stroke. Maestro glyphs MUST be normal weight (cf. StaffDurationNote); the bright
                       colour alone marks the active value. */
                    fontWeight="normal" fill={color}>
                    {/* #361 (Han): same Maestro size as the BPM display (.bpm-value = 32). The repeat
                        counts stay in MAESTRO (Han 2026-07-19 revert); only 'until correct' uses the
                        cursive x above. */}
                    {item.value === Infinity ? (
                        <tspan fontSize={26}>À</tspan>
                    ) : (
                        <>
                            <tspan fontSize={32}>{item.value}</tspan>
                            {/* #434 (Han): a wider gap between the number and the ×N repeat mark. */}
                            <tspan fontSize={26} dx={5}>À</tspan>
                        </>
                    )}
                </text>
            )}
        </g>
    );
};

/**
 * Mini END-REPEAT barline (#362, Han: "herhalingstekens naast de repeats-setter
 * bij repeats>1"). Same construction as BarlinesLayer's end-repeat sign —
 * Maestro 'k' dots + thin line + thick bar, in the same left-to-right order —
 * scaled down to a header-height hint. Shared by the PLAYBACK repeats setter
 * and the exercise REPEAT axis so the sign never drifts per consumer (§6d).
 * (x, y) = top of the THIN line; the thick bar sits right of it.
 */
export const MiniRepeatSign = ({ x = 0, y = 0, h = 24, color = 'var(--text-dim)' }) => (
    <g style={{ pointerEvents: 'none' }}>
        <text x={x - 6} y={y + h * 0.45} fontSize={h * 0.5} fontFamily="Maestro"
            fill={color} textAnchor="middle">k</text>
        <text x={x - 6} y={y + h * 0.7} fontSize={h * 0.5} fontFamily="Maestro"
            fill={color} textAnchor="middle">k</text>
        <path d={`M ${x} ${y} V ${y + h}`} stroke={color} strokeWidth="1" />
        <rect x={x + 3} y={y} width={2.5} height={h} fill={color} />
    </g>
);

export const renderCarouselOptionGlyph = (item, active, baselineY) => {
    const color = active ? 'var(--text-primary)' : 'var(--text-lowlight)';
    return (
        <g style={{
            pointerEvents: 'none',
            color, // lucide strokes use currentColor
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
