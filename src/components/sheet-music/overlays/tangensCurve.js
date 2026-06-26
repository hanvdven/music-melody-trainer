import { useEffect, useRef, useState } from 'react';

/**
 * Shared 'tangens' carousel curve + drag mechanics (Han 2026-06-09; extracted 2026-06-27).
 *
 * WHY this module exists (§6d "reuse canonical renderers — single source of truth"): the
 * TranspositionSetter invented the tangens-fan curve (`curveX`/`curveY`/`leftCurveX`) and the
 * drag-with-tween interaction. The new GenerationAdvancedSetterOverlay needs the IDENTICAL fan
 * geometry and feel for its four in-staff setters. Copying the magic constants into a second file
 * would guarantee drift the moment one site is tuned, so the curve math AND the drag hook live
 * here and BOTH overlays import them.
 *
 * The 'tangens' curve: each fanned item = its true origin + f(t), t = steps from the active
 * selection (fractional while dragging):
 *     f(t) = ( −3·tanh(t/3)·X_SPACING , −(t³/20)·Y_SPACING )
 * Active item (t=0) → f(0)=(0,0) → sits exactly on target. Horizontal SATURATES (tanh) so the fan
 * can't run off sideways; vertical is a pure cubic in t that steepens fast toward the edges (the
 * 'tangens' feel). Higher items (t>0) fan UPWARD (toward smaller screen-y), hence the leading minus.
 */

// Notehead fan (RIGHT carousel in TranspositionSetter; span + smallest-note carousels here).
export const X_SPACING = 30;   // horizontal scale of the tanh fan (full-size heads need spread)
export const Y_SPACING = 10;   // vertical scale of the cubic term
// Gentler tanh fan for text-label carousels (LEFT name carousel; variability + tuplets here).
export const LEFT_X_SPACING = 14;

export const curveX = (t) => -3 * Math.tanh(t / 3) * X_SPACING;
export const curveY = (t) => -(Math.pow(t, 3) / 20) * Y_SPACING;
export const leftCurveX = (t) => -3 * Math.tanh(t / 3) * LEFT_X_SPACING;

/**
 * useTangensDrag — drag + tap-tween state for ONE tangens carousel of discrete integer indices.
 *
 * The carousel's "value" is an INTEGER index into an option array. `activeIndex` is the committed
 * index (parent state). While the pointer drags, `liveDelta` is a fractional offset added to
 * `activeIndex`; on release we snap to the nearest index and call `onCommit(newIndex)`. When
 * `activeIndex` changes via a TAP (not a drag) the carousel TWEENS to the new index instead of
 * jumping, by easing an `animOffset` from (old−new) to 0 — the same easeOutCubic as the
 * TranspositionSetter. A drag-release skips that tween (the carousel already followed the finger).
 *
 * @param {number} activeIndex      committed integer index (parent state)
 * @param {number} maxIndex         highest valid index (clamp upper bound; lower bound is 0)
 * @param {(i:number)=>void} onCommit  called with the snapped index on drag-release
 * @param {number} pxPerStep        drag sensitivity: screen px per index step
 * @param {number} dirSign          +1: drag UP increases index; −1: drag UP decreases index
 * @returns {{ liveDelta:number, dragging:boolean, effIndex:number, bind:object }}
 *   `effIndex` = the (possibly fractional) index that should drive rendering.
 *   `bind` = pointer handlers to spread onto the invisible drag <rect>.
 */
export function useTangensDrag(activeIndex, maxIndex, onCommit, pxPerStep = 18, dirSign = 1) {
  // Drag state: a fractional change to the index while the pointer is down (null = not dragging).
  const [dragDelta, setDragDelta] = useState(null);
  const dragRef = useRef(null);   // { startClientY }

  // Tween state: when activeIndex changes via a TAP, ease animOffset from (old−new) to 0 so the
  // effective index glides instead of jumping. skipAnimRef suppresses the tween after a drag.
  const [animOffset, setAnimOffset] = useState(0);
  const prevIndexRef = useRef(activeIndex);
  const animRef = useRef(0);
  const skipAnimRef = useRef(false);
  useEffect(() => {
    const prev = prevIndexRef.current;
    prevIndexRef.current = activeIndex;
    if (prev === activeIndex) return;
    if (skipAnimRef.current) { skipAnimRef.current = false; setAnimOffset(0); return; }
    const startOffset = prev - activeIndex;   // effIndex starts at `prev`, eases to new
    const DURATION = 280;
    const t0 = performance.now();
    cancelAnimationFrame(animRef.current);
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / DURATION);
      const eased = 1 - Math.pow(1 - p, 3);    // easeOutCubic (matches TranspositionSetter)
      setAnimOffset(startOffset * (1 - eased));
      if (p < 1) animRef.current = requestAnimationFrame(tick);
      else setAnimOffset(0);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [activeIndex]);

  const clampIdx = (i) => Math.max(0, Math.min(maxIndex, i));

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startClientY: e.clientY };
    setDragDelta(0);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dyUp = (d.startClientY - e.clientY) / pxPerStep;   // up = positive
    setDragDelta(dirSign * dyUp);
  };
  const endDrag = (e) => {
    const d = dragRef.current;
    if (!d) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const snapped = clampIdx(Math.round(activeIndex + (dragDelta || 0)));
    dragRef.current = null;
    setDragDelta(null);
    // Don't tween after a drag — the carousel already followed the finger to `snapped`.
    if (snapped !== activeIndex) { skipAnimRef.current = true; onCommit?.(snapped); }
  };

  const dragging = dragDelta != null;
  const liveDelta = (dragDelta != null ? dragDelta : 0) + animOffset;
  const effIndex = clampIdx(activeIndex + liveDelta);

  return {
    liveDelta,
    dragging,
    effIndex,
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
