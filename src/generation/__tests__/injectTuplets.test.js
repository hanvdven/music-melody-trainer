import { describe, it, expect } from 'vitest';
import { injectTuplets } from '../injectTuplets';

describe('injectTuplets', () => {
  it('injects tuplets into a ranked array without crashing', () => {
    const piecewiseSum = [
      { slot: 0, priority: 'high' },
      { slot: 1, priority: 'low' },
      { slot: 2, priority: 'high' },
      { slot: 3, priority: 'low' },
    ];

    const result = injectTuplets(
      piecewiseSum,
      4,          // slotsPerMeasure
      1,          // numMeasures
      [4, 4],     // timeSignature
      4,          // smallestNoteDenom
      0.3,        // tripletProb
      false,      // tripletOnly
      4           // notesPerMeasure
    );

    expect(result).toBeDefined();
    expect(result.modified).toBeDefined();
    expect(Array.isArray(result.modified)).toBe(true);
    expect(result.tupletGroups).toBeDefined();
    expect(Array.isArray(result.tupletGroups)).toBe(true);
  });

  it('returns unmodified array when triplet probability is 0', () => {
    const piecewiseSum = [
      { slot: 0, priority: 'high' },
      { slot: 1, priority: 'low' },
    ];

    const result = injectTuplets(
      piecewiseSum,
      2,
      1,
      [4, 4],
      4,
      0,          // tripletProb = 0
      false,
      2
    );

    expect(result.modified).toEqual(piecewiseSum);
    expect(result.tupletGroups.length).toBe(0);
  });

  it('handles odd time signatures (5/4)', () => {
    const piecewiseSum = new Array(20).fill(null).map((_, i) => ({
      slot: i,
      priority: i % 2 === 0 ? 'high' : 'low',
    }));

    const result = injectTuplets(
      piecewiseSum,
      20,
      1,
      [5, 4],
      4,
      0.2,
      false,
      5
    );

    expect(result).toBeDefined();
    expect(result.modified).toBeDefined();
  });
});
