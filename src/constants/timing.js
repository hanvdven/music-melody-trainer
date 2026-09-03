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

// How far ahead of `context.currentTime` a requested audio start must still be for `playMelodies`
// to honour it. Anything closer — or already past — is PULLED FORWARD to `now + this` by that
// function's own `adjustedStart` clamp, which exists so the Sequencer's short-horizon per-measure
// scheduling can never hand smplr a start time the audio thread has already gone past.
//
// It lives HERE, not inside playMelodies (#1168 UAT round 2, Han 2026-09-03), because a SECOND
// caller now needs the clamp's exact threshold: `useLevelContentStream` schedules whole blocks many
// bars ahead, and for it "this moment has passed" must mean DROP, not "replay it at now" — see
// docs/architecture.md §369. Re-typing 0.05 at that call site would be exactly the magic number
// CLAUDE.md §6c forbids, and this module already owns the app's timing constants (§8).
export const SCHEDULE_SAFETY_BUFFER_SECONDS = 0.05;

// #994 (Han 2026-08-17): `LEVEL_LEAD_IN_BARS = 2` used to live here. It could not survive becoming
// per-level, because a single global constant was doing THREE unrelated jobs at once — the audible
// count-in length, the JIT backing-generation chunk size, and the visual/notation lead-in span — and
// #994 makes the span depend on each level's own tempo and meter. It is replaced by
// `deriveLevelSpan()` in src/levels/levels.js, which returns all three as separate per-level values
// (leadInBars / metronomeBars / visibleMeasures / beatsOnScreen) threaded to consumers
// from the normalized level object. See §248 in docs/architecture.md.
