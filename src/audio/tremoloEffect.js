/**
 * #990 follow-up (Han 2026-08-14, "de vibrato: geen f mod, maar v mod graag" -- volume
 * modulation, not pitch/frequency modulation): a classic ~6Hz amplitude tremolo, hand-rolled in
 * plain Web Audio, paired with chorusEffect.js for the "wrong note" cue (chorus=1 + tremolo=0.7).
 *
 * WHY A DIFFERENT SHAPE THAN chorusEffect.js: chorus is a SEND effect (a parallel wet copy summed
 * on top of an always-present dry signal via smplr's `output.addEffect`) -- fine for an ensemble
 * detune, where the dry signal staying present is part of the "slightly out of tune ensemble"
 * character. Tremolo is fundamentally an INSERT: it must multiply the actual signal's amplitude,
 * not add a periodically-gated copy alongside an unattenuated original (that would not read as
 * "quieter/louder", just as a subtle doubling). So this module is NOT plugged in via
 * `output.addEffect` -- it is wired as a literal series insert in front of each channel's
 * destination (see useInstruments.js: the shared per-type fader now connects to
 * `tremolo.input` instead of straight to `context.destination`, and the manual/click-play path
 * gets its own tremolo insert the same way).
 *
 * Signal graph:
 *
 *   input ─────────────────────────────────────────┐
 *                                                    ▼
 *                                              gain (base = 1 - depth/2) ─ destination
 *                                                    ▲
 *   lfo (Osc @ 6Hz) ─ depthGain (depth/2) ───────────┘
 *
 * gain(t) = (1 - depth/2) + (depth/2) * sin(2*pi*6*t), i.e. swings between (1-depth) and 1 --
 * at depth=0 the gain is a flat 1 (the insert is transparent); at depth=1 it swings all the way
 * down to 0 on every cycle (deep, "seasick" tremolo).
 */

/** Tremolo rate (Hz) -- Han's spec, "ongeveer 6Hz" (classic amplitude-vibrato range). */
const RATE_HZ = 6;

/**
 * Create a tremolo insert unit.
 *
 * @param {AudioContext} context
 * @param {{ destination?: AudioNode }} [options] where the (tremolo'd) signal is routed to.
 * @returns {{ input: GainNode, setStrength: Function, disconnect: Function }} — same call shape
 *   as chorusEffect's createChorus, but `input` must be wired as an INSERT (upstream node
 *   connects TO `input`, and this unit itself connects onward to `destination`) rather than
 *   passed to `output.addEffect`.
 */
export function createTremolo(context, options = {}) {
    const { destination = context.destination } = options;

    const input = context.createGain(); // pass-through node — the modulated gain stage IS `input`
    input.gain.value = 1; // depth=0 at rest: transparent, matches chorus's INV-2 "0 = not there"
    input.connect(destination);

    const lfo = context.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = RATE_HZ;
    const depthGain = context.createGain();
    depthGain.gain.value = 0; // depth/2, starts at 0 alongside input.gain's base of 1
    lfo.connect(depthGain);
    depthGain.connect(input.gain); // audio-rate signal ADDS onto the AudioParam's base value
    lfo.start();

    let disconnected = false;

    /**
     * Set the tremolo depth, 0 (off, flat gain) … 1 (full swing to silence each cycle).
     *
     * Same imperative-only rule as chorusEffect.js (CLAUDE.md §6): always scheduled via
     * `setTargetAtTime`, never through React state/props/useEffect per note.
     */
    const setStrength = (strength, { rampSec = 0.03, time = null } = {}) => {
        if (disconnected) return;
        const depth = Math.min(1, Math.max(0, Number(strength) || 0));
        const t = time ?? context.currentTime;
        input.gain.setTargetAtTime(1 - depth / 2, t, rampSec);
        depthGain.gain.setTargetAtTime(depth / 2, t, rampSec);
    };

    const disconnect = () => {
        if (disconnected) return;
        disconnected = true;
        try { lfo.stop(); } catch { /* already stopped */ }
        lfo.disconnect();
        depthGain.disconnect();
        input.disconnect();
    };

    return { input, setStrength, disconnect };
}

export default createTremolo;
