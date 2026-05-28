import React from 'react';

/**
 * Renders the "one-measure repeat" symbol (Maestro glyph Ô) once per visible
 * measure, centred horizontally between successive barline X positions.
 *
 * Pure helper extracted from SheetMusic.jsx so PreviewOverlay can call it
 * without forcing a closure-capture that would invalidate the layer's
 * React.memo cache every render.
 *
 * All current call sites pass an explicit `staveYs` array (e.g. `[30]`),
 * so the legacy auto-staff fallback (read isTrebleVisible/Bass/Perc from
 * closure) is intentionally omitted here. If a caller needs that fallback
 * it should compute the staff array at the call site.
 */
export const renderOneMeasureRepeatSymbols = ({
  offsets,
  noteWidth,
  pixelsPerTick,
  staveYs,
  color,
  startX,
  displayNumMeasures,
  measureLengthSlots,
  showSettings,
}) => {
  if (displayNumMeasures <= 0) return null;
  if (!staveYs || staveYs.length === 0) return null;

  // Hide repeat labels when adjustments overlay is active so the user can
  // see the underlying notes clearly while tweaking settings.
  const opacity = showSettings ? 0 : 0.8;

  let measureXs;
  if (pixelsPerTick !== null) {
    measureXs = Array.from(
      { length: displayNumMeasures + 1 },
      (_, i) => startX + i * measureLengthSlots * pixelsPerTick,
    );
  } else {
    if (noteWidth === 0) return null;
    const getXLocal = (index) => (index === 0 ? startX - 35 : startX + (index - 1) * noteWidth);
    measureXs = [];
    offsets.forEach((o, i) => { if (o === 'm') measureXs.push(getXLocal(i)); });
  }

  const symbols = [];
  for (let m = 0; m < displayNumMeasures; m++) {
    if (m + 1 >= measureXs.length) break;
    const cx = (measureXs[m] + measureXs[m + 1]) / 2;
    for (const y of staveYs) {
      symbols.push(
        <text
          key={`onemrep-${y}-${m}`}
          x={cx}
          y={y - 1}
          fontSize="36"
          fontFamily="Maestro"
          fill={color ?? 'var(--text-primary)'}
          textAnchor="middle"
          style={{ pointerEvents: 'none', userSelect: 'none', opacity, transition: 'opacity 0.3s' }}
        >
          Ô
        </text>,
      );
    }
  }
  return symbols;
};
