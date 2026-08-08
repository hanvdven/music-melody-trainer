// #141 (Han 2026-08-05, "Factorio-style" tree/grass wind shimmer, stage 1 — normal-map relighting): a
// one-time (re-runnable) generator that derives tangent-space normal maps from the EXISTING diffuse art
// (Trees_foliage_trunk.png's summer-foliage cell + Decor.png's 5 grass-tuft cells) via a Sobel height-
// gradient, so no hand-painted normal map asset is needed. Re-run manually if the source art changes —
// not wired into any build hook (mirrors generate-bestiary-manifest.mjs's own "run when needed" convention).
//
// Run with: node scripts/generate-tree-normal-maps.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PNG } from 'pngjs';

const ROOT = process.cwd();
const TREE_SHEET_PATH = join(ROOT, 'src/assets/ASSORTED/tiles/trees/Trees_foliage_trunk.png');
const DECOR_SHEET_PATH = join(ROOT, 'src/assets/ASSORTED/tiles/int_ext_decoration/Decor.png');
const FLOOR_SHEET_PATH = join(ROOT, 'src/assets/ASSORTED/tiles/tiles/Floor Tiles2.png');
const OUT_DIR = join(ROOT, 'src/assets/ASSORTED/tiles/trees/generated');

// Trees_foliage_trunk.png is 1280×208 = 5 cells of 256×208 (verified by dividing the file's own pixel
// dimensions): col 1 summer, col 2 apples, col 3 fall, col 4 winter, col 5 trunk (Han's stated order).
// Stage 1 only needs the summer foliage cell (season selection is hardcoded until a season system exists).
const TREE_CELL = { w: 256, h: 208 };
const SUMMER_FOLIAGE_CELL = { row: 1, col: 1 };

// Decor.png's 5 grass-tuft sprites, same cells RpgLevelPanel.jsx's GRASS_TUFT_CELLS already scatters
// across the floor (§693 round 12) — kept in exact sync with that array; if it changes, this must too.
const DECOR_CELL = 32;
const GRASS_TUFT_CELLS = [
    { row: 5, col: 1 }, { row: 5, col: 2 }, { row: 5, col: 3 }, { row: 6, col: 1 }, { row: 7, col: 1 },
];

// How pronounced the simulated relief is — the RGB channels store a tangent-space normal, decoded by the
// shader as `texel*2-1`; higher STRENGTH tilts normals further from straight-up per unit of luminance
// change, i.e. more contrast in the light-catching shimmer. Tuned by eye against the foliage art; revisit
// if stage 1's animation reads as too flat or too noisy.
const STRENGTH = 4.5;

function cropRegion(png, x, y, w, h) {
    const out = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
    for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
            const srcI = ((y + row) * png.width + (x + col)) * 4;
            const dstI = (row * w + col) * 4;
            png.data.copy(out.data, dstI, srcI, srcI + 4);
        }
    }
    return out;
}

// Height field = luminance, zeroed at fully-transparent pixels so the tree/grass silhouette itself doesn't
// bleed spurious gradients from whatever happens to sit behind it in the source sheet.
function luminanceAt(img, x, y) {
    const cx = Math.max(0, Math.min(img.width - 1, x));
    const cy = Math.max(0, Math.min(img.height - 1, y));
    const i = (cy * img.width + cx) * 4;
    if (img.data[i + 3] === 0) return 0;
    return (img.data[i] + img.data[i + 1] + img.data[i + 2]) / (3 * 255);
}

// Standard 3×3 Sobel operator: estimates the local height-field slope in x/y, which becomes the tilt of
// the derived surface normal (this is the same "normal map from a height/luminance image" technique
// Factorio's own FFF describes using for foliage — see conversation context).
function sobelNormalMap(img) {
    const out = new PNG({ width: img.width, height: img.height });
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const tl = luminanceAt(img, x - 1, y - 1), t = luminanceAt(img, x, y - 1), tr = luminanceAt(img, x + 1, y - 1);
            const l = luminanceAt(img, x - 1, y), r = luminanceAt(img, x + 1, y);
            const bl = luminanceAt(img, x - 1, y + 1), b = luminanceAt(img, x, y + 1), br = luminanceAt(img, x + 1, y + 1);
            const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
            const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
            let nx = -gx * STRENGTH, ny = -gy * STRENGTH, nz = 1;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            nx /= len; ny /= len; nz /= len;
            const i = (y * img.width + x) * 4;
            out.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
            out.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
            out.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
            out.data[i + 3] = 255;   // data texture, not blended — always opaque
        }
    }
    return out;
}

function generate(sheetPath, cellW, cellH, cell, outName) {
    const sheet = PNG.sync.read(readFileSync(sheetPath));
    const crop = cropRegion(sheet, (cell.col - 1) * cellW, (cell.row - 1) * cellH, cellW, cellH);
    const normal = sobelNormalMap(crop);
    writeFileSync(join(OUT_DIR, outName), PNG.sync.write(normal));
    console.log(`wrote ${outName} (${cellW}×${cellH})`);
}

// #141 round 10 (Han, NL: "ik zie een normal map op de boom en grassprieten, maar niet op de ground tile...
// Is het een idee om een normal map op het hele level te maken voor belichting?"): ONE representative floor
// normal map (not per-tile-exact — same "can be very simple" spirit Han used for the original floor ask),
// generated from the first of the floor's own grass-top cells (RpgLevelPanel.jsx's FLOOR_CELLS[0]).
const FLOOR_TILE = 16;
const FLOOR_REPRESENTATIVE_CELL = { row: 1, col: 2 };

// #141 round 10 (Han, NL: "om te testen, zet een paar kisten (linker boven cell (32x32) van decor.png) op
// de voorgrond"): a foreground "crate" test object, top-left 32×32 cell of Decor.png.
const CRATE_CELL = { row: 1, col: 1 };

mkdirSync(OUT_DIR, { recursive: true });
generate(TREE_SHEET_PATH, TREE_CELL.w, TREE_CELL.h, SUMMER_FOLIAGE_CELL, 'tree-foliage-summer-normal.png');
for (const cell of GRASS_TUFT_CELLS) {
    generate(DECOR_SHEET_PATH, DECOR_CELL, DECOR_CELL, cell, `grass-normal-r${cell.row}c${cell.col}.png`);
}
generate(FLOOR_SHEET_PATH, FLOOR_TILE, FLOOR_TILE, FLOOR_REPRESENTATIVE_CELL, 'floor-normal.png');
generate(DECOR_SHEET_PATH, DECOR_CELL, DECOR_CELL, CRATE_CELL, 'crate-normal.png');
