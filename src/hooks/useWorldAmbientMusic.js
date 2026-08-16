import { useEffect, useRef } from 'react';
import playMelodies from '../audio/playMelodies';
import { createMelodicInstrument } from '../audio/localInstruments';
import { secondsPerTick } from '../constants/timing';
import { nextMeasureStartTime } from '../audio/worldClock';
import { MF_VOLUME } from '../audio/dynamics';
import { computeSpatialPan } from '../audio/spatialPan';
import {
    generateWorldAmbientBlock, WORLD_AMBIENT_BPM, WORLD_AMBIENT_TIME_SIGNATURE, WORLD_AMBIENT_NUM_MEASURES,
} from '../generation/generateWorldAmbientBlock';
import { BIRD_SONG_LAYERS } from '../model/birdSoundsManifest.generated';

// #925 follow-up (Han 2026-08-16, "als POC: enkel bird sounds wanneer bird in beeld... water is speciaal:
// waar de birds 'random' instarten, moet water steeds actief zijn... Graag stereo"): same viewport-margin
// convention `RpgLevelPanel.jsx`'s own `cullToViewport`/`cullTilesToViewport` already use for "is this
// on screen" — a bird only gets a voice once its live worldX projects inside the viewport (+ margin).
const VISIBILITY_MARGIN_PX = 200;
// How far beyond the viewport edge water is still audible at all (native/game px) before its voice is
// unloaded entirely (Han: "mag water unloaden als de afstand zo groot is dat het volume 0 is").
const WATER_MAX_OFFSCREEN_PX = 1200;
const WATER_NOTE = 'C2';   // #925: "de water cello is gewoon een hele lange noot, dus zonder release"
const WATER_GAIN = 0.5 * MF_VOLUME;
const WATER_RECONCILE_MS = 200;   // pan/gain update cadence — smooth enough for a slow-moving camera, cheap
const BIRD_RECONCILE_MS = 500;    // visibility check cadence — birds don't need frame-perfect pan updates

// #924 (Han 2026-08-12): the open-world RPG-level tab's ambient background audio — quiet generated
// piano music, plus a handful of independently-triggered "bird song" layers (pre-authored MIDI material,
// played on shakuhachi). Both only run while `active` (Han: "alleen de open-wereld RPG-level tab"), and
// BOTH are anchored to the SAME world clock (`worldClock.js`'s `nextMeasureStartTime`/`WORLD_BPM`) — Han,
// round 2: "de vogel-midi lijkt totaal niet afgestemd op de metronoom. start altijd op het begin van een
// maat"; round 4: "alles op een klok geldt ook voor de tekst, en de toggleable wereldmetronoom" — this is
// the ONE clock/tempo every RPG-layer audio system reads from now (see useConversationDialogue.js and
// useDebugMetronome.js's matching fixes).
// #924 round 6 (Han: "maak alle muziek, en ook de tekst mf"): both the generated piano music and the bird
// layers now scale to the SAME shared MF_VOLUME (src/audio/dynamics.js) — applied by scaling each Melody's
// `.volumes` array directly (see scheduleNextBlock/triggerOnce below). MelodyGenerator always populates
// `.volumes`, and playMelodies.js reads gain from THAT array whenever it exists, silently ignoring
// `melody.gain`/`trackGains` overrides (an earlier `.gain`-only attempt was a silent no-op for generated
// melodies for exactly this reason). Bird layers now carry their OWN `.volumes` too (the source MIDI's real
// velocities, scripts/generate-bird-sounds.mjs, "gebruik gewoon de velocities") — MF_VOLUME multiplies on
// top of that per-note velocity, it doesn't replace it.
const BIRD_MIN_SILENCE_SEC = 5;
const BIRD_MAX_SILENCE_SEC = 30;
// #925 follow-up: MAX_CONCURRENT_BIRD_LAYERS (a fixed abstract slot count, unrelated to any real bird)
// is gone — voice count is now naturally bounded by however many bird critters are actually visible at
// once (see the bird effect below).
// #924 round 7 (Han: "volume van de vogels mag 20% lager") + round 9 (Han: "reduce the bird sounds another
// 30%" — 0.8 * 0.7 = 0.56) — multiplies on top of MF_VOLUME, bird layers only (the ambient piano's own
// MF_VOLUME scaling above is untouched).
const BIRD_VOLUME_MULTIPLIER = 0.8 * 0.7;

export default function useWorldAmbientMusic({ active, context, musicVolumeMultiplier = 1, envAudioRef }) {
    // #992 (Han: "RPG music volume" setter) — the ONE combined knob covering both the ambient piano AND
    // bird layers below (App.jsx's own resolveLevelVolume call sites get the SAME multiplier for the
    // level bass/metronome/percussion tracks — one setting, two existing paths, per Han's spec). Kept in
    // a ref (not read directly as a prop inside the scheduling closures) so turning the knob mid-play
    // affects the NEXT scheduled block without tearing down/restarting the effects below — those only
    // depend on [active, context] by design (see their own eslint-disable-next-line comments).
    const musicVolumeMultiplierRef = useRef(musicVolumeMultiplier);
    useEffect(() => { musicVolumeMultiplierRef.current = musicVolumeMultiplier; }, [musicVolumeMultiplier]);
    // Own dedicated Soundfont instances — NEVER the user's live configured treble/bass instrument (Han's
    // interview answer: this must not hijack the user's actual practice instrument slots).
    const instrumentsRef = useRef({});
    const getInstrument = (slug) => {
        if (!context) return null;
        if (!instrumentsRef.current[slug]) {
            instrumentsRef.current[slug] = createMelodicInstrument(context, slug);
        }
        return instrumentsRef.current[slug];
    };

    // Generated ambient piano loop — a JIT-style block-by-block generator (mirrors
    // generateLevelBackingChunk.js/useLevelBackingStream.js's chunk pattern, §6c), each block scheduled via
    // the SAME playMelodies() every other track in the app plays through, and each block START snapped to
    // the world clock's next measure boundary (self-correcting every cycle, not just the first).
    useEffect(() => {
        if (!active || !context) return undefined;
        const treblePiano = getInstrument('acoustic_grand_piano');
        const bassPiano = treblePiano;   // #924 round 4: same 'piano' instrument for both tracks now
        let cancelled = false;
        let timeoutId;
        // #924 round 2 bugfix: these are BRAND NEW Soundfont instances (not part of the app's boot-splash
        // load gate) — calling .start() before their sample data has actually loaded produced no audible
        // sound at all (Han: "ik hoor de bas en treble melodie niet"). Wait for the `.load` promise before
        // the first block; smplr resolves instantly for an already-loaded instance, so this is a no-op
        // cost on every later block/reactivation.
        treblePiano.load.then(() => {
            if (cancelled) return;
            const scheduleNextBlock = () => {
                if (cancelled) return;
                const startTime = nextMeasureStartTime(context, WORLD_AMBIENT_BPM, WORLD_AMBIENT_TIME_SIGNATURE);
                // #924 round 3 (Han: "ik verwacht dat ongeveer 50% van de tijd op z'n minst bas melody
                // en/of treble melodie speelt"): treble/bass now roll their silence INDEPENDENTLY, so
                // either can be present while the other is null — playMelodies() already skips a null
                // melody entry on its own (`if (!melody) continue`), so passing both through unconditionally
                // is correct and plays whichever one(s) actually generated.
                const { treble, bass: bassMelody } = generateWorldAmbientBlock({ runId: `world-amb-${Date.now()}` });
                // #992 — rpgMusicVolume's multiplier applied ON TOP of MF_VOLUME (relative-to-default
                // semantics, see rpgVolumeMultiplier in audio/dynamics.js); == 1.0 at the shipped default.
                if (treble) treble.volumes = treble.volumes.map((v) => v * MF_VOLUME * musicVolumeMultiplierRef.current);
                if (bassMelody) bassMelody.volumes = bassMelody.volumes.map((v) => v * MF_VOLUME * musicVolumeMultiplierRef.current);
                if (treble || bassMelody) {
                    playMelodies([treble, bassMelody], [treblePiano, bassPiano], context, WORLD_AMBIENT_BPM, startTime);
                }
                const blockMeasureSec = (startTime - context.currentTime)
                    + WORLD_AMBIENT_NUM_MEASURES * WORLD_AMBIENT_TIME_SIGNATURE[0] * (60 / WORLD_AMBIENT_BPM);
                timeoutId = setTimeout(scheduleNextBlock, blockMeasureSec * 1000);
            };
            scheduleNextBlock();
        });
        return () => { cancelled = true; clearTimeout(timeoutId); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, context]);

    // #924 (Han: "eenmalig per trigger + willekeurige stilte erna... herschaal naar de wereld-bpm"; round 2:
    // "start altijd op het begin van een maat"; round 4: "ik hoor de eenden niet, zorg dat je steeds een
    // random track van de midi-file instart; dus ook duck, sparrow_low/high... niet kiezen wanneer ik tab
    // open, steeds een andere kiezen bij instarten").
    // #925 follow-up (Han 2026-08-16, "als POC: enkel bird sounds wanneer bird in beeld... elke zichtbare
    // vogel zijn eigen stem"): replaced the old MAX_CONCURRENT_BIRD_LAYERS abstract trigger-slot pool
    // (random, unrelated to any actual on-screen bird) with ONE independent voice PER currently-visible
    // bird critter (`envAudioRef.current.birdPositionsRef` — see WorldWanderer.jsx's own comment for how
    // that registry is populated). Each voice gets its OWN Smplr instance routed through its OWN
    // StereoPannerNode (no existing per-voice dynamic-panning precedent in this codebase — chorusEffect.js's
    // panner is a fixed width effect, not entity-position-driven) so simultaneous birds can each pan
    // independently. A voice is created lazily the first time its bird becomes visible and kept alive
    // (cheap — one Smplr instance, no audible cost while silent) rather than torn down/recreated every
    // time visibility flips, avoiding instrument-reload churn for a bird wandering in and out of view.
    useEffect(() => {
        if (!active || !context || BIRD_SONG_LAYERS.length === 0) return undefined;
        let cancelled = false;
        let reconcileId;
        let panId;
        const voices = new Map();   // birdId -> { instrument, panner, scheduling }

        const getEnv = () => envAudioRef?.current;
        const birdScreenX = (birdId) => {
            const env = getEnv();
            const worldX = env?.birdPositionsRef?.current?.get(birdId);
            if (worldX === undefined || !env?.localWorldToScreenX) return null;
            return env.localWorldToScreenX(worldX);
        };
        const isBirdVisible = (birdId) => {
            const env = getEnv();
            const screenX = birdScreenX(birdId);
            if (screenX == null || !env) return false;
            return screenX > -VISIBILITY_MARGIN_PX && screenX < env.viewportWidth + VISIBILITY_MARGIN_PX;
        };

        const scheduleForBird = (birdId, voice) => {
            if (voice.scheduling) return;
            voice.scheduling = true;
            const triggerOnce = () => {
                if (cancelled) return;
                if (!isBirdVisible(birdId)) { voice.scheduling = false; return; }   // reconcile restarts it once visible again
                const source = BIRD_SONG_LAYERS[Math.floor(Math.random() * BIRD_SONG_LAYERS.length)];
                // Han: "gebruik gewoon de velocities" — scale the layer's OWN per-note velocities
                // (scripts/generate-bird-sounds.mjs) by MF_VOLUME, don't replace them with a flat gain.
                const layer = { ...source, volumes: source.volumes.map((v) => v * MF_VOLUME * BIRD_VOLUME_MULTIPLIER * musicVolumeMultiplierRef.current) };
                const lastNoteEnd = layer.offsets.length
                    ? Math.max(...layer.offsets.map((o, i) => o + layer.durations[i]))
                    : 0;
                const layerDurationSec = lastNoteEnd * secondsPerTick(WORLD_AMBIENT_BPM);
                const startTime = nextMeasureStartTime(context, WORLD_AMBIENT_BPM, WORLD_AMBIENT_TIME_SIGNATURE);
                playMelodies([layer], [voice.instrument], context, WORLD_AMBIENT_BPM, startTime);
                const silenceSec = BIRD_MIN_SILENCE_SEC + Math.random() * (BIRD_MAX_SILENCE_SEC - BIRD_MIN_SILENCE_SEC);
                const waitSec = (startTime - context.currentTime) + layerDurationSec + silenceSec;
                setTimeout(triggerOnce, waitSec * 1000);
            };
            // Stagger this bird's FIRST trigger so several birds becoming visible at once don't sing in lockstep.
            setTimeout(triggerOnce, Math.random() * BIRD_MAX_SILENCE_SEC * 1000);
        };

        const ensureVoice = (birdId) => {
            let voice = voices.get(birdId);
            if (voice) return voice;
            const panner = context.createStereoPanner();
            panner.connect(context.destination);
            const instrument = createMelodicInstrument(context, 'shakuhachi', { destination: panner });
            voice = { instrument, panner, scheduling: false };
            voices.set(birdId, voice);
            instrument.load.then(() => { if (!cancelled) scheduleForBird(birdId, voice); });
            return voice;
        };

        reconcileId = setInterval(() => {
            const env = getEnv();
            if (!env?.birdPositionsRef) return;
            for (const birdId of env.birdPositionsRef.current.keys()) {
                if (isBirdVisible(birdId)) {
                    const voice = ensureVoice(birdId);
                    if (!voice.scheduling) scheduleForBird(birdId, voice);
                }
            }
        }, BIRD_RECONCILE_MS);

        panId = setInterval(() => {
            voices.forEach((voice, birdId) => {
                const env = getEnv();
                const screenX = birdScreenX(birdId);
                if (screenX == null || !env) return;
                const { pan } = computeSpatialPan(screenX, env.viewportWidth, VISIBILITY_MARGIN_PX);
                voice.panner.pan.value = pan;
            });
        }, BIRD_RECONCILE_MS);

        return () => {
            cancelled = true;
            clearInterval(reconcileId);
            clearInterval(panId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, context]);

    // #925 follow-up (Han 2026-08-16, "water is speciaal: waar de birds 'random' instarten, moet water
    // steeds actief zijn... de water cello is gewoon een hele lange noot, dus zonder release"): ONE
    // continuous voice, held indefinitely (a very long note duration, relying on the cello sample's own
    // real loop points already extracted by `createMelodicInstrument`/`buildLocalSmplrJson` for sustain —
    // CLAUDE.md §6c, no new looping mechanism invented). Panned/faded by `computeSpatialPan` toward
    // whichever visible (or nearest off-screen) water tile is closest to view; actually stopped
    // ("unloaded") once no water is within `WATER_MAX_OFFSCREEN_PX` at all, per Han's own spec.
    useEffect(() => {
        if (!active || !context) return undefined;
        let cancelled = false;
        let intervalId;
        const panner = context.createStereoPanner();
        const gain = context.createGain();
        gain.gain.value = 0;
        panner.connect(gain);
        gain.connect(context.destination);
        const cello = createMelodicInstrument(context, 'cello', { destination: panner });
        let stopFn = null;

        const nearestWaterScreenX = (env) => {
            const tiles = env?.waterTiles;
            if (!tiles || tiles.length === 0 || !env.localWorldToScreenX) return null;
            let bestInView = null, inViewCount = 0, inViewSum = 0;
            let bestOffscreen = null, bestOffscreenDist = Infinity;
            for (const tile of tiles) {
                const screenX = env.localWorldToScreenX(tile.worldX);
                if (screenX >= 0 && screenX <= env.viewportWidth) { inViewSum += screenX; inViewCount++; bestInView = screenX; }
                else {
                    const dist = screenX < 0 ? -screenX : screenX - env.viewportWidth;
                    if (dist < bestOffscreenDist) { bestOffscreenDist = dist; bestOffscreen = screenX; }
                }
            }
            if (inViewCount > 0) return inViewSum / inViewCount;
            return bestInView ?? bestOffscreen;
        };

        cello.load.then(() => {
            if (cancelled) return;
            intervalId = setInterval(() => {
                const env = envAudioRef?.current;
                const screenX = env ? nearestWaterScreenX(env) : null;
                if (screenX == null) {
                    if (stopFn) { stopFn(); stopFn = null; }
                    gain.gain.value = 0;
                    return;
                }
                const { pan, proximity } = computeSpatialPan(screenX, env.viewportWidth, WATER_MAX_OFFSCREEN_PX);
                panner.pan.value = pan;
                gain.gain.value = WATER_GAIN * proximity * musicVolumeMultiplierRef.current;
                if (proximity <= 0) {
                    if (stopFn) { stopFn(); stopFn = null; }
                } else if (!stopFn) {
                    // #925: "een hele lange noot, dus zonder release" — a large fixed duration, not the
                    // sample's own natural (finite) length; relies on the instrument's real loop points to
                    // sustain smoothly rather than audibly restarting/clicking every few seconds.
                    stopFn = cello.start({ note: WATER_NOTE, time: context.currentTime, duration: 3600 });
                }
            }, WATER_RECONCILE_MS);
        });

        return () => {
            cancelled = true;
            clearInterval(intervalId);
            if (stopFn) stopFn();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, context]);
}
