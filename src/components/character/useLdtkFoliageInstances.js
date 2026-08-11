import { useEffect, useState } from 'react';
import { loadImageEl, normalMapCanvasFromCrop } from '../../utils/runtimeNormalMap';
import { LEVEL_PX_HEIGHT } from '../../levels/ldtk/ldtkWorld';

// #RAM-level (Han 2026-08-11, "alle foliage lagen (via tag) moeten reageren op de wind"): converts
// `buildWorld()`'s flat `foliageTiles` list into `ForegroundFoliageLayer` instances, generating a runtime
// normal map per DISTINCT (tileset, src-rect) pair — not per tile instance — since the same handful of
// source tiles repeat hundreds of times across a layer like `Pine_forest_foliage2`; caching by that key
// (mirrors the pre-existing floor-tile normal-map cache in RpgLevelPanel.jsx, §141) keeps the actual
// Sobel-generation work bounded to the tileset's own distinct art, not the placed-tile count.
//
// #RAM-level (Han 2026-08-11, "is het de moeite om tiles te offloaden als ze een paar schermlengtes ver
// zijn?"): checked — this level's foliage still has ~450 DISTINCT source rects even after the instance
// cache (1377 placed tiles, 449 unique crops), so the one-time Sobel-generation cost at mount is real and
// plausibly part of the measured LCP delay. Per-tile viewport eviction (destroying/regenerating normal
// maps as the camera scrolls) isn't worth it — the cache is already keyed by ART, not placement, so
// nothing GPU-resident scales with position. What DOES help: not generating all ~450 up front in one
// blocking burst. `BATCH_SIZE` distinct rects are generated per `requestIdleCallback` slice (falls back to
// `setTimeout` where unavailable, e.g. Safari) instead of one `Promise.all`-then-all-at-once pass — the
// first slice publishes almost immediately so SOME foliage is visible+lit right away, the rest fills in
// over the next few idle windows without blocking input/paint.
const BATCH_SIZE = 60;
const scheduleIdle = (typeof requestIdleCallback === 'function')
    ? requestIdleCallback
    : (cb) => setTimeout(() => cb({ timeRemaining: () => 0 }), 0);
const cancelIdle = (typeof cancelIdleCallback === 'function') ? cancelIdleCallback : clearTimeout;

export default function useLdtkFoliageInstances(foliageTiles, gridSize, sceneryMode) {
    const [instances, setInstances] = useState([]);

    useEffect(() => {
        if (sceneryMode !== 'LDtk' || foliageTiles.length === 0) { setInstances([]); return undefined; }
        let cancelled = false;
        let idleHandle;
        (async () => {
            const urls = [...new Set(foliageTiles.map((t) => t.tilesetUrl))];
            const imgs = await Promise.all(urls.map((u) => loadImageEl(u)));
            if (cancelled) return;
            const imgByUrl = new Map(urls.map((u, i) => [u, imgs[i]]));

            // #RAM-level (Han 2026-08-11, "de tiles zijn gespiegeld... jij hebt ze niet gespiegeld"): LDtk's
            // per-tile flip (`tile.flipX`/`flipY`) is applied by swapping the UV rect's min/max on the
            // flipped axis — a standard mirror trick for a linearly-interpolated quad, no shader change
            // needed. Known limitation: the runtime-generated NORMAL map is not also mirrored (would need a
            // per-pixel R-channel negation, not just a visual flip) — left unflipped, a minor lighting
            // inconsistency on flipped tiles rather than the much more visible wrong silhouette.
            const instanceFor = (tile, normalUrl) => {
                const u0 = tile.src[0] / tile.sheetW, u1 = (tile.src[0] + gridSize) / tile.sheetW;
                const v0 = tile.src[1] / tile.sheetH, v1 = (tile.src[1] + gridSize) / tile.sheetH;
                return {
                    diffuseUrl: tile.tilesetUrl,
                    diffuseUV: [
                        tile.flipX ? u1 : u0, tile.flipY ? v1 : v0,
                        tile.flipX ? u0 : u1, tile.flipY ? v0 : v1,
                    ],
                    normalUrl,
                    // `tile.worldX/worldY` are level-LOCAL px (top-left origin); RpgLevelPanel positions
                    // this whole set the same way LdtkScenery positions its canvas — see the caller.
                    localX: tile.worldX + gridSize / 2,
                    localBottomFromLevelBottom: LEVEL_PX_HEIGHT - tile.worldY - gridSize,
                    gridSize,
                    wave: true, skew: true,
                };
            };

            // Map key -> one representative tile (whichever placed instance happens to be first) so the
            // batch loop below never needs to re-parse the key string back into a URL/src pair.
            const uniqueByKey = new Map();
            for (const t of foliageTiles) {
                const key = `${t.tilesetUrl}|${t.src[0]},${t.src[1]}`;
                if (!uniqueByKey.has(key)) uniqueByKey.set(key, t);
            }
            const uniqueKeys = [...uniqueByKey.keys()];
            const normalCache = new Map();

            const publish = () => {
                if (cancelled) return;
                const out = [];
                for (const tile of foliageTiles) {
                    const key = `${tile.tilesetUrl}|${tile.src[0]},${tile.src[1]}`;
                    const normalUrl = normalCache.get(key);
                    if (normalUrl) out.push(instanceFor(tile, normalUrl));
                }
                setInstances(out);
            };

            let cursor = 0;
            const genBatch = () => {
                if (cancelled) return;
                const end = Math.min(cursor + BATCH_SIZE, uniqueKeys.length);
                for (; cursor < end; cursor++) {
                    const key = uniqueKeys[cursor];
                    const rep = uniqueByKey.get(key);
                    const img = imgByUrl.get(rep.tilesetUrl);
                    if (!img) continue;
                    normalCache.set(key, normalMapCanvasFromCrop(img, rep.src[0], rep.src[1], gridSize, gridSize).toDataURL());
                }
                publish();
                if (cursor < uniqueKeys.length) idleHandle = scheduleIdle(genBatch);
            };
            genBatch();
        })();
        return () => { cancelled = true; if (idleHandle != null) cancelIdle(idleHandle); };
    }, [foliageTiles, gridSize, sceneryMode]);

    return instances;
}
