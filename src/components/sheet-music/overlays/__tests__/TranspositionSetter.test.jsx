import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import TranspositionSetter from '../TranspositionSetter';

const renderSetter = (props = {}) => render(
    <svg>
        <TranspositionSetter
            staff="treble" clef="treble" staffStart={100}
            startX={100} endX={800} transSemitones={2}
            onSelectTrans={() => {}}
            {...props}
        />
    </svg>,
);

describe('TranspositionSetter', () => {
    it('renders the two coupled carousels (names + noteheads) without crashing', () => {
        const { container } = renderSetter();
        expect(container.querySelector('.transposition-setter-treble')).not.toBeNull();
        // Whole-note heads ('w'), name letters and the "C4 =" / "= C4" anchors are all text.
        expect(container.querySelectorAll('text').length).toBeGreaterThan(5);
    });

    it('reports a new transposition offset when a carousel item is tapped', () => {
        const onSelectTrans = vi.fn();
        const { container } = renderSetter({ onSelectTrans });
        // Every tap target is a transparent rect with a pointer cursor; tapping any one
        // must report a numeric offset (trans ± d) back to the parent.
        const hit = [...container.querySelectorAll('rect')]
            .find(r => r.getAttribute('fill') === 'transparent');
        expect(hit).not.toBeUndefined();
        fireEvent.click(hit);
        expect(onSelectTrans).toHaveBeenCalledTimes(1);
        expect(typeof onSelectTrans.mock.calls[0][0]).toBe('number');
    });

    it('renders nothing without geometry', () => {
        const { container } = renderSetter({ startX: null });
        expect(container.querySelector('.transposition-setter-treble')).toBeNull();
    });
});
