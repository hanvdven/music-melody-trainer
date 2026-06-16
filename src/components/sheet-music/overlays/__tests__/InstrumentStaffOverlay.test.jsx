import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import InstrumentStaffOverlay from '../InstrumentStaffOverlay';
import { INSTRUMENT_GROUPS } from '../../../../constants/instruments';

// Renders the instrument overlay inside an <svg>, exercising the per-staff card strips
// (real ClefCardCarousel reuse) and the placeholder-icon cards.
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
    it('renders treble + bass instrument card strips without crashing', () => {
        const { container } = renderOverlay();
        expect(container.querySelector('.instrument-overlay')).not.toBeNull();
        // One card strip (data-fly block) per visible staff.
        expect(container.querySelectorAll('.instrument-cards').length).toBe(2);
        // Cards render via foreignObject (icon + name).
        expect(container.querySelectorAll('foreignObject').length).toBeGreaterThan(0);
    });

    it('shows a group-label/separator card for every instrument family', () => {
        const { container } = renderOverlay();
        const labels = [...container.querySelectorAll('text')].map(t => t.textContent);
        // Each family label appears (uppercased) for at least the treble strip.
        for (const g of INSTRUMENT_GROUPS) {
            expect(labels).toContain(g.label.toUpperCase());
        }
    });

    it('shows the icon attribution line while open', () => {
        const { container } = renderOverlay();
        const texts = [...container.querySelectorAll('text')].map(t => t.textContent);
        expect(texts.some(t => /placeholder/i.test(t))).toBe(true);
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

    it('exposes the carousel tap/drag surface per staff (tap routing is ClefCardCarousel)', () => {
        // The interactive surface is the carousel's full-window transparent <rect>; the
        // actual tap→onTap routing is owned + tested by ClefCardCarousel/ClefStaffOverlay.
        // jsdom lacks SVGSVGElement.createSVGPoint, so we don't simulate the gesture here.
        const { container } = renderOverlay();
        const trebleStrip = container.querySelectorAll('.instrument-cards')[0];
        expect(trebleStrip.querySelector('rect[fill="transparent"]')).not.toBeNull();
    });
});
