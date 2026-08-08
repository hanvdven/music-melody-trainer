import { describe, it, expect } from 'vitest';
import { generateLevelBackingChunk } from '../generateLevelBackingChunk.js';
import Scale from '../../model/Scale.js';
import InstrumentSettings from '../../model/InstrumentSettings.js';
import { LEVEL_BASS_SIMPLE } from '../../levels/levels.js';
import { TICKS_PER_WHOLE } from '../../constants/timing.js';

// #663 (Han 2026-08-03): smoke test for the level-backing JIT chunk generator — bass/metronome
// are now generated LEVEL_LEAD_IN_BARS measures at a time via the REAL MelodyGenerator pipeline
// (no hardcoded pattern), so this asserts the generic structural contract (tiles the requested
// span, no per-instrument special-casing) rather than exact random content.
describe('generateLevelBackingChunk', () => {
  const timeSignature = [4, 4];
  const measureLengthTicks = (TICKS_PER_WHOLE * timeSignature[0]) / timeSignature[1];
  const bassSettings = { ...InstrumentSettings.defaultBassInstrumentSettings(), ...LEVEL_BASS_SIMPLE, instrument: 'cello' };

  it('generates a bass + metronome melody spanning exactly chunkMeasures, with no chord context', () => {
    const { bass, metronome } = generateLevelBackingChunk({
      bassScale: Scale.defaultScale().generateBassScale(),
      timeSignature,
      chunkMeasures: 2,
      bassSettings,
      chordProgression: null,
      chordChunkStartMeasure: 0,
      measureLengthTicks,
      runId: 'test-chunk',
    });

    expect(bass.notes.length).toBeGreaterThan(0);
    expect(metronome.notes.length).toBeGreaterThan(0);
    // Both tile exactly the requested 2-measure span (no note starts at or past the end).
    const chunkTicks = 2 * measureLengthTicks;
    for (const o of bass.offsets) expect(o == null || o < chunkTicks).toBe(true);
    for (const o of metronome.offsets) expect(o == null || o < chunkTicks).toBe(true);
    // Metronome ticks every beat (notesPerMeasure = timeSignature[0]) over 2 measures.
    expect(metronome.offsets.filter((o) => o != null).length).toBe(2 * timeSignature[0]);
  });

  it('metronomeMeasures independently shortens/silences the metronome without affecting bass (#663 follow-up: metronome starts at measure 0, bass/timpani at -1)', () => {
    const { bass, metronome } = generateLevelBackingChunk({
      bassScale: Scale.defaultScale().generateBassScale(),
      timeSignature,
      chunkMeasures: 2,
      metronomeMeasures: 1,
      bassSettings,
      chordProgression: null,
      chordChunkStartMeasure: 0,
      measureLengthTicks,
      runId: 'test-chunk-asym',
    });
    expect(bass.notes.length).toBeGreaterThan(0);   // bass unaffected by metronomeMeasures
    expect(metronome.offsets.every((o) => o == null || o < measureLengthTicks)).toBe(true);   // metronome only measure 1

    const silent = generateLevelBackingChunk({
      bassScale: Scale.defaultScale().generateBassScale(),
      timeSignature,
      chunkMeasures: 2,
      metronomeMeasures: 0,
      bassSettings,
      chordProgression: null,
      chordChunkStartMeasure: 0,
      measureLengthTicks,
      runId: 'test-chunk-silent',
    });
    expect(silent.metronome.notes.length).toBe(0);
  });

  it('works with a real chord-progression slice as harmonic context (roots-mode bass)', () => {
    const scale = Scale.defaultScale();
    const chordMelody = {
      notes: [['C4', 'E4', 'G4'], null],
      durations: [24, 24],
      offsets: [0, 24],
      displayNotes: [['C4', 'E4', 'G4'], null],
    };
    const { bass } = generateLevelBackingChunk({
      bassScale: scale.generateBassScale(),
      timeSignature,
      chunkMeasures: 1,
      bassSettings,
      chordProgression: chordMelody,
      chordChunkStartMeasure: 0,
      measureLengthTicks,
      runId: 'test-chunk-chords',
    });
    expect(bass.notes.length).toBeGreaterThan(0);
  });
});
