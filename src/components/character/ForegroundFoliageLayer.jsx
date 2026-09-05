import React, { useEffect, useLayoutEffect, useRef } from 'react';
import logger from '../../utils/logger';
import useFrameLoop from '../../hooks/useFrameLoop';
import { LIGHT_UNIFORMS_GLSL, LIGHTING_PARAM_UNIFORMS_GLSL, LIGHTING_FUNCTIONS_GLSL, MAX_LIGHTS } from './foliageLightingGLSL';
// §377: the sun's own yellow — imported, never retyped (CLAUDE.md §6c). Used as the no-op default and
// as the upload fallback for any caller that does not drive the sun-glow channels.
import { SUN_GLOW_RGB } from './celestialModel';

// #141 (Han 2026-08-05, Factorio-style tree/grass wind-shimmer, stage 1): the app's FIRST WebGL surface —
// everything else in RpgLevelPanel is plain DOM/CSS. This exists because stage 1 needs a genuine per-pixel
// normal-map-lit shader (sample a normal map, relight against an animated virtual light direction), which
// CSS/SVG cannot do. Deliberately scoped to ONE shared canvas/WebGL context for every animated instance
// (the tree foliage quad + every grass tuft) rather than one context per sprite — browsers cap concurrent
// WebGL contexts (~8-16), and grass tufts alone can number in the dozens across the level. Everything else
// in the scene (trunk, tiles, characters) stays DOM, unchanged; this canvas sits in ONE stacking slot,
// matching the DOM foreground layer it replaces (see RpgLevelPanel.jsx's "Foreground foliage" comment).
//
// STAGE 1 INVARIANT: pixels never move. This shader only relights already-in-place texels (Lambertian
// shading from an animated virtual light direction) — no UV displacement. Stage 2 (planned, not yet built)
// is where actual pixel displacement/wind-push would be added, as a separate, later change to this shader.
//
// Texture filtering is NEAREST with no mipmaps on both diffuse and normal textures — required to keep the
// pixel-art look consistent with `imageRendering: pixelated` used everywhere else in the level (§6d: match
// the surface's own rendering conventions).

const VERTEX_SRC = `
attribute vec2 aPos;
uniform vec2 uScreenPos;
uniform vec2 uSizePx;
uniform vec2 uCanvasSize;
varying vec2 vUV;
void main() {
    vUV = vec2(aPos.x, 1.0 - aPos.y);
    vec2 px = uScreenPos + vec2((aPos.x - 0.5) * uSizePx.x, -aPos.y * uSizePx.y);
    vec2 clip = (px / uCanvasSize) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

// #141 round 3 (Han, after round 2: "the wave is ugly, it has very large blocks and looks clunky. make the
// bands smaller, the edge more grainy. the 'pixellated' edge is just a straight line. I don't see any
// interaction with the normal map; it now just looks like an opacity overlay applied uniformly. adjust the
// wave to be much grainier and finer. The bands should be diagonal, and less regular"): round 2's mistake
// was treating "pixellated" as "a few big flat-quantized steps" and treating the normal map as ONLY a
// lighting input, never touching the wave itself. Three real changes here, not just constant-tuning:
//   1. Bands are now much narrower (short wavelength) AND diagonal (the phase mixes worldX with local
//      vUV.y, not X alone) AND non-periodic-looking (two summed sine terms at incommensurate frequencies,
//      so it doesn't read as one clean repeating stripe).
//   2. The quantization edge is DITHERED by a coarse per-native-pixel hash noise before thresholding, so
//      band boundaries scatter into a grainy scatter of individual pixels instead of one straight edge —
//      genuinely "pixellated" the way dithered pixel-art shading looks, not a smooth quantize() line.
//   3. The wave's PHASE is now distorted by the normal map's own tangent (n.x/n.y) before evaluating the
//      sine — leaf clumps with different slopes shift the local wave, so the band visibly bends/breaks
//      around the canopy's own relief instead of overlaying it as a flat, uniform shape.
const FRAGMENT_SRC = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uDiffuse;
uniform sampler2D uNormal;
uniform vec4 uDiffuseUV;
uniform float uTime;
uniform float uWorldCenterX;
uniform float uWorldWidth;
uniform float uWorldHeight;
// #RAM-level (Han 2026-08-12, "de wave band ziet er heel anders uit in de LDtk wereld... alle tiles boven
// elkaar hebben dezelfde wave, dus verticaal periodiek met periode 1"): groundDist below used to reset
// to 0 at THIS INSTANCE'S OWN bottom edge — correct for a legacy foliage sprite (one instance = one whole
// tree canopy/tuft/tent, so groundDist already spans the object's full height continuously), but wrong
// for the LDtk world, where a tall foliage column (e.g. a pine tree) is authored as MANY separate 16px
// tile instances stacked vertically — each one independently restarting groundDist at 0..16, so the noise
// field repeats every tile instead of sweeping smoothly up the whole column. uGroundDistOffset (a plain
// added offset, defaulting to 0 for every existing caller — legacy behaviour is bit-for-bit unchanged) lets
// a caller that KNOWS an instance's true height above the level's real ground (not just its own local
// height) supply it, restoring one continuous sweep across a stacked column.
uniform float uGroundDistOffset;
// #141 round 20 (Han, NL: "ik zie echt vlekken die niet meer in een px passen. Kun je pixel grid gebruiken
// en een pixel kleur forceren voor het hele grid unit?"): same uniforms the vertex shader already uses to
// place this instance's quad — declared here too so main() can derive the native-pixel column straight from
// gl_FragCoord (see main()'s own comment for why that's more stable than vUV).
// #141 round 23 CRITICAL BUG FIX (Han's console log: "Precisions of uniform 'uScreenPos' differ between
// VERTEX and FRAGMENT shaders" — E021-FOLIAGE-SHADER-COMPILE, silently caught, so NOTHING ever rendered,
// on every load): a uniform shared by name across both shader stages of one linked program must declare
// the IDENTICAL precision in both. The vertex shader's default float precision is highp (vertex shaders
// default to highp per the GLSL ES spec); this file's fragment shader instead opens with
// "precision mediump float;", which — with no explicit qualifier here — silently made these two uniforms
// mediump in THIS stage only. Mismatch = link failure = the whole program never links = nothing ever
// draws. Fixed by explicitly qualifying both as highp here, matching the vertex shader's default exactly.
uniform highp vec2 uScreenPos;
uniform highp vec2 uSizePx;
// #925 follow-up (Han 2026-08-16): shared with the vertex shader (which already declares this — see
// main()'s own comment below for why the fragment stage needs it too), so must match its precision
// exactly, same rule as uScreenPos/uSizePx above (round 23's critical bug).
uniform highp vec2 uCanvasSize;
uniform int uDebugChannel;   // 0 = final shimmer, 1 = raw normal map, 2 = wave band alone, 3 = disabled
// #141 round 15 (Han: "je hebt de trunk aan de foliage layer toegevoegd. ik wil hem verlicht, maar geen
// onderdeel van foliage" + "let op! de kisten op de voorgrond moeten NIET shimmeren" + "en het tentdoek
// wel! dat ziet er echt fantastisch uit"): whether an instance is "floor-shaped" (opaque, no alpha-cutout)
// is now ORTHOGONAL to whether it shimmers at all — trunk and crates are
// both plain uInstanceKind==0 sprites but must NEVER wave, while the tent (also kind 0) DOES wave, same
// as the tree canopy/grass tufts. uHasWave carries that per-instance choice; uInstanceKind now only
// describes geometry/alpha handling.
uniform int uInstanceKind;   // 0 = alpha-cutout sprite (tree/tufts/trunk/tent/crate), 1 = floor (opaque)
uniform int uHasWave;        // 1 = this instance's wind-wave highlight runs at all; 0 = lit but never waves
// #141 round 16 (Han: "kun je iets proberen dat random skew en distort doet... hoe verder van het anker,
// hoe veller de verplaatsing" — wind-bend, scoped to grass tufts + tree canopy only, NOT tent/trunk/crates/
// floor per Han's own chosen scope): independent of uHasWave — the tent waves (color shimmer) but must NOT
// skew (fabric held by tent poles, doesn't lean like a free-standing blade/branch).
// #141 round 17 (Han: "let op, een px is altijd een game px, niet een schermpx" — INVARIANT, applies to
// every "px" uniform in this file, not just these two): uWorldWidth/uWorldHeight and everything derived
// from them (texelSize, skewShiftPx, stretchShiftPx) are ALWAYS native/game pixels — ZOOM (RpgLevelPanel's
// display scale) never enters this shader at all; only uScreenPos/uSizePx (the vertex-stage quad
// placement) are in display px, and neither skew nor stretch touches those.
uniform int uHasSkew;
uniform float uSkewAmount;   // max whole-native-px horizontal shift at the instance's own top (groundDist
                              // == uWorldHeight); 0 at the ground anchor, scaled by height^2 in between
// #141 round 17 (Han: "kan de vorm van de tree zelfs worden aangepast? dat de sprite wordt uitgerokken en
// beweegt?"): horizontal "breathing" width, gated by the SAME uHasSkew flag (identical scope to skew —
// canopy + grass tufts only) since Han chose to apply it everywhere skew already applies.
uniform float uStretchAmount; // max whole-native-px pull-toward-center at the instance's own left/right
                              // edge; 0 at the horizontal center, grows linearly outward
// #925 follow-up (Han 2026-08-16): uEdgeLitOnly briefly lived in the shared LIGHTING_PARAM_UNIFORMS_GLSL
// block (foliageLightingGLSL.js); moved back to a local declaration in Fase 10b (see that uniform's own
// declaration further down, and foliageLightingGLSL.js's own comment) — instancing needs it to become a
// per-instance varying, which can't share a declaration with LdtkLitGround.jsx's plain per-draw-call
// uniform of the same name.

// #141 round 13 (Han: "ja graag [directional lighting]. ik ga hooguit 10 lichtbronnen in beeld hebben"):
// generalized from 2 hardcoded named lights (wisp/hero) to a fixed-size array of up to MAX_LIGHTS — the
// wisp and hero are just the first two entries RpgLevelPanel.jsx currently populates. uLightWorldHeight
// is each light's own height ABOVE THE GROUND (0 for a ground-standing character) in the SAME groundDist
// units the wave/lighting math already uses elsewhere — not a screen position.
// #925 follow-up: this uniform block now lives in foliageLightingGLSL.js's LIGHT_UNIFORMS_GLSL, shared
// verbatim with LdtkLitGround.jsx (CLAUDE.md §6d) — interpolated in below.
${LIGHT_UNIFORMS_GLSL}

// #141 round 11 (Han, NL: "Zet alle params die je gebruikt in de debug" — "put all the params you use in
// the debug"): every dial Han has actually asked to tune is now a uniform, driven live from a debug panel
// (RpgLevelPanel.jsx), instead of a baked-in const. Defaults live in RpgLevelPanel's initial state, not
// here — this file no longer has "the" value for any of these, just the shader math.
uniform float uNoiseScale;        // wave A blob/band size — bigger = smaller, tighter blobs
uniform float uWaveSpeed;         // wave A speed
// #141 round 15 (Han: "maak de noise scale en speed van de twee waves apart tunebaar" — the two
// interfering waves computeWaveQuant blends (see round 14's own comment there) shared ONE scale/speed pair
// until now; separately tunable lets Han make one wave a slow, coarse swell and the other a fast, fine
// ripple instead of two frequency-locked copies moving opposite directions.
uniform float uNoiseScaleB;       // wave B blob/band size
uniform float uWaveSpeedB;        // wave B speed
uniform float uWaveSteps;
uniform float uDitherAmount;
uniform float uHighlightStrength; // wind-wave highlight strength
uniform int uWaveBlendMode;       // 0 Screen, 1 HSV Value/Hue boost, 2 Additive RGB, 3 plain Mix
uniform int uWaveBlendMode2;      // round 12: averaged 50/50 with uWaveBlendMode's result
// #925 follow-up (Han 2026-08-16): uLightRadius/uLightHeightRadius/uLightStrength/uHuePull/
// uLightBlendMode(2)/uGlobalIllumination/uNormalStrength/uFlatIllumination all moved into the shared
// LIGHTING_PARAM_UNIFORMS_GLSL block (foliageLightingGLSL.js) — same declarations, now shared verbatim
// with LdtkLitGround.jsx's static lighting shader (CLAUDE.md §6d) — uEdgeLitOnly excepted, see its own
// declaration further up (Fase 10b moved it back out, instancing-related, see foliageLightingGLSL.js's own
// comment). See that file for each dial's
// own history/reasoning (global illumination toward dark blue, normal-map-strength slider, flat
// illumination, etc.) — unchanged here, just relocated.
${LIGHTING_PARAM_UNIFORMS_GLSL}
// #925 follow-up (Han 2026-08-16, "de 100% witte pixels mogen een witte 'kop'/glans geven op het water"):
// fully-bright diffuse pixels (water-crest art, or any other near-white source pixel) get pulled further
// toward pure white, on top of the existing wave highlight — global params like every other shimmer dial
// (round 11's "put every tunable in the debug" convention), not water-specific, since the effect is a
// no-op wherever the source art has no near-white pixels to begin with.
uniform float uWhiteCapThreshold;   // diffuse luminance above which the cap starts kicking in (0..1)
uniform float uWhiteCapStrength;    // 0 = no effect, 1 = fully pulled to pure white at max luminance
// Perf (#1162, Fase 10b): declared locally now — edgeLightFactor (foliageLightingGLSL.js) takes this as
// an explicit parameter instead of reading a shared global by name (see that file's own comment). This
// instance-varying int, unchanged from before that refactor.
uniform int uEdgeLitOnly;

const float GRAIN_CELL = 1.0;     // native-px grain size — not yet exposed to the debug panel
const vec3 HIGHLIGHT_COLOR = vec3(1.0, 1.0, 0.95);
// #925 follow-up (Han 2026-08-16): AMBIENT_DARK_COLOR and EDGE_LIGHT_PIXELS (changed 3.0 -> 2.0 per
// Han's explicit choice to share one value across every edge-lit consumer) now live in the shared
// LIGHTING_FUNCTIONS_GLSL block below (foliageLightingGLSL.js), alongside every other lighting function.

float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Standard 2-corner-lerp value noise — smooth, organic, unlike a sine's linear stripes.
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

// #141 round 11 (Han, NL: "Ik heb liever een vlekkeriger patroon dat beweegt" — "I'd prefer a blotchier
// pattern that moves"): two octaves of value noise replace rounds 3-10's sine-sum band math entirely —
// organic blob shapes instead of directional stripes, still animated by sliding the sample coordinate with
// uTime. uNoiseScale controls blob size (was WAVE_FREQ_X/Y); there's no more "diagonal tilt" knob since
// blob noise doesn't have an inherent direction the way a sine band does.
float blotchNoise(vec2 p) {
    return valueNoise(p) * 0.6 + valueNoise(p * 2.1 + 19.0) * 0.4;
}

// #141 round 11 (Han, NL: "ik zie nog steeds verschillende wave bends voor de verschillende lagen" — a
// lingering phase mismatch between the floor and the tufts, EVEN AFTER round 10's "one global wave"):
// root cause found — the Y-term used raw localY (0..worldHeight, a DIFFERENT range per instance: 0..16 for
// the floor, 0..32 for a tuft, 0..208 for the tree), so the same world-X position sampled a DIFFERENT point
// in the noise field depending on which instance happened to be there. groundDist (height ABOVE the ground,
// 0 at every instance's own ground-contact point regardless of its own height) is the actually-shared
// reference — a floor pixel and a tuft's base now sample the same point in the noise field.
// #141 round 14 (Han, NL: "de grass tiles reageren ook nog steeds niet op de foliage interferentie. IPV
// flicker: maak een tweede wave, met tegengestelde richting, die interfereert: wit+wit = wit, zwart+zwart =
// zwart, wit+zwart = grijs" — "the grass tiles still don't react to the foliage interference. INSTEAD OF
// flicker: make a second wave, opposite direction, that interferes: white+white=white, black+black=black,
// white+black=grey"): round 12/13's separate flickerNoise post-process is GONE — replaced by building the
// interference directly INTO computeWaveQuant itself, so both the floor and every sprite (which already
// share this one function) get it automatically, instead of a bolt-on effect that could silently miss a
// call site. Two independent blotch-noise samples, one sliding left->right (pA), one right->left (pB,
// also offset to a different noise-field location so it isn't just A's mirror image), averaged — literally
// (a+b)*0.5, which IS the white+white=white / black+black=black / mixed=grey rule Han asked for.
// #141 round 16 (Han: "kun je iets proberen dat random skew en distort doet... hoe verder van het anker,
// hoe veller de verplaatsing" — chose to drive the new wind-skew off this SAME wave field so the brightest
// part of the highlight is also the part that bends most, one coherent gust rather than two unrelated
// motions): split out of the old computeWaveQuant so the raw, continuous 0..1 value is available BEFORE
// dither/step quantization — the skew needs the smooth value (dithering/stepping it would make the bend
// jitter per-native-pixel instead of reading as one coherent lean), while the highlight still wants the
// quantized, dithered one (see quantizeWave below). Callers needing both call this once and pass the result
// to quantizeWave, rather than recomputing the noise twice.
float computeWave01(float worldX, float groundDist, float phaseOffset) {
    // BUG CAUGHT IN REVIEW: mod(worldX, 4000.0) directly would jump discontinuously at worldX=0 — right in
    // the middle of the visible level (LEVEL_MIN_X..LEVEL_MAX_X = -1600..1600) — a visible seam at the
    // level's own center. Offsetting before the mod moves the wrap points to +-2000, outside that range,
    // while still keeping the value bounded (stays well outside the mediump sin() precision cliff, see hash21).
    float wrappedX = mod(worldX + 10000.0, 4000.0);

    // #141 round 15: wave A and B now sample at independently-tunable scale/speed (uNoiseScale/uWaveSpeed
    // vs uNoiseScaleB/uWaveSpeedB) instead of sharing one pair — each needs its OWN wrappedX+phaseOffset
    // scaled by its OWN noise scale before the coordinate is usable.
    vec2 pA = vec2(wrappedX + phaseOffset, groundDist) * uNoiseScale;
    pA.x -= uTime * uWaveSpeed;
    float waveA = blotchNoise(pA);

    vec2 pB = vec2(wrappedX + phaseOffset, groundDist) * uNoiseScaleB + vec2(53.7, 91.3);
    pB.x += uTime * uWaveSpeedB;
    float waveB = blotchNoise(pB);

    return (waveA + waveB) * 0.5;
}

// #141 round 14/15's dither+step quantization, now separated from the raw noise sample above.
float quantizeWave(float wave01, float worldX, float groundDist) {
    float wrappedX = mod(worldX + 10000.0, 4000.0);
    vec2 grainCoord = floor(vec2(wrappedX, groundDist) / GRAIN_CELL);
    float grain = hash21(grainCoord) - 0.5;
    float waveDithered = clamp(wave01 + grain * uDitherAmount, 0.0, 1.0);
    return floor(waveDithered * uWaveSteps) / max(uWaveSteps - 1.0, 1.0);
}

// #925 follow-up (Han 2026-08-16): rgb2hsv/hsv2rgb/screenBlend/colorDodge/compositeBlend AND
// blendLight/blendLightDual/anyNeighborTransparent/edgeLightFactor/FLAT_NORMAL/applyPointLight(s) all
// moved into the shared LIGHTING_FUNCTIONS_GLSL block (foliageLightingGLSL.js) — same code, now shared
// verbatim with LdtkLitGround.jsx's static lighting shader (CLAUDE.md §6d). blendHighlight/
// blendHighlightDual below (the wave-specific highlight, NOT shared — no equivalent in a static shader)
// still use rgb2hsv/hsv2rgb/compositeBlend, which is why this block must come before them.
${LIGHTING_FUNCTIONS_GLSL}

// #141 round 11 debug blend-mode selector (Han: "Kun je zorgen dat ik in debug verschillende blend modes
// kan kiezen voor de beide use cases" — separately selectable for the wind-wave highlight and the point
// lights): 0 Screen (round 11's new default), 1 HSV Value/Hue boost (rounds 9-10's technique), 2 Additive
// RGB (round 9's first attempt), 3 plain Mix (round 8's original) — kept as comparison points, not deleted.
//
// Round 12 (Han, NL: "Ik denk dat ik HSV boost van foliage het meest nice vind, maar de overall HSV wordt
// dan te hoog. Ik wil dat de gemiddelde HSV hetzelfde blijft" — "I like the HSV boost look best, but the
// OVERALL average brightness creeps up; I want the average to stay the same"): mode 1 previously only ever
// ADDED to Value (waveQuant is 0..1, so strength was always >=0) — since a wave spends time on BOTH sides of
// its own midpoint but the boost never went negative, the time-average brightness necessarily drifted
// upward. Mode 1 now swings SYMMETRICALLY around zero (waveQuant needed separately from the pre-multiplied
// strength, hence the signature change below) — brightens on the wave's top half, dims on its bottom half,
// so the average over time/space stays at the original brightness.
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
    // #141 round 19: modes 4-8 (Hue/Saturation/Color/Luminosity/Color Dodge) have no built-in "strength"
    // knob the way Screen/Additive/HSV-swing do — Photoshop applies these via layer opacity, so this does
    // the same: compute the fully-composited result, then mix it in by strength like plain Mix (mode 3).
    return mix(base, compositeBlend(base, tintColor, mode), clamp(strength, 0.0, 1.0));
}

// #141 round 12 (Han, NL: "ik wil twee blend modes kiezen waarvan je het gemiddelde neemt" — "I want to
// pick two blend modes and take their average"): runs blendHighlight twice with independently-selected
// modes and averages the results 50/50 — e.g. Screen (keeps bright pixels subtle) averaged with HSV boost
// (the look Han likes) gets some of both properties instead of picking just one.
vec3 blendHighlightDual(vec3 base, vec3 tintColor, float waveQuant, float strengthScale, int modeA, int modeB) {
    vec3 a = blendHighlight(base, tintColor, waveQuant, strengthScale, modeA);
    vec3 b = blendHighlight(base, tintColor, waveQuant, strengthScale, modeB);
    return mix(a, b, 0.5);
}

// #141 round 14 (Han, NL: "IPV flicker: maak een tweede wave..."): rounds 12/13's standalone flickerNoise()
// post-process is REMOVED — the two-wave interference now lives directly in computeWaveQuant (see its own
// comment above), so there's no separate flicker pass or uFlickerAmount/uFrameSeed uniform anymore.
//
// #925 follow-up (Han 2026-08-16): blendLight/blendLightDual/anyNeighborTransparent/edgeLightFactor/
// FLAT_NORMAL/NORMAL_FLATTEN_NEAR_LIGHT/applyPointLight/applyPointLights all moved into the shared
// LIGHTING_FUNCTIONS_GLSL block above (interpolated in earlier in this file) — same code, now shared
// verbatim with LdtkLitGround.jsx.

// #141 round 15 (Han: "ik snap ook nog steeds niet waarom de grasmat niet reageert op het licht" — the
// floor used to be a semi-transparent OVERLAY on top of separately-rendered, unlit DOM tiles, capped at
// ~30% alpha even right under a light, so any brightening was barely visible; RpgLevelPanel.jsx now
// generates the floor's EXACT diffuse+normal texture and renders it as the ground itself — this replaces
// both the old translucent-overlay branch AND the old alpha-cutout sprite branch below with ONE shared
// path): uInstanceKind only decides discard-on-transparent (kind 0, real sprite silhouettes) vs. no
// discard (kind 1, floor — the stitched texture is opaque everywhere by construction); uHasWave decides
// whether computeWaveQuant runs at all for THIS instance, independent of kind — see the uHasWave uniform's
// own comment for why (trunk/crates: lit, never wave; tent/canopy/tufts: lit AND wave; floor: always wave,
// across its own full tile height since round 17).
void main() {
    // #141 round 20 (Han, NL: "ik zie echt vlekken die niet meer in een px passen. Kun je pixel grid
    // gebruiken en een pixel kleur forceren voor het hele grid unit?"): round 18 already snapped the
    // OFFSET added by skew/stretch to a whole native pixel, but the BASE coordinate it started from
    // (vUV.x) is a GPU-interpolated varying — the hardware's own interpolation has limited precision, so
    // two adjacent screen fragments that are both meant to belong to the SAME native-pixel column could
    // still land on opposite sides of a rounding boundary, flickering frame to frame as the interpolated
    // value wobbles by less than a texel. gl_FragCoord, unlike a varying, is an exact, stable per-fragment
    // window coordinate the GPU guarantees — deriving the native-pixel COLUMN from it instead of from
    // vUV.x removes that wobble at the source, for every fragment that shares a column, not just the
    // skewed/stretched ones. Cheap: a subtraction, a division, a floor — no extra texture reads.
    float localXPx = gl_FragCoord.x - (uScreenPos.x - uSizePx.x * 0.5);
    float pxPerNativeX = max(uSizePx.x / uWorldWidth, 0.0001);
    float nativeX = clamp(floor(localXPx / pxPerNativeX), 0.0, uWorldWidth - 1.0);
    float stableUVx = (nativeX + 0.5) / uWorldWidth;

    float worldX = uWorldCenterX + (stableUVx - 0.5) * uWorldWidth;

    // #925 follow-up (Han 2026-08-16, "de shimmer 'pixel switch' is niet op het niveau van RPG-pixels,
    // maar op het niveau van schermpixels"): mirrors the X-axis fix above for Y, which never got the same
    // treatment — groundDist (and the sampling nativeY below) were still derived from the GPU-interpolated
    // vUV.y varying, whose limited interpolation precision let the wave-grain quantization (and texel
    // sampling) step at sub-native-pixel boundaries instead of whole RPG-pixel rows. gl_FragCoord.y is
    // GL's window coordinate (origin bottom-left, Y UP); this shader's vertex stage deliberately negates
    // clip.y (gl_Position = vec4(clip.x, -clip.y, ...)) so quads place using top-down CANVAS px
    // (uScreenPos/uSizePx, matching every other "px" value in this file) — recovering that same canvas-px
    // convention from gl_FragCoord.y needs undoing that flip via the canvas height (uCanvasSize, declared
    // above). nativeY (distance from this instance's own TOP edge, in whole native px) is now computed
    // ONCE here and reused for both the wave/grain math (via groundDist) and texel sampling further below
    // — previously two separate derivations (one varying-based here, one also varying-based near the
    // duv/normalUV computation) that could in principle disagree; now provably identical.
    float pxTopEdgeY = uScreenPos.y - uSizePx.y;
    float localYPx = (uCanvasSize.y - gl_FragCoord.y) - pxTopEdgeY;
    float pxPerNativeY = max(uSizePx.y / uWorldHeight, 0.0001);
    float nativeY = clamp(floor(localYPx / pxPerNativeY), 0.0, uWorldHeight - 1.0);
    float groundDist = uWorldHeight - (nativeY + 0.5) + uGroundDistOffset;
    vec2 texelSize = vec2((uDiffuseUV.z - uDiffuseUV.x) / uWorldWidth, (uDiffuseUV.w - uDiffuseUV.y) / uWorldHeight);

    // Channel 3 (Disabled) and instances with BOTH wave and skew switched off skip the noise sample
    // entirely — computed once here (raw, pre-quantization) so both the skew below and the highlight
    // further down reuse the same single evaluation instead of sampling the noise field twice.
    bool wantsWave = uDebugChannel != 3 && (uHasWave == 1 || uHasSkew == 1);
    float wave01 = 0.0;
    if (wantsWave) wave01 = computeWave01(worldX, groundDist, 0.0);

    // #141 round 16 (Han, NL: "kun je iets proberen dat random skew en distort doet, maar dan pixels
    // herberekent? ... hoe verder van het anker, hoe veller de verplaatsing" — wind-bend for grass tufts and
    // the tree canopy): shifts WHICH source texel each screen row samples, quantized to a WHOLE native pixel
    // (floor(... + 0.5), i.e. round-to-nearest) so NEAREST-filtered sampling stays perfectly crisp — a
    // "staircase" shear, never a blurred skew. Driven by the SAME raw wave01 the highlight below uses (per
    // Han's choice: reuse the existing wave rather than an independent one) so the brightest part of an
    // instance is also the part that bends most — one coherent gust, not two unrelated motions. heightRatio
    // squared (0 at the ground anchor, full strength at the top) approximates a flexible object bending
    // more the further it is from its rigid base, rather than a uniform tilt.
    float skewShiftPx = 0.0;
    float stretchShiftPx = 0.0;
    if (uHasSkew == 1 && wantsWave) {
        // BUG CAUGHT AFTER SHIPPING (Han: "skew heeft geen effect"): wave01 is the average of FOUR
        // quasi-random samples (two blotchNoise calls, each itself two valueNoise calls) — that averaging
        // clusters its distribution tightly around 0.5, so a plain *2.0 recentre rarely swings sway anywhere
        // near +-1. Combined with the heightRatio^2 falloff and the whole-pixel rounding below, the product
        // almost never crossed the 0.5 threshold needed to produce even a single pixel of shift — the skew
        // was computing correctly, just landing on 0 nearly everywhere. SKEW_CONTRAST widens (and clamps)
        // the swing before it feeds the rounding, so a moderate lean in the underlying wave reliably reaches
        // a visible whole-pixel shift instead of being swallowed by the rounding deadzone.
        const float SKEW_CONTRAST = 5.0;
        float sway = clamp((wave01 - 0.5) * SKEW_CONTRAST, -1.0, 1.0);
        // Known minor side-effect of uGroundDistOffset (see its own comment above): for a stacked LDtk
        // column, groundDist can exceed this ONE tile's own uWorldHeight, so heightRatio saturates at
        // 1.0 for every tile above the bottom-most one instead of tapering per-tile — full-intensity skew
        // on upper tiles rather than a per-tile gradient. Not worth a second offset/uniform for a
        // cosmetic-only skew-intensity taper; flagged rather than silently accepted.
        float heightRatio = clamp(groundDist / uWorldHeight, 0.0, 1.0);
        skewShiftPx = floor(sway * heightRatio * heightRatio * uSkewAmount + 0.5);

        // #141 round 17 (Han: "de pixel movement geeft een veel sterker effect... kan de vorm van de tree
        // zelfs worden aangepast? dat de sprite wordt uitgerokken en beweegt?" — chose horizontal
        // stretch/squeeze, driven by the SAME sway, scoped to canopy+grass tufts, same as skew above):
        // each fragment's own horizontal distance from the instance's CENTER (not its ground anchor —
        // stretch has no "further from the anchor" rule, it's symmetric) determines how far it gets pulled
        // TOWARD the center (sway > 0: samples a narrower source band across the same screen width, i.e.
        // the silhouette reads as WIDER) or pushed away from it (sway < 0: narrower) — zero at the exact
        // center, growing linearly to the edges, quantized to whole native pixels for the same crisp,
        // non-blurred reason as the skew above. Round 20: uses nativeX (the stable, gl_FragCoord-derived
        // column), not vUV.x, so this offset is IDENTICAL for every fragment in the same native-pixel
        // column — otherwise a continuous offsetFromCenterPx could round differently for two fragments
        // meant to be the same column, right at the fragment where it crosses a whole-pixel boundary.
        float offsetFromCenterPx = (stableUVx - 0.5) * uWorldWidth;
        float halfWidthPx = max(uWorldWidth * 0.5, 1.0);
        stretchShiftPx = floor((-offsetFromCenterPx / halfWidthPx) * sway * uStretchAmount + 0.5);
    }
    float totalShiftPx = skewShiftPx + stretchShiftPx;

    // #141 round 18 (Han: "ik zie wel vlekjes / verplaatsingen 'kleiner dan een pixel'"), refined round 20:
    // shift the STABLE, gl_FragCoord-derived nativeX (computed at the top of main(), see its own comment)
    // by the whole-pixel totalShiftPx, clamp, THEN convert to a texel-CENTER UV (+0.5) — every fragment in
    // the same native pixel's footprint computes the identical integer index and therefore the identical
    // UV, so texture2D() always lands solidly in the middle of one texel with no boundary ambiguity,
    // regardless of skew/stretch. nativeY (now gl_FragCoord-derived, see its own comment above) is reused
    // unchanged here — untouched by skew/stretch, which only ever shift the X sample.
    // #1219 (Han: "felle groene spikkels buiten de sprite na de pixel-switch"): a wind bend can push the
    // sample index outside this sprite's OWN [0, W-1] column range — those fragments belong OUTSIDE the
    // deformed silhouette. Clamping them onto the edge texel column smeared a ragged band of (often
    // bright leaf-tip) pixels beyond the canopy outline that global illumination could not hide. Discard
    // them for alpha-cutout sprites; the opaque floor (kind 1) still wants the clamp (edge extension).
    float shiftedNativeXraw = nativeX + totalShiftPx;
    if (uInstanceKind == 0 && (shiftedNativeXraw < 0.0 || shiftedNativeXraw > uWorldWidth - 1.0)) discard;
    float shiftedNativeX = clamp(shiftedNativeXraw, 0.0, uWorldWidth - 1.0);
    vec2 duv = vec2(
        mix(uDiffuseUV.x, uDiffuseUV.z, (shiftedNativeX + 0.5) / uWorldWidth),
        mix(uDiffuseUV.y, uDiffuseUV.w, (nativeY + 0.5) / uWorldHeight)
    );
    vec2 normalUV = vec2(
        clamp((shiftedNativeX + 0.5) / uWorldWidth, 0.0, 1.0),
        clamp((nativeY + 0.5) / uWorldHeight, 0.0, 1.0)
    );

    vec4 diffuse = texture2D(uDiffuse, duv);
    if (uInstanceKind == 0 && diffuse.a < 0.5) discard;

    float edgeFactor = edgeLightFactor(uDiffuse, duv, texelSize, float(uEdgeLitOnly));

    if (uDebugChannel == 1) {
        gl_FragColor = vec4(texture2D(uNormal, normalUV).rgb, 1.0);
        return;
    }

    // #141 round 19 (Han, NL: "normal map van de floor tiles mag toch globaal 'van boven' zijn; ik wil
    // bereiken dat de floor tiles gelijkmatig belicht worden, de schaduwen tussen graspollen zijn echt
    // overdreven" — the floor's Sobel-derived normal map carries per-blade relief that reads as harsh,
    // uneven per-pixel shadowing once lit directionally; Han's own fix is to treat the whole floor as flat
    // "pointing straight up" for lighting purposes, ALWAYS, regardless of the tunable strength below — the
    // floor doesn't need per-blade directional detail the way a tree canopy or crate does): floor (kind 1)
    // is hard-pinned to FLAT_NORMAL; every other instance blends the sampled normal toward flat by the
    // NEW uNormalStrength dial (1.0 = full relief/current look, 0.0 = fully flat, tunable in the debug
    // panel — Han's "maak een slider voor normal map strength voor illumination" ask). This is a SEPARATE,
    // always-on dial from applyPointLight's own NORMAL_FLATTEN_NEAR_LIGHT (which only kicks in close to a
    // point light); this one applies everywhere, including the (currently direction-only) ambient term.
    vec3 sampledNormal = normalize(texture2D(uNormal, normalUV).rgb * 2.0 - 1.0);
    vec3 n = (uInstanceKind == 1) ? FLAT_NORMAL : normalize(mix(FLAT_NORMAL, sampledNormal, uNormalStrength));

    // Channel 3 (Disabled) and instances with wave switched off both skip the highlight entirely —
    // trueColor is just the raw diffuse, unmodified — but global illumination + point lights (a separate
    // system) still apply in both cases.
    vec3 trueColor = diffuse.rgb;
    if (uHasWave == 1 && wantsWave) {
        float waveQuant = quantizeWave(wave01, worldX, groundDist);
        if (uDebugChannel == 2) {
            gl_FragColor = vec4(vec3(waveQuant), 1.0);
            return;
        }
        // #141 round 17 (Han, NL: "kan het dat het shimmer effect per ongeluk nog beperkt is tot de
        // bovenste pixels van het gras? Mag op de hele tile, dus de volle 16px hoogte van de grond" —
        // round 10's original "blade tips catch the wind" restriction to the floor's top few native rows
        // is removed; the highlight now runs across the floor's own full tile height, same as every other
        // waving instance).
        vec3 ambientLight = normalize(vec3(0.0, 0.5, 0.8));
        float ambientNdotl = max(dot(n, ambientLight), 0.0);
        // Floor keeps its own (less ambient-dependent) weighting from round 11; every other waving
        // instance uses the sprite weighting unchanged since round 8.
        float ambientWeight = (uInstanceKind == 1) ? (0.6 + 0.4 * ambientNdotl) : (0.4 + 0.6 * ambientNdotl);
        float strengthScale = uHighlightStrength * ambientWeight;
        trueColor = blendHighlightDual(diffuse.rgb, HIGHLIGHT_COLOR, waveQuant, strengthScale, uWaveBlendMode, uWaveBlendMode2);

        // #1032 round 7 redesign (Han: "wat white cap strength doet: het maakt wat wit is in de water
        // sprite nog witter. Wat ik EIGENLIJK wou is wat wit is in de wave band duidelijk maken op het
        // water"): the ORIGINAL version (below, removed) checked the raw SOURCE SPRITE's own diffuse
        // luminance — Han's actual intent is a crest wherever the WAVE BAND ITSELF (waveQuant, the
        // shimmer's own animated highlight, already blended into trueColor above) is bright, not
        // wherever the underlying art happens to have white pixels baked in. Needs waveQuant in scope,
        // hence moved inside this branch — a white cap only makes sense where a wave band exists at all.
        if (waveQuant > uWhiteCapThreshold) {
            float capMix = clamp((waveQuant - uWhiteCapThreshold) / max(1.0 - uWhiteCapThreshold, 0.0001), 0.0, 1.0) * uWhiteCapStrength;
            trueColor = mix(trueColor, vec3(1.0), capMix);
        }
    } else if (uDebugChannel == 2) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Global illumination (round 11): darken toward AMBIENT_DARK_COLOR, never pure black; point lights then
    // REVEAL trueColor back out of the darkness (see applyPointLight) instead of adding brightness on top.
    vec3 ambientTint = mix(AMBIENT_DARK_COLOR, vec3(1.0), uGlobalIllumination);
    vec3 darkened = trueColor * ambientTint;
    vec3 lit = applyPointLights(trueColor, darkened, n, worldX, groundDist, edgeFactor);
    float moonRim = moonRimFactor(uDiffuse, duv, texelSize, uDiffuseUV);   // #weather §370
    lit = applyMoonLight(lit, diffuse.rgb, n, edgeFactor, moonRim);   // #weather §362/§370 — moon sheen + rim
    // §377: the sun edge-glow, masked to a screen-space disc around the sun. Reuses the SAME
    // gl_FragCoord → top-down canvas-px flip localYPx already does above (uCanvasSize.y - gl_FragCoord.y),
    // normalised by the canvas WIDTH on BOTH axes so the mask is isotropic and dpr-free. Reuses the
    // moonRim value too — one rim definition, zero extra texture fetches.
    vec2 sunFragUnit = vec2(gl_FragCoord.x, uCanvasSize.y - gl_FragCoord.y) / uCanvasSize.x;
    lit = applySunGlow(lit, diffuse.rgb, edgeFactor, moonRim, uDiffuse, duv, texelSize, sunFragUnit);   // §377
    gl_FragColor = vec4(lit, diffuse.a);
}
`;

// #1162 Fase 10c (docs/architecture.md §339/§340): the instanced draw path, moved here from
// FoliageInstancingTest.jsx (the isolated proving ground — see that file's own header comment, kept
// around as a debug tool per Han's own call) once verified working end to end. Renders atlas-backed
// instances — currently LDtk-mode foliage only (`useLdtkFoliageAtlas.js`); Legacy mode and water instances
// still go through the ORIGINAL per-instance loop below, completely unchanged.
//
// Per-instance data layout (5 vec4 attributes — packs the ~18 values that vary per instance in the OLD
// per-instance-uniform loop; everything that's actually a shared debug-panel dial (uSkewAmount/
// uStretchAmount/uWaveSteps/etc.) stays a plain per-draw-call uniform, unchanged, since those are already
// identical across every instance even in the old loop — confirmed by re-reading the old loop's exact
// gl.uniform* calls before writing this, not assumed):
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

// Fragment shader: line-for-line the SAME math as VERTEX_SRC/FRAGMENT_SRC above's main() (#141's many
// tuning rounds — see that shader for the full history of every constant/formula below), with ONLY the
// per-instance uniform reads swapped for the varyings the vertex shader above now feeds. The int
// comparisons (uInstanceKind == 0 etc.) become float threshold checks (vInstanceKind < 0.5) since
// varyings can't be int. gl_FragCoord-based derivation is intentionally UNCHANGED — see §339 for why
// that's still safe with per-instance varyings (bit-identical at all 4 quad corners, so GPU interpolation
// introduces no precision loss the way a genuinely-varying UV like vUV.x would).
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

    // #1219: discard fragments a wind bend pushed outside this sprite's own [0, W-1] column range
    // instead of clamping them onto the edge texel column (bright specks outside the silhouette). Floor
    // (kind 1) keeps the clamp. See the non-instanced shader's fuller comment above.
    float shiftedNativeXraw = nativeX + totalShiftPx;
    if (vInstanceKind < 0.5 && (shiftedNativeXraw < 0.0 || shiftedNativeXraw > vWorldWidth - 1.0)) discard;
    float shiftedNativeX = clamp(shiftedNativeXraw, 0.0, vWorldWidth - 1.0);
    vec2 duv = vec2(
        mix(vDiffuseUV.x, vDiffuseUV.z, (shiftedNativeX + 0.5) / vWorldWidth),
        mix(vDiffuseUV.y, vDiffuseUV.w, (nativeY + 0.5) / vWorldHeight)
    );
    // #weather §368 r3 (Han: "allicht een probleem met het lijmen van de normal-maps? In debug zie ik dat
    // die is opgebouwd in stroken; lijkt of die stroken strepen geven die prominent zichtbaar zijn in de
    // nacht"). EXACTLY right: this is the instanced path, so uNormal is the shared ATLAS canvas — but
    // normalUV was tile-local [0,1] (correct for the NON-instanced path's per-tile normal texture, wrong
    // here). Every foliage instance was sampling the same [0,1] slice of the packed atlas = a vertical
    // scan across ALL packed rows = the atlas's own strip layout projected onto every tile -> the
    // horizontal stripes, worst at night when the moon lit that garbage relief. Map through vDiffuseUV
    // (the per-instance atlas rect), identical to duv above — the diffuse and normal atlases share one
    // packing layout (useLdtkFoliageAtlas).
    vec2 normalUV = vec2(
        mix(vDiffuseUV.x, vDiffuseUV.z, clamp((shiftedNativeX + 0.5) / vWorldWidth, 0.0, 1.0)),
        mix(vDiffuseUV.y, vDiffuseUV.w, clamp((nativeY + 0.5) / vWorldHeight, 0.0, 1.0))
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

    // #weather §368 r2 (Han: "De illum moet als allerlaatste worden toegepast! Dus na pixel switch en
    // shimmer. De pixels in de boom steken nog steeds hard af, ik zie soms fel-groene pixels.").
    // OLD ORDER: shimmer was baked INTO trueColor, THEN darkened, THEN the point lights / moon "revealed"
    // trueColor (= the SHIMMERED colour) back out at full brightness — so a bright shimmer band (the
    // Color blend mode literally recolours bright pixels to the shimmer hue) got re-lit by the moon into
    // fel-groene pixels + hard horizontal bands.
    // NEW ORDER: the lights/moon reveal the PLAIN diffuse only; the shimmer is applied LAST, on top of
    // the fully-lit/darkened colour, so at night it can only ever be a faint scene-matched sheen.
    vec3 baseColor = diffuse.rgb;
    float waveQuant = 0.0;
    float shimmerStrength = 0.0;
    vec3 shimmerColor = vec3(1.0);
    if (vHasWave > 0.5 && wantsWave) {
        waveQuant = quantizeWave(wave01, worldX, groundDist);
        if (uDebugChannel == 2) {
            gl_FragColor = vec4(vec3(waveQuant), 1.0);
            return;
        }
        vec3 ambientLight = normalize(vec3(0.0, 0.5, 0.8));
        float ambientNdotl = max(dot(n, ambientLight), 0.0);
        float ambientWeight = (vInstanceKind > 0.5) ? (0.6 + 0.4 * ambientNdotl) : (0.4 + 0.6 * ambientNdotl);
        shimmerStrength = uHighlightStrength * ambientWeight;
        // Foliage shimmer tracks day/night — day mint (112,255,153), night blue (49,78,158).
        shimmerColor = mix(vec3(49.0, 78.0, 158.0) / 255.0, vec3(112.0, 255.0, 153.0) / 255.0, clamp(uGlobalIllumination, 0.0, 1.0));
    } else if (uDebugChannel == 2) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // --- illum / lighting: reveals PLAIN diffuse, never the shimmer ---
    vec3 ambientTint = mix(AMBIENT_DARK_COLOR, vec3(1.0), uGlobalIllumination);
    vec3 darkened = baseColor * ambientTint;
    vec3 lit = applyPointLights(baseColor, darkened, n, worldX, groundDist, edgeFactor);
    float moonRim = moonRimFactor(uDiffuse, duv, texelSize, vDiffuseUV);   // #weather §370
    lit = applyMoonLight(lit, diffuse.rgb, n, edgeFactor, moonRim);   // #weather §362/§370 — moon sheen + rim
    // §377: the sun edge-glow — LIGHTING, so it belongs in this block (immediately after the moon),
    // NOT with the "shimmer LAST" block below (§368 r2). Same fragUnit derivation as the non-instanced
    // shader; see applySunGlow's own comment in foliageLightingGLSL.js.
    vec2 sunFragUnit = vec2(gl_FragCoord.x, uCanvasSize.y - gl_FragCoord.y) / uCanvasSize.x;
    lit = applySunGlow(lit, diffuse.rgb, edgeFactor, moonRim, uDiffuse, duv, texelSize, sunFragUnit);   // §377

    // --- shimmer LAST, on the fully-lit colour ---
    if (vHasWave > 0.5 && wantsWave) {
        lit = blendHighlightDual(lit, shimmerColor, waveQuant, shimmerStrength, uWaveBlendMode, uWaveBlendMode2);
        if (waveQuant > vWhiteCapThreshold) {
            float capMix = clamp((waveQuant - vWhiteCapThreshold) / max(1.0 - vWhiteCapThreshold, 0.0001), 0.0, 1.0) * vWhiteCapStrength;
            lit = mix(lit, vec3(1.0), capMix);
        }
    }
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

// Perf (#1162, Fase 10c): takes explicit sources (was hardcoded to VERTEX_SRC/FRAGMENT_SRC) so the SAME
// helper compiles both the original per-instance program and the new instanced one below, without
// duplicating this function.
function createProgram(gl, vertexSrc, fragmentSrc) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
}

function createTexture(gl, image) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    // NEAREST + CLAMP_TO_EDGE, no mipmaps: preserves crisp pixel-art edges (matches `imageRendering:
    // pixelated` elsewhere) instead of the blur mipmapping/linear filtering would introduce.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

// One instance = one quad drawn through the shimmer shader: the tree-foliage crop, or a single grass tuft.
// `diffuseUrl`/`diffuseUV` locate the sprite within its source sheet (same crop convention SheetCrop uses
// elsewhere in RpgLevelPanel); `normalUrl` is one of the pre-generated per-cell normal maps (see
// scripts/generate-tree-normal-maps.mjs) and is sampled 0..1 across the instance's own quad, since each
// normal map is already cropped to exactly one instance's diffuse crop. `worldX`/`worldWidth`/`worldHeight`
// (native, unzoomed px — the SAME coordinate space as RpgLevelPanel's TREE_X/grassTuftPositions) drive the
// wave's world-space sweep, independent of `screenX`/`widthPx` (which are display px, post-ZOOM/camera).
// instance shape: { diffuseUrl, diffuseUV: [u0,v0,u1,v1], normalUrl, screenX, screenY (bottom-center anchor,
// canvas px), widthPx, heightPx, worldX, worldWidth, worldHeight, kind, wave, skew, edgeLitOnly,
// groundDistOffset (OPTIONAL, native px, default 0) }
// `groundDistOffset`: added to the per-pixel `groundDist` the wave/skew/highlight noise samples — leave
// unset (0) for a self-contained instance (one instance = one whole visual object, e.g. every legacy
// tree/tuft/tent/crate instance). Only needed when several SEPARATE instances are stacked to form one
// taller visual object (e.g. the LDtk world's multi-tile-tall foliage columns) — pass each instance's own
// true height above the level's real ground so the noise sweeps continuously up the whole stack instead of
// restarting at every instance boundary (see `uGroundDistOffset`'s own shader-side comment).
// `kind`: 'sprite' (default, omit) = alpha-cutout silhouette (tree canopy/grass tuft/trunk/tent/crate) —
// discards fully-transparent texels. 'floor' = the ground itself, opaque everywhere by construction (the
// stitched exact-tile texture RpgLevelPanel.jsx generates at mount), no alpha-cutout, wind-wave highlight
// runs across its own full tile height (round 17 — no longer restricted to a "top rows" band).
// `wave` (sprite only, default true — omit for tree canopy/grass tufts/tent, which all shimmer): #141
// round 15 (Han: "ik wil hem verlicht, maar geen onderdeel van foliage" [trunk] + "de kisten op de
// voorgrond moeten NIET shimmeren" + "en het tentdoek wel!" [tent]) — pass `wave: false` for instances that
// must be normal-map-LIT but never run the wind-wave highlight (trunk, crates): rigid objects that don't
// move in the wind, unlike leaves/tufts/tent fabric. Orthogonal to `kind` — a 'floor' instance always waves
// (its own top-rows-only rule), independent of this flag.
// `skew` (default false — sprite or floor, doesn't matter): #141 round 16 (Han: "kun je iets proberen dat
// random skew en distort doet... hoe verder van het anker, hoe veller de verplaatsing"): pass `skew: true`
// for instances that should wind-bend (shift which native pixel each row samples, quantized to whole
// pixels — see the shader's own `uHasSkew` comment). Scoped by Han to grass tufts + the tree canopy only —
// NOT the tent (fabric held taut by poles, waves in color but doesn't lean) or trunk/crates/floor (rigid).
// `edgeLitOnly` (sprite only, default false): when true, point lights only tint the outer few px of this
// instance's own silhouette (round 10) — for objects like crates/fences where the solid interior should
// stay dark and only the rim catches ambient light.

// `debugChannel`: 0 = final shimmer (default), 1 = raw normal map, 2 = wave band alone — Han's "let me
// toggle" debug view, in the spirit of the Factorio FFF's own color-coded shader debug visualization.
// #141 round 13 (Han: "ja graag [directional lighting]. ik ga hooguit 10 lichtbronnen in beeld hebben"):
// `lights`, up to MAX_LIGHTS (10) entries: { worldX, worldHeight (height ABOVE ground, 0 for a
// ground-standing character), color: [r,g,b] 0..1 }. Was two fixed props (wispWorldX/heroWorldX) — the wisp
// and hero are now just the first two entries RpgLevelPanel.jsx populates, with room for more (torches,
// campfires, a future fence lantern...) without any shader/plumbing changes. Read fresh every frame via a
// ref so a moving light tracks without recreating the GL context (§141 round 8's original reasoning).
// #925 follow-up (Han 2026-08-16): MAX_LIGHTS now imported from foliageLightingGLSL.js (single source of
// truth shared with the GLSL uniform-array size and LdtkLitGround.jsx) instead of a local duplicate const.

// #141 round 11 (Han: "Zet alle params die je gebruikt in de debug"): every shader dial Han has actually
// asked to tune, bundled into one object so RpgLevelPanel's debug panel only needs one piece of state.
// Defaults here are the values used before this round's tuning pass started, adjusted per this round's
// feedback (highlightStrength lower, screen blend as default for both, etc.) — see the shader's own
// comments for why each default was picked.
export const DEFAULT_FOLIAGE_PARAMS = {
    // #141 round 24 (Han: "preset waarden: A noise scale 0.03, a speed .62, b scale 0.17, b speed [unspec.],
    // steps 5, dither 0.35, strength 0.18, wave blends color and HSV") — a tuned preset from the debug
    // panel; waveSpeedB left as-is (not part of the preset).
    noiseScale: 0.03,
    waveSpeed: 0.62,
    noiseScaleB: 0.17,
    waveSpeedB: 0.3,
    waveSteps: 5,
    ditherAmount: 0.35,
    highlightStrength: 0.18,
    // #141 round 17 (Han: "ik geef even wat defaults door" — a tuned preset from the debug panel):
    // lightRadius/lightHeightRadius tightened, lightStrength maxed, huePull nudged down, and light now
    // defaults to HSV both slots ("blend: HSV (tweede mag weg)" — the second blend-mode slot isn't removed,
    // just defaulted to the SAME mode as the first, so averaging HSV with HSV is a no-op single-mode HSV
    // by default; still independently selectable in the debug panel if Han wants a real dual-blend later).
    lightRadius: 200,
    lightHeightRadius: 240,
    // #141 round 27 (Han: "light preset: strength 1.5, hue pull/tint 0.3, color dodge + additive, flat
    // illum 0.2, normal map 0.8"): lightStrength maxed further, blend now Color Dodge (8) + Additive (2).
    lightStrength: 1.5,
    huePull: 0.3,
    // #141 round 24: "wave blends color and HSV" — Color (6) averaged with HSV (1).
    waveBlendMode: 6,   // 0 Screen, 1 HSV, 2 Additive, 3 Mix, 4 Hue, 5 Saturation, 6 Color, 7 Luminosity, 8 Color Dodge
    waveBlendMode2: 1,  // round 12: averaged 50/50 with waveBlendMode
    lightBlendMode: 8,
    lightBlendMode2: 2,
    // #141 round 27 introduced a 3-level "time of day" picker; #weather (Han 2026-09-01) replaced it
    // with the auto weather cycle (weatherCycle.js). `globalIllumination` is what the shader uniform
    // actually reads; `timeOfDay` is the human-readable phase bucket ('day' | 'dusk-dawn' | 'night'),
    // written alongside it by RpgLevelPanel's cycle driver. Both are eased over ~10 s at a phase edge.
    timeOfDay: 'day',
    globalIllumination: 1.0,   // 1 = full daylight, 0 = fully dark (AMBIENT_DARK_COLOR)
    // #weather §362 (Han 2026-09-01): max strength of the directional top-left "moonlight" reveal. The
    // shader scales it by (1 - globalIllumination) so it only shows as the cycle darkens. Debug slider
    // in FoliageParamsPanel. UAT round 2 (§364, Han: "iets subtieler"): 0.5 → 0.3.
    moonStrength: 0.3,
    // §374 UAT r2 (#1191, Han: "maangloed enkel als de maan schrijnt"): 0..1, how much the REAL moon
    // is lighting the world (RpgLevelPanel derives it from celestialModel — moon altitude + lit
    // fraction). Premultiplied into `uMoonStrength` at every upload site. Default 1 = "always shining"
    // so the dev harness / any caller that doesn't drive it is unchanged.
    moonShine: 1,
    // §377 (#1193): the sun edge-glow channels. These defaults make the WHOLE term a NO-OP for any
    // caller that does not drive it (the FoliageInstancingTest harness, tests) — strength 0
    // short-circuits applySunGlow before it touches a texture, and radius 0 would zero the mask
    // anyway. RpgLevelPanel overwrites all four on every weather push.
    sunGlow: 0,                   // 0..1, quantised to 0.05 like moonShine
    sunGlowColor: SUN_GLOW_RGB,   // 0..255 ints (the app-wide RGB convention); /255 at the upload site
    sunScreenPos: [0, 0],         // canvas-width-normalised [x, y], top-down origin
    sunGlowRadius: 0,             // canvas-width-normalised reach; 0 ⇒ the mask is 0 everywhere
    // #141 round 26 drove skew/stretch off a 3-level low/med/high "weather" picker (1/2/3 px). #weather
    // (Han 2026-09-01): the auto cycle now sets both to the same eased 0..3 wind value every ~3 s; the
    // shader uniforms `uSkewAmount`/`uStretchAmount` read them unchanged.
    skewAmount: 2,
    stretchAmount: 2,
    // #141 round 19 (Han: "maak ook een slider voor normal map strength voor illumination"): 1.0 = current
    // full-relief look, 0.0 = every instance treated as flat "from above" (the floor is ALWAYS pinned flat
    // regardless of this dial — see main()'s own comment). Round 27 preset: 0.8.
    normalStrength: 0.8,
    // #141 round 26 (Han: "voeg een slider toe die naast normal map illumination nog 'flat illumination'
    // doet; radial vanaf de lichtbron... moet worden opgeteld bij de normal map ilum"): see applyPointLight's
    // own comment for the actual math. Also directly explains a separate complaint from round 26 ("de grass
    // tiles worden niet opgelicht") — the floor's hard-pinned FLAT_NORMAL (round 19) makes the DIRECTIONAL
    // term weak for a flat surface not facing the light head-on; this flat/radial term bypasses that gate
    // entirely. Round 27 preset: 0.2.
    flatIllumination: 0.2,
    // #1032 round 8 (Han 2026-08-17, "wave en water mogen dezelfde steps, speed, noise, dither, blend
    // mode hebben... dus enkel white caps op water, alle andere shimmer settings hetzelfde op bomen en
    // water (dus hopelijk lichtere berekening). bomen enzo moeten geen white caps hebben; white cap enkel
    // op water"): round 6/7 gave water its OWN full shimmer preset (steps/dither/blend modes/white caps),
    // but Han reconsidered — ONLY white caps should differ between water and everything else waving
    // (trees/tent/grass); steps/dither/blend mode stay the SHARED `waveSteps`/`ditherAmount`/
    // `waveBlendMode`/`waveBlendMode2` above for every instance, water included (simpler, and per Han's
    // own note, a lighter per-frame computation — fewer uniform branches in the draw loop below). The
    // `water*` variants of those four were removed entirely (dead now that nothing reads them).
    // White caps are the ONE exception: gated to water-only in the draw loop (`inst.isWater ? ... :
    // disabled`), never applied to trees/tent/grass at all — there is no longer a "shared" white cap
    // concept, only this water-exclusive one.
    waterWhiteCapThreshold: 0.7,
    waterWhiteCapStrength: 0.85,
};

// Perf (#1162, Fase 2b): a `{ current: 0 }`-shaped fallback for `cameraOffsetRef` — Legacy-mode call sites
// don't pass one (their `instances` still bake full camera-aware `screenX` the old way, same as always),
// so adding 0 is a genuine no-op there rather than requiring every caller to thread a ref through.
const ZERO_OFFSET_REF = { current: 0 };

function ForegroundFoliageLayer({
    widthPx, heightPx, instances, debugChannel = 0, lights = [],
    params = DEFAULT_FOLIAGE_PARAMS,
    // Perf (#1162, Fase 2b, Han 2026-08-27, "doe ook fase 2 maar!"): the WebGL-instance-layer counterpart
    // to §321's CSS-transform wrappers. `instances[].screenX` is LOCAL/camera-independent when this is
    // set (RpgLevelPanel's LDtk-mode call sites); `cameraOffsetRef.current` — written imperatively every
    // rAF frame by the SAME camera loop that already drives the CSS wrappers — is added directly inside
    // THIS component's own already-continuously-running draw loop (see `uScreenPos`'s own comment there),
    // so camera panning no longer needs a React re-render (or even a prop change) to stay in sync.
    cameraOffsetRef = ZERO_OFFSET_REF,
    // Perf (#1162, Fase 10c, docs/architecture.md §340): `atlas` (the shared `{diffuseCanvas, normalCanvas}`
    // pair `useLdtkFoliageAtlas.js` builds) and `atlasInstances` (instances already carrying an atlas UV
    // rect instead of their own `diffuseUrl`/`normalUrl`) drive a SEPARATE instanced draw pass, additive to
    // the original per-instance loop above — LDtk-mode foliage moves through this new path; Legacy mode and
    // water instances keep going through `instances`/the original loop, completely unchanged. `atlas` is
    // `null` while the atlas hasn't built yet (or the caller doesn't use one, e.g. Legacy mode) — the
    // instanced pass is simply skipped in that case, same "nothing to draw yet" tolerance every other
    // texture-loading path in this file already has.
    atlas = null,
    atlasInstances = [],
}) {
    const canvasRef = useRef(null);
    const instancesRef = useRef(instances);
    instancesRef.current = instances;
    const atlasInstancesRef = useRef(atlasInstances);
    atlasInstancesRef.current = atlasInstances;
    const debugChannelRef = useRef(debugChannel);
    debugChannelRef.current = debugChannel;
    const lightsRef = useRef(lights);
    lightsRef.current = lights;
    const paramsRef = useRef(params);
    paramsRef.current = params;
    // Perf (#1162, Fase 10c): the atlas's two textures are uploaded to the GPU in their OWN effect, keyed
    // on `atlas` identity — separate from the GL-CONTEXT-setup effect below (which only runs once), since
    // the atlas itself can change identity multiple times as `useLdtkFoliageAtlas.js` publishes incremental
    // batches. Mirrors `LdtkLitGround.jsx`'s own "textures re-uploaded only when the composited canvases
    // themselves change" pattern.
    const atlasTexRef = useRef({ diffuse: null, normal: null });
    // Perf (#1162, Fase 10c): holds the live WebGL context so the atlas-texture-upload effect below (keyed
    // on `atlas`, separate from the GL-setup effect which only runs once) can reach it — same `glRef`
    // pattern `LdtkLitGround.jsx` already established for its own textures-change-independently-of-GL-setup
    // case.
    const glRef = useRef(null);
    // Perf (#1162, Fase 9, docs/architecture.md §331): holds the current `drawFrame` closure so the
    // separate `useFrameLoop` subscription below (top-level, can't live inside the GL-setup effect) can
    // call into it without hoisting every local GL variable out to its own ref. `drawingRef` guards against
    // the shared ticker starting a NEW draw while a previous ASYNC one (awaiting texture loads) is still
    // in flight — `drawFrame` is `async`, unlike LdtkLitGround's synchronous one, so this guard is the one
    // real difference from that migration; see this component's own `useFrameLoop` call for the full
    // rationale.
    const drawFrameRef = useRef(null);
    const drawingRef = useRef(false);

    // Backing-store size tracks the container's own resize (RpgLevelPanel's ResizeObserver) independently
    // of GL context setup below — resizing a canvas element never invalidates its WebGL context/resources,
    // so this only needs to touch `canvas.width/height`, not recreate anything. useLayoutEffect (not
    // useEffect) so the resize commits before paint — avoids a one-frame stretched/stale-resolution flash
    // when the container size changes (CLAUDE.md §6: useLayoutEffect for DOM setup the next frame must see).
    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(widthPx * dpr);
        canvas.height = Math.round(heightPx * dpr);
    }, [widthPx, heightPx]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
        if (!gl) {
            // System-boundary capability check (browser/GPU support), not an impossible internal state —
            // logged and left to render nothing rather than crashing the level scene (§7a).
            logger.warn('ForegroundFoliageLayer', 'WebGL unavailable — tree/grass shimmer disabled');
            return undefined;
        }
        glRef.current = gl;
        // CORRECTION (Han caught this in review — foliage rendered upside down, and grass sampled the wrong
        // sheet row entirely): WebGL's DEFAULT (no flip) upload already stores an image's row 0 — its
        // visual TOP row — at texel v=0, which is exactly the top-left-origin convention `diffuseUV`/`vUV`
        // and the normal-map generator's `cropRegion` already assume. Setting UNPACK_FLIP_Y_WEBGL=true (the
        // previous line here) mirrors the WHOLE source image vertically before upload — harmless-looking on
        // the tree sheet (a single row, so the crop still lands on the right cell, just upside down) but
        // catastrophic on `Decor.png` (17 rows) — row 5's grass tufts got remapped to a DIFFERENT row's
        // content entirely (twigs), which is exactly what Han saw. Leaving flipY at its default (false)
        // fixes both: no pixelStorei call needed.

        let program;
        try {
            program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
        } catch (err) {
            logger.error('ForegroundFoliageLayer', 'E021-FOLIAGE-SHADER-COMPILE', err);
            return undefined;
        }
        gl.useProgram(program);

        const aPos = gl.getAttribLocation(program, 'aPos');
        const quadBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        const uScreenPos = gl.getUniformLocation(program, 'uScreenPos');
        const uSizePx = gl.getUniformLocation(program, 'uSizePx');
        const uCanvasSize = gl.getUniformLocation(program, 'uCanvasSize');
        const uDiffuseUV = gl.getUniformLocation(program, 'uDiffuseUV');
        const uTime = gl.getUniformLocation(program, 'uTime');
        const uDiffuse = gl.getUniformLocation(program, 'uDiffuse');
        const uNormal = gl.getUniformLocation(program, 'uNormal');
        const uWorldCenterX = gl.getUniformLocation(program, 'uWorldCenterX');
        const uWorldWidth = gl.getUniformLocation(program, 'uWorldWidth');
        const uWorldHeight = gl.getUniformLocation(program, 'uWorldHeight');
        const uGroundDistOffset = gl.getUniformLocation(program, 'uGroundDistOffset');
        const uDebugChannel = gl.getUniformLocation(program, 'uDebugChannel');
        const uInstanceKind = gl.getUniformLocation(program, 'uInstanceKind');
        const uHasWave = gl.getUniformLocation(program, 'uHasWave');
        const uHasSkew = gl.getUniformLocation(program, 'uHasSkew');
        const uSkewAmount = gl.getUniformLocation(program, 'uSkewAmount');
        const uStretchAmount = gl.getUniformLocation(program, 'uStretchAmount');
        const uLightCount = gl.getUniformLocation(program, 'uLightCount');
        const uLightWorldX = gl.getUniformLocation(program, 'uLightWorldX');
        const uLightWorldHeight = gl.getUniformLocation(program, 'uLightWorldHeight');
        const uLightColor = gl.getUniformLocation(program, 'uLightColor');
        const uEdgeLitOnly = gl.getUniformLocation(program, 'uEdgeLitOnly');
        const uNoiseScale = gl.getUniformLocation(program, 'uNoiseScale');
        const uWaveSpeed = gl.getUniformLocation(program, 'uWaveSpeed');
        const uNoiseScaleB = gl.getUniformLocation(program, 'uNoiseScaleB');
        const uWaveSpeedB = gl.getUniformLocation(program, 'uWaveSpeedB');
        const uWaveSteps = gl.getUniformLocation(program, 'uWaveSteps');
        const uDitherAmount = gl.getUniformLocation(program, 'uDitherAmount');
        const uHighlightStrength = gl.getUniformLocation(program, 'uHighlightStrength');
        const uLightRadius = gl.getUniformLocation(program, 'uLightRadius');
        const uLightHeightRadius = gl.getUniformLocation(program, 'uLightHeightRadius');
        const uLightStrength = gl.getUniformLocation(program, 'uLightStrength');
        const uHuePull = gl.getUniformLocation(program, 'uHuePull');
        const uWaveBlendMode = gl.getUniformLocation(program, 'uWaveBlendMode');
        const uWaveBlendMode2 = gl.getUniformLocation(program, 'uWaveBlendMode2');
        const uLightBlendMode = gl.getUniformLocation(program, 'uLightBlendMode');
        const uLightBlendMode2 = gl.getUniformLocation(program, 'uLightBlendMode2');
        const uGlobalIllumination = gl.getUniformLocation(program, 'uGlobalIllumination');
        const uNormalStrength = gl.getUniformLocation(program, 'uNormalStrength');
        const uFlatIllumination = gl.getUniformLocation(program, 'uFlatIllumination');
        const uWhiteCapThreshold = gl.getUniformLocation(program, 'uWhiteCapThreshold');
        const uWhiteCapStrength = gl.getUniformLocation(program, 'uWhiteCapStrength');
        const uMoonStrength = gl.getUniformLocation(program, 'uMoonStrength');   // #weather §362
        // §377 (#1193) — the sun edge-glow. A null location here is harmless by design (see the
        // uniform block's own contract comment in foliageLightingGLSL.js).
        const uSunGlowStrength = gl.getUniformLocation(program, 'uSunGlowStrength');
        const uSunGlowColor = gl.getUniformLocation(program, 'uSunGlowColor');
        const uSunScreenPos = gl.getUniformLocation(program, 'uSunScreenPos');
        const uSunGlowRadius = gl.getUniformLocation(program, 'uSunGlowRadius');

        // Perf (#1162, Fase 10c, docs/architecture.md §339/§340): the instanced program is compiled
        // ADDITIONALLY, alongside the original per-instance `program` above — both stay live for the whole
        // component lifetime, since Legacy-mode instances (`instances` prop) keep using the original path
        // every frame while LDtk-mode atlas instances (`atlasInstances` prop) use this one. `ANGLE_instanced_
        // arrays` unavailability is treated the same as "WebGL unavailable" elsewhere in this file (§7a
        // system-boundary tolerance) — the instanced pass is simply skipped (`instExt` stays null, checked
        // in `drawFrame` below) rather than crashing the whole layer; the original per-instance path is
        // unaffected either way.
        const instExt = gl.getExtension('ANGLE_instanced_arrays');
        let instProgram = null;
        let instLocs = null;
        let instanceBuf = null;
        if (instExt) {
            try {
                instProgram = createProgram(gl, VERTEX_SRC_INSTANCED, FRAGMENT_SRC_INSTANCED);
            } catch (err) {
                logger.error('ForegroundFoliageLayer', 'E021-FOLIAGE-SHADER-COMPILE', err);
                instProgram = null;
            }
        }
        if (instProgram) {
            const instAPos = gl.getAttribLocation(instProgram, 'aPos');
            instanceBuf = gl.createBuffer();
            // Per-instance attribute locations — 5 vec4's packed into one interleaved buffer (layout
            // documented at VERTEX_SRC_INSTANCED's own header comment above). `divisor=1` (set once here,
            // not per-frame) makes each attribute advance once per INSTANCE instead of once per VERTEX.
            const instAInstanceLocs = [0, 1, 2, 3, 4].map((i) => gl.getAttribLocation(instProgram, `aInstance${i}`));
            const instUniforms = {};
            ['uDiffuse', 'uNormal', 'uCanvasSize', 'uTime', 'uDebugChannel', 'uSkewAmount', 'uStretchAmount',
                'uLightCount', 'uLightWorldX', 'uLightWorldHeight', 'uLightColor',
                'uNoiseScale', 'uWaveSpeed', 'uNoiseScaleB', 'uWaveSpeedB', 'uWaveSteps', 'uDitherAmount',
                'uHighlightStrength', 'uWaveBlendMode', 'uWaveBlendMode2',
                'uLightRadius', 'uLightHeightRadius', 'uLightStrength', 'uHuePull', 'uLightBlendMode', 'uLightBlendMode2',
                'uGlobalIllumination', 'uNormalStrength', 'uFlatIllumination', 'uMoonStrength',
                // §377 (#1193) — the sun edge-glow, same four as the per-instance program above.
                'uSunGlowStrength', 'uSunGlowColor', 'uSunScreenPos', 'uSunGlowRadius',
            ].forEach((name) => { instUniforms[name] = gl.getUniformLocation(instProgram, name); });
            instLocs = { aPos: instAPos, aInstance: instAInstanceLocs, uniforms: instUniforms };
        }

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Textures are loaded once per distinct URL and cached across frames/re-renders — instances share
        // the same tree-foliage/grass-cell textures, so this avoids re-decoding the same PNG per instance.
        const textureCache = new Map();
        let cancelled = false;
        // #141 round 21 CRITICAL BUG FIX (Han, NL: "ik zie de assets een paar frames, en dan verdwijnen"):
        // this used to `await loadImage(url)` with no try/catch. If EVEN ONE texture URL ever failed to
        // load (a network hiccup, a slow/huge runtime-generated data URL, anything) the rejection propagated
        // straight up through the un-guarded `await getTexture(...)` calls in `draw()` below — since that
        // throw happened BEFORE draw()'s own `raf = requestAnimationFrame(draw)` line at the very end, the
        // entire shared render loop died right there, silently (an unhandled rejection most users never see
        // in devtools), leaving the canvas blank forever — exactly "visible for a few frames [while cached
        // textures were still being drawn], then gone [the frame a new texture's load rejected]". Now a
        // failed load is caught, logged ONCE, and cached as `null` so this exact URL isn't retried every
        // single frame — that one instance just never draws, instead of taking down every other instance
        // (and every future frame) with it.
        async function getTexture(url) {
            // #924 (Han 2026-08-12, "maak een failsafe voor als de normal maps weg zijn"): a missing
            // pre-generated normal map asset now resolves to `undefined` at import time (RpgLevelPanel.jsx's
            // import.meta.glob lookup) rather than failing the build — guard against actually trying to
            // load `undefined` here (browsers' handling of `<img>.src = undefined` is inconsistent), same
            // "skip this one instance, log once, never crash the shared render loop" outcome as a genuine
            // network failure below.
            if (!url) return null;
            if (textureCache.has(url)) return textureCache.get(url);
            try {
                const img = await loadImage(url);
                if (cancelled) return null;
                const tex = createTexture(gl, img);
                textureCache.set(url, tex);
                return tex;
            } catch (err) {
                logger.error('ForegroundFoliageLayer', 'E022-FOLIAGE-TEXTURE-LOAD', err, { url });
                textureCache.set(url, null);
                return null;
            }
        }

        // Instance positions/sizes from the caller are in the SAME CSS-px space as `worldToScreenX`/`ZOOM`
        // elsewhere in RpgLevelPanel; `dpr` converts them into backing-store px (set by the sizing
        // useLayoutEffect above) right before each draw.
        const dpr = window.devicePixelRatio || 1;

        // Reused every frame (avoids reallocating a new typed array 60x/sec) — round 13's up-to-MAX_LIGHTS array.
        const lightWorldXBuf = new Float32Array(MAX_LIGHTS);
        const lightWorldHeightBuf = new Float32Array(MAX_LIGHTS);
        const lightColorBuf = new Float32Array(MAX_LIGHTS * 3);

        const startTime = performance.now();
        // #141 round 21 CRITICAL BUG FIX, defense-in-depth (Han: "dit is een critical bug"): the texture-
        // load fix above (see getTexture's own comment) addresses the ROOT CAUSE Han actually hit, but this
        // try/catch/finally is the general guarantee — NOTHING that can go wrong inside a single frame
        // (a WebGL call on a lost context, a future bug, anything) should ever be able to permanently kill
        // the shared render loop again.
        // Perf (#1162, Fase 9): the scheduling wrapper this used to be (`draw`, calling itself via
        // `requestAnimationFrame` in `finally`) moved to the `useFrameLoop` subscription below — this
        // function is now just "run one frame", invoked BY that subscription's own in-flight guard
        // (`drawingRef`), which replaces what the old `raf = requestAnimationFrame(draw)`-in-`finally`
        // achieved (never starting a new frame while the previous async one is still awaiting textures).
        const runOneDrawFrame = async () => {
            if (cancelled) return;
            try {
                await drawFrame();
            } catch (err) {
                logger.error('ForegroundFoliageLayer', 'E023-FOLIAGE-DRAW-FRAME', err);
            }
        };
        drawFrameRef.current = runOneDrawFrame;
        const drawFrame = async () => {
            const time = (performance.now() - startTime) / 1000;
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(program);
            gl.uniform2f(uCanvasSize, canvas.width, canvas.height);
            gl.uniform1f(uTime, time);
            gl.uniform1i(uDebugChannel, debugChannelRef.current);

            const activeLights = lightsRef.current.slice(0, MAX_LIGHTS);
            activeLights.forEach((light, i) => {
                lightWorldXBuf[i] = light.worldX;
                lightWorldHeightBuf[i] = light.worldHeight || 0;
                lightColorBuf[i * 3] = light.color[0];
                lightColorBuf[i * 3 + 1] = light.color[1];
                lightColorBuf[i * 3 + 2] = light.color[2];
            });
            gl.uniform1i(uLightCount, activeLights.length);
            gl.uniform1fv(uLightWorldX, lightWorldXBuf);
            gl.uniform1fv(uLightWorldHeight, lightWorldHeightBuf);
            gl.uniform3fv(uLightColor, lightColorBuf);

            const p = paramsRef.current;
            gl.uniform1f(uNoiseScale, p.noiseScale);
            gl.uniform1f(uWaveSpeed, p.waveSpeed);
            gl.uniform1f(uNoiseScaleB, p.noiseScaleB);
            gl.uniform1f(uWaveSpeedB, p.waveSpeedB);
            gl.uniform1f(uWaveSteps, p.waveSteps);
            gl.uniform1f(uDitherAmount, p.ditherAmount);
            gl.uniform1f(uHighlightStrength, p.highlightStrength);
            gl.uniform1f(uLightRadius, p.lightRadius);
            gl.uniform1f(uLightHeightRadius, p.lightHeightRadius);
            gl.uniform1f(uLightStrength, p.lightStrength);
            gl.uniform1f(uHuePull, p.huePull);
            gl.uniform1i(uWaveBlendMode, p.waveBlendMode);
            gl.uniform1i(uWaveBlendMode2, p.waveBlendMode2);
            gl.uniform1i(uLightBlendMode, p.lightBlendMode);
            gl.uniform1i(uLightBlendMode2, p.lightBlendMode2);
            gl.uniform1f(uGlobalIllumination, p.globalIllumination);
            gl.uniform1f(uSkewAmount, p.skewAmount);
            gl.uniform1f(uStretchAmount, p.stretchAmount);
            gl.uniform1f(uNormalStrength, p.normalStrength);
            gl.uniform1f(uFlatIllumination, p.flatIllumination);
            // §374 UAT r2 (#1191, Han: "maangloed enkel als de maan schrijnt"): premultiply by the
            // REAL moon's shine (0 when it is below the horizon or new) so §370's sheen/rim only show
            // when the moon is actually up and lit. `?? 1` keeps non-world callers unchanged.
            gl.uniform1f(uMoonStrength, (p.moonStrength ?? 0.5) * (p.moonShine ?? 1));   // #weather §362 / §374
            // §377 (#1193): the sun edge-glow. `sunGlowColor` arrives as 0..255 ints (the app-wide RGB
            // convention — AMBIENT_DARK_RGB, SUNSET_RGB, SUN_GLOW_RGB, mixRgb/lerpRgb all use it) while
            // the shader wants 0..1, exactly like the WISP/HERO/CAMPFIRE light colours. The `??`
            // fallbacks make this a strict no-op for any caller that does not drive the channels.
            const sunPos = p.sunScreenPos ?? [0, 0];
            const sunCol = p.sunGlowColor ?? SUN_GLOW_RGB;
            gl.uniform1f(uSunGlowStrength, p.sunGlow ?? 0);
            gl.uniform3f(uSunGlowColor, sunCol[0] / 255, sunCol[1] / 255, sunCol[2] / 255);
            gl.uniform2f(uSunScreenPos, sunPos[0], sunPos[1]);
            gl.uniform1f(uSunGlowRadius, p.sunGlowRadius ?? 0);
            // uWhiteCapThreshold/uWhiteCapStrength: no longer set here — round 8 made white caps
            // per-instance-only (water exclusive), see the draw loop below.

            // Perf (#1162, Fase 2b): viewport culling — previously done once per React render in
            // RpgLevelPanel.jsx (`cullToViewport`, camera-aware, so it had to re-run on every panning
            // frame there too); now redone HERE, every draw-loop frame, against the LIVE camera offset —
            // consistent with `instances` itself now arriving un-culled/camera-independent from the
            // caller (see `cameraOffsetRef`'s own comment). Same margin RpgLevelPanel's own
            // `CULL_MARGIN_PX` used, kept in sync manually (no shared import — this file has no existing
            // dependency on RpgLevelPanel.jsx and shouldn't gain one for one constant).
            const camOffsetPx = cameraOffsetRef.current;
            const cullMinX = -400, cullMaxX = (canvas.width / dpr) + 400;
            for (const inst of instancesRef.current) {
                const screenX = inst.screenX + camOffsetPx;
                if (screenX < cullMinX || screenX > cullMaxX) continue;
                const diffuseTex = await getTexture(inst.diffuseUrl);
                const normalTex = await getTexture(inst.normalUrl);
                if (!diffuseTex || !normalTex || cancelled) continue;

                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, diffuseTex);
                gl.uniform1i(uDiffuse, 0);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, normalTex);
                gl.uniform1i(uNormal, 1);

                // Perf (#1162, Fase 2b, Han 2026-08-27, "doe ook fase 2 maar!"): `screenX` (computed just
                // above, for culling) already has the live camera offset folded in — see this component's
                // own `cameraOffsetRef` prop comment for the full rationale.
                // #UI-overhaul Stap 3 (§327 finding 2) snapped the quad's CENTRE and SIZE to whole device
                // pixels independently. #weather §364 r2 (Han: "ik zie de naden nog steeds"): that still
                // seams on a FRACTIONAL dpr (Windows 125% / 150% display scaling → dpr 1.25 / 1.5),
                // because `round(centre·dpr) + round(size·dpr)/2` for tile A and tile B drift ±1 device px
                // apart at some boundaries and tile the gap across the grid. Fix: snap the quad's four
                // EDGES to whole device pixels — a tile's right edge is then EXACTLY its neighbour's left
                // edge at any dpr (`round((cx+w/2)·dpr) == round((cxNext-w/2)·dpr)` since `cx+w/2 ==
                // cxNext-w/2`). `screenX` is the tile CENTRE (localX = tile.worldX + gridSize/2);
                // `screenY` is the tile's BOTTOM edge, the quad extends `heightPx` upward.
                const lDev = Math.round((screenX - inst.widthPx / 2) * dpr);
                const rDev = Math.round((screenX + inst.widthPx / 2) * dpr);
                const bDev = Math.round(inst.screenY * dpr);
                const tDev = Math.round((inst.screenY - inst.heightPx) * dpr);
                gl.uniform2f(uScreenPos, (lDev + rDev) / 2, bDev);
                gl.uniform2f(uSizePx, rDev - lDev, bDev - tDev);
                gl.uniform4f(uDiffuseUV, ...inst.diffuseUV);
                gl.uniform1f(uWorldCenterX, inst.worldX);
                gl.uniform1f(uWorldWidth, inst.worldWidth);
                gl.uniform1f(uWorldHeight, inst.worldHeight);
                gl.uniform1f(uGroundDistOffset, inst.groundDistOffset || 0);
                gl.uniform1i(uInstanceKind, inst.kind === 'floor' ? 1 : 0);
                gl.uniform1i(uHasWave, inst.wave === false ? 0 : 1);
                gl.uniform1f(uWaveSteps, p.waveSteps);
                gl.uniform1f(uDitherAmount, p.ditherAmount);
                gl.uniform1i(uWaveBlendMode, p.waveBlendMode);
                gl.uniform1i(uWaveBlendMode2, p.waveBlendMode2);
                // #1032 round 8 (Han: "white cap enkel op water"): the ONE shimmer param that's still
                // per-instance — 0 strength is a genuine no-op (`capMix` collapses to 0), disabling the
                // effect entirely for trees/tent/grass rather than falling back to some other "shared"
                // white cap value (that shared concept no longer exists).
                gl.uniform1f(uWhiteCapThreshold, inst.isWater ? p.waterWhiteCapThreshold : 1.0);
                gl.uniform1f(uWhiteCapStrength, inst.isWater ? p.waterWhiteCapStrength : 0.0);
                gl.uniform1i(uHasSkew, inst.skew ? 1 : 0);
                gl.uniform1i(uEdgeLitOnly, inst.edgeLitOnly ? 1 : 0);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }

            // Perf (#1162, Fase 10c): the new instanced pass — ADDITIVE to the per-instance loop above, not
            // a replacement (Legacy mode and water instances still arrive via `instances`/the loop above;
            // only LDtk-mode foliage arrives via `atlasInstances`, see this component's own prop comment).
            // Skips cleanly if the atlas hasn't uploaded its textures yet, there's nothing to draw, or the
            // instancing extension/program failed to set up (`instProgram`/`instExt` null) — same "nothing
            // to draw yet" tolerance as every other texture-loading path in this file.
            const atlasTex = atlasTexRef.current;
            const visibleAtlas = instProgram && instExt && atlasTex.diffuse && atlasTex.normal
                ? atlasInstancesRef.current.filter((inst) => {
                    const screenX = inst.screenX + camOffsetPx;
                    return screenX >= cullMinX && screenX <= cullMaxX;
                })
                : [];
            if (visibleAtlas.length > 0) {
                gl.useProgram(instProgram);
                const { aPos: iAPos, aInstance: iAInstance, uniforms: iu } = instLocs;

                gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
                gl.enableVertexAttribArray(iAPos);
                gl.vertexAttribPointer(iAPos, 2, gl.FLOAT, false, 0, 0);

                const FLOATS_PER_INSTANCE = 20; // 5 vec4's — see VERTEX_SRC_INSTANCED's layout comment
                const data = new Float32Array(visibleAtlas.length * FLOATS_PER_INSTANCE);
                visibleAtlas.forEach((inst, i) => {
                    const off = i * FLOATS_PER_INSTANCE;
                    const screenX = inst.screenX + camOffsetPx;
                    // Same four-EDGE device-pixel snap as the per-instance loop above (#weather §364 r2 —
                    // fractional-dpr seam fix). Identical formula so both paths tile the same way.
                    const lDev = Math.round((screenX - inst.widthPx / 2) * dpr);
                    const rDev = Math.round((screenX + inst.widthPx / 2) * dpr);
                    const bDev = Math.round(inst.screenY * dpr);
                    const tDev = Math.round((inst.screenY - inst.heightPx) * dpr);
                    data.set([(lDev + rDev) / 2, bDev, rDev - lDev, bDev - tDev], off);
                    data.set(inst.diffuseUV, off + 4);
                    data.set([inst.worldX, inst.worldWidth, inst.worldHeight, inst.groundDistOffset || 0], off + 8);
                    data.set([inst.kind === 'floor' ? 1 : 0, inst.wave === false ? 0 : 1, inst.skew ? 1 : 0, inst.edgeLitOnly ? 1 : 0], off + 12);
                    data.set([inst.isWater ? p.waterWhiteCapThreshold : 1.0, inst.isWater ? p.waterWhiteCapStrength : 0.0, 0, 0], off + 16);
                });

                gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
                gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
                const STRIDE = FLOATS_PER_INSTANCE * 4;
                iAInstance.forEach((loc, i) => {
                    gl.enableVertexAttribArray(loc);
                    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, STRIDE, i * 16);
                    instExt.vertexAttribDivisorANGLE(loc, 1);
                });

                gl.uniform2f(iu.uCanvasSize, canvas.width, canvas.height);
                gl.uniform1f(iu.uTime, time);
                gl.uniform1i(iu.uDebugChannel, debugChannelRef.current);
                gl.uniform1f(iu.uSkewAmount, p.skewAmount);
                gl.uniform1f(iu.uStretchAmount, p.stretchAmount);
                gl.uniform1i(iu.uLightCount, activeLights.length);
                gl.uniform1fv(iu.uLightWorldX, lightWorldXBuf);
                gl.uniform1fv(iu.uLightWorldHeight, lightWorldHeightBuf);
                gl.uniform3fv(iu.uLightColor, lightColorBuf);
                gl.uniform1f(iu.uNoiseScale, p.noiseScale);
                gl.uniform1f(iu.uWaveSpeed, p.waveSpeed);
                gl.uniform1f(iu.uNoiseScaleB, p.noiseScaleB);
                gl.uniform1f(iu.uWaveSpeedB, p.waveSpeedB);
                gl.uniform1f(iu.uWaveSteps, p.waveSteps);
                gl.uniform1f(iu.uDitherAmount, p.ditherAmount);
                gl.uniform1f(iu.uHighlightStrength, p.highlightStrength);
                gl.uniform1i(iu.uWaveBlendMode, p.waveBlendMode);
                gl.uniform1i(iu.uWaveBlendMode2, p.waveBlendMode2);
                gl.uniform1f(iu.uLightRadius, p.lightRadius);
                gl.uniform1f(iu.uLightHeightRadius, p.lightHeightRadius);
                gl.uniform1f(iu.uLightStrength, p.lightStrength);
                gl.uniform1f(iu.uHuePull, p.huePull);
                gl.uniform1i(iu.uLightBlendMode, p.lightBlendMode);
                gl.uniform1i(iu.uLightBlendMode2, p.lightBlendMode2);
                gl.uniform1f(iu.uGlobalIllumination, p.globalIllumination);
                gl.uniform1f(iu.uNormalStrength, p.normalStrength);
                gl.uniform1f(iu.uFlatIllumination, p.flatIllumination);
                gl.uniform1f(iu.uMoonStrength, (p.moonStrength ?? 0.5) * (p.moonShine ?? 1));   // #weather §362 / §374 (see non-instanced path)
                // §377 (#1193) — identical four uploads as the per-instance path above.
                gl.uniform1f(iu.uSunGlowStrength, p.sunGlow ?? 0);
                gl.uniform3f(iu.uSunGlowColor, sunCol[0] / 255, sunCol[1] / 255, sunCol[2] / 255);
                gl.uniform2f(iu.uSunScreenPos, sunPos[0], sunPos[1]);
                gl.uniform1f(iu.uSunGlowRadius, p.sunGlowRadius ?? 0);

                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, atlasTex.diffuse);
                gl.uniform1i(iu.uDiffuse, 0);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, atlasTex.normal);
                gl.uniform1i(iu.uNormal, 1);

                // ONE draw call for the whole visible atlas-backed set — this is the entire point of Fase
                // 10c: replaces what would otherwise be `visibleAtlas.length` separate `gl.drawArrays` +
                // ~17 `gl.uniform*` calls each (the exact per-instance WebGL-API overhead §328's real-
                // hardware trace pointed at).
                instExt.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 4, visibleAtlas.length);

                // Restore the per-instance program's `aPos` binding for the NEXT frame's per-instance loop
                // (which reuses `quadBuf`/`aPos` from the original program — switching `gl.useProgram` back
                // is enough; vertex attribute state is per-context, not per-program, but `aPos`'s divisor
                // must be reset to 0 since only the instanced attributes above should ever advance per-
                // instance).
                gl.useProgram(program);
                iAInstance.forEach((loc) => { instExt.vertexAttribDivisorANGLE(loc, 0); gl.disableVertexAttribArray(loc); });
            }
        };
        return () => {
            cancelled = true;
            drawFrameRef.current = null;
        };
        // #141 round 24 CRITICAL REGRESSION FIX (Han's console log: "E021-FOLIAGE-SHADER-COMPILE Error:
        // null" from compileShader, on every load): round 22 added an explicit `WEBGL_lose_context.
        // loseContext()` call to THIS cleanup as a "defense in depth" backstop. That directly broke the app
        // — `main.jsx` wraps everything in `<React.StrictMode>`, which INTENTIONALLY double-invokes every
        // mount effect in dev (mount → cleanup → mount) specifically to catch effects that don't clean up
        // safely. The first mount's cleanup called loseContext() on the canvas's WebGL context; per spec, a
        // canvas whose context was explicitly lost this way does NOT get a fresh one from a later
        // `getContext('webgl')` call on the SAME element — it returns the SAME, now-permanently-lost
        // context. The second (real) mount then tried to `compileShader`/`linkProgram` on that dead context,
        // and `getShaderInfoLog` on a lost context returns `null` — exactly "Error: null". Removed entirely;
        // §160's actual fix (RpgLevelPanel.jsx's `size.w > 0` gate removal, preventing the REPEATED remounts
        // that motivated this backstop in the first place) stands on its own and needs no companion cleanup
        // here. Letting React/the browser garbage-collect an abandoned WebGL context on unmount is the
        // normal, StrictMode-safe behavior every other canvas-using component in the ecosystem relies on.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- gl setup runs once; instances read live via instancesRef
    }, []);

    // Perf (#1162, Fase 10c): the atlas's two textures re-upload whenever `atlas` itself changes identity
    // (built once, then republished incrementally as `useLdtkFoliageAtlas.js` finishes more idle-callback
    // batches — see that hook's own comment). Old textures are deleted on cleanup so a fast sequence of
    // incremental atlas updates doesn't leak GPU texture memory.
    useEffect(() => {
        const gl = glRef.current;
        if (!gl || !atlas) return undefined;
        const diffuseTex = createTexture(gl, atlas.diffuseCanvas);
        const normalTex = createTexture(gl, atlas.normalCanvas);
        atlasTexRef.current = { diffuse: diffuseTex, normal: normalTex };
        return () => {
            gl.deleteTexture(diffuseTex);
            gl.deleteTexture(normalTex);
            atlasTexRef.current = { diffuse: null, normal: null };
        };
    }, [atlas]);

    // Perf (#1162, Fase 9, docs/architecture.md §331): migrated onto the shared `useFrameLoop` ticker.
    // `drawingRef` is the whole reason this migration needed more than a mechanical swap (unlike
    // LdtkLitGround's synchronous draw): `runOneDrawFrame` is `async` (awaits texture loads per instance),
    // and the OLD scheduling only ever requested its NEXT frame from inside `finally`, AFTER the current
    // one fully resolved — so it could never overlap with itself. A shared ticker calls every subscriber
    // EVERY tick regardless of whether a previous call is still pending, so without this guard a slow
    // texture load could cause two `runOneDrawFrame()` invocations to run concurrently, interleaving WebGL
    // calls against the same GL state — a real correctness risk, not just a perf one. The guard reproduces
    // the exact old behavior: skip this tick entirely if the previous draw hasn't finished yet.
    useFrameLoop(() => {
        if (drawingRef.current || !drawFrameRef.current) return;
        drawingRef.current = true;
        drawFrameRef.current().finally(() => { drawingRef.current = false; });
    }, [], { priority: 'critical' });

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

// Perf (#1161, Han 2026-08-27): doesn't depend on `petFrame` — `instances`/`lights`/`params` already flow
// through live refs for the internal draw loop, but the React render itself ran on every `petFrame` tick
// without this boundary. RpgLevelPanel.jsx's own `instances` prop used to be rebuilt as a fresh array every
// single render (defeating this memo even once added) — fixed there via `useMemo`, see its own comment.
export default React.memo(ForegroundFoliageLayer);
