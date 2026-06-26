import { describe, it, expect } from 'vitest';
import { filterPercussionByEnabledPads } from '../generateBackbeat';

describe('generateBackbeat', () => {
  it('filters percussion by enabled pads', () => {
    const dummyMelody = {
      notes: ['k', 's', 'hh', 'k', 's', 'hh'],
      offsets: [0, 1, 2, 3, 4, 5],
      durations: [1, 1, 1, 1, 1, 1],
    };
    const enabledPads = ['k', 's']; // hh disabled

    const result = filterPercussionByEnabledPads(dummyMelody, enabledPads);

    expect(result).toBeDefined();
    expect(result.notes).toBeDefined();
    // Filtered result should not have 'hh'
    expect(result.notes.every(note => note === 'r' || enabledPads.includes(note))).toBe(true);
  });

  it('handles empty enabled pads', () => {
    const dummyMelody = {
      notes: ['k', 's', 'hh'],
      offsets: [0, 1, 2],
      durations: [1, 1, 1],
    };

    const result = filterPercussionByEnabledPads(dummyMelody, []);
    expect(result).toBeDefined();
    expect(result.notes).toBeDefined();
  });
});
