import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import GenerationSetterOverlay from '../GenerationSetterOverlay';
import { InstrumentSettingsProvider } from '../../../../contexts/InstrumentSettingsContext';

// Smoke test (Han 2026-06-22): the GENERATION setter (now CAROUSEL STYLE) renders for a staff set
// INCLUDING the chords balk without throwing, draws its column headers + per-balk field carousels,
// and shows its debug hit boxes (§3a — the NonLinearCarousel hit window).
const ctx = {
  trebleSettings: { notePool: 'scale', randomizationRule: 'uniform', notesPerMeasure: 4 },
  setTrebleSettings: () => {},
  bassSettings: { notePool: 'root', randomizationRule: 'walking_bass', notesPerMeasure: 2 },
  setBassSettings: () => {},
  percussionSettings: { enabledPads: [], randomizationRule: 'backbeat', notesPerMeasure: 4 },
  setPercussionSettings: () => {},
  chordSettings: { complexity: 'triad', strategy: 'ii-v-i', chordCount: 1 },
  setChordSettings: () => {},
};

const renderOverlay = (props = {}) => render(
  <InstrumentSettingsProvider value={ctx}>
    <svg>
      <GenerationSetterOverlay
        startX={100} endX={700}
        trebleStart={120} bassStart={200} percussionStart={280}
        isTrebleVisible isBassVisible isPercussionVisible
        showChordsRow
        {...props}
      />
    </svg>
  </InstrumentSettingsProvider>,
);

describe('GenerationSetterOverlay (carousel style)', () => {
  it('renders all four balks (chords + treble + bass + percussion) without crashing', () => {
    const { container } = renderOverlay();
    expect(container.querySelector('.generation-overlay')).not.toBeNull();
    // #295 (Han): only 'melody type' keeps a column header — the other two were
    // redundant with the field-name brackets on those carousels.
    const headers = [...container.querySelectorAll('text')].map(t => t.textContent);
    expect(headers).toContain('melody type');
    expect(headers).not.toContain('melody notes');
    expect(headers).not.toContain('notes / measure');
    // The field-name brackets still label the fields (uppercased by buildBracket).
    expect(headers).toContain('NOTE POOL');
    expect(headers).toContain('NOTES / MEASURE');
  });

  it('renders carousel item icons (lucide inline svg) and ALL-CAPS labels', () => {
    const { container } = renderOverlay();
    // Rule/percussion items still draw a lucide <svg> (class "lucide") inside the sheet svg.
    expect(container.querySelectorAll('svg.lucide').length).toBeGreaterThan(0);
    // Note-pool labels show as ALL-CAPS carousel item text (#295 + standing caps CR);
    // the item CONTENT is now inline staff notes (Maestro noteheads).
    const texts = [...container.querySelectorAll('text')].map(t => t.textContent);
    expect(texts).toContain('SCALE');
    const maestro = [...container.querySelectorAll('text')]
      .filter(t => t.getAttribute('font-family') === 'Maestro');
    expect(maestro.length).toBeGreaterThan(0);
  });

  it('draws category/field brackets (blokhaken) above the carousels', () => {
    const { container } = renderOverlay();
    // Dashed brackets are <path stroke-dasharray="4,3">.
    const dashed = [...container.querySelectorAll('path')].filter(
      p => p.getAttribute('stroke-dasharray') === '4,3');
    expect(dashed.length).toBeGreaterThan(0);
  });

  it('renders debug hit boxes when debugMode is on (§3a)', () => {
    const { container } = renderOverlay({ debugMode: true });
    const debugRects = [...container.querySelectorAll('rect')].filter(
      r => r.getAttribute('stroke') === 'orange');
    expect(debugRects.length).toBeGreaterThanOrEqual(1);
  });

  it('renders nothing without geometry', () => {
    const { container } = renderOverlay({ startX: null });
    expect(container.querySelector('.generation-overlay')).toBeNull();
  });
});
