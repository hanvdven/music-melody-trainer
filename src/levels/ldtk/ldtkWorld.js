// #RAM-level (Han 2026-08-10): builds the renderable tile list for the RPG hub scene from
// `RAM level.ldtk`, gating season/city/building-tier per `buildWorld`'s params. Scenery-only — no
// combat, no side-scroll-level concerns (see the interview notes in the plan this shipped
// under). `RpgLevelPanel.jsx` is the only consumer.
import ramLevelRaw from '../../assets/ASSORTED/LDtk/RAM level.ldtk?raw';
import { evaluateRuleGroup } from './ldtkAutoTile';
import { tilesetUrlFor } from './tilesetUrls';
import { COLLISION_TILE_HEIGHTS, COLLISION_TILE_COLS } from '../../model/collisionMaskHeights.generated';
import { CHUNK_PX } from '../../audio/spatialPan';

const ldtk = JSON.parse(ramLevelRaw);
const TILESETS_BY_UID = Object.fromEntries(ldtk.defs.tilesets.map((t) => [t.uid, t]));
const LAYER_DEFS_BY_IDENTIFIER = Object.fromEntries(ldtk.defs.layers.map((l) => [l.identifier, l]));

// #925 (Han 2026-08-14, "zorg dat ik naadloos kan doorlopen van levels op dezelfde verticale hoogte;
// spawn altijd waar de hero entity staat; levels op andere hoogte zijn niet bereikbaar"): Han split
// the single-level `.ldtk` file into several `Level_N` entries laid out in LDtk's "Free" world mode.
// Levels sharing the SAME `worldY` sit side-by-side (walkable, contiguous on X); levels at a
// DIFFERENT `worldY` are interiors/alt-biomes (currently Level_2, Level_5) with no door/stairs
// mechanism yet to reach them, so they must stay out of this walkable world entirely.
//
// Which `worldY` counts as "the walkable one" is derived from wherever the Hero entity marker
// actually is (currently Level_1) rather than hardcoded to a level identifier or worldY=0 — per
// Han's own answer in the interview ("er komt nog meer" levels later), this must keep working
// unchanged if levels are added/removed/reordered in the LDtk editor at that same height.
function findHeroLevel() {
    for (const lvl of ldtk.levels) {
        const entities = lvl.layerInstances.find((li) => li.__identifier === 'Entities');
        if (entities?.entityInstances.some((e) => e.__identifier === 'Hero')) return lvl;
    }
    return ldtk.levels[0];
}
const HERO_LEVEL = findHeroLevel();

// Sorted left-to-right by worldX so every per-level loop below naturally emits tiles/entities in
// paint/scan order — not load-bearing for correctness (every tile carries its own worldX), but keeps
// debugging sane.
const REACHABLE_LEVELS = ldtk.levels
    .filter((lvl) => lvl.worldY === HERO_LEVEL.worldY)
    .sort((a, b) => a.worldX - b.worldX);

// One `{ __identifier -> layerInstance }` map per reachable level, built once — every per-layer helper
// below looks a level's own instance of a given layer identifier up here instead of re-scanning
// `layerInstances` per call.
const LEVEL_LAYERS = REACHABLE_LEVELS.map((lvl) => ({
    lvl, layers: Object.fromEntries(lvl.layerInstances.map((li) => [li.__identifier, li])),
}));

// #925 follow-up (Han 2026-08-16): finds the level that's PIXEL-ADJACENT to `lvl` on `direction`
// ('left'/'right'), purely from worldX/pxWid arithmetic against the already-reachable, already-sorted
// set — no hardcoded level identifiers (CLAUDE.md §6c). Returns undefined for the outermost levels
// (nothing touches them) or if a gap exists between levels, matching AC3 (non-adjacent levels must
// never get cross-stitched).
function findHorizontalNeighbor(lvl, direction) {
    if (direction === 'left') return REACHABLE_LEVELS.find((n) => n.worldX + n.pxWid === lvl.worldX);
    return REACHABLE_LEVELS.find((n) => n.worldX === lvl.worldX + lvl.pxWid);
}

// #RAM-level (Han 2026-08-10, carried over from the single-level version): `RAM level.ldtk` uses
// LDtk's "Free" world layout — each level sits at its own `worldX`/`worldY` within a shared world
// grid, and the app adopts LDtk's OWN world coordinate space directly rather than inventing a
// centered origin. `LEVEL_MIN_X`/`LEVEL_MAX_X` now span the WHOLE stitched strip of reachable levels
// (leftmost level's `worldX` .. rightmost level's `worldX + pxWid`), not just one level, so every
// consumer (camera clamp, spawn bounds, composited canvas width) automatically covers the full
// walkable world without knowing how many levels make it up.
export const LEVEL_MIN_X = Math.min(...REACHABLE_LEVELS.map((l) => l.worldX));
export const LEVEL_MAX_X = Math.max(...REACHABLE_LEVELS.map((l) => l.worldX + l.pxWid));
export const LEVEL_PX_WIDTH = LEVEL_MAX_X - LEVEL_MIN_X;
// Reachable levels currently all share the same native height (272px); `Math.max` (not just the first
// level's height) so a future level of a different height still produces a tall-enough composited
// canvas instead of clipping — `tileFromLdtkEntry` below bottom-aligns each level's own tiles inside
// that shared canvas height so the ground line still lines up regardless.
export const LEVEL_PX_HEIGHT = Math.max(...REACHABLE_LEVELS.map((l) => l.pxHei));

// #RAM-level (Han 2026-08-11, "ik zie dat alle 'lagen' áchter de entiteiten staan; houd goed de
// volgorde van lagen aan"): LDtk's `layerInstances` array IS the paint order — index 0 is the
// FRONTMOST layer (rendered last/on top), the last index is the FARTHEST BACK. Every level in one
// `.ldtk` file shares the SAME layer definitions in the SAME order (verified: every `Level_N` lists
// its `layerInstances` identifiers in an identical sequence), so this only needs computing once from
// any one reachable level rather than per-level.
const LAYER_INDEX = Object.fromEntries(REACHABLE_LEVELS[0].layerInstances.map((l, i) => [l.__identifier, i]));
const ENTITIES_INDEX = LAYER_INDEX.Entities;
// A lower array index = more toward the FRONT; undefined (identifier not found) defaults to "behind" —
// the safe fallback if a referenced layer is ever removed from the file.
const isInFrontOfEntities = (identifier) => (LAYER_INDEX[identifier] ?? Infinity) < ENTITIES_INDEX;

// #925 (Han 2026-08-14): spawn/entity markers now come from ALL reachable levels' `Entities` layers
// merged together — Level_0 only has a couple of flying critters, the populated cast (Hero, Wisp, Pet,
// Slime, shops' NPCs) lives in Level_1, and Level_3/4 may grow their own over time. `__worldX`/
// `__worldY` are LDtk's own precomputed ABSOLUTE world coordinates (already `lvl.worldX/worldY +
// entity.px[...]`), so entities from different levels are directly comparable with no extra offset
// math — unlike tiles (below), which are level-LOCAL pixels composited into one shared canvas.
const ALL_ENTITY_INSTANCES = LEVEL_LAYERS.flatMap(({ layers }) => layers.Entities?.entityInstances ?? []);

// Single-instance markers (Hero/Pet/Wisp/Slime): `__identifier -> worldX`. Falls back to `undefined`
// per-identifier if a marker is ever missing, so callers can defend with their own fallback rather
// than this module crashing.
export const ENTITY_WORLD_X = Object.fromEntries(ALL_ENTITY_INSTANCES.map((e) => [e.__identifier, e.__worldX]));

// #924 (Han 2026-08-12, "ik heb entiteiten bird, duck, butterfly toegevoegd... spawn op die plekken"):
// multi-instance markers (Bird/Duck/Butterfly/Critter_*/NPC) keep EVERY placed instance, across every
// reachable level, with both world axes (`__worldY` too — birds/critters vary in flight height).
export const ENTITY_INSTANCES = ALL_ENTITY_INSTANCES.reduce((acc, e) => {
    (acc[e.__identifier] ??= []).push({ x: e.__worldX, y: e.__worldY });
    return acc;
}, {});

// #RAM-level (Han 2026-08-11, "hardcode dat karakter, pet, etc. op 32px van de grond leven"): a fixed
// native (unzoomed) px height above the level's own bottom edge every standing character/pet/NPC anchors
// to — Han's own explicit hardcode, not derived from the Hero/Pet/Wisp entities' own Y (which happen to
// already sit at this same height in the authored file, but the app's own ground line is intentionally
// fixed independent of any one entity's placement).
export const STAND_HEIGHT_PX = 32;

// #1040 (Han 2026-08-17, collision-mask interview: "all ground-anchored entities... exclude flying and
// on-water, they have different height rules — flying/oscillating for air, fixed at 16px for on-water"):
// swim critters (X_on_water) get their OWN fixed anchor, same pattern as STAND_HEIGHT_PX but a distinct
// (lower) value — NOT derived from the collision map and NOT from the marker's own authored Y, so a duck
// floats at a consistent height regardless of exactly where the level author dropped its spawn marker.
export const WATER_STAND_HEIGHT_PX = 16;

// #1032 round 6 bugfix (Han 2026-08-17, "de lijn staat op 32px van de bodem, ik had duidelijk 24px
// gezegd. Dit is een visuele keuze van mij... zet de lijn op 28px"): the reflection mirror axis is NOT
// derived from pond tile data at all — it's Han's own hand-tuned constant, same pattern as
// STAND_HEIGHT_PX/WATER_STAND_HEIGHT_PX. Confirmed by his own worked example: hero standing on a
// Collision_mask ramp at height 48 should reflect to height 16 — i.e. mirrored around a FIXED line, not
// the pond's own (possibly different) tile-derived surfaceY and not the entity's own current (possibly
// elevated) position. An earlier round used `pond.surfaceY` instead, which happened to read 32 for this
// level's water tiles — coincidentally close to, but NOT the same thing as, this deliberately separate
// hand-tuned value.
export const WATER_REFLECTION_AXIS_PX = 28;

function tilesetForLayerInstance(li) {
    return li.__tilesetDefUid != null ? TILESETS_BY_UID[li.__tilesetDefUid] : null;
}

// #925 (Han 2026-08-14): tiles are level-LOCAL px in the source file (`entry.px`), but multiple
// reachable levels now share ONE composited canvas (`LdtkScenery.jsx`), so each level's tiles need
// shifting into that shared canvas's own local space: `offsetX` slides the level to its position
// within the stitched strip (leftmost reachable level lands at x=0 of the canvas, matching
// `LEVEL_MIN_X` being the one offset `RpgLevelPanel.jsx` applies when placing the whole canvas in the
// scene); `offsetY` bottom-aligns a level against the shared canvas height (`LEVEL_PX_HEIGHT`) so the
// ground line still lines up even if a future reachable level has a different native height.
function tileFromLdtkEntry(entry, tileset, identifier, lvl) {
    const offsetX = lvl.worldX - LEVEL_MIN_X;
    const offsetY = LEVEL_PX_HEIGHT - lvl.pxHei;
    return {
        worldX: entry.px[0] + offsetX, worldY: entry.px[1] + offsetY, src: entry.src, tilesetUrl: tilesetUrlFor(tileset),
        sheetW: tileset.pxWid, sheetH: tileset.pxHei,
        flipX: !!(entry.f & 1), flipY: !!(entry.f & 2),
        inFront: isInFrontOfEntities(identifier),
    };
}

// A plain hand-placed `Tiles` layer, or an `AutoLayer` rendered from its OWN pre-baked `autoLayerTiles`
// (used for layers this app never needs to re-evaluate live — everything except the season/city-gated
// ones below, which go through `autoLayerTilesFor` instead). Merges the same-identifier layer instance
// across EVERY reachable level (each level authors its own copy of e.g. `Decor` or `Bg_pine`).
function staticLayerTiles(identifier) {
    const out = [];
    for (const { lvl, layers } of LEVEL_LAYERS) {
        const li = layers[identifier];
        const tileset = li && tilesetForLayerInstance(li);
        if (!tileset) continue;
        const entries = li.__type === 'Tiles' ? li.gridTiles : li.autoLayerTiles;
        for (const e of entries) {
            const t = tileFromLdtkEntry(e, tileset, identifier, lvl);
            if (t.tilesetUrl) out.push(t);
        }
    }
    return out;
}

// #RAM-level (Han 2026-08-11, "reken je zelf de probabiliteit uit, of geeft LDtk een voorberekende
// positionering? ik heb het liefst dat je LDtk volgt"): reads ONE level's OWN pre-baked
// `autoLayerTiles`/`gridTiles` (LDtk's real, already-resolved chance/RNG outcome), kept to only the
// tiles whose `t` (tileId) belongs to one of the named rule GROUPS (derived from the rule defs' own
// `tileRectsIds`, not hardcoded literals). Only works for whichever season/variant was actually active
// in THAT level when it was last saved in the LDtk editor — `grassTilesForLevel` below falls back to
// the live rule engine per-level when a level's own bake is empty, so one level being un-baked doesn't
// silently blank out the others.
function preBakedTilesForLevel(lvl, li, identifier, groupNames) {
    const layerDef = LAYER_DEFS_BY_IDENTIFIER[identifier];
    const tileset = li && tilesetForLayerInstance(li);
    if (!li || !layerDef || !tileset) return [];
    const allowedIds = new Set();
    for (const groupName of groupNames) {
        for (const group of layerDef.autoRuleGroups.filter((g) => g.name === groupName)) {
            for (const rule of group.rules) for (const opt of (rule.tileRectsIds || [])) for (const id of opt) allowedIds.add(id);
        }
    }
    const entries = li.__type === 'Tiles' ? li.gridTiles : li.autoLayerTiles;
    return entries.filter((e) => allowedIds.has(e.t)).map((e) => tileFromLdtkEntry(e, tileset, identifier, lvl)).filter((t) => t.tilesetUrl);
}

// Re-evaluates ONE level's AutoLayer rule GROUPS live against that level's OWN Terrain IntGrid (rather
// than trusting the file's pre-baked `autoLayerTiles`) — this is what makes the season/city debug
// toggles actually work, and what covers a level whose bake doesn't match the requested groups.
function autoLayerTilesForLevel(lvl, layers, identifier, ruleGroupNames) {
    const li = layers[identifier];
    const layerDef = LAYER_DEFS_BY_IDENTIFIER[identifier];
    const tileset = li && tilesetForLayerInstance(li);
    if (!li || !layerDef || !tileset) return [];
    const terrain = layers.Terrain;
    const engineTileset = { cWid: tileset.__cWid, tileGridSize: tileset.tileGridSize, padding: tileset.padding, spacing: tileset.spacing };
    // #925 follow-up (Han 2026-08-16): the neighbor's Terrain IntGrid, resolved once per level here
    // (not per-frame/per-crossing — computed alongside everything else buildWorld() already does at
    // module load) so edge-cell rule evaluation sees the real adjacent terrain instead of `outOfBoundsValue`.
    const leftLvl = findHorizontalNeighbor(lvl, 'left');
    const rightLvl = findHorizontalNeighbor(lvl, 'right');
    const leftTerrain = leftLvl && LEVEL_LAYERS.find((e) => e.lvl === leftLvl)?.layers.Terrain;
    const rightTerrain = rightLvl && LEVEL_LAYERS.find((e) => e.lvl === rightLvl)?.layers.Terrain;
    const left = leftTerrain && { csv: leftTerrain.intGridCsv, width: leftTerrain.__cWid, height: leftTerrain.__cHei };
    const right = rightTerrain && { csv: rightTerrain.intGridCsv, width: rightTerrain.__cWid, height: rightTerrain.__cHei };
    const out = [];
    for (const groupName of ruleGroupNames) {
        // #RAM-level (Han 2026-08-11, "ik mis ook grass decoration bg en fg"): `Grass_decoration_bg`'s
        // layer def has TWO separate rule groups both literally named "Grass_Summer" (verified in the raw
        // .ldtk JSON) — `.find()` silently picked only the first, dropping the second group's decoration
        // tiles entirely. Collect and evaluate EVERY group with a matching name, not just the first match.
        const groups = layerDef.autoRuleGroups.filter((g) => g.name === groupName);
        for (const group of groups) {
            const tiles = evaluateRuleGroup(group, {
                csv: terrain.intGridCsv, width: terrain.__cWid, height: terrain.__cHei,
                gridSize: terrain.__gridSize, tileset: engineTileset, left, right,
            });
            for (const t of tiles) {
                const converted = tileFromLdtkEntry(t, tileset, identifier, lvl);
                if (converted.tilesetUrl) out.push(converted);
            }
        }
    }
    return out;
}

// Multi-level wrapper around `autoLayerTilesForLevel` — used directly for groups that are never
// pre-baked-preferred (Terrain_Tiles, Pavement).
function autoLayerTilesFor(identifier, ruleGroupNames) {
    const out = [];
    for (const { lvl, layers } of LEVEL_LAYERS) out.push(...autoLayerTilesForLevel(lvl, layers, identifier, ruleGroupNames));
    return out;
}

// Building-tier layers are literal pre-authored LDtk `Tiles` layers, one per tier — no rule engine
// involved, just "which whole layer is visible" (Han's own framing during the interview).
const TAVERN_TIER_LAYERS = { Tent: 'Tavern_level_1_tent', Small: 'Tavern_level_2_small', Full: 'Tavern_level_3_full' };
const BRIDGE_TIER_LAYERS = { Log: 'Bridge_level_1_log', Wood: 'Bridge_level_2_wood' };
export const TAVERN_TIERS = Object.keys(TAVERN_TIER_LAYERS);
export const BRIDGE_TIERS = Object.keys(BRIDGE_TIER_LAYERS);

// #RAM-level (Han 2026-08-11, "alle foliage lagen (via tag) moeten reageren op de wind"): LDtk has no
// tag data actually populated on these tilesets/layers (checked the raw file — every `tags`/`enumTags`
// array is empty), so "tag" here is Han's own layer-naming convention, not LDtk's formal tag feature.
// These layers render through `ForegroundFoliageLayer`'s existing wind-shimmer shader (RpgLevelPanel.jsx)
// instead of the flat static ground canvas — trunks (`Pine_forest_trunks`, `Main_tree_trunk`) stay OUT of
// this list on purpose, matching the pre-existing rigid-wood-vs-shimmering-foliage distinction (§141).
const FOLIAGE_LAYERS = ['Pine_forest_foliage2', 'Weeping_Willow', 'Main_tree_foliage'];

// #RAM-level (Han 2026-08-11, "de animated lagen moeten geanimeerd worden"): tiles sourced from these two
// tilesets are pulled OUT of the static ground canvas entirely and instead driven by
// `LdtkAnimatedTiles.jsx`'s frame-cycling overlay — see that file for the exact per-tileset animation
// rule (Han's own spec: campfire cycles all "on" rows from a random start frame, or shows the single
// "off" cell statically; water always cycles its own row).
//
// Water reads each level's own PRE-BAKED `autoLayerTiles` (`staticLayerTiles`, not the live rule
// engine): its one rule group isn't season/city-gated at all, so there's nothing to re-evaluate live,
// and using LDtk's own already-correct output sidesteps this app's own stamp-reconstruction logic
// entirely for a case that turned out to need it least (LDtk's editor already solved it once, use that
// answer directly).
const ANIMATED_LAYERS = { water: 'Water_tile', campfire: 'Campfire' };

// Everything else with authored art: one tier, always shown, never toggled. Includes whatever plain decor
// layers exist in the file beyond the ones with dedicated handling above/below — kept as an explicit list
// (not a blanket "everything else" scan) so a newly-added LAYER TYPE (e.g. a future tiered/gated one)
// doesn't silently fall through here without a deliberate decision; `staticLayerTiles` itself already
// no-ops gracefully if an identifier is ever removed from the file.
const STATIC_TILE_LAYERS = [
    'Blacksmith_level_3_full', 'Alchemist_level_3_full', 'Decor', 'Pine_forest_trunks', 'Main_tree_trunk',
    'Interior_Back_Walls', 'Alchemist_decor',
];

// Background/scenery layers, farthest -> nearest by LDtk layer order (bottom of `layerInstances` =
// farthest back); parallax factor assigned by depth, generalizing RpgLevelPanel's existing 0.2-0.8
// 4-layer progression to these 5.
const BACKGROUND_LAYERS = [
    { identifier: 'Bg_plains_mountain', factor: 0.1 },
    { identifier: 'BG_plains_hills', factor: 0.25 },
    { identifier: 'BG_plains_plains', factor: 0.45 },
    { identifier: 'BG_plains_river', factor: 0.65 },
    { identifier: 'Bg_pine', factor: 0.85 },
];

export const SEASONS = ['Summer', 'Fall'];
export const CITY_OPTIONS = ['No_City', 'City'];

// #RAM-level (Han 2026-08-11, "ik zie het kampvuur 4x, ik zie het water 4x"): the FIRST version of this
// grouped placed tiles into 32x32 blocks by flooring their PLACEMENT (world) position to the nearest
// 32px — which silently assumed every animated sprite is placed 32-aligned. Campfire's own placement
// starts at px 1648 (1648 % 32 = 16, NOT aligned), so its 4 individual 16x16 pieces floor-divided into
// FOUR different "cells" instead of one — each then rendered as its own independent 32x32 animated sprite,
// which is exactly Han's "campfire 4x" report. Fixed by dropping grouping entirely: each 16x16 tile
// animates INDEPENDENTLY, using its own `src` (SHEET position, decoupled from where it's placed in the
// level) to derive which 32x32 "logical cell" it started in and which 16x16 quadrant of that cell it is —
// the renderer then cycles the logical cell while preserving the quadrant, so the exact tiles that were
// already correctly placed just get a new source rect each frame. No placement-alignment assumption of
// any kind, so it can't misgroup regardless of where a sprite sits in the level.
function withAnimMeta(tile) {
    return {
        ...tile,
        logicalCol: Math.floor(tile.src[0] / 32), logicalRow: Math.floor(tile.src[1] / 32),
        subX: tile.src[0] % 32, subY: tile.src[1] % 32,
    };
}

// Prefers each level's own pre-baked, group-filtered tiles (exact fidelity — real chance/RNG outcome,
// real pivot-adjusted `px`, no re-derivation risk); falls back to the live rule engine PER LEVEL only
// for a level whose bake didn't include the requested groups at all (e.g. a season that level wasn't
// saved showing) — done per-level (not once for the whole merged result) so one un-baked level doesn't
// blank out the others' correctly-baked tiles.
function grassTilesFor(identifier, groupNames) {
    const out = [];
    for (const { lvl, layers } of LEVEL_LAYERS) {
        const preBaked = preBakedTilesForLevel(lvl, layers[identifier], identifier, groupNames);
        out.push(...(preBaked.length > 0 ? preBaked : autoLayerTilesForLevel(lvl, layers, identifier, groupNames)));
    }
    return out;
}

const splitByFront = (tiles) => ({ back: tiles.filter((t) => !t.inFront), front: tiles.filter((t) => t.inFront) });

// `{ season: 'Summer'|'Fall', city: 'No_City'|'City', tavernTier, bridgeTier }` -> renderable world.
// Every tile bucket is split into `back`/`front` (relative to the `Entities` layer's own position in
// LDtk's paint order — see `isInFrontOfEntities`) so `RpgLevelPanel.jsx` can render behind-entities
// scenery, THEN the hero/pet/Wisp/Slime, THEN in-front-of-entities scenery (Grass_decoration_fg's edge
// decoration, Blacksmith/Alchemist buildings, interior walls — all genuinely in front of the Entities
// layer in the source file). Tiles are drawn from EVERY reachable level (`REACHABLE_LEVELS`), stitched
// into one continuous strip — see the `#925` comments above for how levels are chosen and offset.
export function buildWorld({ season = 'Summer', city = 'No_City', tavernTier = 'Tent', bridgeTier = 'Log' } = {}) {
    const seasonGroup = season === 'Fall' ? 'Grass_Fall' : 'Grass_Summer';
    const terrainGroup = season === 'Fall' ? 'Terrain_Fall' : 'Terrain_Summer';
    // City gates the Pavement rule group specifically (Han: "de pavement tiles hangen af van de city
    // biome") — Grass_decoration_fg also carries a Pavement-edge rule group alongside its season group,
    // so both are included together only when City is on.
    const grassFgGroups = city === 'City' ? [seasonGroup, 'Pavement'] : [seasonGroup];

    const groundTiles = [
        ...autoLayerTilesFor('Terrain_Tiles', [terrainGroup]),
        ...(city === 'City' ? autoLayerTilesFor('Pavement', ['Pavement']) : []),
        ...staticLayerTiles(TAVERN_TIER_LAYERS[tavernTier]),
        ...staticLayerTiles(BRIDGE_TIER_LAYERS[bridgeTier]),
        ...STATIC_TILE_LAYERS.flatMap(staticLayerTiles),
    ];
    // #wind §363 (Han 2026-09-01, "windgeluid uit de foliage, geen gras"): TREE foliage only —
    // FOLIAGE_LAYERS (Pine/Willow/Main_tree), NOT the Grass_decoration_* layers. Reused below both for
    // the rendered `foliageTiles` and for `foliageChunkSet` (which world-chunks rustle).
    const treeFoliageTiles = FOLIAGE_LAYERS.flatMap(staticLayerTiles);
    const foliageTiles = [
        ...grassTilesFor('Grass_decoration_bg', [seasonGroup]),
        ...grassTilesFor('Grass_decoration_fg', grassFgGroups),
        ...treeFoliageTiles,
    ];
    // The set of CHUNK_PX world-chunks (ABSOLUTE X — `staticLayerTiles` worldX is canvas-local, 0-based
    // from LEVEL_MIN_X, same convention as the water tiles) that hold at least one tree-foliage tile.
    // Precomputed once per world so the ambient wind audio can cheaply ask, per screen-third, "is there
    // rustling foliage here?".
    const foliageChunkSet = new Set(
        treeFoliageTiles.map((t) => Math.floor((t.worldX + LEVEL_MIN_X) / CHUNK_PX)),
    );
    const animatedTiles = [
        ...staticLayerTiles(ANIMATED_LAYERS.water).map((t) => ({ ...withAnimMeta(t), kind: 'water' })),
        ...staticLayerTiles(ANIMATED_LAYERS.campfire).map((t) => ({ ...withAnimMeta(t), kind: 'campfire' })),
    ];
    const backgroundLayers = BACKGROUND_LAYERS.map(({ identifier, factor }) => ({ factor, tiles: staticLayerTiles(identifier) }));

    const ground = splitByFront(groundTiles);
    const foliage = splitByFront(foliageTiles);
    const animated = splitByFront(animatedTiles);

    return {
        groundTilesBack: ground.back, groundTilesFront: ground.front,
        foliageTilesBack: foliage.back, foliageTilesFront: foliage.front,
        foliageChunkSet,
        animatedTilesBack: animated.back, animatedTilesFront: animated.front,
        backgroundLayers, gridSize: LEVEL_LAYERS[0].layers.Terrain.__gridSize,
    };
}

// #1032 (Han 2026-08-17, water reflection interview: "tree, decor, entities... allemaal wel... voor bomen
// mag je de ruwe laag pakken, dus shimmer negeren. parallax hoeft niet, en terrain ook niet (want water is
// nooit ónder terrain)"): trees/decor/structures — deliberately excludes Terrain_Tiles/Pavement (real
// terrain, never visible under water) and BACKGROUND_LAYERS (parallax, explicitly excluded).
// #1032 round 8 bugfix (Han: "ik kan de brug niet zien op het water"): the ORIGINAL version only included
// STATIC_TILE_LAYERS/FOLIAGE_LAYERS (a fixed list, computed once) — bridge/tavern tiers are NOT fixed
// layers, they're chosen dynamically per `buildWorld({tavernTier, bridgeTier})` call
// (`TAVERN_TIER_LAYERS[tavernTier]`/`BRIDGE_TIER_LAYERS[bridgeTier]`), so a hardcoded once-computed list
// could never have included whichever one is actually active. Now a function taking the SAME
// `{tavernTier, bridgeTier}` buildWorld() itself takes, reusing its own tier-lookup tables (§6c) —
// callers re-derive it whenever those tiers change, same as buildWorld() itself.
export function reflectableTilesFor({ tavernTier = 'Tent', bridgeTier = 'Log' } = {}) {
    return [...STATIC_TILE_LAYERS, ...FOLIAGE_LAYERS, TAVERN_TIER_LAYERS[tavernTier], BRIDGE_TIER_LAYERS[bridgeTier]]
        .flatMap(staticLayerTiles);
}

// #1040 (Han 2026-08-17, "tenzij anders vermeld, moet karakter 'op de collision map' wandelen... geen
// collision map: gewoon op 32px wandelen. wel collision map: hoogte wordt bepaald door collision map"):
// Collision_mask doesn't vary by season/city/tavern/bridge tier (unlike buildWorld()'s other layers), so
// it's computed once here rather than per buildWorld() call.
const COLLISION_MASK_GRID_SIZE = LEVEL_LAYERS[0].layers.Terrain.__gridSize;
const COLLISION_MASK_TILES = staticLayerTiles('Collision_mask');

// #1040: canvasLocalX (a world X already converted via `- LEVEL_MIN_X`, matching every other LDtk tile
// consumer in this file) -> ground height, in the SAME "native px up from the level's own bottom edge"
// unit as STAND_HEIGHT_PX (directly usable as a `bottom` CSS value once scaled by zoom). Finds whichever
// Collision_mask tile covers that X (the layer is authored as a single non-overlapping strip, so the
// first match is the only match); a tile's own per-column height (COLLISION_TILE_HEIGHTS, decoded from
// the tileset's own pixel silhouette — scripts/generate-collision-heights.mjs, CLAUDE.md §6c) converts to
// this unit via `LEVEL_PX_HEIGHT - (tile.worldY + columnHeight)`. Falls back to the flat STAND_HEIGHT_PX
// when no tile covers this X, or when the covered column has no opaque pixel — both per Han's own
// confirmed interview answers (2026-08-17), not a guess.
export function groundHeightAt(canvasLocalX) {
    const tile = COLLISION_MASK_TILES.find(
        (t) => canvasLocalX >= t.worldX && canvasLocalX < t.worldX + COLLISION_MASK_GRID_SIZE);
    if (!tile) return STAND_HEIGHT_PX;
    const tileId = (tile.src[1] / COLLISION_MASK_GRID_SIZE) * COLLISION_TILE_COLS + (tile.src[0] / COLLISION_MASK_GRID_SIZE);
    let col = Math.floor(canvasLocalX - tile.worldX);
    if (tile.flipX) col = COLLISION_MASK_GRID_SIZE - 1 - col;
    const h = COLLISION_TILE_HEIGHTS[tileId]?.[col];
    if (h == null || h < 0) return STAND_HEIGHT_PX;
    return LEVEL_PX_HEIGHT - (tile.worldY + h);
}
