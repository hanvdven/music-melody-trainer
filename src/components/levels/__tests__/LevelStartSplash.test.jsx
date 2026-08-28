import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LevelStartSplash from '../LevelStartSplash';

describe('LevelStartSplash (#661 — tanh carousel level picker)', () => {
    it('renders the carousel defaulted to Level 1 and calls onStart with the chosen level on Start', () => {
        const onStart = vi.fn();
        const onClose = vi.fn();
        const { container, getByText } = render(<LevelStartSplash onStart={onStart} onClose={onClose} />);
        expect(container.querySelector('.ls-overlay')).not.toBeNull();
        expect(getByText('Level 1')).toBeTruthy();   // default selection's name shown in .ls-sub
        fireEvent.click(getByText('▶ Start'));
        // #1100: onStart's 2nd arg is the picked mode-variant letter, `null` = "standaard" (none picked).
        expect(onStart).toHaveBeenCalledWith(1, null);
    });

    // #1100 (split from #1087): a/b/c/f mode-variant picker, shown for sideScroll levels (Level 1 is one).
    it('picking a mode-variant letter passes it through to onStart', () => {
        const onStart = vi.fn();
        const { getByTitle, getByText } = render(<LevelStartSplash onStart={onStart} onClose={() => {}} />);
        fireEvent.click(getByTitle('Langzaam'));   // letter 'b'
        fireEvent.click(getByText('▶ Start'));
        expect(onStart).toHaveBeenCalledWith(1, 'b');
    });

    // Bug fix (Han 2026-08-23, "wat is E? is me niet geheel duidelijk"): the letter's meaning must be
    // visible WITHOUT hovering (the `title` tooltip alone isn't discoverable) — before AND after picking.
    it('always shows what the current variant selection means, in plain text', () => {
        const { getByText, getByTitle } = render(<LevelStartSplash onStart={() => {}} onClose={() => {}} />);
        expect(getByText('Standaard')).toBeTruthy();   // nothing picked yet
        fireEvent.click(getByTitle('Langzaam'));   // letter 'b'
        expect(getByText('Langzaam')).toBeTruthy();
    });

    // #1155 (Han 2026-08-24, "waarom is er geen call-response optie bij de liederen?"): call-response
    // (d/e) is now available for songId levels too — it slices the song's own measures instead of
    // replacing them with generated content, so there's no longer a reason to hide these letters.
    it('offers call-response letters (d/e) for a songId level (Level 1)', () => {
        const { queryByTitle } = render(<LevelStartSplash onStart={() => {}} onClose={() => {}} />);
        expect(queryByTitle('Call-response (1 maat)')).not.toBeNull();
        expect(queryByTitle('Call-response (2 maten)')).not.toBeNull();
    });

    // Icon rollout (Han 2026-08-24, "vervang het vakje voor het icoontje, geen letter meer"): every
    // variant button shows its status-effect icon (img with a real src), no bare-letter text content.
    it('renders every variant letter as an icon image, not text', () => {
        const { getByTitle } = render(<LevelStartSplash onStart={() => {}} onClose={() => {}} />);
        const btn = getByTitle('Langzaam');
        expect(btn.textContent.trim()).toBe('');   // no letter text anywhere in the button
        const img = btn.querySelector('img');
        expect(img).not.toBeNull();
        expect(img.getAttribute('src')).toBeTruthy();
    });

    // #1153/#1154 (Han 2026-08-25): g (Modulated) and h (Randomized Notes) are IMPLEMENTED.
    // #1102 (Han 2026-08-28): 'i' (Adaptive speed) is now implemented too — no reserved/disabled slot is
    // left in the picker at all. Level 1 (the splash's default selection) is a songId level, so h is
    // offered here too (h is excluded only for procedural levels, #1154).
    it('every offered letter — g, h and i included — is enabled; no reserved disabled slots remain', () => {
        const { getByTitle } = render(<LevelStartSplash onStart={() => {}} onClose={() => {}} />);
        expect(getByTitle('Modulated')).not.toBeDisabled();
        expect(getByTitle('Randomized Notes')).not.toBeDisabled();
        expect(getByTitle('Adaptive speed')).not.toBeDisabled();
        expect(getByTitle('Langzaam')).not.toBeDisabled();
    });

    // #1153: picking g passes the letter through to onStart exactly like any other variant — the
    // per-level random-mode pick itself is levels.js's job (applyLevelVariant), already covered there.
    it('picking g (Modulated) passes it through to onStart', () => {
        const onStart = vi.fn();
        const { getByTitle, getByText } = render(<LevelStartSplash onStart={onStart} onClose={() => {}} />);
        fireEvent.click(getByTitle('Modulated'));
        fireEvent.click(getByText('▶ Start'));
        expect(onStart).toHaveBeenCalledWith(1, 'g');
    });

    it('closes via the Sluiten button and via the overlay backdrop', () => {
        const onClose = vi.fn();
        const { getByText, container } = render(<LevelStartSplash onStart={() => {}} onClose={onClose} />);
        fireEvent.click(getByText('Sluiten'));
        expect(onClose).toHaveBeenCalledTimes(1);
        fireEvent.click(container.querySelector('.ls-overlay'));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('clicking inside the card does not close it (stopPropagation)', () => {
        const onClose = vi.fn();
        const { container } = render(<LevelStartSplash onStart={() => {}} onClose={onClose} />);
        fireEvent.click(container.querySelector('.ls-card'));
        expect(onClose).not.toHaveBeenCalled();
    });
});
