import React from 'react';

/**
 * FermataLayer — renders fermata glyphs above the treble staff. Extracted
 * verbatim from SheetMusic.jsx (Han 2026-06-19, audit §4) where it lived as the
 * inline closure `renderFermataGlyphs`.
 *
 * Tick-based format (Han 2026-05-29 round 13): each fermata is { tick, hold } at
 * the song level. The glyph sits above whichever note happens to land on that
 * tick. Maestro 'U' (SHIFT+u) is the arc-down fermata for stem-down notes;
 * stem-direction-aware swap to 'u' is a follow-up refinement.
 *
 * Props mirror the old closure's captured values: `melody`, `glyphY`, plus the
 * `offsets` (allOffsets) array, `nw` (noteWidth) and `startX` geometry.
 */
const FermataLayer = ({ melody, glyphY, offsets, nw, startX }) => {
  if (!melody?.fermatas || melody.fermatas.length === 0) return null;
  if (!melody.offsets) return null;
  const getXLocal = (index) => startX + (index - 1) * nw;
  return (
    <>
      {melody.fermatas.map((f, fi) => {
        if (typeof f?.tick !== 'number') return null;
        const idx = offsets.indexOf(f.tick);
        if (idx < 0) return null;
        const x = getXLocal(idx) + 5;
        return (
          <text
            key={`fermata-${fi}`}
            x={x} y={glyphY}
            fontSize={24}
            fontFamily="Maestro"
            fill="var(--text-primary)"
            textAnchor="middle"
            style={{ userSelect: 'none' }}
          >
            U
          </text>
        );
      })}
    </>
  );
};

export default FermataLayer;
