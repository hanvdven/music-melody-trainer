import Melody from '../model/Melody.js';
import Chord from '../model/Chord.js';
import { transposeNoteBySemitones } from '../theory/musicUtils.js';
import { getNoteSemitone } from '../theory/noteUtils.js';

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
    if (!note || typeof note !== 'string') return note;
    if (!PITCH_RE.test(note)) return note; // percussion tokens, rests, sentinels
    return transposeNoteBySemitones(note, shift);
  };

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
    // Songs never use automatic rhythmic-grouping derivation; supply the
    // measure-grouping explicitly so beam calculations work correctly.
    treble.rhythmicGrouping = songDef.rhythmicGrouping ?? null;
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
    bass.rhythmicGrouping = songDef.rhythmicGrouping ?? null;
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
    percussion.rhythmicGrouping = songDef.rhythmicGrouping ?? null;
  }

  // ── Chord melody ──────────────────────────────────────────────────────────
  // The chord melody is a Melody where:
  //   .notes[i]       = string[] of pitched chord notes (played by sequencer)
  //   .displayNotes[i]= Chord object (used by getChordsWithSlashes for display)
  //   .offsets[i]     = tick start
  //   .durations[i]   = tick duration
  let chordMelody = null;
  if (diffData.chords) {
    const chordNotes      = diffData.chords.map(c => c.notes.map(transpose));
    const chordDurations  = diffData.chords.map(c => c.duration);
    const chordOffsets    = diffData.chords.map(c => c.offset);
    const chordDisplays   = diffData.chords.map((c, i) => {
      const newRoot  = shift !== 0 ? transposeNoteBySemitones(c.root, shift) : c.root;
      const newNotes = chordNotes[i];
      const rootPC   = newRoot.replace(/-?\d+$/, '');
      return new Chord(newRoot, c.type, newNotes, c.name, rootPC, '', '', [], []);
    });
    chordMelody = new Melody(chordNotes, chordDurations, chordOffsets, chordDisplays);
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
