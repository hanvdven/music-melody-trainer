import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CharacterDoll, { CROP as HERO_CROP, PET_CROP } from './CharacterDoll';
import { ANIMATIONS, urlOfLayer } from '../../model/characterAssets';
// #1028 follow-up (Han 2026-08-17, HMR bug fix): moved to its own file — see CreatureSprite.jsx header.
import { CreatureSprite } from './CreatureSprite';
import { frameMsForBpm } from '../sheet-music/SheetRpgLayer';
import { findMoveAnim, findIdleAnim, isFlyingAnim, findCreatureByName, findVariantByUrl, findCreaturesByTags } from '../../model/bestiaryAssets';
import { GROUND_ANCHOR_PX } from '../../model/worldAnchor';
import { SLIME_FRAME, SLIME_CROP, SLIME_IDLE, SLIME_COLS, SLIME_ROWS, SLIME_COLORS } from '../../model/enemyAssets';
import { loadImageEl, normalMapCanvasFromCrop } from '../../utils/runtimeNormalMap';
import WorkerNpc from './WorkerNpc';
import useWorkerNpcAudio from '../../hooks/useWorkerNpcAudio';
import useWorkerHitState from '../../hooks/useWorkerHitState';
import useFrameLoop from '../../hooks/useFrameLoop';
import { WORKER_SOUND_CONFIG } from '../../model/workerSoundConfig';
import { LEVEL_MIN_X, LEVEL_MAX_X } from '../../hooks/useRpgLevelState';
import floorTiles2Url from '../../assets/ASSORTED/tiles/tiles/Floor Tiles2.png';
import treeSheetUrl from '../../assets/ASSORTED/tiles/trees/Trees_foliage_trunk.png';
import decorUrl from '../../assets/ASSORTED/tiles/int_ext_decoration/Decor.png';
import ForegroundFoliageLayer, { DEFAULT_FOLIAGE_PARAMS } from './ForegroundFoliageLayer';
import WaterReflectionLayer from './WaterReflectionLayer';
import useLdtkWaterInstances from './useLdtkWaterInstances';
import LdtkScenery from './LdtkScenery';
import LdtkAnimatedTiles from './LdtkAnimatedTiles';
import useLdtkFoliageAtlas from './useLdtkFoliageAtlas';
import FoliageInstancingTest from './FoliageInstancingTest';
import useDebugMetronome, { useFpsCounters } from './useDebugMetronome';
import { buildWorld, SEASONS, CITY_OPTIONS, TAVERN_TIERS, BRIDGE_TIERS, ENTITY_WORLD_X, ENTITY_INSTANCES, WATER_STAND_HEIGHT_PX, WATER_REFLECTION_AXIS_PX, LEVEL_PX_HEIGHT, LEVEL_PX_WIDTH, groundHeightAt, reflectableTilesFor } from '../../levels/ldtk/ldtkWorld';
import useLdtkLitGroundTextures from './useLdtkLitGroundTextures';
import LdtkLitGround from './LdtkLitGround';
import useWorldAmbientMusic from '../../hooks/useWorldAmbientMusic';
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
import bgLayer1Url from '../../assets/ASSORTED/backgrounds/Normal BG/Background layers_layer 1.png';
import bgLayer2Url from '../../assets/ASSORTED/backgrounds/Normal BG/Background layers_layer 2.png';
import bgLayer3Url from '../../assets/ASSORTED/backgrounds/Normal BG/Background layers_layer 3.png';
import bgLayer4Url from '../../assets/ASSORTED/backgrounds/Normal BG/Background layers_layer 4.png';
import bgLayer5Url from '../../assets/ASSORTED/backgrounds/Normal BG/Background layers_layer 5.png';

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
// Perf (Han 2026-08-27, "elke schermbreedte vertraagt de animatie even"): hoisted to module scope so
// `useCulledAnimatedTiles` below (a module-level helper hook, needs it at definition time) and the
// component's own cull margin stay the exact same value — see that hook's own comment for the full story.
const CULL_MARGIN_PX = 400;

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
// #1032 round 8 (Han: "het kampvuur heeft nog geen lichtbron"): warm orange/amber, matching a real fire.
const CAMPFIRE_LIGHT_COLOR01 = [1.0, 0.55, 0.15];
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
// #UI-overhaul (Han 2026-08-27): the ONE correct Wisp sprite — same file RpgLevelBottomPanel's dialogue
// portrait resolves (`wispUrl` there). Kept as a literal string on both sides (the bestiary manifest
// resolves this exact `public/` path to a variant `url`).
const WISP_URL = '/ASSORTED/characters/animals/pets/Pet companion/Wisp.png';
// #UI-overhaul (Han 2026-08-27, "clickzone moet 16x16 zijn"): the wisp/slime interaction hit box, in
// game px.
const HIT_ZONE_GPX = 16;
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
// #1032 round 4 bugfix (Han: "die gridlines passen niet precies op level tiles. Gebruik je universele
// schalingfactor?"): confirmed — this used the module-level fixed `ZOOM`/`T` (legacy scenery's 3x)
// instead of the CALLER's actual current zoom, which in LDtk mode is `dynamicZoom` (viewport-responsive,
// see `zoom` in RpgLevelPanel), a DIFFERENT value in practice. Every gridline was off by that ratio — not
// a rounding error, a wrong scale factor entirely. Now takes `zoom` as a prop and derives its own tile
// size from it (`TILE * zoom`), matching every other LDtk-mode element in this file.
function DebugGrid({ widthPx, heightPx, cameraX, zoom }) {
    const t = TILE * zoom;
    const cols = Math.ceil((LEVEL_MAX_X - LEVEL_MIN_X) * zoom / t);
    const rows = Math.ceil(heightPx / t);
    const originX = widthPx / 2 - cameraX * zoom + LEVEL_MIN_X * zoom;
    const lines = [];
    for (let c = 0; c <= cols; c++) lines.push(<div key={`v${c}`} style={{ position: 'absolute', left: originX + c * t, top: 0, width: 1, height: heightPx, background: 'rgba(0,255,255,0.35)' }} />);
    for (let r = 0; r <= rows; r++) lines.push(<div key={`h${r}`} style={{ position: 'absolute', top: heightPx - r * t, left: 0, height: 1, width: widthPx, background: 'rgba(0,255,255,0.35)' }} />);
    // #1032 round 6 bugfix (Han: "de lijn staat op 32px... ik had duidelijk 24px gezegd. Dit is een
    // visuele keuze van mij... zet de lijn op 28px"): NOT per-pond tile-derived (round 4's approach was
    // wrong per Han's own correction) — a single line at his own fixed `WATER_REFLECTION_AXIS_PX`,
    // matching what `EntityReflection`/`WaterReflectionLayer` actually mirror around now.
    lines.push(<div key="reflection-axis" style={{ position: 'absolute', bottom: WATER_REFLECTION_AXIS_PX * zoom, left: 0, height: 2, width: widthPx, background: 'red' }} />);
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
// #995 (Han 2026-08-17, "jitter is vooral in overgang tussen rest en fly... dat komt waarschijnlijk door het
// verschillende anker van de sprite"): confirmed — `hoverPx` used to be baked into the SAME transform as the
// facing-flip `scaleX`, snapping instantly by a full tile the moment `isFlyingAnim` toggles (idle<->move
// anim swap has no in-between frame). Split into two nested transforms: the OUTER div keeps the facing-flip
// `scale` instant (unchanged — a direction change should still snap, not animate through a squash), the
// INNER div carries only the vertical hover offset with its own CSS transition, so exactly the rest<->fly
// anchor jump (and only that) becomes a smooth glide instead of a hard pop.
function WorldCreature({ variant, moving, frame, facing = 1, zoom = ZOOM }) {
    if (!variant) return null;
    const anim = (moving && findMoveAnim(variant)) || findIdleAnim(variant);
    const cropW = variant.crop.w * zoom, cropH = variant.crop.h * zoom;
    const hoverPx = TILE * zoom;
    const nativeFlip = variant.facing === 'right' ? 1 : -1;
    const scaleX = facing * nativeFlip;
    const flying = isFlyingAnim(anim, variant);
    return (
        <div style={{ width: cropW, height: cropH, transform: `scale(${scaleX}, 1)` }}>
            <div style={{
                width: '100%', height: '100%',
                transform: flying ? `translateY(${-hoverPx}px)` : 'translateY(0px)',
                transition: 'transform 200ms ease',
            }}>
                <CreatureSprite variant={variant} anim={anim} frame={frame} scale={zoom} framed={false} />
            </div>
        </div>
    );
}

// #1093 (Han 2026-08-20, open-world worker NPCs): a MODULE-level component (not defined inline inside
// RpgLevelPanel's render body, unlike the local `EntityReflection` below) — `useWorkerHitState` holds
// real state (active/idle) across renders; a function redefined every render would give React a new
// component identity each time and force-remount this, silently resetting the hit/idle state machine on
// every RpgLevelPanel re-render. `EntityReflection` (which has no state of its own) is passed in as a
// prop specifically so this can still use the parent's ponds-aware reflection logic without needing to
// live inside the parent's closure itself.
function WorkerNpcSlot({ variant, hitConfig, petFrame, timeSignature, context, triggerBell, zoom, worldX, worldToScreenX, standAnchorFor, EntityReflection, getListenerX }) {
    const { anim, frame } = useWorkerHitState(variant, hitConfig, petFrame, timeSignature, context, triggerBell, worldX, getListenerX);
    if (!variant || !anim) return null;
    return (
        <>
            <div style={{ position: 'absolute', left: worldToScreenX(worldX), bottom: standAnchorFor(worldX), transform: 'translateX(-50%)' }}>
                <WorkerNpc variant={variant} anim={anim} frame={frame} zoom={zoom} />
            </div>
            <EntityReflection worldX={worldX}>
                <WorkerNpc variant={variant} anim={anim} frame={frame} zoom={zoom} />
            </EntityReflection>
        </>
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
// #995 (Han 2026-08-17, "kies uniform random variant"): two-stage pick — a random SPECIES from the pool
// (uniform per species, unaffected by how many colours each has), then a random COLOUR variant within that
// species (findCreaturesByTags now returns the whole creature, not one fixed representative variant).
const randomTaggedVariant = (requiredTags, timeOfDay) => {
    const excludeTags = ['hostile'];
    if (timeOfDay === 'day') excludeTags.push('night');
    const tags = timeOfDay === 'night' ? [...requiredTags, 'night'] : requiredTags;
    const pool = findCreaturesByTags(tags, { excludeTags, being: 'animal' });
    if (!pool.length) return null;
    const creature = pool[Math.floor(Math.random() * pool.length)];
    return creature.variants[Math.floor(Math.random() * creature.variants.length)];
};
// #989 ("het level heeft 'water tiles'; ze mogen daarop heen en weer zwemmen, minimaal 16px van de rand,
// geen verticale drift"): the contiguous run of 'water'-kind animated tiles at a swimmer's OWN row (world
// object's `animatedTiles*` — see ldtkWorld.js), minus a 16px margin on each end, so a swim marker's
// wander box never drifts onto land. Falls back to a small fixed span around the spawn point if no water
// tile is found at that exact row (defensive — should not happen for a correctly-placed X_on_water marker).
// #1039 bugfix (Han 2026-08-17, "een eend heel ver naar rechts, niet goed geplaatst op het water"): the
// SAME LEVEL_MIN_X coordinate-space bug documented above for point lights (§1024) and water audio
// (§925/useWorldAmbientMusic's nearestWaterX) — `t.worldX` is CANVAS-LOCAL (0-based, tileFromLdtkEntry's
// `offsetX = lvl.worldX - LEVEL_MIN_X`) while `spawnX` (an X_on_water marker's `__worldX`) is ABSOLUTE.
// This function was never touched by the #1024 fix pass, so the duck's swim bounds landed off by exactly
// LEVEL_MIN_X, pushing its wander box far outside the actual water tiles.
// #1042 bugfix (Han 2026-08-17, "eenden zwemmen eindeloos naar rechts... water tiles van het derde type,
// dus niet de randen"): the water tileset has 3 visually distinct row-bands, each its own animation pair
// — `withAnimMeta`'s `logicalRow` (ldtkWorld.js, already computed for the animation cycling, §6c reuse)
// is exactly `Math.floor(src[1] / 32)`, i.e. 0/1/2 for those 3 bands. First interview round picked
// logicalRow 1 (the "waterfall" ripple texture) based on a verbal description, but the actual placed
// level data contradicted that: in Level_1 (where both duck markers actually sit, abs X 208/320),
// logicalRow 1 is only 4 decorative tiles far outside the ducks' area, while logicalRow 2 is a coherent
// 20-tile pond spanning abs X 192-336 — exactly bracketing both ducks. logicalRow 2 is the real swimmable
// open water; 0/1 are shoreline/waterfall-accent decoration, not swimmable area.
// #1042 round 2 bugfix (Han 2026-08-17, "misschien is dit aan de hand: je neemt het meest rechter
// watertile als grens? maar er zijn meerdere water-entiteiten; dus zo gaan eenden ook al het 'land
// tussen water' op"): confirmed exactly right — the previous version took the global min/max across
// EVERY tile at a similar Y row, bridging across separate, unrelated ponds elsewhere in the level (e.g.
// Level_1's small pond and Level_3's much larger one both sit at the same relative row) and everything
// (land included) between them. Fixed by walking outward from the tile nearest spawnX, only while
// consecutive tiles are truly ADJACENT (gap <= gridSize) — this isolates the single CONTIGUOUS pond the
// duck actually spawned in, the same "derive the real connected body, don't just take extremes" principle
// as an autotile flood-fill.
const WATER_EDGE_MARGIN = 16;
const OPEN_WATER_LOGICAL_ROW = 2;
function waterSpanNear(spawnX, spawnY, world) {
    const waterTiles = [...world.animatedTilesBack, ...world.animatedTilesFront]
        .filter((t) => t.kind === 'water' && t.logicalRow === OPEN_WATER_LOGICAL_ROW);
    const row = waterTiles.filter((t) => Math.abs((t.worldY) - spawnY) < world.gridSize);
    if (!row.length) return { minX: spawnX - 16, maxX: spawnX + 16 };
    const abs = row.map((t) => t.worldX + LEVEL_MIN_X).sort((a, b) => a - b);
    let seedIdx = 0, bestDist = Infinity;
    abs.forEach((x, i) => { const d = Math.abs(x - spawnX); if (d < bestDist) { bestDist = d; seedIdx = i; } });
    let lo = seedIdx, hi = seedIdx;
    while (lo > 0 && abs[lo] - abs[lo - 1] <= world.gridSize) lo--;
    while (hi < abs.length - 1 && abs[hi + 1] - abs[hi] <= world.gridSize) hi++;
    const minX = abs[lo] + WATER_EDGE_MARGIN;
    const maxX = abs[hi] + world.gridSize - WATER_EDGE_MARGIN;
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
// #1092 follow-up (Han 2026-08-20, "bird animaties: overgang is OK, mooi lineair, maar nog niet
// perfect, maak de overgang iets trager tussen stijgen en vliegen, 3x zo traag"): "mooi lineair"
// confirms this IS the transition Han means — `t` progresses at a constant rate (no easing), matching
// his description exactly. Tripled: 1200ms -> 3600ms.
const RETURN_DURATION_MS = 1200 * 3;
// #989 ("zwemmen mag behoorlijk langzaam ~4 px per seconde (px is altijd game pixels)"): swimmers use a
// separate, much simpler ping-pong motion (no oscillate/bezier — a real world-space back-and-forth,
// horizontal only) between the water tile span's own edges (`waterSpan`, computed in `waterSpanNear`).
const SWIM_SPEED = 4;
// #1092 (Han 2026-08-19, "Birds should only perch on 'bird slots'"): nearest-free-slot search — a
// bird claims whichever authored `X_bird_slot` marker (see `birdSlots` above) is closest to its
// CURRENT position among those not already claimed by another bird (`claimedSet`, shared across every
// WorldWanderer instance). Returns -1 when every slot is taken (or none exist), so the caller can fall
// back to the bird's own spawn point — never two birds on one slot, never a bird stuck unable to perch.
function nearestFreeBirdSlot(slots, claimedSet, fromX, fromY) {
    let bestIndex = -1, bestDist = Infinity;
    for (let i = 0; i < slots.length; i++) {
        if (claimedSet.has(i)) continue;
        const dist = Math.hypot(slots[i].x - fromX, slots[i].y - fromY);
        if (dist < bestDist) { bestDist = dist; bestIndex = i; }
    }
    return bestIndex;
}

function WorldWanderer({ variant, spawnX, spawnY, rangeX, rangeY, canPerch, swim, waterSpan, onGround, frame, zoom, worldToScreenX, isBird, birdId, birdPositionsRef, birdSlots, birdSlotClaimsRef, globalIllumination = 1 }) {
    const elRef = useRef(null);
    const facingRef = useRef(1);
    const posRef = useRef({ x: spawnX, y: spawnY });
    const swimDirRef = useRef(1);
    const stateRef = useRef('wander');   // 'wander' | 'return' | 'perch' — flying/bird only (swim/ground skip this)
    const stateSinceRef = useRef(0);
    const returnFromRef = useRef({ x: spawnX, y: spawnY });
    const [perched, setPerched] = useState(false);
    // #993 rework (Han: bird keeps showing its idle/perch pose after flying off the nest again): `tick`
    // below lives inside a `useEffect` whose deps deliberately omit `perched` (kept stable so the rAF loop
    // isn't torn down/recreated every render) — reading the closed-over `perched` STATE var inside that
    // one-time closure means it's forever frozen at its `useState(false)` mount-time value, so the
    // `if (perched) setPerched(false)` "leaving the nest" transitions below were dead code after the first
    // perch. `perchedRef` gives `tick` a live value to read/write; `setPerched` is still called (only on
    // actual transitions) purely to trigger the render that flips `moving`/the animation clip.
    const perchedRef = useRef(false);
    // #1092: where THIS bird is actually headed/pinned while returning/perched — its own spawn point
    // by default (unchanged behaviour for non-birds and for levels with no X_bird_slot markers yet),
    // or a claimed slot position when `birdSlots` has entries. `claimedSlotIndexRef` remembers WHICH
    // slot (by index into `birdSlots`) this instance owns, so it releases the exact right one later.
    const perchTargetRef = useRef({ x: spawnX, y: spawnY });
    const claimedSlotIndexRef = useRef(null);
    const worldToScreenXRef = useRef(worldToScreenX); worldToScreenXRef.current = worldToScreenX;
    // Stable per-instance seeds so each of several same-type wanderers moves independently, not in lockstep.
    const seedX = useMemo(() => Math.random() * 10000, []);
    const seedY = useMemo(() => Math.random() * 10000, []);
    const perchPhase = useMemo(() => Math.random() * 12000, []);
    // #924 round 2 (Han: "vogel en butterfly gaan veel te snel, verlaag snelheid naar 20% (dus -80%)").
    const WANDER_SPEED = 0.6 * 0.2;

    // Perf (#1162, Fase 8): migrated onto the shared `useFrameLoop` ticker (docs/architecture.md §328) —
    // each WorldWanderer instance (birds/critters, several mounted concurrently) used to run its OWN
    // independent rAF chain; now they all dispatch off one shared ticker. The one-time init (reset
    // posRef/stateRef/etc. on mount or when spawn/range/etc. change) and the extra unmount cleanup
    // (release bird registry entry + slot claim) stay in a plain `useEffect` with the SAME deps — only the
    // requestAnimationFrame/cancelAnimationFrame mechanics moved to `useFrameLoop`.
    useEffect(() => {
        if (!variant) return undefined;
        posRef.current = { x: spawnX, y: spawnY };
        stateRef.current = 'wander';
        perchedRef.current = false;
        perchTargetRef.current = { x: spawnX, y: spawnY };
        claimedSlotIndexRef.current = null;
        return () => {
            // #1162 Fase 8: `birdPositionsRef`/`birdSlotClaimsRef` are long-lived shared registries owned by
            // RpgLevelPanel (not DOM refs), so their `.current` container identity is stable for the whole
            // level's lifetime — the exhaustive-deps "ref value may have changed by cleanup time" warning
            // doesn't apply here (that check is aimed at DOM refs nulled on unmount).
            // eslint-disable-next-line react-hooks/exhaustive-deps
            if (isBird && birdPositionsRef) birdPositionsRef.current.delete(birdId);
            // #1092: release a held slot claim on unmount too, or it would stay permanently locked
            // (e.g. the level closing while this bird happened to be perched).
            if (claimedSlotIndexRef.current != null && birdSlotClaimsRef) {
                // eslint-disable-next-line react-hooks/exhaustive-deps
                birdSlotClaimsRef.current.delete(claimedSlotIndexRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [variant, spawnX, spawnY, rangeX, rangeY, canPerch, swim, waterSpan, zoom]);

    useFrameLoop(() => {
        if (!variant) return;
        {
            const now = performance.now();
            if (swim && waterSpan) {
                const dt = 1 / 60;   // rAF-driven, near-enough-constant step at this very low speed
                let nx = posRef.current.x + swimDirRef.current * SWIM_SPEED * dt;
                if (nx >= waterSpan.maxX) { nx = waterSpan.maxX; swimDirRef.current = -1; }
                else if (nx <= waterSpan.minX) { nx = waterSpan.minX; swimDirRef.current = 1; }
                if (nx !== posRef.current.x) facingRef.current = swimDirRef.current;
                // #1040 (Han: "on-water fixed at 16px"): a fixed anchor, same mechanism as
                // STAND_HEIGHT_PX/standAnchor below — LEVEL_PX_HEIGHT-y fed through the SAME `bottom`
                // formula this component already uses, so a duck floats at a consistent height regardless
                // of the marker's own authored spawnY, not "no vertical drift from spawnY" anymore.
                posRef.current = { x: nx, y: LEVEL_PX_HEIGHT - WATER_STAND_HEIGHT_PX };
            } else {
                const isDutyPerch = canPerch && ((now + perchPhase) % 12000) > 8000;
                if (isDutyPerch && stateRef.current === 'wander') {
                    stateRef.current = 'return';
                    stateSinceRef.current = now;
                    returnFromRef.current = { ...posRef.current };
                    // #1092: decide (and claim) THIS return trip's perch target. Birds with authored
                    // slots try to claim the nearest free one; everyone else (non-birds, or birds when
                    // no slots exist yet) keeps the original own-spawn-point behaviour.
                    if (isBird && birdSlots && birdSlots.length > 0 && birdSlotClaimsRef) {
                        const idx = nearestFreeBirdSlot(birdSlots, birdSlotClaimsRef.current, posRef.current.x, posRef.current.y);
                        if (idx !== -1) {
                            birdSlotClaimsRef.current.add(idx);
                            claimedSlotIndexRef.current = idx;
                            perchTargetRef.current = { x: birdSlots[idx].x, y: birdSlots[idx].y };
                        } else {
                            perchTargetRef.current = { x: spawnX, y: spawnY };
                        }
                    } else {
                        perchTargetRef.current = { x: spawnX, y: spawnY };
                    }
                } else if (!isDutyPerch && stateRef.current !== 'wander') {
                    stateRef.current = 'wander';
                    // #1092: release the claimed slot back to the shared pool on leaving.
                    if (claimedSlotIndexRef.current != null && birdSlotClaimsRef) {
                        birdSlotClaimsRef.current.delete(claimedSlotIndexRef.current);
                        claimedSlotIndexRef.current = null;
                    }
                }
                if (stateRef.current === 'return') {
                    const t = Math.min(1, (now - stateSinceRef.current) / RETURN_DURATION_MS);
                    const from = returnFromRef.current;
                    const target = perchTargetRef.current;
                    const dxTotal = target.x - from.x, dyTotal = target.y - from.y;
                    const dist = Math.hypot(dxTotal, dyTotal) || 1;
                    const bow = Math.min(40, dist * 0.35);
                    const ctrl = { x: (from.x + target.x) / 2 - (dyTotal / dist) * bow, y: (from.y + target.y) / 2 + (dxTotal / dist) * bow };
                    const u = 1 - t;
                    const nx = u * u * from.x + 2 * u * t * ctrl.x + t * t * target.x;
                    const ny = u * u * from.y + 2 * u * t * ctrl.y + t * t * target.y;
                    if (nx !== posRef.current.x) facingRef.current = nx >= posRef.current.x ? 1 : -1;
                    posRef.current = { x: nx, y: ny };
                    if (t >= 1) stateRef.current = 'perch';
                    if (perchedRef.current) { perchedRef.current = false; setPerched(false); }
                } else if (stateRef.current === 'perch') {
                    posRef.current = { x: perchTargetRef.current.x, y: perchTargetRef.current.y };
                    if (!perchedRef.current) { perchedRef.current = true; setPerched(true); }
                } else {
                    const dx = oscillate(seedX, now, rangeX / 2, WANDER_SPEED);
                    const dy = rangeY > 0 ? oscillate(seedY, now, rangeY / 2, WANDER_SPEED) : 0;
                    const nx = spawnX + dx;
                    // #1040 (Han: ground critters follow Collision_mask same as the hero) — same
                    // canvasLocalX/LEVEL_PX_HEIGHT conversion the fixed water anchor above uses.
                    const ny = onGround ? LEVEL_PX_HEIGHT - groundHeightAt(nx - LEVEL_MIN_X) : spawnY - dy;
                    if (nx !== posRef.current.x) facingRef.current = nx >= posRef.current.x ? 1 : -1;
                    posRef.current = { x: nx, y: ny };
                    if (perchedRef.current) { perchedRef.current = false; setPerched(false); }
                }
            }
            if (elRef.current) {
                elRef.current.style.left = `${worldToScreenXRef.current(posRef.current.x)}px`;
                elRef.current.style.bottom = `${(LEVEL_PX_HEIGHT - posRef.current.y) * zoom}px`;
                // #1040 (Han 2026-08-17, "de eenden staan niet goed geankerd. bottom-bottom (zoals alle
                // entiteiten dat zouden moeten)"): reverses #989's earlier center-center anchor (LDtk's own
                // entity anchor is its CENTER) back to bottom-bottom, matching every other standing entity's
                // convention (hero/pet/NPC/Slime all anchor via a plain `bottom` with no translateY offset).
                elRef.current.style.transform = 'translateX(-50%)';
            }
            // #925 follow-up (Han 2026-08-16, "enkel bird sounds wanneer bird in beeld"): this is the ONLY
            // place a bird's true LIVE (wandering) world position exists — posRef never escapes this
            // component otherwise. Writes into a registry SHARED across every WorldWanderer instance
            // (owned by RpgLevelPanel, read by useWorldAmbientMusic) so bird-audio visibility/panning can
            // track the SAME position the sprite itself renders at, not just its static spawn point.
            if (isBird && birdPositionsRef) birdPositionsRef.current.set(birdId, posRef.current.x);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [variant, spawnX, spawnY, rangeX, rangeY, canPerch, swim, waterSpan, zoom], { priority: 'critical' });

    if (!variant) return null;
    return (
        <div ref={elRef} style={{ position: 'absolute' }}>
            <WorldCreature variant={variant} moving={!perched} frame={frame} facing={facingRef.current} zoom={zoom} />
            {/* #1032 (Han: "ducks weerspiegeling moet aan de ducks plakken, want zij zitten direct op het
                water"): a swim critter's reflection just mirrors around ITS OWN current position — no
                separate pond-surface lookup needed, since a duck IS the water surface by construction.
                Nested inside the SAME ref-positioned wrapper (not a second top-level ref) so it tracks the
                live rAF-driven position/frame/facing for free, `inset:0` guarantees it exactly overlaps the
                real sprite's own box so `transformOrigin:'bottom'` mirrors around its actual feet line. */}
            {swim && (
                <div style={{
                    position: 'absolute', inset: 0, transform: 'scaleY(-1)', transformOrigin: 'bottom',
                    // #1032 round 5 (Han: "lijkt van onder belicht te worden"): same day/night brightness
                    // match every other reflection now gets — bypasses the WebGL lighting pass, so without
                    // this a duck's reflection would stay full-brightness even at night.
                    opacity: 0.35, filter: `brightness(${globalIllumination})`, pointerEvents: 'none',
                }}>
                    <WorldCreature variant={variant} moving={!perched} frame={frame} facing={facingRef.current} zoom={zoom} />
                </div>
            )}
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

// Perf (#1162, Fase 3, Han 2026-08-27, "nog steeds drops to 41fps... wat kun je nog voor perf opt
// bedenken?"): Fase 1/2 made every entity's OWN positioning stable during a pure camera pan (local
// position helpers + the imperative `entityScrollRef` transform), but `RpgLevelPanel` itself still had to
// re-run its ENTIRE ~2000-line render body every panning frame (its own `cameraX` state forces that,
// unavoidably) — which means React still had to construct a fresh JSX element tree for ALL of this
// content every frame, even though the CHILDREN would ultimately memo-skip their own deeper work.
// Constructing that many `jsx()`/`createElement()` calls is real, measured cost (see docs/architecture.md
// §318's very first profile, where `jsxDEV`/`createElement` alone was ~46% of sampled time) — `React.memo`
// only ever skips a re-render once the RECONCILER reaches a component and compares its props; it never
// stops the PARENT from building the element descriptors for its children in the first place. Extracting
// this whole block into its own component lets THIS memo boundary actually apply: `RpgLevelPanel`'s own
// panning-frame render now does ONE cheap `<EntityLayer {...props}/>` call instead of constructing Wisp/
// Slime/6 workers/critters/hero/pet's whole subtree inline every single frame. All of EntityLayer's props
// are already stable during a pure pan (per Fase 1/2's own work) or are refs/module-level values, so this
// memo genuinely hits. `EntityReflection` stays a closure PASSED IN (defined in `RpgLevelPanel`, depends on
// `waterPonds`/`foliageParams` — same convention `WorkerNpcSlot` already uses for it).
// #UI-overhaul (Han 2026-08-27): a fixed HIT_ZONE_GPX × HIT_ZONE_GPX click target for a talkable
// entity, replacing "click anywhere on the whole (mostly-transparent) sprite box". Anchored the SAME
// way the sprite anchors: bottom-centre on the ground point for a grounded entity, centre-on-the-hover
// (one tile up, matching WorldCreature's `hoverPx = TILE * zoom`) for a flying one. Visible as an
// orange overlay in debug mode (CLAUDE.md §3a). `zIndex` above the sprite so it always catches the tap.
function EntityHitZone({ screenX, standAnchor, zoom, flying, onClick, debugMode }) {
    const s = HIT_ZONE_GPX * zoom;
    const bottom = flying ? standAnchor + (TILE - HIT_ZONE_GPX / 2) * zoom : standAnchor;
    return (
        <div
            onClick={onClick}
            style={{
                position: 'absolute', left: screenX, bottom, width: s, height: s,
                transform: 'translateX(-50%)', cursor: 'pointer', zIndex: 6,
                ...(debugMode ? { background: 'rgba(255,140,0,0.35)', outline: '1px solid orange' } : null),
            }}
        />
    );
}

const EntityLayer = React.memo(function EntityLayer({
    entityScrollRef, wispVariant, wispFlying, debugMode, clickNpc, worldToScreenXLocal, standAnchorFor, petFrame, zoom,
    EntityReflection, sceneryMode, clickSlime, workerNpcs, timeSignature, context, workerNpcAudio,
    playerXRef, critterWanderers, foliageParams, birdPositionsRef, birdSlots, birdSlotClaimsRef,
    char, noPetChar, moving, running, walkAnim, runAnim, idleAnim, walkFrame, facing, playerX,
    petUrl, petVariant, petX, petMoving,
}) {
    return (
        <div ref={entityScrollRef} style={{ position: 'absolute', inset: 0 }}>
            {/* Whisp NPC — "zet de whisp NPC neer... als ik erop klik loopt personage erheen, en verschijnt
                een tekstballon". Same classified Wisp creature the Bestiary tab uses (§6d — one asset/one
                classification, two render contexts), fixed in the world — it has no 'move' animation
                (never walks itself) so `WorldCreature` falls back to its 'idle'. stopPropagation so
                clicking it doesn't ALSO walk-to-tap-point on top of walk-to-NPC. */}
            {wispVariant && (
                <>
                    <div style={{ position: 'absolute', left: worldToScreenXLocal(NPC_X), bottom: standAnchorFor(NPC_X), transform: 'translateX(-50%)' }}>
                        <WorldCreature variant={wispVariant} moving={false} frame={petFrame} facing={1} zoom={zoom} />
                    </div>
                    <EntityHitZone
                        screenX={worldToScreenXLocal(NPC_X)} standAnchor={standAnchorFor(NPC_X)} zoom={zoom}
                        flying={wispFlying} debugMode={debugMode}
                        onClick={(e) => { e.stopPropagation(); clickNpc(); }}
                    />
                    {/* #1032: a SIBLING, never nested inside the entity's own `transform`-ed wrapper above
                        — CSS makes a transformed element a new containing block for `position:absolute`
                        descendants, which would silently break this reflection's own left/bottom math. */}
                    <EntityReflection worldX={NPC_X}>
                        <WorldCreature variant={wispVariant} moving={false} frame={petFrame} facing={1} zoom={zoom} />
                    </EntityReflection>
                </>
            )}

            {/* Slime — #RAM-level (Han 2026-08-11, "ik zie ook de slime niet; conform de entiteitslaag"):
                standing at the Slime entity marker, same z-slot as Wisp/hero/pet.
                #922 (Han 2026-08-12, "je hebt nu de lorem ipsum op de slime van het level gezet, maar ik wou
                die op de slime van de RPG-wereld"): now clickable, same walk-then-talk pattern as the Wisp
                (stopPropagation so it doesn't ALSO walk-to-tap-point on top of walk-to-Slime). */}
            {sceneryMode === 'LDtk' && ENTITY_WORLD_X.Slime != null && (
                <>
                    <div style={{ position: 'absolute', left: worldToScreenXLocal(ENTITY_WORLD_X.Slime), bottom: standAnchorFor(ENTITY_WORLD_X.Slime), transform: 'translateX(-50%)' }}>
                        <WorldSlime frame={petFrame} zoom={zoom} />
                    </div>
                    <EntityHitZone
                        screenX={worldToScreenXLocal(ENTITY_WORLD_X.Slime)} standAnchor={standAnchorFor(ENTITY_WORLD_X.Slime)} zoom={zoom}
                        flying={false} debugMode={debugMode}
                        onClick={(e) => { e.stopPropagation(); clickSlime(); }}
                    />
                    <EntityReflection worldX={ENTITY_WORLD_X.Slime}>
                        <WorldSlime frame={petFrame} zoom={zoom} />
                    </EntityReflection>
                </>
            )}

            {/* #1093 (Han 2026-08-20, open-world worker NPCs): 6 stationary workers standing at Level_1's
                own "NPC" LDtk markers (workerNpcs above) — same stand-anchor/reflection treatment as
                Wisp/Slime, no click handler (decorative only, no dialogue). Each gets its OWN
                WorkerNpcSlot instance (one useWorkerHitState hook call per NPC, React's normal
                one-component-per-list-item pattern — see that component's header for why the state
                machine must NOT live inside the twice-rendered WorkerNpc itself). */}
            {sceneryMode === 'LDtk' && workerNpcs.map((w) => (
                <WorkerNpcSlot
                    key={w.name}
                    variant={w.variant} hitConfig={w.hitConfig} petFrame={petFrame} timeSignature={timeSignature}
                    context={context} triggerBell={workerNpcAudio} zoom={zoom}
                    worldX={w.x} worldToScreenX={worldToScreenXLocal} standAnchorFor={standAnchorFor}
                    EntityReflection={EntityReflection}
                    getListenerX={() => playerXRef.current}
                />
            ))}

            {/* #924 (Han 2026-08-12, "spawn een random critter met tags: critter + nature +
                (flying/ground/water)"): one WorldWanderer per spawned Critter_* marker (see
                critterWanderers above) — each variant already carries its own habitat's wander box/perch
                behaviour from HABITAT_WANDER. */}
            {sceneryMode === 'LDtk' && critterWanderers.map((w, i) => (
                <WorldWanderer
                    key={`critter-${i}`} variant={w.variant} spawnX={w.x} spawnY={w.y}
                    rangeX={w.rangeX} rangeY={w.rangeY} canPerch={w.canPerch}
                    swim={w.swim} waterSpan={w.waterSpan} onGround={w.onGround} globalIllumination={foliageParams.globalIllumination}
                    frame={petFrame} zoom={zoom} worldToScreenX={worldToScreenXLocal}
                    isBird={w.tags.includes('bird')} birdId={`critter-${i}`} birdPositionsRef={birdPositionsRef}
                    birdSlots={birdSlots} birdSlotClaimsRef={birdSlotClaimsRef}
                />
            ))}

            {/* Hero — same paper-doll renderer as everywhere else (§6d), standing on the floor, walking
                left/right (A/D, arrow keys, edge-hold, or tap-to-move) via `useRpgLevelState`. `noPetChar`:
                the pet is rendered as its OWN trailing sprite below, so the doll's built-in pet LAYER is
                stripped here to avoid double-drawing it glued to the character's hip. */}
            {char && (
                <>
                    <div style={{
                        position: 'absolute', left: worldToScreenXLocal(playerX), bottom: standAnchorFor(playerX),
                        transform: `translateX(-50%) scaleX(${facing})`,
                    }}>
                        {/* #924 (Han 2026-08-12, "mijn personage heeft geen animatie. Hero moet ook idle
                            animatie tonen"): idle frame was hardcoded to 0 — a single frozen frame, no cycling
                            at all. `petFrame` already ticks at the shared bpm-coupled idle cadence
                            (frameMsForBpm, #923) for the pet/wisp/slime — reused here (§6c) instead of a second
                            idle-frame counter. */}
                        <CharacterDoll char={noPetChar} anim={moving ? (running ? runAnim : walkAnim) : idleAnim} frame={moving ? walkFrame : petFrame} height={HERO_CROP.h * zoom} />
                    </div>
                    <EntityReflection worldX={playerX} extraTransform={`scaleX(${facing})`}>
                        <CharacterDoll char={noPetChar} anim={moving ? (running ? runAnim : walkAnim) : idleAnim} frame={moving ? walkFrame : petFrame} height={HERO_CROP.h * zoom} />
                    </EntityReflection>
                </>
            )}

            {/* Pet — trails the player at a delay (useRpgLevelState's PET_FOLLOW_GAP leash). #693 round 8
                ("gebruik dezelfde pet als in de avatar selector") / round 12 (dog clipped: "gebruik toch
                gewoon de sprites uit de bestiary"): renders via `WorldCreature` + its classified bestiary
                variant (`petVariant`, resolved above by URL match) whenever one is found — same renderer,
                same walk/run/fly-aware animation lookup as every other classified creature — falling back
                to the old hand-rolled `WorldPet`/`PET_CROP` convention only if a pet sheet has no bestiary
                match. Renders nothing if no pet is equipped. */}
            {petUrl && (
                <>
                    <div style={{ position: 'absolute', left: worldToScreenXLocal(petX), bottom: standAnchorFor(petX), transform: 'translateX(-50%)' }}>
                        {petVariant
                            ? <WorldCreature variant={petVariant} moving={petMoving} frame={petFrame} facing={petX <= playerX ? 1 : -1} zoom={zoom} />
                            : <WorldPet url={petUrl} frame={petFrame} facing={petX <= playerX ? 1 : -1} zoom={zoom} />}
                    </div>
                    <EntityReflection worldX={petX}>
                        {petVariant
                            ? <WorldCreature variant={petVariant} moving={petMoving} frame={petFrame} facing={petX <= playerX ? 1 : -1} zoom={zoom} />
                            : <WorldPet url={petUrl} frame={petFrame} facing={petX <= playerX ? 1 : -1} zoom={zoom} />}
                    </EntityReflection>
                </>
            )}
        </div>
    );
});

// Perf (#1162, Fase 4, Han 2026-08-27, "doe maar" — extending Fase 3's own extraction to the scenery
// blocks, flagged there as "the logical continuation"): same rationale as `EntityLayer` above — moves the
// LDtk-mode ground/lit-ground/animated-tiles/water-reflection/foliage JSX construction out of
// `RpgLevelPanel`'s own render body (which still has to run every panning frame) into its own memo
// boundary, so a pure-pan frame skips reconstructing this subtree entirely. Two separate components
// (`SceneryBack`/`SceneryFront`), not one parametrized one — the back pass has `backgroundLayers` +
// `WaterReflectionLayer` the front pass doesn't, and mirroring the existing back/front code split exactly
// (rather than introducing new branching inside a shared component) keeps this a pure, low-risk
// extraction, not a redesign. Legacy-mode scenery (the OLD hand-rolled parallax/decor JSX, interleaved
// with the LDtk block in `RpgLevelPanel`'s render) is untouched — same "Legacy stays as-is" scope boundary
// every perf round this ticket has kept.
const SceneryBack = React.memo(function SceneryBack({
    sceneryMode, groundAndFoliageBack, world, leftPxForFactor, sceneryScrollBackRef, groundLeftPxLocal,
    zoom, litGroundTexturesBack, size, ldtkLights, foliageParams, foliageDebugChannel, overlayScrollBackRef,
    culledAnimatedTilesBack, localWorldToScreenXLocal, reflectableTiles, waterPonds, worldToScreenXLocal,
    waterInstancesBack, localFoliageInstancesBack, cameraOffsetRef,
    // Perf (#1162, Fase 10c): the shared atlas + this pass's culled/positioned atlas instance list — see
    // `RpgLevelPanel`'s own `atlasFoliageInstanceFor`/`foliageAtlas` comments for how these are built.
    foliageAtlas, atlasFoliageInstancesBack,
}) {
    return (
        <>
            {sceneryMode === 'LDtk' && (
                <LdtkScenery
                    groundTiles={groundAndFoliageBack} backgroundLayers={world.backgroundLayers}
                    gridSize={world.gridSize} leftPxForFactor={leftPxForFactor}
                    groundScrollRef={sceneryScrollBackRef} groundLeftPx={groundLeftPxLocal}
                    zoom={zoom} groundAnchor={0}
                />
            )}
            {sceneryMode === 'LDtk' && litGroundTexturesBack && (
                <LdtkLitGround
                    widthPx={size.w} heightPx={size.h}
                    textures={litGroundTexturesBack} levelPxWidth={LEVEL_PX_WIDTH} levelPxHeight={LEVEL_PX_HEIGHT}
                    leftPx={leftPxForFactor(1)} canvasBottomScreenY={size.h} zoom={zoom}
                    lights={ldtkLights}
                    params={foliageParams} edgeLitOnly={false} debugChannel={foliageDebugChannel}
                />
            )}
            <div ref={overlayScrollBackRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {sceneryMode === 'LDtk' && (
                    <LdtkAnimatedTiles
                        animatedTiles={culledAnimatedTilesBack} worldToScreenX={localWorldToScreenXLocal}
                        groundAnchorPx={0} zoom={zoom} levelPxHeight={LEVEL_PX_HEIGHT} gridSize={world.gridSize}
                    />
                )}
                {sceneryMode === 'LDtk' && (
                    <WaterReflectionLayer
                        reflectableTiles={reflectableTiles} gridSize={world.gridSize} ponds={waterPonds}
                        worldToScreenX={worldToScreenXLocal} leftPxForFactor={() => groundLeftPxLocal} zoom={zoom}
                        globalIllumination={foliageParams.globalIllumination}
                    />
                )}
            </div>
            {sceneryMode === 'LDtk' && (atlasFoliageInstancesBack.length > 0 || waterInstancesBack.length > 0) && (
                <ForegroundFoliageLayer
                    widthPx={size.w}
                    heightPx={size.h}
                    instances={localFoliageInstancesBack}
                    atlas={foliageAtlas}
                    atlasInstances={atlasFoliageInstancesBack}
                    cameraOffsetRef={cameraOffsetRef}
                    debugChannel={foliageDebugChannel}
                    lights={ldtkLights}
                    params={foliageParams}
                />
            )}
        </>
    );
});

const SceneryFront = React.memo(function SceneryFront({
    sceneryMode, groundAndFoliageFront, world, leftPxForFactor, sceneryScrollFrontRef, groundLeftPxLocal,
    zoom, litGroundTexturesFront, size, ldtkLights, foliageParams, foliageDebugChannel, overlayScrollFrontRef,
    culledAnimatedTilesFront, localWorldToScreenXLocal, waterInstancesFront,
    localFoliageInstancesFront, cameraOffsetRef,
    // Perf (#1162, Fase 10c): same shared atlas as SceneryBack, this pass's own instance list.
    foliageAtlas, atlasFoliageInstancesFront,
}) {
    return (
        <>
            {sceneryMode === 'LDtk' && (
                <LdtkScenery
                    groundTiles={groundAndFoliageFront} gridSize={world.gridSize}
                    leftPxForFactor={leftPxForFactor}
                    groundScrollRef={sceneryScrollFrontRef} groundLeftPx={groundLeftPxLocal}
                    zoom={zoom} groundAnchor={0}
                />
            )}
            {sceneryMode === 'LDtk' && litGroundTexturesFront && (
                <LdtkLitGround
                    widthPx={size.w} heightPx={size.h}
                    textures={litGroundTexturesFront} levelPxWidth={LEVEL_PX_WIDTH} levelPxHeight={LEVEL_PX_HEIGHT}
                    leftPx={leftPxForFactor(1)} canvasBottomScreenY={size.h} zoom={zoom}
                    lights={ldtkLights}
                    params={foliageParams} edgeLitOnly={true} debugChannel={foliageDebugChannel}
                />
            )}
            <div ref={overlayScrollFrontRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {sceneryMode === 'LDtk' && (
                    <LdtkAnimatedTiles
                        animatedTiles={culledAnimatedTilesFront} worldToScreenX={localWorldToScreenXLocal}
                        groundAnchorPx={0} zoom={zoom} levelPxHeight={LEVEL_PX_HEIGHT} gridSize={world.gridSize}
                    />
                )}
            </div>
            {sceneryMode === 'LDtk' && (atlasFoliageInstancesFront.length > 0 || waterInstancesFront.length > 0) && (
                <ForegroundFoliageLayer
                    widthPx={size.w}
                    heightPx={size.h}
                    instances={localFoliageInstancesFront}
                    atlas={foliageAtlas}
                    atlasInstances={atlasFoliageInstancesFront}
                    cameraOffsetRef={cameraOffsetRef}
                    debugChannel={foliageDebugChannel}
                    lights={ldtkLights}
                    params={foliageParams}
                />
            )}
        </>
    );
});

// Perf (Han 2026-08-27, "ongeveer elke schermbreedte, de animatie een klein beetje vertraagt, en dan terug
// versnelt" — reported as present since one of the first RPG-world builds, everywhere, not tied to any one
// biome): the animated-tiles (campfire) cull list used to be a `useMemo` keyed on a CAMERA-AWARE screenX
// function (`localWorldToScreenX`, which depends on `cameraX` state — changes every rAF frame while
// moving), so despite the surrounding comment claiming it was memoized, the "memoized" array was actually
// rebuilt from scratch on literally every animation frame during any camera movement. That's a genuinely
// unbounded per-frame heap allocation (a fresh filtered array + fresh child-prop identity every tick,
// defeating `React.memo` on `LdtkAnimatedTiles` downstream too) — exactly the class of constant allocation
// pressure that produces periodic GC-pause stutters. GC pauses are time-periodic; at a roughly constant
// walk speed, a time-periodic stutter reads as spatially periodic — "every screen width" is consistent
// with that, though this fix is a strong, well-reasoned hypothesis from code-reading, not something proven
// via a live profile (Han chose "fix now, then test" over "trace first").
//
// Fix: the recompute moves onto the shared `useFrameLoop` ticker at a coarse 'throttled' cadence (150ms —
// comfortably inside the existing `CULL_MARGIN_PX`=400 buffer's own slack at any normal walk/run speed:
// even at the RUN speed of ~540 screen-px/sec, 150ms is only ~81px of travel, well under the 400px
// margin), using the CAMERA-INDEPENDENT `localWorldToScreenXLocal` + the live `cameraOffsetRef` (the exact
// same pattern `ForegroundFoliageLayer`'s own draw-loop culling already uses, §322/§331), with a dedup
// check so `setState` only fires when the actual VISIBLE SET of tiles changed, not on every throttled tick.
function useCulledAnimatedTiles(tiles, localWorldToScreenXLocal, cameraOffsetRef, sizeRef) {
    const [culled, setCulled] = useState(tiles);
    const prevRef = useRef(tiles);
    useFrameLoop(() => {
        const camOffsetPx = cameraOffsetRef.current;
        const w = sizeRef.current.w;
        const next = tiles.filter((t) => {
            const x = localWorldToScreenXLocal(t.worldX) + camOffsetPx;
            return x > -CULL_MARGIN_PX && x < w + CULL_MARGIN_PX;
        });
        const prev = prevRef.current;
        const same = prev.length === next.length && prev.every((t, i) => t === next[i]);
        if (!same) {
            prevRef.current = next;
            setCulled(next);
        }
    }, [tiles, localWorldToScreenXLocal, cameraOffsetRef, sizeRef], { priority: 'throttled', throttleMs: 150 });
    return culled;
}

export default function RpgLevelPanel({ characterEditor, rpgLevel, debugMode = false, bpm, timeSignature, context, instruments, setVolume, onGenerateVoice, rpgMusicVolumeMultiplier = 1, worldScale = null }) {
    const containerRef = useRef(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [petFrame, setPetFrame] = useState(0);
    // #925 follow-up (Han 2026-08-16, "enkel bird sounds wanneer bird in beeld"): shared registry every
    // WorldWanderer bird instance writes its own LIVE wandering position into (see that component's own
    // comment) — read by useWorldAmbientMusic below to gate/pan bird audio by actual on-screen position,
    // not just a static spawn point. Plain ref (not React state) since it's written up to 60x/sec.
    const birdPositionsRef = useRef(new Map());
    // #1092 (Han 2026-08-19, "Birds should only perch on 'bird slots'"): a shared claim registry so
    // multiple bird WorldWanderer instances don't perch on the SAME `X_bird_slot` marker at once — a
    // bird claims the nearest free slot index when it starts returning to perch, releases it when it
    // flies off again (see WorldWanderer's own perch-target logic). Plain ref (not React state), same
    // "written by an rAF loop, never triggers a render" reasoning as birdPositionsRef above.
    const birdSlotClaimsRef = useRef(new Set());
    // #925 follow-up: see the useWorldAmbientMusic call further down (after water tiles are computed) for
    // what this ref actually holds each render.
    const envAudioRef = useRef(null);
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
    // #UI-overhaul Stap 3 (Han 2026-08-27): in world mode App passes an explicit INTEGER `worldScale`
    // (utils/worldLayout.js) — one global scale factor so every game pixel is exactly the same size in
    // every layer (see docs/architecture.md §327/§334). It wins outright when set. Otherwise LDtk mode
    // falls back to the old height-driven fit (`size.h / LEVEL_PX_HEIGHT`, non-integer) and legacy mode
    // to the fixed module `ZOOM`. The Stap 1 interim `size.w / 320` clamp is gone — `worldScale` is
    // chosen with the ≥320 gpx width rule already baked in.
    const dynamicZoom = size.h > 0 ? size.h / LEVEL_PX_HEIGHT : ZOOM;
    const zoom = worldScale != null
        ? worldScale
        : (sceneryMode === 'LDtk' ? dynamicZoom : ZOOM);
    // #RAM-level (Han 2026-08-11, "in debug wil ik in het level een metronoom aan kunnen zetten"): debug-
    // only click track, off by default even when debugMode is on (Han still has to explicitly enable it) —
    // see useDebugMetronome.js for the rAF/AudioContext-clock design. #924 round 4 ("die kan nooit in sync
    // zijn met de wereld timer. Is die uberhaupt hetzelfde tempo..?"): no longer passes the live song
    // bpm/timeSignature — defaults to WORLD_BPM/WORLD_TIME_SIGNATURE (worldClock.js), the SAME fixed tempo
    // every open-world audio system now shares.
    const [metronomeOn, setMetronomeOn] = useState(false);
    const { beat: metronomeBeat, pulseTick: metronomePulse } = useDebugMetronome({
        enabled: debugMode && metronomeOn, context, instruments, setVolume,
    });
    const { appFps, pixelFps, reportPixelFrame } = useFpsCounters();
    const world = useMemo(
        () => buildWorld({ season, city, tavernTier, bridgeTier }),
        [season, city, tavernTier, bridgeTier],
    );
    // #1032 round 8 bugfix (Han: "ik kan de brug niet zien op het water"): the reflectable set now
    // depends on the CURRENTLY-active tavern/bridge tier, same deps buildWorld() itself uses for those.
    const reflectableTiles = useMemo(
        () => reflectableTilesFor({ tavernTier, bridgeTier }),
        [tavernTier, bridgeTier],
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
    // static ground canvas.
    // Perf (#1162, Fase 10c): `useLdtkFoliageInstances` (the per-instance sheet-space UV + its own separate
    // runtime normal-map generation) is REMOVED — superseded by the atlas-backed instances built below
    // (`atlasFoliageInstancesBack/Front`, from the SAME `foliageAtlas` this file already builds one section
    // up). Keeping both would have meant generating every foliage crop's normal map TWICE (once into the
    // atlas, once into `useLdtkFoliageInstances`'s own per-URL cache) for data the atlas path never reads —
    // real wasted work, not just dead code, so it's deleted rather than left dormant.
    // Perf (#1162, Fase 10a, docs/architecture.md §337): builds a SHARED texture atlas from every distinct
    // foliage crop across BOTH passes (back+front share the same tilesets/crops in practice, so one atlas
    // covers both) — not wired to rendering yet, this phase only builds+verifies the atlas itself (see the
    // debug canvas below). `useMemo`, not an inline spread, so the combined list is a STABLE array
    // reference across renders that don't actually change back/front content — an unmemoized fresh array
    // here would re-trigger the atlas hook's whole build on every render, the exact bug just fixed for
    // `cullTilesToViewport` (§335) one section below this one.
    const allFoliageTilesForAtlas = useMemo(
        () => [...world.foliageTilesBack, ...world.foliageTilesFront],
        [world.foliageTilesBack, world.foliageTilesFront],
    );
    const foliageAtlas = useLdtkFoliageAtlas(allFoliageTilesForAtlas, world.gridSize, sceneryMode);
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
    // #1032 (Han 2026-08-17, water reflection): groups ALL water tiles (any visual band, unlike
    // waterSpanNear's swim-only logicalRow-2 filter — a pond's visual EXTENT includes its shoreline/edge
    // tiles too) into connected components via flood-fill (adjacent = both X and Y within one gridSize —
    // a pond can be more than one tile tall). Only `[minX,maxX]` is used by the reflection code (WHERE to
    // clip horizontally) — the mirror axis itself is Han's own fixed `WATER_REFLECTION_AXIS_PX` (round 6),
    // not a per-pond tile-derived height, so no `surfaceY` field is kept here.
    const waterPonds = useMemo(() => {
        const tiles = [...waterTilesBack, ...waterTilesFront];
        const visited = new Set();
        const ponds = [];
        for (let i = 0; i < tiles.length; i++) {
            if (visited.has(i)) continue;
            const stack = [i];
            visited.add(i);
            const cluster = [];
            while (stack.length) {
                const idx = stack.pop();
                cluster.push(tiles[idx]);
                for (let j = 0; j < tiles.length; j++) {
                    if (visited.has(j)) continue;
                    if (Math.abs(tiles[j].worldX - tiles[idx].worldX) <= world.gridSize
                        && Math.abs(tiles[j].worldY - tiles[idx].worldY) <= world.gridSize) {
                        visited.add(j);
                        stack.push(j);
                    }
                }
            }
            ponds.push({
                minX: Math.min(...cluster.map((t) => t.worldX)) + LEVEL_MIN_X,
                maxX: Math.max(...cluster.map((t) => t.worldX + world.gridSize)) + LEVEL_MIN_X,
            });
        }
        return ponds;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [waterTilesBack, waterTilesFront, world.gridSize]);
    // #1032 round 2 (Han: "die plakt vast aan de hero base. Voor de eenden moet de weerkaatsing aan de
    // eenden plakken, maar voor de brug, bomen, etc niet, dan moet je spiegel over [de rand]"): the round-1
    // nested self-mirror was correct ONLY for ducks (always exactly AT the water surface by construction —
    // see WorldWanderer's own reflection). Hero/pet/NPC/Slime stand on dry land near a pond's edge, often
    // at a DIFFERENT height than the water itself (collision-mask terrain, a raised bank, ...) — mirroring
    // around their OWN foot anchor reflected them at the wrong line ("stuck to the hero's own base"
    // regardless of where the actual water was). Fixed: a STANDALONE sibling (not nested inside the
    // entity's own wrapper) positioned directly at the CONTAINING POND's own `surfaceY` — same axis
    // `WaterReflectionLayer` uses for decor/trees/bridge, so entities and scenery reflect at the exact same
    // line. `extraTransform` carries the hero's CSS-level `scaleX(facing)` (pet/NPC/Slime handle facing
    // internally via their own `facing` prop instead, so they don't need it).
    // #1032 round 6 bugfix (Han: "de reflectie staat nu op 32px [pond-tile-derived] i.p.v. de vaste
    // spiegel-as. Als hero op de boomstam staat is de baseline op y=48, dan zou de reflectie op y=16
    // moeten staan"): the mirror axis is Han's own FIXED constant (`WATER_REFLECTION_AXIS_PX`), never the
    // entity's own current (possibly Collision_mask-elevated) position and never a pond's tile-derived
    // surfaceY — still GATED on pond membership (only shows near actual water), just no longer anchored
    // to that pond's specific height.
    // #1032 round 7 bugfix (Han: "de baseline van de reflectie plakt nog altijd aan de reflectielijn;
    // dit is wiskundig onjuist. De baseline van de reflectie moet dezelfde afstand van de spiegellijn
    // hebben als de afstand van de hero"): confirmed — round 6 positioned this wrapper's OWN `bottom` AT
    // the fixed axis itself, then mirrored around the wrapper's own bottom edge — since `scaleY(-1)`
    // around an element's own bottom edge leaves THAT edge fixed, the reflection's feet stayed glued to
    // the axis line regardless of the entity's real height. Real mirror symmetry: a point `d` px ABOVE
    // the axis reflects to `d` px BELOW it, i.e. the wrapper's `bottom` must be `2*axis - entityHeight`,
    // not `axis`. Matches Han's own worked example exactly (entity height 48, axis 32 in his example →
    // reflected bottom 2*32-48=16).
    // Perf (#1162, Fase 2a): `worldToScreenXLocal` (camera-independent) — this component renders entity
    // reflections, which now live inside the SAME imperatively-scrolled `entityScrollRef` wrapper as the
    // entities themselves (see that ref's own declaration/comment) — see `worldToScreenXLocal`'s own
    // comment for the full rationale.
    const EntityReflection = ({ worldX, extraTransform, children }) => {
        const pond = waterPonds.find((p) => worldX >= p.minX && worldX <= p.maxX);
        if (!pond) return null;
        const axisPx = WATER_REFLECTION_AXIS_PX * zoom;
        const entityHeightPx = standAnchorFor(worldX);
        const reflectedBottomPx = 2 * axisPx - entityHeightPx;
        return (
            <div style={{
                position: 'absolute', left: worldToScreenXLocal(worldX), bottom: reflectedBottomPx,
                transform: `translateX(-50%) scaleY(-1)${extraTransform ? ` ${extraTransform}` : ''}`,
                transformOrigin: 'bottom', opacity: 0.35,
                // #1032 round 5 (Han: "lijkt van onder belicht te worden"): same day/night brightness
                // match as WaterReflectionLayer's decor mirror — entity reflections bypass the WebGL
                // lighting pass too, so without this they'd stay full-brightness even at night.
                filter: `brightness(${foliageParams.globalIllumination})`, pointerEvents: 'none',
            }}>
                {children}
            </div>
        );
    };
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

    // Pet idle/walk animation ticks independently of the movement rAF loop.
    // #923 (Han 2026-08-12, "zorg dat de rpg-framerate in world debug hiermee overeenstemt"): this used to
    // be a hardcoded 150ms, completely independent of the song's bpm — a SECOND cadence, drifted from the
    // sheet-music view's own bpm-coupled sprite loop (SheetRpgLayer.jsx). Reuses that SAME shared formula
    // (§6c/§6d — one cadence, not two hand-tuned copies) so wisp/pet/slime idle animation in the open world
    // matches the in-song sprite cadence at any bpm/timeSignature.
    // Perf (#1161, Han 2026-08-27, "misschien moet het RPG-world frame ticks krijgen, bijvoorbeeld 60/s...
    // op 60fps is 'meest nabije frame' goed genoeg"): `setInterval` isn't frame-aligned (same "hakkelig"
    // reasoning SheetRpgLayer.jsx's own rAF-vs-setInterval header comment already documents for the level
    // view) and, being its own independent timer, can drift out of sync with the metronome over a long
    // session. Replaced with the SAME rAF+AudioContext-sampling pattern: sample `context.currentTime` every
    // animation frame (~60/s), derive which tempo-locked sprite frame is nearest, and only call `setPetFrame`
    // when that computed value actually changes — React bails out on a same-value primitive `setState`
    // (`Object.is` equality), so this commits to state at EXACTLY the same cadence as the old interval did
    // (no extra re-renders), just precisely metronome-locked instead of drifting.
    // Perf (#1162, Fase 8): migrated onto the shared `useFrameLoop` ticker (docs/architecture.md §328) —
    // 'critical' priority (runs every rAF frame, same as before). `useFrameLoop` always calls the LATEST
    // callback closure via a ref (see its own header comment) rather than re-running an effect body per
    // tick, so `startMs` can no longer live as a plain closure `let` inside the tick body (that would reset
    // on every RENDER, not just on bpm/timeSignature/context changes) — moved to a ref, explicitly reset
    // only when those deps change, matching the old effect's exact reset semantics.
    const petFrameStartMsRef = useRef(null);
    useEffect(() => { petFrameStartMsRef.current = null; }, [bpm, timeSignature, context]);
    useFrameLoop(() => {
        const nowMs = (context && typeof context.currentTime === 'number') ? context.currentTime * 1000 : performance.now();
        if (petFrameStartMsRef.current === null) petFrameStartMsRef.current = nowMs;
        const nextFrame = Math.floor((nowMs - petFrameStartMsRef.current) / frameMsForBpm(bpm, timeSignature));
        setPetFrame((f) => (f === nextFrame ? f : nextFrame));
    }, [bpm, timeSignature, context], { priority: 'critical' });

    const { char } = characterEditor;
    const { playerX, petX, facing, moving, running, petMoving, moveTo, clickNpc, clickSlime, setHeldDirection } = rpgLevel;
    // #925 follow-up (Han 2026-08-16, bug found via LdtkLitGround diagnostic logging): NPC_X/playerX are
    // ABSOLUTE LDtk world coordinates (from useRpgLevelState, clamped to LEVEL_MIN_X..LEVEL_MAX_X), but
    // every LDtk tile-derived "worldX" this shimmer/lit-ground pipeline uses (tile.worldX post
    // tileFromLdtkEntry's `offsetX = lvl.worldX - LEVEL_MIN_X`, and this file's own foliageInstanceProps'
    // `worldX: inst.localX`) is CANVAS-LOCAL — 0-based relative to LEVEL_MIN_X, spanning the stitched
    // multi-level strip. Passing NPC_X/playerX straight into a light's `worldX` compares two different
    // coordinate spaces, off by exactly LEVEL_MIN_X — invisible before the multi-level split (#925/#1021,
    // when LEVEL_MIN_X was effectively 0), and apparently never actually re-verified since (§1023's own
    // UAT checked pixel-switch granularity and movement, not point-light position tracking). Subtracting
    // LEVEL_MIN_X converts both lights into the SAME canvas-local space every LDtk consumer already uses.
    // Scoped to LDtk-mode mounts only — Legacy mode's own `lights` literals use a different, untouched
    // convention (single hardcoded level, no LEVEL_MIN_X concept) and are left as-is.
    // #1040 follow-up bugfix (Han 2026-08-17, "de normal map behaviour response op de light is flipped...
    // als van de laatste change kan het karakter een hoge y-positie hebben"): confirmed — the hero's light
    // height below was hardcoded to 32 (the OLD flat STAND_HEIGHT_PX assumption), predating the
    // Collision_mask feature. Now that the hero's REAL standing height (`standAnchorFor`) can be higher on
    // sloped terrain, this stale constant put the light source BELOW the hero's actual current position —
    // e.g. standing on a ramp near the tree trunk, the lighting calc still assumed height 32 while the
    // sprite rendered higher, making the trunk's normal-map response look like it was lit from below/wrong
    // vertical direction. Fixed with the SAME `groundHeightAt` lookup `standAnchorFor` uses (native px, no
    // `* zoom` — this array's `worldHeight` is already world-space, matching the existing `0`/`32` literals).
    // #1032 round 8 (Han: "het kampvuur heeft nog geen lichtbron. Zet de lichtbron altijd in het midden
    // van de sprite. (bij wisp staat deze op de laagste plek in het level, bij karakter op baseline, mag
    // echt in het midden van de sprite"): campfire tiles are already canvas-local (kind:'campfire' in
    // world.animatedTilesBack/Front, ldtkWorld.js) — the light sits at the sprite's own CENTROID (average
    // of every campfire tile's own center point), unlike the Wisp (ground level) or hero (its own stand
    // anchor). Averages across ALL campfire-kind tiles, so this assumes one campfire per level — correct
    // for the current level, would need per-cluster grouping (same flood-fill idea as `waterPonds`) if a
    // future level ever placed more than one.
    const campfireLight = useMemo(() => {
        const tiles = [...world.animatedTilesBack, ...world.animatedTilesFront].filter((t) => t.kind === 'campfire');
        if (!tiles.length) return null;
        const cx = tiles.reduce((sum, t) => sum + t.worldX + world.gridSize / 2, 0) / tiles.length;
        const cyFromTop = tiles.reduce((sum, t) => sum + t.worldY + world.gridSize / 2, 0) / tiles.length;
        return { worldX: cx, worldHeight: LEVEL_PX_HEIGHT - cyFromTop, color: CAMPFIRE_LIGHT_COLOR01 };
    }, [world]);
    const ldtkLights = useMemo(() => [
        { worldX: NPC_X - LEVEL_MIN_X, worldHeight: 0, color: WISP_LIGHT_COLOR01 },
        { worldX: playerX - LEVEL_MIN_X, worldHeight: groundHeightAt(playerX - LEVEL_MIN_X), color: HERO_LIGHT_COLOR01 },
        ...(campfireLight ? [campfireLight] : []),
    ], [playerX, campfireLight]);

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
    // Perf (#1162, Han 2026-08-27, "de camera-update moet echt anders"): 4 ground-plane wrapper `<div>`s
    // (back-of-entities / front-of-entities passes × "scenery" / "overlay" z-order groups — see their
    // render sites below, and `worldToScreenXLocal`'s own comment for the full rationale) whose
    // `transform` this SAME loop now writes directly every frame, bypassing `cameraX` React state/props
    // for the pan offset entirely. Split into two groups per pass (not one) because `LdtkLitGround` sits
    // BETWEEN them in the level's own z-order (scenery → lit-ground → animated-tiles/water-reflection)
    // and isn't wrapped this round (see that same comment) — a single wrapper spanning all of them would
    // have silently reordered the stack.
    const sceneryScrollBackRef = useRef(null);
    const sceneryScrollFrontRef = useRef(null);
    const overlayScrollBackRef = useRef(null);
    const overlayScrollFrontRef = useRef(null);
    // Perf (#1162, Fase 2a): the entity layer (Wisp/Slime/workers/critters/hero/pet) shares this SAME
    // imperative-transform treatment — see `worldToScreenXLocal`'s own comment for the full rationale.
    const entityScrollRef = useRef(null);
    // Perf (#1162, Fase 2b): the WebGL-instance-layer counterpart to the 5 CSS-transform refs above —
    // `ForegroundFoliageLayer`'s own draw loop reads this directly (see its own `cameraOffsetRef` prop
    // comment) instead of a wrapper `<div>` transform, since its instances are positioned via a per-draw-
    // call WebGL uniform, not a single CSS property.
    const cameraOffsetRef = useRef(0);
    // Perf (#1162, Fase 8): migrated onto the shared `useFrameLoop` ticker (docs/architecture.md §328) —
    // 'critical' priority, since this drives the visual camera/scroll position and must never skip a
    // frame (same reasoning as SheetRpgLayer's own clock-driven scroll, which stays on its own separate
    // migration — see that hook's own header comment). Behavior is unchanged: this ran every rAF frame
    // before, and still does; only the browser-level rAF REGISTRATION is now shared instead of separate.
    useFrameLoop(() => {
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
                // Perf (#1162): the ground-plane wrapper's own `left`-space offset is `-cameraX * zoom`
                // (the exact term `worldToScreenXLocal` below drops from the full `worldToScreenX`
                // formula) — writing it here, on the FRESH `next` value, means the transform is never a
                // frame stale waiting for React to commit `cameraX` back down as a prop.
                const offsetPx = -next * z;
                const transform = `translateX(${offsetPx}px)`;
                if (sceneryScrollBackRef.current) sceneryScrollBackRef.current.style.transform = transform;
                if (sceneryScrollFrontRef.current) sceneryScrollFrontRef.current.style.transform = transform;
                if (overlayScrollBackRef.current) overlayScrollBackRef.current.style.transform = transform;
                if (overlayScrollFrontRef.current) overlayScrollFrontRef.current.style.transform = transform;
                if (entityScrollRef.current) entityScrollRef.current.style.transform = transform;
                // Perf (#1162, Fase 2b): SAME offset, read by ForegroundFoliageLayer's own draw loop.
                cameraOffsetRef.current = offsetPx;
                return next;
            });
    }, [], { priority: 'critical' });

    // #UI-overhaul bug (Han 2026-08-27, "de verkeerde wisp is gebruikt in het level (wisp alt) — ik moet
    // wisp hebben"): `findCreatureByName('Wisp')` returns the 'Plain'-or-first variant, which for the Wisp
    // creature is an alt sprite. Match by the SAME URL the dialogue portrait uses (RpgLevelBottomPanel's
    // `wispUrl`) so the world sprite and the portrait are the one correct Wisp; fall back to the by-name
    // pick only if that URL somehow isn't in the scanned bestiary.
    const wispVariant = useMemo(
        () => findVariantByUrl(WISP_URL) || findCreatureByName('Wisp'),
        [],
    );
    // Whether the Wisp's idle animation is a flying/float one — the 16×16 click zone anchors like the
    // sprite does: mid-bottom for a grounded entity, centre-on-the-hover for a flying one.
    const wispFlying = useMemo(
        () => (wispVariant ? isFlyingAnim(findIdleAnim(wispVariant), wispVariant) : false),
        [wispVariant],
    );
    // #1093 (Han 2026-08-20, "gebruik de 5 NPC entities uit LDtk"): Level_1's 6 anonymous "NPC" markers
    // (the LDtk entity type carries no per-instance identifying field, confirmed via the .ldtk file's own
    // entity defs) get Han's 6 workers assigned in x-order — Han's own confirmed default, adjustable later
    // by moving markers in the LDtk editor since the assignment is purely positional, not hardcoded per
    // marker id. Every worker's `idle` plays via the SAME shared `petFrame` counter Wisp/pet/Slime already
    // tick (§6c — 5 frames/beat, tempo-locked, no new interval). `hitConfig` is null for the 3 NPCs Han
    // gave no sound spec for (lumberjack/lady potions/steampunker) — WorkerNpc renders them silently.
    const workerNpcAudio = useWorkerNpcAudio(context);
    // #1096 (Han 2026-08-20, follow-up to #1093/#1095): "Blacksmith Slow"/"Blacksmith Fast" renamed to
    // "Blacksmith" (SSW, "de laatste heet gewoon blacksmith")/"Blacksmith Woman" (blacksmith_f, now a
    // STANDALONE creature — Han's own correction, no longer a variant of "Blacksmith Man"). `hitConfig` for
    // all 3 sound-bearing workers now comes from `WORKER_SOUND_CONFIG` (workerSoundConfig.js) — the SAME
    // data the bestiary manifest generator reads to derive the 'audio' tag and the bestiary preview reads
    // to play the sound while browsing, so the note/frame numbers live in exactly one place.
    const workerNpcs = useMemo(() => {
        const markers = [...(ENTITY_INSTANCES.NPC || [])].sort((a, b) => a.x - b.x);
        const names = ['Blacksmith', 'Lumberjack', 'Town crier', 'Blacksmith Woman', 'Lady Potions', 'Steampunker'];
        return names.map((name, i) => ({
            name,
            hitConfig: WORKER_SOUND_CONFIG[name] || null,
            variant: findCreatureByName(name),
            x: markers[i]?.x,
        })).filter((w) => w.variant && w.x != null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
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
    // #1040 (Han 2026-08-17, collision-mask interview: "all ground-anchored entities... exclude flying
    // and on-water"): `onGround` marks the ONE habitat that should follow Collision_mask's terrain height
    // as it wanders, same as the hero/pet/NPC/Slime (`standAnchorFor`) — flying critters keep their own
    // spawnY+oscillate height, swim critters keep the fixed WATER_STAND_HEIGHT_PX anchor.
    // #1092 (Han 2026-08-19, "Birds should only perch on 'bird slots'"): a NEW LDtk marker type,
    // authored by Han in the level editor (same `X_<criteria>` convention as X_bird_flying etc.) —
    // ENTITY_INSTANCES already reads any `__identifier` generically (ldtkWorld.js), so no parser
    // change was needed, only this lookup. Empty until Han places any (existing levels are
    // unaffected — WorldWanderer falls back to a bird's own spawn point when `birdSlots` is empty).
    const birdSlots = ENTITY_INSTANCES['X_bird_slot'] ?? [];
    const HABITAT_CONFIG = {
        X_bird_flying: { tags: ['bird', 'flying'], rangeX: 256, rangeY: 64, canPerch: true, swim: false, onGround: false },
        X_critter_flying: { tags: ['critter', 'flying'], rangeX: 256, rangeY: 64, canPerch: true, swim: false, onGround: false },
        X_critter_ground: { tags: ['critter', 'ground'], rangeX: 32, rangeY: 0, canPerch: false, swim: false, onGround: true },
        X_on_water: { tags: ['critter', 'on_water'], rangeX: 0, rangeY: 0, canPerch: false, swim: true, onGround: false },
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
    // Perf (#1162, Han 2026-08-27, "kun je nog meer optimalisaties vinden?"): same `setInterval` → rAF
    // conversion as `petFrame` above (§318/§319) — `setInterval` isn't frame-aligned and, being its own
    // independent timer, adds avoidable per-tick overhead on top of the shared rAF loop already running.
    // Samples elapsed time every animation frame, only commits `setWalkFrame` when the computed frame
    // actually changes (React's `Object.is` bailout keeps the commit cadence identical to the old
    // interval — no new re-render frequency, just jitter-free timing).
    // Perf (#1162, Fase 8): migrated onto the shared `useFrameLoop` ticker (docs/architecture.md §328).
    // Unlike the old effect (which registered NO rAF at all while `!moving`), this subscription now stays
    // registered even when idle and early-exits each tick instead — a cheap no-op check, and exactly the
    // point of consolidation: one fewer DISTINCT rAF registration for the browser to track regardless of
    // whether this particular subsystem currently has real work to do. `startMs` moved to a ref for the
    // same reason as `petFrameStartMsRef` above (see that migration's own comment).
    const walkStartMsRef = useRef(null);
    useEffect(() => { if (!moving) setWalkFrame(0); }, [moving]);
    useEffect(() => { walkStartMsRef.current = null; }, [moving, running]);
    useFrameLoop(() => {
        if (!moving) return;
        const frameMs = running ? 60 : 120;
        const nowMs = performance.now();
        if (walkStartMsRef.current === null) walkStartMsRef.current = nowMs;
        const nextFrame = Math.floor((nowMs - walkStartMsRef.current) / frameMs);
        setWalkFrame((f) => (f === nextFrame ? f : nextFrame));
    }, [moving, running], { priority: 'critical' });

    // #693 round 3: strip the pet LAYER from the doll — it's rendered as its own trailing sprite instead
    // (see the standalone `<WorldCreature>` below), so the doll must not ALSO draw its built-in glued-on
    // pet.
    const noPetChar = useMemo(() => (char ? { ...char, layers: { ...char.layers, pet: null } } : char), [char]);
    const centerX = size.w / 2;
    // #693 round 7: EVERY world object now goes through this ONE conversion (was `centerX + worldX*ZOOM`
    // — a fixed mapping that only worked because the camera never moved) so introducing the scrolling
    // camera couldn't silently miss a spot. Uses `zoom` (mode-aware) rather than the module `ZOOM` directly
    // so hero/pet/Wisp/Slime — shared between both scenery modes — scale correctly in either.
    // Perf (#1161, Han 2026-08-27): `useCallback`-wrapped so these keep a STABLE function identity across
    // renders where `cameraX`/`zoom`/`centerX` genuinely haven't changed (e.g. a `petFrame`-only tick while
    // the hero stands still) — plain function expressions got a fresh reference every render regardless,
    // which silently defeated `React.memo` on every consumer below (`LdtkScenery`, `WaterReflectionLayer`,
    // `LdtkAnimatedTiles`) even when NONE of their actual inputs had changed. Still changes every frame
    // while the camera is genuinely panning (moving hero) — that part is unavoidable with the current
    // React-state-driven camera and intentionally NOT addressed this round (see this ticket's own notes on
    // `cameraX`'s 60×/sec rAF-driven `setCameraX` loop — a separate, larger follow-up if still needed).
    const worldToScreenX = useCallback((worldX) => centerX + (worldX - cameraX) * zoom, [centerX, cameraX, zoom]);
    // LdtkScenery's canvases are drawn in LDtk's own native (unshifted) coordinate space, i.e. their own
    // x=0 = this app's `LEVEL_MIN_X`. `factor` scales how much of the camera's movement a layer reacts to
    // (1 = the ground plane, <1 = a background layer that lags behind — parallax depth).
    const leftPxForFactor = useCallback((factor) => centerX + (LEVEL_MIN_X - cameraX * factor) * zoom, [centerX, cameraX, zoom]);
    // Perf (Han 2026-08-27, "elke schermbreedte vertraagt de animatie even"): the camera-aware
    // `localWorldToScreenX` wrapper that used to live here (LDtk ground-plane tiles are stored LEVEL-LOCAL,
    // 0..pxWid — it added the level's own world offset before projecting through `worldToScreenX`) is gone
    // — its only caller, the animated-tiles cull, was switched to the camera-INDEPENDENT
    // `localWorldToScreenXLocal` + a live `cameraOffsetRef` read instead (see `useCulledAnimatedTiles`'s own
    // header comment for why). Nothing else needs the camera-aware "local" variant.
    // Perf (#1162, Han 2026-08-27, "de camera-update moet echt anders" — Fase 1): `worldToScreenX`/
    // `leftPxForFactor(1)` above are STILL unstable while the camera genuinely pans (they depend on
    // `cameraX`, by design — the deps comment above already says so). This is the fix for that: a ground-
    // plane (factor=1) wrapper `<div>`s (`sceneryScrollBackRef`/`sceneryScrollFrontRef`/
    // `overlayScrollBackRef`/`overlayScrollFrontRef`, declared above next to the camera rAF loop that
    // writes them) whose
    // `transform: translateX(...)` is written IMPERATIVELY every rAF frame by the SAME loop that already
    // computes `cameraX` (see that effect's own comment), bypassing React/props entirely for the pan
    // offset — exactly the pattern `SheetRpgLayer.jsx`'s `frozenScrollPxRef` already uses for its own
    // scroll transform (§1050). Content placed INSIDE that wrapper positions itself with these LOCAL
    // variants — `centerX + worldX*zoom`, i.e. the SAME formula with the `- cameraX` term dropped — which
    // depend on `centerX`/`zoom` only, genuinely stable while only the camera (not the viewport size or
    // zoom level) changes, so consumers wrapped this way keep a real `React.memo` hit while panning.
    // Scoped to the plain DOM/2D-canvas layers only this round (`LdtkScenery`'s ground `CanvasLayer` —
    // whose OWN header comment already says panning-via-CSS-`left` was the original intent —
    // `WaterReflectionLayer`, `LdtkAnimatedTiles`): those position themselves with a single CSS
    // `left`/`background-position` write, so wrapping them is a straightforward "drop the camera term,
    // let the ancestor transform supply it" change. The WebGL INSTANCE layers (`LdtkLitGround`,
    // `ForegroundFoliageLayer`) bake each instance's camera-aware `screenX` into per-frame draw-call data
    // rather than a single CSS transform — giving THEM the same treatment needs a live camera-offset
    // shader uniform instead, a separate, GLSL-touching follow-up, not done this round. Background
    // parallax layers (factor <1, inside `LdtkScenery`'s own `backgroundLayers` loop) are few in number
    // (a handful of hand-authored layers, not hundreds of placed tiles) and also left on the existing
    // camera-dependent `leftPxForFactor` path for the same reason — lower cost, not worth the same
    // wrapper machinery this round.
    const worldToScreenXLocal = useCallback((worldX) => centerX + worldX * zoom, [centerX, zoom]);
    const localWorldToScreenXLocal = useCallback((localX) => worldToScreenXLocal(LEVEL_MIN_X + localX), [worldToScreenXLocal]);
    const groundLeftPxLocal = useMemo(() => centerX + LEVEL_MIN_X * zoom, [centerX, zoom]);
    // #925 follow-up (Han 2026-08-16, "env audio moet aanpassen aan wat in beeld is" — round 2, 2026-08-17,
    // "definieer audio in chunks, niet in beeldlengtes"): rebuilt fresh every render (cheap — just
    // references, no computation) and stashed in a ref so useWorldAmbientMusic's own internal timers
    // always read LIVE data without needing to tear down/resubscribe on every camera-move re-render (same
    // "live ref" pattern used throughout this session's other new hooks). `listenerX` is the hero's own
    // ABSOLUTE LDtk world position (playerX, NOT canvas-local) — the same coordinate space
    // birdPositionsRef's positions are already in (LDtk's own `__worldX`, see ldtkWorld.js); `levelMinX`
    // lets the hook convert water tiles' canvas-local worldX back to that same absolute space itself.
    envAudioRef.current = {
        listenerX: playerX, levelMinX: LEVEL_MIN_X, birdPositionsRef,
        waterTiles: sceneryMode === 'LDtk' ? [...waterTilesBack, ...waterTilesFront] : [],
    };
    useWorldAmbientMusic({ active: true, context, musicVolumeMultiplier: rpgMusicVolumeMultiplier, envAudioRef });
    // Hero/pet/Wisp/Slime always stand on this line, regardless of which scenery is showing underneath
    // them — LDtk mode uses the hardcoded `STAND_HEIGHT_PX` (own comment above) scaled by the SAME dynamic
    // zoom every other LDtk element uses; legacy mode keeps its own fixed `GROUND_ANCHOR`.
    // #1040 (Han 2026-08-17, collision-mask interview: "all ground-anchored entities... exclude flying and
    // on-water"): each entity now asks `groundHeightAt` for ITS OWN X — a single shared `standAnchor`
    // constant can't represent a sloped/stepped Collision_mask area, since different entities standing at
    // different X positions may be on different parts of a ramp. `groundHeightAt` takes a CANVAS-LOCAL X
    // (canonical conversion: absolute worldX - LEVEL_MIN_X, same as `ldtkLights` above) and already
    // falls back to flat STAND_HEIGHT_PX where no Collision_mask tile covers that X.
    const standAnchorFor = (absoluteWorldX) => sceneryMode === 'LDtk'
        ? groundHeightAt(absoluteWorldX - LEVEL_MIN_X) * zoom
        : GROUND_ANCHOR;
    // Perf (#1161): useCallback for the same reason as worldToScreenX/leftPxForFactor above — a stable
    // identity so useMemo below (the actual per-frame culled-instance arrays) can skip recomputing when
    // nothing it reads has genuinely changed.
    // Perf (#1162, Fase 2b): `localWorldToScreenXLocal` (camera-independent) — culling AND the camera
    // offset both moved into `ForegroundFoliageLayer`'s own draw loop (see its `cameraOffsetRef` prop
    // comment), so `screenX` here is now LOCAL, not the final on-screen position.
    const foliageInstanceProps = useCallback((inst) => ({
        diffuseUrl: inst.diffuseUrl, diffuseUV: inst.diffuseUV, normalUrl: inst.normalUrl,
        screenX: localWorldToScreenXLocal(inst.localX),
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
        // #1032: passed through so ForegroundFoliageLayer's draw loop can swap in water's own pixel-switch
        // uniforms (`foliageInstanceProps` explicitly whitelists fields, so this needs listing here too).
        isWater: inst.isWater,
    }), [localWorldToScreenXLocal, size.h, zoom]);
    // Perf (#1162, Fase 10c, docs/architecture.md §339/§340): builds the ATLAS-backed instance shape
    // straight from the raw LDtk tiles (`world.foliageTilesBack/Front`) — deliberately NOT derived from the
    // now-removed `useLdtkFoliageInstances` output above, since that hook's `diffuseUV` was in SHEET space
    // (fraction of the whole tileset image); this needs ATLAS space (fraction of `foliageAtlas`'s packed
    // canvas), looked up by the exact same `${tilesetUrl}|${src[0]},${src[1]}` key `useLdtkFoliageAtlas.js`
    // itself dedupes by (§6c: reuse the identity scheme, don't invent a second one). Mirrors
    // `useLdtkFoliageInstances.js`'s own `instanceFor` position/flip math line-for-line (`localX`,
    // `localBottomFromLevelBottom`, the flipX/flipY UV-rect mirror) — that's proven-correct positioning
    // logic, only the UV SOURCE changes.
    // A tile whose crop hasn't been packed into the atlas YET (still-pending idle-callback batch, or atlas
    // hasn't started for a freshly mounted world) is simply skipped this render — it reappears the next
    // time `foliageAtlas` publishes a newer batch and this `useMemo` re-runs, same "pops in over a few idle
    // slices" tolerance `useLdtkFoliageAtlas.js`'s own header comment already documents.
    const atlasFoliageInstanceFor = useCallback((tile) => {
        if (!foliageAtlas) return null;
        const key = `${tile.tilesetUrl}|${tile.src[0]},${tile.src[1]}`;
        const uv = foliageAtlas.uvByKey.get(key);
        if (!uv) return null;
        const [u0, v0, u1, v1] = uv;
        const localX = tile.worldX + world.gridSize / 2;
        const localBottomFromLevelBottom = LEVEL_PX_HEIGHT - tile.worldY - world.gridSize;
        return {
            diffuseUV: [
                tile.flipX ? u1 : u0, tile.flipY ? v1 : v0,
                tile.flipX ? u0 : u1, tile.flipY ? v0 : v1,
            ],
            screenX: localWorldToScreenXLocal(localX),
            screenY: size.h - localBottomFromLevelBottom * zoom,
            widthPx: world.gridSize * zoom, heightPx: world.gridSize * zoom,
            worldX: localX, worldWidth: world.gridSize, worldHeight: world.gridSize,
            groundDistOffset: localBottomFromLevelBottom,
            // Same as `useLdtkFoliageInstances.js`'s `instanceFor`: all LDtk foliage tiles wave+skew, none
            // are `kind:'floor'` or water (water stays on the un-atlased path — see `useLdtkFoliageAtlas.js`
            // header comment) or edge-lit-only.
            wave: true, skew: true,
        };
    }, [foliageAtlas, world.gridSize, localWorldToScreenXLocal, size.h, zoom]);
    const atlasFoliageInstancesBack = useMemo(
        () => world.foliageTilesBack.map(atlasFoliageInstanceFor).filter(Boolean),
        [world.foliageTilesBack, atlasFoliageInstanceFor],
    );
    const atlasFoliageInstancesFront = useMemo(
        () => world.foliageTilesFront.map(atlasFoliageInstanceFor).filter(Boolean),
        [world.foliageTilesFront, atlasFoliageInstanceFor],
    );
    // #RAM-level (Han 2026-08-11, "de animatie is behoorlijk schokkerig... hoe is de performance?"):
    // `ForegroundFoliageLayer` draws ONE `gl.drawArrays` call per instance, not batched (its own file
    // header) — a level with ~1000 foliage tiles (Pine_forest_foliage2 alone has ~800) meant ~1000
    // uncullled draw calls EVERY frame regardless of camera position, the dominant cost behind the choppy
    // animation/scrolling Han measured (LCP 5.37s, INP 816ms). Foliage/animated tiles scattered across the
    // whole level only need to draw the handful currently on-screen — filtered by projected `screenX` (a
    // fixed pixel margin around the viewport) before reaching the shader, cutting the typical per-frame
    // instance count from ~1000 to whatever's actually visible.
    // #925 follow-up (Han 2026-08-16, "de watertiles zijn soms niet zichtbaar (despawn), vooral tijdens
    // veel schermbeweging"): widened from 200 — a fast camera pan can move a tile from "just inside the
    // old margin" to "just outside the viewport" across a couple of frames, and the reverse on re-entry;
    // a bigger buffer gives more slack before a genuinely visible tile gets culled. Mitigation, not a
    // structural fix — flag if this doesn't fully resolve it, since cull-margin size can only ever reduce
    // the WINDOW where a fast-enough pan still outruns it, not eliminate it category.
    //
    // Perf (#1162, Fase 2b): the FOLIAGE culling this comment originally described moved into
    // `ForegroundFoliageLayer`'s own draw loop (its own `cameraOffsetRef`-adjacent cull check, same
    // 400px margin, kept in sync manually).
    // Perf (Han 2026-08-27, "elke schermbreedte vertraagt de animatie even"): the animated-tiles
    // (campfire) cull — the cheaper DOM-based `LdtkAnimatedTiles` path, which has no draw loop of its own
    // — used to be a camera-aware `useMemo` that silently rebuilt every rAF frame during movement despite
    // its own comment claiming otherwise (see `useCulledAnimatedTiles`'s own header comment for the full
    // story). Moved onto that throttled hook, which uses the SAME `CULL_MARGIN_PX` and camera-independent
    // positioning `ForegroundFoliageLayer`'s own culling already relies on.
    const culledAnimatedTilesBack = useCulledAnimatedTiles(nonWaterAnimatedTilesBack, localWorldToScreenXLocal, cameraOffsetRef, sizeRef);
    const culledAnimatedTilesFront = useCulledAnimatedTiles(nonWaterAnimatedTilesFront, localWorldToScreenXLocal, cameraOffsetRef, sizeRef);
    // Perf (#1162, Fase 2b): no longer culled here — `ForegroundFoliageLayer`'s own draw loop culls
    // against the LIVE camera offset every frame instead (see its `cameraOffsetRef` prop comment). These
    // two stay `useMemo`'d so they're genuinely stable — and skip rebuilding entirely — while only the
    // camera pans (only foliage/water CONTENT changes invalidate them now, not `cameraX`).
    // Perf (#1162, Fase 10c): WATER-ONLY now — foliage moved to the atlas-backed instanced path above
    // (`atlasFoliageInstancesBack/Front`). Water stays on this original per-instance-uniform path (see
    // `useLdtkFoliageAtlas.js`'s own header comment for why it wasn't folded into the atlas too).
    const localFoliageInstancesBack = useMemo(
        () => waterInstancesBack.map((inst) => foliageInstanceProps(inst)),
        [foliageInstanceProps, waterInstancesBack],
    );
    const localFoliageInstancesFront = useMemo(
        () => waterInstancesFront.map((inst) => foliageInstanceProps(inst)),
        [foliageInstanceProps, waterInstancesFront],
    );

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
                // #UI-overhaul Stap 3 bug: was `/ ZOOM` (the fixed module constant) — wrong whenever the
                // live `zoom` differs (LDtk `dynamicZoom`, or an explicit integer `worldScale`), same
                // class of bug as the #1032-round-4 DebugGrid fix ("gebruik je universele schalingfactor?").
                moveTo(cameraX + (e.clientX - rect.left - centerX) / zoom);
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
                touches the backgrounds, never double-darkens anything drawn later).
                Perf (#1162, Fase 5, Han 2026-08-27): gated to Legacy-mode only. This is a CSS
                `mix-blend-mode: multiply` approximation of day/night tint predating the LDtk/RAM-level
                scenery pipeline (§141 predates the #RAM-level tags below by months) — RAM-level has its OWN
                proper WebGL-shader `globalIllumination` lighting (`ldtkLights`/`foliageParams`, consumed by
                `LdtkLitGround`/`ForegroundFoliageLayer`/`SceneryBack`/`SceneryFront`), so this CSS overlay
                was pure dead weight there: full-viewport, `pointerEvents:'none'`, `inset:0`, blending
                nothing underneath in LDtk mode (Legacy's own background layers are the only thing it was
                ever meant to darken — see this comment's own first line). `mix-blend-mode` forces the
                browser to composite an isolated blending surface every frame regardless of whether its
                content changed — a real per-frame paint/composite cost invisible to a JS CPU profile (a
                #1162 profiling pass found >85% of frame time during movement falling outside JS execution
                entirely, in the profiler's unattributed "(program)" bucket — this overlay was the first
                concrete lead found there). Never mounting it at all outside Legacy mode removes that cost
                for RAM-level without touching anything RAM-level actually uses for its own lighting. */}
            {sceneryMode === 'Legacy' && <div style={domDarkenOverlayStyle} />}

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
            {/* Perf (#1162, Fase 4): extracted into a memoized `SceneryBack` (defined above, before
                `RpgLevelPanel`) — same rationale as `EntityLayer`'s own header comment. Bundles
                `LdtkScenery` + `LdtkLitGround` + the `LdtkAnimatedTiles`/`WaterReflectionLayer` wrapper +
                `ForegroundFoliageLayer` for the back-of-entities pass. */}
            <SceneryBack
                sceneryMode={sceneryMode} groundAndFoliageBack={groundAndFoliageBack} world={world}
                leftPxForFactor={leftPxForFactor} sceneryScrollBackRef={sceneryScrollBackRef}
                groundLeftPxLocal={groundLeftPxLocal} zoom={zoom} litGroundTexturesBack={litGroundTexturesBack}
                size={size} ldtkLights={ldtkLights} foliageParams={foliageParams}
                foliageDebugChannel={foliageDebugChannel} overlayScrollBackRef={overlayScrollBackRef}
                culledAnimatedTilesBack={culledAnimatedTilesBack} localWorldToScreenXLocal={localWorldToScreenXLocal}
                reflectableTiles={reflectableTiles} waterPonds={waterPonds} worldToScreenXLocal={worldToScreenXLocal}
                waterInstancesBack={waterInstancesBack}
                localFoliageInstancesBack={localFoliageInstancesBack} cameraOffsetRef={cameraOffsetRef}
                foliageAtlas={foliageAtlas} atlasFoliageInstancesBack={atlasFoliageInstancesBack}
            />

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

            {/* Perf (#1162, Fase 3): extracted into a memoized `EntityLayer` (defined above, before this
                component) — see its own header comment for why. All the props below are either already
                stable during a pure camera pan (Fase 1/2's own work), refs, or plain callbacks/booleans. */}
            <EntityLayer
                entityScrollRef={entityScrollRef} wispVariant={wispVariant} wispFlying={wispFlying} debugMode={debugMode} clickNpc={clickNpc}
                worldToScreenXLocal={worldToScreenXLocal} standAnchorFor={standAnchorFor} petFrame={petFrame}
                zoom={zoom} EntityReflection={EntityReflection} sceneryMode={sceneryMode}
                clickSlime={clickSlime} workerNpcs={workerNpcs} timeSignature={timeSignature}
                context={context} workerNpcAudio={workerNpcAudio} playerXRef={playerXRef}
                critterWanderers={critterWanderers} foliageParams={foliageParams}
                birdPositionsRef={birdPositionsRef} birdSlots={birdSlots} birdSlotClaimsRef={birdSlotClaimsRef}
                char={char} noPetChar={noPetChar} moving={moving} running={running}
                walkAnim={walkAnim} runAnim={runAnim} idleAnim={idleAnim} walkFrame={walkFrame}
                facing={facing} playerX={playerX} petUrl={petUrl} petVariant={petVariant}
                petX={petX} petMoving={petMoving}
            />

            {/* #RAM-level (Han 2026-08-11, "houd goed de volgorde van lagen aan"): scenery whose SOURCE
                layer sits IN FRONT of the `Entities` layer in the .ldtk file's own paint order —
                Grass_decoration_fg's edge decoration, Blacksmith/Alchemist buildings, interior walls.
                Rendered AFTER hero/pet/Wisp/Slime so it correctly draws on top of them, mirroring the
                source file exactly (see the back-of-entities pass earlier in this render for the rest). */}
            {/* Perf (#1162, Fase 4): extracted into a memoized `SceneryFront` (defined above, before
                `RpgLevelPanel`) — same rationale as `SceneryBack`/`EntityLayer`'s own header comments. */}
            <SceneryFront
                sceneryMode={sceneryMode} groundAndFoliageFront={groundAndFoliageFront} world={world}
                leftPxForFactor={leftPxForFactor} sceneryScrollFrontRef={sceneryScrollFrontRef}
                groundLeftPxLocal={groundLeftPxLocal} zoom={zoom} litGroundTexturesFront={litGroundTexturesFront}
                size={size} ldtkLights={ldtkLights} foliageParams={foliageParams}
                foliageDebugChannel={foliageDebugChannel} overlayScrollFrontRef={overlayScrollFrontRef}
                culledAnimatedTilesFront={culledAnimatedTilesFront} localWorldToScreenXLocal={localWorldToScreenXLocal}
                waterInstancesFront={waterInstancesFront}
                localFoliageInstancesFront={localFoliageInstancesFront} cameraOffsetRef={cameraOffsetRef}
                foliageAtlas={foliageAtlas} atlasFoliageInstancesFront={atlasFoliageInstancesFront}
            />

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

            {debugMode && size.w > 0 && <DebugGrid widthPx={size.w} heightPx={size.h} cameraX={cameraX} zoom={zoom} />}

            {/* Perf (#1162, Fase 10a, docs/architecture.md §337): visual check for the new foliage texture
                atlas, gated behind debugMode like every other debug affordance in this file (§3a) — this
                phase deliberately does NOT wire the atlas into rendering yet, so this preview is the only
                way to confirm the packing is correct (no gaps/overlaps between crops, normal-map crops
                aligned with their diffuse counterparts) before Fase 10b builds anything on top of it. */}
            {debugMode && foliageAtlas && (
                <div style={{
                    position: 'absolute', bottom: 8, right: 8, zIndex: 6, display: 'flex', gap: 4,
                    background: 'rgba(0,0,0,0.6)', padding: 4, borderRadius: 4,
                    border: '1px solid rgba(255,255,255,0.4)',
                }}>
                    <div>
                        <div style={{ color: '#fff', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 10 }}>
                            atlas diffuse {foliageAtlas.diffuseCanvas.width}×{foliageAtlas.diffuseCanvas.height} ({foliageAtlas.uvByKey.size} crops)
                        </div>
                        <img alt="foliage diffuse atlas" src={foliageAtlas.diffuseCanvas.toDataURL()} style={{ width: 160, imageRendering: 'pixelated', display: 'block' }} />
                    </div>
                    <div>
                        <div style={{ color: '#fff', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 10 }}>
                            atlas normal
                        </div>
                        <img alt="foliage normal atlas" src={foliageAtlas.normalCanvas.toDataURL()} style={{ width: 160, imageRendering: 'pixelated', display: 'block' }} />
                    </div>
                </div>
            )}

            {/* Perf (#1162, Fase 10b, docs/architecture.md §339): isolated instanced-draw mechanism test —
                see FoliageInstancingTest.jsx's own header comment. Not real content, purely "does instancing
                against the shared atlas draw correctly, lit correctly" verification before Fase 10c touches
                the real rendering. */}
            {debugMode && foliageAtlas && (
                <FoliageInstancingTest atlas={foliageAtlas} foliageParams={foliageParams} lights={ldtkLights} />
            )}

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
            {/* #1032 round 8 (Han: "wave en water mogen dezelfde steps, speed, noise, dither, blend mode
                hebben... dus enkel white caps op water"): steps/dither/blend mode reverted to the ONE
                shared preset above (water included) — only white caps stay water-exclusive, see below. */}
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
            {/* #1032 round 8 (Han: "bomen enzo moeten geen white caps hebben; white cap enkel op water"):
                white caps are now water-exclusive — no shared/global variant exists anymore. */}
            <ParamSlider label="Water white cap: threshold" value={params.waterWhiteCapThreshold} min={0.5} max={1} step={0.01} onChange={(v) => onChange('waterWhiteCapThreshold', v)} />
            <ParamSlider label="Water white cap: strength" value={params.waterWhiteCapStrength} min={0} max={1} step={0.01} onChange={(v) => onChange('waterWhiteCapStrength', v)} />
            {/* #RAM-level (Han 2026-08-11, "verplaats wind en time of day togglers naar links World
                settings"): Wind and Time-of-day moved to the World debug panel (top-left) — see that
                panel's own LevelPicker calls, driven by the SAME `foliageParams`/`setFoliageParam`. */}
            </>)}
        </div>
    );
}
