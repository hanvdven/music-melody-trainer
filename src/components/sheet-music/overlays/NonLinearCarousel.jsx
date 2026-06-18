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
const VISIBLE_HALF = 2;             // render this many items on EACH side of the centre (~5 total)
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

// Falloff by distance-from-centre `d` (0 = centred, grows toward the edges).
// OPACITY fades; SCALE is now CONSTANT 1.0. Kept as pure functions so the look is a single
// source of truth (this primitive is shared by the instrument + colour carousels, §6d).
const EDGE = VISIBLE_HALF + 0.5;    // distance at which an item is fully faded
// FULLY FLAT (Han 2026-06-18): no shrink at all — every card is the SAME size. WHY: Han wants a
// pure horizontal strip, not a curved "dial/wheel", so the only edge cue is the OPACITY fade
// below (the "there's more" hint), never a size change. Kept as a function (not a literal at the
// call site) so the single-source-of-truth shape is preserved and the constant can be tuned in
// one place. Affects BOTH the instrument and colour carousels (intended — shared primitive).
const scaleForDist = () => 1;
const opacityForDist = (d) => {
    const t = clamp(Math.abs(d) / EDGE, 0, 1);
    // 1.0 at centre → 0 at the edge, eased — the ONLY edge cue now that scale is flat.
    return 1 - easeInOut(t);
};
// Horizontal position of an item at fractional distance `d` from centre. LINEAR (Han 2026-06-18):
// every item occupies exactly one base-width slot, evenly spaced — x === d. WHY: with the shrink
// removed the old midpoint-scale integration would just sum 1.0 per step anyway, but a plain
// identity makes the "even strip" intent explicit and removes the now-pointless loop. Full-size
// cards spread WIDER than the old shrunk edges, so there is no new overlap risk.
const xOffsetForDist = (d) => d;

export default function NonLinearCarousel({
    items, activeIndex = 0, renderItem, centerX, y, baseWidth, height,
    onSelect, onPosChange, debugMode = false,
}) {
    const wrapRefs = React.useRef([]);    // per-item <g> refs (we mutate style each frame)
    const posRef = React.useRef(activeIndex);  // fractional centre position (which item index sits at centerX)
    const dragRef = React.useRef(null);   // { startX, startPos, moved, downSvgX }
    const animRef = React.useRef(null);   // glide rAF
    // Keep the live onPosChange callback in a ref so applyPos (a stable closure) always calls the
    // latest one without us re-creating the render functions every render.
    const onPosChangeRef = React.useRef(onPosChange);
    onPosChangeRef.current = onPosChange;

    const N = items.length;

    // Keep the resting position in sync with the externally-controlled activeIndex (e.g. the
    // setter committed a new selection): glide to it unless the user is mid-drag.
    React.useEffect(() => {
        if (dragRef.current) return;          // don't fight an in-progress gesture
        animatePosTo(activeIndex);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIndex, N]);

    // Apply the current fractional centre position `pos` to every item's wrapper <g>:
    // translateX + scale + opacity, all via element.style (§6). Items far outside the visible
    // window are hidden (opacity 0) so they don't intercept anything or paint off-staff.
    const applyPos = (pos) => {
        // Keep posRef in the canonical wrapped domain [0, N) so the seam never drifts off to
        // ±infinity over many loops (Han 2026-06-17: cyclical scroll).
        const wp = wrapPos(pos, N);
        posRef.current = wp;
        for (let i = 0; i < N; i += 1) {
            const g = wrapRefs.current[i];
            if (!g) continue;
            // NEAREST signed distance accounting for the wrap, so items near index 0 sit just to the
            // right of items near index N-1 — the ring loops with no clamp at the ends.
            const d = signedDist(i, wp, N);
            const op = opacityForDist(d);
            if (op <= 0.001) {
                // Fully faded — park it transparent (and don't bother positioning precisely).
                g.style.opacity = '0';
                continue;
            }
            const s = scaleForDist(d);
            const x = centerX + xOffsetForDist(d) * baseWidth;
            // transform-box/origin: the item is authored around its own origin, so scale about
            // the item centre by translating to x then scaling. translateX is in px (user units).
            g.style.transform = `translate(${x}px, 0px) scale(${s})`;
            g.style.transformOrigin = '0px 0px';
            g.style.opacity = String(op);
        }
        // Notify the consumer of the LIVE wrapped position every frame (drag + glide), so e.g. the
        // instrument setter's category brackets can track the carousel during the gesture. §6: the
        // consumer does its own element.style writes — we never set React state per frame here.
        onPosChangeRef.current?.(wp);
    };

    // Glide the fractional centre position to item index `target` over CENTER_ANIM_MS, taking the
    // SHORTEST path around the loop (so tapping the right-most visible item glides forward across
    // the seam, not all the way back). Cancels any in-flight glide. No clamp — cyclical.
    const animatePosTo = (target) => {
        if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
        const from = posRef.current;
        // Shortest signed delta from `from` to `target` around the ring, in (-N/2, N/2]. We glide
        // from `from` to `from + delta` (which may land outside [0,N)); applyPos wraps it back.
        const delta = signedDist(target, from, N);
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
    React.useLayoutEffect(() => {
        applyPos(wrapPos(activeIndex, N));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [N]);

    React.useEffect(() => () => {
        if (animRef.current) cancelAnimationFrame(animRef.current);
    }, []);

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
        const sx = toSvgX(e.currentTarget, e.clientX);
        dragRef.current = { startX: sx, startPos: posRef.current, moved: 0, downSvgX: sx };
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
        // No clamp — the loop wraps freely (applyPos wraps into [0,N)).
        const next = d.startPos - dx / baseWidth;
        applyPos(next);
    };
    const onPointerUp = (e) => {
        const d = dragRef.current;
        dragRef.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        if (!d) return;
        if (d.moved < TAP_SLOP) {
            // TAP — figure out which visible item slot the down point landed in (nearest by the
            // laid-out x), glide it to centre and commit. We test against the SAME xOffset layout
            // applied in applyPos (NEAREST signed distance, wrap-aware) so the hit maths matches the
            // visual exactly across the loop seam.
            const localX = d.downSvgX - centerX;
            let best = Math.round(posRef.current);
            let bestErr = Infinity;
            for (let i = 0; i < N; i += 1) {
                const dist = signedDist(i, posRef.current, N);
                if (Math.abs(dist) > VISIBLE_HALF + 0.5) continue;   // only visible items are tappable
                const ix = xOffsetForDist(dist) * baseWidth;
                const err = Math.abs(localX - ix);
                if (err < bestErr) { bestErr = err; best = i; }
            }
            // `best` is already a real item index in [0,N). animatePosTo glides the shortest way.
            animatePosTo(best);
            onSelect?.(items[best], best);
        } else {
            // DRAG settle — snap to the nearest item and commit it (Han: centred item is the
            // selection, commit on settle). Map the wrapped centre back to a real item index.
            const snapped = wrapPos(Math.round(posRef.current), N) % N;
            animatePosTo(snapped);
            onSelect?.(items[snapped], snapped);
        }
    };

    return (
        <g>
            {/* Visual layer — pointerEvents off; the drag/tap surface below routes the gesture.
                Each item is wrapped in a <g> we transform per frame (translate+scale+opacity via
                element.style, §6). renderItem authors the item around the origin (0,0). */}
            <g style={{ pointerEvents: 'none' }}>
                {items.map((item, i) => (
                    <g key={i} ref={(el) => { wrapRefs.current[i] = el; }}>
                        {renderItem(item, i)}
                    </g>
                ))}
            </g>
            {/* Full-width transparent drag/tap surface (captures the gesture). Spans the visible
                window: VISIBLE_HALF items each side of centre, at base width. */}
            <rect
                x={centerX - (VISIBLE_HALF + 0.5) * baseWidth}
                y={y}
                width={(2 * VISIBLE_HALF + 1) * baseWidth}
                height={height}
                fill="transparent"
                style={{ cursor: 'grab', touchAction: 'none' }}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            />
            {debugMode && (
                // §3a: the orange rect matches the REAL hit window above (same x/width/height),
                // so debug mode shows exactly where taps/drags register.
                <rect
                    x={centerX - (VISIBLE_HALF + 0.5) * baseWidth}
                    y={y}
                    width={(2 * VISIBLE_HALF + 1) * baseWidth}
                    height={height}
                    fill="orange" fillOpacity={0.12} stroke="orange" strokeWidth={0.5}
                    style={{ pointerEvents: 'none' }} />
            )}
        </g>
    );
}

// Exported for the setters' dynamic category headers: which item indices are currently VISIBLE
// around a centre position (within VISIBLE_HALF + 0.5). CYCLICAL (Han 2026-06-17): returns an
// ARRAY of real item indices in left→right VISUAL order, wrapping across the N-1 → 0 seam (so a
// centre near index 0 returns e.g. [N-2, N-1, 0, 1, 2]). The category-header code consumes this
// ordered list. Pure, so header layout and the carousel agree on "what's on screen".
export const visibleRange = (centerIndex, count) => {
    const lo = Math.ceil(centerIndex - (VISIBLE_HALF + 0.5));
    const hi = Math.floor(centerIndex + (VISIBLE_HALF + 0.5));
    const out = [];
    for (let k = lo; k <= hi; k += 1) out.push(((k % count) + count) % count);
    return out;
};
export { xOffsetForDist, VISIBLE_HALF };
