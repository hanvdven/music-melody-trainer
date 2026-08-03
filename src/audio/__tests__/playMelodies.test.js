import { describe, it, expect, vi } from 'vitest';
import playMelodies from '../playMelodies';

const makeInstrument = () => ({
    output: { setVolume: vi.fn() },
    start: vi.fn(() => vi.fn()),   // smplr-style: start() returns a per-note StopFn
    stop: vi.fn(),
});

const makeMelody = (notes, offsets, durations) => ({ notes, offsets, durations });

// #662 (Han 2026-08-03, "timpanen en cello worden niet onderbroken door de stop-knop"): smplr's own
// `instrument.stop()` only halts ALREADY-SOUNDING voices, not notes still pending in its internal
// scheduler. `stopHandlesRef` lets a caller collect every note's StopFn so it can cancel the WHOLE
// remaining schedule (see App.jsx's levelBackingStopFnsRef / stopAllBackingAudio).
describe('playMelodies — stopHandlesRef (#662)', () => {
    it('collects one StopFn per scheduled note when a ref is provided', () => {
        const instrument = makeInstrument();
        const melody = makeMelody(['C4', 'D4'], [0, 12], [12, 12]);
        const stopHandlesRef = { current: [] };

        playMelodies(
            [melody], [instrument], { currentTime: 0, destination: {} }, 120, 0,
            null, null, null, null, null, stopHandlesRef,
        );

        expect(instrument.start).toHaveBeenCalledTimes(2);
        expect(stopHandlesRef.current).toHaveLength(2);
        stopHandlesRef.current.forEach((fn) => expect(() => fn()).not.toThrow());
    });

    it('does not touch any ref when stopHandlesRef is omitted (default behaviour unchanged)', () => {
        const instrument = makeInstrument();
        const melody = makeMelody(['C4'], [0], [12]);

        expect(() => playMelodies(
            [melody], [instrument], { currentTime: 0, destination: {} }, 120, 0,
        )).not.toThrow();
        expect(instrument.start).toHaveBeenCalledTimes(1);
    });
});
