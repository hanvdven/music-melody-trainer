// #693 round 12 (Han, repeated across rounds 10-12: "dit soort settings moet globaal zijn" — the pet-vs-
// persona 1px avatar-preview mismatch AND the RPG level's own 1px-too-low sprites were both caused by
// per-screen-independently-tuned magic numbers instead of one shared source): the ONE native-pixel offset
// from the bottom of a placed sprite's own crop to its ground-contact point. Every world/avatar renderer
// that bottom-anchors a sprite reads this SAME value (each at its own display scale — RpgLevelPanel
// multiplies by its `ZOOM`; a differently-scaled context would multiply by its own factor) so retuning it
// (as happened in round 11, 16→15) only ever touches this one number, never several independently-drifting
// per-file constants.
export const GROUND_ANCHOR_PX = 15;
