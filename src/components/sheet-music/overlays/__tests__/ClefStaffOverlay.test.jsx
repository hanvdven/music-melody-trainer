import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ClefStaffOverlay from '../ClefStaffOverlay';

// Renders the clef overlay inside an <svg>, exercising the real MelodyNotesLayer
// percussion render (the 4-eighth beamed bundle — Han #13 rewrite).
const renderClef = (props = {}) => render(
    <svg>
        <ClefStaffOverlay
            startX={100} endX={700}
            trebleStart={100} bassStart={180} percussionStart={260}
            isTrebleVisible isBassVisible isPercussionVisible
            clefTreble="treble" clefBass="bass"
            trebleSettings={{ preferredClef: 'treble' }}
            bassSettings={{ preferredClef: 'bass' }}
            onApplyClefPatch={() => {}}
            onToggleVoiceSplit={() => {}}
            onTogglePercussionDisabled={() => {}}
            {...props}
        />
    </svg>,
);

describe('ClefStaffOverlay', () => {
    it('renders treble/bass/percussion rows without crashing', () => {
        const { container } = renderClef();
        expect(container.querySelector('.clef-overlay')).not.toBeNull();
        expect(container.querySelector('.clef-row-percussion')).not.toBeNull();
        // The percussion bundle is a real MelodyNotesLayer render → has notehead text.
        expect(container.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('renders the swipeable clef-card carousel for a melodic staff', () => {
        const { container } = renderClef();
        // The treble row's variants are now a SWIPE carousel of clef cards (Han
        // 2026-06-02), with a transparent drag/tap surface rather than per-chip groups.
        const cards = container.querySelector('.clef-variant-cards');
        expect(cards).not.toBeNull();
        // Cards beyond the window exist off-screen (octaves + every transposing
        // instrument except concert C) → the rendered notehead text count is high.
        expect(cards.querySelectorAll('text').length).toBeGreaterThan(3);
    });

    it('renders nothing without geometry', () => {
        const { container } = renderClef({ startX: null });
        expect(container.querySelector('.clef-overlay')).toBeNull();
    });
});
