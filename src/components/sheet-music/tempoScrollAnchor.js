// #1102 (adaptive tempo, Han 2026-08-28) — the scroll clock's tempo anchor.
//
// WHY THIS EXISTS. Every timing formula in SheetRpgLayer.jsx converts elapsed real milliseconds into
// musical beats by dividing by `beatMs` (= 60000/bpm): the scroll position
// `(elapsed / (beatsOnScreen·beatMs))·dist`, a slime's `msSinceSpawn = elapsed − beat·beatMs`, the
// hit/expiry windows, the gated-freeze arrival test. Until adaptive mode, `beatMs` was FIXED for a whole
// level, so that was safe. Once the tempo can change mid-level, a new `beatMs` re-rates the ENTIRE
// elapsed duration RETROACTIVELY — the notes, every slime, and the freeze point would all jump to a
// different position in the same frame (the E027-class "catch up" snap).
//
// THE FIX. Keep an anchor `{ beats, rawMs, beatMs }` and re-ANCHOR (never reset) on each tempo change:
// the beats accrued so far are frozen at the OLD rate, and only the forward rate changes. The returned
// value is a TEMPO-NORMALIZED elapsed: the number that, divided by the CURRENT `beatMs`, yields the true
// beats elapsed since the level started, across every tempo change so far. Position is therefore
// continuous by construction — a tempo change can only alter the RATE, never the current position.
//
// Spatial layout (`beatsOnScreen`, `dist`, `scrollPPT`, `noteWidth`, and every already-rendered note's X)
// stays FIXED for the whole level — only the time→position RATE varies. Live note re-flow is explicitly
// out of scope (docs/architecture.md §298).
//
// For a level whose tempo NEVER changes (every level before this feature) `beats` and `rawMs` both stay
// 0, so this returns exactly `rawMs` — byte-identical arithmetic, zero behaviour change.
//
// Lives in its own module (not inline in SheetRpgLayer.jsx) so this one piece of arithmetic has a direct
// unit test without rendering the whole 3000-line RPG layer, mirroring why `blockScaleForCallResponse`
// and `generateLevelBackingChunk` are pulled out of their own hooks for the same reason.

// The anchor's initial (and post-level-restart) state. `beatMs: null` means "not yet anchored" — the
// first read adopts whatever tempo is current without treating it as a change.
export const freshTempoAnchor = () => ({ beats: 0, rawMs: 0, beatMs: null });

// MUTATES `anchor` when the tempo changed (that is the point — the anchor is a running clock, not a
// value object) and returns the tempo-normalized elapsed ms for `rawMs` at `beatMs`.
export const tempoNormalizedMs = (anchor, rawMs, beatMs) => {
    if (!(beatMs > 0)) return rawMs;
    if (anchor.beatMs == null) {
        anchor.beatMs = beatMs;                              // first read — anchor at 0 beats / 0 ms
    } else if (anchor.beatMs !== beatMs) {
        anchor.beats += (rawMs - anchor.rawMs) / anchor.beatMs;   // beats accrued since the last anchor
        anchor.rawMs = rawMs;
        anchor.beatMs = beatMs;
    }
    return anchor.beats * beatMs + (rawMs - anchor.rawMs);
};
