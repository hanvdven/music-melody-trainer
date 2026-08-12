import { useCallback, useRef } from 'react';
import { Soundfont } from 'smplr';

// #922 (Han 2026-08-12, RPG conversation system, "ik wil voor verschillende entiteiten verschillende
// instrumenten geven: wisp: ocarina, slime: marimba, wizard: xylophone, default: marimba"): lazily-created,
// cached Soundfont instances for the conversation typewriter's fixed entity->instrument roster — reuses
// smplr's `Soundfont` constructor exactly like useInstruments.js does for the treble/bass/percussion/
// metronome roles (§6d), just for these decorative one-off dialogue notes instead of scored melody parts.
const ENTITY_INSTRUMENT_SLUG = { wisp: 'ocarina', slime: 'marimba', wizard: 'xylophone' };
const DEFAULT_SLUG = 'marimba';

export default function useConversationInstruments(context) {
    const cacheRef = useRef({});

    const getConversationInstrument = useCallback((entity) => {
        if (!context) return null;
        const slug = ENTITY_INSTRUMENT_SLUG[entity] || DEFAULT_SLUG;
        if (!cacheRef.current[slug]) {
            cacheRef.current[slug] = new Soundfont(context, { instrument: slug, destination: context.destination });
        }
        return cacheRef.current[slug];
    }, [context]);

    return getConversationInstrument;
}
