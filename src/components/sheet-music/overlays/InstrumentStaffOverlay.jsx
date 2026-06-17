import React from 'react';
import ClefCardCarousel from './ClefCardCarousel';
import {
    INSTRUMENT_GROUPS, getInstrumentIcon, ICON_ATTRIBUTION,
} from '../../../constants/instruments';

// ── In-staff INSTRUMENT selector (Han 2026-06-16) ───────────────────────────
// A sibling of the clef / range / colour setters: lets the user pick the PLAYBACK
// instrument PER STAFF (the treble row sets the treble instrument, the bass row sets
// the bass), shown ON the staff as a horizontally-scrollable strip of instrument
// cards (icon + name), GROUPED by instrument family. The SELECTED instrument is
// auto-centred and the rest scroll off-screen — both behaviours come for free from
// ClefCardCarousel (it auto-centres the active card and disambiguates tap-vs-drag),
// so this file is pure layout: it builds the card list and renders each card.
//
// REUSE (§6c/§6d): the instrument list, family grouping, placeholder icons and the
// attribution string all live in the shared `constants/instruments.js`; selecting an
// instrument reuses the existing setTrebleSettings/setBassSettings({...,instrument})
// path via the onSetInstrument callback. Nothing here special-cases an instrument.

// Card geometry. Instrument cards are wide enough for the icon + name; the
// non-tappable GROUP-LABEL cards between groups are narrower (just the family name)
// so the strip visibly reads as "grouped by type".
const CARD_W = 116;
const GROUP_W = 78;
const CARD_H = 56;
// Vertical placement of the card strip relative to the staff's top line: a little above
// so the cards sit centred over the 5-line staff body (staff spans staffStart..+40).
const STRIP_TOP_OFFSET = -8;

// Build the ordered card list for ONE staff: every instrument, group by group, with a
// non-tappable group-label separator card BEFORE each group. Returns the descriptor
// array ClefCardCarousel consumes (each card carries the extra fields renderCard needs).
const buildCards = (currentSlug, onTap) => {
    const cards = [];
    INSTRUMENT_GROUPS.forEach((group, gi) => {
        // Group-label/separator card — informational only, never selectable (no onTap →
        // ClefCardCarousel's tap router calls card.onTap?.() which is a no-op here).
        cards.push({
            key: `grouplabel-${group.label}`,
            type: 'group',
            label: group.label,
            // First group's label has no left divider (nothing precedes it).
            first: gi === 0,
            active: false,
        });
        group.items.forEach((it) => {
            cards.push({
                key: `inst-${it.slug}`,
                type: 'instrument',
                slug: it.slug,
                name: it.name,
                active: currentSlug === it.slug,
                onTap: () => onTap(it.slug),
            });
        });
    });
    return cards;
};

// One staff's scrollable instrument strip. `staff` is 'treble' | 'bass'; onSetInstrument
// is (staff, slug) => void wired to the matching settings setter in SheetMusic.
const StaffStrip = ({ staff, staffStart, currentSlug, startX, endX, onSetInstrument, debugMode }) => {
    const cards = buildCards(currentSlug, (slug) => onSetInstrument(staff, slug));
    // Per-card widths: instrument cards CARD_W, group labels GROUP_W. ClefCardCarousel
    // lays the strip out left→right at these widths and scrolls the overflow.
    const cardWidths = cards.map(c => (c.type === 'group' ? GROUP_W : CARD_W));

    // The strip spans the full staff body [startX..endX] like the other setters' carousels.
    const W = endX - startX;
    const VAR_X0 = startX + 0.04 * W;
    const VAR_X1 = startX + 0.96 * W;
    const viewWidth = VAR_X1 - VAR_X0;
    const y = staffStart + STRIP_TOP_OFFSET;

    // renderCard draws one card at absolute slotX (the carousel's strip <g> applies the
    // scroll offset on top). Active instrument = bright (--text-primary), others lowlit
    // (--text-lowlight) — same highlight convention as the clef/colour setters. Group
    // labels are a small caps separator, never highlighted.
    const renderCard = (card, slotX, i) => {
        const w = cardWidths[i];
        if (card.type === 'group') {
            return (
                <g style={{ pointerEvents: 'none' }}>
                    {/* Dashed divider before each group (except the first) — same dashed
                        separator idea as the colour-setter's set dividers. */}
                    {!card.first && (
                        <line x1={slotX + 2} y1={y + 6} x2={slotX + 2} y2={y + CARD_H - 6}
                            stroke="var(--text-dim, #555)" strokeWidth={0.5} strokeDasharray="2 3" />
                    )}
                    {/* Family name, vertically centred, dim — reads as the group header. */}
                    <text x={slotX + w / 2} y={y + CARD_H / 2} textAnchor="middle"
                        dominantBaseline="middle" fontSize={10} fontFamily="sans-serif"
                        fontWeight="bold" letterSpacing={0.5} fill="var(--text-dim, #888)">
                        {card.label.toUpperCase()}
                    </text>
                </g>
            );
        }
        const color = card.active ? 'var(--text-primary)' : 'var(--text-lowlight)';
        const cx = slotX + w / 2;
        const ICON = 22;
        // SVG-NATIVE card — NO <foreignObject> (fixes Han's bug 2026-06-17: INSTRUMENT→COLOUR
        // notes "just appear" instead of sliding). The instrument overlay was the ONLY overlay
        // rendered with foreignObject, and foreignObject HTML does NOT composite/fade with the
        // SVG group opacity during the enter/exit morph. Because this overlay is painted AFTER
        // the colour overlay (later sibling = on top), an exiting instrument→colour morph left the
        // foreignObject visible over the colour noteheads sliding in, hiding the slide until it
        // unmounted at the morph's end. Pure SVG fades cleanly like every other overlay. The
        // lucide glyph is a lucide <svg> nested via a translated <g> (it inherits `currentColor`
        // from the group's `color`); the name is a plain <text>. When the icons8 <image> assets
        // land, the nested <g> becomes an <image> — see getInstrumentIcon (constants/instruments).
        return (
            <g style={{ pointerEvents: 'none' }}>
                <g transform={`translate(${cx - ICON / 2}, ${y + 7})`} style={{ color }}>
                    {getInstrumentIcon(card.slug, ICON)}
                </g>
                <text x={cx} y={y + CARD_H - 9} textAnchor="middle" fontSize={10}
                    fontFamily="sans-serif" fontWeight={card.active ? 'bold' : 'normal'} fill={color}>
                    {card.name}
                </text>
            </g>
        );
    };

    return (
        // data-fly wrapper (mirrors ClefStaffOverlay's `clef-variant-cards data-fly`
        // block, WITHOUT the clef-variant-enter CSS class). Plain data-fly (NO
        // data-fly-from): the whole carousel — including its clip — slides in from the
        // RIGHT as a unit when the surface morphs in (flyDist). data-fly-from={startX}
        // would barely move a full-width strip (bbox.x ≈ startX), the "doesn't slide"
        // problem seen on the transposition setter. The attribution line + group labels
        // stay UNtagged so they do the cascade's delayed fade instead.
        <g className="instrument-cards" data-fly="">
            <ClefCardCarousel
                cards={cards} x0={VAR_X0} y={y} viewWidth={viewWidth} height={CARD_H}
                cardW={CARD_W} cardWidths={cardWidths}
                clipId={`instcards-${staff}`} renderCard={renderCard} />
            {debugMode && (
                // §3a: the carousel's drag/tap surface lives INSIDE ClefCardCarousel; this
                // rect visualises the strip's hit window (same x0/viewWidth as the carousel
                // surface) so debug mode shows where taps register.
                <rect x={VAR_X0} y={y} width={viewWidth} height={CARD_H}
                    fill="orange" fillOpacity={0.12} stroke="orange" strokeWidth={0.5}
                    style={{ pointerEvents: 'none' }} />
            )}
        </g>
    );
};

const InstrumentStaffOverlay = ({
    startX, endX,
    trebleStart, bassStart,
    isTrebleVisible, isBassVisible,
    trebleInstrument, bassInstrument,
    onSetInstrument,            // (staff, slug) => void
    debugMode = false,
}) => {
    if (startX == null || endX == null) return null;

    return (
        <g className="instrument-overlay" onClick={(e) => e.stopPropagation()}>
            {isTrebleVisible && (
                <StaffStrip staff="treble" staffStart={trebleStart} currentSlug={trebleInstrument}
                    startX={startX} endX={endX} onSetInstrument={onSetInstrument} debugMode={debugMode} />
            )}
            {isBassVisible && (
                <StaffStrip staff="bass" staffStart={bassStart} currentSlug={bassInstrument}
                    startX={startX} endX={endX} onSetInstrument={onSetInstrument} debugMode={debugMode} />
            )}
            {/* Attribution / licence line shown while the setter is open. UNtagged (no
                data-fly) so it does the cascade's delayed fade-in. Sits just below the
                bottom staff. TODO(icons8): ICON_ATTRIBUTION flips to the icons8 credit when
                real icons replace the lucide placeholders (see constants/instruments.js). */}
            <text x={startX} y={(isBassVisible ? bassStart : trebleStart) + 56}
                fontSize={9} fontFamily="sans-serif" fill="var(--text-dim, #888)"
                style={{ pointerEvents: 'none' }}>
                {ICON_ATTRIBUTION}
            </text>
        </g>
    );
};

export default InstrumentStaffOverlay;
