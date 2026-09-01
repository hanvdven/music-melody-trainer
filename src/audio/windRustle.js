// #wind §363 (Han 2026-09-01, "ik wil dat de wind 'uit de foliage' komt"): pure math for the
// foliage-sourced ambient wind that replaces #1091's random-triggered applause gust.
//
// The world's visible viewport is split into three equal screen-thirds (left / mid / right). Each third
// sounds a held 'applause' rustle voice, panned -0.5 / 0 / +0.5, but ONLY while that third overlaps a
// world-chunk that contains tree foliage (`buildWorld`'s `foliageChunkSet` — grass decoration excluded,
// Han: "geen gras") AND the current wind level is >= 2. On top of that a "gust" sweeps left -> mid ->
// right, 2 s per third, looping every 6 s: the third it is currently on swells (sin envelope) above a
// low base level; the other two sit at the base. A fourth voice — the "bed" — is a steady centre wash,
// not foliage-gated. Level mapping (wind level = round(weather cycle windValue), 0..3):
//   wind 3  -> rustle at full ('mp', "zelfde geluid als nu"); bed at 1/2 of that
//   wind 2  -> rustle at half; bed at 1/4
//   wind 0-1 -> silent
//
// This module is PURE and unit-tested. `useWorldAmbientMusic.js` owns the AudioNodes and calls these
// each ~120 ms to retarget the four bus gains.

import { CHUNK_PX } from './spatialPan';

// Han 2026-09-01 follow-up ("maak de oscillatie 100% trager"): doubled from 6 s / 2 s.
export const WIND_SWEEP_PERIOD_SEC = 12;  // full left -> mid -> right loop
export const WIND_SWEEP_STEP_SEC = 4;     // time the gust dwells on each third
export const WIND_BASE_LEVEL = 0.35;      // a foliage third's rustle when the gust is elsewhere
export const WIND_THIRD_PANS = [-0.5, 0, 0.5];   // left / mid / right — Han: "chunk-pan ±0.5"
// Han 2026-09-01 follow-up ("verlaag het volume van álle wind met 50%"): one master trim applied to
// every wind voice (all three rustle thirds AND the centre bed) in useWorldAmbientMusic.
export const WIND_MASTER_GAIN = 0.5;

// wind level -> overall rustle multiplier. 3 => full, 2 => half, 0-1 => silent.
export function windLevelMult(windLevel) {
    if (windLevel >= 3) return 1;
    if (windLevel >= 2) return 0.5;
    return 0;
}

// wind level -> the centre "bed" wash as a fraction of the rustle peak. Han: "half volume (3) of een
// kwart volume (2)".
export function bedFraction(windLevel) {
    if (windLevel >= 3) return 0.5;
    if (windLevel >= 2) return 0.25;
    return 0;
}

// The left->right gust at wall-clock time `tSeconds`: which third is swelling (0/1/2) and by how much
// (0 at the edges of its 2 s window, 1 at the middle).
export function sweepState(tSeconds) {
    const t = ((tSeconds % WIND_SWEEP_PERIOD_SEC) + WIND_SWEEP_PERIOD_SEC) % WIND_SWEEP_PERIOD_SEC;
    const activeThird = Math.min(2, Math.floor(t / WIND_SWEEP_STEP_SEC));
    const localT = (t % WIND_SWEEP_STEP_SEC) / WIND_SWEEP_STEP_SEC;
    return { activeThird, swell: Math.sin(Math.PI * localT) };
}

// Per-third rustle levels (0..1, before the peak-gain scaling `useWorldAmbientMusic` applies).
// `foliageByThird` is a 3-tuple of booleans. A third with no foliage is always 0, even under the gust.
export function rustleLevels(windLevel, foliageByThird, tSeconds) {
    const mult = windLevelMult(windLevel);
    if (mult === 0) return [0, 0, 0];
    const { activeThird, swell } = sweepState(tSeconds);
    return [0, 1, 2].map((k) => {
        if (!foliageByThird[k]) return 0;
        const level = k === activeThird
            ? WIND_BASE_LEVEL + (1 - WIND_BASE_LEVEL) * swell
            : WIND_BASE_LEVEL;
        return mult * level;
    });
}

// World-X span [left, right) of screen-third `k` (0/1/2), given the camera centre and how many world px
// the viewport shows.
export function thirdWorldSpan(cameraX, viewportWorldWidth, k) {
    const left = cameraX - viewportWorldWidth / 2 + (k * viewportWorldWidth) / 3;
    return [left, left + viewportWorldWidth / 3];
}

// Does screen-third `k` currently overlap any tree-foliage world-chunk?
export function thirdHasFoliage(foliageChunkSet, cameraX, viewportWorldWidth, k) {
    if (!foliageChunkSet || foliageChunkSet.size === 0 || !viewportWorldWidth) return false;
    const [l, r] = thirdWorldSpan(cameraX, viewportWorldWidth, k);
    for (let c = Math.floor(l / CHUNK_PX); c <= Math.floor(r / CHUNK_PX); c++) {
        if (foliageChunkSet.has(c)) return true;
    }
    return false;
}
