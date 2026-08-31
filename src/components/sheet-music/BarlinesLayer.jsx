import React from 'react';
import { computeRepeatPass, computeCallResponseLabel } from '../../utils/repeatNumbering';
import { BeginRepeatSign, EndRepeatSign } from './repeatSigns';

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
  // #1155 (Han 2026-08-24, "pas de labelconventie toe op alle call-response levels"): when set (a
  // call-response level's `lvl.callResponseMeasures`, 1 for letter d / 2 for letter e), measure labels
  // switch to the "N" (call) / "N . 2" (response) convention computed PURELY from each barline's own
  // ordinal position (`computeCallResponseLabel`) — completely bypassing `blockMeasureStart`/
  // `blockPlayStart`/`computeRepeatPass` below, which are tied to combat/wave progress (correct for
  // their own job, wrong for call-response — see that function's own comment). null = every other
  // level's existing numbering is COMPLETELY UNCHANGED by this prop's addition.
  callResponseGroupMeasures = null,
  // Bug fix (Han 2026-08-25 UAT): the level's own synthetic lead-in bars (see `anacrusisMeasureIndex`'s
  // sibling mechanism above and `SheetMusic.jsx`'s `offsets: [...Array(leadInBars).fill('m'), ...]`)
  // count as real 'm' markers too, so `computeCallResponseLabel` needs to know how many of them precede
  // the real content to exclude them from the call/response cycle math — see that function's own
  // comment for the full bug. 0 = no lead-in bars in this render (every non-call-response level, and
  // any call-response wave beyond the first, already omit the synthetic lead-in markers entirely).
  callResponseLeadInBars = 0,
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
      // Pure helper (src/utils/repeatNumbering.js) so the pass math is unit-testable against stable
      // counters — see Fix #3 (the loaded-song repeat path now refreshes blockPlayStart per block so
      // this no longer overflows). Behaviour is identical to the previous inline expression.
      const repeatNum = computeRepeatPass({ startMeasureIndex: startIdx, blockPlayStart: bps, passSpan, isPlaying });
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
      // #1155: call-response levels use a DIFFERENT, isolated label path — see
      // `callResponseGroupMeasures`'s own comment above. `measureNumForLabel` (this barline's own
      // ordinal, captured before `barlineCount` incremented above) is exactly the `barlineOrdinal`
      // `computeCallResponseLabel` needs.
      const measureLabel = callResponseGroupMeasures != null
        ? (localIndex) => {
          const { measureNumber, pass } = computeCallResponseLabel({
            barlineOrdinal: localIndex, groupMeasures: callResponseGroupMeasures, leadInBars: callResponseLeadInBars,
          });
          return pass > 1 ? `${measureNumber} . ${pass}` : `${measureNumber}`;
        }
        : (localIndex) => {
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
                    {/* #1155 bug fix: this branch used to hardcode `measureLabel(0)` — correct for the
                        ORIGINAL practice-repeat-block use case (a self-contained block always numbers its
                        own first measure "1" regardless of which repeat pass), but WRONG for
                        call-response, whose labels are independent per real barline ordinal, not
                        block-relative. Use the real ordinal for call-response; keep the original
                        hardcoded 0 for every other numRepeats>1 case (unchanged behaviour). */}
                    {measureLabel(callResponseGroupMeasures != null ? measureNumForLabel : 0)}
                  </text>
                )}
                {debugMode && <rect x={startX - 10} y={trebleStart - 28} width={60} height={18} fill="magenta" fillOpacity={0.3} stroke="magenta" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
              </g>
            );
          }
          if (mode !== 'repeat') return null;
          // §6d: the begin-repeat sign geometry now lives in the shared repeatSigns module (also
          // used by the PLAYBACK setter, #430). The wrapper <g> keeps data-mel/data-offset for the
          // highlight/animation system.
          const startXOffset = x - 15;
          return (
            <g key={`measure-line-${index}`} data-offset={barlineOffset} data-mel="barline">
              <BeginRepeatSign x={startXOffset} trebleStart={trebleStart} bassStart={bassStart}
                percussionStart={percussionStart} bottomY={bottomY}
                isTrebleVisible={isTrebleVisible} isBassVisible={isBassVisible}
                isPercussionVisible={isPercussionVisible} />
            </g>
          );
        }
        if (isEnd) {
          if (mode !== 'repeat') return null;
          return (
            <g key={`measure-line-${index}`} data-offset={barlineOffset} data-mel="barline">
              <EndRepeatSign x={x} trebleStart={trebleStart} bassStart={bassStart}
                percussionStart={percussionStart} bottomY={bottomY}
                isTrebleVisible={isTrebleVisible} isBassVisible={isBassVisible}
                isPercussionVisible={isPercussionVisible} />
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

// #1155: exported so `BarlinesLayer.test.jsx` can assert on the exact rendered label text without
// needing to satisfy every prop a full SheetMusic/SheetRpgLayer render tree would otherwise require.
export { iterMeasureLines };
export default React.memo(BarlinesLayer);
