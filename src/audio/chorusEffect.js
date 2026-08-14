/**
 * #990 (Han 2026-08-14, "bij een foute noot chorus — klein beetje vals klinken"):
 * a 3-voice LFO-modulated delay chorus, hand-rolled in plain Web Audio.
 *
 * WHY hand-rolled (CLAUDE.md §6c "use existing logic — do not hardcode/reinvent" was checked
 * FIRST): smplr's public export list (node_modules/smplr/dist/index.d.ts) ships exactly ONE
 * effect — `Reverb`. There is no Chorus/Detune/Delay effect anywhere in smplr, and package.json
 * has no other DSP dependency (only smplr / react / react-dom / lucide-react / capacitor).
 * Pulling in Tone.js for a single ~40-node graph is not a trade worth making, so this module is
 * the app's own effect — deliberately shaped EXACTLY like smplr's `Reverb`
 * (`{ input: AudioNode }` + self-connected output) so it drops into the existing
 * `instrument.output.addEffect(name, effect, mix)` pattern verbatim.
 *
 * Signal graph:
 *
 *   input(Gain) ─┬─ delay0 (12ms) ─ panner(-0.7) ─┐
 *                ├─ delay1 (18ms) ─ panner( 0.0) ─┼─ wet(Gain, 0) ─ destination
 *                └─ delay2 (25ms) ─ panner(+0.7) ─┘
 *
 *   lfo_i (Osc @ 0.53 / 0.67 / 0.91 Hz) ─ depth_i(Gain) ─ delay_i.delayTime
 *
 * The three LFO rates are mutually non-harmonic on purpose: harmonically related rates
 * phase-lock into one single audible wobble, which sounds like a broken vibrato rather than the
 * "slightly out of tune ensemble" Han asked for.
 */

/** Base delay times (seconds) for the three chorus voices — classic 10–30ms chorus range. */
const BASE_DELAYS = [0.012, 0.018, 0.025];
/** LFO rates (Hz), mutually non-harmonic so the three voices never phase-lock. */
const LFO_RATES = [0.53, 0.67, 0.91];
/** Stereo spread of the three voices. */
const PAN_POSITIONS = [-0.7, 0, 0.7];
/** Modulation depth (seconds) at strength 0 → barely-there detune. */
const MIN_DEPTH = 0.0008;
/** Modulation depth (seconds) at strength 1 → seasick. */
const MAX_DEPTH = 0.004;

/**
 * Create a chorus effect unit.
 *
 * @param {AudioContext} context
 * @param {{ destination?: AudioNode }} [options] destination the WET signal is routed to.
 *   Pass the instrument's own fader (not `context.destination`) so per-instrument volume still
 *   applies to the wet path — this is strictly better than smplr's `Reverb`, which hardcodes
 *   `context.destination`.
 * @returns {{ input: GainNode, setStrength: Function, disconnect: Function }} same shape as
 *   smplr's `Reverb`, so `output.addEffect('chorus', unit, 1)` works unchanged.
 */
export function createChorus(context, options = {}) {
  const { destination = context.destination } = options;

  const input = context.createGain();

  // Wet level starts at ZERO: the effect is attached permanently to every instrument, so at rest
  // it MUST contribute exact silence and leave the dry path bit-identical. Strength 0 = "chorus
  // is not there".
  const wet = context.createGain();
  wet.gain.value = 0;
  wet.connect(destination);

  const delays = [];
  const depths = [];
  const lfos = [];
  const panners = [];

  for (let i = 0; i < BASE_DELAYS.length; i++) {
    const delay = context.createDelay(0.1);
    delay.delayTime.value = BASE_DELAYS[i];

    const panner = context.createStereoPanner();
    panner.pan.value = PAN_POSITIONS[i];

    const lfo = context.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = LFO_RATES[i];

    // depth converts the oscillator's ±1 output into ± seconds of delay-time deviation.
    const depth = context.createGain();
    depth.gain.value = MIN_DEPTH;

    input.connect(delay);
    delay.connect(panner);
    panner.connect(wet);
    lfo.connect(depth);
    depth.connect(delay.delayTime);
    lfo.start();

    delays.push(delay);
    depths.push(depth);
    lfos.push(lfo);
    panners.push(panner);
  }

  let disconnected = false;

  /**
   * Set the chorus amount, 0 (silent/off) … 1 (maximum detune).
   *
   * IMPORTANT (CLAUDE.md §6, audio-domain form of the "never drive animation through React
   * state" invariant): the wet level is ALWAYS scheduled straight onto the AudioParam via
   * `setTargetAtTime`. It must never be routed through React state or a component prop per note
   * — a re-render is ~16ms of jitter minimum and would click. Do not "optimise" a caller of this
   * into a `useEffect`.
   *
   * One knob drives TWO coupled params: the wet mix AND the modulation depth. A low strength is
   * therefore a quiet, subtle detune and a high strength is a loud, wide one — which is what
   * "een klein beetje vals" vs "heel vals" actually means perceptually.
   */
  const setStrength = (strength, { rampSec = 0.03, time = null } = {}) => {
    if (disconnected) return;
    const s = Math.min(1, Math.max(0, Number(strength) || 0));
    const t = time ?? context.currentTime;
    // setTargetAtTime, not setValueAtTime: an instantaneous gain step is an audible click.
    wet.gain.setTargetAtTime(s, t, rampSec);
    const depthValue = MIN_DEPTH + s * (MAX_DEPTH - MIN_DEPTH);
    for (const depth of depths) {
      depth.gain.setTargetAtTime(depthValue, t, rampSec);
    }
  };

  /**
   * Tear the unit down completely. MUST be called when the owning instrument is replaced —
   * this is exactly the leak documented as "#4" in useInstruments.js (old channels and their
   * added effects stay connected and clog the graph until nothing is audible).
   */
  const disconnect = () => {
    if (disconnected) return;
    disconnected = true;
    for (const lfo of lfos) {
      try { lfo.stop(); } catch { /* already stopped */ }
      lfo.disconnect();
    }
    for (const depth of depths) depth.disconnect();
    for (const delay of delays) delay.disconnect();
    for (const panner of panners) panner.disconnect();
    input.disconnect();
    wet.disconnect();
  };

  return { input, setStrength, disconnect };
}

export default createChorus;
