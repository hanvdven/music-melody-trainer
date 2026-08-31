import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import OscillatingText from '../OscillatingText';

// #925 (Han 2026-08-16): the per-letter wobble is rAF-driven and visual — these smoke tests just guard
// the structural contract a refactor could break.
// #UI-overhaul (Han 2026-08-27, "nooit nieuwe regels midden in een woord"): each WORD is now a
// `white-space: nowrap` `inline-block` group; individual characters are still their own spans inside it
// (for the oscillation); the whitespace between words is a plain text node (a real wrap point).
describe('OscillatingText', () => {
    const leafSpans = (container) =>
        Array.from(container.querySelectorAll('span')).filter((s) => s.querySelector('span') === null);

    it('renders one leaf span per non-space character, in order', () => {
        const { container } = render(<OscillatingText text="Hi!" scale={2.5} />);
        expect(leafSpans(container).map((s) => s.textContent)).toEqual(['H', 'i', '!']);
    });

    it('wraps each word in a nowrap group and leaves the space breakable (not in a group)', () => {
        const { container } = render(<OscillatingText text="a b" scale={2.5} />);
        // Two word groups, each `white-space: nowrap`.
        const groups = Array.from(container.querySelectorAll('span')).filter(
            (s) => s.style.whiteSpace === 'nowrap',
        );
        expect(groups.map((g) => g.textContent)).toEqual(['a', 'b']);
        // The space survives in the full text but is a plain text node, not inside a nowrap group.
        expect(container.textContent).toBe('a b');
        expect(groups.some((g) => g.textContent.includes(' '))).toBe(false);
    });

    it('renders nothing for an empty string without throwing', () => {
        const { container } = render(<OscillatingText text="" scale={2.5} />);
        expect(container.textContent).toBe('');
        expect(leafSpans(container).filter((s) => s.textContent !== '').length).toBe(0);
    });
});
