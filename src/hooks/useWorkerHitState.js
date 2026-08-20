import { useState, useRef, useEffect } from 'react';

// #1093 (Han 2026-08-20, open-world worker NPCs): the idle/hit animation state machine + beat-synced
// audio trigger for ONE worker NPC. Called ONCE per NPC by RpgLevelPanel.jsx (never inside the
// twice-rendered WorkerNpc component itself — see that file's header comment for why: this hook owns
// real state and fires a real side effect, and rendering the SAME NPC's sprite a second time for its
// water reflection must never re-run either).
//
// `hitConfig` is null for a silent worker (lumberjack/lady potions/steampunker — Han gave no sound spec
// for these yet) — the worker then just loops its bestiary `idle` animation via the shared `petFrame`
// tick (Wisp/pet/Slime already tick this the same way, §6c — 5 frames/beat, tempo-locked to bpm).
//
// `hitConfig.mode`:
//   - 'idle-triggers': the EXISTING idle animation plays unmodified; a note fires each time the idle
//     loop's own frame index passes through one of `frameIndices` (0-based) — blacksmith fast (index 0,
//     every beat) and town crier (indices 2 and 7, Han's "frame 3 en 8", 1-based) both work this way;
//     neither needed a new bestiary animation.
//   - 'random': blacksmith slow only — normally loops 'idle' (5 frames, bestiaryMetadata.json override),
//     but at each beat boundary (idle frame 0) rolls `chancePerBeat` to switch to the separate 'hit'
//     animation (10 frames/2 beats, added via bestiaryMetadata.json's addedAnimations) instead — Han:
//     "mag random zijn". The hit sequence always STARTS at a beat boundary (never mid-frame) so it stays
//     tempo-locked even though it isn't pinned to a fixed interval — Han: "die moet op de tel landen".
//     The note fires once the hit animation reaches `hitFrameIndex` (array position — see
//     RpgLevelPanel.jsx's `workerNpcs` table for the 1-based-sprite-cell -> array-index conversion),
//     then the worker returns to idle.
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
const CHANCE_PER_BEAT_DEFAULT = 0.125;   // Han said "mag random zijn" with no exact frequency — roughly
// one hit-swing every 8 beats on average, an "occasional, not constant" hammering cadence; a single
// easy-to-retune constant once Han hears it in-game.

export default function useWorkerHitState(variant, hitConfig, petFrame, context, triggerBell, npcWorldX, getListenerX) {
    const [hitActive, setHitActive] = useState(false);
    const hitStartFrameRef = useRef(0);
    const idleAnim = variant?.animations?.find((a) => a.key === 'idle') || variant?.animations?.[0];
    const hitAnim = hitConfig?.mode === 'random' ? variant?.animations?.find((a) => a.key === 'hit') : null;

    useEffect(() => {
        if (!variant || !hitConfig) return;
        // #1094 (Han 2026-08-20, "NPC-geluid is niet afstandsgebonden"): read the player's position fresh
        // at the exact moment a note actually fires (not a value captured when the effect was scheduled),
        // so a hit that lands while the player is mid-stride still pans/attenuates correctly.
        const fire = (note) => triggerBell(note, context?.currentTime ?? 0, npcWorldX, getListenerX());
        if (hitConfig.mode === 'idle-triggers') {
            const len = idleAnim?.cells.length || 1;
            const localFrame = petFrame % len;
            if (hitConfig.frameIndices.includes(localFrame)) {
                fire(hitConfig.note);
            }
            return;
        }
        if (hitConfig.mode === 'random') {
            const idleLen = idleAnim?.cells.length || 5;
            const hitLen = hitAnim?.cells.length || 1;
            if (!hitActive) {
                if (petFrame % idleLen === 0 && Math.random() < (hitConfig.chancePerBeat ?? CHANCE_PER_BEAT_DEFAULT)) {
                    hitStartFrameRef.current = petFrame;
                    setHitActive(true);
                }
                return;
            }
            const elapsed = petFrame - hitStartFrameRef.current;
            if (elapsed >= hitLen) {
                setHitActive(false);
                return;
            }
            if (elapsed === hitConfig.hitFrameIndex) {
                fire(hitConfig.note);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [petFrame]);

    if (!variant) return { anim: null, frame: 0 };
    const anim = (hitActive && hitAnim) || idleAnim;
    const frame = hitActive ? (petFrame - hitStartFrameRef.current) : petFrame;
    return { anim, frame };
}
