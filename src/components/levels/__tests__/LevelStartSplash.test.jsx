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
        expect(onStart).toHaveBeenCalledWith(1);
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
