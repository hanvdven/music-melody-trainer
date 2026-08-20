// #992 (Han: 3 new Playback Settings setters — RPG fx volume / RPG music volume / RPG visibility):
// smoke test for the new `musicVolumeMultiplier` param — verifies it multiplies ON TOP of the existing
// MF_VOLUME scaling (not replacing it) and defaults to a no-op (1) when the caller doesn't pass one, so
// every OTHER consumer of this hook (there are none yet besides App.jsx, but the param is optional)
// keeps working unchanged.
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// #1038 (Han: "bij level sluiten; unload/stop alle geluid"): useWorldAmbientMusic's cleanup now calls
// stop()/disconnect() on every instrument it creates — stub both so unmount() doesn't throw. `start`
// stubbed too (#1091 round 7's wind gust voice calls `gustInstrument.start()` directly, unconditionally
// reachable — a ~20% per-cycle chance, not gated by envAudioRef like the water voices' own direct
// `.start()` calls are in these tests — so leaving it unstubbed would make every test flaky).
vi.mock('../../audio/localInstruments', () => ({
    createMelodicInstrument: vi.fn(() => ({ load: Promise.resolve(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() })),
}));
// #1091 follow-up (the level-wide `hh` loop voice): a real smplr Sampler tries to decode WAV
// ArrayBuffers on construction, which throws "AudioBuffer is not defined" in jsdom — stubbed the same
// way createMelodicInstrument already is above. `resolvePercussionChord` must stay a real passthrough
// (not omitted) — generateHh (generateBackbeat.js) imports it from this SAME module, and this mock
// replaces the whole module for every consumer in the test's module graph, not just this file's own
// direct import.
vi.mock('../../audio/drumKits', () => ({
    createFreePatsPercussionInstrument: vi.fn(() => ({ load: Promise.resolve(), stop: vi.fn(), disconnect: vi.fn() })),
    KIT_NOTE_MAPPINGS: { 'FreePats Percussion': {} },
    resolvePercussionChord: (chord) => chord,
}));
vi.mock('../../audio/playMelodies', () => ({ default: vi.fn() }));
vi.mock('../../audio/worldClock', () => ({ nextMeasureStartTime: vi.fn(() => 10) }));
vi.mock('../../generation/generateWorldAmbientBlock', () => ({
    generateWorldAmbientBlock: vi.fn(() => ({
        treble: { volumes: [1, 1] },
        bass: null,
    })),
    WORLD_AMBIENT_BPM: 100,
    WORLD_AMBIENT_TIME_SIGNATURE: [4, 4],
    WORLD_AMBIENT_NUM_MEASURES: 4,
}));
vi.mock('../../model/birdSoundsManifest.generated', () => ({ BIRD_SONG_LAYERS: [] }));

import useWorldAmbientMusic from '../useWorldAmbientMusic';
import playMelodies from '../../audio/playMelodies';
import { MF_VOLUME } from '../../audio/dynamics';

// Flushes the microtask queue enough times for treblePiano.load.then(...)'s chain to run.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// #925 follow-up: the hook creates a StereoPannerNode/GainNode per env-audio voice (bird/water spatial
// panning), with pan/gain updated via `setTargetAtTime` (round 2: smoothed ramps instead of an instant
// `.value=` jump). #1091 round 7 (wind gust voice): also needs `cancelScheduledValues`/
// `setValueAtTime`/`linearRampToValueAtTime` on the gain param (native Web Audio ramp automation, not
// `setTargetAtTime`) and `disconnect()` on the node itself. A real AudioContext always has all of this
// — stubbed here so the minimal test context keeps working instead of throwing on the new calls.
const audioParam = () => ({
    value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(),
});
const makeAudioContext = () => ({
    currentTime: 0,
    createStereoPanner: () => ({ connect: () => {}, pan: audioParam() }),
    createGain: vi.fn(() => ({ connect: () => {}, disconnect: vi.fn(), gain: audioParam() })),
});

describe('useWorldAmbientMusic musicVolumeMultiplier (#992)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('scales the ambient piano melody volumes by musicVolumeMultiplier on top of MF_VOLUME', async () => {
        const context = makeAudioContext();
        const { unmount } = renderHook(() =>
            useWorldAmbientMusic({ active: true, context, musicVolumeMultiplier: 2 }));
        await flush();
        expect(playMelodies).toHaveBeenCalled();
        const [melodies] = playMelodies.mock.calls[0];
        expect(melodies[0].volumes[0]).toBeCloseTo(1 * MF_VOLUME * 2);
        unmount();
    });

    it('defaults musicVolumeMultiplier to 1 (unchanged existing behaviour) when the caller omits it', async () => {
        const context = makeAudioContext();
        const { unmount } = renderHook(() => useWorldAmbientMusic({ active: true, context }));
        await flush();
        expect(playMelodies).toHaveBeenCalled();
        const [melodies] = playMelodies.mock.calls[0];
        expect(melodies[0].volumes[0]).toBeCloseTo(1 * MF_VOLUME);
        unmount();
    });
});

// #1091 round 7 (Han 2026-08-20, "windvlaag" — level-wide, intermittent wind-gust voice using the
// 'applause' sample under a fade-in/fade-out gain envelope, independent of water proximity).
describe('useWorldAmbientMusic — wind gust (#1091 round 7)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('starts the gust and ramps its own GainNode through a fade-in/sustain/fade-out envelope when the 20% roll hits', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);   // 0 < 0.2 -> always triggers
        const context = makeAudioContext();
        const { unmount } = renderHook(() => useWorldAmbientMusic({ active: true, context }));
        await flush();

        // The gust effect is the only direct context.createGain() caller reachable in this minimal
        // test setup that ALSO calls .start() unconditionally on Math.random alone (the water voices'
        // own direct .start() calls are gated on envAudioRef/water tiles, absent here — see the mock
        // context comment above) — so any GainNode with ramp calls on it must be the gust's own.
        const gustGainNode = context.createGain.mock.results
            .map((r) => r.value)
            .find((node) => node.gain.setValueAtTime.mock.calls.length > 0);
        expect(gustGainNode).toBeDefined();
        expect(gustGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
        // #1094 (Han: "Wind mag 3 maten: 1 maat fade in, 1 maat sustain, 1 maat fade out"): 3 ramp calls —
        // up to peak, held flat at peak (a ramp to the same value doubles as the sustain plateau), back to 0.
        expect(gustGainNode.gain.linearRampToValueAtTime).toHaveBeenCalledTimes(3);
        unmount();
        vi.restoreAllMocks();
    });

    it('does not ramp any gain or start a note when the roll misses', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99);   // 0.99 >= 0.2 -> never triggers
        const context = makeAudioContext();
        const { unmount } = renderHook(() => useWorldAmbientMusic({ active: true, context }));
        await flush();

        context.createGain.mock.results.forEach((r) => {
            expect(r.value.gain.setValueAtTime).not.toHaveBeenCalled();
            expect(r.value.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
        });
        unmount();
        vi.restoreAllMocks();
    });
});
