import { useEffect, useRef, useState } from 'react';
import { loadImageEl, normalMapCanvasFromCrop } from '../../utils/runtimeNormalMap';
import { LEVEL_PX_HEIGHT } from '../../levels/ldtk/ldtkWorld';

// #925 follow-up (Han 2026-08-16, "alle lagen met shimmer moeten shimmer effect hebben, dus ook
// bijvoorbeeld het water" + "doe ook de diffusie, gewoon een exacte kopie van de logica voor
// boomblaadjes"): converts `buildWorld()`'s water tiles (`kind: 'water'` entries in
// `animatedTilesBack/Front`) into `ForegroundFoliageLayer` instances — diffuse AND shimmer both drawn
// through the shimmer shader, exactly like `useLdtkFoliageInstances.js` does for tree/grass tiles (same
// normal-map-per-crop generation via the SAME generic Sobel utility, CLAUDE.md §6d — no water-specific
// normal-map asset). The one thing foliage doesn't need but water does: water's own frame-cycling
// animation ("steeds de gehele rij" — cycles columns within its own row). That rule is copied VERBATIM
// from `LdtkAnimatedTiles.jsx`'s water branch (which is UNCHANGED and no longer receives water tiles —
// see RpgLevelPanel.jsx's kind:'water' filter) rather than touched or "improved":
//   col = (tile.logicalCol + tick + startOffset) % totalLogicalCols; row = tile.logicalRow
// #925 ROUND 2 (Han caught a live regression in round 1: "wateranimatie uit random plekken van de sheet"):
// round 1's bug was keying each tile's random `startOffset` by its (tilesetUrl, src) IDENTITY — several
// placed water tiles legitimately share the same src (a repeating water pattern), so round 1
// accidentally FORCED every placement sharing one src into lockstep, which is NOT what
// `LdtkAnimatedTiles.jsx`'s original `AnimatedTile` did: there, `useMemo(() => Math.random()*1000, [])`
// runs ONCE PER REACT COMPONENT INSTANCE, i.e. per ARRAY POSITION (`key={i}`) — every individual PLACED
// tile gets its OWN independent offset regardless of whether it shares a src with another tile. Fixed by
// keying `startOffsetsRef` by ARRAY INDEX instead of by src, reproducing that exact per-placement
// independence.
//
// #925 ROUND 3 (Han, "ik heb ook behoefte aan vsync" — clarified: the animation feels detached/choppy
// from the screen, wants it smoother): `setInterval` callbacks are NOT synchronized to the display's own
// refresh — they fire on an independent JS timer that can drift or bunch up relative to actual paints,
// which is what reads as "not vsync'd." requestAnimationFrame callbacks, by contrast, fire once per
// display refresh, right before paint. Replaced the flat interval with an rAF loop that accumulates real
// elapsed time and only advances `tick` (still every ~FRAME_MS of elapsed time — same animation SPEED,
// just delivered in lockstep with actual frames instead of an independent timer).
const FRAME_MS = 150;   // matches LdtkAnimatedTiles.jsx's own FRAME_MS — same animation cadence

export default function useLdtkWaterInstances(waterTiles, gridSize, sceneryMode) {
    const [instances, setInstances] = useState([]);
    const startOffsetsRef = useRef([]);   // index -> random offset, rolled once per array slot
    const normalCacheRef = useRef(new Map());

    useEffect(() => {
        if (sceneryMode !== 'LDtk' || waterTiles.length === 0) { setInstances([]); return undefined; }
        let cancelled = false;
        let tick = 0;
        let raf;

        (async () => {
            const urls = [...new Set(waterTiles.map((t) => t.tilesetUrl))];
            const imgs = await Promise.all(urls.map((u) => loadImageEl(u)));
            if (cancelled) return;
            const imgByUrl = new Map(urls.map((u, i) => [u, imgs[i]]));

            const publish = () => {
                if (cancelled) return;
                const out = [];
                waterTiles.forEach((tile, i) => {
                    const img = imgByUrl.get(tile.tilesetUrl);
                    if (!img) return;
                    const totalLogicalCols = Math.max(1, Math.floor(img.naturalWidth / 32));

                    if (startOffsetsRef.current[i] === undefined) {
                        startOffsetsRef.current[i] = Math.floor(Math.random() * 1000);
                    }
                    const startOffset = startOffsetsRef.current[i];
                    // Verbatim copy of LdtkAnimatedTiles.jsx's water branch.
                    const col = (tile.logicalCol + tick + startOffset) % totalLogicalCols;
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
                        // #1032 (Han: "aparte slider voor pixel switch op het water"): lets
                        // ForegroundFoliageLayer's draw loop swap in water's own waveSteps/ditherAmount
                        // uniform values instead of the shared foliage preset for this instance.
                        isWater: true,
                    });
                });
                setInstances(out);
            };

            publish();
            let lastTickTime = performance.now();
            const loop = (now) => {
                if (cancelled) return;
                if (now - lastTickTime >= FRAME_MS) {
                    // Catch up by exactly however many whole FRAME_MS windows elapsed (never more than
                    // one per rAF callback in practice, but robust to a throttled/backgrounded tab
                    // resuming after a long gap) instead of drifting behind real time.
                    const steps = Math.floor((now - lastTickTime) / FRAME_MS);
                    tick += steps;
                    lastTickTime += steps * FRAME_MS;
                    publish();
                }
                raf = requestAnimationFrame(loop);
            };
            raf = requestAnimationFrame(loop);
        })();

        return () => { cancelled = true; if (raf) cancelAnimationFrame(raf); };
    }, [waterTiles, gridSize, sceneryMode]);

    return instances;
}
