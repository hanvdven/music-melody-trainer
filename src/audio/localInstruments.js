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
import { LEGACY_WOODBLOCK_BUFFERS } from './legacyWoodblockBuffers.generated.js';
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

/**
 * #1097 (Han 2026-08-20): the #955 .sf2 extraction only captured a single C4 sample for
 * 'woodblock' (Han's FluidR3_GM.sf2 has just one recorded pitch for this GM patch), and it's a
 * different soundfont SET (FluidR3_GM) than the online CDN 'woodblock' Han had been hearing for
 * months (smplr's default MusyngKite kit) — together an audible regression he didn't ask for.
 * 'woodblock' is the metronome's default instrument AND the sound behind the wh/wm/wl percussion
 * pads (drumKits.js METRONOME_NOTE_IDS — they share this same instrument instance), so this one
 * slug matters more than a typical melodic voice. scripts/extract-legacy-woodblock.mjs mirrors the
 * OLD MusyngKite CDN recordings (all 88 semitones A0-C8, not just one) to local WAV once; shadow
 * the slug here — same pattern as SPLENDID_PIANO_SLUG above — so it's served from that local
 * mirror instead of the generic FluidR3 extraction in LOCAL_INSTRUMENT_BUFFERS.
 */
const LEGACY_WOODBLOCK_SLUG = 'woodblock';

/**
 * #313/#315 (Han 2026-08-26) -> REVERTED for the two synth leads by #344 (Han 2026-08-28, "de
 * tovenaar maakt geen geluid ... zou square wave moeten zijn ... in een recente build herbouwd
 * vanuit smplr - maar die is onhoorbaar").
 *
 * HISTORY: #313/#315 moved `lead_1_square` (the wizard cast preview, App.jsx `wizardPreviewRef`) and
 * `lead_2_sawtooth` (the 'lead' instrument-picker option) OFF the FluidR3_GM extraction onto a local
 * mirror of the CDN's MusyngKite recordings (`*-classic/` folders), on the theory that these leads
 * were "too harsh/loud already" and so must NOT get woodblock's `extraGainAndLimiter` compensation.
 * That premise held for the FluidR3 version (a bright single-cycle sustained loop, measured peak
 * ~0.69) but was WRONG for the recorded MusyngKite samples: those peak at only ~0.06 of full scale
 * (measured), and with zero gain compensation the wizard's cast in LEVEL 13 was effectively
 * inaudible at the mezzo-forte level-backing volume. The 176 `*-classic/*.wav` files were also
 * never committed to git, so any clean checkout / CI / deploy had no square-wave samples at all.
 *
 * FIX (#344): the two synth leads go back to the committed FluidR3 extraction
 * (`LOCAL_INSTRUMENT_BUFFERS`, A2-A6 anchor points) and their known harshness is tamed AT THE SOURCE
 * via `MELODIC_TONE_SHAPING` below. Only `woodblock` keeps a `LEGACY_INSTRUMENT_OVERRIDES` entry now
 * -- its `extraGainAndLimiter` "too quiet" fix (#1097) is a separate, unrelated concern and still
 * needed. `scripts/extract-legacy-synth-leads.mjs` + `src/audio/legacySynthLeadBuffers.generated.js`
 * are deleted as dead code.
 */
const LEGACY_INSTRUMENT_OVERRIDES = {
    [LEGACY_WOODBLOCK_SLUG]: { buffers: LEGACY_WOODBLOCK_BUFFERS, folder: 'woodblock-classic', extraGainAndLimiter: true },
};

/**
 * #344 (Han 2026-08-28): per-slug tone shaping for local (FluidR3) melodic instruments whose raw
 * extraction is usable but unpleasant as-is. `lead_1_square` / `lead_2_sawtooth` are bright
 * single-cycle-loop synth waves -- rich in high harmonics and loud when sustained (Han: the FluidR3
 * square "klinkt heel hard"). Two levers, both applied here so the fix is at the instrument, not
 * smeared across every call site's volume:
 *   - `lpfCutoffHz`: a per-voice lowpass biquad the `Smplr`/`Voice` engine already builds from its
 *     params whenever the value is < 20000 (smplr dist line ~766; the same field
 *     `SMPLR_SAFE_DEFAULTS` pins to 20000 = "off"). ~2.5 kHz strips the harsh buzz (7th harmonic and
 *     up of a mid-register note) while leaving the pitch unmistakable.
 *   - `gain`: applied as an `output.addInsert` gain node (the same insert mechanism woodblock's
 *     limiter chain uses) so the voice sits politely under the level-backing volume instead of
 *     dominating it.
 * Values are ear-tunable -- deliberately conservative first pass.
 */
const MELODIC_TONE_SHAPING = {
    lead_1_square: { lpfCutoffHz: 2600, gain: 0.5 },
    lead_2_sawtooth: { lpfCutoffHz: 2200, gain: 0.45 },
};

// Bug fix (Han 2026-08-20, "in de music-levels... metronoom nog steeds te zacht"): measuring the
// actual decoded PCM (scripts/extract-legacy-woodblock.mjs's output) found the loudest of the 88
// samples (D3.wav) peaks at only 0.16 of full scale — a FLAT gain above ~6x already pushes that
// sample past 1.0 and hard-clips (audible distortion, not more loudness) at the AudioContext
// destination, since this app has no limiter anywhere in its output chain. The earlier round's
// `SOUNDFONT_EXTRA_GAIN = 10` (up from smplr's own CDN-parity default of 5 — see
// `getSoundfontConfig`/`Soundfont` in node_modules/smplr) was ALREADY clipping most notes — more
// flat gain from here only adds distortion, not perceived loudness. A real "louder without
// clipping" needs a limiter: gain PAST the safe headroom, then a fast `DynamicsCompressorNode` at
// a near-brickwall ratio to catch anything the raw gain would otherwise clip.
const SOUNDFONT_EXTRA_GAIN = 14;          // pre-limiter gain — deliberately ABOVE the ~6x clip point
const SOUNDFONT_LIMITER_THRESHOLD_DB = -3; // engage only near full scale, so quiet hits stay untouched
const SOUNDFONT_LIMITER_RATIO = 20;        // near brick-wall — this is a limiter, not musical compression
const SOUNDFONT_LIMITER_ATTACK_SEC = 0.001; // fast enough to catch a percussive transient

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

  const legacyOverride = LEGACY_INSTRUMENT_OVERRIDES[slug];
  if (legacyOverride) {
    const inst = new Smplr(
      context,
      buildLocalSmplrJson(slug, legacyOverride.buffers, legacyOverride.folder, { ampRelease: legacyOverride.ampRelease }),
      { destination },
    );
    // Bug fix (Han 2026-08-20, "via percussie is het heeeeel zacht" / "maak het basisinstrument
    // extra luid" / "metronoom nog steeds te zacht"): the gleitz.github.io MIDI.js soundfont mp3
    // recordings (the exact source these WAVs were decoded from, see extract-legacy-woodblock.mjs)
    // are recorded quiet BY DESIGN. A plain `Smplr` instance (built the same way every other
    // LOCAL_INSTRUMENT_BUFFERS entry above is) has no compensation for that at all. Gain alone tops
    // out around 6x before clipping (see SOUNDFONT_EXTRA_GAIN's comment above) — Han wants louder
    // than that ceiling, so this chain pushes gain PAST the safe point and relies on the limiter
    // (added via `output.addInsert`, same insert mechanism smplr's own CDN `Soundfont` class uses
    // for its plain `extraGain` node) to catch what would otherwise clip. `output.addInsert` chains
    // whatever's added in order (input -> insert1 -> insert2 -> volume -> destination), so gain then
    // limiter is exactly gain-into-limiter. ONLY woodblock gets this — the synth leads (#313/#315)
    // have the opposite problem (too harsh/loud already), so `extraGainAndLimiter` is unset for them.
    if (legacyOverride.extraGainAndLimiter) {
      const extraGain = context.createGain();
      extraGain.gain.value = SOUNDFONT_EXTRA_GAIN;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = SOUNDFONT_LIMITER_THRESHOLD_DB;
      limiter.ratio.value = SOUNDFONT_LIMITER_RATIO;
      limiter.attack.value = SOUNDFONT_LIMITER_ATTACK_SEC;
      inst.output.addInsert(extraGain);
      inst.output.addInsert(limiter);
    }
    inst.instrumentSlug = slug;
    return inst;
  }

  const localBuffers = LOCAL_INSTRUMENT_BUFFERS[slug];
  if (localBuffers) {
    // #344: a tone-shaped slug feeds its `lpfCutoffHz` through `buildLocalSmplrJson`'s defaultsOverride
    // (so it lands in `json.defaults`, per-voice) and its `gain` as an output insert below.
    const shaping = MELODIC_TONE_SHAPING[slug];
    const inst = new Smplr(
      context,
      buildLocalSmplrJson(slug, localBuffers, undefined, shaping ? { lpfCutoffHz: shaping.lpfCutoffHz } : {}),
      { destination },
    );
    if (shaping?.gain != null) {
      // `output.addInsert` chains input -> insert -> volume -> destination, so this scales the whole
      // voice ahead of smplr's own volume param and the shared level-backing gain.
      const toneGain = context.createGain();
      toneGain.gain.value = shaping.gain;
      inst.output.addInsert(toneGain);
    }
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
// #313/#315 (Han 2026-08-26): `defaultsOverride` lets ONE slug shorten its release (or override any
// other SMPLR_SAFE_DEFAULTS field) without changing the app-wide default every other local
// instrument still relies on — `undefined` values in the override (e.g. `ampRelease` on a slug that
// doesn't set one) are stripped before merging so they don't clobber the global default with `undefined`
// (the exact smplr 0.20.0 bug SMPLR_SAFE_DEFAULTS itself exists to avoid, see that constant's comment).
function buildLocalSmplrJson(slug, localBuffers, folderOverride, defaultsOverride = {}) {
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
    baseUrl: `/samples/Instruments/${folderOverride ?? slug}`,
    formats: ['wav'],
    map: Object.fromEntries(noteNames.map((note) => [note, localBuffers[note].file])),
  };
  const cleanOverride = Object.fromEntries(
    Object.entries(defaultsOverride).filter(([, v]) => v !== undefined),
  );
  json.defaults = { ...SMPLR_SAFE_DEFAULTS, ...cleanOverride };
  return json;
}
