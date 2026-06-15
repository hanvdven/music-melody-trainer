import React from 'react';
import { getNoteSemitone, respellToKeySignature, melodicNoteColor } from '../../theory/noteUtils';
import { transposeNoteBySemitones } from '../../theory/musicUtils';

/**
 * ChordLabelsLayer — memoised wrapper around chord-label rendering.
 *
 * Why this exists:
 * SheetMusic.jsx had `renderChordLabels` and `renderSingleChordLabel` as
 * local closures (~210 LOC combined). They were called inline 3× per render
 * (OLD layer, yellow overlay, red/crossfade preview overlay). Each call
 * iterated `processedChords`, dispatched to the per-chord builder which
 * computed roman/letters/slash split, super/subscript layout, accidentals,
 * color-mix per chord. None of this was memoised, so every SheetMusic
 * re-render (~38/min during continuous playback) re-ran the full pass.
 *
 * Moving to a `React.memo`-wrapped component lets React skip the whole pass
 * when all inputs are referentially equal. The per-chord builder
 * (`renderSingleChordLabel` below) is now a pure function with explicit
 * args — no closure capture — so the JSX it returns is deterministic from
 * its inputs.
 *
 * DOM output is unchanged: same `<g data-mel="chord">` wrappers, same
 * `data-measure-index` / `data-local-slot` / `data-chord-notes` attrs that
 * `useSheetMusicHighlight` and `handleSheetMusicClick` rely on.
 */

// Canonical chord-row baseline Y (Han 2026-06-15): the chord row sits this far above the
// treble staff top. SINGLE SOURCE OF TRUTH (§6d) — ChordStyleOverlay imports this so the
// setter's sample labels share the exact baseline and can never drift. Raised from −58 to
// −73 (Han: "move the whole chord row up ~15") so the row sits higher, away from the staff.
export const chordRootY = (trebleStart) => trebleStart - 73;

const renderSingleChordLabel = ({
  chord,
  xPos,
  absoluteOffset,
  chordDuration,
  key,
  idx,
  overrideColor,
  trebleStart,
  chordDisplayMode,
  noteColoringMode,
  theme,
  tonic,
  scaleNotes = [],
  inputTestState,
  measureLengthSlots,
  startMeasureIndex,
  debugMode,
  chordTransSemitones = 0,        // global transposition: written chord names (letters mode)
  chordWrittenAccidentals = 0,
}) => {
  const CHORD_ROOT_Y = chordRootY(trebleStart);  // root text baseline (shared §6d)
  const CHORD_SUPER_DY = 12;              // units above root for superscript

  const rawRomanBase = chord.romanBaseRaw || chord.romanBase || '';
  const isMinorish = chord.quality === 'minor' || chord.quality === 'diminished' || chord.quality === 'dim';
  const romanBaseDisplay = isMinorish ? String(rawRomanBase).toLowerCase() : rawRomanBase;

  const internalRoot = (chord.internalRoot || chord.root || '').replace(/\d+/g, '');
  // internalRoot is now key-spelled at generation time (e.g. G♭ in C Locrian, not F♯)
  // Global transposition (item 5): the LETTER name moves to the written domain (concert B♭ → C),
  // respelled to the written key signature. Roman numerals are tonic-relative so they don't change;
  // the chord COLOUR stays on the concert root (sounding pitch). Octave stripped after respell.
  const spelledRoot = chordTransSemitones && internalRoot
    ? respellToKeySignature(transposeNoteBySemitones(`${internalRoot}4`, chordTransSemitones), chordWrittenAccidentals).replace(/\d+/g, '')
    : internalRoot;
  const isSlash = chord.type === 'slash';
  // N.C. (no chord) — Han 2026-05-28: render literal "N.C." in italic serif,
  // no root/suffix layout. Comes from loaded songs (e.g. HBD anacrusis) where
  // a passage explicitly has no harmony.
  const isNC = chord.type === 'nc';
  // Passing chords are rendered smaller and carry a right-arrow indicator.
  // isPassing lives in meta to avoid mutating the base Chord model.
  const isPassing = chord.meta?.isPassing === true;

  // Merge letters/roman branches — differ only in which fields to display
  const displayRoot = chordDisplayMode === 'letters' ? spelledRoot : romanBaseDisplay;
  const displaySuffix = chordDisplayMode === 'letters' ? (chord.internalSuffix || '') : (chord.romanSuffix || '');
  // Split slash notation (V7/vi) so the /vi part renders as subscript, not superscript.
  // slashIdx = -1 means no slash → old behaviour (entire suffix as superscript).
  const slashIdx = displaySuffix.indexOf('/');
  const superPart = slashIdx === -1 ? displaySuffix : displaySuffix.slice(0, slashIdx);
  const slashPart = slashIdx === -1 ? '' : displaySuffix.slice(slashIdx);
  // Chord NAME colour = the chord ROOT coloured by the active scheme (Han 2026-06-14): chromatone →
  // root's chromatone colour, tonic/scale → root's tonic/scale colour, chords → root's chord tint.
  // Colour stays on the CONCERT root (internalRoot), not the written spelling. overrideColor wins
  // (yellow/red transition previews).
  const chordColor = overrideColor ?? (
    melodicNoteColor(internalRoot, {
      noteColoringMode, tonic, scaleNotes, theme,
      activeChord: noteColoringMode === 'chords' ? { root: internalRoot, notes: [internalRoot] } : null,
    }) || 'var(--text-primary)');

  // Passing chords use a 20% smaller font so they visually subordinate to structural chords
  const rootFontSize = isPassing ? 21 : 26;
  const suffixFontSize = isPassing ? 13 : 16;

  let inputTestClass = '';
  if (inputTestState && inputTestState.activeStaff === 'chords') {
    if (inputTestState.activeIndex === idx) {
      inputTestClass = ` input-test-${inputTestState.status}`;
    } else if (inputTestState.successes?.includes(idx)) {
      inputTestClass = ' input-test-success';
    }
  }

  // data-chord-notes enables tap-to-play: handleSheetMusicClick reads this attribute
  // via ancestor walk and passes the note array to onNoteClick for immediate playback.
  const chordNotesJson = (!isSlash && chord.notes?.length)
    ? JSON.stringify(chord.notes)
    : null;

  return (
    <g key={key} data-offset={absoluteOffset} data-mel="chord" data-duration={chordDuration}
      data-measure-index={Math.floor(absoluteOffset / measureLengthSlots) + startMeasureIndex}
      data-local-slot={absoluteOffset % measureLengthSlots}
      {...(chordNotesJson ? { 'data-chord-notes': chordNotesJson } : {})}
      className={inputTestClass.trim() || undefined}>
      {isNC ? (
        <text
          x={xPos}
          y={CHORD_ROOT_Y}
          fontSize={20}
          fontFamily="Georgia, 'Times New Roman', serif"
          fontStyle="italic"
          fill={chordColor}
          textAnchor="start"
          style={{ userSelect: 'none' }}
        >
          N.C.
        </text>
      ) : isSlash ? (
        <text
          x={xPos}
          y={CHORD_ROOT_Y - 8}
          fontSize="32"
          fontFamily="Maestro"
          fill="var(--text-primary)"
          textAnchor="start"
          style={{ opacity: 0.4 }}
        >
          {/* Empty-count rhythm slash, 8 units above the chord-label baseline (Han 2026-06-15
              round 3). Was 17 above ("too high"), briefly aligned to the baseline, nudged to 10
              above, then lowered by 2 to 8 above so it reads as a rhythm mark over the chord row. */}
          Ë
        </text>
      ) : (
        <>
          {/* Arrow for passing chords — fixed Y so it is never displaced by superscript dy offsets */}
          {isPassing && (
            <text
              x={xPos}
              y={CHORD_ROOT_Y - CHORD_SUPER_DY - 10}
              fontSize="10"
              fontFamily="sans-serif"
              fill={chordColor}
              textAnchor="start"
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >→</text>
          )}
          {/* textAnchor="start" anchors the left edge of the root letter at xPos,
              so the root is always directly above the note regardless of superscript width. */}
          <text
            x={xPos}
            y={CHORD_ROOT_Y}
            textAnchor="start"
            fontFamily="serif"
            fontSize={rootFontSize}
            fontWeight="normal"
            fill={chordColor}
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {displayRoot}
            {displaySuffix && (
              slashIdx === -1 ? (
                // No slash — entire suffix is superscript (unchanged behaviour)
                <tspan fontSize={suffixFontSize} dy={-CHORD_SUPER_DY} dx="2">{displaySuffix}</tspan>
              ) : (
                // Slash notation (e.g. V7/vi): superscript quality only in this text element.
                // The subscript /target is a separate text element below for predictable positioning
                // (tspan dy is relative to cursor after superPart, causing drift when superPart has text).
                <tspan fontSize={suffixFontSize} dy={-CHORD_SUPER_DY} dx="2">{superPart}</tspan>
              )
            )}
          </text>
          {/* Slash subscript (/vi, /IV, etc.) as separate text element.
              x aligns with the root character's right edge (estimated: rootFontSize * 0.65).
              y is at root baseline so the subscript sits visually below the superscript.
              Font is 60% larger than the old tspan (suffixFontSize − 3) for better legibility. */}
          {slashPart && (
            <text
              x={xPos + Math.round(rootFontSize * 0.65)}
              y={CHORD_ROOT_Y + 2}
              textAnchor="start"
              fontFamily="serif"
              fontSize={Math.round(suffixFontSize * 1.6)}
              fontWeight="normal"
              fill={chordColor}
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >{slashPart}</text>
          )}
        </>
      )}
      {/* Transparent hit area — chord texts have pointerEvents:none so this rect
          catches clicks and lets the ancestor walk find data-chord-notes on the <g>. */}
      {chordNotesJson && (
        <rect
          x={xPos - 3}
          y={CHORD_ROOT_Y - 28}
          width={45}
          height={36}
          fill={debugMode ? 'teal' : 'transparent'}
          fillOpacity={debugMode ? 0.4 : 1}
          stroke={debugMode ? 'teal' : 'none'}
          strokeWidth={debugMode ? 1 : 0}
          style={{ cursor: 'pointer' }}
        />
      )}
    </g>
  );
};

const ChordLabelsLayer = ({
  // data
  chordProgression,        // only used for null check (overlay can skip when null)
  chords,                  // chord array to render — overrides processedChords when non-null
  processedChords,         // default chord array (from parent's memoised processing)
  // layout
  offsets,
  startX,
  noteWidth,
  pixelsPerTick,
  displayNumMeasures,
  measureLengthSlots,
  trebleStart,
  startMeasureIndex,
  // styling
  chordDisplayMode,
  noteColoringMode,
  theme,
  tonic,
  scaleNotes = [],
  debugMode,
  overrideColor,
  // global transposition (item 5)
  chordTransSemitones = 0,
  chordWrittenAccidentals = 0,
  // interaction
  inputTestState,
}) => {
  const chordsToRender = chords ?? processedChords;
  if (!chordProgression || !chordsToRender || chordsToRender.length === 0) return null;

  const getXLocal = (index) => index === 0 ? startX - 35 : startX + (index - 1) * noteWidth;
  const labels = [];
  const totalSlots = displayNumMeasures * measureLengthSlots;

  chordsToRender.forEach((item, idx) => {
    const { chord, absoluteOffset } = item;
    if (!chord) return;
    const nextOffset = idx < chordsToRender.length - 1 ? chordsToRender[idx + 1].absoluteOffset : totalSlots;
    const chordDuration = nextOffset - absoluteOffset;

    let xPos;
    if (pixelsPerTick !== null) {
      // Tick-based: position directly from absoluteOffset (no slot-index search needed)
      xPos = startX + absoluteOffset * pixelsPerTick;
    } else {
      // Elastic: find visual position in the provided offsets grid
      let visualIdx = -1;
      for (let i = 0; i < offsets.length; i++) {
        if (typeof offsets[i] === 'number' && Math.abs(offsets[i] - absoluteOffset) < 0.01) {
          visualIdx = i;
          break;
        }
      }
      if (visualIdx === -1) return;
      xPos = getXLocal(visualIdx);
    }

    labels.push(renderSingleChordLabel({
      chord,
      xPos,
      absoluteOffset,
      chordDuration,
      key: `chord-p-${idx}`,
      idx,
      overrideColor,
      trebleStart,
      chordDisplayMode,
      noteColoringMode,
      theme,
      tonic,
      scaleNotes,
      inputTestState,
      measureLengthSlots,
      startMeasureIndex,
      debugMode,
      chordTransSemitones,
      chordWrittenAccidentals,
    }));
  });

  return <>{labels}</>;
};

export default React.memo(ChordLabelsLayer);
