// #858 (Han 2026-08-10, "de melodies class moet meerdere instanties kunnen dragen... max 4
// gerenderd (progression/treble/bass/percussion), ~16 totaal mogelijk"): the 4 rendered slots
// (treble/bass/percussion/chordProgression) keep their existing names and mechanism unchanged —
// they are the ones SheetMusic actually draws. Everything else the app plays but never draws
// (metronome clicks, timpani hits, future guide/backing layers) is an AUDIO-ONLY instance.
//
// Han's explicit answer on instance identity: a FIXED list of named slots, `invisibleMelody1`
// through `invisibleMelody10` — not a freeform id/array. A slot is just a name MelodyContext
// carries an optional Melody under (see MelodyContext.jsx's `invisibleMelodies` prop); nothing
// renders it. This replaces the old pattern of inventing a bespoke ref per audio-only feature
// (e.g. App.jsx's `timpaniRef`) with one shared, generalized mechanism.
export const INVISIBLE_MELODY_SLOTS = Array.from({ length: 10 }, (_, i) => `invisibleMelody${i + 1}`);

// Semantic ownership: which invisible slot a given audio-only feature uses. Recorded here (§6c —
// not as a literal string at the call site) so slot ownership has one source of truth as more
// audio-only layers get migrated onto this mechanism.
export const LEVEL_TIMPANI_SLOT = INVISIBLE_MELODY_SLOTS[0]; // 'invisibleMelody1'
// #871 follow-up (Han 2026-08-11, "cello en timpanen... moeten niet op bass melody en percussion
// melody staan; ze zouden op twee van de invisible melodies moeten staan. Geldt voor alle levels."):
// the level's cello guide track — previously the rendered `bass` staff's own content by design
// (§187's "deliberately NOT done this round") — is now ALSO an audio-only instance, decoupled from
// whether the bass staff is shown at all. It keeps playing through its own dedicated Soundfont
// (App.jsx's `celloRef`, mirroring `timpaniRef`) regardless of the level's `songHasBass`.
export const LEVEL_CELLO_SLOT = INVISIBLE_MELODY_SLOTS[1]; // 'invisibleMelody2'
