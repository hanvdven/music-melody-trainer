// #955 (offline-boot initiative, Han 2026-08-13): one-time offline extraction of melodic
// instrument samples from Han's local FluidR3_GM.sf2 into small local WAV files, so
// useInstruments.js can load instruments via the existing LOCAL_INSTRUMENT_BUFFERS/Sampler
// mechanism (already proven working for percussion) instead of fetching from the
// gleitz.github.io CDN on every boot. Not part of the app bundle/runtime — a dev-only
// build step, run manually when the instrument roster or the source .sf2 changes.
//
// NOTE (2026-09-01): `src/assets/FluidR3_GM.sf2` is NOT in the repo — at 141MB it exceeds
// GitHub's 100MB file limit and was stripped from history. It is gitignored. The extraction
// OUTPUT (`src/audio/localInstrumentBuffers.generated.js`) IS committed and is all the running
// app needs. To re-run THIS script, drop your own copy of FluidR3_GM.sf2 at that path first.
//
// Root-pitch handling: SF2 zones often carry an unreliable `sample.header.originalPitch`
// (many sample libraries, including this one's piano, set it to a constant regardless of the
// zone's real recorded note) — the SPEC-correct root note is the zone's `OverridingRootKey`
// generator when present, falling back to originalPitch otherwise. CoarseTune/FineTune
// generators + the sample's own pitchCorrection add a small additional cents offset; rather
// than resampling PCM data (real DSP, real risk of a subtle bug), that offset is folded into
// the nearest-semitone label the sample is saved under — the same +/-50-cent approximation
// inherent to any sample player interpolating between recorded notes (this app's existing CDN
// Soundfont instruments already rely on that same interpolation between sparser recordings).
// #889 follow-up (Han 2026-08-14, "noten worden on release meteen afgesloten... zou in theorie
// een cello 10 seconden of zelfs 60s kunnen vasthouden"): loop points ARE now extracted (startLoop/
// endLoop from the sample header, seconds — `soundfont2` already un-offsets them relative to the
// sample's own data start, see its getSamples()). A note whose SF2 zone's SampleModes generator
// (id 54) is 1 (loop continuously) or 3 (loop until release) gets `loopStart`/`loopEnd` recorded
// alongside its WAV; localInstruments.js's Smplr-based playback loops that short raw segment
// natively (Web Audio `AudioBufferSourceNode.loop`) for as long as a note is held, so an arbitrarily
// long held note needs NO extra audio data — the WAV files stay exactly as short as before. A
// struck/plucked/decay instrument's zone has SampleModes 0 (no loop) and is unaffected — it plays
// through once, same as before this change.
const ALWAYS_LOOP_WHOLE_SAMPLE = new Set([
  // Han 2026-08-14: "voor saw: beschouw hele sample als loop" — this GM patch's own raw sample in
  // Han's FluidR3_GM.sf2 is inherently very short (its SampleModes may be absent/0), but it's a
  // sustained synth-lead patch by nature — loop the ENTIRE short recording rather than the (often
  // degenerate/absent) SF2 loop range, so it still sustains correctly for any held duration.
  'lead_2_sawtooth',
]);

// #889 follow-up: struck/plucked-then-decays instruments (Han's explicit list) must NEVER loop —
// looping a "hit once, rings out" timbre would create a wrong sustained drone instead of a natural
// decay. These instead get NO stop() scheduled at all (src/audio/playMelodies.js's
// LET_RING_INSTRUMENTS check, src/constants/instruments.jsx) so the short raw recording simply
// plays through to its own natural end, uncut.
//
// UAT correction (Han 2026-08-14, "vibra still missing its tail"): vibraphone was in this set
// too, but measurement showed its FluidR3_GM zones are the ONE mallet instrument that DOES carry
// real SF2 loop points (SampleModes 1/3) — unlike marimba/xylophone/koto/woodblock, which have
// none. A real vibraphone has a sustain/damper pedal (can ring indefinitely while held, exactly
// the "hold a note 60 seconds" case), so this soundfont's own author clearly intended it to LOOP,
// not decay-once — excluding it here was cutting off the very sustain mechanism the .sf2 provides.
// Moved to the loop path (removed from this set); also removed from LET_RING_INSTRUMENTS
// (constants/instruments.jsx) — a looping instrument MUST still get a real stop() scheduled at its
// notated duration, or it would ring forever (no natural end to fall back on while looping).
// Duplicated here (not imported) because this is a standalone dev-only Node script and
// instruments.jsx has JSX-adjacent tooling assumptions a plain `node scripts/...` invocation
// doesn't have — keep this list in sync with LET_RING_INSTRUMENTS by hand if either changes.
// #1093 (Han 2026-08-20, worker-NPC hit sounds): tubular_bells is a struck bell that rings out and
// decays naturally (like woodblock/marimba/xylophone above), not a sustained pad — added here so a
// held/scheduled note plays its raw recording through to its own natural end instead of looping.
const NEVER_LOOP_LOCAL = new Set(['marimba', 'xylophone', 'koto', 'woodblock', 'tubular_bells']);
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'soundfont2';
const { SoundFont2, GeneratorType } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SF2_PATH = path.join(ROOT, 'src/assets/FluidR3_GM.sf2');
const OUT_DIR = path.join(ROOT, 'public/samples/Instruments');

// Standard General MIDI Level 1 program numbers (0-indexed), for every instrument slug this
// app's picker offers (src/constants/instruments.jsx) plus 'woodblock' (the metronome default).
// This is a fixed external standard (not app-derived data) — see file header for why it's a
// table, not a formula (§6c only asks for a formula when one can substitute for a lookup table
// of app-specific values; the GM program list is an arbitrary historical standard with no
// underlying formula).
const GM_PROGRAM = {
  acoustic_grand_piano: 0,
  electric_piano_1: 4,
  church_organ: 19,
  accordion: 21,
  harmonica: 22,
  acoustic_guitar_nylon: 24,
  acoustic_guitar_steel: 25,
  electric_guitar_clean: 27,
  distortion_guitar: 30,
  acoustic_bass: 32,
  electric_bass_pick: 34,
  synth_bass_1: 38,
  violin: 40,
  viola: 41,   // #1025: water hum track ("viola - hold ad infinitum")
  cello: 42,
  contrabass: 43,
  orchestral_harp: 46,
  string_ensemble_1: 48,
  choir_aahs: 52,
  voice_oohs: 53,
  trumpet: 56,
  french_horn: 60,
  tenor_sax: 66,
  oboe: 68,
  bassoon: 70,   // #1025: bird track ("duck (bassoon)")
  clarinet: 71,
  piccolo: 72,   // #1025: bird tracks ("pigeon/cuckoo/sparrow/owl (piccolo)")
  flute: 73,
  shakuhachi: 77,
  ocarina: 79,
  lead_1_square: 80,
  lead_2_sawtooth: 81,
  pad_1_new_age: 88,
  koto: 104,
  shamisen: 106,
  glockenspiel: 9,   // #1025: water track ("water (glockenspiel)")
  tubular_bells: 14,   // #1093: worker-NPC beat-synced hit sounds (blacksmith slow/fast, town crier)
  vibraphone: 11,
  marimba: 12,
  xylophone: 13,
  woodblock: 115,
  // Not in the instrument picker — used by App.jsx's own dedicated one-off Soundfont instances
  // (level percussion/bass backing, timpaniRef/celloRef) that bypass useInstruments.js entirely.
  timpani: 47,
  // #993 rework (Han: water's 3rd env-audio layer, "op mp: applause, op c4, eindeloos") — GM Sound
  // Effects bank, "Applause" (program 126). Interim substitute for real GM percussion (#1037, blocked
  // on no percussion bank being available); Han: "applause does not need pitch" — it's only ever
  // triggered at one fixed note (C4, see useWorldAmbientMusic.js), so extracting it across the full
  // MIN_KEY-MAX_KEY range like a tuned instrument is unnecessary but harmless (the loop below already
  // dedupes by underlying sample identity, so a single-sample effect patch just yields one file).
  applause: 126,
};

// Practical playable span this app actually uses (matches the sheet-music range settings —
// wider than needed is harmless, just extracts a few unreachable extra samples).
const MIN_KEY = 24;  // C1
const MAX_KEY = 96;  // C7
const KEY_STEP = 3;  // sample spacing in semitones (matches the CDN's own recording density)

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${octave}`;
}

function getRootKeyAndCents(generators, sampleHeader) {
  const override = generators[GeneratorType.OverridingRootKey];
  const rootKey = (override && override.value != null && override.value !== -1)
    ? override.value
    : sampleHeader.originalPitch;
  const coarse = generators[GeneratorType.CoarseTune]?.value || 0;
  const fine = generators[GeneratorType.FineTune]?.value || 0;
  const totalCents = coarse * 100 + fine + (sampleHeader.pitchCorrection || 0);
  return { rootKey, totalCents };
}

function writeWav(filePath, pcm16, sampleRate) {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = pcm16.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < pcm16.length; i++) {
    buffer.writeInt16LE(pcm16[i], 44 + i * 2);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

console.log('Reading', SF2_PATH, '...');
const raw = fs.readFileSync(SF2_PATH);
console.log('Parsing SF2 (', (raw.length / 1e6).toFixed(1), 'MB )...');
const t0 = Date.now();
const sf2 = new SoundFont2(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
console.log('Parsed in', Date.now() - t0, 'ms —', sf2.presets.length, 'presets total');

const manifest = {}; // instrumentSlug -> { noteName: relativeWavPath }
let totalFiles = 0;
let missingInstruments = [];

for (const [slug, programNumber] of Object.entries(GM_PROGRAM)) {
  const preset = sf2.presets.find((p) => p.header.bank === 0 && p.header.preset === programNumber);
  if (!preset) {
    missingInstruments.push(slug);
    continue;
  }

  const buffers = {};
  const seenSamples = new Set(); // dedupe by sample header identity (start offset is unique per sample)

  for (let key = MIN_KEY; key <= MAX_KEY; key += KEY_STEP) {
    const keyData = sf2.getKeyData(key, 0, programNumber);
    if (!keyData || !keyData.sample) continue;
    const sampleId = keyData.sample.header.start; // unique per distinct sample in the file
    if (seenSamples.has(sampleId)) continue;
    seenSamples.add(sampleId);

    const { rootKey, totalCents } = getRootKeyAndCents(keyData.generators, keyData.sample.header);
    const effectiveKey = Math.round(rootKey + totalCents / 100);
    const noteName = midiToNoteName(Math.max(0, Math.min(127, effectiveKey)));

    // If two different SAMPLED zones round to the same label (rare, adjacent samples very close
    // in pitch), keep the first — later ones are redundant within ~1 semitone anyway.
    if (buffers[noteName]) continue;

    // The buffer map KEY stays a plain note name ("F#1") — smplr parses note names with a
    // literal '#' (confirmed in its own bundled examples). The FILE on disk (and therefore the
    // URL) must not contain '#' though: verified empirically that Vite's dev server public-dir
    // static serving fails to locate a '#'-containing filename regardless of percent-encoding
    // (curl'ing both raw '#' and '%23' returned the SPA's index.html fallback, not the file) —
    // '#' is ambiguous with a URL fragment separator early enough in some server-side URL
    // parsing that encoding alone doesn't fix it. 's' for sharp in the FILENAME only (e.g.
    // "Fs1.wav") is the same workaround gleitz/midi-js-soundfonts' own sample filenames use.
    const fileSafeName = noteName.replace('#', 's');
    writeWav(path.join(OUT_DIR, slug, `${fileSafeName}.wav`), keyData.sample.data, keyData.sample.header.sampleRate);

    const { header } = keyData.sample;
    const sampleModes = keyData.generators[GeneratorType.SampleModes]?.value ?? 0;
    const sfHasLoop = !NEVER_LOOP_LOCAL.has(slug)
      && (sampleModes === 1 || sampleModes === 3) && header.endLoop > header.startLoop;
    const entry = { file: fileSafeName };
    if (sfHasLoop) {
      entry.loopStart = header.startLoop / header.sampleRate;
      entry.loopEnd = header.endLoop / header.sampleRate;
    } else if (ALWAYS_LOOP_WHOLE_SAMPLE.has(slug)) {
      entry.loopStart = 0;
      entry.loopEnd = keyData.sample.data.length / header.sampleRate;
    }
    buffers[noteName] = entry;
    totalFiles++;
  }

  manifest[slug] = buffers;
  console.log(`${slug} (program ${programNumber}): ${Object.keys(buffers).length} samples`);
}

if (missingInstruments.length) {
  console.warn('\nWARNING — no GM preset found (bank 0) for:', missingInstruments.join(', '));
}

const manifestPath = path.join(ROOT, 'src/audio/localInstrumentBuffers.generated.js');
const header = `// AUTO-GENERATED by scripts/extract-soundfont-samples.mjs from src/assets/FluidR3_GM.sf2.
// Do not hand-edit — re-run the script to regenerate. See localInstruments.js for how this is consumed.
`;
const body = `export const EXTRACTED_INSTRUMENT_BUFFERS = ${JSON.stringify(manifest, null, 2)};\n`;
fs.writeFileSync(manifestPath, header + body);

console.log('\nDone.', totalFiles, 'sample files written to', OUT_DIR);
console.log('Manifest written to', manifestPath);
