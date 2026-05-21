import Melody from '../model/Melody.js';
import Chord from '../model/Chord.js';
import { transposeNoteBySemitones } from '../theory/musicUtils.js';
import { getNoteSemitone } from '../theory/noteUtils.js';

/**
 * Converts a song definition + optional transposition into the Melody objects
 * expected by the app's state setters.
 *
 * @param {object} songDef   - Song definition from songs/definitions/*.js
 * @param {string} difficulty - 'easy' | 'medium' | 'hard'
 * @param {string|null} targetTonic - Pitch class to transpose to (e.g. 'G'). Null = use song default.
 * @returns {{ treble: Melody, chordMelody: Melody, timeSignature: number[], numMeasures: number, defaultTempo: number }}
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

  const transpose = (note) => {
    // Pass percussion tokens (e.g. 'k', 's', 'hh') and rests (null) through unchanged.
    if (!note || typeof note !== 'string' || note.length <= 2) return note;
    return transposeNoteBySemitones(note, shift);
  };

  // ── Treble melody ─────────────────────────────────────────────────────────
  const td = diffData.treble;
  const treble = new Melody(
    td.notes.map(transpose),
    [...td.durations],
    [...td.offsets],
  );
  treble.lyrics = [...td.lyrics];
  // Songs never use automatic rhythmic-grouping derivation; supply the
  // measure-grouping explicitly so beam calculations work correctly.
  treble.rhythmicGrouping = songDef.rhythmicGrouping ?? null;

  // ── Chord melody ──────────────────────────────────────────────────────────
  // The chord melody is a Melody where:
  //   .notes[i]       = string[] of pitched chord notes (played by sequencer)
  //   .displayNotes[i]= Chord object (used by getChordsWithSlashes for display)
  //   .offsets[i]     = tick start
  //   .durations[i]   = tick duration
  const chordNotes      = diffData.chords.map(c => c.notes.map(transpose));
  const chordDurations  = diffData.chords.map(c => c.duration);
  const chordOffsets    = diffData.chords.map(c => c.offset);
  const chordDisplays   = diffData.chords.map((c, i) => {
    const newRoot  = shift !== 0 ? transposeNoteBySemitones(c.root, shift) : c.root;
    const newNotes = chordNotes[i];
    const rootPC   = newRoot.replace(/-?\d+$/, '');
    return new Chord(newRoot, c.type, newNotes, c.name, rootPC, '', '', [], []);
  });

  const chordMelody = new Melody(chordNotes, chordDurations, chordOffsets, chordDisplays);

  return {
    treble,
    chordMelody,
    timeSignature: songDef.timeSignature,
    numMeasures: songDef.numMeasures,
    defaultTempo: songDef.defaultTempo,
  };
}
