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
export const IDLE = 5;                          // content frames in row 0

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

// Clothing splits by name into legs / chest / feet. Merge both genders' clothing (they share the 80x64 rig
// and are mostly gender-neutral tops/bottoms); dedupe by name.
function clothes(kind) {
    const seen = new Set();
    const all = [...(RAW.male.clothing || []), ...(RAW.female.clothing || [])].filter((p) => (seen.has(p.name) ? false : seen.add(p.name)));
    if (kind === 'feet') return all.filter((p) => has(p.name, 'boot', 'shoe'));
    if (kind === 'chest') return all.filter((p) => has(p.name, 'shirt', 'chainmail'));
    return all.filter((p) => has(p.name, 'pants', 'underwear', 'hose', 'trunk'));   // legs
}

// A gendered source returns BOTH genders, each item tagged with its source gender `g`.
const both = (folder, filter = () => true) => [
    ...(RAW.male[folder] || []).filter(filter).map((p) => ({ ...p, g: 'male' })),
    ...(RAW.female[folder] || []).filter(filter).map((p) => ({ ...p, g: 'female' })),
];
const shared = (list) => (list || []).map((p) => ({ ...p, g: 'shared' }));

// Taxonomy (Han). z = paint order (low = behind). gendered categories get the M/F watermark test.
export const CATEGORIES = [
    { key: 'pet', label: 'Pet', z: 0, frame: PET_FRAME, animated: true, gendered: false, source: () => shared(RAW.shared.pet) },
    { key: 'back', label: 'Back', z: 1, gendered: false, source: () => shared((RAW.shared.back || []).filter((p) => has(p.name, 'cape', 'backpack'))) },
    { key: 'skin', label: 'Skin', z: 2, required: true, gendered: true, source: () => both('__skin__') },
    { key: 'legs', label: 'Legs', z: 3, gendered: false, source: () => shared(clothes('legs')) },
    { key: 'chest', label: 'Chest', z: 4, gendered: false, source: () => shared(clothes('chest')) },
    { key: 'feet', label: 'Feet', z: 5, gendered: false, source: () => shared(clothes('feet')) },
    { key: 'hands', label: 'Hands', z: 6, gendered: true, source: () => both('arms') },
    { key: 'ears', label: 'Ears', z: 7, gendered: true, source: () => both('ears') },
    { key: 'hair', label: 'Hair', z: 8, gendered: true, source: () => both('hair') },
    { key: 'head', label: 'Head', z: 9, gendered: true, source: () => [...both('hats'), ...shared(RAW.shared.masks)] },
    { key: 'offhand', label: 'Off-hand', z: 10, gendered: true, source: () => bothFrom(RAW.shared.back, (p) => has(p.name, 'shield', 'lantern')) },
    { key: 'weapon', label: 'Weapon', z: 11, gendered: true, source: () => both('handitems', (p) => has(p.name, 'axe', 'sword', 'pickaxe', 'hoe', 'stick')) },
    { key: 'effect', label: 'Effect', z: 12, animated: true, gendered: false, source: () => shared(RAW.shared.effects) },
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

// Bases for a category, current-gender first. Each base: { id, base, g, mismatch, variants:[{variant,name,url,g}] }.
// Gendered items keep their gender in the base key so male-Sword and female-Sword stay distinct + watermarkable.
export function basesFor(category, gender) {
    const cat = catByKey(category);
    if (!cat) return [];
    const parts = cat.source();
    const map = new Map();
    for (const p of parts) {
        const { base, variant } = parseVariant(p.name);
        const g = p.g || 'shared';
        const id = `${g}::${base}`;
        if (!map.has(id)) map.set(id, { id, base, g, mismatch: cat.gendered && g !== 'shared' && g !== gender, variants: [] });
        map.get(id).variants.push({ variant, name: p.name, url: p.url, g });
    }
    return [...map.values()]
        .map((b) => ({ ...b, variants: b.variants.sort((a, c) => (a.variant || '').localeCompare(c.variant || '')) }))
        .sort((a, b) => (a.mismatch === b.mismatch ? a.base.localeCompare(b.base) : a.mismatch ? 1 : -1));
}

// Resolve a stored layer { g, name } → its url within a category (graceful if it moved/renamed).
export function urlOfLayer(category, layer) {
    if (!layer?.name) return null;
    return (catByKey(category)?.source() || []).find((p) => p.name === layer.name && (p.g || 'shared') === (layer.g || 'shared'))?.url || null;
}
