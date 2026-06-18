import React from 'react';
import NonLinearCarousel, { visibleRange, xOffsetForDist, VISIBLE_HALF } from './NonLinearCarousel';
import {
    INSTRUMENT_LIST, getInstrumentIconUrl, ICON_ATTRIBUTION,
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

// NEAREST signed distance from a fractional centre `pos` to item index `i` on the cyclical ring,
// matching NonLinearCarousel.signedDist exactly so brackets align with the items pixel-for-pixel.
// (Kept local — it's a one-line wrap formula, not worth a cross-module export.)
const signedDist = (i, pos, n) => ((i - pos + n / 2 + n) % n) - n / 2;

// Dynamic CATEGORY headers (Han 2026-06-17): for the items currently visible around the centre,
// a bracket shows for each consecutive same-category RUN that has 2+ visible items, spanning that
// run. CYCLICAL + LIVE (Han 2026-06-17): `pos` is the FRACTIONAL live carousel centre (wrapped),
// and `visibleRange` now returns the visible item indices in left→right VISUAL order, wrapping
// across the N-1 → 0 seam. We walk that ordered list, group CONSECUTIVE items sharing a category
// (so the same category appearing on both sides of the seam stays two separate visual runs), and
// bracket each run of 2+. Each run's x-span uses the shared `xOffsetForDist(signedDist(...))` the
// carousel itself uses, so brackets track the items as `pos` moves during a drag.
const categoryHeaders = (pos) => {
    const N = ITEMS.length;
    const visible = visibleRange(pos, N);   // ordered, wrap-aware array of real indices
    const firstVis = visible[0];
    const lastVis = visible[visible.length - 1];
    const headers = [];
    let run = null;   // { label, firstIdx, lastIdx }
    const flush = () => {
        if (run && run.count >= 2) {
            const xLeft = xOffsetForDist(signedDist(run.firstIdx, pos, N)) * BASE;
            const xRight = xOffsetForDist(signedDist(run.lastIdx, pos, N)) * BASE;
            // PIN-TO-EDGE (Han 2026-06-17, anti-jitter): when this run's outer item IS the
            // outermost-visible item, its computed x jitters as it shrinks/fades scrolling off.
            // Flag it so bracketGeom pins that end to the FIXED carousel edge instead.
            headers.push({
                label: run.label, xLeft, xRight,
                pinLeft: run.firstIdx === firstVis,
                pinRight: run.lastIdx === lastVis,
            });
        }
    };
    for (const idx of visible) {
        // Bracket header = the item's `group` ("family (subgroup)", e.g. 'strings (guitar)'), NOT
        // the bare top-level category. WHY (Han 2026-06-18): Han split the label so the bracket
        // carries family+subgroup and the card carries just the variant; consecutive same-`group`
        // items get one bracket. (The card itself renders item.name — see renderItem below.)
        const label = ITEMS[idx].group;
        if (run && run.label === label) {
            run.lastIdx = idx; run.count += 1;          // extend the current consecutive run
        } else {
            flush();                                    // close the previous run, start a new one
            run = { label, firstIdx: idx, lastIdx: idx, count: 1 };
        }
    }
    flush();
    // Two brackets with the SAME label can arise when a category straddles the seam (visually two
    // separate runs); key collisions are avoided downstream by indexing on position, not label.
    return headers;
};

// At most this many category brackets can be visible at once (the ~5-item window spans at most a
// few categories). We render a FIXED pool of this many bracket <g> slots and drive them
// imperatively each frame (§6) rather than re-rendering React per drag frame.
const MAX_HEADERS = 4;

// Half-width of the carousel's visible window (matches NonLinearCarousel's hit surface:
// centerX ± (VISIBLE_HALF + 0.5) * BASE). A pinned bracket end snaps to centerX ± EDGE_X.
const EDGE_X = (VISIBLE_HALF + 0.5) * BASE;

// Build the SVG geometry for one bracket from its {label, xLeft, xRight, pinLeft, pinRight} + the
// staff/centre. Pure — used both for the initial React render (at rest) and the per-frame
// imperative update (during a gesture), so the two paths can never disagree.
const bracketGeom = (h, centerX, staffStart) => {
    const y = staffStart + HEADER_DY;
    // Pinned ends snap to the fixed carousel edge (anti-jitter); free ends sit just outside the
    // first/last icon of the run.
    const x1 = h.pinLeft ? (centerX - EDGE_X) : (centerX + h.xLeft - BASE * 0.42);
    const x2 = h.pinRight ? (centerX + EDGE_X) : (centerX + h.xRight + BASE * 0.42);
    const mid = (x1 + x2) / 2;
    const label = h.label.toUpperCase();          // Unicode-safe (no accidentals here)
    // Gap in the middle of the bracket for the label (so the line frames the text):
    // |———— STRINGS ————|. Estimate the label half-width from its length.
    const halfText = Math.min((x2 - x1) / 2 - 6, label.length * 3.4 + 4);
    return {
        y, label,
        leftPath: `M ${x1} ${y + 6} V ${y} H ${mid - halfText}`,
        rightPath: `M ${mid + halfText} ${y} H ${x2} V ${y + 6}`,
        mid,
    };
};

// One staff's carousel + dynamic category brackets.
const StaffCarousel = ({ staff, staffStart, currentSlug, centerX, onSetInstrument, debugMode }) => {
    const activeIndex = Math.max(0, ITEMS.findIndex(it => it.slug === currentSlug));
    // At rest the brackets derive from the COMMITTED centre (stable). During a gesture they track
    // the LIVE pos via onPosChange → updateHeaders (imperative, §6).
    const headers = categoryHeaders(activeIndex);

    // Refs to each bracket slot's sub-elements so we can rewrite geometry imperatively each frame
    // without React re-rendering (§6 — per-frame visual writes via element.style / attributes).
    // Pre-populate the pool so the slot object exists BEFORE React runs the child (left/right/text)
    // ref callbacks — React fires refs bottom-up (children before their parent <g>), so the slot
    // must already be there when a child ref tries to attach itself.
    const slotRefs = React.useRef(null);
    if (slotRefs.current == null) {
        slotRefs.current = Array.from({ length: MAX_HEADERS }, () => ({}));
    }

    // Recompute brackets from a LIVE fractional pos and write them into the fixed slot pool. Slots
    // beyond the current header count are parked invisible. Geometry x is written via the path `d`
    // attribute + the label <text> position; visibility via the slot <g>'s style.opacity (§6).
    const updateHeaders = (pos) => {
        const hs = categoryHeaders(pos);
        for (let i = 0; i < MAX_HEADERS; i += 1) {
            const slot = slotRefs.current[i];
            if (!slot || !slot.g) continue;
            const h = hs[i];
            if (!h) { slot.g.style.opacity = '0'; continue; }   // unused slot → hidden
            const geom = bracketGeom(h, centerX, staffStart);
            slot.g.style.opacity = '1';
            slot.left?.setAttribute('d', geom.leftPath);
            slot.right?.setAttribute('d', geom.rightPath);
            if (slot.text) {
                slot.text.setAttribute('x', String(geom.mid));
                slot.text.setAttribute('y', String(geom.y));
                slot.text.textContent = geom.label;
            }
        }
    };

    // When the gesture ends and the carousel re-settles on a committed index, React re-renders the
    // brackets from `activeIndex`. The last imperative `updateHeaders` write may have left a slot's
    // inline opacity in a transient state, so re-assert the AT-REST opacity here (used slot → 1,
    // unused → 0) to match the freshly-rendered `headers`. useLayout → before paint, every settle.
    React.useLayoutEffect(() => {
        for (let i = 0; i < MAX_HEADERS; i += 1) {
            const slot = slotRefs.current[i];
            if (slot?.g) slot.g.style.opacity = headers[i] ? '1' : '0';
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIndex]);

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
                {/* icons8 PNG centred on the staff (Han 2026-06-17). SVG-native <image> so it
                    composites/fades with the morph group opacity (no <foreignObject>). The icons
                    are flat-black, so the theme filter (--instrument-icon-filter: invert on dark
                    themes) keeps them visible. getInstrumentIconUrl is the single swap point. */}
                <image href={getInstrumentIconUrl(item.slug)}
                    x={-ICON / 2} y={staffStart + ICON_DY} width={ICON} height={ICON}
                    style={{ filter: 'var(--instrument-icon-filter, none)' }} />
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
                centred on the line. UNtagged → delayed fade with the cascade.

                A FIXED POOL of MAX_HEADERS slots: at rest each slot is initialised from the
                committed `headers` array (React render); during a gesture `updateHeaders` rewrites
                each slot's geometry imperatively each frame (§6). Slots beyond the live header
                count are parked transparent. Keys are by SLOT INDEX (stable, never collide even
                when two same-label brackets straddle the seam). */}
            {Array.from({ length: MAX_HEADERS }).map((_, i) => {
                const h = headers[i];
                const geom = h ? bracketGeom(h, centerX, staffStart) : null;
                return (
                    <g key={i} ref={(g) => { slotRefs.current[i].g = g; }}
                        style={{ pointerEvents: 'none', opacity: geom ? 1 : 0 }}>
                        {/* left hook + dash up to the label */}
                        <path ref={(el) => { if (slotRefs.current[i]) slotRefs.current[i].left = el; }}
                            d={geom ? geom.leftPath : ''}
                            stroke="var(--text-primary)" strokeWidth="1" fill="none"
                            strokeDasharray="4,3" />
                        {/* right dash from the label + right hook */}
                        <path ref={(el) => { if (slotRefs.current[i]) slotRefs.current[i].right = el; }}
                            d={geom ? geom.rightPath : ''}
                            stroke="var(--text-primary)" strokeWidth="1" fill="none"
                            strokeDasharray="4,3" />
                        <text ref={(el) => { if (slotRefs.current[i]) slotRefs.current[i].text = el; }}
                            x={geom ? geom.mid : 0} y={geom ? geom.y : 0}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize={10} fontFamily="sans-serif" fontWeight="bold"
                            letterSpacing={1} fill="var(--text-primary)">{geom ? geom.label : ''}</text>
                    </g>
                );
            })}
            <NonLinearCarousel
                items={ITEMS} activeIndex={activeIndex} renderItem={renderItem}
                centerX={centerX} y={staffStart + HIT_TOP} baseWidth={BASE} height={HIT_H}
                onSelect={(item) => onSetInstrument(staff, item.slug)}
                onPosChange={updateHeaders}
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
            {/* icons8 attribution/licence (MANDATORY) — centred DIRECTLY BELOW the (bottom) carousel
                (Han 2026-06-17), just under its name row. UNtagged (no data-fly) so it does the
                cascade's delayed fade-in. */}
            <text x={centerX} y={(isBassVisible ? bassStart : trebleStart) + NAME_DY + 13}
                textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="var(--text-dim, #888)"
                style={{ pointerEvents: 'none' }}>
                {ICON_ATTRIBUTION}
            </text>
        </g>
    );
};

export default InstrumentStaffOverlay;
