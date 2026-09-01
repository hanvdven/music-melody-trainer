import { updateScaleWithMode } from '../theory/scaleHandler';
import { densityOverrideFor } from './adaptiveLadder';

/**
 * levelBlockPlan — the PURE per-level "what does block k look like?" policy.
 *
 * WHY THIS EXISTS (#1165 / #1163b, Han 2026-08-29): until this ticket, FIVE separate
 * live mechanisms each hard-coded their own answer to the same four questions
 * ("how long is a block?", "what TYPE is it?", "which scale?", "how many blocks?"):
 *
 *   useLevelTrebleStream.js        blockMeasures = needsWizard ? cr*2 : lvl.numMeasures
 *                                  + `blockScaleForCallResponse` (decorativeWizard Major/Minor)
 *   useLevelBackingStream.js       chunkMeasures = lvl.leadInBars
 *   useLevelMixedStream.js         blockMeasures = 2 (hardcoded) + `blockTypeAt`
 *   useLevelKeyModulationStream.js chunkMeasures = 2 (hardcoded) + its own Major/Minor alternation
 *   useLevel.js `regenerate()`     one whole-level melody per wave
 *
 * They are ONE cadence now (`blockMeasuresFor`), ONE type rule (`blockTypeForBlock`),
 * ONE scale rule (`resolveBlockScale`) and ONE length rule (`blockCountFor`), consumed by
 * the single `useLevelContentStream`. Keeping the policy in a PURE module (no React, no
 * audio, no `this`) is what makes every one of those merged rules directly unit-testable —
 * the same reason `blockScaleForCallResponse` and `generateLevelBackingChunk` were pulled
 * out of their hooks before it.
 *
 * ── THE CADENCE, and why it is not literally `lvl.numMeasures` (read this first) ───────
 * `numMeasures` IS the level's generation chunk size (Han's own data model, #1163) — and
 * for every level whose blocks are plain content it is used verbatim below. But three
 * level SHAPES carry their own musically-authored cadence that `numMeasures` does not yet
 * express, and #1165 deliberately changes NO level's content shape (its whole de-risking
 * rationale: "any UAT regression here is provably a MECHANISM bug, not a content change"):
 *
 *   • call-response (`enemyType: 'Wizard'`) — a block is one CALL group plus one RESPONSE
 *     group, i.e. `callResponseMeasures * 2` (#1101). Level 13 authors `numMeasures: 2`
 *     (post-#1163c) but its real block cadence is STILL 2 = `1 * 2` (native levels omit
 *     `callResponseMeasures`, so `callGroupMeasuresFor` → 1).
 *   • Mixed (`enemyType: 'Mixed'`) — Han's literal spec is "stuur 2 maten slimes, dan 2
 *     maten wizard": the alternation PERIOD is 2 measures. `blockTypeAt` (below, and
 *     SheetRpgLayer's 4 call sites) encodes the same 2.
 *   • decorativeWizard — Han's literal spec is "elke 2 maten een spell en wisselt dan van
 *     toonladder": the modulation PERIOD is 2 measures (§994 decision D already separated
 *     this musical period from the JIT lookahead for exactly this reason).
 *
 * ── STATE OF THESE THREE BRANCHES AFTER #1163c (Han 2026-08-29) ────────────────────────
 * #1163c set `numMeasures: 2` on the ramp levels (4/7-15/19). An EARLIER draft of this
 * comment claimed all three branches then "collapse into the `numMeasures` fall-through
 * and can be deleted". That is WRONG for the Wizard branch and a judgement call for the
 * other two:
 *   • Wizard — MUST STAY. `applyLevelVariant`'s call-response variant 'e'
 *     (`callResponseMeasures: 2`) sets BOTH `callResponseMeasures: 2` AND `numMeasures: 2`
 *     (see `callResponseOverrides` in levels.js). The correct cadence for 'e' is
 *     `2 * 2 = 4`; the fall-through (`numMeasures || 2` = 2) would be WRONG. Variant 'd'
 *     (`callResponseMeasures: 1`, `numMeasures: 1`) needs `1 * 2 = 2`, also not the
 *     fall-through's 1. This branch is load-bearing regardless of any JSON edit.
 *   • Mixed / decorativeWizard — for the SHIPPED levels 14/15 (`numMeasures: 2`) the
 *     fall-through now returns the same 2, so these two branches are redundant *for those
 *     levels*. They are KEPT DELIBERATELY: they cost nothing, they state Han's authored
 *     "elke 2 maten" musical period explicitly (rather than as a coincidence of the ramp
 *     `numMeasures` default), and a FUTURE Mixed / decorativeWizard level authored with a
 *     different `numMeasures` would silently lose its alternation/modulation period under
 *     the fall-through. `MIXED_BLOCK_MEASURES` / `blockTypeAt` stay regardless —
 *     SheetRpgLayer imports them.
 *
 * ── A FOURTH SHAPE: SONG-BACKED LEVELS (#1168, Han 2026-09-01) ─────────────────────────
 * A level with a `songId` (ids 1, 2, 200-206) is the one shape where `numMeasures` does NOT
 * mean "chunk size" at all: `songLevelDefaults` (levels.js, §871) back-fills it from the song
 * JSON as the SONG'S LENGTH, because the song is the single source of truth for its own
 * musical metadata. So the fall-through made one block the WHOLE song — `blockCountFor` = 1,
 * and the adaptive decider (one call per block) fired exactly once: a seed, never a decision
 * (§354 limitation 5, the bug #1168 fixes).
 *
 * `numMeasures` cannot simply be re-authored to 2 for those levels — three consumers read it
 * AS the song's length and would break: `normalizeLevel`'s `totalMeasures = ... ?? numMeasures`,
 * `applyLevelVariant`'s `callResponseOverrides` (`totalMeasures: lvl.numMeasures * 2`, the §1155
 * "de akkoorden zijn op" fix) and `useLevel.applyConfig`'s `setNumMeasures`. Duplicating the song
 * length into levels.json to free the field would break §871's SSOT (§6c). So the song's cadence
 * is stated HERE, like the three shapes above: one named constant, one branch, no JSON edit.
 * It is UNCONDITIONAL — every song level generates in 2-measure chunks, adaptive or not (Han
 * Q1, 2026-09-01: "kleine gen-chunk voor ALLE song levels, niet alleen letter i").
 */

// Han's own spec for both 2-measure musical periods (see the cadence note above). Kept as
// two NAMED constants rather than one shared literal because they are two independent
// musical decisions that happen to agree today — collapsing them would hide that.
export const MIXED_BLOCK_MEASURES = 2;
export const KEY_MODULATION_BLOCK_MEASURES = 2;

// #1168: a song-backed level's own generation cadence — see the fourth bullet of the cadence
// note above for why it cannot be `numMeasures` (which, for such a level, IS the song's length).
// Kept as its own named constant rather than reusing MIXED_BLOCK_MEASURES for exactly the reason
// stated just above: they are independent musical decisions that happen to agree at 2 today
// (Han Q3, 2026-09-01: "2 maten flat", not the level's `visibleMeasures`).
export const SONG_BLOCK_MEASURES = 2;

/** The call/response GROUP size (#1101: `d` = 1 measure, `e` = 2; native Wizard levels omit it). */
export const callGroupMeasuresFor = (lvl) => (lvl?.callResponseMeasures ?? 1);

/**
 * A call-response level backed by a FIXED song (#1155): its treble is SLICED from the
 * song's own measures instead of generated. The distinction matters to `trackSpecsForLevel`
 * (which track material exists) — never to the cadence, which is the same either way.
 */
export const usesSongTreble = (lvl) => !!lvl?.songId;

/**
 * THE cadence: how many measures of the level's timeline one generated block covers.
 * Every track of that block — treble, bass, percussion, metronome, chords — is generated
 * for this same span, off one shared rhythm grid. This is the single value that replaced
 * the four different per-mechanism cadences listed at the top of this file.
 */
export const blockMeasuresFor = (lvl) => {
    if (lvl?.enemyType === 'Wizard') return callGroupMeasuresFor(lvl) * 2;
    if (lvl?.enemyType === 'Mixed') return MIXED_BLOCK_MEASURES;
    // A decorativeWizard level that call-response has NOT taken over (its Wizard branch above
    // already carries the alternation) modulates every 2 measures — see the cadence note.
    if (lvl?.decorativeWizard) return KEY_MODULATION_BLOCK_MEASURES;
    // #1168: AFTER the three branches above and BEFORE the fall-through. ORDER IS LOAD-BEARING:
    // a song level with letter d/e must keep the Wizard cadence (`callResponseMeasures * 2`),
    // because `applyLevelVariant` also rewrites its `numMeasures` to the call GROUP size and
    // doubles its `totalMeasures`. Pinned by a branch-order test in levels.test.js.
    if (usesSongTreble(lvl)) return SONG_BLOCK_MEASURES;
    return lvl?.numMeasures || 2;
};

/**
 * Which enemy MECHANIC a given measure of a Mixed level belongs to. Moved here verbatim from
 * `useLevelMixedStream.js` (same signature, same hardcoded 2) so SheetRpgLayer's four call
 * sites only changed their import path — they decide per note/slime which mechanic it
 * belongs to, a per-item question no level-wide `enemyType` can answer.
 */
export const blockTypeAt = (measureIndex) =>
    (Math.floor(Math.max(0, measureIndex) / MIXED_BLOCK_MEASURES) % 2 === 0 ? 'Slime' : 'Wizard');

/**
 * The block's own type. A Wizard level is uniformly Wizard, a Mixed level alternates (via
 * the SAME `blockTypeAt` SheetRpgLayer reads, so content and rendering can never disagree),
 * everything else is a plain Slime block.
 */
export const blockTypeForBlock = (lvl, blockIndex) => {
    if (lvl?.enemyType === 'Mixed') return blockTypeAt(blockIndex * MIXED_BLOCK_MEASURES);
    return lvl?.enemyType === 'Wizard' ? 'Wizard' : 'Slime';
};

/**
 * The scale block k is generated in. Merges `useLevelTrebleStream`'s
 * `blockScaleForCallResponse` and `useLevelKeyModulationStream`'s own alternation — they
 * were literally the same rule applied from two racing streams (§300/§304/§305 merged them
 * once already, for the Wizard half only). Forward-only: already-generated blocks keep the
 * mode they were built with, matching every JIT stream in this codebase. Reuses
 * `updateScaleWithMode` — the SAME function `setSelectedMode` uses (§6c: not a second
 * mode-switch mechanism); the tonic is never touched.
 */
export const resolveBlockScale = (lvl, scale, blockIndex) => (lvl?.decorativeWizard
    ? updateScaleWithMode({
        currentScale: scale, newFamily: 'Diatonic', newMode: blockIndex % 2 === 0 ? 'Major' : 'Minor',
    })
    : scale);

/**
 * How many blocks the level has. `Infinity` for a gated level (§867/§1052 `loopForever`: the
 * player may freeze on any note for an arbitrary real-time duration, so content must never
 * run out).
 *
 * READS `lvl.totalMeasures`, NEVER `lvl.numMeasures` — this is the §299 bug class, fixed
 * here once for every level instead of per stream. `useLevelMixedStream` and
 * `useLevelKeyModulationStream` both read `numMeasures` right up until this ticket; they
 * were only correct because levels 14/15 happen to have `numMeasures === totalMeasures === 8`,
 * and #1166's `numMeasures: 2` edit would silently have truncated both levels to 2 measures.
 *
 * `totalMeasures` is the level's TIMELINE length, and `blockMeasuresFor` is how much timeline
 * one block covers — including a call-response block, whose call+response halves together
 * span `callResponseMeasures * 2` of that timeline (`applyLevelVariant` doubles a song's
 * `totalMeasures` for exactly this reason, §1155 UAT). So one division answers every shape.
 */
export const blockCountFor = (lvl) => {
    // ⚠ HARD INVARIANT (#1120): `Infinity` is bound to the AUTHORED `gatedScroll` FIELD alone. The
    // adaptive difficulty ladder can put a PROCEDURAL level into gated PACING at its bpm floor, and it
    // must never reach this line: a procedural level's `total` grows with the stream, so an infinite
    // block count there means the level can never end (§289). A ladder-gated level keeps the finite
    // count below and simply takes longer in real time. See useLevelContentStream.js's `loopForever`
    // and docs/architecture.md §367.
    if (lvl?.gatedScroll) return Infinity;
    const total = lvl?.totalMeasures ?? lvl?.numMeasures ?? 0;
    return Math.max(1, Math.ceil(total / blockMeasuresFor(lvl)));
};

/**
 * The LEAD-IN block's shape. Deliberately NOT `blockMeasuresFor` — the lead-in is the
 * level's own on-screen span (`leadInBars`, §994) and stays that size whatever the content
 * cadence becomes, so the count-in a player sees and hears is unchanged by #1165/#1166.
 *
 * `metronomeBars` is Han's "alle opmaten cello+timpanen. de tweede helft (round up) +
 * metronoom erbij" (live Kalinka UAT 2026-08-17, §248): cello (and timpani) sound through
 * EVERY lead-in measure; only the metronome is staggered into the second half. See the
 * REJECTED DESIGN note in levels.js — do not reintroduce silent lead-in measures.
 */
export const leadInSpecFor = (lvl) => {
    const leadInBars = lvl?.leadInBars ?? 2;
    return { leadInBars, metronomeBars: lvl?.metronomeBars ?? Math.ceil(leadInBars / 2) };
};

/**
 * The per-track settings bundle one block is generated from, plus the two routing keys
 * `generateBlock` understands.
 *
 * PLAN v2 correction (Han 2026-08-29): routing keys off parameters that ALREADY EXIST —
 * there is no new level field and no parallel `source:` enum here.
 *
 *   • CHORDS — the existing chord-progression strategy key `'song'`
 *     (`progressionDefinitions.js`). A song-backed level's chords FOLLOW the song's own
 *     progression by `(measure mod songLength)`; a procedural level keeps whatever strategy
 *     it already has (`useLevel.applyConfig`'s `'tonic-tonic-tonic'` for most levels, or the
 *     level's own `chords.strategy` override), i.e. its progression is generated ONCE at
 *     level start and each block draws its own window from it — byte-identical to today.
 *
 *   • TREBLE — the existing per-track `InstrumentSettings.randomizationRule === 'fixed'`
 *     ("do not roll fresh notes for this track"). A song-backed level forces it on, and the
 *     stream supplies that block's slice of the song as the fixed material; `generateBlock`
 *     then replays it verbatim (and, for call-response, applies the collapse/shift transform
 *     to it — reproducing the retired `sliceSongCallResponseBlock` exactly). A procedural
 *     level that AUTHORS `randomizationRule: 'fixed'` gets the no-reference behaviour instead:
 *     block 0's chunk repeated every block = an ostinato.
 *
 * Bass/percussion are always generated for a level, song or not: a level's cello is its own
 * generated backing line, never the song's bass (#871 — it plays through the dedicated
 * `celloRef`/`LEVEL_CELLO_SLOT`, so it can never bleed into a song that provides none).
 *
 * ── The optional DENSITY argument (#1121, Han 2026-09-01) ─────────────────────────────
 * `density` is `{ densityStep, timeSignature }` or `null`. A non-zero rung of the adaptive
 * difficulty ladder (adaptiveLadder.js) is projected — by FORMULA, never a table (§6c) — onto
 * the two settings fields the shared generation pipeline already consumes
 * (`notesPerMeasure`/`smallestNoteDenom`) and shallow-merged onto the treble/bass entries. It
 * lands HERE, and nowhere else, so "what settings does a block get" stays ONE function rather
 * than being half-assembled inside the content stream — half-merging in two places is exactly
 * how the two would drift.
 *
 * `densityStep: 0` (and `null`) is provably the IDENTITY: `densityOverrideFor` returns `null`
 * patches, so the returned object is byte-identical to the pre-#1121 one. That is what makes
 * "a level that never leaves the authored density behaves exactly as before" assertable.
 *
 * ORDER: the song-treble `randomizationRule: 'fixed'` forcing stays the OUTERMOST wrapper, so a
 * density patch can never accidentally unset it. (A song level never gets a patch anyway — the
 * ladder scopes density to procedural levels — but the ordering makes that safe by construction.)
 */
export const trackSpecsForLevel = (lvl, settings, density = null) => {
    const songTreble = usesSongTreble(lvl);
    const patches = density?.densityStep
        ? densityOverrideFor(density.densityStep, {
            trebleAuthored: settings.trebleSettings,
            bassAuthored: settings.bassSettings,
            timeSignature: density.timeSignature,
        })
        : null;
    const treble = patches?.treble
        ? { ...settings.trebleSettings, ...patches.treble }
        : settings.trebleSettings;
    const bass = patches?.bass ? { ...settings.bassSettings, ...patches.bass } : settings.bassSettings;
    return {
        instrumentSettings: {
            treble: songTreble ? { ...treble, randomizationRule: 'fixed' } : treble,
            bass,
            percussion: settings.percussionSettings,
            chords: settings.chordSettings,
            metronome: settings.metronomeSettings,
        },
        // `undefined` (not `'song'`) for a procedural level so `generateBlock` takes its
        // ordinary "rhythmize the given progression" path, exactly as the Sequencer does.
        chordStrategy: songTreble ? 'song' : undefined,
        songTreble,
    };
};
