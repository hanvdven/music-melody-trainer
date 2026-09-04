import React, { useEffect, useRef } from 'react';
import logger from '../../utils/logger';
import { LIGHT_UNIFORMS_GLSL, LIGHTING_PARAM_UNIFORMS_GLSL, LIGHTING_FUNCTIONS_GLSL, MAX_LIGHTS } from './foliageLightingGLSL';

// #1162 Fase 10b (Han 2026-08-27, docs/architecture.md §339): an ISOLATED, debug-only test surface for the
// new WebGL-instanced foliage draw path — the plan's own explicit step ("verify in isolation before wiring
// to real data") before this shader touches the real game rendering AT ALL. Draws a handful of hardcoded
// sample instances (from the REAL atlas built by useLdtkFoliageAtlas.js) into its OWN tiny WebGL context,
// completely separate from ForegroundFoliageLayer.jsx's live canvas. Once this proves the mechanism works
// (extension setup, per-instance attribute buffer, one instanced draw call reading from the shared atlas),
// the PROVEN shader source moves into ForegroundFoliageLayer.jsx itself for Fase 10c (wiring real instances,
// replacing the old per-instance uniform loop) — nothing here is meant to ship as a permanent code path.
//
// Per-instance data layout (5 vec4 attributes, matches the plan's design — packs the ~18 values that vary
// per instance in the OLD per-instance-uniform loop; everything that's actually a shared debug-panel dial
// (uSkewAmount/uStretchAmount/uWaveSteps/etc.) stays a plain per-draw-call uniform, unchanged, since those
// are already identical across every instance even in the old loop):
//   aInstance0 = (screenX, screenY, sizePxX, sizePxY)
//   aInstance1 = (diffuseU0, diffuseV0, diffuseU1, diffuseV1)   — the atlas UV rect
//   aInstance2 = (worldCenterX, worldWidth, worldHeight, groundDistOffset)
//   aInstance3 = (instanceKind, hasWave, hasSkew, edgeLitOnly)  — 0.0/1.0 floats, GLSL ES 1.00 varyings can't be int
//   aInstance4 = (whiteCapThreshold, whiteCapStrength, 0, 0)
const VERTEX_SRC_INSTANCED = `
attribute vec2 aPos;
attribute vec4 aInstance0;
attribute vec4 aInstance1;
attribute vec4 aInstance2;
attribute vec4 aInstance3;
attribute vec4 aInstance4;
uniform highp vec2 uCanvasSize;
varying vec2 vUV;
varying highp vec2 vScreenPos;
varying highp vec2 vSizePx;
varying vec4 vDiffuseUV;
varying float vWorldCenterX;
varying float vWorldWidth;
varying float vWorldHeight;
varying float vGroundDistOffset;
varying float vInstanceKind;
varying float vHasWave;
varying float vHasSkew;
varying float vEdgeLitOnly;
varying float vWhiteCapThreshold;
varying float vWhiteCapStrength;
void main() {
    vec2 screenPos = aInstance0.xy;
    vec2 sizePx = aInstance0.zw;
    vUV = vec2(aPos.x, 1.0 - aPos.y);
    vec2 px = screenPos + vec2((aPos.x - 0.5) * sizePx.x, -aPos.y * sizePx.y);
    vec2 clip = (px / uCanvasSize) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);

    vScreenPos = screenPos;
    vSizePx = sizePx;
    vDiffuseUV = aInstance1;
    vWorldCenterX = aInstance2.x;
    vWorldWidth = aInstance2.y;
    vWorldHeight = aInstance2.z;
    vGroundDistOffset = aInstance2.w;
    vInstanceKind = aInstance3.x;
    vHasWave = aInstance3.y;
    vHasSkew = aInstance3.z;
    vEdgeLitOnly = aInstance3.w;
    vWhiteCapThreshold = aInstance4.x;
    vWhiteCapStrength = aInstance4.y;
}
`;

// Fragment shader: line-for-line the SAME math as ForegroundFoliageLayer.jsx's existing FRAGMENT_SRC main()
// (#141's many tuning rounds — see that file for the full history of every constant/formula below), with
// ONLY the per-instance uniform reads (uScreenPos/uSizePx/uDiffuseUV/uWorldCenterX/uWorldWidth/uWorldHeight/
// uGroundDistOffset/uInstanceKind/uHasWave/uHasSkew/uWhiteCapThreshold/uWhiteCapStrength/uEdgeLitOnly)
// swapped for the varyings the vertex shader above now feeds. The int comparisons (`uInstanceKind == 0`
// etc.) become float threshold checks (`vInstanceKind < 0.5`) since varyings can't be int. gl_FragCoord-
// based derivation is intentionally UNCHANGED — see docs/architecture.md §339 for why that's still safe
// with per-instance varyings (they're bit-identical at all 4 quad corners, so GPU interpolation introduces
// no precision loss the way a genuinely-varying UV like vUV.x would).
const FRAGMENT_SRC_INSTANCED = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uDiffuse;
uniform sampler2D uNormal;
varying highp vec2 vScreenPos;
varying highp vec2 vSizePx;
uniform highp vec2 uCanvasSize;
uniform float uTime;
varying vec4 vDiffuseUV;
varying float vWorldCenterX;
varying float vWorldWidth;
varying float vWorldHeight;
varying float vGroundDistOffset;
uniform int uDebugChannel;
varying float vInstanceKind;
varying float vHasWave;
varying float vHasSkew;
varying float vEdgeLitOnly;
uniform float uSkewAmount;
uniform float uStretchAmount;
${LIGHT_UNIFORMS_GLSL}
uniform float uNoiseScale;
uniform float uWaveSpeed;
uniform float uNoiseScaleB;
uniform float uWaveSpeedB;
uniform float uWaveSteps;
uniform float uDitherAmount;
uniform float uHighlightStrength;
uniform int uWaveBlendMode;
uniform int uWaveBlendMode2;
${LIGHTING_PARAM_UNIFORMS_GLSL}
varying float vWhiteCapThreshold;
varying float vWhiteCapStrength;

const float GRAIN_CELL = 1.0;
const vec3 HIGHLIGHT_COLOR = vec3(1.0, 1.0, 0.95);

float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float blotchNoise(vec2 p) {
    return valueNoise(p) * 0.6 + valueNoise(p * 2.1 + 19.0) * 0.4;
}
float computeWave01(float worldX, float groundDist, float phaseOffset) {
    float wrappedX = mod(worldX + 10000.0, 4000.0);
    vec2 pA = vec2(wrappedX + phaseOffset, groundDist) * uNoiseScale;
    pA.x -= uTime * uWaveSpeed;
    float waveA = blotchNoise(pA);
    vec2 pB = vec2(wrappedX + phaseOffset, groundDist) * uNoiseScaleB + vec2(53.7, 91.3);
    pB.x += uTime * uWaveSpeedB;
    float waveB = blotchNoise(pB);
    return (waveA + waveB) * 0.5;
}
float quantizeWave(float wave01, float worldX, float groundDist) {
    float wrappedX = mod(worldX + 10000.0, 4000.0);
    vec2 grainCoord = floor(vec2(wrappedX, groundDist) / GRAIN_CELL);
    float grain = hash21(grainCoord) - 0.5;
    float waveDithered = clamp(wave01 + grain * uDitherAmount, 0.0, 1.0);
    return floor(waveDithered * uWaveSteps) / max(uWaveSteps - 1.0, 1.0);
}
${LIGHTING_FUNCTIONS_GLSL}
vec3 blendHighlight(vec3 base, vec3 tintColor, float waveQuant, float strengthScale, int mode) {
    float strength = waveQuant * strengthScale;
    if (mode == 0) return screenBlend(base, tintColor * strength);
    if (mode == 2) return clamp(base + tintColor * strength, 0.0, 1.0);
    if (mode == 3) return mix(base, tintColor, clamp(strength, 0.0, 1.0));
    if (mode == 1) {
        float swing = (waveQuant - 0.5) * 2.0 * strengthScale;
        vec3 hsv = rgb2hsv(base);
        hsv.z = clamp(hsv.z + swing, 0.0, 1.0);
        return hsv2rgb(hsv);
    }
    return mix(base, compositeBlend(base, tintColor, mode), clamp(strength, 0.0, 1.0));
}
vec3 blendHighlightDual(vec3 base, vec3 tintColor, float waveQuant, float strengthScale, int modeA, int modeB) {
    vec3 a = blendHighlight(base, tintColor, waveQuant, strengthScale, modeA);
    vec3 b = blendHighlight(base, tintColor, waveQuant, strengthScale, modeB);
    return mix(a, b, 0.5);
}

void main() {
    float localXPx = gl_FragCoord.x - (vScreenPos.x - vSizePx.x * 0.5);
    float pxPerNativeX = max(vSizePx.x / vWorldWidth, 0.0001);
    float nativeX = clamp(floor(localXPx / pxPerNativeX), 0.0, vWorldWidth - 1.0);
    float stableUVx = (nativeX + 0.5) / vWorldWidth;

    float worldX = vWorldCenterX + (stableUVx - 0.5) * vWorldWidth;

    float pxTopEdgeY = vScreenPos.y - vSizePx.y;
    float localYPx = (uCanvasSize.y - gl_FragCoord.y) - pxTopEdgeY;
    float pxPerNativeY = max(vSizePx.y / vWorldHeight, 0.0001);
    float nativeY = clamp(floor(localYPx / pxPerNativeY), 0.0, vWorldHeight - 1.0);
    float groundDist = vWorldHeight - (nativeY + 0.5) + vGroundDistOffset;
    vec2 texelSize = vec2((vDiffuseUV.z - vDiffuseUV.x) / vWorldWidth, (vDiffuseUV.w - vDiffuseUV.y) / vWorldHeight);

    bool wantsWave = uDebugChannel != 3 && (vHasWave > 0.5 || vHasSkew > 0.5);
    float wave01 = 0.0;
    if (wantsWave) wave01 = computeWave01(worldX, groundDist, 0.0);

    float skewShiftPx = 0.0;
    float stretchShiftPx = 0.0;
    if (vHasSkew > 0.5 && wantsWave) {
        const float SKEW_CONTRAST = 5.0;
        float sway = clamp((wave01 - 0.5) * SKEW_CONTRAST, -1.0, 1.0);
        float heightRatio = clamp(groundDist / vWorldHeight, 0.0, 1.0);
        skewShiftPx = floor(sway * heightRatio * heightRatio * uSkewAmount + 0.5);

        float offsetFromCenterPx = (stableUVx - 0.5) * vWorldWidth;
        float halfWidthPx = max(vWorldWidth * 0.5, 1.0);
        stretchShiftPx = floor((-offsetFromCenterPx / halfWidthPx) * sway * uStretchAmount + 0.5);
    }
    float totalShiftPx = skewShiftPx + stretchShiftPx;

    float shiftedNativeX = clamp(nativeX + totalShiftPx, 0.0, vWorldWidth - 1.0);
    vec2 duv = vec2(
        mix(vDiffuseUV.x, vDiffuseUV.z, (shiftedNativeX + 0.5) / vWorldWidth),
        mix(vDiffuseUV.y, vDiffuseUV.w, (nativeY + 0.5) / vWorldHeight)
    );
    vec2 normalUV = vec2(
        clamp((shiftedNativeX + 0.5) / vWorldWidth, 0.0, 1.0),
        clamp((nativeY + 0.5) / vWorldHeight, 0.0, 1.0)
    );

    vec4 diffuse = texture2D(uDiffuse, duv);
    if (vInstanceKind < 0.5 && diffuse.a < 0.5) discard;

    float edgeFactor = edgeLightFactor(uDiffuse, duv, texelSize, vEdgeLitOnly);

    if (uDebugChannel == 1) {
        gl_FragColor = vec4(texture2D(uNormal, normalUV).rgb, 1.0);
        return;
    }

    vec3 sampledNormal = normalize(texture2D(uNormal, normalUV).rgb * 2.0 - 1.0);
    vec3 n = (vInstanceKind > 0.5) ? FLAT_NORMAL : normalize(mix(FLAT_NORMAL, sampledNormal, uNormalStrength));

    vec3 trueColor = diffuse.rgb;
    if (vHasWave > 0.5 && wantsWave) {
        float waveQuant = quantizeWave(wave01, worldX, groundDist);
        if (uDebugChannel == 2) {
            gl_FragColor = vec4(vec3(waveQuant), 1.0);
            return;
        }
        vec3 ambientLight = normalize(vec3(0.0, 0.5, 0.8));
        float ambientNdotl = max(dot(n, ambientLight), 0.0);
        float ambientWeight = (vInstanceKind > 0.5) ? (0.6 + 0.4 * ambientNdotl) : (0.4 + 0.6 * ambientNdotl);
        float strengthScale = uHighlightStrength * ambientWeight;
        trueColor = blendHighlightDual(diffuse.rgb, HIGHLIGHT_COLOR, waveQuant, strengthScale, uWaveBlendMode, uWaveBlendMode2);

        if (waveQuant > vWhiteCapThreshold) {
            float capMix = clamp((waveQuant - vWhiteCapThreshold) / max(1.0 - vWhiteCapThreshold, 0.0001), 0.0, 1.0) * vWhiteCapStrength;
            trueColor = mix(trueColor, vec3(1.0), capMix);
        }
    } else if (uDebugChannel == 2) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec3 ambientTint = mix(AMBIENT_DARK_COLOR, vec3(1.0), uGlobalIllumination);
    vec3 darkened = trueColor * ambientTint;
    vec3 lit = applyPointLights(trueColor, darkened, n, worldX, groundDist, edgeFactor);
    float moonRim = moonRimFactor(uDiffuse, duv, texelSize, vDiffuseUV);   // #weather §370
    lit = applyMoonLight(lit, diffuse.rgb, n, edgeFactor, moonRim);   // #weather §362/§370
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
        throw new Error(info || 'shader compile failed');
    }
    return shader;
}

function createProgram(gl) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC_INSTANCED);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC_INSTANCED);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        throw new Error(info || 'program link failed');
    }
    return program;
}

function createTexture(gl, source) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}

const CANVAS_W = 320, CANVAS_H = 200;

// `atlas`: the same `{ diffuseCanvas, normalCanvas, uvByKey, gridSize }` shape `useLdtkFoliageAtlas.js`
// produces. Picks up to 3 distinct crops from `uvByKey` and draws them as instances via ONE instanced
// draw call, at a fixed test layout — purely a mechanism check (does instancing + the shared atlas
// actually draw the right pixels, lit correctly?), not a real-content preview.
export default function FoliageInstancingTest({ atlas, foliageParams, lights = [] }) {
    const canvasRef = useRef(null);
    const stateRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !atlas) return undefined;
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;
        const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
        if (!gl) { logger.warn('FoliageInstancingTest', 'WebGL unavailable'); return undefined; }
        const ext = gl.getExtension('ANGLE_instanced_arrays');
        if (!ext) { logger.warn('FoliageInstancingTest', 'ANGLE_instanced_arrays unavailable'); return undefined; }

        let program;
        try {
            program = createProgram(gl);
        } catch (err) {
            logger.error('FoliageInstancingTest', 'E021-FOLIAGE-SHADER-COMPILE', err);
            return undefined;
        }
        gl.useProgram(program);

        const aPos = gl.getAttribLocation(program, 'aPos');
        const quadBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        const instanceBuf = gl.createBuffer();
        const aInstanceLocs = [0, 1, 2, 3, 4].map((i) => gl.getAttribLocation(program, `aInstance${i}`));
        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
        const STRIDE = 20 * 4; // 5 vec4 * 4 bytes
        aInstanceLocs.forEach((loc, i) => {
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, STRIDE, i * 16);
            ext.vertexAttribDivisorANGLE(loc, 1);
        });

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const diffuseTex = createTexture(gl, atlas.diffuseCanvas);
        const normalTex = createTexture(gl, atlas.normalCanvas);

        const uniforms = {};
        ['uDiffuse', 'uNormal', 'uCanvasSize', 'uTime', 'uDebugChannel', 'uSkewAmount', 'uStretchAmount',
            'uLightCount', 'uLightWorldX', 'uLightWorldHeight', 'uLightColor',
            'uNoiseScale', 'uWaveSpeed', 'uNoiseScaleB', 'uWaveSpeedB', 'uWaveSteps', 'uDitherAmount',
            'uHighlightStrength', 'uWaveBlendMode', 'uWaveBlendMode2',
            'uLightRadius', 'uLightHeightRadius', 'uLightStrength', 'uHuePull', 'uLightBlendMode', 'uLightBlendMode2',
            'uGlobalIllumination', 'uNormalStrength', 'uFlatIllumination', 'uMoonStrength',
        ].forEach((name) => { uniforms[name] = gl.getUniformLocation(program, name); });

        stateRef.current = { gl, ext, program, instanceBuf, uniforms, diffuseTex, normalTex, startTime: performance.now() };

        return () => {
            gl.deleteTexture(diffuseTex);
            gl.deleteTexture(normalTex);
            stateRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- gl setup runs once per atlas identity
    }, [atlas]);

    useEffect(() => {
        const s = stateRef.current;
        if (!s || !atlas) return;
        const { gl, ext, uniforms } = s;
        const canvas = canvasRef.current;

        // Pick up to 3 distinct crops, laid out left-to-right, each a 64x64 CSS-px square (2x native
        // gridSize) so the test is easy to eyeball.
        const entries = [...atlas.uvByKey.entries()].slice(0, 3);
        const sizePx = atlas.gridSize * 2;
        const floatsPerInstance = 20;
        const data = new Float32Array(entries.length * floatsPerInstance);
        entries.forEach(([, uv], i) => {
            const off = i * floatsPerInstance;
            const screenX = 40 + i * (sizePx + 20);
            const screenY = CANVAS_H - 30;
            data.set([screenX, screenY, sizePx, sizePx], off);           // aInstance0
            data.set(uv, off + 4);                                       // aInstance1
            data.set([0, atlas.gridSize, atlas.gridSize, 0], off + 8);    // aInstance2
            data.set([0, 1, 0, 0], off + 12);                             // aInstance3: sprite, hasWave, no skew, no edge-lit-only
            data.set([1.0, 0.0, 0, 0], off + 16);                         // aInstance4: whiteCap threshold=1 (off), strength=0
        });

        gl.bindBuffer(gl.ARRAY_BUFFER, s.instanceBuf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.15, 0.15, 0.2, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(s.program);
        gl.uniform2f(uniforms.uCanvasSize, canvas.width, canvas.height);
        gl.uniform1f(uniforms.uTime, (performance.now() - s.startTime) / 1000);
        gl.uniform1i(uniforms.uDebugChannel, 0);
        gl.uniform1f(uniforms.uSkewAmount, foliageParams?.skewAmount ?? 0);
        gl.uniform1f(uniforms.uStretchAmount, foliageParams?.stretchAmount ?? 0);
        const activeLights = lights.slice(0, MAX_LIGHTS);
        gl.uniform1i(uniforms.uLightCount, activeLights.length);
        gl.uniform1fv(uniforms.uLightWorldX, new Float32Array(MAX_LIGHTS).map((_, i) => activeLights[i]?.worldX || 0));
        gl.uniform1fv(uniforms.uLightWorldHeight, new Float32Array(MAX_LIGHTS).map((_, i) => activeLights[i]?.worldHeight || 0));
        const colorBuf = new Float32Array(MAX_LIGHTS * 3);
        activeLights.forEach((l, i) => { colorBuf[i * 3] = l.color[0]; colorBuf[i * 3 + 1] = l.color[1]; colorBuf[i * 3 + 2] = l.color[2]; });
        gl.uniform3fv(uniforms.uLightColor, colorBuf);
        gl.uniform1f(uniforms.uNoiseScale, foliageParams?.noiseScale ?? 0.05);
        gl.uniform1f(uniforms.uWaveSpeed, foliageParams?.waveSpeed ?? 0.5);
        gl.uniform1f(uniforms.uNoiseScaleB, foliageParams?.noiseScaleB ?? 0.07);
        gl.uniform1f(uniforms.uWaveSpeedB, foliageParams?.waveSpeedB ?? 0.3);
        gl.uniform1f(uniforms.uWaveSteps, foliageParams?.waveSteps ?? 4);
        gl.uniform1f(uniforms.uDitherAmount, foliageParams?.ditherAmount ?? 0.1);
        gl.uniform1f(uniforms.uHighlightStrength, foliageParams?.highlightStrength ?? 0.3);
        gl.uniform1i(uniforms.uWaveBlendMode, foliageParams?.waveBlendMode ?? 0);
        gl.uniform1i(uniforms.uWaveBlendMode2, foliageParams?.waveBlendMode2 ?? 0);
        gl.uniform1f(uniforms.uLightRadius, foliageParams?.lightRadius ?? 200);
        gl.uniform1f(uniforms.uLightHeightRadius, foliageParams?.lightHeightRadius ?? 100);
        gl.uniform1f(uniforms.uLightStrength, foliageParams?.lightStrength ?? 1);
        gl.uniform1f(uniforms.uHuePull, foliageParams?.huePull ?? 0);
        gl.uniform1i(uniforms.uLightBlendMode, foliageParams?.lightBlendMode ?? 0);
        gl.uniform1i(uniforms.uLightBlendMode2, foliageParams?.lightBlendMode2 ?? 0);
        gl.uniform1f(uniforms.uGlobalIllumination, foliageParams?.globalIllumination ?? 0.6);
        gl.uniform1f(uniforms.uNormalStrength, foliageParams?.normalStrength ?? 1);
        gl.uniform1f(uniforms.uFlatIllumination, foliageParams?.flatIllumination ?? 0);
        gl.uniform1f(uniforms.uMoonStrength, foliageParams?.moonStrength ?? 0.5);   // #weather §362

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, s.diffuseTex);
        gl.uniform1i(uniforms.uDiffuse, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, s.normalTex);
        gl.uniform1i(uniforms.uNormal, 1);

        ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 4, entries.length);
    }, [atlas, foliageParams, lights]);

    return (
        <div style={{ position: 'absolute', bottom: 8, left: 180, zIndex: 6 }}>
            <div style={{ color: '#fff', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 10, background: 'rgba(0,0,0,0.6)', padding: '2px 4px' }}>
                instanced draw test ({atlas ? [...atlas.uvByKey.keys()].length : 0} crops available)
            </div>
            <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', border: '1px solid rgba(255,255,255,0.4)' }} />
        </div>
    );
}
