import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import GenerationAdvancedSetterOverlay from '../GenerationAdvancedSetterOverlay';
import { InstrumentSettingsProvider } from '../../../../contexts/InstrumentSettingsContext';

// Smoke test (Han 2026-06-22): the GENERATION ADVANCED setter renders for a staff set INCLUDING the
// chords balk (which shows the passing-chord cycler) without throwing.
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

describe('GenerationAdvancedSetterOverlay', () => {
  it('renders all four balks without crashing and shows the four advanced column headers', () => {
    const { container } = renderOverlay();
    expect(container.querySelector('.generation-advanced-overlay')).not.toBeNull();
    const headers = [...container.querySelectorAll('text')].map(t => t.textContent);
    expect(headers).toContain('variability');
    expect(headers).toContain('span');
    expect(headers).toContain('tuplets');
    expect(headers).toContain('smallest note');
  });

  it('shows the passing-chords sub-header for the chords balk', () => {
    const { container } = renderOverlay();
    const texts = [...container.querySelectorAll('text')].map(t => t.textContent);
    expect(texts).toContain('passing chords');
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
