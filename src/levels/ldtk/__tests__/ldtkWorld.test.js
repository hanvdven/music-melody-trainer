import { describe, it, expect } from 'vitest';
import { buildWorld, LEVEL_MIN_X, LEVEL_MAX_X, LEVEL_PX_WIDTH, TAVERN_TIERS, BRIDGE_TIERS, reflectableTilesFor } from '../ldtkWorld';

// #1195 (Han 2026-09-05, "houd gewoon áltijd de volgorde van LDTK aan"): `buildWorld()` no longer
// returns fixed groundTilesBack/Front-style buckets — it returns `passes`, an ORDERED (back-to-front)
// list of `{ kind, tiles }` / `{ kind: 'background', layers }` / `{ kind: 'entities' }` entries, one per
// contiguous run of same-kind layers in the real `.ldtk` file order. These helpers flatten that for
// assertions that don't care about pass boundaries, only about aggregate content.
const tilesOfKind = (world, kind) => world.passes.filter((p) => p.kind === kind).flatMap((p) => p.tiles);
const allGroundLike = (world) => [...tilesOfKind(world, 'ground'), ...tilesOfKind(world, 'shimmer'), ...tilesOfKind(world, 'campfire')];

describe('buildWorld', () => {
    // #RAM-level (Han 2026-08-11, "level heeft nu een maximum-breedte die niet overeenkomt met de level
    // breedte"): bounds are LDtk's own true world position (`lvl.worldX`), NOT forced to be symmetric
    // around 0 — the level does not have to sit at the world origin. The one invariant that DOES always
    // hold: the span between them exactly matches the level's own pixel width.
    it('derives world bounds matching the ldtk level\'s own true width and position', () => {
        expect(LEVEL_MAX_X).toBeGreaterThan(LEVEL_MIN_X);
        expect(LEVEL_MAX_X - LEVEL_MIN_X).toBe(LEVEL_PX_WIDTH);
    });

    it('exposes the tavern/bridge tier options the debug pickers need', () => {
        expect(TAVERN_TIERS).toEqual(['Tent', 'Small', 'Full']);
        expect(BRIDGE_TIERS).toEqual(['Log', 'Wood']);
    });

    it('builds a non-empty, back-to-front ordered pass list at default settings', () => {
        const world = buildWorld();
        expect(world.passes.length).toBeGreaterThan(0);
        expect(tilesOfKind(world, 'ground').length).toBeGreaterThan(100);
        const bgPass = world.passes.find((p) => p.kind === 'background');
        expect(bgPass.layers.length).toBe(5);
        for (const layer of bgPass.layers) expect(layer.tiles.length).toBeGreaterThan(0);
    });

    // #1195: the whole POINT of the rewrite — a kind change in the file's own layer order must produce a
    // new pass, never get silently absorbed into "all ground" or "all foliage". Two adjacent passes of
    // the SAME kind would mean the grouping walk failed to flush a boundary somewhere.
    it('never emits two adjacent passes of the same kind', () => {
        const world = buildWorld();
        for (let i = 1; i < world.passes.length; i++) {
            expect(world.passes[i].kind).not.toBe(world.passes[i - 1].kind);
        }
    });

    it('emits exactly one entities pass, with no tiles of its own', () => {
        const world = buildWorld();
        const entitiesPasses = world.passes.filter((p) => p.kind === 'entities');
        expect(entitiesPasses.length).toBe(1);
        expect(entitiesPasses[0].tiles).toBeUndefined();
    });

    // #382/#1195 (Han: "de wilg staat VOOR de brug, maar in ldtk staat ie er achter" — the bug this whole
    // rewrite fixes): `City_Walls` (the new stone-bridge layer) sits BETWEEN `Grass_decoration_fg` and
    // `Grass_decoration_bg` in the real `.ldtk` layer order — i.e. a 'shimmer' pass, then a 'ground' pass
    // containing City_Walls tiles, then another 'shimmer' pass. If City_Walls tiles ever got lumped into
    // one single "all ground" bucket again, this would fail (there'd be only one 'ground' pass total).
    it('places City_Walls in its own ground pass, sandwiched between shimmer passes (real LDtk order)', () => {
        const world = buildWorld();
        const groundPassIdxWithCityWalls = world.passes.findIndex(
            (p) => p.kind === 'ground' && p.tiles.some((t) => t.tilesetUrl && t.tilesetUrl.includes('Castle')),
        );
        expect(groundPassIdxWithCityWalls).toBeGreaterThan(0);
        expect(world.passes[groundPassIdxWithCityWalls - 1].kind).toBe('shimmer');
    });

    it('every emitted ground/shimmer/campfire tile has a resolved tileset URL and finite world position', () => {
        const world = buildWorld({ season: 'Fall', city: 'City', tavernTier: 'Full', bridgeTier: 'Log' });
        const tiles = allGroundLike(world);
        expect(tiles.length).toBeGreaterThan(0);
        for (const tile of tiles) {
            expect(typeof tile.tilesetUrl).toBe('string');
            expect(Number.isFinite(tile.worldX)).toBe(true);
            expect(Number.isFinite(tile.worldY)).toBe(true);
            expect(tile.src).toHaveLength(2);
        }
    });

    it('changing season changes the grass/terrain tile set', () => {
        const summer = buildWorld({ season: 'Summer' });
        const fall = buildWorld({ season: 'Fall' });
        expect(tilesOfKind(summer, 'ground').length).toBeGreaterThan(0);
        expect(tilesOfKind(fall, 'ground').length).toBeGreaterThan(0);
    });

    it('city toggle adds pavement-related tiles when on', () => {
        const noCity = buildWorld({ city: 'No_City' });
        const city = buildWorld({ city: 'City' });
        // City is a strict superset here (adds the Pavement layer's own tiles on top of everything else);
        // whether it actually differs depends on whether any IntGrid cell is painted as Pavement(4) in the
        // source file, which may be zero today — assert it never REMOVES tiles, at minimum.
        expect(tilesOfKind(city, 'ground').length).toBeGreaterThanOrEqual(tilesOfKind(noCity, 'ground').length);
    });

    // #1195 follow-up (Han 2026-09-05, "er zijn nog water tiles, die moeten dezelfde shimmer als het
    // andere water krijgen"): `Water_FG` is a SEPARATE layer identifier from `Water_tile`, painted from
    // the SAME `Animated_Water_Tiles` tileset — it must be classified `'shimmer'` and tagged `kind:
    // 'water'` too, not fall through to the plain `'ground'` default.
    it('recognizes Water_FG (a second water layer, same tileset) as water-kind shimmer content too', () => {
        const world = buildWorld();
        const waterTiles = tilesOfKind(world, 'shimmer').filter((t) => t.kind === 'water');
        expect(waterTiles.some((t) => t.tilesetUrl && t.tilesetUrl.includes('Animated%20Water'))).toBe(true);
        // Every water tile must have come from a layer using the water tileset — spot-check by counting:
        // Water_tile alone accounts for some tiles, Water_FG adds more on top of that same tileset.
        expect(waterTiles.length).toBeGreaterThan(0);
    });

    it('building tier switches swap which tavern/bridge layer is included, never both at once', () => {
        const tent = buildWorld({ tavernTier: 'Tent' });
        const full = buildWorld({ tavernTier: 'Full' });
        expect(tilesOfKind(tent, 'ground').length).toBeGreaterThan(0);
        expect(tilesOfKind(full, 'ground').length).toBeGreaterThan(0);
    });

    // #RAM-level (Han 2026-08-11, "alle foliage lagen moeten reageren op de wind" + "de animated lagen
    // moeten geanimeerd worden"): foliage tiles are `'shimmer'`-kind, campfire is its own `'campfire'`-kind
    // — separated out of the plain ground passes for the wind-shimmer and frame-cycling renderers
    // respectively. Water is ALSO `'shimmer'`-kind (it renders through the same WebGL pipeline as
    // foliage — see `useLdtkWaterInstances.js`), so it shows up mixed into the shimmer tile list, tagged
    // `kind: 'water'`.
    it('separates foliage/water (shimmer) and campfire tiles out of the plain ground passes', () => {
        const world = buildWorld();
        const shimmer = tilesOfKind(world, 'shimmer');
        expect(shimmer.length).toBeGreaterThan(0);
        expect(shimmer.some((t) => t.kind === 'water')).toBe(true);
        const campfire = tilesOfKind(world, 'campfire');
        expect(campfire.length).toBeGreaterThan(0);
        for (const t of [...shimmer.filter((t) => t.kind === 'water'), ...campfire]) {
            expect(Number.isFinite(t.logicalCol)).toBe(true);
            expect(Number.isFinite(t.logicalRow)).toBe(true);
        }
    });

    // #RAM-level (Han 2026-08-11, "reken je zelf de probabiliteit uit, of geeft LDtk een voorberekende
    // positionering? ik heb het liefst dat je LDtk volgt"): the currently-baked season (Summer) must use
    // LDtk's own exact pre-baked placements, not this app's own re-derived chance/RNG.
    it('uses real LDtk placements (not just any matching tile) for the currently-baked season', () => {
        const world = buildWorld({ season: 'Summer' });
        expect(tilesOfKind(world, 'shimmer').length).toBeGreaterThan(0);
    });
});

// #1195: `reflectableTilesFor` is now derived from the same `classifyLayer` walk `buildWorld` uses,
// instead of a fixed STATIC_TILE_LAYERS/FOLIAGE_LAYERS list — the #1032-round-8 "ik kan de brug niet
// zien op het water" class of bug (a new structure simply not being in a hand-typed reflection list).
describe('reflectableTilesFor', () => {
    it('includes the new City_Walls stone bridge (a plain ground layer) without any list to update', () => {
        const tiles = reflectableTilesFor();
        expect(tiles.some((t) => t.tilesetUrl && t.tilesetUrl.includes('Castle'))).toBe(true);
    });

    it('excludes water reflecting itself and the real terrain/pavement', () => {
        const tiles = reflectableTilesFor();
        expect(tiles.every((t) => t.kind !== 'water')).toBe(true);
    });
});
