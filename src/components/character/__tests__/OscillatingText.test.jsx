import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import OscillatingText from '../OscillatingText';

// #925 (Han 2026-08-16, "letters van tekst moeten een heel klein beetje oscilleren (individueel)"):
// smoke tests only — the actual wobble is rAF-driven and visual, per CLAUDE.md §7b this just guards the
// structural contract (one span per character, in order, whitespace preserved) a refactor could break.
describe('OscillatingText', () => {
    it('renders one span per character, in order', () => {
        const { container } = render(<OscillatingText text="Hi!" scale={2.5} />);
        const spans = container.querySelectorAll('span > span');
        expect(spans.length).toBe(3);
        expect(Array.from(spans).map((s) => s.textContent)).toEqual(['H', 'i', '!']);
    });

    it('preserves spaces as their own character span', () => {
        const { container } = render(<OscillatingText text="a b" scale={2.5} />);
        const spans = container.querySelectorAll('span > span');
        expect(spans.length).toBe(3);
        expect(spans[1].textContent).toBe(' ');
    });

    it('renders nothing for an empty string without throwing', () => {
        const { container } = render(<OscillatingText text="" scale={2.5} />);
        expect(container.querySelectorAll('span > span').length).toBe(0);
    });
});
