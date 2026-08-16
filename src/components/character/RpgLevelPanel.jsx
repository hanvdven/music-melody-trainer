import React, { useEffect, useMemo, useRef, useState } from 'react';
import CharacterDoll, { CROP as HERO_CROP, PET_CROP } from './CharacterDoll';
import { ANIMATIONS, urlOfLayer } from '../../model/characterAssets';
import { CreatureSprite } from './BestiaryPanels';
import { frameMsForBpm } from '../sheet-music/SheetRpgLayer';
import { findMoveAnim, findIdleAnim, isFlyingAnim, findCreatureByName, findVariantByUrl, findCreaturesByTags } from '../../model/bestiaryAssets';
import { GROUND_ANCHOR_PX } from '../../model/worldAnchor';
import { SLIME_FRAME, SLIME_CROP, SLIME_IDLE, SLIME_COLS, SLIME_ROWS, SLIME_COLORS } from '../../model/enemyAssets';
import { loadImageEl, normalMapCanvasFromCrop } from '../../utils/runtimeNormalMap';
import { LEVEL_MIN_X, LEVEL_MAX_X } from '../../hooks/useRpgLevelState';
import floorTiles2Url from '../../assets/ASSORTED/tiles/tiles/Floor Tiles2.png';
import treeSheetUrl from '../../assets/ASSORTED/tiles/trees/Trees_foliage_trunk.png';
import decorUrl from '../../assets/ASSORTED/tiles/int_ext_decoration/Decor.png';
import ForegroundFoliageLayer, { DEFAULT_FOLIAGE_PARAMS } from './ForegroundFoliageLayer';
import useLdtkWaterInstances from './useLdtkWaterInstances';
import LdtkScenery from './LdtkScenery';
import LdtkAnimatedTiles from './LdtkAnimatedTiles';
import useLdtkFoliageInstances from './useLdtkFoliageInstances';
import useDebugMetronome, { useFpsCounters } from './useDebugMetronome';
import { buildWorld, SEASONS, CITY_OPTIONS, TAVERN_TIERS, BRIDGE_TIERS, ENTITY_WORLD_X, ENTITY_INSTANCES, STAND_HEIGHT_PX, LEVEL_PX_HEIGHT, LEVEL_PX_WIDTH } from '../../levels/ldtk/ldtkWorld';
import useLdtkLitGroundTextures from './useLdtkLitGroundTextures';
import LdtkLitGround from './LdtkLitGround';
import { oscillate } from '../../utils/oscillate';
// #141 (Han 2026-08-05): pre-generated normal maps for the shimmer shader — see
// scripts/generate-tree-normal-maps.mjs (Sobel height-gradient derived from the diffuse art itself, no
// hand-painted normal-map asset needed).
// #924 round 7 (Han 2026-08-12, "maak een failsafe voor als de normal maps weg zijn. Het level gaat vaak
// geupdatet worden"): these used to be 6 STATIC imports — a Vite/Rollup static `import x from '...png'` is
// resolved at BUILD time, so a missing file is a hard build failure (confirmed: this exact scenario just
// broke `npm run build` entirely after the `generated/` folder was removed, before being regenerated via
// `node scripts/generate-tree-normal-maps.mjs`). `import.meta.glob` only includes whatever files actually
// EXIST at build time — a missing one silently yields `undefined` here instead of failing the whole build;
// every consumer below already tolerates a missing/undefined normalUrl (ForegroundFoliageLayer's
// E022-FOLIAGE-TEXTURE-LOAD skips that one shimmer instance rather than crashing the shared render loop).
const NORMAL_MAP_URLS = import.meta.glob('../../assets/ASSORTED/tiles/trees/generated/*.png', { eager: true, query: '?url', import: 'default' });
const normalMapUrl = (basename) => NORMAL_MAP_URLS[`../../assets/ASSORTED/tiles/trees/generated/${basename}`];
const treeFoliageSummerNormalUrl = normalMapUrl('tree-foliage-summer-normal.png');
const grassNormalR5C1Url = normalMapUrl('grass-normal-r5c1.png');
const grassNormalR5C2Url = normalMapUrl('grass-normal-r5c2.png');
const grassNormalR5C3Url = normalMapUrl('grass-normal-r5c3.png');
const grassNormalR6C1Url = normalMapUrl('grass-normal-r6c1.png');
const grassNormalR7C1Url = normalMapUrl('grass-normal-r7c1.png');
const crateNormalUrl = normalMapUrl('crate-normal.png');
import bgLayer1Url from '../../assets/ASSORTED/backgrounds/Normal BG/GandalfHardcore Background layers_layer 1.png';
import bgLayer2Url from '../../assets/ASSORTED/backgrounds/Normal BG/GandalfHardcore Background layers_layer 2.png';
import bgLayer3Url from '../../assets/ASSORTED/backgrounds/Normal BG/GandalfHardcore Background layers_layer 3.png';
import bgLayer4Url from '../../assets/ASSORTED/backgrounds/Normal BG/GandalfHardcore Background layers_layer 4.png';
import bgLayer5Url from '../../assets/ASSORTED/backgrounds/Normal BG/GandalfHardcore Background layers_layer 5.png';

// #691/#693 (Han 2026-08-04, "maak een extra tab: 'rpg level'" + round-2 movement/pet/NPC follow-up +
// round-7 world/camera/parallax rework): a dev/preview scene — like the Bestiary tab, NOT wired into
// actual level gameplay yet (Han's own framing when asked) — for building/checking the tile art AND
// movement before it's ever wired into a real level. Native sprite grid is 32×32 (`TILE`/`T`); `ZOOM` is a
// pure display scale-up (nothing here is tied to real gameplay pixel math, unlike SheetRpgLayer).
// Movement/pet/dialogue state lives in the shared `useRpgLevelState` hook (App.jsx owns the one instance,
// passed here AND to `RpgLevelBottomPanel`).
const TILE = 32;
const ZOOM = 3;
const T = TILE * ZOOM;

// #693 (Han round 2, "gebruik voor het gras: floor tiles 2. onderverdeel in 16x16 (was 32x32) en pak tiles
// (2,3,4,5; 8,9,10,11) in willekeurige volgorde"): Floor Tiles2.png is the SAME 288×576 sheet as Floor
// Tiles1, now sliced at 16×16 (18×36 cells) instead of 32×32 — row 1, cols 2-5 and 8-11 are the flat
// grass-top tiles (verified visually: cols 1/6/7/12 are the block EDGES with a different silhouette, Han's
// list picks only the safe flat-top middle tiles from each 6-wide block). One floor SLOT is now HALF the
// old 32px width (16px native → `FLOOR_T` on screen), so two floor tiles fill the same world-grid unit the
// tree/tent/character still align to.
const FLOOR_TILE = 16;
const FLOOR_T = FLOOR_TILE * ZOOM;
// #141 (Han 2026-08-05, "can you apply the foliage effect to the top 3 rows of the grass tiles?" — round 7
// follow-up: "Make the height 5 pixels with a lower and lower application as seen from the top" — round 10:
// the floor overlay instance spans the FULL tile height (`FLOOR_T`) so ambient/point-light coverage reaches
// the whole ground. Round 17 (Han, NL: "mag op de hele tile, dus de volle 16px hoogte van de grond"):
// the wind-wave highlight's own "top 5 rows only" restriction (round 10's `FLOOR_TOP_ROWS_CONST` in
// ForegroundFoliageLayer.jsx) is REMOVED — the highlight now runs across the floor's full tile height too.
// #693 round 11/12 (Han, screenshot of hero/tent/pet: "ik zie dat de meeste items op 1 pixel lager staan,
// dus level ground anchor is 15 (ipv 16)" + round 12: "dit soort settings moet globaal zijn"): the tile
// GRID stays 16px (`FLOOR_TILE`/`FLOOR_T`, unrelated — that's the grass-texture cell size, changing it
// would distort the tile art). The GROUND LINE every standing sprite anchors its `bottom` to reads the ONE
// shared `GROUND_ANCHOR_PX` (worldAnchor.js) — this file just scales it by its own `ZOOM`.
const GROUND_ANCHOR = GROUND_ANCHOR_PX * ZOOM;

// #141 round 12 (Han, NL: "pas alles ook toe op de tiles, de tent, en de boomstam" + "pas de illum ook toe
// op alle achtergronden" — apply the day/night lighting to the tent/trunk/backgrounds too): those are plain
// DOM elements, never drawn through ForegroundFoliageLayer's WebGL shader, so they can't run the shader's
// own darken/reveal math — this is a CSS approximation using the SAME colors/logic instead. `mix-blend-mode:
// multiply` on an opaque overlay computes exactly `base*overlayColor` per channel — the same operation the
// shader's `trueColor*ambientTint` darkening does. `mix-blend-mode: screen` computes `1-(1-base)*(1-blend)`
// — the literal same formula as the shader's `screenBlend()`. No per-pixel normal-map interaction here
// (these elements have no normal maps) — a flat approximation, matching the "can be simple" precedent
// already set for non-focal props.
const AMBIENT_DARK_RGB = [13, 20, 46];      // matches the shader's AMBIENT_DARK_COLOR (0.05,0.08,0.18)*255
// #141 round 13 (Han: "ik ga hooguit 10 lichtbronnen in beeld hebben"): 0..1 colors, the first two entries
// of the `lights` array below (wisp, hero).
// #141 round 17 (Han: "maak het licht van de blauwe wisp rgb (100,100,256) dus heel blauw" — 256 clamped
// to the valid 0..255 byte range, i.e. 255): 100/255, 100/255, 255/255.
const WISP_LIGHT_COLOR01 = [100 / 255, 100 / 255, 1.0];
const HERO_LIGHT_COLOR01 = [1.0, 0.85, 0.25];
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgbCss = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;
const FLOOR_SHEET = { w: 288, h: 576 };
const FLOOR_CELLS = [2, 3, 4, 5, 8, 9, 10, 11].map((col) => ({ row: 1, col }));
// #693 round 7 (Han: "Generate a level of 200 16x16 tiles"): the whole walkable floor is now a FIXED
// 200-tile strip (LEVEL_MIN_X..LEVEL_MAX_X, useRpgLevelState.js's own world-bounds constants — §6c, one
// shared bound) rather than a viewport-sized strip re-rolled on resize.
const LEVEL_TILES = (LEVEL_MAX_X - LEVEL_MIN_X) / FLOOR_TILE;

// Decor.png is 416×544 = 13×17 @ 32px. The tent is 96×64 (3×2 tiles); Han: "de tent is 96x64, linksaan rij
// 2 en 3" — there are TWO side-by-side tents at rows 2-3 (cols 1-3 and cols 4-6, verified visually); "links"
// (left) means the FIRST one, cols 1-3.
const DECOR_SHEET = { w: 416, h: 544 };
const TENT_CELL = { row: 2, col: 1 };
const TENT_W = 3, TENT_H = 2;

// "decor rij 5 heeft ook 3 graspollen... (tile 5;1 5;2, 5;3, 6;1, 7;1) (rij;kolom)" — 5 individual 32×32
// grass-tuft sprites (row;col, 1-indexed), scattered along the floor in the FOREGROUND (Han: "op de
// voorgrond direct boven de dirt renderen" — drawn above/in front of everything else standing on the tiles).
const GRASS_TUFT_CELLS = [
    { row: 5, col: 1 }, { row: 5, col: 2 }, { row: 5, col: 3 }, { row: 6, col: 1 }, { row: 7, col: 1 },
];
// #141 (Han 2026-08-05) — one generated normal map per grass-tuft cell, keyed the same "row-col" way the
// cells themselves are looked up; MUST stay in sync with GRASS_TUFT_CELLS above and with
// scripts/generate-tree-normal-maps.mjs's own GRASS_TUFT_CELLS copy.
const GRASS_NORMAL_BY_CELL = {
    '5-1': grassNormalR5C1Url, '5-2': grassNormalR5C2Url, '5-3': grassNormalR5C3Url,
    '6-1': grassNormalR6C1Url, '7-1': grassNormalR7C1Url,
};

// #141 (Han 2026-08-05, "Factorio-style" tree/grass wind shimmer): Trees_foliage_trunk.png replaces the old
// Tree1.png — 1280×208 = 5 cells of 256×208 (col 1 summer, col 2 apples, col 3 fall, col 4 winter, col 5
// trunk). Trunk renders as a static DOM crop (below, same slot the old full-tree image occupied); the
// foliage cell is rendered through ForegroundFoliageLayer's normal-map shimmer shader instead, alongside
// grass (Han: "render the trunk in the background, and the foliages + grass on a foreground foliage
// layer"). Season selection is hardcoded to summer until a season system exists (Han, stage 1 interview).
const TREE_SHEET = { w: 1280, h: 208 };
const TREE_CELL = { w: 256, h: 208 };
const TRUNK_CELL = { row: 1, col: 5 };
const SUMMER_FOLIAGE_CELL = { row: 1, col: 1 };
// #693 round 12 (Han: "gebruik de grassprieten uit decor.png royaal; dus bijna overal"): round 7 only ever
// placed 5 fixed tufts near spawn. Now scattered across the WHOLE 200-tile floor — one roughly every 3
// world tiles (with jitter so it doesn't read as a mechanical repeat), each a random pick from
// GRASS_TUFT_CELLS. `useMemo(() => ..., [])` in the component below re-rolls this only once per mount, not
// every render.
const GRASS_TUFT_SPACING = FLOOR_TILE * 3;

// World-space placement (was screen-edge-relative before the scrolling camera existed — Han round 7).
// #RAM-level (Han 2026-08-11, "spawn personage op entity hero (staat in het level)"): the Wisp NPC's
// world position now comes from the `.ldtk` file's own Wisp entity marker (ENTITY_WORLD_X, ldtkWorld.js)
// instead of a hand-tuned number — falls back to the old §141-round-8 spot if the file ever loses that
// marker. TREE_X/TENT_X stay hand-tuned: they're legacy-scenery-only positions (no Tree/Tent entity exists
// in the file), used only when `sceneryMode === 'Legacy'`.
const NPC_X = ENTITY_WORLD_X.Wisp ?? -140;
const TREE_X = -220;
const TENT_X = 220;
// #141 round 10 (Han, NL: "om te testen, zet een paar kisten (linker boven cell (32x32) van decor.png) op
// de voorgrond" — crates as a lit foreground-object test case, placed near the tent): edgeLitOnly (only the
// outer few px catch point-light color, solid interior stays dark — see ForegroundFoliageLayer.jsx).
const CRATE_CELL = { row: 1, col: 1 };
const CRATE_SIZE = 32;
const CRATE_POSITIONS = [TENT_X + 60, TENT_X + 100, TENT_X + 130];

// #693 round 7 (Han: "use the background layers, and create a parallax effect... layer order back to
// front: theme background (static), background 4 (0.2), background 3 (0.4), background 2 (0.6),
// background 1 (0.8), level (parallax 1)"): the 5 "Normal BG" layers are, in depth order farthest→nearest,
// layer5 (plain sky gradient — the static THEME backdrop, parallax 0 since it never needs to shift),
// layer4 (distant mountains) → layer1 (dense near trees) — verified visually (file size / silhouette
// density falls off exactly in that order). Declared once here so render order (JSX) and factor stay
// paired — never edit one without the other.
// #141 (Han 2026-08-05, "make all backgrounds the same scale as the rest of the level. There should be 1
// global scaling factor, that's it"): round 8's per-layer `sinkPx` fine-tune (8/16/24/32px, a manual nudge
// compensating for each layer's own bottom-offset quirks) is GONE — every layer now shares exactly the same
// alignment rule (see `HORIZON_PX`/the render block below), no per-layer exceptions.
const PARALLAX_LAYERS = [
    { url: bgLayer4Url, factor: 0.2 },
    { url: bgLayer3Url, factor: 0.4 },
    { url: bgLayer2Url, factor: 0.6 },
    { url: bgLayer1Url, factor: 0.8 },
];
const BG_NATIVE = { w: 1024, h: 346 };
// #141 (Han 2026-08-05) — CORRECTS §693 round 12: HORIZON_PX used to be deliberately native/screen px, NOT
// `ZOOM`-scaled, on the reasoning that a painted backdrop should fill the screen at its own resolution
// rather than the world's to-scale sprite `ZOOM` (flagged explicitly in §140's "tree scale bug" entry).
// Han has now reversed that call: "1 global scaling factor, that's it" — background layers render at
// native × `ZOOM` like every other sprite (see the render block below), and this 64px value is measured in
// that SAME scaled space, not raw native px.
const HORIZON_PX = 64;

// One sheet-cropped tile/prop, given its OWN tile size (defaults to the 32px world grid; the floor passes
// FLOOR_TILE=16). `wTiles`/`hTiles` let it span more than one cell (the tent is 3×2 of the 32px grid).
function SheetCrop({ url, sheet, row, col, tile = TILE, wTiles = 1, hTiles = 1, style }) {
    const t = tile * ZOOM;
    return (
        <div style={{
            width: t * wTiles, height: t * hTiles,
            backgroundImage: `url("${url}")`,
            backgroundPosition: `${-(col - 1) * t}px ${-(row - 1) * t}px`,
            backgroundSize: `${sheet.w * ZOOM}px ${sheet.h * ZOOM}px`,
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
            ...style,
        }} />
    );
}

// #691 debug grid (CLAUDE.md §3a convention — visible interactive/reference regions in debug mode): Han
// explicitly asked for "een 32x32 grid, waarin de tiles geplaatst zijn" so tile alignment can be eyeballed.
// #693 round 7: now drawn in WORLD space (shifted by the camera like everything else) so the grid still
// lines up with tiles/props as the camera scrolls, instead of a screen-fixed grid that would drift.
function DebugGrid({ widthPx, heightPx, cameraX }) {
    const cols = Math.ceil((LEVEL_MAX_X - LEVEL_MIN_X) * ZOOM / T);
    const rows = Math.ceil(heightPx / T);
    const originX = widthPx / 2 - cameraX * ZOOM + LEVEL_MIN_X * ZOOM;
    const lines = [];
    for (let c = 0; c <= cols; c++) lines.push(<div key={`v${c}`} style={{ position: 'absolute', left: originX + c * T, top: 0, width: 1, height: heightPx, background: 'rgba(0,255,255,0.35)' }} />);
    for (let r = 0; r <= rows; r++) lines.push(<div key={`h${r}`} style={{ position: 'absolute', top: heightPx - r * T, left: 0, height: 1, width: widthPx, background: 'rgba(0,255,255,0.35)' }} />);
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>{lines}</div>;
}

// #693 round 7 (Han: "we put a lot of work into classifying sprites and animations; so make use of that
// work when placing assets into the world ... i expect the fox to use the 'walk' animation when
// walking"): world-placed creatures (the pet, the Wisp NPC) now render through the SAME canonical
// `CreatureSprite` (§6d) the Bestiary tab uses, picking whichever classified animation (`idle`/`move`)
// matches the creature's current state — replaces the previous hand-rolled crop math (which also
// couldn't switch animations at all, always showing the idle row regardless of movement).
// #790: `findCreature`/the URL-matching pet lookup moved to bestiaryAssets.js (`findCreatureByName`/
// `findVariantByUrl`) so CharacterDoll's persona-preview pet can share the SAME lookups (§6c).

// #693 round 8 (Han: "zorg dat alle elementen het RPG level dezelfde schaal hebben, dus niet in of
// uitzoomen"): EVERY world sprite (tiles, tree, tent, hero, pet, NPC) now shares exactly ONE scale
// factor — `ZOOM`, native sprite pixels × ZOOM, the same convention `SheetCrop`'s tiles already used.
// The previous per-creature "fit to a fixed target height" (`scale = T*0.9 / crop.h`) gave every
// creature a DIFFERENT effective zoom depending on its own crop size (Fox ≈4.8×, Wisp ≈3.9×, vs the
// hero's own ≈2.98× from CharacterDoll's `height/CROP.h`) — visually inconsistent "some things zoomed
// in, some zoomed out" even though each was individually "fit" to look reasonable in isolation.
// #693 round 9 (Han: "waarom gebruik je de walk / run animatie niet. zorg dat je check voor fly/run/walk-
// animaties; en zorg ook dat als ik die update in de bestiary, dat ze aangepast zijn in het level (single
// source of truth)"): round 7 only ever checked for a 'move' key, which several creatures simply don't
// have (they're classified as 'walk', 'run', or 'fly' instead — see bestiaryManifest.generated.js).
// #693 round 11: `findMoveAnim`/`findIdleAnim` moved to `bestiaryAssets.js` so SheetRpgLayer's `Critter`
// reads the SAME lookup (was independently duplicated here and there, and the Critter copy still only
// checked 'idle' — exactly the kind of drift §6c warns against).
// #693 round 12 (Han: "als een unit een fly of float animatie heeft gebruik de 64x64 center aligned
// animatie... met lichte oscillatie (zoals nu al voor arrow en projectile geldt)" + "als een unit ook een
// sit animatie heeft, heranker dan naar de vloer (dus animatiespecifiek)"): applies automatically to EVERY
// creature classified with a fly/float key, not a hardcoded list — `isFlyingAnim` checks the CURRENTLY
// playing animation's own key, so a creature that also has a 'sit' pose re-anchors to the ground the
// instant it plays THAT animation, with no special-casing needed here. Hover height is one world tile
// above the ground.
// #790 (Han 2026-08-09, SSOT audit): the center-anchor + wobble itself is now handled ENTIRELY inside
// `CreatureSprite` (shared FLYING_HOVER_OSC_RANGE/SPEED, §6d single source of truth) — this used to
// re-derive its OWN separate oscillation on top of CreatureSprite's internal one (a real double-wobble
// bug). Only the "lift one tile above the world's ground line" offset stays here: that's a WORLD-placement
// concern CreatureSprite (a box-relative bestiary/world renderer with no notion of a ground line) can't
// know about, not a creature-intrinsic property.
const HOVER_PX = TILE * ZOOM;
// #RAM-level (Han 2026-08-11, "zoom in/uit zodat de hoogte van het level precies in de viewbox past"):
// `zoom` defaults to the module-level `ZOOM` (legacy scenery's fixed 3x) but callers in LDtk mode pass the
// dynamic per-render zoom instead, so creatures stay correctly scaled to whichever mode is showing.
// #924 (Han 2026-08-12, "critters uit critter sheet kijken naar links, bijgevolg kijkt de butterfly de
// verkeerde kant op"): `facing` here is the CALLER's desired look-direction (1=right, -1=left) — but the
// underlying sprite art itself isn't always drawn facing right by default (most of the critter sheet is
// natively LEFT-facing; `variant.facing` — wired up in bestiaryAssets.js — says which). The actual mirror
// applied is the caller's desired direction XOR the sprite's own native one, not the desired direction
// taken at face value.
function WorldCreature({ variant, moving, frame, facing = 1, zoom = ZOOM }) {
    if (!variant) return null;
    const anim = (moving && findMoveAnim(variant)) || findIdleAnim(variant);
    const cropW = variant.crop.w * zoom, cropH = variant.crop.h * zoom;
    const hoverPx = TILE * zoom;
    const nativeFlip = variant.facing === 'right' ? 1 : -1;
    const scaleX = facing * nativeFlip;
    const transform = isFlyingAnim(anim, variant)
        ? `translate(0px, ${-hoverPx}px) scale(${scaleX}, 1)`
        : `scale(${scaleX}, 1)`;
    return (
        <div style={{ width: cropW, height: cropH, transform }}>
            <CreatureSprite variant={variant} anim={anim} frame={frame} scale={zoom} framed={false} />
        </div>
    );
}

// #924 (Han 2026-08-12, "ik heb entiteiten bird, duck, butterfly toegevoegd... spawn op die plekken";
// LDtk later replaced with generic "critter ground/air/water" markers; round 9: "the critters in the world
// should meet criteria: animal AND nature AND NOT hostile AND (flying/ground/water)"): each spawned marker
// picks a RANDOM classified creature matching that exact criteria, via `findCreaturesByTags`
// (bestiaryAssets.js) — data-driven off the Bestiary's own tagging/being classification (§6c), not a
// hand-picked name list.
// #989 (Han 2026-08-14, "bestiary pass" — "day: spawn enkel critters zonder night. dusk/dawn: spawn alle
// soorten critters. night: spawn enkel critters met night"): reads the SAME `foliageParams.timeOfDay`
// debug toggle (FoliageParamsPanel) the lighting tint already keys off (§141 round 27) — day excludes
// 'night'-tagged creatures, night requires the 'night' tag, dusk-dawn has no restriction either way.
const randomTaggedVariant = (requiredTags, timeOfDay) => {
    const excludeTags = ['hostile'];
    if (timeOfDay === 'day') excludeTags.push('night');
    let pool = findCreaturesByTags(requiredTags, { excludeTags, being: 'animal' });
    if (timeOfDay === 'night') pool = pool.filter((v) => v.tags.includes('night'));
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
};
// #989 ("het level heeft 'water tiles'; ze mogen daarop heen en weer zwemmen, minimaal 16px van de rand,
// geen verticale drift"): the contiguous run of 'water'-kind animated tiles at a swimmer's OWN row (world
// object's `animatedTiles*` — see ldtkWorld.js), minus a 16px margin on each end, so a swim marker's
// wander box never drifts onto land. Falls back to a small fixed span around the spawn point if no water
// tile is found at that exact row (defensive — should not happen for a correctly-placed X_on_water marker).
const WATER_EDGE_MARGIN = 16;
function waterSpanNear(spawnX, spawnY, world) {
    const waterTiles = [...world.animatedTilesBack, ...world.animatedTilesFront].filter((t) => t.kind === 'water');
    const row = waterTiles.filter((t) => Math.abs(t.worldY - spawnY) < world.gridSize);
    if (!row.length) return { minX: spawnX - 16, maxX: spawnX + 16 };
    const minX = Math.min(...row.map((t) => t.worldX)) + WATER_EDGE_MARGIN;
    const maxX = Math.max(...row.map((t) => t.worldX + world.gridSize)) - WATER_EDGE_MARGIN;
    return minX <= maxX ? { minX, maxX } : { minX: spawnX, maxX: spawnX };
}

// #924: one independently-wandering world creature — flying/water critters wander a smooth pseudo-random
// path within a (rangeX × rangeY) box around their spawn point (Han: "vliegt random van a naar b met een
// range van 256x64px"); ground critters idle side-to-side within a much smaller, purely-horizontal range
// (Han: "idle heen en weer met een range van 32x0px"). Reuses `oscillate()` (§6c/§6d — the SAME smooth
// wobble primitive projectiles/flying-creature-hover already use) for the wander path itself instead of a
// new waypoint/pathfinding system — it's already exactly "a bounded, organic, seeded meander over time".
// Position is applied via a REF-driven rAF loop directly on the DOM node (CLAUDE.md §6 "no 60Hz React
// state for position") — only the shared `frame` prop (animation cell, ticking at #923's bpm-coupled
// cadence) comes through as a normal prop, since that only needs to change every ~150ms, not every frame.
// #924 round 2 (Han: "de beesten kleven aan het scherm, maar moeten aan level kleven"): `worldToScreenX`
// used to be read from the CLOSURE captured when this effect last ran (mount time) — since none of the
// effect's own deps change while the camera pans, that closure's baked-in `cameraX` went stale, so the
// wanderer tracked the VIEWPORT instead of the world. Read through a ref (updated every render, same
// convention `zoomRef`/`sizeRef` already use elsewhere in this file) so the rAF loop always sees the
// CURRENT camera transform without needing to restart (which would reset the wander animation).
// #989 (Han 2026-08-14, "bestiary pass" round: "de critters mogen niet 'verspringen', dus bird moet eerst
// terugvliegen naar rustplek. Ik zie nu A->B x C -> D; ik verwacht: A -> B -> C -> D. [...] Kunnen de
// dieren een bezier volgen, die dynamisch wordt gebouwd, zodat er geen 'harde knik' in het pad zit?"): the
// OLD version snapped `dx`/`dy` straight to 0 the instant the duty-cycle flipped to "perched" — an
// instantaneous teleport from wherever the wander curve happened to be back to the spawn point (Han's
// "A->B x C->D", the "x" being that jump). Fixed with an explicit 3-state machine (wander/return/perch):
// entering "return" captures the CURRENT position and eases it back to the spawn point over
// `RETURN_DURATION_MS` along a quadratic bezier (control point offset PERPENDICULAR to the straight
// start->spawn line, "dynamically built" per-return since the start point is wherever wandering stopped)
// instead of a straight cut — continuous motion the whole way, curved rather than linear.
const RETURN_DURATION_MS = 1200;
// #989 ("zwemmen mag behoorlijk langzaam ~4 px per seconde (px is altijd game pixels)"): swimmers use a
// separate, much simpler ping-pong motion (no oscillate/bezier — a real world-space back-and-forth,
// horizontal only) between the water tile span's own edges (`waterSpan`, computed in `waterSpanNear`).
const SWIM_SPEED = 4;
function WorldWanderer({ variant, spawnX, spawnY, rangeX, rangeY, canPerch, swim, waterSpan, frame, zoom, worldToScreenX }) {
    const elRef = useRef(null);
    const facingRef = useRef(1);
    const posRef = useRef({ x: spawnX, y: spawnY });
    const swimDirRef = useRef(1);
    const stateRef = useRef('wander');   // 'wander' | 'return' | 'perch' — flying/bird only (swim/ground skip this)
    const stateSinceRef = useRef(0);
    const returnFromRef = useRef({ x: spawnX, y: spawnY });
    const [perched, setPerched] = useState(false);
    const worldToScreenXRef = useRef(worldToScreenX); worldToScreenXRef.current = worldToScreenX;
    // Stable per-instance seeds so each of several same-type wanderers moves independently, not in lockstep.
    const seedX = useMemo(() => Math.random() * 10000, []);
    const seedY = useMemo(() => Math.random() * 10000, []);
    const perchPhase = useMemo(() => Math.random() * 12000, []);
    // #924 round 2 (Han: "vogel en butterfly gaan veel te snel, verlaag snelheid naar 20% (dus -80%)").
    const WANDER_SPEED = 0.6 * 0.2;

    useEffect(() => {
        if (!variant) return undefined;
        let raf;
        posRef.current = { x: spawnX, y: spawnY };
        stateRef.current = 'wander';
        const tick = () => {
            const now = performance.now();
            if (swim && waterSpan) {
                const dt = 1 / 60;   // rAF-driven, near-enough-constant step at this very low speed
                let nx = posRef.current.x + swimDirRef.current * SWIM_SPEED * dt;
                if (nx >= waterSpan.maxX) { nx = waterSpan.maxX; swimDirRef.current = -1; }
                else if (nx <= waterSpan.minX) { nx = waterSpan.minX; swimDirRef.current = 1; }
                if (nx !== posRef.current.x) facingRef.current = swimDirRef.current;
                posRef.current = { x: nx, y: spawnY };   // "geen verticale drift"
            } else {
                const isDutyPerch = canPerch && ((now + perchPhase) % 12000) > 8000;
                if (isDutyPerch && stateRef.current === 'wander') {
                    stateRef.current = 'return';
                    stateSinceRef.current = now;
                    returnFromRef.current = { ...posRef.current };
                } else if (!isDutyPerch && stateRef.current !== 'wander') {
                    stateRef.current = 'wander';
                }
                if (stateRef.current === 'return') {
                    const t = Math.min(1, (now - stateSinceRef.current) / RETURN_DURATION_MS);
                    const from = returnFromRef.current;
                    const dxTotal = spawnX - from.x, dyTotal = spawnY - from.y;
                    const dist = Math.hypot(dxTotal, dyTotal) || 1;
                    const bow = Math.min(40, dist * 0.35);
                    const ctrl = { x: (from.x + spawnX) / 2 - (dyTotal / dist) * bow, y: (from.y + spawnY) / 2 + (dxTotal / dist) * bow };
                    const u = 1 - t;
                    const nx = u * u * from.x + 2 * u * t * ctrl.x + t * t * spawnX;
                    const ny = u * u * from.y + 2 * u * t * ctrl.y + t * t * spawnY;
                    if (nx !== posRef.current.x) facingRef.current = nx >= posRef.current.x ? 1 : -1;
                    posRef.current = { x: nx, y: ny };
                    if (t >= 1) stateRef.current = 'perch';
                    if (perched) setPerched(false);
                } else if (stateRef.current === 'perch') {
                    posRef.current = { x: spawnX, y: spawnY };
                    if (!perched) setPerched(true);
                } else {
                    const dx = oscillate(seedX, now, rangeX / 2, WANDER_SPEED);
                    const dy = rangeY > 0 ? oscillate(seedY, now, rangeY / 2, WANDER_SPEED) : 0;
                    const nx = spawnX + dx, ny = spawnY - dy;
                    if (nx !== posRef.current.x) facingRef.current = nx >= posRef.current.x ? 1 : -1;
                    posRef.current = { x: nx, y: ny };
                    if (perched) setPerched(false);
                }
            }
            if (elRef.current) {
                elRef.current.style.left = `${worldToScreenXRef.current(posRef.current.x)}px`;
                elRef.current.style.bottom = `${(LEVEL_PX_HEIGHT - posRef.current.y) * zoom}px`;
                // #989 ("zorg dat het anker van de vogels netjes uitlijnt met het anker van de entity in
                // LDtk, dus midden centrum aan midden centrum"): LDtk's own entity anchor is its CENTER, but
                // `bottom` above anchors this wrapper's BOTTOM edge there — translateY(50%) shifts the whole
                // wrapper down by half its own (auto) height so its vertical CENTER lands on spawnY instead.
                elRef.current.style.transform = 'translate(-50%, 50%)';
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [variant, spawnX, spawnY, rangeX, rangeY, canPerch, swim, waterSpan, zoom]);

    if (!variant) return null;
    return (
        <div ref={elRef} style={{ position: 'absolute' }}>
            <WorldCreature variant={variant} moving={!perched} frame={frame} facing={facingRef.current} zoom={zoom} />
        </div>
    );
}

// #693 round 8 (Han: "gebruik dezelfde pet als in de avatar selector") / round 12 (Han, dog clipped: "gebruik
// toch gewoon de sprites uit de bestiary"): the equipped pet sheet IS also classified in the Bestiary
// manifest (every `characterAssets.js` PET_FILES sheet has a matching `SCANNED_CREATURES` entry — Doggy,
// Fox, Wisp) with its OWN correct per-variant crop/frame, unlike this component's hardcoded uniform
// `PET_CROP` (which assumed every pet sheet shares one crop — wrong for Doggy's differently-proportioned
// frame, causing the clipping Han spotted). Kept only as a fallback for the rare pet file that has no
// bestiary match (`findPetVariant` below returns null) so an equipped pet never silently disappears.
function WorldPet({ url, frame, facing = 1, zoom = ZOOM }) {
    if (!url) return null;
    const cropW = PET_CROP.w * zoom, cropH = PET_CROP.h * zoom;
    const cell = frame % 5;   // idle row, 5 frames — the shared convention every pet sheet in this folder uses
    return (
        <div style={{ position: 'relative', width: cropW, height: cropH, overflow: 'hidden', transform: `scale(${facing}, 1)` }}>
            <div style={{ position: 'absolute', left: -PET_CROP.x * zoom, top: -PET_CROP.y * zoom, width: 32 * zoom, height: 32 * zoom, overflow: 'hidden' }}>
                <div style={{
                    width: 32, height: 32, transform: `scale(${zoom})`, transformOrigin: 'top left',
                    backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat', backgroundSize: 'auto',
                    backgroundPosition: `${-cell * 32}px 0px`, imageRendering: 'pixelated',
                }} />
            </div>
        </div>
    );
}

// #RAM-level (Han 2026-08-11, "ik zie ook de slime niet; conform de entiteitslaag"): a purely decorative,
// idle-animated Slime standing at the .ldtk file's own Slime entity marker — no bestiary/SCANNED_CREATURES
// entry exists for Slime BY DESIGN (scripts/generate-bestiary-manifest.mjs's own CURATED_KEYWORDS comment:
// "already hand-curated in enemyAssets.js... skip these so the bestiary never lists the same creature
// twice" — the SAME sprite SheetRpgLayer's real combat slimes use).
// #RAM-level BUG FIX (Han 2026-08-11, "heel schokkerige animatie"): this used to size its crop off
// `SLIME_IDLE.frames` (5) instead of the sheet's REAL column count `SLIME_COLS` (8, matching the WIDEST
// row, SLIME_WALK) — a squashed/misaligned `backgroundSize`, the actual cause of the choppy look. Now uses
// the same `SLIME_COLS`/`SLIME_ROWS` SheetRpgLayer.jsx's own (canonical) slime renderer uses — moved to
// enemyAssets.js as a shared export so there's one source of truth instead of two hand-derived copies (§6d).
function WorldSlime({ frame, zoom = ZOOM }) {
    const cell = frame % SLIME_IDLE.frames;
    const w = SLIME_FRAME.w * zoom, h = SLIME_FRAME.h * zoom;
    return (
        <div style={{ position: 'relative', width: SLIME_CROP.w * zoom, height: SLIME_CROP.h * zoom, overflow: 'hidden' }}>
            <div style={{
                position: 'absolute', left: -SLIME_CROP.x * zoom, top: -SLIME_CROP.y * zoom, width: w, height: h,
                backgroundImage: `url("${SLIME_COLORS.green}")`, backgroundRepeat: 'no-repeat',
                backgroundSize: `${w * SLIME_COLS}px ${h * SLIME_ROWS}px`,
                backgroundPosition: `${-cell * w}px ${-SLIME_IDLE.row * h}px`, imageRendering: 'pixelated',
            }} />
        </div>
    );
}

// #693 round 7 (Han: "level should start moving when the character is at 1/3 of either screen edge" +
// "pressing and holding near screen edge should keep the character moving"): an invisible strip along
// each screen edge — clicking/tapping it (like anywhere else on the ground) walks toward that point, but
// HOLDING it (pointerdown without release) keeps the character moving continuously via
// `setHeldDirection`, the same mechanism held keyboard keys use (§6c).
function EdgeHoldZone({ side, widthPx, onHoldStart, onHoldEnd }) {
    return (
        <div
            onPointerDown={(e) => { e.stopPropagation(); onHoldStart(side === 'left' ? -1 : 1); }}
            onPointerUp={onHoldEnd}
            onPointerLeave={onHoldEnd}
            onPointerCancel={onHoldEnd}
            style={{
                position: 'absolute', top: 0, bottom: 0, [side]: 0, width: widthPx,
                cursor: side === 'left' ? 'w-resize' : 'e-resize', zIndex: 5,
            }}
        />
    );
}

export default function RpgLevelPanel({ characterEditor, rpgLevel, debugMode = false, bpm, timeSignature, context, instruments, onGenerateVoice }) {
    const containerRef = useRef(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [petFrame, setPetFrame] = useState(0);
    // #141 round 2 (Han: "Can you implement 3 maps and let me toggle?" — in the spirit of the Factorio FFF's
    // own color-coded shader debug view): cycles ForegroundFoliageLayer's debugChannel (0 final shimmer, 1
    // raw normal map, 2 wave band alone). Gated on `debugMode` like every other debug affordance (§3a).
    const [foliageDebugChannel, setFoliageDebugChannel] = useState(0);
    // #141 round 11 (Han: "Kun je zorgen dat ik wat van de parameters kan tunen in het level debug ... Zet
    // alle params die je gebruikt in de debug"): every tunable foliage-shader dial, live-editable via the
    // debug panel below, gated on debugMode like every other debug affordance (§3a).
    const [foliageParams, setFoliageParams] = useState(DEFAULT_FOLIAGE_PARAMS);
    const setFoliageParam = (key, value) => setFoliageParams((prev) => ({ ...prev, [key]: value }));
    // #693 round 7: the camera's own world-x (what world position renders at screen center) — separate
    // from `playerX`, which can now roam the full 200-tile level while the camera only follows once the
    // player nears an edge (dead-zone follow, Han's "1/3 of either screen edge").
    const [cameraX, setCameraX] = useState(0);
    // #RAM-level (Han 2026-08-10, "vervang het RPG-level voor het level in RAM level.ldtk" + "maak een
    // tier selector in debug mode... season en city toggler"): the LDtk-driven scenery (`ldtkWorld.js`)
    // is the new DEFAULT — `sceneryMode` exists purely so Han can flip back to the old hand-placed scene
    // in debug mode to visually compare before the legacy code is deleted for good (see the render block
    // below). Season/city/tier default to the file's own authored defaults (Han: lowest tier by default).
    const [sceneryMode, setSceneryMode] = useState('LDtk');
    const [season, setSeason] = useState('Summer');
    const [city, setCity] = useState('No_City');
    const [tavernTier, setTavernTier] = useState('Tent');
    const [bridgeTier, setBridgeTier] = useState('Log');
    // #RAM-level (Han 2026-08-11, "zoom in/uit zodat de hoogte van het level precies in de viewbox past"):
    // in LDtk mode, the display scale is no longer the fixed `ZOOM` module constant — it's WHATEVER makes
    // the level's own native height fill the container exactly (`size.h / LEVEL_PX_HEIGHT`). Legacy mode
    // is untouched (still the fixed `ZOOM`, its art was tuned specifically for that one scale). Computed
    // here (early, before the camera-follow effect below) because that effect's own dead-zone math needs
    // the CURRENT zoom too — it used to hardcode the module `ZOOM`, which silently mismatched the actual
    // on-screen scale as soon as this dynamic zoom diverged from 3, throwing off the dead-zone boundaries
    // (a likely contributor to "de scrolling is schokkerig").
    const dynamicZoom = size.h > 0 ? size.h / LEVEL_PX_HEIGHT : ZOOM;
    const zoom = sceneryMode === 'LDtk' ? dynamicZoom : ZOOM;
    // #RAM-level (Han 2026-08-11, "in debug wil ik in het level een metronoom aan kunnen zetten"): debug-
    // only click track, off by default even when debugMode is on (Han still has to explicitly enable it) —
    // see useDebugMetronome.js for the rAF/AudioContext-clock design. #924 round 4 ("die kan nooit in sync
    // zijn met de wereld timer. Is die uberhaupt hetzelfde tempo..?"): no longer passes the live song
    // bpm/timeSignature — defaults to WORLD_BPM/WORLD_TIME_SIGNATURE (worldClock.js), the SAME fixed tempo
    // every open-world audio system now shares.
    const [metronomeOn, setMetronomeOn] = useState(false);
    const { beat: metronomeBeat, pulseTick: metronomePulse } = useDebugMetronome({
        enabled: debugMode && metronomeOn, context, instruments,
    });
    const { appFps, pixelFps, reportPixelFrame } = useFpsCounters();
    const world = useMemo(
        () => buildWorld({ season, city, tavernTier, bridgeTier }),
        [season, city, tavernTier, bridgeTier],
    );
    // #RAM-level BUG FIX (Han 2026-08-11, "ik zie nu heeeel veel flitsen op alle lagen; totaal niet
    // speelbaar"): `groundTiles={[...world.groundTilesBack, ...world.foliageTilesBack]}` (the flat-fallback
    // merge added this round) built a NEW array literal on every RpgLevelPanel render — and this component
    // re-renders ~60x/sec while the hero moves (`cameraX`/`playerX` state churn). `LdtkScenery`'s own
    // compositing effect is keyed on `[tiles, gridSize]` by REFERENCE, so a fresh array every render tore
    // the canvas down (`setReady(false)` → transparent) and rebuilt it from scratch 60x/sec — the flashing
    // Han saw, on every layer that used this pattern. Memoized here so the combined array only changes when
    // `world` itself changes (season/city/tier toggles), matching how `world.groundTilesBack` etc. were
    // already stable before this merge was introduced.
    const groundAndFoliageBack = useMemo(
        () => [...world.groundTilesBack, ...world.foliageTilesBack],
        [world.groundTilesBack, world.foliageTilesBack],
    );
    const groundAndFoliageFront = useMemo(
        () => [...world.groundTilesFront, ...world.foliageTilesFront],
        [world.groundTilesFront, world.foliageTilesFront],
    );
    // #RAM-level (Han 2026-08-11, "alle foliage lagen (via tag) moeten reageren op de wind"): foliage
    // tiles render as ForegroundFoliageLayer instances (real wind-shimmer) instead of baked into the
    // static ground canvas — see useLdtkFoliageInstances.js for why (runtime normal maps, cached per
    // distinct source tile rather than per placed instance). Called twice — back/front of the Entities
    // layer render in two separate passes (see "houd goed de volgorde van lagen aan" below).
    const foliageInstancesBack = useLdtkFoliageInstances(world.foliageTilesBack, world.gridSize, sceneryMode);
    const foliageInstancesFront = useLdtkFoliageInstances(world.foliageTilesFront, world.gridSize, sceneryMode);
    // #925 round 2 (Han 2026-08-16, "doe ook de diffusie, gewoon een exacte kopie van de logica voor
    // boomblaadjes"): water tiles pulled OUT of `animatedTilesBack/Front` (kind:'water') and rendered
    // through the SAME shimmer shader as foliage instead of `LdtkAnimatedTiles`'s plain DOM frame-cycling
    // — see useLdtkWaterInstances.js for how it still reproduces water's own frame-cycling animation
    // (round 2 fix: per-placement independent offsets, not per-src). Campfire (the other animatedTiles
    // kind) is untouched, still routed to `LdtkAnimatedTiles` below.
    const waterTilesBack = useMemo(() => world.animatedTilesBack.filter((t) => t.kind === 'water'), [world.animatedTilesBack]);
    const waterTilesFront = useMemo(() => world.animatedTilesFront.filter((t) => t.kind === 'water'), [world.animatedTilesFront]);
    const nonWaterAnimatedTilesBack = useMemo(() => world.animatedTilesBack.filter((t) => t.kind !== 'water'), [world.animatedTilesBack]);
    const nonWaterAnimatedTilesFront = useMemo(() => world.animatedTilesFront.filter((t) => t.kind !== 'water'), [world.animatedTilesFront]);
    const waterInstancesBack = useLdtkWaterInstances(waterTilesBack, world.gridSize, sceneryMode);
    const waterInstancesFront = useLdtkWaterInstances(waterTilesFront, world.gridSize, sceneryMode);
    // #925 follow-up (Han 2026-08-16, "alle lagen behalve achtergrond moeten normal map krijgen en
    // reageren op licht"): ground/terrain/building/decor tiles (world.groundTilesBack/Front — everything
    // EXCEPT background parallax layers and foliage, which already have their own lit pipelines) get a
    // normal-map-lit pass too, via a SEPARATE static WebGL layer (LdtkLitGround.jsx) — see that file's own
    // header comment for why this ISN'T the same per-instance approach foliage/water use (thousands of
    // tiles, would repeat the perf problem viewport culling was built to avoid).
    const litGroundTexturesBack = useLdtkLitGroundTextures(world.groundTilesBack, world.gridSize, LEVEL_PX_WIDTH, LEVEL_PX_HEIGHT, sceneryMode);
    const litGroundTexturesFront = useLdtkLitGroundTextures(world.groundTilesFront, world.gridSize, LEVEL_PX_WIDTH, LEVEL_PX_HEIGHT, sceneryMode);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            setSize({ w: width, h: height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Pet idle/walk animation ticks independently of the movement rAF loop (a plain interval is plenty —
    // mirrors useBestiaryEditor's own frame-advance convention).
    // #923 (Han 2026-08-12, "zorg dat de rpg-framerate in world debug hiermee overeenstemt"): this used to
    // be a hardcoded 150ms, completely independent of the song's bpm — a SECOND cadence, drifted from the
    // sheet-music view's own bpm-coupled sprite loop (SheetRpgLayer.jsx). Now reuses that SAME shared
    // formula (§6c/§6d — one cadence, not two hand-tuned copies) so wisp/pet/slime idle animation in the
    // open world matches the in-song sprite cadence at any bpm/timeSignature.
    useEffect(() => {
        const id = setInterval(() => setPetFrame((f) => f + 1), frameMsForBpm(bpm, timeSignature));
        return () => clearInterval(id);
    }, [bpm, timeSignature]);

    const { char } = characterEditor;
    const { playerX, petX, facing, moving, running, petMoving, moveTo, clickNpc, clickSlime, setHeldDirection } = rpgLevel;

    // #693 round 7 (Han: "level should start moving when the character is at 1/3 of either screen edge"):
    // a dead-zone follow camera — the camera only moves once the player's ON-SCREEN position leaves the
    // middle third, then re-centers them back to that 1/3 line; clamped so the viewport never shows past
    // the generated level's own edges.
    const playerXRef = useRef(playerX); playerXRef.current = playerX;
    // #RAM-level BUG FIX (Han 2026-08-11, "ik zie app fps 37, px 0; dat vind ik raar"): this effect used
    // to depend on `[size.w]`, so it tore down and restarted every time the ResizeObserver-driven `size`
    // changed — which, per an existing documented pattern elsewhere in this file, "can genuinely fire more
    // than once as the level's layout settles." Every restart replaced the rAF chain, and `reportPixelFrame`
    // never got a chance to accumulate ticks between restarts — the direct cause of "Pixel FPS" reading 0
    // while "App FPS" (a genuinely stable, empty-deps loop) read a real number. Fixed the same way
    // `useRpgLevelState.js`'s movement loop already does it: mount the rAF chain ONCE (`[]`), read the
    // latest `size`/`zoom` through refs updated every render instead of restarting on every change.
    const sizeRef = useRef(size); sizeRef.current = size;
    const zoomRef = useRef(zoom); zoomRef.current = zoom;
    useEffect(() => {
        let raf;
        const tick = () => {
            // #RAM-level (Han 2026-08-11, "toon ook de pixel art FPS"): this IS the game-world's own
            // render-driving loop (camera follow) — counting its ticks is what "Pixel art FPS" measures,
            // distinct from the generic browser paint rate ("App FPS", useFpsCounters' own rAF).
            reportPixelFrame();
            setCameraX((cam) => {
                const w = sizeRef.current.w;
                if (w === 0) return cam;
                // #RAM-level BUG FIX (Han 2026-08-11, "de scrolling is schokkerig"): was hardcoded to the
                // module `ZOOM` (3) — silently wrong as soon as the dynamic zoom-to-fit (above) diverged
                // from 3, throwing off the dead-zone/clamp math against the ACTUAL on-screen scale.
                const z = zoomRef.current;
                const viewHalfWorld = (w / 2) / z;
                const deadzone = viewHalfWorld / 3;
                const offset = playerXRef.current - cam;
                let next = cam;
                if (offset > deadzone) next = playerXRef.current - deadzone;
                else if (offset < -deadzone) next = playerXRef.current + deadzone;
                const minCam = LEVEL_MIN_X + viewHalfWorld, maxCam = LEVEL_MAX_X - viewHalfWorld;
                if (minCam <= maxCam) next = Math.min(maxCam, Math.max(minCam, next));
                else next = (LEVEL_MIN_X + LEVEL_MAX_X) / 2;   // level narrower than viewport — just center it
                return next;
            });
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    const wispVariant = useMemo(() => findCreatureByName('Wisp'), []);
    // #RAM-level (Han 2026-08-11, "ik zie ook de slime niet; conform de entiteitslaag"): a purely visual
    // Slime, standing at the `.ldtk` file's own Slime entity marker — same treatment as the Wisp NPC
    // (classified creature, idle only, no click handler — no combat here, this is scenery-adjacent, not
    // the real SheetRpgLayer combat slimes).
    const slimeVariant = useMemo(() => findCreatureByName('Slime'), []);
    // #924 round 2 (Han: "Ik heb de LDTK vervangen: er staat nu in: critter ground, critter air, critter
    // water. spawn een random critter met tags: critter + nature + (flying/ground/water)"): a single generic
    // pass over `ENTITY_INSTANCES` for any `Critter_<habitat>` marker (plus the legacy `Bird` identifier,
    // kept as a backward-compatible alias for the flying habitat so levels authored before the LDtk rename
    // still spawn something), each picking ONE random `findCreaturesByTags`-matched creature PER instance,
    // chosen once — not re-randomized on every render. Per-habitat wander box/perch behaviour is the same
    // shape Han specified for Bird ("range 256x64, soms idle") / Duck ("range 32x0, idle heen en weer");
    // `ground` (no spawns exist yet in the current level) reuses the same small-range idle shape as `water`.
    // #989 (Han 2026-08-14, "ik heb voor de duidelijkheid de entity syntax veranderd: X_criteria, dus
    // X_on_water, X_bird_flying, X_critter_flying, X_critter_ground"): entity IDENTIFIERS keyed 1:1 to the
    // new LDtk marker names (was `Critter_<habitat>`/legacy `Bird`). `X_bird_flying` is now its OWN
    // identifier with a NARROWER tag requirement than `X_critter_flying` — "bird: spawn een random critter
    // + bird" + "vogels mogen alleen nog maar bird+flying zijn" (checked again below, since not every
    // bird-tagged creature necessarily has a real fly animation).
    const HABITAT_CONFIG = {
        X_bird_flying: { tags: ['bird', 'flying'], rangeX: 256, rangeY: 64, canPerch: true, swim: false },
        X_critter_flying: { tags: ['critter', 'flying'], rangeX: 256, rangeY: 64, canPerch: true, swim: false },
        X_critter_ground: { tags: ['critter', 'ground'], rangeX: 32, rangeY: 0, canPerch: false, swim: false },
        X_on_water: { tags: ['critter', 'on_water'], rangeX: 0, rangeY: 0, canPerch: false, swim: true },
    };
    const critterWanderers = useMemo(() => {
        const out = [];
        for (const [identifier, cfg] of Object.entries(HABITAT_CONFIG)) {
            for (const pos of (ENTITY_INSTANCES[identifier] ?? [])) {
                let variant = randomTaggedVariant(cfg.tags, foliageParams.timeOfDay);
                // #989 ("birds zonder fly kunnen niet in bird gespawnd worden"): a bird-tagged creature with
                // no actual fly-keyed/labelled animation (`isFlyingAnim` checks key/label/tags — same helper
                // `isFlyingAnim` uses elsewhere) must never be picked for a bird marker specifically.
                if (identifier === 'X_bird_flying' && variant && !variant.animations.some((a) => isFlyingAnim(a, variant))) {
                    variant = null;
                }
                if (!variant) continue;
                out.push({ ...pos, ...cfg, variant, waterSpan: cfg.swim ? waterSpanNear(pos.x, pos.y, world) : null });
            }
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [foliageParams.timeOfDay, world]);
    // #693 round 8 ("gebruik dezelfde pet als in de avatar selector"): whichever pet the player actually
    // equipped in the character screen, resolved via the SAME helper CharacterDoll itself uses (§6c).
    const petUrl = useMemo(() => urlOfLayer('pet', char?.layers?.pet), [char?.layers?.pet]);
    // #693 round 12 (Han, dog clipped in the level: "gebruik toch gewoon de sprites uit de bestiary"): the
    // avatar system's PET_FILES glob and the Bestiary's SCANNED_CREATURES glob resolve the SAME source PNG
    // (both are `import.meta.glob('../assets/ASSORTED/...')`, so Vite gives the same file the same URL) —
    // matching on that URL finds the exact classified variant for whichever pet is actually equipped,
    // instead of assuming every pet sheet shares one hand-tuned crop.
    const petVariant = useMemo(() => findVariantByUrl(petUrl), [petUrl]);
    const walkAnim = ANIMATIONS.find((a) => a.key === 'walk');
    const runAnim = ANIMATIONS.find((a) => a.key === 'run');
    const idleAnim = ANIMATIONS.find((a) => a.key === 'idle');
    const [walkFrame, setWalkFrame] = useState(0);
    // #RAM-level (Han 2026-08-11, "als personage langer dan 2 seconden loopt, ga dan over naar 'run' met
    // dubbele snelheid"): `running` (useRpgLevelState.js) flips once movement has been continuous for 2s;
    // the frame-advance rate doubles along with movement speed so the run cycle doesn't look like the walk
    // cycle just sliding faster across the ground.
    useEffect(() => {
        if (!moving) { setWalkFrame(0); return undefined; }
        const id = setInterval(() => setWalkFrame((f) => f + 1), running ? 60 : 120);
        return () => clearInterval(id);
    }, [moving, running]);

    // #693 round 3: strip the pet LAYER from the doll — it's rendered as its own trailing sprite instead
    // (see the standalone `<WorldCreature>` below), so the doll must not ALSO draw its built-in glued-on
    // pet.
    const noPetChar = useMemo(() => (char ? { ...char, layers: { ...char.layers, pet: null } } : char), [char]);
    const centerX = size.w / 2;
    // #693 round 7: EVERY world object now goes through this ONE conversion (was `centerX + worldX*ZOOM`
    // — a fixed mapping that only worked because the camera never moved) so introducing the scrolling
    // camera couldn't silently miss a spot. Uses `zoom` (mode-aware) rather than the module `ZOOM` directly
    // so hero/pet/Wisp/Slime — shared between both scenery modes — scale correctly in either.
    const worldToScreenX = (worldX) => centerX + (worldX - cameraX) * zoom;
    // LdtkScenery's canvases are drawn in LDtk's own native (unshifted) coordinate space, i.e. their own
    // x=0 = this app's `LEVEL_MIN_X`. `factor` scales how much of the camera's movement a layer reacts to
    // (1 = the ground plane, <1 = a background layer that lags behind — parallax depth).
    const leftPxForFactor = (factor) => centerX + (LEVEL_MIN_X - cameraX * factor) * zoom;
    // LDtk ground-plane tiles (animated water/campfire, foliage) are stored LEVEL-LOCAL (0..pxWid) — this
    // adds the level's own world offset before projecting, so callers can pass a local px straight through
    // exactly like `LdtkScenery`'s canvas positioning does.
    const localWorldToScreenX = (localX) => worldToScreenX(LEVEL_MIN_X + localX);
    // Hero/pet/Wisp/Slime always stand on this line, regardless of which scenery is showing underneath
    // them — LDtk mode uses the hardcoded `STAND_HEIGHT_PX` (own comment above) scaled by the SAME dynamic
    // zoom every other LDtk element uses; legacy mode keeps its own fixed `GROUND_ANCHOR`.
    const standAnchor = sceneryMode === 'LDtk' ? STAND_HEIGHT_PX * zoom : GROUND_ANCHOR;
    const foliageInstanceProps = (inst) => ({
        diffuseUrl: inst.diffuseUrl, diffuseUV: inst.diffuseUV, normalUrl: inst.normalUrl,
        screenX: localWorldToScreenX(inst.localX),
        screenY: size.h - inst.localBottomFromLevelBottom * zoom,
        widthPx: inst.gridSize * zoom, heightPx: inst.gridSize * zoom,
        worldX: inst.localX, worldWidth: inst.gridSize, worldHeight: inst.gridSize,
        // #RAM-level (Han 2026-08-12, "de wave band ziet er heel anders uit in de LDtk wereld... verticaal
        // periodiek met periode 1"): each LDtk foliage tile is only 16px tall on its own, but several are
        // often stacked to form one taller visual object (a pine tree's foliage column) — without this,
        // every tile's wave noise restarted at its own bottom edge, repeating every tile instead of
        // sweeping smoothly up the whole column. `localBottomFromLevelBottom` (already computed above for
        // positioning) IS each tile's true height above the level's real ground — exactly what
        // `groundDistOffset` needs to restore one continuous sweep, matching the legacy world's own
        // single-instance-per-object behaviour (see ForegroundFoliageLayer.jsx's own comment on this).
        groundDistOffset: inst.localBottomFromLevelBottom,
        wave: inst.wave, skew: inst.skew,
    });
    // #RAM-level (Han 2026-08-11, "de animatie is behoorlijk schokkerig... hoe is de performance?"):
    // `ForegroundFoliageLayer` draws ONE `gl.drawArrays` call per instance, not batched (its own file
    // header) — a level with ~1000 foliage tiles (Pine_forest_foliage2 alone has ~800) meant ~1000
    // uncullled draw calls EVERY frame regardless of camera position, the dominant cost behind the choppy
    // animation/scrolling Han measured (LCP 5.37s, INP 816ms). Foliage/animated tiles scattered across the
    // whole level only need to draw the handful currently on-screen — this filters by already-projected
    // `screenX` (a fixed pixel margin around the viewport) right before handing instances to the shader,
    // cutting the typical per-frame instance count from ~1000 to whatever's actually visible.
    // #925 follow-up (Han 2026-08-16, "de watertiles zijn soms niet zichtbaar (despawn), vooral tijdens
    // veel schermbeweging"): widened from 200 — a fast camera pan can move a tile from "just inside the
    // old margin" to "just outside the viewport" across a couple of frames, and the reverse on re-entry;
    // a bigger buffer gives more slack before a genuinely visible tile gets culled. Mitigation, not a
    // structural fix — flag if this doesn't fully resolve it, since cull-margin size can only ever reduce
    // the WINDOW where a fast-enough pan still outruns it, not eliminate it category.
    const CULL_MARGIN_PX = 400;
    const cullToViewport = (instances) => instances.filter((inst) => inst.screenX > -CULL_MARGIN_PX && inst.screenX < size.w + CULL_MARGIN_PX);
    // Same idea for the (cheaper, DOM-based) animated water/campfire overlay — filtered by raw world
    // position before it ever reaches `LdtkAnimatedTiles`, so off-screen tiles don't even mount a
    // per-instance `useNaturalSize` effect.
    const cullTilesToViewport = (tiles) => tiles.filter((t) => {
        const x = localWorldToScreenX(t.worldX);
        return x > -CULL_MARGIN_PX && x < size.w + CULL_MARGIN_PX;
    });

    // #141 round 12: the CSS-approximated day/night tint for DOM elements (backgrounds, tent, trunk) —
    // recomputed each render from the same `globalIllumination` value driving the WebGL shader, so both
    // systems track the same debug-panel slider.
    const domAmbientTint = rgbCss(mixRgb(AMBIENT_DARK_RGB, [255, 255, 255], foliageParams.globalIllumination));
    // Split into "paint" (background/blend-mode, safe to spread) vs. a separate full-screen variant with
    // `inset:0` — spreading `inset:0` into a styled div that ALSO sets explicit left/bottom/width/height
    // (the trunk/tent overlays) would leave `top`/`right:0` fighting those, over-constraining the box.
    const domDarkenPaint = { background: domAmbientTint, mixBlendMode: 'multiply', pointerEvents: 'none' };
    const domDarkenOverlayStyle = { position: 'absolute', inset: 0, ...domDarkenPaint };

    const floorTileIdx = useMemo(
        () => Array.from({ length: LEVEL_TILES }, () => Math.floor(Math.random() * FLOOR_CELLS.length)),
        [],
    );
    // #693 round 12 ("gebruik de grassprieten... royaal, dus bijna overal"): one tuft roughly every 3 world
    // tiles across the WHOLE level span, each with a little jitter and a random cell pick, rolled once per
    // mount (not every render — same convention as `floorTileIdx` above).
    const grassTuftPositions = useMemo(() => {
        const out = [];
        for (let x = LEVEL_MIN_X; x <= LEVEL_MAX_X; x += GRASS_TUFT_SPACING) {
            const jitter = (Math.random() - 0.5) * GRASS_TUFT_SPACING * 0.6;
            const cell = GRASS_TUFT_CELLS[Math.floor(Math.random() * GRASS_TUFT_CELLS.length)];
            out.push({ x: x + jitter, cell });
        }
        return out;
    }, []);

    // #141 round 14 (Han, NL: "ik blijf voor het licht een onderscheid zien tussen de grass tiles en de
    // foliage/boomstam. Ik wil dat ALLE objecten zich hetzelfde gedragen t.o.v. licht (maar niet de
    // achtergrond)" + "ik zie ook geen normal map op de tent en boomstam" + "Is het niet gewoon beter om een
    // normal map ook op het gras te maken? Het level is statisch je kan die bij app-constructie eenmalig
    // opbouwen" — "I keep seeing a difference between the grass tiles and the foliage/trunk regarding light.
    // ALL objects should behave the same w.r.t. light except the background" + "I don't see a normal map on
    // the tent/trunk either" + "isn't it better to build a normal map for the grass too? The level is
    // static, build it once at construction"): the floor, trunk, and tent move from the DOM+CSS-approximation
    // hybrid (§148) into ONE shared WebGL sprite pipeline, same as the tree/tufts/crates — genuinely
    // identical lighting code, not a CSS lookalike. `runtimeTextures` holds the generated diffuse/normal
    // canvases (as data URLs, so they slot into ForegroundFoliageLayer's existing texture-URL loading with
    // zero changes there): a floor diffuse+normal PAIR stitched to match `floorTileIdx`'s EXACT random tile
    // arrangement (not a "representative cell" approximation — the real thing), plus one normal map each
    // for the trunk and tent crops. Built ONCE on mount (Han's own "build it once at construction" idea) via
    // scripts/../utils/runtimeNormalMap.js's browser-side Sobel generator — no new asset files, computed
    // live from the already-loaded source sheets.
    const [runtimeTextures, setRuntimeTextures] = useState(null);
    useEffect(() => {
        // #RAM-level: this whole normal-map build is legacy-scenery-only art (floor/trunk/tent) — skip it
        // entirely in the new LDtk scenery mode rather than doing the work and never using the result.
        if (sceneryMode !== 'Legacy') return undefined;
        let cancelled = false;
        (async () => {
            const [floorImg, treeImg, decorImg] = await Promise.all([
                loadImageEl(floorTiles2Url), loadImageEl(treeSheetUrl), loadImageEl(decorUrl),
            ]);
            if (cancelled) return;

            // Floor — stitch diffuse + normal side by side, one FLOOR_TILE-wide strip per slot, in the SAME
            // order floorTileIdx already picked (so the WebGL sprite's diffuse matches the level exactly,
            // not an approximation).
            const floorW = floorTileIdx.length * FLOOR_TILE;
            const floorDiffuseCv = document.createElement('canvas');
            floorDiffuseCv.width = floorW; floorDiffuseCv.height = FLOOR_TILE;
            const floorDiffuseCtx = floorDiffuseCv.getContext('2d');
            const floorNormalCv = document.createElement('canvas');
            floorNormalCv.width = floorW; floorNormalCv.height = FLOOR_TILE;
            const floorNormalCtx = floorNormalCv.getContext('2d');
            const normalCellCache = new Map();
            floorTileIdx.forEach((idx, i) => {
                const cell = FLOOR_CELLS[idx];
                const sx = (cell.col - 1) * FLOOR_TILE, sy = (cell.row - 1) * FLOOR_TILE;
                floorDiffuseCtx.drawImage(floorImg, sx, sy, FLOOR_TILE, FLOOR_TILE, i * FLOOR_TILE, 0, FLOOR_TILE, FLOOR_TILE);
                const key = `${cell.row}-${cell.col}`;
                let normalCellCv = normalCellCache.get(key);
                if (!normalCellCv) {
                    normalCellCv = normalMapCanvasFromCrop(floorImg, sx, sy, FLOOR_TILE, FLOOR_TILE);
                    normalCellCache.set(key, normalCellCv);
                }
                floorNormalCtx.drawImage(normalCellCv, i * FLOOR_TILE, 0);
            });

            // Trunk + tent — single-crop normal maps (their diffuse stays the existing sheet URL + a crop
            // rect, same convention every other sprite instance already uses).
            const trunkNormalCv = normalMapCanvasFromCrop(
                treeImg, (TRUNK_CELL.col - 1) * TREE_CELL.w, (TRUNK_CELL.row - 1) * TREE_CELL.h, TREE_CELL.w, TREE_CELL.h,
            );
            const tentW = TENT_W * TILE, tentH = TENT_H * TILE;
            const tentNormalCv = normalMapCanvasFromCrop(
                decorImg, (TENT_CELL.col - 1) * TILE, (TENT_CELL.row - 1) * TILE, tentW, tentH,
            );

            if (cancelled) return;
            setRuntimeTextures({
                floorDiffuseUrl: floorDiffuseCv.toDataURL(), floorNormalUrl: floorNormalCv.toDataURL(), floorWidth: floorW,
                trunkNormalUrl: trunkNormalCv.toDataURL(),
                tentNormalUrl: tentNormalCv.toDataURL(), tentW, tentH,
            });
        })();
        return () => { cancelled = true; };
    }, [floorTileIdx, sceneryMode]);

    return (
        <div ref={containerRef}
            onClick={(e) => {
                // #693 ("of op mobile, tap op scherm"): tap/click anywhere on the ground walks the player
                // toward that world position — also works with a mouse, not just touch.
                const rect = containerRef.current.getBoundingClientRect();
                moveTo(cameraX + (e.clientX - rect.left - centerX) / ZOOM);
            }}
            style={{
                position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
                background: 'var(--panel-bg)', cursor: 'pointer',
            }}>
            {/* #141 round 27 (Han, NL: "wind wil ik als apart symbool linksbovenin beeld") — ALWAYS visible
                (not gated on debugMode, unlike the rest of the foliage debug UI below), so Han can see the
                current wind level during normal play too. One 💨 per WIND_LEVEL_PX step (1/2/3) — a simple,
                immediately-readable intensity cue, no new art asset needed. pointerEvents: 'none' so it's
                purely decorative and never intercepts the container's own tap-to-move handler. */}
            <div
                style={{
                    position: 'absolute', top: 8, left: 8, zIndex: 5, display: 'flex', alignItems: 'center', gap: 2,
                    padding: '3px 6px', background: 'rgba(0,0,0,0.5)', borderRadius: 4,
                    fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 13, color: '#fff', pointerEvents: 'none',
                }}
            >
                {'💨'.repeat(WIND_LEVEL_PX[foliageParams.windLevel] || 1)}
            </div>
            {/* #693 round 7 — layer order BACK TO FRONT (Han's exact spec):
                theme background (static) → background 4 (0.2) → background 3 (0.4) → background 2 (0.6)
                → background 1 (0.8) → level (parallax 1: tiles → decoration → characters → pets →
                foreground details). Each parallax layer's own background-position shifts by
                `-cameraX * factor` — the SAME camera that drives every world object below, just scaled
                down per layer so farther layers crawl and nearer ones sweep almost as fast as the level. */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, #8fd0d9, #dff3f5)' }} />
            <img src={bgLayer5Url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
            {/* #141 (Han 2026-08-05, "make all backgrounds the same scale as the rest of the level. There
                should be 1 global scaling factor, that's it" — CORRECTS §693 round 12's deliberate
                "backgrounds render at native res, not ZOOM" choice): every parallax layer now renders at
                native × `ZOOM`, the SAME single scale factor every other sprite in the level uses — no
                separate backdrop-scaling rule. Alignment rule (also Han, this round): "move all elements of
                the background so that the background image 64px from the bottom is aligned with the bottom
                of the level" — each layer's container `bottom` is solved so that the point `HORIZON_PX *
                ZOOM` above the IMAGE's own bottom edge lands exactly at `GROUND_ANCHOR` (the level's floor
                line), not the viewport's bottom edge. `bgBottomOffset` is commonly negative — the image's
                own bottom edge sits BELOW the visible viewport, which is expected once the image is this
                much bigger than before. No more per-layer `sinkPx` — one rule, no exceptions. */}
            {/* #RAM-level: the LDtk scenery brings its OWN 5 background layers (ldtkWorld.js's
                BACKGROUND_LAYERS, rendered via <LdtkScenery> below) — this hand-drawn 4-layer parallax
                system is legacy-mode only, kept for Han's side-by-side comparison (see `sceneryMode`). */}
            {sceneryMode === 'Legacy' && PARALLAX_LAYERS.map(({ url, factor }, i) => {
                const bgW = BG_NATIVE.w * ZOOM, bgH = BG_NATIVE.h * ZOOM;
                const offsetPx = -((cameraX * factor * ZOOM) % bgW);
                // #141 round 4 (Han: "drop the backgrounds a further 32px"): additional fixed nudge below
                // the HORIZON_PX/GROUND_ANCHOR alignment solved above — a flat adjustment, not a new rule.
                const bgBottomOffset = GROUND_ANCHOR - HORIZON_PX * ZOOM - 32;
                return (
                    <div key={i} style={{
                        position: 'absolute', left: 0, right: 0, bottom: bgBottomOffset, height: bgH,
                        overflow: 'hidden', pointerEvents: 'none',
                    }}>
                        <div style={{
                            position: 'absolute', bottom: 0, left: offsetPx - bgW, width: bgW * 3, height: bgH,
                            backgroundImage: `url("${url}")`, backgroundRepeat: 'repeat-x',
                            backgroundSize: `${bgW}px ${bgH}px`, imageRendering: 'pixelated',
                        }} />
                    </div>
                );
            })}
            {/* #141 round 12 (Han, NL: "pas de illum ook toe op alle achtergronden") — one overlay covering
                every background layer rendered so far (this div's own bottom edge sits right where they do,
                and nothing else has been drawn yet at this point in the stack, so the multiply only ever
                touches the backgrounds, never double-darkens anything drawn later). */}
            <div style={domDarkenOverlayStyle} />

            {/* #RAM-level (Han 2026-08-11, "houd goed de volgorde van lagen aan"): scenery whose SOURCE
                layer sits BEHIND the `Entities` layer in the .ldtk file's own paint order (ldtkWorld.js's
                `isInFrontOfEntities`) — terrain/water/grass-bg/buildings/trees/backgrounds. Rendered here,
                BEFORE the hero/pet/Wisp/Slime block below; whatever's genuinely in FRONT of Entities in
                the source file (Grass_decoration_fg edge decor, Blacksmith/Alchemist, interior walls)
                renders in its own second pass AFTER the entities instead (search "front-of-entities"). */}
            {/* #RAM-level (Han 2026-08-11, "foliage laag flitst nogal bij bewegen; bij veel beweging is het
                foliage effect toch te subtiel, dus is slim om dan af te zetten. Maar, toon dan de default
                ongemodificeerde sprite, ipv niets"): foliage tiles are ALWAYS included in the flat ground
                canvas too (merged into `groundTiles` here), not just the WebGL shimmer layer — so there is
                always a plain, correctly-drawn fallback sprite underneath if the shimmer layer's textures
                haven't resolved yet (see `runtimeTextures`/normal-map-generation gate elsewhere).
                #925 follow-up (Han 2026-08-16, "shimmer ook actief als personage beweegt... blijkt niet
                zoveel performance impact te hebben"): the shimmer layer used to unmount entirely while the
                hero walked (a perf tradeoff from round 1 of this feature); Han re-measured and found the
                impact small enough to keep shimmer running while moving too — the `!moving` gate is gone,
                the flat DOM fallback above remains only as the pre-load/no-textures-yet fallback. */}
            {sceneryMode === 'LDtk' && (
                <LdtkScenery
                    groundTiles={groundAndFoliageBack} backgroundLayers={world.backgroundLayers}
                    gridSize={world.gridSize} leftPxForFactor={leftPxForFactor} zoom={zoom} groundAnchor={0}
                />
            )}
            {/* #925 follow-up (Han 2026-08-16): lit ground/building/decor, drawn ON TOP of the flat
                LdtkScenery composite above — covers it with opaque, normal-map-lit pixels once its own
                textures are ready, same "flat fallback stays underneath until the WebGL layer is ready"
                pattern foliage already uses (see that layer's own comment). Back-of-entities = full
                lighting (edgeLitOnly=false). */}
            {sceneryMode === 'LDtk' && litGroundTexturesBack && (
                <LdtkLitGround
                    widthPx={size.w} heightPx={size.h}
                    textures={litGroundTexturesBack} levelPxWidth={LEVEL_PX_WIDTH} levelPxHeight={LEVEL_PX_HEIGHT}
                    leftPx={leftPxForFactor(1)} canvasBottomScreenY={size.h} zoom={zoom}
                    lights={[
                        { worldX: NPC_X, worldHeight: 0, color: WISP_LIGHT_COLOR01 },
                        { worldX: playerX, worldHeight: 32, color: HERO_LIGHT_COLOR01 },
                    ]}
                    params={foliageParams} edgeLitOnly={false} debugChannel={foliageDebugChannel}
                />
            )}
            {sceneryMode === 'LDtk' && (
                <LdtkAnimatedTiles
                    animatedTiles={cullTilesToViewport(nonWaterAnimatedTilesBack)} worldToScreenX={localWorldToScreenX}
                    groundAnchorPx={0} zoom={zoom} levelPxHeight={LEVEL_PX_HEIGHT} gridSize={world.gridSize}
                />
            )}
            {sceneryMode === 'LDtk' && (foliageInstancesBack.length > 0 || waterInstancesBack.length > 0) && (
                <ForegroundFoliageLayer
                    widthPx={size.w}
                    heightPx={size.h}
                    instances={cullToViewport([...foliageInstancesBack, ...waterInstancesBack].map((inst) => foliageInstanceProps(inst)))}
                    debugChannel={foliageDebugChannel}
                    lights={[
                        { worldX: NPC_X, worldHeight: 0, color: WISP_LIGHT_COLOR01 },
                        { worldX: playerX, worldHeight: 32, color: HERO_LIGHT_COLOR01 },
                    ]}
                    params={foliageParams}
                />
            )}

            {/* Decor layer — #141 round 15 (Han: "je hebt de trunk aan de foliage layer toegevoegd. ik wil
                hem verlicht, maar geen onderdeel van foliage. Tent en trunk should be op de decor background
                layer"): a SEPARATE WebGL canvas from the foreground foliage one below — same shared-context
                reasoning (§141's own header comment), just a second stacking slot. This one renders BEFORE
                the hero (floor/trunk/tent sit visually BEHIND the character, same z-order the old DOM blocks
                had), the foreground one renders AFTER (tree canopy/grass tufts, which are meant to poke up
                IN FRONT of the hero). Floor, trunk, and tent are all lit here; only floor and tent actually
                shimmer (`wave` per-instance flag — see ForegroundFoliageLayer's own instance-shape comment):
                trunk is rigid wood (Han: "ik wil hem verlicht, maar geen onderdeel van foliage"), tent
                fabric flaps in the wind like a leaf (Han, after seeing it: "en het tentdoek wel! dat ziet er
                echt fantastisch uit"). DOM fallback (old floor-tile loop + trunk/tent crops) renders ONLY
                until `runtimeTextures` resolves, same brief-flash-on-mount pattern used everywhere else this
                round. */}
            {sceneryMode === 'Legacy' && !runtimeTextures && (
                <div style={{ position: 'absolute', bottom: 0, left: worldToScreenX(LEVEL_MIN_X), display: 'flex' }}>
                    {floorTileIdx.map((idx, i) => {
                        const cell = FLOOR_CELLS[idx];
                        return <SheetCrop key={i} url={floorTiles2Url} sheet={FLOOR_SHEET} tile={FLOOR_TILE} row={cell.row} col={cell.col} />;
                    })}
                </div>
            )}
            {sceneryMode === 'Legacy' && !runtimeTextures && (
                <div style={{
                    position: 'absolute', left: worldToScreenX(TREE_X), bottom: GROUND_ANCHOR,
                    width: TREE_CELL.w * ZOOM, height: TREE_CELL.h * ZOOM, transform: 'translateX(-50%)',
                    backgroundImage: `url("${treeSheetUrl}")`,
                    backgroundPosition: `${-(TRUNK_CELL.col - 1) * TREE_CELL.w * ZOOM}px ${-(TRUNK_CELL.row - 1) * TREE_CELL.h * ZOOM}px`,
                    backgroundSize: `${TREE_SHEET.w * ZOOM}px ${TREE_SHEET.h * ZOOM}px`,
                    backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', pointerEvents: 'none',
                }} />
            )}
            {sceneryMode === 'Legacy' && !runtimeTextures && (
                <SheetCrop
                    url={decorUrl} sheet={DECOR_SHEET} row={TENT_CELL.row} col={TENT_CELL.col}
                    wTiles={TENT_W} hTiles={TENT_H}
                    style={{ position: 'absolute', left: worldToScreenX(TENT_X), bottom: GROUND_ANCHOR, transform: 'translateX(-50%)' }}
                />
            )}
            {/* #141 round 22 CRITICAL BUG FIX (Han: "1 frame later zie ik alle elementen die geïmpacteerd
                worden door de normal map verdwijnen" — deterministic, not network-flaky): this used to also
                require `size.w > 0`. ResizeObserver-driven `size` starts at {w:0,h:0} and can genuinely
                fire more than once as the level's layout settles (fonts/images finishing, parent flex/grid
                recalculating) — every time that toggled `size.w > 0` false→true, THIS ELEMENT UNMOUNTED AND
                REMOUNTED, tearing down and recreating a whole WebGL context each time WITHOUT ever
                explicitly releasing the old one (`canvas.getContext('webgl')` was just abandoned to GC) —
                a few churns after mount can exhaust the browser's ~8-16-context-per-page budget (worse now
                that round 15 doubled this to TWO canvases per level), after which EVERY further mount
                attempt gets `gl = null` and silently renders nothing, forever. Fix: never unmount this for a
                mere size change — `widthPx`/`heightPx` safely accept 0 (an empty canvas draws nothing, no
                error) and the component's own `useLayoutEffect` already resizes the backing store in place
                without recreating the context. `runtimeTextures` still gates rendering (its own instances
                reference `runtimeTextures.*` directly, which would be undefined before it resolves). */}
            {sceneryMode === 'Legacy' && runtimeTextures && (
                <ForegroundFoliageLayer
                    widthPx={size.w}
                    heightPx={size.h}
                    instances={[
                        {
                            kind: 'floor',
                            diffuseUrl: runtimeTextures.floorDiffuseUrl, normalUrl: runtimeTextures.floorNormalUrl,
                            diffuseUV: [0, 0, 1, 1],
                            screenX: worldToScreenX((LEVEL_MIN_X + LEVEL_MAX_X) / 2),
                            screenY: size.h,
                            widthPx: (LEVEL_MAX_X - LEVEL_MIN_X) * ZOOM, heightPx: FLOOR_T,
                            worldX: (LEVEL_MIN_X + LEVEL_MAX_X) / 2, worldWidth: LEVEL_MAX_X - LEVEL_MIN_X,
                            worldHeight: FLOOR_TILE,
                        },
                        {
                            diffuseUrl: treeSheetUrl,
                            diffuseUV: [
                                (TRUNK_CELL.col - 1) * TREE_CELL.w / TREE_SHEET.w,
                                (TRUNK_CELL.row - 1) * TREE_CELL.h / TREE_SHEET.h,
                                TRUNK_CELL.col * TREE_CELL.w / TREE_SHEET.w,
                                TRUNK_CELL.row * TREE_CELL.h / TREE_SHEET.h,
                            ],
                            normalUrl: runtimeTextures.trunkNormalUrl,
                            screenX: worldToScreenX(TREE_X), screenY: size.h - GROUND_ANCHOR,
                            widthPx: TREE_CELL.w * ZOOM, heightPx: TREE_CELL.h * ZOOM,
                            worldX: TREE_X, worldWidth: TREE_CELL.w, worldHeight: TREE_CELL.h,
                            wave: false,
                        },
                        {
                            diffuseUrl: decorUrl,
                            diffuseUV: [
                                (TENT_CELL.col - 1) * TILE / DECOR_SHEET.w,
                                (TENT_CELL.row - 1) * TILE / DECOR_SHEET.h,
                                (TENT_CELL.col - 1) * TILE / DECOR_SHEET.w + runtimeTextures.tentW / DECOR_SHEET.w,
                                (TENT_CELL.row - 1) * TILE / DECOR_SHEET.h + runtimeTextures.tentH / DECOR_SHEET.h,
                            ],
                            normalUrl: runtimeTextures.tentNormalUrl,
                            screenX: worldToScreenX(TENT_X), screenY: size.h - GROUND_ANCHOR,
                            widthPx: runtimeTextures.tentW * ZOOM, heightPx: runtimeTextures.tentH * ZOOM,
                            worldX: TENT_X, worldWidth: runtimeTextures.tentW, worldHeight: runtimeTextures.tentH,
                        },
                    ]}
                    debugChannel={foliageDebugChannel}
                    lights={[
                        { worldX: NPC_X, worldHeight: 0, color: WISP_LIGHT_COLOR01 },
                        // #141 round 19 (Han: "zet het lampje van de persona op 32px boven het anker") —
                        // the hero's light now sits 32 native px above GROUND_ANCHOR, not at foot level.
                        { worldX: playerX, worldHeight: 32, color: HERO_LIGHT_COLOR01 },
                    ]}
                    params={foliageParams}
                />
            )}

            {/* Whisp NPC — "zet de whisp NPC neer... als ik erop klik loopt personage erheen, en verschijnt
                een tekstballon". Same classified Wisp creature the Bestiary tab uses (§6d — one asset/one
                classification, two render contexts), fixed in the world — it has no 'move' animation
                (never walks itself) so `WorldCreature` falls back to its 'idle'. stopPropagation so
                clicking it doesn't ALSO walk-to-tap-point on top of walk-to-NPC. */}
            {wispVariant && (
                <div
                    onClick={(e) => { e.stopPropagation(); clickNpc(); }}
                    style={{ position: 'absolute', left: worldToScreenX(NPC_X), bottom: standAnchor, transform: 'translateX(-50%)', cursor: 'pointer' }}
                >
                    <WorldCreature variant={wispVariant} moving={false} frame={petFrame} facing={1} zoom={zoom} />
                </div>
            )}

            {/* Slime — #RAM-level (Han 2026-08-11, "ik zie ook de slime niet; conform de entiteitslaag"):
                standing at the Slime entity marker, same z-slot as Wisp/hero/pet.
                #922 (Han 2026-08-12, "je hebt nu de lorem ipsum op de slime van het level gezet, maar ik wou
                die op de slime van de RPG-wereld"): now clickable, same walk-then-talk pattern as the Wisp
                (stopPropagation so it doesn't ALSO walk-to-tap-point on top of walk-to-Slime). */}
            {sceneryMode === 'LDtk' && ENTITY_WORLD_X.Slime != null && (
                <div
                    onClick={(e) => { e.stopPropagation(); clickSlime(); }}
                    style={{ position: 'absolute', left: worldToScreenX(ENTITY_WORLD_X.Slime), bottom: standAnchor, transform: 'translateX(-50%)', cursor: 'pointer' }}
                >
                    <WorldSlime frame={petFrame} zoom={zoom} />
                </div>
            )}

            {/* #924 (Han 2026-08-12, "spawn een random critter met tags: critter + nature +
                (flying/ground/water)"): one WorldWanderer per spawned Critter_* marker (see
                critterWanderers above) — each variant already carries its own habitat's wander box/perch
                behaviour from HABITAT_WANDER. */}
            {sceneryMode === 'LDtk' && critterWanderers.map((w, i) => (
                <WorldWanderer
                    key={`critter-${i}`} variant={w.variant} spawnX={w.x} spawnY={w.y}
                    rangeX={w.rangeX} rangeY={w.rangeY} canPerch={w.canPerch}
                    swim={w.swim} waterSpan={w.waterSpan}
                    frame={petFrame} zoom={zoom} worldToScreenX={worldToScreenX}
                />
            ))}

            {/* Hero — same paper-doll renderer as everywhere else (§6d), standing on the floor, walking
                left/right (A/D, arrow keys, edge-hold, or tap-to-move) via `useRpgLevelState`. `noPetChar`:
                the pet is rendered as its OWN trailing sprite below, so the doll's built-in pet LAYER is
                stripped here to avoid double-drawing it glued to the character's hip. */}
            {char && (
                <div style={{
                    position: 'absolute', left: worldToScreenX(playerX), bottom: standAnchor,
                    transform: `translateX(-50%) scaleX(${facing})`,
                }}>
                    {/* #924 (Han 2026-08-12, "mijn personage heeft geen animatie. Hero moet ook idle
                        animatie tonen"): idle frame was hardcoded to 0 — a single frozen frame, no cycling
                        at all. `petFrame` already ticks at the shared bpm-coupled idle cadence
                        (frameMsForBpm, #923) for the pet/wisp/slime — reused here (§6c) instead of a second
                        idle-frame counter. */}
                    <CharacterDoll char={noPetChar} anim={moving ? (running ? runAnim : walkAnim) : idleAnim} frame={moving ? walkFrame : petFrame} height={HERO_CROP.h * zoom} />
                </div>
            )}

            {/* Pet — trails the player at a delay (useRpgLevelState's PET_FOLLOW_GAP leash). #693 round 8
                ("gebruik dezelfde pet als in de avatar selector") / round 12 (dog clipped: "gebruik toch
                gewoon de sprites uit de bestiary"): renders via `WorldCreature` + its classified bestiary
                variant (`petVariant`, resolved above by URL match) whenever one is found — same renderer,
                same walk/run/fly-aware animation lookup as every other classified creature — falling back
                to the old hand-rolled `WorldPet`/`PET_CROP` convention only if a pet sheet has no bestiary
                match. Renders nothing if no pet is equipped. */}
            {petUrl && (
                <div style={{ position: 'absolute', left: worldToScreenX(petX), bottom: standAnchor, transform: 'translateX(-50%)' }}>
                    {petVariant
                        ? <WorldCreature variant={petVariant} moving={petMoving} frame={petFrame} facing={petX <= playerX ? 1 : -1} zoom={zoom} />
                        : <WorldPet url={petUrl} frame={petFrame} facing={petX <= playerX ? 1 : -1} zoom={zoom} />}
                </div>
            )}

            {/* #RAM-level (Han 2026-08-11, "houd goed de volgorde van lagen aan"): scenery whose SOURCE
                layer sits IN FRONT of the `Entities` layer in the .ldtk file's own paint order —
                Grass_decoration_fg's edge decoration, Blacksmith/Alchemist buildings, interior walls.
                Rendered AFTER hero/pet/Wisp/Slime so it correctly draws on top of them, mirroring the
                source file exactly (see the back-of-entities pass earlier in this render for the rest). */}
            {sceneryMode === 'LDtk' && (
                <LdtkScenery
                    groundTiles={groundAndFoliageFront} gridSize={world.gridSize}
                    leftPxForFactor={leftPxForFactor} zoom={zoom} groundAnchor={0}
                />
            )}
            {/* #925 follow-up (Han 2026-08-16): front-of-entities ground/building/decor — edge-lit only
                (Han: "de lagen vóór entities worden alleen belicht op 2px van de rand"), see
                EDGE_LIGHT_PIXELS in foliageLightingGLSL.js. */}
            {sceneryMode === 'LDtk' && litGroundTexturesFront && (
                <LdtkLitGround
                    widthPx={size.w} heightPx={size.h}
                    textures={litGroundTexturesFront} levelPxWidth={LEVEL_PX_WIDTH} levelPxHeight={LEVEL_PX_HEIGHT}
                    leftPx={leftPxForFactor(1)} canvasBottomScreenY={size.h} zoom={zoom}
                    lights={[
                        { worldX: NPC_X, worldHeight: 0, color: WISP_LIGHT_COLOR01 },
                        { worldX: playerX, worldHeight: 32, color: HERO_LIGHT_COLOR01 },
                    ]}
                    params={foliageParams} edgeLitOnly={true} debugChannel={foliageDebugChannel}
                />
            )}
            {sceneryMode === 'LDtk' && (
                <LdtkAnimatedTiles
                    animatedTiles={cullTilesToViewport(nonWaterAnimatedTilesFront)} worldToScreenX={localWorldToScreenX}
                    groundAnchorPx={0} zoom={zoom} levelPxHeight={LEVEL_PX_HEIGHT} gridSize={world.gridSize}
                />
            )}
            {sceneryMode === 'LDtk' && (foliageInstancesFront.length > 0 || waterInstancesFront.length > 0) && (
                <ForegroundFoliageLayer
                    widthPx={size.w}
                    heightPx={size.h}
                    instances={cullToViewport([...foliageInstancesFront, ...waterInstancesFront].map((inst) => foliageInstanceProps(inst)))}
                    debugChannel={foliageDebugChannel}
                    lights={[
                        { worldX: NPC_X, worldHeight: 0, color: WISP_LIGHT_COLOR01 },
                        { worldX: playerX, worldHeight: 32, color: HERO_LIGHT_COLOR01 },
                    ]}
                    params={foliageParams}
                />
            )}

            {/* #141 round 12's CSS "reveal near a light" radial-gradient glow — gated behind debugMode in
                round 15, then REMOVED ENTIRELY in round 16 (Han: "haal de glow ook buiten debug mode weg" —
                after round 15's debug-only gating still wasn't what he wanted): every object in the scene is
                genuinely lit through the WebGL shader now (floor/trunk/tent/canopy/tufts/crates, rounds
                10-15), so this CSS approximation adds nothing even as a debug aid — deleted, not just hidden. */}

            {/* Foreground foliage — #141 (Han 2026-08-05): tree canopy + grass tufts + crates, drawn LAST
                (highest z-order) so canopy/tufts sit in front of the hero, "direct boven de dirt". Floor/
                trunk/tent moved OUT to the separate decor canvas above (round 15) — see its own comment for
                why. Grass keeps the SAME scatter (§693 round 12) and bottom-center `GROUND_ANCHOR` anchor.
                #141 round 15 (Han, NL: "let op! de kisten op de voorgrond moeten NIET shimmeren"): crates
                pass `wave: false` — lit via the same normal-map/edge-lit pipeline as everything else, but
                never run the wind-wave highlight (they're solid wood, not foliage). #141 round 22: no longer
                gated on `size.w > 0` — see the decor canvas's own comment above for why that gate caused
                repeated WebGL-context-destroying remounts as `size` settled. #RAM-level: legacy-scenery
                only now — the LDtk scenery's own trees/foliage render flat via `LdtkScenery`'s canvas (no
                shimmer yet, a known follow-up noted in docs/architecture.md). */}
            {sceneryMode === 'Legacy' && (
            <ForegroundFoliageLayer
                widthPx={size.w}
                heightPx={size.h}
                instances={[
                    {
                        diffuseUrl: treeSheetUrl,
                            diffuseUV: [
                                (SUMMER_FOLIAGE_CELL.col - 1) * TREE_CELL.w / TREE_SHEET.w,
                                (SUMMER_FOLIAGE_CELL.row - 1) * TREE_CELL.h / TREE_SHEET.h,
                                SUMMER_FOLIAGE_CELL.col * TREE_CELL.w / TREE_SHEET.w,
                                SUMMER_FOLIAGE_CELL.row * TREE_CELL.h / TREE_SHEET.h,
                            ],
                            normalUrl: treeFoliageSummerNormalUrl,
                            screenX: worldToScreenX(TREE_X), screenY: size.h - GROUND_ANCHOR,
                            widthPx: TREE_CELL.w * ZOOM, heightPx: TREE_CELL.h * ZOOM,
                            worldX: TREE_X, worldWidth: TREE_CELL.w, worldHeight: TREE_CELL.h,
                            // #141 round 16 (Han: "kun je iets proberen dat random skew en distort doet") —
                            // wind-bend, scoped to canopy + grass tufts only per Han's own answer (not the
                            // tent, which shimmers but stays taut on its poles).
                            skew: true,
                        },
                        ...grassTuftPositions.map(({ x, cell }) => ({
                            diffuseUrl: decorUrl,
                            diffuseUV: [
                                (cell.col - 1) * TILE / DECOR_SHEET.w, (cell.row - 1) * TILE / DECOR_SHEET.h,
                                cell.col * TILE / DECOR_SHEET.w, cell.row * TILE / DECOR_SHEET.h,
                            ],
                            normalUrl: GRASS_NORMAL_BY_CELL[`${cell.row}-${cell.col}`],
                            screenX: worldToScreenX(x), screenY: size.h - GROUND_ANCHOR,
                            widthPx: TILE * ZOOM, heightPx: TILE * ZOOM,
                            worldX: x, worldWidth: TILE, worldHeight: TILE,
                            skew: true,
                        })),
                        // Crates — #141 round 10 (Han, NL: "om te testen, zet een paar kisten op de
                        // voorgrond"), a lit foreground-object test case. edgeLitOnly: true — the solid
                        // crate interior stays dark, only its outer rim catches wisp/hero light. wave: false
                        // (round 15) — solid wood, doesn't shimmer like foliage.
                        ...CRATE_POSITIONS.map((x) => ({
                            diffuseUrl: decorUrl,
                            diffuseUV: [
                                (CRATE_CELL.col - 1) * CRATE_SIZE / DECOR_SHEET.w, (CRATE_CELL.row - 1) * CRATE_SIZE / DECOR_SHEET.h,
                                CRATE_CELL.col * CRATE_SIZE / DECOR_SHEET.w, CRATE_CELL.row * CRATE_SIZE / DECOR_SHEET.h,
                            ],
                            normalUrl: crateNormalUrl,
                            screenX: worldToScreenX(x), screenY: size.h - GROUND_ANCHOR,
                            widthPx: CRATE_SIZE * ZOOM, heightPx: CRATE_SIZE * ZOOM,
                            worldX: x, worldWidth: CRATE_SIZE, worldHeight: CRATE_SIZE,
                            edgeLitOnly: true,
                            wave: false,
                        })),
                    ]}
                    debugChannel={foliageDebugChannel}
                    lights={[
                        { worldX: NPC_X, worldHeight: 0, color: WISP_LIGHT_COLOR01 },
                        // #141 round 19 (Han: "zet het lampje van de persona op 32px boven het anker") —
                        // the hero's light now sits 32 native px above GROUND_ANCHOR, not at foot level.
                        { worldX: playerX, worldHeight: 32, color: HERO_LIGHT_COLOR01 },
                    ]}
                    params={foliageParams}
                />
            )}

            {/* #693 round 7 edge-hold zones — 15% of the viewport width on each side; press-and-hold keeps
                the character (and camera, once it nears the deadzone edge) moving continuously. */}
            {size.w > 0 && <EdgeHoldZone side="left" widthPx={size.w * 0.15} onHoldStart={setHeldDirection} onHoldEnd={() => setHeldDirection(0)} />}
            {size.w > 0 && <EdgeHoldZone side="right" widthPx={size.w * 0.15} onHoldStart={setHeldDirection} onHoldEnd={() => setHeldDirection(0)} />}

            {debugMode && size.w > 0 && <DebugGrid widthPx={size.w} heightPx={size.h} cameraX={cameraX} />}

            {/* #141 round 2 (Han: "implement 3 maps and let me toggle") — cycles the foliage shader's debug
                channel, gated on debugMode like every other debug affordance in this file (§3a). #141 round
                5 (Han: "add a 'disable' button to the shimmer debug options") — 4th state. #141 round 6
                CORRECTION (Han: "'disable' disables the full layer; i just want to see the raw unmodified
                sprites"): `<ForegroundFoliageLayer>` is now ALWAYS rendered (never conditionally skipped) —
                "Disabled" is handled INSIDE the shader (uDebugChannel===3: sprites render their raw diffuse
                texture unmodified, the floor overlay renders fully transparent) so the underlying,
                un-shimmered art is still visible instead of the whole layer vanishing. */}
            {debugMode && (
                <button
                    onClick={(e) => { e.stopPropagation(); setFoliageDebugChannel((c) => (c + 1) % 4); }}
                    style={{
                        position: 'absolute', top: 8, right: 8, zIndex: 6,
                        padding: '4px 8px', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 12,
                        background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)',
                        borderRadius: 4, cursor: 'pointer',
                    }}
                >
                    Foliage debug: {['Shimmer', 'Normal map', 'Wave band', 'Disabled'][foliageDebugChannel]}
                </button>
            )}

            {debugMode && (
                <FoliageParamsPanel params={foliageParams} onChange={setFoliageParam} onReset={() => setFoliageParams(DEFAULT_FOLIAGE_PARAMS)} />
            )}

            {/* #RAM-level (Han 2026-08-10, "maak een tier selector in debug mode... season en city
                toggler"): season/city/building-tier all live-toggle `buildWorld()`'s inputs, re-compositing
                the LDtk scenery canvases (see `world` useMemo above). Same `LevelPicker` pattern as the
                Wind/Time-of-day pickers above (§141) — one button-group per axis, gated on debugMode. */}
            {debugMode && (
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        position: 'absolute', top: 40, left: 8, zIndex: 6, width: 160,
                        background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 4, padding: 8,
                    }}
                >
                    <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 12, color: '#fff', marginBottom: 6 }}>
                        <strong>World</strong>
                    </div>
                    <LevelPicker label="Scenery" levels={{ Legacy: 0, LDtk: 0 }} value={sceneryMode} onChange={setSceneryMode} />
                    <LevelPicker label="Season" levels={Object.fromEntries(SEASONS.map((s) => [s, 0]))} value={season} onChange={setSeason} />
                    <LevelPicker label="City" levels={Object.fromEntries(CITY_OPTIONS.map((c) => [c, 0]))} value={city} onChange={setCity} />
                    <LevelPicker label="Tavern tier" levels={Object.fromEntries(TAVERN_TIERS.map((t) => [t, 0]))} value={tavernTier} onChange={setTavernTier} />
                    <LevelPicker label="Bridge tier" levels={Object.fromEntries(BRIDGE_TIERS.map((t) => [t, 0]))} value={bridgeTier} onChange={setBridgeTier} />
                    <LevelPicker
                        label="Metronome" levels={{ Off: 0, On: 0 }}
                        value={metronomeOn ? 'On' : 'Off'} onChange={(v) => setMetronomeOn(v === 'On')}
                    />
                    {/* #RAM-level (Han 2026-08-11, "verplaats wind en time of day togglers naar links World
                        settings"): moved out of FoliageParamsPanel (top-right) — same params/onChange, just
                        relocated. */}
                    <LevelPicker
                        label="Time of day"
                        levels={TIME_OF_DAY_ILLUM}
                        value={foliageParams.timeOfDay}
                        onChange={(level) => {
                            setFoliageParam('timeOfDay', level);
                            setFoliageParam('globalIllumination', TIME_OF_DAY_ILLUM[level]);
                        }}
                    />
                    <LevelPicker
                        label="Wind"
                        levels={WIND_LEVEL_PX}
                        value={foliageParams.windLevel}
                        onChange={(level) => {
                            setFoliageParam('windLevel', level);
                            setFoliageParam('skewAmount', WIND_LEVEL_PX[level]);
                            setFoliageParam('stretchAmount', WIND_LEVEL_PX[level]);
                        }}
                    />
                    {/* #RAM-level (Han 2026-08-11, "voeg twee knoppen toe: treble melody en bass melody...
                        genereert random melodieën, volgens de ingestelde settings... vergeet niet altijd
                        progression mee te genereren"): each button regenerates ONLY that one voice
                        (`useMelodyState.js`'s `randomizeAll` extended with per-voice `treble`/`bass`/
                        `percussion` overrides — the chord progression is always regenerated too, since
                        `chords` isn't overridden to `false`) and immediately plays it back, reusing the
                        app's real generation/playback pipeline — no new audio path. */}
                    {onGenerateVoice && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                            <button
                                onClick={(e) => { e.stopPropagation(); onGenerateVoice('treble'); }}
                                style={{
                                    flex: 1, fontSize: 10, padding: '4px 0', cursor: 'pointer',
                                    background: 'rgba(255,255,255,0.15)', color: '#fff',
                                    border: '1px solid rgba(255,255,255,0.4)', borderRadius: 3,
                                }}
                            >
                                Treble melody
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onGenerateVoice('bass'); }}
                                style={{
                                    flex: 1, fontSize: 10, padding: '4px 0', cursor: 'pointer',
                                    background: 'rgba(255,255,255,0.15)', color: '#fff',
                                    border: '1px solid rgba(255,255,255,0.4)', borderRadius: 3,
                                }}
                            >
                                Bass melody
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* #RAM-level (Han 2026-08-11, "ik wil de metronoom zien spelen, en een teller (1,2,3,4)...
                gebruik een pixel font" + "toon ook de pixel art FPS en de app FPS"): a small always-on-top
                debug readout — swinging pendulum (flips angle on every beat edge, `metronomePulse` from
                useDebugMetronome.js forces the CSS transition to restart each beat) + the 1-4 counter, both
                gated on the metronome actually being on; FPS gated on debugMode alone since it's useful
                regardless of the metronome. NOTE: no bundled pixel-art font asset exists in this project
                yet (checked — only "pixel art" CHARACTER art, no pixel TYPEFACE) — styled with a bold
                monospace + wide letter-spacing as a blocky stand-in; swap the fontFamily for a real pixel
                font file if/when Han adds one. */}
            {debugMode && (
                <div style={{
                    position: 'absolute', top: 8, right: 90, zIndex: 6, display: 'flex', alignItems: 'center', gap: 8,
                    padding: '4px 8px', background: 'rgba(0,0,0,0.6)', borderRadius: 4, pointerEvents: 'none',
                }}>
                    {metronomeOn && (
                        <>
                            <div key={metronomePulse} style={{
                                width: 3, height: 18, background: '#fff', borderRadius: 2, transformOrigin: 'bottom center',
                                transform: `rotate(${metronomeBeat % 2 === 0 ? -18 : 18}deg)`,
                                transition: 'transform 0.08s ease-out',
                            }} />
                            <span style={{
                                fontFamily: '"Courier New", monospace', fontWeight: 700, fontSize: 18,
                                letterSpacing: 2, color: '#fff', textShadow: '1px 1px 0 #000',
                            }}>
                                {metronomeBeat}
                            </span>
                        </>
                    )}
                    <span style={{ fontFamily: '"Courier New", monospace', fontSize: 10, color: '#8f8' }}>
                        App {appFps} / Px {pixelFps}
                    </span>
                </div>
            )}
        </div>
    );
}

// #141 round 11 (Han: "Kun je zorgen dat ik wat van de parameters kan tunen in het level debug? Zoals
// 'noise' - band width, speed, blend mode, etc. Zet alle params die je gebruikt in de debug"): every
// tunable ForegroundFoliageLayer uniform, live. NOT included: GRAIN_CELL (shader const, not a uniform —
// rarely needs tuning at native-pixel granularity).
// #141 round 19 (Han, NL: "voeg nog wat color blend modes toe. zoals, hue, sat, color, lum, color dodge"):
// modes 4-8, shared by both the Wave and Light blend-mode selects (same index convention as 0-3 already
// were) — see ForegroundFoliageLayer.jsx's compositeBlend() for the actual math.
const BLEND_MODE_LABELS = ['Screen', 'HSV boost', 'Additive', 'Mix', 'Hue', 'Saturation', 'Color', 'Luminosity', 'Color Dodge'];
function ParamSlider({ label, value, min, max, step, onChange }) {
    return (
        <label style={{ display: 'block', marginBottom: 6, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 11, color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{label}</span><span>{typeof value === 'number' ? value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : value}</span>
            </div>
            <input
                type="range" min={min} max={max} step={step} value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                style={{ width: '100%' }}
            />
        </label>
    );
}
function ParamSelect({ label, value, onChange }) {
    return (
        <label style={{ display: 'block', marginBottom: 6, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 11, color: '#fff' }}>
            <div>{label}</div>
            <select value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} style={{ width: '100%' }}>
                {BLEND_MODE_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
            </select>
        </label>
    );
}
// #141 round 26 (Han, NL: "ik wil wind skew en stretch beperken laten afhangen van het weer. maak in debug
// een knopje 'wind': low, med, high. met skew en stretch 1, 2 en 3 pixels"): a reusable 3-level button-group
// picker — used for Wind (skew/stretch px) and round 27's Time-of-day (global illumination). Picking a
// level sets EVERY param key in `levels[level]` together, so a picker's displayed selection can never drift
// out of sync with the underlying param(s) it controls.
function LevelPicker({ label, levels, value, onChange }) {
    return (
        <label style={{ display: 'block', marginBottom: 6, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 11, color: '#fff' }}>
            <div>{label}</div>
            <div style={{ display: 'flex', gap: 4 }}>
                {Object.keys(levels).map((level) => (
                    <button
                        key={level}
                        onClick={() => onChange(level)}
                        style={{
                            flex: 1, fontSize: 10, padding: '3px 0', cursor: 'pointer',
                            background: value === level ? '#fff' : 'rgba(255,255,255,0.15)',
                            color: value === level ? '#000' : '#fff',
                            border: '1px solid rgba(255,255,255,0.4)', borderRadius: 3,
                        }}
                    >
                        {level}
                    </button>
                ))}
            </div>
        </label>
    );
}
const WIND_LEVEL_PX = { low: 1, med: 2, high: 3 };
// #141 round 27 (Han, NL: "maak een tweede toggler: night: illum 0.1 / dusk-dawn 0.33, day global illum 1")
// — a second LevelPicker, replacing the old continuous "Global illumination" slider with 3 named presets.
const TIME_OF_DAY_ILLUM = { night: 0.1, 'dusk-dawn': 0.33, day: 1 };
function FoliageParamsPanel({ params, onChange, onReset }) {
    // #141 round 26 (Han, NL: "ik wil in debug het settings menu kunnen in- en uitklappen") — local, not
    // lifted to RpgLevelPanel state: purely a debug-UI display preference, nothing else reads it.
    // #RAM-level (Han 2026-08-11, "zet foliage params uit by default"): starts collapsed now.
    const [collapsed, setCollapsed] = useState(true);
    return (
        <div
            onClick={(e) => e.stopPropagation()}
            style={{
                position: 'absolute', top: 40, right: 8, zIndex: 6, width: 220,
                maxHeight: collapsed ? 'none' : '80%', overflowY: collapsed ? 'visible' : 'auto',
                background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 4, padding: 8,
            }}
        >
            <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 12, color: '#fff', marginBottom: collapsed ? 0 : 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong
                    onClick={() => setCollapsed((c) => !c)}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                    {collapsed ? '▸' : '▾'} Foliage params
                </strong>
                {!collapsed && <button onClick={onReset} style={{ fontSize: 10, cursor: 'pointer' }}>reset</button>}
            </div>
            {!collapsed && (<>
            <ParamSlider label="Wave A: noise scale" value={params.noiseScale} min={0.01} max={0.2} step={0.005} onChange={(v) => onChange('noiseScale', v)} />
            <ParamSlider label="Wave A: speed" value={params.waveSpeed} min={0} max={1} step={0.01} onChange={(v) => onChange('waveSpeed', v)} />
            {/* #141 round 15 (Han: "maak de noise scale en speed van de twee waves apart tunebaar") — wave
                B's own scale/speed, independent from wave A's above. */}
            <ParamSlider label="Wave B: noise scale" value={params.noiseScaleB} min={0.01} max={0.2} step={0.005} onChange={(v) => onChange('noiseScaleB', v)} />
            <ParamSlider label="Wave B: speed" value={params.waveSpeedB} min={0} max={1} step={0.01} onChange={(v) => onChange('waveSpeedB', v)} />
            <ParamSlider label="Wave: steps" value={params.waveSteps} min={2} max={10} step={1} onChange={(v) => onChange('waveSteps', v)} />
            <ParamSlider label="Wave: dither amount" value={params.ditherAmount} min={0} max={1} step={0.01} onChange={(v) => onChange('ditherAmount', v)} />
            <ParamSlider label="Wave: highlight strength" value={params.highlightStrength} min={0} max={0.6} step={0.01} onChange={(v) => onChange('highlightStrength', v)} />
            <ParamSelect label="Wave: blend mode" value={params.waveBlendMode} onChange={(v) => onChange('waveBlendMode', v)} />
            <ParamSelect label="Wave: blend mode 2 (averaged)" value={params.waveBlendMode2} onChange={(v) => onChange('waveBlendMode2', v)} />
            <hr style={{ opacity: 0.3, margin: '8px 0' }} />
            <ParamSlider label="Light: radius" value={params.lightRadius} min={50} max={800} step={10} onChange={(v) => onChange('lightRadius', v)} />
            <ParamSlider label="Light: height radius" value={params.lightHeightRadius} min={50} max={800} step={10} onChange={(v) => onChange('lightHeightRadius', v)} />
            <ParamSlider label="Light: strength" value={params.lightStrength} min={0} max={1.5} step={0.01} onChange={(v) => onChange('lightStrength', v)} />
            <ParamSlider label="Light: hue pull / tint" value={params.huePull} min={0} max={1} step={0.01} onChange={(v) => onChange('huePull', v)} />
            <ParamSelect label="Light: blend mode" value={params.lightBlendMode} onChange={(v) => onChange('lightBlendMode', v)} />
            {/* #141 round 15 (Han: "light: maak een secundaire blend mode") — averaged 50/50 with the mode
                above, mirroring the wave's own dual-blend-mode pair. */}
            <ParamSelect label="Light: blend mode 2 (averaged)" value={params.lightBlendMode2} onChange={(v) => onChange('lightBlendMode2', v)} />
            {/* #141 round 26 (Han: "voeg een slider toe die naast normal map illumination nog 'flat
                illumination' doet; radial vanaf de lichtbron... moet worden opgeteld bij de normal map
                ilum") — a purely distance-based glow, ADDED to the existing directional term, not blended. */}
            <ParamSlider label="Light: flat illumination" value={params.flatIllumination} min={0} max={1} step={0.01} onChange={(v) => onChange('flatIllumination', v)} />
            {/* #141 round 19 (Han: "maak ook een slider voor normal map strength voor illumination") — 1.0
                full relief (current look), 0.0 fully flat "from above". The floor ignores this entirely and
                is ALWAYS flat (Han: "normal map van de floor tiles mag toch globaal 'van boven' zijn"). */}
            <ParamSlider label="Normal map strength" value={params.normalStrength} min={0} max={1} step={0.01} onChange={(v) => onChange('normalStrength', v)} />
            {/* #925 follow-up (Han 2026-08-16, "de 100% witte pixels mogen een witte 'kop'/glans geven op
                het water") — global params, see ForegroundFoliageLayer's own uWhiteCapThreshold/Strength
                comment for why this isn't water-specific despite the water motivation. */}
            <ParamSlider label="White cap: threshold" value={params.whiteCapThreshold} min={0.5} max={1} step={0.01} onChange={(v) => onChange('whiteCapThreshold', v)} />
            <ParamSlider label="White cap: strength" value={params.whiteCapStrength} min={0} max={1} step={0.01} onChange={(v) => onChange('whiteCapStrength', v)} />
            {/* #RAM-level (Han 2026-08-11, "verplaats wind en time of day togglers naar links World
                settings"): Wind and Time-of-day moved to the World debug panel (top-left) — see that
                panel's own LevelPicker calls, driven by the SAME `foliageParams`/`setFoliageParam`. */}
            </>)}
        </div>
    );
}
