import React, { useEffect, useMemo, useRef, useState } from 'react';
import useFrameLoop from '../../hooks/useFrameLoop';

// #RAM-level (Han 2026-08-11, "de animated lagen moeten geanimeerd worden. beide hebben cellen van
// 32x32: campfire: alle rijen behalve de laatste (campfire on); begin op random moment; of de laatste
// rij (1 cel; campfire off). 32x32 water: steeds de gehele rij; begin om random moment"): a lightweight
// DOM overlay (not WebGL — these don't need lighting/wind, just a frame-cycling crop, matching the
// pre-existing `SheetCrop` CSS technique elsewhere in this file) that sits on top of the static ground
// canvas at each already-correctly-placed water/campfire tile's own world position.
//
// #RAM-level follow-up (Han: "ik zie het kampvuur 4x, ik zie het water 4x"): the first version grouped
// tiles into 32x32 PLACEMENT blocks, which broke because campfire isn't placed 32-aligned (px 1648 % 32
// = 16). This version animates each 16x16 PLACED tile independently — its own `src` (sheet position,
// wholly unrelated to where it's placed) says which 32x32 "logical cell" and which 16x16 quadrant of that
// cell it started as (`ldtkWorld.js`'s `withAnimMeta`); the animation just cycles the logical cell while
// keeping the quadrant fixed, so every already-correct tile placement is preserved exactly, just with a
// different source rect each frame. No grouping, no alignment assumption, so it can't misgroup.
//
// #925 round 2 (Han 2026-08-16, "doe ook de diffusie, gewoon een exacte kopie van de logica voor
// boomblaadjes"): water (`kind: 'water'`) no longer flows through this component — `RpgLevelPanel.jsx`
// routes it to `useLdtkWaterInstances.js`, which renders it through the SAME lit/shimmer shader as
// foliage instead of a plain DOM crop. That file copies this water branch's exact frame-cycle formula
// (round 1 attempt broke it by keying the per-tile random offset wrong — see that file's own comment for
// the fix) — this component only ever receives campfire tiles now.
//
// One shared `tick` counter (not one interval per instance) drives every instance; each instance's own
// displayed frame offset is a per-instance RANDOM value (rolled ONCE, stable across re-renders) added to
// that shared tick, per Han's "begin op random moment" — instances don't visibly lock-step.
const FRAME_MS = 150;   // matches the existing pet-frame interval convention elsewhere in this file

function useNaturalSize(url) {
    const [size, setSize] = useState(null);
    useEffect(() => {
        if (!url) return undefined;
        let cancelled = false;
        const img = new Image();
        img.onload = () => { if (!cancelled) setSize({ w: img.naturalWidth, h: img.naturalHeight }); };
        img.src = url;
        return () => { cancelled = true; };
    }, [url]);
    return size;
}

function AnimatedTile({ tile, tick, worldToScreenX, groundAnchorPx, zoom, levelPxHeight, gridSize }) {
    const natural = useNaturalSize(tile.tilesetUrl);
    const startOffset = useMemo(() => Math.floor(Math.random() * 1000), []);
    if (!natural) return null;
    const totalLogicalCols = Math.max(1, Math.floor(natural.w / 32));
    const totalLogicalRows = Math.max(1, Math.floor(natural.h / 32));
    const lastRow = totalLogicalRows - 1;

    let col, row;
    if (tile.logicalRow === lastRow) {
        col = tile.logicalCol; row = lastRow;   // the single "off" cell — static, no cycling.
    } else {
        const onCols = totalLogicalCols, onRows = lastRow;   // "alle rijen behalve de laatste"
        const startIndex = tile.logicalRow * onCols + tile.logicalCol;
        const frame = (startIndex + tick + startOffset) % Math.max(1, onCols * onRows);
        col = frame % onCols; row = Math.floor(frame / onCols);
    }
    const finalSrcX = col * 32 + tile.subX, finalSrcY = row * 32 + tile.subY;

    const worldXCenter = tile.worldX + gridSize / 2;
    const heightAboveBottom = levelPxHeight - tile.worldY - gridSize;
    // #weather §364 r2 (Han: "ik zie de naden nog steeds"): snap the tile's four EDGES to whole DEVICE
    // pixels and derive width/height as the difference of rounded edges — NOT `round(pos)` + a separate
    // `size·zoom`. On a fractional dpr (Windows 125% / 150% → dpr 1.25 / 1.5) the latter drifts ±1 device
    // px between adjacent tiles, tiling the seam across the grid. Edge-snapping guarantees a tile's right
    // edge is exactly its neighbour's left edge (and stacked tiles' top == the one above's bottom) at any
    // dpr. Matches the identical fix in ForegroundFoliageLayer for the WebGL foliage/water quads.
    const dpr = window.devicePixelRatio || 1;
    const cx = worldToScreenX(worldXCenter);
    const halfW = (gridSize / 2) * zoom;
    const bEdge = groundAnchorPx + heightAboveBottom * zoom;
    const lDev = Math.round((cx - halfW) * dpr);
    const rDev = Math.round((cx + halfW) * dpr);
    const bDev = Math.round(bEdge * dpr);
    const tDev = Math.round((bEdge + gridSize * zoom) * dpr);
    return (
        <div style={{
            position: 'absolute',
            left: lDev / dpr, width: (rDev - lDev) / dpr,
            bottom: bDev / dpr, height: (tDev - bDev) / dpr,
            backgroundImage: `url("${tile.tilesetUrl}")`,
            backgroundPosition: `${-finalSrcX * zoom}px ${-finalSrcY * zoom}px`,
            backgroundSize: `${natural.w * zoom}px ${natural.h * zoom}px`,
            backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', pointerEvents: 'none',
        }} />
    );
}

// `worldToScreenX` here must be the CALLER's ground-plane projection PLUS the level's own left offset
// already baked in (i.e. the same function RpgLevelPanel uses for hero/pet — animated tiles sit at
// level-LOCAL px like every other LdtkScenery tile, so the caller passes a function that already adds
// `LEVEL_MIN_X` before applying `worldToScreenX`).
function LdtkAnimatedTiles({ animatedTiles, worldToScreenX, groundAnchorPx, zoom, levelPxHeight, gridSize }) {
    const [tick, setTick] = useState(0);
    // Perf (#1162, Han 2026-08-27, "kun je nog meer optimalisaties vinden?"): `setInterval` → rAF, same
    // conversion as `petFrame`/`walkFrame` in RpgLevelPanel.jsx (§318/§319) — fixes drift, and this was
    // the ONE remaining "React state on its own independent timer" instance this file's own §317 comment
    // had flagged but not fixed. `setTick` only commits when the computed tick actually changes, so the
    // commit cadence (and therefore this component's re-render rate) stays identical to the old interval.
    // Perf (#1162, Fase 9, docs/architecture.md §331): migrated onto the shared `useFrameLoop` ticker —
    // this component renders TWICE per level (back+front instance passes), each an independent subscriber
    // now instead of an independent rAF chain. `startMs` moved to a ref for the same reason as every other
    // Fase 8 migration: `useFrameLoop` always calls the LATEST callback closure via its own ref, so a
    // plain closure `let` here would reset on every render instead of persisting per-tick.
    const startMsRef = useRef(null);
    useFrameLoop(() => {
        const nowMs = performance.now();
        if (startMsRef.current === null) startMsRef.current = nowMs;
        const nextTick = Math.floor((nowMs - startMsRef.current) / FRAME_MS);
        setTick((t) => (t === nextTick ? t : nextTick));
    }, [], { priority: 'critical' });

    return (
        <>
            {animatedTiles.map((tile, i) => (
                <AnimatedTile
                    key={i} tile={tile} tick={tick} worldToScreenX={worldToScreenX}
                    groundAnchorPx={groundAnchorPx} zoom={zoom} levelPxHeight={levelPxHeight} gridSize={gridSize}
                />
            ))}
        </>
    );
}

// Perf (#1161/#1162, Han 2026-08-27): doesn't depend on `petFrame` — it has its own separate tick for the
// campfire animation (now rAF-driven, see above), so this memo boundary only stops PARENT
// (`RpgLevelPanel`)-triggered re-renders; its own timer still re-renders it independently, by design.
export default React.memo(LdtkAnimatedTiles);
