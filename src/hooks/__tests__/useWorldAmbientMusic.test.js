// #992 (Han: 3 new Playback Settings setters — RPG fx volume / RPG music volume / RPG visibility):
// smoke test for the new `musicVolumeMultiplier` param — verifies it multiplies ON TOP of the existing
// MF_VOLUME scaling (not replacing it) and defaults to a no-op (1) when the caller doesn't pass one, so
// every OTHER consumer of this hook (there are none yet besides App.jsx, but the param is optional)
// keeps working unchanged.
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../audio/localInstruments', () => ({
    createMelodicInstrument: vi.fn(() => ({ load: Promise.resolve() })),
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

describe('useWorldAmbientMusic musicVolumeMultiplier (#992)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('scales the ambient piano melody volumes by musicVolumeMultiplier on top of MF_VOLUME', async () => {
        // #925 follow-up: the hook now also creates a StereoPannerNode/GainNode per env-audio voice
        // (bird/water spatial panning), with pan/gain updated via `setTargetAtTime` (round 2: smoothed
        // ramps instead of an instant `.value=` jump, per Han's "abrupt" feedback) — a real AudioContext
        // always has all of this; stubbed here so the existing minimal test context keeps working instead
        // of throwing on the new calls.
        const audioParam = () => ({ value: 0, setTargetAtTime: () => {} });
        const context = { currentTime: 0, createStereoPanner: () => ({ connect: () => {}, pan: audioParam() }), createGain: () => ({ connect: () => {}, gain: audioParam() }) };
        const { unmount } = renderHook(() =>
            useWorldAmbientMusic({ active: true, context, musicVolumeMultiplier: 2 }));
        await flush();
        expect(playMelodies).toHaveBeenCalled();
        const [melodies] = playMelodies.mock.calls[0];
        expect(melodies[0].volumes[0]).toBeCloseTo(1 * MF_VOLUME * 2);
        unmount();
    });

    it('defaults musicVolumeMultiplier to 1 (unchanged existing behaviour) when the caller omits it', async () => {
        // #925 follow-up: the hook now also creates a StereoPannerNode/GainNode per env-audio voice
        // (bird/water spatial panning), with pan/gain updated via `setTargetAtTime` (round 2: smoothed
        // ramps instead of an instant `.value=` jump, per Han's "abrupt" feedback) — a real AudioContext
        // always has all of this; stubbed here so the existing minimal test context keeps working instead
        // of throwing on the new calls.
        const audioParam = () => ({ value: 0, setTargetAtTime: () => {} });
        const context = { currentTime: 0, createStereoPanner: () => ({ connect: () => {}, pan: audioParam() }), createGain: () => ({ connect: () => {}, gain: audioParam() }) };
        const { unmount } = renderHook(() => useWorldAmbientMusic({ active: true, context }));
        await flush();
        expect(playMelodies).toHaveBeenCalled();
        const [melodies] = playMelodies.mock.calls[0];
        expect(melodies[0].volumes[0]).toBeCloseTo(1 * MF_VOLUME);
        unmount();
    });
});
