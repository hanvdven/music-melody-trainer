import React from 'react';

/**
 * NonLinearCarousel — a compact, centre-weighted item carousel (Han 2026-06-17).
 *
 * Built as a SHARED primitive (Han confirmed: reusable; used by BOTH the instrument and
 * the colour setters now, intended for transposition / range later). Unlike
 * `ClefCardCarousel` (a flat left→right strip that scrolls), this carousel is NON-LINEAR:
 * it shows ~5 items at once and the MIDDLE slot is the active/selected one. Items to the
 * sides FADE OUT and SHRINK progressively toward the edges (an eased, symmetric falloff by
 * distance from centre), so the carousel reads as a focused "wheel" rather than a list.
 *
 * Selection (Han): BOTH click and drag.
 *   • TAP a side item  → it glides to the centre and becomes selected (animate the centre
 *     index like ClefCardCarousel's centre-glide).
 *   • DRAG horizontally → items move through the centre; whichever item is centred when the
 *     gesture SETTLES is committed as the selection (snap to nearest, then onSelect).
 *
 * Gesture handling (tap-vs-drag disambiguation + client-px → SVG-user conversion via the
 * owning <svg>'s screen CTM) is borrowed verbatim from ClefCardCarousel so the finger
 * tracks 1:1 regardless of viewBox scale.
 *
 * §6 invariant: ALL per-item opacity / scale / x are written via `element.style` inside the
 * rAF render pass (never JSX props), and reset on cancel/unmount so the morph + scroll/wipe
 * systems own those properties again afterwards.
 *
 * Props:
 *  - items:        array of descriptors; identity by index (active marked via `activeIndex`).
 *  - activeIndex:  index of the currently-selected item (the centre at rest).
 *  - renderItem:   (item, index) => SVG node, drawn UNTRANSFORMED at the origin; the carousel
 *                  wraps each in a <g> and applies translate(x)+scale(s)+opacity per frame.
 *  - centerX, y:   centre of the carousel in SVG user units (items fan out around centerX).
 *  - baseWidth:    per-item slot stride (user units) at full scale — the spacing between
 *                  adjacent items at the centre.
 *  - height:       hit-surface / debug-box height.
 *  - onSelect:     (item, index) => void, fired on tap-to-centre or drag-settle commit.
 *  - onPosChange:  (pos) => void, OPTIONAL, fired every rAF/drag frame with the LIVE fractional
 *                  centre position (wrapped domain). Used by the instrument setter to move its
 *                  category brackets WITH the carousel during a gesture (§6 — the consumer writes
 *                  element.style itself; this is just the per-frame signal).
 *  - debugMode:    §3a — draw the drag/tap hit box.
 *
 * CYCLICAL (Han 2026-06-17): the carousel LOOPS infinitely — dragging past the last item wraps
 * to the first and vice-versa, no hard clamp at the ends. `posRef` is a FREE fractional value
 * kept in the wrapped domain [0, N); for rendering, each item is drawn at its NEAREST signed
 * distance from the centre so the item set wraps around the centre seamlessly.
 */

const TAP_SLOP = 5;                 // < this much movement (user units) = a tap (matches ClefCardCarousel)
// DEFAULT half-window: render this many items on EACH side of the centre (~5 total). This is now
// only the DEFAULT — the count is a prop (`visibleHalf`) so a consumer can widen the window (Han
// 2026-06-19: the instrument carousel passes 3 → 7 visible; the colour carousel keeps the default
// 2). The exported `visibleRange` / `xOffsetForDist` helpers still use this constant for the
// default-window consumers (the instrument setter's brackets pass the same 3 they give the
// carousel, see InstrumentStaffOverlay).
const VISIBLE_HALF = 2;
const CENTER_ANIM_MS = 420;         // glide-to-centre duration (tap or settle snap)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
const easeInOut = (t) => t * t * (3 - 2 * t);   // smoothstep — matches the app's other eases

// Wrap a fractional position into [0, N). Used everywhere posRef is read so the cyclical domain
// stays canonical (the seam N-1 → 0 is invisible).
const wrapPos = (p, n) => ((p % n) + n) % n;

// NEAREST signed distance from the centre `pos` to item index `i`, accounting for the wrap: an
// item near index 0 is drawn just to the RIGHT of an item near index N-1 (and vice-versa), so the
// ring of items loops smoothly. Result is in (-N/2, N/2].
const signedDist = (i, pos, n) => ((i - pos + n / 2 + n) % n) - n / 2;

// ── NON-LINEAR FALLOFF — AUTHORITATIVE CURVE CONSTANTS (Han #163 rework, 2026-06-27) ────────────
// The carousel is a centre-weighted "wheel" again (the 2026-06-18 flatten — scale≡1, x≡d — read as
// a flat even strip with no edge cue, UAT "no spacing impact"). These constants are the SINGLE
// SOURCE OF TRUTH for the look; ALL three consumers (instrument, colour, generation) inherit them
// (§6c/§6d — no per-overlay copies). Targets, from the ticket `interviews` field (Han, authoritative):
//   centre (d=0) → visible-window EDGE (d=edge) → the ONE overflow element just past the edge.
//   SIZE:    100% → 70% at edge → ~50% overflow
//   SPACING: 100% → 70% at edge → 40% overflow (per-step gap, integrated into x)
//   OPACITY: 100% → 50% at edge → 30% overflow → hard cut (0) beyond.
// Falloff is EASED (smoothstep), not linear. Exactly ONE element renders past the visible edge,
// then a hard cut. An additional SVG edge mask (EDGE_MASK_FRAC) ramps the outer 5% to 50%.
const SIZE_EDGE      = 0.70;   // card scale at the visible-window edge
const SIZE_OVERFLOW  = 0.50;   // card scale of the single peeking overflow element
const GAP_CENTER     = 1.00;   // per-step horizontal gap at the centre (× baseWidth)
const GAP_EDGE       = 0.70;   // per-step gap at the visible-window edge
const GAP_OVERFLOW   = 0.40;   // per-step gap for the overflow step (edge → edge+1)
const OPACITY_EDGE     = 0.50; // opacity at the visible-window edge
const OPACITY_OVERFLOW = 0.30; // opacity of the single peeking overflow element
const EDGE_MASK_FRAC = 0.05;   // edge opacity-mask ramp width = 5% of the visible window each side
const MASK_PAD_Y = 200;        // #435: vertical head/foot room on the edge mask — the fade is
                               // horizontal-only, so the rect must never vertically clip content
                               // (labels/counts below the hit box). 200 safely exceeds any row.

// edgeFor(half): the integer distance of the OUTERMOST in-window item — the "edge". A wider window
// (Han 2026-06-19: 7-visible instruments) pushes the edge out so the falloff stretches to the new
// outer card, not the old 5-card edge. (Was half+0.5; now `half` exactly — the edge is the last
// FULLY-VISIBLE item, and the overflow element sits one step beyond at half+1.)
const edgeFor = (half) => half;

// SCALE falloff by distance-from-centre `d`. Eased ramp 1.0 (centre) → SIZE_EDGE (0.70) at the
// window edge, continuing to SIZE_OVERFLOW (0.50) for the single overflow element (edge < |d| ≤
// edge+1). Pure → single source of truth, shared by all three consumers (§6d).
const scaleForDist = (d, half = VISIBLE_HALF) => {
    const abs = Math.abs(d);
    const edge = edgeFor(half);
    if (abs <= edge) {
        const t = edge > 0 ? abs / edge : 0;                 // 0 at centre → 1 at edge
        return 1 - (1 - SIZE_EDGE) * easeInOut(t);
    }
    // Overflow zone (edge < |d| ≤ edge+1): ramp SIZE_EDGE → SIZE_OVERFLOW.
    const t = Math.min(1, abs - edge);
    return SIZE_EDGE - (SIZE_EDGE - SIZE_OVERFLOW) * easeInOut(t);
};

// OPACITY falloff by distance `d`. Eased ramp 1.0 (centre) → OPACITY_EDGE (0.50) at the window edge,
// then the single overflow element (edge < |d| ≤ edge+1) ramps OPACITY_EDGE → OPACITY_OVERFLOW
// (0.30); beyond that a hard cut to 0 (off-screen items must not paint or intercept). `half`
// defaults to VISIBLE_HALF so the exported helper keeps working for default-window callers.
const opacityForDist = (d, half = VISIBLE_HALF) => {
    const abs = Math.abs(d);
    const edge = edgeFor(half);
    if (abs <= edge) {
        const t = edge > 0 ? abs / edge : 0;
        return 1 - (1 - OPACITY_EDGE) * easeInOut(t);
    }
    if (abs <= edge + 1) {
        const t = abs - edge;                                 // 0 at edge → 1 at overflow
        return OPACITY_EDGE - (OPACITY_EDGE - OPACITY_OVERFLOW) * easeInOut(t);
    }
    return 0;                                                 // hard cut past the overflow element
};

// Per-step GAP (× baseWidth) at fractional distance `d` from centre. Eased GAP_CENTER (1.0) →
// GAP_EDGE (0.70) over the visible window, then GAP_OVERFLOW (0.40) for the overflow step. This is
// the DERIVATIVE of the x layout; xOffsetForDist integrates it so spacing COMPRESSES toward the
// edges (the centre-weight cue Han wants), instead of the old even d===d strip.
const gapAtDist = (d, half = VISIBLE_HALF) => {
    const abs = Math.abs(d);
    const edge = edgeFor(half);
    if (abs <= edge) {
        const t = edge > 0 ? abs / edge : 0;
        return GAP_CENTER - (GAP_CENTER - GAP_EDGE) * easeInOut(t);
    }
    const t = Math.min(1, abs - edge);
    return GAP_EDGE - (GAP_EDGE - GAP_OVERFLOW) * easeInOut(t);
};

// Horizontal position (in baseWidth units) of an item at fractional distance `d` from centre.
// NON-LINEAR (Han #163 rework): the signed INTEGRAL of gapAtDist from 0..|d|, so per-step gaps
// shrink toward the edges and the strip compresses. Numerically integrated in small steps (the
// function is smooth and monotonic, so a fine fixed step is exact enough for layout). MUST stay
// monotonic in d (brackets in InstrumentStaffOverlay/CarouselFieldItem rely on it). Exported.
const X_INTEGRATION_STEP = 0.05;   // fine enough that bracket pixel alignment is sub-px
const xOffsetForDist = (d, half = VISIBLE_HALF) => {
    const abs = Math.abs(d);
    let x = 0;
    // Midpoint accumulation: sum gapAt at the MIDPOINT of each sub-step.
    for (let s = 0; s < abs; s += X_INTEGRATION_STEP) {
        const step = Math.min(X_INTEGRATION_STEP, abs - s);
        x += gapAtDist(s + step / 2, half) * step;
    }
    return d < 0 ? -x : x;
};

export default function NonLinearCarousel({
    items, activeIndex = 0, renderItem, centerX, y, baseWidth, height,
    onSelect, onPosChange, debugMode = false,
    // #428 (Han 2026-07-13): reveal-on-interaction support baked into the carousel itself, so the
    // hidden generation/instrument fields can do PRESS-AND-HOLD → immediate drag. When `collapsed`,
    // every off-centre item is faded to 0 (only the active/centre item paints — Han: "alleen het
    // actieve item blijft"), and a pointer-down on the (narrow) hit rect fires `onReveal` while the
    // SAME gesture continues into a drag (the rect owns pointer capture, so no event forwarding).
    // The collapse is ANIMATED (fade in on reveal, fade out on re-hide) so Han's "met een fade out"
    // is honoured. `collapsed=false` (default) → unchanged always-open behaviour.
    collapsed = false,
    onReveal,
    // #428: when false, render ONLY the active item's content (the side items are unmounted) so a
    // hidden field stays cheap at rest — the 16 rhythm-pattern MelodyNotesLayers etc. do NOT mount
    // until the field is revealed. The carousel's persistent hit rect is always present regardless,
    // which is what makes press-and-hold → drag work without an event handoff. Default true keeps
    // every existing (always-open) consumer unchanged.
    mountAllItems = true,
    // #361 (Han: "carousel voor repeats -> niet-periodiek"): cyclical=false
    // CLAMPS the position to [0, N-1] instead of wrapping the ring — first and
    // last item are hard ends. Default stays cyclical for existing consumers.
    cyclical = true,
    // visibleHalf: how many items show on EACH side of the centre (window = 2*half+1). PROP, not a
    // constant (Han 2026-06-19): the instrument carousel passes 3 → 7 visible; the colour carousel
    // omits it → default VISIBLE_HALF (2) → 5 visible (unchanged). Drives the fade edge, the
    // tap-hit visibility cut-off, and the hit-surface width below.
    visibleHalf = VISIBLE_HALF,
}) {
    // Unique id per instance for the SVG edge-mask <defs> (multiple carousels coexist on one staff
    // surface, so a shared id would collide). React.useId is stable across renders + SSR-safe.
    const rawId = React.useId();
    const maskId = `nlc-edge-mask-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
    const wrapRefs = React.useRef([]);    // per-item <g> refs (we mutate style each frame)
    const posRef = React.useRef(activeIndex);  // fractional centre position (which item index sits at centerX)
    const dragRef = React.useRef(null);   // { startX, startPos, moved, downSvgX }
    const animRef = React.useRef(null);   // glide rAF
    // #428: collapse factor 0..1 (0 = fully open, 1 = only the centre item shows). Animated on the
    // `collapsed` prop so side items fade in/out. Read live in applyPos (§6 — element.style only).
    const collapseAmtRef = React.useRef(collapsed ? 1 : 0);
    const collapseAnimRef = React.useRef(null);
    // Keep the live onReveal callback in a ref so onPointerDown (a stable closure) always calls the
    // latest one without re-creating the pointer handlers every render.
    const onRevealRef = React.useRef(onReveal);
    onRevealRef.current = onReveal;
    // Keep the live onPosChange callback in a ref so applyPos (a stable closure) always calls the
    // latest one without us re-creating the render functions every render.
    const onPosChangeRef = React.useRef(onPosChange);
    onPosChangeRef.current = onPosChange;

    const N = items.length;
    // Wrap vs clamp (#361): all position/distance maths goes through these two,
    // so the non-cyclical mode is a pure domain change, not a second code path.
    const normPos = (p) => (cyclical ? wrapPos(p, N) : Math.max(0, Math.min(N - 1, p)));
    const distTo = (i, pos) => (cyclical ? signedDist(i, pos, N) : i - pos);

    // Keep the resting position in sync with the externally-controlled activeIndex (e.g. the
    // setter committed a new selection): glide to it unless the user is mid-drag.
    // Omit animatePosTo from deps. It is a stable closure (rAF-based tween, no external capture
    // except the refs and constants). Including it would cause a redundant effect run every render,
    // re-starting the animation unnecessarily. The true deps are activeIndex (selection change)
    // and N (item count change → wrap domain changes). If both change together, we animate once
    // to the new active position in the new wrapped domain.
    React.useEffect(() => {
        if (dragRef.current) return;          // don't fight an in-progress gesture
        animatePosTo(activeIndex);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIndex, N]);

    // Apply the current fractional centre position `pos` to every item's wrapper <g>:
    // translateX + scale + opacity, all via element.style (§6). Items far outside the visible
    // window are hidden (opacity 0) so they don't intercept anything or paint off-staff.
    const applyPos = (pos, notify = true) => {
        // Keep posRef in the canonical domain: wrapped [0, N) when cyclical, clamped
        // [0, N-1] when not (#361 non-periodic mode).
        const wp = normPos(pos);
        posRef.current = wp;
        // #428: collapse fades every OFF-centre item toward 0. The centre (active) item keeps its
        // own opacity so it stays visible at rest ("alleen het actieve item blijft").
        const collapse = collapseAmtRef.current;
        for (let i = 0; i < N; i += 1) {
            const g = wrapRefs.current[i];
            if (!g) continue;
            // NEAREST signed distance accounting for the wrap, so items near index 0 sit just to the
            // right of items near index N-1 — the ring loops with no clamp at the ends.
            const d = distTo(i, wp);
            const isCentre = Math.abs(d) < 0.01;
            const op = isCentre ? opacityForDist(d, visibleHalf)
                : opacityForDist(d, visibleHalf) * (1 - collapse);
            if (op <= 0) {
                // Beyond the single overflow element — park it transparent so it never paints
                // off-staff or intercepts anything. The ONE overflow element each side (edge <
                // |d| ≤ edge+1) returns op>0 (0.30 → 0) above, so it IS positioned below.
                g.style.opacity = '0';
                continue;
            }
            const s = scaleForDist(d, visibleHalf);
            const x = centerX + xOffsetForDist(d, visibleHalf) * baseWidth;
            // CENTRE-WEIGHTED, BUT EVERYTHING ON A HORIZONTAL LINE (Han 2026-06-27):
            // Items must SHRINK toward the edges (the centre-weight cue) while their visual
            // baseline NEVER moves — every card stays on the same horizontal line regardless of
            // its scale. The item content is authored FAR from y=0 (consumers draw at
            // `staffStart + …`, e.g. icon ~staffStart+23, label ~staffStart+58). With a y=0 scale
            // origin, scale(s) multiplies those large Y values, so a shrinking card visibly drifts
            // UPWARD (icon at y≈150 jumps to ≈105 at 0.7×). The fix: scale about a CONSTANT
            // vertical baseline shared by every item — the carousel's own vertical centre
            // `y + height/2`. Because that Y is identical for all items, scaling compresses each
            // card toward the SAME horizontal line; no item drifts vertically as it shrinks.
            // X origin stays 0 (the item's authored horizontal origin, where translate(x) places it).
            const baselineY = y + height / 2;
            g.style.transform = `translate(${x}px, 0px) scale(${s})`;
            g.style.transformOrigin = `0px ${baselineY}px`;
            g.style.opacity = String(op);
        }
        // Notify the consumer of the LIVE wrapped position every frame (drag + glide), so e.g. the
        // instrument setter's category brackets can track the carousel during the gesture. §6: the
        // consumer does its own element.style writes — we never set React state per frame here.
        // #428 FIX: the COLLAPSE animation (fade-out on re-hide) also calls applyPos, but the
        // POSITION isn't changing there — only opacity. It must pass notify=false, otherwise the
        // consumer's onPosChange (which resets the idle auto-hide timer) fires during the fade and
        // CANCELS the very re-hide that triggered it, so the setter never collapses.
        if (notify) onPosChangeRef.current?.(wp);
    };

    // Glide the fractional centre position to item index `target` over CENTER_ANIM_MS, taking the
    // SHORTEST path around the loop (so tapping the right-most visible item glides forward across
    // the seam, not all the way back). Cancels any in-flight glide. No clamp — cyclical.
    const animatePosTo = (target) => {
        if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
        const from = posRef.current;
        // Shortest signed delta from `from` to `target` around the ring, in (-N/2, N/2]. We glide
        // from `from` to `from + delta` (which may land outside [0,N)); applyPos wraps it back.
        const delta = distTo(target, from);
        if (Math.abs(delta) < 0.001) { applyPos(from); return; }
        const to = from + delta;
        const t0 = performance.now();
        const step = (now) => {
            const p = Math.min(1, (now - t0) / CENTER_ANIM_MS);
            applyPos(from + (to - from) * easeInOut(p));
            animRef.current = p < 1 ? requestAnimationFrame(step) : null;
        };
        animRef.current = requestAnimationFrame(step);
    };

    // Paint the initial layout once mounted (and whenever the item set changes) so items don't
    // flash at full size/opacity before the first rAF. useLayoutEffect → before paint.
    // Omit applyPos/wrapPos from deps and ALSO activeIndex. applyPos is stable (only touches
    // wrapRefs and DOM style). wrapPos is a pure function. activeIndex changes are already
    // handled by the useEffect above (animatePosTo). This effect is ONLY for re-painting the
    // initial layout when N changes (the item count); it would be redundant to also re-run on
    // activeIndex changes since the previous effect already animates there. Fire on N only.
    React.useLayoutEffect(() => {
        applyPos(normPos(activeIndex));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [N]);

    React.useEffect(() => () => {
        if (animRef.current) cancelAnimationFrame(animRef.current);
        if (collapseAnimRef.current) cancelAnimationFrame(collapseAnimRef.current);
    }, []);

    // #428: animate the collapse factor toward the `collapsed` prop (1 = hidden side items, 0 =
    // fully open), re-applying the layout each frame so the side items FADE in on reveal / out on
    // re-hide. Omit applyPos from deps — it is a stable closure (touches only refs + DOM style);
    // the effect must run exactly on `collapsed` changes.
    React.useEffect(() => {
        const target = collapsed ? 1 : 0;
        const from = collapseAmtRef.current;
        if (collapseAnimRef.current) { cancelAnimationFrame(collapseAnimRef.current); collapseAnimRef.current = null; }
        // notify=false: the collapse only changes opacity, not position — see the FIX note in applyPos.
        if (Math.abs(from - target) < 0.001) { collapseAmtRef.current = target; applyPos(posRef.current, false); return; }
        const COLLAPSE_MS = 260;
        const t0 = performance.now();
        const step = (now) => {
            const p = Math.min(1, (now - t0) / COLLAPSE_MS);
            collapseAmtRef.current = from + (target - from) * easeInOut(p);
            applyPos(posRef.current, false);
            collapseAnimRef.current = p < 1 ? requestAnimationFrame(step) : null;
        };
        collapseAnimRef.current = requestAnimationFrame(step);
        return () => { if (collapseAnimRef.current) cancelAnimationFrame(collapseAnimRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collapsed]);

    // client (px) → SVG user-space x via the owning svg's screen CTM (borrowed from
    // ClefCardCarousel — keeps drag distance 1:1 with the finger across viewBox scales).
    const toSvgX = (el, clientX) => {
        const svg = el.ownerSVGElement || el;
        const ctm = svg.getScreenCTM?.();
        if (!ctm || !svg.createSVGPoint) return clientX;   // jsdom lacks createSVGPoint
        const pt = svg.createSVGPoint();
        pt.x = clientX; pt.y = 0;
        return pt.matrixTransform(ctm.inverse()).x;
    };

    const onPointerDown = (e) => {
        if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
        // #434 (Han: "tap (carousel zichtbaar) tap (noot gekozen); tap-hold -> carousel slepen"):
        // a press on a COLLAPSED carousel REVEALS it (this gesture), but a plain TAP that only
        // revealed must NOT also select — selection needs a SECOND tap once open. Press-and-hold
        // still flows straight into a drag (same rect owns pointer capture). We remember whether
        // this gesture did the reveal so onPointerUp can suppress the select on that first tap.
        const revealedNow = collapsed;
        if (collapsed) onRevealRef.current?.();
        const sx = toSvgX(e.currentTarget, e.clientX);
        dragRef.current = { startX: sx, startPos: posRef.current, moved: 0, downSvgX: sx, revealedNow };
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
        const d = dragRef.current;
        if (!d) return;
        const sx = toSvgX(e.currentTarget, e.clientX);
        const dx = sx - d.startX;
        d.moved = Math.max(d.moved, Math.abs(dx));
        // Dragging RIGHT (dx > 0) should bring LOWER-index items toward the centre, so the
        // position moves in the OPPOSITE direction of the finger by dx / baseWidth item-units.
        // Cyclical: no clamp, the loop wraps freely; non-cyclical: applyPos clamps
        // to the hard ends (#361).
        const next = d.startPos - dx / baseWidth;
        applyPos(next);
    };
    const onPointerUp = (e) => {
        const d = dragRef.current;
        dragRef.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        if (!d) return;
        if (d.moved < TAP_SLOP) {
            // #434: a TAP that merely REVEALED the carousel selects nothing — it just opens it; the
            // next tap (carousel now open) picks a note. This is what lets a hidden carousel keep
            // tap-to-select without committing on the reveal (Han's two-tap model).
            if (d.revealedNow) return;
            // TAP — figure out which visible item slot the down point landed in (nearest by the
            // laid-out x), glide it to centre and commit. We test against the SAME xOffset layout
            // applied in applyPos (NEAREST signed distance, wrap-aware) so the hit maths matches the
            // visual exactly across the loop seam.
            const localX = d.downSvgX - centerX;
            let best = Math.round(posRef.current);
            let bestErr = Infinity;
            for (let i = 0; i < N; i += 1) {
                const dist = distTo(i, posRef.current);
                if (Math.abs(dist) > visibleHalf + 0.5) continue;   // only visible items are tappable
                const ix = xOffsetForDist(dist, visibleHalf) * baseWidth;
                const err = Math.abs(localX - ix);
                if (err < bestErr) { bestErr = err; best = i; }
            }
            // `best` is already a real item index in [0,N). animatePosTo glides the shortest way.
            animatePosTo(best);
            onSelect?.(items[best], best);
        } else {
            // DRAG settle — snap to the nearest item and commit it (Han: centred item is the
            // selection, commit on settle). Map the wrapped centre back to a real item index.
            const snapped = cyclical ? (wrapPos(Math.round(posRef.current), N) % N)
                : Math.max(0, Math.min(N - 1, Math.round(posRef.current)));
            animatePosTo(snapped);
            onSelect?.(items[snapped], snapped);
        }
    };

    // ── Geometry shared by the hit surface, the edge mask, and the debug boundaries ──────────────
    // VISIBLE window: the in-window items span centerX ± (visibleHalf+0.5)*baseWidth (the hit rect).
    const winLeft = centerX - (visibleHalf + 0.5) * baseWidth;
    const winW = (2 * visibleHalf + 1) * baseWidth;
    // #428: while COLLAPSED the hit/tap surface shrinks to just the centre item (baseWidth wide), so
    // adjacent hidden fields don't overlap each other's rest tap targets. On press it reveals and —
    // via pointer capture — the drag still tracks the finger far outside this narrow rect. When open
    // the surface spans the full visible window (unchanged).
    const hitX = collapsed ? centerX - 0.5 * baseWidth : winLeft;
    const hitW = collapsed ? baseWidth : winW;
    // OVERFLOW boundary: one item beyond the edge sits at distance up to edge+1; in x-units that is
    // xOffsetForDist(visibleHalf+1) (slightly more than the window half because the overflow step is
    // 0.40*baseWidth). Used only for the debug dashed boundary (the element itself is masked/faded).
    const overflowHalfX = xOffsetForDist(visibleHalf + 1, visibleHalf) * baseWidth;
    // EDGE MASK gradient stops (B1): opacity 0.5 at each outer edge, ramping to 1.0 over the outer
    // EDGE_MASK_FRAC (5%) of the window, full (1.0) across the middle. So edge items get an EXTRA
    // soft fade ON TOP of their per-item opacity falloff, for a clean "fading into the frame" look.
    const f = EDGE_MASK_FRAC;

    return (
        <g>
            {/* SVG edge opacity mask (Han #163 B): a horizontal gradient that dims the outer 5% of
                the carousel window to 0.5, so items fade softly INTO the carousel frame rather than
                cutting off hard. Applied to the VISUAL <g> only (NOT the transparent hit rect — the
                gesture must still register at the edges, §3a). White = visible, black = hidden;
                we ramp white→grey at the edges. maskUnits userSpaceOnUse so the gradient maps to the
                same SVG user coords as the carousel. */}
            <defs>
                <linearGradient id={`${maskId}-grad`} gradientUnits="userSpaceOnUse"
                    x1={winLeft} y1={0} x2={winLeft + winW} y2={0}>
                    <stop offset="0" stopColor="white" stopOpacity={OPACITY_EDGE} />
                    <stop offset={f} stopColor="white" stopOpacity={1} />
                    <stop offset={1 - f} stopColor="white" stopOpacity={1} />
                    <stop offset="1" stopColor="white" stopOpacity={OPACITY_EDGE} />
                </linearGradient>
                {/* #435 clipping fix (Han 2026-07-17: "ik zie de labels van de carousels niet"):
                    the mask rect used the HIT-BOX bounds (y..y+height) — but the mask exists ONLY
                    for the HORIZONTAL edge fade, and item content (value labels at rowCenterY+38,
                    Maestro counts at +54) can extend well below the hit box. Everything outside the
                    mask rect is hard-clipped to invisible, which silently ate every label drawn
                    below hitY+hitHeight (fields with tall hit boxes escaped — that's why note-pool
                    labels showed while melody-type labels vanished). The rect now takes a generous
                    vertical margin; the horizontal gradient — the mask's actual job — is unchanged. */}
                <mask id={maskId} maskUnits="userSpaceOnUse"
                    x={winLeft} y={y - MASK_PAD_Y} width={winW} height={height + 2 * MASK_PAD_Y}>
                    <rect x={winLeft} y={y - MASK_PAD_Y} width={winW} height={height + 2 * MASK_PAD_Y}
                        fill={`url(#${maskId}-grad)`} />
                </mask>
            </defs>
            {/* Visual layer — pointerEvents off; the drag/tap surface below routes the gesture.
                Each item is wrapped in TWO nested <g>s:
                  • an OUTER `data-fly` <g> that the flyInCascade choreography translates (slides in
                    from the right, staggered by x) on overlay morph-in, then resets;
                  • an INNER <g> (wrapRefs[i]) that the carousel transforms per frame for the
                    centre-weight layout (translate+scale+opacity via element.style, §6).
                PER-ELEMENT FLY-IN (Han 2026-06-19): each card now carries its own `data-fly`, so the
                cards cascade in one-by-one from the right (leftmost lands first — flyInCascade
                staggers by getBBox().x), instead of the whole carousel flying as one unit. The
                outer fly <g> and inner carousel <g> are SEPARATE elements so their transforms never
                fight: the cascade owns the outer translateX, the carousel owns the inner
                translate/scale/opacity, and they compose. The parent overlay groups dropped their
                redundant `data-fly` so cards don't double-translate. renderItem authors the item
                around the origin (0,0). */}
            <g style={{ pointerEvents: 'none' }} mask={`url(#${maskId})`}>
                {items.map((item, i) => (
                    // #428: at rest (mountAllItems=false) only the active item's content is mounted;
                    // React fires the ref with null for the others, so wrapRefs stays consistent and
                    // applyPos's `if (!g) continue` skips them.
                    (mountAllItems || i === activeIndex) ? (
                        <g key={i} data-fly="">
                            <g ref={(el) => { wrapRefs.current[i] = el; }}>
                                {renderItem(item, i)}
                            </g>
                        </g>
                    ) : null
                ))}
            </g>
            {/* Full-width transparent drag/tap surface (captures the gesture). Spans the visible
                window: `visibleHalf` items each side of centre, at base width (Han 2026-06-19: the
                window is now a prop — 3 for the 7-card instrument carousel, default 2 elsewhere). */}
            <rect
                x={hitX}
                y={y}
                width={hitW}
                height={height}
                fill="transparent"
                style={{ cursor: collapsed ? 'pointer' : 'grab', touchAction: 'none' }}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            />
            {debugMode && (
                <g style={{ pointerEvents: 'none' }}>
                    {/* §3a: the orange rect matches the REAL hit surface (collapsed → narrow centre
                        tap target; open → full window), so debug mode shows exactly where taps/drags
                        register in either state. */}
                    <rect x={hitX} y={y} width={hitW} height={height}
                        fill="orange" fillOpacity={0.12} stroke="orange" strokeWidth={0.5} />
                    {/* CYAN: the VISIBLE-window boundary (centerX ± edge*baseWidth) — the last
                        FULLY-laid-out item edge. Distinct from the orange hit rect (Han #163 C1). */}
                    <line x1={centerX - edgeFor(visibleHalf) * baseWidth} y1={y}
                        x2={centerX - edgeFor(visibleHalf) * baseWidth} y2={y + height}
                        stroke="cyan" strokeWidth={0.75} />
                    <line x1={centerX + edgeFor(visibleHalf) * baseWidth} y1={y}
                        x2={centerX + edgeFor(visibleHalf) * baseWidth} y2={y + height}
                        stroke="cyan" strokeWidth={0.75} />
                    {/* DASHED magenta: the OVERFLOW boundary (one item beyond the edge). Han verifies
                        EXACTLY ONE element renders between the cyan and the dashed line (Han #163 C2). */}
                    <line x1={centerX - overflowHalfX} y1={y}
                        x2={centerX - overflowHalfX} y2={y + height}
                        stroke="magenta" strokeWidth={0.75} strokeDasharray="3,2" />
                    <line x1={centerX + overflowHalfX} y1={y}
                        x2={centerX + overflowHalfX} y2={y + height}
                        stroke="magenta" strokeWidth={0.75} strokeDasharray="3,2" />
                    {/* Thin bands marking the 5% edge-mask ramp zone each side (Han #163 C3). */}
                    <rect x={winLeft} y={y} width={winW * f} height={height}
                        fill="cyan" fillOpacity={0.08} />
                    <rect x={winLeft + winW * (1 - f)} y={y} width={winW * f} height={height}
                        fill="cyan" fillOpacity={0.08} />
                </g>
            )}
        </g>
    );
}

// Exported for the setters' dynamic category headers: which item indices are currently VISIBLE
// around a centre position (within VISIBLE_HALF + 0.5). CYCLICAL (Han 2026-06-17): returns an
// ARRAY of real item indices in left→right VISUAL order, wrapping across the N-1 → 0 seam (so a
// centre near index 0 returns e.g. [N-2, N-1, 0, 1, 2]). The category-header code consumes this
// ordered list. Pure, so header layout and the carousel agree on "what's on screen".
// `half` defaults to VISIBLE_HALF (5-window) so default-window callers (the colour carousel) are
// unchanged; the instrument setter passes the SAME 3 it gives the carousel so its category brackets
// span exactly the 7 visible cards (Han 2026-06-19).
export const visibleRange = (centerIndex, count, half = VISIBLE_HALF) => {
    const lo = Math.ceil(centerIndex - (half + 0.5));
    const hi = Math.floor(centerIndex + (half + 0.5));
    const out = [];
    for (let k = lo; k <= hi; k += 1) out.push(((k % count) + count) % count);
    return out;
};
// Pure falloff fns + curve constants exported for unit tests (Han #163 I) and any consumer that
// needs to reason about the curve (e.g. the instrument brackets reuse xOffsetForDist for alignment).
export {
    xOffsetForDist, VISIBLE_HALF,
    scaleForDist, opacityForDist, gapAtDist, edgeFor,
    SIZE_EDGE, SIZE_OVERFLOW, GAP_CENTER, GAP_EDGE, GAP_OVERFLOW,
    OPACITY_EDGE, OPACITY_OVERFLOW, EDGE_MASK_FRAC,
};
