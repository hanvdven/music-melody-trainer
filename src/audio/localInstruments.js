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
import { Soundfont, Smplr, SplendidGrandPiano, soundfontToSmplrJson } from 'smplr';
import { EXTRACTED_INSTRUMENT_BUFFERS } from './localInstrumentBuffers.generated.js';
import { SPLENDID_LOCAL_BASE_URL, splendidPianoStorage } from './splendidPianoStorage.js';
import { noteToMidi } from '../theory/noteUtils.js';

/**
 * Maps an instrument slug (used in InstrumentSettings) to a local sample
 * buffer map, bypassing CDN loading in useInstruments.js.
 */
export const LOCAL_INSTRUMENT_BUFFERS = EXTRACTED_INSTRUMENT_BUFFERS;

// smplr 0.20.0 bug: an undefined `detune`/`ampRelease`/`lpfCutoffHz` in a SmplrJson's `defaults`
// overrides PARAM_DEFAULTS' own 0-values with `undefined` during resolveParams, producing NaN ->
// "non-finite AudioParam" TypeError. Passing explicit values here prevents that. Field names match
// smplr's PlaybackParams (`ampRelease`, not the old Sampler-class-specific `decayTime` — see #889
// follow-up below, which moved local-instrument construction off the plain `Sampler` class onto
// `Smplr` directly so per-note loop regions can be described).
const SMPLR_SAFE_DEFAULTS = { detune: 0, ampRelease: 0.3, lpfCutoffHz: 20000 };

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
    const inst = new SplendidGrandPiano(context, {
      destination,
      baseUrl: SPLENDID_LOCAL_BASE_URL,
      storage: splendidPianoStorage,
      formats: ['wav'],
    });
    inst.instrumentSlug = slug;   // #889 follow-up — see LET_RING_INSTRUMENTS in constants/instruments.jsx
    return inst;
  }

  const localBuffers = LOCAL_INSTRUMENT_BUFFERS[slug];
  if (localBuffers) {
    const inst = new Smplr(context, buildLocalSmplrJson(slug, localBuffers), { destination });
    inst.instrumentSlug = slug;
    return inst;
  }
  const inst = new Soundfont(context, {
    instrument: slug,
    destination,
    ...(disableScheduler ? { disableScheduler } : {}),
  });
  inst.instrumentSlug = slug;
  return inst;
}

// #889 follow-up (Han 2026-08-14, "app-wide: noten worden on release meteen afgesloten... zeker
// hoorbaar bij percussie-instrumenten als vibraphone"): the plain `Sampler` class's flat
// note->URL `buffers` map has no channel for per-sample loop metadata (smplr 0.20.0's
// `SamplerConfig.buffers` type), even though the underlying `Smplr`/`Voice` engine fully supports
// native Web-Audio looping (`source.loop/.loopStart/.loopEnd`). So local instruments are now built
// via `Smplr` directly, fed a SmplrJson whose regions carry loop points extracted from the source
// .sf2 (scripts/extract-soundfont-samples.mjs — `loopStart`/`loopEnd` in seconds, only present for
// notes whose SF2 zone actually declares sustain-looping, e.g. cello/organ/choir/pads/harmonica/
// saw — a struck/plucked/decay instrument's SF2 zone has no loop, so it plays through once as
// before). Reuses smplr's OWN `soundfontToSmplrJson(noteNames, loopData)` — the exact function its
// CDN Soundfont class uses for its own (separately-hosted) loop-data JSON — instead of hand-rolling
// the same keyRange-spreading/loop-region logic a second time (§6c/§6d); only `samples`
// (baseUrl/formats/map) is swapped afterwards to point at this app's local WAV files instead of
// smplr's base64-embedded/CDN note data.
function buildLocalSmplrJson(slug, localBuffers) {
  const noteNames = Object.keys(localBuffers);
  const loopData = {};
  for (const note of noteNames) {
    const entry = localBuffers[note];
    if (entry.loopStart != null && entry.loopEnd != null) {
      loopData[noteToMidi(note)] = [entry.loopStart, entry.loopEnd];
    }
  }
  const json = soundfontToSmplrJson(noteNames, Object.keys(loopData).length ? loopData : undefined);
  json.samples = {
    baseUrl: `/samples/Instruments/${slug}`,
    formats: ['wav'],
    map: Object.fromEntries(noteNames.map((note) => [note, localBuffers[note].file])),
  };
  json.defaults = SMPLR_SAFE_DEFAULTS;
  return json;
}
