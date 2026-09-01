import { useCallback, useMemo, useRef } from 'react';
import { commitIndexFor } from '../levels/adaptiveTempo';
import { evaluateLadder } from '../levels/adaptiveLadder';

// #1102 (split from #1087, Han 2026-08-23 interview, resumed + widened to all three content
// architectures 2026-08-28), widened again by #1121 (2026-09-01). The live half of adaptive mode
// (level-variant letter 'i'): decide, schedule, and apply mid-level DIFFICULTY changes.
//
// RENAMED from `useAdaptiveTempo` by #1121: it no longer decides only a tempo. It decides one position
// on the shared difficulty LADDER (`src/levels/adaptiveLadder.js`) — `{ bpm, densityStep, pacing }` —
// and the old name would now lie about a third of what it does, which is exactly how the §6d drift
// starts. The POLICY (which knob moves, and in which order) lives in the pure ladder module; this hook
// owns only the state and the side effects.
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
// is generated and scheduled one screenful AHEAD of when it sounds (a block is generated up to
// `lookaheadMeasures` early). So at the moment the stream builds the block that begins at measure M it
// must ALREADY know the tempo M will play at — whereas the app-wide `bpm` (which drives the visual
// scroll rate in SheetRpgLayer and the sprite frame rate) may only change when M actually SOUNDS, or
// the picture would run ahead of the music by a whole block. One decision, two moments: the streams
// read the decided value early; `setBpm` fires at the commit block's own scheduled start time. `commit`
// is cleared the instant it lands, after which `bpmRef.current` alone answers the question again.
//
// ── DENSITY needs no second moment (#1121) ────────────────────────────────────────────────────────
// The bpm is the only knob with a "two moments" problem. A density rung is baked into the block's NOTES
// at generation time, so there is nothing app-wide to switch when that block later sounds — no `setBpm`
// analogue, no second timer. The commit still CARRIES the density (see below) purely so that one
// decision is one atomic ladder position; the armed callback just writes it back into this hook's own
// state so "where the ladder is" and "what the app adopted" can never drift apart.
//
// ── ONE READER, not three (#1121) ─────────────────────────────────────────────────────────────────
// `blockSettingsFor` returns all three ladder values in one call, deliberately replacing what would
// otherwise be `bpmForMeasure` / `densityForMeasure` / `pacingForMeasure`. The armed `setBpm` timeout is
// created as a SIDE EFFECT of reading a due commit; with three readers the arming would become
// order-dependent on whichever the stream happened to call first — the kind of implicit coupling that
// produces a commit which is read but never applied. One reader = one commit read, one arming point,
// which is the ticket's own "one decider, one boundary, one change in flight" expressed on the read side.
//
// ── Exact cross-stream sync ───────────────────────────────────────────────────────────────────────
// `commitIndexFor` (adaptiveTempo.js) picks a commit measure that is a boundary of EVERY stream feeding
// the level, so both streams have a real chunk boundary exactly there and adopt the new position at the
// same measure — Han's locked "force exact sync", not "eventual convergence".
export default function useAdaptiveDifficulty({ bpmRef, setBpm, context }) {
    // A ref, not state: every consumer is an audio-scheduling callback running outside React's render
    // cycle (JIT stream generation, a setTimeout at an AudioContext time), and a re-render on every
    // difficulty decision would tear down the very JIT effects doing the deciding.
    const stateRef = useRef({
        baseBpm: null, lvl: null, densityStep: 0, pacing: 'timed', prevStats: null, commit: null,
    });

    // Called once per level start. `baseBpm` is the level's AUTHORED tempo (`lvl.adaptiveBaseBpm`), which
    // is what Han's clamp `[baseBpm/2, baseBpm]` is expressed against — NOT the ANPM-derived baseline the
    // level actually starts at (that may legitimately sit anywhere inside, or initially above, the clamp).
    // `lvl` is kept because the ladder's density rungs are SCOPED to procedural levels (a song-backed
    // level's treble is sliced with `randomizationRule: 'fixed'` and cannot take a density override).
    // Rung 0 = the level exactly as authored, so a fresh run always starts there.
    const begin = useCallback((baseBpm, lvl = null) => {
        stateRef.current = {
            baseBpm: baseBpm ?? null, lvl, densityStep: 0, pacing: 'timed', prevStats: null, commit: null,
        };
    }, []);

    // Drops any decided-but-unapplied change. Also implicitly invalidates its pending `setBpm` timer:
    // that callback re-checks that the commit it was created for is still the current one, so a level
    // that closes/replays/restarts can never have a stale change land on the next run.
    const cancel = useCallback(() => { stateRef.current.commit = null; }, []);

    // Called by the stream at the top of generating the block that BEGINS at content measure `measure`
    // (measures since the level's content start — negative for the lead-in) and is scheduled to sound at
    // `startTime` (AudioContext seconds). Returns the FULL ladder position that block must be generated
    // and scheduled at. Reaching a due commit also arms the app-wide `setBpm` for the exact moment that
    // block sounds.
    const blockSettingsFor = useCallback((measure, startTime) => {
        const s = stateRef.current;
        const c = s.commit;
        if (c && measure >= c.fromMeasure) {
            if (!c.scheduled) {
                c.scheduled = true;
                // Delay in ms from now until this block's own scheduled audio start. setTimeout's 10-50ms
                // drift is harmless HERE (unlike the §6 ban on driving `setCurrentMeasureIndex` with it):
                // SheetRpgLayer's scroll position is anchored across a tempo change (see its
                // `tempoScrollMs`), so a slightly late switch changes only the RATE a few ms late — it can
                // never move the picture. At the ±5% step that is well under a millisecond of drift.
                const delayMs = Math.max(0, (startTime - (context?.currentTime ?? 0)) * 1000);
                setTimeout(() => {
                    if (stateRef.current.commit !== c) return;   // superseded, cancelled, or level restarted
                    stateRef.current.commit = null;
                    // The landed rung becomes this hook's own idea of "where the ladder is", so the
                    // controller state and what the app adopted can never disagree.
                    stateRef.current.densityStep = c.densityStep;
                    stateRef.current.pacing = c.pacing;
                    // Only the TEMPO rung has an app-wide value to switch. A density-only commit leaves
                    // the app's bpm completely untouched (its notes were already baked at generation).
                    if (c.bpm !== bpmRef.current) setBpm(c.bpm);
                }, delayMs);
            }
            return { bpm: c.bpm, densityStep: c.densityStep, pacing: c.pacing };
        }
        return { bpm: bpmRef.current, densityStep: s.densityStep, pacing: s.pacing };
    }, [bpmRef, setBpm, context]);

    // Called by the DECIDER after a graded stretch of content finished: the content stream at each of its
    // block boundaries. There is exactly ONE decider per level so a single boundary can never be
    // double-adjusted.
    //   stats       — the level's CUMULATIVE `stats` snapshot right now (useLevel.js's `statsRef.current`).
    //   fromMeasure — the earliest content measure the change may take effect at.
    //   units       — every stream cadence that must agree on the commit measure (see commitIndexFor).
    const evaluate = useCallback(({ stats, fromMeasure, units }) => {
        const s = stateRef.current;
        const prev = s.prevStats;
        s.prevStats = stats;
        // The first boundary has nothing to compare against (no prior snapshot), so the ladder simply
        // holds through it — the "block 0 is a no-op" case flagged in the plan.
        if (prev == null || s.baseBpm == null) return;
        // A change is already decided and waiting to land: hold. Deciding again would either supersede an
        // armed commit (leaving the streams generating at a position the app never adopts) or stack two
        // changes onto one commit index. One change in flight at a time.
        if (s.commit) return;
        const next = evaluateLadder({
            prevStats: prev,
            currStats: stats,
            state: { bpm: bpmRef.current, densityStep: s.densityStep, pacing: s.pacing },
            baseBpm: s.baseBpm,
            lvl: s.lvl,
        });
        // Deadband hold, or a rung that was already at its bound (the silent no-op convention).
        if (next.bpm === bpmRef.current && next.densityStep === s.densityStep && next.pacing === s.pacing) return;
        s.commit = { ...next, fromMeasure: commitIndexFor(fromMeasure, units), scheduled: false };
    }, [bpmRef]);

    return useMemo(() => ({ begin, cancel, blockSettingsFor, evaluate }),
        [begin, cancel, blockSettingsFor, evaluate]);
}
