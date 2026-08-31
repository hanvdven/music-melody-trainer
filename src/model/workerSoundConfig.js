// #1096 (Han 2026-08-20, "ik wil in de bestiary ook de animatie-audio horen"): the single source of truth
// for which worker creatures have a bell/hammer sound, and exactly where in their work animation it fires
// — read by 3 independent consumers that would otherwise each duplicate these note/frame numbers:
//   - `scripts/generate-bestiary-manifest.mjs` (derives the 'audio' filter tag, CLAUDE.md §6c: don't
//     hand-roll a second roster of "which creatures have sound" next to this one)
//   - `RpgLevelPanel.jsx`'s open-world worker-NPC roster (the real beat-synced level playback,
//     `useWorkerHitState.js`)
//   - the bestiary preview's own animation-audio hook (`useBestiaryAnimationAudio.js`, §1096)
// Plain data, no Vite-specific imports (import.meta.glob etc.) — the generator script runs under plain
// Node, outside Vite, same boundary every other cross-script constant in that file already respects.
// Keyed by bestiary BASE name (creature identity — `findCreatureByName`'s first argument), not by any
// level-specific label.
//
// Shape mirrors `hitConfig` in `useWorkerHitState.js`: `workAnimKey` is the bestiary animation to switch
// to; `hitFrameIndices` are 0-based indices WITHIN that animation's own cell list (fires every loop
// repetition); `chance`/`measures` are the "roll every N measures, loop for N measures" parameters (§1095).
export const WORKER_SOUND_CONFIG = {
    // SSW's "Blacksmith" (renamed from "Blacksmith Slow", #1096) — new Idle(5)/Work(10) sheet. Han: "hit
    // op frame 11" read as the sheet's own GLOBAL 1-based aseprite frame number (same convention as
    // blacksmith_f's "frame 4 van de Work animatie (frame 9)" below) -> global 0-based index 10 -> Work
    // starts at global index 5, so Work-local 0-based index 10-5 = 5.
    Blacksmith: { workAnimKey: 'work', hitFrameIndices: [5], chance: 0.5, measures: 2, note: 'C6' },
    // Town crier's Ring animation — Han: "frame 1 en 6 van de RING animatie" (1-based, local to Ring) ->
    // 0-based indices 0 and 5.
    'Town crier': { workAnimKey: 'ring', hitFrameIndices: [0, 5], chance: 0.5, measures: 2, note: 'G6' },
    // "Blacksmith Woman" (blacksmith_f.png, standalone creature, #1096 — not a variant of "Blacksmith
    // Man") — Han: "frame 4 van de Work animatie (frame 9)" (1-based, local to Work) -> 0-based index 3.
    'Blacksmith Woman': { workAnimKey: 'work', hitFrameIndices: [3], chance: 0.5, measures: 2, note: 'G5' },
};
