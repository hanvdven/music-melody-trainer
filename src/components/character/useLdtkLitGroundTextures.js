import { useEffect, useRef, useState } from 'react';
import { sobelNormalMapRows } from '../../utils/runtimeNormalMap';
import { loadTileImages, drawTilesToCanvas } from './ldtkTileCompositing';
import logger from '../../utils/logger';

// #925 follow-up (Han 2026-08-16, "traag inladen van blokken... veel flitsen, zeker bij veel
// schermbeweging"): the level's full composited canvas can be huge (7872x272 in Han's own level — ~2.1M
// pixels); running the Sobel pass over it in one synchronous call blocked the main thread for a single
// long stretch (confirmed by Chrome's own "requestAnimationFrame handler took Nms" violation warnings in
// Han's console log) — every OTHER layer's animation stalls during that one block, reading as "flashing"
// and "slow loading." ROWS_PER_CHUNK rows are processed per `requestIdleCallback` slice instead (mirrors
// useLdtkFoliageInstances.js's own BATCH_SIZE idle-chunking convention, CLAUDE.md §6c), spreading ~2.1M
// pixel ops across many small idle windows instead of one large blocking one.
const ROWS_PER_CHUNK = 8;
const scheduleIdle = (typeof requestIdleCallback === 'function')
    ? requestIdleCallback
    : (cb) => setTimeout(() => cb({ timeRemaining: () => 0 }), 0);
const cancelIdle = (typeof cancelIdleCallback === 'function') ? cancelIdleCallback : clearTimeout;

// #925 follow-up (Han 2026-08-16, "alle lagen behalve achtergrond moeten normal map krijgen en reageren
// op licht"): composites a tile bucket (ground/terrain/buildings/decor — everything LdtkScenery.jsx used
// to render flat) into ONE diffuse canvas at the level's full native extent, exactly like LdtkScenery's
// own `useCompositedLayer` (shared via ldtkTileCompositing.js, CLAUDE.md §6c/§6d), THEN Sobel-generates
// ONE normal map from that WHOLE composited image in a single pass — simpler than
// useLdtkFoliageInstances.js's per-tile-crop approach, since there's no animation/frame-cycling here, just
// one static image to relight. Both canvases are handed to `LdtkLitGround.jsx`, which uploads them as
// WebGL textures and relights them with ONE per-frame shader pass sized to the viewport (cost scales with
// screen pixels, not tile count — see docs/architecture.md's §925 lighting section for why this differs
// from the per-instance shimmer pipeline foliage/water use).
export default function useLdtkLitGroundTextures(tiles, gridSize, levelPxWidth, levelPxHeight) {
    const [textures, setTextures] = useState(null);
    const diffuseCanvasRef = useRef(null);
    const normalCanvasRef = useRef(null);

    useEffect(() => {
        if (tiles.length === 0 || levelPxWidth <= 0 || levelPxHeight <= 0) {
            setTextures(null);
            return undefined;
        }
        let cancelled = false;
        let idleHandle;
        // #925 diagnostic (Han: back-of-entities lit layer shows nothing at all, not even a
        // debug-channel raw-position gradient — consistent with this hook's promise NEVER resolving for
        // that bucket, e.g. one bad tileset URL among the many groundTilesBack references rejecting the
        // WHOLE Promise.all silently). Wrapped in try/catch + logged so a real failure surfaces in the
        // console instead of leaving `textures` stuck at null forever with no trace (CLAUDE.md §7a).
        (async () => {
            try {
                logger.debug('useLdtkLitGroundTextures', 'compositing start', { tileCount: tiles.length, levelPxWidth, levelPxHeight });
                const imgByUrl = await loadTileImages(tiles);
                if (cancelled) return;

                if (!diffuseCanvasRef.current) diffuseCanvasRef.current = document.createElement('canvas');
                if (!normalCanvasRef.current) normalCanvasRef.current = document.createElement('canvas');
                const diffuseCanvas = diffuseCanvasRef.current;
                const normalCanvas = normalCanvasRef.current;
                diffuseCanvas.width = normalCanvas.width = levelPxWidth;
                diffuseCanvas.height = normalCanvas.height = levelPxHeight;

                // `willReadFrequently` silences Chrome's own perf warning on the getImageData call below
                // (a single big read, not literally "frequent", but the canvas is large enough that Chrome
                // still flags it — the hint costs nothing and matches Chrome's own suggestion).
                const diffuseCtx = diffuseCanvas.getContext('2d', { willReadFrequently: true });
                diffuseCtx.clearRect(0, 0, levelPxWidth, levelPxHeight);
                drawTilesToCanvas(diffuseCtx, tiles, gridSize, imgByUrl);

                const imageData = diffuseCtx.getImageData(0, 0, levelPxWidth, levelPxHeight);
                const normalOut = new ImageData(levelPxWidth, levelPxHeight);

                let row = 0;
                await new Promise((resolve) => {
                    const processChunk = () => {
                        if (cancelled) { resolve(); return; }
                        const end = Math.min(row + ROWS_PER_CHUNK, levelPxHeight);
                        sobelNormalMapRows(imageData, normalOut, row, end);
                        row = end;
                        if (row < levelPxHeight) idleHandle = scheduleIdle(processChunk);
                        else resolve();
                    };
                    idleHandle = scheduleIdle(processChunk);
                });
                if (cancelled) return;
                normalCanvas.getContext('2d').putImageData(normalOut, 0, 0);

                logger.debug('useLdtkLitGroundTextures', 'compositing done', { tileCount: tiles.length });
                setTextures({ diffuseCanvas, normalCanvas });
            } catch (err) {
                logger.error('useLdtkLitGroundTextures', 'E032-LDTK-LIT-GROUND-TEXTURE-COMPOSITE', err, { tileCount: tiles.length });
            }
        })();
        return () => { cancelled = true; if (idleHandle != null) cancelIdle(idleHandle); };
    }, [tiles, gridSize, levelPxWidth, levelPxHeight]);

    return textures;
}
