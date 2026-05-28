// Happy Birthday to You — definition is loaded from sibling JSON so that the
// pure score data (notes/durations/offsets/lyrics/chords) lives separately from
// any JS-only fields. The JSON was regenerated 2026-05-27 from the uploaded
// `Happy_Birthday___Piano.mid` (Han 2026-05-27 chat). See the JSON's
// `_layoutNotes` for the 3/4 reinterpretation rationale.
//
// Two difficulties:
//   easy — single melodic line (top notes of the MIDI stacks, 24 notes).
//          Bass left null so the generator's walking-bass config fills it in.
//   hard — full chorale-style harmonisation with MIDI's chord-stack voicings in
//          both staves (25 treble onsets incl. continuation, 19 bass onsets).
//
// A stripped easy derived automatically from hard is on BACKLOG; until that
// lands, easy is the hand-curated MIDI-top-note layout below.
import data from '../data/happyBirthday.json';

export default data;
