import { useState, useRef, useEffect } from 'react';
import { FRAMES_PER_BEAT, frameMsForBpm } from '../components/sheet-music/SheetRpgLayer';
import { WORLD_BPM, WORLD_TIME_SIGNATURE } from '../audio/worldClock';
import { outputLatencySeconds } from '../audio/audioOutputLatency';

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
// Beats-per-measure comes from the `timeSignature` prop, which RpgLevelPanel now passes as the fixed
// WORLD_TIME_SIGNATURE (Han 2026-09-01 sync pass — §924: every open-world clock, this one included,
// runs on WORLD_BPM/WORLD_TIME_SIGNATURE, not the live song). It was the live song's timeSignature
// until then; the `timeSignature[0]` derivation itself is the same convention every other
// beats-per-measure site uses (useLevelBackingStream.js, useTwoHandedBass.js, etc.).
//
// The roll/window boundary is anchored to `petFrame % windowFrames === 0` — `petFrame` is the SAME shared
// counter every worker NPC ticks from (RpgLevelPanel), so every worker's roll boundaries line up on the
// same measure-pair grid, even though each worker's own coin flip is independent.
//
// #1094 (Han 2026-08-20, "NPC-geluid is niet afstandsgebonden"): `npcWorldX` (this NPC's fixed world
// position) and `getListenerX` (a function returning the player's LIVE world X, read at scheduling time —
// see `fireAtFrame()` below) are threaded straight through to `triggerBell`, which pans/attenuates the
// note by distance (useWorkerNpcAudio.js). Neither is used for anything else in this hook.
//
// Note-scheduling precision (Han 2026-09-01 sync pass): the hit is detected ONE sprite frame early and
// scheduled AHEAD, at that frame's exact world-clock time (`hitFrame · frameSec`) minus the audio
// output latency (§355/§357) — so it is HEARD on the same grid as the ambient music and the metronome,
// not fired at a stale rAF "now". `petFrame` itself now ticks on WORLD_BPM anchored to
// `context.currentTime` (RpgLevelPanel), so `frameSec` here is the real grid spacing.
export default function useWorkerHitState(variant, hitConfig, petFrame, timeSignature, context, triggerBell, npcWorldX, getListenerX) {
    const [active, setActive] = useState(false);
    const startFrameRef = useRef(0);
    const idleAnim = variant?.animations?.find((a) => a.key === 'idle') || variant?.animations?.[0];
    const workAnim = hitConfig ? variant?.animations?.find((a) => a.key === hitConfig.workAnimKey) : null;

    useEffect(() => {
        if (!variant || !hitConfig || !workAnim) return;
        const beatsPerMeasure = timeSignature?.[0] || 4;
        const windowFrames = hitConfig.measures * beatsPerMeasure * FRAMES_PER_BEAT;
        const workLen = workAnim.cells.length || 1;
        // World-clock time (AudioContext seconds) at which sprite-frame F begins. `petFrame` is
        // `floor(context.currentTime / frameSec)` (RpgLevelPanel, on WORLD_BPM) — the SAME grid the
        // ambient music and the debug metronome sit on.
        const frameSec = frameMsForBpm(WORLD_BPM, WORLD_TIME_SIGNATURE) / 1000;

        // Sync fix (Han 2026-09-01, "de NPC's en de muziek klinken niet in sync"): schedule the bell
        // for the NEXT sprite frame, at that frame's exact world-clock time minus the audio output
        // latency (§355/§357), so it is HEARD on the grid — matching the ambient music — instead of
        // `.start()`-ing at a stale rAF "now" 0-120 ms after the beat, then adding ~48 ms of unmodelled
        // output latency on top. `getListenerX()` is still read HERE (≈ one frame / ~120 ms before the
        // hit) so the #1094 distance pan/gain stays essentially current.
        const fireAtFrame = (note, hitFrame) => {
            const heardAt = hitFrame * frameSec;
            const t = Math.max(context?.currentTime ?? 0, heardAt - outputLatencySeconds(context));
            triggerBell(note, t, npcWorldX, getListenerX());
        };
        const nextFrameLandsHit = (elapsedNext) =>
            elapsedNext >= 0 && elapsedNext < windowFrames
            && hitConfig.hitFrameIndices.includes(elapsedNext % workLen);

        if (!active) {
            if (petFrame % windowFrames === 0 && Math.random() < hitConfig.chance) {
                startFrameRef.current = petFrame;
                setActive(true);
                // the work anim starts on THIS frame; its next frame may already land a hit
                if (nextFrameLandsHit(1)) fireAtFrame(hitConfig.note, petFrame + 1);
            }
            return;
        }
        if (petFrame - startFrameRef.current >= windowFrames) {
            setActive(false);
            return;
        }
        if (nextFrameLandsHit((petFrame + 1) - startFrameRef.current)) {
            fireAtFrame(hitConfig.note, petFrame + 1);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [petFrame]);

    if (!variant) return { anim: null, frame: 0 };
    const anim = (active && workAnim) || idleAnim;
    const workLen = workAnim?.cells.length || 1;
    const frame = active ? ((petFrame - startFrameRef.current) % workLen) : petFrame;
    return { anim, frame };
}
