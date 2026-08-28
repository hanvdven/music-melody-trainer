import { useCallback, useMemo, useRef } from 'react';
import { evaluateAdaptiveBpm, commitIndexFor } from '../levels/adaptiveTempo';

// #1102 (split from #1087, Han 2026-08-23 interview, resumed + widened to all three content
// architectures 2026-08-28). The live half of adaptive mode (level-variant letter 'i'): decide, schedule,
// and apply mid-level tempo changes.
//
// ── Why this exists at all, and why it is NOT a second bpm value ──────────────────────────────────
// `bpmRef` (App.jsx's `useRefState`) stays the SINGLE source of truth for "the tempo in effect right
// now" — exactly the pattern `Sequencer.scheduleBlock` already relies on (it re-reads
// `this.refs.bpmRef.current` at the top of EVERY measure and derives that measure's `secondsPerTick`/
// `measureDuration`/`lookahead` from it, so a bpm change between blocks is already handled, in sync,
// with no extra machinery). This hook adds no parallel "current bpm" of its own; the streams read
// `bpmRef.current` fresh at each chunk, mirroring that per-measure read.
//
// What it DOES add is a one-element SCHEDULE of a change that has been decided but is not due yet.
// That is unavoidable, and it is a property of the level streams, not of this feature: a level's audio
// is generated and scheduled one screenful AHEAD of when it sounds (useLevelBackingStream generates
// chunk k+1 as chunk k begins; useLevelTrebleStream generates a block up to `lookaheadMeasures` early).
// So at the moment a stream builds the chunk that begins at measure M it must ALREADY know the tempo M
// will play at — whereas the app-wide `bpm` (which drives the visual scroll rate in SheetRpgLayer and
// the sprite frame rate) may only change when M actually SOUNDS, or the picture would run ahead of the
// music by a whole chunk. One decision, two moments: the streams read the decided value early; `setBpm`
// fires at the commit chunk's own scheduled start time. `commit` is cleared the instant it lands, after
// which `bpmRef.current` alone answers the question again.
//
// ── Exact cross-stream sync ───────────────────────────────────────────────────────────────────────
// `commitIndexFor` (adaptiveTempo.js) picks a commit measure that is a boundary of EVERY stream feeding
// the level, so both streams have a real chunk boundary exactly there and adopt the new tempo at the
// same measure — Han's locked "force exact sync", not "eventual convergence".
export default function useAdaptiveTempo({ bpmRef, setBpm, context }) {
    // A ref, not state: every consumer is an audio-scheduling callback running outside React's render
    // cycle (JIT stream generation, a setTimeout at an AudioContext time), and a re-render on every
    // tempo decision would tear down the very JIT effects doing the deciding.
    const stateRef = useRef({ baseBpm: null, prevStats: null, commit: null });

    // Called once per level start. `baseBpm` is the level's AUTHORED tempo (`lvl.adaptiveBaseBpm`), which
    // is what Han's clamp `[baseBpm/2, baseBpm]` is expressed against — NOT the ANPM-derived baseline the
    // level actually starts at (that may legitimately sit anywhere inside, or initially above, the clamp).
    const begin = useCallback((baseBpm) => {
        stateRef.current = { baseBpm: baseBpm ?? null, prevStats: null, commit: null };
    }, []);

    // Drops any decided-but-unapplied change. Also implicitly invalidates its pending `setBpm` timer:
    // that callback re-checks that the commit it was created for is still the current one, so a level
    // that closes/replays/restarts can never have a stale tempo change land on the next run.
    const cancel = useCallback(() => { stateRef.current.commit = null; }, []);

    // Called by a stream at the top of generating the chunk/block that BEGINS at content measure
    // `measure` (measures since the level's content start — negative for the lead-in) and is scheduled
    // to sound at `startTime` (AudioContext seconds). Returns the bpm that chunk must be generated and
    // scheduled at. The FIRST stream to reach a due commit also arms the app-wide `setBpm` for the exact
    // moment that chunk sounds; the other stream reaches the same measure index (guaranteed by
    // `commitIndexFor`) and reads the identical value from the still-pending commit.
    const bpmForMeasure = useCallback((measure, startTime) => {
        const s = stateRef.current;
        const c = s.commit;
        if (c && measure >= c.fromMeasure) {
            if (!c.scheduled) {
                c.scheduled = true;
                // Delay in ms from now until this chunk's own scheduled audio start. setTimeout's 10-50ms
                // drift is harmless HERE (unlike the §6 ban on driving `setCurrentMeasureIndex` with it):
                // SheetRpgLayer's scroll position is anchored across a tempo change (see its
                // `tempoScrollMs`), so a slightly late switch changes only the RATE a few ms late — it can
                // never move the picture. At the ±5% step that is well under a millisecond of drift.
                const delayMs = Math.max(0, (startTime - (context?.currentTime ?? 0)) * 1000);
                setTimeout(() => {
                    if (stateRef.current.commit !== c) return;   // superseded, cancelled, or level restarted
                    stateRef.current.commit = null;
                    setBpm(c.bpm);
                }, delayMs);
            }
            return c.bpm;
        }
        return bpmRef.current;
    }, [bpmRef, setBpm, context]);

    // Called by the DECIDER after a graded stretch of content finished: the treble JIT stream at each of
    // its block boundaries for a JIT level, or App.jsx's wave effect for a classic per-wave level. There
    // is exactly ONE decider per level so a single boundary can never be double-adjusted.
    //   stats       — the level's CUMULATIVE `stats` snapshot right now (useLevel.js's `statsRef.current`).
    //   fromMeasure — the earliest content measure the change may take effect at.
    //   units       — every stream cadence that must agree on the commit measure (see commitIndexFor).
    const evaluate = useCallback(({ stats, fromMeasure, units }) => {
        const s = stateRef.current;
        const prev = s.prevStats;
        s.prevStats = stats;
        // The first boundary has nothing to compare against (no prior snapshot), so the baseline simply
        // holds through it — the "block 0 is a no-op" case flagged in the plan.
        if (prev == null || s.baseBpm == null) return;
        // A change is already decided and waiting to land: hold. Deciding again would either supersede an
        // armed `setBpm` (leaving the streams generating at a tempo the app never adopts) or stack two
        // changes onto one commit index. One change in flight at a time.
        if (s.commit) return;
        const next = evaluateAdaptiveBpm({
            prevStats: prev, currStats: stats, currentBpm: bpmRef.current, baseBpm: s.baseBpm,
        });
        if (next === bpmRef.current) return;   // deadband hold, or already pinned at a clamp bound
        s.commit = { bpm: next, fromMeasure: commitIndexFor(fromMeasure, units), scheduled: false };
    }, [bpmRef]);

    return useMemo(() => ({ begin, cancel, bpmForMeasure, evaluate }), [begin, cancel, bpmForMeasure, evaluate]);
}
