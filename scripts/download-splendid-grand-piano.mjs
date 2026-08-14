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
    const buf = wav.toBuffer();
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
