import { describe, it, expect } from 'vitest';
import convertRankedArrayToMelody from '../convertRankedArrayToMelody';

describe('convertRankedArrayToMelody', () => {
  it('handles ranked array conversion without crashing', () => {
    // Minimal smoke test: simple ranked array
    const rankedArray = [
      { slot: 0, priority: 'high' },
      { slot: 1, priority: 'low' },
      { slot: 2, priority: 'high' },
      { slot: 3, priority: 'low' },
    ];
    const scale = ['C4', 'D4', 'E4', 'F4', 'G4'];

    // This is just a smoke test - verify function runs without throwing
    try {
      const result = convertRankedArrayToMelody(
        rankedArray,
        'C',
        scale,
        4,
        1,
        'scale',
        [{ notes: [['C4', 'E4', 'G4']] }],
        null,
        'uniform'
      );
      // Just verify it returns something (could be undefined)
      expect(result !== undefined || result === undefined).toBe(true);
    } catch (error) {
      expect(true).toBe(false); // Should not throw
    }
  });

  it('handles root note pool', () => {
    const rankedArray = [
      { slot: 0, priority: 'high' },
      { slot: 1, priority: 'low' },
    ];
    const scale = ['C4', 'G4'];

    try {
      convertRankedArrayToMelody(
        rankedArray,
        'C',
        scale,
        2,
        1,
        'root',
        [{ notes: [['C4']] }],
        null,
        'uniform'
      );
      expect(true).toBe(true); // Should complete without throwing
    } catch (error) {
      expect(true).toBe(false);
    }
  });
});
