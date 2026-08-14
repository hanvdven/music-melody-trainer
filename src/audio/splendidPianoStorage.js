/**
 * Sample transport for smplr's `SplendidGrandPiano` (#988).
 *
 * Why this module exists — two problems solved by ONE smplr `Storage` adapter:
 *
 * 1. **Local hosting of `#`-containing sample names.** SplendidGrandPiano's sample roster
 *    (smplr's bundled `LAYERS`) uses names like `PP D#0` / `MF C4` — spaces and sharps.
 *    #955 proved empirically (see the tail comment of scripts/extract-soundfont-samples.mjs
 *    and docs/architecture.md §224) that Vite's public-dir static serving cannot locate a
 *    `#`-containing filename, raw OR %23-encoded — both fall through to the SPA index.html.
 *    So the mirrored files on disk are sanitized (`#`→`s`, space→`_`) and this adapter
 *    rewrites every incoming request to the sanitized name. `SplendidGrandPianoConfig`
 *    exposes no `samples.map` hook, so `storage` is the only available seam.
 *
 * 2. **Shared cache across piano instances (#988 D2, Han).** The app builds several
 *    SplendidGrandPiano instances per session (UI track instruments, world-ambient,
 *    wizard-preview, conversation typewriter, instrument previews) and smplr's own buffer
 *    cache is per-`SampleLoader`, i.e. per-instance. Without a shared memo each instance
 *    would re-fetch/re-decode all 226 samples. The memo below stores the in-flight *promise*
 *    (not just the settled bytes) so instances constructed concurrently coalesce onto one
 *    request instead of racing.
 *
 * There is deliberately NO live CDN fallback (unlike the first version of this module). The
 * upstream smpldsnds CDN only serves Ogg/Opus and M4A — see the §227 bug-log entry in
 * docs/architecture.md ("piano niet hoorbaar", 2026-08-14): `decodeAudioData` produced total,
 * error-free silence for the Ogg/Opus files in real browser testing, even though the same bytes
 * decoded to full-amplitude PCM via a standalone WASM Opus decoder — the same "browser
 * decodeAudioData is unreliable for compressed formats" risk class documented one screen up in
 * localInstruments.js's own history (an earlier FLAC attempt was reverted for a hard
 * EncodingError). WAV is the format every other locally-mirrored instrument in this app already
 * uses successfully, so the piano now ONLY ships WAV, self-hosted, converted at asset-prep time
 * by `scripts/download-splendid-grand-piano.mjs` (fetch Ogg/Opus from the CDN → decode →
 * re-encode WAV, in Node, once). A missing local sample is therefore a build/asset problem to
 * fix at the source, not a live degradation path — the storage adapter still never lets a
 * fetch failure escape as a rejection (smplr's own load contract, see the NOTE below), it just
 * has nothing else to fall back to.
 *
 * Files on disk are produced by `node scripts/download-splendid-grand-piano.mjs`, which
 * imports `toLocalFileName` from THIS file so writer and reader can never drift.
 */
import logger from '../utils/logger.js';

/** Where the mirrored samples live in public/ (served at the site root by Vite). */
export const SPLENDID_LOCAL_BASE_URL = '/samples/SplendidGrandPiano';

/**
 * Sample name → disk-safe filename. `PP D#0` → `PP_Ds0`.
 * `#`→`s` is the same convention the #955 soundfont extractor already writes (`Fs1.wav`),
 * and matches gleitz/midi-js-soundfonts' own filenames.
 */
export function toLocalFileName(sampleName) {
    return sampleName.replace(/#/g, 's').replace(/ /g, '_');
}

/**
 * Shared across every SplendidGrandPiano instance in the session: local URL → Promise of the
 * WAV bytes. Values are promises so concurrent constructions coalesce; a settled entry is
 * replayed with `.slice(0)` because a Response body can only be consumed once.
 */
const sampleBytesCache = new Map();

/**
 * #988 UAT bounce ("piano niet hoorbaar"): a 200 is NOT proof the local mirror actually served
 * audio. Vite's dev server (and any SPA host) answers an unmatched path under the public dir
 * with `200 text/html` — the index.html fallback — so `res.ok` is true for a sample that does
 * not exist on disk. Verified against the running dev server: a nonexistent sample path returns
 * `200 text/html`. Only accept a local body that really is a RIFF/WAVE stream.
 */
function isWavPayload(bytes) {
    if (bytes.byteLength < 12) return false;
    const riff = new Uint8Array(bytes, 0, 4);
    const wave = new Uint8Array(bytes, 8, 4);
    const isRiff = riff[0] === 0x52 && riff[1] === 0x49 && riff[2] === 0x46 && riff[3] === 0x46; // 'RIFF'
    const isWave = wave[0] === 0x57 && wave[1] === 0x41 && wave[2] === 0x56 && wave[3] === 0x45; // 'WAVE'
    return isRiff && isWave;
}

/**
 * smplr `Storage` implementation: `{ fetch(url) => Promise<Response> }`.
 * Receives the fully-built, percent-encoded URL from smplr's `loadAudioBuffer`.
 */
export const splendidPianoStorage = {
    async fetch(url) {
        const prefix = `${SPLENDID_LOCAL_BASE_URL}/`;
        // Defensive: anything not addressed at our local mirror is passed straight through
        // (e.g. if a caller ever constructs the piano with a different baseUrl).
        if (!url.startsWith(prefix)) return fetch(url);

        // smplr encodes '#'→%23 and ' '→%20; decode back to the logical sample name so the
        // sanitizer sees exactly what the download script saw.
        const decoded = decodeURIComponent(url.slice(prefix.length));
        const dot = decoded.lastIndexOf('.');
        const sampleName = decoded.slice(0, dot);
        const ext = decoded.slice(dot + 1);
        const localUrl = `${prefix}${toLocalFileName(sampleName)}.${ext}`;

        // NOTE: no `await` on a cached promise out here. smplr's `loadAudioBuffer` (see
        // node_modules/smplr/dist/index.js — `const response = yield storage.fetch(url)`) does NOT
        // wrap `storage.fetch` in a try/catch; only the later `arrayBuffer()`/`decodeAudioData` are
        // guarded. A REJECTION escaping this method therefore rejects `SampleLoader.load`'s
        // `Promise.all`, which rejects `SplendidGrandPiano.load` — permanently. Consumers that gate
        // on that promise (useWorldAmbientMusic.js schedules its ENTIRE ambient loop inside
        // `treblePiano.load.then(...)`) would then never play a single note, silently. So every
        // path below funnels through the one try/catch at the end and always resolves to a
        // Response.
        const cached = sampleBytesCache.get(localUrl);
        if (cached) {
            try {
                return new Response((await cached).slice(0));
            } catch (err) {
                logger.error('splendidPianoStorage', 'E029-PIANO-SAMPLE-LOAD', err, { url, localUrl, viaCache: true });
                return new Response(null, { status: 404 });
            }
        }

        const bytesPromise = (async () => {
            const res = await fetch(localUrl);
            if (!res.ok) throw new Error(`local sample HTTP ${res.status}`);
            const bytes = await res.arrayBuffer();
            if (!isWavPayload(bytes)) {
                // 200 but not audio → the SPA/index.html fallback (or a wrong filename). There is
                // no live fallback for this slug (see module doc) — this is a build/asset bug.
                throw new Error(
                    `local sample returned a non-WAV 200 (${res.headers.get('content-type') || 'unknown type'}, ${bytes.byteLength} bytes) — SPA fallback or missing asset?`,
                );
            }
            return bytes;
        })();

        // Registered BEFORE the first await so instances constructed in the same tick coalesce
        // onto this one request instead of each starting their own.
        sampleBytesCache.set(localUrl, bytesPromise);
        try {
            const bytes = await bytesPromise;
            return new Response(bytes.slice(0));
        } catch (err) {
            // Log with a stable code (§7a) and hand smplr a non-200 so its own silently-omit path
            // proceeds: one missing sample degrades the piano, it must never take down the app.
            // The rejected promise is evicted so a later instance may retry.
            sampleBytesCache.delete(localUrl);
            logger.error('splendidPianoStorage', 'E029-PIANO-SAMPLE-LOAD', err, { url, localUrl });
            return new Response(null, { status: 404 });
        }
    },
};

/** Test-only escape hatch: drop the shared memo so cases don't leak into each other. */
export function __resetSplendidPianoCache() {
    sampleBytesCache.clear();
}
