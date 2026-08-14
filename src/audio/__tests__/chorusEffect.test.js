import { describe, it, expect, vi } from 'vitest';
import { createChorus } from '../chorusEffect';

/**
 * Stubbed AudioContext — the same "hand-rolled minimal mock" style the rest of the suite uses
 * (see src/hooks/__tests__/useNoteInteraction.test.js). jsdom has no Web Audio, so every node
 * factory returns a plain object recording the calls we assert on.
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
    const delays = [];
    const panners = [];
    return {
        currentTime: 5,
        destination: makeNode(),
        createGain: () => {
            const n = makeNode({ gain: makeParam(1) });
            gains.push(n);
            return n;
        },
        createDelay: () => {
            const n = makeNode({ delayTime: makeParam(0) });
            delays.push(n);
            return n;
        },
        createStereoPanner: () => {
            const n = makeNode({ pan: makeParam(0) });
            panners.push(n);
            return n;
        },
        createOscillator: () => {
            const n = makeNode({ type: 'sine', frequency: makeParam(0), start: vi.fn(), stop: vi.fn() });
            oscillators.push(n);
            return n;
        },
        _oscillators: oscillators,
        _gains: gains,
        _delays: delays,
        _panners: panners,
    };
};

describe('createChorus', () => {
    it('is silent at construction (wet gain 0) so the dry path is unchanged', () => {
        const ctx = makeContext();
        createChorus(ctx);
        // gains[0] = input, gains[1] = wet, then one depth gain per voice.
        const wet = ctx._gains[1];
        expect(wet.gain.value).toBe(0);
    });

    it('builds three modulated delay voices with running oscillators', () => {
        const ctx = makeContext();
        createChorus(ctx);
        expect(ctx._delays).toHaveLength(3);
        expect(ctx._panners).toHaveLength(3);
        expect(ctx._oscillators).toHaveLength(3);
        ctx._oscillators.forEach((osc) => expect(osc.start).toHaveBeenCalled());
        // Non-harmonic LFO rates: no two voices share a frequency.
        const rates = ctx._oscillators.map((o) => o.frequency.value);
        expect(new Set(rates).size).toBe(3);
    });

    it('setStrength ramps the wet gain toward the requested value', () => {
        const ctx = makeContext();
        const chorus = createChorus(ctx);
        const wet = ctx._gains[1];
        chorus.setStrength(0.5);
        expect(wet.gain.setTargetAtTime).toHaveBeenCalledWith(0.5, 5, 0.03);
    });

    it('setStrength also scales the modulation depth of every voice', () => {
        const ctx = makeContext();
        const chorus = createChorus(ctx);
        chorus.setStrength(1);
        const depthGains = ctx._gains.slice(2);
        expect(depthGains).toHaveLength(3);
        depthGains.forEach((g) => {
            expect(g.gain.setTargetAtTime).toHaveBeenCalled();
            const [target] = g.gain.setTargetAtTime.mock.calls.at(-1);
            expect(target).toBeCloseTo(0.004, 6);
        });
    });

    it('clamps out-of-range strengths to 0..1', () => {
        const ctx = makeContext();
        const chorus = createChorus(ctx);
        const wet = ctx._gains[1];
        chorus.setStrength(4);
        expect(wet.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 5, 0.03);
        chorus.setStrength(-3);
        expect(wet.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 5, 0.03);
        chorus.setStrength(undefined);
        expect(wet.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 5, 0.03);
    });

    it('disconnect() stops all oscillators and is idempotent', () => {
        const ctx = makeContext();
        const chorus = createChorus(ctx);
        chorus.disconnect();
        ctx._oscillators.forEach((osc) => expect(osc.stop).toHaveBeenCalledTimes(1));
        chorus.disconnect();
        ctx._oscillators.forEach((osc) => expect(osc.stop).toHaveBeenCalledTimes(1));
    });

    it('setStrength after disconnect() is a no-op (no scheduling on a dead graph)', () => {
        const ctx = makeContext();
        const chorus = createChorus(ctx);
        const wet = ctx._gains[1];
        chorus.disconnect();
        chorus.setStrength(1);
        expect(wet.gain.setTargetAtTime).not.toHaveBeenCalled();
    });

    it('routes the wet signal to the supplied destination, not context.destination', () => {
        const ctx = makeContext();
        const fader = makeNode();
        createChorus(ctx, { destination: fader });
        const wet = ctx._gains[1];
        expect(wet.connect).toHaveBeenCalledWith(fader);
    });
});
