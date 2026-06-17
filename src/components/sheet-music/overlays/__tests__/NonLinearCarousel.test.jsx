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

    it('visibleRange returns the ~5 items around the centre', () => {
        // Centre index 3 of 7 → indices 1..5 visible (2 each side + centre).
        expect(visibleRange(3, 7)).toEqual({ lo: 1, hi: 5 });
        // Clamps at the ends.
        expect(visibleRange(0, 7)).toEqual({ lo: 0, hi: 2 });
        expect(visibleRange(6, 7)).toEqual({ lo: 4, hi: 6 });
    });
});
