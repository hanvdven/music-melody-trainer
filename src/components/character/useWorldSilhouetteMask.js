import { useEffect, useMemo, useState } from 'react';
import { loadTileImages, drawTilesToCanvas } from './ldtkTileCompositing';
import logger from '../../utils/logger';

// §387 (#1222, Han 2026-09-06, "het is voor de sheen de bedoeling dat alle entiteiten op de main layer
// als één worden behandeld — dus afzonderlijke items/takken moeten niet allemaal apart sheen krijgen,
// waardoor echt het silhouet van de 'wereld' en niet van de tile laag de sheen krijgt").
//
// THE PROBLEM THIS REPLACES. Every edge-sensitive lighting term (edge-lit falloff §141 r10/r14, the moon
// rim §370 r2, the sun's inward glow §377 r4) used to answer "am I on a silhouette edge?" by sampling the
// DIFFUSE texture the fragment itself came from. That texture is:
//   • for foliage: ONE 16x16 atlas cell (useLdtkFoliageAtlas), so every internal boundary of a multi-tile
//     canopy read as a silhouette — patched with a per-tile `internalEdges` adjacency bitmask (#1221),
//     which is orthogonal-only (misses diagonal sisters), foliage-only (never sees the building behind
//     the branch), and whose uvRect clamp is a NO-OP on flipped tiles (the sign of `texelSize` flips, so
//     `max(tap, min(rect))` never clamps — 200 of this level's 1599 foliage tiles are flipX);
//   • for foliage, additionally: `sunInwardGlow` deliberately did NOT clamp its taps, documented as "so
//     an external edge still detects the transparent atlas gutter past the crop" — but that gutter was
//     REVERTED in #1221 (see useLdtkFoliageAtlas.js `atlasLayout`), so those taps read a neighbouring,
//     unrelated crop instead. Randomly-opaque neighbour = a genuine edge silently skipped (Han: "overdag
//     pixels die over worden geslagen door de sheen van de zon"); randomly-empty neighbour = a false edge
//     lit white at night (Han: "'s nachts pixels die niet donker worden en dus fel afsteken");
//   • for ground/buildings/decor: the composite of ONE pass, and this level has SIX ground passes
//     interleaved with FIVE shimmer passes — so a wall in pass 5 and the terrain in pass 1 are separate
//     silhouettes and their contact line rims as if it were open sky.
//
// A per-tile / per-pass test structurally CANNOT answer "am I on the edge of the WORLD". This hook builds
// the thing that can: ONE level-sized alpha mask, the union of every non-parallax, non-entity pass —
// terrain, buildings, decor, foliage, water, campfire. Both lighting shaders sample it in LEVEL px, so
// every edge term now sees one continuous world silhouette and nothing else.
//
// DELIBERATELY EXCLUDED (Han's own interview answers, 2026-09-06):
//   • parallax `'background'` passes — they slide at their own `factor`, so they have no fixed position
//     in this level-space mask at all. They keep their existing baked DOM rim (LdtkScenery `computeMoonRim`).
//   • the `'entities'` pass (hero/pet/wisp/slime/NPCs/duck) — DOM sprites that move every frame, and Han:
//     "geen deel van silhouet, mag zo blijven".
//   • water IS included (Han: "water doet mee in wereldsilhouet"), so a waterline against the bank reads
//     as interior, not as silhouette.
// Ground IS included (Han: "klopt, onderrand boom geen rim") — a tree standing on the grass has no sky
// below it, so its foot must not glow.
//
// WIND/TEXEL-SWAP INTERACTION. The mask is the REST silhouette, built once. That is not an approximation:
// ForegroundFoliageLayer's wind bend DISPLACES a texel (it samples source column `shiftedNativeX` and
// paints it at destination column `nativeX`), and the shader looks the mask up at that texel's SOURCE
// level coordinate. The pixel is lit as the pixel it actually is, with the neighbourhood it actually came
// from — so the rim travels with the leaves for free, with no per-frame silhouette re-render (no FBO, no
// second pass). This also retires the `windPushedOut`/`atExtremeCol` forced-rim hack, which existed only
// because the old per-tile test could not see past its own atlas cell.

export default function useWorldSilhouetteMask(passes, gridSize, levelPxWidth, levelPxHeight) {
    // Every tile that is part of the world's own body. `passes` identity is stable per world config
    // (RpgLevelPanel's `world` useMemo), so this flattens once per season/city/tier change, not per render.
    const tiles = useMemo(
        () => passes.filter((p) => p.kind !== 'background' && p.kind !== 'entities').flatMap((p) => p.tiles || []),
        [passes],
    );
    const [mask, setMask] = useState(null);

    useEffect(() => {
        if (tiles.length === 0 || levelPxWidth <= 0 || levelPxHeight <= 0) {
            setMask(null);
            return undefined;
        }
        let cancelled = false;
        (async () => {
            try {
                const imgByUrl = await loadTileImages(tiles);
                if (cancelled) return;
                // A fresh canvas per build (never mutated in place) so a consumer's "re-upload the WebGL
                // texture when `mask` changed" dependency fires — same reasoning as useLdtkFoliageAtlas's
                // own `publish()`.
                const canvas = document.createElement('canvas');
                canvas.width = levelPxWidth;
                canvas.height = levelPxHeight;
                const ctx = canvas.getContext('2d');
                // Only the ALPHA channel of this canvas is ever read (the consumers upload it as a
                // gl.ALPHA texture — 1 byte/texel instead of 4, which matters at ~2.1M texels × the 11
                // WebGL contexts this level runs). Colour is irrelevant; the plain tile blit gives us
                // exactly the coverage we need, and reuses the ONE tile-blitting implementation
                // (ldtkTileCompositing) rather than forking a second flip/draw loop (CLAUDE.md §6c/§6d).
                drawTilesToCanvas(ctx, tiles, gridSize, imgByUrl);
                if (cancelled) return;
                logger.debug('useWorldSilhouetteMask', 'mask built', { tileCount: tiles.length, levelPxWidth, levelPxHeight });
                setMask(canvas);
            } catch (err) {
                // Same "never leave a layer stuck at null with no trace" rule useLdtkLitGroundTextures
                // follows (CLAUDE.md §7a). A missing mask is a safe degradation, not a crash: the shaders
                // fall back to a 1x1 fully-opaque placeholder, which reports "no edges anywhere" — every
                // rim/glow term simply reads 0 until the real mask arrives.
                logger.error('useWorldSilhouetteMask', 'E040-WORLD-MASK-COMPOSITE', err, { tileCount: tiles.length });
            }
        })();
        return () => { cancelled = true; };
    }, [tiles, gridSize, levelPxWidth, levelPxHeight]);

    return mask;
}

// §387: the ONE place that defines how the world mask reaches the GPU, so the two WebGL consumers
// (LdtkLitGround, ForegroundFoliageLayer) cannot drift apart on format or filtering (CLAUDE.md §6c/§6d).
//
// `gl.ALPHA` — 1 byte per texel, not 4. This level's mask is LEVEL_PX_WIDTH × LEVEL_PX_HEIGHT ≈ 2.1M
// texels and it is uploaded once per WebGL context, of which this level runs ELEVEN (six LdtkLitGround
// + five ForegroundFoliageLayer). RGBA would be ~94 MB of VRAM for data where only `.a` is ever read;
// ALPHA is ~23 MB. NEAREST + CLAMP_TO_EDGE for the same reason every other texture here uses them: the
// mask is per-game-pixel coverage data, and any filtering would smear the silhouette test.
//
// `canvas == null` (mask still compositing, or E040) yields a 1×1 fully-opaque texture instead of leaving
// the sampler unbound: it reports "solid everywhere", so every edge term reads 0 and simply produces no
// rim/glow until the real mask lands — a quiet degradation rather than a world outlined at random.
export function createWorldMaskTexture(gl, canvas) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (canvas) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, gl.ALPHA, gl.UNSIGNED_BYTE, canvas);
    } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, 1, 1, 0, gl.ALPHA, gl.UNSIGNED_BYTE, new Uint8Array([255]));
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}
