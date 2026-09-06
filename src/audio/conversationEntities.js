import { DEFAULT_TONE_POOL } from './conversationTypewriter';

// #922 (Han 2026-08-12): single source of truth for the RPG conversation system's per-entity audio profile
// (instrument + pitch tone pool) — §6c, no second hand-copied map at any call site. `entity` keys match
// EITHER a fixed internal role (wisp/slime/wizard) OR a level's own `npc` field verbatim (e.g. "Japanese
// Musician", levels.json) — both are looked up through the SAME `getEntityAudioProfile`.
const WISP_TONE_POOL = [
    // Han 2026-08-12: "de range van de wisp mag twee octaven omhoog" (3->5), then round 4 follow-up:
    // "wisp +1 octaaf" (5->6) — default pool's C/D/E3 shifted to 6.
    { note: 'C6', weight: 70 }, { note: 'D6', weight: 25 }, { note: 'E6', weight: 5 },
];
// Han 2026-08-12: "japanese musician: koto. gebruik de IN toonladder, dus noten C4 Db4 en F4 (met zelfde
// kansverhouding)" — the "In" scale's characteristic notes, at the SAME 70/25/5 weighting as every other
// entity's pool. Instrument later changed koto -> shamisen (Han, same day); the IN-scale note choice is
// independent of which string instrument plays it, so the tone pool itself is unchanged.
const IN_SCALE_TONE_POOL = [
    { note: 'C4', weight: 70 }, { note: 'D♭4', weight: 25 }, { note: 'F4', weight: 5 },
];

export const ENTITY_AUDIO_PROFILE = {
    wisp: { instrument: 'ocarina', tonePool: WISP_TONE_POOL },
    slime: { instrument: 'marimba', tonePool: DEFAULT_TONE_POOL },
    wizard: { instrument: 'xylophone', tonePool: DEFAULT_TONE_POOL },
    'Japanese Musician': { instrument: 'shamisen', tonePool: IN_SCALE_TONE_POOL },
    // RPG-world worker NPCs (Han 2026-09-04, npcDialogue.js) — keyed by the SAME bestiary base name.
    // One instrument each, chosen to fit the character; the tone pool is the shared default.
    Blacksmith: { instrument: 'vibraphone', tonePool: DEFAULT_TONE_POOL },        // Tambo — slow, warm
    'Blacksmith Woman': { instrument: 'glockenspiel', tonePool: DEFAULT_TONE_POOL }, // Sonia — bright, quick
    'Town crier': { instrument: 'trumpet', tonePool: DEFAULT_TONE_POOL },         // Campano — herald
    Lumberjack: { instrument: 'piccolo', tonePool: DEFAULT_TONE_POOL },           // Piccolo — seeks a flute
    'Lady Potions': { instrument: 'orchestral_harp', tonePool: DEFAULT_TONE_POOL }, // Dominica — glissando/scales
    Steampunker: { instrument: 'accordion', tonePool: DEFAULT_TONE_POOL },        // Wavie — bellows/steam
};
export const DEFAULT_AUDIO_PROFILE = { instrument: 'marimba', tonePool: DEFAULT_TONE_POOL };

export function getEntityAudioProfile(entity) {
    return ENTITY_AUDIO_PROFILE[entity] || DEFAULT_AUDIO_PROFILE;
}
