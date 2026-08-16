// #925 round 2 (Han 2026-08-17, "Definieer de audio thans in chunks, niet in beeldlengtes. Een chunk is
// 256 pixels" — then, after seeing the dual-channel-gain version this first implied: "doe dan maar gewone
// stereo pan + volume, als dat simpeler is"): a plain StereoPannerNode `pan` (-1..1) plus a separate
// overall `gain` (0..1), both driven by the SAME world-space (game px, not screen px) chunk-distance from
// listener to source — "in view" and "far away" fall out of one distance formula instead of two
// separately-branching screen-based cases (round 1's approach).
//
// gain: 1.0 at the source's own location (u=0), linearly down to 0.0 at AUDIBLE_CHUNKS away — "3 chunks
// afstand: onhoorbaar".
// pan: 0 (centered) at the source's own location, growing to full ±1 by AUDIBLE_CHUNKS — the SIGN says
// which side the source is on; since gain has already reached 0 by then, the exact pan value out at the
// audible edge doesn't really matter, only the ramp in the 0..1-chunk range where it's still audible.
export const CHUNK_PX = 256;
export const AUDIBLE_CHUNKS = 3;

export function computeSpatialPanVolume(sourceX, listenerX) {
    const u = Math.abs(sourceX - listenerX) / CHUNK_PX;
    const gain = Math.max(0, Math.min(1, 1 - u / AUDIBLE_CHUNKS));
    const sign = sourceX >= listenerX ? 1 : -1;
    const pan = sign * Math.max(0, Math.min(1, u / AUDIBLE_CHUNKS));
    return { pan, gain };
}
