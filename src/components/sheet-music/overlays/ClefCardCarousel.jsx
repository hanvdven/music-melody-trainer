import React from 'react';

/**
 * ClefCardCarousel — a horizontally SWIPEABLE strip of clef cards (Han 2026-06-02).
 *
 * Unlike `ClefCarousel` (the family loop carousel, where clicking a neighbour ROTATES
 * it to the front), here a TAP on a card SELECTS that clef — so navigation to the
 * off-screen cards must be a separate gesture: a free horizontal DRAG/SWIPE. The strip
 * holds N cards laid out left→right at a fixed `cardW`; only the cards that fit in the
 * `viewWidth` window show at rest, the rest sit off-screen to the right and slide in
 * when the user drags left. The offset is CLAMPED (no loop) to [minOffset … 0] so you
 * can't overscroll past either end. A right-edge fade hints "more →".
 *
 * Drag vs tap is disambiguated by movement: a pointer that moves < TAP_SLOP user-units
 * between down and up is a TAP → we route it to the card under the pointer's
 * `onTap`; anything more is a drag and only scrolls. We convert client px → SVG user
 * units via the owning <svg>'s screen CTM so drag distance tracks the finger 1:1
 * regardless of the viewBox scale.
 *
 * Props:
 *  - cards:      descriptors; this component only uses `card.onTap` + array order.
 *  - x0, y:      top-left of the view window (SVG user units).
 *  - viewWidth, height:  the visible window size.
 *  - cardW:      fixed per-card width (slot stride).
 *  - renderCard: (card, slotX, index) => SVG node drawn at absolute slotX (the strip
 *                <g> applies the scroll offset on top).
 *  - clipId:     unique id for the window clip + fade mask.
 */
const TAP_SLOP = 5;                       // < this much movement (user units) = a tap
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeInOut = (t) => t * t * (3 - 2 * t);
const RECENTER_DELAY_MS = 3000;           // after a scroll, re-centre the selection (#4)
const CENTER_ANIM_MS = 500;               // glide-to-centre duration (Han #2/#4)

export default function ClefCardCarousel({
    cards, x0, y, viewWidth, height, cardW, renderCard, clipId, cardWidths,
}) {
    const stripRef = React.useRef(null);
    const offsetRef = React.useRef(0);    // committed scroll offset, ≤ 0
    const dragRef = React.useRef(null);   // { startX, startOffset, moved }
    const animRef = React.useRef(null);   // glide-to-centre rAF
    const recenterTimerRef = React.useRef(null);  // 3 s post-scroll re-centre timer

    // Per-card widths (A7: narrow screens shrink non-selected cards to clef-only); falls
    // back to a uniform cardW. `slotStarts[i]` = left x of card i within the strip.
    const widths = cardWidths && cardWidths.length === cards.length
        ? cardWidths : cards.map(() => cardW);
    const slotStarts = [];
    let acc = 0;
    for (const w of widths) { slotStarts.push(acc); acc += w; }
    const contentW = acc;
    const minOffset = Math.min(0, viewWidth - contentW);   // most-negative scroll
    const scrollable = minOffset < 0;

    // Clamp once the content/measurements change (e.g. fewer cards after a family
    // switch) so a stale offset can't leave the strip scrolled past its new end.
    // Omit widths/slotStarts/scrollable from deps. They are derived every render from immutable
    // input (cards array, viewWidth, cardW). Changing them does not require a clamp — only the
    // MIN offset (which depends on viewWidth and contentW) does. Changes to derived values are
    // Omit maxOffset from deps: minOffset captures all constraint changes; adding maxOffset would
    // cause redundant re-clamps. The invariant is: offsetRef tracks the clamped value, recalculated
    // whenever minOffset changes (which implies maxOffset availability). maxOffset changes alone
    // do not require re-clamp because offset is within its previous valid range.
    React.useEffect(() => {
        const clamped = clamp(offsetRef.current, minOffset, 0);
        if (clamped !== offsetRef.current) applyOffset(clamped);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [minOffset]);

    const applyOffset = (o) => {
        offsetRef.current = o;
        // Drag scroll bypasses React state (rAF-free, pointer-driven) — set the SVG
        // attribute directly so the strip tracks the finger without a re-render.
        if (stripRef.current) stripRef.current.setAttribute('transform', `translate(${o} 0)`);
    };

    // Scroll offset that puts card `idx` in the centre of the window (clamped).
    const activeIdx = cards.findIndex(c => c.active);
    const centerOffsetFor = (idx) => clamp(viewWidth / 2 - slotStarts[idx] - widths[idx] / 2, minOffset, 0);

    // Glide the scroll offset to `target` over `durationMs` (Han #2/#4). Cancels any
    // in-flight glide. No-op for tiny deltas so it doesn't fight a resting strip.
    const animateOffsetTo = (target, durationMs) => {
        if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
        const from = offsetRef.current;
        if (Math.abs(target - from) < 0.5) return;
        const t0 = performance.now();
        const step = (now) => {
            const p = Math.min(1, (now - t0) / durationMs);
            applyOffset(from + (target - from) * easeInOut(p));
            animRef.current = p < 1 ? requestAnimationFrame(step) : null;
        };
        animRef.current = requestAnimationFrame(step);
    };

    // #2: when the selection CHANGES to a card that sits RIGHT of the window centre,
    // glide it to the centre (0.5 s) — revealing that more cards live behind the strip.
    const prevActiveRef = React.useRef(activeIdx);
    // Omit centerOffsetFor and animateOffsetTo from deps. They are stable closures that
    // capture minOffset, viewWidth, slotStarts, widths — all of which are derived from props
    // (cards, viewWidth, cardW) and therefore "pure" for dep-array purposes. Including them
    // would cause an effect re-run every render even if activeIdx/scrollable haven't changed.
    // The race this prevents: if scrollable toggles (content width crosses viewport width
    // boundary) and activeIdx has ALSO changed, we want EXACTLY ONE animation, not a queued
    // race. The single run on [activeIdx, scrollable] ensures that.
    React.useEffect(() => {
        if (!scrollable || activeIdx < 0) { prevActiveRef.current = activeIdx; return; }
        if (activeIdx === prevActiveRef.current) return;
        prevActiveRef.current = activeIdx;
        const curCentre = slotStarts[activeIdx] + widths[activeIdx] / 2 + offsetRef.current;
        if (curCentre > viewWidth / 2) animateOffsetTo(centerOffsetFor(activeIdx), CENTER_ANIM_MS);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIdx, scrollable]);

    // Cleanup timers/raf on unmount.
    React.useEffect(() => () => {
        if (animRef.current) cancelAnimationFrame(animRef.current);
        if (recenterTimerRef.current) clearTimeout(recenterTimerRef.current);
    }, []);

    // client (px) → SVG user-space x via the owning svg's screen CTM.
    const toSvgX = (el, clientX) => {
        const svg = el.ownerSVGElement || el;
        const ctm = svg.getScreenCTM();
        if (!ctm) return clientX;
        const pt = svg.createSVGPoint();
        pt.x = clientX; pt.y = 0;
        return pt.matrixTransform(ctm.inverse()).x;
    };

    const onPointerDown = (e) => {
        // Interacting cancels any in-flight glide and the pending re-centre (#2/#4).
        if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
        if (recenterTimerRef.current) { clearTimeout(recenterTimerRef.current); recenterTimerRef.current = null; }
        const sx = toSvgX(e.currentTarget, e.clientX);
        dragRef.current = { startX: sx, startOffset: offsetRef.current, moved: 0, downSvgX: sx };
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
        const d = dragRef.current;
        if (!d) return;
        const sx = toSvgX(e.currentTarget, e.clientX);
        const dx = sx - d.startX;
        d.moved = Math.max(d.moved, Math.abs(dx));
        if (scrollable) applyOffset(clamp(d.startOffset + dx, minOffset, 0));
    };
    const onPointerUp = (e) => {
        const d = dragRef.current;
        dragRef.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        if (!d) return;
        if (d.moved < TAP_SLOP) {
            // It was a tap, not a drag → select the card whose [start … start+width] slot
            // the down point lands in (per-card widths, A7).
            const localX = d.downSvgX - x0 - offsetRef.current;
            const idx = slotStarts.findIndex((s, i) => localX >= s && localX < s + widths[i]);
            if (idx >= 0 && idx < cards.length) cards[idx].onTap?.();
        } else if (scrollable && activeIdx >= 0) {
            // It was a drag/scroll → after 3 s of rest, glide the selection back to the
            // centre (Han #4, 2026-06-03).
            recenterTimerRef.current = setTimeout(
                () => animateOffsetTo(centerOffsetFor(activeIdx), CENTER_ANIM_MS), RECENTER_DELAY_MS);
        }
    };

    // Gentle edge fade so off-screen cards ease in/out of the window rather than
    // hard-cutting; left edge only softens when actually scrolled away from the start.
    const maskId = `${clipId}-fade`;
    // Edge fades each span 10% of the window (0–10% left, 90–100% right) — Han 2026-06-03.
    // Left only fades once actually scrolled away from the start; right only when there's
    // more to reveal.
    const leftSoft = offsetRef.current < -1 ? 0.10 : 0;
    const rightSoft = scrollable ? 0.90 : 1;
    // Clip HORIZONTALLY only: cards must never be cut at the top or bottom (Han
    // 2026-06-03, "clip gewoon NIET"). Tall clefs, 8va/15ma markers and notes above
    // the staff all need to render fully; only off-window cards (left/right of the
    // swipe window) get hidden. A huge vertical span makes the clip a vertical no-op.
    const CLIP_TOP = -9999;
    const CLIP_H = 19998;

    return (
        <g>
            <defs>
                <clipPath id={clipId}>
                    <rect x={x0} y={CLIP_TOP} width={viewWidth} height={CLIP_H} />
                </clipPath>
                <linearGradient id={maskId} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="white" stopOpacity={leftSoft ? 0 : 1} />
                    <stop offset={leftSoft} stopColor="white" stopOpacity="1" />
                    <stop offset={rightSoft} stopColor="white" stopOpacity="1" />
                    <stop offset="1" stopColor="white" stopOpacity={rightSoft < 1 ? 0 : 1} />
                </linearGradient>
                <mask id={`${maskId}-m`}>
                    <rect x={x0} y={CLIP_TOP} width={viewWidth} height={CLIP_H} fill={`url(#${maskId})`} />
                </mask>
            </defs>
            <g clipPath={`url(#${clipId})`} mask={`url(#${maskId}-m)`}>
                {/* visual strip — pointerEvents off; the drag surface below routes taps */}
                <g ref={stripRef} style={{ pointerEvents: 'none' }}>
                    {cards.map((card, i) => (
                        <g key={card.key}>{renderCard(card, x0 + slotStarts[i], i)}</g>
                    ))}
                </g>
                {/* full-window transparent drag/tap surface (captures the gesture) */}
                <rect x={x0} y={y} width={viewWidth} height={height} fill="transparent"
                    style={{ cursor: scrollable ? 'grab' : 'pointer', touchAction: 'none' }}
                    onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
            </g>
        </g>
    );
}
