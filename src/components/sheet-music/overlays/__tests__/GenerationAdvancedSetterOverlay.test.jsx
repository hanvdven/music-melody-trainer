import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import GenerationAdvancedSetterOverlay from '../GenerationAdvancedSetterOverlay';
import { InstrumentSettingsProvider } from '../../../../contexts/InstrumentSettingsContext';

// Smoke test (#162): the GENERATION ADVANCED setter (now IN-STAFF MAESTRO / TANGENS style) renders
// for a staff set INCLUDING the chords balk (passing-chord toggle carousel) without throwing, shows
// the four column headers + the per-field labels below the staff, the ∞ span entry, and the §3a
// debug hit-boxes.
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

const allText = (container) => [...container.querySelectorAll('text, tspan')].map(t => t.textContent);

describe('GenerationAdvancedSetterOverlay (in-staff tangens style)', () => {
  it('renders the overlay root and the four advanced column headers', () => {
    const { container } = renderOverlay();
    expect(container.querySelector('.generation-advanced-overlay')).not.toBeNull();
    const texts = allText(container);
    expect(texts).toContain('variability');
    expect(texts).toContain('span');
    expect(texts).toContain('tuplets');
    expect(texts).toContain('smallest note');
  });

  it('renders the field labels below the staff (rhythmic variability / tuplet frequency / smallest)', () => {
    const { container } = renderOverlay();
    const texts = allText(container);
    expect(texts).toContain('rhythmic');
    // variability label embeds the live value, no literal quotes (Han Q6).
    expect(texts.some(t => t === 'variability = 30')).toBe(true);
    expect(texts).toContain('tuplet');
    expect(texts).toContain('frequency');
    expect(texts).toContain('smallest');
    expect(texts).toContain('note');
  });

  it('renders the ∞ span entry as a serif infinity glyph (Han Q1/Q2)', () => {
    const { container } = renderOverlay();
    const texts = allText(container);
    expect(texts).toContain('∞');
    // and a real interval name from LEAP_OPTIONS is shown too.
    expect(texts.some(t => /8ve|15th|4th/.test(t))).toBe(true);
  });

  it('preserves the passing-chords toggle set on the chords balk', () => {
    const { container } = renderOverlay();
    const texts = allText(container);
    expect(texts).toContain('passing chords');
    // at least one passing-chord label is rendered (e.g. the 'dia' diatonic type).
    expect(texts.some(t => ['V⁷', 'vii°', 'dia', 'sus', 'IV'].includes(t))).toBe(true);
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
