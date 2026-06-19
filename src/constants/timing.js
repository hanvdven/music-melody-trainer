/**
 * Duration system: all note lengths are measured in ticks.
 * One whole note = 48 ticks. Common derived values:
 *   quarter = 12, eighth = 6, sixteenth = 3, half = 24, dotted-half = 36
 */
export const TICKS_PER_WHOLE = 48;

// Tempo conversions — single source of truth (Han 2026-06-19). Previously the magic
// `5 / bpm` (and its inverses `bpm / 5`, `5000 / bpm`) were re-derived at ~7 sites; the "5"
// is an UNDOCUMENTED constant that only holds while TICKS_PER_WHOLE === 48. Deriving it here
// keeps every conversion correct if the tick resolution ever changes.
//
// A "beat" is a quarter note = TICKS_PER_WHOLE / 4 ticks (12 at 48/whole). One beat lasts
// 60 / bpm seconds, so one tick lasts (60 / bpm) / (TICKS_PER_WHOLE / 4) seconds.
export const TICKS_PER_BEAT = TICKS_PER_WHOLE / 4; // quarter note = one beat

// Seconds per tick. Equals 5 / bpm when TICKS_PER_WHOLE === 48.
export const secondsPerTick = (bpm) => (240 / TICKS_PER_WHOLE) / bpm;

// Ticks per second — inverse of secondsPerTick. Equals bpm / 5 at 48 ticks/whole.
export const ticksPerSecond = (bpm) => bpm / (240 / TICKS_PER_WHOLE);

// Seconds per beat (quarter note). Equals 60 / bpm.
export const secondsPerBeat = (bpm) => 60 / bpm;
