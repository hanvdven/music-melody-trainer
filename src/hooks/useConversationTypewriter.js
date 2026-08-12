import { useState, useRef, useCallback, useEffect } from 'react';
import { playSound } from '../audio/playSound';
import { buildTypewriterSchedule } from '../audio/conversationTypewriter';
import { CLICKS_PER_BEAT } from '../components/sheet-music/SheetRpgLayer';

// #922 (Han 2026-08-12, RPG conversation system): drives the per-character typewriter reveal for one page
// of dialogue text, scheduled against `context.currentTime` (rAF edge-triggered, same technique
// `useDebugMetronome.js` already uses — §6c/§6d, not a second hand-rolled clock) rather than `setTimeout`,
// so the reveal stays accurate even if the tab throttles background timers.
//
// `clickMs` is #923's `clickMsForBpm(bpm, timeSignature)` — the SAME tempo-scaled cadence the sprite
// animation uses, so dialogue typing speed and sprite animation speed can never drift apart.
export default function useConversationTypewriter({ text, clickMs, context, instrument, active }) {
    const [visibleText, setVisibleText] = useState('');
    const [done, setDone] = useState(false);
    const scheduleRef = useRef([]);
    const startTimeRef = useRef(0);
    const revealedRef = useRef(0);
    const skippedRef = useRef(false);

    useEffect(() => {
        if (!active || !text || !context) {
            setVisibleText('');
            setDone(false);
            return undefined;
        }
        scheduleRef.current = buildTypewriterSchedule(text, CLICKS_PER_BEAT);
        startTimeRef.current = context.currentTime;
        revealedRef.current = 0;
        skippedRef.current = false;
        setVisibleText('');
        setDone(false);

        let raf;
        const tick = () => {
            const schedule = scheduleRef.current;
            // #922 ("klikken tijdens tekst-animatie maakt de hele tekstbubbel in een keer af"): skip()
            // jumps straight to the full page, silently (no catch-up tones for the skipped characters).
            if (skippedRef.current) {
                revealedRef.current = schedule.length;
                setVisibleText(text);
                setDone(true);
                return;
            }
            const elapsedClicks = ((context.currentTime - startTimeRef.current) * 1000) / clickMs;
            let i = revealedRef.current;
            while (i < schedule.length && schedule[i].clickOffset <= elapsedClicks) {
                const entry = schedule[i];
                if (entry.tone && instrument) {
                    playSound(entry.tone, instrument, context, context.currentTime, (clickMs / 1000) * 0.9, 0.8);
                }
                i += 1;
            }
            if (i !== revealedRef.current) {
                revealedRef.current = i;
                setVisibleText(text.slice(0, i));
            }
            if (i >= schedule.length) { setDone(true); return; }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [text, clickMs, context, instrument, active]);

    const skip = useCallback(() => { skippedRef.current = true; }, []);
    return { visibleText, done, skip };
}
