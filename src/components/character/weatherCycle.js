// Auto weer-cyclus voor de RPG-wereld (Han 2026-09-01).
//
// Purpose: the walkable world varies its own "weather" instead of Han having to poke the debug
// pickers. THREE independent tracks, all with *gradual* transitions so nothing ever jump-cuts:
//
//   • WIND   — every WIND_INTERVAL_S seconds a new random speed 0..3 (weighted toward 1, drawn WITH
//              replacement so repeats are allowed), eased toward over WIND_FADE_S seconds.
//   • TIME OF DAY — a fixed loop  day → dusk → night → dawn → (repeat)  with per-phase durations
//              from TIME_PHASES, the global illumination eased over TIME_FADE_S at every phase edge.
//   • CLOUD COVER (§375, #1192) — every CLOUD_INTERVAL_MIN_S..MAX_S seconds a new type from
//              CLOUD_TYPES (weighted toward LIGHT, same bag shape as wind), eased over CLOUD_FADE_S.
//              See the §375 block below for the one-scalar / three-ramp model.
//
// When the illumination phase turns to dusk (day→night) or dawn (night→day) the on-screen critter
// set has to swap day↔night. Han's spec: fade the critter layer OUT over CRITTER_FADE_S, re-roll the
// pool at the midpoint, fade it back IN over CRITTER_FADE_S — so by the end of the crossfade the
// right animals are standing there. That opacity is `critterOpacity` in the derived outputs.
//
// This module is PURE. `tickWeather` is a reducer: (state, dtSeconds, rand) -> nextState. The React
// component (RpgLevelPanel) owns the clock (a ref driven by the shared useFrameLoop) and pushes the
// derived outputs into `foliageParams` (globalIllumination / skewAmount / stretchAmount / timeOfDay)
// and into the critter layer. `weatherCycleStore.js` persists one state object across the
// RpgLevelPanel unmount so the cycle FREEZES during a music LEVEL and resumes exactly where it was.

// Fixed phase order + durations (seconds) and the illumination each phase settles at.
// dusk and dawn share an illumination (~0.33) but are DISTINCT phases: dusk = day→night (critters
// swap to 'night'), dawn = night→day (critters swap to 'day').
export const TIME_PHASES = [
    { name: 'day', dur: 240, illum: 1 },
    { name: 'dusk', dur: 60, illum: 0.33 },
    // #weather §362 → §370: night floor 0.12 → 0.10 → 0.05 (Han: "maak de global ilum nog wat donkerder:
    // 50% - echt donkerblauw"). Halved again; the deep-blue AMBIENT_DARK_COLOR + the moon rim carry the
    // readability now.
    // §374 UAT r2 (#1191, Han 2026-09-04): "midden in de nacht de wereld te donker" — lifted back to
    // 0.12 (the §362 value). `starOpacity` (celestialModel) eases in shallowly from 0.05, so this only
    // takes the stars from 1.0 to ~0.94 — still full night.
    { name: 'night', dur: 120, illum: 0.12 },
    { name: 'dawn', dur: 60, illum: 0.33 },
];

// §374 "sterrenhemel" (#1191, Han 2026-09-04) — the celestial layer needs a CONTINUOUS clock over the
// whole day→dusk→night→dawn loop, not just "which phase are we in". Both constants are DERIVED from
// TIME_PHASES (CLAUDE.md §6c: never a typed 480 / [0,240,300,420]) so retuning a phase duration moves
// the sun, the moon and the star sphere with it, automatically.
export const CYCLE_TOTAL_S = TIME_PHASES.reduce((a, p) => a + p.dur, 0);              // 480 s
export const PHASE_START_S = TIME_PHASES.reduce(                                      // [0,240,300,420]
    (acc, p) => [...acc, acc[acc.length - 1] + p.dur],
    [0],
).slice(0, TIME_PHASES.length);

// §374: ONE knob for the whole sky. 28 day/night cycles = one new→full→new lunation (Han: "28 cycles =
// een maancyclus"). The same 28 also compresses the "year" (the sun's RA drift), which is what gives
// the star sphere its 1 + 1/28 sidereal excess per cycle — see celestialModel.js `localSiderealDeg`.
export const CYCLES_PER_LUNATION = 28;

// Weighted-toward-1 bag, sampled uniformly WITH replacement (Han: "gewogen richting 1, herhaling mag,
// dus uniform met terugleggen"). Draw distribution: 0 → 1/7, 1 → 3/7, 2 → 2/7, 3 → 1/7.
export const WIND_BAG = [0, 1, 1, 1, 2, 2, 3];

export const WIND_INTERVAL_S = 30;   // how often a new wind speed is drawn
export const WIND_FADE_S = 3;        // ease duration between wind speeds
// #weather §365 (Han 2026-09-01, "wanneer windkracht 3 gerold wordt, laat die maar 10 seconden op die
// kracht blazen, en zak dan af naar windkracht 2"): a full-strength gust (wind 3) is capped — once it
// has settled at 3 it holds this long, then eases down to 2 and the normal 30 s draw timer restarts.
export const WIND_GUST3_HOLD_S = 10;
export const TIME_FADE_S = 10;       // ease duration for the illumination crossfade at a phase edge
export const CRITTER_FADE_S = 5;     // fade-out (then fade-in) duration for the day↔night critter swap

// Largest dt we integrate in one tick — swallows the multi-second gap after a background tab / a
// paused music LEVEL so the cycle never "catches up" in one lurch; it just resumes.
const MAX_DT_S = 0.25;

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// Standard smoothstep-style ease-in-out on [0,1].
export function easeInOut(t) {
    t = clamp01(t);
    return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

const lerp = (a, b, t) => a + (b - a) * t;

// Which critter pool a phase implies once it has fully settled.
function phaseCritterKind(name) {
    return name === 'night' || name === 'dusk' ? 'night' : 'day';
}

export function pickWind(rand = Math.random) {
    return WIND_BAG[Math.floor(rand() * WIND_BAG.length)];
}

// ---------------------------------------------------------------------------------------------
// §375 "weertypen" (#1192, Han 2026-09-04) — the THIRD auto-cycling track: cloud cover.
//
// Han: "DONKER BEWOLKT: lucht is grijs en vlekkerig, globalIllumination iets omlaag, zon EN maan niet
// zichtbaar. BEWOLKT: achtergrond wit + vlekkerig, de zon is waterig achter de wolken; maan en sterren
// niet zichtbaar. LICHT BEWOLKT: as is. HELDER: maak de witte fade minder wit en het blauw blauwer."
//
// THE WHOLE FEATURE IS ONE SCALAR. The four types are four positions on ONE continuous axis
// (`cloudCoverT`, 0..1), and every renderer expresses its look as a lerp over one of the three ramps
// below — there is not a single `if (cloudType === ...)` anywhere downstream. That is what makes a
// transition ease *through* the intermediate looks automatically ("no jump-cuts") and what makes
// LIGHT byte-for-byte identical to the pre-§375 world BY CONSTRUCTION rather than by a special case:
// at LIGHT all three ramps are exactly 0, so every new term multiplies out.
export const CLOUD_TYPES = ['CLEAR', 'LIGHT', 'OVERCAST', 'DARK_OVERCAST'];   // increasing cover
export const DEFAULT_CLOUD_TYPE = 'LIGHT';   // ac8: a persisted state with no cloud fields = "as is"

// The ONLY free number on the axis. OVERCAST is DERIVED as the midpoint of LIGHT..DARK_OVERCAST so the
// two upper segments are equal in width — a table of four hand-picked levels would silently stop
// making sense the moment this one value is retuned (CLAUDE.md §6c).
const CLOUD_LIGHT_COVER = 0.25;
export const CLOUD_COVER = {
    CLEAR: 0,
    LIGHT: CLOUD_LIGHT_COVER,
    OVERCAST: (CLOUD_LIGHT_COVER + 1) / 2,
    DARK_OVERCAST: 1,
};

// DERIVED from the wind bag (§6c): the SAME 1/7 · 3/7 · 2/7 · 1/7 weighting, mapped onto the four
// cover levels in increasing order ⇒ weighted toward LIGHT (3/7), with CLEAR and DARK_OVERCAST equally
// rare (1/7 each). One weighting shape in this file, two tracks reading it.
export const CLOUD_BAG = WIND_BAG.map((n) => CLOUD_TYPES[n]);

// Han's "elke ~60-120 s een nieuw weertype". MAX is derived from MIN so there is one knob, not two.
export const CLOUD_INTERVAL_MIN_S = 60;
export const CLOUD_INTERVAL_MAX_S = 2 * CLOUD_INTERVAL_MIN_S;
// The SAME 10 s ease the illumination crossfade uses — a cloud sheet rolling in should feel like the
// light changing, not like a separate effect on its own clock.
export const CLOUD_FADE_S = TIME_FADE_S;
// One 0.1 illumination drop per cover STEP above LIGHT ⇒ 1.0 / 1.0 / 0.9 / 0.8 across the four types,
// from one formula (see `cloudIllumMultiplier`) instead of a 4-entry table.
export const CLOUD_ILLUM_DROP_STEP = 0.1;
// Range of the mottle-noise seed (see §375 / SkyGradientBackdrop). 2^31, so it stays a safe int32 for
// the `Math.imul` hash.
const CLOUD_SEED_RANGE = 2147483648;
// Deterministic stand-in for a state that predates the cloud track and has never been ticked. Real
// states roll their own in `createWeatherState` / on the first `tickWeather` (see there).
const DEFAULT_CLOUD_SEED = 0;

// The THREE ramps. Between them they partition the axis, and every visual in §375 is a lerp over one
// of { clearness, collapseT, darkT, 1-collapseT, 1-darkT } — nothing else.
/** 1 at CLEAR → 0 at LIGHT and above. Drives "bluer sky, less white horizon". */
export function cloudClearness(t) {
    return clamp01((CLOUD_COVER.LIGHT - t) / (CLOUD_COVER.LIGHT - CLOUD_COVER.CLEAR));
}
/** 0 at LIGHT and below → 1 at OVERCAST and above. Drives the flat sheet, the mottle, hiding the moon/stars. */
export function cloudCollapseT(t) {
    return clamp01((t - CLOUD_COVER.LIGHT) / (CLOUD_COVER.OVERCAST - CLOUD_COVER.LIGHT));
}
/** 0 at OVERCAST and below → 1 at DARK_OVERCAST. Drives grey-vs-white and hiding the sun. */
export function cloudDarkT(t) {
    return clamp01((t - CLOUD_COVER.OVERCAST) / (CLOUD_COVER.DARK_OVERCAST - CLOUD_COVER.OVERCAST));
}

/** 1.0 CLEAR · 1.0 LIGHT · 0.9 OVERCAST · 0.8 DARK_OVERCAST — Han's locked values, as a formula. */
export function cloudIllumMultiplier(t) {
    return 1 - CLOUD_ILLUM_DROP_STEP * (cloudCollapseT(t) + cloudDarkT(t));
}

export function pickCloud(rand = Math.random) {
    return CLOUD_BAG[Math.floor(rand() * CLOUD_BAG.length)];
}

// A fresh 60..120 s draw interval. Unlike wind (a fixed 30 s) the cloud draw interval is a RANGE, so
// it is re-rolled at every draw and carried on the state.
function pickCloudInterval(rand) {
    return CLOUD_INTERVAL_MIN_S + rand() * (CLOUD_INTERVAL_MAX_S - CLOUD_INTERVAL_MIN_S);
}

// Fresh cycle: full daylight, calm-ish wind (1), no transition in flight, first wind draw in 30 s.
// `rand` is a parameter (not a bare `Math.random`) purely so tests can pin the first cloud interval
// and the mottle seed; every existing call site passes nothing and is unaffected.
export function createWeatherState(rand = Math.random) {
    return {
        phaseIndex: 0,
        phaseElapsed: 0,
        // §374: how many WHOLE day/night cycles have elapsed. Only ever incremented on the dawn→day
        // wrap in tickWeather; combined with the in-cycle fraction it gives the moon its lunation
        // phase and the star sphere its sidereal drift. Integer, unbounded (it is taken mod 28).
        cyclesElapsed: 0,
        // §374 UAT r2 (#1191): debug-only. `null` ⇒ the moon phase runs automatically off
        // `cyclesElapsed`; a number in {0, 0.25, 0.5, 0.75} pins it to new / first-quarter / full /
        // last-quarter for eyeballing. Set via `seekLunation`, carried untouched through `tickWeather`.
        lunationOverride: null,
        // illumination fade
        illum: 1,
        illumFrom: 1,
        illumTo: 1,
        illumFadeElapsed: TIME_FADE_S,   // >= TIME_FADE_S ⇒ settled
        // wind fade
        wind: 1,
        windFrom: 1,
        windTo: 1,
        windFadeElapsed: WIND_FADE_S,    // >= WIND_FADE_S ⇒ settled
        windTimer: 0,                    // seconds since the last draw
        wind3HoldS: 0,                   // §365: seconds a settled wind-3 gust has been held (cap at WIND_GUST3_HOLD_S)
        // §375 cloud-cover fade — field-for-field the twin of the wind block above, which is exactly
        // why freezing/resuming the cycle through `weatherCycleStore` needs no migration at all.
        cloudType: DEFAULT_CLOUD_TYPE,               // destination TYPE — what the debug picker shows
        cloudCover: CLOUD_COVER[DEFAULT_CLOUD_TYPE], // eased CURRENT value          (twin of: wind)
        cloudFrom: CLOUD_COVER[DEFAULT_CLOUD_TYPE],  //                              (twin of: windFrom)
        cloudTo: CLOUD_COVER[DEFAULT_CLOUD_TYPE],    //                              (twin of: windTo)
        cloudFadeElapsed: CLOUD_FADE_S,              // >= CLOUD_FADE_S ⇒ settled    (twin of: windFadeElapsed)
        cloudTimer: 0,                               // seconds since the last draw  (twin of: windTimer)
        // The one place the cloud track differs from wind: its draw interval is a RANGE (60..120 s),
        // so the currently-rolled interval has to live on the state rather than being a constant.
        cloudNextDrawS: pickCloudInterval(rand),
        // §375: a stable-per-session seed (rolled ONCE, carried through `weatherCycleStore`). It drove
        // the procedural cloud-mottle noise field, which §375 UAT r1 removed ("de vlekken hoeven
        // niet"). Kept — still exported by `weatherOutputs` — because the planned cloud-SPRITES-per-
        // parallax-layer follow-up will want exactly this: one stable per-session seed for placement.
        cloudSeed: Math.floor(rand() * CLOUD_SEED_RANGE),
        // critter day↔night crossfade
        critterKind: 'day',
        critterSwapElapsed: -1,          // -1 ⇒ idle; else 0..(2*CRITTER_FADE_S)
        critterSwapTo: 'day',
    };
}

// (Re)start the critter fade-out/re-roll/fade-in toward `targetKind`, unless it is already where we
// want it and nothing is in flight.
function startCritterSwap(s, targetKind) {
    if (targetKind === s.critterKind && s.critterSwapElapsed < 0) return;
    s.critterSwapElapsed = 0;
    s.critterSwapTo = targetKind;
}

// Advance one frame. Pure: returns a NEW state object, never mutates the input.
export function tickWeather(state, dtSeconds, rand = Math.random) {
    const dt = Math.max(0, Math.min(dtSeconds, MAX_DT_S));
    const s = { ...state };
    if (dt === 0) return s;

    // --- illumination fade ---
    if (s.illumFadeElapsed < TIME_FADE_S) {
        s.illumFadeElapsed = Math.min(s.illumFadeElapsed + dt, TIME_FADE_S);
        s.illum = lerp(s.illumFrom, s.illumTo, easeInOut(s.illumFadeElapsed / TIME_FADE_S));
    } else {
        s.illum = s.illumTo;
    }

    // --- wind fade ---
    if (s.windFadeElapsed < WIND_FADE_S) {
        s.windFadeElapsed = Math.min(s.windFadeElapsed + dt, WIND_FADE_S);
        s.wind = lerp(s.windFrom, s.windTo, easeInOut(s.windFadeElapsed / WIND_FADE_S));
    } else {
        s.wind = s.windTo;
    }

    // --- §375 cloud-cover fade ---
    // Byte-for-byte parallel to the wind fade above. The `??` fallbacks are the ac8 legacy tolerance
    // (a state persisted before §375 has none of these fields) — the same pattern §374 used for
    // `lunationOverride`.
    const cloudFade = s.cloudFadeElapsed ?? CLOUD_FADE_S;
    if (cloudFade < CLOUD_FADE_S) {
        s.cloudFadeElapsed = Math.min(cloudFade + dt, CLOUD_FADE_S);
        s.cloudCover = lerp(s.cloudFrom, s.cloudTo, easeInOut(s.cloudFadeElapsed / CLOUD_FADE_S));
    } else {
        s.cloudCover = s.cloudTo ?? CLOUD_COVER[DEFAULT_CLOUD_TYPE];
    }
    // A legacy state has no mottle seed. Roll one ONCE here, where `rand` is available —
    // `weatherOutputs` is a pure derivation and must never roll anything.
    if (s.cloudSeed == null) s.cloudSeed = Math.floor(rand() * CLOUD_SEED_RANGE);

    // --- §365: cap a full-strength gust (wind 3) ---
    // Once a wind-3 gust has fully settled, hold WIND_GUST3_HOLD_S then ease it down to 2 and restart
    // the normal draw timer. (13 s total < the 30 s draw interval, so a normal roll never interrupts it.)
    if (s.windTo === 3 && s.windFadeElapsed >= WIND_FADE_S) {
        s.wind3HoldS = (s.wind3HoldS || 0) + dt;
        if (s.wind3HoldS >= WIND_GUST3_HOLD_S) {
            s.windFrom = 3;
            s.windTo = 2;
            s.windFadeElapsed = 0;
            s.windTimer = 0;
            s.wind3HoldS = 0;
        }
    } else if (s.windTo !== 3) {
        s.wind3HoldS = 0;
    }

    // --- time-of-day phase advance ---
    s.phaseElapsed += dt;
    // `while`, not `if`: a pathological dt could span a whole (60 s) phase. In practice dt ≤ 0.25 s.
    while (s.phaseElapsed >= TIME_PHASES[s.phaseIndex].dur) {
        s.phaseElapsed -= TIME_PHASES[s.phaseIndex].dur;
        s.phaseIndex = (s.phaseIndex + 1) % TIME_PHASES.length;
        // §374: the dawn(last) → day(0) wrap IS one whole day passing. No new timer and no wall-clock
        // — it rides the phase clock that already exists, which is why freezing the cycle during a
        // music LEVEL (weatherCycleStore) keeps working untouched.
        if (s.phaseIndex === 0) s.cyclesElapsed += 1;
        const phase = TIME_PHASES[s.phaseIndex];
        s.illumFrom = s.illum;
        s.illumTo = phase.illum;
        s.illumFadeElapsed = 0;
        startCritterSwap(s, phaseCritterKind(phase.name));
    }

    // --- critter day↔night crossfade ---
    if (s.critterSwapElapsed >= 0) {
        s.critterSwapElapsed += dt;
        // flip the pool once, at the midpoint (end of the fade-out)
        if (s.critterKind !== s.critterSwapTo && s.critterSwapElapsed >= CRITTER_FADE_S) {
            s.critterKind = s.critterSwapTo;
        }
        if (s.critterSwapElapsed >= 2 * CRITTER_FADE_S) {
            s.critterKind = s.critterSwapTo;
            s.critterSwapElapsed = -1;
        }
    }

    // --- wind draw timer ---
    s.windTimer += dt;
    if (s.windTimer >= WIND_INTERVAL_S) {
        s.windTimer -= WIND_INTERVAL_S;
        s.windFrom = s.wind;
        s.windTo = pickWind(rand);
        s.windFadeElapsed = 0;
    }

    // --- §375 cloud draw timer ---
    // Same accumulator shape as the wind draw timer directly above — no new timer and no wall clock,
    // which is what keeps freeze/resume through `weatherCycleStore` working untouched.
    const nextDrawS = s.cloudNextDrawS ?? CLOUD_INTERVAL_MIN_S;
    s.cloudTimer = (s.cloudTimer ?? 0) + dt;
    if (s.cloudTimer >= nextDrawS) {
        s.cloudTimer -= nextDrawS;
        s.cloudNextDrawS = pickCloudInterval(rand);   // a NEW 60..120 s interval every draw
        s.cloudType = pickCloud(rand);                // repeats allowed (with replacement, like wind)
        s.cloudFrom = s.cloudCover;                   // ease FROM wherever we currently are
        s.cloudTo = CLOUD_COVER[s.cloudType];
        s.cloudFadeElapsed = 0;
    }

    return s;
}

// Picker action: jump to `phaseName`, reset that phase's timer to full, start the 10 s illumination
// crossfade toward it, and (if needed) the critter swap. Then the cycle carries on normally from
// there. (Han: "start transitie naar geselecteerde waarde... timer van die fase reset op vol".)
export function seekPhase(state, phaseName) {
    const idx = TIME_PHASES.findIndex((p) => p.name === phaseName);
    if (idx < 0) return state;
    // §374: `cyclesElapsed` is deliberately left UNCHANGED. A debug seek is a jump within the current
    // day, not a day passing — bumping it would slew the moon phase every time Han pokes the picker.
    const s = { ...state, phaseIndex: idx, phaseElapsed: 0 };
    s.illumFrom = s.illum;
    s.illumTo = TIME_PHASES[idx].illum;
    s.illumFadeElapsed = 0;
    startCritterSwap(s, phaseCritterKind(phaseName));
    return s;
}

// Picker action: ease toward wind speed `n` over 3 s and restart the 30 s draw timer.
export function seekWind(state, n) {
    return {
        ...state,
        windFrom: state.wind,
        windTo: n,
        windFadeElapsed: 0,
        windTimer: 0,
        wind3HoldS: 0,   // §365: a manually-picked 3 also gets the 10 s cap
    };
}

// §375 picker action: ease toward cloud type `type` over CLOUD_FADE_S and restart the draw timer, so
// the auto-cycle simply carries on from there (ac1). `cloudNextDrawS` is deliberately left as-is — it
// is already a valid 60..120 s interval, and re-rolling it would need a `rand` the picker has no
// business supplying. Exactly the shape of `seekWind`.
export function seekCloud(state, type) {
    if (!(type in CLOUD_COVER)) return state;   // unknown ⇒ no-op, mirrors seekPhase
    return {
        ...state,
        cloudType: type,
        cloudFrom: state.cloudCover ?? CLOUD_COVER[DEFAULT_CLOUD_TYPE],
        cloudTo: CLOUD_COVER[type],
        cloudFadeElapsed: 0,
        cloudTimer: 0,
    };
}

// §374 UAT r2 (#1191, Han 2026-09-04) — debug-only. Pin the lunation phase to one of the four quarter
// values (`0` new · `0.25` first quarter · `0.5` full · `0.75` last quarter), or pass `null` to
// resume the automatic 28-cycle progression. The value feeds straight into
// `weatherOutputs().lunationPhase`, which drives the moon, the sun's RA drift AND the star sphere
// together — this is a jump in lunation TIME, not a moon-only cheat. Clearing it (`null`) snaps back
// to wherever the real clock now is; that is acceptable for a debug affordance (`cyclesElapsed` has
// been counting underneath the override the whole time).
export function seekLunation(state, value) {
    return { ...state, lunationOverride: value };
}

// Derived, render-facing view of a state. Everything here is a pure function of `state`.
export function weatherOutputs(state) {
    const phase = TIME_PHASES[state.phaseIndex];
    let critterOpacity = 1;
    if (state.critterSwapElapsed >= 0) {
        const e = state.critterSwapElapsed;
        if (e < CRITTER_FADE_S) {
            critterOpacity = 1 - easeInOut(e / CRITTER_FADE_S);
        } else if (e < 2 * CRITTER_FADE_S) {
            critterOpacity = easeInOut((e - CRITTER_FADE_S) / CRITTER_FADE_S);
        }
    }
    // §374 (#1191): the continuous cycle clock and the moon's lunation phase — PURE derivations of the
    // phase clock above, no timers of their own. `lunationPhase` is continuous rather than stepped
    // once per cycle; a stepped value would jerk the whole star sphere at every cycle boundary.
    const cycleT = (PHASE_START_S[state.phaseIndex] + state.phaseElapsed) / CYCLE_TOTAL_S;
    // §374 UAT r2: a debug `lunationOverride` (0/0.25/0.5/0.75) pins the phase; `null`/absent ⇒ auto.
    const lunationPhase = state.lunationOverride != null
        ? state.lunationOverride
        : ((state.cyclesElapsed + cycleT) % CYCLES_PER_LUNATION) / CYCLES_PER_LUNATION;
    // §375: the eased cloud-cover scalar and the ONE illumination multiplier derived from it. `??` is
    // the ac8 legacy tolerance — a state from before §375 reads as LIGHT, whose multiplier is exactly
    // 1.0, so `globalIllumination` below is then bit-for-bit the pre-§375 value.
    const cloudCoverT = state.cloudCover ?? CLOUD_COVER[DEFAULT_CLOUD_TYPE];
    const illumMultiplier = cloudIllumMultiplier(cloudCoverT);
    return {
        // §375 (cr3): the cloud darkening folds in HERE, in this one line, and nowhere else. Every
        // downstream consumer (the WebGL shaders' uMix, LdtkLitGround, WaterReflectionLayer's CSS
        // brightness, SkyGradientBackdrop's mixNight/sunsetFactor, CelestialSky's starOpacity,
        // RpgLevelPanel's domAmbientTint/bgNight/moonPresence) keeps reading this single scalar and
        // knows nothing about clouds. There is no second darkness knob.
        globalIllumination: state.illum * illumMultiplier,
        windValue: state.wind,
        // 0..1 over the whole 480 s loop (day 0 · dusk 0.5 · night 0.625 · dawn 0.875).
        cycleT,
        // 0..1 over CYCLES_PER_LUNATION cycles: 0 = new moon, 0.5 = full.
        lunationPhase,
        // §374 UAT r2: null ⇒ automatic; else the pinned quarter value — for the debug picker's selection.
        lunationOverride: state.lunationOverride ?? null,
        // string the existing lighting-tint / critter-tag consumers expect: dusk & dawn both map to
        // the legacy 'dusk-dawn' bucket.
        timeOfDay: phase.name === 'day' ? 'day' : phase.name === 'night' ? 'night' : 'dusk-dawn',
        phaseName: phase.name,       // 'day' | 'dusk' | 'night' | 'dawn' — for the debug picker's selection
        critterKind: state.critterKind,   // 'day' | 'night' — drives which critter pool is rolled
        critterOpacity,              // 0..1 — opacity of the whole critter layer during a swap
        // §375 cloud cover.
        cloudType: state.cloudType ?? DEFAULT_CLOUD_TYPE,   // string — for the debug picker + the docs
        cloudCoverT,                 // 0..1 eased — THE canonical scalar every cloud visual derives from
        // DIAGNOSTIC / TEST ONLY: already folded into `globalIllumination` above — NEVER multiply this
        // in again (cr3).
        illumMultiplier,
        // §375: the mottle-noise seed, so the sky layer can key its cached noise field on it.
        cloudSeed: state.cloudSeed ?? DEFAULT_CLOUD_SEED,
    };
}
