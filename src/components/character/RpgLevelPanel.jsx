import React, { useEffect, useMemo, useRef, useState } from 'react';
import CharacterDoll, { CROP as HERO_CROP, PET_CROP } from './CharacterDoll';
import { ANIMATIONS, urlOfLayer } from '../../model/characterAssets';
import { CreatureSprite } from './BestiaryPanels';
import { findMoveAnim, findIdleAnim, isFlyingAnim, findCreatureByName, findVariantByUrl } from '../../model/bestiaryAssets';
import { GROUND_ANCHOR_PX } from '../../model/worldAnchor';
import { loadImageEl, normalMapCanvasFromCrop } from '../../utils/runtimeNormalMap';
import { LEVEL_MIN_X, LEVEL_MAX_X } from '../../hooks/useRpgLevelState';
import floorTiles2Url from '../../assets/ASSORTED/tiles/tiles/Floor Tiles2.png';
import treeSheetUrl from '../../assets/ASSORTED/tiles/trees/Trees_foliage_trunk.png';
import decorUrl from '../../assets/ASSORTED/tiles/int_ext_decoration/Decor.png';
import ForegroundFoliageLayer, { DEFAULT_FOLIAGE_PARAMS } from './ForegroundFoliageLayer';
// #141 (Han 2026-08-05): pre-generated normal maps for the shimmer shader — see
// scripts/generate-tree-normal-maps.mjs (Sobel height-gradient derived from the diffuse art itself, no
// hand-painted normal-map asset needed).
import treeFoliageSummerNormalUrl from '../../assets/ASSORTED/tiles/trees/generated/tree-foliage-summer-normal.png';
import grassNormalR5C1Url from '../../assets/ASSORTED/tiles/trees/generated/grass-normal-r5c1.png';
import grassNormalR5C2Url from '../../assets/ASSORTED/tiles/trees/generated/grass-normal-r5c2.png';
import grassNormalR5C3Url from '../../assets/ASSORTED/tiles/trees/generated/grass-normal-r5c3.png';
import grassNormalR6C1Url from '../../assets/ASSORTED/tiles/trees/generated/grass-normal-r6c1.png';
import grassNormalR7C1Url from '../../assets/ASSORTED/tiles/trees/generated/grass-normal-r7c1.png';
import crateNormalUrl from '../../assets/ASSORTED/tiles/trees/generated/crate-normal.png';
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
// #141 round 8 (Han: "move the wisp close to the tree"): was 0 (roughly centered between tree/tent), now
// close beside the tree's canopy (canopy half-width 128 native px, TREE_X=-220) without overlapping it.
const NPC_X = -140;
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
function WorldCreature({ variant, moving, frame, facing = 1 }) {
    if (!variant) return null;
    const anim = (moving && findMoveAnim(variant)) || findIdleAnim(variant);
    const cropW = variant.crop.w * ZOOM, cropH = variant.crop.h * ZOOM;
    const transform = isFlyingAnim(anim)
        ? `translate(0px, ${-HOVER_PX}px) scale(${facing}, 1)`
        : `scale(${facing}, 1)`;
    return (
        <div style={{ width: cropW, height: cropH, transform }}>
            <CreatureSprite variant={variant} anim={anim} frame={frame} scale={ZOOM} framed={false} />
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
function WorldPet({ url, frame, facing = 1 }) {
    if (!url) return null;
    const cropW = PET_CROP.w * ZOOM, cropH = PET_CROP.h * ZOOM;
    const cell = frame % 5;   // idle row, 5 frames — the shared convention every pet sheet in this folder uses
    return (
        <div style={{ position: 'relative', width: cropW, height: cropH, overflow: 'hidden', transform: `scale(${facing}, 1)` }}>
            <div style={{ position: 'absolute', left: -PET_CROP.x * ZOOM, top: -PET_CROP.y * ZOOM, width: 32 * ZOOM, height: 32 * ZOOM, overflow: 'hidden' }}>
                <div style={{
                    width: 32, height: 32, transform: `scale(${ZOOM})`, transformOrigin: 'top left',
                    backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat', backgroundSize: 'auto',
                    backgroundPosition: `${-cell * 32}px 0px`, imageRendering: 'pixelated',
                }} />
            </div>
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

export default function RpgLevelPanel({ characterEditor, rpgLevel, debugMode = false }) {
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
    useEffect(() => {
        const id = setInterval(() => setPetFrame((f) => f + 1), 150);
        return () => clearInterval(id);
    }, []);

    const { char } = characterEditor;
    const { playerX, petX, facing, moving, petMoving, moveTo, clickNpc, setHeldDirection } = rpgLevel;

    // #693 round 7 (Han: "level should start moving when the character is at 1/3 of either screen edge"):
    // a dead-zone follow camera — the camera only moves once the player's ON-SCREEN position leaves the
    // middle third, then re-centers them back to that 1/3 line; clamped so the viewport never shows past
    // the generated level's own edges.
    const playerXRef = useRef(playerX); playerXRef.current = playerX;
    useEffect(() => {
        let raf;
        const tick = () => {
            setCameraX((cam) => {
                if (size.w === 0) return cam;
                const viewHalfWorld = (size.w / 2) / ZOOM;
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
    }, [size.w]);

    const wispVariant = useMemo(() => findCreatureByName('Wisp'), []);
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
    const idleAnim = ANIMATIONS.find((a) => a.key === 'rest');
    const [walkFrame, setWalkFrame] = useState(0);
    useEffect(() => {
        if (!moving) { setWalkFrame(0); return; }
        const id = setInterval(() => setWalkFrame((f) => f + 1), 120);
        return () => clearInterval(id);
    }, [moving]);

    // #693 round 3: strip the pet LAYER from the doll — it's rendered as its own trailing sprite instead
    // (see the standalone `<WorldCreature>` below), so the doll must not ALSO draw its built-in glued-on
    // pet.
    const noPetChar = useMemo(() => (char ? { ...char, layers: { ...char.layers, pet: null } } : char), [char]);
    const centerX = size.w / 2;
    // #693 round 7: EVERY world object now goes through this ONE conversion (was `centerX + worldX*ZOOM`
    // — a fixed mapping that only worked because the camera never moved) so introducing the scrolling
    // camera couldn't silently miss a spot.
    const worldToScreenX = (worldX) => centerX + (worldX - cameraX) * ZOOM;

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
    }, [floorTileIdx]);

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
            {PARALLAX_LAYERS.map(({ url, factor }, i) => {
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
            {!runtimeTextures && (
                <div style={{ position: 'absolute', bottom: 0, left: worldToScreenX(LEVEL_MIN_X), display: 'flex' }}>
                    {floorTileIdx.map((idx, i) => {
                        const cell = FLOOR_CELLS[idx];
                        return <SheetCrop key={i} url={floorTiles2Url} sheet={FLOOR_SHEET} tile={FLOOR_TILE} row={cell.row} col={cell.col} />;
                    })}
                </div>
            )}
            {!runtimeTextures && (
                <div style={{
                    position: 'absolute', left: worldToScreenX(TREE_X), bottom: GROUND_ANCHOR,
                    width: TREE_CELL.w * ZOOM, height: TREE_CELL.h * ZOOM, transform: 'translateX(-50%)',
                    backgroundImage: `url("${treeSheetUrl}")`,
                    backgroundPosition: `${-(TRUNK_CELL.col - 1) * TREE_CELL.w * ZOOM}px ${-(TRUNK_CELL.row - 1) * TREE_CELL.h * ZOOM}px`,
                    backgroundSize: `${TREE_SHEET.w * ZOOM}px ${TREE_SHEET.h * ZOOM}px`,
                    backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', pointerEvents: 'none',
                }} />
            )}
            {!runtimeTextures && (
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
            {runtimeTextures && (
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
                    style={{ position: 'absolute', left: worldToScreenX(NPC_X), bottom: GROUND_ANCHOR, transform: 'translateX(-50%)', cursor: 'pointer' }}
                >
                    <WorldCreature variant={wispVariant} moving={false} frame={petFrame} facing={1} />
                </div>
            )}

            {/* Hero — same paper-doll renderer as everywhere else (§6d), standing on the floor, walking
                left/right (A/D, arrow keys, edge-hold, or tap-to-move) via `useRpgLevelState`. `noPetChar`:
                the pet is rendered as its OWN trailing sprite below, so the doll's built-in pet LAYER is
                stripped here to avoid double-drawing it glued to the character's hip. */}
            {char && (
                <div style={{
                    position: 'absolute', left: worldToScreenX(playerX), bottom: GROUND_ANCHOR,
                    transform: `translateX(-50%) scaleX(${facing})`,
                }}>
                    <CharacterDoll char={noPetChar} anim={moving ? walkAnim : idleAnim} frame={moving ? walkFrame : 0} height={HERO_CROP.h * ZOOM} />
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
                <div style={{ position: 'absolute', left: worldToScreenX(petX), bottom: GROUND_ANCHOR, transform: 'translateX(-50%)' }}>
                    {petVariant
                        ? <WorldCreature variant={petVariant} moving={petMoving} frame={petFrame} facing={petX <= playerX ? 1 : -1} />
                        : <WorldPet url={petUrl} frame={petFrame} facing={petX <= playerX ? 1 : -1} />}
                </div>
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
                repeated WebGL-context-destroying remounts as `size` settled. */}
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
    const [collapsed, setCollapsed] = useState(false);
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
            <hr style={{ opacity: 0.3, margin: '8px 0' }} />
            <LevelPicker
                label="Time of day"
                levels={TIME_OF_DAY_ILLUM}
                value={params.timeOfDay}
                onChange={(level) => {
                    onChange('timeOfDay', level);
                    onChange('globalIllumination', TIME_OF_DAY_ILLUM[level]);
                }}
            />
            {/* #141 round 19 (Han: "maak ook een slider voor normal map strength voor illumination") — 1.0
                full relief (current look), 0.0 fully flat "from above". The floor ignores this entirely and
                is ALWAYS flat (Han: "normal map van de floor tiles mag toch globaal 'van boven' zijn"). */}
            <ParamSlider label="Normal map strength" value={params.normalStrength} min={0} max={1} step={0.01} onChange={(v) => onChange('normalStrength', v)} />
            <hr style={{ opacity: 0.3, margin: '8px 0' }} />
            <LevelPicker
                label="Wind"
                levels={WIND_LEVEL_PX}
                value={params.windLevel}
                onChange={(level) => {
                    onChange('windLevel', level);
                    onChange('skewAmount', WIND_LEVEL_PX[level]);
                    onChange('stretchAmount', WIND_LEVEL_PX[level]);
                }}
            />
            </>)}
        </div>
    );
}
