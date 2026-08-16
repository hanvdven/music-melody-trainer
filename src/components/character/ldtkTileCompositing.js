import { loadImageEl } from '../../utils/runtimeNormalMap';

// #925 follow-up (Han 2026-08-16): the tile-blitting loop LdtkScenery.jsx's `useCompositedLayer` already
// used (draw every tile of a bucket onto one canvas, once, native resolution) is exactly what the new
// lit-ground layer (useLdtkLitGroundTextures.js) also needs before it can Sobel-generate a normal map from
// the result — extracted here so both consumers share ONE tile-blitting implementation (CLAUDE.md §6c/§6d)
// instead of forking a second copy of the flip/draw logic.

// Resolves every distinct tileset URL referenced by `tiles` once, in parallel.
export async function loadTileImages(tiles) {
    const urls = [...new Set(tiles.map((t) => t.tilesetUrl))];
    const imgs = await Promise.all(urls.map((u) => loadImageEl(u)));
    return new Map(urls.map((u, i) => [u, imgs[i]]));
}

// #RAM-level (Han 2026-08-11, "de tiles zijn gespiegeld over de y-as. jij hebt ze wel in de juiste volgorde
// neergezet, maar niet gespiegeld"): LDtk's own per-tile flip bitmask (`tile.flipX`/`flipY`) needs a
// save/scale/translate around just that one blit, not a global canvas transform (every other tile on the
// same canvas must stay unflipped).
export function drawTilesToCanvas(ctx, tiles, gridSize, imgByUrl) {
    ctx.imageSmoothingEnabled = false;
    for (const tile of tiles) {
        const img = imgByUrl.get(tile.tilesetUrl);
        if (!img) continue;
        if (tile.flipX || tile.flipY) {
            ctx.save();
            const cx = tile.worldX + gridSize / 2, cy = tile.worldY + gridSize / 2;
            ctx.translate(cx, cy);
            ctx.scale(tile.flipX ? -1 : 1, tile.flipY ? -1 : 1);
            ctx.translate(-cx, -cy);
            ctx.drawImage(img, tile.src[0], tile.src[1], gridSize, gridSize, tile.worldX, tile.worldY, gridSize, gridSize);
            ctx.restore();
        } else {
            ctx.drawImage(img, tile.src[0], tile.src[1], gridSize, gridSize, tile.worldX, tile.worldY, gridSize, gridSize);
        }
    }
}
