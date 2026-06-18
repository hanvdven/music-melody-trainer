import { useRef, useState, useLayoutEffect } from 'react';
import { runFlyInCascade, MORPH_MS } from '../utils/flyInCascade';

// Enter/exit MORPH between the sheet melody and an in-SVG overlay (range / clef). The
// actual cascade tween (fade OLD out, fly NEW in from the right, staggered by x) lives in
// `src/utils/flyInCascade.js` and is shared with the universal app transition so both run
// the EXACT same choreography (Han 2026-06-16). This hook only owns the OVERLAY trigger:
// detecting a surface-kind change and resolving which SVG groups are the OLD vs NEW.
//
// `kind` is the CURRENTLY-shown surface: 'range' | 'clef' | 'color' | 'legacy' | 'melody'.
export { MORPH_MS };

// Resolve the SVG group(s) for a given overlay kind, as an ARRAY (clef mode shows the clef
// overlay AND the chord-row overlay as siblings, so both must fade/fly).
const groupsForKind = (svg, kind) => {
  if (kind === 'melody') return [svg.querySelector('.notes-transition')].filter(Boolean);
  // The range setter shows the range overlay AND the chord-row overlay as siblings, so both
  // fade/fly together (Han #10/#11 — chords live in the range setter).
  if (kind === 'range') return [svg.querySelector('.range-overlay'), svg.querySelector('.chord-overlay')].filter(Boolean);
  // The clef setter shows the clef overlay + the chord-STYLE row as siblings.
  if (kind === 'clef') return [svg.querySelector('.clef-overlay'), svg.querySelector('.chord-style-overlay')].filter(Boolean);
  // The colour setter lays its scheme rows directly on the top staff — a single group, no
  // sibling chord row (Han 2026-06-15 B1).
  if (kind === 'color') return [svg.querySelector('.note-coloring-overlay')].filter(Boolean);
  // The instrument setter lays its per-staff card strips directly on the staves — a single
  // group, no sibling chord row (mirrors colour, Han 2026-06-16).
  if (kind === 'instrument') return [svg.querySelector('.instrument-overlay')].filter(Boolean);
  // The old settings overlay is now a sliding 'legacy' surface (Han #11).
  if (kind === 'legacy') return [svg.querySelector('.settings-overlay')].filter(Boolean);
  return [];
};

// Pure gate decision: should the sheet melody (`.notes-transition`) be HIDDEN right now,
// given the current surface `kind` and the (possibly one-render-late) morph state?
//
// WHY this is its own pure function (Han 2026-06-18): `useRangeMorph` arms a morph in a
// TWO-STAGE effect — a useLayoutEffect first detects the kind change and calls setMorph,
// then a second effect runs the tween. So on the FIRST committed render after a switch,
// `kind` has already updated but `morphFrom/morphTo` still describe the PREVIOUS morph.
//
// The one-frame flash this closes: while the melody→overlay ENTRY morph is still running
// (it lasts MORPH_MS = 1.5 s) the user switches overlay→overlay (e.g. instrument→colour).
// On that first frame `kind` is already 'color' but the stale morph is still
// {from:'melody', to:'instrument'} → `morphFrom === 'melody'` is true. A naive gate
// (hide unless a melody-involving morph is active) would therefore SHOW the melody for one
// frame before the new morph arms and hides it again — the reported flash.
//
// The fix (option a — derive the gate so it's robust to morph-arming lag): the melody is
// only force-shown over an overlay for the LEAVE fade-out (`morphFrom === 'melody'`), AND
// only while that morph is still the CURRENT one — i.e. `kind === morphTo` (we are heading
// into, and now resting on, the surface the melody is leaving for). Once `kind` moves on to
// a different overlay (`kind !== morphTo`) the melody-leaving morph is STALE and must not
// expose the melody. The RETURN-to-melody fly-in is NOT handled here: when returning,
// `kind === 'melody'` so `overlayActive` is false and the melody is shown by the outer gate.
//
// `overlayActive` is true exactly when a setter overlay is the current surface
// (kind !== 'melody'); the caller passes the same boolean it uses to blank the staves.
export function melodyHiddenDuringOverlay(overlayActive, morphing, morphFrom, morphTo, kind) {
  if (!overlayActive) return false;                       // resting/returning to melody → shown
  // Force-show ONLY for a melody→overlay leave fade-out that is still current (not stale).
  const leavingMelodyNow = morphing && morphFrom === 'melody' && morphTo === kind;
  return !leavingMelodyNow;                               // otherwise (incl. overlay→overlay) hidden
}

// A morph is armed whenever the kind CHANGES — including switching directly between
// overlays (clef→range), which previously didn't animate because the
// rangeEditMode||clefEditMode boolean never flipped (Han 2026-06-01 #10). Switching treats
// the previous surface as the OLD (fades out) and the new as NEW (flies in).
export default function useRangeMorph(kind, svgRef, flyDist) {
  const [morph, setMorph] = useState(null);
  const prevKindRef = useRef(kind);
  const seqRef = useRef(0);

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
    // runFlyInCascade returns a cancel() that also resets inline styles, so a mid-flight
    // re-toggle (cleanup) never leaves a group stuck (Han #8).
    const cancel = runFlyInCascade(svg, { oldEls, newEls, flyDist, onDone: () => setMorph(null) });
    return cancel;
  }, [morph, svgRef, flyDist]);

  return { morphing: morph != null, morphFrom: morph?.from ?? null, morphTo: morph?.to ?? null };
}
