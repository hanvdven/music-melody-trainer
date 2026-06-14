import React from 'react';

/**
 * ClefCarousel — a true LOOP carousel of clef glyphs (Han 2026-06-01 #5).
 *
 * Glyphs are laid out at slots 0,1,2,… (slot 0 = active/leftmost). Picking slot k
 * should make that glyph the new active one: ALL glyphs slide k steps to the LEFT;
 * the k glyphs that fall off the left edge re-enter from the RIGHT (with a fade-in,
 * revealed from under a masking gradient) so the carousel reads as an infinite loop.
 *
 * Implementation: we render a STRIP of `items` (the families in carousel order) at
 * fixed slots, plus `loopCount` extra copies appended on the right (so there's
 * always something to slide in from). A pick animates a single rAF tween of the
 * strip's translateX from 0 → −k·step over `durationMs`, easing in/out; on
 * completion we call `onPick(item)` so the parent re-roots the order (the active
 * family becomes index 0) and the strip resets to translateX 0 for the next pick.
 * Entering glyphs fade in via a left→right opacity ramp near the right edge.
 *
 * Props:
 *  - items:      array in carousel order (index 0 = current). Each item is opaque to
 *                this component; `renderItem(item, isActive)` draws it.
 *  - startX, stepX:  x of slot 0, and horizontal step between slots (SVG units).
 *  - visible:    how many slots are visible before the right fade edge.
 *  - renderItem: (item, { isActive, index }) => SVG node (positioned at x=0; the
 *                carousel translates each slot group to its slot x).
 *  - onPick:     (item, index) => void  — called AFTER the slide completes.
 *  - durationMs: slide duration per step group (default 300).
 *  - clipId:     unique id for the gutter clip/mask.
 *  - clipRect:   { x, y, width, height } the visible gutter window (clip + fade).
 */
const easeInOut = (t) => t * t * (3 - 2 * t);

export default function ClefCarousel({
    items, startX, stepX, visible = 4, renderItem, onPick,
    durationMs = 300, clipId, clipRect,
}) {
    const stripRef = React.useRef(null);
    const rafRef = React.useRef(null);
    const animatingRef = React.useRef(false);
    // The slot currently being picked (in the CURRENT order). While set, THIS glyph reads
    // as active (highlight) — so on a pick the colours swap to the picked clef BEFORE the
    // slide, not after (Han #13, 2026-06-03: no one-frame old-active flash).
    const [picking, setPicking] = React.useState(null);

    React.useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

    // After the parent re-roots the order (onPick → new `items`), clear the leftover
    // inline slide transform BEFORE paint, so the new order draws at translateX 0 with
    // no intermediate frame at the old offset (Han #13). Skipped during the slide.
    React.useLayoutEffect(() => {
        if (!animatingRef.current && stripRef.current) stripRef.current.removeAttribute('transform');
    });

    // Show EXACTLY the requested number of glyphs at rest (Han #14: caller passes
    // visible = items.length, evenly spread across the gutter so the rightmost lands
    // near startX·0.9 — NOT squeezed against the edge). No fit-clamp: the even-spread
    // geometry guarantees all N land inside the gutter.
    const n = items.length;
    const shown = Math.min(n, Math.max(1, visible));
    // Wrap copies for the slide reveal: items beyond slot `shown−1` sit PAST the
    // even-spread 90% mark, i.e. OUTSIDE the clip — so they're invisible at rest and
    // only scroll into view DURING a pick (fixes the "half-visible next clef", Han #14).
    const wrap = Math.max(0, shown - 1);
    const strip = [];
    for (let s = 0; s < shown + wrap; s++) {
        strip.push({ item: items[s % n], slot: s, key: `${s}` });
    }

    const handlePick = (relIndex) => {
        if (relIndex === 0 || animatingRef.current || !onPick) {
            if (relIndex !== 0) onPick?.(items[relIndex % n], relIndex);
            return;
        }
        const el = stripRef.current;
        if (!el) { onPick(items[relIndex % n], relIndex); return; }
        animatingRef.current = true;
        // Highlight the picked clef NOW (before the slide); the old active goes lowlight.
        setPicking(relIndex);
        const dist = relIndex * stepX;
        const t0 = performance.now();
        const dur = durationMs * Math.min(relIndex, 3); // longer for bigger jumps, capped
        const frame = (now) => {
            const p = Math.min(1, (now - t0) / dur);
            el.setAttribute('transform', `translate(${-dist * easeInOut(p)} 0)`);
            if (p < 1) { rafRef.current = requestAnimationFrame(frame); return; }
            rafRef.current = null;
            animatingRef.current = false;
            // Re-root the order (picked → slot 0). The leftover transform (−dist) is left in
            // place and cleared by the layout effect on the new order's commit, BEFORE paint
            // — so the swap is seamless: the picked clef stays highlighted at slot 0 with no
            // intermediate frame (Han #13).
            onPick(items[relIndex % n], relIndex);
            setPicking(null);
        };
        rafRef.current = requestAnimationFrame(frame);
    };

    // Only the RIGHT edge softens (for wrap copies scrolling out). The LEFT stays full
    // opacity: the active clef rests at the leftmost slot (CLEF_GLYPH_X), so a left fade
    // dimmed/"clipped" it (Han #10, 2026-06-03).
    const maskId = `${clipId}-fade`;
    const rightFade = 0.95;

    return (
        <g>
            <defs>
                {/* Clip HORIZONTALLY only: tall clefs must never be cut at the bottom
                    (Han #10, 2026-06-03). A huge vertical span makes the clip a vertical
                    no-op; only glyphs scrolled out the right edge get hidden/faded. */}
                <clipPath id={clipId}>
                    <rect x={clipRect.x} y={-9999} width={clipRect.width} height={19998} />
                </clipPath>
                <linearGradient id={maskId} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="white" stopOpacity="1" />
                    <stop offset={rightFade} stopColor="white" stopOpacity="1" />
                    <stop offset="1" stopColor="white" stopOpacity="0" />
                </linearGradient>
                <mask id={`${maskId}-m`}>
                    <rect x={clipRect.x} y={-9999} width={clipRect.width} height={19998}
                        fill={`url(#${maskId})`} />
                </mask>
            </defs>
            <g clipPath={`url(#${clipId})`} mask={`url(#${maskId}-m)`}>
                <g ref={stripRef}>
                    {strip.map(({ item, slot, key }) => (
                        <g key={key} transform={`translate(${startX + slot * stepX} 0)`}
                            style={{ cursor: onPick ? 'pointer' : 'default' }}
                            onClick={() => handlePick(slot % n)}>
                            {/* While picking, the picked slot is the active (highlight) one
                                so colours swap BEFORE the slide; otherwise slot 0 (Han #13). */}
                            {renderItem(item, { isActive: picking != null ? (slot === picking) : (slot === 0), index: slot })}
                        </g>
                    ))}
                </g>
            </g>
        </g>
    );
}
