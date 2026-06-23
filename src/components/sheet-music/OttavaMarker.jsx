import React, { useRef, useState, useLayoutEffect } from 'react';

// CR-A3 (Han 2026-06-08): the ottava marker (8va / 8vb / 15ma …) used to swap instantly
// (or fade in very quickly) when the computed clef/register changed. Drive a proper
// cross-fade off the VALUE change — which is exactly what happens on a notes transition
// or a range-driven clef change:
//   fade-out 0.5s → hold blank 0.5s → fade-in 0.5s
// Opacity is driven via the element's own style.opacity inside an rAF, never a JSX prop
// (§6): the transition / range-morph systems re-render this subtree and own the GROUP
// opacity, so a JSX opacity here would be clobbered.
const FADE_OUT = 500;
const HOLD = 500;
const FADE_IN = 500;
const TOTAL = FADE_OUT + HOLD + FADE_IN;
// Phase 4 (Han 2026-06-16): the NEW marker should SLIDE in from the right during its fade-in
// (preferred over a pure crossfade), matching the universal cascade where "other" elements slide
// in from the right. The fade-in runs in the last 500 ms — the same ~1.0–1.5 s window the cascade
// streams its trailing elements in. The OLD marker still fades out IN PLACE (a slide-out would
// read as the marker fleeing); fade also remains the fallback when a marker is simply removed.
const SLIDE_IN = 60;   // user-space px the new marker travels from the right → its resting x
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeInOut = (t) => t * t * (3 - 2 * t);   // smoothstep — matches flyInCascade's easing

// `desc` is the current ottava render descriptor, or null when no marker:
//   { token, x, y, fontSize, fill, dx, glyph }
// `token` identifies the VISUAL (ottava value + above/below); a token change triggers
// the cross-fade. Colour-only changes (e.g. showSettings yellow) don't change the token,
// so they refresh live without a fade.
export default function OttavaMarker({ desc }) {
  const [, force] = useState(0);
  const ref = useRef(null);
  const shownRef = useRef(desc);                 // frozen during an animation, live when idle
  const tokenRef = useRef(desc?.token ?? null);
  const animatingRef = useRef(false);
  const rafRef = useRef(null);

  useLayoutEffect(() => {
    const newTok = desc?.token ?? null;
    if (newTok === tokenRef.current) {
      // Same marker — keep position/colour fresh while idle (no fade for colour tweaks).
      if (!animatingRef.current) { shownRef.current = desc; }
      return undefined;
    }
    tokenRef.current = newTok;
    const hadOld = shownRef.current != null;
    animatingRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    // Set the pre-paint opacity synchronously (useLayoutEffect) so a freshly mounted
    // marker doesn't flash at full opacity for one frame before the rAF dims it. A marker
    // with no old to fade out first starts slid to the RIGHT so its fade-in glides into place.
    if (ref.current) {
      ref.current.style.opacity = hadOld ? '1' : '0';
      if (!hadOld) ref.current.style.transform = `translateX(${SLIDE_IN}px)`;
    }

    const t0 = performance.now();
    const startOffset = hadOld ? 0 : FADE_OUT;   // no old marker → skip the fade-out phase
    let swapped = false;
    const tick = (now) => {
      const t = now - t0 + startOffset;
      // Swap to the new content while invisible, at the fade-out/hold boundary.
      if (!swapped && t >= FADE_OUT) { swapped = true; shownRef.current = desc; force(n => n + 1); }
      let op;
      if (t < FADE_OUT) op = 1 - t / FADE_OUT;                              // fade old out
      else if (t < FADE_OUT + HOLD) op = 0;                                 // hold blank
      else op = Math.min(1, (t - FADE_OUT - HOLD) / FADE_IN);               // fade new in
      if (ref.current) {
        ref.current.style.opacity = String(op);
        // Once swapped to the NEW marker, slide it in from the right as it fades in (eased).
        // Before the fade-in (hold/fade-out) the new content is invisible, so parking it at the
        // full offset is harmless and avoids a jump when the fade-in starts.
        if (swapped) {
          const fp = clamp01((t - FADE_OUT - HOLD) / FADE_IN);
          ref.current.style.transform = `translateX(${SLIDE_IN * (1 - easeInOut(fp))}px)`;
        }
      }
      if (t < TOTAL) { rafRef.current = requestAnimationFrame(tick); return; }
      rafRef.current = null;
      animatingRef.current = false;
      if (desc == null) { shownRef.current = null; force(n => n + 1); }     // marker removed
      else if (ref.current) { ref.current.style.opacity = ''; ref.current.style.transform = ''; } // hand props back
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      animatingRef.current = false;            // never leave a marker stuck mid-fade
    };
  }, [desc]);

  const shown = shownRef.current;
  if (!shown) return null;
  return (
    <text ref={ref} x={shown.x} y={shown.y} fontSize={shown.fontSize}
      fill={shown.fill} fontFamily="Maestro" textAnchor="middle" dx={shown.dx}>
      {shown.glyph}
    </text>
  );
}
