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

  it('does NOT render the redundant below-staff field labels (Han UAT: column header suffices)', () => {
    const { container } = renderOverlay();
    const texts = allText(container);
    // The redundant 'rhythmic variability = NN' / 'tuplet'/'frequency' / 'smallest'/'note' labels are
    // removed; the column headers above name each field instead.
    expect(texts).not.toContain('rhythmic');
    expect(texts.some(t => /variability = \d/.test(t))).toBe(false);
    expect(texts).not.toContain('frequency');
  });

  it('labels ONLY the active span interval name, not every head (Han UAT)', () => {
    const { container } = renderOverlay();
    const texts = allText(container);
    // treble maxLeap=12 → '8ve' is the active interval label (exactly one such interval-name label).
    const intervalLabels = texts.filter(t => ['5th', '6th', '7th', '8ve', '9th', '10th', '11th', '12th', '15th'].includes(t));
    // One active interval label per visible melodic balk (treble + bass) — far fewer than the full fan.
    expect(intervalLabels.length).toBeGreaterThanOrEqual(1);
    expect(intervalLabels.length).toBeLessThanOrEqual(2);
    expect(intervalLabels).toContain('8ve');
  });

  it('renders the ∞ span entry as a serif infinity glyph (Han Q1/Q2)', () => {
    const { container } = renderOverlay();
    const texts = allText(container);
    // bass maxLeap=null (∞) → the ∞ glyph is the active head; treble fan also shows ∞ as a head.
    expect(texts).toContain('∞');
  });

  it('preserves the passing-chords toggle set, visible even without showChordsRow (Han UAT)', () => {
    // Decoupled from showChordsRow — the chord setter must show whenever the overlay is mounted.
    const { container } = renderOverlay({ showChordsRow: false });
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
