import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import GenerationSetterOverlay from '../GenerationSetterOverlay';
import { InstrumentSettingsProvider } from '../../../../contexts/InstrumentSettingsContext';

// Smoke test (Han 2026-06-22): the GENERATION setter renders for a staff set INCLUDING the chords
// balk without throwing, draws its group + per-balk steppers, and shows its debug hit boxes.
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

describe('GenerationSetterOverlay', () => {
  it('renders all four balks (chords + treble + bass + percussion) without crashing', () => {
    const { container } = renderOverlay();
    expect(container.querySelector('.generation-overlay')).not.toBeNull();
    // Three column headers.
    const headers = [...container.querySelectorAll('text')].map(t => t.textContent);
    expect(headers).toContain('melody notes');
    expect(headers).toContain('melody type');
    expect(headers).toContain('notes / measure');
  });

  it('omits the chords balk when showChordsRow is false', () => {
    const { container } = renderOverlay({ showChordsRow: false });
    // Chord complexity label ("Triad") should not appear when the chords balk is hidden.
    const texts = [...container.querySelectorAll('text')].map(t => t.textContent);
    expect(texts).not.toContain('Triad');
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
