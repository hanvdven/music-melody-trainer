import { useEffect, useRef, useState } from 'react';
import { loadImageEl, normalMapCanvasFromCrop } from '../../utils/runtimeNormalMap';
import { LEVEL_PX_HEIGHT } from '../../levels/ldtk/ldtkWorld';

// #925 follow-up (Han 2026-08-16, "alle lagen met shimmer moeten shimmer effect hebben, dus ook
// bijvoorbeeld het water" + "doe ook de diffusie, gewoon een exacte kopie van de logica voor
// boomblaadjes"): converts `buildWorld()`'s water tiles (`kind: 'water'` entries in
// `animatedTilesBack/Front`) into `ForegroundFoliageLayer` instances — diffuse AND shimmer both drawn
// through the shimmer shader, exactly like `useLdtkFoliageInstances.js` does for tree/grass tiles (same
// normal-map-per-crop generation via the SAME generic Sobel utility, CLAUDE.md §6d — no water-specific
// normal-map asset).
//
// Perf (#1162, Han 2026-08-27, "maak de watertiles maar 'static'... animated tiles + reflectie + pixel
// swap + shimmer is niet nodig. Enkel reflectie + shimmer volstaat"): water tiles used to cycle through
// `totalLogicalCols` distinct source-tileset columns on a `tick` timer ("steeds de gehele rij", the
// frame-swap animation copied from `LdtkAnimatedTiles.jsx`'s water branch) — every tick that landed on a
// column this hook hadn't shown yet was a cache MISS in `normalCacheRef`, triggering a genuinely expensive
// synchronous Sobel-filter normal-map generation (`normalMapCanvasFromCrop(...).toDataURL()`,
// `getImageData`/`putImageData` under the hood) on the main thread, repeated for every water-tile ×
// distinct-column combination before the cache finished warming up — confirmed via a sourcemap-resolved
// CPU profile as the dominant mobile-perf cost in the RPG open world, FAR outweighing anything React-side
// (see docs/architecture.md §318). Han's call: drop the frame-swap animation AND the white-cap "pixel
// switch" sparkle (`isWater: true` below — see ForegroundFoliageLayer.jsx's own `uWhiteCap*` uniforms,
// its only effect) entirely; the wave-lighting shimmer shader (`wave: true`) and `WaterReflectionLayer`'s
// mirrored reflection (a completely separate component, untouched) already read as "water" on their own.
// `col` is now computed ONCE per tile (still offset per-placement via `startOffsetsRef` so tiles sharing a
// tileset don't all show the IDENTICAL static frame — pure visual variety, no animation), so
// `normalCacheRef` reaches steady state (one entry per unique tile position) the FIRST time this runs,
// never refilled again — no more timer, no more repeated cache misses.
export default function useLdtkWaterInstances(waterTiles, gridSize, sceneryMode) {
    const [instances, setInstances] = useState([]);
    const startOffsetsRef = useRef([]);   // index -> random offset, rolled once per array slot
    const normalCacheRef = useRef(new Map());

    useEffect(() => {
        if (sceneryMode !== 'LDtk' || waterTiles.length === 0) { setInstances([]); return undefined; }
        let cancelled = false;

        (async () => {
            const urls = [...new Set(waterTiles.map((t) => t.tilesetUrl))];
            const imgs = await Promise.all(urls.map((u) => loadImageEl(u)));
            if (cancelled) return;
            const imgByUrl = new Map(urls.map((u, i) => [u, imgs[i]]));

            const out = [];
            waterTiles.forEach((tile, i) => {
                const img = imgByUrl.get(tile.tilesetUrl);
                if (!img) return;
                const totalLogicalCols = Math.max(1, Math.floor(img.naturalWidth / 32));

                if (startOffsetsRef.current[i] === undefined) {
                    startOffsetsRef.current[i] = Math.floor(Math.random() * 1000);
                }
                const startOffset = startOffsetsRef.current[i];
                // Static now (no `tick` term) — one fixed frame per tile, offset per-placement for variety.
                const col = (tile.logicalCol + startOffset) % totalLogicalCols;
                const row = tile.logicalRow;
                const srcX = col * 32 + tile.subX, srcY = row * 32 + tile.subY;

                const normalKey = `${tile.tilesetUrl}|${srcX},${srcY}`;
                let normalUrl = normalCacheRef.current.get(normalKey);
                if (!normalUrl) {
                    normalUrl = normalMapCanvasFromCrop(img, srcX, srcY, gridSize, gridSize).toDataURL();
                    normalCacheRef.current.set(normalKey, normalUrl);
                }

                const u0 = srcX / img.naturalWidth, u1 = (srcX + gridSize) / img.naturalWidth;
                const v0 = srcY / img.naturalHeight, v1 = (srcY + gridSize) / img.naturalHeight;
                out.push({
                    diffuseUrl: tile.tilesetUrl,
                    diffuseUV: [
                        tile.flipX ? u1 : u0, tile.flipY ? v1 : v0,
                        tile.flipX ? u0 : u1, tile.flipY ? v0 : v1,
                    ],
                    normalUrl,
                    localX: tile.worldX + gridSize / 2,
                    localBottomFromLevelBottom: LEVEL_PX_HEIGHT - tile.worldY - gridSize,
                    gridSize,
                    wave: true, skew: false,
                    // #1162 Fase 6 (Han 2026-08-27, "ik ben de shimmer op het water kwijt! de witte
                    // schuimkoppen die moet je wel nog blijven renderen"): restored. The earlier "drop it"
                    // call (this file's own header comment) conflated two different costs — the JS-side
                    // `tick`-driven column-cycling (genuinely expensive: cache misses → synchronous Sobel
                    // normal-map regeneration, the actual perf bug) and `isWater`, which is just a per-
                    // instance boolean read once per already-happening draw call to pick a shader uniform
                    // (ForegroundFoliageLayer.jsx's `uWhiteCapThreshold`/`uWhiteCapStrength`, set INSIDE the
                    // existing per-frame draw loop — no extra draw call, no cache lookup, no JS timer).
                    // Restoring it is free: the tick/column-cycling removal above (the part that actually
                    // mattered for perf) stays exactly as it was.
                    isWater: true,
                });
            });
            if (!cancelled) setInstances(out);
        })();

        return () => { cancelled = true; };
    }, [waterTiles, gridSize, sceneryMode]);

    return instances;
}
