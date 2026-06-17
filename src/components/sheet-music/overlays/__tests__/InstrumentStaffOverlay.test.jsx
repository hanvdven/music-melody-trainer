import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import InstrumentStaffOverlay from '../InstrumentStaffOverlay';
import { INSTRUMENT_LIST } from '../../../../constants/instruments';

// Renders the instrument overlay inside an <svg>, exercising the per-staff NonLinearCarousel
// (one per visible staff) and the placeholder-icon items. jsdom lacks
// SVGSVGElement.createSVGPoint, so the gesture itself isn't simulated here.
const renderOverlay = (props = {}) => render(
    <svg>
        <InstrumentStaffOverlay
            startX={100} endX={700}
            trebleStart={100} bassStart={200}
            isTrebleVisible isBassVisible
            trebleInstrument="acoustic_grand_piano"
            bassInstrument="cello"
            onSetInstrument={() => {}}
            {...props}
        />
    </svg>,
);

describe('InstrumentStaffOverlay', () => {
    it('renders treble + bass instrument carousels without crashing', () => {
        const { container } = renderOverlay();
        expect(container.querySelector('.instrument-overlay')).not.toBeNull();
        // One carousel (data-fly block) per visible staff.
        expect(container.querySelectorAll('.instrument-cards').length).toBe(2);
        // Items render SVG-NATIVE (icon glyph + name <text>), NOT foreignObject — foreignObject
        // didn't fade with the morph and broke the INSTRUMENT→COLOUR slide (Han 2026-06-17).
        expect(container.querySelectorAll('foreignObject').length).toBe(0);
        // Every instrument item renders its name (twice — once per staff carousel).
        const labels = [...container.querySelectorAll('text')].map(t => t.textContent);
        expect(labels).toContain(INSTRUMENT_LIST[0].name);
    });

    it('shows a dynamic category bracket for the active category (2+ visible)', () => {
        // Piano (Keys) is the treble active item; Keys has 3 items so its bracket shows.
        const { container } = renderOverlay();
        const labels = [...container.querySelectorAll('text')].map(t => t.textContent);
        expect(labels).toContain('KEYS');
    });

    it('CYCLICAL: brackets wrap across the seam — Piano (index 0) shows BOTH neighbouring '
        + 'categories (Keys after the seam + Voice before it)', () => {
        // Piano is the first instrument; with wrap-around the visible window straddles the
        // N-1 → 0 seam, so the trailing Voice category (last group) is visible alongside Keys.
        const { container } = renderOverlay({ bassInstrument: 'acoustic_grand_piano' });
        const labels = [...container.querySelectorAll('text')].map(t => t.textContent);
        expect(labels).toContain('KEYS');
        expect(labels).toContain('VOICE');   // wrapped in from the far end of the ring
    });

    it('shows the icon attribution line while open', () => {
        const { container } = renderOverlay();
        const texts = [...container.querySelectorAll('text')].map(t => t.textContent);
        expect(texts.some(t => /icons8/i.test(t))).toBe(true);
    });

    it('renders the debug hit box when debugMode is on', () => {
        const { container } = renderOverlay({ debugMode: true });
        // §3a: an orange-stroked rect visualises the carousel hit window per staff.
        const debugRects = [...container.querySelectorAll('rect')].filter(
            r => r.getAttribute('stroke') === 'orange');
        expect(debugRects.length).toBeGreaterThanOrEqual(2);
    });

    it('renders nothing without geometry', () => {
        const { container } = renderOverlay({ startX: null });
        expect(container.querySelector('.instrument-overlay')).toBeNull();
    });

    it('exposes the carousel tap/drag surface per staff', () => {
        // The interactive surface is the carousel's full-window transparent <rect>; the
        // actual tap→onSelect routing is owned + smoke-tested by NonLinearCarousel.
        const { container } = renderOverlay();
        const trebleCarousel = container.querySelectorAll('.instrument-cards')[0];
        expect(trebleCarousel.querySelector('rect[fill="transparent"]')).not.toBeNull();
    });
});
