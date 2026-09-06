import { useEffect, useState } from 'react';
import { loadImageEl, normalMapCanvasFromCrop } from '../../utils/runtimeNormalMap';

// Perf (#1162, Fase 10a, Han 2026-08-27, "wat kun je nog meer voor optimalisaties doen?"): builds a SHARED
// texture atlas (one diffuse canvas + one normal-map canvas, same layout in both) from every distinct
// foliage crop in the level, so `ForegroundFoliageLayer`'s upcoming instanced draw path (Fase 10b/10c) can
// bind ONE texture pair and draw every visible instance in a single `drawArraysInstancedANGLE` call,
// instead of the current per-instance `gl.bindTexture` × `gl.drawArrays`. See docs/architecture.md §337 for
// the full rationale (the real-hardware trace finding that motivated this, §328).
//
// Scoped to FOLIAGE only, not water — water crops (`useLdtkWaterInstances.js`) pick their source column via
// a per-PLACEMENT random offset private to that hook (`startOffsetsRef`), which isn't cleanly derivable
// from outside without duplicating that stateful draw. Foliage dominates instance count by a wide margin
// (a single level's Pine_forest_foliage2 layer alone has ~800 of the ~1377 total placed foliage tiles, per
// `useLdtkFoliageInstances.js`'s own comment) — water stays on its existing per-instance path for now,
// revisit separately if it turns out to matter.
//
// #RAM-level precedent (Han 2026-08-11, "is het de moeite om tiles te offloaden... als ze een paar
// schermlengtes ver zijn?"): `useLdtkFoliageInstances.js` already established that up-front, ONE-TIME Sobel
// generation across ~450 distinct crops is real but bounded work, best spread across idle-time slices
// rather than done in one blocking burst — same `BATCH_SIZE`/`requestIdleCallback` convention reused here
// verbatim (not redefined — see that file for the identical polyfill).
const BATCH_SIZE = 60;
const scheduleIdle = (typeof requestIdleCallback === 'function')
    ? requestIdleCallback
    : (cb) => setTimeout(() => cb({ timeRemaining: () => 0 }), 0);
const cancelIdle = (typeof cancelIdleCallback === 'function') ? cancelIdleCallback : clearTimeout;

// Every crop is the SAME gridSize×gridSize square, so a plain row-major grid pack is sufficient — no
// bin-packing algorithm needed. (A transparent gutter around each crop was tried to give the rim taps
// their full 3-texel depth, but for a SPARSE/staggered canopy the orthogonal-only `internalEdges`
// adjacency check misses diagonal sisters, so many mid-canopy crop edges read as "external" and lit up
// a 16-px vertical rim stripe into the gutter — reverted.)
function atlasLayout(count, gridSize) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / cols));
    return { cols, rows, cellSize: gridSize, width: cols * gridSize, height: rows * gridSize };
}

export default function useLdtkFoliageAtlas(foliageTiles, gridSize) {
    // `atlas` is null until the FIRST batch publishes — `uvByKey` only ever grows, existing entries never
    // move, so a consumer holding a stale-but-valid UV from an earlier partial atlas is safe.
    const [atlas, setAtlas] = useState(null);

    useEffect(() => {
        if (foliageTiles.length === 0) { setAtlas(null); return undefined; }
        let cancelled = false;
        let idleHandle;

        (async () => {
            const urls = [...new Set(foliageTiles.map((t) => t.tilesetUrl))];
            const imgs = await Promise.all(urls.map((u) => loadImageEl(u)));
            if (cancelled) return;
            const imgByUrl = new Map(urls.map((u, i) => [u, imgs[i]]));

            // Map key -> one representative tile, same dedup convention as `useLdtkFoliageInstances.js`
            // (§6c: reuse the existing identity scheme rather than inventing a second one).
            const uniqueByKey = new Map();
            for (const t of foliageTiles) {
                const key = `${t.tilesetUrl}|${t.src[0]},${t.src[1]}`;
                if (!uniqueByKey.has(key)) uniqueByKey.set(key, t);
            }
            const uniqueKeys = [...uniqueByKey.keys()];
            const { cols, rows, width, height } = atlasLayout(uniqueKeys.length, gridSize);

            const diffuseCanvas = document.createElement('canvas');
            diffuseCanvas.width = width; diffuseCanvas.height = height;
            const diffuseCtx = diffuseCanvas.getContext('2d');
            const normalCanvas = document.createElement('canvas');
            normalCanvas.width = width; normalCanvas.height = height;
            const normalCtx = normalCanvas.getContext('2d');

            const uvByKey = new Map();

            const publish = () => {
                if (cancelled) return;
                // New canvas+Map identities each publish so a consumer's own dependency/memo on `atlas`
                // (e.g. re-uploading the WebGL texture only when it actually changed) fires correctly —
                // mutating the SAME canvas in place would leave stale GPU-side texture data until some
                // OTHER prop happened to change.
                setAtlas({
                    diffuseCanvas, normalCanvas, cols, rows, gridSize,
                    uvByKey: new Map(uvByKey),
                });
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
                    const col = cursor % cols, row = Math.floor(cursor / cols);
                    const destX = col * gridSize, destY = row * gridSize;
                    diffuseCtx.drawImage(img, rep.src[0], rep.src[1], gridSize, gridSize, destX, destY, gridSize, gridSize);
                    // `normalMapCanvasFromCrop` already returns a canvas (not a data URL) — drawImage
                    // straight from it into the shared atlas, no `<img>`/data-URL round-trip needed (that
                    // round-trip only exists in `useLdtkFoliageInstances.js` because the OLD per-instance
                    // path needs a real `<img> src` for its own separate WebGL texture upload).
                    const normalCrop = normalMapCanvasFromCrop(img, rep.src[0], rep.src[1], gridSize, gridSize);
                    normalCtx.drawImage(normalCrop, destX, destY);
                    const u0 = destX / width, v0 = destY / height;
                    const u1 = (destX + gridSize) / width, v1 = (destY + gridSize) / height;
                    uvByKey.set(key, [u0, v0, u1, v1]);
                }
                publish();
                if (cursor < uniqueKeys.length) idleHandle = scheduleIdle(genBatch);
            };
            genBatch();
        })();
        return () => { cancelled = true; if (idleHandle != null) cancelIdle(idleHandle); };
    }, [foliageTiles, gridSize]);

    return atlas;
}
