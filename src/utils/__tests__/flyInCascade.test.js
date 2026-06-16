import { describe, it, expect, vi } from 'vitest';
import { runFlyInCascade, MORPH_MS } from '../flyInCascade';

// Build a tiny SVG tree: one OLD group and one NEW group with a flyable [data-fly] child.
// jsdom has no layout engine, so getBBox is absent → the helper's try/catch falls back to
// x=0 for every element (the cascade still runs, just without an x-derived stagger spread).
const buildSvg = () => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const oldG = document.createElementNS(NS, 'g');
  const newG = document.createElementNS(NS, 'g');
  const fly = document.createElementNS(NS, 'rect');
  fly.setAttribute('data-fly', '');
  newG.appendChild(fly);
  svg.appendChild(oldG);
  svg.appendChild(newG);
  document.body.appendChild(svg);
  return { svg, oldG, newG, fly };
};

describe('runFlyInCascade', () => {
  it('sets the pre-paint initial state: OLD opaque, NEW transparent, flyable offset right', () => {
    const { svg, oldG, newG, fly } = buildSvg();
    const cancel = runFlyInCascade(svg, { oldEls: [oldG], newEls: [newG], flyDist: 200 });
    expect(oldG.style.opacity).toBe('1');
    expect(newG.style.opacity).toBe('0');
    expect(fly.style.transform).toBe('translateX(200px)'); // starts shifted right, slides to 0
    cancel();
  });

  it('cancel() clears all inline styles so the scroll/wipe systems own them again', () => {
    const { svg, oldG, newG, fly } = buildSvg();
    const cancel = runFlyInCascade(svg, { oldEls: [oldG], newEls: [newG], flyDist: 120 });
    cancel();
    expect(oldG.style.opacity).toBe('');
    expect(newG.style.opacity).toBe('');
    expect(fly.style.transform).toBe('');
    expect(fly.style.willChange).toBe('');
  });

  it('fires onDone once the cascade reaches MORPH_MS and resets styles', () => {
    vi.useFakeTimers();
    // Drive requestAnimationFrame off the fake clock so we can run the tween to completion.
    let now = 0;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      return setTimeout(() => { now += 16; cb(now); }, 16);
    });
    const { svg, oldG, newG } = buildSvg();
    const onDone = vi.fn();
    runFlyInCascade(svg, { oldEls: [oldG], newEls: [newG], flyDist: 50, onDone });
    vi.advanceTimersByTime(MORPH_MS + 100); // past 1.5s total
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(newG.style.opacity).toBe(''); // styles handed back on completion
    rafSpy.mockRestore();
    nowSpy.mockRestore();
    vi.useRealTimers();
  });

  it('is a safe no-op (still calls onDone) when svg is null', () => {
    const onDone = vi.fn();
    const cancel = runFlyInCascade(null, { onDone });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(typeof cancel).toBe('function');
  });
});
