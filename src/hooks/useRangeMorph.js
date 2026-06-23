import { useRef, useState, useLayoutEffect } from 'react';
import { runFlyInCascade, MORPH_MS } from '../utils/flyInCascade';

// Enter/exit MORPH between the sheet melody and an in-SVG overlay (range / clef). The
// actual cascade tween (fade OLD out, fly NEW in from the right, staggered by x) lives in
// `src/utils/flyInCascade.js` and is shared with the universal app transition so both run
// the EXACT same choreography (Han 2026-06-16). This hook only owns the OVERLAY trigger:
// detecting a surface-kind change and resolving which SVG groups are the OLD vs NEW.
//
// `kind` is the CURRENTLY-shown surface: 'range' | 'clef' | 'color' | 'instrument' | 'legacy' |
// 'playback' | 'generation' | 'generation-advanced' | 'melody'.
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
  // Three new generator setters (Han 2026-06-22). Each is its OWN morph surface (mirrors colour/
  // instrument — a single group, no sibling chord row; the chords "balk" is rendered INSIDE the
  // generation overlays as another row of the same group, not as a separate sibling). PLAYBACK
  // reuses SettingsOverlay but under a distinct group class so its morph never collides with the
  // legacy 'settings' class (they are mutually exclusive, so the classes never coexist).
  if (kind === 'playback') return [svg.querySelector('.playback-overlay')].filter(Boolean);
  if (kind === 'generation') return [svg.querySelector('.generation-overlay')].filter(Boolean);
  if (kind === 'generation-advanced') return [svg.querySelector('.generation-advanced-overlay')].filter(Boolean);
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
//
// WHY the morph descriptor is now derived DURING RENDER, not from a layout-effect setState
// (Han 2026-06-19): the previous TWO-STAGE design armed `morph` in a useLayoutEffect, so the
// returned `morphFrom/morphTo/morphing` lagged `kind` by exactly one render. That lag frame
// was the source of the OPEN and CLOSE flashes:
//   • OPEN (melody→setter): on the change render the gate/mounting still saw `morphing=false`,
//     so the setter content mounted at REST (no fly-in offsets) — visible un-animated for the
//     lag frame before the tween armed.
//   • CLOSE (setter→melody): on the change render the gate saw `morphing=false` and
//     overlayActive=false, so the melody was shown at REST for the lag frame before the
//     return fly-in armed and set its initial offsets.
// React 18 does flush a layout-effect setState before paint MOST of the time, but not when the
// triggering update is itself committed from the click handler first — leaving exactly the
// one-frame flash Han kept seeing. Computing the descriptor in render (a ref compared against
// the live `kind`) makes `morphFrom/morphTo/morphing` correct on the SAME render the kind
// changes, so the gate hides the melody for the morph's FIRST and LAST frame and the cascade's
// initial styles are applied before the first paint (§6: decide before paint, not one render
// late). The tween itself still runs in a layout effect (it must touch the post-commit DOM),
// keyed on the morph id so it fires exactly once per arming.
export default function useRangeMorph(kind, svgRef, flyDist) {
  const prevKindRef = useRef(kind);
  const seqRef = useRef(0);
  // The live morph descriptor, recomputed every render from refs so it is NEVER one render
  // stale. `activeMorphRef` holds the morph currently believed to be running (or just armed);
  // it is mutated during render (the React-sanctioned "store info from previous renders" ref
  // pattern) so the RETURNED values are correct on the same render the kind changes.
  const activeMorphRef = useRef(null);
  // Force a re-render when the tween completes (so `morphing` recomputes to false). A bumping
  // counter is the minimal state needed; its value is never read.
  const [, forceRerender] = useState(0);

  // Render-time arming: if the kind changed since the last committed render, the descriptor is
  // a brand-new morph. This runs in render, so the returned values reflect the change on the
  // SAME render — no lag frame (see WHY above).
  if (prevKindRef.current !== kind) {
    const from = prevKindRef.current;
    prevKindRef.current = kind;
    seqRef.current += 1;
    activeMorphRef.current = { id: seqRef.current, from, to: kind };
  }
  const morph = activeMorphRef.current;
  const pendingId = morph?.id ?? 0;

  // Run the tween once a NEW morph has been armed and the morphing render has committed (both
  // groups present in the post-commit DOM). Keyed on the morph id so re-renders that don't
  // change the kind do not re-fire the tween.
  useLayoutEffect(() => {
    if (pendingId === 0) return undefined;
    const svg = svgRef.current;
    if (!svg) { activeMorphRef.current = null; forceRerender((n) => n + 1); return undefined; }
    const armed = activeMorphRef.current;
    const oldEls = groupsForKind(svg, armed.from);   // old just fades out
    const newEls = groupsForKind(svg, armed.to);     // new flies in (staggered)
    // runFlyInCascade returns a cancel() that also resets inline styles, so a mid-flight
    // re-toggle (cleanup) never leaves a group stuck (Han #8). On natural completion clear the
    // active morph and force a render so `morphing` recomputes to false.
    const cancel = runFlyInCascade(svg, {
      oldEls, newEls, flyDist,
      onDone: () => {
        // Only clear if no newer morph has armed in the meantime (id still matches).
        if (activeMorphRef.current?.id === armed.id) {
          activeMorphRef.current = null;
          forceRerender((n) => n + 1);
        }
      },
    });
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId, svgRef, flyDist]);

  return { morphing: morph != null, morphFrom: morph?.from ?? null, morphTo: morph?.to ?? null };
}
