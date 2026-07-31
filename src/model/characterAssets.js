// #645 Character-creator asset model (v2, Han restructure). Parts are pixel-art sprite SHEETS globbed from
// src/assets/character/**. Body parts are 80x64 frames (sheet WIDTH varies — 800/720/400 — so the creator
// renders at NATIVE size and steps by 80px, never stretching, which fixes the ears drift). Pets are 32x32.
// Row 0 of each sheet is the idle animation (first few frames have content).
//
// The old folders are re-grouped into Han's taxonomy via source+filter rules, and colour/material variants
// (Blue Pants / Bronze Axe / Cape blue …) are split out so the UI can offer a base item + a variant setter.

const FILES = import.meta.glob('../assets/character/**/*.png', { eager: true, query: '?url', import: 'default' });

export const BODY_FRAME = { w: 80, h: 64 };   // per-frame size for body sheets (sheet width varies)
export const PET_FRAME = { w: 32, h: 32 };
export const IDLE = 5;                          // content frames in row 0

// { gender: { folder: [{name,url}] } } from the reorganised tree.
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

// "Blue Pants" -> {base:'Pants', variant:'Blue'}; "Shirt v2" -> {base:'Shirt v2', variant:null};
// "orange Shirt v2" -> {base:'Shirt v2', variant:'Orange'}; "Bronze Axe" -> {base:'Axe', variant:'Bronze'}.
function parseVariant(name) {
    const tokens = name.split(/\s+/);
    const i = tokens.findIndex((t) => VARIANT_WORDS.has(t.toLowerCase()));
    if (i === -1) return { base: name, variant: null };
    const variant = cap(tokens[i].toLowerCase());
    const base = tokens.filter((_, j) => j !== i).join(' ').trim() || name;
    return { base, variant };
}

const has = (name, ...words) => words.some((w) => name.toLowerCase().includes(w));

// The taxonomy (Han). `z` = paint order (low = behind). `source(gender)` returns the raw parts for this
// category (already folder-mapped + filtered). `frame` defaults to BODY_FRAME. `required` blocks a None.
export const CATEGORIES = [
    { key: 'pet', label: 'Pet', z: 0, frame: PET_FRAME, animated: true, source: () => RAW.shared.pet || [] },
    { key: 'back', label: 'Back', z: 1, source: () => (RAW.shared.back || []).filter((p) => has(p.name, 'cape', 'backpack')) },
    { key: 'skin', label: 'Skin', z: 2, required: true, source: (g) => (RAW.shared.skin || []).filter((p) => p.name.toLowerCase().startsWith(g)) },
    { key: 'legs', label: 'Legs', z: 3, source: () => byGenderNeutralClothes('legs') },
    { key: 'chest', label: 'Chest', z: 4, source: () => byGenderNeutralClothes('chest') },
    { key: 'feet', label: 'Feet', z: 5, source: () => byGenderNeutralClothes('feet') },
    { key: 'hands', label: 'Hands', z: 6, source: (g) => RAW[g].arms || [] },
    { key: 'ears', label: 'Ears', z: 7, source: (g) => RAW[g].ears || [] },
    { key: 'hair', label: 'Hair', z: 8, source: (g) => RAW[g].hair || [] },
    { key: 'head', label: 'Head', z: 9, source: (g) => [...(RAW[g].hats || []), ...(RAW.shared.masks || [])] },
    { key: 'offhand', label: 'Off-hand', z: 10, source: (g) => (RAW.shared.back || []).filter((p) => has(p.name, 'shield', 'lantern') && p.name.toLowerCase().startsWith(g)) },
    { key: 'weapon', label: 'Weapon', z: 11, source: (g) => (RAW[g].handitems || []).filter((p) => has(p.name, 'axe', 'sword', 'pickaxe', 'hoe', 'stick')) },
    { key: 'effect', label: 'Effect', z: 12, animated: true, source: () => RAW.shared.effects || [] },
];

// Clothing splits by name into legs / chest / feet (Han). Clothing lives per-gender; merge both so a plain
// item isn't gender-locked (they share the 80x64 body rig).
function byGenderNeutralClothes(kind) {
    const all = [...(RAW.male.clothing || []), ...(RAW.female.clothing || [])];
    const seen = new Set();
    const uniq = all.filter((p) => (seen.has(p.name) ? false : seen.add(p.name)));
    if (kind === 'feet') return uniq.filter((p) => has(p.name, 'boot', 'shoe'));
    if (kind === 'chest') return uniq.filter((p) => has(p.name, 'shirt', 'chainmail'));
    // legs: pants / underwear / hose / trunks (everything not chest/feet)
    return uniq.filter((p) => has(p.name, 'pants', 'underwear', 'hose', 'trunk'));
}

export const catByKey = (key) => CATEGORIES.find((c) => c.key === key);

// The BASE items for a category+gender, each with its colour/material variants. A base whose only variant
// is null is a plain item; a base with real variants gets a variant setter in the UI.
export function basesFor(category, gender) {
    const parts = (catByKey(category)?.source(gender) || []);
    const byBase = new Map();
    for (const p of parts) {
        const { base, variant } = parseVariant(p.name);
        (byBase.get(base) || byBase.set(base, []).get(base)).push({ variant, name: p.name, url: p.url });
    }
    return [...byBase.entries()]
        .map(([base, variants]) => ({ base, variants: variants.sort((a, b) => (a.variant || '').localeCompare(b.variant || '')) }))
        .sort((a, b) => a.base.localeCompare(b.base));
}

// Resolve a stored part NAME back to its url within a category+gender (graceful if it moved/renamed).
export function urlOf(category, gender, name) {
    if (!name) return null;
    return (catByKey(category)?.source(gender) || []).find((p) => p.name === name)?.url || null;
}
