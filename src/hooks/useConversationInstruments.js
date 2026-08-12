import { useCallback, useRef } from 'react';
import { Soundfont } from 'smplr';
import { getEntityAudioProfile } from '../audio/conversationEntities';

// #922 (Han 2026-08-12, RPG conversation system, "ik wil voor verschillende entiteiten verschillende
// instrumenten geven: wisp: ocarina, slime: marimba, wizard: xylophone, default: marimba"): lazily-created,
// cached Soundfont instances for the conversation typewriter's fixed entity->instrument roster — reuses
// smplr's `Soundfont` constructor exactly like useInstruments.js does for the treble/bass/percussion/
// metronome roles (§6d), just for these decorative one-off dialogue notes instead of scored melody parts.
// The entity->slug/octave mapping itself lives in conversationEntities.js (single source of truth, §6c).
export default function useConversationInstruments(context) {
    const instrumentCacheRef = useRef({});   // slug -> Soundfont instance
    // Bug fix: `useConversationDialogue`'s reveal effect depends on its `profile` prop's IDENTITY to decide
    // whether to restart the typewriter. A NEW `{ instrument, octave }` object literal returned on every
    // call (even for the same entity, same underlying Soundfont) would make the effect re-run — and the
    // reveal RESTART FROM SCRATCH — on every parent re-render (App.jsx re-renders ~60x/sec while the hero
    // is moving). Caching the profile OBJECT itself per entity keeps its reference stable across renders.
    const profileCacheRef = useRef({});      // entity -> { instrument, octave }

    // Returns { instrument: SoundfontInstance, octave } — ready to hand straight to
    // useConversationDialogue's `profile` prop. Same object reference for the same entity across renders.
    const getConversationProfile = useCallback((entity) => {
        const { instrument: slug, octave } = getEntityAudioProfile(entity);
        if (!context) return { instrument: null, octave };
        if (!instrumentCacheRef.current[slug]) {
            instrumentCacheRef.current[slug] = new Soundfont(context, { instrument: slug, destination: context.destination });
        }
        const cacheKey = entity || 'default';
        const cached = profileCacheRef.current[cacheKey];
        if (!cached || cached.instrument !== instrumentCacheRef.current[slug]) {
            profileCacheRef.current[cacheKey] = { instrument: instrumentCacheRef.current[slug], octave };
        }
        return profileCacheRef.current[cacheKey];
    }, [context]);

    return getConversationProfile;
}
