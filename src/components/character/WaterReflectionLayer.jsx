import React, { useEffect, useState } from 'react';
import { LEVEL_PX_WIDTH, LEVEL_PX_HEIGHT, WATER_REFLECTION_AXIS_PX } from '../../levels/ldtk/ldtkWorld';
import { loadTileImages, drawTilesToCanvas } from './ldtkTileCompositing';

// #1032 (Han 2026-08-17, water reflection interview: "tree, decor, entities... allemaal wel... voor bomen
// mag je de ruwe laag pakken, dus shimmer negeren. parallax hoeft niet, en terrain ook niet (want water is
// nooit ónder terrain). door volgorde animatie-reflectie-shimmer zou het water ook shimmer moeten geven"):
// mirrors ONLY REFLECTABLE_TILES (trees/decor — ldtkWorld.js, deliberately excludes terrain/pavement and
// all parallax background layers) per pond, as a flat CSS-mirrored copy of the SAME composited canvas
// LdtkScenery draws (§6d reuse — no new tile-drawing logic, just `loadTileImages`/`drawTilesToCanvas`
// again) — "raw layer, ignore shimmer" for trees is satisfied by construction: this is a plain DOM
// background-image, never routed through ForegroundFoliageLayer's WebGL shimmer shader. Mounted BEFORE
// (behind) the water shimmer instances in RpgLevelPanel's z-order, so the water's own semi-transparent
// ripple naturally composites OVER this reflection — the "animation-reflection-shimmer" ordering Han
// asked for, achieved via z-order rather than distorting the reflected pixels ourselves.
const REFLECTION_OPACITY = 0.35;
// #1032 round 2 (Han: "dan moet je spiegel over [de rand van het water]... je hoeft ook maar 24 pixels
// boven die lijn te checken op weerkaatsing"): only the 24 native px of scenery directly above the water
// surface needs to be reflected — matches the same "shallow flat ground" scale as STAND_HEIGHT_PX/
// WATER_STAND_HEIGHT_PX elsewhere in this file, not an arbitrarily deep mirror.
const REFLECTION_DEPTH_PX = 24;

function useCompositedDataUrl(tiles, gridSize) {
    const [dataUrl, setDataUrl] = useState(null);
    useEffect(() => {
        let cancelled = false;
        setDataUrl(null);
        if (tiles.length === 0) return undefined;
        const canvas = document.createElement('canvas');
        canvas.width = LEVEL_PX_WIDTH;
        canvas.height = LEVEL_PX_HEIGHT;
        loadTileImages(tiles).then((imgByUrl) => {
            if (cancelled) return;
            const ctx = canvas.getContext('2d');
            drawTilesToCanvas(ctx, tiles, gridSize, imgByUrl);
            setDataUrl(canvas.toDataURL());
        });
        return () => { cancelled = true; };
    }, [tiles, gridSize]);
    return dataUrl;
}

// `ponds`: [{ minX, maxX }] (RpgLevelPanel's waterPonds — only used here to know WHERE horizontally to
// clip the reflection, not for its vertical axis, see round 6 below). `leftPxForFactor(1)` gives the
// composited canvas's own screen X (matches LdtkScenery's ground canvas positioning exactly, §6d — same
// convention, same canvas content, just mirrored per pond here).
// #1032 round 5 bugfix (Han: "boomstam lijkt van onder belicht te worden"): confirmed regression —
// this layer deliberately skips the WebGL lighting pass entirely (Han's own "raw layer, ignore shimmer"
// spec for trees), so its reflection was always full-brightness while the REAL trunk directly above goes
// through LdtkLitGround's ambient-darkening. At night/dusk that made the reflection a locally BRIGHTER
// patch sitting right under a darker real trunk — reads exactly as "glowing from below". Fixed with a
// cheap CSS `brightness()` filter scaled by the SAME `globalIllumination` value the real lighting pass
// uses (RpgLevelPanel's `foliageParams`) — the reflection now dims at night/dusk like everything else,
// without adding a real per-pixel lighting/normal-map pass (still "raw" in the sense Han asked for: no
// shimmer, no point-light response, just an overall day/night brightness match).
// #1032 round 6 bugfix (Han: "de reflectie staat nu op 32px [pond-tile-derived], i.p.v. de vaste
// spiegel-as... zet de lijn op 28px"): the mirror axis is Han's own hand-tuned `WATER_REFLECTION_AXIS_PX`
// constant, NOT each pond's tile-derived `surfaceY` — same fix as `EntityReflection`'s round 6 (see that
// component's own comment for the worked example that proves this).
export default function WaterReflectionLayer({ reflectableTiles, gridSize, ponds, worldToScreenX, leftPxForFactor, zoom, globalIllumination = 1 }) {
    const dataUrl = useCompositedDataUrl(reflectableTiles, gridSize);
    if (!dataUrl || ponds.length === 0) return null;
    const canvasLeftPx = leftPxForFactor(1);
    const surfaceBottomPx = WATER_REFLECTION_AXIS_PX * zoom;
    const depthPx = Math.min(REFLECTION_DEPTH_PX * zoom, surfaceBottomPx);
    const wrapperBottomPx = surfaceBottomPx - depthPx;
    // Canvas-local (top-down, LDtk-style) equivalent of the fixed axis — `transformOrigin`'s Y is measured
    // from the mirrored copy's own TOP edge, same convention `tileFromLdtkEntry`'s own worldY uses.
    const axisFromTopPx = (LEVEL_PX_HEIGHT - WATER_REFLECTION_AXIS_PX) * zoom;
    return (
        <>
            {ponds.map((pond, i) => {
                const pondLeftPx = worldToScreenX(pond.minX);
                return (
                    <div key={i} style={{
                        position: 'absolute', left: pondLeftPx, width: (pond.maxX - pond.minX) * zoom,
                        bottom: wrapperBottomPx, height: depthPx, overflow: 'hidden',
                        opacity: REFLECTION_OPACITY, filter: `brightness(${globalIllumination})`, pointerEvents: 'none',
                    }}>
                        {/* `bottom`/`left` counter the wrapper's own offset so this inner copy lines up
                            with the REAL ground canvas's page position before the mirror is applied. */}
                        <div style={{
                            position: 'absolute', left: canvasLeftPx - pondLeftPx, bottom: -wrapperBottomPx,
                            width: LEVEL_PX_WIDTH * zoom, height: LEVEL_PX_HEIGHT * zoom,
                            transform: 'scaleY(-1)', transformOrigin: `0px ${axisFromTopPx}px`,
                            backgroundImage: `url("${dataUrl}")`,
                            backgroundSize: `${LEVEL_PX_WIDTH * zoom}px ${LEVEL_PX_HEIGHT * zoom}px`,
                            backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
                        }} />
                    </div>
                );
            })}
        </>
    );
}
