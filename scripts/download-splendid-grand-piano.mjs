// #988 (Han 2026-08-14): one-time mirror of smplr's SplendidGrandPiano samples into
// public/samples/SplendidGrandPiano/, so the app's default piano plays offline instead of
// hitting smpldsnds.github.io on every boot. Dev-only — not part of the app bundle/runtime,
// and deliberately NOT wired into package.json scripts (same as its sibling
// scripts/extract-soundfont-samples.mjs). Run manually:
//
//     node scripts/download-splendid-grand-piano.mjs
//
// Re-run it after upgrading smplr: the file roster is derived from smplr's OWN bundled
// `LAYERS` array (the same data `pianoToSmplrJson` builds its descriptor from) rather than a
// hand-typed list (CLAUDE.md §6c) — there is no remote manifest to mirror, the descriptor is
// built in-process, so the audio files are the only thing worth copying.
//
// Filenames are sanitized through `toLocalFileName` (imported from the runtime module that
// READS them, so writer and reader can never drift): sample names contain spaces and sharps
// (`PP D#0`), and #955 proved Vite's public-dir static serving cannot locate a `#`-containing
// filename, raw or %23-encoded — both fall through to the SPA index.html. See
// docs/architecture.md §224 and §227.
//
// Format: WAV, not the CDN's native Ogg/Opus (Han's UAT bounce, 2026-08-14 — see the §227 bug
// log). `decodeAudioData` silently produced NO audible output for these Ogg/Opus files in real
// browser testing despite the files themselves containing genuine, correctly-decodable audio
// (verified: decoding the same bytes with a standalone WASM Opus decoder yields full-amplitude
// PCM). This mirrors #955's own documented history one line up in localInstruments.js — an
// earlier FLAC attempt was reverted for a hard EncodingError; this is the same "browser
// decodeAudioData is unreliable for compressed formats" risk class, just failing silently
// instead of throwing. WAV is the format every other locally-mirrored instrument in this app
// already uses successfully, and `audio.canPlayType('audio/wav')` is unconditionally
// "probably" in every evergreen browser — no Safari-specific fallback format needed either.
// This script fetches the Ogg/Opus bytes from the CDN and decodes+re-encodes them to WAV
// in-process (via `ogg-opus-decoder` + `wavefile`, both devDependencies) — .ogg is never
// written to disk.
//
// Mono, 32kHz (Han's size-vs-quality call, 2026-08-14): the decoded source is 48kHz stereo; a
// straight re-encode at that rate is 269MB for 226 samples, downsampled+downmixed to 90MB —
// matching the rate/channel convention every other locally-mirrored instrument already uses.
//
// BUG, root-caused across TWO rounds (3rd and 4th "piano niet hoorbaar" UAT bounces, same day) —
// the REAL root cause, confirmed by reading raw int16 bytes straight out of the written .wav
// file (NOT via wavefile's own `getSamples()`, which turned out to misreport the true stored
// values and is what sent the first round of debugging down the wrong path):
//
//   `WaveFile.fromScratch(channels, rate, '16', samples)` takes `samples` LITERALLY for an
//   integer bit depth — it expects raw int16-range values (-32768..32767), NOT normalized
//   -1..1 floats. Every version of this script (and every manual fix attempt) fed it
//   normalized floats straight from the Opus decoder / `getSamples()`, which get silently
//   truncated to ~0 (a value like 0.9 becomes the literal integer 1). The resulting .wav files
//   were valid, correctly-headed, and decoded without error in the browser — the actual stored
//   audio was just genuinely near-silent garbage. `getSamples()` called on such a file
//   afterwards STILL reported a misleadingly plausible ~1.0 in some code paths, which is why an
//   earlier fix attempt (blaming a stray `toBitDepth('32f')` call) looked verified but wasn't:
//   that earlier "fix" removed a step that was innocent — the corruption had already happened
//   one line above it, at the `fromScratch(..., '16', ...)` call itself.
//
// THE FIX: only ever construct/manipulate samples in **float** representation (`'32f'`, which
// correctly expects normalized -1..1 input) through decode, resample, and downmix. Convert to
// 16-bit ONLY via `wav.toBitDepth('16')` at the very end — that is a real bit-depth CONVERTER
// that does the -1..1 → int16 scaling correctly, unlike `fromScratch` with an integer depth.
// Verification for this pipeline must read the RAW BYTES of the written file directly
// (`buffer.readInt16LE`) — never trust `getSamples()` as a proxy for what was actually written.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LAYERS } from 'smplr';
import { OggOpusDecoder } from 'ogg-opus-decoder';
import wavefilePkg from 'wavefile';
import { toLocalFileName } from '../src/audio/splendidPianoStorage.js';

const { WaveFile } = wavefilePkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public/samples/SplendidGrandPiano');
const SOURCE_BASE = 'https://smpldsnds.github.io/sfzinstruments-splendid-grand-piano/samples';
const SOURCE_FORMAT = 'ogg'; // CDN source format we decode FROM — never written to disk.
const OUT_FORMAT = 'wav'; // local format we actually serve.
const CONCURRENCY = 4; // lower than the old ogg-only run: each worker also runs a WASM decode,
// and the CDN connection has shown transient failures at higher concurrency — re-run the script
// (idempotent) if it reports failures rather than raising this back up.

// PPP and PP share the same "PP *" recordings, so the flattened roster has duplicates.
const names = [...new Set(LAYERS.flatMap((layer) => layer.samples.map(([, sample]) => sample)))];
console.log(`${names.length} unique samples across ${LAYERS.length} velocity layers.`);

fs.mkdirSync(OUT_DIR, { recursive: true });

let converted = 0;
let skipped = 0;
let totalBytes = 0;
const failures = [];

const TARGET_SAMPLE_RATE = 32000; // matches the FluidR3 local-sample convention (§224)
const WAV_HEADER_BYTES = 44; // standard size for a simple PCM RIFF/WAVE header (no extra chunks)

// Reads the RAW int16 samples straight out of the written file's bytes — the only trustworthy
// way to check what was actually persisted (see the bug note above: `getSamples()` misreported
// the true stored values and is why the underlying bug went undetected for two "fixes").
function rawInt16MaxAbs(buf) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let m = 0;
    for (let i = WAV_HEADER_BYTES; i < buf.length - 1; i += 2) {
        const s = Math.abs(view.getInt16(i, true));
        if (s > m) m = s;
    }
    return m;
}

async function fetchAndConvertOne(name) {
    const outPath = path.join(OUT_DIR, `${toLocalFileName(name)}.${OUT_FORMAT}`);
    if (fs.existsSync(outPath)) {
        // Idempotent re-run: never re-fetch/re-decode what is already on disk.
        skipped++;
        totalBytes += fs.statSync(outPath).size;
        return;
    }
    // smplr's own encoding rules for these names (loadAudioBuffer in smplr/dist/index.js).
    const encoded = `${name}.${SOURCE_FORMAT}`.replace(/#/g, '%23').replace(/ /g, '%20');
    let res;
    try {
        res = await fetch(`${SOURCE_BASE}/${encoded}`);
    } catch (err) {
        // Transient connectivity blip to the CDN — do not crash the whole batch, just this one.
        failures.push(`${name}: fetch error (${err.message})`);
        return;
    }
    if (!res.ok) {
        failures.push(`${name}: HTTP ${res.status}`);
        return;
    }
    const oggBytes = new Uint8Array(await res.arrayBuffer());

    const decoder = new OggOpusDecoder();
    await decoder.ready;
    const { channelData, sampleRate, samplesDecoded } = await decoder.decodeFile(oggBytes);
    decoder.free();
    if (!samplesDecoded) {
        failures.push(`${name}: decoded to 0 samples`);
        return;
    }

    // Stay in FLOAT ('32f') representation through decode/resample/downmix — '32f' is the only
    // depth where fromScratch's input semantics (normalized -1..1) match what the Opus decoder
    // and getSamples() actually hand back. See the bug note at the top of this file.
    const wav = new WaveFile();
    wav.fromScratch(channelData.length, sampleRate, '32f', channelData);
    wav.toSampleRate(TARGET_SAMPLE_RATE, { method: 'sinc' });

    const numChannels = wav.fmt.numChannels;
    const samples = wav.getSamples();
    const mono = numChannels > 1
        ? Float64Array.from({ length: samples[0].length }, (_, i) => {
            let sum = 0;
            for (let c = 0; c < numChannels; c++) sum += samples[c][i];
            return sum / numChannels;
        })
        : (samples[0] ?? samples);

    const out = new WaveFile();
    out.fromScratch(1, TARGET_SAMPLE_RATE, '32f', mono);
    out.toBitDepth('16'); // the only correct way to reach int16 — a real scaling conversion.
    const buf = out.toBuffer();

    // Guard against a repeat of this bug class: verify the RAW BYTES actually written, not any
    // wavefile API's report of what it thinks it wrote.
    const amp = rawInt16MaxAbs(buf);
    if (amp < 1500) { // ~0.045 of full scale — real piano recordings peak far louder than this
        failures.push(`${name}: suspiciously quiet raw bytes after write (maxAbs=${amp}/32767) — pipeline bug, not a quiet recording`);
        return;
    }

    fs.writeFileSync(outPath, buf);
    converted++;
    totalBytes += buf.length;
}

// Small fixed-size worker pool — 226 parallel requests would be rude to a GitHub Pages host,
// and each worker also spins up a WASM decoder instance.
const queue = [...names];
await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) {
            await fetchAndConvertOne(queue.pop());
        }
    }),
);

if (failures.length) {
    console.warn(`\nWARNING — ${failures.length} sample(s) failed:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
}
console.log(
    `\nDone. ${converted} converted, ${skipped} already present, ` +
        `${(totalBytes / 1024 / 1024).toFixed(1)} MB total in ${OUT_DIR}`,
);
