import { useState, useRef, useCallback, useEffect } from 'react';
import { playSound, resolveNotePitch } from '../audio/playSound';
import { buildTypewriterSchedule } from '../audio/conversationTypewriter';
import { nextMeasureStartTime, nextBeatStartTime, secondsPerBeat } from '../audio/worldClock';
import { clickMsForBpm, CLICKS_PER_BEAT } from '../components/sheet-music/SheetRpgLayer';

// #922 (Han 2026-08-12, "verhoog het tempo... met een factor twee", then "doe nog maar 2x sneller" (4x
// total), then round 3: "ga terug naar het vorige tempo, dus verlaag met factor 2" — back down to 2×, with
// the VISUAL reveal now getting its own extra speed via GROUP_SIZE letters/click instead of a further click-
// rate increase): layered ON TOP of #923's shared clickMsForBpm (still the single source of the tempo-
// scaled cadence, §6c) — clicks run at 2× the sprite-animation beat, not a second independently-tuned speed.
const TYPEWRITER_SPEED_MULTIPLIER = 2;
const METRONOME_CLICK_VOLUME = 0.5;   // Han: "speel de metronoom af op mp volume" (mezzo-piano)
const ACCENT_NOTE = 'wh';   // woodblock high — downbeat, same convention as useDebugMetronome.js
const CLICK_NOTE = 'wm';    // woodblock mid — other beats

// #922: orchestrates one full paginated conversation — per-character musical typewriter reveal (one page
// at a time), an own soft metronome click for the conversation's duration, world-clock-synced start (first
// page only), and auto-continue between pages. `pages` is a stable array of paragraph strings for the
// conversation's lifetime (callers must not recreate it every render — it comes straight from wherever the
// dialogue was opened, e.g. `useRpgLevelState`'s `dialogue.pages`).
export default function useConversationDialogue({
    pages, active, context, bpm, timeSignature, profile, metronomeInstrument, autoContinue, onClosed,
}) {
    const [pageIndex, setPageIndex] = useState(0);
    const [visibleText, setVisibleText] = useState('');
    const [pageDone, setPageDone] = useState(false);
    const scheduleRef = useRef([]);
    const startTimeRef = useRef(0);
    const revealedRef = useRef(0);
    const skippedRef = useRef(false);
    const lastMetronomeBeatRef = useRef(-1);
    const advanceAtRef = useRef(null);
    const onClosedRef = useRef(onClosed); onClosedRef.current = onClosed;

    const text = pages?.[pageIndex] ?? '';
    const hasNextPage = pageIndex < (pages?.length ?? 0) - 1;
    const clickMs = clickMsForBpm(bpm, timeSignature) / TYPEWRITER_SPEED_MULTIPLIER;

    // A fresh conversation (a new `pages` array) always restarts at page 0.
    useEffect(() => { setPageIndex(0); }, [pages]);

    // Per-page reveal + the conversation's own soft metronome click — both driven off the SAME
    // context.currentTime-anchored rAF loop so they can never drift apart from each other.
    useEffect(() => {
        if (!active || !text || !context) {
            setVisibleText('');
            setPageDone(false);
            return undefined;
        }
        scheduleRef.current = buildTypewriterSchedule(text, CLICKS_PER_BEAT, { tonePool: profile?.tonePool });
        // #922 ("in het RPG-level is een wereldklok. zorg dat het gesprek begint op de start van een
        // maat", loosened per follow-up: "start op eerste tel van maat is te streng, start gewoon op eerst
        // volgende beat"): only the FIRST page of a fresh conversation waits for the world clock's next
        // BEAT boundary — later pages (click-advance / auto-continue) start the instant they're shown.
        startTimeRef.current = pageIndex === 0
            ? nextBeatStartTime(context, bpm)
            : context.currentTime;
        revealedRef.current = 0;
        skippedRef.current = false;
        lastMetronomeBeatRef.current = -1;
        setVisibleText('');
        setPageDone(false);

        const spb = secondsPerBeat(bpm);
        const beatsPerMeasure = timeSignature?.[0] || 4;
        let raf;
        const tick = () => {
            const schedule = scheduleRef.current;
            const elapsedSec = context.currentTime - startTimeRef.current;

            if (elapsedSec >= 0 && metronomeInstrument) {
                const beatIndex = Math.floor(elapsedSec / spb);
                if (beatIndex !== lastMetronomeBeatRef.current) {
                    lastMetronomeBeatRef.current = beatIndex;
                    const noteId = beatIndex % beatsPerMeasure === 0 ? ACCENT_NOTE : CLICK_NOTE;
                    const pitch = resolveNotePitch(noteId, null);
                    if (pitch !== null) {
                        metronomeInstrument.start({
                            note: pitch, time: context.currentTime, duration: 0.12,
                            velocity: Math.floor(METRONOME_CLICK_VOLUME * 127),
                        });
                    }
                }
            }

            // #922 ("klikken in tekstvak voltooit onmiddellijk de huidige paragraaf"): skip() jumps
            // straight to the full page, silently (no catch-up tones for the skipped characters).
            if (skippedRef.current) {
                revealedRef.current = schedule.length;
                setVisibleText(text);
                setPageDone(true);
                return;
            }
            const elapsedClicks = (elapsedSec * 1000) / clickMs;
            let i = revealedRef.current;
            while (i < schedule.length && schedule[i].clickOffset <= elapsedClicks) {
                const entry = schedule[i];
                if (entry.tone && profile?.instrument) {
                    // #922 round 3: up to GROUP_SIZE characters now share one click — each note's audible
                    // length shrinks to its own `subSpan` share of the click so simultaneous/rapid notes
                    // don't overlap and blur together.
                    const noteDuration = (clickMs / 1000) * (entry.subSpan ?? 1) * 0.9;
                    playSound(entry.tone, profile.instrument, context, context.currentTime, noteDuration, 0.8);
                }
                i += 1;
            }
            if (i !== revealedRef.current) {
                revealedRef.current = i;
                setVisibleText(text.slice(0, i));
            }
            if (i >= schedule.length) { setPageDone(true); return; }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [text, pageIndex, clickMs, context, profile, active, bpm, timeSignature, metronomeInstrument]);

    // #922 ("wacht minimaal 1 tel, en tot begin volgende maat, om naar volgende instantie van de tekst te
    // gaan"): a SEPARATE effect (keyed on `pageDone`) so its own rAF wait loop is cleanly cancelled if the
    // page changes again before the wait elapses (component unmount, a manual click-advance, etc).
    useEffect(() => {
        if (!pageDone || !active || !context || !autoContinue) return undefined;
        if (!hasNextPage) { onClosedRef.current?.(); return undefined; }
        const minWait = secondsPerBeat(bpm);
        advanceAtRef.current = Math.max(context.currentTime + minWait, nextMeasureStartTime(context, bpm, timeSignature));
        let raf;
        const wait = () => {
            if (context.currentTime >= advanceAtRef.current) { setPageIndex((p) => p + 1); return; }
            raf = requestAnimationFrame(wait);
        };
        raf = requestAnimationFrame(wait);
        return () => cancelAnimationFrame(raf);
    }, [pageDone, autoContinue, hasNextPage, active, context, bpm, timeSignature]);

    const skip = useCallback(() => { skippedRef.current = true; }, []);
    // #922: mid-animation click finishes the paragraph instantly; a click on an already-finished page
    // manually advances (or closes, on the last page) — independent of whether auto-continue is on.
    const handleTextClick = useCallback(() => {
        if (!pageDone) { skip(); return; }
        if (hasNextPage) setPageIndex((p) => p + 1);
        else onClosedRef.current?.();
    }, [pageDone, hasNextPage, skip]);

    return { visibleText, pageDone, pageIndex, totalPages: pages?.length ?? 0, hasNextPage, handleTextClick };
}
