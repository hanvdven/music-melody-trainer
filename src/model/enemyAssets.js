// #648 Bestiary — enemy sprite manifest (v2, Han 2026-08-01: GandalfHardcore ONLY; tinyRPG dropped).
// Every enemy is now ONE sprite SHEET whose ROWS are animations — a single uniform format, so the renderer
// only ever reads `{ url, row, frames, frame }`. Frame size is PER ENEMY (the Pixel Art Enemies pack is
// 64×64; the Slime pack is 32×32). `frames` are the MEASURED content-frame counts per row (some rows have
// trailing blank cells that must NOT be played) — declared here exactly like ANIMATIONS.frames; this file is
// the single source of truth for enemy geometry. `crop` is the measured content region (union over all
// animations) so the preview frames the sprite tightly instead of floating in empty pixels.
//
// Assets are copied into src/assets/enemies/sheets/ with clean kebab names — the original rpg paths contain
// spaces AND parens which break import.meta.glob's matcher.

const SHEET = import.meta.glob('../assets/enemies/sheets/*.png', { eager: true, query: '?url', import: 'default' });
const sheetUrl = (file) => SHEET[`../assets/enemies/sheets/${file}.png`];

// enemy(id, name, blurb, file, F, crop, anims) — F = square frame size; anims = [key, label, row, frames].
// Row → name follows the pack's sheet order (idle first, then move/attack/death); labels are a bestiary
// convention and can be renamed without touching the renderer.
const enemy = (id, name, blurb, file, F, crop, anims) => ({
    id, name, blurb, sheet: sheetUrl(file), frame: { w: F, h: F }, crop,
    animations: anims.map(([key, label, row, frames]) => ({ key, label, url: sheetUrl(file), row, frames })),
});

// Han's expected roster, all GandalfHardcore. Blurbs are Dutch flavour text.
export const ENEMIES = [
    enemy('lamia', 'Lamia', 'Een slangvrouw die je met haar blik verlamt.', 'lamia', 64, { x: 0, y: 9, w: 64, h: 55 }, [
        ['idle', 'Idle', 0, 5], ['move', 'Move', 1, 8], ['attack', 'Attack', 2, 6], ['death', 'Death', 3, 6],
    ]),
    enemy('bat', 'Bat', 'Een fladderende grotvleermuis. Klein, maar lastig te raken.', 'bat', 64, { x: 16, y: 17, w: 38, h: 33 }, [
        ['idle', 'Idle', 0, 4], ['move', 'Fly', 1, 6], ['attack', 'Attack', 2, 6],
    ]),
    enemy('flying-eye', 'Flying Eye', 'Een zwevend oog dat je nooit uit het oog verliest.', 'flying-eye', 64, { x: 13, y: 15, w: 39, h: 34 }, [
        ['idle', 'Idle', 0, 5], ['move', 'Float', 1, 6],
    ]),
    enemy('flying-witch', 'Flying Witch', 'Een heks op haar bezem, klaar om te vervloeken.', 'flying-witch', 64, { x: 0, y: 1, w: 46, h: 63 }, [
        ['idle', 'Idle', 0, 5], ['move', 'Fly', 1, 8], ['attack', 'Attack', 2, 7],
    ]),
    enemy('mimic', 'Mimic', 'Een kist die eruitziet als buit — tot hij toehapt.', 'mimic', 64, { x: 10, y: 33, w: 41, h: 31 }, [
        ['idle', 'Closed', 0, 1], ['move', 'Open', 1, 8], ['attack', 'Attack', 2, 6], ['death', 'Death', 3, 7],
    ]),
    enemy('mosquito', 'Mosquito', 'Een bloeddorstige reuzenmug. Zoemt vervelend om je heen.', 'mosquito', 64, { x: 15, y: 22, w: 35, h: 30 }, [
        ['idle', 'Idle', 0, 4], ['move', 'Fly', 1, 6],
    ]),
    enemy('plant', 'Plant', 'Een vleesetende plant met een flinke beet.', 'plant', 64, { x: 10, y: 31, w: 39, h: 33 }, [
        ['idle', 'Idle', 0, 5], ['move', 'Move', 1, 8], ['attack', 'Attack', 2, 6], ['death', 'Death', 3, 5],
    ]),
    enemy('pumpkin', 'Pumpkin', 'Een grijnzende pompoenkop. Hobbelt griezelig dichterbij.', 'pumpkin', 64, { x: 3, y: 29, w: 61, h: 35 }, [
        ['idle', 'Idle', 0, 10], ['move', 'Move', 1, 9], ['attack', 'Attack', 2, 6],
    ]),
    enemy('rat', 'Rat', 'Een grote rioolrat. Snel op zijn pootjes.', 'rat', 64, { x: 10, y: 47, w: 48, h: 17 }, [
        ['idle', 'Idle', 0, 5], ['move', 'Move', 1, 8], ['attack', 'Attack', 2, 6], ['death', 'Death', 3, 5],
    ]),
    enemy('mushroom', 'Mushroom', 'Een chagrijnige paddenstoel die giftige sporen uitstoot.', 'mushroom', 64, { x: 13, y: 35, w: 37, h: 29 }, [
        ['idle', 'Idle', 0, 5], ['move', 'Move', 1, 5], ['attack', 'Attack', 2, 6], ['death', 'Death', 3, 5],
    ]),
    enemy('slime', 'Slime', 'Een glibberige slijmbal. Komt in groen, blauw en rood.', 'slime-green', 32, { x: 0, y: 3, w: 30, h: 29 }, [
        ['idle', 'Idle', 0, 5], ['move', 'Move', 1, 8], ['death', 'Death', 2, 5],
    ]),
];

export const enemyById = (id) => ENEMIES.find((e) => e.id === id);

// #647 slime colours by note duration (Han): green = quarter, blue = eighth, red = half/whole. The overlay
// uses these directly (the bestiary shows the green representative). Same 32×32 / row layout as the slime.
export const SLIME_FRAME = { w: 32, h: 32 };
export const SLIME_CROP = { x: 0, y: 3, w: 30, h: 29 };
export const SLIME_IDLE = { row: 0, frames: 5 };
export const SLIME_DEATH = { row: 2, frames: 5 };   // #647 combat: slime death animation (plays once)
export const SLIME_COLORS = {
    green: sheetUrl('slime-green'),
    blue: sheetUrl('slime-blue'),
    red: sheetUrl('slime-red'),
};
