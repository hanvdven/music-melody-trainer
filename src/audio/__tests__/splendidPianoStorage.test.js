// #988: the piano's sample transport — filename sanitizing, the shared cross-instance cache
// (D2) and the per-sample local→CDN fallback. The fallback cannot be tested through smplr
// itself because SampleLoader silently omits failed samples, which is exactly why it lives here.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import logger from '../../utils/logger.js';
import {
    splendidPianoStorage,
    toLocalFileName,
    __resetSplendidPianoCache,
    SPLENDID_LOCAL_BASE_URL,
    SPLENDID_REMOTE_BASE_URL,
} from '../splendidPianoStorage.js';

vi.mock('../../utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The URL smplr's loadAudioBuffer builds for "PP D#0" against the local baseUrl.
const REQUESTED_URL = `${SPLENDID_LOCAL_BASE_URL}/PP%20D%230.ogg`;
const LOCAL_URL = `${SPLENDID_LOCAL_BASE_URL}/PP_Ds0.ogg`;

// A believable local body MUST start with the Ogg container magic — the adapter rejects anything
// else (see the SPA-fallback regression test below). The old version of this file used
// `new Uint8Array([1, 2, 3])` here, which is precisely why the suite passed while the real dev
// server was free to answer with index.html.
const OGG_BYTES = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3]); // 'OggS' + payload
const okResponse = () => new Response(OGG_BYTES, { status: 200 });
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
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(OGG_BYTES);
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
            expect(new Uint8Array(await res.arrayBuffer())).toEqual(OGG_BYTES);
        }
    });

    it('falls back to the smpldsnds CDN when the local sample is missing', async () => {
        const fetchSpy = vi.fn(async (url) =>
            url.startsWith('http') ? okResponse() : new Response(null, { status: 404 }),
        );
        vi.stubGlobal('fetch', fetchSpy);

        const res = await splendidPianoStorage.fetch(REQUESTED_URL);

        expect(res.status).toBe(200);
        expect(fetchSpy).toHaveBeenNthCalledWith(1, LOCAL_URL);
        expect(fetchSpy).toHaveBeenNthCalledWith(2, `${SPLENDID_REMOTE_BASE_URL}/PP%20D%230.ogg`);
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('logs E029 and returns a non-200 when both sources fail', async () => {
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

    it('treats a non-Ogg 200 (SPA index.html fallback) as a miss and still tries the CDN', async () => {
        // THE failure mode this ticket bounced on: a dev/SPA server answers an unmatched sample
        // path with `200 text/html`. The old adapter reported that as success, so smplr fed
        // index.html to decodeAudioData, silently omitted the sample, and NEVER reached the CDN —
        // a piano that "loads" 226/226 with no errors and makes no sound.
        const fetchSpy = vi.fn(async (url) => (url.startsWith('http') ? okResponse() : spaFallbackResponse()));
        vi.stubGlobal('fetch', fetchSpy);

        const res = await splendidPianoStorage.fetch(REQUESTED_URL);

        expect(fetchSpy).toHaveBeenNthCalledWith(1, LOCAL_URL);
        expect(fetchSpy).toHaveBeenNthCalledWith(2, `${SPLENDID_REMOTE_BASE_URL}/PP%20D%230.ogg`);
        expect(res.status).toBe(200);
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(OGG_BYTES);
    });

    it('does not apply the Ogg check to the CDN response (Safari asks for .m4a)', async () => {
        const m4aUrl = `${SPLENDID_LOCAL_BASE_URL}/PP%20D%230.m4a`;
        const m4a = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]); // ftyp box, not Ogg
        const fetchSpy = vi.fn(async (url) =>
            url.startsWith('http') ? new Response(m4a, { status: 200 }) : spaFallbackResponse(),
        );
        vi.stubGlobal('fetch', fetchSpy);

        const res = await splendidPianoStorage.fetch(m4aUrl);

        expect(res.status).toBe(200);
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(m4a);
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
        const remote = `${SPLENDID_REMOTE_BASE_URL}/MF%20C4.ogg`;
        const fetchSpy = vi.fn(async () => okResponse());
        vi.stubGlobal('fetch', fetchSpy);

        await splendidPianoStorage.fetch(remote);

        expect(fetchSpy).toHaveBeenCalledWith(remote);
    });
});
