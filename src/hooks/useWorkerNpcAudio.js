import { useRef, useCallback } from 'react';
import { createMelodicInstrument } from '../audio/localInstruments';
import { createSpatialBus } from './useWorldAmbientMusic';
import { computeSpatialPanVolume } from '../audio/spatialPan';

// #1093 (Han 2026-08-20, open-world worker NPCs): a single shared `tubular_bells` instrument for every
// worker NPC's beat-synced hit/bell sound, lazily created on first use (context may not exist yet on
// mount) and reused across ALL worker NPCs — this is why "up to 20 audio channels" was never really a
// concern (Han's interview 2026-08-20, confirmed "one of each NPC, hand-placed"): it's one polyphonic
// instrument instance playing a handful of one-shot notes, not one instrument per NPC. `.load` must
// resolve before `.start()` is meaningful (useWorldAmbientMusic.js's `getInstrument`/§924 round 2
// precedent — an unloaded instance silently produces no sound); chaining through `.load.then()` on every
// call costs nothing once loaded (smplr resolves an already-loaded `.load` promise instantly).
//
// #1094 (Han 2026-08-20, "NPC-geluid is niet afstandsgebonden"): routed through ONE shared spatial bus
// (`createSpatialBus`, the SAME panner+gain chain useWorldAmbientMusic.js's birds/water already use,
// exported from there — §6c, not a second hand-rolled chain) instead of straight to
// `context.destination`. Unlike birds/water (long, continuous sounds that need their pan/gain RE-computed
// every frame as the player walks), a worker's hit sound is a single short one-shot — pan/gain is
// computed ONCE, right before `.start()`, from wherever the player and the triggering NPC are at that
// exact moment; no continuous update loop needed. Every worker NPC shares the SAME bus (not one bus each)
// since they never play overlapping notes closely enough in practice for a shared instant pan/gain value
// to be a real problem — accepted trade-off for staying on the "one shared instrument" simplicity above.
export default function useWorkerNpcAudio(context) {
    const instrumentRef = useRef(null);
    const busRef = useRef(null);

    const triggerBell = useCallback((note, time, npcWorldX, listenerX) => {
        if (!context) return;
        if (!busRef.current) {
            busRef.current = createSpatialBus(context);
        }
        if (!instrumentRef.current) {
            instrumentRef.current = createMelodicInstrument(context, 'tubular_bells', { destination: busRef.current.input });
        }
        const { pan, gain } = computeSpatialPanVolume(npcWorldX, listenerX);
        busRef.current.panner.pan.setValueAtTime(pan, time);
        busRef.current.gain.gain.setValueAtTime(gain, time);
        const instrument = instrumentRef.current;
        instrument.load.then(() => {
            instrument.start({ note, time });
        });
    }, [context]);

    return triggerBell;
}
