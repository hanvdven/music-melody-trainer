// #RAM-level (Han 2026-08-10): builds the renderable tile list for the RPG hub scene from
// `RAM level.ldtk`, gating season/city/building-tier per `buildWorld`'s params. Scenery-only — no
// entities, no combat, no side-scroll-level concerns (see the interview notes in the plan this shipped
// under). `RpgLevelPanel.jsx` is the only consumer.
import ramLevelRaw from '../../assets/ASSORTED/LDtk/RAM level.ldtk?raw';
import { evaluateRuleGroup } from './ldtkAutoTile';
import { tilesetUrlFor } from './tilesetUrls';

const ldtk = JSON.parse(ramLevelRaw);
const LEVEL = ldtk.levels[0];
const TILESETS_BY_UID = Object.fromEntries(ldtk.defs.tilesets.map((t) => [t.uid, t]));
const LAYER_DEFS_BY_IDENTIFIER = Object.fromEntries(ldtk.defs.layers.map((l) => [l.identifier, l]));
const LAYER_INSTANCES_BY_IDENTIFIER = Object.fromEntries(LEVEL.layerInstances.map((l) => [l.__identifier, l]));

// #RAM-level (Han 2026-08-11, "ik zie dat alle 'lagen' áchter de entiteiten staan; houd goed de volgorde
// van lagen aan"): LDtk's `layerInstances` array IS the paint order — index 0 is the FRONTMOST layer
// (rendered last/on top), the last index is the FARTHEST BACK. This app previously rendered ALL scenery
// behind the hero/pet/Wisp regardless of where each source layer actually sits relative to the `Entities`
// layer in that order. `LAYER_INDEX`/`ENTITIES_INDEX` let every tile know whether its OWN source layer is
// in front of or behind the Entities layer, so `RpgLevelPanel.jsx` can split rendering into two passes
// (behind-entities, then entities, then in-front-of-entities) instead of one flat "scenery then hero".
const LAYER_INDEX = Object.fromEntries(LEVEL.layerInstances.map((l, i) => [l.__identifier, i]));
const ENTITIES_INDEX = LAYER_INDEX.Entities;
// A lower array index = more toward the FRONT; undefined (identifier not found) defaults to "behind" —
// the safe fallback if a referenced layer is ever removed from the file.
const isInFrontOfEntities = (identifier) => (LAYER_INDEX[identifier] ?? Infinity) < ENTITIES_INDEX;

// #RAM-level (Han 2026-08-11, "level heeft nu een maximum-breedte die niet overeenkomt met de level
// breedte" + "entities spawnen te ver naar rechts"): `RAM level.ldtk` uses LDtk's "Free" world layout —
// Level_0 itself sits at an arbitrary `worldX`/`worldY` within a shared world grid (currently
// worldX=-1792, NOT 0), and this app previously ignored that entirely, inventing its OWN centered origin
// (`-pxWid/2..+pxWid/2`) that silently RE-CENTERED on every edit to the level's width — so every time Han
// resized the level in the LDtk editor, the app's spawn points/camera bounds drifted even though nothing
// in the editor had actually moved. Fixed by adopting LDtk's OWN world coordinate space directly: tile
// PIXELS stay LEVEL-LOCAL (`entry.px`, unshifted — that's what the composited canvas draws at, see
// LdtkScenery.jsx) while the level's `worldX` is exposed here as `LEVEL_MIN_X` — the ONE offset
// `RpgLevelPanel.jsx` applies when placing that whole canvas in the scene (`leftPxForFactor`). Entities
// use LDtk's own precomputed `__worldX` field directly (`lvl.worldX + entity.px[0]`, already correct — no
// re-derivation needed). This makes the app's world coordinates a 1:1 mirror of what Han sees in the LDtk
// editor, stable across edits that don't move existing content.
export const LEVEL_MIN_X = LEVEL.worldX;
export const LEVEL_MAX_X = LEVEL.worldX + LEVEL.pxWid;
// Native (unzoomed) level extent — every ground/background tile's `worldY` is measured downward from the
// level's own top edge; a renderer bottom-anchoring the whole scene to the app's GROUND_ANCHOR line needs
// this height to know where the level's bottom edge (the ground) falls.
export const LEVEL_PX_WIDTH = LEVEL.pxWid;
export const LEVEL_PX_HEIGHT = LEVEL.pxHei;

// #RAM-level (Han 2026-08-11, "spawn personage op entity hero (staat in het level)"): the `Entities`
// layer's Wisp/Pet/Hero/Slime markers, TRUE world-X (LDtk's own `__worldX`, already `lvl.worldX +
// entity.px[0]` — no re-derivation) — the app's hero/pet/wisp always stand on one fixed ground line (see
// STAND_HEIGHT_PX below), so only X varies per entity. Falls back to `undefined` per-identifier if the
// Entities layer or a given entity is ever removed from the file, so callers can defend with their own
// fallback rather than this module crashing.
const ENTITIES_LAYER = LAYER_INSTANCES_BY_IDENTIFIER.Entities;
export const ENTITY_WORLD_X = Object.fromEntries(
    (ENTITIES_LAYER?.entityInstances ?? []).map((e) => [e.__identifier, e.__worldX]),
);

// #RAM-level (Han 2026-08-11, "hardcode dat karakter, pet, etc. op 32px van de grond leven"): a fixed
// native (unzoomed) px height above the level's own bottom edge every standing character/pet/NPC anchors
// to — Han's own explicit hardcode, not derived from the Hero/Pet/Wisp entities' own Y (which happen to
// already sit at this same height in the authored file, but the app's own ground line is intentionally
// fixed independent of any one entity's placement).
export const STAND_HEIGHT_PX = 32;

function tilesetForLayerInstance(li) {
    return li.__tilesetDefUid != null ? TILESETS_BY_UID[li.__tilesetDefUid] : null;
}

// `worldX`/`worldY` here are LEVEL-LOCAL px (LdtkScenery draws directly at these coordinates into a
// canvas backing store sized to the level's own extent) — NOT the app's world-coordinate space. The
// level's own `LEVEL_MIN_X` (= `lvl.worldX`) is the single offset that maps local -> world, applied once
// when the whole canvas is positioned, not per tile.
//
// `entry.f` is LDtk's own per-tile flip bitmask (bit0 = flipX, bit1 = flipY) — e.g. `Pine_forest_trunks`
// alternates flipped/unflipped trunks for variety (verified in the raw file: `f` values 0/1/2/3 all
// present on its hand-placed `gridTiles`). Only read here for STATIC entries (this app's own rule-engine
// output never sets `f` — none of the live-evaluated rules use LDtk's rule-level flipX/flipY, checked).
function tileFromLdtkEntry(entry, tileset, identifier) {
    return {
        worldX: entry.px[0], worldY: entry.px[1], src: entry.src, tilesetUrl: tilesetUrlFor(tileset),
        sheetW: tileset.pxWid, sheetH: tileset.pxHei,
        flipX: !!(entry.f & 1), flipY: !!(entry.f & 2),
        inFront: isInFrontOfEntities(identifier),
    };
}

// A plain hand-placed `Tiles` layer, or an `AutoLayer` rendered from its OWN pre-baked `autoLayerTiles`
// (used for layers this app never needs to re-evaluate live — everything except the season/city-gated
// ones below, which go through `autoLayerTilesFor` instead).
function staticLayerTiles(identifier) {
    const li = LAYER_INSTANCES_BY_IDENTIFIER[identifier];
    if (!li) return [];
    const tileset = tilesetForLayerInstance(li);
    if (!tileset) return [];
    const entries = li.__type === 'Tiles' ? li.gridTiles : li.autoLayerTiles;
    return entries.map((e) => tileFromLdtkEntry(e, tileset, identifier)).filter((t) => t.tilesetUrl);
}

// #RAM-level (Han 2026-08-11, "reken je zelf de probabiliteit uit, of geeft LDtk een voorberekende
// positionering? ik heb het liefst dat je LDtk volgt"): reads the layer's OWN pre-baked `autoLayerTiles`/
// `gridTiles` (LDtk's real, already-resolved chance/RNG outcome — exact fidelity, no re-derivation), kept
// to only the tiles whose `t` (tileId) belongs to one of the named rule GROUPS (derived from the rule
// defs' own `tileRectsIds`, not hardcoded literals). This only works for whichever season/variant was
// actually active when the file was last saved in the LDtk editor — verified empirically: Fall's tileIds
// never appear in this file's current baked pool at all (only Summer was baked), so this returns an EMPTY
// array for un-baked variants and the caller falls back to the live rule engine for those.
function preBakedTilesFilteredByGroup(identifier, groupNames) {
    const li = LAYER_INSTANCES_BY_IDENTIFIER[identifier];
    const layerDef = LAYER_DEFS_BY_IDENTIFIER[identifier];
    const tileset = tilesetForLayerInstance(li);
    if (!li || !layerDef || !tileset) return [];
    const allowedIds = new Set();
    for (const groupName of groupNames) {
        for (const group of layerDef.autoRuleGroups.filter((g) => g.name === groupName)) {
            for (const rule of group.rules) for (const opt of (rule.tileRectsIds || [])) for (const id of opt) allowedIds.add(id);
        }
    }
    const entries = li.__type === 'Tiles' ? li.gridTiles : li.autoLayerTiles;
    return entries.filter((e) => allowedIds.has(e.t)).map((e) => tileFromLdtkEntry(e, tileset, identifier)).filter((t) => t.tilesetUrl);
}

// Re-evaluates an AutoLayer's rule GROUPS live against the Terrain IntGrid (rather than trusting the
// file's own pre-baked `autoLayerTiles`, which reflects whatever groups happened to be enabled when the
// file was last saved) — this is what makes the season/city debug toggles actually work.
function autoLayerTilesFor(identifier, ruleGroupNames) {
    const li = LAYER_INSTANCES_BY_IDENTIFIER[identifier];
    const layerDef = LAYER_DEFS_BY_IDENTIFIER[identifier];
    const tileset = tilesetForLayerInstance(li);
    if (!li || !layerDef || !tileset) return [];
    const terrain = LAYER_INSTANCES_BY_IDENTIFIER.Terrain;
    const engineTileset = { cWid: tileset.__cWid, tileGridSize: tileset.tileGridSize, padding: tileset.padding, spacing: tileset.spacing };
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
                gridSize: terrain.__gridSize, tileset: engineTileset,
            });
            for (const t of tiles) {
                const converted = tileFromLdtkEntry(t, tileset, identifier);
                if (converted.tilesetUrl) out.push(converted);
            }
        }
    }
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
// Water reads the layer's own PRE-BAKED `autoLayerTiles` (`staticLayerTiles`, not the live rule engine):
// its one rule group isn't season/city-gated at all, so there's nothing to re-evaluate live, and using
// LDtk's own already-correct output sidesteps this app's own stamp-reconstruction logic entirely for a
// case that turned out to need it least (LDtk's editor already solved it once, use that answer directly).
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

// Prefers LDtk's own pre-baked, group-filtered tiles (exact fidelity — real chance/RNG outcome, real
// pivot-adjusted `px`, no re-derivation risk); falls back to the live rule engine only when the requested
// groups were never baked at all (e.g. a season the file wasn't saved showing) — see
// `preBakedTilesFilteredByGroup`'s own comment.
function grassTilesFor(identifier, groupNames) {
    const preBaked = preBakedTilesFilteredByGroup(identifier, groupNames);
    return preBaked.length > 0 ? preBaked : autoLayerTilesFor(identifier, groupNames);
}

const splitByFront = (tiles) => ({ back: tiles.filter((t) => !t.inFront), front: tiles.filter((t) => t.inFront) });

// `{ season: 'Summer'|'Fall', city: 'No_City'|'City', tavernTier, bridgeTier }` -> renderable world.
// Every tile bucket is split into `back`/`front` (relative to the `Entities` layer's own position in
// LDtk's paint order — see `isInFrontOfEntities`) so `RpgLevelPanel.jsx` can render behind-entities
// scenery, THEN the hero/pet/Wisp/Slime, THEN in-front-of-entities scenery (Grass_decoration_fg's edge
// decoration, Blacksmith/Alchemist buildings, interior walls — all genuinely in front of the Entities
// layer in the source file).
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
    const foliageTiles = [
        ...grassTilesFor('Grass_decoration_bg', [seasonGroup]),
        ...grassTilesFor('Grass_decoration_fg', grassFgGroups),
        ...FOLIAGE_LAYERS.flatMap(staticLayerTiles),
    ];
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
        animatedTilesBack: animated.back, animatedTilesFront: animated.front,
        backgroundLayers, gridSize: LAYER_INSTANCES_BY_IDENTIFIER.Terrain.__gridSize,
    };
}
