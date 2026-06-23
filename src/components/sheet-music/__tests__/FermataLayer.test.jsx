import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import FermataLayer from '../FermataLayer';

const svg = (ui) => render(<svg>{ui}</svg>);

// Geometry shared by all cases. getXLocal(index) = startX + (index - 1) * nw,
// then +5. With startX=0, nw=10, a fermata whose tick lands at offsets index 2
// → x = 0 + (2 - 1) * 10 + 5 = 15.
const GEO = { offsets: [0, 24, 48, 72], nw: 10, startX: 0 };

describe('FermataLayer', () => {
  it('renders nothing when the melody has no fermatas', () => {
    const { container } = svg(
      <FermataLayer melody={{ fermatas: [], offsets: [0] }} glyphY={10} {...GEO} />
    );
    expect(container.querySelector('text')).toBeNull();
  });

  it('renders nothing when melody.offsets is missing', () => {
    const { container } = svg(
      <FermataLayer melody={{ fermatas: [{ tick: 48, hold: 2 }] }} glyphY={10} {...GEO} />
    );
    expect(container.querySelector('text')).toBeNull();
  });

  it('renders a Maestro U glyph at the resolved x for a fermata on a known tick', () => {
    const { container } = svg(
      <FermataLayer
        melody={{ fermatas: [{ tick: 48, hold: 2 }], offsets: [0, 24, 48] }}
        glyphY={10}
        {...GEO}
      />
    );
    const t = container.querySelector('text');
    expect(t).not.toBeNull();
    expect(t.textContent).toBe('U');
    expect(t.getAttribute('font-family')).toBe('Maestro');
    // tick 48 → offsets index 2 → x = (2 - 1) * 10 + 5 = 15
    expect(t.getAttribute('x')).toBe('15');
    expect(t.getAttribute('y')).toBe('10');
  });

  it('skips fermatas whose tick is not present in offsets', () => {
    const { container } = svg(
      <FermataLayer
        melody={{ fermatas: [{ tick: 999, hold: 1 }], offsets: [0, 24, 48] }}
        glyphY={10}
        {...GEO}
      />
    );
    expect(container.querySelector('text')).toBeNull();
  });
});
