import { useRef, useEffect } from 'react';
import { createMelodicInstrument } from '../audio/localInstruments';
import { WORKER_SOUND_CONFIG } from '../model/workerSoundConfig';

// #1096 (Han 2026-08-20, "ik wil in de bestiary ook de animatie-audio horen"): plays a worker's bell/
// hammer note while browsing the bestiary preview, in sync with whichever animation is currently showing.
// Reads `WORKER_SOUND_CONFIG` (workerSoundConfig.js) — the SAME data RpgLevelPanel's real level roster and
// the generator's 'audio' filter tag use, so the note/frame numbers live in exactly one place.
//
// Deliberately NOT tempo-locked: the bestiary preview's own `frame` counter (useBestiaryEditor.js) already
// ticks on a plain fixed 150ms interval, unrelated to bpm/timeSignature — this hook just compares that
// counter (wrapped to the CURRENT animation's own cell count, same `elapsed % workLen` shape
// useWorkerHitState.js uses for the real level) against `hitFrameIndices`, it doesn't invent a second clock.
// No spatial panning (useWorkerNpcAudio.js's `createSpatialBus`) — this is a flat UI preview, not a
// world-positioned NPC, so `createMelodicInstrument`'s default destination (`context.destination`) is fine.
export default function useBestiaryAnimationAudio(context, creatureName, anim, frame) {
    const instrumentRef = useRef(null);
    const lastFiredRef = useRef(null);

    useEffect(() => {
        const cfg = creatureName ? WORKER_SOUND_CONFIG[creatureName] : null;
        if (!cfg || !context || !anim || anim.key !== cfg.workAnimKey) {
            lastFiredRef.current = null;
            return;
        }
        const workLen = anim.cells.length || 1;
        const local = ((frame % workLen) + workLen) % workLen;
        if (!cfg.hitFrameIndices.includes(local)) return;
        // Guard against re-firing the SAME frame twice if this effect re-runs for an unrelated reason
        // (e.g. `context` identity churn) without `frame` having actually advanced.
        const fireKey = `${creatureName}:${frame}`;
        if (lastFiredRef.current === fireKey) return;
        lastFiredRef.current = fireKey;
        if (!instrumentRef.current) instrumentRef.current = createMelodicInstrument(context, 'tubular_bells');
        const instrument = instrumentRef.current;
        instrument.load.then(() => instrument.start({ note: cfg.note, time: context.currentTime }));
    }, [context, creatureName, anim, frame]);
}
