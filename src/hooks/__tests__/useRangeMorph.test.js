import { describe, it, expect } from 'vitest';
import { melodyHiddenDuringOverlay } from '../useRangeMorph';

// Pure gate decision for the sheet melody (`.notes-transition`) visibility while a setter
// overlay is/may be the current surface. The crux is robustness to the TWO-STAGE morph effect
// in useRangeMorph: on the first render after a kind change, `kind` has updated but
// morphFrom/morphTo still describe the PREVIOUS morph (see the hook's WHY comment). The flash
// bug (Han 2026-06-18) was a stale morphFrom==='melody' leaking onto one overlay→overlay frame.
describe('melodyHiddenDuringOverlay', () => {
  it('shows the melody when no overlay is active (resting melody / returning to melody)', () => {
    // overlayActive false ⇒ kind === 'melody'; outer gate shows it regardless of morph.
    expect(melodyHiddenDuringOverlay(false, false, null, null, 'melody')).toBe(false);
    expect(melodyHiddenDuringOverlay(false, true, 'instrument', 'melody', 'melody')).toBe(false); // return fly-in
  });

  it('hides the melody while resting inside a setter overlay (no morph)', () => {
    expect(melodyHiddenDuringOverlay(true, false, null, null, 'instrument')).toBe(true);
    expect(melodyHiddenDuringOverlay(true, false, null, null, 'color')).toBe(true);
  });

  it('SHOWS the melody during a CURRENT melody→overlay leave fade-out (morphTo === kind)', () => {
    // melody→instrument: morph armed, kind landed on 'instrument', morphTo matches → fade out visible.
    expect(melodyHiddenDuringOverlay(true, true, 'melody', 'instrument', 'instrument')).toBe(false);
    expect(melodyHiddenDuringOverlay(true, true, 'melody', 'range', 'range')).toBe(false);
  });

  it('HIDES the melody on an overlay→overlay switch (the flash case)', () => {
    // instrument→colour with a NEW morph already armed: neither leg is melody → hidden.
    expect(melodyHiddenDuringOverlay(true, true, 'instrument', 'color', 'color')).toBe(true);
    // clef→range likewise.
    expect(melodyHiddenDuringOverlay(true, true, 'clef', 'range', 'range')).toBe(true);
  });

  it('HIDES the melody on the STALE first frame of an overlay→overlay switch', () => {
    // The race: melody→instrument ENTRY morph still running ({from:'melody',to:'instrument'})
    // when the user switches to colour. First frame: kind='color' but morph is still stale.
    // morphFrom==='melody' is true, but morphTo('instrument') !== kind('color') → STALE → hidden.
    // This is the one-frame flash the old gate exposed; the fix keeps it hidden.
    expect(melodyHiddenDuringOverlay(true, true, 'melody', 'instrument', 'color')).toBe(true);
  });

  it('ignores a stale morphTo==="melody" while an overlay is the current surface', () => {
    // A leftover return morph (to 'melody') must not reveal the melody if we are now in an overlay.
    expect(melodyHiddenDuringOverlay(true, true, 'instrument', 'melody', 'range')).toBe(true);
  });

  // --- OPEN / CLOSE frame coverage (Han 2026-06-19) ---
  // With render-time morph arming (no more two-stage lag), the descriptor passed to the gate is
  // correct on the SAME render the kind changes. These assert the FIRST and LAST frame of the
  // open/close transitions, which previously flashed.
  describe('open/close transition frames (render-time arming, no lag)', () => {
    it('OPEN melody→setter: first frame shows the melody so it can fade out (leave fade-out)', () => {
      // Render-time arming makes morphFrom='melody', morphTo=kind on the change render itself.
      expect(melodyHiddenDuringOverlay(true, true, 'melody', 'instrument', 'instrument')).toBe(false);
      expect(melodyHiddenDuringOverlay(true, true, 'melody', 'color', 'color')).toBe(false);
      expect(melodyHiddenDuringOverlay(true, true, 'melody', 'range', 'range')).toBe(false);
    });

    it('OPEN: once the melody fade-out completes (morph cleared) the melody stays hidden under the setter', () => {
      // After onDone the morph is null → resting inside the overlay → hidden.
      expect(melodyHiddenDuringOverlay(true, false, null, null, 'instrument')).toBe(true);
    });

    it('CLOSE setter→melody: every frame shows the melody (overlayActive false ⇒ fly-in visible)', () => {
      // First frame of close: morph {from:overlay,to:melody}, kind already 'melody'.
      expect(melodyHiddenDuringOverlay(false, true, 'instrument', 'melody', 'melody')).toBe(false);
      expect(melodyHiddenDuringOverlay(false, true, 'range', 'melody', 'melody')).toBe(false);
      // Last frame / rest: morph cleared, still melody.
      expect(melodyHiddenDuringOverlay(false, false, null, null, 'melody')).toBe(false);
    });

    it('rapid OPEN→SWITCH: melody→setterA armed then switched to setterB stays hidden', () => {
      // Render-time arming re-arms to {from:setterA,to:setterB} immediately, so morphFrom is no
      // longer 'melody' — hidden. (The legacy "stale melody leg" frame can no longer occur, but
      // the gate must still hide it if it ever did.)
      expect(melodyHiddenDuringOverlay(true, true, 'instrument', 'color', 'color')).toBe(true);
      // Defensive: even if a stale melody leg leaked (morphTo !== kind), still hidden.
      expect(melodyHiddenDuringOverlay(true, true, 'melody', 'instrument', 'color')).toBe(true);
    });
  });
});
