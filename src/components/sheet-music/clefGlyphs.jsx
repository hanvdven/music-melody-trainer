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
  // treble8va: Maestro has no single clean "treble + 8 above" glyph here (the slot
  // was blank — the 8va clef rendered as nothing, Han 2026-06-03). We compose it like
  // 15va/22ma: the plain treble glyph + a separate ottava '8' marker (drawn in a
  // readable serif by ClefGlyph, since Maestro maps digits to music glyphs).
  treble8va: { char: '&', yOffset: 0, ottava: '8' },
  treble8vb: { char: 'V', yOffset: 0 },
  treble15va: { char: '&', yOffset: 0, ottava: '15' },
  treble15vb: { char: '&', yOffset: 0, ottava: '15', below: true },
  bass: { char: '?', yOffset: -20 },
  // Baritone clef: the F-clef glyph, but with its F on the MIDDLE line instead of
  // the 4th line — i.e. drawn 10 units lower than bass (Han 2026-06-03). Pairs with
  // clefOffsets['baritone-f'] in renderMelodyNotes so the notes shift to match.
  'baritone-f': { char: '?', yOffset: -10 },
  bass8va: { char: 'æ', yOffset: -20 },
  bass8vb: { char: 't', yOffset: -10 },
  bass15va: { char: '?', yOffset: -20, ottava: '15' },
  bass15vb: { char: '?', yOffset: -10, ottava: '15', below: true },
  // 22ma / 22mb (3 octaves): Maestro has no glyph past 15, so the marker is a
  // CUSTOM composite (see Ottava22 / ClefGlyph) drawn from the font's own digits +
  // a superscript "ma"/"mb", matching the 15ma size & style (Han 2026-06-01 #6).
  treble22va: { char: '&', yOffset: 0, ottava: '22' },
  treble22vb: { char: '&', yOffset: 0, ottava: '22', below: true },
  bass22va: { char: '?', yOffset: -20, ottava: '22' },
  bass22vb: { char: '?', yOffset: -10, ottava: '22', below: true },
};

// The sheet draws the clef glyph at x=13, y=30+yOffset, fontSize 36. We expose the
// same constants so callers stay aligned with the staff.
export const CLEF_GLYPH_X = 13;
export const CLEF_GLYPH_BASE_Y = 30;
export const CLEF_GLYPH_SIZE = 36;

/**
 * Ottava22 — a CUSTOM 22ma / 22mb marker (Maestro has no glyph past 15). Composed
 * from the font's own digits "22" plus a small superscript "ma"/"mb", sized to
 * match the 15ma marker. `cx`/`cy` is the marker centre; `below` swaps ma→mb.
 * Not exported: only used by ClefGlyph below in this module (Han 2026-06-19).
 */
const Ottava22 = ({ cx, cy, fill = 'var(--text-primary)', below = false }) => (
  // IMPORTANT: the Maestro font maps ASCII digits/letters to MUSIC glyphs (PUA), so
  // "22ma" must be drawn in a normal text font — using fontFamily="Maestro" here
  // rendered unreadable symbols (the 22mb-invisible bug, Han 2026-06-01 #8). We use
  // the same italic serif as ottava lines, bold for legibility at small size.
  <g style={{ pointerEvents: 'none' }} fill={fill} fontFamily="Georgia, serif"
    fontStyle="italic" fontWeight="bold">
    <text x={cx} y={cy} fontSize={15} textAnchor="middle">22</text>
    {/* superscript ma / mb, raised + smaller, like the 8ᵛᵃ / 15ᵐᵃ ligature. */}
    <text x={cx + 9} y={cy - 6} fontSize={9} textAnchor="start">
      {below ? 'mb' : 'ma'}
    </text>
  </g>
);

/**
 * ClefGlyph — renders a clef (with its ottava marker) exactly as the sheet does
 * (same char/x/y/fontSize/anchor — default `start` anchor at x, like the staff).
 * `symbolKey` is a key into clefSymbols (e.g. 'treble', 'bass8vb', 'treble15va').
 * `x`/`baseY` default to the sheet position; `fill` colors the glyph.
 */
export const ClefGlyph = ({
  symbolKey, x = CLEF_GLYPH_X, baseY = CLEF_GLYPH_BASE_Y, fill = 'var(--text-primary)',
  anchor = 'start',   // sheet uses 'start' at x=13; the carousel uses 'middle' to
                      // visually centre the glyph in its slot (Han #10).
}) => {
  const cf = clefSymbols[symbolKey] || clefSymbols.treble;
  const markerY = baseY + cf.yOffset + (cf.below ? 30 : -46);
  // The ottava marker offset rides with the anchor (start → to the right of the
  // glyph; middle → just right of centre).
  const ottDx = anchor === 'middle' ? 8 : (cf.ottava === '15' && !cf.below ? 12 : 10);
  return (
    <>
      <text x={x} y={baseY + (cf.yOffset || 0)} fontSize={CLEF_GLYPH_SIZE}
        fill={fill} fontFamily="Maestro" textAnchor={anchor}
        style={{ pointerEvents: 'none' }}>
        {cf.char}
      </text>
      {cf.ottava === '22' && (
        // Custom composite (no Maestro glyph for 22) — see Ottava22.
        <Ottava22 cx={x + (anchor === 'middle' ? 6 : 12)} cy={markerY} fill={fill} below={cf.below} />
      )}
      {cf.ottava === '15' && (
        // Maestro char 134 is the engraved "15" ligature. Uses the passed `fill` so it
        // dims/colours WITH its clef (Han 2026-06-03: the 15 must follow the selection,
        // not stay hardcoded white).
        <text x={x} y={markerY} fontSize={23} fill={fill}
          fontFamily="Maestro" textAnchor="middle" dx={ottDx}
          style={{ pointerEvents: 'none' }}>
          {String.fromCharCode(134)}
        </text>
      )}
      {cf.ottava && cf.ottava !== '22' && cf.ottava !== '15' && (
        // Plain numeric ottava ('8' above the treble clef): use the MAESTRO numeral
        // (the font's engraved time-signature digit) so the 8va reads as the real music
        // glyph, not a serif text digit (Han #11, 2026-06-03).
        <text x={x} y={markerY} fontSize={18} fill={fill}
          fontFamily="Maestro" textAnchor="middle" dx={ottDx}
          style={{ pointerEvents: 'none' }}>
          {cf.ottava}
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
