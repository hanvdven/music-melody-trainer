import React, { useEffect, useMemo, useRef, useState } from 'react';

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
    if (tile.kind === 'campfire' && tile.logicalRow === lastRow) {
        col = tile.logicalCol; row = lastRow;   // the single "off" cell — static, no cycling.
    } else if (tile.kind === 'campfire') {
        const onCols = totalLogicalCols, onRows = lastRow;   // "alle rijen behalve de laatste"
        const startIndex = tile.logicalRow * onCols + tile.logicalCol;
        const frame = (startIndex + tick + startOffset) % Math.max(1, onCols * onRows);
        col = frame % onCols; row = Math.floor(frame / onCols);
    } else {
        // water: "steeds de gehele rij" — cycles columns within its OWN row only.
        col = (tile.logicalCol + tick + startOffset) % totalLogicalCols; row = tile.logicalRow;
    }
    const finalSrcX = col * 32 + tile.subX, finalSrcY = row * 32 + tile.subY;

    const worldXCenter = tile.worldX + gridSize / 2;
    const heightAboveBottom = levelPxHeight - tile.worldY - gridSize;
    return (
        <div style={{
            position: 'absolute',
            left: worldToScreenX(worldXCenter) - (gridSize / 2) * zoom,
            bottom: groundAnchorPx + heightAboveBottom * zoom,
            width: gridSize * zoom, height: gridSize * zoom,
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
export default function LdtkAnimatedTiles({ animatedTiles, worldToScreenX, groundAnchorPx, zoom, levelPxHeight, gridSize }) {
    const [tick, setTick] = useState(0);
    const tickRef = useRef(0);
    useEffect(() => {
        const id = setInterval(() => { tickRef.current += 1; setTick(tickRef.current); }, FRAME_MS);
        return () => clearInterval(id);
    }, []);

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
