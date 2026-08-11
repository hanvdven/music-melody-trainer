import logger from '../utils/logger';

// #825 (Han 2026-08-10, RPG "hit" animation sfx): a lightweight one-shot SFX player for non-musical,
// non-scheduled feedback sounds (e.g. "hit on wood"). Deliberately SEPARATE from playSound.js/
// playMelodies.js (the smplr-based MELODIC note playback path, driven by pitch + Sequencer scheduling)
// — this is a plain WebAudio decode-and-play of a static sample with no pitch/timing concerns, so
// merging it into the melodic path would mix two unrelated concerns into one module.
//
// Explicit per-file imports (NOT a folder-wide import.meta.glob): src/assets/sfx/ holds ~150 unrelated
// RPG samples — an eager glob over the whole folder would drag every one of them into the production
// bundle just to use 2. Each caller-facing "sound" constant below names its own file(s) explicitly.
import hitOnWood1 from '../assets/sfx/15_Hit_on_wood_1.wav';
import hitOnWood2 from '../assets/sfx/15_Hit_on_wood_2.wav';

// Decoded once per file, cached — a hit-heavy level must not re-fetch/re-decode the same sample every hit.
const bufferCache = new Map();   // url -> Promise<AudioBuffer>

function loadBuffer(context, url) {
  if (bufferCache.has(url)) return bufferCache.get(url);
  const promise = fetch(url)
    .then((res) => res.arrayBuffer())
    .then((arrayBuffer) => context.decodeAudioData(arrayBuffer));
  bufferCache.set(url, promise);
  return promise;
}

/**
 * Plays one of `urls` (chosen at random) once, immediately, at `volume` (0-1). Fire-and-forget —
 * a missing/corrupt sfx file must never break combat, so failures are logged, not thrown.
 * @param {AudioContext} context
 * @param {string[]} urls  — imported asset URLs (see the HIT_ON_WOOD_FILES-style exports below)
 * @param {number} volume
 */
export default function playOneShotSfx(context, urls, volume = 1) {
  if (!context || !urls || urls.length === 0) return;
  const url = urls[Math.floor(Math.random() * urls.length)];
  loadBuffer(context, url).then((buffer) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(context.destination);
    source.start();
  }).catch((err) => {
    logger.error('Sfx', 'E025-ONE-SHOT-SFX-PLAY', err, { url });
  });
}

// #825 — the two "hit on wood" variants the level's hit animation picks between at random.
export const HIT_ON_WOOD_FILES = [hitOnWood1, hitOnWood2];
