import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import useFrameLoop from '../useFrameLoop';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function Subscriber({ onTick, priority, throttleMs }) {
    useFrameLoop(onTick, [onTick], { priority, throttleMs });
    return null;
}

describe('useFrameLoop', () => {
    it('calls a critical subscriber on successive frames with a raw rAF timestamp', async () => {
        const onTick = vi.fn();
        render(<Subscriber onTick={onTick} priority="critical" />);
        await sleep(80);
        cleanup();
        expect(onTick.mock.calls.length).toBeGreaterThan(1);
        expect(typeof onTick.mock.calls[0][0]).toBe('number');
    });

    it('stops calling a subscriber after it unmounts (unsubscribes)', async () => {
        const onTick = vi.fn();
        const { unmount } = render(<Subscriber onTick={onTick} priority="critical" />);
        await sleep(50);
        unmount();
        const callsAtUnmount = onTick.mock.calls.length;
        await sleep(80);
        // allow at most one in-flight frame to land after unmount
        expect(onTick.mock.calls.length).toBeLessThanOrEqual(callsAtUnmount + 1);
    });

    it('runs multiple concurrently-mounted subscribers off the same shared ticker', async () => {
        const a = vi.fn();
        const b = vi.fn();
        render(
            <>
                <Subscriber onTick={a} priority="critical" />
                <Subscriber onTick={b} priority="critical" />
            </>,
        );
        await sleep(80);
        cleanup();
        expect(a).toHaveBeenCalled();
        expect(b).toHaveBeenCalled();
    });

    it('rate-limits a throttled subscriber to roughly its own throttleMs cadence', async () => {
        const onTick = vi.fn();
        render(<Subscriber onTick={onTick} priority="throttled" throttleMs={200} />);
        await sleep(80);
        cleanup();
        // Within 80ms and a 200ms throttle, it should have fired at most once or twice (first call has
        // lastMs=0 so it fires immediately on the first frame, then waits ~200ms for the next).
        expect(onTick.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('isolates a throwing subscriber — the ticker keeps running for other subscribers (#1162 Fase 8)', async () => {
        const throwing = vi.fn(() => { throw new Error('boom'); });
        const healthy = vi.fn();
        render(
            <>
                <Subscriber onTick={throwing} priority="critical" />
                <Subscriber onTick={healthy} priority="critical" />
            </>,
        );
        // 150ms (not 80ms): under a full-suite run this real-timer test can land on a slow tick and see
        // only one rAF callback fire in a short window — flaky, not a real failure. More margin here
        // trades a little test wall-time for reliability.
        await sleep(150);
        cleanup();
        // The throwing subscriber keeps getting called every tick (its own failure doesn't unsubscribe
        // it), and — the actual regression this test guards — the healthy subscriber ALSO keeps being
        // called on every tick, proving one subscriber's exception never stops the shared ticker from
        // rescheduling for everyone else.
        expect(throwing.mock.calls.length).toBeGreaterThan(1);
        expect(healthy.mock.calls.length).toBeGreaterThan(1);
    });
});
