import { useEffect, useRef, useState } from 'react';
import { resolveNotePitch } from '../../audio/playSound';

// #RAM-level (Han 2026-08-11, "in debug wil ik in het level een metronoom aan kunnen zetten, bpm zelfde
// als bladmuziek... een teller (1,2,3,4) die elk kwartnoot verspringt"): a debug-only click track for the
// RPG hub, driven by `context.currentTime` polled via rAF — NOT `setInterval`/`setTimeout` (CLAUDE.md §6:
// "never use setTimeout to drive [musical timing]" — the same invariant applies here: a wall-clock timer
// drifts against the real AudioContext clock every other system in this app schedules against). Each rAF
// tick recomputes which beat SHOULD be current from elapsed AudioContext time and only acts (plays a
// click, advances the on-screen counter) on the tick where that beat actually changes — an edge trigger,
// not a periodic callback.
//
// #RAM-level BUG FIX (Han 2026-08-11, "de metronoom klinkt als een geigenteller — lijkt gekoppeld aan de
// FPS"): the effect used to depend on `[enabled, bpm, context, instruments]`. `instruments` is a plain
// object literal returned fresh by `useInstruments()` on EVERY App.jsx render — and App.jsx re-renders
// ~60x/sec while the hero is moving (its `rpgLevel` state lives there). Each of those renders was a
// DIFFERENT `instruments` reference, so this effect tore down and restarted the whole click loop on every
// single render: `startTimeRef` reset to "now" and `lastBeatIndexRef` reset to -1 each time, which fired
// an IMMEDIATE click on every restart — i.e. up to ~60 clicks/sec while walking, sounding exactly like a
// Geiger counter and tracking the frame rate instead of the tempo. Fixed: `instruments`/`bpm`/
// `timeSignature` are read through REFS updated every render (`instrumentsRef.current = instruments`,
// same convention `useRpgLevelState.js` already uses for `playerXRef` etc.) so the tick loop always sees
// the LATEST value without needing to be in the dependency array — only `enabled` and `context` (stable,
// created once in App.jsx) restart the loop, exactly when Han actually flips it on/off.
const ACCENT_NOTE = 'wh';     // downbeat — woodblock high (METRONOME_NOTE_IDS, drumKits.js)
const CLICK_NOTE = 'wm';      // other beats — woodblock mid

export default function useDebugMetronome({ enabled, bpm, timeSignature, context, instruments }) {
    const [beat, setBeat] = useState(1);   // 1..beatsPerMeasure, for display
    const [pulseTick, setPulseTick] = useState(0);   // increments on every beat edge, drives the swing animation
    const startTimeRef = useRef(0);
    const lastBeatIndexRef = useRef(-1);
    const bpmRef = useRef(bpm); bpmRef.current = bpm;
    const beatsPerMeasureRef = useRef(4); beatsPerMeasureRef.current = timeSignature?.[0] || 4;
    const instrumentsRef = useRef(instruments); instrumentsRef.current = instruments;

    useEffect(() => {
        if (!enabled || !context) return undefined;
        startTimeRef.current = context.currentTime;
        lastBeatIndexRef.current = -1;
        let raf;
        const tick = () => {
            const secondsPerBeat = 60 / (bpmRef.current || 120);
            const beatsPerMeasure = beatsPerMeasureRef.current;
            const elapsed = context.currentTime - startTimeRef.current;
            const beatIndex = Math.floor(elapsed / secondsPerBeat) % beatsPerMeasure;
            if (beatIndex !== lastBeatIndexRef.current) {
                lastBeatIndexRef.current = beatIndex;
                setBeat(beatIndex + 1);
                setPulseTick((t) => t + 1);
                const metronomeInstrument = instrumentsRef.current?.metronome;
                if (metronomeInstrument) {
                    const noteId = beatIndex === 0 ? ACCENT_NOTE : CLICK_NOTE;
                    const pitch = resolveNotePitch(noteId, null);
                    if (pitch !== null) {
                        // Fire-and-forget at "now" — this is a debug click track, not a scored part, so it
                        // doesn't need the lookahead-scheduling precision the real Sequencer uses.
                        metronomeInstrument.start({ note: pitch, time: context.currentTime, duration: 0.15 });
                    }
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [enabled, context]);

    return { beat, pulseTick };
}

// #RAM-level (Han 2026-08-11, "toon ook de pixel art FPS en de app FPS in debug mode"): two independently
// measured frame rates. "App FPS" counts this hook's OWN rAF loop (the browser's actual paint rate).
// "Pixel art FPS" is reported by the CALLER via `reportPixelFrame()` — RpgLevelPanel's own camera/movement
// rAF loop calls it once per tick, so a divergence between the two numbers pinpoints whether a slowdown is
// general (App FPS drops too) or specific to the game-world render loop (only Pixel art FPS drops).
export function useFpsCounters() {
    const [appFps, setAppFps] = useState(0);
    const [pixelFps, setPixelFps] = useState(0);
    const appFrameCountRef = useRef(0);
    const pixelFrameCountRef = useRef(0);

    useEffect(() => {
        let raf;
        const tick = () => {
            appFrameCountRef.current += 1;
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        const id = setInterval(() => {
            setAppFps(appFrameCountRef.current);
            appFrameCountRef.current = 0;
            setPixelFps(pixelFrameCountRef.current);
            pixelFrameCountRef.current = 0;
        }, 1000);
        return () => { cancelAnimationFrame(raf); clearInterval(id); };
    }, []);

    const reportPixelFrame = () => { pixelFrameCountRef.current += 1; };
    return { appFps, pixelFps, reportPixelFrame };
}
