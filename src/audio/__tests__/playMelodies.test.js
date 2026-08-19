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

// #1091 (Han 2026-08-19, "playSound heeft dan nu twee variabelen: velocity en volume"): a NEW,
// independent per-note velocity multiplier on top of the existing volume/gain — defaults to 100
// (neutral, i.e. no change) so every pre-#1091 caller (no melody.velocities array) is unaffected.
describe('playMelodies — per-note velocity (#1091)', () => {
    it('defaults to velocity 100 (no-op) when a melody has no velocities array', () => {
        const instrument = makeInstrument();
        const melody = makeMelody(['C4'], [0], [12]); // no .volumes, no .velocities

        playMelodies([melody], [instrument], { currentTime: 0, destination: {} }, 120, 0);

        // gain defaults to 1 (no .volumes/.gain), velocity defaults to 100 -> 1 * (100/100) = 1
        expect(instrument.start.mock.calls[0][0].velocity).toBe(127);
    });

    it('scales the smplr velocity by melody.velocities[i]/100 when explicitly set', () => {
        const instrument = makeInstrument();
        const melody = { notes: ['C4'], offsets: [0], durations: [12], volumes: [1], velocities: [80] };

        playMelodies([melody], [instrument], { currentTime: 0, destination: {} }, 120, 0);

        expect(instrument.start.mock.calls[0][0].velocity).toBe(Math.floor(1 * 0.8 * 127));
    });
});

// #1091 round 3 (Han: percussion "humanization"): an array-valued customMapping entry should be
// resolved through resolvePercussionPitch (velocity-window pick + compensating gain), not a flat
// uniform-random one, when the note actually flows through playMelodies.
describe('playMelodies — percussion sample humanization (#1091 round 3)', () => {
    it('picks from the array-valued mapping and applies its gainMultiplier to the final velocity', () => {
        vi.spyOn(Math, 'random').mockReturnValue(1); // max +15 offset -> gainMultiplier < 1
        const instrument = makeInstrument();
        const melody = makeMelody(['hh'], [0], [12]);
        const customMapping = { hh: ['soft', 'mid', 'loud'] };

        playMelodies([melody], [instrument], { currentTime: 0, destination: {} }, 120, 0, null, null, null, customMapping);

        const startOpts = instrument.start.mock.calls[0][0];
        expect(customMapping.hh).toContain(startOpts.note);
        expect(startOpts.velocity).toBeLessThan(127); // compensating gain pulled it below the un-humanized max
        vi.restoreAllMocks();
    });
});
