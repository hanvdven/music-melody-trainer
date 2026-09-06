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
//
// ── PACING gets a second moment too (#1120) ───────────────────────────────────────────────────────
// The gated pacing rung is the one OTHER knob with something app-wide to switch when the commit block
// actually sounds: the scroll must start waiting (SheetRpgLayer's `gatedScroll` prop), the metronome
// must stop and the cello/timpani must hand over to the real-time gate clock. It rides the SAME armed
// timeout as `setBpm` — the same `delayMs`, the same staleness re-check — so picture and sound flip
// together on ONE block boundary. Deliberately NOT a second timer.
export default function useAdaptiveDifficulty({ bpmRef, setBpm, setPacingMode = null, context }) {
    // A ref, not state: every consumer is an audio-scheduling callback running outside React's render
    // cycle (JIT stream generation, a setTimeout at an AudioContext time), and a re-render on every
    // difficulty decision would tear down the very JIT effects doing the deciding.
    const stateRef = useRef({
        baseBpm: null, lvl: null, densityStep: 0, pacing: 'timed',
        blocksSinceGatedExit: Infinity, prevStats: null, commit: null,
    });

    // Called once per level start. `baseBpm` is the level's AUTHORED tempo (`lvl.adaptiveBaseBpm`), which
    // is what Han's clamp `[baseBpm/2, baseBpm]` is expressed against — NOT the ANPM-derived baseline the
    // level actually starts at (that may legitimately sit anywhere inside, or initially above, the clamp).
    // `lvl` is kept because the ladder's density rungs are SCOPED to procedural levels (a song-backed
    // level's treble is sliced with `randomizationRule: 'fixed'` and cannot take a density override).
    // Rung 0 = the level exactly as authored, so a fresh run always starts there.
    // #1120: `pacing` resets to 'timed' on every (re)start — a fresh run always starts on the clock,
    // never inheriting the previous run's rubato rescue (design edge case e). `blocksSinceGatedExit`
    // starts at Infinity so the cooldown, which exists ONLY to stop re-gating right after an exit,
    // can never block the FIRST gating of a run.
    const begin = useCallback((baseBpm, lvl = null) => {
        stateRef.current = {
            baseBpm: baseBpm ?? null, lvl, densityStep: 0, pacing: 'timed',
            blocksSinceGatedExit: Infinity, prevStats: null, commit: null,
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
                    // #1120: read BEFORE the state is overwritten below — `setPacingMode` must fire
                    // only on a genuine flip, not on every landing commit.
                    const pacingChanged = stateRef.current.pacing !== c.pacing;
                    // The landed rung becomes this hook's own idea of "where the ladder is", so the
                    // controller state and what the app adopted can never disagree.
                    stateRef.current.densityStep = c.densityStep;
                    stateRef.current.pacing = c.pacing;
                    // #1120: the anti-flap cooldown starts when the EXIT actually LANDS, not when it
                    // was decided a block earlier. Deliberately NOT copied wholesale from the commit
                    // (`c.blocksSinceGatedExit` is the counter's value at DECISION time, so adopting
                    // it would silently roll back the increment `evaluate` made on that same
                    // boundary); only the exit's own reset is adopted. The ladder states the same
                    // rule in policy terms — see `evaluateLadder`'s gated branch.
                    if (pacingChanged && c.pacing === 'timed') stateRef.current.blocksSinceGatedExit = 0;
                    // Only the TEMPO rung has an app-wide value to switch. A density-only commit leaves
                    // the app's bpm completely untouched (its notes were already baked at generation).
                    if (c.bpm !== bpmRef.current) setBpm(c.bpm);
                    // #1120: …and the PACING rung, on this same moment — one decision, one instant, so
                    // the scroll starts/stops waiting exactly when the block it was decided for sounds.
                    if (pacingChanged) setPacingMode?.(c.pacing);
                }, delayMs);
            }
            return { bpm: c.bpm, densityStep: c.densityStep, pacing: c.pacing };
        }
        return { bpm: bpmRef.current, densityStep: s.densityStep, pacing: s.pacing };
    }, [bpmRef, setBpm, setPacingMode, context]);

    // Called by the DECIDER after a graded stretch of content finished: the content stream at each of its
    // block boundaries. There is exactly ONE decider per level so a single boundary can never be
    // double-adjusted.
    //   stats        — the level's CUMULATIVE `stats` snapshot right now (useLevel.js's `statsRef.current`).
    //   hiddenGrades — #1120's ring buffer of TRUE timing grades (App-owned ref, written per hit by
    //                  SheetRpgLayer). Only meaningful while gated; the ladder ignores it otherwise.
    //   fromMeasure  — the earliest content measure the change may take effect at.
    //   units        — every stream cadence that must agree on the commit measure (see commitIndexFor).
    const evaluate = useCallback(({ stats, hiddenGrades = null, fromMeasure, units }) => {
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
            state: {
                bpm: bpmRef.current, densityStep: s.densityStep, pacing: s.pacing,
                blocksSinceGatedExit: s.blocksSinceGatedExit,
            },
            baseBpm: s.baseBpm,
            lvl: s.lvl,
            hiddenGrades,
        });
        // #1120 anti-flap: count the boundaries that are graded UNDER timed pacing. Counted AFTER the
        // decision so the boundary that itself decides the exit does not count toward its own
        // cooldown, and only here — an evaluation that returned early above never graded anything.
        if (s.pacing === 'timed') s.blocksSinceGatedExit += 1;
        // Deadband hold, or a rung that was already at its bound (the silent no-op convention).
        // `blocksSinceGatedExit` is deliberately NOT part of this test: it is bookkeeping, not a rung,
        // and a bump in it must never manufacture a commit.
        if (next.bpm === bpmRef.current && next.densityStep === s.densityStep && next.pacing === s.pacing) return;
        s.commit = { ...next, fromMeasure: commitIndexFor(fromMeasure, units), scheduled: false };
    }, [bpmRef]);

    return useMemo(() => ({ begin, cancel, blockSettingsFor, evaluate }),
        [begin, cancel, blockSettingsFor, evaluate]);
}
