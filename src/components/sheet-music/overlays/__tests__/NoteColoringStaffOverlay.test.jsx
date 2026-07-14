import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import NoteColoringStaffOverlay from '../NoteColoringStaffOverlay';

const renderOverlay = (props = {}) => render(
    <svg>
        <NoteColoringStaffOverlay
            startX={100} endX={700} trebleStart={100}
            noteColoringMode="tonic_scale_keys"
            setNoteColoringMode={() => {}}
            tonic="C" scaleNotes={['C', 'D', 'E', 'F', 'G', 'A', 'B']}
            // #427 rework: these assertions cover the EXPANDED carousel; the hidden reveal-on-
            // interaction behaviour is the shared hook (tested in useRevealOnInteraction). Default off.
            hidden={false}
            {...props}
        />
    </svg>,
);

describe('NoteColoringStaffOverlay', () => {
    it('renders the colour-scheme carousel without crashing', () => {
        const { container } = renderOverlay();
        expect(container.querySelector('.note-coloring-overlay')).not.toBeNull();
        // SVG-native (no foreignObject) so it composites with the morph group opacity.
        expect(container.querySelectorAll('foreignObject').length).toBe(0);
    });

    it('renders the renamed/reordered scheme labels in ALL CAPS (standing carousel CR)', () => {
        const { container } = renderOverlay();
        const labels = [...container.querySelectorAll('text')].map(t => t.textContent);
        // 'tonic_scale_keys' mode is now LABELLED "Scale"; 'chords' → "Chord".
        // ALL CAPS since 2026-07-03 (Han: carousel text conventions must not
        // drift per consumer).
        expect(labels).toContain('SCALE');
        expect(labels).toContain('CHORD');
        expect(labels).toContain('SUBTLE CHROMATONE');
        expect(labels).not.toContain('Scale');
    });

    it('example notes ASCEND C4→C5 at real staff positions (Han 2026-06-17, not flat)', () => {
        // The scheme example notes keep the pitch ramp (the "flatten" was a misread — only the
        // carousel reads horizontal, not the notes), so noteheads span MULTIPLE baseline ys.
        const { container } = renderOverlay();
        const heads = [...container.querySelectorAll('text')]
            .filter(t => t.getAttribute('font-family') === 'Maestro');
        expect(heads.length).toBeGreaterThan(0);
        const ys = new Set(heads.map(t => t.getAttribute('y')));
        // A C4→C5 run uses several distinct staff heights, not a single baseline.
        expect(ys.size).toBeGreaterThan(1);
    });

    it('tags scheme cards with data-fly so the cards cascade in (Han 2026-06-19)', () => {
        // PER-ELEMENT FLY-IN: each scheme card carries data-fly so the schemes cascade in one-by-one
        // (leftmost first). Since #432 the notes render through MiniMelody/renderMelodyNotes, whose
        // note groups ALSO carry data-fly (they fly with their card), so there are at least the 5
        // card-level flies plus the inner note flies.
        const { container } = renderOverlay();
        const flies = container.querySelectorAll('.note-coloring-overlay [data-fly]');
        expect(flies.length).toBeGreaterThanOrEqual(5);
    });

    it('renders the debug hit box when debugMode is on', () => {
        const { container } = renderOverlay({ debugMode: true });
        const debugRects = [...container.querySelectorAll('rect')].filter(
            r => r.getAttribute('stroke') === 'orange');
        expect(debugRects.length).toBeGreaterThanOrEqual(1);
    });

    it('renders nothing without geometry', () => {
        const { container } = renderOverlay({ startX: null });
        expect(container.querySelector('.note-coloring-overlay')).toBeNull();
    });
});
