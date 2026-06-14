import { useRef, useLayoutEffect } from 'react';

// CR-A2 (Han 2026-06-08): while the clef-edit overlay is open, CHANGING a staff's clef
// should re-play the open transition for THAT staff only — fade the old content out and
// wipe the new content in from the right — "just as if the range was opened, but
// restricted to a single staff". The other staff stays untouched.
//
// useRangeMorph animates the WHOLE surface on a surface-kind change; it can't express a
// re-entrant, single-staff refly. This hook does that by:
//   1. Keeping a clone of each staff's `.clef-row-<staff>` from the PREVIOUS commit.
//   2. When the staff's clef identity changes, overlaying that (old) clone and fading it
//      out, while the live (new) row's fly elements stream in from the right (staggered).
// All opacity/transform is set via element.style in an rAF, never JSX props (§6); inline
// styles are cleared at the end so the morph/scroll systems own them again afterwards.
const FADE_OUT_MS = 250;   // old clone fade-out (matches the morph's fast OLD fade)
const ELEM_MS = 1000;      // one fly element's slide
const STAGGER_MS = 500;    // delay between first and last element starting
const FADE_IN_MS = 700;    // new row group fade-in
const TOTAL_MS = STAGGER_MS + ELEM_MS;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeInOut = (t) => t * t * (3 - 2 * t);

// `keys` = { treble, bass } stable identity strings for each staff's clef choice
// (family + octave variant + transposition + vocal sub-clef). A change re-flies that row.
// `active` = clef-edit overlay open. `flyDist` = how far (user units) elements start to
// the right (same value useRangeMorph uses, i.e. endX).
export default function useClefRefly(svgRef, keys, active, flyDist) {
  const prevKeysRef = useRef({});
  const cloneRef = useRef({});     // last-committed row clone per staff (the future "old")
  const rafRef = useRef({});       // running rAF id per staff
  const overlayRef = useRef({});   // inserted old-clone node per staff

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const cleanupStaff = (staff) => {
      if (rafRef.current[staff]) { cancelAnimationFrame(rafRef.current[staff]); rafRef.current[staff] = null; }
      const ov = overlayRef.current[staff];
      if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      overlayRef.current[staff] = null;
    };

    if (!svg || !active) {
      // Not in clef-edit mode → drop snapshots so re-opening doesn't fire a stale refly.
      ['treble', 'bass'].forEach(cleanupStaff);
      prevKeysRef.current = {};
      cloneRef.current = {};
      return undefined;
    }

    ['treble', 'bass'].forEach((staff) => {
      const row = svg.querySelector(`.clef-row-${staff}`);
      if (!row) return;
      const key = keys[staff];
      const prevKey = prevKeysRef.current[staff];
      const oldClone = cloneRef.current[staff];

      // Fire the refly only on a genuine change with an available old snapshot.
      if (prevKey !== undefined && prevKey !== key && oldClone) {
        cleanupStaff(staff);

        // 1) Overlay the OLD clone (frozen) and fade it out.
        const clone = oldClone.cloneNode(true);
        clone.style.pointerEvents = 'none';
        clone.style.opacity = '1';
        row.parentNode.insertBefore(clone, row.nextSibling);
        overlayRef.current[staff] = clone;

        // 2) New (live) row flies in: collect fly elements, delay each by its x.
        const flyEls = Array.from(row.querySelectorAll('[data-mel], [data-fly]'));
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

        // Pre-paint initial state (set in this layout effect so there's no flash).
        row.style.opacity = '0';
        for (const el of flyEls) { el.style.transform = `translateX(${flyDist}px)`; el.style.willChange = 'transform'; }

        const reset = () => {
          row.style.opacity = '';
          for (const el of flyEls) { el.style.transform = ''; el.style.willChange = ''; }
          cleanupStaff(staff);
        };

        const t0 = performance.now();
        const frame = (now) => {
          const t = now - t0;
          if (overlayRef.current[staff]) {
            overlayRef.current[staff].style.opacity = String(1 - easeInOut(clamp01(t / FADE_OUT_MS)));
            if (t >= FADE_OUT_MS) { const ov = overlayRef.current[staff]; if (ov.parentNode) ov.parentNode.removeChild(ov); overlayRef.current[staff] = null; }
          }
          row.style.opacity = String(easeInOut(clamp01(t / FADE_IN_MS)));
          for (const el of flyEls) {
            const ep = easeInOut(clamp01((t - delayOf(el)) / ELEM_MS));
            el.style.transform = `translateX(${flyDist * (1 - ep)}px)`;
          }
          if (t < TOTAL_MS) { rafRef.current[staff] = requestAnimationFrame(frame); return; }
          rafRef.current[staff] = null;
          reset();
        };
        rafRef.current[staff] = requestAnimationFrame(frame);
      }

      // Re-snapshot this row (resting state) as the OLD for the next change.
      prevKeysRef.current[staff] = key;
      if (!rafRef.current[staff]) cloneRef.current[staff] = row.cloneNode(true);
    });

    return undefined;
  });

  // Cancel everything on unmount.
  useLayoutEffect(() => () => {
    ['treble', 'bass'].forEach((staff) => {
      if (rafRef.current[staff]) cancelAnimationFrame(rafRef.current[staff]);
      const ov = overlayRef.current[staff];
      if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    });
  }, []);
}
