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
//   state = { bpm, densityStep, pacing, blocksSinceGatedExit }
//     densityStep : SIGNED integer. 0 = the level exactly as AUTHORED. Positive = denser than
//                   authored (harder). Negative = thinner, down to a skeleton line (easier).
//     bpm         : the existing continuous value, clamped to [baseBpm/2, baseBpm] as before.
//     pacing      : 'timed' | 'gated'. #1120's rung, at the very bottom of the ladder.
//     blocksSinceGatedExit : anti-flap counter, COUNTED BY THE HOOK (this module only reads it).
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
// See docs/architecture.md §361 (the ladder) and §367 (#1120's gated pacing rung).
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

// ── #1120: THE GATED PACING RUNG, hung off the very bottom of the same ladder ──────────────
// Reached ONLY after the bpm has walked all the way to the floor (baseBpm/2) AND the content has
// been thinned to the skeleton (MIN_DENSITY_STEP) AND the player is STILL under
// SLOW_DOWN_ACCURACY. It is the last resort, not a mode anyone can stumble into.
//
// THE EXIT SIGNAL, and why it cannot simply be "the block accuracy" (Han's locked q3 answer, with
// the mechanism the plan_review bounce settled): while gated, EVERY correct hit is RECORDED as
// 'perfect' by construction (SheetRpgLayer §1052 — a gated level teaches note recognition, not
// rhythm), so the block accuracy the other rungs decide on is ~100% and carries no information at
// all. The exit therefore reads a SECOND, HIDDEN signal: the true timing grade of each hit, graded
// against the time the gate really spent waiting for it (see `hiddenTimingGrade` in gradeHit.js —
// the gate FREEZES the shared clock, so `target.delta` alone is ~0 for every gated hit no matter
// how long the player sat there). SheetRpgLayer pushes those hidden grades into an App-owned ring
// buffer; this module only ever READS it.
/** How many recent hits the exit decision looks at. */
export const GATED_EXIT_WINDOW = 10;
/** How many of those must be truly 'perfect' to hand the level back to timed pacing. */
export const GATED_EXIT_REQUIRED = 8;
/**
 * Anti-flap: how many graded boundaries must pass in TIMED pacing after an exit before the ladder
 * may gate again. Without it one bad block immediately after an exit re-gates instantly and the
 * player watches the pacing model flicker.
 */
export const GATED_REENTRY_COOLDOWN_BLOCKS = 1;

/**
 * ONE predicate for "may this level's ladder ever gate?" — never a special case scattered across
 * the consumers (§6c).
 *
 *  - `adaptive` + `sideScroll` + no `songId`: the same scope as #1102's runway and #1121's density
 *    rungs. A song-backed treble is sliced with `randomizationRule: 'fixed'`, and it is also the
 *    shape whose `loopForever` already makes gating meaningful without the ladder.
 *  - `!gatedScroll`: a level that AUTHORS rubato (levels 1/2, variant 'a') STARTS gated, so this
 *    rung is unreachable for it and its behaviour is byte-identical to before this ticket.
 *  - Wizard / Mixed excluded (Han q6): there is no gate-aware wizard-cast timing — the cast fires
 *    on its own fixed schedule and would sound into a frozen screen, which is exactly why
 *    `availableVariantLetters` already excludes the gated+wizard combination. The graceful
 *    consequence is that an adaptive Wizard/Mixed level simply PARKS at (floor bpm, skeleton) and
 *    never gates. Building gate-aware cast timing is its own ticket.
 */
export const gatingAllowed = (lvl) => (
    !!lvl?.adaptive && !!lvl?.sideScroll && !lvl?.songId && !lvl?.gatedScroll
    && lvl?.enemyType !== 'Wizard' && lvl?.enemyType !== 'Mixed'
);

/**
 * The gated → timed exit rule: the hidden true grade was 'perfect' on at least
 * GATED_EXIT_REQUIRED of the last GATED_EXIT_WINDOW hits.
 *
 * A PARTIALLY FILLED window can never exit (design edge case c): right after gating there are not
 * yet 10 hidden grades, and "3 of the 3 notes so far were perfect" is not evidence the player has
 * recovered — it is evidence they have barely started.
 */
export const shouldExitGated = (hiddenGrades) => {
    const buf = hiddenGrades || [];
    if (buf.length < GATED_EXIT_WINDOW) return false;
    const recent = buf.slice(-GATED_EXIT_WINDOW);
    return recent.filter((g) => g === 'perfect').length >= GATED_EXIT_REQUIRED;
};

/**
 * Append one hidden grade to the ring buffer, keeping it at most GATED_EXIT_WINDOW long. MUTATES
 * (the buffer is an App-owned ref written imperatively per hit, never React state — the same
 * convention as `gatedElapsedMsRef`, and a re-render per keypress would tear down the RPG layer).
 * Lives HERE, next to the rule that reads it, so the buffer's capacity has exactly one definition.
 */
export const pushHiddenGrade = (buffer, grade) => {
    buffer.push(grade);
    while (buffer.length > GATED_EXIT_WINDOW) buffer.shift();
    return buffer;
};

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
 *   state                    — { bpm, densityStep, pacing, blocksSinceGatedExit }
 *   baseBpm                  — the level's AUTHORED tempo; the clamp is [baseBpm/2, baseBpm].
 *   lvl                      — only for the scope guards (`densityAllowed` / `gatingAllowed`).
 *   hiddenGrades             — #1120's ring buffer of TRUE timing grades (see its constants above).
 *                              Only ever read while `state.pacing === 'gated'`.
 *
 * STRICT PRECEDENCE: the rules below are evaluated in order and the FIRST match returns
 * immediately, so EXACTLY ONE of {bpm, densityStep, pacing} can differ from the input state on any
 * one call. "One decider, one boundary, one change in flight" (§354) is therefore a property of the
 * control flow rather than a convention.
 */
export const evaluateLadder = ({ prevStats, currStats, state, baseBpm, lvl, hiddenGrades = null }) => {
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

    // ── #1120: THE GATED RUNG, decided BEFORE either accuracy branch ───────────────────────
    // While gated, `accuracy` is ~100% by construction (every hit is RECORDED 'perfect', §1052) and
    // therefore carries no information whatsoever — so it must never be allowed to reach the
    // ordinary rules below, in EITHER direction. The only question at a gated boundary is the exit,
    // and it is answered off the HIDDEN true-timing buffer instead.
    // GATED IS NOT TERMINAL (Han q2): on exit the ladder resumes at (floor, skeleton, timed) and
    // climbs again through the ordinary HARDER rules — content back first, then tempo.
    if (pacing === 'gated') {
        if (!shouldExitGated(hiddenGrades)) return state;
        return {
            ...state, bpm: floor, densityStep: MIN_DENSITY_STEP, pacing: 'timed', blocksSinceGatedExit: 0,
        };
    }

    if (accuracy >= SPEED_UP_ACCURACY) {
        // 1. (Gated pacing is handled ABOVE, before either accuracy branch — #1120. It used to be
        //    guarded here; it cannot reach this point any more, and must not, for the reason given
        //    at that branch.)
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
        // 4. Bottom of the ladder — #1120's GATED PACING rung. The tempo is at the floor, the
        //    content is a skeleton, and the player is STILL struggling: stop asking them to keep up
        //    at all and let the level WAIT for them (rubato/input-paced scrolling, exactly the
        //    shipped `gatedScroll` model levels 1/2 author).
        //    `gatingAllowed` keeps this to procedural non-Wizard side-scroll levels; everything else
        //    simply parks at (floor, skeleton), which is a correct and shippable end state.
        //    The cooldown is the anti-flap guard; `?? Infinity` so a state that predates the counter
        //    (or a fresh `begin()`) is never blocked from its FIRST gating.
        if (gatingAllowed(lvl)
            && (state.blocksSinceGatedExit ?? Infinity) >= GATED_REENTRY_COOLDOWN_BLOCKS) {
            return { ...state, pacing: 'gated' };
        }
        return state;
    }
    // The 70–90% deadband: nothing moves. Untouched from #1102 — the ladder does not chase noise.
    return state;
};
