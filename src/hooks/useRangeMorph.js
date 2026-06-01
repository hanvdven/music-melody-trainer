import { useRef, useState, useLayoutEffect } from 'react';

// Enter/exit MORPH between the sheet melody and an in-SVG overlay (range / clef).
// Opening fades the OLD group out; the NEW group flies in from the right. To avoid
// a "massive block sliding in", each NOTE-like element flies in INDIVIDUALLY with a
// slight per-element delay staggered by x (Han 2026-06-01): the leftmost element
// starts at 0 s, the rightmost at STAGGER_MS, and each element's slide lasts
// ELEM_MS — so the whole thing reads as notes streaming in. Non-note elements
// (clefs, staff lines, barlines) just fade in with the group.
//
// Total = STAGGER_MS + ELEM_MS = 1.5 s (rightmost begins at 0.5 s, animates 1 s).
//
// Flyable elements are found via `[data-mel], [data-fly]` inside the new group
// (the real melody marks notes/chords/barlines with data-mel; overlays mark their
// note/glyph elements with data-fly). If none are found we fall back to sliding the
// whole group as one block.
//
// All opacity/transform is set via `element.style` in the rAF callback — never JSX
// props — per §6. Inline styles are cleared at the end so the scroll/wipe systems
// own those properties again afterwards.
export const MORPH_MS = 1500;
const ELEM_MS = 1000;      // how long one element's slide lasts
const STAGGER_MS = 500;    // delay between the first and last element starting
const GROUP_FADE_MS = 700; // group-level fade for the non-note elements

const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Subtle ease-in/ease-out so each element accelerates and decelerates rather than
// moving at a constant rate (Han 2026-06-01 #4). smoothstep keeps it gentle.
const easeInOut = (t) => t * t * (3 - 2 * t);

export default function useRangeMorph(rangeEditMode, svgRef, flyDist) {
  // morph = { id, entering } | null. `id` forces the animation effect to re-run
  // even on a rapid re-toggle (phase change) before the previous morph finished.
  const [morph, setMorph] = useState(null);
  const prevModeRef = useRef(rangeEditMode);
  const seqRef = useRef(0);
  const rafRef = useRef(null);

  // Detect the rangeEditMode flip and arm a morph (before paint, so the consumer's
  // mount/display gating commits in the same frame the styles are initialised).
  useLayoutEffect(() => {
    if (prevModeRef.current === rangeEditMode) return;
    prevModeRef.current = rangeEditMode;
    seqRef.current += 1;
    setMorph({ id: seqRef.current, entering: rangeEditMode });
  }, [rangeEditMode]);

  // Run the tween once the morphing render has committed (both groups present).
  useLayoutEffect(() => {
    if (!morph) return undefined;
    const svg = svgRef.current;
    if (!svg) { setMorph(null); return undefined; }
    const melody = svg.querySelector('.notes-transition');
    // Either the range or the clef overlay is the "new" group (only one is mounted).
    const overlay = svg.querySelector('.range-overlay, .clef-overlay');
    const oldEl = morph.entering ? melody : overlay;   // old just fades out
    const newEl = morph.entering ? overlay : melody;   // new flies in (staggered)

    // Collect the individually-flying note elements in the new group and assign each
    // a start delay from its x position (leftmost first, rightmost last). getBBox().x
    // is in the group's user space, which is what we order by.
    const flyEls = newEl ? Array.from(newEl.querySelectorAll('[data-mel], [data-fly]')) : [];
    let minX = Infinity, maxX = -Infinity;
    const xs = new Map();
    for (const el of flyEls) {
      let bx = 0;
      try { bx = el.getBBox().x; } catch { bx = 0; } // getBBox throws on display:none
      xs.set(el, bx);
      if (bx < minX) minX = bx;
      if (bx > maxX) maxX = bx;
    }
    const span = maxX - minX || 1;
    const delayOf = (el) => ((xs.get(el) - minX) / span) * STAGGER_MS;

    // Initial state, set before paint so there's no flash.
    if (oldEl) { oldEl.style.opacity = '1'; oldEl.style.transform = 'none'; }
    if (newEl) {
      newEl.style.opacity = '0';
      newEl.style.transform = 'none';
      if (flyEls.length) {
        for (const el of flyEls) { el.style.transform = `translateX(${flyDist}px)`; el.style.willChange = 'transform'; }
      } else {
        // Fallback: no per-note elements → slide the whole group as one block.
        newEl.style.transform = `translateX(${flyDist}px)`;
      }
    }

    const t0 = performance.now();
    const frame = (now) => {
      const t = now - t0;
      const p = Math.min(1, t / MORPH_MS);
      // Subtle ease-in/out on the fades + slides (start/stop feel).
      if (oldEl) oldEl.style.opacity = String(1 - easeInOut(p));
      if (newEl) {
        // Group fades in (covers clefs/lines/barlines — "fade in any other elements").
        newEl.style.opacity = String(easeInOut(clamp01(t / GROUP_FADE_MS)));
        if (flyEls.length) {
          for (const el of flyEls) {
            const ep = easeInOut(clamp01((t - delayOf(el)) / ELEM_MS));
            el.style.transform = `translateX(${flyDist * (1 - ep)}px)`;
          }
        } else {
          newEl.style.transform = `translateX(${flyDist * (1 - easeInOut(p))}px)`;
        }
      }
      if (p < 1) { rafRef.current = requestAnimationFrame(frame); return; }
      rafRef.current = null;
      // Hand the properties back to React / the scroll-wipe systems.
      if (oldEl) { oldEl.style.opacity = ''; oldEl.style.transform = ''; }
      if (newEl) {
        newEl.style.opacity = '';
        newEl.style.transform = '';
        for (const el of flyEls) { el.style.transform = ''; el.style.willChange = ''; }
      }
      setMorph(null);
    };
    frame(t0);
    rafRef.current = requestAnimationFrame(frame);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [morph, svgRef, flyDist]);

  return { morphing: morph != null };
}
