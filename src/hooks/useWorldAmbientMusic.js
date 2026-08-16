import { useEffect, useRef } from 'react';
import playMelodies from '../audio/playMelodies';
import { createMelodicInstrument } from '../audio/localInstruments';
import { secondsPerTick } from '../constants/timing';
import { nextMeasureStartTime } from '../audio/worldClock';
import { MF_VOLUME } from '../audio/dynamics';
import { CHUNK_PX, AUDIBLE_CHUNKS, computeSpatialPanVolume } from '../audio/spatialPan';
import {
    generateWorldAmbientBlock, WORLD_AMBIENT_BPM, WORLD_AMBIENT_TIME_SIGNATURE, WORLD_AMBIENT_NUM_MEASURES,
} from '../generation/generateWorldAmbientBlock';
import { BIRD_SONG_LAYERS } from '../model/birdSoundsManifest.generated';

const WATER_NOTE = 'C2';   // #925: "de water cello is gewoon een hele lange noot, dus zonder release"
const WATER_GAIN = 0.5 * MF_VOLUME;
const WATER_RECONCILE_MS = 200;   // pan/gain update cadence — smooth enough for a slow-moving camera, cheap
const BIRD_RECONCILE_MS = 500;    // visibility check cadence — birds don't need frame-perfect pan updates
// #925 round 2 (Han: "ik vind gewoon dichtbij de wissel links rechts heeeel abrupt"): setting an
// AudioParam's `.value` directly is an INSTANT jump — audibly abrupt/clicky, "zipper noise" in Web Audio
// terms — regardless of how smooth the underlying pan/gain FORMULA is. `setTargetAtTime` exponentially
// glides toward the new value instead; every pan/gain update in this file uses it now, not a raw `.value=`.
const PARAM_SMOOTH_TIME_CONSTANT = 0.15;
const rampParam = (audioParam, value, context) => audioParam.setTargetAtTime(value, context.currentTime, PARAM_SMOOTH_TIME_CONSTANT);

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
// #925 round 2 (Han: "met volume bedoel ik een factor bovenop de midi-velocity: dus output = volume% *
// midi-velocity"): confirms this existing MF_VOLUME/musicVolumeMultiplier-on-.volumes-array convention is
// exactly right — the distance-based gain below multiplies on top of that same product (a separate
// GainNode stage after the instrument), not instead of it.
const BIRD_MIN_SILENCE_SEC = 5;
const BIRD_MAX_SILENCE_SEC = 30;
// #924 round 7 (Han: "volume van de vogels mag 20% lager") + round 9 (Han: "reduce the bird sounds another
// 30%" — 0.8 * 0.7 = 0.56) — multiplies on top of MF_VOLUME, bird layers only (the ambient piano's own
// MF_VOLUME scaling above is untouched).
const BIRD_VOLUME_MULTIPLIER = 0.8 * 0.7;

// #925 round 2 (Han 2026-08-17, "ik hoor water: wel de cello, maar niet de belletjes. Water heeft 3
// lagen. cello, belletjes, en percussie"): water's SECOND layer — intermittent chime notes (tubular
// bells, per Han's own interview answer: "al gebruikt voor town crier/blacksmith", CLAUDE.md §6c reuse of
// an instrument already established for bell-like effects), triggered randomly while water is within
// audible range — unlike the cello's one continuous held note, bells are a sparse, periodic sparkle.
// Percussion (water's third layer) is deferred to #1037 (no GM kit available).
const WATER_BELLS_NOTE_POOL = ['C6', 'E6', 'G6', 'C7'];
const WATER_BELLS_MIN_SILENCE_SEC = 3;
const WATER_BELLS_MAX_SILENCE_SEC = 12;
const WATER_BELLS_GAIN = 0.35 * MF_VOLUME;

// Plain StereoPannerNode + GainNode per voice (Han: "doe dan maar gewone stereo pan + volume, als dat
// simpeler is" — simpler than round 2's first draft, which used independent left/right GainNodes to let
// both channels reach 100% simultaneously; a standard constant-power panner can't do that, but Han opted
// for the simpler, standard approach instead once he saw the alternative).
function createSpatialBus(context) {
    const panner = context.createStereoPanner();
    const gain = context.createGain();
    panner.connect(gain);
    gain.connect(context.destination);
    return { input: panner, panner, gain };
}

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
    // #925 (Han 2026-08-16, "als POC: enkel bird sounds wanneer bird in beeld... elke zichtbare vogel zijn
    // eigen stem") + round 2 (Han 2026-08-17, "definieer audio in chunks, niet in beeldlengtes"): ONE
    // persistent voice PER bird critter currently within `AUDIBLE_CHUNKS` of the LISTENER (the hero's own
    // world position — not screen visibility anymore), each with its OWN Smplr instance routed through
    // its own pan+gain bus (see createSpatialBus — no existing per-voice dynamic-panning precedent in
    // this codebase; chorusEffect.js's panner is a fixed width effect, not position-driven). A voice is
    // created lazily the first time its bird comes into range and kept alive (cheap while silent) rather
    // than torn down/recreated every time it drifts in and out of range.
    useEffect(() => {
        if (!active || !context || BIRD_SONG_LAYERS.length === 0) return undefined;
        let cancelled = false;
        let reconcileId;
        let panId;
        const voices = new Map();   // birdId -> { instrument, bus, scheduling }

        const getEnv = () => envAudioRef?.current;
        const birdDistanceChunks = (birdId) => {
            const env = getEnv();
            const birdX = env?.birdPositionsRef?.current?.get(birdId);
            if (birdX === undefined || env?.listenerX == null) return Infinity;
            return Math.abs(birdX - env.listenerX) / CHUNK_PX;
        };
        const isBirdAudible = (birdId) => birdDistanceChunks(birdId) < AUDIBLE_CHUNKS;

        const scheduleForBird = (birdId, voice) => {
            if (voice.scheduling) return;
            voice.scheduling = true;
            const triggerOnce = () => {
                if (cancelled) return;
                if (!isBirdAudible(birdId)) { voice.scheduling = false; return; }   // reconcile restarts it once back in range
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
            // Stagger this bird's FIRST trigger so several birds coming into range at once don't sing in lockstep.
            setTimeout(triggerOnce, Math.random() * BIRD_MAX_SILENCE_SEC * 1000);
        };

        const ensureVoice = (birdId) => {
            let voice = voices.get(birdId);
            if (voice) return voice;
            const bus = createSpatialBus(context);
            const instrument = createMelodicInstrument(context, 'shakuhachi', { destination: bus.input });
            voice = { instrument, bus, scheduling: false };
            voices.set(birdId, voice);
            instrument.load.then(() => { if (!cancelled) scheduleForBird(birdId, voice); });
            return voice;
        };

        reconcileId = setInterval(() => {
            const env = getEnv();
            if (!env?.birdPositionsRef) return;
            for (const birdId of env.birdPositionsRef.current.keys()) {
                if (isBirdAudible(birdId)) {
                    const voice = ensureVoice(birdId);
                    if (!voice.scheduling) scheduleForBird(birdId, voice);
                }
            }
        }, BIRD_RECONCILE_MS);

        panId = setInterval(() => {
            const env = getEnv();
            if (!env || env.listenerX == null) return;
            voices.forEach((voice, birdId) => {
                const birdX = env.birdPositionsRef?.current?.get(birdId);
                if (birdX === undefined) return;
                const { pan, gain } = computeSpatialPanVolume(birdX, env.listenerX);
                rampParam(voice.bus.panner.pan, pan, context);
                rampParam(voice.bus.gain.gain, gain, context);
            });
        }, BIRD_RECONCILE_MS);

        return () => {
            cancelled = true;
            clearInterval(reconcileId);
            clearInterval(panId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, context]);

    // #925 (Han 2026-08-16, "water is speciaal: waar de birds 'random' instarten, moet water steeds
    // actief zijn... de water cello is gewoon een hele lange noot, dus zonder release") + round 2 (Han
    // 2026-08-17, chunk-based pan/volume + "ik hoor wel de cello, maar niet de belletjes. Water heeft 3
    // lagen: cello, belletjes, en percussie"): TWO water voices — the cello holds ONE continuous note
    // indefinitely (relying on the sample's own real loop points already extracted by
    // `createMelodicInstrument`/`buildLocalSmplrJson` for sustain — CLAUDE.md §6c, no new looping
    // mechanism invented); tubular bells trigger a sparse, periodic chime while water is in range (an
    // independent voice/bus, not mixed into the cello's). Percussion (water's third layer) is deferred to
    // #1037 (no GM kit available). Both panned/faded by the SAME chunk model the birds use, toward
    // whichever water tile is nearest the listener; the cello note is genuinely stopped ("unloaded") once
    // nothing is within `AUDIBLE_CHUNKS`.
    useEffect(() => {
        if (!active || !context) return undefined;
        let cancelled = false;
        let intervalId;
        const celloBus = createSpatialBus(context);
        const cello = createMelodicInstrument(context, 'cello', { destination: celloBus.input });
        let celloStopFn = null;
        const bellsBus = createSpatialBus(context);
        const bells = createMelodicInstrument(context, 'tubular_bells', { destination: bellsBus.input });
        let bellsScheduling = false;

        const nearestWaterX = (env) => {
            const tiles = env?.waterTiles;
            if (!tiles || tiles.length === 0 || env.listenerX == null || env.levelMinX == null) return null;
            let best = null, bestDist = Infinity;
            for (const tile of tiles) {
                // #925 round 2: water tiles' own worldX is CANVAS-LOCAL (0-based from LEVEL_MIN_X, per
                // ldtkWorld.js's tileFromLdtkEntry offsetX), while `listenerX` (the hero's position) is
                // ABSOLUTE — the exact same coordinate-space mismatch #1024's point-light bug was.
                // Converted back to absolute here before comparing, unlike that first bug.
                const absoluteX = tile.worldX + env.levelMinX;
                const dist = Math.abs(absoluteX - env.listenerX);
                if (dist < bestDist) { bestDist = dist; best = absoluteX; }
            }
            return best;
        };

        const scheduleBells = () => {
            if (bellsScheduling) return;
            bellsScheduling = true;
            const triggerOnce = () => {
                if (cancelled) return;
                const env = envAudioRef?.current;
                const waterX = env ? nearestWaterX(env) : null;
                if (waterX == null || Math.abs(waterX - env.listenerX) / CHUNK_PX >= AUDIBLE_CHUNKS) {
                    bellsScheduling = false;
                    return;   // the main reconcile interval below restarts this once water is back in range
                }
                const note = WATER_BELLS_NOTE_POOL[Math.floor(Math.random() * WATER_BELLS_NOTE_POOL.length)];
                const startTime = nextMeasureStartTime(context, WORLD_AMBIENT_BPM, WORLD_AMBIENT_TIME_SIGNATURE);
                bells.start({
                    note, time: startTime,
                    gain: WATER_BELLS_GAIN * musicVolumeMultiplierRef.current,
                });
                const silenceSec = WATER_BELLS_MIN_SILENCE_SEC + Math.random() * (WATER_BELLS_MAX_SILENCE_SEC - WATER_BELLS_MIN_SILENCE_SEC);
                const waitSec = (startTime - context.currentTime) + silenceSec;
                setTimeout(triggerOnce, waitSec * 1000);
            };
            triggerOnce();
        };

        Promise.all([cello.load, bells.load]).then(() => {
            if (cancelled) return;
            intervalId = setInterval(() => {
                const env = envAudioRef?.current;
                const waterX = env ? nearestWaterX(env) : null;
                if (waterX == null) {
                    if (celloStopFn) { celloStopFn(); celloStopFn = null; }
                    rampParam(celloBus.gain.gain, 0, context);
                    rampParam(bellsBus.gain.gain, 0, context);
                    return;
                }
                const { pan, gain } = computeSpatialPanVolume(waterX, env.listenerX);
                rampParam(celloBus.panner.pan, pan, context);
                rampParam(celloBus.gain.gain, gain * WATER_GAIN, context);
                rampParam(bellsBus.panner.pan, pan, context);
                rampParam(bellsBus.gain.gain, gain, context);
                if (gain <= 0) {
                    if (celloStopFn) { celloStopFn(); celloStopFn = null; }
                } else if (!celloStopFn) {
                    // #925: "een hele lange noot, dus zonder release" — a large fixed duration, not the
                    // sample's own natural (finite) length; relies on the instrument's real loop points to
                    // sustain smoothly rather than audibly restarting/clicking every few seconds.
                    celloStopFn = cello.start({ note: WATER_NOTE, time: context.currentTime, duration: 3600 });
                    scheduleBells();
                } else {
                    scheduleBells();
                }
            }, WATER_RECONCILE_MS);
        });

        return () => {
            cancelled = true;
            clearInterval(intervalId);
            if (celloStopFn) celloStopFn();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, context]);
}
