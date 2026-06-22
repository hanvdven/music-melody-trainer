import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import GenerationAdvancedSetterOverlay from '../GenerationAdvancedSetterOverlay';
import { InstrumentSettingsProvider } from '../../../../contexts/InstrumentSettingsContext';

// Smoke test (Han 2026-06-22): the GENERATION ADVANCED setter (now CAROUSEL STYLE) renders for a
// staff set INCLUDING the chords balk (which shows the passing-chord toggle carousel) without
// throwing, and shows readable duration words for the smallest-note field.
const ctx = {
  trebleSettings: { rhythmVariability: 30, maxLeap: 12, polyMultiplier: 1, smallestNoteDenom: 4 },
  setTrebleSettings: () => {},
  bassSettings: { rhythmVariability: 0, maxLeap: null, polyMultiplier: 5, smallestNoteDenom: 8 },
  setBassSettings: () => {},
  percussionSettings: { rhythmVariability: 50, polyMultiplier: 15, smallestNoteDenom: 16 },
  setPercussionSettings: () => {},
  chordSettings: { passingChordTypes: ['secondary-dominant'] },
  setChordSettings: () => {},
};

const renderOverlay = (props = {}) => render(
  <InstrumentSettingsProvider value={ctx}>
    <svg>
      <GenerationAdvancedSetterOverlay
        startX={100} endX={700}
        trebleStart={120} bassStart={200} percussionStart={280}
        isTrebleVisible isBassVisible isPercussionVisible
        showChordsRow
        {...props}
      />
    </svg>
  </InstrumentSettingsProvider>,
);

describe('GenerationAdvancedSetterOverlay (carousel style)', () => {
  it('renders all four balks without crashing and shows the four advanced column headers', () => {
    const { container } = renderOverlay();
    expect(container.querySelector('.generation-advanced-overlay')).not.toBeNull();
    const headers = [...container.querySelectorAll('text')].map(t => t.textContent);
    expect(headers).toContain('variability');
    expect(headers).toContain('span');
    expect(headers).toContain('tuplets');
    expect(headers).toContain('smallest note');
  });

  it('shows the passing-chords field bracket for the chords balk', () => {
    const { container } = renderOverlay();
    // Field-name brackets uppercase their label; the dashed bracket text reads "PASSING CHORDS".
    const texts = [...container.querySelectorAll('text')].map(t => t.textContent);
    expect(texts).toContain('PASSING CHORDS');
  });

  it('renders the smallest-note field with READABLE duration words (not Maestro glyphs)', () => {
    const { container } = renderOverlay();
    const texts = [...container.querySelectorAll('text')].map(t => t.textContent);
    // The whole point of the rebuild — quarter/eighth/sixteenth are spelled out.
    expect(texts).toContain('quarter');
    expect(texts).toContain('sixteenth');
  });

  it('renders carousel item icons (lucide inline svg)', () => {
    const { container } = renderOverlay();
    expect(container.querySelectorAll('svg.lucide').length).toBeGreaterThan(0);
  });

  it('renders debug hit boxes when debugMode is on (§3a)', () => {
    const { container } = renderOverlay({ debugMode: true });
    const debugRects = [...container.querySelectorAll('rect')].filter(
      r => r.getAttribute('stroke') === 'orange');
    expect(debugRects.length).toBeGreaterThanOrEqual(1);
  });

  it('renders nothing without geometry', () => {
    const { container } = renderOverlay({ startX: null });
    expect(container.querySelector('.generation-advanced-overlay')).toBeNull();
  });
});
