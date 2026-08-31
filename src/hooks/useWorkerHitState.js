import { useState, useRef, useEffect } from 'react';
import { FRAMES_PER_BEAT } from '../components/sheet-music/SheetRpgLayer';

// #1093 (Han 2026-08-20, open-world worker NPCs): the idle/work animation state machine + beat-synced
// audio trigger for ONE worker NPC. Called ONCE per NPC by RpgLevelPanel.jsx (never inside the
// twice-rendered WorkerNpc component itself — see that file's header comment for why: this hook owns
// real state and fires a real side effect, and rendering the SAME NPC's sprite a second time for its
// water reflection must never re-run either).
//
// `hitConfig` is null for a silent worker (lumberjack/lady potions/steampunker — Han gave no sound spec
// for these yet) — the worker then just loops its bestiary `idle` animation via the shared `petFrame`
// tick (Wisp/pet/Slime already tick this the same way, §6c — 5 frames/beat, tempo-locked to bpm).
//
// #1095 (Han 2026-08-20, "rol elke 2 maten of de animatie start (50%); draai de animatie voor 2 maten"):
// the ONLY mode now, replacing #1093's original 'idle-triggers' (always-on, fired mid-idle-loop) and
// 'random' (per-beat chance, natural-length hit anim) modes — Han's new spec unified all 3 sound-bearing
// workers (Blacksmith Slow's `hit`, Town crier's `ring`, Blacksmith Fast/blacksmith_f's `work`) onto the
// SAME "roll at a measure-pair boundary, loop the work animation to fill exactly that window" shape, so
// one mode covers all 3 instead of two divergent ones:
//   `hitConfig.workAnimKey`      — the bestiary animation to switch to when a roll succeeds (`hit`/`ring`/`work`).
//   `hitConfig.hitFrameIndices`  — 0-based indices WITHIN that animation's own cell list where the note fires;
//                                  fires on EVERY loop repetition, not just the first (a bell mid-loop rings
//                                  every time it swings past, not once ever).
//   `hitConfig.chance`           — probability of starting at each roll boundary (Han: 0.5 for all 3 so far).
//   `hitConfig.measures`         — the roll-interval AND the play-duration, in measures (Han: 2 for all 3).
//   `hitConfig.note`             — tubular_bells note.
// Beats-per-measure comes from the LIVE `timeSignature` prop (RpgLevelPanel's own prop, sourced from
// App.jsx's current song — NOT a fixed open-world constant, confirmed by RpgLevelPanel's existing
// `frameMsForBpm(bpm, timeSignature)` tick), so "2 measures" is genuinely 2 measures of whatever's
// currently playing, not a hardcoded 8-beat window (CLAUDE.md §6c: derive from timeSignature, don't
// hardcode) — same `timeSignature[0]` convention every other beats-per-measure site in this codebase uses
// (useLevelBackingStream.js, useTwoHandedBass.js, etc.).
//
// The roll/window boundary is anchored to `petFrame % windowFrames === 0` — `petFrame` is the SAME shared
// counter every worker NPC ticks from (RpgLevelPanel), so every worker's roll boundaries line up on the
// same measure-pair grid, even though each worker's own coin flip is independent.
//
// #1094 (Han 2026-08-20, "NPC-geluid is niet afstandsgebonden"): `npcWorldX` (this NPC's fixed world
// position) and `getListenerX` (a function returning the player's LIVE world X, read fresh at fire time —
// see `fire()` below) are threaded straight through to `triggerBell`, which pans/attenuates the note by
// distance (useWorkerNpcAudio.js). Neither is used for anything else in this hook.
//
// Note-scheduling precision: fires at `context.currentTime` from a React effect reacting to `petFrame` —
// the SAME setInterval-driven cadence Wisp/pet/Slime idle already uses, not Web-Audio-clock-scheduled
// like the Sequencer/level-backing-stream (CLAUDE.md §6's "never setTimeout for setCurrentMeasureIndex"
// invariant is about THAT sheet-music measure-tracking system, a different subsystem with tighter
// precision needs). Consistent with the open-world idle-animation timing model's existing precision.
export default function useWorkerHitState(variant, hitConfig, petFrame, timeSignature, context, triggerBell, npcWorldX, getListenerX) {
    const [active, setActive] = useState(false);
    const startFrameRef = useRef(0);
    const idleAnim = variant?.animations?.find((a) => a.key === 'idle') || variant?.animations?.[0];
    const workAnim = hitConfig ? variant?.animations?.find((a) => a.key === hitConfig.workAnimKey) : null;

    useEffect(() => {
        if (!variant || !hitConfig || !workAnim) return;
        const beatsPerMeasure = timeSignature?.[0] || 4;
        const windowFrames = hitConfig.measures * beatsPerMeasure * FRAMES_PER_BEAT;
        // #1094: read the player's position fresh at the exact moment a note actually fires (not a value
        // captured when the effect was scheduled), so a hit that lands while the player is mid-stride
        // still pans/attenuates correctly.
        const fire = (note) => triggerBell(note, context?.currentTime ?? 0, npcWorldX, getListenerX());

        if (!active) {
            if (petFrame % windowFrames === 0 && Math.random() < hitConfig.chance) {
                startFrameRef.current = petFrame;
                setActive(true);
            }
            return;
        }
        const elapsed = petFrame - startFrameRef.current;
        if (elapsed >= windowFrames) {
            setActive(false);
            return;
        }
        const workLen = workAnim.cells.length || 1;
        if (hitConfig.hitFrameIndices.includes(elapsed % workLen)) {
            fire(hitConfig.note);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [petFrame]);

    if (!variant) return { anim: null, frame: 0 };
    const anim = (active && workAnim) || idleAnim;
    const workLen = workAnim?.cells.length || 1;
    const frame = active ? ((petFrame - startFrameRef.current) % workLen) : petFrame;
    return { anim, frame };
}
