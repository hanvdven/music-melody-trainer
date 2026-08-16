import { describe, it, expect } from 'vitest';
import { evaluateRuleGroup, tileIdToSrc } from '../ldtkAutoTile';

const TILESET = { cWid: 18, tileGridSize: 16, padding: 0, spacing: 0 };

describe('tileIdToSrc', () => {
    it('converts a tile id to its pixel rect using the tileset column count', () => {
        // tileId 19 on an 18-wide sheet -> row 1, col 1 -> px (16,16)
        expect(tileIdToSrc(TILESET, 19)).toEqual([16, 16]);
        expect(tileIdToSrc(TILESET, 0)).toEqual([0, 0]);
    });
});

describe('evaluateRuleGroup', () => {
    // Reproduces RAM level.ldtk's real Terrain_Tiles/Terrain_Summer rule 29 (pattern:[1], size:1 — the
    // "plain isolated Ground cell" fallback) against a synthetic 3x3 IntGrid, matching the hand-verified
    // real-file case (cell (0,16) with Ground on 3 sides, Water on none) that this engine was checked
    // against before being trusted for the real renderer.
    const csv = [
        0, 1, 1,
        0, 1, 1,
        0, 0, 0,
    ];
    const ruleGroup = {
        rules: [
            { uid: 29, size: 1, pattern: [1], tileRectsIds: [[19]] },
        ],
    };

    it('places a tile at every cell matching the rule pattern', () => {
        const tiles = evaluateRuleGroup(ruleGroup, { csv, width: 3, height: 3, gridSize: 16, tileset: TILESET });
        // (1,0),(2,0),(1,1),(2,1) all hold Ground(1) and match the size-1 "any Ground" rule; (0,*) and
        // row 2 are empty (0) and never seed a rule.
        expect(tiles).toEqual([
            { px: [16, 0], src: [16, 16] },
            { px: [32, 0], src: [16, 16] },
            { px: [16, 16], src: [16, 16] },
            { px: [32, 16], src: [16, 16] },
        ]);
    });

    it('never seeds a rule from an empty (0) IntGrid cell', () => {
        const emptyCsv = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        const tiles = evaluateRuleGroup(ruleGroup, { csv: emptyCsv, width: 3, height: 3, gridSize: 16, tileset: TILESET });
        expect(tiles).toEqual([]);
    });

    it('respects negative (must-NOT-equal) pattern constraints', () => {
        // center must be Ground(1), left neighbor must NOT be Water(2).
        const rule = { uid: 1, size: 3, pattern: [0, 0, 0, -2, 1, 0, 0, 0, 0], tileRectsIds: [[0]] };
        const matchCsv = [0, 1, 0];   // left of the only Ground cell is out-of-bounds (0), not Water -> matches
        const failCsv = [2, 1, 0];    // left of center is Water(2) -> excluded
        expect(evaluateRuleGroup({ rules: [rule] }, { csv: matchCsv, width: 3, height: 1, gridSize: 16, tileset: TILESET }).length).toBe(1);
        expect(evaluateRuleGroup({ rules: [rule] }, { csv: failCsv, width: 3, height: 1, gridSize: 16, tileset: TILESET }).length).toBe(0);
    });

    it('gates placement by xModulo/xOffset stride', () => {
        const rule = { uid: 2, size: 1, pattern: [1], xModulo: 2, xOffset: 0, tileRectsIds: [[5]] };
        const csv3x1 = [1, 1, 1];
        const tiles = evaluateRuleGroup({ rules: [rule] }, { csv: csv3x1, width: 3, height: 1, gridSize: 16, tileset: TILESET });
        expect(tiles.map((t) => t.px[0])).toEqual([0, 32]);   // cx=0 and cx=2 only, cx=1 skipped
    });

    it('deterministically skips a rule below its chance threshold, stable across calls', () => {
        const rule = { uid: 3, size: 1, pattern: [1], chance: 0.0001, tileRectsIds: [[0]] };
        const csv1 = [1];
        const first = evaluateRuleGroup({ rules: [rule] }, { csv: csv1, width: 1, height: 1, gridSize: 16, tileset: TILESET });
        const second = evaluateRuleGroup({ rules: [rule] }, { csv: csv1, width: 1, height: 1, gridSize: 16, tileset: TILESET });
        expect(first).toEqual(second);
    });

    it('returns no tiles for an empty rule group', () => {
        expect(evaluateRuleGroup(null, { csv, width: 3, height: 3, gridSize: 16, tileset: TILESET })).toEqual([]);
    });

    // #925 follow-up (Han 2026-08-16): edge cells must see a pixel-adjacent level's REAL terrain
    // instead of always falling back to outOfBoundsValue — that fallback is exactly the visible seam
    // at level boundaries this feature fixes.
    describe('horizontal neighbor stitching', () => {
        // center must be Ground(1), right neighbor must be Water(2) — only satisfiable by looking
        // past this grid's own right edge (cx=0, width=1) into a right neighbor.
        const rule = { uid: 40, size: 3, pattern: [0, 0, 0, 0, 1, 2, 0, 0, 0], tileRectsIds: [[0]] };

        it('reads a right-neighbor grid at the requesting grid\'s right edge instead of using oob', () => {
            const right = { csv: [2], width: 1, height: 1 };
            const tiles = evaluateRuleGroup({ rules: [rule] }, { csv: [1], width: 1, height: 1, gridSize: 16, tileset: TILESET, right });
            expect(tiles.length).toBe(1);
        });

        it('falls back to outOfBoundsValue when no right neighbor is supplied (regression guard)', () => {
            const tiles = evaluateRuleGroup({ rules: [rule] }, { csv: [1], width: 1, height: 1, gridSize: 16, tileset: TILESET });
            expect(tiles.length).toBe(0);
        });

        it('reads a left-neighbor grid at the requesting grid\'s left edge instead of using oob', () => {
            const leftRule = { uid: 41, size: 3, pattern: [0, 0, 0, 2, 1, 0, 0, 0, 0], tileRectsIds: [[0]] };
            const left = { csv: [2], width: 1, height: 1 };
            const tiles = evaluateRuleGroup({ rules: [leftRule] }, { csv: [1], width: 1, height: 1, gridSize: 16, tileset: TILESET, left });
            expect(tiles.length).toBe(1);
        });

        it('falls back to outOfBoundsValue for rows beyond a shorter neighbor\'s height', () => {
            // Requesting grid is 1 wide x 2 tall; the right neighbor is only 1 row tall, so row cy=1
            // has no real neighbor data and must behave exactly like the no-neighbor case (oob).
            const right = { csv: [2], width: 1, height: 1 };
            const csv1x2 = [1, 1];
            const tiles = evaluateRuleGroup({ rules: [rule] }, { csv: csv1x2, width: 1, height: 2, gridSize: 16, tileset: TILESET, right });
            // row 0 matches (real neighbor data = Water), row 1 doesn't (neighbor row out of range -> oob, not Water)
            expect(tiles.length).toBe(1);
            expect(tiles[0].px).toEqual([0, 0]);
        });
    });

    // Reproduces RAM level.ldtk's real Water_tile rule (tileMode "Stamp", tileRectsIds: [[80,120,81,121]]
    // on a 40-column tileset — a real 2x2 water block) to guard against the bug where every tile in a
    // stamp was placed at the SAME single cell instead of spread across its own 2x2 footprint.
    it('spreads a multi-tile Stamp rule across its own footprint, derived from the tiles\' sheet positions', () => {
        const wideTileset = { cWid: 40, tileGridSize: 16, padding: 0, spacing: 0 };
        const rule = { uid: 68, size: 1, pattern: [2], tileRectsIds: [[80, 120, 81, 121]] };
        const tiles = evaluateRuleGroup({ rules: [rule] }, { csv: [2], width: 1, height: 1, gridSize: 16, tileset: wideTileset });
        expect(tiles).toEqual([
            { px: [0, 0], src: [0, 32] },     // 80 -> col0,row2 (the group's own top-left anchor)
            { px: [0, 16], src: [0, 48] },    // 120 -> col0,row3 -> one cell BELOW the anchor
            { px: [16, 0], src: [16, 32] },   // 81 -> col1,row2 -> one cell RIGHT of the anchor
            { px: [16, 16], src: [16, 48] },  // 121 -> col1,row3 -> bottom-right of the 2x2 block
        ]);
    });

    it('keeps single-tile Stamp/Single rules unaffected by the stamp-offset logic (zero offset)', () => {
        const rule = { uid: 5, size: 1, pattern: [1], tileRectsIds: [[42]] };
        const tiles = evaluateRuleGroup({ rules: [rule] }, { csv: [1], width: 1, height: 1, gridSize: 16, tileset: TILESET });
        expect(tiles).toEqual([{ px: [0, 0], src: tileIdToSrc(TILESET, 42) }]);
    });

    // Reproduces RAM level.ldtk's real Grass_decoration rules: `pivotY:1` on a 2-wide, 1-row-tall stamp —
    // Han's bug report ("gras staat een tile te laag") confirmed the tuft must render ONE ROW ABOVE its
    // trigger cell, not coincident with it. pivotY:1 shifts the whole stamp up by its own footprint height.
    it('shifts a Stamp rule by its own footprint when pivotY is 1 (bottom-anchored, not top-anchored)', () => {
        const rule = { uid: 37, size: 1, pattern: [1], pivotX: 0, pivotY: 1, tileRectsIds: [[0, 1]] };
        // tileIds 0 and 1 are horizontally adjacent (col0,col1 same row) on the default 18-wide tileset.
        const tiles = evaluateRuleGroup({ rules: [rule] }, { csv: [1], width: 1, height: 1, gridSize: 16, tileset: TILESET });
        expect(tiles).toEqual([
            { px: [0, -16], src: tileIdToSrc(TILESET, 0) },    // shifted up ONE row (stampH=1) from the trigger cell
            { px: [16, -16], src: tileIdToSrc(TILESET, 1) },
        ]);
    });
});
