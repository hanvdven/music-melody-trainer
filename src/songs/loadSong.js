import Melody from '../model/Melody.js';
import Chord from '../model/Chord.js';
import { transposeNoteBySemitones } from '../theory/musicUtils.js';
import { getNoteSemitone } from '../theory/noteUtils.js';
import { chooseGrouping } from '../generation/rhythmicPriorities.js';

/**
 * Converts a song definition + optional transposition into the Melody objects
 * expected by the app's state setters.
 *
 * Tracks the song does not provide (e.g. `bass: null`) are returned as `null`;
 * the caller is responsible for deciding whether to clear the corresponding
 * app state, regenerate it from the song's generator config, or leave the
 * existing value in place.
 *
 * @param {object} songDef   - Song definition from songs/definitions/*.js
 * @param {string} difficulty - 'easy' | 'medium' | 'hard'
 * @param {string|null} targetTonic - Pitch class to transpose to (e.g. 'G'). Null = use song default.
 * @returns {{
 *   treble: Melody|null,
 *   bass: Melody|null,
 *   percussion: Melody|null,
 *   chordMelody: Melody|null,
 *   timeSignature: number[],
 *   numMeasures: number,
 *   defaultTempo: number,
 *   defaultTonic: string,
 *   scaleMode: string,
 *   generator: object,
 *   shift: number,
 * }}
 */
export function loadSong(songDef, difficulty = 'easy', targetTonic = null) {
  const diffData = songDef.difficulties[difficulty];
  if (!diffData) {
    throw new Error(`Song '${songDef.id}' has no difficulty '${difficulty}'.`);
  }

  // Semitone shift from the song's written key to the user's target tonic.
  // Clamp to [-6, +6] so we pick the nearest transposition direction.
  let shift = 0;
  if (targetTonic && targetTonic !== songDef.defaultTonic) {
    const src = getNoteSemitone(songDef.defaultTonic);
    const dst = getNoteSemitone(targetTonic);
    shift = ((dst - src + 18) % 12) - 6; // shortest chromatic path
  }

  // Pitch notes match `<letter><optional accidental><octave>`. The previous
  // version used `note.length <= 2` as a percussion-token filter, but that
  // wrongly catches two-char pitch notes like "C3" / "G3" / "F3" → they
  // never got transposed. Only notes with accidentals (Bb3, F♯4) were
  // transposed, so loading Happy Birthday into any non-F tonic produced
  // mangled chords (the natural triad notes stayed in F while the
  // accidentals moved).
  const PITCH_RE = /^[A-G][#♯b♭]?-?\d+$/;
  const transpose = (note) => {
    // Recurse into chord-stack arrays. Without this, songs that voice a track
    // as [['C4','E4','G4'], 'D4', ...] would only transpose the scalar element
    // and silently leave the chord stacks in the song's written key — audible
    // immediately as the wrong chord on every stacked onset.
    if (Array.isArray(note)) return note.map(transpose);
    if (!note || typeof note !== 'string') return note;
    if (!PITCH_RE.test(note)) return note; // percussion tokens, rests, sentinels
    return transposeNoteBySemitones(note, shift);
  };

  // Fallback rhythmic grouping derived from the time signature when the song
  // doesn't provide one (Han 2026-05-28). Reuses `chooseGrouping` (which the
  // generator already uses for its own meters) so we keep one source of truth
  // for "prefer 3s then 2s" decomposition. Works for regular and irregular
  // meters: 3/4 → [3], 4/4 → [2,2], 5/4 → [3,2], 6/8 → [3,3], 7/8 → [3,2,2],
  // 11/8 → [3,3,3,2], 13/16 → [3,3,3,2,2]. The result is at the BEAT level
  // (= denominator-unit count); finer subdivisions are handled by downstream
  // beaming logic.
  const fallbackGrouping = chooseGrouping(songDef.timeSignature[0]);
  const groupingForSong = songDef.rhythmicGrouping ?? fallbackGrouping;

  // Song-level fermatas (Han 2026-05-29 round 13). Tick-based format:
  // { tick, hold } where `tick` is the absolute tick of the fermata note and
  // `hold` is how many extra ticks every subsequent note gets delayed by.
  // Propagated to ALL track melodies (treble, bass, percussion, chordMelody)
  // so audio shifts uniformly — the previous per-track-treble-only design
  // left the chord and bass tracks playing on the natural timeline while the
  // treble shifted, which Han correctly flagged as "alleen op treble melodie".
  const songFermatas = Array.isArray(diffData.fermatas)
    ? diffData.fermatas.filter(f => f && typeof f.tick === 'number' && typeof f.hold === 'number' && f.hold > 0)
    : [];

  // ── Treble melody ─────────────────────────────────────────────────────────
  let treble = null;
  if (diffData.treble) {
    const td = diffData.treble;
    treble = new Melody(
      td.notes.map(transpose),
      [...td.durations],
      [...td.offsets],
    );
    if (td.lyrics) treble.lyrics = [...td.lyrics];
    treble.rhythmicGrouping = groupingForSong;
    if (songFermatas.length > 0) treble.fermatas = songFermatas.map(f => ({ ...f }));
  }

  // ── Bass melody ───────────────────────────────────────────────────────────
  let bass = null;
  if (diffData.bass) {
    const bd = diffData.bass;
    bass = new Melody(
      bd.notes.map(transpose),
      [...bd.durations],
      [...bd.offsets],
    );
    bass.rhythmicGrouping = groupingForSong;
    if (songFermatas.length > 0) bass.fermatas = songFermatas.map(f => ({ ...f }));
  }

  // ── Percussion melody ─────────────────────────────────────────────────────
  let percussion = null;
  if (diffData.percussion) {
    const pd = diffData.percussion;
    // Percussion tokens are not transposed (the transpose helper passes them
    // through, but we skip the .map for clarity / efficiency).
    percussion = new Melody(
      [...pd.notes],
      [...pd.durations],
      [...pd.offsets],
    );
    percussion.rhythmicGrouping = groupingForSong;
    if (songFermatas.length > 0) percussion.fermatas = songFermatas.map(f => ({ ...f }));
  }

  // ── Chord melody ──────────────────────────────────────────────────────────
  // The chord melody is a Melody where:
  //   .notes[i]       = string[] of pitched chord notes (played by sequencer)
  //   .displayNotes[i]= Chord object (used by getChordsWithSlashes for display)
  //   .offsets[i]     = tick start
  //   .durations[i]   = tick duration
  let chordMelody = null;
  if (diffData.chords) {
    // N.C. (no chord) entries have type 'nc' + empty notes/root. They participate
    // in the chord-progression timeline but are not transposed and play silently
    // (the audio scheduler sees an empty notes array → schedules nothing). The
    // visual layer renders "N.C." instead of a root + suffix (Han 2026-05-28).
    const chordNotes      = diffData.chords.map(c => c.type === 'nc' ? [] : c.notes.map(transpose));
    const chordDurations  = diffData.chords.map(c => c.duration);
    const chordOffsets    = diffData.chords.map(c => c.offset);
    const chordDisplays   = diffData.chords.map((c, i) => {
      if (c.type === 'nc') {
        // Construct a placeholder Chord with type='nc'. Root is empty; the
        // label layer detects this and renders "N.C." instead of root+suffix.
        return new Chord('', 'nc', [], c.name || 'N.C.', '', '', '', [], []);
      }
      const newRoot  = shift !== 0 ? transposeNoteBySemitones(c.root, shift) : c.root;
      const newNotes = chordNotes[i];
      const rootPC   = newRoot.replace(/-?\d+$/, '');
      // c.suffix (Han 2026-05-29) is the explicit chord suffix for display,
      // e.g. "maj9", "dim", "7♭5". Without it, ChordLabelsLayer just shows the
      // root letter — fine for the easy progression but not for the jazz
      // arrangement on hard. Falls back to the empty string when the JSON
      // doesn't provide one. c.meta carries flags like isPassing so the
      // smaller-font + arrow rendering kicks in for passing chords.
      return new Chord(newRoot, c.type, newNotes, c.name, rootPC, c.suffix || '', '', [], [], c.meta || {});
    });
    chordMelody = new Melody(chordNotes, chordDurations, chordOffsets, chordDisplays);
    if (songFermatas.length > 0) chordMelody.fermatas = songFermatas.map(f => ({ ...f }));
  }

  return {
    treble,
    bass,
    percussion,
    chordMelody,
    timeSignature: songDef.timeSignature,
    numMeasures: songDef.numMeasures,
    defaultTempo: songDef.defaultTempo,
    defaultTonic: songDef.defaultTonic,
    scaleMode: songDef.generator?.scaleMode ?? null,
    scaleFamily: songDef.generator?.scaleFamily ?? null,
    generator: songDef.generator ?? {},
    shift,
  };
}
