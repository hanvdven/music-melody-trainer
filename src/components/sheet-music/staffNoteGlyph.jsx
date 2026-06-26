import React from 'react';

/**
 * Canonical staff-note geometry — the SINGLE source of truth for how a melodic quarter note
 * (notehead + stem + accidental + ledger lines) is drawn on the staff.
 *
 * Why this exists: the live staff (`renderMelodyNotes`) and the in-staff overlays (e.g. the
 * `TranspositionSetter` in the notation menu) used to draw noteheads independently, with
 * different font sizes, stem offsets and accidental placement — so the menu drifted from the
 * real staff (heads 6px low, tiny accidentals, hand-drawn stems). Both now import these
 * constants / this component, so the menus match the staff pixel-for-pixel.
 *
 * CLAUDE.md rule: any notation/staff drawing MUST reuse these (or `renderMelodyNotes` itself).
 * Never hand-roll glyph offsets in a new component.
 *
 * The numbers are exactly those `renderMelodyNotes` uses for a melodic quarter note:
 *   head:       <text x=originX y=positionY fontSize=36 Maestro>Ï</text>
 *   stem:       x = originX + (up ? 11 : 0.5), from positionY∓1 to positionY∓27, width 1.5
 *   accidental: x = originX − 4, y = positionY − 3, fontSize 36, textAnchor="end"
 *   ledger:     M originX−7 y H originX+19, width 0.5
 */
export const NOTE_FONT_SIZE = 36;        // Maestro notehead / accidental font size
export const QUARTER_GLYPH = 'Ï';        // durationNoteMap[12] — bare filled quarter head (no stem)
export const STEM_WIDTH = 1.5;
export const STEM_LENGTH = 27;           // standard stem length used across the staff (−10%)
export const STEM_DX_UP = 11;            // stem x offset from head origin when stem points up
export const STEM_DX_DOWN = 0.5;         // …when it points down
export const ACC_DX = -4;                // accidental x offset (drawn with textAnchor="end")
export const ACC_DY = -3;                // accidental y offset
export const LEDGER_DX_LEFT = -7;        // ledger line spans head origin −7 … +19
export const LEDGER_DX_RIGHT = 19;
export const LEDGER_WIDTH = 0.5;

// The staff middle line sits 20 units below the top staff line; notes below it get stems up.
export const stemIsUp = (positionY, staffYStart) => positionY > staffYStart + 20;

/**
 * Render one melodic quarter note exactly as the staff does. `x`/`positionY` are the head
 * ORIGIN (same coordinates `renderMelodyNotes` passes). `ledgerYs` are absolute y positions
 * for ledger lines (caller computes them staff-relative). `accidental` is a Maestro glyph
 * char (`#`/`b`/`n`/…) or null.
 */
export const StaffQuarterNote = ({
  x, positionY, staffYStart, accidental = null, ledgerYs = [],
  color = 'var(--text-primary)', headColor, opacity = 1,
}) => {
  const head = headColor ?? color;
  const up = stemIsUp(positionY, staffYStart);
  const stemX = up ? x + STEM_DX_UP : x + STEM_DX_DOWN;
  const stemStartY = up ? positionY - 1 : positionY + 1;
  const stemEndY = up ? positionY - STEM_LENGTH : positionY + STEM_LENGTH;
  return (
    <g opacity={opacity} style={{ pointerEvents: 'none' }}>
      {ledgerYs.map((ly, i) => (
        <path key={i} d={`M ${x + LEDGER_DX_LEFT} ${ly} H ${x + LEDGER_DX_RIGHT}`}
          stroke={color} strokeWidth={LEDGER_WIDTH} />
      ))}
      {accidental && (
        <text x={x + ACC_DX} y={positionY + ACC_DY} fontSize={NOTE_FONT_SIZE} fill={head}
          fontFamily="Maestro" textAnchor="end">{accidental}</text>
      )}
      <path d={`M ${stemX} ${stemStartY} V ${stemEndY}`} stroke={color} strokeWidth={STEM_WIDTH} />
      <text x={x} y={positionY} fontSize={NOTE_FONT_SIZE} fill={head} fontFamily="Maestro">{QUARTER_GLYPH}</text>
    </g>
  );
};

/**
 * Render a SELF-CONTAINED duration glyph (whole/half/quarter/eighth/sixteenth) at a staff
 * position. Unlike StaffQuarterNote (a bare head whose stem is drawn separately to match the live
 * staff), these glyphs are the Maestro single-character durations that already include their own
 * stem + flag(s) — the same glyphs InstrumentRow's smallest-note stepper shows
 * (SMALLEST_NOTE_GLYPHS: 'w'/'h'/'q'/'e'/'x'). Used by the GenerationAdvancedSetterOverlay's
 * smallest-note tangens carousel so the menu's duration glyphs match the bottom-view picker
 * (§6d — one source for the glyph chars; the chars come from generationFields).
 *
 * `x`/`positionY` are the glyph origin (text baseline anchor), same convention as StaffQuarterNote.
 * `scale` shrinks the glyph about its origin for the fanned (non-active) carousel neighbours.
 */
export const StaffDurationNote = ({
  glyphChar, x, positionY, color = 'var(--text-primary)', opacity = 1, scale = 1,
}) => (
  <g opacity={opacity} style={{ pointerEvents: 'none' }}
    transform={scale === 1 ? undefined : `translate(${x} ${positionY}) scale(${scale}) translate(${-x} ${-positionY})`}>
    {/* Maestro glyphs MUST render at normal weight (per ChordComplexityIcon note). */}
    <text x={x} y={positionY} fontSize={NOTE_FONT_SIZE} fill={color} fontFamily="Maestro"
      fontWeight="normal">{glyphChar}</text>
  </g>
);
