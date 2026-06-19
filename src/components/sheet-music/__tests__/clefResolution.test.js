// Smoke tests for the pure clef-resolution helpers extracted from SheetMusic.jsx
// (Han 2026-06-19, ARCHITECTURE_AUDIT §4 / CLAUDE.md §7b "add at least one smoke test for an
// extracted pure helper in the same PR"). These guard the behaviour-preserving extraction: each
// function is exercised with a couple of representative inputs covering its decision branches.

import { describe, it, expect } from 'vitest';
import {
  getClefShiftValue,
  calculateOptimalClef,
  octaveAdjustedClef,
  clefForScreen,
  VOCAL_CLEF_TYPES,
  VOCAL_RANGE_MODES,
} from '../clefResolution';

describe('getClefShiftValue', () => {
  it('returns 0 for the base treble/bass clefs', () => {
    expect(getClefShiftValue('treble')).toBe(0);
    expect(getClefShiftValue('bass')).toBe(0);
  });

  it('returns the table value for vocal and ottava clefs', () => {
    expect(getClefShiftValue('alto')).toBe(-30);
    expect(getClefShiftValue('treble8va')).toBe(35);
    expect(getClefShiftValue('bass15vb')).toBe(-70);
  });

  it('falls back to 0 for unknown clef ids', () => {
    expect(getClefShiftValue('does-not-exist')).toBe(0);
  });
});

describe('calculateOptimalClef', () => {
  it('passes through the off sentinel and vocal clefs untouched', () => {
    expect(calculateOptimalClef('off', ['C4', 'E4'], 'treble')).toBe('off');
    expect(calculateOptimalClef('alto', ['C8', 'C8'], 'treble')).toBe('alto');
    // Vocal range mode also short-circuits even on a non-vocal clef id.
    expect(calculateOptimalClef('treble', ['C8'], 'treble', 'Soprano')).toBe('treble');
  });

  it('keeps the active clef when there are no notes', () => {
    expect(calculateOptimalClef('treble', [], 'treble')).toBe('treble');
    expect(calculateOptimalClef('treble', null, 'treble')).toBe('treble');
  });

  it('stays in the base clef when notes sit in the staff range', () => {
    // Mid-treble notes (A3-C6 range) → no ottava added.
    expect(calculateOptimalClef('treble', ['C4', 'E4', 'G4'], 'treble')).toBe('treble');
  });

  it('adds an ottava when notes are far above the staff', () => {
    // Very high notes should pick a treble ottava-up variant, not bare treble.
    const result = calculateOptimalClef('treble', ['C7', 'E7', 'G7'], 'treble');
    expect(result.startsWith('treble')).toBe(true);
    expect(result).not.toBe('treble');
    expect(result).toMatch(/(8va|15va)$/);
  });
});

describe('octaveAdjustedClef', () => {
  it('passes through off and vocal clefs', () => {
    expect(octaveAdjustedClef('off', 2)).toBe('off');
    expect(octaveAdjustedClef('alto', 2)).toBe('alto');
    expect(octaveAdjustedClef('treble', 1, 'Bass')).toBe('treble');
  });

  it('returns the base clef unchanged for octave 0', () => {
    expect(octaveAdjustedClef('treble', 0)).toBe('treble');
  });

  it('appends the ottava suffix for non-zero octaves (clamped to ±2)', () => {
    expect(octaveAdjustedClef('treble', 1)).toBe('treble8va');
    expect(octaveAdjustedClef('treble', -1)).toBe('treble8vb');
    expect(octaveAdjustedClef('bass', 2)).toBe('bass15va');
    expect(octaveAdjustedClef('bass', -5)).toBe('bass15vb'); // clamped to -2
  });

  it('strips an existing ottava before re-applying', () => {
    expect(octaveAdjustedClef('treble8vb', 1)).toBe('treble8va');
  });
});

describe('clefForScreen', () => {
  const trebleSettings = { transpositionOctave: 1, range: { min: 'C4', max: 'C6' }, rangeMode: null };

  it('uses transposition octave in normal (non-edit) mode', () => {
    // rangeEditMode = clefEditMode = false → octaveAdjustedClef from transpositionOctave.
    expect(clefForScreen('treble', trebleSettings, 'treble', 0, false, false)).toBe('treble8va');
  });

  it('strips the ottava to the base family in clef-edit mode', () => {
    expect(clefForScreen('treble8va', trebleSettings, 'treble', 0, false, true)).toBe('treble');
  });

  it('computes an optimal clef from the range in range-edit mode', () => {
    const result = clefForScreen('treble', trebleSettings, 'treble', 0, true, false);
    expect(typeof result).toBe('string');
    expect(result.startsWith('treble')).toBe(true);
  });
});

describe('vocal constant sets', () => {
  it('expose the vocal clef + range-mode membership tables', () => {
    expect(VOCAL_CLEF_TYPES.has('soprano')).toBe(true);
    expect(VOCAL_CLEF_TYPES.has('treble')).toBe(false);
    expect(VOCAL_RANGE_MODES.has('Baritone')).toBe(true);
    expect(VOCAL_RANGE_MODES.has('Trumpet')).toBe(false);
  });
});
