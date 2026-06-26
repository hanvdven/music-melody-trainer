import { describe, it, expect } from 'vitest';
import { generateRankedRhythm } from '../generateRankedRhythm';

describe('generateRankedRhythm', () => {
  it('generates a ranked rhythm array for 4/4 time signature', () => {
    const result = generateRankedRhythm(
      1,             // numMeasures
      [4, 4],        // timeSignature
      4,             // notesPerMeasure
      4,             // smallestNoteDenom
      0,             // rhythmVariability
      'uniform'      // randomizationRules (can be string or object)
    );

    expect(result).toBeDefined();
    expect(result.rankedArray).toBeDefined();
    expect(Array.isArray(result.rankedArray)).toBe(true);
    expect(result.rankedArray.length).toBeGreaterThan(0);
  });

  it('generates rhythm for 3/4 time signature', () => {
    const result = generateRankedRhythm(
      2,             // numMeasures
      [3, 4],        // timeSignature (waltz)
      3,             // notesPerMeasure
      4,             // smallestNoteDenom
      0.5,           // rhythmVariability
      'emphasize-roots'
    );

    expect(result).toBeDefined();
    expect(result.rankedArray).toBeDefined();
    expect(result.rankedArray.length).toBeGreaterThan(0);
  });

  it('handles odd time signatures like 5/4', () => {
    const result = generateRankedRhythm(
      1,
      [5, 4],        // 5/4 time
      5,
      4,
      0,
      'uniform'
    );

    expect(result).toBeDefined();
    expect(result.rankedArray).toBeDefined();
    expect(result.rankedArray.length).toBeGreaterThan(0);
  });

  it('returns result for [2,4] time signature', () => {
    const result = generateRankedRhythm(
      1,
      [2, 4],        // simple duple
      2,
      4,
      0,
      'uniform'
    );

    expect(result).toBeDefined();
    expect(result.rankedArray).toBeDefined();
  });
});
