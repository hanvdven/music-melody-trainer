import React from 'react';
import NonLinearCarousel, { visibleRange, xOffsetForDist } from './NonLinearCarousel';
import {
    INSTRUMENT_LIST, getInstrumentIconUrl, getIconUrlByBasename, ICON_ATTRIBUTION, categoryColorVar,
} from '../../../constants/instruments';
import { PERCUSSION_KIT_CATEGORIES, percussionKitLabel } from '../../../audio/drumKits';

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

// Icon size. Was 33 (~50% larger than the original 22, Han 2026-06-17); ENLARGED +15% (Han
// 2026-06-22, Task E): 33 * 1.15 ≈ 37.95. Kept as `33 * 1.15` so the +15% intent is explicit and
// the base (33) is still visible for future tweaks. Card spacing (BASE) is unchanged — the larger
// icon (~38) still clears the BASE=56 slot stride comfortably, so no clipping.
const ICON = 33 * 1.15;
// Per-item slot stride (user units). Widened from 56 → 64 (Han #163): +14%, conservative step,
// multiple of 4 per design-principles §3. Adds a bit more breathing room between cards.
const BASE = 64;
// Vertical anchors relative to the staff top line (staff body spans staffStart..+40).
const ICON_DY = 4;        // icon sits centred on the staff body
const NAME_DY = 58;       // name below the bottom staff line
const HEADER_DY = -10;    // category bracket above the top staff line (lowered, Han 2026-06-17)
const HIT_TOP = -22;      // hit/debug box spans header..name
const HIT_H = 86;

// Build one [{ name, slug, family }] item list (flat, in group order) — the carousel order.
const ITEMS = INSTRUMENT_LIST;

// PERCUSSION-KIT carousel items (Han 2026-06-22, Task D). Flat list derived from
// PERCUSSION_KIT_CATEGORIES (drumKits.js — the SINGLE SOURCE, §6c). We include ONLY categories
// flagged `available` (currently Sampled + Drum machines): the GM "Acoustic MIDI" category is
// `available:false` because smplr has no working GM-percussion soundfont/mapping yet — offering
// silent kits would be a regression, so it is skipped here and surfaced as an honest gap (see
// GM_ACOUSTIC_KITS in drumKits.js + the report). Each item carries:
//   • id      — the value written to percussionSettings.instrument (matches useInstruments.js).
//   • family  — the kit CATEGORY (bracket header, e.g. 'Drum machines').
//   • icon    — icons8 basename for that category (drum-set / drums; synthesizer is placeholder).
// When the GM gap is closed (flip `available` in drumKits.js), those kits appear automatically.
const PERC_KIT_ITEMS = PERCUSSION_KIT_CATEGORIES
    .filter(cat => cat.available)
    .flatMap(cat => cat.kits.map(k => ({ id: k.id, family: cat.label, icon: cat.icon })));

// How many kits show each side of the centre. Fewer kits than instruments → a tighter window so
// the brackets sit close to the cards. Tunable (Han may widen).
const PERC_KIT_VISIBLE_HALF = 2;

// How many instruments show on EACH side of the centre → 7 visible total (Han 2026-06-19). This is
// passed BOTH to the carousel (`visibleHalf` prop) AND to the bracket geometry below (visibleRange
// + EDGE_X), so the category brackets span exactly the visible cards. The imported VISIBLE_HALF is
// only the carousel DEFAULT (2 → 5 visible, used by the colour carousel); here we override to 3.
const INSTRUMENT_VISIBLE_HALF = 3;

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
// GENERALISED (Han 2026-06-22, Task D): now takes the item list + a `groupOf(item)` accessor + the
// half-window, so the SAME bracket machinery drives BOTH the instrument carousel (items=INSTRUMENT_LIST,
// groupOf=it=>it.group) and the new percussion-KIT carousel (items=kit list, groupOf=it=>it.family).
const categoryHeaders = (pos, items = ITEMS, groupOf = (it) => it.group, half = INSTRUMENT_VISIBLE_HALF) => {
    const N = items.length;
    // Pass the 7-card half-window so the bracket visibility matches the widened carousel.
    const visible = visibleRange(pos, N, half);   // ordered, wrap-aware array of real indices
    const firstVis = visible[0];
    const lastVis = visible[visible.length - 1];
    const headers = [];
    let run = null;   // { label, firstIdx, lastIdx }
    const flush = () => {
        if (run && run.count >= 2) {
            // Pass `half` so the bracket x matches the carousel's NON-LINEAR layout exactly (Han
            // #163: xOffsetForDist now depends on the window half — the instrument carousel uses 3,
            // the kit carousel 2). Omitting it would default to VISIBLE_HALF(2) and the brackets
            // would drift off the wider 7-card instrument carousel.
            const xLeft = xOffsetForDist(signedDist(run.firstIdx, pos, N), half) * BASE;
            const xRight = xOffsetForDist(signedDist(run.lastIdx, pos, N), half) * BASE;
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
        // Bracket header = the item's group (via `groupOf`). For instruments that is `item.group`
        // (== the top category after the 2026-06-22 re-cat); for kits it is `item.family` (the kit
        // category: Sampled / Drum machines / …). Consecutive items sharing it get one bracket.
        const label = groupOf(items[idx]);
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
// centerX ± (visibleHalf + 0.5) * BASE). A pinned bracket end snaps to the SAME edge as the
// carousel. GENERALISED (Task D): a function of the window half so the narrower kit carousel pins
// to its own edge. The instrument carousel keeps its 7-card window (INSTRUMENT_VISIBLE_HALF).
const edgeXFor = (half) => (half + 0.5) * BASE;

// Build the SVG geometry for one bracket from its {label, xLeft, xRight, pinLeft, pinRight} + the
// staff/centre + the window edge (edgeX). Pure — used both for the initial React render (at rest)
// and the per-frame imperative update (during a gesture), so the two paths can never disagree.
const bracketGeom = (h, centerX, staffStart, edgeX) => {
    const y = staffStart + HEADER_DY;
    // Pinned ends snap to the fixed carousel edge (anti-jitter); free ends sit just outside the
    // first/last icon of the run.
    const x1 = h.pinLeft ? (centerX - edgeX) : (centerX + h.xLeft - BASE * 0.42);
    const x2 = h.pinRight ? (centerX + edgeX) : (centerX + h.xRight + BASE * 0.42);
    const mid = (x1 + x2) / 2;
    const label = h.label.toUpperCase();          // Unicode-safe (no accidentals here)
    // CATEGORY TINT (Han 2026-06-22, Task B): the bracket (both hook/dash paths + the label) takes
    // its top-category colour. h.label is the bracket's group === the top category, so
    // categoryColorVar maps it straight to its --cat-* var (§6c, no hardcoded table). Per §6d the
    // bracket KEEPS its weight (strokeWidth 1) + dash — only the colour changes from --text-primary
    // to the category var. Falls back to --text-primary for any unmapped category.
    const color = categoryColorVar(h.label, 'var(--text-primary)');
    // Gap in the middle of the bracket for the label (so the line frames the text):
    // |———— STRINGS ————|. Estimate the label half-width from its length.
    const halfText = Math.min((x2 - x1) / 2 - 6, label.length * 3.4 + 4);
    return {
        y, label, color,
        leftPath: `M ${x1} ${y + 6} V ${y} H ${mid - halfText}`,
        rightPath: `M ${mid + halfText} ${y} H ${x2} V ${y + 6}`,
        mid,
    };
};

// One carousel + dynamic category brackets. GENERALISED (Han 2026-06-22, Task D) so it drives BOTH
// the per-staff INSTRUMENT carousel and the PERCUSSION-KIT carousel. The instrument-specific bits
// (item list, how to read an item's id/label/group/icon/colour-category, the select handler) are
// now props with instrument defaults, so the percussion variant only passes a different item set +
// accessors — the bracket/cascade/§6 machinery is shared verbatim (§6d, no reimplementation).
const StaffCarousel = ({
    staffStart, centerX, debugMode,
    items = ITEMS,
    currentId,                                  // the active item's id (matched via idOf)
    idOf = (it) => it.slug,                      // instrument: slug; kit: id
    labelOf = (it) => it.name,                   // card label
    groupOf = (it) => it.group,                  // bracket category
    iconUrlOf = (it) => getInstrumentIconUrl(it.slug),
    colorCategoryOf = (it) => it.family,         // category → tint var
    onSelect,                                    // (item) => void
    // AUDIO PREVIEW (Han #163 Q1: "a" — fires on every carousel select / drag-settle).
    // Caller (InstrumentStaffOverlay) passes onPreview down from App via SheetMusic.
    onPreview,                                   // (item) => void, optional
    visibleHalf = INSTRUMENT_VISIBLE_HALF,
}) => {
    const edgeX = edgeXFor(visibleHalf);
    const activeIndex = Math.max(0, items.findIndex(it => idOf(it) === currentId));
    // At rest the brackets derive from the COMMITTED centre (stable). During a gesture they track
    // the LIVE pos via onPosChange → updateHeaders (imperative, §6).
    const headers = categoryHeaders(activeIndex, items, groupOf, visibleHalf);

    // Refs to each bracket slot's sub-elements so we can rewrite geometry imperatively each frame
    // without React re-rendering (§6 — per-frame visual writes via element.style / attributes).
    // Pre-populate the pool so the slot object exists BEFORE React runs the child (left/right/text)
    // ref callbacks — React fires refs bottom-up (children before their parent <g>), so the slot
    // must already be there when a child ref tries to attach itself.
    const slotRefs = React.useRef(null);
    if (slotRefs.current == null) {
        slotRefs.current = Array.from({ length: MAX_HEADERS }, () => ({}));
    }

    // Per-card refs for the LIVE glow + label tint (Han #163 D/E). Each card's inner <g> (cardG)
    // gets a coloured drop-shadow glow when it is the nearest-to-centre card; its label <text>
    // (cardLabel) is recoloured to the category tint + UPPERCASED. Driven imperatively from
    // onPosChange so the highlight follows the LIVE fractional centre during a drag (§6 — per-frame
    // visual writes via element.style / attributes, never React state which settles late).
    const cardRefs = React.useRef([]);
    // Resolve a card's category-tint CSS var once (used for both glow + label fill). Reuses
    // categoryColorVar (§6c — no slug→colour table) so colours match the brackets exactly.
    const cardColor = (item) => categoryColorVar(colorCategoryOf(item), 'var(--text-primary)');

    // Recompute brackets from a LIVE fractional pos and write them into the fixed slot pool. Slots
    // beyond the current header count are parked invisible. Geometry x is written via the path `d`
    // attribute + the label <text> position; visibility via the slot <g>'s style.opacity (§6).
    const updateHeaders = (pos) => {
        const hs = categoryHeaders(pos, items, groupOf, visibleHalf);
        for (let i = 0; i < MAX_HEADERS; i += 1) {
            const slot = slotRefs.current[i];
            if (!slot || !slot.g) continue;
            const h = hs[i];
            if (!h) { slot.g.style.opacity = '0'; continue; }   // unused slot → hidden
            const geom = bracketGeom(h, centerX, staffStart, edgeX);
            slot.g.style.opacity = '1';
            slot.left?.setAttribute('d', geom.leftPath);
            slot.right?.setAttribute('d', geom.rightPath);
            // CATEGORY TINT (Task B): the bracket's category can CHANGE between frames as runs
            // scroll, so the stroke/fill colour is rewritten imperatively here too (§6 — per-frame
            // visual writes), not only at the React-rendered rest state below.
            slot.left?.setAttribute('stroke', geom.color);
            slot.right?.setAttribute('stroke', geom.color);
            if (slot.text) {
                slot.text.setAttribute('x', String(geom.mid));
                slot.text.setAttribute('y', String(geom.y));
                slot.text.setAttribute('fill', geom.color);
                slot.text.textContent = geom.label;
            }
        }
    };

    // LIVE active-card highlight (Han #163 D/E): the card NEAREST the live fractional centre gets a
    // coloured GLOW (drop-shadow in its category tint) + its label recoloured to that tint and
    // UPPERCASED; every other card resets to the dim inactive look. Driven each frame from
    // onPosChange so the highlight tracks the drag, not the late-settling React `activeIndex` (§6 —
    // we write element.style / attributes directly, never setState per frame). The nearest card is
    // the wrapped round of pos, matching the carousel's own snap target.
    const updateActiveCard = (pos) => {
        const n = items.length;
        const nearest = ((Math.round(pos) % n) + n) % n;
        for (let i = 0; i < n; i += 1) {
            const c = cardRefs.current[i];
            if (!c || !c.cardG) continue;
            const active = i === nearest;
            const color = active ? cardColor(items[i]) : 'var(--text-lowlight)';
            // GLOW via CSS drop-shadow in the category var — CSS vars resolve inside drop-shadow().
            // Inactive cards clear the filter so only the centred card glows (Han: glow, not a box).
            c.cardG.style.filter = active
                ? `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 6px ${color})`
                : 'none';
            if (c.label) {
                c.label.setAttribute('fill', color);
                c.label.setAttribute('font-weight', active ? 'bold' : 'normal');
                // CAPS for the active label (Han #163 E2), normal case otherwise.
                c.label.textContent = active ? c.labelRaw.toUpperCase() : c.labelRaw;
            }
        }
    };

    // Combined per-frame handler fed to the carousel's onPosChange: brackets + active-card glow.
    const onPos = (pos) => { updateHeaders(pos); updateActiveCard(pos); };

    // When the gesture ends and the carousel re-settles on a committed index, React re-renders the
    // brackets from `activeIndex`. The last imperative `updateHeaders` write may have left a slot's
    // inline opacity in a transient state, so re-assert the AT-REST opacity here (used slot → 1,
    // unused → 0) to match the freshly-rendered `headers`. useLayout → before paint, every settle.
    // Omit headers from deps. `headers` is derived from activeIndex + pos (both captured refs),
    // so it changes whenever activeIndex changes. Including headers would cause the effect to
    // re-run twice per update (once when headers changes, once when activeIndex changes), causing
    // race flicker in the opacity animation. We only care about activeIndex; headers follows.
    React.useLayoutEffect(() => {
        for (let i = 0; i < MAX_HEADERS; i += 1) {
            const slot = slotRefs.current[i];
            if (slot?.g) slot.g.style.opacity = headers[i] ? '1' : '0';
        }
        // Re-assert the AT-REST active-card glow + label tint to match the committed activeIndex
        // (Han #163 D/E). The last imperative updateActiveCard write (during the gesture) may have
        // left the previously-active card glowing; re-running the same logic at the settled centre
        // clears stale state so only the committed selection glows. useLayout → before paint.
        updateActiveCard(activeIndex);
        // Omit headers array from deps: headers is computed deterministically from activeIndex
        // (the carousel's current selection). Depending on the array object itself would cause
        // unnecessary re-renders on every parent state change. The invariant is: opacity reflects
        // the selection; if activeIndex changes, the headers[i] values change with it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIndex]);

    // Render ONE instrument item around the carousel origin (0,0): the carousel wrapper applies
    // translate+scale+opacity. Icon on the staff (currentColor inherited from the group color),
    // name below. SVG-NATIVE (no <foreignObject> — it doesn't composite with the morph group
    // opacity and broke the INSTRUMENT→COLOUR slide, Han 2026-06-17). The active item is bright
    // (--text-primary); others lowlit — same highlight convention as the other setters.
    const renderItem = (item, i) => {
        const active = i === activeIndex;
        // CATEGORY TINT (Han 2026-06-22, Task B; Han #163 D/E): the ACTIVE card's name takes its
        // top-category colour (§6c — categoryColorVar, no slug→colour table); inactive cards stay
        // --text-lowlight. The REST-STATE values are React-rendered here from activeIndex; during a
        // gesture updateActiveCard rewrites them imperatively per frame (glow + tint follow the live
        // centre). The label below is CAPS when active (Han #163 E2).
        const color = active ? cardColor(item) : 'var(--text-lowlight)';
        const rawLabel = labelOf(item);
        return (
            // Inner <g> (cardG): the GLOW target (Han #163 D — coloured drop-shadow, NOT a box). At
            // rest the active card glows; updateActiveCard rewrites the filter live during a drag.
            <g ref={(el) => { (cardRefs.current[i] ||= {}).cardG = el;
                cardRefs.current[i].labelRaw = rawLabel; }}
                style={{
                    pointerEvents: 'none',
                    filter: active
                        ? `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 6px ${color})`
                        : 'none',
                }}>
                {/* icons8 PNG centred on the staff (Han 2026-06-17). SVG-native <image> so it
                    composites/fades with the morph group opacity (no <foreignObject>). The icons
                    are flat-black, so the theme filter (--instrument-icon-filter: invert on dark
                    themes) keeps them visible. iconUrlOf is the single swap point (instruments →
                    getInstrumentIconUrl(slug); kits → getIconUrlByBasename(category icon)). */}
                <image href={iconUrlOf(item)}
                    x={-ICON / 2} y={staffStart + ICON_DY} width={ICON} height={ICON}
                    style={{ filter: 'var(--instrument-icon-filter, none)' }} />
                <text ref={(el) => { (cardRefs.current[i] ||= {}).label = el; }}
                    x={0} y={staffStart + NAME_DY} textAnchor="middle" fontSize={11}
                    fontFamily="sans-serif" fontWeight={active ? 'bold' : 'normal'} fill={color}>
                    {active ? rawLabel.toUpperCase() : rawLabel}
                </text>
            </g>
        );
    };

    return (
        // PER-ELEMENT FLY-IN (Han 2026-06-19): the WHOLE carousel no longer flies as one unit.
        // The `data-fly` moved DOWN onto each individual card inside NonLinearCarousel, so the cards
        // now cascade in one-by-one from the right (leftmost lands first). This wrapper therefore
        // drops its `data-fly` — leaving it would double-translate every card. The category brackets
        // stay UNtagged so they still do the cascade's delayed fade.
        <g className="instrument-cards">
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
                const geom = h ? bracketGeom(h, centerX, staffStart, edgeX) : null;
                return (
                    <g key={i} ref={(g) => { slotRefs.current[i].g = g; }}
                        style={{ pointerEvents: 'none', opacity: geom ? 1 : 0 }}>
                        {/* left hook + dash up to the label. CATEGORY TINT (Task B): rest-state
                            colour = the category var (geom.color); §6d KEEPS weight (1) + dash. */}
                        <path ref={(el) => { if (slotRefs.current[i]) slotRefs.current[i].left = el; }}
                            d={geom ? geom.leftPath : ''}
                            stroke={geom ? geom.color : 'var(--text-primary)'} strokeWidth="1" fill="none"
                            strokeDasharray="4,3" />
                        {/* right dash from the label + right hook */}
                        <path ref={(el) => { if (slotRefs.current[i]) slotRefs.current[i].right = el; }}
                            d={geom ? geom.rightPath : ''}
                            stroke={geom ? geom.color : 'var(--text-primary)'} strokeWidth="1" fill="none"
                            strokeDasharray="4,3" />
                        <text ref={(el) => { if (slotRefs.current[i]) slotRefs.current[i].text = el; }}
                            x={geom ? geom.mid : 0} y={geom ? geom.y : 0}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize={10} fontFamily="sans-serif" fontWeight="bold"
                            letterSpacing={1} fill={geom ? geom.color : 'var(--text-primary)'}>{geom ? geom.label : ''}</text>
                    </g>
                );
            })}
            <NonLinearCarousel
                items={items} activeIndex={activeIndex} renderItem={renderItem}
                centerX={centerX} y={staffStart + HIT_TOP} baseWidth={BASE} height={HIT_H}
                onSelect={(item) => {
                    onSelect?.(item);
                    // AUDIO PREVIEW (Han #163 Q1: fires on every select — tap OR drag-settle).
                    // Fires after onSelect so the instrument state is updated before the preview plays.
                    onPreview?.(item);
                }}
                onPosChange={onPos}
                // 7 visible (3 each side + centre) for instruments — Han 2026-06-19 wanted more in
                // view. The kit carousel passes a smaller half (fewer kits). "Same card size,
                // wider": cards keep BASE width; the extra slots just fade at the edge (xOffset is
                // linear d=>d, so no overlap). §3a debug hit box is drawn inside NonLinearCarousel.
                visibleHalf={visibleHalf}
                debugMode={debugMode} />
        </g>
    );
};

// CHORD INSTRUMENT ROW (Han #163 AC3): flat item list for the chord track carousel.
// Uses the same ITEMS as the pitched staves (same GM Soundfont slug set) so the same
// instruments that work for treble/bass can be selected for chords. No per-consumer
// special-casing — the SAME StaffCarousel + ITEMS drives all four rows (§6d, §6c).
// Default instrument: acoustic_guitar_nylon (per defaultChordInstrumentSettings).
const DEFAULT_CHORD_INSTRUMENT = 'acoustic_guitar_nylon';

const InstrumentStaffOverlay = ({
    startX, endX,
    trebleStart, bassStart, percussionStart,
    isTrebleVisible, isBassVisible, isPercussionVisible = false,
    trebleInstrument, bassInstrument,
    percussionKit,              // percussionSettings.instrument (the active kit id)
    // CHORD INSTRUMENT ROW (Han #163 AC3): always visible in all settings views.
    chordInstrument,            // chordSettings.instrument (the active chord instrument slug)
    onSetChordInstrument,       // (slug) => void
    onSetInstrument,            // (staff, slug) => void
    onSetPercussionKit,         // (kitId) => void
    // AUDIO PREVIEW (Han #163 AC2 + Q1: fires on carousel select — drag settle OR tap).
    // App provides this callback; it plays a 2x-speed scale or percussion pattern for the item.
    onPreviewInstrument,        // (staff, slug) => void, optional
    debugMode = false,
}) => {
    if (startX == null || endX == null) return null;

    // Compact carousel centred in the staff width. ~200px window → it sits comfortably; two
    // (treble + bass) are juxtaposed vertically on their own staves.
    const centerX = startX + (endX - startX) / 2;

    // The attribution line sits under the bottom-most visible carousel. Percussion is below bass,
    // bass below treble — pick the lowest visible staff start. The chord row sits below all of
    // them, always visible (Han #163 Q3 correction: chord row always visible in all settings).
    const bottomStart = isPercussionVisible && percussionStart != null ? percussionStart
        : isBassVisible ? bassStart : trebleStart;

    // CHORD ROW PLACEMENT (Han #163 F): previously the chord carousel was jammed just below the
    // attribution text (bottomStart + NAME_DY + 13 + 20), so it sat cramped under the last staff's
    // NAME row instead of reading as its OWN row. Fix: place it ONE STAFF STRIDE below the bottom
    // staff — the SAME spacing the real staves use among themselves (§6c — derive the stride from
    // the existing layout, don't hardcode). The stride is read from the gap between two adjacent
    // VISIBLE staves; if only one staff is visible we fall back to a sensible content-height stride
    // (the per-staff carousel content spans ~NAME_DY+attribution below its staffStart).
    const staffStride = (() => {
        if (isPercussionVisible && isBassVisible && percussionStart != null) return percussionStart - bassStart;
        if (isBassVisible && isTrebleVisible) return bassStart - trebleStart;
        if (isPercussionVisible && isTrebleVisible && percussionStart != null) return percussionStart - trebleStart;
        // Single-staff fallback: one carousel's full content height + a small gap. NAME_DY (58) is
        // the name row; +13 attribution; +20 breathing gap — matches the old offset magnitude so a
        // single-staff layout keeps a comparable chord-row position.
        return NAME_DY + 13 + 20;
    })();
    const chordCarouselStart = bottomStart + staffStride;

    return (
        <g className="instrument-overlay" onClick={(e) => e.stopPropagation()}>
            {isTrebleVisible && (
                <StaffCarousel staffStart={trebleStart} currentId={trebleInstrument}
                    centerX={centerX} onSelect={(item) => onSetInstrument('treble', item.slug)}
                    onPreview={(item) => onPreviewInstrument?.('treble', item.slug)}
                    debugMode={debugMode} />
            )}
            {isBassVisible && (
                <StaffCarousel staffStart={bassStart} currentId={bassInstrument}
                    centerX={centerX} onSelect={(item) => onSetInstrument('bass', item.slug)}
                    onPreview={(item) => onPreviewInstrument?.('bass', item.slug)}
                    debugMode={debugMode} />
            )}
            {/* PERCUSSION-KIT carousel (Han 2026-06-22, Task D): same NonLinearCarousel + bracket
                style as the instrument carousels (reuse, §6d), but the items are drum KITS grouped
                by kit CATEGORY, and selecting one writes percussionSettings.instrument via
                onSetPercussionKit (the SAME setter path the app already uses). The card label is
                the kit's short name; the icon is the category's icons8 art; the bracket header is
                the category. */}
            {isPercussionVisible && percussionStart != null && (
                <StaffCarousel staffStart={percussionStart}
                    items={PERC_KIT_ITEMS}
                    currentId={percussionKit}
                    idOf={(it) => it.id}
                    labelOf={(it) => percussionKitLabel(it.id)}
                    groupOf={(it) => it.family}
                    iconUrlOf={(it) => getIconUrlByBasename(it.icon)}
                    colorCategoryOf={(it) => it.family}
                    visibleHalf={PERC_KIT_VISIBLE_HALF}
                    centerX={centerX} onSelect={(item) => onSetPercussionKit?.(item.id)}
                    onPreview={(item) => onPreviewInstrument?.('percussion', item.id)}
                    debugMode={debugMode} />
            )}
            {/* icons8 attribution/licence (MANDATORY) — centred DIRECTLY BELOW the (bottom) carousel
                (Han 2026-06-17), just under its name row. UNtagged (no data-fly) so it does the
                cascade's delayed fade-in. */}
            <text x={centerX} y={bottomStart + NAME_DY + 13}
                textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="var(--text-dim, #888)"
                style={{ pointerEvents: 'none' }}>
                {ICON_ATTRIBUTION}
            </text>
            {/* CHORD INSTRUMENT ROW (Han #163 AC3): always visible — the chord staff carousel sits
                below the attribution line, regardless of chord-staff visibility. Han Q3 correction:
                "chord row altijd zichtbaar in alle settings". Uses the same ITEMS + StaffCarousel
                as the other rows (§6d, no per-row hacks). A "Chords" label sits above it. */}
            <text x={centerX} y={chordCarouselStart - 6}
                textAnchor="middle" fontSize={9} fontFamily="sans-serif" fontWeight="bold"
                fill="var(--text-secondary, #888)" style={{ pointerEvents: 'none' }}>
                CHORDS
            </text>
            <StaffCarousel
                staffStart={chordCarouselStart}
                currentId={chordInstrument || DEFAULT_CHORD_INSTRUMENT}
                centerX={centerX}
                onSelect={(item) => onSetChordInstrument?.(item.slug)}
                onPreview={(item) => onPreviewInstrument?.('chords', item.slug)}
                debugMode={debugMode} />
        </g>
    );
};

export default InstrumentStaffOverlay;
