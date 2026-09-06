// RPG-world worker-NPC dialogue (Han 2026-09-04: "geef alle NPC's in de RPG-wereld wat tekst als je
// interactie hebt (engels), en een naam"). The 6 stationary worker NPCs (RpgLevelPanel's `workerNpcs`,
// x-ordered from Level_1's LDtk "NPC" markers, #1093) had only a bell sound and no dialogue. Clicking one
// in the world now walks the hero over (`openEntityDialogue`, the SAME walk-then-talk path as the Wisp)
// and shows ONE random line from that worker's pool, with a name plate on the dialogue box.
//
// Keyed by the bestiary BASE name — the `variant` / `findCreatureByName` argument, and the SAME key
// `WORKER_SOUND_CONFIG` (workerSoundConfig.js) and `ENTITY_AUDIO_PROFILE` (conversationEntities.js) use —
// so the three maps line up 1:1. `displayName` is Han's chosen name; `lines` is the pick pool (one
// random line per interaction). English, in each worker's established voice.
// A single *word or phrase* per line is wrapped in asterisks — OscillatingText renders those runs in
// Bitfantasy (the rest is SandyForest). Han 2026-09-04. Extend freely; markers must stay balanced.
export const NPC_DIALOGUE = {
    // Slow blacksmith — optimistic, folksy sayings about the work.
    Blacksmith: {
        displayName: 'Tambo',
        lines: [
            "*Slow* hammer, straight edge. That's the whole secret.",
            'Every good blade *started out as a bad one*. Keep at it.',
            "A crack today is just a *lesson* for tomorrow's steel.",
            "I've never met a metal that didn't *come round* in the end.",
            'Warm the iron, warm your heart. Both *bend easier* that way.',
            "No rush. The anvil's been here *a hundred years*. It'll wait.",
            'Bad light, good work. The fire shows you *everything you need*.',
            "You can't *force* a fold. You can only *invite* it.",
            'Rest the arm between strikes. The blade *remembers kindness*.',
            "Every dent I hammer out was somebody's hard day. I like *fixing those*.",
            'Give it *time and a little heat*. Same as people.',
        ],
    },
    // Fast blacksmith — everything in the world is always in motion.
    'Blacksmith Woman': {
        displayName: 'Sonia',
        lines: [
            '*Nothing stands still*, friend — not the anvil, not the stars, not you.',
            'Every spark that flies is *going somewhere*. So am I.',
            'The world *turns* whether we hammer or not. Might as well hammer.',
            'Rivers move, bellows move, feet move. Standing still is *the only mistake*.',
            "By the time this horseshoe cools, *everything's changed a little*.",
            "Fast hands, fast heart. The day *doesn't wait around*.",
            'Watch the sparks — they never fall *the same way twice*.',
            "Even the mountains are *walking*. Just slower than we've got patience for.",
            "I finished ten blades today and the world's *already asking for eleven*.",
            '*Motion* is the only thing that\'s really free. Everything else you pay for.',
            'Keep moving and the cold *never catches you*.',
        ],
    },
    // Town crier — news and proclamations about Melody Hill.
    'Town crier': {
        displayName: 'Campano',
        lines: [
            '*Hear ye!* The bells of Melody Hill rang a perfect fifth at dawn!',
            '*News from the Hill:* a new scale was found growing in the eastern orchard!',
            "They say the old conductor's cottage has *music in the walls* again.",
            'Melody Hill market opens at *noon* — trading tunes and turnips alike!',
            'A wandering choir was seen on the ridge road. *Mind your earworms!*',
            'Proclamation: the fountain in the square now plays in *three-four time!*',
            "Word is the Hill's oldest oak dropped an acorn shaped like a *whole note*.",
            'Lost and found: one tuning fork, *slightly flat*. Enquire at the belfry.',
            'The mayor declares a *festival week*. Bring an instrument or an appetite!',
            'Travellers report the northern bridge *hums when you cross it*. Investigating.',
            "That's the news from Melody Hill. Tell two friends, they'll tell *the key of C*.",
        ],
    },
    // Lumberjack — forever one cut away from carving the perfect flute.
    Lumberjack: {
        displayName: 'Piccolo',
        lines: [
            "I'm *so close*. This one's almost got the tone I hear in my sleep.",
            'One more knot to carve out and — no. *Not yet.* But close.',
            "Every tree sings a little. I'm just after *the one that sings right*.",
            'I *almost* had it yesterday. Split on the last hole. Almost.',
            "The perfect flute is inside one of these trunks. *I'll know it when I hear it.*",
            "Listen — that's an A. *Nearly.* Half a breath off an A.",
            "Cedar's too soft, oak's too proud. *Somewhere between* is my flute.",
            "I've felled a hundred trees and kept *the sound of three of them*.",
            "So close I can *almost play it*. Just can't hold it yet.",
            "Don't tell the forest, but I'd trade the whole woodpile for *one clean high note*.",
            '*Tomorrow.* Tomorrow I get it. I can feel the grain lining up.',
        ],
    },
    // Potion lady — every remedy is a pun on scales / toonladders.
    'Lady Potions': {
        displayName: 'Dominica',
        lines: [
            "Careful with that vial — it's in a *minor key*, quite moody.",
            'This tonic works in any scale, but it *climbs best in C*.',
            "I sell remedies *by the octave*. Buy eight, the last one's on the house.",
            'Feeling *flat*? I\'ve got just the thing to *sharpen* you right up.',
            'My strongest brew? We call it the *chromatic*. It skips nothing.',
            "Don't mix the *sharps* with the *flats*. Trust me, the fizz is unbearable.",
            'A *whole-tone* draught for courage, a *half-step* for caution.',
            "This one's a *natural*. No accidentals, no side effects.",
            'Take it up the scale, one dose per step. Rushing the ladder *ends in hiccups*.',
            "Out of the *diminished* blend, I'm afraid. It never sits well anyway.",
            'Every good potion *resolves*. Same as every good phrase.',
        ],
    },
    // Steampunker — metaphorical, riddle-like statements.
    Steampunker: {
        displayName: 'Wavie',
        lines: [
            'A gear only learns its purpose when *another tooth meets it*.',
            '*Steam remembers being water.* That is why it rises.',
            'I built a clock that ticks only when no one listens. It is *always on time*.',
            "Pressure is just *a song the pipes aren't allowed to sing yet*.",
            'Every valve is *a small decision the machine makes about the sky*.',
            'Give a wheel a reason and it will give you back *a direction*.',
            'The furnace does not *burn* the coal. It *sets the coal free*.',
            "What turns without moving? *Ask the axle.* It won't answer, but ask.",
            'I oil the joints that complain loudest. *The quiet ones I watch.*',
            'A machine is *a question you can stand inside*.',
            'When the whistle blows, *something far away has finished waiting*.',
        ],
    },
};

// One random line for `name` (a bestiary base name / NPC_DIALOGUE key), or null if unknown.
export function randomNpcLine(name) {
    const entry = NPC_DIALOGUE[name];
    if (!entry) return null;
    return entry.lines[Math.floor(Math.random() * entry.lines.length)];
}

// Display names for every named entity with dialogue (Han 2026-09-04). The 6 workers above carry their
// own `displayName`; the Wisp / Slime / three wizards have their lines elsewhere (WISP_LINES in
// useRpgLevelState, LOREM_IPSUM_PARAGRAPHS in conversationContent, WIZARD_VICTORY_LINES for the
// level-complete panel) so their names live here, keyed by the `entity` string each dialogue path
// already passes to `openEntityDialogue` / DialogueBox.
export const ENTITY_DISPLAY_NAME = {
    wisp: 'Lamentia',
    slime: 'Blob',
    Wizard: 'Antophon',          // black wizard (§121/§135)
    YellowWizard: 'Prosperus',   // §371 blind perfect-timing trainer
    GreenWizard: 'Modulatus',    // green wizard
    ...Object.fromEntries(Object.entries(NPC_DIALOGUE).map(([k, v]) => [k, v.displayName])),
};

// Han's display name for an entity/NPC key, or null if it has none.
export function entityDisplayName(entity) {
    return ENTITY_DISPLAY_NAME[entity] ?? null;
}
