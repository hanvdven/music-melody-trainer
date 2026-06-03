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

export default function ClefCardCarousel({
    cards, x0, y, viewWidth, height, cardW, renderCard, clipId,
}) {
    const stripRef = React.useRef(null);
    const offsetRef = React.useRef(0);    // committed scroll offset, ≤ 0
    const dragRef = React.useRef(null);   // { startX, startOffset, moved }

    const contentW = cards.length * cardW;
    const minOffset = Math.min(0, viewWidth - contentW);   // most-negative scroll
    const scrollable = minOffset < 0;

    // Clamp once the content/measurements change (e.g. fewer cards after a family
    // switch) so a stale offset can't leave the strip scrolled past its new end.
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
            // It was a tap, not a drag → select the card under the down point.
            const localX = d.downSvgX - x0 - offsetRef.current;
            const idx = Math.floor(localX / cardW);
            if (idx >= 0 && idx < cards.length) cards[idx].onTap?.();
        }
    };

    // Gentle edge fade so off-screen cards ease in/out of the window rather than
    // hard-cutting; left edge only softens when actually scrolled away from the start.
    const maskId = `${clipId}-fade`;
    // Fades sit right at the window edges only — a wider fade reads as the cards being
    // "clipped early" (Han 2026-06-03). They exist solely to hint there's more to swipe.
    const leftSoft = offsetRef.current < -1 ? 0.015 : 0;
    const rightSoft = scrollable ? 0.985 : 1;
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
                        <g key={card.key}>{renderCard(card, x0 + i * cardW, i)}</g>
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
