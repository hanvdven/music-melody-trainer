import { useState, useRef, useCallback, useEffect } from 'react';
import { playSound } from '../audio/playSound';
import { buildTypewriterSchedule } from '../audio/conversationTypewriter';
import { nextMeasureStartTime, nextBeatStartTime, secondsPerBeat } from '../audio/worldClock';
import { MF_VOLUME } from '../audio/dynamics';
import { clickMsForBpm, CLICKS_PER_BEAT } from '../components/sheet-music/SheetRpgLayer';

// #922 (Han 2026-08-12, "verhoog het tempo... met een factor twee", then "doe nog maar 2x sneller" (4x
// total), then round 3: "ga terug naar het vorige tempo, dus verlaag met factor 2" — back down to 2×, with
// the VISUAL reveal now getting its own extra speed via GROUP_SIZE letters/click instead of a further click-
// rate increase): layered ON TOP of #923's shared clickMsForBpm (still the single source of the tempo-
// scaled cadence, §6c) — clicks run at 2× the sprite-animation beat, not a second independently-tuned speed.
const TYPEWRITER_SPEED_MULTIPLIER = 2;
// #922 round 7 (Han: "ik wil de 'even ticks' (dus off-tick) op 70% volume van de 'oneven ticks' (die op de
// beat vallen)"): a simple alternating accent across the GLOBAL click sequence — odd 1-indexed tick numbers
// (1, 3, 5…) are treated as "on the beat" and play at full MF_VOLUME; even tick numbers (2, 4, 6…) at 70%.
const OFF_TICK_ACCENT = 0.7;

// #922: orchestrates one full paginated conversation — per-character musical typewriter reveal (one page
// at a time) and world-clock-synced start (first page only), and auto-continue between pages. `pages` is a
// stable array of paragraph strings for the conversation's lifetime (callers must not recreate it every
// render — it comes straight from wherever the dialogue was opened, e.g. `useRpgLevelState`'s
// `dialogue.pages`).
// #922 round 6 (Han: "de metronoom hoeft niet meer tijdens tekst, dat was om te testen"): the conversation's
// own soft metronome click (added while diagnosing the world-clock sync, #922 rounds 1-4) is REMOVED — it
// was explicitly a temporary diagnostic, not a feature to keep.
export default function useConversationDialogue({
    pages, active, context, bpm, timeSignature, profile, autoContinue, onClosed,
}) {
    const [pageIndex, setPageIndex] = useState(0);
    const [visibleText, setVisibleText] = useState('');
    const [pageDone, setPageDone] = useState(false);
    const scheduleRef = useRef([]);
    const startTimeRef = useRef(0);
    const revealedRef = useRef(0);
    const skippedRef = useRef(false);
    const advanceAtRef = useRef(null);
    const stopHandlesRef = useRef([]);
    const onClosedRef = useRef(onClosed); onClosedRef.current = onClosed;

    const text = pages?.[pageIndex] ?? '';
    const hasNextPage = pageIndex < (pages?.length ?? 0) - 1;
    const clickMs = clickMsForBpm(bpm, timeSignature) / TYPEWRITER_SPEED_MULTIPLIER;

    // A fresh conversation (a new `pages` array) always restarts at page 0.
    useEffect(() => { setPageIndex(0); }, [pages]);

    // Per-page reveal.
    useEffect(() => {
        if (!active || !text || !context) {
            setVisibleText('');
            setPageDone(false);
            return undefined;
        }
        const schedule = buildTypewriterSchedule(text, CLICKS_PER_BEAT, { tonePool: profile?.tonePool });
        scheduleRef.current = schedule;
        // #922 ("in het RPG-level is een wereldklok. zorg dat het gesprek begint op de start van een
        // maat", loosened per follow-up: "start op eerste tel van maat is te streng, start gewoon op eerst
        // volgende beat"): only the FIRST page of a fresh conversation waits for the world clock's next
        // BEAT boundary — later pages (click-advance / auto-continue) start the instant they're shown.
        const startTime = pageIndex === 0 ? nextBeatStartTime(context, bpm) : context.currentTime;
        startTimeRef.current = startTime;
        revealedRef.current = 0;
        skippedRef.current = false;
        setVisibleText('');
        setPageDone(false);

        // #922 round 7 (Han: "ik vind de text clicks een beetje hakkelig klinken"): ALL of this page's
        // audio is now pre-scheduled up front at PRECISE future AudioContext times (Web Audio's own
        // sample-accurate scheduling engine), instead of the previous approach of calling playSound at
        // `context.currentTime` ("now") the instant a rAF tick happened to notice a click boundary had
        // passed — that quantized every note's actual onset to whichever ~16ms video frame caught it, an
        // audible timing jitter. The rAF loop below is now VISUAL-reveal only; `stopHandlesRef` lets
        // skip() cancel any not-yet-played notes (see handleTextClick).
        const stopHandles = [];
        if (profile?.instrument) {
            for (const entry of schedule) {
                if (!entry.tone) continue;
                const preciseTime = startTime + (entry.clickOffset * clickMs) / 1000;
                // Han: "ik wil de 'even ticks' (dus off-tick) op 70% volume van de 'oneven ticks' (die op de
                // beat vallen)" + "maak... ook de tekst mf" — MF_VOLUME is the base, halved-ish on off-ticks.
                const tickNumber = Math.floor(entry.clickOffset) + 1;   // 1-indexed
                const volume = MF_VOLUME * (tickNumber % 2 === 0 ? OFF_TICK_ACCENT : 1);
                // #922 round 4 (Han: "de tekst klinkt heel bot... maak de duur van de noten 2x zo lang (dan
                // overlappen ze dus)"): deliberately OVERLAPPING (subSpan × 1.8) — the sharp per-note cutoff
                // read as curt/robotic; letting consecutive notes ring into each other softens that.
                const noteDuration = (clickMs / 1000) * (entry.subSpan ?? 1) * 1.8;
                const stopFn = playSound(entry.tone, profile.instrument, context, preciseTime, noteDuration, volume);
                if (stopFn) stopHandles.push(stopFn);
            }
        }
        stopHandlesRef.current = stopHandles;

        let raf;
        const tick = () => {
            const elapsedSec = context.currentTime - startTimeRef.current;
            // #922 ("klikken in tekstvak voltooit onmiddellijk de huidige paragraaf"): skip() jumps
            // straight to the full page, silently — any pre-scheduled but not-yet-played notes were
            // already cancelled by handleTextClick before this flag was set.
            if (skippedRef.current) {
                revealedRef.current = schedule.length;
                setVisibleText(text);
                setPageDone(true);
                return;
            }
            const elapsedClicks = (elapsedSec * 1000) / clickMs;
            let i = revealedRef.current;
            while (i < schedule.length && schedule[i].clickOffset <= elapsedClicks) i += 1;
            if (i !== revealedRef.current) {
                revealedRef.current = i;
                setVisibleText(text.slice(0, i));
            }
            if (i >= schedule.length) { setPageDone(true); return; }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [text, pageIndex, clickMs, context, profile, active, bpm]);

    // #922 ("wacht minimaal 1 tel, en tot begin volgende maat, om naar volgende instantie van de tekst te
    // gaan"): a SEPARATE effect (keyed on `pageDone`) so its own rAF wait loop is cleanly cancelled if the
    // page changes again before the wait elapses (component unmount, a manual click-advance, etc).
    // #922 round 5 (Han: "auto-continue: als er geen volgende paragraaf is, of een beslissing van de
    // speler, ga dan niet verder. Dus sluit nooit automatisch een gesprek af."): auto-continue only ever
    // advances BETWEEN existing pages — on the LAST page it does nothing at all now (used to call
    // onClosed() automatically, closing the conversation without the player's say-so). The conversation
    // only ever closes via the player's own click (`handleTextClick` below) or walking away.
    useEffect(() => {
        if (!pageDone || !active || !context || !autoContinue || !hasNextPage) return undefined;
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

    // #922: mid-animation click finishes the paragraph instantly (cancelling any pre-scheduled notes past
    // this point); a click on an already-finished page manually advances (or closes, on the last page) —
    // independent of whether auto-continue is on.
    const skip = useCallback(() => {
        skippedRef.current = true;
        stopHandlesRef.current.forEach((stopFn) => { try { stopFn?.(); } catch { /* already stopped */ } });
    }, []);
    const handleTextClick = useCallback(() => {
        if (!pageDone) { skip(); return; }
        if (hasNextPage) setPageIndex((p) => p + 1);
        else onClosedRef.current?.();
    }, [pageDone, hasNextPage, skip]);

    return { visibleText, pageDone, pageIndex, totalPages: pages?.length ?? 0, hasNextPage, handleTextClick };
}
