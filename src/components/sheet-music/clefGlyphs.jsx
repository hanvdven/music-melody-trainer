import React from 'react';

// Shared clef glyph definitions + renderer (Han 2026-06-01 #4).
//
// These are the EXACT glyphs the sheet music draws: Maestro font char, vertical
// `yOffset` (the height carries meaning — it sets the clef on the right line), the
// optional `ottava` marker ('15' or implicit 8), and `below` (ottava under the
// staff). The clef selector reuses this so its glyphs match the sheet pixel-for-
// pixel instead of re-inventing them. Single source of truth — do NOT redefine.
export const clefSymbols = {
  treble: { char: '&', yOffset: 0 },
  alto: { char: 'B', yOffset: -10.0 },
  tenor: { char: 'B', yOffset: -20.0 },
  soprano: { char: 'B', yOffset: 10.0 },
  'mezzo-soprano': { char: 'B', yOffset: 0.0 },
  treble8va: { char: ' ', yOffset: 0 },
  treble8vb: { char: 'V', yOffset: 0 },
  treble15va: { char: '&', yOffset: 0, ottava: '15' },
  treble15vb: { char: '&', yOffset: 0, ottava: '15', below: true },
  bass: { char: '?', yOffset: -20 },
  bass8va: { char: 'æ', yOffset: -20 },
  bass8vb: { char: 't', yOffset: -10 },
  bass15va: { char: '?', yOffset: -20, ottava: '15' },
  bass15vb: { char: '?', yOffset: -10, ottava: '15', below: true },
};

// The sheet draws the clef glyph at x=13, y=30+yOffset, fontSize 36. We expose the
// same constants so callers stay aligned with the staff.
export const CLEF_GLYPH_X = 13;
export const CLEF_GLYPH_BASE_Y = 30;
export const CLEF_GLYPH_SIZE = 36;

/**
 * ClefGlyph — renders a clef (with its ottava marker) exactly as the sheet does
 * (same char/x/y/fontSize/anchor — default `start` anchor at x, like the staff).
 * `symbolKey` is a key into clefSymbols (e.g. 'treble', 'bass8vb', 'treble15va').
 * `x`/`baseY` default to the sheet position; `fill` colors the glyph.
 */
export const ClefGlyph = ({ symbolKey, x = CLEF_GLYPH_X, baseY = CLEF_GLYPH_BASE_Y, fill = 'var(--text-primary)' }) => {
  const cf = clefSymbols[symbolKey] || clefSymbols.treble;
  return (
    <>
      <text x={x} y={baseY + (cf.yOffset || 0)} fontSize={CLEF_GLYPH_SIZE}
        fill={fill} fontFamily="Maestro"
        style={{ pointerEvents: 'none' }}>
        {cf.char}
      </text>
      {cf.ottava && (
        <text x={x} y={baseY + cf.yOffset + (cf.below ? 30 : -46)}
          fontSize={cf.ottava === '15' ? 23 : 14}
          fill={cf.ottava === '15' ? '#ffffff' : fill}
          fontFamily="Maestro" textAnchor="middle"
          dx={cf.ottava === '15' && !cf.below ? 12 : 10}
          style={{ pointerEvents: 'none' }}>
          {cf.ottava === '15' ? String.fromCharCode(134) : cf.ottava}
        </text>
      )}
    </>
  );
};

// Map a clefSelector OCTAVE variant id (e.g. 'treble8va', 'bass8vb') OR a vocal
// clef string to the clefSymbols key. The ids already match the clefSymbols keys
// for melodic variants; vocal clefs map to their own keys; 'treble15ma' → 'treble15va'.
export const variantToSymbolKey = (id) => {
  if (id === 'treble15ma') return 'treble15va';
  return id;   // 'treble', 'treble8va', 'bass', 'bass8vb', 'bass8va', vocal clefs
};
