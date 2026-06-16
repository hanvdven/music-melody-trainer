// flyInCascade — the shared "fade OLD out, fly NEW in from the right (staggered by x)"
// cascade tween. Extracted from useRangeMorph (Han 2026-06-16) so the overlay enter/exit
// morph AND the universal app transition (song load / tab change / difficulty / overlay)
// run the EXACT same choreography and constants — a single source of truth (§6c/§6d:
// never duplicate magic numbers across two parallel implementations).
//
// To avoid a "massive block sliding in", each NOTE-like element flies in INDIVIDUALLY
// with a slight per-element delay staggered by x (Han 2026-06-01): the leftmost element
// starts at 0 s, the rightmost at STAGGER_MS, and each element's slide lasts ELEM_MS — so
// the whole thing reads as notes streaming in. Non-note elements (clefs, staff lines,
// barlines) just fade in with the group.
//
// Total = STAGGER_MS + ELEM_MS = 1.5 s (rightmost begins at 0.5 s, animates 1 s).
//
// Flyable elements are found via `[data-mel], [data-fly]` inside the new group (the real
// melody marks notes/chords/barlines with data-mel; overlays mark their note/glyph
// elements with data-fly). If none are found we fall back to sliding the whole group as
// one block.
//
// By default flyable elements slide in from the RIGHT (translateX flyDist → 0). An element
// may instead carry `data-fly-from="<userSpaceX>"` to emerge from a specific x — the clef
// variant chips use this so subtypes slide out from UNDER the clef on the left (Han
// 2026-06-01 CR), rather than streaming in from the right.
//
// All opacity/transform is set via `element.style` in the rAF callback — never JSX props —
// per §6. Inline styles are cleared at the end so the scroll/wipe systems own those
// properties again afterwards.
export const MORPH_MS = 1500;
const ELEM_MS = 1000;      // how long one element's slide lasts
const STAGGER_MS = 500;    // delay between the first and last element starting
const GROUP_FADE_MS = 700; // group fade-IN for the non-note elements
const FADE_OUT_MS = 250;   // OLD group fade-OUT — very short (Han 2026-06-01 #5)

const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Subtle ease-in/ease-out so each element accelerates and decelerates rather than moving
// at a constant rate (Han 2026-06-01 #4). smoothstep keeps it gentle.
const easeInOut = (t) => t * t * (3 - 2 * t);

// Run ONE cascade. `oldEls` fade out (fast); `newEls` fly/fade in (staggered). Returns a
// `cancel()` that stops the rAF and resets all inline styles — call it on interrupt so a
// rapid re-trigger never leaves a group stuck (Han #8). `onDone` fires once on natural
// completion (not on cancel).
export function runFlyInCascade(svg, { oldEls = [], newEls = [], flyDist, onDone } = {}) {
  if (!svg) { onDone?.(); return () => {}; }

  // Collect the individually-flying note elements across the new group(s) and give each a
  // start delay from its x (leftmost first). getBBox().x is in user space.
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

  // Per-element initial translateX. Default = flyDist (slide in from the RIGHT). An element
  // carrying `data-fly-from="<x>"` instead emerges FROM that user-space x — used by the clef
  // variant chips so the subtypes appear to slide out from UNDER the clef on the left (Han
  // 2026-06-01 CR): each chip starts at the clef anchor (x left of itself ⇒ negative offset)
  // and slides right to its slot.
  const startOf = new Map();
  for (const el of flyEls) {
    const fromAttr = el.getAttribute('data-fly-from');
    startOf.set(el, fromAttr != null ? (parseFloat(fromAttr) - (xs.get(el) ?? 0)) : flyDist);
  }

  // Initial state, set before paint so there's no flash.
  for (const el of oldEls) { el.style.opacity = '1'; el.style.transform = 'none'; }
  for (const el of newEls) { el.style.opacity = '0'; el.style.transform = 'none'; }
  if (flyEls.length) {
    for (const el of flyEls) { el.style.transform = `translateX(${startOf.get(el)}px)`; el.style.willChange = 'transform'; }
  } else {
    // Fallback: no per-note elements → slide each new group as one block.
    for (const el of newEls) el.style.transform = `translateX(${flyDist}px)`;
  }

  let rafId = null;
  // Hand the inline props back; called on completion AND interrupt so a rapid re-toggle
  // never leaves a group stuck (Han #8).
  const resetStyles = () => {
    for (const el of oldEls) { el.style.opacity = ''; el.style.transform = ''; }
    for (const el of newEls) { el.style.opacity = ''; el.style.transform = ''; }
    for (const el of flyEls) { el.style.transform = ''; el.style.willChange = ''; }
  };

  const t0 = performance.now();
  const frame = (now) => {
    const t = now - t0;
    const p = Math.min(1, t / MORPH_MS);
    // OLD fades out FAST (FADE_OUT_MS); NEW group(s) fade in over GROUP_FADE_MS.
    const oldOp = String(1 - easeInOut(clamp01(t / FADE_OUT_MS)));
    for (const el of oldEls) el.style.opacity = oldOp;
    const newOp = String(easeInOut(clamp01(t / GROUP_FADE_MS)));
    for (const el of newEls) el.style.opacity = newOp;
    if (flyEls.length) {
      for (const el of flyEls) {
        const ep = easeInOut(clamp01((t - delayOf(el)) / ELEM_MS));
        el.style.transform = `translateX(${startOf.get(el) * (1 - ep)}px)`;
      }
    } else {
      for (const el of newEls) el.style.transform = `translateX(${flyDist * (1 - easeInOut(p))}px)`;
    }
    if (p < 1) { rafId = requestAnimationFrame(frame); return; }
    rafId = null;
    resetStyles();
    onDone?.();
  };
  // frame(t0) paints the initial state synchronously at t=0 (no flash) AND, while p<1,
  // schedules the rAF loop itself — so we must NOT also schedule a second rAF here. The
  // original useRangeMorph did both, running two parallel loops that fired the completion
  // twice; harmless when onDone was an idempotent setMorph(null), but the universal
  // transition's onDone does real work and must run exactly once.
  frame(t0);

  return () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    resetStyles();                 // restore styles if this cascade was interrupted mid-flight
  };
}
