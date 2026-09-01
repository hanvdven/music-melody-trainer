import { computeAccuracyPercent, computeTotalNotes } from '../components/levels/LevelStatsCharts';
import { GLOBAL_RESOLUTION } from '../constants/generatorDefaults';
import {
    ADAPTIVE_STEP, SPEED_UP_ACCURACY, SLOW_DOWN_ACCURACY, diffStats,
} from './adaptiveTempo';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// adaptiveLadder — THE adaptive difficulty POLICY, as ONE monotone ladder (#1121, Han 2026-09-01).
//
// Han collapsed #1121 (the bpm CEILING) and #1120 (the bpm FLOOR) into a single ordered scale:
// "density UP → tempo UP → ceiling ; density DOWN → tempo DOWN → floor → gated". So there is not a
// tempo controller with a density feature bolted on; there is ONE ladder whose rungs happen to be
// expressed through two different knobs.
//
//   state = { bpm, densityStep, pacing }
//     densityStep : SIGNED integer. 0 = the level exactly as AUTHORED. Positive = denser than
//                   authored (harder). Negative = thinner, down to a skeleton line (easier).
//     bpm         : the existing continuous value, clamped to [baseBpm/2, baseBpm] as before.
//     pacing      : 'timed' | 'gated'. #1120 owns this rung; #1121 leaves it always 'timed'.
//
//   EASIEST ─────────────────────────────────────────────────────────────────────► HARDEST
//   gated @ skeleton @ floor → floor bpm, density climbing back to authored (negative steps)
//     → authored density, bpm climbing floor→ceiling (the existing ±5%) → ceiling bpm, density
//     climbing above authored (positive steps)
//
// WHY A SIGNED INTEGER rather than three booleans/flags: it makes the ladder a TOTALLY ORDERED,
// FINITE scale, so "the back-off unwinds in exactly the reverse order it was added" is a property
// of the data type, not of the code remembering to be careful. It is also what makes termination
// provable (the drives in adaptiveLadder.test.js assert both directly).
//
// ── ORDERING: tempo first, density AT the ceiling ─────────────────────────────────────────
// The design's one resolved ambiguity. Han's literal #1121 answer is "when the adaptive bpm has
// reached the level's full authored bpm AND the player is still at/above threshold, tempo holds and
// difficulty growth instead raises effective ANPM by adding note density", and his #1120 answer is
// its exact mirror ("the ladder continues past the bpm floor"). So: tempo in the middle of the
// scale, content at both ENDS of it.
//
// ── MODULE BOUNDARY (§6d / §7) ────────────────────────────────────────────────────────────
// PURE: no React, no audio, no `this`. `useAdaptiveDifficulty.js` is the only thing that owns state
// and side effects; this file only ever maps (previous state, what just happened) → (next state).
// IMPORT DIRECTION IS ONE-WAY: adaptiveLadder → adaptiveTempo. `adaptiveTempo.js` imports
// `levels.js`, which imports `adaptiveTempo.js` back, so an edge from adaptiveTempo to this file
// would close that cycle. `eslint-plugin-import`'s no-cycle rule is not configured in this project,
// so the rule is asserted by a test instead (adaptiveLadder.test.js, "acyclic import direction").
//
// See docs/architecture.md §361.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// ── The ladder's bounds (Han's q2 answer, [DESIGN DEFAULT] 2026-09-01) ─────────────────────
// One notch = +1 note per measure. The bounds are what make this a FINITE ordered scale.
/** Thinnest rung: 2 notches BELOW the authored density. The projection never goes below 1 note/measure. */
export const MIN_DENSITY_STEP = -2;
/**
 * The last rung that thickens the TREBLE — the line the player actually plays. +3 because Level 4
 * authors 3 notes/measure, so +3 doubles the played note count, already a large jump in effective
 * ANPM; unbounded, the grid would fill to sixteenths, unreadable at a ceiling tempo.
 */
export const MAX_TREBLE_DENSITY_STEP = 3;
/**
 * The top of the whole ladder: 3 treble rungs, then 2 BASS rungs. Han's q3 answer is explicit that
 * the bass rung is "a later step on the SAME ladder via the SAME settings (busier line)" — the
 * player is NEVER handed a second staff, so `lvl.twoHanded` is never flipped here. Honest
 * consequence: a busier cello adds audible difficulty but not PLAYED notes, so only the treble
 * rungs move measured ANPM.
 */
export const MAX_DENSITY_STEP = 5;

/**
 * How many notes of resolution `denom` fit in one measure of `timeSignature`. Derived from the
 * meter, never a table (§6c) — correct for 5/4, 7/8, 6/8 and 11/8 alike, because a measure is
 * `ts[0]/ts[1]` whole notes and one slot is `1/denom` of a whole note.
 */
export const slotsPerMeasure = (timeSignature, denom) => (
    ((timeSignature?.[0] ?? 4) * denom) / (timeSignature?.[1] ?? 4)
);

/**
 * ONE track's density projection — called for treble and for bass with different arguments, never
 * branched on which track it is (§6b forbids per-instrument branching in a shared pipeline).
 *
 * POSITIVE steps add one note per measure per notch. When the measure's current grid is full the
 * grid is refined instead (denom 1→2→4→8→16) and counting continues from the new cap. At
 * GLOBAL_RESOLUTION the ladder can go no finer, so a further notch is a SILENT NO-OP — the same
 * convention the bpm clamp already uses at its bounds.
 *
 * NEGATIVE steps only thin: one note per measure per notch, with a hard floor of 1 note/measure (a
 * skeleton line). The grid is deliberately NOT coarsened on the way down — coarsening would move
 * existing notes onto different beats, whereas removing notes leaves the surviving ones where the
 * player already learned them.
 *
 * Returns `null` when the projection is the identity, so rung 0 is provably byte-identical to the
 * level exactly as authored.
 */
const projectDensity = (authored, steps, timeSignature) => {
    // Both fields are always present on a real `InstrumentSettings` (see its constructor) — the
    // fallbacks only keep the arithmetic well-defined for a partial settings object in a test.
    const authoredNpm = authored?.notesPerMeasure ?? 1;
    const authoredDenom = authored?.smallestNoteDenom ?? 8;
    let npm = authoredNpm;
    let denom = authoredDenom;
    for (let s = 0; s < steps; s++) {
        if (npm + 1 > slotsPerMeasure(timeSignature, denom)) {
            // The grid is full at this resolution — refine it before adding another note. Bounded by
            // the shared GLOBAL_RESOLUTION (generatorDefaults.js), never a re-typed 16 (§6c).
            if (denom * 2 > GLOBAL_RESOLUTION) break;
            denom *= 2;
        }
        npm += 1;
    }
    for (let s = 0; s < -steps; s++) npm = Math.max(1, npm - 1);
    if (npm === authoredNpm && denom === authoredDenom) return null;
    return { notesPerMeasure: npm, smallestNoteDenom: denom };
};

/**
 * The density rung → SETTINGS patch projection. Density is expressed ONLY through settings the
 * shared generation pipeline already consumes (`notesPerMeasure` / `smallestNoteDenom`) — there is
 * no new generation stage and no ornament-insertion pass (Han's locked q1 answer).
 *
 * RUNG SPLIT: treble first (up to MAX_TREBLE_DENSITY_STEP), then bass. Negative rungs never touch
 * bass — thinning is about the line the player PLAYS, and the level cello is already one whole note
 * per measure (`LEVEL_BASS_SIMPLE`) with nothing left to give.
 *
 * Returns `{ treble, bass }`, each a patch object or `null`.
 */
export const densityOverrideFor = (densityStep, { trebleAuthored, bassAuthored, timeSignature }) => {
    const step = densityStep || 0;
    const trebleSteps = Math.max(MIN_DENSITY_STEP, Math.min(MAX_TREBLE_DENSITY_STEP, step));
    const bassSteps = Math.max(0, Math.min(MAX_DENSITY_STEP, step) - MAX_TREBLE_DENSITY_STEP);
    return {
        treble: projectDensity(trebleAuthored, trebleSteps, timeSignature),
        bass: bassSteps > 0 ? projectDensity(bassAuthored, bassSteps, timeSignature) : null,
    };
};

/**
 * THE single decider, called once per block boundary by `useAdaptiveDifficulty.evaluate`.
 *
 *   { prevStats, currStats } — the level's CUMULATIVE stats snapshots at the START and END of the
 *                              block just graded. Diffed exactly ONCE, with the SAME `diffStats`
 *                              the rest of the subsystem uses, and scored with the SAME
 *                              `computeAccuracyPercent` the Stats tab and #1099's ANPM use. There
 *                              is no second scoring formula anywhere (§6c).
 *   state                    — { bpm, densityStep, pacing }
 *   baseBpm                  — the level's AUTHORED tempo; the clamp is [baseBpm/2, baseBpm].
 *   lvl                      — only for the scope guard (see `densityAllowed`).
 *
 * STRICT PRECEDENCE: the rules below are evaluated in order and the FIRST match returns
 * immediately, so EXACTLY ONE of {bpm, densityStep, pacing} can differ from the input state on any
 * one call. "One decider, one boundary, one change in flight" (§354) is therefore a property of the
 * control flow rather than a convention.
 */
export const evaluateLadder = ({ prevStats, currStats, state, baseBpm, lvl }) => {
    const delta = diffStats(prevStats, currStats);
    // Nothing was graded in this stretch (e.g. the very first block, before any note was hit or
    // missed) — hold. Deciding off an empty delta would read as a 100% "clean" block.
    if (computeTotalNotes(delta) <= 0) return state;
    const accuracy = computeAccuracyPercent(delta);
    const { bpm, densityStep, pacing } = state;
    // Density is scoped exactly like the ×3 adaptive repeat: PROCEDURAL levels only. A song-backed
    // level's treble is sliced from the song with `randomizationRule: 'fixed'`, so there is nothing
    // for a `notesPerMeasure` override to act on.
    const densityAllowed = !lvl?.songId;
    const ceiling = baseBpm;
    const floor = baseBpm / 2;
    // The EXACT clamp expression lifted from the retired `evaluateAdaptiveBpm`, not re-derived.
    const clamp = (next) => Math.min(baseBpm, Math.max(baseBpm / 2, next));

    if (accuracy >= SPEED_UP_ACCURACY) {
        // 1. Gated is #1120's rung; its own exit rule owns the way out. Unreachable in #1121, where
        //    `pacing` never leaves 'timed'.
        if (pacing === 'gated') return state;
        // 2. Restore CONTENT before speeding up — Han's symmetric back-off, read forwards.
        if (densityAllowed && densityStep < 0) return { ...state, densityStep: densityStep + 1 };
        // 3. The existing ±5% tempo rung, byte-identical to what #1102 shipped.
        if (bpm < ceiling) return { ...state, bpm: clamp(bpm * (1 + ADAPTIVE_STEP)) };
        // 4. At the ceiling: grow difficulty by DENSITY at the same tempo (this ticket's headline).
        if (densityAllowed && densityStep < MAX_DENSITY_STEP) {
            return { ...state, densityStep: densityStep + 1 };
        }
        // 5. Top of the ladder — a silent no-op, the same convention as the bpm clamp.
        return state;
    }
    if (accuracy < SLOW_DOWN_ACCURACY) {
        // 1. Remove the ADDED density before touching the tempo (the exact reverse of rule 4 above).
        if (densityAllowed && densityStep > 0) return { ...state, densityStep: densityStep - 1 };
        // 2. The existing ±5% tempo rung.
        if (bpm > floor) return { ...state, bpm: clamp(bpm * (1 - ADAPTIVE_STEP)) };
        // 3. Below the floor the ladder continues into the CONTENT again, thinning toward a skeleton.
        if (densityAllowed && densityStep > MIN_DENSITY_STEP) {
            return { ...state, densityStep: densityStep - 1 };
        }
        // 4. Bottom of the ladder. #1120 turns this into `pacing: 'gated'`; until then the level
        //    simply parks at (floor, skeleton), which is a correct and shippable end state.
        return state;
    }
    // The 70–90% deadband: nothing moves. Untouched from #1102 — the ladder does not chase noise.
    return state;
};
