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
// By default flyable elements slide in from the RIGHT (translateX flyDist → 0). An
// element may instead carry `data-fly-from="<userSpaceX>"` to emerge from a specific
// x — the clef variant chips use this so subtypes slide out from UNDER the clef on
// the left (Han 2026-06-01 CR), rather than streaming in from the right.
//
// All opacity/transform is set via `element.style` in the rAF callback — never JSX
// props — per §6. Inline styles are cleared at the end so the scroll/wipe systems
// own those properties again afterwards.
export const MORPH_MS = 1500;
const ELEM_MS = 1000;      // how long one element's slide lasts
const STAGGER_MS = 500;    // delay between the first and last element starting
const GROUP_FADE_MS = 700; // group fade-IN for the non-note elements
const FADE_OUT_MS = 250;   // OLD group fade-OUT — very short (Han 2026-06-01 #5)

const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Subtle ease-in/ease-out so each element accelerates and decelerates rather than
// moving at a constant rate (Han 2026-06-01 #4). smoothstep keeps it gentle.
const easeInOut = (t) => t * t * (3 - 2 * t);

// Resolve the SVG group(s) for a given overlay kind, as an ARRAY (clef mode shows
// the clef overlay AND the chord-row overlay as siblings, so both must fade/fly).
const groupsForKind = (svg, kind) => {
  if (kind === 'melody') return [svg.querySelector('.notes-transition')].filter(Boolean);
  // The range setter shows the range overlay AND the chord-row overlay as siblings,
  // so both fade/fly together (Han #10/#11 — chords live in the range setter).
  if (kind === 'range') return [svg.querySelector('.range-overlay'), svg.querySelector('.chord-overlay')].filter(Boolean);
  // The clef setter shows the clef overlay + the chord-STYLE row as siblings.
  if (kind === 'clef') return [svg.querySelector('.clef-overlay'), svg.querySelector('.chord-style-overlay')].filter(Boolean);
  // The colour setter lays its scheme rows directly on the top staff — a single group,
  // no sibling chord row (Han 2026-06-15 B1).
  if (kind === 'color') return [svg.querySelector('.note-coloring-overlay')].filter(Boolean);
  // The old settings overlay is now a sliding 'legacy' surface (Han #11).
  if (kind === 'legacy') return [svg.querySelector('.settings-overlay')].filter(Boolean);
  return [];
};

// `kind` is the CURRENTLY-shown surface: 'range' | 'clef' | 'melody' (no overlay).
// A morph is armed whenever the kind CHANGES — including switching directly between
// overlays (clef→range), which previously didn't animate because the
// rangeEditMode||clefEditMode boolean never flipped (Han 2026-06-01 #10). Switching
// treats the previous surface as the OLD (fades out) and the new as NEW (flies in).
export default function useRangeMorph(kind, svgRef, flyDist) {
  const [morph, setMorph] = useState(null);
  const prevKindRef = useRef(kind);
  const seqRef = useRef(0);
  const rafRef = useRef(null);

  // Detect the kind change and arm a morph (before paint).
  useLayoutEffect(() => {
    if (prevKindRef.current === kind) return;
    const from = prevKindRef.current;
    prevKindRef.current = kind;
    seqRef.current += 1;
    setMorph({ id: seqRef.current, from, to: kind });
  }, [kind]);

  // Run the tween once the morphing render has committed (both groups present).
  useLayoutEffect(() => {
    if (!morph) return undefined;
    const svg = svgRef.current;
    if (!svg) { setMorph(null); return undefined; }
    const oldEls = groupsForKind(svg, morph.from);   // old just fades out
    const newEls = groupsForKind(svg, morph.to);     // new flies in (staggered)

    // Collect the individually-flying note elements across the new group(s) and give
    // each a start delay from its x (leftmost first). getBBox().x is in user space.
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

    // Per-element initial translateX. Default = flyDist (slide in from the RIGHT).
    // An element carrying `data-fly-from="<x>"` instead emerges FROM that user-space
    // x — used by the clef variant chips so the subtypes appear to slide out from
    // UNDER the clef on the left (Han 2026-06-01 CR): each chip starts at the clef
    // anchor (x left of itself ⇒ negative offset) and slides right to its slot.
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
      if (p < 1) { rafRef.current = requestAnimationFrame(frame); return; }
      rafRef.current = null;
      resetStyles();
      setMorph(null);
    };
    // Hand the inline props back; called on completion AND interrupt so a rapid
    // re-toggle never leaves a group stuck (Han #8).
    const resetStyles = () => {
      for (const el of oldEls) { el.style.opacity = ''; el.style.transform = ''; }
      for (const el of newEls) { el.style.opacity = ''; el.style.transform = ''; }
      for (const el of flyEls) { el.style.transform = ''; el.style.willChange = ''; }
    };
    frame(t0);
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      resetStyles();   // restore styles if this morph was interrupted mid-flight
    };
  }, [morph, svgRef, flyDist]);

  return { morphing: morph != null, morphFrom: morph?.from ?? null, morphTo: morph?.to ?? null };
}
