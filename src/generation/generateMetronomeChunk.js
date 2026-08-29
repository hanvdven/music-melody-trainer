import MelodyGenerator from './melodyGenerator';

// #1165 (Han 2026-08-29): the metronome half of the retired `generateLevelBackingChunk.js`,
// moved here VERBATIM (settings object and its comment included). The BASS half is gone —
// a level's bass is now built by the one shared `generateBlock` alongside treble/percussion,
// off one rhythm grid. The metronome deliberately did NOT move with it:
//
//   Han's accepted side-effect (a) for #1165: "cello/bass rhythm now follows numMeasures;
//   the METRONOME stays byte-identical." It is a deterministic per-beat click track
//   (`notesPerMeasure = timeSignature[0]`, `rhythmVariability: 0`, `randomizationRule:
//   'metronome'`) with no dependency on the chord progression, the shared rhythm grid, or
//   anything else a block carries — so its output is identical whether it is generated in
//   `leadInBars`-sized chunks (as it was until #1165) or `numMeasures`-sized blocks. Routing
//   it through `generateBlock` would give it a chord context and a shared grid it must not
//   have, which is the one way that byte-identity COULD be lost.
//
// PURE: takes everything it needs as arguments, returns one Melody-shaped object whose
// offsets are 0-based (relative to the chunk) — the caller shifts them into the growing
// melody's absolute tick-space.
export function generateMetronomeChunk({ timeSignature, measures, runId }) {
  if (!(measures > 0)) return { notes: [], durations: [], offsets: [], displayNotes: [] };
  // Mirrors useMelodyState.js's metronomeGenSettings exactly (§6c — single source of the
  // metronome generation recipe would be nice, but the two calls differ only in numMeasures/
  // runId; duplicating this small settings object is cheaper and clearer than threading it
  // through as a parameter from a hook that has no other reason to know metronome internals).
  const metronomeGenSettings = {
    notesPerMeasure: timeSignature[0],
    smallestNoteDenom: timeSignature[1],
    rhythmVariability: 0,
    enableTriplets: false,
    notePool: ['wh', 'wm', 'wl'],
    playStyle: 'metronome',
    type: 'metronome',
    randomizationRule: 'metronome',
  };
  return new MelodyGenerator(
    null,
    measures,
    timeSignature,
    metronomeGenSettings,
    null,
    null,
    `${runId}-met`,
  ).generateMelody();
}

export default generateMetronomeChunk;
