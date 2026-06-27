import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import NonLinearCarousel, {
    visibleRange, scaleForDist, opacityForDist, xOffsetForDist, gapAtDist, edgeFor,
    SIZE_EDGE, SIZE_OVERFLOW, OPACITY_EDGE, OPACITY_OVERFLOW, GAP_CENTER, GAP_EDGE,
} from '../NonLinearCarousel';

const ITEMS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

const renderCarousel = (props = {}) => render(
    <svg>
        <NonLinearCarousel
            items={ITEMS}
            activeIndex={3}
            renderItem={(it) => <text data-testid={`item-${it}`}>{it}</text>}
            centerX={300} y={0} baseWidth={40} height={60}
            onSelect={() => {}}
            {...props}
        />
    </svg>,
);

describe('NonLinearCarousel', () => {
    it('renders one wrapper per item', () => {
        const { getAllByText } = renderCarousel();
        // Every item is rendered (the carousel hides far items via opacity, not unmounting).
        for (const it of ITEMS) expect(getAllByText(it).length).toBe(1);
    });

    it('marks the active/centre item bold-able via activeIndex (renderItem sees the index)', () => {
        // renderItem receives (item, index); here we just confirm the active item is present and
        // sits at the supplied activeIndex by checking the carousel renders without crashing and
        // exposes all items (centre selection is visual — driven by element.style in rAF, §6).
        const { container } = renderCarousel({ activeIndex: 0 });
        expect(container.querySelectorAll('text').length).toBe(ITEMS.length);
    });

    it('exposes a transparent drag/tap surface', () => {
        // jsdom lacks SVGSVGElement.createSVGPoint, so we don't simulate the gesture; we only
        // assert the interactive surface exists.
        const { container } = renderCarousel();
        const surface = container.querySelector('rect[fill="transparent"]');
        expect(surface).not.toBeNull();
        // The hit window spans ~5 item slots wide (default visibleHalf=2 each side + the centre).
        expect(Number(surface.getAttribute('width'))).toBeGreaterThan(40 * 4);
    });

    it('tags EACH item with data-fly so the cards cascade in one-by-one (Han 2026-06-19)', () => {
        // PER-ELEMENT FLY-IN: the data-fly moved from the parent overlay group DOWN onto each
        // card wrapper, so flyInCascade staggers the cards by x (leftmost lands first) instead of
        // flying the whole carousel as one unit. One data-fly wrapper per item.
        const { container } = renderCarousel();
        expect(container.querySelectorAll('[data-fly]').length).toBe(ITEMS.length);
    });

    it('visibleHalf prop widens the hit window (instrument carousel passes 3 → 7 visible)', () => {
        // Default (2) → 5 slots wide; visibleHalf=3 → 7 slots wide. The colour carousel omits the
        // prop (default 2, unchanged); the instrument carousel passes 3.
        const { container } = renderCarousel({ visibleHalf: 3 });
        const surface = container.querySelector('rect[fill="transparent"]');
        // width = (2*3+1) * baseWidth(40) = 280; clearly wider than the 5-slot (200) window.
        expect(Number(surface.getAttribute('width'))).toBeGreaterThan(40 * 6);
    });

    it('draws the §3a debug hit box matching the real surface', () => {
        const { container } = renderCarousel({ debugMode: true });
        const debug = [...container.querySelectorAll('rect')].find(
            r => r.getAttribute('stroke') === 'orange');
        expect(debug).not.toBeNull();
        const surface = container.querySelector('rect[fill="transparent"]');
        // Debug rect mirrors the real hit window (same x/width).
        expect(debug.getAttribute('x')).toBe(surface.getAttribute('x'));
        expect(debug.getAttribute('width')).toBe(surface.getAttribute('width'));
    });

    it('visibleRange returns the ~5 items around the centre as an ordered array', () => {
        // Centre index 3 of 7 → indices 1..5 visible (2 each side + centre), in visual order.
        expect(visibleRange(3, 7)).toEqual([1, 2, 3, 4, 5]);
    });

    it('visibleRange accepts a half-window arg (instrument carousel passes 3 → 7 wide)', () => {
        // Default half (2) → 5 indices; half=3 → 7 indices centred on the index. The instrument
        // setter passes the same 3 it gives the carousel so its category brackets span all 7 cards.
        expect(visibleRange(3, 9, 3)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it('visibleRange WRAPS across the N-1 → 0 seam (cyclical, Han 2026-06-17)', () => {
        // Centre at index 0 → the two items "before" it wrap to the high end of the ring, in
        // left→right visual order: [N-2, N-1, 0, 1, 2].
        expect(visibleRange(0, 7)).toEqual([5, 6, 0, 1, 2]);
        // Centre at the last index → the two items "after" it wrap back to the low end.
        expect(visibleRange(6, 7)).toEqual([4, 5, 6, 0, 1]);
    });

    // ── NON-LINEAR FALLOFF CURVES (Han #163 rework, I1) ──────────────────────────────────────────
    describe('non-linear falloff curves (Han #163)', () => {
        const HALF = 2;            // default window; edge = 2
        const edge = edgeFor(HALF);

        it('scaleForDist: 1.0 at centre, 0.70 at edge, ~0.50 at the overflow element', () => {
            expect(scaleForDist(0, HALF)).toBeCloseTo(1.0, 5);
            expect(scaleForDist(edge, HALF)).toBeCloseTo(SIZE_EDGE, 5);          // 0.70
            expect(scaleForDist(edge + 1, HALF)).toBeCloseTo(SIZE_OVERFLOW, 5);  // 0.50
            expect(scaleForDist(1, HALF)).toBeGreaterThan(scaleForDist(2, HALF));
            expect(scaleForDist(edge, HALF)).toBeGreaterThan(scaleForDist(edge + 1, HALF));
        });

        it('opacityForDist: 1.0 centre → 0.50 edge → 0.30 overflow → hard cut to 0 beyond', () => {
            expect(opacityForDist(0, HALF)).toBeCloseTo(1.0, 5);
            expect(opacityForDist(edge, HALF)).toBeCloseTo(OPACITY_EDGE, 5);          // 0.50
            expect(opacityForDist(edge + 1, HALF)).toBeCloseTo(OPACITY_OVERFLOW, 5);  // 0.30
            expect(opacityForDist(edge + 1.01, HALF)).toBe(0);
            expect(opacityForDist(edge + 2, HALF)).toBe(0);
        });

        it('gapAtDist: 1.0 at centre, 0.70 at edge — spacing compresses toward the edges', () => {
            expect(gapAtDist(0, HALF)).toBeCloseTo(GAP_CENTER, 5);
            expect(gapAtDist(edge, HALF)).toBeCloseTo(GAP_EDGE, 5);
            expect(gapAtDist(edge, HALF)).toBeLessThan(gapAtDist(0, HALF));
        });

        it('xOffsetForDist: monotonic, odd-symmetric, and compresses (edge gap < centre gap)', () => {
            expect(xOffsetForDist(0, HALF)).toBeCloseTo(0, 5);
            expect(xOffsetForDist(2, HALF)).toBeGreaterThan(xOffsetForDist(1, HALF));
            expect(xOffsetForDist(3, HALF)).toBeGreaterThan(xOffsetForDist(2, HALF));
            expect(xOffsetForDist(-2, HALF)).toBeCloseTo(-xOffsetForDist(2, HALF), 5);
            const gapCentreToFirst = xOffsetForDist(1, HALF) - xOffsetForDist(0, HALF);
            const gapEdgeToOverflow = xOffsetForDist(edge + 1, HALF) - xOffsetForDist(edge, HALF);
            expect(gapEdgeToOverflow).toBeLessThan(gapCentreToFirst);
        });

        it('lays out EXACTLY ONE overflow element each side (opacity > 0 just past the edge)', () => {
            expect(opacityForDist(3, HALF)).toBeGreaterThan(0);
            expect(opacityForDist(3, HALF)).toBeLessThan(OPACITY_EDGE);
            expect(opacityForDist(4, HALF)).toBe(0);
        });
    });

    // ── EDGE OPACITY MASK (Han #163 B, I3) ───────────────────────────────────────────────────────
    describe('edge opacity mask', () => {
        it('renders a <linearGradient> + <mask> in <defs> and applies the mask to the VISUAL <g>', () => {
            const { container } = renderCarousel();
            expect(container.querySelector('defs linearGradient')).not.toBeNull();
            expect(container.querySelector('defs mask')).not.toBeNull();
            const maskedG = [...container.querySelectorAll('g')].find(g => g.getAttribute('mask'));
            expect(maskedG).not.toBeNull();
            const hitRect = container.querySelector('rect[fill="transparent"]');
            expect(hitRect.getAttribute('mask')).toBeNull();
        });
    });

    it('draws the cyan visible-window + magenta overflow debug boundaries (Han #163 C)', () => {
        const { container } = renderCarousel({ debugMode: true });
        const cyan = [...container.querySelectorAll('line')].filter(l => l.getAttribute('stroke') === 'cyan');
        const magenta = [...container.querySelectorAll('line')].filter(l => l.getAttribute('stroke') === 'magenta');
        expect(cyan.length).toBe(2);
        expect(magenta.length).toBe(2);
    });

    it('visibleRange handles a fractional (live-drag) centre', () => {
        // Mid-drag the centre is fractional; the window is 5–6 consecutive ring indices (a 6th
        // item peeks in at the edge while transiting between two integer centres).
        const v = visibleRange(0.5, 7);
        expect(v.length).toBeGreaterThanOrEqual(5);
        expect(v.length).toBeLessThanOrEqual(6);
        // Every entry is a real item index in [0, N).
        for (const i of v) { expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(7); }
    });
});
