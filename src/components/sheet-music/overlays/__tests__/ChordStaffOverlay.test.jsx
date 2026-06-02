import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ChordStaffOverlay from '../ChordStaffOverlay';

// Renders the chord row inside an <svg>, exercising the real MelodyNotesLayer chord
// render (this path crashed at runtime when melody.ties was missing — Han #11).
const renderChord = (props = {}) => render(
    <svg>
        <ChordStaffOverlay
            startX={100} endX={700} trebleStart={120}
            chordDisplayMode="letters" chordComplexity="triad"
            onSetChordDisplayMode={() => {}}
            onSetChordComplexity={() => {}}
            {...props}
        />
    </svg>,
);

describe('ChordStaffOverlay', () => {
    it('renders the complexity chords (real noteheads) without crashing', () => {
        const { container } = renderChord();
        // The complexity row renders whole-note chords through MelodyNotesLayer.
        expect(container.querySelector('.chord-overlay')).not.toBeNull();
        // At least one Maestro notehead text was produced.
        expect(container.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('fires onSetChordComplexity with the canonical value', () => {
        const onSetChordComplexity = vi.fn();
        const { container } = renderChord({ onSetChordComplexity });
        // The 'tonic' chord stores canonical 'root'.
        const tonic = container.querySelector('[data-fly]');
        expect(tonic).not.toBeNull();
        fireEvent.click(tonic);
        expect(onSetChordComplexity).toHaveBeenCalled();
    });

    it('renders nothing without geometry', () => {
        const { container } = renderChord({ startX: null });
        expect(container.querySelector('.chord-overlay')).toBeNull();
    });
});
