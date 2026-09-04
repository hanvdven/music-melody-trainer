import { describe, it, expect } from 'vitest';
import {
    createWeatherState, tickWeather, weatherOutputs, seekPhase, seekWind, seekLunation, pickWind, easeInOut,
    TIME_PHASES, WIND_BAG, WIND_INTERVAL_S, WIND_FADE_S, TIME_FADE_S, CRITTER_FADE_S, WIND_GUST3_HOLD_S,
    CYCLE_TOTAL_S, PHASE_START_S, CYCLES_PER_LUNATION,
    seekCloud, pickCloud, cloudClearness, cloudCollapseT, cloudDarkT, cloudIllumMultiplier,
    CLOUD_TYPES, CLOUD_BAG, CLOUD_COVER, CLOUD_FADE_S, CLOUD_INTERVAL_MIN_S, CLOUD_INTERVAL_MAX_S,
    CLOUD_ILLUM_DROP_STEP, DEFAULT_CLOUD_TYPE,
} from '../weatherCycle';
import { loadWeatherState, saveWeatherState } from '../weatherCycleStore';

// Integrate `seconds` of cycle time in ~12 fps steps (the component's real cadence).
function advance(state, seconds, { dt = 1 / 12, rand = () => 0.5 } = {}) {
    let s = state;
    let remaining = seconds;
    while (remaining > 1e-9) {
        const step = Math.min(dt, remaining);
        s = tickWeather(s, step, rand);
        remaining -= step;
    }
    return s;
}

describe('easeInOut', () => {
    it('pins the endpoints and clamps out-of-range input', () => {
        expect(easeInOut(0)).toBe(0);
        expect(easeInOut(1)).toBe(1);
        expect(easeInOut(0.5)).toBeCloseTo(0.5, 6);
        expect(easeInOut(-3)).toBe(0);
        expect(easeInOut(9)).toBe(1);
    });
});

describe('pickWind', () => {
    it('only ever returns 0..3', () => {
        for (let i = 0; i < 1000; i++) {
            const w = pickWind(() => i / 1000);
            expect([0, 1, 2, 3]).toContain(w);
        }
    });

    it('is weighted toward 1 (bag [0,1,1,1,2,2,3])', () => {
        expect(WIND_BAG).toEqual([0, 1, 1, 1, 2, 2, 3]);
        const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
        for (let i = 0; i < 7000; i++) counts[pickWind(() => i / 7000)] += 1;
        expect(counts[1]).toBeGreaterThan(counts[0]);
        expect(counts[1]).toBeGreaterThan(counts[2]);
        expect(counts[1]).toBeGreaterThan(counts[3]);
        expect(counts[1] / counts[0]).toBeGreaterThan(2.5);   // ~3:1
        expect(Math.abs(counts[0] - counts[3])).toBeLessThan(200);   // 0 and 3 equally rare
    });
});

describe('time-of-day cycle', () => {
    it('runs day → dusk → night → dawn → day in fixed order at 240/60/120/60 s', () => {
        expect(TIME_PHASES.map((p) => p.name)).toEqual(['day', 'dusk', 'night', 'dawn']);
        expect(TIME_PHASES.map((p) => p.dur)).toEqual([240, 60, 120, 60]);

        let s = createWeatherState();
        expect(weatherOutputs(s).phaseName).toBe('day');

        s = advance(s, 239);
        expect(weatherOutputs(s).phaseName).toBe('day');
        s = advance(s, 2);                              // 241
        expect(weatherOutputs(s).phaseName).toBe('dusk');

        s = advance(s, 58);                             // 299
        expect(weatherOutputs(s).phaseName).toBe('dusk');
        s = advance(s, 3);                              // 302
        expect(weatherOutputs(s).phaseName).toBe('night');

        s = advance(s, 118);                            // 420
        expect(weatherOutputs(s).phaseName).toBe('night');
        s = advance(s, 3);                              // 423
        expect(weatherOutputs(s).phaseName).toBe('dawn');

        s = advance(s, 61);                             // 484
        expect(weatherOutputs(s).phaseName).toBe('day');
    });

    it('maps dusk and dawn to the shared "dusk-dawn" tint bucket', () => {
        expect(weatherOutputs(seekPhase(createWeatherState(), 'day')).timeOfDay).toBe('day');
        expect(weatherOutputs(seekPhase(createWeatherState(), 'dusk')).timeOfDay).toBe('dusk-dawn');
        expect(weatherOutputs(seekPhase(createWeatherState(), 'night')).timeOfDay).toBe('night');
        expect(weatherOutputs(seekPhase(createWeatherState(), 'dawn')).timeOfDay).toBe('dusk-dawn');
    });

    it('eases global illumination monotonically over ~TIME_FADE_S to the new phase value', () => {
        let s = seekPhase(createWeatherState(), 'night');   // 1.0 -> night floor
        expect(weatherOutputs(s).globalIllumination).toBeCloseTo(1, 6);   // ease(0) === 0, no jump

        let prev = weatherOutputs(s).globalIllumination;
        for (let i = 0; i < TIME_FADE_S; i++) {
            s = advance(s, 1);
            const cur = weatherOutputs(s).globalIllumination;
            expect(cur).toBeLessThanOrEqual(prev + 1e-9);
            prev = cur;
        }
        s = advance(s, 1);                                  // just past the fade
        expect(weatherOutputs(s).globalIllumination).toBe(0.12);   // §374 UAT r2 night floor (was 0.05)
    });
});

describe('wind', () => {
    it('holds the current speed until WIND_INTERVAL_S, then eases to the new draw over WIND_FADE_S', () => {
        let s = createWeatherState();                       // wind 1
        expect(weatherOutputs(s).windValue).toBe(1);

        s = advance(s, WIND_INTERVAL_S - 1, { rand: () => 0 });   // 29 s — no draw yet
        expect(weatherOutputs(s).windValue).toBeCloseTo(1, 6);

        s = advance(s, 1.5, { rand: () => 0 });             // 30.5 s — drew 0 (rand→bag[0]), now easing 1→0
        const mid = weatherOutputs(s).windValue;
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(1);

        s = advance(s, WIND_FADE_S, { rand: () => 0 });     // fade complete
        expect(weatherOutputs(s).windValue).toBe(0);
    });
});

describe('seek controls', () => {
    it('seekPhase jumps to the phase, resets its timer to full, and starts the eased crossfade', () => {
        let s = advance(createWeatherState(), 100);         // 100 s into day
        expect(s.phaseElapsed).toBeGreaterThan(99);

        s = seekPhase(s, 'night');
        expect(s.phaseIndex).toBe(2);
        expect(s.phaseElapsed).toBe(0);
        expect(weatherOutputs(s).phaseName).toBe('night');
        expect(weatherOutputs(s).globalIllumination).toBeCloseTo(1, 6);   // not yet faded

        s = advance(s, TIME_FADE_S + 1);
        expect(weatherOutputs(s).globalIllumination).toBe(0.12);   // §374 UAT r2 night floor (was 0.05)
    });

    it('seekWind eases toward the picked speed over WIND_FADE_S and restarts the 30 s timer', () => {
        let s = seekWind(createWeatherState(), 2);   // 2, not 3 — a 3 is capped after 10 s (§365)
        expect(weatherOutputs(s).windValue).toBeCloseTo(1, 6);            // windFrom, ease(0)

        s = advance(s, 1.5, { rand: () => 0.5 });
        const mid = weatherOutputs(s).windValue;
        expect(mid).toBeGreaterThan(1);
        expect(mid).toBeLessThan(2);

        s = advance(s, WIND_FADE_S, { rand: () => 0.5 });
        expect(weatherOutputs(s).windValue).toBe(2);

        s = advance(s, WIND_INTERVAL_S - 5, { rand: () => 0 });          // still < 30 s since the seek
        expect(weatherOutputs(s).windValue).toBe(2);                    // no new draw yet
    });

    it('§365: a wind-3 gust holds for WIND_GUST3_HOLD_S then eases down to 2', () => {
        let s = seekWind(createWeatherState(), 3);
        s = advance(s, WIND_FADE_S, { rand: () => 0.5 });               // settled at 3
        expect(weatherOutputs(s).windValue).toBe(3);

        s = advance(s, WIND_GUST3_HOLD_S - 1, { rand: () => 0.5 });     // still within the hold
        expect(weatherOutputs(s).windValue).toBe(3);

        s = advance(s, 2 + WIND_FADE_S, { rand: () => 0.5 });           // past the cap + its ease-down
        expect(weatherOutputs(s).windValue).toBe(2);
    });

    it('seekPhase to an unknown name is a no-op', () => {
        const s = createWeatherState();
        expect(seekPhase(s, 'twilight')).toBe(s);
    });
});

describe('critter day↔night crossfade', () => {
    it('fades the layer out, flips the pool at the midpoint, fades back in — over 2·CRITTER_FADE_S', () => {
        let s = seekPhase(createWeatherState(), 'dusk');    // day → night swap begins
        expect(weatherOutputs(s).critterOpacity).toBe(1);
        expect(weatherOutputs(s).critterKind).toBe('day');

        s = advance(s, CRITTER_FADE_S - 1);                 // ~4 s in — mid fade-out
        let o = weatherOutputs(s);
        expect(o.critterOpacity).toBeGreaterThan(0);
        expect(o.critterOpacity).toBeLessThan(1);
        expect(o.critterKind).toBe('day');                 // not flipped until the midpoint

        s = advance(s, 2);                                  // ~6 s — past the midpoint
        expect(weatherOutputs(s).critterKind).toBe('night');

        s = advance(s, CRITTER_FADE_S);                     // ~11 s — fully back
        o = weatherOutputs(s);
        expect(o.critterKind).toBe('night');
        expect(o.critterOpacity).toBe(1);
    });

    it('night phase keeps the night pool; day phase keeps the day pool', () => {
        let s = advance(createWeatherState(), 240 + 60 + 10);   // into night, past the dusk crossfade
        expect(weatherOutputs(s).critterKind).toBe('night');
        expect(weatherOutputs(s).critterOpacity).toBe(1);

        s = advance(s, 120 + 60 + 10);                          // through dawn, into day
        expect(weatherOutputs(s).critterKind).toBe('day');
    });
});

describe('dt clamp', () => {
    it('never integrates more than a fraction of a second per tick (tab-away / frozen LEVEL resume)', () => {
        let s = createWeatherState();
        s = tickWeather(s, 100000, () => 0.5);             // one absurd dt
        expect(s.phaseElapsed).toBeLessThanOrEqual(0.25 + 1e-9);
        expect(s.phaseIndex).toBe(0);
        expect(weatherOutputs(s).phaseName).toBe('day');
    });

    it('tickWeather is pure — it does not mutate the input state', () => {
        const s = createWeatherState();
        const snapshot = JSON.stringify(s);
        tickWeather(s, 5, () => 0.5);
        expect(JSON.stringify(s)).toBe(snapshot);
    });
});

describe('weatherCycleStore', () => {
    it('round-trips a state object and starts empty-ish', () => {
        saveWeatherState(null);
        expect(loadWeatherState()).toBeNull();
        const s = advance(createWeatherState(), 42);
        saveWeatherState(s);
        expect(loadWeatherState()).toBe(s);
        saveWeatherState(null);                            // don't leak into other suites
    });

    it('carries cyclesElapsed across a freeze/resume (§374 — the moon must not reset)', () => {
        const s = { ...createWeatherState(), cyclesElapsed: 9 };
        saveWeatherState(s);
        expect(loadWeatherState().cyclesElapsed).toBe(9);
        saveWeatherState(null);
    });
});

// §374 "sterrenhemel" (#1191): the continuous cycle clock the celestial layer reads. Everything here
// is a PURE derivation of the phase clock above — no new timers, which is why freezing the cycle
// during a music LEVEL still works untouched.
describe('§374 cycle clock — cycleT / cyclesElapsed / lunationPhase', () => {
    it('derives its constants from TIME_PHASES rather than hardcoding them', () => {
        expect(CYCLE_TOTAL_S).toBe(TIME_PHASES.reduce((a, p) => a + p.dur, 0));
        expect(PHASE_START_S).toEqual([0, 240, 300, 420]);
        expect(CYCLES_PER_LUNATION).toBe(28);
    });

    it('starts at cycleT 0 with no cycles elapsed', () => {
        const s = createWeatherState();
        expect(s.cyclesElapsed).toBe(0);
        expect(weatherOutputs(s).cycleT).toBe(0);
        expect(weatherOutputs(s).lunationPhase).toBe(0);
    });

    it('puts the phase edges at 0.5 (dusk), 0.625 (night) and 0.875 (dawn)', () => {
        let s = advance(createWeatherState(), 240);
        expect(weatherOutputs(s).cycleT).toBeCloseTo(0.5, 4);
        s = advance(s, 60);
        expect(weatherOutputs(s).cycleT).toBeCloseTo(0.625, 4);
        s = advance(s, 120);
        expect(weatherOutputs(s).cycleT).toBeCloseTo(0.875, 4);
    });

    it('advances cycleT monotonically across one loop, wrapping exactly once', () => {
        let s = createWeatherState();
        let prev = weatherOutputs(s).cycleT;
        let wraps = 0;
        for (let i = 0; i < CYCLE_TOTAL_S; i++) {
            s = advance(s, 1);
            const cur = weatherOutputs(s).cycleT;
            if (cur < prev) wraps += 1;
            else expect(cur).toBeGreaterThan(prev);
            prev = cur;
        }
        expect(wraps).toBe(1);
    });

    it('increments cyclesElapsed exactly once per full cycle', () => {
        let s = createWeatherState();
        s = advance(s, CYCLE_TOTAL_S);
        expect(s.cyclesElapsed).toBe(1);
        // +1 s of slack: `advance` integrates in 1/12 s steps and its float error accumulates over
        // 1440 s, so landing EXACTLY on the third wrap is not something to assert on.
        s = advance(s, 2 * CYCLE_TOTAL_S + 1);
        expect(s.cyclesElapsed).toBe(3);
    });

    it('advances lunationPhase by exactly 1/28 per cycle and wraps at 28', () => {
        // Tested on the PURE derivation: integrating 28 × 480 s at 1/12 s steps would be 161k ticks
        // for the same answer.
        const fresh = createWeatherState();
        expect(weatherOutputs({ ...fresh, cyclesElapsed: 1 }).lunationPhase).toBeCloseTo(1 / 28, 12);
        expect(weatherOutputs({ ...fresh, cyclesElapsed: 14 }).lunationPhase).toBeCloseTo(0.5, 12);
        expect(weatherOutputs({ ...fresh, cyclesElapsed: 28 }).lunationPhase).toBeCloseTo(0, 12);
        expect(weatherOutputs({ ...fresh, cyclesElapsed: 29 }).lunationPhase).toBeCloseTo(1 / 28, 12);
    });

    it('is continuous within a cycle — no jerk at the cycle boundary', () => {
        const fresh = createWeatherState();
        const justBefore = weatherOutputs({ ...fresh, cyclesElapsed: 3, phaseIndex: 3, phaseElapsed: 59.9 }).lunationPhase;
        const justAfter = weatherOutputs({ ...fresh, cyclesElapsed: 4, phaseIndex: 0, phaseElapsed: 0 }).lunationPhase;
        expect(justAfter - justBefore).toBeCloseTo((0.1 / CYCLE_TOTAL_S) / CYCLES_PER_LUNATION, 9);
    });

    it('seekPhase moves cycleT but never counts a day (the moon must not jump when Han pokes the picker)', () => {
        const s = seekPhase(advance(createWeatherState(), 100), 'night');
        expect(weatherOutputs(s).cycleT).toBeCloseTo(0.625, 9);
        expect(s.cyclesElapsed).toBe(0);
    });
});

// §374 UAT r2 (#1191): the debug moon-phase pin.
describe('§374 seekLunation — debug moon-phase override', () => {
    it('a fresh state has no override (lunationOverride null, phase runs off cyclesElapsed)', () => {
        expect(createWeatherState().lunationOverride).toBe(null);
        expect(weatherOutputs(createWeatherState()).lunationOverride).toBe(null);
    });

    it('pins lunationPhase to the picked quarter regardless of cyclesElapsed / cycleT', () => {
        const base = { ...createWeatherState(), cyclesElapsed: 7, phaseIndex: 2, phaseElapsed: 30 };
        for (const v of [0, 0.25, 0.5, 0.75]) {
            const s = seekLunation(base, v);
            expect(weatherOutputs(s).lunationPhase).toBe(v);
            expect(weatherOutputs(s).lunationOverride).toBe(v);
        }
    });

    it('null clears the override — lunationPhase resumes the automatic derivation', () => {
        const pinned = seekLunation({ ...createWeatherState(), cyclesElapsed: 14 }, 0.25);
        expect(weatherOutputs(pinned).lunationPhase).toBe(0.25);
        const cleared = seekLunation(pinned, null);
        expect(weatherOutputs(cleared).lunationOverride).toBe(null);
        expect(weatherOutputs(cleared).lunationPhase).toBeCloseTo(0.5, 9);   // 14/28, back on the real clock
    });

    it('tickWeather carries the override through untouched (cyclesElapsed keeps counting underneath)', () => {
        let s = seekLunation(createWeatherState(), 0.5);
        s = advance(s, CYCLE_TOTAL_S + 10);              // more than a whole cycle
        expect(s.lunationOverride).toBe(0.5);
        expect(weatherOutputs(s).lunationPhase).toBe(0.5);
        expect(s.cyclesElapsed).toBeGreaterThanOrEqual(1);   // the real clock advanced regardless
    });

    it('an absent override field (legacy persisted state) is treated as auto', () => {
        const legacy = { ...createWeatherState(), cyclesElapsed: 7 };
        delete legacy.lunationOverride;
        expect(weatherOutputs(legacy).lunationPhase).toBeCloseTo(7 / 28, 9);
        expect(weatherOutputs(legacy).lunationOverride).toBe(null);
    });
});

// §375 "weertypen" (#1192, Han 2026-09-04): the third auto-cycling track — cloud cover. One eased
// scalar (`cloudCoverT`) and three derived ramps; the four types are four positions on that one axis.
describe('§375 cloud cover — the axis, the bag and the ramps', () => {
    it('derives CLOUD_BAG from WIND_BAG and is weighted toward LIGHT', () => {
        expect(CLOUD_TYPES).toEqual(['CLEAR', 'LIGHT', 'OVERCAST', 'DARK_OVERCAST']);
        expect(CLOUD_BAG).toEqual(WIND_BAG.map((n) => CLOUD_TYPES[n]));

        const counts = { CLEAR: 0, LIGHT: 0, OVERCAST: 0, DARK_OVERCAST: 0 };
        for (let i = 0; i < 7000; i++) counts[pickCloud(() => i / 7000)] += 1;
        expect(counts.LIGHT).toBeGreaterThan(counts.OVERCAST);
        expect(counts.OVERCAST).toBeGreaterThan(counts.CLEAR);
        expect(counts.LIGHT / counts.CLEAR).toBeGreaterThan(2.5);            // ~3:1
        expect(Math.abs(counts.CLEAR - counts.DARK_OVERCAST)).toBeLessThan(200);   // equally rare
    });

    it('derives OVERCAST as the midpoint of LIGHT..DARK_OVERCAST (no hardcoded 4-entry table)', () => {
        expect(CLOUD_COVER.CLEAR).toBe(0);
        expect(CLOUD_COVER.DARK_OVERCAST).toBe(1);
        expect(CLOUD_COVER.OVERCAST).toBeCloseTo((CLOUD_COVER.LIGHT + CLOUD_COVER.DARK_OVERCAST) / 2, 12);
        expect(CLOUD_INTERVAL_MAX_S).toBe(2 * CLOUD_INTERVAL_MIN_S);
        expect(CLOUD_FADE_S).toBe(TIME_FADE_S);   // the SAME 10 s ease as the illum crossfade
    });

    it('the three ramps partition the axis — 0 everywhere at LIGHT (so LIGHT is "as is")', () => {
        const at = (ty) => [
            cloudClearness(CLOUD_COVER[ty]), cloudCollapseT(CLOUD_COVER[ty]), cloudDarkT(CLOUD_COVER[ty]),
        ];
        expect(at('CLEAR')).toEqual([1, 0, 0]);
        expect(at('LIGHT')).toEqual([0, 0, 0]);
        expect(at('OVERCAST')).toEqual([0, 1, 0]);
        expect(at('DARK_OVERCAST')).toEqual([0, 1, 1]);
    });

    it('a fresh state is LIGHT and already settled', () => {
        const s = createWeatherState();
        expect(s.cloudType).toBe(DEFAULT_CLOUD_TYPE);
        expect(s.cloudFadeElapsed).toBe(CLOUD_FADE_S);
        const out = weatherOutputs(s);
        expect(out.cloudType).toBe('LIGHT');
        expect(out.cloudCoverT).toBe(CLOUD_COVER.LIGHT);
        expect(out.illumMultiplier).toBe(1);
        expect(s.cloudNextDrawS).toBeGreaterThanOrEqual(CLOUD_INTERVAL_MIN_S);
        expect(s.cloudNextDrawS).toBeLessThanOrEqual(CLOUD_INTERVAL_MAX_S);
    });
});

describe('§375 cloud cover — auto-cycling and easing', () => {
    // A tiny deterministic LCG: the auto-cycle assertions must never be flaky, and a fixed
    // `() => 0.5` would draw the same type forever.
    function lcg(seed) {
        let x = seed >>> 0;
        return () => {
            x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
            return x / 4294967296;
        };
    }

    it('draws a new type after its own 60..120 s interval and settles exactly on that level', () => {
        const rand = () => 0.95;   // interval 117 s, bag[6] = DARK_OVERCAST
        let s = createWeatherState(rand);
        s = advance(s, CLOUD_INTERVAL_MAX_S + CLOUD_FADE_S, { rand });
        expect(weatherOutputs(s).cloudType).toBe('DARK_OVERCAST');
        expect(weatherOutputs(s).cloudCoverT).toBe(CLOUD_COVER.DARK_OVERCAST);
    });

    it('cycles on its own — several distinct types over many intervals', () => {
        const rand = lcg(20260904);
        let s = createWeatherState(rand);
        const seen = new Set([s.cloudType]);
        for (let i = 0; i < 20; i++) {
            s = advance(s, CLOUD_INTERVAL_MAX_S, { rand });
            seen.add(s.cloudType);
        }
        expect(seen.size).toBeGreaterThanOrEqual(3);
    });

    it('eases monotonically over CLOUD_FADE_S with no jump at the start (ac2)', () => {
        let s = seekCloud(createWeatherState(), 'DARK_OVERCAST');
        expect(weatherOutputs(s).cloudCoverT).toBe(CLOUD_COVER.LIGHT);   // ease(0) === 0, no jump-cut

        let prev = weatherOutputs(s).cloudCoverT;
        for (let i = 0; i < CLOUD_FADE_S; i++) {
            s = advance(s, 1);
            const cur = weatherOutputs(s).cloudCoverT;
            expect(cur).toBeGreaterThan(prev);
            prev = cur;
        }
        s = advance(s, 1);                                               // just past the fade
        expect(weatherOutputs(s).cloudCoverT).toBe(CLOUD_COVER.DARK_OVERCAST);
    });

    it('seekCloud restarts the draw timer and is a no-op for an unknown type', () => {
        let s = seekCloud(advance(createWeatherState(), 40), 'OVERCAST');
        expect(s.cloudTimer).toBe(0);
        expect(s.cloudType).toBe('OVERCAST');

        s = advance(s, CLOUD_INTERVAL_MIN_S - 1);                        // still inside the interval
        expect(s.cloudType).toBe('OVERCAST');                            // no new draw yet
        expect(weatherOutputs(s).cloudCoverT).toBe(CLOUD_COVER.OVERCAST);

        const fresh = createWeatherState();
        expect(seekCloud(fresh, 'HAIL')).toBe(fresh);
    });
});

describe('§375 cloud cover — illumination (the cr3 single-multiply contract)', () => {
    const settledAt = (ty) => advance(seekCloud(createWeatherState(), ty), CLOUD_FADE_S + 1);

    it('illumMultiplier is 1.0 / 1.0 / 0.9 / 0.8 from one formula, not a table', () => {
        expect(CLOUD_ILLUM_DROP_STEP).toBe(0.1);
        const expected = { CLEAR: 1, LIGHT: 1, OVERCAST: 0.9, DARK_OVERCAST: 0.8 };
        for (const ty of CLOUD_TYPES) {
            const t = CLOUD_COVER[ty];
            expect(cloudIllumMultiplier(t)).toBeCloseTo(expected[ty], 12);
            expect(cloudIllumMultiplier(t))
                .toBeCloseTo(1 - CLOUD_ILLUM_DROP_STEP * (cloudCollapseT(t) + cloudDarkT(t)), 12);
            expect(weatherOutputs(settledAt(ty)).illumMultiplier).toBeCloseTo(expected[ty], 12);
        }
    });

    it('globalIllumination === state.illum × illumMultiplier for every type × phase', () => {
        for (const ty of CLOUD_TYPES) {
            for (const phase of TIME_PHASES) {
                // Settle the cloud track first, THEN pin the phase illumination directly — integrating
                // both eases would just re-test the fade code.
                const s = { ...settledAt(ty), illum: phase.illum, illumTo: phase.illum };
                const out = weatherOutputs(s);
                expect(out.globalIllumination).toBeCloseTo(phase.illum * out.illumMultiplier, 12);
            }
        }
    });

    it('still darkens further at night — night+DARK < night+LIGHT < day+DARK', () => {
        const gi = (ty, illum) => {
            const s = { ...settledAt(ty), illum, illumTo: illum };
            return weatherOutputs(s).globalIllumination;
        };
        expect(gi('DARK_OVERCAST', 0.12)).toBeLessThan(gi('LIGHT', 0.12));
        expect(gi('LIGHT', 0.12)).toBeLessThan(gi('DARK_OVERCAST', 1));
    });
});

describe('§375 cloud cover — legacy state and freeze/resume (ac8)', () => {
    it('a state with no cloud fields reads as LIGHT with every ramp 0 and an unchanged illumination', () => {
        const legacy = createWeatherState();
        for (const k of ['cloudType', 'cloudCover', 'cloudFrom', 'cloudTo', 'cloudFadeElapsed', 'cloudTimer', 'cloudNextDrawS', 'cloudSeed']) {
            delete legacy[k];
        }
        const out = weatherOutputs(legacy);
        expect(out.cloudType).toBe('LIGHT');
        expect(out.cloudCoverT).toBe(CLOUD_COVER.LIGHT);
        expect(out.illumMultiplier).toBe(1);
        expect(out.globalIllumination).toBe(legacy.illum);   // bit-for-bit the pre-§375 value
        expect(cloudClearness(out.cloudCoverT)).toBe(0);
        expect(cloudCollapseT(out.cloudCoverT)).toBe(0);
        expect(cloudDarkT(out.cloudCoverT)).toBe(0);
    });

    it('ticking a legacy state produces no NaN and rolls a fresh mottle seed', () => {
        const legacy = createWeatherState();
        for (const k of ['cloudType', 'cloudCover', 'cloudFrom', 'cloudTo', 'cloudFadeElapsed', 'cloudTimer', 'cloudNextDrawS', 'cloudSeed']) {
            delete legacy[k];
        }
        const s = advance(legacy, 5);
        expect(Number.isFinite(s.cloudCover)).toBe(true);
        expect(Number.isFinite(s.cloudTimer)).toBe(true);
        expect(Number.isInteger(s.cloudSeed)).toBe(true);
        expect(Number.isFinite(weatherOutputs(s).globalIllumination)).toBe(true);
    });

    it('the mottle seed is stable across ticks (the blob pattern must not change mid-session)', () => {
        const s0 = createWeatherState();
        const s1 = advance(s0, CLOUD_INTERVAL_MAX_S + CLOUD_FADE_S);
        expect(s1.cloudSeed).toBe(s0.cloudSeed);
        expect(weatherOutputs(s1).cloudSeed).toBe(s0.cloudSeed);
    });

    it('save/load carries cloudType, cloudSeed and the draw accumulator across a music LEVEL', () => {
        const s = advance(seekCloud(createWeatherState(), 'OVERCAST'), 42);
        saveWeatherState(s);
        const back = loadWeatherState();
        expect(back.cloudType).toBe('OVERCAST');
        expect(back.cloudSeed).toBe(s.cloudSeed);
        expect(back.cloudTimer).toBeCloseTo(s.cloudTimer, 9);
        expect(back.cloudNextDrawS).toBe(s.cloudNextDrawS);
        saveWeatherState(null);                            // don't leak into other suites
    });
});
