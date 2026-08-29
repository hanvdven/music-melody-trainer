import Melody from '../model/Melody';

// #1155 (Han 2026-08-24, "waarom is er geen call-response optie bij de liederen, zoals sakura?"): call-
// response for a FIXED song must NOT generate new content (that's variant H, #1154) — it splits the
// song's OWN, ALREADY-COMPOSED measures into call (wizard-cast) + response (play it back) pairs, exactly
// like `generateLevel9CallResponseBlock` does for procedurally-generated levels, just SLICED from a real
// melody instead of freshly generated.
//
// #1165 (Han 2026-08-29) — `sliceSongCallResponseBlock` is GONE, MERGED, not lost: it was
// `sliceMelodyByRange` (the app's one melody slicer) followed by exactly the transform
// `generateLevel9CallResponseBlock` applies to GENERATED material. `generateBlock`'s
// `shape: 'call-response'` post-transform (#1164) is now that one shared transform, applied to whichever
// source produced the block's material — generated notes, or a song slice handed in as the block's fixed
// material by `useLevelContentStream`. Two mechanisms became one; nothing about a song's call-response
// output changed (same `collapseToCallRests` call half, same raw material shifted one group later).
// `doubleMelodyForCallResponse` below stays: it is the CHORD-track half of #1155, applied once at song
// load, not a per-block generator — and #1165 additionally reuses it for a call-response block's
// bass/percussion accompaniment, for the exact reason its own comment gives.
//
// Bug fix (Han 2026-08-25 UAT, Sakura d/e: "de akkoorden (en dus de bas) houden geen rekening met de
// herhalingen. De lengte van het nummer is ook niet verdubbeld"): `sliceSongCallResponseBlock` above
// correctly doubles the DISPLAYED TREBLE (call+response per song-measure-group), grown JIT block-by-block
// by `useLevelTrebleStream.js`. But the song's CHORD PROGRESSION (`loaded.chordMelody`, set ONCE at song
// load by App.jsx's `handleLoadSong` — chords are not JIT-streamed, unlike treble) was never given the
// same treatment: it stayed at the song's ORIGINAL, un-doubled length, so exactly halfway through the
// doubled treble content the chords (and bass, which follows chord roots via `force_chord_roots` —
// §6c, one shared `lvl.totalMeasures` value both the chord doubling below and `useLevelBackingStream.js`'s
// bass/cello generation depend on) ran out — the "end of song" barline appeared at the WRONG (un-doubled)
// position, and the level kept running past it with no harmony left.
//
// UNLIKE the treble transform, chords are NOT rest-collapsed for the call half — the chord/harmonic
// backdrop is not something the player "guesses by ear" (that's the melody's job), it's the continuous
// accompaniment underneath both the call AND the response, so the SAME chord content is simply repeated
// for each half. Doubles the WHOLE melody upfront (chords are loaded once, not JIT-grown, so there is no
// per-block caller to do this incrementally the way treble's JIT stream does).
export function doubleMelodyForCallResponse({ melody, groupMeasures, measureLengthTicks, totalMeasures }) {
  if (!melody || !melody.notes || melody.notes.length === 0) return melody;
  const notes = [];
  const durations = [];
  const offsets = [];
  const displayNotes = [];
  const displaySource = melody.displayNotes || melody.notes;
  const groupTicks = groupMeasures * measureLengthTicks;
  const numGroups = Math.ceil(totalMeasures / groupMeasures);

  for (let g = 0; g < numGroups; g++) {
    const startTick = g * groupTicks;
    const endTick = startTick + groupTicks;
    const groupBase = g * 2 * groupTicks;   // this group's CALL half starts here; RESPONSE is +groupTicks

    const groupEvents = [];
    for (let i = 0; i < melody.notes.length; i++) {
      const o = melody.offsets[i];
      if (o == null || o < startTick || o >= endTick) continue;
      groupEvents.push({
        note: melody.notes[i], duration: melody.durations[i],
        offset: groupBase + (o - startTick), display: displaySource[i],
      });
    }
    // CALL half, then RESPONSE half (same events, shifted one group-length later) — pushed as two
    // separate passes (not interleaved) so the final arrays stay in ascending-offset order, same
    // convention every other offsets array in this codebase relies on.
    for (const e of groupEvents) { notes.push(e.note); durations.push(e.duration); offsets.push(e.offset); displayNotes.push(e.display); }
    for (const e of groupEvents) { notes.push(e.note); durations.push(e.duration); offsets.push(e.offset + groupTicks); displayNotes.push(e.display); }
  }

  const doubled = new Melody(notes, durations, offsets, displayNotes);
  doubled.rhythmicGrouping = melody.rhythmicGrouping ?? null;
  return doubled;
}

export default doubleMelodyForCallResponse;
