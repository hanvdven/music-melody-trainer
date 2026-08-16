import { describe, it, expect } from 'vitest';
import { computeSpatialPanVolume, CHUNK_PX, AUDIBLE_CHUNKS } from '../spatialPan';

// #925 round 2 (Han 2026-08-17, "Definieer de audio thans in chunks, niet in beeldlengtes... doe dan maar
// gewone stereo pan + volume, als dat simpeler is"): the shared world-distance pan/volume formula every
// env-audio voice (birds, water) uses.
describe('computeSpatialPanVolume', () => {
    it('is centered (pan 0) and full volume at the source\'s own location', () => {
        const { pan, gain } = computeSpatialPanVolume(500, 500);
        expect(pan).toBe(0);
        expect(gain).toBe(1);
    });

    it('reaches full pan and zero gain at AUDIBLE_CHUNKS away', () => {
        const edge = AUDIBLE_CHUNKS * CHUNK_PX;
        const right = computeSpatialPanVolume(500 + edge, 500);
        expect(right.pan).toBeCloseTo(1, 5);
        expect(right.gain).toBeCloseTo(0, 5);
        const left = computeSpatialPanVolume(500 - edge, 500);
        expect(left.pan).toBeCloseTo(-1, 5);
        expect(left.gain).toBeCloseTo(0, 5);
    });

    it('is silent (clamped) beyond AUDIBLE_CHUNKS', () => {
        const farBeyond = computeSpatialPanVolume(500 + AUDIBLE_CHUNKS * CHUNK_PX * 3, 500);
        expect(farBeyond.gain).toBe(0);
        expect(Math.abs(farBeyond.pan)).toBeLessThanOrEqual(1);
    });

    it('is symmetric for left vs right', () => {
        const right = computeSpatialPanVolume(500 + CHUNK_PX, 500);
        const left = computeSpatialPanVolume(500 - CHUNK_PX, 500);
        expect(right.pan).toBeCloseTo(-left.pan, 5);
        expect(right.gain).toBeCloseTo(left.gain, 5);
    });
});
