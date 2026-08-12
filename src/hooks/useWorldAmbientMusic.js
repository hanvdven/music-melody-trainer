import { useEffect, useMemo, useRef } from 'react';
import { Soundfont } from 'smplr';
import playMelodies from '../audio/playMelodies';
import { secondsPerTick } from '../constants/timing';
import { nextMeasureStartTime } from '../audio/worldClock';
import {
    generateWorldAmbientBlock, WORLD_AMBIENT_BPM, WORLD_AMBIENT_TIME_SIGNATURE, WORLD_AMBIENT_NUM_MEASURES,
} from '../generation/generateWorldAmbientBlock';
import { BIRD_SONG_LAYERS } from '../model/birdSoundsManifest.generated';

// #924 (Han 2026-08-12): the open-world RPG-level tab's ambient background audio — quiet generated
// flute+bass music, plus a handful of independently-triggered "bird song" layers (pre-authored MIDI
// material, played on shakuhachi). Both only run while `active` (Han: "alleen de open-wereld RPG-level
// tab"), and BOTH are anchored to the SAME world clock (`worldClock.js`'s `nextMeasureStartTime`) — Han,
// round 2: "de vogel-midi lijkt totaal niet afgestemd op de metronoom. start (natuurlijk) altijd op het
// begin van een maat"; round 4: "ook de tekst playback heeft een eigen metronoom... niet de bedoeling;
// alles moet op dezelfde klok lopen" — this is the ONE clock every RPG-layer audio system reads from now
// (see useConversationDialogue.js's matching fix).
const AMBIENT_TRACK_GAIN = 0.28;      // Han: "zachtjes" — quiet, background, not competing with foreground audio
const BIRD_LAYER_GAIN = { treble: 0.22 };
const BIRD_MIN_SILENCE_SEC = 5;
const BIRD_MAX_SILENCE_SEC = 30;
// #924 round 2 (Han: "ik heb de file geupdated. Speel altijd maximaal 3."): the source MIDI's own track
// count is no longer fixed (now 6) — always pick at most this many to actually play at once.
const MAX_CONCURRENT_BIRD_LAYERS = 3;

function pickRandomLayers(layers, count) {
    const pool = [...layers];
    const picked = [];
    while (pool.length && picked.length < count) {
        picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return picked;
}

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
    // A fresh random 3-of-N subset each time the tab (re)activates.
    const activeBirdLayers = useMemo(
        () => pickRandomLayers(BIRD_SONG_LAYERS, MAX_CONCURRENT_BIRD_LAYERS),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [active],
    );

    // Generated ambient flute+bass loop — a JIT-style block-by-block generator (mirrors
    // generateLevelBackingChunk.js/useLevelBackingStream.js's chunk pattern, §6c), each block scheduled via
    // the SAME playMelodies() every other track in the app plays through, and each block START snapped to
    // the world clock's next measure boundary (self-correcting every cycle, not just the first).
    useEffect(() => {
        if (!active || !context) return undefined;
        const flute = getInstrument('flute');
        const bass = getInstrument('acoustic_bass');
        let cancelled = false;
        let timeoutId;
        // #924 round 2 bugfix: these are BRAND NEW Soundfont instances (not part of the app's boot-splash
        // load gate) — calling .start() before their sample data has actually loaded produced no audible
        // sound at all (Han: "ik hoor de bas en treble melodie niet"). Wait for both `.load` promises
        // before the first block; smplr resolves instantly for an already-loaded instance, so this is a
        // no-op cost on every later block/reactivation.
        Promise.all([flute.load, bass.load]).then(() => {
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
                if (treble || bassMelody) {
                    playMelodies(
                        [treble, bassMelody], [flute, bass], context, WORLD_AMBIENT_BPM, startTime,
                        null, null, { treble: flute, bass }, null, { treble: AMBIENT_TRACK_GAIN, bass: AMBIENT_TRACK_GAIN },
                    );
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

    // #924 (Han: "3 lagen bird song... eenmalig per trigger + willekeurige stilte erna... herschaal naar de
    // wereld-bpm"; round 2: "start altijd op het begin van een maat"): one independent trigger loop per
    // randomly-picked layer — each plays its own pre-authored phrase ONCE, snapped to the world clock's
    // next measure boundary (at WORLD_AMBIENT_BPM, so it rescales exactly like any other generated melody
    // in the app — NOT the MIDI file's own native tempo), then waits a random silence before re-triggering.
    // Independent timers so layers overlap naturally, like real birds calling at unrelated moments.
    useEffect(() => {
        if (!active || !context || activeBirdLayers.length === 0) return undefined;
        const shakuhachi = getInstrument('shakuhachi');
        const timeoutIds = [];
        let cancelled = false;
        shakuhachi.load.then(() => {
            if (cancelled) return;
            activeBirdLayers.forEach((layer) => {
                const lastNoteEnd = layer.offsets.length
                    ? Math.max(...layer.offsets.map((o, i) => o + layer.durations[i]))
                    : 0;
                const layerDurationSec = lastNoteEnd * secondsPerTick(WORLD_AMBIENT_BPM);
                const triggerOnce = () => {
                    if (cancelled) return;
                    const startTime = nextMeasureStartTime(context, WORLD_AMBIENT_BPM, WORLD_AMBIENT_TIME_SIGNATURE);
                    playMelodies(
                        [layer], [shakuhachi], context, WORLD_AMBIENT_BPM, startTime,
                        null, null, { treble: shakuhachi }, null, BIRD_LAYER_GAIN,
                    );
                    const silenceSec = BIRD_MIN_SILENCE_SEC + Math.random() * (BIRD_MAX_SILENCE_SEC - BIRD_MIN_SILENCE_SEC);
                    const waitSec = (startTime - context.currentTime) + layerDurationSec + silenceSec;
                    const id = setTimeout(triggerOnce, waitSec * 1000);
                    timeoutIds.push(id);
                };
                // Stagger each layer's FIRST trigger with its own random initial delay so all layers don't
                // start in lockstep the instant the tab opens.
                const initialDelaySec = Math.random() * BIRD_MAX_SILENCE_SEC;
                const id = setTimeout(triggerOnce, initialDelaySec * 1000);
                timeoutIds.push(id);
            });
        });
        return () => { cancelled = true; timeoutIds.forEach(clearTimeout); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, context, activeBirdLayers]);
}
