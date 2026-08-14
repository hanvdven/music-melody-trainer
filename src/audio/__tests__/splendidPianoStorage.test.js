// #988: the piano's sample transport — filename sanitizing and the shared cross-instance cache
// (D2). There is deliberately no CDN fallback (the CDN has no WAV — see splendidPianoStorage.js's
// doc comment and docs/architecture.md §227's "piano niet hoorbaar" bug log): a missing local
// sample is a build/asset problem, not a live degradation path.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import logger from '../../utils/logger.js';
import {
    splendidPianoStorage,
    toLocalFileName,
    __resetSplendidPianoCache,
    SPLENDID_LOCAL_BASE_URL,
} from '../splendidPianoStorage.js';

vi.mock('../../utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The URL smplr's loadAudioBuffer builds for "PP D#0" against the local baseUrl.
const REQUESTED_URL = `${SPLENDID_LOCAL_BASE_URL}/PP%20D%230.wav`;
const LOCAL_URL = `${SPLENDID_LOCAL_BASE_URL}/PP_Ds0.wav`;

// A believable local body MUST start with the RIFF/WAVE container magic — the adapter rejects
// anything else (see the SPA-fallback regression test below). Using arbitrary bytes here is
// precisely why the suite passed while the real dev server was free to answer with index.html.
const WAV_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 1, 2, 3]); // 'RIFF'+size+'WAVE'+payload
const okResponse = () => new Response(WAV_BYTES, { status: 200 });
// What Vite's dev server actually returns for an unmatched path under the public dir: a 200 with
// the SPA's index.html. Verified against the running dev server for a non-existent sample name.
const spaFallbackResponse = () =>
    new Response('<!doctype html><html><body>app</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
    });

beforeEach(() => {
    __resetSplendidPianoCache();
    vi.clearAllMocks();
});

describe('toLocalFileName', () => {
    it('replaces sharps with s and spaces with underscores', () => {
        expect(toLocalFileName('PP D#0')).toBe('PP_Ds0');
        expect(toLocalFileName('MF C4')).toBe('MF_C4');
    });

    it('leaves an already-safe name untouched', () => {
        expect(toLocalFileName('C4')).toBe('C4');
    });
});

describe('splendidPianoStorage.fetch', () => {
    it('rewrites the request to the sanitized local filename', async () => {
        const fetchSpy = vi.fn(async () => okResponse());
        vi.stubGlobal('fetch', fetchSpy);

        const res = await splendidPianoStorage.fetch(REQUESTED_URL);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy).toHaveBeenCalledWith(LOCAL_URL);
        expect(res.status).toBe(200);
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(WAV_BYTES);
    });

    it('serves a repeat request from the shared cache (one network call for many instances)', async () => {
        const fetchSpy = vi.fn(async () => okResponse());
        vi.stubGlobal('fetch', fetchSpy);

        const [a, b] = await Promise.all([
            splendidPianoStorage.fetch(REQUESTED_URL),
            splendidPianoStorage.fetch(REQUESTED_URL),
        ]);
        const c = await splendidPianoStorage.fetch(REQUESTED_URL);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        // Each caller must get its own consumable body.
        for (const res of [a, b, c]) {
            expect(new Uint8Array(await res.arrayBuffer())).toEqual(WAV_BYTES);
        }
    });

    it('logs E029 and returns a non-200 when the local fetch fails', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })));

        const res = await splendidPianoStorage.fetch(REQUESTED_URL);

        expect(res.status).toBe(404);
        expect(logger.error).toHaveBeenCalledWith(
            'splendidPianoStorage',
            'E029-PIANO-SAMPLE-LOAD',
            expect.any(Error),
            expect.objectContaining({ localUrl: LOCAL_URL }),
        );
    });

    // ---- #988 UAT bounce ("piano niet hoorbaar") regressions -------------------------------

    it('treats a non-WAV 200 (SPA index.html fallback) as a failure, not a silent success', async () => {
        // THE failure mode this ticket bounced on (first with Ogg, now guarded for WAV too): a
        // dev/SPA server answers an unmatched sample path with `200 text/html`. Accepting that as
        // success would feed HTML to decodeAudioData and silently omit the sample.
        vi.stubGlobal('fetch', vi.fn(async () => spaFallbackResponse()));

        const res = await splendidPianoStorage.fetch(REQUESTED_URL);

        expect(res.status).toBe(404);
        expect(logger.error).toHaveBeenCalledWith(
            'splendidPianoStorage',
            'E029-PIANO-SAMPLE-LOAD',
            expect.any(Error),
            expect.objectContaining({ localUrl: LOCAL_URL }),
        );
    });

    it('never rejects — a failed shared-cache entry resolves to a 404 for a concurrent instance', async () => {
        // smplr's loadAudioBuffer does NOT try/catch `storage.fetch`, so a rejection here would
        // reject SampleLoader.load's Promise.all and therefore `piano.load` — permanently.
        // useWorldAmbientMusic schedules its whole loop inside `treblePiano.load.then(...)`, so
        // that instance would never play a note. useInstruments builds two piano instances in the
        // SAME tick, so both can be awaiting one memoized (here: failing) request.
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));

        const results = await Promise.allSettled([
            splendidPianoStorage.fetch(REQUESTED_URL),
            splendidPianoStorage.fetch(REQUESTED_URL),
        ]);

        expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
        expect(results.map((r) => r.value.status)).toEqual([404, 404]);
        expect(logger.error).toHaveBeenCalledWith(
            'splendidPianoStorage',
            'E029-PIANO-SAMPLE-LOAD',
            expect.any(Error),
            expect.objectContaining({ localUrl: LOCAL_URL }),
        );
    });

    it('passes a non-local URL straight through', async () => {
        const remote = 'https://example.com/other/MF%20C4.wav';
        const fetchSpy = vi.fn(async () => okResponse());
        vi.stubGlobal('fetch', fetchSpy);

        await splendidPianoStorage.fetch(remote);

        expect(fetchSpy).toHaveBeenCalledWith(remote);
    });
});
