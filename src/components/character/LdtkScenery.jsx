import React, { useEffect, useRef, useState } from 'react';
import useFrameLoop from '../../hooks/useFrameLoop';
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

// §377 item 1 (Han: "sub sheen moet ook werken op de achtergrond (parallaxlagen)"). The DOM parallax
// layers only ever had the RIM (computeMoonRim); the shader layers also have a luminance-masked SURFACE
// sheen (SUN_SHEEN_SCALE). This is the DOM twin — a FLAT approximation (no per-pixel luminance mask,
// which would need a getImageData bake): the layer's own silhouette, radially masked and sun-tinted, at
// a modest weight, laid down UNDER the rim in the same patch. For a distant treeline the flat form is
// visually indistinguishable from the shader's highlight-riding version.
const SUN_SHEEN_WEIGHT = 0.35;

/**
 * §377: bake the sun's edge glow into a layer's small patch canvas — the RIM (reusing the baked
 * `computeMoonRim` canvas, cr5) plus (item 1) a flat SURFACE SHEEN from the layer's own `src` tiles.
 * Order on one canvas: src·SHEEN_WEIGHT, then rim additively on top, then ONE radial mask, then ONE
 * sun-colour tint — so `destination-in` masks both contributions together and nothing double-masks.
 *
 * `bx`/`by` are the patch's top-left corner in canvas-LOCAL level px; `cx`/`cy` the sun's centre in
 * the same space. The caller derives them from the sun's container-space css position and this layer's
 * own `leftPx`, which already carries the layer's parallax factor — so the glow stays welded to the
 * visible sun disc while the art slides underneath it, exactly like the shaders' gl_FragCoord mask.
 */
function drawSunRimPatch(ctx, src, rim, bx, by, cx, cy, color, opacity, radiusScale = 1) {
    // #1220 (Han: "maak de straal kleiner, lineair tot 0"): as the sun sinks behind foliage the caller
    // linearly shrinks radiusScale 1 → 0, so the whole disc contracts toward the sun and vanishes.
    const R = SUN_GLOW_RADIUS_GPX * radiusScale;
    if (R <= 0) return;
    // Clip the source read to the layer canvas; skip when the patch does not overlap this layer at all.
    const x0 = Math.max(0, bx);
    const y0 = Math.max(0, by);
    const x1 = Math.min(LEVEL_PX_WIDTH, bx + SUN_PATCH_PX);
    const y1 = Math.min(LEVEL_PX_HEIGHT, by + SUN_PATCH_PX);
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return;

    ctx.globalCompositeOperation = 'source-over';
    // Surface sheen: the layer's own tile silhouette at a modest weight.
    if (src) {
        ctx.globalAlpha = SUN_SHEEN_WEIGHT;
        ctx.drawImage(src, x0, y0, w, h, x0 - bx, y0 - by, w, h);
    }
    // Rim on top, additive so a lit edge reads brighter than the flat sheen behind it.
    ctx.globalCompositeOperation = src ? 'lighter' : 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(rim, x0, y0, w, h, x0 - bx, y0 - by, w, h);

    // Mask to the radial falloff. 'destination-in' keeps (accumulated alpha × gradient alpha).
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
    tiles, gridSize, zoom, groundAnchor, darkenColor, rimOpacity,
    // Perf (#1196, F1, Han 2026-09-05): parallax is IMPERATIVE now — `bgLeftPx` is the camera-
    // independent left edge (RpgLevelPanel's `groundLeftPxLocal`), and this layer's own `useFrameLoop`
    // writes `transform: translateX(-cameraX*factor*zoom)` (snapped) onto its wrapper div every frame,
    // reading `cameraXRef.current` live — so a camera pan never re-renders RpgLevelPanel. Before F1 the
    // parent recomputed `leftPx={leftPxForFactor(factor)}` on every panning re-render; that re-render is
    // gone.
    factor = 1, cameraXRef, bgLeftPx = 0,
    // §377 (#1193): the sun edge-glow. `sunLeftPx` is the sun's css x from the CONTAINER's left edge,
    // `sunBottomPx` its css distance from the container's BOTTOM — both already quantised to 4 game px
    // by RpgLevelPanel, because each change here costs a canvas re-bake. All scalars/strings, so this
    // React.memo still holds.
    sunRimOpacity = 0, sunLeftPx = 0, sunBottomPx = 0, sunRimColor = '#fff', sunRadiusScale = 1,
}) {
    const wrapRef = useRef(null);       // parallax transform is written here every frame (F1)
    const canvasRef = useRef(null);
    const sunCanvasRef = useRef(null);
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
    // The moon rim is a WHOLE-CANVAS, camera-independent overlay, so it bakes into the shown canvas for
    // free (the re-bake effect above). The sun glow is a small patch that must stay welded to the SUN's
    // fixed screen position while the art parallaxes underneath it — its canvas-LOCAL position changes
    // every panning frame. It gets its own 2R × 2R canvas re-baked from `rimRef` (80 × 80 px, vs
    // re-baking a 3200 × LEVEL_PX_HEIGHT canvas). It sits inside THIS layer's wrapper div, after the art
    // canvas, so it z-orders above this layer's art and below the next, nearer parallax layer.
    //
    // Perf (#1196, F1): the wrapper transform AND the patch's moving canvas-local box are both driven
    // here, imperatively, every frame — reading `cameraXRef.current` live — so a camera pan needs no
    // React re-render. The patch is only re-baked when its integer box actually moves (dedup on
    // `lastSunBoxRef`), and a NON-camera input change (a new `gen`, opacity/colour/radius/zoom/sun
    // position) forces one re-bake by nulling that dedup.
    const lastSunBoxRef = useRef({ x: null, y: null });
    useEffect(() => { lastSunBoxRef.current = { x: null, y: null }; },
        [gen, zoom, groundAnchor, sunLeftPx, sunBottomPx, sunRimOpacity, sunRimColor, sunRadiusScale, bgLeftPx, factor]);
    useFrameLoop(() => {
        if (zoom <= 0 || !cameraXRef) return;
        const dpr = window.devicePixelRatio || 1;
        // Parallax: the layer lags the camera by `factor` (1 = ground plane, <1 = far background). Snap
        // to whole device px, same grid the ground/foliage/water layers already snap to (RpgLevelPanel
        // camera loop, §364/§327) so nothing sub-pixel-crawls against them.
        const off = Math.round(-cameraXRef.current * factor * zoom * dpr) / dpr;
        if (wrapRef.current) wrapRef.current.style.transform = `translateX(${off}px)`;

        // The sun's centre in this layer's canvas-LOCAL level px. `bgLeftPx + off` is the art canvas's
        // real container-space left this frame — the exact inverse of `layerStyle`.
        const sunLocalX = (sunLeftPx - (bgLeftPx + off)) / zoom;
        const sunLocalY = LEVEL_PX_HEIGHT - (sunBottomPx - groundAnchor) / zoom;
        const sunBoxX = Math.floor(sunLocalX - SUN_GLOW_RADIUS_GPX);
        const sunBoxY = Math.floor(sunLocalY - SUN_GLOW_RADIUS_GPX);
        if (sunBoxX === lastSunBoxRef.current.x && sunBoxY === lastSunBoxRef.current.y) return;
        lastSunBoxRef.current = { x: sunBoxX, y: sunBoxY };

        const patch = sunCanvasRef.current;
        if (!patch) return;
        // Patch CSS placement is camera-INDEPENDENT (`bgLeftPx + sunBoxX*zoom`) — the wrapper's own
        // `translateX(off)` carries it to the fixed sun, exactly like the art canvas.
        patch.style.left = `${bgLeftPx + sunBoxX * zoom}px`;
        patch.style.bottom = `${groundAnchor + (LEVEL_PX_HEIGHT - (sunBoxY + SUN_PATCH_PX)) * zoom}px`;
        const ctx = patch.getContext('2d');
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, SUN_PATCH_PX, SUN_PATCH_PX);
        // 0 at night / under real overcast (`sunRimOpacity` IS the shaders' own gated, quantised
        // `sunGlow`), so a night/overcast frame does nothing beyond the clear.
        if (!rimRef.current || sunRimOpacity <= 0 || sunRadiusScale <= 0) return;
        drawSunRimPatch(ctx, srcRef.current, rimRef.current, sunBoxX, sunBoxY, sunLocalX, sunLocalY, sunRimColor, sunRimOpacity, sunRadiusScale);
    }, [], { priority: 'critical' });

    return (
        <div ref={wrapRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <canvas
                ref={canvasRef}
                width={LEVEL_PX_WIDTH}
                height={LEVEL_PX_HEIGHT}
                style={layerStyle(bgLeftPx, zoom, groundAnchor, { opacity: srcRef.current ? 1 : 0 })}
            />
            {/* §377: the sun edge-glow patch. Same left/bottom convention as `layerStyle`, for the 2R
                box. Its `left`/`bottom` are written imperatively by the frame loop above; the seed
                values here just keep the first paint sane before frame 1. Always mounted (an empty
                transparent canvas costs nothing) so there is no mount/unmount churn as the sun sets. */}
            <canvas
                ref={sunCanvasRef}
                aria-hidden
                width={SUN_PATCH_PX}
                height={SUN_PATCH_PX}
                style={{
                    position: 'absolute',
                    left: bgLeftPx,
                    bottom: groundAnchor,
                    width: SUN_PATCH_PX * zoom,
                    height: SUN_PATCH_PX * zoom,
                    imageRendering: 'pixelated',
                    pointerEvents: 'none',
                }}
            />
        </div>
    );
});

// The ground plane (factor 1) — one big composited canvas, no rim of its own (LdtkLitGround's shader
// paints the §370 moon rim on it).
//
// §387 D4 (#1222, Han 2026-09-06, "'s nachts pixels die niet donker worden en dus fel afsteken tegen de
// rest"). This canvas is the deliberate un-shimmering FALLBACK sprite (#RAM-level: "toon dan de default
// ongemodificeerde sprite, ipv niets") that sits UNDER the WebGL layer which relights the same tiles. It
// used to carry no day/night darken at all, on the assumption that the shader on top covers it exactly.
// It does not, quite: this canvas is CSS-scaled by the browser (fractional 'left', 'imageRendering:
// pixelated') while the WebGL quads snap their four edges to whole DEVICE px (ForegroundFoliageLayer,
// §364 r2), and on a fractional dpr — Windows 125% / 150% display scaling — those two roundings
// disagree by up to a device pixel. A sliver of THIS canvas then shows along a silhouette, in full
// daylight colour, next to neighbours the shader has darkened: a bright edge pixel that appears not to
// react to the lighting at all. Baking the same multiply the shader applies makes such a sliver
// invisible instead of glaring, WITHOUT giving up the fallback (hiding this canvas once the shader is
// live would re-open the "toon dan niets" bug). Reuses BgLayer's exact darken bake above — multiply,
// then 'destination-in' re-clip to the tile silhouette so transparent sky does not pick up the tint
// (CLAUDE.md §6d). 'darkenColor' is already quantised to 0.05 steps by RpgLevelPanel, so a full-night
// crossfade costs ~13 re-bakes, not one per frame.
const GroundCanvas = React.memo(function GroundCanvas({ tiles, gridSize, leftPx, zoom, groundAnchor, darkenColor = null }) {
    const canvasRef = useRef(null);
    const srcRef = useRef(null);        // tiles-only, composited once
    const [gen, setGen] = useState(0);  // bumped when src is (re)built

    useEffect(() => {
        let cancelled = false;
        srcRef.current = null;
        setGen((g) => g + 1);
        if (tiles.length === 0) return undefined;
        loadTileImages(tiles).then((imgByUrl) => {
            if (cancelled) return;
            const src = document.createElement('canvas');
            src.width = LEVEL_PX_WIDTH; src.height = LEVEL_PX_HEIGHT;
            drawTilesToCanvas(src.getContext('2d'), tiles, gridSize, imgByUrl);
            srcRef.current = src;
            setGen((g) => g + 1);
        });
        return () => { cancelled = true; };
    }, [tiles, gridSize]);

    // Re-bake the shown canvas only when its pixels actually change (a new src, or a new quantised
    // darken step) — never per animation frame.
    useEffect(() => {
        const canvas = canvasRef.current, src = srcRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!src) return;
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
    }, [gen, darkenColor]);

    return (
        <canvas
            ref={canvasRef}
            width={LEVEL_PX_WIDTH}
            height={LEVEL_PX_HEIGHT}
            style={layerStyle(leftPx, zoom, groundAnchor, { opacity: srcRef.current ? 1 : 0 })}
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
// Perf (#1162 Fase 1 → #1196 F1, Han 2026-08-27 / 2026-09-05): `groundScrollRef`/`groundLeftPx` scroll
// the ground plane (factor 1) imperatively via a wrapper `<div>` transform. F1 extends the SAME imperative
// treatment to the `backgroundLayers` (each `BgLayer` runs its own `useFrameLoop`, reading `cameraXRef`
// live and applying its own parallax `factor`) — so `leftPxForFactor` is gone entirely and NOTHING here
// reads a camera value at render time. `bgLeftPx` is the camera-independent left edge every `BgLayer`
// shares (`= groundLeftPx` for factor-1 space); per-layer parallax comes purely from each `BgLayer`'s
// wrapper transform.
function LdtkScenery({
    groundTiles, backgroundLayers = [], gridSize, groundScrollRef, groundLeftPx,
    zoom, groundAnchor, bgDarkenColor = null, bgRimOpacity = 0,
    // Perf (#1196, F1): the live camera ref + the shared camera-independent left edge, threaded to every
    // `BgLayer` for its own per-frame parallax transform.
    cameraXRef, bgLeftPx = 0,
    // §377 (#1193): the sun edge-glow's parallax-bg terms. Scalars + a css string only, so `BgLayer`'s
    // React.memo still holds (an array prop would break it on every render).
    bgSunRimOpacity = 0, bgSunLeftPx = 0, bgSunBottomPx = 0, bgSunRimColor = '#fff', bgSunRadiusScale = 1,
}) {
    return (
        <>
            {/* #weather §362 r3 had ONE sky-darken multiply div here to darken the two static sky
                elements (CSS gradient + bgLayer5 img) painted behind LdtkScenery. §372 replaced those two
                with <SkyGradientBackdrop>, which bakes its OWN night mix in — a second multiply on top of
                that was the #26 "achtergrond verdwijnt" double-darken, so this div is GONE. `bgDarkenColor`
                is still consumed below: each parallax BgLayer bakes it into its own canvas (clipped to
                the tile silhouette), and since §387 the ground/shimmer fallback `GroundCanvas` bakes the
                same multiply for the same reason — see its own header comment. */}
            {/* #weather §370 r3: each background parallax layer = ONE canvas with its darken + moon rim
                baked in, so it z-orders naturally against the other layers (and the sky stays visible —
                the isolated-wrapper version made every layer's transparent sky region a solid blue veil). */}
            {backgroundLayers.map(({ factor, tiles }, i) => (
                <BgLayer
                    key={`bg-${i}`} tiles={tiles} gridSize={gridSize}
                    factor={factor} cameraXRef={cameraXRef} bgLeftPx={bgLeftPx}
                    zoom={zoom} groundAnchor={groundAnchor}
                    darkenColor={bgDarkenColor} rimOpacity={bgRimOpacity}
                    sunRimOpacity={bgSunRimOpacity} sunLeftPx={bgSunLeftPx}
                    sunBottomPx={bgSunBottomPx} sunRimColor={bgSunRimColor} sunRadiusScale={bgSunRadiusScale}
                />
            ))}
            <div ref={groundScrollRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <GroundCanvas tiles={groundTiles} gridSize={gridSize} leftPx={groundLeftPx} zoom={zoom} groundAnchor={groundAnchor} darkenColor={bgDarkenColor} />
            </div>
        </>
    );
}

// Perf (#1161/#1162 → #1196 F1, Han 2026-08-27 / 2026-09-05): this canvas-compositing layer doesn't
// depend on `petFrame`/other idle-animation state — the memo boundary keeps it from re-rendering on
// every `petFrame` tick. Since F1, EVERY prop it takes (`groundTiles`/`backgroundLayers`/`gridSize`/
// `groundLeftPx`/`bgLeftPx`/`cameraXRef`/`zoom`/the quantised bg-sun scalars) is stable while only the
// camera pans — `leftPxForFactor` is gone; the ground `GroundCanvas` scrolls via `groundScrollRef` and
// each `BgLayer` scrolls via its own `useFrameLoop` — so this component's body does NOT re-run on a
// panning frame at all.
export default React.memo(LdtkScenery);
