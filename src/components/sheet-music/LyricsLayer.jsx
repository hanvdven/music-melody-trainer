import React from 'react';
import { getNoteSemitone } from '../../theory/noteUtils';
import {
  isCompoundMeter,
  getEffectiveBeatDuration,
  getTakadimiSyllable,
  getTakadimiSyllableGrouped,
  getTupletSyllable,
  isRest,
} from '../../theory/rhythmicSolfege';
import { TICKS_PER_WHOLE } from '../../constants/timing.js';

/**
 * LyricsLayer — three lyric/syllable rows that sit under (or, for the rhythmic
 * row, below the percussion) staff. Extracted verbatim from SheetMusic.jsx
 * (Han 2026-06-19, audit §4) where they lived as three near-identical inline
 * closures `renderLyricsRow` / `renderTextLyricsRow` / `renderRhythmicLyricsRow`.
 *
 * WHY one module, three render paths (Han 2026-06-19): the three rows differ
 * structurally enough — different DOM shape (a stacked clickable chord <g> vs a
 * bare non-interactive <text> vs a single clickable percussion <g>), different
 * syllable source (solfège / song text / Takadimi), and different rest-skipping
 * and tie-continuation behaviour — that collapsing them behind one switch body
 * would risk a byte-level divergence in the rendered SVG. Per the audit brief
 * (correctness over maximal dedup) each former closure is preserved as its own
 * internal render function and selected by the `variant` prop. Output is
 * byte-identical to the old inline closures for every case.
 *
 * The two parent helpers `getLyricFill` and `getSolfegeForNote` capture a large
 * slice of SheetMusic state (theme, noteColoringMode, processedChords, tonic,
 * scaleNotes, lyricsMode, chordTransSemitones, …). Rather than re-thread all of
 * that, they are passed in as function props so the colour/syllable resolution
 * stays single-sourced and identical to before.
 */

// Renders melodic solfège lyrics (do-re-mi / Kodály) below the treble staff.
// lyricsY is the absolute SVG y coordinate for the text baseline.
const renderMelodic = ({
  melody, lyricsY, offsets, nw, startX,
  tonic, melodicLyricsActive,
  getLyricFill, getSolfegeForNote, onNoteClick,
  LYRIC_FONT_SIZE, LYRIC_CHORD_FONT_SIZE,
}) => {
  if (!melody || !tonic || !melodicLyricsActive) return null;
  const notes = melody.notes;
  const melOffsets = melody.offsets;
  if (!notes || !melOffsets) return null;
  const ties = melody.ties || [];

  const getXLocal = (index) => startX + (index - 1) * nw;

  // Sort a chord array low-to-high by MIDI pitch
  const sortedChordNotes = (note) => {
    if (!Array.isArray(note)) return [note];
    const midiOf = (n) => {
      const m = String(n).match(/^(.+?)(-?\d+)$/);
      return m ? parseInt(m[2]) * 12 + getNoteSemitone(m[1]) : 0;
    };
    return [...note].sort((a, b) => midiOf(a) - midiOf(b));
  };

  return notes.map((note, i) => {
    if (isRest(note)) return null;
    const tickOffset = melOffsets[i];
    if (tickOffset == null) return null;
    const idx = offsets.indexOf(tickOffset);
    if (idx < 0) return null;
    const x = getXLocal(idx) + 5;

    // Tied continuation: show em dash instead of syllable (not clickable)
    const isTieContinuation = i > 0 && ties[i - 1] === 'tie';
    if (isTieContinuation) {
      const fill = getLyricFill(note, tickOffset, false);
      return (
        <text key={`lyric-${i}`} x={x} y={lyricsY} textAnchor="middle" data-fly=""
          fontSize={LYRIC_FONT_SIZE} fontFamily="serif" fill={fill} opacity={0.45}>
          {'—'}
        </text>
      );
    }

    const chordNotes = sortedChordNotes(note);
    const isChord = chordNotes.length > 1;
    const fontSize = isChord ? LYRIC_CHORD_FONT_SIZE : LYRIC_FONT_SIZE;
    // Stack syllables: lowest note at lyricsY, higher notes going upward
    const spacing = fontSize + 1;

    return (
      <g key={`lyric-${i}`} data-fly="" style={{ cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); if (onNoteClick) onNoteClick(chordNotes, 'treble'); }}>
        <rect x={x - 14} y={lyricsY - spacing * chordNotes.length} width={28} height={spacing * chordNotes.length + 4} fill="transparent" />
        {chordNotes.map((singleNote, ni) => {
          const { base, acc } = getSolfegeForNote(singleNote);
          const fill = getLyricFill(isChord ? singleNote : note, tickOffset, false);
          // ni=0 is the lowest note (bottom), higher indices go upward
          const y = lyricsY - ni * spacing;
          return (
            <text key={ni} x={x} y={y} textAnchor="middle" fontSize={fontSize} fontFamily="serif" fill={fill} style={{ pointerEvents: 'none' }}>
              {base.toLowerCase()}
              {acc && <tspan fontSize={fontSize * 0.95} dy={-2} opacity={0.5}>{acc}</tspan>}
            </text>
          );
        })}
      </g>
    );
  });
};

// Renders song text lyrics (from melody.lyrics[]) below the treble staff.
// Used when a song is loaded; independent of the solfège lyricsMode setting.
const renderTextLyrics = ({
  melody, lyricsY, offsets, nw, startX,
  textLyricsActive, getLyricFill,
}) => {
  if (!melody?.lyrics || !textLyricsActive) return null;
  const notes = melody.notes;
  const melOffsets = melody.offsets;
  if (!notes || !melOffsets) return null;

  const getXLocal = (index) => startX + (index - 1) * nw;
  const FONT_SIZE = 13;

  return notes.map((note, i) => {
    const syllable = melody.lyrics[i];
    if (!syllable) return null;
    const tickOffset = melOffsets[i];
    if (tickOffset == null) return null;
    const idx = offsets.indexOf(tickOffset);
    if (idx < 0) return null;
    const x = getXLocal(idx) + 5;
    const fill = getLyricFill(note, tickOffset, false);
    return (
      <text
        key={`tlyric-${i}`}
        data-fly=""
        x={x} y={lyricsY}
        textAnchor="middle"
        fontSize={FONT_SIZE}
        fontFamily="Georgia, 'Times New Roman', serif"
        fill={fill}
      >
        {syllable}
      </text>
    );
  });
};

// Renders Takadimi rhythmic solfège lyrics below the percussion staff.
const renderRhythmicLyrics = ({
  melody, lyricsY, offsets, nw, startX,
  rhythmicLyricsActive, timeSignature, measureLengthSlots,
  getLyricFill, onNoteClick, LYRIC_FONT_SIZE,
}) => {
  if (!melody || !rhythmicLyricsActive) return null;
  const notes = melody.notes;
  const melOffsets = melody.offsets;
  if (!notes || !melOffsets) return null;

  const compound = isCompoundMeter(timeSignature);
  // Prefer smallestNoteDenom from the melody's generation settings over deriving from durations.
  // e.g. percussion set to 16th-note grid → beat = quarter even if no 16ths were generated.
  const beatDur = getEffectiveBeatDuration(timeSignature, melody.durations, melody.smallestNoteDenom ?? null);
  // Group-aware Takadimi: rhythmicGrouping carries the beat-group sizes (e.g. [2,3] for 5/8).
  // When present, each group independently determines simple (÷2) or compound (÷3) syllables.
  const melodyGrouping = melody.rhythmicGrouping ?? null;
  const unitTicks = TICKS_PER_WHOLE / timeSignature[1];
  const getXLocal = (index) => startX + (index - 1) * nw;

  // Pre-compute tuplet position for each note. melody.triplets[i] identifies the group
  // (same id for all notes in a group); posInGroup is the 0-based index within it.
  // This is more reliable than tick-based detection: Math.round(groupTicks / noteCount)
  // produces non-integer B/N fractions that don't satisfy exact equality checks.
  const triplets = melody.triplets ?? null;
  const tupletPosMap = new Map(); // note index → { noteCount, posInGroup }
  if (triplets) {
    let lastTupletId = null;
    let posInGroup = 0;
    for (let ti = 0; ti < notes.length; ti++) {
      const t = triplets[ti];
      if (t) {
        if (t.id === lastTupletId) {
          posInGroup++;
        } else {
          posInGroup = 0;
          lastTupletId = t.id;
        }
        tupletPosMap.set(ti, { noteCount: t.noteCount, posInGroup });
      } else {
        lastTupletId = null;
      }
    }
  }

  return notes.map((note, i) => {
    // Skip rests and null slots — only annotate actual drum hits
    if (isRest(note)) return null;
    const tickOffset = melOffsets[i];
    if (tickOffset == null) return null;
    const idx = offsets.indexOf(tickOffset);
    if (idx < 0) return null;
    const x = getXLocal(idx) + 5;

    // Tuplet notes use position-within-group syllables (ta ka di mi ti / ta va ki di da ma ti).
    // Regular notes: when rhythmicGrouping is available, derive syllable from the beat group
    // the note falls in (group of 3 = compound ta-ki-da, group of 2 = simple ta-di).
    // Falls back to the single-beatDuration path for metronome / missing grouping.
    const tupletPos = tupletPosMap.get(i);
    const syllable = tupletPos
        ? getTupletSyllable(tupletPos.posInGroup, tupletPos.noteCount)
        : melodyGrouping
            ? getTakadimiSyllableGrouped(tickOffset % measureLengthSlots, melodyGrouping, unitTicks)
            : getTakadimiSyllable(tickOffset, beatDur, compound);
    if (!syllable || syllable === '·') return null;

    const percNotes = Array.isArray(note) ? note : [note];
    return (
      <g key={`rlyric-${i}`} data-fly="" style={{ cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); if (onNoteClick) onNoteClick(percNotes, 'percussion'); }}>
        <rect x={x - 12} y={lyricsY - LYRIC_FONT_SIZE} width={24} height={LYRIC_FONT_SIZE + 6} fill="transparent" />
        <text
          x={x} y={lyricsY} textAnchor="middle"
          fontSize={LYRIC_FONT_SIZE} fontFamily="serif"
          fill={getLyricFill(note, tickOffset, true)}
          style={{ pointerEvents: 'none' }}
        >
          {syllable}
        </text>
      </g>
    );
  });
};

/**
 * Single entry point. `variant` selects which of the three preserved render
 * paths to run; all other props are the values the old inline closures
 * captured from SheetMusic.jsx (geometry, active flags, and the two resolver
 * function props). Returns the same array-of-elements the closures returned, so
 * SheetMusic can drop `<LyricsLayer …/>` in place of `{renderXxxRow(...)}`.
 */
const LyricsLayer = (props) => {
  switch (props.variant) {
    case 'melodic': return <>{renderMelodic(props)}</>;
    case 'text': return <>{renderTextLyrics(props)}</>;
    case 'rhythmic': return <>{renderRhythmicLyrics(props)}</>;
    default: return null;
  }
};

export default LyricsLayer;
