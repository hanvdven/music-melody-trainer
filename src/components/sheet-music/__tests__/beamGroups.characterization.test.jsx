import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { renderMelodyNotes } from '../renderMelodyNotes.jsx';

/**
 * CHARACTERIZATION TEST — beam-group computation in renderMelodyNotes.jsx (~:496-820, 1555)
 *
 * WHY THIS EXISTS (Phase-2 safety net): the audit (§4) marks renderMelodyNotes.jsx's
 * ~1500-line body — beam groups, stem direction, ledger lines, noteheads — as
 * high-risk untested code Phase 2 wants to split into a pure computeBeamGroups.js +
 * per-note renderNoteGlyph. The beam GROUPING decision (which consecutive notes share
 * a beam, and how the measure is split into beam spans) is the part most likely to
 * regress in that extraction. This test pins that decision.
 *
 * WHY VIA RENDERING (not a pure call): the beam grouping is NOT reachable as a pure
 * function today — it is computed inline inside renderMelodyNotes from positionY values
 * that themselves depend on noteYMap + clef offsets + octave-shift logic earlier in the
 * same function, and the result only surfaces as JSX. So we render the function output
 * in jsdom and read back the grouping from the DOM. (When Phase 2 extracts
 * computeBeamGroups.js, it should add its OWN direct pure-function test; this test then
 * becomes the end-to-end guard that the extraction didn't change observable output.)
 *
 * WHY STABLE (NOT a brittle geometry snapshot): we deliberately do NOT assert beam
 * <polygon> point coordinates (those are float-fragile and a legitimate refactor could
 * shift them sub-pixel). Instead each beam group renders as a
 *   <g data-mel data-offset data-duration> … </g>
 * wrapper (renderMelodyNotes.jsx ~:1627). We assert only:
 *   • the NUMBER of beam groups (= how the measure was split into beam spans), and
 *   • each group's data-offset (the last-note tick offset — its identity), and
 *   • that secondary (16th) beams appear (polygon count > 1) where expected.
 * These are semantic grouping facts, invariant under cosmetic geometry changes, and
 * verified deterministic (no RNG in rendering; identical across repeated runs).
 */

// Scale-note context the renderer needs for colouring/ottava (no RNG involved).
const SCALE = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];

/**
 * Render a melody and return ONLY the beam-group <g> wrappers. The renderer also emits
 * a per-note <g data-mel> with NO data-offset (polys=0); beam groups are exactly the
 * <g data-mel> elements that carry a data-offset (the group's last-note offset).
 */
function beamGroups(melody, timeSignature, measureLengthSlots) {
  const out = renderMelodyNotes(
    melody,
    /* numAccidentals */ 0,
    /* startX */ 50,
    /* noteWidth */ 30,
    /* allOffsets */ [...melody.offsets],
    /* staff */ 'treble',
    /* staffYStart */ 11,
    /* noteGroupSize */ 12,
    measureLengthSlots,
    timeSignature,
    /* clef */ 'treble',
    /* noteColoringMode */ 'none',
    /* tonic */ 'C4',
    /* scaleNotes */ SCALE,
    /* processedChords */ [],
    /* theme */ 'default'
  );
  const { container } = render(<svg>{out}</svg>);
  return [...container.querySelectorAll('g[data-mel][data-offset]')].map((g) => ({
    offset: Number(g.getAttribute('data-offset')),
    duration: Number(g.getAttribute('data-duration')),
    polygonCount: g.querySelectorAll('polygon').length,
  }));
}

describe('beam-group computation — characterization (Phase-2 split guard)', () => {
  it('4/4 eight eighth-notes → split into TWO beam groups at the half (beats 1-2 / 3-4)', () => {
    // whole = 48 ticks; eighth = 6. Eight eighths fill the bar.
    const melody = {
      notes: SCALE,
      durations: [6, 6, 6, 6, 6, 6, 6, 6],
      offsets: [0, 6, 12, 18, 24, 30, 36, 42],
      ties: [],
      displayNotes: SCALE,
    };
    const groups = beamGroups(melody, [4, 4], 48);
    expect(groups).toHaveLength(2);
    // First group covers offsets 0-18 (ends at 18), second covers 24-42 (ends at 42):
    // the even-numerator fallback splits the measure at the midpoint (24).
    expect(groups[0].offset).toBe(18);
    expect(groups[1].offset).toBe(42);
    // Eighth notes → single (master) beam only, no secondary beam.
    expect(groups[0].polygonCount).toBe(1);
    expect(groups[1].polygonCount).toBe(1);
  });

  it('4/4 eight sixteenth-notes in beat 1 → ONE beam group with secondary (16th) beams', () => {
    const notes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
    const melody = {
      notes,
      durations: [3, 3, 3, 3, 3, 3, 3, 3], // sixteenths
      offsets: [0, 3, 6, 9, 12, 15, 18, 21],
      ties: [],
      displayNotes: notes,
    };
    const groups = beamGroups(melody, [4, 4], 48);
    // All within the first half-measure span → a single beam group.
    expect(groups).toHaveLength(1);
    expect(groups[0].offset).toBe(21); // last sixteenth's offset
    // Sixteenths add SECONDARY beam trapezoids: master + per-note secondaries > 1 polygon.
    expect(groups[0].polygonCount).toBeGreaterThan(1);
  });

  it('6/8 with rhythmicGrouping [3,3] → TWO beam groups, one per dotted-quarter group', () => {
    // 6/8: measureLengthSlots still 48 here (one bar). Six eighth-equivalents grouped 3+3.
    const notes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4'];
    const melody = {
      notes,
      durations: [8, 8, 8, 8, 8, 8],
      offsets: [0, 8, 16, 24, 32, 40],
      ties: [],
      displayNotes: notes,
      rhythmicGrouping: [3, 3], // compound-meter beat grouping
    };
    const groups = beamGroups(melody, [6, 8], 48);
    expect(groups).toHaveLength(2);
    // First group ends at offset 16 (last note of the first [3] group), second at 40.
    expect(groups.map((g) => g.offset)).toEqual([16, 40]);
  });

  it('two quarter notes do not beam (no beam groups emitted)', () => {
    // Quarters (duration 12 ≥ the beam threshold) are never beamed.
    const notes = ['C4', 'E4'];
    const melody = {
      notes,
      durations: [24, 24],
      offsets: [0, 24],
      ties: [],
      displayNotes: notes,
    };
    const groups = beamGroups(melody, [4, 4], 48);
    expect(groups).toHaveLength(0);
  });

  it('beam grouping is deterministic across repeated renders (no RNG)', () => {
    const melody = {
      notes: SCALE,
      durations: [6, 6, 6, 6, 6, 6, 6, 6],
      offsets: [0, 6, 12, 18, 24, 30, 36, 42],
      ties: [],
      displayNotes: SCALE,
    };
    const a = beamGroups(melody, [4, 4], 48);
    const b = beamGroups(melody, [4, 4], 48);
    expect(a).toEqual(b);
  });
});
