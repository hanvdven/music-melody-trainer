import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { RoundStateProvider } from '../../../contexts/RoundStateContext';
import RamMascot from '../RamMascot';

const renderRam = (inputTestState = null, props = {}) => render(
    <RoundStateProvider
        isOddRound
        showNotes
        inputTestState={inputTestState}
        inputTestSubMode="note"
        setInputTestSubMode={() => {}}
    >
        <svg>
            <RamMascot {...props} />
        </svg>
    </RoundStateProvider>,
);

describe('RamMascot (#297)', () => {
    it('renders the ram artwork in the header group (horns in the accent colour)', () => {
        const { container } = renderRam();
        expect(container.querySelector('.ram-mascot')).not.toBeNull();
        const horns = [...container.querySelectorAll('path')]
            .filter(p => p.getAttribute('stroke')?.includes('--accent-yellow'));
        expect(horns.length).toBe(2);
        // Idle bob class present (CSS keyframes in SheetMusic.css).
        expect(container.querySelector('.ram-mascot-bob')).not.toBeNull();
    });

    it('bleats on tap (speech bubble appears, rate-limited)', () => {
        vi.useFakeTimers();
        const { container } = renderRam();
        const hit = container.querySelector('.ram-mascot rect[fill="transparent"]');
        fireEvent.click(hit);
        expect([...container.querySelectorAll('text')].some(t => t.textContent === 'Beh!')).toBe(true);
        vi.useRealTimers();
    });

    it('draws the §3a debug hit box only in debug mode', () => {
        const orange = (c) => [...c.querySelectorAll('rect')].filter(r => r.getAttribute('fill') === 'orange').length;
        const { container: off } = renderRam();
        const { container: on } = renderRam(null, { debugMode: true });
        expect(orange(off)).toBe(0);
        expect(orange(on)).toBe(1);
    });

    it('shows the oef expression after a miss (lastMissAt bump)', () => {
        const { container, rerender } = renderRam({ correctNotes: 0, lastMissAt: null });
        rerender(
            <RoundStateProvider isOddRound showNotes inputTestSubMode="note"
                setInputTestSubMode={() => {}}
                inputTestState={{ correctNotes: 0, lastMissAt: 12345 }}>
                <svg><RamMascot /></svg>
            </RoundStateProvider>,
        );
        // oef eyes are two >< polyline paths; the neutral dots disappear.
        expect(container.querySelectorAll('circle[r="1.2"]').length).toBe(0);
    });
});
