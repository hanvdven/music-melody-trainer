import React, { useEffect, useRef, useState } from 'react';
import { LEVEL_PX_WIDTH, LEVEL_PX_HEIGHT } from '../../levels/ldtk/ldtkWorld';
import { loadTileImages, drawTilesToCanvas } from './ldtkTileCompositing';
// §377 (#1193): the sun edge-glow's reach, in GAME px. ONE constant, shared with the shaders — never a
// second literal here (CLAUDE.md §6c). A level px IS a game px on these native-resolution canvases.
import { SUN_GLOW_RADIUS_GPX } from './celestialModel';

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

const layerStyle = (leftPx, zoom, groundAnchor, extra) => ({
    position: 'absolute',
    left: leftPx,
    bottom: groundAnchor,
    width: LEVEL_PX_WIDTH * zoom,
    height: LEVEL_PX_HEIGHT * zoom,
    imageRendering: 'pixelated',
    pointerEvents: 'none',
    ...extra,
});

// #weather §370 r2 (Han's exact spec for the DOM background parallax layers, which have no shader):
// per opaque pixel, look for an EMPTY (transparent) pixel toward UP / LEFT / RIGHT and set a white
// alpha —  up: adjacent .70 / next .50 / next .20 ; left: adjacent .70 / next .30 ; right: adjacent
// .50 ; clash → the highest wins. Baked ONCE per composite into a white RGBA canvas. Out-of-bounds
// counts as empty (so the art's own top-left contour rims even at the canvas edge).
function computeMoonRim(src) {
    const w = src.width, h = src.height;
    const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
    const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && sd[(y * w + x) * 4 + 3] >= 128;
    const out = new ImageData(w, h);
    const od = out.data;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!opaque(x, y)) continue;
            let r = 0;
            // §370 r6 (Han: "15 procentpunten minder fel — opacity 70→55 etc").
            if (!opaque(x, y - 1)) r = Math.max(r, 0.55);
            else if (!opaque(x, y - 2)) r = Math.max(r, 0.35);
            else if (!opaque(x, y - 3)) r = Math.max(r, 0.05);
            if (!opaque(x - 1, y)) r = Math.max(r, 0.55);
            else if (!opaque(x - 2, y)) r = Math.max(r, 0.15);
            if (!opaque(x + 1, y)) r = Math.max(r, 0.35);
            if (r > 0) {
                const i = (y * w + x) * 4;
                od[i] = 255; od[i + 1] = 255; od[i + 2] = 255; od[i + 3] = Math.round(r * 255);
            }
        }
    }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').putImageData(out, 0, 0);
    return c;
}

// §377 (#1193): the sun edge-glow's own patch canvas is exactly the glow's 2R × 2R box, in LEVEL px
// (a level px IS a game px on these native-resolution canvases). Only the patch under the sun is ever
// touched — masking a full 3200 × LEVEL_PX_HEIGHT canvas for a 40 gpx effect would be absurd.
const SUN_PATCH_PX = SUN_GLOW_RADIUS_GPX * 2;
// The radial falloff, expressed as gradient stops. DERIVED from the same `1 - smoothstep(0, R, d)`
// curve `applySunGlow` uses in the shader (CLAUDE.md §6c — the shape is computed, not a hand-tuned
// stop table), sampled at 9 points, far finer than a 40 px radius can resolve.
const SUN_MASK_STOPS = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    return { t, a: 1 - t * t * (3 - 2 * t) };
});

/**
 * §377: bake the sun's edge glow into a layer's small patch canvas, reusing the SAME baked `rim`
 * canvas `computeMoonRim` already produced for the moon (cr5 — not a second rim renderer). Three
 * Canvas2D ops: copy the rim under the sun → mask it to the radial disc → tint it with the sun's
 * colour at the glow's own opacity.
 *
 * `bx`/`by` are the patch's top-left corner in canvas-LOCAL level px; `cx`/`cy` the sun's centre in
 * the same space. The caller derives them from the sun's container-space css position and this layer's
 * own `leftPx`, which already carries the layer's parallax factor — so the glow stays welded to the
 * visible sun disc while the art slides underneath it, exactly like the shaders' gl_FragCoord mask.
 */
function drawSunRimPatch(ctx, rim, bx, by, cx, cy, color, opacity) {
    const R = SUN_GLOW_RADIUS_GPX;
    // Clip the source read to the rim canvas; skip when the patch does not overlap this layer at all.
    const x0 = Math.max(0, bx);
    const y0 = Math.max(0, by);
    const x1 = Math.min(LEVEL_PX_WIDTH, bx + SUN_PATCH_PX);
    const y1 = Math.min(LEVEL_PX_HEIGHT, by + SUN_PATCH_PX);
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return;

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(rim, x0, y0, w, h, x0 - bx, y0 - by, w, h);

    // Mask to the radial falloff. 'destination-in' keeps (rim alpha × gradient alpha).
    const grad = ctx.createRadialGradient(cx - bx, cy - by, 0, cx - bx, cy - by, R);
    for (const s of SUN_MASK_STOPS) grad.addColorStop(s.t, `rgba(255,255,255,${s.a})`);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SUN_PATCH_PX, SUN_PATCH_PX);

    // Tint: 'source-in' repaints every surviving pixel in the sun's colour, keeping the masked alpha —
    // and `globalAlpha` here IS the glow's strength, since source-in's output alpha is src × dest.
    ctx.globalCompositeOperation = 'source-in';
    ctx.globalAlpha = Math.min(1, opacity);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, SUN_PATCH_PX, SUN_PATCH_PX);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
}

// One composited BACKGROUND parallax layer = ONE canvas. Everything is baked INTO that single canvas so
// it z-orders naturally against the other layers (Han r2: "de lijn van de achtergrond bergen wordt over
// de bomen daarvoor gerenderd") — no per-layer overlay divs (the isolated-wrapper version turned the
// whole sky solid blue, Han: "de achtergrond is helemaal onzichtbaar"). Layout:
//   • the tiles are composited ONCE into an offscreen `src` canvas (+ its moon rim, ONCE, off-thread).
//   • the shown canvas is re-baked = drawImage(src) → multiply-darken clipped to the silhouette →
//     rim on top at `rimOpacity` — only when the (quantised) darken colour or the rim opacity changes,
//     NOT every frame.
const BgLayer = React.memo(function BgLayer({
    tiles, gridSize, leftPx, zoom, groundAnchor, darkenColor, rimOpacity,
    // §377 (#1193): the sun edge-glow. `sunLeftPx` is the sun's css x from the CONTAINER's left edge,
    // `sunBottomPx` its css distance from the container's BOTTOM — both already quantised to 4 game px
    // by RpgLevelPanel, because each change here costs a canvas re-bake. All scalars/strings, so this
    // React.memo still holds.
    sunRimOpacity = 0, sunLeftPx = 0, sunBottomPx = 0, sunRimColor = '#fff',
}) {
    const canvasRef = useRef(null);
    const srcRef = useRef(null);        // tiles-only, composited once
    const rimRef = useRef(null);        // white rim, computed once from src
    const [gen, setGen] = useState(0);  // bumped when src/rim are (re)built

    useEffect(() => {
        let cancelled = false;
        if (tiles.length === 0) { srcRef.current = null; rimRef.current = null; setGen((g) => g + 1); return undefined; }
        loadTileImages(tiles).then((imgByUrl) => {
            if (cancelled) return;
            const src = document.createElement('canvas');
            src.width = LEVEL_PX_WIDTH; src.height = LEVEL_PX_HEIGHT;
            drawTilesToCanvas(src.getContext('2d'), tiles, gridSize, imgByUrl);
            srcRef.current = src;
            rimRef.current = null;
            setGen((g) => g + 1);
            // Rim: a full-canvas getImageData + per-pixel pass — deferred so it never blocks a frame.
            const bakeRim = () => {
                if (cancelled || srcRef.current !== src) return;
                rimRef.current = computeMoonRim(src);
                setGen((g) => g + 1);
            };
            if (typeof requestIdleCallback === 'function') requestIdleCallback(bakeRim, { timeout: 1000 });
            else setTimeout(bakeRim, 0);
        });
        return () => { cancelled = true; };
    }, [tiles, gridSize]);

    // Re-bake the shown canvas only when the inputs that affect its pixels change (quantised
    // `darkenColor`, `rimOpacity`, or a new src/rim) — never per animation frame.
    useEffect(() => {
        const canvas = canvasRef.current, src = srcRef.current;
        if (!canvas || !src) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.drawImage(src, 0, 0);
        if (darkenColor) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = darkenColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = 'destination-in';   // re-clip to the tile silhouette
            ctx.drawImage(src, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
        }
        if (rimRef.current && rimOpacity > 0) {
            ctx.globalAlpha = Math.min(1, rimOpacity);
            ctx.drawImage(rimRef.current, 0, 0);
            ctx.globalAlpha = 1;
        }
    }, [gen, darkenColor, rimOpacity]);

    // §377 (#1193): the SUN's own edge glow on this layer's silhouettes — the SAME baked `rimRef`
    // canvas the moon rim uses (cr5: no second rim renderer), masked to a disc around the sun and
    // tinted with the sun's colour.
    //
    // DELIBERATE STRUCTURAL DIFFERENCE FROM THE MOON RIM (and from the #1193 plan's literal wording,
    // which put this inside the re-bake effect above): the moon rim is a WHOLE-CANVAS, camera-
    // independent overlay, so baking it into the shown canvas is free. The sun glow is a small patch
    // that must stay welded to the SUN's screen position while the art parallaxes underneath it — i.e.
    // its canvas-LOCAL position changes on every panning frame. Baking that into the shown canvas would
    // re-bake a 3200 × LEVEL_PX_HEIGHT canvas every pan frame for a 40 gpx effect. Instead the patch
    // gets its own 2R × 2R canvas, CSS-positioned at the sun and re-baked from `rimRef` — 80 × 80 px of
    // work instead of ~640 000. It is a sibling immediately after the layer canvas, so it z-orders
    // exactly where the baked-in version would have: above THIS layer's art, below the next, nearer
    // parallax layer. (It is a plain transparent canvas drawn source-over, NOT the isolated blending
    // wrapper that made every layer's sky region a solid blue veil in §370 r3.)
    const sunCanvasRef = useRef(null);
    // The sun's centre in canvas-LOCAL level px, and the patch box's integer top-left corner. `leftPx`
    // already carries this layer's parallax factor and the canvas is bottom-anchored at `groundAnchor`,
    // so this is the exact inverse of `layerStyle` above. Computed in render (not in the effect) because
    // the patch canvas's own CSS placement below must use the SAME box.
    const sunLocalX = zoom > 0 ? (sunLeftPx - leftPx) / zoom : 0;
    const sunLocalY = zoom > 0 ? LEVEL_PX_HEIGHT - (sunBottomPx - groundAnchor) / zoom : 0;
    const sunBoxX = Math.floor(sunLocalX - SUN_GLOW_RADIUS_GPX);
    const sunBoxY = Math.floor(sunLocalY - SUN_GLOW_RADIUS_GPX);
    useEffect(() => {
        const canvas = sunCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, SUN_PATCH_PX, SUN_PATCH_PX);
        // 0 at night and under real overcast (`sunRimOpacity` IS the shaders' own gated, quantised
        // `sunGlow`), so a night/overcast frame does nothing here beyond the clear (ac3/ac5).
        if (!rimRef.current || sunRimOpacity <= 0 || zoom <= 0) return;
        drawSunRimPatch(ctx, rimRef.current, sunBoxX, sunBoxY, sunLocalX, sunLocalY, sunRimColor, sunRimOpacity);
    }, [gen, sunRimOpacity, sunRimColor, sunBoxX, sunBoxY, sunLocalX, sunLocalY, zoom]);

    return (
        <>
            <canvas
                ref={canvasRef}
                width={LEVEL_PX_WIDTH}
                height={LEVEL_PX_HEIGHT}
                style={layerStyle(leftPx, zoom, groundAnchor, { opacity: srcRef.current ? 1 : 0 })}
            />
            {/* §377: the sun edge-glow patch. Positioned with the SAME left/bottom convention
                `layerStyle` uses, just for the 2R box instead of the whole level: its left edge sits
                `sunBoxX` level px right of the layer's own left edge, and its bottom edge
                `LEVEL_PX_HEIGHT - (sunBoxY + 2R)` level px above the layer's bottom. Always mounted
                (an empty transparent canvas costs nothing) so there is no mount/unmount churn as the
                sun rises and sets. */}
            <canvas
                ref={sunCanvasRef}
                aria-hidden
                width={SUN_PATCH_PX}
                height={SUN_PATCH_PX}
                style={{
                    position: 'absolute',
                    left: leftPx + sunBoxX * zoom,
                    bottom: groundAnchor + (LEVEL_PX_HEIGHT - (sunBoxY + SUN_PATCH_PX)) * zoom,
                    width: SUN_PATCH_PX * zoom,
                    height: SUN_PATCH_PX * zoom,
                    imageRendering: 'pixelated',
                    pointerEvents: 'none',
                }}
            />
        </>
    );
});

// The ground plane (factor 1) — one big composited canvas, no rim of its own (LdtkLitGround's shader
// paints the §370 moon rim on it) and no DOM darken (the shader darkens it).
const GroundCanvas = React.memo(function GroundCanvas({ tiles, gridSize, leftPx, zoom, groundAnchor }) {
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
    return (
        <canvas
            ref={canvasRef}
            width={LEVEL_PX_WIDTH}
            height={LEVEL_PX_HEIGHT}
            style={layerStyle(leftPx, zoom, groundAnchor, { opacity: ready ? 1 : 0 })}
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
function LdtkScenery({
    groundTiles, backgroundLayers = [], gridSize, leftPxForFactor, groundScrollRef, groundLeftPx,
    zoom, groundAnchor, bgDarkenColor = null, bgRimOpacity = 0,
    // §377 (#1193): the sun edge-glow's parallax-bg terms. Scalars + a css string only, so `BgLayer`'s
    // React.memo still holds (an array prop would break it on every render).
    bgSunRimOpacity = 0, bgSunLeftPx = 0, bgSunBottomPx = 0, bgSunRimColor = '#fff',
}) {
    return (
        <>
            {/* #weather §362 r3 had ONE sky-darken multiply div here to darken the two static sky
                elements (CSS gradient + bgLayer5 img) painted behind LdtkScenery. §372 replaced those two
                with <SkyGradientBackdrop>, which bakes its OWN night mix in — a second multiply on top of
                that was the #26 "achtergrond verdwijnt" double-darken, so this div is GONE. `bgDarkenColor`
                is still consumed below: each parallax BgLayer bakes it into its own canvas (clipped to
                the tile silhouette). */}
            {/* #weather §370 r3: each background parallax layer = ONE canvas with its darken + moon rim
                baked in, so it z-orders naturally against the other layers (and the sky stays visible —
                the isolated-wrapper version made every layer's transparent sky region a solid blue veil). */}
            {backgroundLayers.map(({ factor, tiles }, i) => (
                <BgLayer
                    key={`bg-${i}`} tiles={tiles} gridSize={gridSize} leftPx={leftPxForFactor(factor)}
                    zoom={zoom} groundAnchor={groundAnchor}
                    darkenColor={bgDarkenColor} rimOpacity={bgRimOpacity}
                    sunRimOpacity={bgSunRimOpacity} sunLeftPx={bgSunLeftPx}
                    sunBottomPx={bgSunBottomPx} sunRimColor={bgSunRimColor}
                />
            ))}
            <div ref={groundScrollRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <GroundCanvas tiles={groundTiles} gridSize={gridSize} leftPx={groundLeftPx} zoom={zoom} groundAnchor={groundAnchor} />
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
