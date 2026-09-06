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
// Perf (#1162, Fase 10b, docs/architecture.md §338): `uEdgeLitOnly` used to live in this shared block and
// `worldEdgeLightFactor` (below, `edgeLightFactor` back then) read it as an implicit global — fine while every consumer set it as a plain
// per-draw-call `uniform int`, but ForegroundFoliageLayer's upcoming INSTANCED shader needs it to be a
// per-instance `varying float` instead (GLSL ES 1.00 varyings can't be `int`), and a `varying` can't share
// a declaration with a `uniform` of the same name. Moved OUT of this shared block — each consumer now
// declares `uEdgeLitOnly` itself (LdtkLitGround.jsx and ForegroundFoliageLayer's existing non-instanced
// shader: unchanged `uniform int`; the new instanced shader: `varying float`) and passes it explicitly
// into `worldEdgeLightFactor` as a parameter instead of relying on it being globally visible by name.
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
// #weather §362 (Han 2026-09-01, "een wit licht van linksboven op de wereld"): max strength of the
// directional "moonlight" reveal — the shader itself scales this by (1 - uGlobalIllumination) so it
// only appears as the auto weather cycle darkens the world. Driven by foliageParams.moonStrength.
uniform float uMoonStrength;
// §377 (#1193, Han 2026-09-04, "geef de zon een glow (net zoals de maan), maar dan in de kleur van de
// zon ... enkel voor pixels aan de rand van sprites vlakbij de zon ... felle zon door de bomen /
// zon vlak over daken"): the SUN counterpart of §370's moon sheen/rim, additionally MASKED to a
// screen-space disc around the sun's own on-screen position.
// CONTRACT (identical to §362's uMoonStrength): a consumer that never uploads these gets GL's default
// 0 ⇒ uSunGlowStrength == 0 ⇒ applySunGlow returns immediately. Never a compile/link error; the GLSL
// linker may strip them entirely in that case and gl.uniform*(null, …) silently no-ops.
uniform float uSunGlowStrength;     // 0..1, already gated on sun altitude AND cloud cover JS-side
uniform vec3  uSunGlowColor;        // yellow → warm pink, pre-mixed JS-side on §372's sunsetFactor
// highp, matching the existing highp uScreenPos/uSizePx/uCanvasSize fragment uniforms (#141 round 23):
// these are canvas-WIDTH-normalised values, and mediump's ~1/1024 relative precision would be ~1.6
// device px of position error on a 1600 px canvas. Fragment-stage-only in every consumer, so round
// 23's cross-stage precision-mismatch trap does not apply.
uniform highp vec2 uSunScreenPos;   // sun screen pos, normalised BY CANVAS WIDTH, top-down origin
uniform highp float uSunGlowRadius; // glow reach, in those SAME canvas-width-normalised units
`;

// §387 (#1222, Han 2026-09-06): the ONE world silhouette every edge-sensitive lighting term now tests
// against — see useWorldSilhouetteMask.js's header for the full "why a per-tile/per-pass test can't
// answer this" story. A gl.ALPHA texture covering the level's whole native extent; only `.a` is read.
//
// PRECISION IS LOAD-BEARING HERE, not decoration. Level X runs to LEVEL_PX_WIDTH (7872 px in Han's
// level). Both consumers open their fragment stage with `precision mediump float;`, and mediump's
// guaranteed relative precision is 2^-10 — that is ~7.7 px of error at x = 7872, i.e. the mask lookup
// could land half a tile away from the fragment that asked for it. Desktop GL drivers happen to
// implement mediump as full float32 so it would "work" on Han's machine and rot silently on anything
// mobile. Every level-space coordinate below is therefore explicitly `highp`, including the function
// PARAMETERS (a plain `vec2` parameter would take the stage default and quietly truncate the argument
// at the call boundary). Same class of trap as #141 round 23's cross-stage precision mismatch.
export const WORLD_MASK_UNIFORMS_GLSL = `
uniform sampler2D uWorldMask;
uniform highp vec2 uWorldMaskSize;   // the mask's own extent in LEVEL px == (LEVEL_PX_WIDTH, LEVEL_PX_HEIGHT)
`;

// #141 round 10/14 (Han: edge-only lighting for crates/fences, later "buitenste pixels licht op, de
// pixels daarna voor 50%, de pixels daarna niet"). #925 follow-up (Han 2026-08-16): changed 3.0 -> 2.0
// per his explicit choice to share ONE constant across every edge-lit consumer (crates/fences AND the
// new front-of-entities ground/building/decor layers), not a separate per-layer value.
export const EDGE_LIGHT_PIXELS = 2.0;
// #weather §362 lifted the near-black vec3(0.05,0.08,0.18) to a lighter blue-white. §370 (Han: "echt
// donkerblauw") pulls it back DOWN and BLUER — deep, saturated, low R/G. The CSS-side twin
// `AMBIENT_DARK_RGB` in RpgLevelPanel.jsx (DOM day/night tint + background overlay) must stay in sync.
export const AMBIENT_DARK_COLOR = 'vec3(0.03, 0.06, 0.17)';

export const LIGHTING_FUNCTIONS_GLSL = `
const float EDGE_LIGHT_PIXELS = ${EDGE_LIGHT_PIXELS.toFixed(1)};
const vec3 AMBIENT_DARK_COLOR = ${AMBIENT_DARK_COLOR};
// The "is this neighbour empty?" cutoff for every edge test (edge-lit falloff, moon rim, sun inward
// glow). §377 UAT r4 raised this to 0.7 to catch anti-aliased edge texels — but the art is composited
// with no smoothing and sampled NEAREST, so its alpha is strictly 0 or 1 and 0.7 behaves identically to
// the 0.5 cutout discard (Han, UAT r5: "mijn pixel art heeft geen sub-1 alpha"). Back to 0.5 = one
// honest threshold, matching the discard. Kept as a named constant so any future AA-d art has one place
// to lift it. §387 moved it up here from beside the rim, because it is now the cutoff the shared
// worldMaskAt-based primitives use and GLSL ES 1.00 needs it declared before its first use.
// (No backticks in comments in this template literal — they terminate it.)
const float RIM_EMPTY_ALPHA = 0.5;

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

// §387 (#1222): "is the world empty at this LEVEL pixel?" — the single primitive every edge term below
// is built from. RIM_EMPTY_ALPHA (above) is the ONE opacity cutoff in the system, matching the shaders'
// own alpha-cutout discard.
//
// OUT OF BOUNDS COUNTS AS SOLID (§387 UAT r1, Han: "ik zie dat de allllerbovenste pixel als rand telt.
// Als texel aan schermrand grenst, beschouw deze niet als rand"). The first pass returned 0.0 (empty)
// here, reasoning that the level's own outer contour should rim. It should not: the level boundary is
// where the WORLD stops being authored, not where the world ends visually — a canopy cropped by the top
// of the level canvas is a cut-off tree, not a silhouette against sky, and lighting its cut edge draws a
// bright line straight across the top of the screen. Returning 1.0 makes the boundary "more world", so a
// texel touching it has no empty neighbour there and simply is not an edge. Applies to all four sides
// (Han's rule is stated generally); left/right are the far ends of the stitched level strip and the
// bottom is the ground line, so in practice only the top is ever on screen.
highp float worldMaskAt(highp vec2 levelPx) {
    if (levelPx.x < 0.0 || levelPx.y < 0.0 || levelPx.x >= uWorldMaskSize.x || levelPx.y >= uWorldMaskSize.y) return 1.0;
    return texture2D(uWorldMask, levelPx / uWorldMaskSize).a;
}

// #141 round 10/14 (Han: edge-only lighting for crates/fences — "buitenste pixels lichten op, de pixels
// daarna voor 50%, de pixels daarna niet"): three tiers — inside EDGE_LIGHT_PIXELS = full light, inside
// EDGE_LIGHT_PIXELS*2 = 50%, beyond = fully dark (ambient/wave-lit only, no point-light contribution).
// §387 rewrite: was 'edgeLightFactor(tex, duv, texelSize, ...)', sampling the fragment's OWN diffuse —
// which for a front-of-entities decor tile meant the building right behind it read as "empty", so the
// decor's interior was treated as edge and got full light. Now tested against the world mask in level
// px, exactly like the rim/glow below, so all three edge terms agree on one silhouette by construction.
// 'edgeLitOnly' stays an explicit float parameter (see LIGHTING_PARAM_UNIFORMS_GLSL's own comment for
// why it is not a shared global): callers with a 'uniform int uEdgeLitOnly' pass float(uEdgeLitOnly);
// the < 0.5 test works identically for that cast and for a genuine per-instance float varying.
bool worldAnyNeighborEmpty(highp vec2 levelPx, highp float off) {
    if (worldMaskAt(levelPx + vec2(off, 0.0)) < RIM_EMPTY_ALPHA) return true;
    if (worldMaskAt(levelPx - vec2(off, 0.0)) < RIM_EMPTY_ALPHA) return true;
    if (worldMaskAt(levelPx + vec2(0.0, off)) < RIM_EMPTY_ALPHA) return true;
    if (worldMaskAt(levelPx - vec2(0.0, off)) < RIM_EMPTY_ALPHA) return true;
    return false;
}
float worldEdgeLightFactor(highp vec2 levelPx, float edgeLitOnly) {
    if (edgeLitOnly < 0.5) return 1.0;
    if (worldAnyNeighborEmpty(levelPx, EDGE_LIGHT_PIXELS)) return 1.0;
    if (worldAnyNeighborEmpty(levelPx, EDGE_LIGHT_PIXELS * 2.0)) return 0.5;
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
    // §370 r4/r5 (Han: near a light, restore the pixel's own colour with a warm/cool/green tint instead
    // of flat grey). OLD: blendLightDual(trueColor, lightColor, ...) colour-dodge washed bright pixels
    // toward white, so ambient-blue then light-white read as grey. NOW: revealed = the pixel's OWN
    // colour, luminance-preserved, with a gentle hue cast of the light (pulled toward neutral so no
    // channel is crushed).
    vec3 lc = lightColor / max(dot(lightColor, vec3(0.299, 0.587, 0.114)), 0.001);   // luminance = 1
    lc = mix(vec3(1.0), lc, 0.7);
    vec3 revealed = clamp(trueColor * lc, 0.0, 1.0);
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

// #weather §362 (Han 2026-09-01, "kun je alles globaal donkerblauw maken, en dan een wit licht van
// linksboven op de wereld"): a single DIRECTIONAL "moonlight" — no position, no falloff, one fixed
// direction for the whole world (a distant moon). Same "reveal trueColor back out of the ambient dark"
// mechanic as applyPointLight.
// UAT round 2 (Han, §364): three fixes to that first pass —
//   - "lijkt alsof de ilum van de maan van onderen komt ipv van boven" → MOON_DIR.y flipped +0.5 → -0.5
//     (in this shader's decoded-normal space the point lights already imply Y-down; the first pass wrongly
//     copied the sky ambientLight vector's sign). Still top-LEFT (negative X, toward the viewer).
//   - "minder harde schaduwen" → a half-Lambert wrap (dot*0.5+0.5, then squared) instead of the hard
//     max(dot,0) terminator: the lit→unlit transition is now a smooth quadratic falloff, no sharp edge.
//   - "iets subtieler" + "dat mag wit zijn" → MOON_COLOR is pure white and the default uMoonStrength
//     dropped 0.5 → 0.3 (DEFAULT_FOLIAGE_PARAMS).
const vec3 MOON_DIR = normalize(vec3(-0.55, -0.5, 0.65));
const vec3 MOON_RIM_COLOR = vec3(1.0);            // white rim
// §370 r9 (Han, screenshot: "manenschijn is te heftig ... Mijn binaire 30% opacity is te simplistisch.
// Slimmer gebruik van de normal map en de bestaande kleuren: dakpannen-highlights moeten maanlicht
// vangen, de donkere rand onder het dak juist NIET"). r8's binary step lit EVERY up-left-facing texel by
// the same 30 %, ignoring the tone the artist painted -> the whole roof/facade glowed flat. r9 is a
// LUMINANCE-MASKED directional sheen: the moon rides the art's EXISTING highlights.
//   - soft directional term (smoothstep, no hard step): near-flat normals get almost nothing, only
//     strongly moon-facing relief gets the full term;
//   - luminance mask from the texel's OWN painted colour (pre-darkening): only pixels the artist already
//     drew light (tile highlights, plaster) respond; dark recesses (the eave band) stay ~0;
//   - additive via screenBlend: self-limiting, never blows a light pixel to white, does nothing to black.
const vec3 MOON_GLOW_COLOR = vec3(0.92, 0.96, 1.0);   // barely-cool near-white moonlight
const float MOON_FACING_LO = 0.45;   // dot(normal, MOON_DIR): below -> no sheen
const float MOON_FACING_HI = 0.95;   // at/above -> full directional term
const float MOON_LUM_LO = 0.35;      // texel luminance: below -> masked out (dark recess = no sheen)
const float MOON_LUM_HI = 0.75;      // at/above -> full luminance term (a painted highlight)
const float MOON_SHEEN_SCALE = 0.5;  // "duidelijk zichtbaar maar licht" — d*hi rarely both hit 1
// §377 UAT r2 (Han: "hetzelfde effect [als de maan] hergebruiken"): 0.35 → 0.5 (moon parity).
// UAT r4 (Han: "interieur sheen mag sterker"): 0.5 → 0.8 — the sun's near-object glow now reads
// STRONGER than the moon's supporting sheen, per Han's explicit ask. Set to 0.0 for strictly-edges-only.
const float SUN_SHEEN_SCALE = 0.8;
// §370 r4 (Han: moonlight "moet echt alleen zichtbaar zijn in de nacht. Fade op tijd uit voor dawn"):
// gate the moon on illumination — 0 by day AND at dusk/dawn (illum 0.33), 1 only deep in the night
// (illum <= 0.08). Fades in as dusk crosses into night and back out well before dawn's brightness ramps.
float moonPresence() {
    return 1.0 - smoothstep(0.08, 0.20, uGlobalIllumination);
}

// #weather §370 r2 (Han's exact spec): a directional moon RIM. For an opaque pixel, look for an EMPTY
// pixel toward screen-UP / LEFT / RIGHT and set an opacity:
//   above  → adjacent px .70, next down .50, next .20
//   left   → adjacent px .70, next right .30
//   right  → adjacent px .50
//   clash  → the highest opacity wins.
// (§370 r6, Han: "15 procentpunten minder fel — opacity 70→55 etc" — hence the .55/.35/.05/.15 below.)
//
// §387 (#1222) REWRITE — the spec above is untouched, only what it looks AT changed. It used to sample
// the fragment's own diffuse texture, with the taps clamped to the tile's atlas cell and a per-tile
// 'internalEdges' bitmask (#1221) trying to tell a real silhouette edge from a canopy's internal tile
// seam. Three things were wrong with that, all fixed here by construction rather than by another patch:
//   1. the uvRect clamp and the internalEdges gating are NO-OPS on a flipped tile — flipX/flipY invert
//      the sign of texelSize, so the tap walks the other way and 'max(tap, min(rect))' never clamps.
//      200 of this level's 1599 foliage tiles are flipX, and their taps ran straight into a neighbouring,
//      unrelated atlas crop. That is Han's own UAT r6 question ("heeft het met de richting te maken?"),
//      answered: yes, literally the mirror direction;
//   2. internalEdges only knew ORTHOGONAL foliage sisters — never a diagonal one, and never the building
//      or terrain behind the branch, so a foliage/building contact line rimmed as if it were open sky;
//   3. it could only ever describe ONE tile's silhouette, when Han's actual requirement is the WORLD's
//      ("alle entiteiten op de main layer als één behandeld ... het silhouet van de 'wereld', niet van de
//      tile laag").
// Now: four cheap taps into the level-space world mask (§387, useWorldSilhouetteMask.js). No clamping,
// no bitmask, no flip handling — level space has no cells to fall out of and no mirror to get wrong.
// The whole 'edgeIsInternal' helper and the 'internalEdges' attribute/varying/JS adjacency scan are gone
// with it. On the foliage path the caller passes the texel's SOURCE level coordinate (the wind
// pixel-switch's 'shiftedNativeX'), so the rim still shifts along with the leaves for free.
float worldRimFactor(highp vec2 levelPx) {
    float r = 0.0;
    if      (worldMaskAt(levelPx + vec2(0.0, -1.0)) < RIM_EMPTY_ALPHA) r = max(r, 0.55);
    else if (worldMaskAt(levelPx + vec2(0.0, -2.0)) < RIM_EMPTY_ALPHA) r = max(r, 0.35);
    else if (worldMaskAt(levelPx + vec2(0.0, -3.0)) < RIM_EMPTY_ALPHA) r = max(r, 0.05);
    if      (worldMaskAt(levelPx + vec2(-1.0, 0.0)) < RIM_EMPTY_ALPHA) r = max(r, 0.55);
    else if (worldMaskAt(levelPx + vec2(-2.0, 0.0)) < RIM_EMPTY_ALPHA) r = max(r, 0.15);
    if (worldMaskAt(levelPx + vec2(1.0, 0.0)) < RIM_EMPTY_ALPHA) r = max(r, 0.35);
    return r;
}

// §370 r9: baseColor is the texel's OWN diffuse rgb BEFORE ambient darkening / point lights — the
// luminance mask reads it so the sheen tracks the art's painted highlights, not the (already night-
// darkened) currentColor.
vec3 applyMoonLight(vec3 currentColor, vec3 baseColor, vec3 normal, float edgeFactor, float rimFactor) {
    float present = moonPresence();   // §370 r4: night only, gone by dawn
    if (present <= 0.0) return currentColor;
    // moonScale normalises uMoonStrength around its 0.3 default (same normalisation the rim uses) so the
    // debug dial still scales it; present fades the whole thing in/out with the night.
    float moonScale = clamp(uMoonStrength / 0.3, 0.0, 2.0);
    // Soft directional term — near-flat normals ~0, only strongly moon-facing relief gets the full term.
    float d = smoothstep(MOON_FACING_LO, MOON_FACING_HI, dot(normalize(normal), MOON_DIR));
    // Luminance mask from the texel's own painted colour: a dark eave recess (low luminance) stays ~0.
    float lum = dot(baseColor, vec3(0.299, 0.587, 0.114));
    float hi = smoothstep(MOON_LUM_LO, MOON_LUM_HI, lum);
    float sheen = clamp(edgeFactor * present * moonScale * d * hi * MOON_SHEEN_SCALE, 0.0, 1.0);
    vec3 lit = screenBlend(currentColor, MOON_GLOW_COLOR * sheen);
    // Rim: a thin bright white outline — screen-blend is right here too (it's an edge, not a surface).
    float rim = clamp(rimFactor * present * clamp(uMoonStrength / 0.3, 0.0, 2.0), 0.0, 1.0);
    if (rim > 0.0) lit = screenBlend(lit, MOON_RIM_COLOR * rim);
    return clamp(lit, 0.0, 1.0);
}

// §377 UAT r4 (Han: "dicht bij de zon tot 3px doordringen met een gradient"). worldRimFactor only lights
// the single outermost silhouette texel; near the sun Han wants the glow to bite ~3 game-px INTO the
// sprite with a smooth gradient. Isotropic distance-to-edge: an opaque texel 1 px from an empty
// neighbour returns 1.0, 2 px → 0.75, 3 px → 0.5, deeper → 0.0. Up to 12 mask reads, but it returns on
// the first hit (a true edge texel costs 4) and applySunGlow only calls it for fragments already inside
// the sun's screen-space mask. Sun-only — the moon keeps its thin rim.
//
// §387 (#1222) REWRITE, and this one is the single biggest cause of what Han reported on 2026-09-06
// ("aan de rand pixels die niet reageren op de illum, sheen, of andere lighting"). The old version
// sampled the fragment's own diffuse and DELIBERATELY did not clamp its taps, with this justification
// in its comment: "Samples are NOT clamped (unlike moonRimFactor) so an external edge still detects the
// transparent atlas gutter past the crop." That gutter no longer exists — #1221 reverted it
// (useLdtkFoliageAtlas.js 'atlasLayout' packs the 16x16 crops edge to edge, 22 per row). So for all 1599
// foliage tiles these taps read whatever unrelated crop happened to be packed alongside:
//   • neighbour opaque there ⇒ a GENUINE silhouette edge is never detected ⇒ no sun sheen on a pixel
//     that should have it ("overdag pixels die over worden geslagen door de sheen van de zon");
//   • neighbour empty there ⇒ a FALSE edge on an interior pixel ⇒ a bright white rim at night on a pixel
//     surrounded by darkened ones ("'s nachts pixels die niet donker worden en dus fel afsteken").
// One bug, both symptoms, in opposite directions — which is exactly the signature of an edge test whose
// answer is effectively random. Against the level-space world mask there is nothing to run off the end
// of, so the taps are simply honest: no clamp, no gutter, no internalEdges gate (Han, 2026-09-06: "je
// mag gewoon echt de logica van moonrim gebruiken").
float worldInwardGlow(highp vec2 levelPx) {
    for (int k = 1; k <= 3; k++) {
        highp float fk = float(k);
        bool hit = worldMaskAt(levelPx + vec2(0.0, -fk)) < RIM_EMPTY_ALPHA
                || worldMaskAt(levelPx + vec2(0.0,  fk)) < RIM_EMPTY_ALPHA
                || worldMaskAt(levelPx + vec2(-fk, 0.0)) < RIM_EMPTY_ALPHA
                || worldMaskAt(levelPx + vec2( fk, 0.0)) < RIM_EMPTY_ALPHA;
        if (hit) return fk < 1.5 ? 1.0 : (fk < 2.5 ? 0.75 : 0.5);   // §377 UAT: "iets hoger" (was 0.6/0.3)
    }
    return 0.0;
}

// §377 (#1193). The SUN edge-glow. Same two-term structure as applyMoonLight above (a luminance-masked
// screen-blend sheen + a screen-blended rim), with THREE deliberate differences:
//   • no directional dot(normal, DIR) term: the sun has no fixed world direction here — its LOCALITY
//     is the screen-space distance mask below, which is the whole point of the feature;
//   • the colour is a UNIFORM (the day→dusk lerp, §372's curve) instead of a fixed near-white const;
//   • everything is multiplied by that distance mask around the sun's own on-screen position, so only
//     sprites "vlakbij de zon" light up ("felle zon door de bomen", "zon vlak over daken").
// NOTE for future editors: no backticks in comments inside this template literal — they terminate it.
// 'rimFactor' is the SAME worldRimFactor value the call site already computed for §370 — reusing it
// costs zero extra texture fetches and keeps ONE thin-rim definition in the codebase. Its fixed
// up/left/right bias is fine here: the sun is above the horizon whenever this term is non-zero at all.
// UAT r4: the rim term is now max(rimFactor, worldInwardGlow(...)) — the isotropic 3-px inward gradient
// takes over near the sun (where worldRimFactor's one-texel outline is not enough) and never weakens it.
// worldInwardGlow is computed HERE, after the two early-outs, so the up-to-12 extra mask reads are only
// paid by fragments that are both near the sun on-screen AND while the sun is up — hence the 'levelPx'
// param (§387: this fragment's position in LEVEL px, which each consumer already has to hand).
// 'fragUnit' is this fragment's TOP-DOWN screen position divided by the canvas WIDTH — the same
// scalar for both axes, so the metric stays isotropic (a circle is a circle at any aspect ratio) and
// devicePixelRatio cancels exactly ((cssPx·dpr)/(cssW·dpr) == cssPx/cssW). Each consumer computes it
// from the gl_FragCoord/uCanvasSize flip it ALREADY has; no new varying anywhere.
vec3 applySunGlow(vec3 currentColor, vec3 baseColor, float edgeFactor, float rimFactor, highp vec2 levelPx, vec2 fragUnit) {
    if (uSunGlowStrength <= 0.0) return currentColor;   // night / overcast / consumer never uploads it
    // GLSL ES 1.00 leaves smoothstep UNDEFINED when edge0 >= edge1, so the "inverted" form
    // smoothstep(uSunGlowRadius, 0.0, d) must NOT be written. Same curve, defined behaviour.
    // §377 UAT r2 (Han: "de buitenste paar pixels in de buurt van de zon overbelicht, precies zoals bij
    // de maan"): the mask is now a FLAT core out to half the radius (there the rim is at its full,
    // moon-parity strength — an actual blow-out) then a smooth fade over the outer half. The r0 form
    // (fade the whole way from d=0) meant even a sprite edge right under the sun only ever got a
    // fraction of the moon's rim strength.
    float d = distance(fragUnit, uSunScreenPos);
    float r = max(uSunGlowRadius, 1e-5);
    float near = 1.0 - smoothstep(0.5 * r, r, d);
    if (near <= 0.0) return currentColor;
    // §377 UAT (Han: "de sheen intensiteit voor de buitenste 50% van de straal mag een stukje minder
    // intens"). The flat core (d < 0.5r) stays at near == 1; squaring only bites in the outer-half fade.
    near = near * near;
    // Luminance mask, same reasoning as §370 r9: the sun rides the art's OWN painted highlights, so a
    // dark eave recess next to a bright roof tile does not glow. Reuses §370's already-tuned
    // thresholds rather than inventing a second pair (CLAUDE.md §6c).
    float lum = dot(baseColor, vec3(0.299, 0.587, 0.114));
    float hi = smoothstep(MOON_LUM_LO, MOON_LUM_HI, lum);
    float sheen = clamp(edgeFactor * hi * uSunGlowStrength * near * SUN_SHEEN_SCALE, 0.0, 1.0);
    vec3 lit = screenBlend(currentColor, uSunGlowColor * sheen);
    float rimSrc = max(rimFactor, worldInwardGlow(levelPx));   // UAT r4: 3-px inward gradient
    float rim = clamp(rimSrc * uSunGlowStrength * near, 0.0, 1.0);
    if (rim > 0.0) lit = screenBlend(lit, uSunGlowColor * rim);
    return clamp(lit, 0.0, 1.0);
}
`;
