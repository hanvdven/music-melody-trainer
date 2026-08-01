// #648 Bestiary — enemy sprite manifest. Two source sprite formats are unified behind ONE shape so the
// renderer stays format-agnostic (each animation is just `{ key, label, url, row, frames }`):
//
//  - 'tiny'    (tinyRPG_by_Zerie): 100×100 frames, ONE FILE per animation, a single row. `row` is always 0.
//  - 'gandalf' (GandalfHardcore Pixel Art Enemies): 64×64 frames, ONE SHEET; each animation is a ROW.
//
// The curated set is copied into src/assets/enemies/{tiny,sheets}/ with clean kebab names — the original
// rpg paths contain spaces AND parens ("Characters(100x100 split)") which break import.meta.glob's matcher.
//
// `frames` are the MEASURED content-frame counts (some sheet rows have trailing blank cells that must NOT be
// played — e.g. the Bat idle row is 4 of 6 cols). They are declared here, exactly like the per-animation
// `frames` in ANIMATIONS (characterAssets.js): this file is the single source of truth for enemy geometry.

const TINY = import.meta.glob('../assets/enemies/tiny/**/*.png', { eager: true, query: '?url', import: 'default' });
const SHEET = import.meta.glob('../assets/enemies/sheets/*.png', { eager: true, query: '?url', import: 'default' });

const tinyUrl = (enemy, anim) => TINY[`../assets/enemies/tiny/${enemy}/${anim}.png`];
const sheetUrl = (file) => SHEET[`../assets/enemies/sheets/${file}.png`];

export const TINY_FRAME = { w: 100, h: 100 };
export const SHEET_FRAME = { w: 64, h: 64 };

// Content region within a frame (measured union across all animations), used to CROP the preview so the
// small sprite fills the box instead of floating in empty pixels — same idea as the hero's CROP.
export const TINY_CROP = { x: 26, y: 28, w: 56, h: 44 };
export const SHEET_CROP = { x: 10, y: 14, w: 46, h: 50 };
export const cropFor = (format) => (format === 'tiny' ? TINY_CROP : SHEET_CROP);

// tinyRPG enemy: animations are separate files (each a single row → row 0). `anims` = [key, label, file, frames].
const tiny = (id, name, blurb, anims) => ({
    id, name, blurb, format: 'tiny', frame: TINY_FRAME, crop: TINY_CROP,
    animations: anims.map(([key, label, file, frames]) => ({ key, label, url: tinyUrl(id, file), row: 0, frames })),
});

// GandalfHardcore enemy: one sheet, animation = row index. `anims` = [key, label, row, frames].
// Row → name follows the pack's sheet order (idle first, then move/attack/death); labels are a sensible
// convention for a bestiary preview and can be renamed without touching the renderer.
const gandalf = (id, name, blurb, file, anims) => ({
    id, name, blurb, format: 'gandalf', frame: SHEET_FRAME, crop: SHEET_CROP, sheet: sheetUrl(file),
    animations: anims.map(([key, label, row, frames]) => ({ key, label, url: sheetUrl(file), row, frames })),
});

// Han: the "blob" (tinyRPG Blood Monster) first; all 4 tinyRPG enemies in full, plus a few of the new
// GandalfHardcore sheets. Blurbs are Dutch flavour text.
export const ENEMIES = [
    tiny('blob', 'Blob', 'Een gulzige rode blob. Traag, maar hij blijft komen — en hij deelt graag in je noten.', [
        ['idle', 'Idle', 'idle', 6], ['walk', 'Walk', 'walk', 8], ['attack', 'Attack', 'attack', 8],
        ['attack2', 'Attack 2', 'attack2', 8], ['hurt', 'Hurt', 'hurt', 4], ['death', 'Death', 'death', 4],
    ]),
    tiny('demon', 'Demon', 'Een gevleugelde demon uit de onderwereld. Snel en venijnig.', [
        ['idle', 'Idle', 'idle', 6], ['walk', 'Walk', 'walk', 8], ['attack', 'Attack', 'attack', 7],
        ['attack2', 'Attack 2', 'attack2', 7], ['hurt', 'Hurt', 'hurt', 4], ['death', 'Death', 'death', 4],
    ]),
    tiny('orc', 'Orc', 'Een norse orc-krijger. Log en sterk, en niet bang voor een zwaard.', [
        ['idle', 'Idle', 'idle', 6], ['walk', 'Walk', 'walk', 8], ['attack', 'Attack', 'attack', 6],
        ['attack2', 'Attack 2', 'attack2', 6], ['hurt', 'Hurt', 'hurt', 4], ['death', 'Death', 'death', 4],
    ]),
    tiny('soldier', 'Soldier', 'Een geharnaste soldaat. Gedisciplineerd, goed getraind — drie aanvalscombo’s.', [
        ['idle', 'Idle', 'idle', 6], ['walk', 'Walk', 'walk', 8], ['attack', 'Attack', 'attack', 6],
        ['attack2', 'Attack 2', 'attack2', 6], ['attack3', 'Attack 3', 'attack3', 9], ['hurt', 'Hurt', 'hurt', 4], ['death', 'Death', 'death', 4],
    ]),
    gandalf('bat', 'Bat', 'Een fladderende grotvleermuis. Klein, maar lastig te raken.', 'bat', [
        ['idle', 'Idle', 0, 4], ['move', 'Fly', 1, 6], ['attack', 'Attack', 2, 6],
    ]),
    gandalf('flying-eye', 'Flying Eye', 'Een zwevend oog dat je nooit uit het oog verliest.', 'flying-eye', [
        ['idle', 'Idle', 0, 5], ['move', 'Float', 1, 6],
    ]),
    gandalf('mushroom', 'Mushroom', 'Een chagrijnige paddenstoel die giftige sporen uitstoot.', 'mushroom', [
        ['idle', 'Idle', 0, 5], ['move', 'Move', 1, 5], ['attack', 'Attack', 2, 6], ['death', 'Death', 3, 5],
    ]),
    gandalf('rat', 'Rat', 'Een grote rioolrat. Snel op zijn pootjes.', 'rat', [
        ['idle', 'Idle', 0, 5], ['move', 'Move', 1, 8], ['attack', 'Attack', 2, 6], ['death', 'Death', 3, 5],
    ]),
];

export const enemyById = (id) => ENEMIES.find((e) => e.id === id);
