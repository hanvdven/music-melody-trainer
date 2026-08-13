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
// Format: .ogg only (Han's D1 decision, ~19 MB / 226 files). Safari skips ogg and requests
// .m4a; splendidPianoStorage transparently serves those from the CDN instead.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LAYERS } from 'smplr';
import { toLocalFileName } from '../src/audio/splendidPianoStorage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public/samples/SplendidGrandPiano');
const SOURCE_BASE = 'https://smpldsnds.github.io/sfzinstruments-splendid-grand-piano/samples';
const FORMAT = 'ogg';
const CONCURRENCY = 16;

// PPP and PP share the same "PP *" recordings, so the flattened roster has duplicates.
const names = [...new Set(LAYERS.flatMap((layer) => layer.samples.map(([, sample]) => sample)))];
console.log(`${names.length} unique samples across ${LAYERS.length} velocity layers.`);

fs.mkdirSync(OUT_DIR, { recursive: true });

let downloaded = 0;
let skipped = 0;
let totalBytes = 0;
const failures = [];

async function fetchOne(name) {
    const outPath = path.join(OUT_DIR, `${toLocalFileName(name)}.${FORMAT}`);
    if (fs.existsSync(outPath)) {
        // Idempotent re-run: never re-download what is already on disk.
        skipped++;
        totalBytes += fs.statSync(outPath).size;
        return;
    }
    // smplr's own encoding rules for these names (loadAudioBuffer in smplr/dist/index.js).
    const encoded = `${name}.${FORMAT}`.replace(/#/g, '%23').replace(/ /g, '%20');
    const res = await fetch(`${SOURCE_BASE}/${encoded}`);
    if (!res.ok) {
        failures.push(`${name}: HTTP ${res.status}`);
        return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    downloaded++;
    totalBytes += buf.length;
}

// Small fixed-size worker pool — 226 parallel requests would be rude to a GitHub Pages host.
const queue = [...names];
await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) {
            await fetchOne(queue.pop());
        }
    }),
);

if (failures.length) {
    console.warn(`\nWARNING — ${failures.length} sample(s) failed:\n  ${failures.join('\n  ')}`);
}
console.log(
    `\nDone. ${downloaded} downloaded, ${skipped} already present, ` +
        `${(totalBytes / 1024 / 1024).toFixed(1)} MB total in ${OUT_DIR}`,
);
