import './CharacterCreator.css';
import { CROP, PET_CROP } from './CharacterDoll';

// #667 shared constants/helpers between CharacterAvatarPanel (top) and CharacterOptionsPanel (bottom) — both
// need these, and neither owns the other, so they live here instead of being duplicated.

// #666 (Han 2026-08-03): snapped to the file's 32px pixel-art cell grid (10 cells); was 336.
export const AVATAR_H = 320;
// The 4×3 equipment grid, in Han's exact order (skin is the avatar itself, not a grid slot).
export const GRID = ['ears', 'hair', 'head', 'back', 'effect', 'weapon', 'chest', 'offhand', 'pet', 'hands', 'legs', 'feet'];
// #667 (Han: "Character = alleen gender/skin/ears/hair; Equipment = de overige sloten"): the "Character"
// screen's bottom panel offers only these 3 category tabs (skin isn't in GRID — it's the avatar itself);
// "Equipment" screen's bottom panel offers everything else, tab-selected via the slot grid up top instead.
export const CHARACTER_CATEGORIES = ['skin', 'ears', 'hair'];
export const EQUIPMENT_GRID = GRID.filter((k) => !CHARACTER_CATEGORIES.includes(k));

// A frame-0 thumbnail, CROPPED to the body region so the item fills the cell (Han: 3× bigger, less empty
// space). `k` scales it. The char faces RIGHT (scaleX -1); the pet faces right natively so it is NOT flipped.
export const thumbStyle = (url, cat, k = 1.6) => {
    const isPet = cat === 'pet';
    const crop = isPet ? PET_CROP : CROP;
    const flip = isPet ? 1 : -1;
    return {
        width: crop.w, height: crop.h,
        backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat',
        backgroundPosition: `${-crop.x}px ${-crop.y}px`, backgroundSize: 'auto', imageRendering: 'pixelated',
        transform: `scale(${flip * k}, ${k})`,
    };
};

// #666 appends the debug-only checkerboard class (see CharacterCreator.css `.cc-checker`).
export const checker = (cls, debugMode) => (debugMode ? `${cls} cc-checker` : cls);

export const catByKeyLabel = (key, CATEGORIES) => CATEGORIES.find((c) => c.key === key)?.label || '';
export const catByRequired = (key, CATEGORIES) => CATEGORIES.find((c) => c.key === key)?.required;
