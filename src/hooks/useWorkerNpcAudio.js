import { useRef, useCallback } from 'react';
import { createMelodicInstrument } from '../audio/localInstruments';

// #1093 (Han 2026-08-20, open-world worker NPCs: "speel tubular bel c6" / "tubular bells g6" / "tubular
// bells g5"): a single shared `tubular_bells` instrument for every worker NPC's beat-synced hit/bell
// sound, lazily created on first use (context may not exist yet on mount) and reused across ALL worker
// NPCs — this is why "up to 20 audio channels" was never really a concern (Han's interview 2026-08-20,
// confirmed "one of each NPC, hand-placed"): it's one polyphonic instrument instance playing a handful
// of one-shot notes, not one instrument per NPC. `.load` must resolve before `.start()` is meaningful
// (useWorldAmbientMusic.js's `getInstrument`/§924 round 2 precedent — an unloaded instance silently
// produces no sound); chaining through `.load.then()` on every call costs nothing once loaded (smplr
// resolves an already-loaded `.load` promise instantly).
export default function useWorkerNpcAudio(context) {
    const instrumentRef = useRef(null);

    const triggerBell = useCallback((note, time) => {
        if (!context) return;
        if (!instrumentRef.current) {
            instrumentRef.current = createMelodicInstrument(context, 'tubular_bells');
        }
        const instrument = instrumentRef.current;
        instrument.load.then(() => {
            instrument.start({ note, time });
        });
    }, [context]);

    return triggerBell;
}
