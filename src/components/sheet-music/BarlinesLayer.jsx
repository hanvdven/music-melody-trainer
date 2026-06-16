import React from 'react';

/**
 * BarlinesLayer — memoised wrapper around barline + measure-number rendering.
 *
 * Why this exists:
 * SheetMusic.jsx had `_iterMeasureLines` as a local closure that captured ~20
 * parent values (blockMeasureStart, isPlaying, partialTop, staff Y positions,
 * visibility flags, …). It was invoked 3× per render via `renderRegularBarlines`
 * (OLD, RED preview, crossfade) plus 1× via `renderRepeatBarlines`. Every call
 * walked the entire offsets array, branched on mode/repeats/partial-time-sig,
 * and rebuilt the JSX from scratch.
 *
 * Wrapping the iteration in `React.memo` lets React skip the whole pass when
 * all inputs are referentially equal. The iterator is now a pure function
 * (`iterMeasureLines` below) with explicit args — no closure capture — so its
 * JSX is deterministic from its inputs.
 *
 * DOM output is unchanged: same `<g data-mel="barline" data-offset=…>` wrappers,
 * same measure-number labels with the same click handlers. The pagination
 * highlight rAF in `useSheetMusicHighlight` reads `[data-mel="barline"]` via
 * the same selectors regardless of which layer produced the elements.
 */

const iterMeasureLines = ({
  mode,
  offsets,
  noteWidth,
  pixelsPerTick,
  startX,
  startIdx,
  blockMeasureStart,
  blockPlayStart,
  partialTop,
  partialMeasureStart,
  measureBottom,
  measureYPositions,
  trebleStart,
  bassStart,
  percussionStart,
  bottomY,
  isTrebleVisible,
  isBassVisible,
  isPercussionVisible,
  numRepeats,
  isPlaying,
  numMeasures,
  debugMode,
  showSettings,
  measureLengthSlots,
  onMeasureNumberClick,
  // Anacrusis support (Han 2026-05-28): when the loaded song's first measure
  // has a leading rest (= trebleMelody.offsets[0] > 0), pass the global index
  // of that pickup measure here so its number label is suppressed in the
  // pickup-measure convention. null = no anacrusis to hide.
  anacrusisMeasureIndex = null,
  // Looping body-merge (arch §40): when non-null the rendered melody is the merged BODY of a pickup
  // song (pickup relocated to the end of the last body bar; this is the bar count of that body, e.g.
  // 8 for HBD). There is NO separate pickup measure on screen, so the pickup-measure conventions
  // (label suppression + the -1 number shift) must be DISABLED, and the repeat-pass suffix must be
  // computed from THIS body count, not the padded numMeasures. null = not merging → original
  // anacrusis-aware behaviour below is unchanged.
  mergedBodyMeasures = null,
}) => {
  // bmsOverride / bpsOverride: pagination crossfade overlay passes the FUTURE
  // blockMeasureStart and blockPlayStart so the preview's measure-number labels
  // are correct AHEAD of the boundary. Without this the overlay renders labels
  // from the still-current state (e.g. "1.5" because the current block's
  // blockMeasureStart is 1 and startIdx is past the last repeat).
  const bms = blockMeasureStart;
  const bps = blockPlayStart;
  const getXLocal = (index) => index === 0 ? startX - 35 : startX + (index - 1) * noteWidth;
  const lastIdx = offsets.length - 1;
  let barlineCount = 0;
  return offsets.map((timestamp, index) => {
    // Adaptive time-signature change label: always in the regular (fadeable) group
    // Only render inline if it does not happen exactly at the start of the staff (0)
    if (timestamp === 'ts' && partialTop !== null && partialMeasureStart !== 0) {
      if (mode !== 'regular') return null;
      const x = getXLocal(index);
      return (
        <g key={`ts-${index}`}>
          {measureYPositions.map((yPos, i) => {
            const isTop = i % 2 === 0;
            return (
              <text
                key={i}
                x={x}
                y={yPos + 1}
                fontSize="36"
                fill="var(--text-primary)"
                fontFamily="Maestro"
                textAnchor="middle"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {isTop ? partialTop : measureBottom}
              </text>
            );
          })}
        </g>
      );
    }

    if (timestamp === 'm') {
      const x = pixelsPerTick !== null
        ? startX + barlineCount * measureLengthSlots * pixelsPerTick
        : getXLocal(index);
      const barlineOffset = barlineCount * measureLengthSlots;
      const measureNumForLabel = barlineCount; // 0-indexed series measure that starts after this barline
      barlineCount++;
      const isStart = index === (numRepeats > 1 ? 1 : 0);
      const isEnd = index === lastIdx;

      // R = how many times the current block has been played in this session (= the repeat pass).
      // Only shown during active playback (isPlaying=true). Resets per block via blockPlayStart.
      // Pass count divides by the LENGTH OF THE LOOPED UNIT. When the merged body is rendered the
      // looped unit is bodyMeasures (e.g. 8 for HBD) — the Sequencer advances globalMeasureIndex by
      // bodyMeasures per pass — NOT the padded numMeasures (9), so dividing by numMeasures would
      // mis-count the pass (arch §40 numbering). Fall back to numMeasures when not merging.
      const passSpan = mergedBodyMeasures != null ? mergedBodyMeasures : numMeasures;
      const repeatNum = isPlaying
        ? Math.max(1, Math.floor((startIdx - bps) / passSpan) + 1)
        : 1;
      // Returns "N" (first pass) or "N . R" (pass R, R≥2) where N = song measure number. The suffix
      // is suppressed for pass 1 (plain numbers on the first play-through).
      //
      // Anacrusis offset (Han 2026-05-29): when a pickup MEASURE is on screen (NOT the merged body),
      // the pickup is m0 (suppressed below) and the FIRST FULL measure should be labeled "1", not
      // "2". Subtract 1 from N for all labels when an anacrusis is present in this displayed block.
      // With the merged body there is no pickup measure (it was relocated into the last bar), so this
      // shift must NOT fire — the first rendered bar IS measure 1 (Han 2026-06-15).
      const hasAnacrusisInBlock = mergedBodyMeasures == null
        && anacrusisMeasureIndex !== null && (bms - 1) === anacrusisMeasureIndex;
      const measureLabel = (localIndex) => {
        const N = bms + localIndex - (hasAnacrusisInBlock ? 1 : 0);
        return repeatNum > 1 ? `${N} . ${repeatNum}` : `${N}`;
      };

      if (numRepeats > 1) {
        if (isStart) {
          if (mode === 'regular') {
            // Anacrusis suppression: when the leftmost displayed measure IS the
            // song's pickup measure, omit the number entirely (Han 2026-05-28).
            // The empty <g> keeps the click target so onMeasureNumberClick still
            // works for jump-to-measure interactions.
            // bms is 1-indexed (e.g. 1 for the first measure of the song); anacrusisMeasureIndex
// is 0-indexed (= the global measureIndex of the song's pickup), so we compare with
// (bms - 1). For HBD song-load: bms=1, anacrusisMeasureIndex=0 → match → suppress.
// mergedBodyMeasures != null → the merged body is on screen (no pickup measure), so never suppress.
const isAnacrusisStart = mergedBodyMeasures == null && anacrusisMeasureIndex !== null && (bms - 1) === anacrusisMeasureIndex;
            return (
              <g key={`measure-line-${index}`}
                onClick={onMeasureNumberClick ? (e) => { e.stopPropagation(); onMeasureNumberClick(startIdx); } : undefined}
                style={{ cursor: onMeasureNumberClick ? 'pointer' : 'default' }}
              >
                <rect x={startX - 10} y={trebleStart - 28} width={60} height={18} fill="transparent" />
                {!isAnacrusisStart && (
                  <text
                    x={startX}
                    y={trebleStart - 14}
                    fontSize="15"
                    fill={showSettings ? 'var(--accent-yellow)' : 'var(--text-lowlight)'}
                    fontFamily="Georgia, 'Times New Roman', serif"
                    style={{ userSelect: 'none' }}
                  >
                    {measureLabel(0)}
                  </text>
                )}
                {debugMode && <rect x={startX - 10} y={trebleStart - 28} width={60} height={18} fill="magenta" fillOpacity={0.3} stroke="magenta" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
              </g>
            );
          }
          if (mode !== 'repeat') return null;
          const startXOffset = x - 15;
          return (
            <g key={`measure-line-${index}`} data-offset={barlineOffset} data-mel="barline">
              <rect x={startXOffset - 2} y={trebleStart} width="3" height={bottomY - trebleStart} fill="var(--text-primary)" />
              <path d={`M ${startXOffset + 4} ${trebleStart} V ${bottomY}`} stroke="var(--text-primary)" strokeWidth="1" />
              {[trebleStart, bassStart, percussionStart].map((start, sIdx) => {
                const showDots = sIdx === 0 ? isTrebleVisible : (sIdx === 1 ? isBassVisible : isPercussionVisible);
                if (!showDots) return null;
                return (
                  <g key={`rep-dot-start-${start}-${sIdx}`}>
                    <text x={startXOffset + 9} y={start + 18.5} fontSize="21" fontFamily="Maestro" fill="var(--text-primary)" textAnchor="middle">k</text>
                    <text x={startXOffset + 9} y={start + 28.5} fontSize="21" fontFamily="Maestro" fill="var(--text-primary)" textAnchor="middle">k</text>
                  </g>
                );
              })}
            </g>
          );
        }
        if (isEnd) {
          if (mode !== 'repeat') return null;
          return (
            <g key={`measure-line-${index}`} data-offset={barlineOffset} data-mel="barline">
              {[trebleStart, bassStart, percussionStart].map((start, sIdx) => {
                const showDots = sIdx === 0 ? isTrebleVisible : (sIdx === 1 ? isBassVisible : isPercussionVisible);
                if (!showDots) return null;
                return (
                  <g key={`rep-dot-end-${start}-${sIdx}`}>
                    <text x={x - 9} y={start + 18.5} fontSize="21" fontFamily="Maestro" fill="var(--text-primary)" textAnchor="middle">k</text>
                    <text x={x - 9} y={start + 28.5} fontSize="21" fontFamily="Maestro" fill="var(--text-primary)" textAnchor="middle">k</text>
                  </g>
                );
              })}
              <path d={`M ${x - 4} ${trebleStart} V ${bottomY}`} stroke="var(--text-primary)" strokeWidth="1" />
              <rect x={x + 1} y={trebleStart} width="3" height={bottomY - trebleStart} fill="var(--text-primary)" />
            </g>
          );
        }
      }

      if (mode !== 'regular') return null;

      // For the opening barline (numRepeats <= 1): suppress the barline itself but
      // still render the "1" measure label above startX (the first note position).
      // Anacrusis: when the leftmost displayed measure is the song's pickup, omit
      // the label entirely (Han 2026-05-28).
      if (isStart && numRepeats <= 1) {
        // bms is 1-indexed (e.g. 1 for the first measure of the song); anacrusisMeasureIndex
// is 0-indexed (= the global measureIndex of the song's pickup), so we compare with
// (bms - 1). For HBD song-load: bms=1, anacrusisMeasureIndex=0 → match → suppress.
// mergedBodyMeasures != null → the merged body is on screen (no pickup measure), so never suppress.
const isAnacrusisStart = mergedBodyMeasures == null && anacrusisMeasureIndex !== null && (bms - 1) === anacrusisMeasureIndex;
        return (
          <g key={`measure-line-${index}`}
            onClick={onMeasureNumberClick ? (e) => { e.stopPropagation(); onMeasureNumberClick(startIdx + measureNumForLabel); } : undefined}
            style={{ cursor: onMeasureNumberClick ? 'pointer' : 'default' }}
          >
            <rect x={startX - 10} y={trebleStart - 28} width={60} height={18} fill="transparent" />
            {!isAnacrusisStart && (
            <text
              x={startX}
              y={trebleStart - 14}
              fontSize="15"
              fill={showSettings ? 'var(--accent-yellow)' : 'var(--text-lowlight)'}
              fontFamily="Georgia, 'Times New Roman', serif"
              style={{ userSelect: 'none' }}
            >
              {measureLabel(measureNumForLabel)}
            </text>
            )}
            {debugMode && <rect x={startX - 10} y={trebleStart - 28} width={60} height={18} fill="magenta" fillOpacity={0.3} stroke="magenta" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
          </g>
        );
      }

      return (
        <g key={`measure-line-${index}`}>
          <path
            data-offset={barlineOffset}
            data-mel="barline"
            d={`M ${x} ${trebleStart} V ${bottomY}`}
            stroke="var(--text-primary)"
            strokeWidth=".5"
          />
          {!isEnd && (
            <g
              onClick={onMeasureNumberClick ? (e) => { e.stopPropagation(); onMeasureNumberClick(startIdx + measureNumForLabel); } : undefined}
              style={{ cursor: onMeasureNumberClick ? 'pointer' : 'default' }}
            >
              <rect x={x - 10} y={trebleStart - 28} width={60} height={18} fill="transparent" />
              <text
                x={x}
                y={trebleStart - 14}
                fontSize="15"
                fill={showSettings ? 'var(--accent-yellow)' : 'var(--text-lowlight)'}
                fontFamily="Georgia, 'Times New Roman', serif"
                style={{ userSelect: 'none' }}
              >
                {measureLabel(measureNumForLabel)}
              </text>
              {debugMode && <rect x={x - 10} y={trebleStart - 28} width={60} height={18} fill="magenta" fillOpacity={0.3} stroke="magenta" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
            </g>
          )}
        </g>
      );
    }
    return null;
  });
};

const BarlinesLayer = (props) => {
  return <>{iterMeasureLines(props)}</>;
};

export default React.memo(BarlinesLayer);
