import React, { useRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import useClefRefly from '../useClefRefly';

// Minimal harness mirroring the SheetMusic clef-overlay structure the hook queries.
function Harness({ trebleKey, active = true }) {
  const svgRef = useRef(null);
  useClefRefly(svgRef, { treble: trebleKey, bass: 'bass|C|' }, active, 100);
  return (
    <svg ref={svgRef}>
      <g className="clef-overlay">
        <g className="clef-row clef-row-treble"><rect data-fly="" /></g>
        <g className="clef-row clef-row-bass"><rect data-fly="" /></g>
      </g>
    </svg>
  );
}

describe('useClefRefly', () => {
  it('does not throw and keeps the row mounted when a clef key changes', () => {
    const { container, rerender } = render(<Harness trebleKey="treble|C|" />);
    expect(container.querySelector('.clef-row-treble')).not.toBeNull();
    // Change the treble clef identity → triggers the single-staff refly.
    rerender(<Harness trebleKey="treble8va|C|" />);
    expect(container.querySelector('.clef-row-treble')).not.toBeNull();
    // The bass row, whose key didn't change, is untouched and present.
    expect(container.querySelector('.clef-row-bass')).not.toBeNull();
  });

  it('is inert when the overlay is not active', () => {
    const { container, rerender } = render(<Harness trebleKey="treble|C|" active={false} />);
    rerender(<Harness trebleKey="bass|C|" active={false} />);
    expect(container.querySelector('.clef-row-treble')).not.toBeNull();
  });
});
