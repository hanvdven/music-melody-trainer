// #645 Character-creator asset model (v2, Han restructure). Parts are pixel-art sprite SHEETS globbed from
// src/assets/character/**. Body parts are 80x64 frames (sheet WIDTH varies — 800/720/400 — so the creator
// renders at NATIVE size and steps by 80px, never stretching, which fixes the ears drift). Pets are 32x32.
// Row 0 of each sheet is the idle animation (first IDLE frames have content).
//
// #664 (Han 2026-08-03, "re-point the rpg assets to the ASSORTED folder"): the source moved to
// src/assets/ASSORTED — a richer, differently-organised asset dump (all the old files are duplicated
// there, plus many more). The taxonomy below (CATEGORIES/basesFor/etc.) is UNCHANGED; only how the raw
// files are discovered and bucketed changed, since ASSORTED's folder names are inconsistent in ways the
// old `character/{gender}/{folder}` regex can't express:
//   - bonus packs sit in differently-prefixed sibling folders for the SAME category ("Female Hair" AND
//     "30x Female Hair" AND — for clothing — "GandalfHardcore 43x Female Clothing"), so categorisation
//     below matches on a KEYWORD anywhere in the subfolder name, not an exact folder name.
//   - the "head" folder is literally named "Head" for male, "Hat" for female — same category, different
//     names — so both keywords map to the same bucket.
//   - "arms" is capitalised "Female Arms" for female but lowercase "arms" for male — keyword match is
//     case-insensitive so this doesn't matter.
//   - male's masks/face-items (Mask/Plague Mask/Bandit Scarf) live INSIDE the "Male Head" folder, while
//     female's equivalents (Mask/Plague Mask/Blindfold/Blue Face paint) are LOOSE files at the female
//     root — both are routed to the SAME shared `masks` bucket (Han's existing "shared head items, works
//     for both genders" rule), regardless of which of the two places they were found in.
//   - skins, shields/lanterns, and capes/backpacks are LOOSE files directly under each gender's root
//     folder (no subfolder) — categorised by a NAME keyword instead of a folder keyword.
//   - a couple of non-item files (a "DONT FORGET TO RATE" attribution image, pet accessory extras the
//     renderer doesn't understand yet) are explicitly excluded so they can never appear as pickable items.
const CHAR_FILES = import.meta.glob('../assets/ASSORTED/characters/char_hero/**/*.png', { eager: true, query: '?url', import: 'default' });
const EFFECT_FILES = import.meta.glob('../assets/ASSORTED/fx/character effects/*.png', { eager: true, query: '?url', import: 'default' });
const PET_FILES = import.meta.glob('../assets/ASSORTED/characters/animals/pets/GandalfHardcore Pet companion/*.png', { eager: true, query: '?url', import: 'default' });

// #648 CR (Han): purpose-built 16×16 item icons (from src/assets/rpg/16x16, curated + renamed per category)
// used as the equipment slot's TYPE glyph behind the equipped sprite — they fit the square slots far better
// than a cropped body-part. Only categories with a fitting icon are here; the rest (hair/ears/back/effect/
// pet/skin) have no match and keep their sprite preview (Han's fallback rule). Filename = category key.
const ICONS = import.meta.glob('../assets/character-icons/*.png', { eager: true, query: '?url', import: 'default' });
export const CATEGORY_ICON = Object.fromEntries(
    Object.entries(ICONS).map(([p, url]) => [p.match(/([^/]+)\.png$/)[1], url]),
);

export const BODY_FRAME = { w: 80, h: 64 };   // per-frame size for body sheets (sheet width varies)
export const PET_FRAME = { w: 32, h: 32 };
export const IDLE = 5;                          // content frames in row 0 (the rest animation)

// Each sheet ROW is an animation (measured content frames: 5/8/8/4/4/6/10). Names are the common tinyRPG
// order — the picker plays the selected row (Han: buttons for rest/walk/attack/death/…).
export const ANIMATIONS = [
    { key: 'rest', label: 'Rest', row: 0, frames: 5 },
    { key: 'walk', label: 'Walk', row: 1, frames: 8 },
    { key: 'run', label: 'Run', row: 2, frames: 8 },
    { key: 'airup', label: 'Air Up', row: 3, frames: 4 },     // Han relabel (was Attack)
    { key: 'airdown', label: 'Air Down', row: 4, frames: 4 }, // Han relabel (was Attack 2)
    { key: 'attack', label: 'Attack', row: 5, frames: 6 },    // Han relabel (was Hurt)
    { key: 'death', label: 'Death', row: 6, frames: 10 },
];

// Attribution/junk images that sit alongside real assets in the ASSORTED dump — never a pickable item.
const JUNK_NAME = /dont forget|read ?me/i;
// Pet accessory extras (backpack/hat overlays, an "outline" variant) the pet renderer doesn't understand
// (it expects the exact old idle/run row layout) — excluded until pet rendering is extended for them.
const PET_EXCLUDE = /backpack|hat|outline/i;

// Classify one char_hero file (path RELATIVE to char_hero/, e.g. "Hero Male/Male Hair/Male Hair1.png" or
// "Hero Female/Female Mask.png") into { bucket, gender, name }, or null to exclude it entirely.
function categorizeCharFile(relPath) {
    const parts = relPath.split('/');
    const genderRoot = parts[0];   // "Hero Male" | "Hero Female" | "Hero Unisex"
    const gender = genderRoot === 'Hero Male' ? 'male' : genderRoot === 'Hero Female' ? 'female' : 'shared';
    const rest = parts.slice(1);   // [subfolder, file] or just [file] for a loose root file
    const file = rest[rest.length - 1];
    const name = file.replace(/\.png$/i, '');
    if (JUNK_NAME.test(name)) return null;
    const sub = rest.length > 1 ? rest[0].toLowerCase() : null;
    const lname = name.toLowerCase();

    let bucket = null;
    let forceShared = false;
    if (sub) {
        if (sub.includes('hair')) bucket = 'hair';
        else if (sub.includes('ear')) bucket = 'ears';
        else if (sub.includes('cloth')) bucket = 'clothing';
        else if (sub.includes('hand')) bucket = 'handitems';
        else if (sub.includes('arm')) bucket = 'arms';
        else if (sub.includes('hat') || sub.includes('head')) {
            if (/mask|blindfold|plague|scarf|paint/.test(lname)) { bucket = 'masks'; forceShared = true; }
            else bucket = 'hats';
        }
    } else {
        // Loose file directly under the gender root.
        if (lname.includes('skin')) bucket = '__skin__';
        else if (/mask|blindfold|plague|paint/.test(lname)) { bucket = 'masks'; forceShared = true; }
        else if (/shield|lantern/.test(lname)) bucket = 'offhand';
        else if (/cape|backpack/.test(lname)) { bucket = 'back'; forceShared = true; }
        // Anything else unrecognised (e.g. a bound/"tied up" pose) is simply not an equipment item.
    }
    if (!bucket) return null;
    return { bucket, gender: forceShared ? 'shared' : gender, name };
}

const RAW = { male: {}, female: {}, shared: {} };
for (const [path, url] of Object.entries(CHAR_FILES)) {
    const m = path.match(/\/ASSORTED\/characters\/char_hero\/(.+)$/);
    if (!m) continue;
    const parsed = categorizeCharFile(m[1]);
    if (!parsed) continue;
    (RAW[parsed.gender][parsed.bucket] ||= []).push({ name: parsed.name, url });
}
for (const [path, url] of Object.entries(EFFECT_FILES)) {
    const name = path.match(/([^/]+)\.png$/)[1];
    if (JUNK_NAME.test(name)) continue;
    (RAW.shared.effects ||= []).push({ name, url });
}
for (const [path, url] of Object.entries(PET_FILES)) {
    const name = path.match(/([^/]+)\.png$/)[1];
    if (JUNK_NAME.test(name) || PET_EXCLUDE.test(name)) continue;
    (RAW.shared.pet ||= []).push({ name, url });
}

const COLORS = ['blue', 'green', 'orange', 'purple', 'red', 'skyblue', 'yellow', 'black', 'white', 'brown', 'pink', 'cyan', 'grey', 'gray'];
const MATERIALS = ['bronze', 'diamond', 'golden', 'gold', 'iron', 'wooden', 'wood', 'steel', 'stone', 'silver'];
const VARIANT_WORDS = new Set([...COLORS, ...MATERIALS]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const has = (name, ...words) => words.some((w) => name.toLowerCase().includes(w));

function parseVariant(name) {
    const tokens = name.split(/\s+/);
    const i = tokens.findIndex((t) => VARIANT_WORDS.has(t.toLowerCase()));
    if (i === -1) return { base: name, variant: null };
    return { base: tokens.filter((_, j) => j !== i).join(' ').trim() || name, variant: cap(tokens[i].toLowerCase()) };
}

// Clothing splits by name into legs / chest / feet — kept per-GENDER (Han: male & female clothes must be
// separate; a female body must not get male legs). `both` tags each with its source gender.
// Cover BOTH the male vocabulary (shirt/pants/…) and the female vocabulary (bodice/corset/dress/skirt/
// bikini/panties/socks/thigh-high) — otherwise a whole gender's clothing silently vanishes (Han bug).
const clothesFilter = {
    feet: (p) => has(p.name, 'boot', 'shoe', 'sock', 'thigh'),
    chest: (p) => has(p.name, 'shirt', 'chainmail', 'bodice', 'corset', 'dress', 'bra', 'bikini'),
    legs: (p) => has(p.name, 'pants', 'underwear', 'hose', 'trunk', 'skirt', 'panties'),
};

// Colour/material variant → a representative swatch colour for the chips (Han: show a colour, not text).
const COLOR_HEX = {
    blue: '#4a80e0', green: '#4caf50', orange: '#ff9800', purple: '#9c27b0', red: '#e53935', skyblue: '#4fc3f7',
    yellow: '#fdd835', black: '#2b2b2b', white: '#eeeeee', brown: '#8a5a3b', pink: '#ec8fb5', cyan: '#26c6da',
    grey: '#9e9e9e', gray: '#9e9e9e', bronze: '#cd7f32', diamond: '#7fe3d8', golden: '#e6c200', gold: '#e6c200',
    iron: '#9aa0a6', wooden: '#a5794a', wood: '#a5794a', steel: '#b0bec5', stone: '#8d9499', silver: '#c0c0c0',
};
export const variantColor = (v) => (v ? COLOR_HEX[v.toLowerCase()] || null : null);

// A gendered source returns BOTH genders, each item tagged with its source gender `g`.
const both = (folder, filter = () => true) => [
    ...(RAW.male[folder] || []).filter(filter).map((p) => ({ ...p, g: 'male' })),
    ...(RAW.female[folder] || []).filter(filter).map((p) => ({ ...p, g: 'female' })),
];
const shared = (list) => (list || []).map((p) => ({ ...p, g: 'shared' }));

// Taxonomy (Han). ARRAY order = the TAB order (skin/hair/ears/head/clothes/…/weapon/off-hand/effect/pet);
// `z` = paint order (low = behind). Clothing is now GENDERED. gendered categories get the M/F watermark.
export const CATEGORIES = [
    { key: 'skin', label: 'Skin', z: 2, required: true, gendered: true, source: () => both('__skin__') },
    { key: 'hair', label: 'Hair', z: 8, gendered: true, source: () => both('hair') },
    { key: 'ears', label: 'Ears', z: 7, gendered: true, source: () => both('ears') },
    { key: 'head', label: 'Head', z: 9, gendered: true, source: () => [...both('hats'), ...shared(RAW.shared.masks)] },
    { key: 'chest', label: 'Chest', z: 5, gendered: true, source: () => both('clothing', clothesFilter.chest) },
    { key: 'legs', label: 'Legs', z: 3, gendered: true, required: true, source: () => both('clothing', clothesFilter.legs) },
    { key: 'feet', label: 'Feet', z: 4, gendered: true, source: () => both('clothing', clothesFilter.feet) },
    { key: 'hands', label: 'Hands', z: 6, gendered: true, source: () => both('arms') },
    { key: 'back', label: 'Back', z: 1, gendered: false, source: () => shared(RAW.shared.back) },
    { key: 'offhand', label: 'Off-hand', z: 1, gendered: true, source: () => both('offhand') },
    { key: 'weapon', label: 'Weapon', z: 11, gendered: true, source: () => both('handitems', (p) => has(p.name, 'axe', 'sword', 'pickaxe', 'hoe', 'stick')) },
    { key: 'effect', label: 'Effect', z: 12, animated: true, gendered: false, source: () => shared(RAW.shared.effects) },
    { key: 'pet', label: 'Pet', z: 13, frame: PET_FRAME, animated: true, gendered: false, source: () => shared(RAW.shared.pet) },
];

export const catByKey = (key) => CATEGORIES.find((c) => c.key === key);
export const frameOf = (key) => catByKey(key)?.frame || BODY_FRAME;

// Han: force the ears to the SKIN's tone — "Elven Ears{N}" matches "…Skin{N}". Returns the matching ear
// layer for the given gender (or null for special skins / no numbered skin).
export function earForSkin(gender, skinName) {
    const m = /skin\s*(\d)/i.exec(skinName || '');
    if (!m) return null;
    const ear = both('ears').find((p) => p.g === gender && p.name.replace(/\s+/g, '').toLowerCase().includes(`ears${m[1]}`));
    return ear ? { g: gender, name: ear.name } : null;
}

// Bases for a category — only the CURRENT gender (+ shared). Han removed the gender-swapped watermark items
// after the interchangeability test. Each base: { id, base, g, variants:[{variant,name,url,g}] }.
export function basesFor(category, gender) {
    const cat = catByKey(category);
    if (!cat) return [];
    const parts = cat.source().filter((p) => (p.g || 'shared') === 'shared' || p.g === gender);
    const map = new Map();
    for (const p of parts) {
        const { base, variant } = parseVariant(p.name);
        const g = p.g || 'shared';
        const id = `${g}::${base}`;
        if (!map.has(id)) map.set(id, { id, base, g, variants: [] });
        map.get(id).variants.push({ variant, name: p.name, url: p.url, g });
    }
    return [...map.values()]
        .map((b) => ({ ...b, variants: b.variants.sort((a, c) => (a.variant || '').localeCompare(c.variant || '')) }))
        .sort((a, b) => a.base.localeCompare(b.base));
}

// Resolve a stored layer { g, name } → its url within a category (graceful if it moved/renamed).
export function urlOfLayer(category, layer) {
    if (!layer?.name) return null;
    return (catByKey(category)?.source() || []).find((p) => p.name === layer.name && (p.g || 'shared') === (layer.g || 'shared'))?.url || null;
}

// On a gender swap, find the equivalent item in the new gender so the outfit stays the same (Han): first an
// exact same-name match, else the same base+variant. Returns { g, name } or null (caller keeps the old).
export function counterpart(category, layer, newGender) {
    if (!layer?.name) return null;
    const parts = catByKey(category)?.source() || [];
    const exact = parts.find((p) => p.name === layer.name && (p.g || 'shared') === newGender);
    if (exact) return { g: newGender, name: exact.name };
    const { base, variant } = parseVariant(layer.name);
    const same = parts.find((p) => (p.g || 'shared') === newGender && (() => { const pv = parseVariant(p.name); return pv.base === base && pv.variant === variant; })());
    return same ? { g: newGender, name: same.name } : null;
}
