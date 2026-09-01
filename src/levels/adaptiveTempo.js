import { computeAccuracyPercent, computeTotalNotes } from '../components/levels/LevelStatsCharts';
import { totalNotesForLevel } from './levels';

// #1102 (split from #1087, Han 2026-08-23 chat interview): adaptive-mode (level-variant letter 'i')
// tempo. Pure, testable pieces — the ONE-TIME baseline computed when a level starts, the per-block live
// adjustment, the exact-cross-stream commit index, and the adaptive level's repeat count.
//
// WHO CALLS `evaluateAdaptiveBpm` (corrected 2026-08-29): `useLevelContentStream.js`, via
// `useAdaptiveTempo.js`. An earlier version of this comment named `useLevelTrebleStream.js` and warned
// that only ONE of the two streaming hooks may write the shared value — both of those hooks were DELETED
// by #1165, which merged every level's content onto ONE per-block stream. That stream is now the sole
// decider for every level, so "only one writer" is structural rather than a convention to uphold, and
// `commitIndexFor` is always called with a single unit `[B]`.

// Baseline bpm — the algebraic INVERSE of #1099's own ANPM formula (notesPerMinute = totalNotes /
// elapsedMinutes), applied to THIS level's own beat/note structure instead of whichever level ANPM was
// last measured on. Han: "ANPM is een skill, en overstijgt levels" (a profile-level skill number, not
// tied to any one level) — "BPM = ANPM * (lengte van level in beats) / (totaal aantal noten in level)".
// NO-ANPM FALLBACK = 0.7 x the authored bpm (Han 2026-08-28, from the #1102 UAT bounce). It used to be
// the authored bpm itself, which is ALSO the clamp CEILING (`[authoredBpm/2, authoredBpm]`) — so a player
// with no ANPM yet started pinned at the top of the range and adaptive mode could only ever slow DOWN,
// never demonstrate the acceleration that is its whole point. Starting a bit below the authored tempo
// leaves headroom in both directions. Still falls back to the authored bpm outright when the level has no
// notes to divide by (defensive; every real level has some).
export const NO_ANPM_BASELINE_FACTOR = 0.7;

export const baselineAdaptiveBpm = (lvl, anpm) => {
    if (anpm == null) return Math.round(lvl.bpm * NO_ANPM_BASELINE_FACTOR);
    const quarterNotesPerMeasure = 4 * ((lvl.timeSignature?.[0] ?? 4) / (lvl.timeSignature?.[1] ?? 4));
    const beatsInLevel = quarterNotesPerMeasure * (lvl.totalMeasures || 0);
    const totalNotes = totalNotesForLevel(lvl);
    if (!totalNotes || !beatsInLevel) return lvl.bpm;
    return Math.round(anpm * beatsInLevel / totalNotes);
};

// Live per-block adjustment step (Han, chat interview: "+-5%"). A first-pass tunable, not independently
// re-derived elsewhere — flagged in docs/architecture.md as open to UAT feedback on feel.
export const ADAPTIVE_STEP = 0.05;
// Accuracy thresholds deciding a block's direction — NOT explicitly specified by Han in the interview
// (only the +-5% step and the [lvl.bpm/2, lvl.bpm] clamp were), picked as a reasonable first pass: a
// clean block (>=90%, matching ANPM's own #1099 qualifying threshold) speeds up, a rough block (<70%)
// slows down, anything in between holds steady rather than chasing noise every single block.
// Also the single source of truth for #1122's ANPM up/down gates — imported by gamification.js
// nextAnpm() so "the player was genuinely struggling" has ONE definition across both subsystems.
export const SPEED_UP_ACCURACY = 90;
export const SLOW_DOWN_ACCURACY = 70;

// How many times an adaptive level plays through its own content (Han 2026-08-28: "niet oninteressant om
// het level te blijven herhalen. Bijvoorbeeld 3x"). WHY it is needed: the tempo only moves ±5% per block
// boundary, and the FIRST boundary is always a no-op (no prior snapshot to diff against), so an 8-measure
// level generated in 2-measure blocks offers just three real adjustments — not enough for the tempo to
// visibly converge on the player's actual ability (the UAT complaint that parked this ticket). Tripling
// the level's own length triples the number of evaluation points.
//
// A FIRST-PASS TUNABLE like ADAPTIVE_STEP and the two thresholds above: one constant, open to Han's UAT
// feel. Applied in `applyLevelVariant` (levels.js) by multiplying the level's own `totalMeasures` — the
// single field every length consumer already reads — never by a second, parallel length mechanism (§6c).
export const ADAPTIVE_LEVEL_REPEATS = 3;

// Diffs two CUMULATIVE stats snapshots (useLevel.js's `stats` shape — every field is an additive
// counter) into a delta object shaped identically, so `computeAccuracyPercent`/`computeTotalNotes`
// (LevelStatsCharts.jsx, §6c — the SAME formula the Stats tab and #1099's ANPM already use, not a third
// independent scoring formula) can be reused unmodified against "just this block" instead of the whole
// level's running total.
const diffStats = (before, after) => {
    const delta = {};
    Object.keys(after).forEach((k) => {
        if (typeof after[k] === 'number') delta[k] = (after[k] || 0) - (before?.[k] || 0);
    });
    return delta;
};

// Called once per JIT block boundary (useLevelTrebleStream.js only — see its own comment on why bass/
// metronome only READ the result, never call this themselves, to avoid double-adjusting one boundary).
// `prevStats`/`currStats` are `level.stats` snapshots taken at the START and END of the block just
// finished. Returns the NEW clamped bpm; a no-op (returns `currentBpm` unchanged) when nothing was graded
// yet this block (e.g. the very first block, before any note has been hit/missed).
export const evaluateAdaptiveBpm = ({ prevStats, currStats, currentBpm, baseBpm }) => {
    const delta = diffStats(prevStats, currStats);
    if (computeTotalNotes(delta) <= 0) return currentBpm;
    const accuracy = computeAccuracyPercent(delta);
    const direction = accuracy >= SPEED_UP_ACCURACY ? 1 : accuracy < SLOW_DOWN_ACCURACY ? -1 : 0;
    const next = currentBpm * (1 + direction * ADAPTIVE_STEP);
    return Math.min(baseBpm, Math.max(baseBpm / 2, next));
};

// ── EXACT cross-stream sync: the commit-index primitive ───────────────────────────────────────────
// Han's locked requirement (2026-08-28) is that treble and bass/metronome adopt a new tempo at the
// SAME measure — not "eventually converge". The obstacle is that a level's two content streams
// generate on DIFFERENT cadences: `useLevelTrebleStream` in `blockMeasures`-sized blocks, and
// `useLevelBackingStream` in `chunkMeasures` (= `lvl.leadInBars`) sized chunks. Each stream can only
// change tempo at one of ITS OWN boundaries (a chunk's notes are generated and audio-scheduled as one
// unit, at one bpm), so the only measure indices at which BOTH can switch together are the common
// multiples of their two cadences — i.e. the multiples of their least common multiple.
//
// `commitIndexFor(fromIndex, units)` therefore answers: "starting from `fromIndex`, what is the first
// measure index that is simultaneously a boundary of every stream feeding this level?" Both streams
// then adopt the pending tempo at exactly that index, with no lag between them.
//
// Measure counts are integers for every meter (including odd numerators like 5/4 and 7/8 — the odd
// NUMERATOR changes a bar's DURATION, never how many bars a block spans), so this is plain integer
// arithmetic; a non-positive-integer unit is ignored rather than poisoning the lcm.
const gcd2 = (a, b) => (b === 0 ? a : gcd2(b, a % b));
export const lcmOf = (units) => (units || [])
    .map((u) => Math.round(u))
    .filter((u) => Number.isFinite(u) && u > 0)
    .reduce((acc, u) => (acc * u) / gcd2(acc, u), 1);

export const commitIndexFor = (fromIndex, units) => {
    const step = lcmOf(units);
    if (!(step > 0)) return fromIndex;
    return Math.ceil(fromIndex / step) * step;
};
