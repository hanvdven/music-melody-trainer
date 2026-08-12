import { DEFAULT_TONE_POOL } from './conversationTypewriter';

// #922 (Han 2026-08-12): single source of truth for the RPG conversation system's per-entity audio profile
// (instrument + pitch tone pool) — §6c, no second hand-copied map at any call site. `entity` keys match
// EITHER a fixed internal role (wisp/slime/wizard) OR a level's own `npc` field verbatim (e.g. "Japanese
// Musician", levels.json) — both are looked up through the SAME `getEntityAudioProfile`.
const WISP_TONE_POOL = [
    // Han 2026-08-12: "de range van de wisp mag twee octaven omhoog" — default pool's C/D/E3 shifted to 5.
    { note: 'C5', weight: 70 }, { note: 'D5', weight: 25 }, { note: 'E5', weight: 5 },
];
// Han 2026-08-12: "japanese musician: koto. gebruik de IN toonladder, dus noten C4 Db4 en F4 (met zelfde
// kansverhouding)" — the "In" scale's characteristic notes, at the SAME 70/25/5 weighting as every other
// entity's pool.
const KOTO_IN_SCALE_TONE_POOL = [
    { note: 'C4', weight: 70 }, { note: 'D♭4', weight: 25 }, { note: 'F4', weight: 5 },
];

export const ENTITY_AUDIO_PROFILE = {
    wisp: { instrument: 'ocarina', tonePool: WISP_TONE_POOL },
    slime: { instrument: 'marimba', tonePool: DEFAULT_TONE_POOL },
    wizard: { instrument: 'xylophone', tonePool: DEFAULT_TONE_POOL },
    'Japanese Musician': { instrument: 'koto', tonePool: KOTO_IN_SCALE_TONE_POOL },
};
export const DEFAULT_AUDIO_PROFILE = { instrument: 'marimba', tonePool: DEFAULT_TONE_POOL };

export function getEntityAudioProfile(entity) {
    return ENTITY_AUDIO_PROFILE[entity] || DEFAULT_AUDIO_PROFILE;
}
