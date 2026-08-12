// #922 (Han 2026-08-12, "de slime vertelt het volledige lorem ipsum, met paginatie" — round 2: "die op de
// slime van de RPG-wereld"): the OPEN-WORLD decorative slime's conversation content (useRpgLevelState.js's
// `clickSlime`) — each array entry is ONE page/paragraph (Han's own word: "de huidige paragraaf"), fed
// straight to useConversationDialogue's `pages`.
export const LOREM_IPSUM_PARAGRAPHS = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
];

// #922: the wizard's short post-combat line — placeholder content (Han: propose defaults, flag for UAT
// correction if he wants different wording).
export const WIZARD_VICTORY_LINES = [
    'Woah, you beat me...!',
    'Impressive. Truly impressive.',
];

// #922 round 2 (Han 2026-08-12, "zelfde bij levels met echte vijanden, toon portret of sprite" — a level's
// named decorative NPC, e.g. Sakura's "Japanese Musician"): generic short post-combat lines, since Han
// didn't specify per-NPC wording — placeholder content, flag for UAT correction.
export const NPC_GREETING_LINES = [
    'Well played!',
    'You have a good ear for this.',
    'Not bad at all.',
];

// #922 round 2: the DEFAULT post-combat case (no real or decorative NPC at all — just a plain slime).
export const SLIME_DEFEAT_LINES = [
    'Splat...',
    'You got me!',
    'Ooze... ooze everywhere.',
];
