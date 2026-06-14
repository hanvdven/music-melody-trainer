import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import OttavaMarker from '../OttavaMarker';

const desc = (ottava, below = false) => ({
    token: `${ottava}|${below ? 'b' : 'a'}`,
    x: 13, y: 20, fontSize: ottava === '15' ? '23' : '14',
    fill: 'var(--text-primary)', dx: '10', glyph: ottava,
});

const svg = (ui) => render(<svg>{ui}</svg>);

describe('OttavaMarker', () => {
    it('renders nothing when there is no ottava', () => {
        const { container } = svg(<OttavaMarker desc={null} />);
        expect(container.querySelector('text')).toBeNull();
    });

    it('renders the glyph when an ottava is present', () => {
        const { container } = svg(<OttavaMarker desc={desc('8va')} />);
        const t = container.querySelector('text');
        expect(t).not.toBeNull();
        expect(t.textContent).toBe('8va');
        expect(t.getAttribute('x')).toBe('13');
    });

    it('keeps the marker mounted across a value change (cross-fade, not unmount)', () => {
        const { container, rerender } = svg(<OttavaMarker desc={desc('8va')} />);
        rerender(<svg><OttavaMarker desc={desc('15')} /></svg>);
        // During the fade the element stays in the DOM (opacity-driven, no remount).
        expect(container.querySelector('text')).not.toBeNull();
    });
});
