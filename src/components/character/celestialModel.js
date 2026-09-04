// §374 "De sterrenhemel" (#1191, Han 2026-09-04) — the PURE astronomy model behind <CelestialSky>.
//
// Purpose: turn the RPG world's own weather clock (weatherCycle.js) into real south-facing sky
// positions for the sun, the moon and ~900 catalogue stars, so the world's night sky is an actual
// rotating sky rather than a scattering of twinkles. Everything here is a pure function of its
// arguments: NO DOM, NO Date/performance.now, NO module-level mutable state. That is what makes the
// whole thing unit-testable, and what lets the star-catalogue GENERATOR (scripts/generate-star-catalog.mjs)
// import this same file to validate its data — script and runtime can then never disagree about what
// "visible from Brussels facing south" means.
//
// Model (locked in the #1191 plan, §374 of docs/architecture.md):
//   • Perpetual EQUINOX at Brussels (lat 50.85 °N), camera facing DUE SOUTH.
//   • declination = 0 for BOTH sun and moon — they ride the celestial equator, not the ecliptic. One
//     arc shape for both, offset only in hour angle.
//   • ONE knob, CYCLES_PER_LUNATION (weatherCycle.js), governs the moon's elongation, the sun's RA
//     drift AND the sidereal excess of the star sphere. There is no second star clock.

// NOTE the explicit `.js` (the rest of this folder imports extension-less). It is deliberate: the
// star-catalogue generator (scripts/generate-star-catalog.mjs) imports THIS file under plain `node`,
// which — unlike Vite/vitest — does not resolve extension-less specifiers. Keeping the extension here
// is what lets the generated data and the runtime share one definition of "visible from Brussels".
import { TIME_PHASES, PHASE_START_S, CYCLE_TOTAL_S, easeInOut } from './weatherCycle.js';

// Brussels. Han: "Neem aan dat we in Brussel zijn en naar het zuiden kijken".
export const LAT_DEG = 50.85;

// Half of the horizontal field of view, in degrees: the canvas spans 120° of azimuth centred on due
// south. THE one tunable if Han wants a wider/narrower sky at UAT — everything else (deg-per-pixel,
// culling, the isotropic vertical scale) is derived from it and the live canvas width.
export const HALF_FOV_AZ_DEG = 60;

// Disc radii in GAME pixels (sprite px, not CSS px — see MEMORY "pixels = RPG sprite pixels").
// Diameters therefore 14 gpx (sun) and 12 gpx (moon), per the design.
export const SUN_R_GPX = 7;
export const MOON_R_GPX = 6;

// Star/constellation fade window on `foliageParams.globalIllumination` — the SHARED day/night knob
// every other consumer reads (the shaders' mix(AMBIENT_DARK,1,illum), SkyGradientBackdrop.mixNight).
// LO is the §370 night illumination floor, HI is comfortably inside daylight. There is deliberately
// no separate "show stars" state anywhere in the app.
export const STAR_FADE_LO = 0.05;
export const STAR_FADE_HI = 0.60;

const DEG = Math.PI / 180;

// Wrap into [0, 360). Used for hour angles / sidereal time, which are only ever meaningful mod 360.
function wrap360(deg) {
    return ((deg % 360) + 360) % 360;
}

// Wrap into [-180, 180] — the form an hour angle needs before it is compared against ±90 (horizon).
function wrap180(deg) {
    const w = wrap360(deg);
    return w > 180 ? w - 360 : w;
}

// The cycleT at the MIDPOINT of a named phase. Derived from TIME_PHASES (CLAUDE.md §6c — never typed
// as 0.5625/0.9375): if Han ever retunes the phase durations the sun's anchors follow automatically.
function phaseMidCycleT(name) {
    const i = TIME_PHASES.findIndex((p) => p.name === name);
    return (PHASE_START_S[i] + TIME_PHASES[i].dur / 2) / CYCLE_TOTAL_S;
}

// The two anchors the sun's arc is pinned to: altitude EXACTLY 0 at mid-dusk (setting) and at
// mid-dawn (rising). Mid-day and mid-night need no anchor of their own — with dec = 0 they fall out
// for free at the midpoints of the two segments below.
export const DUSK_ANCHOR_T = phaseMidCycleT('dusk');   // 0.5625 with the shipped durations
export const DAWN_ANCHOR_T = phaseMidCycleT('dawn');   // 0.9375

// Fraction of the whole cycle the sun spends above / below the horizon. With TIME_PHASES unchanged
// (240/60/120/60) that is 62.5 % day vs 37.5 % night — NOT the real equinox 50/50. That asymmetry is
// deliberate (the phase durations are Han's, the sky bends to them): the sun sweeps its 180 daytime
// degrees more slowly than its 180 night degrees.
const DAY_ARC_FRAC = ((DUSK_ANCHOR_T - DAWN_ANCHOR_T) % 1 + 1) % 1;
const NIGHT_ARC_FRAC = 1 - DAY_ARC_FRAC;

/**
 * Sun hour angle in degrees, in [0, 360), as a function of the cycle clock.
 *
 * Two uniform segments, joined at the horizon. H = 0 is due south (transit), H = ±90 is the horizon
 * (because dec = 0 ⇒ sin(alt) = cos(lat)·cos(H)), H = 180 is anti-transit (deepest night). The
 * dH/dcycleT kink where the two segments meet sits EXACTLY at altitude 0 — i.e. at the horizon line,
 * where the disc is already occluded by the parallax scenery — so it is invisible by construction.
 * No smoothing spline (CLAUDE.md §7: no speculative abstractions).
 */
export function solarHourAngleDeg(cycleT) {
    const sinceDawn = (((cycleT - DAWN_ANCHOR_T) % 1) + 1) % 1;
    const h = sinceDawn < DAY_ARC_FRAC
        ? -90 + 180 * (sinceDawn / DAY_ARC_FRAC)                              // rising → transit → setting
        : 90 + 180 * ((sinceDawn - DAY_ARC_FRAC) / NIGHT_ARC_FRAC);           // set → anti-transit → rise
    return wrap360(h);
}

/**
 * Local sidereal time in degrees. The standard relation is H = LST − RA, so LST = H_sun + RA_sun.
 * The "year" is compressed to one lunation (CYCLES_PER_LUNATION cycles), i.e. RA_sun = 360·lunationPhase.
 * Consequence, and the whole reason there is no separate star clock: over ONE cycle LST advances
 * 360 + 360/CYCLES_PER_LUNATION degrees — the sidereal excess that makes a constellation rise
 * ~1/28 turn earlier each successive night (Han: "draai de sterrennacht ook met de dag-nacht-cyclus").
 */
export function localSiderealDeg(cycleT, lunationPhase) {
    return wrap360(solarHourAngleDeg(cycleT) + 360 * lunationPhase);
}

/**
 * Equatorial (RA/Dec) → horizontal (altitude / azimuth-from-south) for LAT_DEG.
 * `azSouthDeg` is measured FROM DUE SOUTH, positive WESTWARD (screen-right): 0 at transit, −90 due
 * east (rising, screen-left), +90 due west (setting, screen-right).
 *
 * The azimuth uses the atan2 form, NOT the textbook tan(az) = sin H / (cos H sin φ − tan δ cos φ):
 * tan(δ) blows up at δ = ±90 and the catalogue carries Polaris at δ = +89.26.
 */
export function altAz(raHours, decDeg, lstDeg) {
    const h = (lstDeg - raHours * 15) * DEG;
    const dec = decDeg * DEG;
    const lat = LAT_DEG * DEG;
    const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(h);
    const altDeg = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / DEG;
    const azSouthDeg = Math.atan2(
        Math.cos(dec) * Math.sin(h),
        Math.cos(dec) * Math.cos(h) * Math.sin(lat) - Math.sin(dec) * Math.cos(lat),
    ) / DEG;
    return { altDeg, azSouthDeg };
}

/**
 * Degrees of sky per GAME pixel. Derived from the live canvas width so the projection re-fits itself
 * on every resize/zoom change, and so BOTH screen axes share one scale (see projectToScreen).
 */
export function degPerPx(Wpx) {
    return (2 * HALF_FOV_AZ_DEG) / Wpx;
}

/**
 * Cylindrical (plate-carrée) projection: linear in azimuth, linear in altitude, with the SAME
 * deg-per-pixel on both axes. Isotropic on purpose — constellation stick figures keep their real
 * shape at any viewport aspect ratio (a fixed VERTICAL fov instead would stretch them ~35 % on a
 * 16:9 world).
 *
 * `horizonY` (canvas game px, y down from the canvas top) is where altitude 0 lands: passed in by
 * the caller from RpgLevelPanel's own §141 `HORIZON_PX` background-alignment constant, never invented
 * here. Altitudes near the zenith legitimately map ABOVE the canvas top — overhead stars are out of a
 * south-facing frame; the caller culls them, nothing is clamped.
 *
 * `visible` is the SKY-side test only (above the horizon, inside the azimuth window with a small
 * margin). Per-pixel on-canvas culling is the renderer's job, because a sun/moon disc may legitimately
 * straddle an edge.
 */
export function projectToScreen(altDeg, azSouthDeg, { Wpx, horizonY }) {
    const dpp = degPerPx(Wpx);
    return {
        x: Wpx / 2 + azSouthDeg / dpp,
        y: horizonY - altDeg / dpp,
        visible: altDeg >= 0 && Math.abs(azSouthDeg) <= HALF_FOV_AZ_DEG + 5,
    };
}

// The sun's own RA in hours: the compressed year puts it at 360·lunationPhase degrees = 24·lp hours.
function sunRaHours(lunationPhase) {
    return 24 * lunationPhase;
}

// The moon's RA in hours. Derivation: the moon must move EASTWARD (increasing RA) as the lunation
// waxes, and H = LST − RA, so H_moon = H_sun − 360·lunationPhase (the PLUS sign of the original
// design note is retrograde and mirrors every quarter moon onto the wrong side of the sky — see the
// §374 "elongation sign" note and celestialModel.test.js's first-quarter-at-dusk test, which pins it).
// RA_moon = LST − H_moon = (H_sun + 360·lp) − (H_sun − 360·lp) = 720·lp degrees = 48·lp hours.
// Two RA circuits per lunation is exactly right here: our "year" is itself one lunation long, so the
// moon needs two sidereal turns to gain one full synodic turn on the sun.
function moonRaHours(lunationPhase) {
    return 48 * lunationPhase;
}

export function sunPosition(cycleT, lunationPhase) {
    const lst = localSiderealDeg(cycleT, lunationPhase);
    return altAz(sunRaHours(lunationPhase), 0, lst);
}

/** Illuminated fraction of the moon's disc: 0 at new, 0.5 at either quarter, 1 at full. */
export function illuminatedFraction(lunationPhase) {
    return (1 - Math.cos(360 * lunationPhase * DEG)) / 2;
}

export function moonPosition(cycleT, lunationPhase) {
    const lst = localSiderealDeg(cycleT, lunationPhase);
    const { altDeg, azSouthDeg } = altAz(moonRaHours(lunationPhase), 0, lst);
    return {
        altDeg,
        azSouthDeg,
        illumFraction: illuminatedFraction(lunationPhase),
        // Near new moon the moon is with the sun by day and therefore BELOW the horizon all night —
        // Han's "volgens de regels van de fysica" means it is simply not drawn then (ac6).
        belowHorizon: altDeg < 0,
        hourAngleDeg: wrap180(lst - moonRaHours(lunationPhase) * 15),
    };
}

// §374 UAT r2 (#1191, Han: "ik wil de maangloed enkel als de maan schrijnt"). A 0..1 scalar for how
// strongly the moon is actually lighting the world right now — used to gate §370's moonlight sheen /
// rim, which until now was on EVERY night regardless of whether the moon was up or what phase it was.
// 0 when the moon is below the horizon (near new moon it rides with the sun by day → dark night);
// scales with the illuminated fraction; and fades in over the first `MOON_SHINE_ALT_FADE_DEG` of
// altitude so a moon sitting on the horizon is weak. Only the STRENGTH tracks the real moon — §370's
// glow keeps its fixed top-left `MOON_DIR` (Han's pick at UAT).
export const MOON_SHINE_ALT_FADE_DEG = 12;
export function moonShine(moon) {
    if (moon.belowHorizon) return 0;
    const altFade = Math.max(0, Math.min(1, moon.altDeg / MOON_SHINE_ALT_FADE_DEG));
    return Math.max(0, Math.min(1, moon.illumFraction * altFade));
}

/**
 * Unit vector in SCREEN space pointing from the moon toward the sun — the direction of the moon's
 * bright limb. Computed from the two projected positions (not from a spherical position angle) so it
 * stays correct even when the sun is below the horizon: the crescent still points the right way at
 * night, which is exactly the case a spherical shortcut gets wrong.
 */
export function brightLimbUnitVector(moonXY, sunXY) {
    const dx = sunXY.x - moonXY.x;
    const dy = sunXY.y - moonXY.y;
    const len = Math.hypot(dx, dy);
    // Degenerate only at exact conjunction — where the moon is new (nothing lit) anyway.
    if (len < 1e-9) return { sx: 1, sy: 0 };
    return { sx: dx / len, sy: dy / len };
}

/**
 * Star / constellation opacity as a PURE function of the shared globalIllumination knob (ac2, cr3):
 * 1.0 at the night floor, ~0.23 at the dusk/dawn plateau (Han's "subtiel zichtbaar in dusk/dawn"),
 * 0 in full day. Squared so the daylight tail dies quickly rather than leaving a grey haze.
 * Reuses weatherCycle's already-exported `easeInOut` — no second smoothstep in the codebase.
 */
export function starOpacity(globalIllumination) {
    const t = (globalIllumination - STAR_FADE_LO) / (STAR_FADE_HI - STAR_FADE_LO);
    return (1 - easeInOut(t)) ** 2;
}

// Size buckets in GAME pixels, locked by the design ("grote sterren als een 'cirkel van 3 gpx',
// middelgrote als 2 gpx, de kleinste 1 gpx").
export function starSizeGpx(mag) {
    if (mag < 1.5) return 3;
    if (mag < 3.0) return 2;
    return 1;
}

// Quantised B−V → colour. Deliberately high-value (bright) hexes: a 1-px dot has no area to carry a
// dark tint, so realistic luminance would just read as "dim grey". Han: "gebruik de kleur van de ster
// (die wit/blauwwit/etc.)".
export const STAR_PALETTE = [
    { maxBv: -0.05, color: '#a9c8ff' },   // blue-white — Rigel, Spica
    { maxBv: 0.30, color: '#e8f0ff' },    // white — Vega, Sirius
    { maxBv: 0.60, color: '#f8f4e8' },    // yellow-white — Procyon
    { maxBv: 1.00, color: '#ffe9b0' },    // yellow — Capella
    { maxBv: Infinity, color: '#ffbb77' },// orange-red — Betelgeuse, Aldebaran, Antares
];

export function starColor(bv) {
    for (const entry of STAR_PALETTE) {
        if (bv < entry.maxBv) return entry.color;
    }
    return STAR_PALETTE[STAR_PALETTE.length - 1].color;
}

/**
 * Does this star EVER clear the horizon inside the visible azimuth window? Used by the catalogue
 * generator to drop stars that can never be seen from Brussels facing south, and by its figure
 * validation. Kept here (not in the script) so the data and the renderer share one definition.
 */
export function everVisibleFromSouth(raHours, decDeg, samples = 720) {
    for (let i = 0; i < samples; i++) {
        const { altDeg, azSouthDeg } = altAz(raHours, decDeg, (360 * i) / samples);
        if (altDeg >= 0 && Math.abs(azSouthDeg) <= HALF_FOV_AZ_DEG) return true;
    }
    return false;
}
