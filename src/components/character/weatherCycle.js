// Auto weer-cyclus voor de RPG-wereld (Han 2026-09-01).
//
// Purpose: the walkable world varies its own "weather" instead of Han having to poke the debug
// pickers. Two independent tracks, both with *gradual* transitions so nothing ever jump-cuts:
//
//   • WIND   — every WIND_INTERVAL_S seconds a new random speed 0..3 (weighted toward 1, drawn WITH
//              replacement so repeats are allowed), eased toward over WIND_FADE_S seconds.
//   • TIME OF DAY — a fixed loop  day → dusk → night → dawn → (repeat)  with per-phase durations
//              from TIME_PHASES, the global illumination eased over TIME_FADE_S at every phase edge.
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
    { name: 'night', dur: 120, illum: 0.05 },
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

// Fresh cycle: full daylight, calm-ish wind (1), no transition in flight, first wind draw in 30 s.
export function createWeatherState() {
    return {
        phaseIndex: 0,
        phaseElapsed: 0,
        // §374: how many WHOLE day/night cycles have elapsed. Only ever incremented on the dawn→day
        // wrap in tickWeather; combined with the in-cycle fraction it gives the moon its lunation
        // phase and the star sphere its sidereal drift. Integer, unbounded (it is taken mod 28).
        cyclesElapsed: 0,
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
    const lunationPhase = ((state.cyclesElapsed + cycleT) % CYCLES_PER_LUNATION) / CYCLES_PER_LUNATION;
    return {
        globalIllumination: state.illum,
        windValue: state.wind,
        // 0..1 over the whole 480 s loop (day 0 · dusk 0.5 · night 0.625 · dawn 0.875).
        cycleT,
        // 0..1 over CYCLES_PER_LUNATION cycles: 0 = new moon, 0.5 = full.
        lunationPhase,
        // string the existing lighting-tint / critter-tag consumers expect: dusk & dawn both map to
        // the legacy 'dusk-dawn' bucket.
        timeOfDay: phase.name === 'day' ? 'day' : phase.name === 'night' ? 'night' : 'dusk-dawn',
        phaseName: phase.name,       // 'day' | 'dusk' | 'night' | 'dawn' — for the debug picker's selection
        critterKind: state.critterKind,   // 'day' | 'night' — drives which critter pool is rolled
        critterOpacity,              // 0..1 — opacity of the whole critter layer during a swap
    };
}
