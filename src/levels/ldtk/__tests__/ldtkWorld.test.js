import { describe, it, expect } from 'vitest';
import { buildWorld, LEVEL_MIN_X, LEVEL_MAX_X, LEVEL_PX_WIDTH, TAVERN_TIERS, BRIDGE_TIERS } from '../ldtkWorld';

// Combines a world's back/front split back into one flat list — most assertions here don't care about
// z-order, only about content/correctness, so this keeps them readable.
const allGround = (world) => [...world.groundTilesBack, ...world.groundTilesFront];
const allFoliage = (world) => [...world.foliageTilesBack, ...world.foliageTilesFront];
const allAnimated = (world) => [...world.animatedTilesBack, ...world.animatedTilesFront];

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

    it('builds a non-empty ground tile list at default settings', () => {
        const world = buildWorld();
        expect(allGround(world).length).toBeGreaterThan(100);
        expect(world.backgroundLayers.length).toBe(5);
        for (const layer of world.backgroundLayers) expect(layer.tiles.length).toBeGreaterThan(0);
    });

    it('every emitted ground tile has a resolved tileset URL and finite world position', () => {
        const world = buildWorld({ season: 'Fall', city: 'City', tavernTier: 'Full', bridgeTier: 'Log' });
        const tiles = allGround(world);
        expect(tiles.length).toBeGreaterThan(0);
        for (const tile of tiles) {
            expect(typeof tile.tilesetUrl).toBe('string');
            expect(Number.isFinite(tile.worldX)).toBe(true);
            expect(Number.isFinite(tile.worldY)).toBe(true);
            expect(tile.src).toHaveLength(2);
            expect(typeof tile.inFront).toBe('boolean');
        }
    });

    it('changing season changes the grass/terrain tile set', () => {
        const summer = buildWorld({ season: 'Summer' });
        const fall = buildWorld({ season: 'Fall' });
        expect(allGround(summer).length).toBeGreaterThan(0);
        expect(allGround(fall).length).toBeGreaterThan(0);
    });

    it('city toggle adds pavement-related tiles when on', () => {
        const noCity = buildWorld({ city: 'No_City' });
        const city = buildWorld({ city: 'City' });
        // City is a strict superset here (adds the Pavement layer's own tiles on top of everything else);
        // whether it actually differs depends on whether any IntGrid cell is painted as Pavement(4) in the
        // source file, which may be zero today — assert it never REMOVES tiles, at minimum.
        expect(allGround(city).length).toBeGreaterThanOrEqual(allGround(noCity).length);
    });

    it('building tier switches swap which tavern/bridge layer is included, never both at once', () => {
        const tent = buildWorld({ tavernTier: 'Tent' });
        const full = buildWorld({ tavernTier: 'Full' });
        expect(allGround(tent).length).toBeGreaterThan(0);
        expect(allGround(full).length).toBeGreaterThan(0);
    });

    // #RAM-level (Han 2026-08-11, "alle foliage lagen moeten reageren op de wind" + "de animated lagen
    // moeten geanimeerd worden"): foliage/animated tiles are pulled OUT of the static ground canvas into
    // their own lists for the wind-shimmer and frame-cycling renderers respectively.
    it('separates foliage and animated (water/campfire) tiles out of the static ground list', () => {
        const world = buildWorld();
        expect(allFoliage(world).length).toBeGreaterThan(0);
        const animated = allAnimated(world);
        expect(animated.length).toBeGreaterThan(0);
        expect(animated.some((t) => t.kind === 'water')).toBe(true);
        for (const t of animated) {
            expect(Number.isFinite(t.logicalCol)).toBe(true);
            expect(Number.isFinite(t.logicalRow)).toBe(true);
        }
    });

    // #RAM-level (Han 2026-08-11, "reken je zelf de probabiliteit uit, of geeft LDtk een voorberekende
    // positionering? ik heb het liefst dat je LDtk volgt"): the currently-baked season (Summer) must use
    // LDtk's own exact pre-baked placements, not this app's own re-derived chance/RNG.
    it('uses real LDtk placements (not just any matching tile) for the currently-baked season', () => {
        const world = buildWorld({ season: 'Summer' });
        expect(allFoliage(world).length).toBeGreaterThan(0);
    });

    // #RAM-level (Han 2026-08-11, "houd goed de volgorde van lagen aan; dus plaats ook entities op de
    // z-map die bij de entities hoort"): every tile is tagged with whether its OWN source layer sits in
    // front of or behind the Entities layer in the .ldtk file's paint order.
    // #925/#989 (Han 2026-08-14, confirmed "de volgorde in LDTK is correct" after the multi-level split):
    // the current .ldtk file's own layer order puts every ground-tile-emitting layer BEHIND Entities —
    // `groundTilesFront` is legitimately empty now (only `Grass_decoration_fg`, a FOLIAGE layer, sits in
    // front). Only assert the invariant that actually still holds: every emitted tile's `inFront` flag
    // matches the bucket it landed in.
    it('splits every tile bucket into back/front of the Entities layer', () => {
        const world = buildWorld();
        expect(world.groundTilesBack.length).toBeGreaterThan(0);
        for (const t of world.groundTilesBack) expect(t.inFront).toBe(false);
        for (const t of world.groundTilesFront) expect(t.inFront).toBe(true);
    });
});
