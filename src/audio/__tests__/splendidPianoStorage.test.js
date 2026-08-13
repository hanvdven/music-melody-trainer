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

const okResponse = () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });

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
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
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
            expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
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

    it('passes a non-local URL straight through', async () => {
        const remote = `${SPLENDID_REMOTE_BASE_URL}/MF%20C4.ogg`;
        const fetchSpy = vi.fn(async () => okResponse());
        vi.stubGlobal('fetch', fetchSpy);

        await splendidPianoStorage.fetch(remote);

        expect(fetchSpy).toHaveBeenCalledWith(remote);
    });
});
