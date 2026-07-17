import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import GenerationSetterOverlay from '../GenerationSetterOverlay';
import { InstrumentSettingsProvider } from '../../../../contexts/InstrumentSettingsContext';
import { DisplaySettingsProvider } from '../../../../contexts/DisplaySettingsContext';

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
    <DisplaySettingsProvider value={{ noteColoringMode: 'tonic_scale_keys', theme: 'default' }}>
    <svg>
      <GenerationSetterOverlay
        startX={100} endX={700}
        trebleStart={120} bassStart={200} percussionStart={280}
        isTrebleVisible isBassVisible isPercussionVisible
        showChordsRow
        // #398: default the fields to the EXPANDED carousel for the content assertions below;
        // the hidden reveal-on-interaction behaviour has its own test.
        hiddenFields={false}
        {...props}
      />
    </svg>
    </DisplaySettingsProvider>
  </InstrumentSettingsProvider>,
);

describe('GenerationSetterOverlay (carousel style)', () => {
  it('renders all four balks (chords + treble + bass + percussion) without crashing', () => {
    const { container } = renderOverlay();
    expect(container.querySelector('.generation-overlay')).not.toBeNull();
    // #295 (Han): only 'melody type' keeps a column header — the other two were
    // redundant with the field-name brackets on those carousels.
    const headers = [...container.querySelectorAll('text')].map(t => t.textContent);
    // #427 rework (Han 2026-07-13: "headers - no caps, labels: all caps"): field headers are
    // italic-serif NON-capitalised; item value labels are sans-serif ALL CAPS.
    expect(headers).toContain('melody type');
    expect(headers).toContain('note pool');
    expect(headers).toContain('notes / measure');
  });

  it('renders carousel item icons (lucide inline svg or icons8 image) and ALL-CAPS labels', () => {
    const { container } = renderOverlay();
    // #466 (Han 2026-07-17): most items now render an icons8 <image>; only the rules/strategies
    // without a mapped asset keep a lucide <svg>. Either counts as a rendered item icon.
    const iconCount = container.querySelectorAll('svg.lucide, image').length;
    expect(iconCount).toBeGreaterThan(0);
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

  // #398 (Han): hidden reveal-on-interaction. At rest each field shows only its ACTIVE value
  // (far fewer lucide icons than the fully-expanded 5-wide carousels); tapping a field's rest
  // hit box opens its full carousel (more icons appear).
  it('hidden fields show only the active value at rest, and expand on tap (#398)', () => {
    // #466: count item icons as lucide <svg> OR icons8 <image> (most items are icons8 now).
    const { container } = renderOverlay({ hiddenFields: true });
    const iconsAtRest = container.querySelectorAll('svg.lucide, image').length;

    // The expanded overlay draws many more icons (5-wide carousels for every field).
    const { container: expanded } = renderOverlay({ hiddenFields: false });
    expect(expanded.querySelectorAll('svg.lucide, image').length).toBeGreaterThan(iconsAtRest);

    // A resting field exposes a tap-to-open hit box; clicking it opens without crashing.
    const restRects = [...container.querySelectorAll('rect')].filter(
      r => r.getAttribute('fill') === 'transparent' && r.getAttribute('width'));
    expect(restRects.length).toBeGreaterThan(0);
    fireEvent.click(restRects[0]);
    expect(container.querySelector('.generation-overlay')).not.toBeNull();
  });
});
