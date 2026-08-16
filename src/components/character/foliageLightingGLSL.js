// #925 follow-up (Han 2026-08-16, "alle lagen behalve achtergrond moeten normal map krijgen en reageren
// op licht"): pure relocation (CLAUDE.md §6d) of the lighting/blend GLSL functions that were already
// proven-working in ForegroundFoliageLayer.jsx's fragment shader (the #141 shimmer shader) — no logic
// change from their original form. Extracted so a SECOND, simpler shader (LdtkLitGround.jsx, for the
// static ground/building/decor layers — see docs/architecture.md's §925 lighting section) can share the
// EXACT same lighting math and the SAME `foliageParams` debug dials, instead of forking a second
// implementation that could silently drift from this one (CLAUDE.md §6c/§6d).
//
// Deliberately NOT included here: anything wave/skew/white-cap specific (`computeWave01`, `quantizeWave`,
// `blendHighlight(Dual)`, the skew/stretch math) — those are shimmer-animation concerns unique to the
// per-instance wind-blown foliage/water shader, not shared by a static lit-ground pass.

// `uLightWorldX[MAX_LIGHTS]` etc. — the up-to-MAX_LIGHTS point-light array uniform block, identical in
// both shaders so RpgLevelPanel.jsx's `lights` prop can be passed to either without translation.
export const MAX_LIGHTS = 10;
export const LIGHT_UNIFORMS_GLSL = `
const int MAX_LIGHTS = ${MAX_LIGHTS};
uniform int uLightCount;
uniform float uLightWorldX[MAX_LIGHTS];
uniform float uLightWorldHeight[MAX_LIGHTS];
uniform vec3 uLightColor[MAX_LIGHTS];
`;

// Every lighting-related tunable dial `foliageParams`/the debug panel already drives — shared verbatim so
// both shaders read the SAME uniform names from the SAME JS-side `params` object (RpgLevelPanel.jsx).
export const LIGHTING_PARAM_UNIFORMS_GLSL = `
uniform float uLightRadius;
uniform float uLightHeightRadius;
uniform float uLightStrength;
uniform float uHuePull;
uniform int uLightBlendMode;
uniform int uLightBlendMode2;
uniform float uGlobalIllumination;
uniform float uNormalStrength;
uniform float uFlatIllumination;
uniform int uEdgeLitOnly;
`;

// #141 round 10/14 (Han: edge-only lighting for crates/fences, later "buitenste pixels licht op, de
// pixels daarna voor 50%, de pixels daarna niet"). #925 follow-up (Han 2026-08-16): changed 3.0 -> 2.0
// per his explicit choice to share ONE constant across every edge-lit consumer (crates/fences AND the
// new front-of-entities ground/building/decor layers), not a separate per-layer value.
export const EDGE_LIGHT_PIXELS = 2.0;
export const AMBIENT_DARK_COLOR = 'vec3(0.05, 0.08, 0.18)';

export const LIGHTING_FUNCTIONS_GLSL = `
const float EDGE_LIGHT_PIXELS = ${EDGE_LIGHT_PIXELS.toFixed(1)};
const vec3 AMBIENT_DARK_COLOR = ${AMBIENT_DARK_COLOR};

// Standard HSV round-trip (round 9) — kept as blend-mode option 1, see blendLight below.
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// #141 round 11 (Han, NL: "ik denk dat belichting 'screen blend' moet gebruiken"): screen blend
// (1-(1-base)*(1-blend)) is subtle on bright pixels, strong on dark ones — exactly Han's ask, with no
// separate "reduce on bright pixels" logic needed anywhere else.
vec3 screenBlend(vec3 base, vec3 blendColor) {
    return 1.0 - (1.0 - base) * (1.0 - blendColor);
}

// #141 round 19: standard Color Dodge plus the four classic Photoshop/CSS non-separable HSL composite
// modes (Hue/Saturation/Color/Luminosity), approximated via the rgb2hsv/hsv2rgb round-trip above.
vec3 colorDodge(vec3 base, vec3 blendColor) {
    return clamp(base / max(1.0 - blendColor, 0.0001), 0.0, 1.0);
}
vec3 compositeBlend(vec3 base, vec3 blendColor, int mode) {
    if (mode == 8) return colorDodge(base, blendColor);
    vec3 hsvBase = rgb2hsv(base);
    vec3 hsvBlend = rgb2hsv(blendColor);
    if (mode == 4) return hsv2rgb(vec3(hsvBlend.x, hsvBase.y, hsvBase.z));   // Hue
    if (mode == 5) return hsv2rgb(vec3(hsvBase.x, hsvBlend.y, hsvBase.z));   // Saturation
    if (mode == 6) return hsv2rgb(vec3(hsvBlend.x, hsvBlend.y, hsvBase.z));  // Color
    return hsv2rgb(vec3(hsvBase.x, hsvBase.y, hsvBlend.z));                 // Luminosity (mode == 7)
}

vec3 blendLight(vec3 base, vec3 lightColor, float intensity, int mode) {
    if (mode == 0) return screenBlend(base, lightColor * intensity);
    if (mode == 2) return clamp(base + lightColor * intensity, 0.0, 1.0);
    if (mode == 3) return mix(base, lightColor, clamp(intensity, 0.0, 1.0));
    if (mode == 1) {
        vec3 hsv = rgb2hsv(base);
        vec3 lightHsv = rgb2hsv(lightColor);
        hsv.x = mix(hsv.x, lightHsv.x, intensity * uHuePull);
        hsv.z = clamp(hsv.z + intensity, 0.0, 1.0);
        return hsv2rgb(hsv);
    }
    return mix(base, compositeBlend(base, lightColor, mode), clamp(intensity, 0.0, 1.0));
}

// #141 round 15 (Han: "light: maak een secundaire blend mode"): runs blendLight twice with independently-
// selected modes and averages the results 50/50.
vec3 blendLightDual(vec3 base, vec3 lightColor, float intensity, int modeA, int modeB) {
    vec3 a = blendLight(base, lightColor, intensity, modeA);
    vec3 b = blendLight(base, lightColor, intensity, modeB);
    return mix(a, b, 0.5);
}

// #141 round 10/14 (Han: edge-only lighting): samples the diffuse alpha some native px out in each
// cardinal direction; three tiers — inside EDGE_LIGHT_PIXELS = full light, inside EDGE_LIGHT_PIXELS*2 =
// 50%, beyond = fully dark (ambient/wave-lit only, no point-light contribution).
bool anyNeighborTransparent(sampler2D tex, vec2 duv, vec2 off) {
    if (texture2D(tex, duv + vec2(off.x, 0.0)).a < 0.5) return true;
    if (texture2D(tex, duv - vec2(off.x, 0.0)).a < 0.5) return true;
    if (texture2D(tex, duv + vec2(0.0, off.y)).a < 0.5) return true;
    if (texture2D(tex, duv - vec2(0.0, off.y)).a < 0.5) return true;
    return false;
}
float edgeLightFactor(sampler2D tex, vec2 duv, vec2 texelSize) {
    if (uEdgeLitOnly == 0) return 1.0;
    if (anyNeighborTransparent(tex, duv, texelSize * EDGE_LIGHT_PIXELS)) return 1.0;
    if (anyNeighborTransparent(tex, duv, texelSize * EDGE_LIGHT_PIXELS * 2.0)) return 0.5;
    return 0.0;
}

const vec3 FLAT_NORMAL = vec3(0.0, 0.0, 1.0);
const float NORMAL_FLATTEN_NEAR_LIGHT = 0.7;

// #141 round 11/13/14/15/26 (see ForegroundFoliageLayer.jsx's own history for the full round-by-round
// reasoning this function accumulated): a point light REVEALS trueColor back out of the ambient-darkened
// currentColor, directional (ndotl-gated, auto-flattening the normal near the light to avoid harsh
// per-texel contrast) plus an optional non-gated "flat" radial glow, summed.
vec3 applyPointLight(vec3 trueColor, vec3 currentColor, vec3 normal, float worldX, float groundDist, float edgeFactor, float lightWorldX, float lightWorldHeight, vec3 lightColor) {
    float distX = abs(worldX - lightWorldX);
    float falloffX = clamp(1.0 - distX / uLightRadius, 0.0, 1.0);
    falloffX = falloffX * falloffX;
    float heightDiff = abs(groundDist - lightWorldHeight);
    float falloffY = clamp(1.0 - heightDiff / uLightHeightRadius, 0.0, 1.0);
    falloffY = falloffY * falloffY;
    float closeness = falloffX * falloffY;
    vec3 effectiveNormal = normalize(mix(normal, FLAT_NORMAL, closeness * NORMAL_FLATTEN_NEAR_LIGHT));
    vec3 lightDir = normalize(vec3(lightWorldX - worldX, groundDist - lightWorldHeight, 0.6));
    float ndotl = max(dot(effectiveNormal, lightDir), 0.0);
    float directional = closeness * edgeFactor * uLightStrength * ndotl;
    float flatGlow = closeness * edgeFactor * uLightStrength * uFlatIllumination;
    float intensity = clamp(directional + flatGlow, 0.0, 1.0);
    if (intensity <= 0.0) return currentColor;
    vec3 revealed = blendLightDual(trueColor, lightColor, uHuePull, uLightBlendMode, uLightBlendMode2);
    return mix(currentColor, revealed, intensity);
}

// #141 round 13: loops the up-to-MAX_LIGHTS light array. GLSL ES 1.00 needs the loop's own bound to be a
// constant expression (MAX_LIGHTS is); the break condition inside can still be a runtime uniform.
vec3 applyPointLights(vec3 trueColor, vec3 currentColor, vec3 normal, float worldX, float groundDist, float edgeFactor) {
    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= uLightCount) break;
        currentColor = applyPointLight(trueColor, currentColor, normal, worldX, groundDist, edgeFactor, uLightWorldX[i], uLightWorldHeight[i], uLightColor[i]);
    }
    return currentColor;
}
`;
