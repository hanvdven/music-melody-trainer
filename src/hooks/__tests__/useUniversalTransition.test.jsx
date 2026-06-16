import React, { useRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import useUniversalTransition from '../useUniversalTransition';

// Minimal harness mirroring the SheetMusic structure the hook queries: a `.notes-transition`
// group with a flyable [data-mel] note inside.
function Harness({ transitionKey }) {
  const svgRef = useRef(null);
  useUniversalTransition(svgRef, transitionKey, 100);
  return (
    <svg ref={svgRef}>
      <g className="notes-transition">
        <rect data-mel="" />
      </g>
    </svg>
  );
}

describe('useUniversalTransition', () => {
  it('does not animate on mount and keeps the group mounted', () => {
    const { container } = render(<Harness transitionKey={0} />);
    expect(container.querySelector('.notes-transition')).not.toBeNull();
    // No overlay clone inserted on the very first render (mount value ⇒ no fire).
    expect(container.querySelectorAll('.notes-transition').length).toBe(1);
  });

  it('overlays an old clone and flies the live group in when the key changes', () => {
    const { container, rerender } = render(<Harness transitionKey={0} />);
    // Bump the key → arms a cascade: a frozen clone is inserted as a sibling overlay.
    rerender(<Harness transitionKey={1} />);
    const groups = container.querySelectorAll('.notes-transition');
    expect(groups.length).toBe(2); // live group + old clone overlay
    const live = container.querySelector('svg').firstChild;
    // The live group's flyable note starts shifted to the right (slides to 0 over the tween).
    const note = live.querySelector('[data-mel]');
    expect(note.style.transform).toBe('translateX(100px)');
  });

  it('tears down a previous cascade clone before arming a new one', () => {
    const { container, rerender } = render(<Harness transitionKey={0} />);
    rerender(<Harness transitionKey={1} />);
    expect(container.querySelectorAll('.notes-transition').length).toBe(2);
    // A second trigger before the first finished must not stack clones.
    rerender(<Harness transitionKey={2} />);
    expect(container.querySelectorAll('.notes-transition').length).toBe(2);
  });

  it('removes the overlay clone on unmount', () => {
    const { container, rerender, unmount } = render(<Harness transitionKey={0} />);
    rerender(<Harness transitionKey={1} />);
    expect(container.querySelectorAll('.notes-transition').length).toBe(2);
    unmount();
    expect(container.querySelectorAll('.notes-transition').length).toBe(0);
  });
});
