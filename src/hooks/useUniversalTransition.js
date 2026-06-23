import { useRef, useLayoutEffect } from 'react';
import { runFlyInCascade } from '../utils/flyInCascade';

// useUniversalTransition (Han 2026-06-16) — replays the SAME 1.5s cascade the overlay morph
// uses (fade OLD out, fly NEW in from the right, staggered by x) whenever the app swaps the
// sheet content IN PLACE: song load, difficulty change, etc. (the "universal transition").
//
// The overlay morph (useRangeMorph) has BOTH the old and new groups mounted as siblings, so
// it can fade one and fly the other. An in-place swap doesn't — by the time this effect runs
// after the new render, the live group already holds the NEW content. So, like useClefRefly,
// we keep a CLONE of the group from the previous commit and overlay that frozen clone as the
// "old" that fades out, while the live group's [data-fly]/[data-mel] elements stream in. The
// actual tween is delegated to runFlyInCascade so there is ONE source of truth for the
// choreography/constants (§6c/§6d).
//
// `transitionKey` is a monotonically-increasing counter bumped by UniversalTransitionContext
// .fire(); a change arms one cascade. `flyDist` = how far (user units) elements start to the
// right (same value the morph uses, i.e. endX). `groupSelector` is the SVG group to animate.
export default function useUniversalTransition(svgRef, transitionKey, flyDist, groupSelector = '.notes-transition') {
  const prevKeyRef = useRef(transitionKey); // last key we acted on (mount value ⇒ no fire on mount)
  const cloneRef = useRef(null);            // last resting clone of the group (the future "old")
  const activeRef = useRef(null);           // { cancel, clone } for the in-flight cascade

  useLayoutEffect(() => {
    const svg = svgRef.current;

    // Tear down any in-flight cascade AND remove its overlay clone. runFlyInCascade's own
    // cancel() resets inline styles (which would UN-HIDE the faded clone), so we must remove
    // the clone node here too — otherwise an interrupted cascade leaves the old content stuck
    // on screen at full opacity.
    const teardown = () => {
      if (activeRef.current) {
        activeRef.current.cancel();
        const c = activeRef.current.clone;
        if (c && c.parentNode) c.parentNode.removeChild(c);
        activeRef.current = null;
      }
    };

    const group = svg?.querySelector(groupSelector);
    if (!svg || !group) { prevKeyRef.current = transitionKey; return undefined; }

    // Fire only on a genuine key change with a snapshot of the pre-swap content available.
    if (transitionKey !== prevKeyRef.current && cloneRef.current) {
      teardown();

      // Overlay the OLD clone (frozen, non-interactive) as a sibling so it sits over the live
      // group while it fades out.
      const clone = cloneRef.current.cloneNode(true);
      clone.style.pointerEvents = 'none';
      group.parentNode.insertBefore(clone, group.nextSibling);

      // onDone runs synchronously at the end of the final rAF frame, in the SAME callback as
      // runFlyInCascade's resetStyles — removing the clone there means the browser never
      // paints the (briefly un-hidden) clone before it's gone (no flash).
      const cancel = runFlyInCascade(svg, {
        oldEls: [clone],
        newEls: [group],
        flyDist,
        onDone: () => {
          if (clone.parentNode) clone.parentNode.removeChild(clone);
          activeRef.current = null;
        },
      });
      activeRef.current = { cancel, clone };
    }

    prevKeyRef.current = transitionKey;
    // Re-snapshot the resting group as the OLD for the next swap — but only when idle, so we
    // never capture mid-cascade (transformed/faded) DOM (mirrors useClefRefly).
    if (!activeRef.current) cloneRef.current = group.cloneNode(true);

    return undefined;
  }, [transitionKey, svgRef, flyDist, groupSelector]);

  // Cancel + clean up the overlay clone on unmount.
  useLayoutEffect(() => () => {
    if (activeRef.current) {
      activeRef.current.cancel();
      const c = activeRef.current.clone;
      if (c && c.parentNode) c.parentNode.removeChild(c);
      activeRef.current = null;
    }
  }, []);
}
