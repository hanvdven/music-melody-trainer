import { describe, it, expect } from 'vitest';
import {
    createWeatherState, tickWeather, weatherOutputs, seekPhase, seekWind, pickWind, easeInOut,
    TIME_PHASES, WIND_BAG, WIND_INTERVAL_S, WIND_FADE_S, TIME_FADE_S, CRITTER_FADE_S, WIND_GUST3_HOLD_S,
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
        expect(weatherOutputs(s).globalIllumination).toBe(0.1);   // §362→§364 night floor (0.12→0.10)
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
        expect(weatherOutputs(s).globalIllumination).toBe(0.1);   // §362→§364 night floor (0.12→0.10)
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
});
