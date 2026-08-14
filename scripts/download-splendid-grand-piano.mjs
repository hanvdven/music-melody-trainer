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
// BUG (fixed same day, 2nd "piano niet hoorbaar" UAT bounce): an earlier version of this
// downsample step called `wav.toBitDepth('32f')` before `wav.toSampleRate(...)`, expecting to
// need float samples for the resampler. `getSamples()` ALREADY returns properly-normalized
// Float64Array values regardless of the underlying stored bit depth — `toBitDepth('32f')`
// re-normalized them a SECOND time, dividing every sample by 32768 again and crushing the
// amplitude to near-silence (maxAbs ~0.0002, verified in-browser: `decodeAudioData` succeeded
// with zero errors, `RegionMatcher` found correct sample matches, `start()` never threw — the
// WAV file was simply, silently, 32768x too quiet). Root-caused with an isolated
// piano-debug-test.html page that fetched+decoded a sample directly, bypassing the whole app and
// smplr's Voice internals, and logged the decoded buffer's peak amplitude at each pipeline step.
// Fix: skip `toBitDepth('32f')` entirely — `toSampleRate()` handles bit-depth-aware sample
// extraction correctly on its own. NEVER re-add a `toBitDepth('32f')` call before resampling.
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
const CONCURRENCY = 8; // lower than the old ogg-only run: each worker also runs a WASM decode.

// PPP and PP share the same "PP *" recordings, so the flattened roster has duplicates.
const names = [...new Set(LAYERS.flatMap((layer) => layer.samples.map(([, sample]) => sample)))];
console.log(`${names.length} unique samples across ${LAYERS.length} velocity layers.`);

fs.mkdirSync(OUT_DIR, { recursive: true });

let converted = 0;
let skipped = 0;
let totalBytes = 0;
const failures = [];

const TARGET_SAMPLE_RATE = 32000; // matches the FluidR3 local-sample convention (§224)

function maxAbs(samples) {
    let m = 0;
    for (const v of samples) { const a = Math.abs(v); if (a > m) m = a; }
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
    const res = await fetch(`${SOURCE_BASE}/${encoded}`);
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

    const wav = new WaveFile();
    wav.fromScratch(channelData.length, sampleRate, '16', channelData);
    // DO NOT call wav.toBitDepth('32f') here — see the bug note at the top of this file.
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

    // Guard against a repeat of the amplitude-crushing bug: any genuinely silent/near-silent
    // output here means the pipeline broke again, not that the source recording is quiet.
    const amp = maxAbs(mono);
    if (amp < 0.05) {
        failures.push(`${name}: suspiciously quiet after resample/downmix (maxAbs=${amp}) — pipeline bug, not a quiet recording`);
        return;
    }

    const out = new WaveFile();
    out.fromScratch(1, TARGET_SAMPLE_RATE, '16', mono);
    const buf = out.toBuffer();
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
