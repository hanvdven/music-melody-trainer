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

// ── Duration → glyph maps — SINGLE SOURCE OF TRUTH (§6c/§6d) ──────────────────────────────────────
// These were authored INLINE inside renderMelodyNotes' main loop. StaffMelodyNote (below) draws a
// stand-alone melody note exactly the way that loop does, so the maps now live HERE and
// renderMelodyNotes IMPORTS them — one home for the notehead/flag/dot glyph chars, no second copy.
// Keyed by VISUAL DURATION in ticks (3=16th, 6=8th, 12=quarter, 24=half, 48=whole, plus dotted).
export const durationNoteMap = {
  3: 'Ï', 6: 'Ï', 9: 'Ï', 12: 'Ï', 18: 'Ï', 21: 'Ï',
  24: 'ú', 36: 'ú', 42: 'ú',
  48: 'w', 72: 'w',
};
export const durationDotMap = {
  72: 'k', 42: 'kk', 36: 'k', 21: 'kk', 18: 'k', 9: 'k',
};
export const durationFlagMapDown = {
  9: 'J', 6: 'J', 3: 'R',   // 8th flag (down), 16th flag (down)
};
export const durationFlagMapUp = {
  9: 'j', 6: 'j', 3: 'r',   // 8th flag (up), 16th flag (up)
};

/**
 * StaffMelodyNote — render ONE stand-alone melodic note (head + stem + flag + dot + ledger lines)
 * for a given VISUAL DURATION, exactly the way `renderMelodyNotes`' main loop draws a melodic note
 * (§6d: "use the existing melody-note function"). Used by the GenerationAdvancedSetterOverlay's
 * smallest-note carousel so the duration sample reads as a REAL staff note (filled/open head, real
 * stem, real flag), not a bare Maestro single-glyph.
 *
 * Geometry mirrors renderMelodyNotes verbatim:
 *   stem:   x = origin + (up ? STEM_DX_UP : STEM_DX_DOWN); from positionY∓1 to positionY∓STEM_LENGTH;
 *           drawn only for visualDuration < 48 (whole notes have no stem). width 1.5.
 *   flag:   unbeamed + visualDuration < 12 → durationFlagMap{Up,Down}; flagX = origin+(up?11:0.5),
 *           flagY = positionY∓27. Maestro, NOTE_FONT_SIZE.
 *   head:   whole 'w' shifted x−1; else durationNoteMap glyph at the origin. Maestro, NOTE_FONT_SIZE.
 *   dot:    durationDotMap at origin+13, y snapped to the staff line as renderMelodyNotes does.
 *   ledger: caller passes absolute ledgerYs (head off the staff gets ledger lines).
 *
 * `x`/`positionY` are the head ORIGIN (same convention as StaffQuarterNote). `scale` shrinks the
 * whole note about its origin for fanned (non-active) carousel neighbours.
 */
export const StaffMelodyNote = ({
  visualDuration, x, positionY, staffYStart, ledgerYs = [],
  color = 'var(--text-primary)', opacity = 1, scale = 1,
}) => {
  const up = stemIsUp(positionY, staffYStart);
  const stemX = up ? x + STEM_DX_UP : x + STEM_DX_DOWN;
  const stemStartY = up ? positionY - 1 : positionY + 1;
  const stemEndY = up ? positionY - STEM_LENGTH : positionY + STEM_LENGTH;
  const head = durationNoteMap[visualDuration];
  const dot = durationDotMap[visualDuration];
  const flag = up ? durationFlagMapUp[visualDuration] : durationFlagMapDown[visualDuration];
  const flagX = up ? x + STEM_DX_UP : x + STEM_DX_DOWN;
  const flagY = up ? positionY - STEM_LENGTH : positionY + STEM_LENGTH;
  // Dot baseline snaps to the staff line exactly as renderMelodyNotes (line 1255).
  const dotY = (Math.round(positionY) - 1) % 10 === 0 ? positionY + 1 : positionY + 6;
  return (
    <g opacity={opacity} style={{ pointerEvents: 'none' }}
      transform={scale === 1 ? undefined : `translate(${x} ${positionY}) scale(${scale}) translate(${-x} ${-positionY})`}>
      {ledgerYs.map((ly, i) => (
        <path key={i} d={`M ${x + LEDGER_DX_LEFT} ${ly} H ${x + LEDGER_DX_RIGHT}`}
          stroke={color} strokeWidth={LEDGER_WIDTH} />
      ))}
      {visualDuration < 48 && (
        <path d={`M ${stemX} ${stemStartY} V ${stemEndY}`} stroke={color} strokeWidth={STEM_WIDTH} />
      )}
      {visualDuration < 12 && flag && (
        <text x={flagX} y={flagY} fontSize={NOTE_FONT_SIZE} fill={color} fontFamily="Maestro">{flag}</text>
      )}
      <text x={head === 'w' ? x - 1 : x} y={positionY} fontSize={NOTE_FONT_SIZE} fill={color}
        fontFamily="Maestro">{head}</text>
      {dot && (
        <text x={x + 13} y={dotY} fontSize={NOTE_FONT_SIZE} fill={color} fontFamily="Maestro">{dot}</text>
      )}
    </g>
  );
};
