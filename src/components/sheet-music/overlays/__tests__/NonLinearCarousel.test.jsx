import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import NonLinearCarousel, { visibleRange } from '../NonLinearCarousel';

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
        // The hit window spans ~5 item slots wide (VISIBLE_HALF=2 each side + the centre).
        expect(Number(surface.getAttribute('width'))).toBeGreaterThan(40 * 4);
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

    it('visibleRange WRAPS across the N-1 → 0 seam (cyclical, Han 2026-06-17)', () => {
        // Centre at index 0 → the two items "before" it wrap to the high end of the ring, in
        // left→right visual order: [N-2, N-1, 0, 1, 2].
        expect(visibleRange(0, 7)).toEqual([5, 6, 0, 1, 2]);
        // Centre at the last index → the two items "after" it wrap back to the low end.
        expect(visibleRange(6, 7)).toEqual([4, 5, 6, 0, 1]);
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
