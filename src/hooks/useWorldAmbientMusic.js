import { useEffect, useRef } from 'react';
import { Soundfont } from 'smplr';
import playMelodies from '../audio/playMelodies';
import { secondsPerTick } from '../constants/timing';
import { nextMeasureStartTime } from '../audio/worldClock';
import { MF_VOLUME } from '../audio/dynamics';
import {
    generateWorldAmbientBlock, WORLD_AMBIENT_BPM, WORLD_AMBIENT_TIME_SIGNATURE, WORLD_AMBIENT_NUM_MEASURES,
} from '../generation/generateWorldAmbientBlock';
import { BIRD_SONG_LAYERS } from '../model/birdSoundsManifest.generated';

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
// #924 round 2 (Han: "ik heb de file geupdated. Speel altijd maximaal 3."): the source MIDI's own track
// count is no longer fixed (currently 6) — always at most this many CONCURRENT trigger slots.
const MAX_CONCURRENT_BIRD_LAYERS = 3;

export default function useWorldAmbientMusic({ active, context }) {
    // Own dedicated Soundfont instances — NEVER the user's live configured treble/bass instrument (Han's
    // interview answer: this must not hijack the user's actual practice instrument slots).
    const instrumentsRef = useRef({});
    const getInstrument = (slug) => {
        if (!context) return null;
        if (!instrumentsRef.current[slug]) {
            instrumentsRef.current[slug] = new Soundfont(context, { instrument: slug, destination: context.destination });
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
                if (treble) treble.volumes = treble.volumes.map((v) => v * MF_VOLUME);
                if (bassMelody) bassMelody.volumes = bassMelody.volumes.map((v) => v * MF_VOLUME);
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
    // open, steeds een andere kiezen bij instarten"): MAX_CONCURRENT_BIRD_LAYERS independent trigger SLOTS
    // (not fixed to specific tracks) — each slot picks a FRESH random layer from the WHOLE pool every time
    // it fires, not once per tab-activation, so every track (including rarer ones) eventually gets a turn.
    useEffect(() => {
        if (!active || !context || BIRD_SONG_LAYERS.length === 0) return undefined;
        const shakuhachi = getInstrument('shakuhachi');
        const timeoutIds = [];
        let cancelled = false;
        shakuhachi.load.then(() => {
            if (cancelled) return;
            for (let slot = 0; slot < MAX_CONCURRENT_BIRD_LAYERS; slot++) {
                const triggerOnce = () => {
                    if (cancelled) return;
                    const source = BIRD_SONG_LAYERS[Math.floor(Math.random() * BIRD_SONG_LAYERS.length)];
                    // Han: "gebruik gewoon de velocities" — scale the layer's OWN per-note velocities
                    // (scripts/generate-bird-sounds.mjs) by MF_VOLUME, don't replace them with a flat gain.
                    // Copy the array (never mutate the shared BIRD_SONG_LAYERS export in place).
                    const layer = { ...source, volumes: source.volumes.map((v) => v * MF_VOLUME) };
                    const lastNoteEnd = layer.offsets.length
                        ? Math.max(...layer.offsets.map((o, i) => o + layer.durations[i]))
                        : 0;
                    const layerDurationSec = lastNoteEnd * secondsPerTick(WORLD_AMBIENT_BPM);
                    const startTime = nextMeasureStartTime(context, WORLD_AMBIENT_BPM, WORLD_AMBIENT_TIME_SIGNATURE);
                    playMelodies([layer], [shakuhachi], context, WORLD_AMBIENT_BPM, startTime);
                    const silenceSec = BIRD_MIN_SILENCE_SEC + Math.random() * (BIRD_MAX_SILENCE_SEC - BIRD_MIN_SILENCE_SEC);
                    const waitSec = (startTime - context.currentTime) + layerDurationSec + silenceSec;
                    const id = setTimeout(triggerOnce, waitSec * 1000);
                    timeoutIds.push(id);
                };
                // Stagger each slot's FIRST trigger with its own random initial delay so they don't all
                // start in lockstep the instant the tab opens.
                const initialDelaySec = Math.random() * BIRD_MAX_SILENCE_SEC;
                const id = setTimeout(triggerOnce, initialDelaySec * 1000);
                timeoutIds.push(id);
            }
        });
        return () => { cancelled = true; timeoutIds.forEach(clearTimeout); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, context]);
}
