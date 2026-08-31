// #1186 (Han 2026-08-29, UAT of #1102: "de noot valt niet EXACT tegelijk met de metronoom klik op de
// perfect hit mark... dit moet echt 100% frame perfect zijn") — the ONE place the app converts between
// "the time I schedule a sound at" and "the time that sound is actually HEARD".
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────────
// A level has two clocks that must agree: the AUDIO schedule (`playMelodies`, in AudioContext seconds)
// and the VISUAL scroll (SheetRpgLayer, whose t=0 is `levelAudioStart` and which reads
// `context.currentTime` every rAF frame). The #1186 measurement proved the ARITHMETIC linking them is
// already exact to the nanosecond — metronome-click time, block cursor and strike-line crossing time
// agreed to 0.000000 ms for every note of a plain non-adaptive level, and the §108 invariant held
// numerically. What was NEVER modelled anywhere in the app is the audio hardware's own output latency:
//
//   a sound scheduled at AudioContext time T is HEARD when `currentTime` has advanced to T + outputLatency
//
// (Web Audio spec: `AudioContext.outputLatency` is "the time between the browser requesting the host
// system to play a buffer and the time at which the first sample in the buffer is actually processed by
// the audio output device", and is explicitly the number to use for audio/video synchronisation.)
// Measured in this project's own Chromium at 48 kHz: **outputLatency = 48 ms** (baseLatency 10.7 ms).
// The visual scroll, reading the same `currentTime`, therefore ran ~48 ms AHEAD of everything audible —
// a constant offset (it does not grow per block), which is exactly the "small but real" desync Han hears:
// ~6.4% of a beat at 80 bpm, ~3 display frames.
//
// ── THE CONVENTION THIS ESTABLISHES ────────────────────────────────────────────────────────────────
// A level's audio times are "heard at" times. The visual clock keeps `levelAudioStart` as its literal
// t=0 (untouched — zero risk to the geometry, the gated-freeze clock or the hit windows), and every
// level audio schedule is issued `outputLatencySeconds()` EARLIER so it comes out of the speakers at the
// notated moment. One seam: `useLevelContentStream`'s `scheduleInto`, through which every level track
// (lead-in cello, lead-in metronome, per-block cello/metronome/timpani and the Wizard cast preview) is
// scheduled.
//
// Deliberately NOT applied inside `playMelodies` itself: that function is shared with the Sequencer,
// the world's ambient music and the instrument previews, none of which have a visual clock to stay in
// step with. Compensating there would silently shift every one of them.
//
// Lives in its own module (like `tempoScrollAnchor.js`) so this one piece of arithmetic has a direct
// unit test without mounting anything.

// A pathological or bogus reading must never be able to push a level's whole schedule into the past —
// `App.jsx` picks its anchor only 1.0 s ahead, and `playMelodies` would then silently clamp the opening
// bars to "now" (the §166 bug class). Half a second is far beyond any real device (Bluetooth headsets
// report ~150-250 ms at the extreme) while still leaving the anchor buffer intact.
export const MAX_COMPENSATED_LATENCY_S = 0.5;

/**
 * How far ahead of being HEARD a sound must be scheduled, in seconds.
 *
 * `outputLatency` is the correct, spec-defined number. Browsers that don't implement it (Safari, older
 * Firefox) still expose `baseLatency` — a strictly smaller under-estimate (it covers only the graph's
 * own buffering, not the device's), but a real improvement over assuming zero. 0 when neither exists,
 * which reproduces the pre-#1186 behaviour exactly.
 */
export const outputLatencySeconds = (context) => {
    if (!context) return 0;
    const reported = typeof context.outputLatency === 'number' ? context.outputLatency
        : (typeof context.baseLatency === 'number' ? context.baseLatency : 0);
    if (!Number.isFinite(reported) || reported <= 0) return 0;
    return Math.min(reported, MAX_COMPENSATED_LATENCY_S);
};

export default outputLatencySeconds;
