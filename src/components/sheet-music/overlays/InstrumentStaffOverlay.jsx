import React from 'react';
import NonLinearCarousel, { visibleRange, xOffsetForDist } from './NonLinearCarousel';
import {
    INSTRUMENT_LIST, getInstrumentIcon, ICON_ATTRIBUTION,
} from '../../../constants/instruments';

// ── In-staff INSTRUMENT selector (Han 2026-06-16, redesigned on the NonLinearCarousel
// primitive 2026-06-17) ──────────────────────────────────────────────────────────────
// Picks the PLAYBACK instrument PER STAFF (treble row → treble instrument, bass row → bass),
// shown ON the staff as a COMPACT centre-weighted carousel (~200px user-units wide so the
// treble + bass carousels can sit one above the other). The MIDDLE item is the selection;
// side items fade + shrink toward the edges. Tap a side item → it glides to centre + is
// selected; drag horizontally → the item that settles in the centre is selected.
//
// Layout per item (the visual-redesign "on the staff" idea, docs §37):
//   • the family ICON sits ON the staff (lucide placeholder, ~50% larger than the old 22 → 33);
//   • the instrument NAME sits BELOW the staff (<text>);
//   • a CATEGORY header (Keys / Strings / Winds / Tuned Percussion / Voice) sits ABOVE the
//     staff, styled like the 8va "blokhaken" bracket, shown only when 2+ of that category are
//     currently visible and centred over that category's visible run (see categoryHeaders).
//
// REUSE (§6c/§6d): the instrument list + family grouping + placeholder icons + attribution all
// live in `constants/instruments.jsx`; the bracket look is borrowed from the ottava marker
// (renderMelodyNotes, dashed line + end hooks, var(--text-primary)). Selecting reuses the
// existing setTrebleSettings/setBassSettings({...,instrument}) path via onSetInstrument.

// Icon ~50% larger than the previous 22 (Han 2026-06-17).
const ICON = 33;
// Per-item slot stride (user units). Widened +40% (Han 2026-06-17): the visible window is
// ~5 * BASE wide.
const BASE = 56;
// Vertical anchors relative to the staff top line (staff body spans staffStart..+40).
const ICON_DY = 4;        // icon sits centred on the staff body
const NAME_DY = 58;       // name below the bottom staff line
const HEADER_DY = -10;    // category bracket above the top staff line (lowered, Han 2026-06-17)
const HIT_TOP = -22;      // hit/debug box spans header..name
const HIT_H = 86;

// Build one [{ name, slug, family }] item list (flat, in group order) — the carousel order.
const ITEMS = INSTRUMENT_LIST;

// Dynamic CATEGORY headers (Han 2026-06-17): for the run of items currently visible around the
// centre, a header shows for each category that has 2+ visible items, CENTRED over that
// category's own visible run. When two categories are partly visible, BOTH headers show, each
// centred over its run. Computed from the COMMITTED centre (the resting carousel position) so
// the headers are stable; same `xOffsetForDist` the carousel uses, so they align.
const categoryHeaders = (activeIndex) => {
    const { lo, hi } = visibleRange(activeIndex, ITEMS.length);
    // Group the visible indices by their category label, preserving order.
    const runs = new Map();   // label → [indices]
    for (let i = lo; i <= hi; i += 1) {
        const label = ITEMS[i].groupLabel;
        if (!runs.has(label)) runs.set(label, []);
        runs.get(label).push(i);
    }
    const headers = [];
    for (const [label, idxs] of runs) {
        if (idxs.length < 2) continue;   // a header only shows for 2+ visible of that category
        // Bracket spans from the left edge of the first visible item to the right edge of the
        // last, in carousel-x (distance-from-centre → x via the shared layout fn).
        const leftD = (idxs[0] - activeIndex);
        const rightD = (idxs[idxs.length - 1] - activeIndex);
        const xLeft = xOffsetForDist(leftD) * BASE;
        const xRight = xOffsetForDist(rightD) * BASE;
        headers.push({ label, xLeft, xRight });
    }
    return headers;
};

// One staff's carousel + dynamic category brackets.
const StaffCarousel = ({ staff, staffStart, currentSlug, centerX, onSetInstrument, debugMode }) => {
    const activeIndex = Math.max(0, ITEMS.findIndex(it => it.slug === currentSlug));
    const headers = categoryHeaders(activeIndex);

    // Render ONE instrument item around the carousel origin (0,0): the carousel wrapper applies
    // translate+scale+opacity. Icon on the staff (currentColor inherited from the group color),
    // name below. SVG-NATIVE (no <foreignObject> — it doesn't composite with the morph group
    // opacity and broke the INSTRUMENT→COLOUR slide, Han 2026-06-17). The active item is bright
    // (--text-primary); others lowlit — same highlight convention as the other setters.
    const renderItem = (item, i) => {
        const active = i === activeIndex;
        const color = active ? 'var(--text-primary)' : 'var(--text-lowlight)';
        return (
            <g style={{ pointerEvents: 'none' }}>
                {/* lucide glyph as a nested <g> centred on the staff; inherits `currentColor`.
                    When icons8 <image> assets land this becomes an <image> — getInstrumentIcon
                    is the single swap point (constants/instruments). */}
                <g transform={`translate(${-ICON / 2}, ${staffStart + ICON_DY})`} style={{ color }}>
                    {getInstrumentIcon(item.slug, ICON)}
                </g>
                <text x={0} y={staffStart + NAME_DY} textAnchor="middle" fontSize={11}
                    fontFamily="sans-serif" fontWeight={active ? 'bold' : 'normal'} fill={color}>
                    {item.name}
                </text>
            </g>
        );
    };

    return (
        // data-fly wrapper so the WHOLE carousel slides in from the right as a unit when the
        // surface morphs in (mirrors the old strip's plain data-fly — no data-fly-from). The
        // category brackets stay UNtagged so they do the cascade's delayed fade.
        <g className="instrument-cards" data-fly="">
            {/* Category brackets ABOVE the staff — ottava "blokhaken" style (dashed horizontal
                line + short end hooks, var(--text-primary)), with the UPPERCASE category label
                centred on the line. UNtagged → delayed fade with the cascade. */}
            {headers.map((h) => {
                const y = staffStart + HEADER_DY;
                const x1 = centerX + h.xLeft - BASE * 0.42;   // a touch outside the first/last icon
                const x2 = centerX + h.xRight + BASE * 0.42;
                const mid = (x1 + x2) / 2;
                const label = h.label.toUpperCase();          // Unicode-safe (no accidentals here)
                // Gap in the middle of the bracket for the label (so the line frames the text):
                // |———— STRINGS ————|. Estimate the label half-width from its length.
                const halfText = Math.min((x2 - x1) / 2 - 6, label.length * 3.4 + 4);
                return (
                    <g key={h.label} style={{ pointerEvents: 'none' }}>
                        {/* left hook + dash up to the label */}
                        <path d={`M ${x1} ${y + 6} V ${y} H ${mid - halfText}`}
                            stroke="var(--text-primary)" strokeWidth="1" fill="none"
                            strokeDasharray="4,3" />
                        {/* right dash from the label + right hook */}
                        <path d={`M ${mid + halfText} ${y} H ${x2} V ${y + 6}`}
                            stroke="var(--text-primary)" strokeWidth="1" fill="none"
                            strokeDasharray="4,3" />
                        <text x={mid} y={y} textAnchor="middle" dominantBaseline="middle"
                            fontSize={10} fontFamily="sans-serif" fontWeight="bold"
                            letterSpacing={1} fill="var(--text-primary)">{label}</text>
                    </g>
                );
            })}
            <NonLinearCarousel
                items={ITEMS} activeIndex={activeIndex} renderItem={renderItem}
                centerX={centerX} y={staffStart + HIT_TOP} baseWidth={BASE} height={HIT_H}
                onSelect={(item) => onSetInstrument(staff, item.slug)}
                debugMode={debugMode} />
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

    // Compact carousel centred in the staff width. ~200px window → it sits comfortably; two
    // (treble + bass) are juxtaposed vertically on their own staves.
    const centerX = startX + (endX - startX) / 2;

    return (
        <g className="instrument-overlay" onClick={(e) => e.stopPropagation()}>
            {isTrebleVisible && (
                <StaffCarousel staff="treble" staffStart={trebleStart} currentSlug={trebleInstrument}
                    centerX={centerX} onSetInstrument={onSetInstrument} debugMode={debugMode} />
            )}
            {isBassVisible && (
                <StaffCarousel staff="bass" staffStart={bassStart} currentSlug={bassInstrument}
                    centerX={centerX} onSetInstrument={onSetInstrument} debugMode={debugMode} />
            )}
            {/* Attribution / licence line shown while the setter is open. UNtagged (no
                data-fly) so it does the cascade's delayed fade-in. Sits just below the
                bottom staff. TODO(icons8): ICON_ATTRIBUTION flips to the icons8 credit when
                real icons replace the lucide placeholders (see constants/instruments.js). */}
            <text x={startX} y={(isBassVisible ? bassStart : trebleStart) + 72}
                fontSize={9} fontFamily="sans-serif" fill="var(--text-dim, #888)"
                style={{ pointerEvents: 'none' }}>
                {ICON_ATTRIBUTION}
            </text>
        </g>
    );
};

export default InstrumentStaffOverlay;
