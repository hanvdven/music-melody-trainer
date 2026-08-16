// #RAM-level (Han 2026-08-10, "vervang het RPG-level voor het level in RAM level.ldtk"): a minimal,
// purpose-built re-implementation of LDtk's (ldtk.io) auto-tiling rule engine, scoped to exactly the rule
// features `RAM level.ldtk`'s 5 AutoLayers (Grass_decoration_fg/bg, Terrain_Tiles, Water_tile, Pavement)
// actually use — verified by reading every rule in the raw `.ldtk` JSON:
//   - NxN neighborhood pattern matching against an IntGrid (0 = wildcard, positive = must equal that
//     IntGrid value, negative = must NOT equal |value|), first-match-wins per cell (LDtk's `breakOnMatch`
//     default).
//   - xModulo/yModulo/xOffset/yOffset stride gating (used by the grass-decoration "every other column"
//     rules).
//   - `chance`-gated random tile selection, deterministic per-cell (not re-rolled on every re-render).
// Deliberately NOT implemented: flipX/flipY mirroring, `checker` alternation, Perlin-noise gating — none
// of this file's rules set them (every rule's `checker` is `'None'`, no rule sets `flipX`/`flipY`/
// `perlinActive`). A future rule that needs one of those will silently under-match rather than error;
// extend `ruleMatches`/`ruleAppliesAtStride` if that ever happens (CLAUDE.md §6c — don't hardcode around
// a gap, extend the real mechanism).
//
// Randomness (`chance` ties, multi-option `tileRectsIds` picks) uses a seeded hash of (cx, cy, rule.uid,
// salt) — NOT `Math.random()` — so the SAME cell always resolves to the SAME outcome across re-renders
// (buildWorld.js re-invokes this on every season/city/tier toggle; re-rolling variety on every unrelated
// re-render would make the ground visibly shimmer/re-shuffle for no reason).

function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
        t = (t + 0x6D2B79F5) | 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function cellRandom(cx, cy, ruleUid, salt) {
    const seed = (cx * 374761393 + cy * 668265263 + ruleUid * 2246822519 + salt) >>> 0;
    return mulberry32(seed)();
}

// #925 follow-up (Han 2026-08-16, "de terrain tiles tegen elkaar zetten voordat de berekening gedaan
// wordt"): §233 already stitches level POSITIONS into one continuous strip, but each level's autotile
// rules were still evaluated against ONLY that level's own IntGrid — an edge cell's neighbor lookup
// fell straight to `outOfBoundsValue` (empty) even when a real, pixel-adjacent level's terrain sits
// right there. `left`/`right` (optional `{csv, width, height}` for the horizontally adjacent level's
// SAME layer) let an out-of-range x lookup read the neighbor's real edge column instead of faking
// emptiness. Vertical out-of-range (cy) and no-neighbor cases are unchanged — only horizontal stitching
// is in scope per Han's 2026-08-16 interview answer.
function cellValue(csv, w, h, cx, cy, outOfBoundsValue, left, right) {
    if (cy < 0 || cy >= h) return outOfBoundsValue;
    if (cx < 0) {
        if (left && cy < left.height) return left.csv[cy * left.width + (left.width + cx)];
        return outOfBoundsValue;
    }
    if (cx >= w) {
        if (right && cy < right.height) return right.csv[cy * right.width + (cx - w)];
        return outOfBoundsValue;
    }
    return csv[cy * w + cx];
}

// Pattern array is row-major NxN, center at the middle index (index (n*n-1)/2) — verified against
// `RAM level.ldtk`'s own baked `autoLayerTiles` for several real rules (e.g. Terrain_Tiles rule uid 72's
// pattern `[0,-1,0,2,1,0,0,0,0]` only matches cells whose center IntGrid value is 1/Ground, left neighbor
// is 2/Water, and top neighbor is NOT 1/Ground — reproduced exactly against the file's own precomputed
// tile placements before this engine was trusted for anything else).
function ruleMatches(rule, csv, w, h, cx, cy, left, right) {
    const n = rule.size;
    const half = (n - 1) / 2;
    const pattern = rule.pattern;
    const oob = rule.outOfBoundsValue ?? 0;
    for (let i = 0; i < pattern.length; i++) {
        const want = pattern[i];
        if (want === 0) continue;
        const dy = Math.floor(i / n) - half;
        const dx = (i % n) - half;
        const actual = cellValue(csv, w, h, cx + dx, cy + dy, oob, left, right);
        if (want > 0 && actual !== want) return false;
        if (want < 0 && actual === -want) return false;
    }
    return true;
}

function ruleAppliesAtStride(rule, cx, cy) {
    const xMod = rule.xModulo || 1, yMod = rule.yModulo || 1;
    const xOff = rule.xOffset || 0, yOff = rule.yOffset || 0;
    if (xMod > 1 && (((cx - xOff) % xMod) + xMod) % xMod !== 0) return false;
    if (yMod > 1 && (((cy - yOff) % yMod) + yMod) % yMod !== 0) return false;
    return true;
}

// tileId -> pixel src rect, using the tileset's own column count (`__cWid`, exported directly by LDtk —
// no need to re-derive it from pxWid/spacing/padding). Matches LDtk's own `t = row*cWid + col` convention.
export function tileIdToSrc(tileset, tileId) {
    const cols = tileset.cWid;
    const col = tileId % cols, row = Math.floor(tileId / cols);
    const gs = tileset.tileGridSize;
    return [tileset.padding + col * (gs + tileset.spacing), tileset.padding + row * (gs + tileset.spacing)];
}

// Runs one rule GROUP's rules (in priority/array order) against every non-empty IntGrid cell. Returns
// tile placements in the same shape LDtk's own exported `autoLayerTiles` uses (`{px:[x,y], src:[sx,sy]}`)
// so a caller never needs to distinguish an engine-computed tile from a `.ldtk` file's pre-baked one.
export function evaluateRuleGroup(ruleGroup, { csv, width, height, gridSize, tileset, left, right }) {
    const out = [];
    if (!ruleGroup) return out;
    for (let cy = 0; cy < height; cy++) {
        for (let cx = 0; cx < width; cx++) {
            // AutoLayers only ever seed from a non-empty IntGrid cell — verified: `RAM level.ldtk`'s own
            // Terrain_Tiles rule 29 (`pattern:[1]`, the plain-grass fallback) never fires on empty (0) cells.
            if (cellValue(csv, width, height, cx, cy, 0) === 0) continue;
            for (const rule of ruleGroup.rules) {
                if (rule.active === false) continue;
                if (!ruleAppliesAtStride(rule, cx, cy)) continue;
                if (!ruleMatches(rule, csv, width, height, cx, cy, left, right)) continue;
                const chance = rule.chance ?? 1;
                if (chance < 1 && cellRandom(cx, cy, rule.uid, 1) >= chance) continue;
                const options = rule.tileRectsIds || [];
                if (options.length === 0) break;
                const pickIdx = options.length === 1 ? 0 : Math.floor(cellRandom(cx, cy, rule.uid, 2) * options.length);
                const tileIds = options[pickIdx];
                // `tileMode: "Stamp"` rules place MULTIPLE tiles per match (e.g. a 2x2 water block, a
                // 2-wide grass tuft) — verified against the raw file: every id in one `tileRectsIds[i]`
                // group sits at a DIFFERENT (col,row) in the SOURCE tileset, and those relative offsets are
                // exactly the offsets the tiles need on the LEVEL too (e.g. water's [80,120,81,121] are the
                // sheet's (0,0)/(0,1)/(1,0)/(1,1) corners of one 2x2 block). Deriving the placement offset
                // from each tile's own sheet position (relative to the group's first tile) needs no extra
                // LDtk stamp-geometry field — the fix for a real bug where every tile in a stamp was placed
                // on top of the SAME single cell (only the last-drawn tile ever showed, e.g. water only
                // ever showing its top-left corner instead of a full rectangle).
                const cols = tileset.cWid;
                const col0 = tileIds[0] % cols, row0 = Math.floor(tileIds[0] / cols);
                const offsets = tileIds.map((tileId) => {
                    const col = tileId % cols, row = Math.floor(tileId / cols);
                    return { tileId, dCol: col - col0, dRow: row - row0 };
                });
                // `pivot(X|Y)`: LDtk anchors the STAMP's bottom/right edge to the trigger cell instead of
                // its top/left when set to 1 (e.g. grass decoration's `pivotY:1` — a tuft should sit ONE
                // ROW ABOVE the ground cell it decorates, not on top of/coincident with it; verified
                // against Han's own "gras staat een tile te laag" bug report). Shifts the whole stamp by
                // its own footprint size so the pivot EDGE (not the first tile) lands on the trigger cell.
                const stampW = Math.max(...offsets.map((o) => o.dCol)) + 1;
                const stampH = Math.max(...offsets.map((o) => o.dRow)) + 1;
                const pivotShiftX = rule.pivotX === 1 ? -stampW : 0;
                const pivotShiftY = rule.pivotY === 1 ? -stampH : 0;
                for (const { tileId, dCol, dRow } of offsets) {
                    out.push({
                        px: [cx * gridSize + (dCol + pivotShiftX) * gridSize, cy * gridSize + (dRow + pivotShiftY) * gridSize],
                        src: tileIdToSrc(tileset, tileId),
                    });
                }
                break;   // breakOnMatch (LDtk default): first matching rule in the group wins this cell.
            }
        }
    }
    return out;
}
