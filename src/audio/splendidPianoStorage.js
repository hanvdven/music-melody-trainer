/**
 * Sample transport for smplr's `SplendidGrandPiano` (#988).
 *
 * Why this module exists — three problems solved by ONE smplr `Storage` adapter:
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
 * 2. **Graceful per-sample CDN fallback.** smplr's `SampleLoader.load` *silently omits*
 *    failed samples (its own doc comment) and `loadAudioBuffer` returns undefined after a
 *    console.warn on a non-200 — so a `try/catch` around the constructor or a `.load.catch()`
 *    would NEVER fire; the failure mode would be a silently-partial piano. The fallback must
 *    therefore live per-request, here, retrying the original smpldsnds CDN.
 *
 * 3. **Shared cache across piano instances (#988 D2, Han).** The app builds several
 *    SplendidGrandPiano instances per session (UI track instruments, world-ambient,
 *    wizard-preview, conversation typewriter, instrument previews) and smplr's own buffer
 *    cache is per-`SampleLoader`, i.e. per-instance. Without a shared memo each instance
 *    would re-fetch all 226 samples. The memo below stores the in-flight *promise* (not just
 *    the settled bytes) so instances constructed concurrently coalesce onto one network
 *    request instead of racing.
 *
 * Files on disk are produced by `node scripts/download-splendid-grand-piano.mjs`, which
 * imports `toLocalFileName` from THIS file so writer and reader can never drift.
 */
import logger from '../utils/logger.js';

/** Where the mirrored samples live in public/ (served at the site root by Vite). */
export const SPLENDID_LOCAL_BASE_URL = '/samples/SplendidGrandPiano';

/** smplr's own default baseUrl — the upstream source we mirror from and fall back to. */
export const SPLENDID_REMOTE_BASE_URL =
    'https://smpldsnds.github.io/sfzinstruments-splendid-grand-piano/samples';

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
 * encoded (still compressed, ~19 MB total) sample bytes. Values are promises so concurrent
 * constructions coalesce; a settled entry is replayed with `.slice(0)` because a Response body
 * can only be consumed once.
 */
const sampleBytesCache = new Map();

// One warning per session is enough — a cold CDN fallback would otherwise log 226 times.
let remoteFallbackLogged = false;

/** Rebuild the upstream CDN URL for a sample, with smplr's own percent-encoding rules. */
function toRemoteUrl(sampleName, ext) {
    const encoded = `${sampleName}.${ext}`.replace(/#/g, '%23').replace(/ /g, '%20');
    return `${SPLENDID_REMOTE_BASE_URL}/${encoded}`;
}

/**
 * smplr `Storage` implementation: `{ fetch(url) => Promise<Response> }`.
 * Receives the fully-built, percent-encoded URL from smplr's `loadAudioBuffer`.
 */
export const splendidPianoStorage = {
    async fetch(url) {
        const prefix = `${SPLENDID_LOCAL_BASE_URL}/`;
        // Defensive: anything not addressed at our local mirror is passed straight through
        // (e.g. if a caller ever constructs the piano with the remote baseUrl).
        if (!url.startsWith(prefix)) return fetch(url);

        // smplr encodes '#'→%23 and ' '→%20; decode back to the logical sample name so the
        // sanitizer sees exactly what the download script saw.
        const decoded = decodeURIComponent(url.slice(prefix.length));
        const dot = decoded.lastIndexOf('.');
        const sampleName = decoded.slice(0, dot);
        const ext = decoded.slice(dot + 1);
        const localUrl = `${prefix}${toLocalFileName(sampleName)}.${ext}`;

        const cached = sampleBytesCache.get(localUrl);
        if (cached) return new Response((await cached).slice(0));

        const bytesPromise = (async () => {
            let localFailure;
            try {
                const res = await fetch(localUrl);
                if (res.ok) return await res.arrayBuffer();
                localFailure = new Error(`local sample HTTP ${res.status}`);
            } catch (err) {
                localFailure = err;
            }

            // Local miss → transparently serve from the original CDN. This is also the normal
            // path on Safari, which skips ogg and asks for .m4a (not mirrored locally).
            if (!remoteFallbackLogged) {
                remoteFallbackLogged = true;
                logger.warn(
                    'splendidPianoStorage',
                    'local piano sample unavailable — falling back to the smpldsnds CDN for this session',
                    { localUrl, reason: String(localFailure) },
                );
            }
            const remoteUrl = toRemoteUrl(sampleName, ext);
            const remote = await fetch(remoteUrl);
            if (!remote.ok) {
                throw new Error(`remote sample HTTP ${remote.status} (${remoteUrl})`);
            }
            return await remote.arrayBuffer();
        })();

        // Registered BEFORE the first await so instances constructed in the same tick coalesce
        // onto this one request instead of each starting their own.
        sampleBytesCache.set(localUrl, bytesPromise);
        try {
            const bytes = await bytesPromise;
            return new Response(bytes.slice(0));
        } catch (err) {
            // Both sources failed. Log with a stable code (§7a) and hand smplr a non-200 so its
            // own silently-omit path proceeds: one missing velocity sample degrades the piano,
            // it must never take down the app. The rejected promise is evicted so a later
            // instance may retry (e.g. after the network comes back).
            sampleBytesCache.delete(localUrl);
            logger.error('splendidPianoStorage', 'E029-PIANO-SAMPLE-LOAD', err, { url, localUrl });
            return new Response(null, { status: 404 });
        }
    },
};

/** Test-only escape hatch: drop the shared memo so cases don't leak into each other. */
export function __resetSplendidPianoCache() {
    sampleBytesCache.clear();
    remoteFallbackLogged = false;
}
