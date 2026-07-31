// #645 Character-creator asset model (v2, Han restructure). Parts are pixel-art sprite SHEETS globbed from
// src/assets/character/**. Body parts are 80x64 frames (sheet WIDTH varies — 800/720/400 — so the creator
// renders at NATIVE size and steps by 80px, never stretching, which fixes the ears drift). Pets are 32x32.
// Row 0 of each sheet is the idle animation (first IDLE frames have content).
//
// The old folders are re-grouped into Han's taxonomy via source+filter rules; colour/material variants
// (Blue Pants / Bronze Axe / Cape blue …) are split out for a base-item + variant setter. Gendered
// categories expose BOTH genders' items, each tagged with `g` + a `mismatch` flag, so the UI can show all
// and watermark the wrong-gender ones (Han's interchangeability test).

const FILES = import.meta.glob('../assets/character/**/*.png', { eager: true, query: '?url', import: 'default' });

export const BODY_FRAME = { w: 80, h: 64 };   // per-frame size for body sheets (sheet width varies)
export const PET_FRAME = { w: 32, h: 32 };
export const IDLE = 5;                          // content frames in row 0 (the rest animation)

// Each sheet ROW is an animation (measured content frames: 5/8/8/4/4/6/10). Names are the common tinyRPG
// order — the picker plays the selected row (Han: buttons for rest/walk/attack/death/…).
export const ANIMATIONS = [
    { key: 'rest', label: 'Rest', row: 0, frames: 5 },
    { key: 'walk', label: 'Walk', row: 1, frames: 8 },
    { key: 'run', label: 'Run', row: 2, frames: 8 },
    { key: 'attack', label: 'Attack', row: 3, frames: 4 },
    { key: 'attack2', label: 'Attack 2', row: 4, frames: 4 },
    { key: 'hurt', label: 'Hurt', row: 5, frames: 6 },
    { key: 'death', label: 'Death', row: 6, frames: 10 },
];

const RAW = (() => {
    const out = { male: {}, female: {}, shared: {} };
    for (const [path, url] of Object.entries(FILES)) {
        const m = path.match(/\/character\/(male|female|shared)\/([^/]+)\/(.+)\.png$/);
        if (!m) continue;
        (out[m[1]][m[2]] ||= []).push({ name: m[3], url });
    }
    return out;
})();

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
    { key: 'legs', label: 'Legs', z: 3, gendered: true, source: () => both('clothing', clothesFilter.legs) },
    { key: 'feet', label: 'Feet', z: 4, gendered: true, source: () => both('clothing', clothesFilter.feet) },
    { key: 'hands', label: 'Hands', z: 6, gendered: true, source: () => both('arms') },
    { key: 'back', label: 'Back', z: 1, gendered: false, source: () => shared((RAW.shared.back || []).filter((p) => has(p.name, 'cape', 'backpack'))) },
    { key: 'offhand', label: 'Off-hand', z: 1, gendered: true, source: () => bothFrom(RAW.shared.back, (p) => has(p.name, 'shield', 'lantern')) },
    { key: 'weapon', label: 'Weapon', z: 11, gendered: true, source: () => both('handitems', (p) => has(p.name, 'axe', 'sword', 'pickaxe', 'hoe', 'stick')) },
    { key: 'effect', label: 'Effect', z: 12, animated: true, gendered: false, source: () => shared(RAW.shared.effects) },
    { key: 'pet', label: 'Pet', z: 13, frame: PET_FRAME, animated: true, gendered: false, source: () => shared(RAW.shared.pet) },
];

// Skin lives in shared/skin but its files are gender-named — split into male/female by prefix.
RAW.male.__skin__ = (RAW.shared.skin || []).filter((p) => p.name.toLowerCase().startsWith('male'));
RAW.female.__skin__ = (RAW.shared.skin || []).filter((p) => p.name.toLowerCase().startsWith('female'));
// Off-hand (shields/lanterns) are gender-named inside shared/back.
function bothFrom(list, filter) {
    return (list || []).filter(filter).map((p) => ({ ...p, g: p.name.toLowerCase().startsWith('female') ? 'female' : 'male' }));
}

export const catByKey = (key) => CATEGORIES.find((c) => c.key === key);
export const frameOf = (key) => catByKey(key)?.frame || BODY_FRAME;

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
