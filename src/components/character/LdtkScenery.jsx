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

const CanvasLayer = React.memo(function CanvasLayer({ tiles, gridSize, leftPx, zoom, groundAnchor }) {
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
});

// `groundTiles`/`backgroundLayers` are explicit props (not a whole `world`) so `RpgLevelPanel.jsx` can
// mount this TWICE — once for tiles behind the Entities layer (with `backgroundLayers`), once for tiles
// in front of it (`groundTiles` only, background art never belongs in front — see `ldtkWorld.js`'s
// `isInFrontOfEntities`/`splitByFront`, Han: "houd goed de volgorde van lagen aan"). `leftPxForFactor
// (factor)` must return the screen X of the level's own native x=0 edge, projected through
// RpgLevelPanel's existing camera math with the camera term scaled by `factor` first (1 = full camera
// reaction, the ground plane; <1 = a background layer, which lags behind — parallax depth).
//
// Perf (#1162, Han 2026-08-27, "de camera-update moet echt anders" — Fase 1): `groundScrollRef`/
// `groundLeftPx` are the STABLE (camera-independent) counterparts to `leftPxForFactor`/`leftPxForFactor(1)`
// — see RpgLevelPanel.jsx's own `worldToScreenXLocal` comment for the full rationale. Only the GROUND
// layer (factor=1, by far the largest single composited canvas) gets this treatment; `backgroundLayers`
// stay on the existing `leftPxForFactor` path (few in number, parallax factor varies per layer, not worth
// the same wrapper machinery this round) — this is why the ground layer needs its OWN nested wrapper
// `<div>` rather than one shared wrapper around this whole component's output.
function LdtkScenery({ groundTiles, backgroundLayers = [], gridSize, leftPxForFactor, groundScrollRef, groundLeftPx, zoom, groundAnchor, bgDarkenColor = null }) {
    return (
        <>
            {backgroundLayers.map(({ factor, tiles }, i) => (
                <CanvasLayer key={`bg-${i}`} tiles={tiles} gridSize={gridSize} leftPx={leftPxForFactor(factor)} zoom={zoom} groundAnchor={groundAnchor} />
            ))}
            {/* #weather §362 (Han 2026-09-01): the day/night multiply-darken for the background layers,
                which have no lit pipeline of their own. Sits AFTER the bg canvases and BEFORE the ground
                layer below, so it only ever multiplies the backgrounds (+ the sky gradient / bgLayer5
                painted behind them in RpgLevelPanel) — never the ground/foliage, which the WebGL shaders
                already darken. Only present when it's actually dark (`bgDarkenColor` is null at full
                daylight) and only for the pass that has background layers. */}
            {bgDarkenColor && backgroundLayers.length > 0 && (
                <div style={{ position: 'absolute', inset: 0, background: bgDarkenColor, mixBlendMode: 'multiply', pointerEvents: 'none' }} />
            )}
            <div ref={groundScrollRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <CanvasLayer tiles={groundTiles} gridSize={gridSize} leftPx={groundLeftPx} zoom={zoom} groundAnchor={groundAnchor} />
            </div>
        </>
    );
}

// Perf (#1161/#1162, Han 2026-08-27): this canvas-compositing layer doesn't depend on `petFrame`/other
// idle-animation state at all — without a memo boundary it still re-rendered on every tick of
// RpgLevelPanel's `petFrame`. `groundTiles`/`backgroundLayers`/`leftPxForFactor`/`groundLeftPx` are
// already stable references when nothing relevant changed (RpgLevelPanel.jsx's own useMemo/useCallback
// wrapping), so this memo genuinely hits for the idle-standing case. While the camera pans, `groundLeftPx`
// STAYS stable too (see this file's own `groundScrollRef` comment above) — only `leftPxForFactor` (used
// for the few `backgroundLayers`) still varies, so THIS component's own function body still re-runs every
// panning frame, but the (by far more expensive) ground `CanvasLayer` — now `React.memo`'d itself, wrapped
// in the imperatively-scrolled `groundScrollRef` div — skips its own re-render regardless.
export default React.memo(LdtkScenery);
