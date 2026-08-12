import { useState, useEffect, useMemo } from 'react';
import { ENEMIES } from '../../model/enemyAssets';
import { SLIME_COLORS, SLIME_FRAME, SLIME_CROP, SLIME_IDLE, SLIME_WALK, SLIME_DEATH, LAMIA_BARE_URL } from '../../model/enemyAssets';
import { SCANNED_CREATURES } from '../../model/bestiaryAssets';

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

// #870 (Han 2026-08-12, "human / humanoid / animal / other being. elke entiteit is precies één van deze
// vier"): the generator derives `being` for every SCANNED_CREATURES entry from category/name — the curated
// ENEMIES list is hand-authored and tiny (11 entries), so it gets the same explicit-list treatment §6c
// allows when no formula fits and the set is small/stable, rather than inventing a name-matching heuristic
// for a list this short.
// #870 (Han 2026-08-12, "volgende mag an humanoid naar human: flying witch") — corrects the round-1 guess.
const CURATED_BEING = {
    lamia: 'humanoid',
    bat: 'animal', mosquito: 'animal', rat: 'animal',
    'flying-eye': 'other', mimic: 'other', plant: 'other', pumpkin: 'other', mushroom: 'other', slime: 'other',
};
// #870 (Han 2026-08-12): explicit per-curated-entry tag/flying overrides — same small-fixed-list rationale
// as CURATED_BEING above. "flying eye en portal moeten flying tag krijgen" (Portal is a manifest entry,
// handled generator-side; Flying Eye is curated, handled here) — "voeg flying en magical toe" + "animaties:
// idle, attack, death (allemaal flying animaties)" for Flying Witch.
const CURATED_TAGS = { 'flying-witch': ['flying', 'magical'], 'flying-eye': ['flying'] };
const CURATED_ALL_ANIMS_FLYING = new Set(['flying-witch', 'flying-eye']);
// #870 (Han 2026-08-12, "flying witch: mature") — overrides the BESTIARY creature's own `category` (not
// enemyAssets.js's `e.category`, which drives unrelated gameplay classification and is left untouched) so
// the existing mature-category filter (`passesFilters`) picks her up the same way manifest 'mature' entries
// already work.
const CURATED_CATEGORY_OVERRIDE = { 'flying-witch': 'mature' };

function curatedToCreature(e) {
    const being = CURATED_BEING[e.id] || 'human';
    const extraTags = CURATED_TAGS[e.id] || [];
    const category = CURATED_CATEGORY_OVERRIDE[e.id] || e.category;
    if (e.id === 'slime') {
        // The only curated entry with real colour variants — SLIME_COLORS/etc. already exist for gameplay
        // (SheetRpgLayer); reused here as the 3 variants instead of duplicating sprite data.
        const animsFor = () => [
            { key: 'idle', label: 'Idle', cells: rowCells(SLIME_IDLE.row, SLIME_IDLE.frames) },
            { key: 'move', label: 'Move', cells: rowCells(SLIME_WALK.row, SLIME_WALK.frames) },
            { key: 'death', label: 'Death', cells: rowCells(SLIME_DEATH.row, SLIME_DEATH.frames) },
        ];
        return {
            id: e.id, category, being, name: e.name, blurb: e.blurb, accessories: [],
            variants: ['green', 'blue', 'red'].map((c) => ({
                variant: c.charAt(0).toUpperCase() + c.slice(1), being, tags: [],
                url: SLIME_COLORS[c], frame: SLIME_FRAME, crop: SLIME_CROP, animations: animsFor(),
            })),
        };
    }
    const animations = e.animations.map((a) => ({
        key: a.key, label: a.label, cells: rowCells(a.row, a.frames),
        ...(CURATED_ALL_ANIMS_FLYING.has(e.id) ? { tags: ['flying'] } : {}),
    }));
    if (e.id === 'lamia') {
        // #671 (Han: "lamia: ik mis de bare variant") — same 512×256 layout as the main sheet (a skin-swap,
        // not a different animation set), so it reuses lamia's exact frame/crop/animations, just a 2nd url.
        return {
            id: e.id, category, being, name: e.name, blurb: e.blurb, accessories: [],
            variants: [
                { variant: 'Normal', being, tags: extraTags, url: e.sheet, frame: e.frame, crop: e.crop, animations },
                { variant: 'Bare', being, tags: [...extraTags, 'bare'], url: LAMIA_BARE_URL, frame: e.frame, crop: e.crop, animations },
            ],
        };
    }
    return {
        id: e.id, category, being, name: e.name, blurb: e.blurb, accessories: [],
        variants: [{ variant: null, being, tags: extraTags, url: e.sheet, frame: e.frame, crop: e.crop, animations }],
    };
}

const CREATURES = [
    ...ENEMIES.map(curatedToCreature),
    ...SCANNED_CREATURES.map((c) => ({ ...c, blurb: null })),   // scanned creatures have no hand-written blurb
];
const creatureById = (id) => CREATURES.find((c) => c.id === id);

// #870 (Han 2026-08-12, "human / humanoid / animal / other being. elke entiteit is precies één van deze
// vier... de human/humanoid/animal/other is additief"): the FIRST axis — every creature has exactly one,
// additive/OR selection (see `activeBeings`/`toggleBeing` below), NOT part of `BESTIARY_FILTER_TAGS`.
export const BESTIARY_BEINGS = ['human', 'humanoid', 'animal', 'other'];
// #870 (Han 2026-08-11, "bestiary: toon alles, maak filters op tags", corrected 2026-08-12 — human/humanoid/
// animal moved to `BESTIARY_BEINGS` above, "unfinished" removed, "mature" moved to its own 3-state cycle
// (`matureMode`), "knight" renamed "military" + broadened, "worker"/"undead"/"critter"/"townsfolk"/
// "bathhouse"/"move"/"attack" added, "monstrous" removed entirely (no derivable signal, never populated),
// "ranged" narrowed to an explicit projectile roster): the SECOND axis — SUBTRACTIVE (AND) tag chips, laid
// out in the rows Han asked for (2026-08-12, "maak een volgende rij met..."). `BESTIARY_FILTER_TAGS` (flat)
// stays exported for anything that just needs "every tag chip"; `BESTIARY_FILTER_TAG_ROWS` drives the UI.
// Han's row layout didn't mention `military`/`ranged`/`bathhouse` (all discussed moments earlier in the
// same message, clearly still wanted — not a removal) — placed with their closest thematic row rather than
// dropped: `ranged` alongside the other combat-trait tags (row 1), `military`/`bathhouse` alongside the
// other role/venue tags (row 2). #870 (Han 2026-08-12, follow-up): "roman, christian... zet op aparte rij
// met oriental, seasonal" — new dedicated row.
// #870 (Han 2026-08-13, "maak de tags per rij additief... voeg aan het eind van elke rij een knopje 'all'
// toe, die alle tags uitzet, en de filtergroep afzet (want de groepen zijn niet exhaustief)"): every row
// below is now OR-within/AND-across (see `passesTagRows`) instead of one flat AND-everything Set — Han's own
// worked example from the first tag-system message ("human + animal + hellish + flying" ->
// "(human OF animal) EN hellish EN flying") already established this shape for the being row; this extends
// the SAME shape to every subtractive tag row, since none of them are exhaustive/mutually-exclusive either
// (a creature can be BOTH `magical` and `undead`, so selecting both within one row must OR them, not AND).
export const BESTIARY_FILTER_TAG_ROWS = [
    ['magical', 'hellish', 'undead', 'flying', 'ranged'],
    ['musician', 'worker', 'trader', 'tavern', 'military', 'bathhouse'],
    ['oriental', 'seasonal', 'roman', 'christian'],
    ['pet', 'critter'],
    ['portrait', 'move', 'attack'],
];
export const BESTIARY_FILTER_TAGS = BESTIARY_FILTER_TAG_ROWS.flat();
// #870 (Han 2026-08-13, "dan mogen townsfolk en hostile twee tags zijn. ik wil een derde optie: nature; voeg
// daar alle critters en dieren toe die niet onder townsfolk vallen. zet de togglergroep onder de human
// humanoid animal other selector"): replaces the old 3-state `townsfolkMode` cycle -- townsfolk/hostile/
// nature are now ordinary OR-group tags (own row, own 'All' button, same mechanics as every row above), just
// rendered in its own spot directly under the being row rather than mixed into `BESTIARY_FILTER_TAG_ROWS`.
// None of the three are stored generator tags except `townsfolk` itself -- `hostile`/`nature` are computed
// live from it (see `creatureHasTag` below) since they're pure logical complements, not a new pixel/name
// signal (§6c: derive, don't hardcode a redundant roster).
export const BESTIARY_TOWNSFOLK_ROW = ['townsfolk', 'hostile', 'nature'];
const ALL_TAG_ROWS = [BESTIARY_TOWNSFOLK_ROW, ...BESTIARY_FILTER_TAG_ROWS];
// nature = animal-or-critter AND NOT townsfolk (the farm/pet animals now tagged townsfolk above are
// correctly excluded); hostile = everything left over (the "real" monsters) -- a clean 3-way partition.
const isTownsfolk = (c) => c.variants.some((v) => v.tags?.includes('townsfolk'));
const isNature = (c) => !isTownsfolk(c) && (c.being === 'animal' || c.variants.some((v) => v.tags?.includes('critter')));
const isHostile = (c) => !isTownsfolk(c) && !isNature(c);
const creatureHasTag = (c, tag) => (
    tag === 'townsfolk' ? isTownsfolk(c)
        : tag === 'nature' ? isNature(c)
            : tag === 'hostile' ? isHostile(c)
                : c.variants.some((v) => v.tags?.includes(tag))
);

export default function useBestiaryEditor() {
    const [selId, setSelId] = useState(CREATURES[0].id);
    const [variantIndex, setVariantIndex] = useState(0);
    const [animKey, setAnimKey] = useState('idle');
    const [frame, setFrame] = useState(0);
    // #671 (Han: "maak een toggler voor hat en backpack") — which of the current creature's accessories
    // (e.g. Doggy's Hat/Backpack) are currently layered on top; keyed by accessory `key`. #870 (Han
    // 2026-08-12, Maid): reused for Maid's Hat overlay too (key 'hat') — same on/off concept, just resolved
    // per-animation (`anim.hatUrl`) instead of a single creature-level URL (see BestiaryPanels.jsx).
    const [activeAccessories, setActiveAccessories] = useState({});
    // #870 (Han 2026-08-12, "ik wil ook sword / no sword splitsen"): default OFF (no weapon drawn).
    const [swordOn, setSwordOn] = useState(false);
    // #870 (Han 2026-08-12, "maak steeds bare een aparte toggler (naast kleur)"): default OFF — colour
    // swatches select from the NON-bare variants only; this toggle swaps to the matching bare sibling.
    const [bareOn, setBareOn] = useState(false);
    // #870 (Han 2026-08-12, "de human/humanoid/animal/other is additief... by default staan ze allevier
    // aan, minimaal een actief - laatste uitzetten is allemaal aanzetten"): additive/OR group, default ALL
    // ON, can never reach zero (see `toggleBeing` below).
    const [activeBeings, setActiveBeings] = useState(() => new Set(BESTIARY_BEINGS));
    // #870 (Han 2026-08-12, "de unfinished tag mag weg. mature mag onder de set vrije tages, en is togglen
    // tussen 3: uit ... show mature ... mature only"): a 3-state cycle, default 'off'.
    const [matureMode, setMatureMode] = useState('off');
    // #870 (Han 2026-08-13): the other tag chips (incl. `townsfolk`/`hostile`/`nature`, §"BESTIARY_TOWNSFOLK_
    // ROW" above) — grouped by ROW: OR within a row, AND across rows (see `passesTagRows` below). A single
    // flat Set still holds every active tag regardless of which row it belongs to; row membership (and thus
    // OR-vs-AND behaviour) is derived from `ALL_TAG_ROWS`, never duplicated into separate per-row state.
    const [activeTags, setActiveTags] = useState(() => new Set());
    const [searchQuery, setSearchQuery] = useState('');

    const rawCreature = creatureById(selId) || CREATURES[0];
    // #870 (Han 2026-08-11, "als mature uit staat zijn de bare varianten niet beschikbaar"; 2026-08-12,
    // "uit = nooit mature, en bare variant verbergen"): applies regardless of the creature's OWN category —
    // a 'passive'-category creature with a bare side-variant (e.g. Oriental Laying) hides that variant too.
    const creature = useMemo(() => {
        if (matureMode !== 'off') return rawCreature;
        const variants = rawCreature.variants.filter((v) => !v.tags?.includes('bare'));
        return variants.length ? { ...rawCreature, variants } : rawCreature;
    }, [rawCreature, matureMode]);
    // #870 (Han 2026-08-12, "maak steeds bare een aparte toggler (naast kleur). bijvoorbeeld: lady dryad: 3
    // kleurvarianten x bare variant = 6 varianten"): colour swatches only ever show non-bare variants;
    // `bareOn` swaps the EFFECTIVE displayed variant to its bare sibling, matched by stripping the "(Bare)"/
    // "Bare" suffix from the bare variant's name and comparing to the selected colour's name — falls back to
    // "the only bare variant" for creatures with ONE shared bare art across several colours (e.g. Lady
    // Sitting Stone, Lady Flower), and to the first bare variant if no stem match exists at all.
    const colorVariants = creature.variants.filter((v) => !v.tags?.includes('bare'));
    const bareVariants = creature.variants.filter((v) => v.tags?.includes('bare'));
    const hasBareToggle = bareVariants.length > 0 && colorVariants.length > 0;
    const selectedColorVariant = colorVariants[Math.min(variantIndex, colorVariants.length - 1)] || creature.variants[0];
    const variant = (bareOn && hasBareToggle)
        ? (bareVariants.length === 1
            ? bareVariants[0]
            : bareVariants.find((b) => (b.variant || '').replace(/\s*\(bare\)$|\s*bare$/i, '').trim() === (selectedColorVariant.variant || '').trim())
                || bareVariants[0])
        : selectedColorVariant;
    // #870 (Han 2026-08-12, "ik wil ook sword / no sword splitsen. bij sword horen combat stance t/m idle
    // sword"): generic — ANY creature whose animations carry the generator's 'sword' tag (currently only
    // Maid) gets this filter; every other creature's animation list is untouched (`hasSwordAnims` false).
    const hasSwordAnims = variant.animations.some((a) => a.tags?.includes('sword'));
    const visibleAnimations = hasSwordAnims
        ? variant.animations.filter((a) => !!a.tags?.includes('sword') === swordOn)
        : variant.animations;
    // Fall back to the first animation if the current key is missing (e.g. a 2-row gandalf has no
    // 'attack'/'death', or the sword filter just hid/revealed a different set) — keeps the preview alive.
    const anim = useMemo(() => visibleAnimations.find((a) => a.key === animKey) || visibleAnimations[0], [visibleAnimations, animKey]);
    // Toggling "Mature" filters `creature.variants` (bare variants removed/restored) — `variantIndex` would
    // otherwise keep pointing at the same NUMERIC slot, now a different variant, showing the wrong swatch as
    // active. Reset to the first variant whenever the filtered list itself changes.
    useEffect(() => { setVariantIndex(0); }, [creature.variants]);
    // Reset the selected animation only when it's no longer in the currently-visible list (sword toggle
    // just hid it, or a colour swap doesn't have that key) — not on every render.
    useEffect(() => {
        if (!visibleAnimations.some((a) => a.key === animKey)) setAnimKey(visibleAnimations[0]?.key || 'idle');
    }, [visibleAnimations]);

    const toggleBeing = (being) => setActiveBeings((prev) => {
        const next = new Set(prev);
        if (next.has(being)) next.delete(being); else next.add(being);
        return next.size ? next : new Set(BESTIARY_BEINGS);
    });
    const cycleMatureMode = () => setMatureMode((prev) => (
        prev === 'off' ? 'show' : prev === 'show' ? 'only' : 'off'
    ));
    const toggleTagFilter = (tag) => setActiveTags((prev) => {
        const next = new Set(prev);
        if (next.has(tag)) next.delete(tag); else next.add(tag);
        return next;
    });
    // #870 (Han 2026-08-13, "voeg aan het eind van elke rij een knopje 'all' toe, die alle tags uitzet, en de
    // filtergroep afzet"): clears only THIS row's active tags — an empty row imposes no AND-constraint (see
    // `passesTagRows`), which IS "turning the group off" since the groups aren't exhaustive.
    const clearTagRow = (row) => setActiveTags((prev) => {
        const next = new Set(prev);
        row.forEach((t) => next.delete(t));
        return next;
    });
    // #870 (Han 2026-08-12, "maak tags waar geen subset voor bestaat grijs... op grijze tag klikken: reset
    // alle filters, en zet de grijze tag aan"): split out the non-tag filters so tag AVAILABILITY can be
    // checked independently of which tags are currently active (see `tagHasMatches`/`selectOnlyTag` below).
    const passesNonTagFilters = (c) => {
        if (!activeBeings.has(c.being)) return false;
        if (matureMode === 'off' && c.category === 'mature') return false;
        // #870 (Han 2026-08-12, "mature only = filter op mature / heeft bare variant"):
        if (matureMode === 'only' && c.category !== 'mature' && !c.variants.some((v) => v.tags?.includes('bare'))) return false;
        if (searchQuery && !c.name.toLowerCase().includes(searchQuery.trim().toLowerCase())) return false;
        return true;
    };
    // #870 (Han 2026-08-13, "maak de tags per rij additief... (human OR humanoid) AND (magical OR undead)
    // AND (musician OR military)"): within a row, ANY active tag matching is enough (OR); a row with NO
    // active tags imposes no constraint at all (that's what makes the groups non-exhaustive-safe — leaving
    // every row empty behaves exactly like the old "no filters" state). `excludeRow`, when given, skips that
    // one row's own constraint — used by `tagHasMatches` to ask "if I ignore what's already active in THIS
    // tag's own row, does picking it still change anything?" (an OR group can never make a result set SMALLER
    // by adding another option within itself, so a tag's own row never needs to gate itself).
    const passesTagRows = (c, excludeRow) => ALL_TAG_ROWS.every((row) => {
        if (row === excludeRow) return true;
        const activeInRow = row.filter((t) => activeTags.has(t));
        return activeInRow.length === 0 || activeInRow.some((t) => creatureHasTag(c, t));
    });
    const passesFilters = (c) => passesNonTagFilters(c) && passesTagRows(c);
    // e.g. "human" being selected + no critter has `being: 'human'` → the "Critter" chip greys out.
    const tagHasMatches = (tag) => {
        const ownRow = ALL_TAG_ROWS.find((row) => row.includes(tag));
        return CREATURES.some((c) => passesNonTagFilters(c) && passesTagRows(c, ownRow) && creatureHasTag(c, tag));
    };
    const selectOnlyTag = (tag) => {
        setActiveBeings(new Set(BESTIARY_BEINGS));
        setMatureMode('off');
        setSearchQuery('');
        setActiveTags(new Set([tag]));
    };
    // #870 (Han 2026-08-12, "ik zie nu alleen de humanoid enemies... ik zou graag de volledige set van
    // bestiary zien, en daarop kunnen filteren, met de filterknoppen. de oude 'passive, with portrait, etc.'
    // pre-selecties zijn vervangen voor het tag-systeem"): the category-tab browsing model (one category
    // visible at a time) is REPLACED by the tag-filter model — every creature is a candidate, narrowed only
    // by the being group, Mature cycle, tag chips, and search box. `category` is no longer a display filter.
    const visibleCreatures = useMemo(
        () => CREATURES.filter(passesFilters),
        [activeBeings, matureMode, activeTags, searchQuery],
    );

    const selectCreature = (id) => {
        setSelId(id); setVariantIndex(0); setAnimKey('idle'); setActiveAccessories({});
        setSwordOn(false); setBareOn(false);
    };
    const toggleAccessory = (key) => setActiveAccessories((prev) => ({ ...prev, [key]: !prev[key] }));
    const toggleSword = () => setSwordOn((v) => !v);
    const toggleBare = () => setBareOn((v) => !v);
    // #870 (Han 2026-08-12, Maid "b/w + hat = toon de maid b/w en plak de hat sprite met de matchende
    // animatie erover"): whether THIS variant has a hat overlay available at all — drives whether
    // BestiaryTopPanel renders the Hat toggle button (generic: any creature whose animations carry
    // `hatUrl`, currently only Maid, via `mergeMaidEntries` in the generator).
    const hasHatOverlay = variant.animations.some((a) => a.hatUrl);

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
        visibleCreatures,
        selId, selectCreature, variantIndex, setVariantIndex,
        animKey, setAnimKey, frame, creature, variant, anim, visibleAnimations,
        activeAccessories, toggleAccessory,
        activeBeings, toggleBeing,
        matureMode, cycleMatureMode,
        activeTags, toggleTagFilter, tagHasMatches, selectOnlyTag, clearTagRow,
        searchQuery, setSearchQuery,
        hasHatOverlay, hasSwordAnims, swordOn, toggleSword,
        colorVariants, hasBareToggle, bareOn, toggleBare,
    };
}
