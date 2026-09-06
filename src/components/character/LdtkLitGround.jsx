import React, { useEffect, useRef } from 'react';
import logger from '../../utils/logger';
import useFrameLoop from '../../hooks/useFrameLoop';
import { LIGHT_UNIFORMS_GLSL, LIGHTING_PARAM_UNIFORMS_GLSL, LIGHTING_FUNCTIONS_GLSL, WORLD_MASK_UNIFORMS_GLSL, MAX_LIGHTS } from './foliageLightingGLSL';
// §377: the sun's own yellow — the upload fallback for a caller that does not drive the sun-glow
// channels. Imported, never retyped (CLAUDE.md §6c).
import { SUN_GLOW_RGB } from './celestialModel';
// §387 (#1222): the world-silhouette mask's own GPU upload convention lives with the mask itself.
import { createWorldMaskTexture } from './useWorldSilhouetteMask';

// #925 follow-up (Han 2026-08-16, "alle lagen behalve achtergrond moeten normal map krijgen en reageren
// op licht"): a SECOND, lightweight WebGL layer (own canvas/context, same ~8-16-context budget reasoning
// as ForegroundFoliageLayer.jsx's own header comment) for the static ground/terrain/building/decor tiles
// LdtkScenery.jsx used to render as a flat, unlit Canvas2D composite. Deliberately NOT the same per-
// instance approach foliage/water use (one gl.drawArrays call per tile): this layer can carry THOUSANDS
// of tiles (a single level's Bg_pine alone has ~1400), and per-tile draw calls at that scale would repeat
// the exact perf problem viewport culling was built to solve for foliage — worse, since terrain fills the
// whole visible screen instead of scattering sparsely. Instead: `useLdtkLitGroundTextures.js` composites
// the WHOLE tile bucket into one diffuse + one normal-map texture ONCE (like LdtkScenery already did for
// diffuse), and this component draws exactly ONE full-viewport quad per frame that samples a UV WINDOW
// sliding with the camera — cost scales with SCREEN pixels, not tile count, regardless of level size.
// Chunking the source textures (for worlds too big for one texture) is explicitly deferred to #1022 (Han,
// 2026-08-16: "ik denk er sowieso aan om met chunks te gaan werken voor parallax etc.").
//
// Reuses the SAME lighting GLSL (foliageLightingGLSL.js) and the SAME `foliageParams` debug dials as
// ForegroundFoliageLayer — ONE set of lighting knobs in the debug panel, not two (CLAUDE.md §6d).

// Perf (#1196, F1): a stable `{ current: 0 }` fallback so a caller that never drives a camera pan can
// omit `cameraOffsetRef` and get the pre-F1 behaviour (offset always 0). Mirrors
// `ForegroundFoliageLayer.jsx`'s own `ZERO_OFFSET_REF`.
const ZERO_OFFSET_REF = { current: 0 };

const VERTEX_SRC = `
attribute vec2 aPos;
void main() {
    gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAGMENT_SRC = `
precision mediump float;
uniform sampler2D uDiffuse;
uniform sampler2D uNormal;
uniform highp vec2 uCanvasSize;
// Screen px (canvas-space, top-down, matching every other "px" convention in this codebase) where the
// composited level texture's local (0,0) top-left / (0, uLevelPxHeight) bottom-left corners project to —
// recomputed every frame from the caller's own worldToScreenX/zoom/camera, exactly mirroring how
// LdtkScenery.jsx positions its own <canvas> via CSS left/bottom.
uniform highp float uLevelLeftPx;
uniform highp float uCanvasBottomScreenY;
uniform float uZoom;
uniform float uLevelPxWidth;
uniform float uLevelPxHeight;
// #925 follow-up (Han 2026-08-16, "achtergrond [back-of-entities: gebouwen/decor] toont geen licht,
// voorgrond wel"): debug view mirroring ForegroundFoliageLayer's own uDebugChannel, so the SAME cycling
// button/label in the debug panel works here too — 0 final lit, 1 raw normal map (confirms Sobel
// generation succeeded), 2 light contribution ONLY on a black base (confirms applyPointLights produces
// anything at all for this bucket), 3 disabled (shows the flat LdtkScenery fallback underneath, for
// comparison).
uniform int uDebugChannel;
// Perf (#1162, Fase 10b): declared locally now, not via the shared LIGHTING_PARAM_UNIFORMS_GLSL block —
// edgeLightFactor (foliageLightingGLSL.js) takes this as an explicit parameter instead of reading a
// shared global by name, since ForegroundFoliageLayer's instanced shader needs a per-instance varying
// float version that can't share one declaration with this plain per-draw-call uniform int (see that
// file's own comment). This layer's own value/behavior is unchanged.
uniform int uEdgeLitOnly;

${LIGHT_UNIFORMS_GLSL}
${LIGHTING_PARAM_UNIFORMS_GLSL}
${WORLD_MASK_UNIFORMS_GLSL}
${LIGHTING_FUNCTIONS_GLSL}

void main() {
    // No vUV varying anywhere in this shader — gl_FragCoord is an exact, stable per-fragment window
    // coordinate (unlike an interpolated varying), and this quad already covers the WHOLE canvas, so
    // there's no benefit to routing through a varying only to reconstruct the same value less precisely
    // (the same reasoning #141 round 20/the #925 Y-axis fix applied to ForegroundFoliageLayer.jsx).
    // §387: highp on all three — these feed the level-space world-mask lookup, where mediump's 2^-10
    // relative precision would be several px of error at LEVEL_PX_WIDTH. See WORLD_MASK_UNIFORMS_GLSL.
    highp vec2 screenPx = vec2(gl_FragCoord.x, uCanvasSize.y - gl_FragCoord.y);
    highp float localX = (screenPx.x - uLevelLeftPx) / uZoom;
    highp float localY = (screenPx.y - uCanvasBottomScreenY) / uZoom + uLevelPxHeight;
    if (localX < 0.0 || localX >= uLevelPxWidth || localY < 0.0 || localY >= uLevelPxHeight) discard;

    if (uDebugChannel == 3) discard;

    vec2 uv = vec2(localX / uLevelPxWidth, localY / uLevelPxHeight);
    vec4 diffuse = texture2D(uDiffuse, uv);
    if (diffuse.a < 0.01) discard;

    if (uDebugChannel == 1) {
        gl_FragColor = vec4(texture2D(uNormal, uv).rgb, 1.0);
        return;
    }

    vec3 sampledNormal = normalize(texture2D(uNormal, uv).rgb * 2.0 - 1.0);
    vec3 n = normalize(mix(FLAT_NORMAL, sampledNormal, uNormalStrength));
    // §387 (#1222): this fragment's position in LEVEL px — the coordinate every edge term now shares.
    // This layer already had it (localX/localY above); no new varying, no new uniform, no extra math.
    highp vec2 levelPx = vec2(localX, localY);
    float edgeFactor = worldEdgeLightFactor(levelPx, float(uEdgeLitOnly));

    // Same coordinate convention ForegroundFoliageLayer.jsx's instances already use for worldX
    // (canvas-local to the stitched multi-level strip, NOT LDtk's absolute world coords) and groundDist
    // (height above the level's own ground line, 0 at the bottom) — the lights prop's worldX values are
    // already expressed in this same space today, so this stays consistent with the existing, working
    // shimmer lighting rather than introducing a second coordinate convention.
    float worldX = localX;
    float groundDist = uLevelPxHeight - localY;

    if (uDebugChannel == 2) {
        // #925 diagnostic (Han: "ik zie geen gloed" on the back-of-entities layer only): raw falloff
        // visualization instead of the final blended glow, to pinpoint WHICH term is zero — red = X-axis
        // closeness to the nearest active light, green = Y-axis (height) closeness, blue = worldX/2000
        // (a coarse position sanity check — should visibly shift as the camera pans if worldX is sane).
        float dbgFalloffX = 0.0;
        float dbgFalloffY = 0.0;
        for (int i = 0; i < MAX_LIGHTS; i++) {
            if (i >= uLightCount) break;
            float fx = clamp(1.0 - abs(worldX - uLightWorldX[i]) / uLightRadius, 0.0, 1.0);
            float fy = clamp(1.0 - abs(groundDist - uLightWorldHeight[i]) / uLightHeightRadius, 0.0, 1.0);
            dbgFalloffX = max(dbgFalloffX, fx);
            dbgFalloffY = max(dbgFalloffY, fy);
        }
        gl_FragColor = vec4(dbgFalloffX, dbgFalloffY, worldX / 2000.0, 1.0);
        return;
    }

    vec3 trueColor = diffuse.rgb;
    vec3 ambientTint = mix(AMBIENT_DARK_COLOR, vec3(1.0), uGlobalIllumination);
    vec3 darkened = trueColor * ambientTint;
    vec3 lit = applyPointLights(trueColor, darkened, n, worldX, groundDist, edgeFactor);
    // #weather §370: top-left moon rim on the ground/building/decor silhouettes. §387: against the WORLD
    // mask, not this pass's own composite — this level interleaves SIX ground passes with five shimmer
    // passes, so a wall in one pass and the terrain in another used to be separate silhouettes whose
    // contact line rimmed as if it were open sky. Now every pass reads the same union.
    float moonRim = worldRimFactor(levelPx);
    // §387 (#1222) debug channel 4, 'Edge mask' — see ForegroundFoliageLayer's identical block for what
    // the three channels mean. Same view on both lighting layers, so a seam that crosses from a building
    // into a tree is legible as one picture.
    if (uDebugChannel == 4) {
        gl_FragColor = vec4(moonRim, worldInwardGlow(levelPx), worldMaskAt(levelPx) * 0.3, 1.0);
        return;
    }
    lit = applyMoonLight(lit, diffuse.rgb, n, edgeFactor, moonRim);   // #weather §362/§370 — moon sheen + rim
    // §377 (#1193): the sun edge-glow on roof ridges / decor outlines ("zon vlak over daken"). Reuses
    // the 'screenPx' local computed at the top of main() — the SAME top-down canvas-px value the sun
    // mask needs — divided by the canvas WIDTH on both axes (isotropic, dpr-free). No recomputation.
    lit = applySunGlow(lit, diffuse.rgb, edgeFactor, moonRim, levelPx, screenPx / uCanvasSize.x);   // §377 / §387
    gl_FragColor = vec4(lit, diffuse.a);
}
`;

function compileShader(gl, type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(info);
    }
    return shader;
}

function createProgram(gl) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
}

function createTextureFromCanvas(gl, canvas) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}

// `textures`: `{ diffuseCanvas, normalCanvas }` from useLdtkLitGroundTextures.js (null while still
// compositing — this component renders nothing until then, same "brief flash while loading" pattern used
// everywhere else in this level). `levelPxWidth/levelPxHeight`: the composited textures' own native size
// (LEVEL_PX_WIDTH/LEVEL_PX_HEIGHT). `leftPx`/`canvasBottomScreenY`/`zoom`: screen-space placement, mirrors
// LdtkScenery's own `groundLeftPx`/`groundAnchor` convention exactly. `edgeLitOnly`: true for the
// front-of-entities bucket (Han: rand-belichting op 2px, zie EDGE_LIGHT_PIXELS), false for back-of-
// entities (full lighting).
//
// Perf (#1196, F1, Han 2026-09-05): `leftPx` is now the CAMERA-INDEPENDENT ground-plane left edge
// (`groundLeftPxLocal`), stable while only the camera pans — the live pan offset arrives every frame
// through `cameraOffsetRef` (the SAME snapped-device-px ref `RpgLevelPanel`'s camera `useFrameLoop`
// already feeds `ForegroundFoliageLayer`, §322/§331) and is added to `leftPx` inside `drawFrame` right
// before the `uLevelLeftPx` uniform upload. Before F1 this component "needed no change" only because
// `RpgLevelPanel` re-rendered every panning frame and re-fed `leftPx` through `liveRef`; F1 removes that
// re-render, so the offset must come through a ref instead. `ZERO_OFFSET_REF` keeps any caller that
// doesn't drive a camera (none today) working unchanged.
function LdtkLitGround({
    widthPx, heightPx, textures, levelPxWidth, levelPxHeight, leftPx, canvasBottomScreenY, zoom,
    lights = [], params, edgeLitOnly, debugChannel = 0, cameraOffsetRef = ZERO_OFFSET_REF,
    // §387 (#1222): the level-sized world silhouette every edge/rim/glow term tests against
    // (useWorldSilhouetteMask). `null` while it is still compositing — handled by createWorldMaskTexture's
    // 1x1 opaque placeholder, which reports "no edges" rather than outlining the world at random.
    worldMask = null,
}) {
    const canvasRef = useRef(null);
    const textureIds = useRef({ diffuse: null, normal: null });
    const worldMaskTexRef = useRef(null);
    const glRef = useRef(null);
    const uniformsRef = useRef(null);
    const liveRef = useRef({});
    const loggedOnceRef = useRef(false);
    // Perf (#1162, Fase 9, docs/architecture.md §331): holds the current `drawFrame` closure so the
    // separate `useFrameLoop` subscription below (which must live at the component's top level, not
    // nested inside the GL-setup effect) can call into it without needing every local GL variable
    // (gl/program/uniform locations/buffers) hoisted out to its own ref.
    const drawFrameRef = useRef(null);
    liveRef.current = { leftPx, canvasBottomScreenY, zoom, levelPxWidth, levelPxHeight, lights, params, edgeLitOnly, debugChannel };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(widthPx * dpr);
        canvas.height = Math.round(heightPx * dpr);
    }, [widthPx, heightPx]);

    // GL context/program setup runs once (mirrors ForegroundFoliageLayer.jsx's own StrictMode-safe
    // reasoning — never torn down on a mere prop change, only on unmount).
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
        if (!gl) {
            logger.warn('LdtkLitGround', 'WebGL unavailable — ground/building lighting disabled');
            return undefined;
        }
        let program;
        try {
            program = createProgram(gl);
        } catch (err) {
            logger.error('LdtkLitGround', 'E030-LDTK-LIT-GROUND-SHADER-COMPILE', err);
            return undefined;
        }
        gl.useProgram(program);

        const aPos = gl.getAttribLocation(program, 'aPos');
        const quadBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        uniformsRef.current = {
            uDiffuse: gl.getUniformLocation(program, 'uDiffuse'),
            uNormal: gl.getUniformLocation(program, 'uNormal'),
            uCanvasSize: gl.getUniformLocation(program, 'uCanvasSize'),
            uLevelLeftPx: gl.getUniformLocation(program, 'uLevelLeftPx'),
            uCanvasBottomScreenY: gl.getUniformLocation(program, 'uCanvasBottomScreenY'),
            uZoom: gl.getUniformLocation(program, 'uZoom'),
            uLevelPxWidth: gl.getUniformLocation(program, 'uLevelPxWidth'),
            uLevelPxHeight: gl.getUniformLocation(program, 'uLevelPxHeight'),
            uLightCount: gl.getUniformLocation(program, 'uLightCount'),
            uLightWorldX: gl.getUniformLocation(program, 'uLightWorldX'),
            uLightWorldHeight: gl.getUniformLocation(program, 'uLightWorldHeight'),
            uLightColor: gl.getUniformLocation(program, 'uLightColor'),
            uLightRadius: gl.getUniformLocation(program, 'uLightRadius'),
            uLightHeightRadius: gl.getUniformLocation(program, 'uLightHeightRadius'),
            uLightStrength: gl.getUniformLocation(program, 'uLightStrength'),
            uHuePull: gl.getUniformLocation(program, 'uHuePull'),
            uLightBlendMode: gl.getUniformLocation(program, 'uLightBlendMode'),
            uLightBlendMode2: gl.getUniformLocation(program, 'uLightBlendMode2'),
            uGlobalIllumination: gl.getUniformLocation(program, 'uGlobalIllumination'),
            uNormalStrength: gl.getUniformLocation(program, 'uNormalStrength'),
            uFlatIllumination: gl.getUniformLocation(program, 'uFlatIllumination'),
            uMoonStrength: gl.getUniformLocation(program, 'uMoonStrength'),   // #weather §362
            // §377 (#1193) — the sun edge-glow. The `nullUniforms` link-time warning below covers
            // these automatically too.
            uSunGlowStrength: gl.getUniformLocation(program, 'uSunGlowStrength'),
            uSunGlowColor: gl.getUniformLocation(program, 'uSunGlowColor'),
            uSunScreenPos: gl.getUniformLocation(program, 'uSunScreenPos'),
            uSunGlowRadius: gl.getUniformLocation(program, 'uSunGlowRadius'),
            uEdgeLitOnly: gl.getUniformLocation(program, 'uEdgeLitOnly'),
            uDebugChannel: gl.getUniformLocation(program, 'uDebugChannel'),
            // §387 (#1222)
            uWorldMask: gl.getUniformLocation(program, 'uWorldMask'),
            uWorldMaskSize: gl.getUniformLocation(program, 'uWorldMaskSize'),
        };
        // #925 diagnostic (Han: point-light params like flat illumination/hue-pull have no visible
        // effect on this layer even in the real final view, channel 0): a null uniform location means the
        // GLSL linker stripped that uniform (e.g. dead-code-eliminated) and every gl.uniformXf() call on
        // it below silently no-ops — this would exactly explain "the slider does nothing." Logged once, at
        // link time, not per-frame.
        const nullUniforms = Object.entries(uniformsRef.current).filter(([, loc]) => loc === null).map(([name]) => name);
        if (nullUniforms.length > 0) {
            logger.warn('LdtkLitGround', 'uniform locations resolved to null (possibly stripped by the GLSL linker)', { nullUniforms });
        }
        glRef.current = gl;

        const lightWorldXBuf = new Float32Array(MAX_LIGHTS);
        const lightWorldHeightBuf = new Float32Array(MAX_LIGHTS);
        const lightColorBuf = new Float32Array(MAX_LIGHTS * 3);
        const dpr = window.devicePixelRatio || 1;

        const drawFrame = () => {
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clear(gl.COLOR_BUFFER_BIT);
            const ids = textureIds.current;
            if (!ids.diffuse || !ids.normal) return;
            const { leftPx: lpBase, canvasBottomScreenY: cb, zoom: z, levelPxWidth: lw, levelPxHeight: lh, lights: ls, params: p, edgeLitOnly: elo, debugChannel: dc } = liveRef.current;
            if (!p || !lw || !lh) return;
            // Perf (#1196, F1): `lpBase` is the camera-INDEPENDENT ground left edge; the live pan offset
            // (already snapped to whole device px by the camera loop, same value ForegroundFoliageLayer
            // reads) is added here every frame so panning never needs a React re-render to move this layer.
            const lp = lpBase + cameraOffsetRef.current;
            const u = uniformsRef.current;

            gl.useProgram(program);
            gl.uniform2f(u.uCanvasSize, canvas.width, canvas.height);
            gl.uniform1f(u.uLevelLeftPx, lp * dpr);
            gl.uniform1f(u.uCanvasBottomScreenY, cb * dpr);
            gl.uniform1f(u.uZoom, z * dpr);
            gl.uniform1f(u.uLevelPxWidth, lw);
            gl.uniform1f(u.uLevelPxHeight, lh);
            // §387: ALWAYS the real level extent, even while the 1x1 placeholder texture is bound — the
            // shader's out-of-bounds test and its levelPx/size normalisation both need the true extent,
            // and a 1x1 texture sampled anywhere in range simply returns "solid".
            gl.uniform2f(u.uWorldMaskSize, lw, lh);
            gl.uniform1i(u.uEdgeLitOnly, elo ? 1 : 0);
            gl.uniform1i(u.uDebugChannel, dc);

            const activeLights = ls.slice(0, MAX_LIGHTS);
            activeLights.forEach((light, i) => {
                lightWorldXBuf[i] = light.worldX;
                lightWorldHeightBuf[i] = light.worldHeight || 0;
                lightColorBuf[i * 3] = light.color[0];
                lightColorBuf[i * 3 + 1] = light.color[1];
                lightColorBuf[i * 3 + 2] = light.color[2];
            });
            gl.uniform1i(u.uLightCount, activeLights.length);
            gl.uniform1fv(u.uLightWorldX, lightWorldXBuf);
            gl.uniform1fv(u.uLightWorldHeight, lightWorldHeightBuf);
            // #925 diagnostic (Han: flat illumination/hue-pull have no effect even in the real final
            // view): logged ONCE (not per-frame) so Han can paste the actual runtime values — the
            // possible-range of worldX this layer computes (from screen x=0 and x=canvas.width) vs. the
            // light's own worldX tells us directly whether they're even in the same coordinate space.
            if (!loggedOnceRef.current) {
                loggedOnceRef.current = true;
                const worldXAtScreen0 = (0 - lp * dpr) / (z * dpr);
                const worldXAtScreenMax = (canvas.width - lp * dpr) / (z * dpr);
                // Plain string, not a nested object — avoids Chrome's collapsed "(2) [{…}, {…}]" object
                // preview that isn't visible in a copy/pasted or exported console log.
                const lightsSummary = activeLights.map((l, i) => `#${i} worldX=${l.worldX?.toFixed(1)} worldHeight=${l.worldHeight}`).join(' | ');
                logger.debug('LdtkLitGround', `diagnostic: edgeLitOnly=${elo} worldXRangeOnScreen=[${worldXAtScreen0.toFixed(1)}, ${worldXAtScreenMax.toFixed(1)}] lightRadius=${p.lightRadius} lightHeightRadius=${p.lightHeightRadius} lights: ${lightsSummary}`);
            }
            gl.uniform3fv(u.uLightColor, lightColorBuf);

            gl.uniform1f(u.uLightRadius, p.lightRadius);
            gl.uniform1f(u.uLightHeightRadius, p.lightHeightRadius);
            gl.uniform1f(u.uLightStrength, p.lightStrength);
            gl.uniform1f(u.uHuePull, p.huePull);
            gl.uniform1i(u.uLightBlendMode, p.lightBlendMode);
            gl.uniform1i(u.uLightBlendMode2, p.lightBlendMode2);
            gl.uniform1f(u.uGlobalIllumination, p.globalIllumination);
            gl.uniform1f(u.uNormalStrength, p.normalStrength);
            gl.uniform1f(u.uFlatIllumination, p.flatIllumination);
            // §374 UAT r2 (#1191): premultiply by the real moon's shine (0 when it is down / new) so
            // §370's moonlight only shows when the moon is actually up and lit. `?? 1` = unchanged
            // for callers that don't supply it.
            gl.uniform1f(u.uMoonStrength, (p.moonStrength ?? 0.5) * (p.moonShine ?? 1));   // #weather §362 / §374
            // §377 (#1193): the sun edge-glow. Colour arrives 0..255 (app-wide RGB convention) and the
            // shader wants 0..1; the `??` fallbacks keep this a strict no-op for a caller that never
            // drives the channels (see the uniform block's own contract in foliageLightingGLSL.js).
            const sunPos = p.sunScreenPos ?? [0, 0];
            const sunCol = p.sunGlowColor ?? SUN_GLOW_RGB;
            gl.uniform1f(u.uSunGlowStrength, p.sunGlow ?? 0);
            gl.uniform3f(u.uSunGlowColor, sunCol[0] / 255, sunCol[1] / 255, sunCol[2] / 255);
            gl.uniform2f(u.uSunScreenPos, sunPos[0], sunPos[1]);
            gl.uniform1f(u.uSunGlowRadius, p.sunGlowRadius ?? 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, ids.diffuse);
            gl.uniform1i(u.uDiffuse, 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, ids.normal);
            gl.uniform1i(u.uNormal, 1);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, worldMaskTexRef.current);   // §387
            gl.uniform1i(u.uWorldMask, 2);

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        drawFrameRef.current = drawFrame;

        return () => {
            drawFrameRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- gl setup runs once; everything else reads live via liveRef/textureIds
    }, []);

    // Perf (#1162, Fase 9, docs/architecture.md §331): migrated onto the shared `useFrameLoop` ticker —
    // `drawFrame` is synchronous (no `await` inside), so unlike ForegroundFoliageLayer.jsx's own migration
    // this needs no in-flight guard; it can subscribe directly. The specific `E031-LDTK-LIT-GROUND-DRAW-
    // FRAME` error code is preserved here (rather than relying solely on useFrameLoop's own generic
    // catch-all) so a failure here still shows up as instantly identifiable in logs, matching every other
    // WebGL layer's per-component error code convention (CLAUDE.md §7a).
    useFrameLoop(() => {
        if (!drawFrameRef.current) return;
        try {
            drawFrameRef.current();
        } catch (err) {
            logger.error('LdtkLitGround', 'E031-LDTK-LIT-GROUND-DRAW-FRAME', err);
        }
    }, [], { priority: 'critical' });

    // §387 (#1222): the world mask, uploaded once per mask build (a world-config change) — separate from
    // the diffuse/normal effect below because it has its own, independent source and lifetime. The
    // placeholder branch runs on mount too, so the sampler is never left unbound.
    useEffect(() => {
        const gl = glRef.current;
        if (!gl) return undefined;
        const tex = createWorldMaskTexture(gl, worldMask);
        worldMaskTexRef.current = tex;
        return () => {
            gl.deleteTexture(tex);
            worldMaskTexRef.current = null;
        };
    }, [worldMask]);

    // Textures are re-uploaded only when the composited canvases themselves change (a new world config —
    // season/city/tier toggle) — NOT every frame, unlike the live uniform values above.
    useEffect(() => {
        const gl = glRef.current;
        if (!gl || !textures) return undefined;
        const diffuseTex = createTextureFromCanvas(gl, textures.diffuseCanvas);
        const normalTex = createTextureFromCanvas(gl, textures.normalCanvas);
        textureIds.current = { diffuse: diffuseTex, normal: normalTex };
        return () => {
            gl.deleteTexture(diffuseTex);
            gl.deleteTexture(normalTex);
            textureIds.current = { diffuse: null, normal: null };
        };
    }, [textures]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                pointerEvents: 'none',
            }}
        />
    );
}

// Perf (#1161, Han 2026-08-27): doesn't depend on `petFrame` — its own live-uniform values (leftPx/lights/
// params/etc.) already flow through `liveRef` for its internal draw loop, but the React render itself (and
// the `liveRef.current = {...}` assignment) still ran on every `petFrame` tick without this boundary. See
// LdtkScenery.jsx's own comment for the same reasoning and the `cameraX`-panning caveat.
export default React.memo(LdtkLitGround);
