import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import InstrumentStaffOverlay from '../InstrumentStaffOverlay';
import { INSTRUMENT_LIST, categoryColorVar } from '../../../../constants/instruments';
import { PERCUSSION_KIT_CATEGORIES, percussionKitLabel } from '../../../../audio/drumKits';

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
        // One carousel block per visible staff. (PER-ELEMENT FLY-IN, Han 2026-06-19: data-fly now
        // lives on each card inside the carousel, not on this .instrument-cards wrapper.)
        expect(container.querySelectorAll('.instrument-cards').length).toBe(2);
        // Items render SVG-NATIVE (icon glyph + name <text>), NOT foreignObject — foreignObject
        // didn't fade with the morph and broke the INSTRUMENT→COLOUR slide (Han 2026-06-17).
        expect(container.querySelectorAll('foreignObject').length).toBe(0);
        // Every instrument item renders its name (twice — once per staff carousel).
        const labels = [...container.querySelectorAll('text')].map(t => t.textContent);
        expect(labels).toContain(INSTRUMENT_LIST[0].name);
    });

    it('shows a dynamic group bracket for the active group (2+ visible)', () => {
        // Grand piano (group 'keys') is the treble active item; that group has 2 items
        // so its bracket shows the group header uppercased (Han 2026-06-18; re-cat 2026-06-22).
        const { container } = renderOverlay();
        const labels = [...container.querySelectorAll('text')].map(t => t.textContent);
        expect(labels).toContain('KEYS');
    });

    it('CYCLICAL: brackets wrap across the seam — grand piano (index 0) shows its own group '
        + "(keys) and the trailing synth group before the seam", () => {
        // Grand piano is the first instrument; with wrap-around the visible window straddles the
        // N-1 → 0 seam, so the trailing LAST group is visible alongside keys. After the 2026-06-22
        // re-categorisation 'synth' is the final group (was 'voice'), so SYNTH wraps in here.
        const { container } = renderOverlay({ bassInstrument: 'acoustic_grand_piano' });
        const labels = [...container.querySelectorAll('text')].map(t => t.textContent);
        expect(labels).toContain('KEYS');
        expect(labels).toContain('SYNTH');   // wrapped in from the far end of the ring
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

    it('tints the ACTIVE card name with its category CSS var (Task B)', () => {
        // Grand piano (treble active) is category 'keys' → its name <text> fill resolves to the
        // --cat-keys var via categoryColorVar (§6c — read off the item, no slug→colour table).
        const { container } = renderOverlay();
        const expected = categoryColorVar('keys');           // 'var(--cat-keys)'
        const grandPiano = [...container.querySelectorAll('text')]
            .find(t => t.textContent === 'grand piano');
        expect(grandPiano).not.toBeUndefined();
        expect(grandPiano.getAttribute('fill')).toBe(expected);
    });

    it('colours the active category bracket with its category CSS var (Task B)', () => {
        // The KEYS bracket (drawn because keys has 2+ visible) uses --cat-keys for its stroke +
        // label fill, NOT --text-primary (§6d keeps the weight/dash, only the colour changes).
        const { container } = renderOverlay();
        const keysLabel = [...container.querySelectorAll('text')].find(t => t.textContent === 'KEYS');
        expect(keysLabel).not.toBeUndefined();
        expect(keysLabel.getAttribute('fill')).toBe(categoryColorVar('keys'));
    });
});

// ── Percussion-KIT carousel (Han 2026-06-22, Task D) ──────────────────────────────────────────
const renderPerc = (props = {}) => render(
    <svg>
        <InstrumentStaffOverlay
            startX={100} endX={700}
            trebleStart={100} bassStart={200} percussionStart={300}
            isTrebleVisible={false} isBassVisible={false} isPercussionVisible
            percussionKit="FreePats Percussion"
            onSetInstrument={() => {}}
            onSetPercussionKit={() => {}}
            {...props}
        />
    </svg>,
);

describe('InstrumentStaffOverlay — percussion-kit carousel', () => {
    // The AVAILABLE kit categories (Acoustic MIDI is available:false → skipped, honest GAP).
    const availableCats = PERCUSSION_KIT_CATEGORIES.filter(c => c.available);

    it('renders the percussion-kit carousel with kit category brackets', () => {
        const { container } = renderPerc();
        expect(container.querySelectorAll('.instrument-cards').length).toBe(1);
        const labels = [...container.querySelectorAll('text')].map(t => t.textContent);
        // 'Drum machines' has 2+ kits so its bracket shows (uppercased).
        expect(labels).toContain('DRUM MACHINES');
    });

    it('renders a card for every kit in the available categories', () => {
        const { container } = renderPerc();
        const labels = [...container.querySelectorAll('text')].map(t => t.textContent);
        for (const cat of availableCats) {
            for (const k of cat.kits) {
                expect(labels).toContain(percussionKitLabel(k.id));
            }
        }
    });

    it('does NOT offer the disabled Acoustic MIDI (GM) kits — honest gap, no silent kits', () => {
        const { container } = renderPerc();
        const labels = [...container.querySelectorAll('text')].map(t => t.textContent);
        // 'standard'/'jazz'/'electronic' have no working audio path yet → not rendered.
        expect(labels).not.toContain('standard');
        expect(labels).not.toContain('jazz');
        expect(labels).not.toContain('electronic');
    });

    it('writes percussionSettings.instrument (via onSetPercussionKit) on a tap-select', () => {
        const onSetPercussionKit = vi.fn();
        const { container } = renderPerc({ onSetPercussionKit });
        const surface = container.querySelector('.instrument-cards rect[fill="transparent"]');
        // Tap (down+up at the same point → moved 0 < TAP_SLOP) commits the centred kit. jsdom lacks
        // createSVGPoint so toSvgX degrades to clientX, but the tap path still fires onSelect →
        // onSetPercussionKit with a real kit id (the same value written to percussionSettings).
        fireEvent.pointerDown(surface, { clientX: 400, pointerId: 1 });
        fireEvent.pointerUp(surface, { clientX: 400, pointerId: 1 });
        expect(onSetPercussionKit).toHaveBeenCalledTimes(1);
        const kitId = onSetPercussionKit.mock.calls[0][0];
        const allIds = availableCats.flatMap(c => c.kits.map(k => k.id));
        expect(allIds).toContain(kitId);
    });

    it('renders the debug hit box (§3a)', () => {
        const { container } = renderPerc({ debugMode: true });
        const debug = [...container.querySelectorAll('rect')].filter(
            r => r.getAttribute('stroke') === 'orange');
        expect(debug.length).toBeGreaterThanOrEqual(1);
    });
});
