/**
 * Local sample overrides for melodic instruments, so useInstruments.js never has to hit the
 * smplr Soundfont CDN (gleitz.github.io/midi-js-soundfonts) — an earlier local-samples attempt
 * (commit 7cf8fd7) was reverted specifically because its FLAC files failed to decode in the
 * browser (EncodingError), NOT because local samples are unworkable; these are WAV, the same
 * format the local percussion samples (drumKits.js LOCAL_PERCUSSION_BUFFERS) already use
 * successfully.
 *
 * #955 (offline-boot initiative, Han 2026-08-13): populated from
 * localInstrumentBuffers.generated.js, produced by `node scripts/extract-soundfont-samples.mjs`
 * from Han's local src/assets/FluidR3_GM.sf2 — re-run that script (not by hand) if the
 * instrument roster (src/constants/instruments.jsx) or the source .sf2 changes.
 *
 * To add a local override for an instrument the generator doesn't cover:
 *   export const LOCAL_MY_INSTRUMENT_BUFFERS = { 'C4': '/samples/...', ... };
 *   and add  myInstrument: LOCAL_MY_INSTRUMENT_BUFFERS  to LOCAL_INSTRUMENT_BUFFERS.
 */
import { Soundfont, Sampler, SplendidGrandPiano } from 'smplr';
import { EXTRACTED_INSTRUMENT_BUFFERS } from './localInstrumentBuffers.generated.js';
import { SPLENDID_LOCAL_BASE_URL, splendidPianoStorage } from './splendidPianoStorage.js';

/**
 * Maps an instrument slug (used in InstrumentSettings) to a local sample
 * buffer map, bypassing CDN loading in useInstruments.js.
 */
export const LOCAL_INSTRUMENT_BUFFERS = EXTRACTED_INSTRUMENT_BUFFERS;

// smplr 0.20.0 bug: samplerToSmplrJson includes `defaults: { detune: options.detune }` in the
// generated JSON. When options.detune is undefined, it overrides PARAM_DEFAULTS.detune=0 with
// undefined during resolveParams, producing NaN -> "non-finite AudioParam" TypeError. Passing
// explicit 0 values here prevents undefined from reaching PARAM_DEFAULTS overrides. (Moved here
// from useInstruments.js, which used to duplicate this exact block for its percussion Sampler
// paths — see createMelodicInstrument below.)
const SAMPLER_SAFE_DEFAULTS = { detune: 0, decayTime: 0.3, lpfCutoffHz: 20000 };

/**
 * #955 (offline-boot initiative, Han 2026-08-13): single point of decision for "does this
 * instrument slug play from a local sample or the CDN" — every place in the app that creates a
 * one-off melodic Soundfont instance (App.jsx's timpani/cello/wizard-preview refs,
 * playInstrumentPreview.js, useConversationInstruments.js, useWorldAmbientMusic.js, and
 * useInstruments.js's own track instruments) now goes through this instead of each duplicating
 * the same `LOCAL_INSTRUMENT_BUFFERS[slug] ? new Sampler(...) : new Soundfont(...)` check —
 * before this, only useInstruments.js had that check, so the app could still hit the CDN from
 * five other places even with every instrument extracted locally (see kanban #955 notes).
 */
/**
 * #988 (Han 2026-08-14): the GM acoustic grand from the .sf2 extraction is a single-velocity,
 * sparsely-sampled piano and simply doesn't sound good. smplr ships a dedicated
 * SplendidGrandPiano — 226 recordings across 5 velocity layers — so the piano slug is routed to
 * that class instead. The slug itself is unchanged everywhere else in the app.
 */
const SPLENDID_PIANO_SLUG = 'acoustic_grand_piano';

export function createMelodicInstrument(context, slug, options = {}) {
  const { destination = context.destination, disableScheduler } = options;

  // Deliberately BEFORE the LOCAL_INSTRUMENT_BUFFERS lookup: the generated manifest still has an
  // acoustic_grand_piano entry (#955's .sf2 extraction) and we shadow it rather than deleting it,
  // because localInstrumentBuffers.generated.js is regenerated wholesale by the extractor and its
  // own header forbids hand-edits. Samples are WAV, served exclusively from the local mirror by
  // splendidPianoStorage — no CDN fallback (see that module's doc comment for why: the CDN only
  // has Ogg/Opus and M4A, and Ogg/Opus produced silent-but-error-free playback in real browser
  // testing, #988's UAT bounce). `formats: ['wav']` makes every browser pick the same format —
  // `audio.canPlayType('audio/wav')` is unconditionally "probably", so there's no Safari-specific
  // branch to account for, unlike smplr's own ogg/m4a default. `disableScheduler` is a
  // Soundfont-only option with no SplendidGrandPianoConfig equivalent, so it is ignored here
  // (nothing passes it for a melodic slug today).
  if (slug === SPLENDID_PIANO_SLUG) {
    return new SplendidGrandPiano(context, {
      destination,
      baseUrl: SPLENDID_LOCAL_BASE_URL,
      storage: splendidPianoStorage,
      formats: ['wav'],
    });
  }

  const localBuffers = LOCAL_INSTRUMENT_BUFFERS[slug];
  if (localBuffers) {
    return new Sampler(context, { destination, buffers: localBuffers, ...SAMPLER_SAFE_DEFAULTS });
  }
  return new Soundfont(context, {
    instrument: slug,
    destination,
    ...(disableScheduler ? { disableScheduler } : {}),
  });
}
