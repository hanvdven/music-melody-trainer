// #922 (Han 2026-08-12, "de slime vertelt het volledige lorem ipsum, met paginatie"): the post-combat green
// slime's conversation content — each array entry is ONE page/paragraph (Han's own word: "de huidige
// paragraaf"), fed straight to useConversationDialogue's `pages`.
export const LOREM_IPSUM_PARAGRAPHS = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
];

// #922: the wizard's short post-combat lines — placeholder content (Han: propose defaults, flag for UAT
// correction if he wants different wording).
export const WIZARD_VICTORY_LINES = [
    'Woah, you beat me...!',
    'Impressive. Truly impressive.',
];
