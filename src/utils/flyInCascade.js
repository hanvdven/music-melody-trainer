// flyInCascade — the shared transition choreography. Extracted from useRangeMorph (Han
// 2026-06-16) so the overlay enter/exit morph AND the universal app transition run the EXACT
// same animation/constants — one source of truth (§6c/§6d: never duplicate magic numbers).
//
// Timeline (Han 2026-06-16, total 1.5 s):
//   0.00–0.25 s  OLD content fades out (fast).
//   0.00–1.50 s  NEW note-like elements ([data-mel],[data-fly]) SLIDE in from the right,
//                staggered by x (leftmost starts at 0, rightmost at STAGGER_MS; each slide
//                lasts ELEM_MS). They are VISIBLE the whole slide — they enter from off-screen
//                right, so no fade is needed.
//   1.00–1.50 s  NEW non-sliding elements (text labels, dividers, washes — anything WITHOUT a
//                data-fly/data-mel tag) WAIT, then fade in. This is the "fade fallback": it must
//                arrive WITH the notes, not pop in immediately (Han: "wait 1 s, then fade 0.5 s").
//
// WHY the group opacity is NOT used for the fade: the flying notes are children of the group, so
// a delayed GROUP fade would also hide the notes until 1 s and break their slide. Instead the
// group stays fully opaque (a container) and the delayed fade is applied to the individual
// non-fly elements; the fly elements keep full opacity and just translate.
//
// By default flyable elements slide in from the RIGHT (translateX flyDist → 0). An element may
// carry `data-fly-from="<userSpaceX>"` to emerge from a specific x instead (clef variant chips).
//
// All opacity/transform is set via `element.style` in the rAF callback — never JSX props (§6).
// Inline styles are cleared at the end so the scroll/wipe systems own those properties again.
export const MORPH_MS = 1500;
const ELEM_MS = 1000;        // how long one note-like element's slide lasts
const STAGGER_MS = 500;      // delay between the first and last sliding element starting
const FADE_OUT_MS = 250;     // OLD content fade-OUT — very short (Han 2026-06-01 #5)
const FADE_DELAY_MS = 1000;  // non-sliding elements WAIT this long before fading in (Han 2026-06-16)
const FADE_DUR_MS = 500;     // ...then fade in over this (lands at MORPH_MS, with the last notes)

const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Subtle ease-in/ease-out so motion accelerates and decelerates rather than moving at a constant
// rate (Han 2026-06-01 #4). smoothstep keeps it gentle.
const easeInOut = (t) => t * t * (3 - 2 * t);

// Collect the HIGHEST non-fly subtrees of `group` — the elements that should do the delayed fade.
// We descend only into containers that hold a fly element (so we never fade a notehead's wrapper);
// any element with no fly descendant is faded WHOLE (so a <text> with <tspan> children fades as one
// unit, never partially). This avoids both partial fades and double-dimming nested elements.
const collectFadeEls = (group, out) => {
  for (const child of group.children) {
    if (child.matches?.('[data-fly], [data-mel]')) continue;      // fly subtree → it slides, skip
    if (child.querySelector?.('[data-fly], [data-mel]')) {
      collectFadeEls(child, out);                                 // mixed → recurse into it
    } else {
      out.push(child);                                            // pure non-fly → fade as a unit
    }
  }
};

// Run ONE cascade. Returns a `cancel()` that stops the rAF and resets all inline styles — call it
// on interrupt so a rapid re-trigger never leaves anything stuck (Han #8). `onDone` fires once on
// natural completion (not on cancel).
export function runFlyInCascade(svg, { oldEls = [], newEls = [], flyDist, onDone } = {}) {
  if (!svg) { onDone?.(); return () => {}; }

  // Sliding elements across the new group(s): each delayed by its x (leftmost first). getBBox().x
  // is in user space.
  const flyEls = newEls.flatMap(g => Array.from(g.querySelectorAll('[data-mel], [data-fly]')));
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

  // Per-element initial translateX. Default = flyDist (slide in from the RIGHT). `data-fly-from`
  // overrides the start x (clef variant chips emerge from under the clef on the left).
  const startOf = new Map();
  for (const el of flyEls) {
    const fromAttr = el.getAttribute('data-fly-from');
    startOf.set(el, fromAttr != null ? (parseFloat(fromAttr) - (xs.get(el) ?? 0)) : flyDist);
  }

  // Non-sliding elements that do the delayed fade.
  const fadeEls = [];
  for (const g of newEls) collectFadeEls(g, fadeEls);

  // Initial state, set before paint so there's no flash. The group is a fully-opaque container;
  // fly elements start shifted off to the right (visible once they slide in); fade elements start
  // invisible (they wait).
  for (const el of oldEls) { el.style.opacity = '1'; el.style.transform = 'none'; }
  for (const el of newEls) { el.style.opacity = '1'; el.style.transform = 'none'; }
  for (const el of flyEls) { el.style.transform = `translateX(${startOf.get(el)}px)`; el.style.willChange = 'transform'; }
  for (const el of fadeEls) el.style.opacity = '0';

  let rafId = null;
  const resetStyles = () => {
    for (const el of oldEls) { el.style.opacity = ''; el.style.transform = ''; }
    for (const el of newEls) { el.style.opacity = ''; el.style.transform = ''; }
    for (const el of flyEls) { el.style.transform = ''; el.style.willChange = ''; }
    for (const el of fadeEls) el.style.opacity = '';
  };

  const t0 = performance.now();
  const frame = (now) => {
    const t = now - t0;
    const p = Math.min(1, t / MORPH_MS);
    // OLD fades out fast.
    const oldOp = String(1 - easeInOut(clamp01(t / FADE_OUT_MS)));
    for (const el of oldEls) el.style.opacity = oldOp;
    // Sliding elements translate toward 0 (full opacity throughout — they enter from off-screen).
    for (const el of flyEls) {
      const ep = easeInOut(clamp01((t - delayOf(el)) / ELEM_MS));
      el.style.transform = `translateX(${startOf.get(el) * (1 - ep)}px)`;
    }
    // Non-sliding elements wait FADE_DELAY_MS, then fade in over FADE_DUR_MS.
    const fadeOp = String(easeInOut(clamp01((t - FADE_DELAY_MS) / FADE_DUR_MS)));
    for (const el of fadeEls) el.style.opacity = fadeOp;
    if (p < 1) { rafId = requestAnimationFrame(frame); return; }
    rafId = null;
    resetStyles();
    onDone?.();
  };
  // frame(t0) paints the initial state synchronously AND, while p<1, schedules the rAF loop itself —
  // so we must NOT also schedule a second rAF (that would run two loops and fire onDone twice).
  frame(t0);

  return () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    resetStyles();
  };
}
