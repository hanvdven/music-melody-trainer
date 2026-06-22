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

    it('renders the renamed/reordered scheme labels (Scale, Chord, Subtle chromatone)', () => {
        const { container } = renderOverlay();
        const labels = [...container.querySelectorAll('text')].map(t => t.textContent);
        // 'tonic_scale_keys' mode is now LABELLED "Scale"; 'chords' → "Chord".
        expect(labels).toContain('Scale');
        expect(labels).toContain('Chord');
        expect(labels).toContain('Subtle chromatone');
        // The legacy 'Tonic / Scale' label is gone.
        expect(labels).not.toContain('Tonic / Scale');
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

    it('tags EACH scheme card with data-fly so the cards cascade in (Han 2026-06-19)', () => {
        // PER-ELEMENT FLY-IN: data-fly moved from the old wrapping group DOWN onto each scheme card
        // inside the carousel, so the schemes cascade in one-by-one (leftmost first) with the morph
        // rather than the whole carousel flying as one unit. One data-fly per scheme.
        const { container } = renderOverlay();
        const flies = container.querySelectorAll('.note-coloring-overlay [data-fly]');
        expect(flies.length).toBe(5);   // five colour schemes
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
