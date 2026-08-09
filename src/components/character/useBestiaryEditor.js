import { useState, useEffect, useMemo } from 'react';
import { ENEMIES } from '../../model/enemyAssets';
import { SLIME_COLORS, SLIME_FRAME, SLIME_CROP, SLIME_IDLE, SLIME_WALK, SLIME_DEATH, LAMIA_BARE_URL } from '../../model/enemyAssets';
import { BESTIARY_CATEGORIES, SCANNED_CREATURES } from '../../model/bestiaryAssets';

// #668 (Han 2026-08-03, "scan de map characters en maak een bestiary met alle niet-hero personages ...
// voor beesten met varianten zoals de slime, zet een toggler ... gebruik de bottom-view selector voor
// characters/humanoid/animal/air/ground/other"): the curated ENEMIES (fully hand-animated, gameplay-shared
// via SLIME_COLORS/etc — untouched in enemyAssets.js) and the new auto-scanned SCANNED_CREATURES are merged
// here into ONE list of { id, category, name, blurb, variants:[{variant,url,frame,crop,animations}] }
// records — the SAME shape for both sources — so the top-view variant toggler and bottom-view category
// selector work identically regardless of which pile a creature came from.
// #669: CreatureSprite steps through `cells:[{row,col}]` (needed for the horse's cross-row-stitched
// animations, added by the scanner) — curated ENEMIES entries still use plain {row,frames}, converted here.
const rowCells = (row, frames) => Array.from({ length: frames }, (_, c) => ({ row, col: c }));

function curatedToCreature(e) {
    if (e.id === 'slime') {
        // The only curated entry with real colour variants — SLIME_COLORS/etc. already exist for gameplay
        // (SheetRpgLayer); reused here as the 3 variants instead of duplicating sprite data.
        const animsFor = () => [
            { key: 'idle', label: 'Idle', cells: rowCells(SLIME_IDLE.row, SLIME_IDLE.frames) },
            { key: 'move', label: 'Move', cells: rowCells(SLIME_WALK.row, SLIME_WALK.frames) },
            { key: 'death', label: 'Death', cells: rowCells(SLIME_DEATH.row, SLIME_DEATH.frames) },
        ];
        return {
            id: e.id, category: e.category, name: e.name, blurb: e.blurb, accessories: [],
            variants: ['green', 'blue', 'red'].map((c) => ({
                variant: c.charAt(0).toUpperCase() + c.slice(1),
                url: SLIME_COLORS[c], frame: SLIME_FRAME, crop: SLIME_CROP, animations: animsFor(),
            })),
        };
    }
    const animations = e.animations.map((a) => ({ key: a.key, label: a.label, cells: rowCells(a.row, a.frames) }));
    if (e.id === 'lamia') {
        // #671 (Han: "lamia: ik mis de bare variant") — same 512×256 layout as the main sheet (a skin-swap,
        // not a different animation set), so it reuses lamia's exact frame/crop/animations, just a 2nd url.
        return {
            id: e.id, category: e.category, name: e.name, blurb: e.blurb, accessories: [],
            variants: [
                { variant: 'Normal', url: e.sheet, frame: e.frame, crop: e.crop, animations },
                { variant: 'Bare', url: LAMIA_BARE_URL, frame: e.frame, crop: e.crop, animations },
            ],
        };
    }
    return {
        id: e.id, category: e.category, name: e.name, blurb: e.blurb, accessories: [],
        variants: [{ variant: null, url: e.sheet, frame: e.frame, crop: e.crop, animations }],
    };
}

const CREATURES = [
    ...ENEMIES.map(curatedToCreature),
    ...SCANNED_CREATURES.map((c) => ({ ...c, blurb: null })),   // scanned creatures have no hand-written blurb
];
const creatureById = (id) => CREATURES.find((c) => c.id === id);

export default function useBestiaryEditor() {
    const [category, setCategory] = useState(CREATURES[0].category);
    const [selId, setSelId] = useState(CREATURES[0].id);
    const [variantIndex, setVariantIndex] = useState(0);
    const [animKey, setAnimKey] = useState('idle');
    const [frame, setFrame] = useState(0);
    // #671 (Han: "maak een toggler voor hat en backpack") — which of the current creature's accessories
    // (e.g. Doggy's Hat/Backpack) are currently layered on top; keyed by accessory `key`.
    const [activeAccessories, setActiveAccessories] = useState({});

    const creature = creatureById(selId) || CREATURES[0];
    const variant = creature.variants[Math.min(variantIndex, creature.variants.length - 1)];
    // Fall back to the first animation if the current key is missing (e.g. a 2-row gandalf has no
    // 'attack'/'death') — keeps the preview alive when switching between differently-equipped creatures.
    const anim = useMemo(() => variant.animations.find((a) => a.key === animKey) || variant.animations[0], [variant, animKey]);

    const inCategory = useMemo(() => CREATURES.filter((c) => c.category === category), [category]);

    const selectCreature = (id) => { setSelId(id); setVariantIndex(0); setAnimKey('idle'); setActiveAccessories({}); };
    const selectCategory = (cat) => {
        setCategory(cat);
        const first = CREATURES.find((c) => c.category === cat);
        if (first) selectCreature(first.id);
    };
    const toggleAccessory = (key) => setActiveAccessories((prev) => ({ ...prev, [key]: !prev[key] }));

    useEffect(() => {
        setFrame(0);
        // #790 (Han 2026-08-09, "i do not see any oscillation e.g., for the dragonfly"): this used to wrap
        // `frame` at `anim.cells.length` — fine for STEPPING the animation cell, but `CreatureSprite`'s
        // flying-hover wobble also uses this SAME `frame` as its time input (`tMs = frame * 120`,
        // `oscillate.js`), so a short animation (e.g. a 2-4 cell "fly" loop) gave the wobble only 2-4
        // distinct positions before repeating — visually flat/imperceptible. `CreatureSprite` already wraps
        // the cell index safely on its own (`((frame % n) + n) % n`, added earlier this ticket for the
        // negative-frame crash), so the caller no longer needs to pre-wrap — a plain incrementing counter
        // (same pattern RpgLevelPanel's `petFrame` already uses) gives the wobble a genuinely continuous
        // time base while the animation cell still steps correctly.
        const id = setInterval(() => setFrame((fr) => fr + 1), 150);
        return () => clearInterval(id);
    }, [anim.cells, variant.url]);

    return {
        categories: BESTIARY_CATEGORIES, category, selectCategory, inCategory,
        selId, selectCreature, variantIndex, setVariantIndex,
        animKey, setAnimKey, frame, creature, variant, anim,
        activeAccessories, toggleAccessory,
    };
}
