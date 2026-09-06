import { useEffect, useRef, useState } from 'react';
import { resolveNotePitch } from '../../audio/playSound';
import { WORLD_BPM, WORLD_TIME_SIGNATURE } from '../../audio/worldClock';
import { outputLatencySeconds } from '../../audio/audioOutputLatency';
import { VOL_STEPS } from '../sheet-music/overlays/SettingsOverlay';

// Han 2026-08-20 ("zet metronoom op ff in rpg-world" / "ik kan de metronoom niet horen"): loudest
// step on the shared VOL_STEPS dynamics table (§6c — no second hand-picked fraction; the table tops
// out at 'forte', there is no separate 'fortissimo' step to add gain headroom beyond unity gain).
const DEBUG_METRONOME_VOLUME = VOL_STEPS.find((s) => s.label === 'forte').value; // 1.0 (f)

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
// single render — fixed by reading `instruments` through a ref (`instrumentsRef.current`, updated every
// render, same convention `useRpgLevelState.js` uses for `playerXRef`) so the tick loop always sees the
// LATEST value without needing it in the dependency array.
//
// #924 round 4 (Han: "de world metronome begint precies wanneer ik op start druk, dat vind ik verdacht, die
// kan nooit in sync zijn met de wereld timer. Is die uberhaupt hetzelfde tempo..?"): BOTH suspicions were
// correct. (1) `bpm`/`timeSignature` used to come from the caller (RpgLevelPanel's own props, sourced from
// App.jsx's LIVE song/practice bpm — completely unrelated to the open world, and different every level).
// Now defaults to `WORLD_BPM`/`WORLD_TIME_SIGNATURE` (worldClock.js) — the SAME fixed tempo every other
// open-world audio system (ambient music, bird songs, the wisp/slime conversation) uses. (2) the beat index
// used to be computed relative to `startTimeRef.current` (set to `context.currentTime` the INSTANT the
// toggle switched on) — its own local phase, unrelated to worldClock.js's absolute grid, hence "begint
// precies wanneer ik op start druk" (drifts to a new phase every time you toggle it). Now computed directly
// from `context.currentTime` (no local anchor at all) — always in phase with the world clock.
const ACCENT_NOTE = 'wh';     // downbeat — woodblock high (METRONOME_NOTE_IDS, drumKits.js)
const CLICK_NOTE = 'wm';      // other beats — woodblock mid

export default function useDebugMetronome({ enabled, bpm = WORLD_BPM, timeSignature = WORLD_TIME_SIGNATURE, context, instruments, setVolume }) {
    const [beat, setBeat] = useState(1);   // 1..beatsPerMeasure, for display
    const [pulseTick, setPulseTick] = useState(0);   // increments on every beat edge, drives the swing animation
    const lastBeatIndexRef = useRef(-1);
    // Highest absolute beat number whose click has already been scheduled (sync fix, Han 2026-09-01).
    const lastScheduledBeatRef = useRef(-1);
    const bpmRef = useRef(bpm); bpmRef.current = bpm;
    const beatsPerMeasureRef = useRef(4); beatsPerMeasureRef.current = timeSignature?.[0] || 4;
    const instrumentsRef = useRef(instruments); instrumentsRef.current = instruments;
    // #1100 (Han 2026-08-21, "klinkt als een geigenteller"): SAME bug class as the #RAM-level fix above,
    // just via a different unstable reference this time — `setVolume` (useInstruments.js) is a plain arrow
    // function re-created on every App.jsx render (not memoized), and App.jsx re-renders ~60x/sec while the
    // hero moves. It was in this effect's dependency array, so the whole rAF click-loop tore down and
    // restarted on every single render — each restart resets `lastBeatIndexRef` to -1, and the very next
    // tick's edge-trigger fires immediately regardless of whether a real beat boundary occurred, so a click
    // fired on nearly every render (~60/sec) instead of once per beat. Read through a ref instead, same
    // convention as `instrumentsRef` just above.
    const setVolumeRef = useRef(setVolume); setVolumeRef.current = setVolume;

    useEffect(() => {
        if (!enabled || !context) return undefined;
        // Bug fix (Han 2026-08-20, "ik kan de metronoom niet horen"): every OTHER play path in the
        // app resumes a suspended AudioContext before scheduling sound (usePlayback.js,
        // useNoteInteraction.js, etc. — see MEMORY.md "AudioContext — eager init"). This loop never
        // did, and a suspended context's `currentTime` does not advance — so `beatIndex` below computes
        // the SAME value every frame, the edge-trigger only ever fires once (or never), and the debug
        // metronome falls silent whenever it's the very first sound the player triggers this session.
        if (context.state !== 'running') context.resume();
        // Han 2026-08-20 ("zet metronoom op ff"): explicit, so this debug click track is always at the
        // loudest step regardless of what a PREVIOUS level playthrough left the shared 'metronome'
        // fader at (App.jsx's LEVEL_METRONOME_VOLUME/rpgMusicMultiplier can leave it lower than forte).
        if (setVolumeRef.current) setVolumeRef.current('metronome', DEBUG_METRONOME_VOLUME);
        lastBeatIndexRef.current = -1;
        lastScheduledBeatRef.current = Math.floor(context.currentTime / (60 / (bpmRef.current || 120)));
        let raf;
        const tick = () => {
            const secondsPerBeat = 60 / (bpmRef.current || 120);
            const beatsPerMeasure = beatsPerMeasureRef.current;
            const nowBeat = Math.floor(context.currentTime / secondsPerBeat);

            // Sync fix (Han 2026-09-01, "de metronoom en de muziek klinken niet in sync"): schedule each
            // click AHEAD, at its exact beat-boundary time on the world-clock grid, minus the audio
            // output latency (§355/§357) — so it is HEARD precisely on the grid, exactly like the
            // ambient music (which schedules on `nextMeasureStartTime`). The old code edge-detected a
            // boundary that `context.currentTime` had ALREADY crossed (rAF fires up to a frame late) and
            // then scheduled the click at that stale "now" — 0-16 ms of jitter against a rock-steady
            // music grid. `nowBeat + 1` is at most one beat (0.6 s at WORLD_BPM) ahead, comfortably
            // enough runway for the ~48 ms compensation to still land in the future ⇒ sample-accurate.
            const targetBeat = nowBeat + 1;
            if (targetBeat > lastScheduledBeatRef.current) {
                lastScheduledBeatRef.current = targetBeat;
                const metronomeInstrument = instrumentsRef.current?.metronome;
                if (metronomeInstrument) {
                    const noteId = (targetBeat % beatsPerMeasure) === 0 ? ACCENT_NOTE : CLICK_NOTE;
                    const pitch = resolveNotePitch(noteId, null);
                    if (pitch !== null) {
                        const heardAt = targetBeat * secondsPerBeat;
                        metronomeInstrument.start({
                            note: pitch,
                            time: Math.max(context.currentTime, heardAt - outputLatencySeconds(context)),
                            duration: 0.15,
                        });
                    }
                }
            }

            // On-screen counter / pendulum: still an edge trigger on the audible grid crossing (same
            // cadence as before) — it flips within a frame of the click being heard.
            const beatIndex = nowBeat % beatsPerMeasure;
            if (beatIndex !== lastBeatIndexRef.current) {
                lastBeatIndexRef.current = beatIndex;
                setBeat(beatIndex + 1);
                setPulseTick((t) => t + 1);
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
