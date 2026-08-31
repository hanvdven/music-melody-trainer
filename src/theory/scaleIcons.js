// Resolves the generated scale→icon map (scaleIconMap.generated.js) to real asset URLs and lays the
// scales out as a grid for the world "Scales" view (§352): one row per scale family, modes I–VII as
// columns for the 5 genuinely-modal families, the rest filled left→right on the same 7-wide grid.
//
// The mapping itself (which animal icon, which "emotional colour") is authored in
// `src/assets/ASSET DROP/ability icons/Animals-Icons-scalesl.csv` and baked by
// `scripts/build-scale-icon-map.mjs`.

import { scaleDefinitions } from './scaleHandler';
import { SCALE_ICON_MAP, SCALE_FAMILY_ORDER, SCALE_HEPTA_REF } from './scaleIconMap.generated';

export { SCALE_HEPTA_REF, SCALE_FAMILY_ORDER };

// parent diatonic mode → degree 1..7 (Ionian → Locrian). Drives colour and the left→right sort of
// the non-modal families (Han: "ionisch links, locrisch rechts"). "Phryigian" is a source typo.
const DIATONIC_TO_NUM = {
    Ionian: 1, Dorian: 2, Phrygian: 3, Phryigian: 3, Lydian: 4, Mixolydian: 5, Aeolian: 6, Locrian: 7,
};

// Vite bundles every PNG under scale-icons/ and hands back its hashed URL, keyed by path.
const urlByPath = import.meta.glob('../assets/scale-icons/*.png', { eager: true, query: '?url', import: 'default' });
const urlByFile = {};
for (const [path, url] of Object.entries(urlByPath)) urlByFile[path.split('/').pop()] = url;

const ROMAN_TO_NUM = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };

/** Full icon record for one scale, or null if it has no mapping. `url` is null if the PNG is missing. */
export const getScaleIcon = (family, name) => {
    const m = SCALE_ICON_MAP[`${family}|${name}`];
    if (!m) return null;
    return { ...m, url: urlByFile[m.icon] ?? null };
};

/** True for the 5 families whose entries all carry a real mode index (I–VII). */
const isModalFamily = (defs) => defs.length > 0 && defs.every((d) => !!d.index);

/**
 * @returns {Array<{ family: string, modal: boolean, cells: Array<null | {
 *   family, name, code, roman, mode, animal, colour, emotion, url
 * }>}>}  One entry per family in SCALE_FAMILY_ORDER. Modal rows have exactly 7 cells (index = mode−1),
 * a null meaning "no scale at that degree". Non-modal rows have one cell per scale, in definition order.
 */
export const buildScaleGrid = () => SCALE_FAMILY_ORDER.map((family) => {
    const defs = scaleDefinitions[family] ?? [];
    const modal = isModalFamily(defs);
    const cell = (def) => {
        const icon = getScaleIcon(family, def.name);
        const heptaNum = icon?.heptaNum ?? DIATONIC_TO_NUM[def.diatonic] ?? 1;
        return {
            family,
            name: def.name,
            code: icon?.code ?? null,
            roman: icon?.roman ?? (def.index || null),
            mode: icon?.mode ?? (def.index ? ROMAN_TO_NUM[def.index] : null),
            heptaNum,
            heptaRoman: icon?.heptaRoman ?? null,
            heptaClass: icon?.heptaClass ?? null,
            animal: icon?.animal ?? null,
            colour: icon?.colour ?? null,
            url: icon?.url ?? null,
        };
    };

    if (modal) {
        const cells = Array(7).fill(null);
        for (const def of defs) {
            const n = ROMAN_TO_NUM[def.index];
            if (n) cells[n - 1] = cell(def);
        }
        return { family, modal: true, cells };
    }
    // non-modal: order by hepta ref, Ionian left → Locrian right (Han 2026-08-29)
    const sorted = [...defs].sort((a, b) => (DIATONIC_TO_NUM[a.diatonic] ?? 1) - (DIATONIC_TO_NUM[b.diatonic] ?? 1));
    return { family, modal: false, cells: sorted.map(cell) };
});
