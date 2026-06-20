import { describe, it, expect } from 'vitest';
import { transposeDisplayNotes, PERCUSSION_TOKENS } from '../transposeDisplayNotes.js';
import { getNoteSemitone } from '../../theory/noteUtils.js';
import Scale from '../../model/Scale.js';

/**
 * Unit test for the display-note map extracted from Sequencer.randomizeScaleAndGenerate
 * (Han 2026-06-19, ARCHITECTURE_AUDIT §4). The contract this pins is the same one the
 * characterization test asserts at the Sequencer level: display notes are enharmonically
 * equal to (sound the same pitch class as) the audio notes, percussion/falsy tokens pass
 * through verbatim, and the output is index-parallel to the input.
 */
describe('transposeDisplayNotes', () => {
  it('maps exact scale members to their parallel display spelling', () => {
    const scaleNotes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'];
    const scaleDisplay = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'];
    const out = transposeDisplayNotes(['C4', 'F4', 'B4'], scaleNotes, scaleDisplay, 'C4');
    expect(out).toEqual(['C4', 'F4', 'B4']);
  });

  it('uses the parallel display array, not the audio array, for matched notes (enharmonic spelling)', () => {
    // Audio note "D♯4" is a scale member spelled "E♭4" on the display side.
    const scaleNotes = ['C4', 'D♯4', 'F4'];
    const scaleDisplay = ['C4', 'E♭4', 'F4'];
    const out = transposeDisplayNotes(['D♯4'], scaleNotes, scaleDisplay, 'E♭4');
    expect(out).toEqual(['E♭4']);
    // Still enharmonically equal to the audio note.
    expect(getNoteSemitone(out[0])).toBe(getNoteSemitone('D♯4'));
  });

  it('falls back to getRelativeNoteName for notes not in the scale, staying enharmonically equal', () => {
    const scaleNotes = ['C4', 'E4', 'G4'];
    const scaleDisplay = ['C4', 'E4', 'G4'];
    // A♭4 is not a scale member here → fallback path. Pitch class must be preserved.
    const out = transposeDisplayNotes(['A♭4'], scaleNotes, scaleDisplay, 'A♭4');
    expect(typeof out[0]).toBe('string');
    expect(getNoteSemitone(out[0])).toBe(getNoteSemitone('A♭4'));
  });

  it('passes percussion tokens and falsy entries through verbatim', () => {
    const out = transposeDisplayNotes(
      ['k', 'c', 'b', 'hh', 's', '/', null, undefined],
      ['C4'], ['C4'], 'C4'
    );
    expect(out).toEqual(['k', 'c', 'b', 'hh', 's', '/', null, undefined]);
  });

  it("does NOT treat 'r' (rest) as a percussion token — preserves historical inline behaviour", () => {
    // The inline guard never listed 'r'; it must go through the indexOf/fallback path,
    // not pass through verbatim.
    expect(PERCUSSION_TOKENS).not.toContain('r');
  });

  it('output is index-parallel to the input (same length, position-preserving)', () => {
    const scale = Scale.defaultScale();
    const input = [scale.notes[0], 'hh', scale.notes[2], null];
    const out = transposeDisplayNotes(input, scale.notes, scale.displayNotes, scale.tonic);
    expect(out.length).toBe(input.length);
    expect(out[1]).toBe('hh');
    expect(out[3]).toBe(null);
  });

  it('every pitched output note is enharmonically equal to its audio note across a real scale', () => {
    const scale = Scale.defaultScale();
    const audio = scale.notes;
    const out = transposeDisplayNotes(audio, scale.notes, scale.displayNotes, scale.tonic);
    for (let i = 0; i < audio.length; i++) {
      expect(getNoteSemitone(out[i])).toBe(getNoteSemitone(audio[i]));
    }
  });
});
