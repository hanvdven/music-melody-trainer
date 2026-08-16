import React, { useEffect, useRef, useState } from 'react';
import { LEVEL_PX_WIDTH, LEVEL_PX_HEIGHT } from '../../levels/ldtk/ldtkWorld';
import { loadTileImages, drawTilesToCanvas } from './ldtkTileCompositing';

// #RAM-level (Han 2026-08-10): renders a `buildWorld()` result (ldtkWorld.js) as the RPG hub's scenery.
// Ground/background tiles are composited ONCE per world-config change into a plain <canvas> per layer
// (native-resolution `drawImage` blits, no per-frame per-tile work) rather than one DOM node per tile —
// the level can carry several thousand tiles across its 26 layers (Bg_pine alone has 1400), which would
// be a lot of absolutely-positioned divs to keep in sync with the scrolling camera every frame. The
// canvas is then positioned/scaled with the SAME `worldToScreenX`/`ZOOM`/`GROUND_ANCHOR` convention every
// other sprite in RpgLevelPanel already uses, so panning is just a cheap CSS `left` update, not a redraw.
//
// The canvas is sized to the level's own native px extent (`LEVEL_PX_WIDTH x LEVEL_PX_HEIGHT`), matching
// LDtk's own top-left-origin coordinate space directly; it's bottom-anchored to `groundAnchor` (its own
// bottom edge = the level's bottom edge = the ground line) and left-anchored at whatever screen X the
// caller computes for the level's native x=0 edge, exactly like the pre-existing floor-tile DOM strip did.

function useCompositedLayer(tiles, gridSize) {
    const canvasRef = useRef(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        let cancelled = false;
        setReady(false);
        const canvas = canvasRef.current;
        if (!canvas || tiles.length === 0) return undefined;
        loadTileImages(tiles).then((imgByUrl) => {
            if (cancelled) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawTilesToCanvas(ctx, tiles, gridSize, imgByUrl);
            setReady(true);
        });
        return () => { cancelled = true; };
    }, [tiles, gridSize]);
    return { canvasRef, ready };
}

function CanvasLayer({ tiles, gridSize, leftPx, zoom, groundAnchor }) {
    const { canvasRef, ready } = useCompositedLayer(tiles, gridSize);
    return (
        <canvas
            ref={canvasRef}
            width={LEVEL_PX_WIDTH}
            height={LEVEL_PX_HEIGHT}
            style={{
                position: 'absolute',
                left: leftPx,
                bottom: groundAnchor,
                width: LEVEL_PX_WIDTH * zoom,
                height: LEVEL_PX_HEIGHT * zoom,
                imageRendering: 'pixelated',
                pointerEvents: 'none',
                opacity: ready ? 1 : 0,
            }}
        />
    );
}

// `groundTiles`/`backgroundLayers` are explicit props (not a whole `world`) so `RpgLevelPanel.jsx` can
// mount this TWICE — once for tiles behind the Entities layer (with `backgroundLayers`), once for tiles
// in front of it (`groundTiles` only, background art never belongs in front — see `ldtkWorld.js`'s
// `isInFrontOfEntities`/`splitByFront`, Han: "houd goed de volgorde van lagen aan"). `leftPxForFactor
// (factor)` must return the screen X of the level's own native x=0 edge, projected through
// RpgLevelPanel's existing camera math with the camera term scaled by `factor` first (1 = full camera
// reaction, the ground plane; <1 = a background layer, which lags behind — parallax depth).
export default function LdtkScenery({ groundTiles, backgroundLayers = [], gridSize, leftPxForFactor, zoom, groundAnchor }) {
    return (
        <>
            {backgroundLayers.map(({ factor, tiles }, i) => (
                <CanvasLayer key={`bg-${i}`} tiles={tiles} gridSize={gridSize} leftPx={leftPxForFactor(factor)} zoom={zoom} groundAnchor={groundAnchor} />
            ))}
            <CanvasLayer tiles={groundTiles} gridSize={gridSize} leftPx={leftPxForFactor(1)} zoom={zoom} groundAnchor={groundAnchor} />
        </>
    );
}
