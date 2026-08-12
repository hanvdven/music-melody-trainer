// #922 (Han 2026-08-12): single source of truth for the RPG conversation system's per-entity audio profile
// (instrument + pitch octave) — §6c, no second hand-copied map at any call site.
export const ENTITY_AUDIO_PROFILE = {
    // Han 2026-08-12: "de range van de wisp mag twee octaven omhoog" — default octave (3) + 2.
    wisp: { instrument: 'ocarina', octave: 5 },
    slime: { instrument: 'marimba', octave: 3 },
    wizard: { instrument: 'xylophone', octave: 3 },
};
export const DEFAULT_AUDIO_PROFILE = { instrument: 'marimba', octave: 3 };

export function getEntityAudioProfile(entity) {
    return ENTITY_AUDIO_PROFILE[entity] || DEFAULT_AUDIO_PROFILE;
}
