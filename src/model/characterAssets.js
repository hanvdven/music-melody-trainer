// #645 Character-creator asset manifest. The GandalfHardcore parts were reorganised (see that commit) into
// src/assets/character/{male,female,shared}/<category>/<Name>.png. This module globs them (Vite bundles the
// URLs) and groups them by gender + category so the creator can list parts and composite a paper-doll.
//
// The parts are 800x448 sprite SHEETS (an 8x4 grid of 100x112 frames); the creator shows FRAME 0 (the
// top-left idle-front pose) of each layer, stacked. Effects are a different (400x64) sheet — treated as a
// non-body overlay category. Frame geometry lives in FRAME below so it is tunable in one place.

const FILES = import.meta.glob('../assets/character/**/*.png', { eager: true, query: '?url', import: 'default' });

// One body-sheet frame (Han POC — tune here if the pose/size is off). cols/rows describe the full sheet.
export const FRAME = { w: 100, h: 112, cols: 8, rows: 4, sheetW: 800, sheetH: 448 };

// Category display order == paper-doll Z-ORDER (back → front) + label. `gendered` categories live under
// male/ and female/; the rest under shared/. Skin sits in shared/ but its files are gender-named.
export const CATEGORIES = [
    { key: 'back', label: 'Back', gendered: false },
    { key: 'skin', label: 'Skin', gendered: false },
    { key: 'clothing', label: 'Clothing', gendered: true },
    { key: 'arms', label: 'Arms', gendered: true },
    { key: 'hands', label: 'Hands', gendered: true },
    { key: 'handitems', label: 'Item', gendered: true },
    { key: 'ears', label: 'Ears', gendered: true },
    { key: 'hair', label: 'Hair', gendered: true },
    { key: 'hats', label: 'Hat', gendered: true },
    { key: 'masks', label: 'Mask', gendered: false },
    { key: 'effects', label: 'Effect', gendered: false },
];

// { male: { hair: [{name,url}], … }, female: {…}, shared: { skin:[…], back:[…], masks:[…], effects:[…] } }
const GROUPED = (() => {
    const out = { male: {}, female: {}, shared: {} };
    for (const [path, url] of Object.entries(FILES)) {
        const m = path.match(/\/character\/(male|female|shared)\/([^/]+)\/(.+)\.png$/);
        if (!m) continue;
        const [, gender, category, name] = m;
        (out[gender][category] ||= []).push({ name, url });
    }
    for (const g of Object.values(out)) for (const list of Object.values(g)) list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return out;
})();

// The options for one category, for a given gender. Skin is filtered to the gender by its filename prefix
// (Female Skin… / Male Skin…); non-gendered categories (back/masks/effects) return the shared list as-is.
export function partsFor(category, gender) {
    const cat = CATEGORIES.find((c) => c.key === category);
    if (!cat) return [];
    if (cat.gendered) return GROUPED[gender]?.[category] || [];
    const list = GROUPED.shared[category] || [];
    if (category === 'skin') {
        const pref = gender === 'female' ? 'female' : 'male';
        const filtered = list.filter((p) => p.name.toLowerCase().startsWith(pref));
        return filtered.length ? filtered : list;   // "Special skin" (unprefixed) stays available to both
    }
    return list;
}
