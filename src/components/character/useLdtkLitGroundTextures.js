import { useEffect, useRef, useState } from 'react';
import { sobelNormalMap } from '../../utils/runtimeNormalMap';
import { loadTileImages, drawTilesToCanvas } from './ldtkTileCompositing';

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
export default function useLdtkLitGroundTextures(tiles, gridSize, levelPxWidth, levelPxHeight, sceneryMode) {
    const [textures, setTextures] = useState(null);
    const diffuseCanvasRef = useRef(null);
    const normalCanvasRef = useRef(null);

    useEffect(() => {
        if (sceneryMode !== 'LDtk' || tiles.length === 0 || levelPxWidth <= 0 || levelPxHeight <= 0) {
            setTextures(null);
            return undefined;
        }
        let cancelled = false;
        (async () => {
            const imgByUrl = await loadTileImages(tiles);
            if (cancelled) return;

            if (!diffuseCanvasRef.current) diffuseCanvasRef.current = document.createElement('canvas');
            if (!normalCanvasRef.current) normalCanvasRef.current = document.createElement('canvas');
            const diffuseCanvas = diffuseCanvasRef.current;
            const normalCanvas = normalCanvasRef.current;
            diffuseCanvas.width = normalCanvas.width = levelPxWidth;
            diffuseCanvas.height = normalCanvas.height = levelPxHeight;

            const diffuseCtx = diffuseCanvas.getContext('2d');
            diffuseCtx.clearRect(0, 0, levelPxWidth, levelPxHeight);
            drawTilesToCanvas(diffuseCtx, tiles, gridSize, imgByUrl);

            const imageData = diffuseCtx.getImageData(0, 0, levelPxWidth, levelPxHeight);
            const normalData = sobelNormalMap(imageData);
            normalCanvas.getContext('2d').putImageData(normalData, 0, 0);

            if (cancelled) return;
            setTextures({ diffuseCanvas, normalCanvas });
        })();
        return () => { cancelled = true; };
    }, [tiles, gridSize, levelPxWidth, levelPxHeight, sceneryMode]);

    return textures;
}
