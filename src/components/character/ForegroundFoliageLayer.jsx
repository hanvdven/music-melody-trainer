import React, { useEffect, useLayoutEffect, useRef } from 'react';
import logger from '../../utils/logger';

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
uniform int uEdgeLitOnly;    // 1 = point lights only tint the outer few px of THIS instance; 0 = full-area

// #141 round 13 (Han: "ja graag [directional lighting]. ik ga hooguit 10 lichtbronnen in beeld hebben"):
// generalized from 2 hardcoded named lights (wisp/hero) to a fixed-size array of up to MAX_LIGHTS — the
// wisp and hero are just the first two entries RpgLevelPanel.jsx currently populates. uLightWorldHeight
// is each light's own height ABOVE THE GROUND (0 for a ground-standing character) in the SAME groundDist
// units the wave/lighting math already uses elsewhere — not a screen position.
const int MAX_LIGHTS = 10;
uniform int uLightCount;
uniform float uLightWorldX[MAX_LIGHTS];
uniform float uLightWorldHeight[MAX_LIGHTS];
uniform vec3 uLightColor[MAX_LIGHTS];

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
uniform float uLightRadius;
uniform float uLightHeightRadius;
uniform float uLightStrength;
uniform float uHuePull;           // blend mode 1's hue-pull amount, AND (round 11) how strongly a point
                                    // light tints the color it reveals back out of the dark (see below)
uniform int uWaveBlendMode;       // 0 Screen, 1 HSV Value/Hue boost, 2 Additive RGB, 3 plain Mix
uniform int uWaveBlendMode2;      // round 12: averaged 50/50 with uWaveBlendMode's result
uniform int uLightBlendMode;      // same 4 options, chosen independently for the wisp/hero lights
uniform int uLightBlendMode2;     // round 15 (Han: "light: maak een secundaire blend mode"): averaged
                                    // 50/50 with uLightBlendMode, mirroring round 12's wave dual-blend
// #141 round 11 (Han, NL: "voeg nog een param toe: global illumination. Ik wil het donker kunnen maken; ga
// niet naar helemaal zwart, maar naar donkerblauw" — "add a param: global illumination, able to go dark but
// toward dark BLUE, never pure black" + "Welke blend moet ik gebruiken zodat een lichtbron dan de
// oorspronkelijke kleur terug weergeeft (met een beetje geel erdoor)? ... de boom wordt niet wit-geel, maar
// ik zie ook nog het groen van het blad" — "what blend reveals the ORIGINAL color again near a light source,
// with a little of the light's color through it — the tree shouldn't go white-yellow, I should still see
// the leaf's green"): 0 = fully dark (AMBIENT_DARK_COLOR), 1 = full daylight (true color, untouched).
uniform float uGlobalIllumination;
// #141 round 19 (Han, NL: "maak ook een slider voor normal map strength voor illumination"): 1.0 = full
// sampled-normal relief (current look), 0.0 = fully flat "from above" (FLAT_NORMAL) — see main()'s own
// comment for how this combines with the floor's hard-pinned flat normal and applyPointLight's separate,
// near-light-only NORMAL_FLATTEN_NEAR_LIGHT.
uniform float uNormalStrength;
// #141 round 26 (Han: "voeg een slider toe die naast normal map illumination nog 'flat illumination' doet;
// radial vanaf de lichtbron... moet worden opgeteld bij de normal map ilum"): 0 (default) = no change from
// before; >0 adds a purely distance-based (no ndotl gating) glow from each light, summed with the existing
// directional term — see applyPointLight's own comment.
uniform float uFlatIllumination;
// #925 follow-up (Han 2026-08-16, "de 100% witte pixels mogen een witte 'kop'/glans geven op het water"):
// fully-bright diffuse pixels (water-crest art, or any other near-white source pixel) get pulled further
// toward pure white, on top of the existing wave highlight — global params like every other shimmer dial
// (round 11's "put every tunable in the debug" convention), not water-specific, since the effect is a
// no-op wherever the source art has no near-white pixels to begin with.
uniform float uWhiteCapThreshold;   // diffuse luminance above which the cap starts kicking in (0..1)
uniform float uWhiteCapStrength;    // 0 = no effect, 1 = fully pulled to pure white at max luminance

const float GRAIN_CELL = 1.0;     // native-px grain size — not yet exposed to the debug panel
const vec3 HIGHLIGHT_COLOR = vec3(1.0, 1.0, 0.95);
const vec3 AMBIENT_DARK_COLOR = vec3(0.05, 0.08, 0.18);
const float EDGE_LIGHT_PIXELS = 3.0;

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

// Standard HSV round-trip (round 9) — kept as blend-mode option 1, see blendHighlight/blendLight below.
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

// #141 round 11 (Han, NL: "ik denk dat belichting 'screen blend' moet gebruiken" + "lighting mag subtiel
// zijn voor heldere objecten, en een groter effect hebben op donkere objecten" — "lighting can be subtle
// for bright objects and have a bigger effect on dark ones"): screen blend (1-(1-base)*(1-blend)) has
// EXACTLY that property built into the formula — a bright base (near white) barely changes no matter how
// strong the blend color, while a dark base shows nearly the full blend color. No separate "reduce on
// bright pixels" logic needed anywhere else; it falls straight out of this one function.
vec3 screenBlend(vec3 base, vec3 blendColor) {
    return 1.0 - (1.0 - base) * (1.0 - blendColor);
}

// #141 round 19 (Han, NL: "voeg nog wat color blend modes toe. zoals, hue, sat, color, lum, color dodge"):
// standard Color Dodge (base/(1-blend), the classic "brightens toward the blend color" mode) plus the four
// classic Photoshop/CSS non-separable HSL composite modes — Hue, Saturation, Color, Luminosity. Approximated
// via the rgb2hsv/hsv2rgb round-trip already in this file (HSV's "Value" standing in for HSL's
// "Lightness") rather than adding a whole separate HSL conversion pair — CLAUDE.md §6c: reuse existing
// machinery instead of duplicating it. Each swaps in one or two channels from blend's HSV onto base's:
// Hue keeps base's saturation+value, takes blend's hue; Saturation keeps base's hue+value, takes blend's
// saturation; Color takes blend's hue+saturation, keeps base's value; Luminosity takes blend's value, keeps
// base's hue+saturation (the exact inverse pairing of Color, per the standard spec).
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
    // #141 round 19: same "opacity mix" treatment as blendHighlight's modes 4-8, see its own comment.
    return mix(base, compositeBlend(base, lightColor, mode), clamp(intensity, 0.0, 1.0));
}

// #141 round 15 (Han, NL: "light: maak een secundaire blend mode" — mirrors round 12's
// blendHighlightDual, this time for the point-light reveal instead of the wind-wave highlight): runs
// blendLight twice with independently-selected modes and averages the results 50/50.
vec3 blendLightDual(vec3 base, vec3 lightColor, float intensity, int modeA, int modeB) {
    vec3 a = blendLight(base, lightColor, intensity, modeA);
    vec3 b = blendLight(base, lightColor, intensity, modeB);
    return mix(a, b, 0.5);
}

// #141 round 10 (Han, NL: "is het mogelijk om lantaarn-invloed op objecten te beperken tot de buitenste paar
// pixels? als ik straks een hek plaats, blijft dat dan donker... enkel de buitenste paar pixels kleuren
// mee?"): per-instance opt-in. Samples the diffuse alpha some native px out in each cardinal direction; if
// any neighbor at that ring is transparent, this fragment is "near an edge" at that ring.
//
// #141 round 14 (Han, NL: "kisten: (dus voorgrond): buitenste pixels licht op, de pixels daarna voor 50%,
// de pixels daarna niet" — "outer pixels light up fully, the ring after that at 50%, beyond that not at
// all"): was a binary 0/1 — now THREE tiers, checking two ring distances (EDGE_LIGHT_PIXELS and
// EDGE_LIGHT_PIXELS*2) instead of one.
bool anyNeighborTransparent(vec2 duv, vec2 off) {
    if (texture2D(uDiffuse, duv + vec2(off.x, 0.0)).a < 0.5) return true;
    if (texture2D(uDiffuse, duv - vec2(off.x, 0.0)).a < 0.5) return true;
    if (texture2D(uDiffuse, duv + vec2(0.0, off.y)).a < 0.5) return true;
    if (texture2D(uDiffuse, duv - vec2(0.0, off.y)).a < 0.5) return true;
    return false;
}
float edgeLightFactor(vec2 duv, vec2 texelSize) {
    if (uEdgeLitOnly == 0) return 1.0;
    if (anyNeighborTransparent(duv, texelSize * EDGE_LIGHT_PIXELS)) return 1.0;
    if (anyNeighborTransparent(duv, texelSize * EDGE_LIGHT_PIXELS * 2.0)) return 0.5;
    return 0.0;
}

// #141 round 11 (Han's day/night ask, see uGlobalIllumination above): a point light's job is to "REVEAL the
// true color out of the ambient darkness, lightly tinted by the light" — trueColor is the object's real
// (fully-lit, wave-highlighted) color, currentColor starts as the ambient-darkened version and gets pulled
// BACK toward a light-tinted version of trueColor as intensity rises, instead of pushing past full
// brightness. uHuePull doubles as "how much the light's own hue tints the revealed color."
//
// #141 round 13 (Han: "ja graag [directional lighting]" — asked after noticing a crate lit up on the wrong
// side): normal is now part of the intensity calculation, not just distance falloff. lightDir points
// FROM the fragment TOWARD the light in the same (worldX, groundDist)-ish 2D+ space the rest of this file
// already uses — a fixed, moderate positive Z component (0.6) approximates "the light is also somewhat
// toward the viewer," matching the existing ambient term's own assumption, since this is a 2D side-view
// game with no true depth axis. ndotl then multiplies the falloff: a surface facing the light gets the
// full effect, a surface facing away gets none, EVEN standing right next to the light source.
//
// #141 round 14 BUG FIX (Han, NL: "het licht van personage en wisp komt van onder bladeren, dus de
// bladeren moeten van onder worden opgelicht, dat is nu andersom. Links-rechts is wel goed" — "the light
// from character/wisp comes from below the leaves, so the underside should light up — that's backwards
// right now, left-right is correct"): the Y term was lightWorldHeight - groundDist, which for a
// ground-level light (height 0) under a high canopy (groundDist large) is a big NEGATIVE value — sign was
// simply flipped from what the normal map's Y-axis convention needed. Negated to groundDist -
// lightWorldHeight — X axis untouched, confirmed correct already.
// #141 round 15 (Han, NL: "de schaduwen zijn nu heel extreem, kan je ook een normal map strength
// toevoegen? Of kan de normal map strength 'zwakker' oftewel 'platter' worden als je dichterbij staat?" —
// chose the second option (auto-flatten near the light, no manual slider)): right underneath a light,
// closeness (the distance falloff BEFORE ndotl) is near 1, and the normal map's own small per-pixel slope
// variation swings ndotl hard between ~0 and ~1 across neighboring texels — that's the "extreme shadow"
// look. Blending the sampled normal toward straight-up (FLAT_NORMAL) as closeness rises softens exactly
// that near-light contrast, without touching the (already-subtle) ambient shading, which isn't the thing
// Han complained about.
// #141 round 19: FLAT_NORMAL is now ALSO the target of main()'s own uNormalStrength blend (a separate,
// always-on dial covering ambient shading too, not just near-light contrast) and the floor's hard-pinned
// normal — see main()'s own comment where n is computed.
const vec3 FLAT_NORMAL = vec3(0.0, 0.0, 1.0);
const float NORMAL_FLATTEN_NEAR_LIGHT = 0.7;

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
    // #141 round 26 (Han, NL: "voeg een slider toe die naast normal map illumination nog 'flat
    // illumination' doet; radial vanaf de lichtbron... moet worden opgeteld bij de normal map ilum"): the
    // directional term above is fully gated by ndotl — a surface facing AWAY from the light gets exactly
    // zero, even standing right next to it. "flat" is the same distance-only falloff (closeness/edgeFactor/
    // strength) WITHOUT the ndotl gate, scaled by the new uFlatIllumination dial (0 = no change from
    // before) — a purely radial "ambient glow" from the light source, independent of which way anything
    // faces. Summed with the directional term (not blended/averaged) per Han's explicit "opgeteld" (added).
    // BUG CAUGHT AFTER SHIPPING (Han's console: "'flat' : Illegal use of reserved word"): "flat" is a
    // GLSL reserved keyword (an interpolation qualifier, e.g. "flat varying") — illegal as a variable name,
    // even though it compiles fine as an English word in a comment. Renamed to flatGlow.
    float flatGlow = closeness * edgeFactor * uLightStrength * uFlatIllumination;
    float intensity = clamp(directional + flatGlow, 0.0, 1.0);
    if (intensity <= 0.0) return currentColor;
    vec3 revealed = blendLightDual(trueColor, lightColor, uHuePull, uLightBlendMode, uLightBlendMode2);
    return mix(currentColor, revealed, intensity);
}

// #141 round 13: loops the (now up to MAX_LIGHTS, was hardcoded wisp+hero) light array. GLSL ES 1.00 needs
// the loop's own bound to be a constant expression (MAX_LIGHTS is), but the break condition inside can
// still be a runtime uniform (uLightCount) — standard dynamic branching, not a dynamic loop bound.
vec3 applyPointLights(vec3 trueColor, vec3 currentColor, vec3 normal, float worldX, float groundDist, float edgeFactor) {
    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= uLightCount) break;
        currentColor = applyPointLight(trueColor, currentColor, normal, worldX, groundDist, edgeFactor, uLightWorldX[i], uLightWorldHeight[i], uLightColor[i]);
    }
    return currentColor;
}

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
    float shiftedNativeX = clamp(nativeX + totalShiftPx, 0.0, uWorldWidth - 1.0);
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

    float edgeFactor = edgeLightFactor(duv, texelSize);

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
    } else if (uDebugChannel == 2) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // #925 follow-up: white caps — a near-white source pixel (e.g. a water-crest highlight painted into
    // the art) gets pulled further toward pure white, proportional to how far its own luminance already
    // is above uWhiteCapThreshold. Runs on trueColor (after the wave highlight, before ambient/lighting)
    // so caps participate in the SAME ambient-darken/point-light pipeline as everything else — a cap in a
    // dark corner still dims with the rest of the scene, it doesn't ignore lighting.
    float diffuseLum = dot(diffuse.rgb, vec3(0.299, 0.587, 0.114));
    if (diffuseLum > uWhiteCapThreshold) {
        float capMix = clamp((diffuseLum - uWhiteCapThreshold) / max(1.0 - uWhiteCapThreshold, 0.0001), 0.0, 1.0) * uWhiteCapStrength;
        trueColor = mix(trueColor, vec3(1.0), capMix);
    }

    // Global illumination (round 11): darken toward AMBIENT_DARK_COLOR, never pure black; point lights then
    // REVEAL trueColor back out of the darkness (see applyPointLight) instead of adding brightness on top.
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
const MAX_LIGHTS = 10;

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
    // #141 round 27 (Han: "maak een tweede toggler: night: illum 0.1 / dusk-dawn 0.33, day global illum 1")
    // — replaces round 11's plain continuous slider with a 3-level "time of day" picker; `timeOfDay` is the
    // picker's own selected state (RpgLevelPanel's LevelPicker), `globalIllumination` is what the shader
    // uniform actually reads — the picker always sets both together, same pattern as `windLevel` below.
    timeOfDay: 'day',   // 'night' | 'dusk-dawn' | 'day' — see TIME_OF_DAY_ILLUM in RpgLevelPanel.jsx
    globalIllumination: 1.0,   // 1 = full daylight, 0 = fully dark (AMBIENT_DARK_COLOR)
    // #141 round 26 (Han: "ik wil wind skew en stretch beperken laten afhangen van het weer. maak in debug
    // een knopje 'wind': low, med, high. met skew en stretch 1, 2 en 3 pixels" — replaces round 16/17's
    // separate skew/stretch sliders with one 3-level "weather" picker; `windLevel` is the picker's own
    // selected state, `skewAmount`/`stretchAmount` are what the shader uniforms actually read — the picker
    // (RpgLevelPanel's WindLevelPicker) always sets all three together so they can't drift out of sync).
    windLevel: 'med',   // 'low' | 'med' | 'high' — see WIND_LEVEL_PX in RpgLevelPanel.jsx
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
    // #925 follow-up (Han 2026-08-16, "de 100% witte pixels mogen een witte 'kop'/glans geven op het
    // water"): only near-white source pixels (>0.85 luminance) get pulled the rest of the way toward pure
    // white, at 60% strength — a visible but not overpowering crest glare.
    whiteCapThreshold: 0.85,
    whiteCapStrength: 0.6,
};

export default function ForegroundFoliageLayer({
    widthPx, heightPx, instances, debugChannel = 0, lights = [],
    params = DEFAULT_FOLIAGE_PARAMS,
}) {
    const canvasRef = useRef(null);
    const instancesRef = useRef(instances);
    instancesRef.current = instances;
    const debugChannelRef = useRef(debugChannel);
    debugChannelRef.current = debugChannel;
    const lightsRef = useRef(lights);
    lightsRef.current = lights;
    const paramsRef = useRef(params);
    paramsRef.current = params;

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
            program = createProgram(gl);
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

        let raf;
        const startTime = performance.now();
        // #141 round 21 CRITICAL BUG FIX, defense-in-depth (Han: "dit is een critical bug"): the texture-
        // load fix above (see getTexture's own comment) addresses the ROOT CAUSE Han actually hit, but this
        // try/catch/finally is the general guarantee — NOTHING that can go wrong inside a single frame
        // (a WebGL call on a lost context, a future bug, anything) should ever be able to permanently kill
        // the shared render loop again. `raf = requestAnimationFrame(draw)` now lives in `finally`, so it
        // ALWAYS runs (unless the effect's own cleanup already set `cancelled`) regardless of what happened
        // this frame — worst case, one frame renders wrong; the loop itself never dies.
        const draw = async () => {
            if (cancelled) return;
            try {
                await drawFrame();
            } catch (err) {
                logger.error('ForegroundFoliageLayer', 'E023-FOLIAGE-DRAW-FRAME', err);
            } finally {
                if (!cancelled) raf = requestAnimationFrame(draw);
            }
        };
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
            gl.uniform1f(uWhiteCapThreshold, p.whiteCapThreshold);
            gl.uniform1f(uWhiteCapStrength, p.whiteCapStrength);

            for (const inst of instancesRef.current) {
                const diffuseTex = await getTexture(inst.diffuseUrl);
                const normalTex = await getTexture(inst.normalUrl);
                if (!diffuseTex || !normalTex || cancelled) continue;

                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, diffuseTex);
                gl.uniform1i(uDiffuse, 0);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, normalTex);
                gl.uniform1i(uNormal, 1);

                gl.uniform2f(uScreenPos, inst.screenX * dpr, inst.screenY * dpr);
                gl.uniform2f(uSizePx, inst.widthPx * dpr, inst.heightPx * dpr);
                gl.uniform4f(uDiffuseUV, ...inst.diffuseUV);
                gl.uniform1f(uWorldCenterX, inst.worldX);
                gl.uniform1f(uWorldWidth, inst.worldWidth);
                gl.uniform1f(uWorldHeight, inst.worldHeight);
                gl.uniform1f(uGroundDistOffset, inst.groundDistOffset || 0);
                gl.uniform1i(uInstanceKind, inst.kind === 'floor' ? 1 : 0);
                gl.uniform1i(uHasWave, inst.wave === false ? 0 : 1);
                gl.uniform1i(uHasSkew, inst.skew ? 1 : 0);
                gl.uniform1i(uEdgeLitOnly, inst.edgeLitOnly ? 1 : 0);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        };
        raf = requestAnimationFrame(draw);

        return () => {
            cancelled = true;
            if (raf) cancelAnimationFrame(raf);
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
