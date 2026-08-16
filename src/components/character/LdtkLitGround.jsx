import React, { useEffect, useRef } from 'react';
import logger from '../../utils/logger';
import { LIGHT_UNIFORMS_GLSL, LIGHTING_PARAM_UNIFORMS_GLSL, LIGHTING_FUNCTIONS_GLSL, MAX_LIGHTS } from './foliageLightingGLSL';

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

${LIGHT_UNIFORMS_GLSL}
${LIGHTING_PARAM_UNIFORMS_GLSL}
${LIGHTING_FUNCTIONS_GLSL}

void main() {
    // No vUV varying anywhere in this shader — gl_FragCoord is an exact, stable per-fragment window
    // coordinate (unlike an interpolated varying), and this quad already covers the WHOLE canvas, so
    // there's no benefit to routing through a varying only to reconstruct the same value less precisely
    // (the same reasoning #141 round 20/the #925 Y-axis fix applied to ForegroundFoliageLayer.jsx).
    vec2 screenPx = vec2(gl_FragCoord.x, uCanvasSize.y - gl_FragCoord.y);
    float localX = (screenPx.x - uLevelLeftPx) / uZoom;
    float localY = (screenPx.y - uCanvasBottomScreenY) / uZoom + uLevelPxHeight;
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
    vec2 texelSize = vec2(1.0 / uLevelPxWidth, 1.0 / uLevelPxHeight);
    float edgeFactor = edgeLightFactor(uDiffuse, uv, texelSize);

    // Same coordinate convention ForegroundFoliageLayer.jsx's instances already use for worldX
    // (canvas-local to the stitched multi-level strip, NOT LDtk's absolute world coords) and groundDist
    // (height above the level's own ground line, 0 at the bottom) — the lights prop's worldX values are
    // already expressed in this same space today, so this stays consistent with the existing, working
    // shimmer lighting rather than introducing a second coordinate convention.
    float worldX = localX;
    float groundDist = uLevelPxHeight - localY;

    if (uDebugChannel == 2) {
        vec3 glowOnly = applyPointLights(diffuse.rgb, vec3(0.0), n, worldX, groundDist, edgeFactor);
        gl_FragColor = vec4(glowOnly, 1.0);
        return;
    }

    vec3 trueColor = diffuse.rgb;
    vec3 ambientTint = mix(AMBIENT_DARK_COLOR, vec3(1.0), uGlobalIllumination);
    vec3 darkened = trueColor * ambientTint;
    vec3 lit = applyPointLights(trueColor, darkened, n, worldX, groundDist, edgeFactor);
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
// LdtkScenery's own `leftPxForFactor`/`groundAnchor` convention exactly. `edgeLitOnly`: true for the
// front-of-entities bucket (Han: rand-belichting op 2px, zie EDGE_LIGHT_PIXELS), false for back-of-
// entities (full lighting).
export default function LdtkLitGround({
    widthPx, heightPx, textures, levelPxWidth, levelPxHeight, leftPx, canvasBottomScreenY, zoom,
    lights = [], params, edgeLitOnly, debugChannel = 0,
}) {
    const canvasRef = useRef(null);
    const textureIds = useRef({ diffuse: null, normal: null });
    const glRef = useRef(null);
    const uniformsRef = useRef(null);
    const liveRef = useRef({});
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
            uEdgeLitOnly: gl.getUniformLocation(program, 'uEdgeLitOnly'),
            uDebugChannel: gl.getUniformLocation(program, 'uDebugChannel'),
        };
        glRef.current = gl;

        const lightWorldXBuf = new Float32Array(MAX_LIGHTS);
        const lightWorldHeightBuf = new Float32Array(MAX_LIGHTS);
        const lightColorBuf = new Float32Array(MAX_LIGHTS * 3);
        const dpr = window.devicePixelRatio || 1;

        let raf;
        let cancelled = false;
        const draw = () => {
            if (cancelled) return;
            try {
                drawFrame();
            } catch (err) {
                logger.error('LdtkLitGround', 'E031-LDTK-LIT-GROUND-DRAW-FRAME', err);
            } finally {
                if (!cancelled) raf = requestAnimationFrame(draw);
            }
        };
        const drawFrame = () => {
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clear(gl.COLOR_BUFFER_BIT);
            const ids = textureIds.current;
            if (!ids.diffuse || !ids.normal) return;
            const { leftPx: lp, canvasBottomScreenY: cb, zoom: z, levelPxWidth: lw, levelPxHeight: lh, lights: ls, params: p, edgeLitOnly: elo, debugChannel: dc } = liveRef.current;
            if (!p || !lw || !lh) return;
            const u = uniformsRef.current;

            gl.useProgram(program);
            gl.uniform2f(u.uCanvasSize, canvas.width, canvas.height);
            gl.uniform1f(u.uLevelLeftPx, lp * dpr);
            gl.uniform1f(u.uCanvasBottomScreenY, cb * dpr);
            gl.uniform1f(u.uZoom, z * dpr);
            gl.uniform1f(u.uLevelPxWidth, lw);
            gl.uniform1f(u.uLevelPxHeight, lh);
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

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, ids.diffuse);
            gl.uniform1i(u.uDiffuse, 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, ids.normal);
            gl.uniform1i(u.uNormal, 1);

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        raf = requestAnimationFrame(draw);

        return () => {
            cancelled = true;
            if (raf) cancelAnimationFrame(raf);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- gl setup runs once; everything else reads live via liveRef/textureIds
    }, []);

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
