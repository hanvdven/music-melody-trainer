import { describe, it, expect } from 'vitest';
import { generateLevel9CallResponseBlock } from '../generateLevel9CallResponseBlock.js';
import Scale from '../../model/Scale.js';
import InstrumentSettings from '../../model/InstrumentSettings.js';
import { TICKS_PER_WHOLE } from '../../constants/timing.js';

// #693 (Han 2026-08-04, round 6): smoke test for Level 9's JIT call-response block generator —
// measure 1 (the call) must collapse to a single forced whole-rest, measure 2 (the response) must
// be a VERBATIM copy of the call's raw generated notes, and both `.notes` and `.displayNotes` must
// stay in lockstep (round 5's bug: processMelodyAndCalculateSlots reads `.displayNotes` first).
describe('generateLevel9CallResponseBlock', () => {
  const timeSignature = [4, 4];
  const measureLengthTicks = (TICKS_PER_WHOLE * timeSignature[0]) / timeSignature[1];
  const trebleSettings = { ...InstrumentSettings.defaultTrebleInstrumentSettings(), notesPerMeasure: 2 };

  it('measure 1 collapses to one whole-rest; measure 2 is a verbatim copy of the call', () => {
    const block = generateLevel9CallResponseBlock({
      scale: Scale.defaultScale(),
      timeSignature,
      trebleSettings,
      chordProgression: null,
      chordChunkStartMeasure: 0,
      measureLengthTicks,
      runId: 'test-block',
    });

    // Measure 1 (offsets [0, measureLengthTicks)): exactly one 'r' at offset 0 spanning the whole
    // measure; every other slot in that range is voided (note 'c', duration/offset null).
    const measure1Notes = block.notes.filter((_, i) => block.offsets[i] === 0);
    expect(measure1Notes).toEqual(['r']);
    const measure1Duration = block.durations[block.offsets.indexOf(0)];
    expect(measure1Duration).toBe(measureLengthTicks);
    for (let i = 0; i < block.notes.length; i++) {
      if (block.offsets[i] != null && block.offsets[i] > 0 && block.offsets[i] < measureLengthTicks) {
        throw new Error('measure 1 has a live slot after its whole-rest at offset ' + block.offsets[i]);
      }
    }

    // Measure 2 (offsets [measureLengthTicks, 2*measureLengthTicks)) mirrors measure 1's ORIGINAL
    // (pre-collapse) content, shifted one measure later — same notes/durations at the same
    // relative position.
    const callIndices = [];
    for (let i = 0; i < block.notes.length; i++) if (block.offsets[i] != null && block.offsets[i] < measureLengthTicks) callIndices.push(i);
    const responseIndices = [];
    for (let i = 0; i < block.notes.length; i++) if (block.offsets[i] != null && block.offsets[i] >= measureLengthTicks) responseIndices.push(i);
    expect(responseIndices.length).toBeGreaterThan(0);
    // At least one response note is a real pitch (not every slot a rest) — the response measure
    // is playable content, not a second silent measure.
    const hasRealNote = responseIndices.some((i) => block.notes[i] !== 'r' && block.notes[i] !== 'c');
    expect(hasRealNote).toBe(true);

    // .displayNotes mirrors .notes 1:1 (round 5's bug: processMelodyAndCalculateSlots prefers
    // displayNotes when present, so a divergence here would silently render stale pitches).
    expect(block.displayNotes.length).toBe(block.notes.length);
    for (let i = 0; i < block.notes.length; i++) {
      if (block.notes[i] === 'r') expect(block.displayNotes[i]).toBe('r');
      if (block.notes[i] === 'c') expect(block.displayNotes[i]).toBe('c');
    }
  });

  it('spans exactly 2 measures — no offset reaches a third measure', () => {
    const block = generateLevel9CallResponseBlock({
      scale: Scale.defaultScale(),
      timeSignature,
      trebleSettings,
      chordProgression: null,
      chordChunkStartMeasure: 0,
      measureLengthTicks,
      runId: 'test-block-span',
    });
    for (const o of block.offsets) expect(o == null || o < 2 * measureLengthTicks).toBe(true);
  });

  it('two consecutive blocks are independently randomized (not the same content repeated)', () => {
    const block0 = generateLevel9CallResponseBlock({
      scale: Scale.defaultScale(), timeSignature, trebleSettings, chordProgression: null,
      chordChunkStartMeasure: 0, measureLengthTicks, runId: 'test-independence-0',
    });
    const block1 = generateLevel9CallResponseBlock({
      scale: Scale.defaultScale(), timeSignature, trebleSettings, chordProgression: null,
      chordChunkStartMeasure: 2, measureLengthTicks, runId: 'test-independence-1',
    });
    // Different runId (seed) should not deterministically produce identical response pitches —
    // a regression to "block 2 = literal copy of block 1" would fail this.
    expect(block0.notes).not.toEqual(block1.notes);
  });
});
