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

// #671 (Han 2026-08-03: "lamia: ik mis de bare variant") — same 512×256 layout as the main lamia sheet (a
// same-dimensions skin swap), copied to the same clean-kebab-name convention as every other curated file.
// Exposed here (not baked into `enemy()`, which only supports one sheet) — useBestiaryEditor.js special-
// cases lamia into a 2-variant creature the same way it already does for slime's 3 SLIME_COLORS.
export const LAMIA_BARE_URL = sheetUrl('lamia-bare');

// enemy(id, name, blurb, file, F, crop, anims) — F = square frame size; anims = [key, label, row, frames].
// Row → name follows the pack's sheet order (idle first, then move/attack/death); labels are a bestiary
// convention and can be renamed without touching the renderer.
const enemy = (id, name, blurb, file, F, crop, anims, category) => ({
    id, name, blurb, sheet: sheetUrl(file), frame: { w: F, h: F }, crop, category,
    animations: anims.map(([key, label, row, frames]) => ({ key, label, url: sheetUrl(file), row, frames })),
});

// Han's expected roster, all GandalfHardcore. Blurbs are Dutch flavour text.
// #668 (Han 2026-08-03): `category` tags each entry with the SAME 6-way taxonomy (characters/humanoid/
// animal/air/ground/other) the new scanned bestiary uses — derived from which src/assets/ASSORTED/
// characters/ subfolder each sprite originally came from (creature_humanoid/creatures_air/creatures_ground/
// creatures_other), so the bottom-view category selector filters BOTH the curated and scanned creatures
// together, seamlessly, with no gameplay-facing fields (sheet/frame/crop/animations) touched.
export const ENEMIES = [
    enemy('lamia', 'Lamia', 'Een slangvrouw die je met haar blik verlamt.', 'lamia', 64, { x: 0, y: 9, w: 64, h: 55 }, [
        ['idle', 'Idle', 0, 5], ['move', 'Move', 1, 8], ['attack', 'Attack', 2, 6], ['death', 'Death', 3, 6],
    ], 'humanoid'),
    // #670 (Han 2026-08-03: "bat: fly, attack, death") — relabelled from idle/Fly/Attack; no gameplay code
    // reads these keys (grep-verified), so this is a display-only correction.
    enemy('bat', 'Bat', 'Een fladderende grotvleermuis. Klein, maar lastig te raken.', 'bat', 64, { x: 16, y: 17, w: 38, h: 33 }, [
        ['fly', 'Fly', 0, 4], ['attack', 'Attack', 1, 6], ['death', 'Death', 2, 6],
    ], 'air'),
    // #670 (Han: "flying eye, ...: fly, death")
    enemy('flying-eye', 'Flying Eye', 'Een zwevend oog dat je nooit uit het oog verliest.', 'flying-eye', 64, { x: 13, y: 15, w: 39, h: 34 }, [
        ['fly', 'Fly', 0, 5], ['death', 'Death', 1, 6],
    ], 'air'),
    // #672 (Han: "flying witch: idle, attack, move") — relabelled from idle/Fly/Attack (row1↔row2 swap).
    enemy('flying-witch', 'Flying Witch', 'Een heks op haar bezem, klaar om te vervloeken.', 'flying-witch', 64, { x: 0, y: 1, w: 46, h: 63 }, [
        ['idle', 'Idle', 0, 5], ['attack', 'Attack', 1, 8], ['move', 'Move', 2, 7],
    ], 'other'),
    // #672 (Han: "mimic: idle, move, attack, death") — already matches (Closed/Open/Attack/Death keys are
    // already idle/move/attack/death); left unchanged, only confirming.
    enemy('mimic', 'Mimic', 'Een kist die eruitziet als buit — tot hij toehapt.', 'mimic', 64, { x: 10, y: 33, w: 41, h: 31 }, [
        ['idle', 'Closed', 0, 1], ['move', 'Open', 1, 8], ['attack', 'Attack', 2, 6], ['death', 'Death', 3, 7],
    ], 'ground'),
    // #670 (Han: "moquito: fly, death")
    enemy('mosquito', 'Mosquito', 'Een bloeddorstige reuzenmug. Zoemt vervelend om je heen.', 'mosquito', 64, { x: 15, y: 22, w: 35, h: 30 }, [
        ['fly', 'Fly', 0, 4], ['death', 'Death', 1, 6],
    ], 'air'),
    enemy('plant', 'Plant', 'Een vleesetende plant met een flinke beet.', 'plant', 64, { x: 10, y: 31, w: 39, h: 33 }, [
        ['idle', 'Idle', 0, 5], ['move', 'Move', 1, 8], ['attack', 'Attack', 2, 6], ['death', 'Death', 3, 5],
    ], 'ground'),
    // #670 (Han: "pumpkin: idle, attack, death") — relabelled from idle/Move/Attack.
    enemy('pumpkin', 'Pumpkin', 'Een grijnzende pompoenkop. Hobbelt griezelig dichterbij.', 'pumpkin', 64, { x: 3, y: 29, w: 61, h: 35 }, [
        ['idle', 'Idle', 0, 10], ['attack', 'Attack', 1, 9], ['death', 'Death', 2, 6],
    ], 'ground'),
    enemy('rat', 'Rat', 'Een grote rioolrat. Snel op zijn pootjes.', 'rat', 64, { x: 10, y: 47, w: 48, h: 17 }, [
        ['idle', 'Idle', 0, 5], ['move', 'Move', 1, 8], ['attack', 'Attack', 2, 6], ['death', 'Death', 3, 5],
    ], 'ground'),
    enemy('mushroom', 'Mushroom', 'Een chagrijnige paddenstoel die giftige sporen uitstoot.', 'mushroom', 64, { x: 13, y: 35, w: 37, h: 29 }, [
        ['idle', 'Idle', 0, 5], ['move', 'Move', 1, 5], ['attack', 'Attack', 2, 6], ['death', 'Death', 3, 5],
    ], 'ground'),
    enemy('slime', 'Slime', 'Een glibberige slijmbal. Komt in groen, blauw en rood.', 'slime-green', 32, { x: 0, y: 3, w: 30, h: 29 }, [
        ['idle', 'Idle', 0, 5], ['move', 'Move', 1, 8], ['death', 'Death', 2, 5],
    ], 'ground'),
];

export const enemyById = (id) => ENEMIES.find((e) => e.id === id);

// #647 slime colours by note duration (Han): green = quarter, blue = eighth, red = half/whole. The overlay
// uses these directly (the bestiary shows the green representative). Same 32×32 / row layout as the slime.
export const SLIME_FRAME = { w: 32, h: 32 };
export const SLIME_CROP = { x: 0, y: 3, w: 30, h: 29 };
export const SLIME_IDLE = { row: 0, frames: 5 };
export const SLIME_WALK = { row: 1, frames: 8 };    // #660 Level 2: walk animation (used for the fly-in hop)
export const SLIME_DEATH = { row: 2, frames: 5 };   // #647 combat: slime death animation (plays once)
// #RAM-level (Han 2026-08-11, moved here from SheetRpgLayer.jsx's own local copy — §6d, one source of
// truth): the sheet's REAL grid — 8 columns (matching SLIME_WALK's 8 frames, the widest row) × 3 rows
// (idle/walk/death). NOT the same as any single row's own frame count (e.g. SLIME_IDLE.frames=5) — a
// renderer that sizes its `backgroundSize`/SVG `<image>` off a single row's frame count instead of the
// sheet's actual column count gets a squashed/misaligned crop (the bug behind a previous "choppy slime"
// report — RpgLevelPanel.jsx's decorative `WorldSlime` had done exactly that before this fix).
export const SLIME_COLS = 8, SLIME_ROWS = 3;
export const SLIME_COLORS = {
    green: sheetUrl('slime-green'),
    blue: sheetUrl('slime-blue'),
    red: sheetUrl('slime-red'),
};

// #679 (Han 2026-08-03, Level 9: "zet rechts de wizard tegenover de avatar. ipv slimes, gebruik cast 2. De
// wizard schiet dan projectile blue... deze bewegen wél lineair naar voren"): the Wizard/projectile enemy
// for Level 9, mirroring the SLIME_* shape above 1:1 so SheetRpgLayer's Level-9 branch reads the same
// {url,frame,crop,animations} pattern as every slime does. Black Wizard chosen per Han's interview answer;
// same 6-col×11-row cross-row-stitched sheet the bestiary's `wizardPortraitAnimations()` already maps
// (scripts/generate-bestiary-manifest.mjs) — cells copied verbatim from there (single source of truth for
// this sheet's row/col layout; do not hand-recompute, see §6c).
export const WIZARD_URL = sheetUrl('wizard-black');
// Level 11 (Han 2026-08-06, "de sprites van de wizards zijn herkleurde sprites; in de bestiary/portraits
// staan al kleurvarianten van de wizard (zwart en groen), gebruik die"): a REAL pre-drawn colour variant
// (copied from "Green Wizard sheet.png", byte-identical 384×704 sheet dimensions to wizard-black.png, so
// the SAME WIZARD_FRAME/COLS/ROWS/CROP below apply verbatim) — replaces the earlier CSS `hue-rotate`
// filter approximation now that a real asset exists (§6d: use the canonical art, don't fake it).
export const WIZARD_GREEN_URL = sheetUrl('wizard-green');
export const WIZARD_FRAME = { w: 64, h: 64 };
export const WIZARD_COLS = 6, WIZARD_ROWS = 11;
// crop measured via pngjs union bbox over idle + cast2 cells (same technique as the bestiary generator's
// cropForCells) so the idle↔cast2 switch never jitters/reflows within a tighter per-animation crop.
export const WIZARD_CROP = { x: 16, y: 12, w: 47, h: 52 };
// #679: idle = row0 cols0-4 (5 frames).
export const WIZARD_IDLE_CELLS = [0, 1, 2, 3, 4].map((col) => ({ row: 0, col }));
// #790 (Han 2026-08-09, "the wizard has hardcoded, time-tuned animations. Solution to keep single source
// of truth: add these animations to the bestiary too"): the song-timed attack (single/double/triple note
// runs, Han's exact frame spec — §693 round 3) used to be hardcoded HERE as `WIZARD_ATTACK_SINGLE/DOUBLE/
// TRIPLE`. It now lives in the bestiary manifest as `song_attack_single/double/triple` on the Wizard
// (Portrait)/Black creature (`scripts/generate-bestiary-manifest.mjs`'s `wizardPortraitAnimations()`) —
// SheetRpgLayer.jsx reads it from there via `findCreatureByName`/`findAnim` (bestiaryAssets.js) instead of
// a second hand-copied frame list (§6c).

// #679 projectile ("Projectile sheet blue.png", measured via pngjs: 288×96 = 6 cols × 6 rows @ 48×16) — a
// continuously-cycling 36-frame loop (Han: "een lange loop") that plays throughout the projectile's LINEAR
// flight (unlike the slime's hop-and-pause walk cycle — §6 invariant: this is a genuinely different motion
// type, not a slime reskin).
export const PROJECTILE_URL = sheetUrl('projectile-blue');
export const PROJECTILE_FRAME = { w: 48, h: 16 };
// crop measured via pngjs content-scan (same technique as the bestiary generator): every frame's content
// sits at relative y 4-11 (h=8); x varies per frame (a spinning/pulsing shape) so the crop keeps the full
// frame width.
export const PROJECTILE_CROP = { x: 0, y: 4, w: 48, h: 8 };
export const PROJECTILE_COLS = 6, PROJECTILE_ROWS = 6;
export const PROJECTILE_LOOP_FRAMES = PROJECTILE_COLS * PROJECTILE_ROWS;   // 36

// #679 projectile death ("GandalfHardcore Static Projectiles5.png", measured: 160×192 = 5 cols × 6 rows @
// 32×32) — Han: "de eerste 5 frames van static projectiles 5 met een fade out (elk frame -20% opacity) (en
// stop met voortbewegen, net als de slimes)" — the first 5 frames are exactly row 0's 5 columns; frozen in
// place (no more forward motion) while stepping through them, opacity 100/80/60/40/20% per frame.
export const PROJECTILE_DEATH_URL = sheetUrl('static-projectiles-5');
export const PROJECTILE_DEATH_FRAME = { w: 32, h: 32 };
export const PROJECTILE_DEATH_COLS = 5, PROJECTILE_DEATH_ROWS = 6;
// crop measured via pngjs (row0 content spans relative x 5-26, y 5-27); +1px margin.
export const PROJECTILE_DEATH_CROP = { x: 4, y: 4, w: 24, h: 24 };
export const PROJECTILE_DEATH = { row: 0, frames: 5 };
export const PROJECTILE_DEATH_OPACITY = [1, 0.8, 0.6, 0.4, 0.2];   // Han: "-20% opacity" per frame

// #825 (Han 2026-08-10, "hit" animation on the strike line) — "GandalfHardcore 64x64 Projectiles4.png",
// a 320×384 = 5 cols × 6 rows @ 64×64 sheet of blue impact-burst variants (measured directly, same
// pack/frame-padding convention as static-projectiles-5/2 above — 5×6 grids are this pack's norm).
// Frames are read flat (row-major, 0..29) — Han: a RANDOM run of 7 CONSECUTIVE frames each time the
// animation plays (not a fixed sequence), so no two hits look identical.
export const HIT_BURST_URL = sheetUrl('hit-burst-4');
export const HIT_BURST_FRAME = { w: 64, h: 64 };
export const HIT_BURST_COLS = 5, HIT_BURST_ROWS = 6;
export const HIT_BURST_TOTAL_FRAMES = HIT_BURST_COLS * HIT_BURST_ROWS;   // 30
// crop measured (union bbox over all 30 cells): content spans relative x 14-50, y 16-48.
export const HIT_BURST_CROP = { x: 14, y: 16, w: 36, h: 32 };
// Han's exact envelope: fade in over 2 frames, hold 3 at full opacity, fade out over 2 — 7 frames total.
export const HIT_BURST_OPACITY = [0.33, 0.66, 1, 1, 1, 0.66, 0.33];

// Level 11 (Han 2026-08-06, "ik wil 2 maten voor elke switch een staticprojeciles2 (32x32) laten
// toveren door de tovenaar"): "GandalfHardcore Static Projectiles2.png", measured via the SAME
// technique as static-projectiles-5 above: 160×192 = 5 cols × 6 rows @ 32×32 — byte-identical sheet
// dimensions to static-projectiles-5 (same asset pack/frame-padding convention), so the crop reuses
// that measurement rather than guessing a new one blind.
export const STATIC_PROJECTILE2_URL = sheetUrl('static-projectiles-2');
export const STATIC_PROJECTILE2_FRAME = { w: 32, h: 32 };
export const STATIC_PROJECTILE2_COLS = 5, STATIC_PROJECTILE2_ROWS = 6;
export const STATIC_PROJECTILE2_CROP = { x: 4, y: 4, w: 24, h: 24 };
export const STATIC_PROJECTILE2_LOOP_FRAMES = 5;   // row 0's 5 columns, looped (not a death fade-out)
