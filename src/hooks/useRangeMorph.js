import { useRef, useState, useLayoutEffect } from 'react';

// Enter/exit MORPH between the sheet melody and the in-SVG range overlay
// (Han 2026-06-01). Clicking RANGE fades the melody OUT while the range note-rows
// FLY IN from the right (R→L); closing fades the range OUT and the melody FLIES IN.
// "Old just fades, new flies" (Han). Total 1.5 s.
//
// Both groups must be mounted AND visible for the whole morph, so the consumer
// gates its mount/`display` on the returned `morphing` flag (the melody group is
// normally `display:none` in rangeEditMode; the overlay is normally only mounted
// in rangeEditMode). All opacity/transform is set via `element.style` in the rAF
// callback — never JSX props — per §6. Inline styles are cleared at the end so the
// scroll/wipe systems own those properties again afterwards.
//
// `flyDist` is in SVG user units (the content width); SVG CSS transforms treat the
// "px" unit as user units, matching the viewBox coordinate system.
export const MORPH_MS = 1500;

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
    const oldEl = morph.entering ? melody : overlay;   // old just fades
    const newEl = morph.entering ? overlay : melody;   // new flies in from the right

    // Initial state, set before paint so there's no flash.
    if (oldEl) { oldEl.style.opacity = '1'; oldEl.style.transform = 'none'; }
    if (newEl) { newEl.style.opacity = '0'; newEl.style.transform = `translateX(${flyDist}px)`; }

    const t0 = performance.now();
    const frame = (now) => {
      const p = Math.min(1, (now - t0) / MORPH_MS);
      if (oldEl) oldEl.style.opacity = String(1 - p);
      if (newEl) {
        newEl.style.opacity = String(p);
        newEl.style.transform = `translateX(${flyDist * (1 - p)}px)`;
      }
      if (p < 1) { rafRef.current = requestAnimationFrame(frame); return; }
      rafRef.current = null;
      // Hand the properties back to React / the scroll-wipe systems.
      if (oldEl) { oldEl.style.opacity = ''; oldEl.style.transform = ''; }
      if (newEl) { newEl.style.opacity = ''; newEl.style.transform = ''; }
      setMorph(null);
    };
    frame(t0);
    rafRef.current = requestAnimationFrame(frame);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [morph, svgRef, flyDist]);

  return { morphing: morph != null };
}
