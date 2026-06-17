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

    it('wraps the carousel in a data-fly group so it slides in with the morph', () => {
        const { container } = renderOverlay();
        expect(container.querySelector('.note-coloring-overlay [data-fly]')).not.toBeNull();
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
