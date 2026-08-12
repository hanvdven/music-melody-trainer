import { useEffect, useRef } from 'react';
import { Soundfont } from 'smplr';
import playMelodies from '../audio/playMelodies';
import { secondsPerBeat, secondsPerTick } from '../constants/timing';
import {
    generateWorldAmbientBlock, WORLD_AMBIENT_BPM, WORLD_AMBIENT_TIME_SIGNATURE, WORLD_AMBIENT_NUM_MEASURES,
} from '../generation/generateWorldAmbientBlock';
import { BIRD_SONG_LAYERS } from '../model/birdSoundsManifest.generated';

// #924 (Han 2026-08-12): the open-world RPG-level tab's ambient background audio — quiet generated
// flute+bass music, plus 3 independently-triggered "bird song" layers (pre-authored MIDI material, played
// on shakuhachi). Both only run while `active` (Han: "alleen de open-wereld RPG-level tab").
const AMBIENT_TRACK_GAIN = 0.28;      // Han: "zachtjes" — quiet, background, not competing with foreground audio
const BIRD_LAYER_GAIN = { treble: 0.22 };
const BIRD_MIN_SILENCE_SEC = 5;
const BIRD_MAX_SILENCE_SEC = 30;

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

    // Generated ambient flute+bass loop — a JIT-style block-by-block generator (mirrors
    // generateLevelBackingChunk.js/useLevelBackingStream.js's chunk pattern, §6c), each block scheduled via
    // the SAME playMelodies() every other track in the app plays through.
    useEffect(() => {
        if (!active || !context) return undefined;
        const flute = getInstrument('flute');
        const bass = getInstrument('acoustic_bass');
        const blockSec = WORLD_AMBIENT_NUM_MEASURES * secondsPerBeat(WORLD_AMBIENT_BPM) * WORLD_AMBIENT_TIME_SIGNATURE[0];
        let cancelled = false;
        const scheduleNextBlock = () => {
            if (cancelled) return;
            const { treble, bass: bassMelody } = generateWorldAmbientBlock({ runId: `world-amb-${Date.now()}` });
            if (treble && bassMelody) {
                playMelodies(
                    [treble, bassMelody], [flute, bass], context, WORLD_AMBIENT_BPM, context.currentTime + 0.05,
                    null, null, { treble: flute, bass }, null, { treble: AMBIENT_TRACK_GAIN, bass: AMBIENT_TRACK_GAIN },
                );
            }
            timeoutId = setTimeout(scheduleNextBlock, blockSec * 1000);
        };
        let timeoutId = setTimeout(scheduleNextBlock, 0);
        return () => { cancelled = true; clearTimeout(timeoutId); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, context]);

    // #924 (Han: "3 lagen bird song... elke MIDI-track is 1 laag... eenmalig per trigger + willekeurige
    // stilte erna... herschaal naar de wereld-bpm"): 3 independent trigger loops, one per
    // BIRD_SONG_LAYERS entry — each plays its own pre-authored phrase ONCE (at WORLD_AMBIENT_BPM, so it
    // rescales exactly like any other generated melody in the app — NOT the MIDI file's own native tempo),
    // then waits a random silence before re-triggering. Independent timers so layers overlap naturally,
    // like real birds calling at unrelated moments.
    useEffect(() => {
        if (!active || !context) return undefined;
        const shakuhachi = getInstrument('shakuhachi');
        const timeoutIds = [];
        let cancelled = false;
        BIRD_SONG_LAYERS.forEach((layer) => {
            const lastNoteEnd = layer.offsets.length
                ? Math.max(...layer.offsets.map((o, i) => o + layer.durations[i]))
                : 0;
            const layerDurationSec = lastNoteEnd * secondsPerTick(WORLD_AMBIENT_BPM);
            const triggerOnce = () => {
                if (cancelled) return;
                playMelodies(
                    [layer], [shakuhachi], context, WORLD_AMBIENT_BPM, context.currentTime + 0.05,
                    null, null, { treble: shakuhachi }, null, BIRD_LAYER_GAIN,
                );
                const silenceSec = BIRD_MIN_SILENCE_SEC + Math.random() * (BIRD_MAX_SILENCE_SEC - BIRD_MIN_SILENCE_SEC);
                const id = setTimeout(triggerOnce, (layerDurationSec + silenceSec) * 1000);
                timeoutIds.push(id);
            };
            // Stagger each layer's FIRST trigger with its own random initial delay so all 3 don't start
            // in lockstep the instant the tab opens.
            const initialDelaySec = Math.random() * BIRD_MAX_SILENCE_SEC;
            const id = setTimeout(triggerOnce, initialDelaySec * 1000);
            timeoutIds.push(id);
        });
        return () => { cancelled = true; timeoutIds.forEach(clearTimeout); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, context]);
}
