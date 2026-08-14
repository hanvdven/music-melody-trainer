import { describe, it, expect, vi } from 'vitest';
import { createTremolo } from '../tremoloEffect';

/**
 * Stubbed AudioContext — same hand-rolled mock style as chorusEffect.test.js.
 */
const makeParam = (value = 0) => ({
    value,
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
});

const makeNode = (extra = {}) => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    ...extra,
});

const makeContext = () => {
    const oscillators = [];
    const gains = [];
    return {
        currentTime: 5,
        destination: makeNode(),
        createGain: () => {
            const n = makeNode({ gain: makeParam(1) });
            gains.push(n);
            return n;
        },
        createOscillator: () => {
            const n = makeNode({ type: 'sine', frequency: makeParam(0), start: vi.fn(), stop: vi.fn() });
            oscillators.push(n);
            return n;
        },
        _oscillators: oscillators,
        _gains: gains,
    };
};

describe('createTremolo', () => {
    it('is transparent at construction (input gain 1, depth 0) so the dry path is unchanged', () => {
        const ctx = makeContext();
        createTremolo(ctx);
        // gains[0] = input (the modulated stage), gains[1] = depthGain.
        const input = ctx._gains[0];
        const depthGain = ctx._gains[1];
        expect(input.gain.value).toBe(1);
        expect(depthGain.gain.value).toBe(0);
    });

    it('builds a single 6Hz LFO', () => {
        const ctx = makeContext();
        createTremolo(ctx);
        expect(ctx._oscillators).toHaveLength(1);
        expect(ctx._oscillators[0].frequency.value).toBe(6);
        expect(ctx._oscillators[0].start).toHaveBeenCalled();
    });

    it('setStrength ramps the base gain and depth toward the requested depth', () => {
        const ctx = makeContext();
        const tremolo = createTremolo(ctx);
        const input = ctx._gains[0];
        const depthGain = ctx._gains[1];
        tremolo.setStrength(0.7);
        expect(input.gain.setTargetAtTime).toHaveBeenCalledWith(1 - 0.35, 5, 0.03);
        expect(depthGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.35, 5, 0.03);
    });

    it('at full strength the gain swings all the way to 0 on each cycle', () => {
        const ctx = makeContext();
        const tremolo = createTremolo(ctx);
        const input = ctx._gains[0];
        const depthGain = ctx._gains[1];
        tremolo.setStrength(1);
        expect(input.gain.setTargetAtTime).toHaveBeenCalledWith(0.5, 5, 0.03);
        expect(depthGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.5, 5, 0.03);
    });

    it('clamps out-of-range strengths to 0..1', () => {
        const ctx = makeContext();
        const tremolo = createTremolo(ctx);
        const input = ctx._gains[0];
        tremolo.setStrength(4);
        expect(input.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.5, 5, 0.03);
        tremolo.setStrength(-3);
        expect(input.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 5, 0.03);
        tremolo.setStrength(undefined);
        expect(input.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 5, 0.03);
    });

    it('disconnect() stops the oscillator and is idempotent', () => {
        const ctx = makeContext();
        const tremolo = createTremolo(ctx);
        tremolo.disconnect();
        expect(ctx._oscillators[0].stop).toHaveBeenCalledTimes(1);
        tremolo.disconnect();
        expect(ctx._oscillators[0].stop).toHaveBeenCalledTimes(1);
    });

    it('setStrength after disconnect() is a no-op (no scheduling on a dead graph)', () => {
        const ctx = makeContext();
        const tremolo = createTremolo(ctx);
        const input = ctx._gains[0];
        tremolo.disconnect();
        tremolo.setStrength(1);
        expect(input.gain.setTargetAtTime).not.toHaveBeenCalled();
    });

    it('the input node (the modulated stage) is wired as an INSERT into the supplied destination, not a send', () => {
        const ctx = makeContext();
        const dest = makeNode();
        const tremolo = createTremolo(ctx, { destination: dest });
        const input = ctx._gains[0];
        expect(input.connect).toHaveBeenCalledWith(dest);
        expect(tremolo.input).toBe(input);
    });
});
