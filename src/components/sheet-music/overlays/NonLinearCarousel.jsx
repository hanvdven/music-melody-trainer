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
 *  - debugMode:    §3a — draw the drag/tap hit box.
 */

const TAP_SLOP = 5;                 // < this much movement (user units) = a tap (matches ClefCardCarousel)
const VISIBLE_HALF = 2;             // render this many items on EACH side of the centre (~5 total)
const CENTER_ANIM_MS = 420;         // glide-to-centre duration (tap or settle snap)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
const easeInOut = (t) => t * t * (3 - 2 * t);   // smoothstep — matches the app's other eases

// Non-linear falloff by distance-from-centre `d` (0 = centred, grows toward the edges).
// SCALE shrinks and OPACITY fades, both eased so the change is gentle near the centre and
// steep toward the edges. Kept as pure functions so the look is a single source of truth.
const EDGE = VISIBLE_HALF + 0.5;    // distance at which an item is fully faded/shrunk
const scaleForDist = (d) => {
    const t = clamp(Math.abs(d) / EDGE, 0, 1);
    // 1.0 at centre → ~0.45 at the edge, eased.
    return 1 - 0.55 * easeInOut(t);
};
const opacityForDist = (d) => {
    const t = clamp(Math.abs(d) / EDGE, 0, 1);
    // 1.0 at centre → 0 at the edge, eased (slightly faster than scale so edges melt away).
    return 1 - easeInOut(t);
};
// Horizontal position of an item at fractional distance `d` from centre. Items pack a little
// tighter toward the edges (because they shrink), so the gap is the average of the two
// adjacent scales — keeps neighbours visually touching rather than drifting apart.
const xOffsetForDist = (d) => {
    // Integrate the per-step stride from 0→d using the midpoint scale, so spacing follows the
    // shrink. Cheap closed-ish approximation: sum stride over whole steps + the fractional tail.
    const sign = d < 0 ? -1 : 1;
    const ad = Math.abs(d);
    let x = 0;
    let i = 0;
    while (i < ad) {
        const step = Math.min(1, ad - i);
        const mid = i + step / 2;
        x += step * scaleForDist(mid);
        i += 1;
    }
    return sign * x;
};

export default function NonLinearCarousel({
    items, activeIndex = 0, renderItem, centerX, y, baseWidth, height,
    onSelect, debugMode = false,
}) {
    const wrapRefs = React.useRef([]);    // per-item <g> refs (we mutate style each frame)
    const posRef = React.useRef(activeIndex);  // fractional centre position (which item index sits at centerX)
    const dragRef = React.useRef(null);   // { startX, startPos, moved, downSvgX }
    const animRef = React.useRef(null);   // glide rAF

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
        posRef.current = pos;
        for (let i = 0; i < N; i += 1) {
            const g = wrapRefs.current[i];
            if (!g) continue;
            const d = i - pos;                 // signed distance from the centre, in item units
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
    };

    // Glide the fractional centre position to `target` (an index, may be fractional) over
    // CENTER_ANIM_MS. Cancels any in-flight glide.
    const animatePosTo = (target) => {
        const t = clamp(target, 0, N - 1);
        if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
        const from = posRef.current;
        if (Math.abs(t - from) < 0.001) { applyPos(t); return; }
        const t0 = performance.now();
        const step = (now) => {
            const p = Math.min(1, (now - t0) / CENTER_ANIM_MS);
            applyPos(from + (t - from) * easeInOut(p));
            animRef.current = p < 1 ? requestAnimationFrame(step) : null;
        };
        animRef.current = requestAnimationFrame(step);
    };

    // Paint the initial layout once mounted (and whenever the item set changes) so items don't
    // flash at full size/opacity before the first rAF. useLayoutEffect → before paint.
    React.useLayoutEffect(() => {
        applyPos(clamp(activeIndex, 0, N - 1));
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
        const next = clamp(d.startPos - dx / baseWidth, 0, N - 1);
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
            // applused in applyPos so the hit maths matches the visual exactly.
            const localX = d.downSvgX - centerX;
            let best = Math.round(posRef.current);
            let bestErr = Infinity;
            for (let i = 0; i < N; i += 1) {
                const dist = i - posRef.current;
                if (Math.abs(dist) > VISIBLE_HALF + 0.5) continue;   // only visible items are tappable
                const ix = xOffsetForDist(dist) * baseWidth;
                const err = Math.abs(localX - ix);
                if (err < bestErr) { bestErr = err; best = i; }
            }
            best = clamp(best, 0, N - 1);
            animatePosTo(best);
            onSelect?.(items[best], best);
        } else {
            // DRAG settle — snap to the nearest item and commit it (Han: centred item is the
            // selection, commit on settle).
            const snapped = clamp(Math.round(posRef.current), 0, N - 1);
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

// Exported for the setters' dynamic category headers: which item indices are currently
// VISIBLE around a centre position (within VISIBLE_HALF + 0.5). Pure, so the header layout
// and the carousel agree on "what's on screen".
export const visibleRange = (centerIndex, count) => {
    const lo = Math.max(0, Math.ceil(centerIndex - (VISIBLE_HALF + 0.5)));
    const hi = Math.min(count - 1, Math.floor(centerIndex + (VISIBLE_HALF + 0.5)));
    return { lo, hi };
};
export { xOffsetForDist, VISIBLE_HALF };
